import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { initialLanes, initialLocations } from '../src/flywayData';
import type { ScenarioDefinition, ScenarioResult } from '../src/flywayTypes';
import { canonicalize, sha256 } from '../server/canonical';
import { PlatformService, type EngineAdapter } from '../server/platformService';
import { PostgresPlatformStore, runPostgresMigrations } from '../server/postgresStore';
import type { PlatformStore } from '../server/storage';
import type { ArtifactReference, FrozenPlatformRunInput, PlatformDatabase, RunRecord } from '../server/types';

const scenario: ScenarioDefinition = {
  id: 'postgres-cancellation-cleanup',
  name: 'PostgreSQL cancellation cleanup',
  description: 'Proves an output published during cancellation is discarded.',
  type: 'dc-outage',
  targetId: 'dc-cartersville',
  magnitude: 100,
  grain: 'weekly',
  horizon: 4,
  createdAt: '2026-09-04T12:00:00.000Z',
  baselineRevision: 'postgres-integration',
};

function resultFor(input: FrozenPlatformRunInput): ScenarioResult {
  const inputHash = sha256(canonicalize(input));
  const output = {
    runId: `postgres-${input.scenario.id}`,
    engineVersion: 'postgres-integration-engine',
    inputHash,
    completedAt: '2026-09-04T12:00:01.000Z',
    baseline: { serviceLevel: 100, stockoutUnits: 0, affectedRestaurants: 0, totalLandedCost: 100, maxUtilization: 50, maxUtilizationLocationId: 'dc-cartersville', totalDemand: 100, fulfilledDemand: 100 },
    scenario: { serviceLevel: 90, stockoutUnits: 10, affectedRestaurants: 1, totalLandedCost: 120, maxUtilization: 75, maxUtilizationLocationId: 'dc-mebane', totalDemand: 100, fulfilledDemand: 90 },
    impacts: [],
    recommendations: [],
    narrative: 'PostgreSQL integration result.',
  } satisfies Omit<ScenarioResult, 'outputChecksum'>;
  return { ...output, outputChecksum: sha256(canonicalize(output)) };
}

const immediateEngine: EngineAdapter = {
  async freeze(input) { return structuredClone(input); },
  async execute(input) { return resultFor(input as FrozenPlatformRunInput); },
};

class GatedOutputStore implements PlatformStore {
  outputWritten: Promise<ArtifactReference>;
  private markOutputWritten!: (reference: ArtifactReference) => void;
  private releaseOutput!: () => void;
  private readonly outputRelease: Promise<void>;

  constructor(private readonly base: PostgresPlatformStore) {
    this.outputWritten = new Promise((resolve) => { this.markOutputWritten = resolve; });
    this.outputRelease = new Promise((resolve) => { this.releaseOutput = resolve; });
  }

  async initialize() {}
  read() { return this.base.read(); }
  transaction<T>(mutator: (database: PlatformDatabase) => T | Promise<T>) { return this.base.transaction(mutator); }
  readArtifact<T>(relativePath: string) { return this.base.readArtifact<T>(relativePath); }
  deleteOutputArtifactIfUnreferenced(relativePath: string) { return this.base.deleteOutputArtifactIfUnreferenced(relativePath); }
  async writeArtifact(kind: 'inputs' | 'outputs' | 'evidence', value: unknown) {
    const reference = await this.base.writeArtifact(kind, value);
    if (kind === 'outputs') {
      this.markOutputWritten(reference);
      await this.outputRelease;
    }
    return reference;
  }
  release() { this.releaseOutput(); }
}

async function waitForRun(store: PostgresPlatformStore, id: string, status: RunRecord['status']) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const run = (await store.read()).runs[id];
    if (run?.status === status) return run;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`PostgreSQL run ${id} did not reach ${status}.`);
}

const connectionString = process.env.FLYWAY_TEST_DATABASE_URL;
if (!connectionString) {
  console.log('PostgreSQL integration skipped: set FLYWAY_TEST_DATABASE_URL to a disposable PostGIS database.');
  process.exit(0);
}

const adminPool = new Pool({ connectionString, max: 3 });
const workspaceId = randomUUID();
const otherWorkspaceId = randomUUID();
const runtimeRole = `flyway_test_${randomUUID().replace(/-/g, '')}`;
const runtimePassword = randomUUID();
const quoteIdentifier = (value: string) => `"${value.replace(/"/g, '""')}"`;
const quoteLiteral = (value: string) => `'${value.replace(/'/g, "''")}'`;
const runtimeUrl = new URL(connectionString);
runtimeUrl.username = runtimeRole;
runtimeUrl.password = runtimePassword;
const runtimePool = new Pool({ connectionString: runtimeUrl.href, max: 3 });
try {
  const capabilities = await runPostgresMigrations(adminPool, { requirePostgis: process.env.FLYWAY_TEST_REQUIRE_POSTGIS === 'true' });
  await adminPool.query(`CREATE ROLE ${quoteIdentifier(runtimeRole)} LOGIN PASSWORD ${quoteLiteral(runtimePassword)} NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS`);
  await adminPool.query(`GRANT CONNECT ON DATABASE ${quoteIdentifier(runtimeUrl.pathname.slice(1))} TO ${quoteIdentifier(runtimeRole)}`);
  await adminPool.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(runtimeRole)}`);
  await adminPool.query(`GRANT SELECT, INSERT, UPDATE ON flyway_workspace, flyway_run, flyway_idempotency, flyway_audit, flyway_artifact, flyway_platform_metrics TO ${quoteIdentifier(runtimeRole)}`);
  await adminPool.query(`GRANT DELETE ON flyway_artifact TO ${quoteIdentifier(runtimeRole)}`);

  const privilegedStore = new PostgresPlatformStore({ pool: adminPool, workspaceId, initialLocations, initialLanes });
  await assert.rejects(() => privilegedStore.initialize(), /runtime database role must be non-superuser/);

  const store = new PostgresPlatformStore({ pool: runtimePool, workspaceId, initialLocations, initialLanes });
  await store.initialize();
  const deletePrivileges = await runtimePool.query(
    `SELECT
       has_table_privilege(current_user, 'flyway_artifact', 'DELETE') AS artifact_delete,
       has_table_privilege(current_user, 'flyway_workspace', 'DELETE') AS workspace_delete,
       has_table_privilege(current_user, 'flyway_run', 'DELETE') AS run_delete,
       has_table_privilege(current_user, 'flyway_idempotency', 'DELETE') AS idempotency_delete,
       has_table_privilege(current_user, 'flyway_audit', 'DELETE') AS audit_delete,
       has_table_privilege(current_user, 'flyway_platform_metrics', 'DELETE') AS metrics_delete`,
  );
  assert.deepEqual(deletePrivileges.rows[0], {
    artifact_delete: true,
    workspace_delete: false,
    run_delete: false,
    idempotency_delete: false,
    audit_delete: false,
    metrics_delete: false,
  }, 'The runtime role may delete only unreferenced artifacts, never authoritative records or audit history.');
  const otherStore = new PostgresPlatformStore({ pool: runtimePool, workspaceId: otherWorkspaceId, initialLocations: [], initialLanes: [] });
  await otherStore.initialize();
  const before = await store.read();
  assert.equal(before.workspace.id, workspaceId);
  assert.equal(before.workspace.locations.length, initialLocations.length);
  await store.transaction((database) => {
    database.workspace.revision += 1;
    database.workspace.updatedAt = new Date().toISOString();
  });
  const after = await store.read();
  assert.equal(after.workspace.revision, 2);
  const artifact = await store.writeArtifact('evidence', { workspaceId, proof: 'postgres-artifact-round-trip' });
  assert.deepEqual(await store.readArtifact(artifact.relativePath), { proof: 'postgres-artifact-round-trip', workspaceId });
  assert.equal(await store.deleteOutputArtifactIfUnreferenced(artifact.relativePath), false, 'Cleanup must never delete evidence or input artifact kinds.');
  assert.deepEqual(await store.readArtifact(artifact.relativePath), { proof: 'postgres-artifact-round-trip', workspaceId });

  await assert.rejects(() => store.deleteOutputArtifactIfUnreferenced('postgres://artifacts/not-a-checksum'), /Invalid PostgreSQL output artifact reference/);

  const gatedStore = new GatedOutputStore(store);
  const service = new PlatformService(gatedStore, immediateEngine);
  await service.initialize();
  const cancellationRun = (await service.createRun({
    scenario,
    expectedWorkspaceRevision: after.workspace.revision,
    idempotencyKey: 'postgres-cancellation-create-0001',
    correlationId: 'postgres-cancellation-create',
  })).run;
  const cancelledOutput = await gatedStore.outputWritten;
  await service.cancelRun(cancellationRun.id, 'postgres-cancellation-request-0001', 'postgres-cancellation-request');
  gatedStore.release();
  const cancelled = await waitForRun(store, cancellationRun.id, 'cancelled');
  assert.equal(cancelled.outputArtifact, undefined);
  await assert.rejects(() => store.readArtifact(cancelledOutput.relativePath), /artifact was not found/, 'Cancellation cleanup must physically remove the unreferenced PostgreSQL output.');

  const successfulRun = (await service.createRun({
    scenario: { ...scenario, id: 'postgres-referenced-output', name: 'Preserve referenced output' },
    expectedWorkspaceRevision: after.workspace.revision,
    idempotencyKey: 'postgres-referenced-create-0001',
    correlationId: 'postgres-referenced-create',
  })).run;
  const succeeded = await waitForRun(store, successfulRun.id, 'succeeded');
  assert.ok(succeeded.outputArtifact);
  assert.equal(await store.deleteOutputArtifactIfUnreferenced(succeeded.outputArtifact), false, 'A successful run output remains immutable and referenced.');
  assert.ok(await store.readArtifact(succeeded.outputArtifact));
  await service.shutdown();
  const client = await runtimePool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('flyway.workspace_id', $1, true)", [workspaceId]);
    const hidden = await client.query('SELECT count(*)::int AS count FROM flyway_workspace WHERE id = $1', [otherWorkspaceId]);
    assert.equal(hidden.rows[0].count, 0, 'RLS must hide a different workspace');
    await client.query('ROLLBACK');
  } finally {
    client.release();
  }
  console.log(`PostgreSQL adapter passed for isolated workspace ${workspaceId}: migration, least-privilege fail-closed guard, forced RLS isolation, revision transaction, immutable artifact round trip, cancellation cleanup, referenced-output preservation, and PostGIS capability=${capabilities.postgisInstalled}.`);
} finally {
  await runtimePool.end();
  await adminPool.end();
}
