import { canonicalStringify, contentHash } from './engine/canonical';
import type { ScenarioDefinition, ScenarioResult } from './flywayTypes';
import { decodeScenarioResult } from './schemaDecoders';
import { decodeRunManifest } from './runArtifactDecoders';
import type { RunArtifactReader, RunArtifactReference, RunArtifactWriter, RunLocator, RunResultReader, SavedScenarioReferenceV2 } from './runArtifacts';
import { createRunArtifactRepository, persistRunResult } from './runArtifactRepository';
import { replayRun } from './flywayEngine';

const DEFAULT_DATABASE = 'flyway-local-runs-v2';
const DATABASE_VERSION = 1;
const ARTIFACTS = 'artifacts';
const MANIFESTS = 'manifests';

type ArtifactRecord = RunArtifactReference & { payload: string };
type ManifestRecord = { runId: string; artifact: RunArtifactReference };

function abortError(signal?: AbortSignal) {
  if (signal?.aborted) throw signal.reason || new DOMException('Operation aborted.', 'AbortError');
}
function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
  });
}
function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction was aborted.'));
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed.'));
  });
}
function byteLength(value: string) { return new TextEncoder().encode(value).byteLength; }
function asReader(manifest: import('./runArtifacts').RunResultManifestV2, read: RunArtifactReader, locator: RunLocator): RunResultReader {
  const artifacts = createRunArtifactRepository(manifest, read);
  const guarded = async <T>(signal: AbortSignal | undefined, operation: () => Promise<T>) => { abortError(signal); const value = await operation(); abortError(signal); return value; };
  return {
    summary: manifest.summary,
    locator,
    input: (signal) => guarded(signal, () => artifacts.input()),
    scope: (query, signal) => guarded(signal, () => artifacts.scope(query)),
    metrics: (query, signal) => guarded(signal, () => artifacts.metrics(query)),
    impacts: (cursor, signal) => guarded(signal, () => artifacts.impacts(cursor)),
    recommendations: (cursor, signal) => guarded(signal, () => artifacts.recommendations(cursor)),
    warnings: (cursor, signal) => guarded(signal, () => artifacts.warnings(cursor)),
    constraints: (cursor, signal) => guarded(signal, () => artifacts.constraints(cursor)),
  };
}

export interface LocalRunRepositoryOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
  beforeCommit?: (stage: 'artifact' | 'manifest-index', identity: string) => void;
}

export class LocalRunRepository {
  readonly databaseName: string;
  private readonly factory: IDBFactory;
  private readonly beforeCommit?: LocalRunRepositoryOptions['beforeCommit'];
  private database?: Promise<IDBDatabase>;

  constructor(options: LocalRunRepositoryOptions = {}) {
    this.databaseName = options.databaseName || DEFAULT_DATABASE;
    const factory = options.indexedDB || globalThis.indexedDB;
    if (!factory) throw new Error('IndexedDB is unavailable. The completed run remains in memory but cannot be saved in this browser.');
    this.factory = factory;
    this.beforeCommit = options.beforeCommit;
  }

  private openDatabase() {
    if (this.database) return this.database;
    this.database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = this.factory.open(this.databaseName, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(ARTIFACTS)) database.createObjectStore(ARTIFACTS, { keyPath: 'relativePath' });
        if (!database.objectStoreNames.contains(MANIFESTS)) database.createObjectStore(MANIFESTS, { keyPath: 'runId' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('The local run database could not be opened.'));
      request.onblocked = () => reject(new Error('The local run database upgrade is blocked by another tab. Close older Flyway tabs and retry.'));
    });
    return this.database;
  }

  private readArtifact: RunArtifactReader = async <T>(reference: RunArtifactReference) => {
    const database = await this.openDatabase();
    const transaction = database.transaction(ARTIFACTS, 'readonly');
    const record = await requestValue(transaction.objectStore(ARTIFACTS).get(reference.relativePath)) as ArtifactRecord | undefined;
    await transactionDone(transaction);
    if (!record) throw new Error(`Run artifact ${reference.relativePath} is missing.`);
    if (record.checksum !== reference.checksum || record.byteLength !== reference.byteLength || byteLength(record.payload) !== reference.byteLength || contentHash(JSON.parse(record.payload)) !== reference.checksum) {
      throw new Error(`Run artifact ${reference.relativePath} failed integrity verification.`);
    }
    return JSON.parse(record.payload) as T;
  };

  private writeArtifact: RunArtifactWriter = async (value: unknown) => {
    const payload = canonicalStringify(value);
    const checksum = contentHash(value);
    const reference: RunArtifactReference = { checksum, relativePath: `artifacts/${checksum}.json`, byteLength: byteLength(payload) };
    const database = await this.openDatabase();
    const transaction = database.transaction(ARTIFACTS, 'readwrite');
    const store = transaction.objectStore(ARTIFACTS);
    const existing = await requestValue(store.get(reference.relativePath)) as ArtifactRecord | undefined;
    if (existing && (existing.checksum !== reference.checksum || existing.byteLength !== reference.byteLength || existing.payload !== payload)) {
      transaction.abort();
      throw new Error(`Content-addressed artifact collision at ${reference.relativePath}.`);
    }
    if (!existing) { this.beforeCommit?.('artifact', reference.relativePath); store.add({ ...reference, payload } satisfies ArtifactRecord); }
    await transactionDone(transaction);
    return reference;
  };

  async persist(result: ScenarioResult, options: { signal?: AbortSignal } = {}): Promise<RunResultReader> {
    abortError(options.signal);
    const decoded = decodeScenarioResult(result);
    if (!decoded.ok || !result.input || !result.outputChecksum) throw new Error('Only a complete, validated result with frozen input and output checksum can be persisted.');
    if (contentHash(result.input) !== result.inputHash) throw new Error('The completed run input does not match its input hash.');
    const inputArtifact = await this.writeArtifact(result.input);
    abortError(options.signal);
    const writer: RunArtifactWriter = async (value) => { abortError(options.signal); const reference = await this.writeArtifact(value); abortError(options.signal); return reference; };
    const committed = await persistRunResult(result, inputArtifact, writer);
    const manifest = decodeRunManifest(committed.manifest);
    if (!manifest.ok) throw new Error(`The generated run manifest failed validation: ${Object.values(manifest.errors)[0]}`);
    const database = await this.openDatabase();
    const transaction = database.transaction(MANIFESTS, 'readwrite');
    const store = transaction.objectStore(MANIFESTS);
    const existing = await requestValue(store.get(result.runId)) as ManifestRecord | undefined;
    if (existing && existing.artifact.checksum !== committed.manifestArtifact.checksum) {
      transaction.abort();
      throw new Error(`Run ${result.runId} already exists with different immutable output.`);
    }
    if (!existing) { this.beforeCommit?.('manifest-index', result.runId); store.add({ runId: result.runId, artifact: committed.manifestArtifact } satisfies ManifestRecord); }
    await transactionDone(transaction);
    abortError(options.signal);
    return this.open({ kind: 'local', runId: result.runId }, options);
  }

  async open(locator: RunLocator, options: { signal?: AbortSignal } = {}): Promise<RunResultReader> {
    abortError(options.signal);
    if (locator.kind !== 'local') throw new Error('A service run cannot be opened from browser artifact storage.');
    const database = await this.openDatabase();
    const transaction = database.transaction(MANIFESTS, 'readonly');
    const record = await requestValue(transaction.objectStore(MANIFESTS).get(locator.runId)) as ManifestRecord | undefined;
    await transactionDone(transaction);
    if (!record) throw new Error(`Saved local run ${locator.runId} was not found. The workspace reference was not changed.`);
    const value = await this.readArtifact<unknown>(record.artifact);
    const manifest = decodeRunManifest(value);
    if (!manifest.ok) throw new Error(`Saved local run ${locator.runId} has an invalid manifest.`);
    if (manifest.value.summary.runId !== locator.runId) throw new Error(`Saved local run ${locator.runId} failed manifest identity verification.`);
    abortError(options.signal);
    return asReader(manifest.value, this.readArtifact, locator);
  }
}

let defaultRepository: LocalRunRepository | undefined;
function repository() { return defaultRepository ||= new LocalRunRepository(); }

export function persistLocalRun(result: ScenarioResult, options?: { signal?: AbortSignal }) { return repository().persist(result, options); }
export function openLocalRun(locator: RunLocator, options?: { signal?: AbortSignal }) { return repository().open(locator, options); }

function scenarioFields(scenario: ScenarioDefinition): ScenarioDefinition {
  return {
    id: scenario.id, name: scenario.name, description: scenario.description, type: scenario.type, targetId: scenario.targetId,
    magnitude: scenario.magnitude, grain: scenario.grain, horizon: scenario.horizon, createdAt: scenario.createdAt,
    baselineRevision: scenario.baselineRevision, ...(scenario.startDate === undefined ? {} : { startDate: scenario.startDate }),
    ...(scenario.changes === undefined ? {} : { changes: scenario.changes }),
  };
}

export function createLocalScenarioReference(scenario: ScenarioDefinition, reader: RunResultReader, savedAt = new Date().toISOString()): SavedScenarioReferenceV2 {
  if (reader.locator.kind !== 'local' || reader.locator.runId !== reader.summary.runId) throw new Error('A local scenario reference requires a verified local run reader.');
  return { ...scenarioFields(scenario), schemaVersion: 2, savedAt, latestRun: reader.summary, resultRef: reader.locator };
}

export async function migrateLegacyScenario(saved: import('./flywayTypes').SavedScenario, options?: { signal?: AbortSignal }): Promise<SavedScenarioReferenceV2> {
  const validated = decodeScenarioResult(saved.result);
  if (!validated.ok || !saved.result.input || !saved.result.outputChecksum) throw new Error('This legacy result is incomplete and remains preserved in its original workspace envelope.');
  abortError(options?.signal);
  const replayed=replayRun(saved.result.input);
  if(replayed.inputHash!==saved.result.inputHash||replayed.outputChecksum!==saved.result.outputChecksum)throw new Error('This legacy result failed deterministic checksum verification and remains preserved in its original workspace envelope.');
  const reader = await persistLocalRun(saved.result, options);
  return createLocalScenarioReference(saved, reader);
}

export async function createMemoryRunReader(result: ScenarioResult, options: { signal?: AbortSignal } = {}): Promise<RunResultReader> {
  abortError(options.signal);
  const artifacts = new Map<string, string>();
  const write: RunArtifactWriter = async (value) => {
    const payload = canonicalStringify(value), checksum = contentHash(value);
    const reference = { checksum, relativePath: `memory/${checksum}.json`, byteLength: byteLength(payload) };
    artifacts.set(reference.relativePath, payload);
    return reference;
  };
  const read: RunArtifactReader = async <T>(reference: RunArtifactReference) => {
    const payload = artifacts.get(reference.relativePath);
    if (!payload || byteLength(payload) !== reference.byteLength || contentHash(JSON.parse(payload)) !== reference.checksum) throw new Error('The retained in-memory run artifact failed integrity verification.');
    return JSON.parse(payload) as T;
  };
  if (!result.input) throw new Error('A frozen input is required to retain a completed run.');
  const inputArtifact = await write(result.input);
  const writer: RunArtifactWriter = async (value) => { abortError(options.signal); return write(value); };
  const committed = await persistRunResult(result, inputArtifact, writer);
  return asReader(committed.manifest, read, { kind: 'local', runId: result.runId });
}
