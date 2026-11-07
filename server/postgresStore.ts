import { readFile } from 'node:fs/promises';
import type { Pool, PoolClient } from 'pg';
import type { Lane, TwinLocation } from '../src/flywayTypes';
import { canonicalStringify as canonicalizeArtifact, contentHash } from '../src/engine/canonical';
import { canonicalize, sha256 } from './canonical';
import type { PlatformStore } from './storage';
import {
  DEFAULT_WORKSPACE_ID,
  LOCAL_OWNER_ID,
  PLATFORM_SCHEMA_VERSION,
  type ArtifactReference,
  type JsonValue,
  type PlatformDatabase,
  type WorkspaceState,
  emptyEvidenceLedger,
} from './types';

export interface PostgresStoreOptions {
  pool: Pool;
  workspaceId?: string;
  initialLocations: TwinLocation[];
  initialLanes: Lane[];
  initialDefaults?: WorkspaceState['defaults'];
  runMigrations?: boolean;
  enforceLeastPrivilege?: boolean;
}

export async function runPostgresMigrations(pool: Pool, options: { requirePostgis?: boolean } = {}) {
  const migration = await readFile(new URL('./migrations/001_platform.sql', import.meta.url), 'utf8');
  await pool.query(migration);
  const postgis = await pool.query("SELECT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'postgis') AS installed");
  if (options.requirePostgis && !postgis.rows[0]?.installed) throw new Error('PostGIS is required but is not installed in this PostgreSQL database.');
  return { postgisInstalled: Boolean(postgis.rows[0]?.installed) };
}

function initialDatabase(options: PostgresStoreOptions): PlatformDatabase {
  const timestamp = new Date().toISOString();
  return {
    schemaVersion: PLATFORM_SCHEMA_VERSION,
    workspace: {
      id: options.workspaceId || DEFAULT_WORKSPACE_ID,
      ownerId: LOCAL_OWNER_ID,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      defaults: structuredClone(options.initialDefaults || {}),
      locations: structuredClone(options.initialLocations),
      lanes: structuredClone(options.initialLanes),
      scenarios: [],
      evidenceLedger: emptyEvidenceLedger(),
    },
    runs: {},
    idempotency: {},
    audit: [],
    metrics: { startedAt: timestamp, requests: 0, errors: 0, jobsSucceeded: 0, jobsFailed: 0, jobsCancelled: 0, recoveredJobs: 0 },
  };
}

async function begin(client: PoolClient, workspaceId: string) {
  await client.query('BEGIN');
  await client.query("SELECT set_config('flyway.workspace_id', $1, true)", [workspaceId]);
}

export class PostgresPlatformStore implements PlatformStore {
  readonly workspaceId: string;

  constructor(private readonly options: PostgresStoreOptions) {
    this.workspaceId = options.workspaceId || DEFAULT_WORKSPACE_ID;
  }

  async initialize() {
    if (this.options.runMigrations) {
      await runPostgresMigrations(this.options.pool);
    }
    if (this.options.enforceLeastPrivilege !== false) await this.assertLeastPrivilege();
    const client = await this.options.pool.connect();
    try {
      await begin(client, this.workspaceId);
      const existing = await client.query('SELECT id FROM flyway_workspace WHERE id = $1', [this.workspaceId]);
      if (!existing.rowCount) await this.persist(client, initialDatabase(this.options), true);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  private async assertLeastPrivilege() {
    const role = await this.options.pool.query(
      `SELECT r.rolsuper, r.rolbypassrls,
        EXISTS (
          SELECT 1 FROM pg_class c
          WHERE c.oid = 'flyway_workspace'::regclass
            AND pg_has_role(current_user, c.relowner, 'MEMBER')
        ) AS owns_tables
       FROM pg_roles r WHERE r.rolname = current_user`,
    );
    const value = role.rows[0];
    if (!value || value.rolsuper || value.rolbypassrls || value.owns_tables) {
      throw new Error('Flyway runtime database role must be non-superuser, must not bypass row security, and must not own platform tables. Use a separate migration credential.');
    }
  }

  async read(): Promise<PlatformDatabase> {
    const client = await this.options.pool.connect();
    try {
      await begin(client, this.workspaceId);
      const database = await this.load(client, false);
      await client.query('COMMIT');
      return database;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async transaction<T>(mutator: (database: PlatformDatabase) => T | Promise<T>): Promise<T> {
    const client = await this.options.pool.connect();
    try {
      await begin(client, this.workspaceId);
      const database = await this.load(client, true);
      const result = await mutator(database);
      await this.persist(client, database, false);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async writeArtifact(kind: 'inputs' | 'outputs' | 'evidence', value: unknown): Promise<ArtifactReference> {
    const content = canonicalizeArtifact(value);
    const checksum = contentHash(value);
    const client = await this.options.pool.connect();
    try {
      await begin(client, this.workspaceId);
      await client.query(
        `INSERT INTO flyway_artifact (checksum, workspace_id, kind, content, byte_length)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (workspace_id, checksum) DO NOTHING`,
        [checksum, this.workspaceId, kind, content, Buffer.byteLength(content)],
      );
      const stored = await client.query('SELECT content FROM flyway_artifact WHERE checksum = $1 AND workspace_id = $2', [checksum, this.workspaceId]);
      if (!stored.rowCount || contentHash(stored.rows[0].content) !== checksum) throw new Error('PostgreSQL artifact checksum verification failed.');
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
    return { checksum, relativePath: `postgres://artifacts/${checksum}`, byteLength: Buffer.byteLength(content) };
  }

  async readArtifact<T>(relativePath: string): Promise<T> {
    const checksum = relativePath.match(/^postgres:\/\/artifacts\/([a-f0-9]{64})$/)?.[1];
    if (!checksum) throw new Error('Invalid PostgreSQL artifact reference.');
    const client = await this.options.pool.connect();
    try {
      await begin(client, this.workspaceId);
      const result = await client.query('SELECT content FROM flyway_artifact WHERE checksum = $1 AND workspace_id = $2', [checksum, this.workspaceId]);
      if (!result.rowCount) throw new Error('PostgreSQL artifact was not found.');
      if (contentHash(result.rows[0].content) !== checksum) throw new Error('PostgreSQL artifact checksum mismatch.');
      await client.query('COMMIT');
      return structuredClone(result.rows[0].content) as T;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteOutputArtifactIfUnreferenced(relativePath:string) {
    const checksum=relativePath.match(/^postgres:\/\/artifacts\/([a-f0-9]{64})$/)?.[1];
    if(!checksum)throw new Error('Invalid PostgreSQL output artifact reference.');
    const client=await this.options.pool.connect();
    try {
      await begin(client,this.workspaceId);
      const deleted=await client.query(
        `DELETE FROM flyway_artifact artifact
         WHERE artifact.workspace_id = $1 AND artifact.checksum = $2 AND artifact.kind = 'outputs'
           AND NOT EXISTS (
             SELECT 1 FROM flyway_run run
             WHERE run.workspace_id = $1
               AND (run.record->>'inputArtifact' = $3 OR run.record->>'outputArtifact' = $3 OR run.record->'resultManifestArtifact'->>'relativePath' = $3)
           )
           AND NOT EXISTS (
             SELECT 1
             FROM flyway_run run
             JOIN flyway_artifact manifest
               ON manifest.workspace_id = run.workspace_id
              AND manifest.checksum = regexp_replace(run.record->'resultManifestArtifact'->>'relativePath', '^postgres://artifacts/', '')
             CROSS JOIN LATERAL jsonb_array_elements(COALESCE(manifest.content->'chunks', '[]'::jsonb)) chunk
             WHERE run.workspace_id = $1
               AND chunk->'artifact'->>'relativePath' = $3
           )
         RETURNING artifact.checksum`,
        [this.workspaceId,checksum,relativePath],
      );
      await client.query('COMMIT');
      return Boolean(deleted.rowCount);
    } catch(error) {
      await client.query('ROLLBACK').catch(()=>undefined);
      throw error;
    } finally {client.release();}
  }

  private async load(client: PoolClient, lock: boolean): Promise<PlatformDatabase> {
    const workspaceResult = await client.query(`SELECT owner_id, revision, state, created_at, updated_at FROM flyway_workspace WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [this.workspaceId]);
    if (!workspaceResult.rowCount) throw new Error('Flyway workspace is not initialized.');
    const row = workspaceResult.rows[0];
    const state = row.state as Omit<WorkspaceState, 'id' | 'ownerId' | 'revision' | 'createdAt' | 'updatedAt'>;
    // A single transaction-bound pg client executes sequentially. Parallel
    // client.query calls are deprecated in pg 9 and can break ordering.
    const runs = await client.query('SELECT id, record FROM flyway_run WHERE workspace_id = $1', [this.workspaceId]);
    const idempotency = await client.query('SELECT storage_key, record FROM flyway_idempotency WHERE workspace_id = $1', [this.workspaceId]);
    const audit = await client.query('SELECT event FROM flyway_audit WHERE workspace_id = $1 ORDER BY seq', [this.workspaceId]);
    const metrics = await client.query('SELECT metrics FROM flyway_platform_metrics WHERE workspace_id = $1', [this.workspaceId]);
    return {
      schemaVersion: PLATFORM_SCHEMA_VERSION,
      workspace: {
        id: this.workspaceId,
        ownerId: row.owner_id,
        revision: Number(row.revision),
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
        ...structuredClone(state),
      },
      runs: Object.fromEntries(runs.rows.map((item) => [item.id, item.record])),
      idempotency: Object.fromEntries(idempotency.rows.map((item) => [item.storage_key, item.record])),
      audit: audit.rows.map((item) => item.event),
      metrics: metrics.rows[0]?.metrics || initialDatabase(this.options).metrics,
    };
  }

  private async persist(client: PoolClient, database: PlatformDatabase, initializing: boolean) {
    const { id, ownerId, revision, createdAt, updatedAt, ...state } = database.workspace;
    await client.query(
      `INSERT INTO flyway_workspace (id, owner_id, revision, state, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6)
       ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, revision = EXCLUDED.revision, state = EXCLUDED.state, updated_at = EXCLUDED.updated_at`,
      [id, ownerId, revision, canonicalize(state), createdAt, updatedAt],
    );
    for (const run of Object.values(database.runs)) {
      await client.query(
        `INSERT INTO flyway_run (id, workspace_id, status, input_hash, output_checksum, record, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now())
         ON CONFLICT (id) DO UPDATE SET status = EXCLUDED.status, output_checksum = EXCLUDED.output_checksum, record = EXCLUDED.record, updated_at = now()`,
        [run.id, run.workspaceId, run.status, run.inputHash, run.outputChecksum || null, canonicalize(run), run.createdAt],
      );
    }
    for (const [storageKey, record] of Object.entries(database.idempotency)) {
      await client.query(
        `INSERT INTO flyway_idempotency (storage_key, workspace_id, record, created_at)
         VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (workspace_id, storage_key) DO NOTHING`,
        [storageKey, id, canonicalize(record), record.createdAt],
      );
    }
    for (const event of database.audit) {
      await client.query(
        `INSERT INTO flyway_audit (seq, event_id, workspace_id, event, occurred_at)
         VALUES ($1, $2, $3, $4::jsonb, $5) ON CONFLICT (workspace_id, seq) DO NOTHING`,
        [event.seq, event.id, event.workspaceId, canonicalize(event), event.at],
      );
    }
    await client.query(
      `INSERT INTO flyway_platform_metrics (workspace_id, metrics) VALUES ($1, $2::jsonb)
       ON CONFLICT (workspace_id) DO UPDATE SET metrics = EXCLUDED.metrics`,
      [id, canonicalize(database.metrics)],
    );
    if (!initializing) {
      const stored = await client.query('SELECT revision FROM flyway_workspace WHERE id = $1', [id]);
      if (Number(stored.rows[0]?.revision) !== revision) throw new Error('PostgreSQL workspace revision verification failed.');
    }
  }
}
