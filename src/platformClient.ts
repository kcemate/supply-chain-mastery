import type { EvidenceLedger } from './evidence/types';
import type { CopilotProviderStatus, CopilotRequest, CopilotResponse, DecisionPolicy, DecisionResolution, IntelligenceResponse, IntelligenceState } from './intelligenceTypes';
import type { EngineDefaults, Lane, ScenarioDefinition, TwinLocation } from './flywayTypes';
import type {
  RunMetricPage,
  RunMetricQuery,
  RunPage,
  RunResultReader,
  RunScopeQuery,
  RunScopeResult,
  RunSummaryV2,
  SavedScenarioReferenceV2,
  StoredScenario,
} from './runArtifacts';

export type PlatformRunStatus = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';

export interface PlatformProblem {
  type: string;
  title: string;
  status: number;
  code: string;
  detail: string;
  correlationId: string;
  retryable: boolean;
  fieldErrors?: Record<string, string>;
}

export class PlatformRequestError extends Error {
  constructor(readonly problem: PlatformProblem) {
    super(problem.detail);
    this.name = 'PlatformRequestError';
  }
}

export interface PlatformWorkspace {
  id: string;
  ownerId: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
  defaults: Partial<EngineDefaults> & { workspacePreferences?: unknown };
  locations: TwinLocation[];
  lanes: Lane[];
  scenarios: StoredScenario[];
  evidenceLedger: EvidenceLedger;
  intelligence?: IntelligenceState;
}

export interface PlatformWorkspaceReplacement {
  defaults: PlatformWorkspace['defaults'];
  locations: TwinLocation[];
  lanes: Lane[];
  scenarios?: StoredScenario[];
  evidenceLedger?: EvidenceLedger;
}

export interface PlatformRun {
  id: string;
  workspaceId: string;
  workspaceRevision: number;
  scenario: ScenarioDefinition;
  sourceRunId?: string;
  status: PlatformRunStatus;
  attempt: number;
  cancelRequested: boolean;
  inputHash: string;
  outputChecksum?: string;
  error?: { code: string; message: string; retryable: boolean };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  correlationId: string;
  idempotentReplay?: boolean;
}

export interface PlatformRunEvent {
  seq: number;
  at: string;
  status: PlatformRunStatus;
  message: string;
  attempt: number;
}

export interface PlatformAuditEvent {
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
  detail: Record<string, unknown>;
}

export interface GeocodeCandidate {
  address: string;
  latitude: number;
  longitude: number;
  precision: 'address-interpolated';
  provider: 'U.S. Census Geocoder';
  sourceUrl: string;
  matchedAt: string;
}

export interface PlatformClientOptions {
  baseUrl: string;
  ownerToken: string;
  fetch?: typeof globalThis.fetch;
}

export interface PollRunOptions {
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
  includeOutput?: boolean;
  onUpdate?: (value: { run: PlatformRun; summary?: RunSummaryV2 }) => void;
}

export interface RunListQuery {
  cursor?: string;
  limit?: number;
  scenarioId?: string;
  status?: PlatformRunStatus;
  signal?: AbortSignal;
}

function validatedBaseUrl(value: string) {
  const url = new URL(value);
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost' || url.hostname === '[::1]';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) throw new Error('Platform URL must use HTTPS or HTTP on a loopback host.');
  if (url.username || url.password || url.search || url.hash) throw new Error('Platform URL cannot contain credentials, query parameters, or a fragment.');
  return url.href.replace(/\/$/, '');
}

function newIdempotencyKey(prefix: string) {
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure random UUID support is required.');
  return `${prefix}-${globalThis.crypto.randomUUID()}`;
}

function isProblem(value: unknown): value is PlatformProblem {
  return Boolean(value) && typeof value === 'object' && typeof (value as PlatformProblem).code === 'string' && typeof (value as PlatformProblem).detail === 'string';
}

export class PlatformClient {
  readonly baseUrl: string;
  readonly #ownerToken: string;
  readonly #fetch: typeof globalThis.fetch;

  constructor(options: PlatformClientOptions) {
    this.baseUrl = validatedBaseUrl(options.baseUrl);
    if (options.ownerToken.length < 32) throw new Error('Owner token must contain at least 32 characters.');
    this.#ownerToken = options.ownerToken;
    this.#fetch = options.fetch || globalThis.fetch.bind(globalThis);
  }

  async #request<T>(path: string, options: RequestInit & { authenticated?: boolean } = {}): Promise<{ body: T; headers: Headers }> {
    const headers = new Headers(options.headers);
    if (options.authenticated !== false) headers.set('authorization', `Bearer ${this.#ownerToken}`);
    if (options.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
    const response = await this.#fetch(`${this.baseUrl}${path}`, { ...options, headers, redirect: 'error' });
    let body: unknown;
    try { body = await response.json(); } catch { body = undefined; }
    if (!response.ok) {
      if (isProblem(body)) throw new PlatformRequestError(body);
      throw new PlatformRequestError({ type: 'about:blank', title: 'Platform request failed', status: response.status, code: 'invalid_platform_response', detail: `The platform returned HTTP ${response.status} without a valid problem response.`, correlationId: response.headers.get('x-correlation-id') || '', retryable: response.status >= 500 });
    }
    return { body: body as T, headers: response.headers };
  }

  async health() {
    return (await this.#request<{ status: 'ok'; schemaVersion: number; service: string }>('/api/v1/health', { authenticated: false })).body;
  }

  async getWorkspace(options: { signal?: AbortSignal } = {}): Promise<{ workspace: PlatformWorkspace; etag: string }> {
    const response = await this.#request<{ workspace: PlatformWorkspace }>('/api/v1/workspace', { signal: options.signal });
    return { workspace: response.body.workspace, etag: response.headers.get('etag') || `"${response.body.workspace.revision}"` };
  }

  async intelligence(options: { signal?: AbortSignal } = {}): Promise<IntelligenceResponse> {
    return (await this.#request<IntelligenceResponse>('/api/v1/intelligence', { signal: options.signal })).body;
  }

  async copilotStatus(options: { signal?: AbortSignal } = {}): Promise<CopilotProviderStatus> {
    return (await this.#request<CopilotProviderStatus>('/api/v1/copilot/status', { signal: options.signal })).body;
  }

  async analyzeDecisions(expectedRevision: number, options: { idempotencyKey?: string; signal?: AbortSignal } = {}): Promise<IntelligenceResponse> {
    return (await this.#request<IntelligenceResponse>('/api/v1/intelligence/analyze', {
      method: 'POST', signal: options.signal,
      headers: { 'if-match': `"${expectedRevision}"`, 'idempotency-key': options.idempotencyKey || newIdempotencyKey('decision-analysis') },
      body: JSON.stringify({ expectedRevision }),
    })).body;
  }

  async resolveDecision(id: string, action: DecisionResolution, reason: string, expectedRevision: number, options: { idempotencyKey?: string; signal?: AbortSignal } = {}): Promise<IntelligenceResponse> {
    return (await this.#request<IntelligenceResponse>(`/api/v1/intelligence/decisions/${encodeURIComponent(id)}/resolve`, {
      method: 'POST', signal: options.signal,
      headers: { 'if-match': `"${expectedRevision}"`, 'idempotency-key': options.idempotencyKey || newIdempotencyKey('decision-resolution') },
      body: JSON.stringify({ action, reason, expectedRevision }),
    })).body;
  }

  async updateDecisionPolicy(policy: DecisionPolicy, expectedRevision: number, options: { idempotencyKey?: string; signal?: AbortSignal } = {}): Promise<IntelligenceResponse> {
    return (await this.#request<IntelligenceResponse>('/api/v1/intelligence/policy', {
      method: 'PUT', signal: options.signal,
      headers: { 'if-match': `"${expectedRevision}"`, 'idempotency-key': options.idempotencyKey || newIdempotencyKey('decision-policy') },
      body: JSON.stringify({ policy, expectedRevision }),
    })).body;
  }

  async askCopilot(request: CopilotRequest, options: { idempotencyKey?: string; signal?: AbortSignal } = {}): Promise<CopilotResponse> {
    return (await this.#request<CopilotResponse>('/api/v1/copilot/responses', {
      method: 'POST', signal: options.signal,
      headers: { 'if-match': `"${request.expectedRevision}"`, 'idempotency-key': options.idempotencyKey || newIdempotencyKey('copilot') },
      body: JSON.stringify(request),
    })).body;
  }

  async putWorkspace(replacement: PlatformWorkspaceReplacement, concurrency: number | { etag: string; idempotencyKey?: string }, explicitIdempotencyKey?: string): Promise<{ workspace: PlatformWorkspace; etag: string }> {
    const expectedRevision = typeof concurrency === 'number' ? concurrency : Number(concurrency.etag.replace(/^(?:W\/)?"?([0-9]+)"?$/, '$1'));
    if (!Number.isInteger(expectedRevision) || expectedRevision < 1) throw new Error('A valid workspace revision or ETag is required.');
    const idempotencyKey = explicitIdempotencyKey || (typeof concurrency === 'number' ? undefined : concurrency.idempotencyKey) || newIdempotencyKey('workspace');
    const response = await this.#request<{ workspace: PlatformWorkspace }>('/api/v1/workspace', { method: 'PUT', headers: { 'if-match': `"${expectedRevision}"`, 'idempotency-key': idempotencyKey }, body: JSON.stringify(replacement) });
    return { workspace: response.body.workspace, etag: response.headers.get('etag') || `"${response.body.workspace.revision}"` };
  }

  async listRuns(query: RunListQuery = {}): Promise<RunPage<PlatformRun>> {
    const parameters = queryString(query, ['cursor', 'limit', 'scenarioId', 'status']);
    return (await this.#request<RunPage<PlatformRun>>(`/api/v1/runs${parameters}`, { signal: query.signal })).body;
  }

  async findRunByInputHash(inputHash: string, options: { signal?: AbortSignal } = {}): Promise<{ run: PlatformRun; summary?: RunSummaryV2 }> {
    return (await this.#request<{ run: PlatformRun; summary?: RunSummaryV2 }>(`/api/v1/runs/by-input-hash/${encodeURIComponent(inputHash)}`, { signal: options.signal })).body;
  }

  async getRun(id: string, options: { signal?: AbortSignal } = {}): Promise<{ run: PlatformRun; summary?: RunSummaryV2 }> {
    return (await this.#request<{ run: PlatformRun; summary?: RunSummaryV2 }>(`/api/v1/runs/${encodeURIComponent(id)}`, { signal: options.signal })).body;
  }

  /** Compatibility/replay only. National results intentionally return 413. */
  async getLegacyRunResult(id: string, options: { signal?: AbortSignal } = {}): Promise<{ run: PlatformRun; summary?: RunSummaryV2; output: import('./flywayTypes').ScenarioResult }> {
    const value = (await this.#request<{ run: PlatformRun; summary?: RunSummaryV2; output?: import('./flywayTypes').ScenarioResult }>(`/api/v1/runs/${encodeURIComponent(id)}?includeOutput=true`, { signal: options.signal })).body;
    if (!value.output) throw new Error('The run has no compatibility result payload.');
    return { ...value, output: value.output };
  }

  async submitRun(scenario: ScenarioDefinition, expectedWorkspaceRevision: number, options: { sourceRunId?: string; idempotencyKey?: string } = {}): Promise<PlatformRun> {
    return (await this.#request<PlatformRun>('/api/v1/runs', { method: 'POST', headers: { 'idempotency-key': options.idempotencyKey || newIdempotencyKey('run') }, body: JSON.stringify({ scenario, expectedWorkspaceRevision, ...(options.sourceRunId ? { sourceRunId: options.sourceRunId } : {}) }) })).body;
  }

  async pollRun(id: string, options: PollRunOptions = {}): Promise<{ run: PlatformRun; summary?: RunSummaryV2 }> {
    const intervalMs = options.intervalMs ?? 250;
    const timeoutMs = options.timeoutMs ?? 120_000;
    const started = Date.now();
    while (true) {
      if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
      const value = await this.getRun(id, { signal: options.signal });
      if (options.signal?.aborted) throw options.signal.reason || new DOMException('Aborted', 'AbortError');
      options.onUpdate?.(value);
      if (value.run.status === 'succeeded' || value.run.status === 'failed' || value.run.status === 'cancelled') return value;
      if (Date.now() - started >= timeoutMs) throw new Error(`Run ${id} did not complete within ${timeoutMs}ms.`);
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => options.signal?.removeEventListener('abort', abort);
        const timer = setTimeout(() => { cleanup(); resolve(); }, intervalMs);
        const abort = () => { clearTimeout(timer); cleanup(); reject(options.signal?.reason || new DOMException('Aborted', 'AbortError')); };
        options.signal?.addEventListener('abort', abort, { once: true });
      });
    }
  }

  async saveScenario(runId: string, expectedWorkspaceRevision: number, options: { idempotencyKey?: string } = {}): Promise<{ scenario: SavedScenarioReferenceV2; workspaceRevision: number; etag: string; idempotentReplay: boolean }> {
    const response = await this.#request<{ scenario: SavedScenarioReferenceV2; workspaceRevision: number; etag?: string; idempotentReplay: boolean }>('/api/v1/scenarios', {
      method: 'POST',
      headers: { 'if-match': `"${expectedWorkspaceRevision}"`, 'idempotency-key': options.idempotencyKey || newIdempotencyKey('scenario') },
      body: JSON.stringify({ runId, expectedWorkspaceRevision }),
    });
    return { ...response.body, etag: response.headers.get('etag') || response.body.etag || `"${response.body.workspaceRevision}"` };
  }

  async listScenarios(query: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<RunPage<StoredScenario>> {
    const parameters = queryString(query, ['cursor', 'limit']);
    return (await this.#request<RunPage<StoredScenario>>(`/api/v1/scenarios${parameters}`, { signal: query.signal })).body;
  }

  async getScenario(id: string, options: { signal?: AbortSignal } = {}): Promise<StoredScenario> {
    return (await this.#request<{ scenario: StoredScenario }>(`/api/v1/scenarios/${encodeURIComponent(id)}`, { signal: options.signal })).body.scenario;
  }

  async listScenarioRuns(id: string, query: { cursor?: string; limit?: number; signal?: AbortSignal } = {}): Promise<RunPage<PlatformRun>> {
    const parameters = queryString(query, ['cursor', 'limit']);
    return (await this.#request<RunPage<PlatformRun>>(`/api/v1/scenarios/${encodeURIComponent(id)}/runs${parameters}`, { signal: query.signal })).body;
  }

  createRunReader(run: PlatformRun, summary: RunSummaryV2): RunResultReader {
    const id = encodeURIComponent(run.id);
    const page = async <T>(path: string, cursor?: string, signal?: AbortSignal) => {
      const suffix = cursor ? `${path.includes('?') ? '&' : '?'}cursor=${encodeURIComponent(cursor)}` : '';
      return (await this.#request<RunPage<T>>(`${path}${suffix}`, { signal })).body;
    };
    return {
      summary,
      locator: { kind: 'service', runId: run.id, workspaceId: run.workspaceId },
      input: async (signal) => (await this.#request<{ input: import('./flywayTypes').RunInputV2 }>(`/api/v1/runs/${id}/input`, { signal })).body.input,
      scope: async (query, signal) => (await this.#request<RunScopeResult>(`/api/v1/runs/${id}/scope${queryString(query, ['product', 'period', 'sort', 'cursor', 'limit'])}`, { signal })).body,
      metrics: async (query, signal) => (await this.#request<RunMetricPage>(`/api/v1/runs/${id}/metrics${queryString(query, ['kind', 'product', 'locationType', 'locationId', 'stockoutsOnly', 'periodFrom', 'periodToExclusive', 'cursor', 'limit'])}`, { signal })).body,
      impacts: (cursor, signal) => page(`/api/v1/runs/${id}/impacts`, cursor, signal),
      recommendations: (cursor, signal) => page(`/api/v1/runs/${id}/recommendations`, cursor, signal),
      warnings: (cursor, signal) => page(`/api/v1/runs/${id}/warnings`, cursor, signal),
      constraints: (cursor, signal) => page(`/api/v1/runs/${id}/constraints`, cursor, signal),
    };
  }

  async getRunReader(id: string, options: { signal?: AbortSignal } = {}) {
    const value = await this.getRun(id, options);
    if (!value.summary) throw new Error('The run has no published result summary.');
    return this.createRunReader(value.run, value.summary);
  }

  async cancelRun(id: string, idempotencyKey = newIdempotencyKey('cancel')): Promise<PlatformRun> {
    return (await this.#request<PlatformRun>(`/api/v1/runs/${encodeURIComponent(id)}/cancel`, { method: 'POST', headers: { 'idempotency-key': idempotencyKey } })).body;
  }

  async retryRun(id: string, idempotencyKey = newIdempotencyKey('retry')): Promise<PlatformRun> {
    return (await this.#request<PlatformRun>(`/api/v1/runs/${encodeURIComponent(id)}/retry`, { method: 'POST', headers: { 'idempotency-key': idempotencyKey } })).body;
  }

  async geocode(address: string): Promise<{ candidates: GeocodeCandidate[]; warning?: string }> {
    return (await this.#request<{ candidates: GeocodeCandidate[]; warning?: string }>(`/api/v1/geocode?address=${encodeURIComponent(address)}`)).body;
  }

  async getRunEvents(id: string, after = 0): Promise<PlatformRunEvent[]> {
    return (await this.#request<{ events: PlatformRunEvent[] }>(`/api/v1/runs/${encodeURIComponent(id)}/events?after=${after}`)).body.events;
  }

  async getAudit(after = 0): Promise<PlatformAuditEvent[]> {
    return (await this.#request<{ events: PlatformAuditEvent[] }>(`/api/v1/audit?after=${after}`)).body.events;
  }

  async getMetrics(): Promise<Record<string, number | string>> {
    return (await this.#request<Record<string, number | string>>('/api/v1/metrics')).body;
  }
}

export function createPlatformClient(options: PlatformClientOptions) {
  return new PlatformClient(options);
}

function queryString<T extends object>(value: T, keys: ReadonlyArray<keyof T>) {
  const parameters = new URLSearchParams();
  for (const key of keys) {
    const item = value[key];
    if (item !== undefined && item !== '') parameters.set(String(key), String(item));
  }
  const content = parameters.toString();
  return content ? `?${content}` : '';
}
