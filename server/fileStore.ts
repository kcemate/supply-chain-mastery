import { constants } from 'node:fs';
import { access, mkdir, open, readFile, readdir, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Lane, TwinLocation } from '../src/flywayTypes';
import { canonicalStringify as canonicalizeArtifact, contentHash } from '../src/engine/canonical';
import { canonicalize, sha256 } from './canonical';
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

export interface FileStoreOptions {
  dataDirectory: string;
  initialLocations: TwinLocation[];
  initialLanes: Lane[];
  initialDefaults?: WorkspaceState['defaults'];
  now?: () => string;
}

export interface PlatformBackupV1 {
  schemaVersion: 1;
  createdAt: string;
  databaseChecksum: string;
  database: PlatformDatabase;
  artifacts: Array<{ relativePath: string; checksum: string; contentBase64: string }>;
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function createDatabase(options: FileStoreOptions): PlatformDatabase {
  const timestamp = (options.now || (() => new Date().toISOString()))();
  return {
    schemaVersion: PLATFORM_SCHEMA_VERSION,
    workspace: {
      id: DEFAULT_WORKSPACE_ID,
      ownerId: LOCAL_OWNER_ID,
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      defaults: clone(options.initialDefaults || {}),
      locations: clone(options.initialLocations),
      lanes: clone(options.initialLanes),
      scenarios: [],
      evidenceLedger: emptyEvidenceLedger(),
    },
    runs: {},
    idempotency: {},
    audit: [],
    metrics: {
      startedAt: timestamp,
      requests: 0,
      errors: 0,
      jobsSucceeded: 0,
      jobsFailed: 0,
      jobsCancelled: 0,
      recoveredJobs: 0,
    },
  };
}

function assertDatabase(value: unknown): asserts value is PlatformDatabase {
  if (!value || typeof value !== 'object') throw new Error('Platform database is not an object.');
  const database = value as Partial<PlatformDatabase>;
  if (database.schemaVersion !== PLATFORM_SCHEMA_VERSION) throw new Error(`Unsupported platform schema version: ${String(database.schemaVersion)}`);
  if (!database.workspace || typeof database.workspace.revision !== 'number' || !Array.isArray(database.workspace.locations) || !Array.isArray(database.workspace.lanes)) throw new Error('Platform workspace record is invalid.');
  if (!database.runs || !database.idempotency || !Array.isArray(database.audit) || !database.metrics) throw new Error('Platform database collections are invalid.');
}

async function exists(path: string) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function walk(directory: string): Promise<string[]> {
  if (!(await exists(directory))) return [];
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...await walk(path));
    else if (entry.isFile()) paths.push(path);
  }
  return paths.sort();
}

export class FilePlatformStore {
  readonly dataDirectory: string;
  readonly databasePath: string;
  readonly artifactDirectory: string;
  private readonly options: FileStoreOptions;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(options: FileStoreOptions) {
    this.options = options;
    this.dataDirectory = resolve(options.dataDirectory);
    this.databasePath = join(this.dataDirectory, 'platform-database.json');
    this.artifactDirectory = join(this.dataDirectory, 'artifacts');
  }

  async initialize() {
    await mkdir(this.artifactDirectory, { recursive: true });
    if (!(await exists(this.databasePath))) await this.writeDatabase(createDatabase(this.options));
    await this.read();
  }

  async read(): Promise<PlatformDatabase> {
    const parsed = JSON.parse(await readFile(this.databasePath, 'utf8')) as unknown;
    assertDatabase(parsed);
    return clone(parsed);
  }

  async transaction<T>(mutator: (database: PlatformDatabase) => T | Promise<T>): Promise<T> {
    const operation = this.queue.then(async () => {
      const database = await this.read();
      const result = await mutator(database);
      await this.writeDatabase(database);
      return result;
    });
    this.queue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  async writeArtifact(kind: 'inputs' | 'outputs' | 'evidence', value: unknown): Promise<ArtifactReference> {
    // Run artifacts participate in the engine's immutable content-addressed
    // protocol. Use the engine canonical form here; the platform database and
    // backup envelope intentionally retain their independent server encoding.
    const content = canonicalizeArtifact(value);
    const checksum = contentHash(value);
    const relativePath = join('artifacts', kind, `${checksum}.json`);
    const path = this.resolveInside(relativePath);
    await mkdir(dirname(path), { recursive: true });
    try {
      const handle = await open(path, 'wx', 0o600);
      try {
        await handle.writeFile(content, 'utf8');
        await handle.sync();
      } finally {
        await handle.close();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(path, 'utf8');
      if (contentHash(JSON.parse(existing)) !== checksum) throw new Error(`Artifact checksum collision at ${relativePath}`);
    }
    return { checksum, relativePath: relativePath.split(sep).join('/'), byteLength: Buffer.byteLength(content) };
  }

  async readArtifact<T>(relativePath: string): Promise<T> {
    const path = this.resolveInside(relativePath);
    const content = await readFile(path, 'utf8');
    const expected = basename(path, '.json');
    const parsed = JSON.parse(content) as T;
    if (contentHash(parsed) !== expected) throw new Error(`Artifact checksum mismatch: ${relativePath}`);
    return parsed;
  }

  async deleteOutputArtifactIfUnreferenced(relativePath:string) {
    if (!/^artifacts\/outputs\/[a-f0-9]{64}\.json$/.test(relativePath)) throw new Error('Only a validated output artifact can be discarded.');
    const operation=this.queue.then(async()=>{
      const database=await this.read();
      if(Object.values(database.runs).some(run=>run.outputArtifact===relativePath||run.resultManifestArtifact?.relativePath===relativePath))return false;
      for (const run of Object.values(database.runs)) {
        if (!run.resultManifestArtifact) continue;
        const manifest = await this.readArtifact<{ chunks?: Array<{ artifact?: { relativePath?: string } }> }>(run.resultManifestArtifact.relativePath);
        if (manifest.chunks?.some((chunk) => chunk.artifact?.relativePath === relativePath)) return false;
      }
      try {await unlink(this.resolveInside(relativePath));return true;}
      catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return false;throw error;}
    });
    this.queue=operation.then(()=>undefined,()=>undefined);
    return operation;
  }

  async createBackup(destination: string): Promise<{ path: string; checksum: string }> {
    const database = await this.read();
    const artifactPaths = await walk(this.artifactDirectory);
    const artifacts = await Promise.all(artifactPaths.map(async (path) => {
      const bytes = await readFile(path);
      return {
        relativePath: relative(this.dataDirectory, path).split(sep).join('/'),
        checksum: sha256(bytes),
        contentBase64: bytes.toString('base64'),
      };
    }));
    const backup: PlatformBackupV1 = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      databaseChecksum: sha256(canonicalize(database)),
      database,
      artifacts,
    };
    const content = canonicalize(backup);
    const path = resolve(destination);
    await mkdir(dirname(path), { recursive: true });
    await atomicWrite(path, content);
    return { path, checksum: sha256(content) };
  }

  static async restoreBackup(backupPath: string, targetDirectory: string) {
    const content = await readFile(resolve(backupPath), 'utf8');
    const backup = JSON.parse(content) as PlatformBackupV1;
    if (backup.schemaVersion !== 1) throw new Error('Unsupported backup schema version.');
    assertDatabase(backup.database);
    if (sha256(canonicalize(backup.database)) !== backup.databaseChecksum) throw new Error('Backup database checksum mismatch.');
    const target = resolve(targetDirectory);
    await mkdir(target, { recursive: true });
    const existing = await readdir(target);
    if (existing.length) throw new Error('Restore target must be empty.');
    for (const artifact of backup.artifacts) {
      const bytes = Buffer.from(artifact.contentBase64, 'base64');
      if (sha256(bytes) !== artifact.checksum) throw new Error(`Backup artifact checksum mismatch: ${artifact.relativePath}`);
      const path = resolve(target, artifact.relativePath);
      if (path !== target && !path.startsWith(`${target}${sep}`)) throw new Error('Backup contains an unsafe artifact path.');
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, bytes, { mode: 0o600, flag: 'wx' });
    }
    await atomicWrite(join(target, 'platform-database.json'), canonicalize(backup.database));
    return { targetDirectory: target, databaseChecksum: backup.databaseChecksum, artifactCount: backup.artifacts.length };
  }

  private resolveInside(relativePath: string) {
    const path = resolve(this.dataDirectory, relativePath);
    if (path !== this.dataDirectory && !path.startsWith(`${this.dataDirectory}${sep}`)) throw new Error('Path escapes platform data directory.');
    return path;
  }

  private async writeDatabase(database: PlatformDatabase) {
    assertDatabase(database);
    await mkdir(this.dataDirectory, { recursive: true });
    await atomicWrite(this.databasePath, canonicalize(database));
  }
}

async function atomicWrite(path: string, content: string) {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  const handle = await open(temporaryPath, 'wx', 0o600);
  try {
    await handle.writeFile(content, 'utf8');
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporaryPath, path);
}
