import type { EvidenceLedger } from '../src/evidence/types';
import type { EngineDefaults, Lane, ScenarioDefinition, TwinLocation } from '../src/flywayTypes';
import type { RunSummaryV2, StoredScenario } from '../src/runArtifacts';
import type { IntelligenceState } from '../src/intelligenceTypes';

export const PLATFORM_SCHEMA_VERSION = 1 as const;
export const DEFAULT_WORKSPACE_ID = '00000000-0000-4000-8000-000000000001';
export const LOCAL_OWNER_ID = 'local-owner';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export interface WorkspaceState {
  id: string;
  ownerId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  defaults: Partial<EngineDefaults> & { workspacePreferences?: JsonValue };
  locations: TwinLocation[];
  lanes: Lane[];
  scenarios: StoredScenario[];
  evidenceLedger: EvidenceLedger;
  intelligence?: IntelligenceState;
}

export type RunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface RunEvent {
  seq: number;
  at: string;
  status: RunStatus;
  message: string;
  attempt: number;
}

export interface RunRecord {
  id: string;
  workspaceId: string;
  workspaceRevision: number;
  scenario: ScenarioDefinition;
  sourceRunId?: string;
  status: RunStatus;
  attempt: number;
  cancelRequested: boolean;
  inputHash: string;
  inputArtifact: string;
  inputArtifactReference?: ArtifactReference;
  outputChecksum?: string;
  /** Monolithic v1 output retained during verified migration only. */
  outputArtifact?: string;
  resultFormat?: 'monolith-v1' | 'manifest-v2';
  resultManifestArtifact?: ArtifactReference;
  resultSummary?: RunSummaryV2;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  correlationId: string;
  events: RunEvent[];
}

export interface AuditEvent {
  seq: number;
  id: string;
  at: string;
  workspaceId: string;
  actorId: string;
  correlationId: string;
  action: string;
  aggregateType: 'workspace' | 'run' | 'system' | 'intelligence';
  aggregateId: string;
  revision?: number;
  detail: Record<string, JsonValue>;
}

export interface StoredHttpResponse {
  status: number;
  headers?: Record<string, string>;
  body: JsonValue;
}

export interface IdempotencyRecord {
  scope: string;
  key: string;
  requestHash: string;
  response: StoredHttpResponse;
  createdAt: string;
}

export interface PlatformDatabase {
  schemaVersion: typeof PLATFORM_SCHEMA_VERSION;
  workspace: WorkspaceState;
  runs: Record<string, RunRecord>;
  idempotency: Record<string, IdempotencyRecord>;
  audit: AuditEvent[];
  metrics: {
    startedAt: string;
    requests: number;
    errors: number;
    jobsSucceeded: number;
    jobsFailed: number;
    jobsCancelled: number;
    recoveredJobs: number;
  };
}

export interface FrozenPlatformRunInput {
  schemaVersion: 1;
  workspaceId: string;
  workspaceRevision: number;
  defaults: Partial<EngineDefaults> & { workspacePreferences?: JsonValue };
  locations: TwinLocation[];
  lanes: Lane[];
  evidenceLedger: EvidenceLedger;
  scenario: ScenarioDefinition;
}

export interface ProblemDetail {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  correlationId: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
}

export interface ArtifactReference {
  checksum: string;
  relativePath: string;
  byteLength: number;
}

export interface WorkspaceReplacement {
  defaults: Partial<EngineDefaults> & { workspacePreferences?: JsonValue };
  locations: TwinLocation[];
  lanes: Lane[];
  scenarios?: StoredScenario[];
  evidenceLedger?: EvidenceLedger;
}

export function emptyEvidenceLedger(): EvidenceLedger {
  return { schemaVersion: 1, sources: [], artifacts: [], snapshots: [], values: [], conflicts: [] };
}
