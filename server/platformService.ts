import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { EngineDefaults, RunInputV2, ScenarioDefinition, ScenarioResult } from '../src/flywayTypes';
import * as flywayEngine from '../src/flywayEngine';
import { createIntelligenceState, defaultDecisionPolicy, generateDecisionCandidates, candidateInputFor, networkFingerprint, recordEvaluatedDecision, resolveDecision as resolveDomainDecision, validateIntelligenceState } from '../src/decisionIntelligence';
import type { CopilotConversation, CopilotMessage, CopilotRequest, CopilotResponse, DecisionPolicy, DecisionResolution, IntelligenceResponse, IntelligenceState } from '../src/intelligenceTypes';
import {
  isScenarioReference,
  type PublishedRunArtifacts,
  type RunArtifactReference,
  type RunArtifactWriter,
  type RunMetricQuery,
  type RunPage,
  type RunResultManifestV2,
  type RunScopeQuery,
  type RunSummaryV2,
  type SavedScenarioReferenceV2,
  type StoredScenario,
} from '../src/runArtifacts';
import { createRunArtifactRepository, persistLegacyRunResult, persistRunResult } from '../src/runArtifactRepository';
import { canonicalize, requestHash, sha256 } from './canonical';
import { canonicalStringify as canonicalizeArtifact, contentHash } from '../src/engine/canonical';
import { EngineExecutionAbortedError, executeEngineWorker, executeEngineWorkerToArtifacts } from './engineWorkerClient';
import type { PlatformStore } from './storage';
import type {
  AuditEvent,
  FrozenPlatformRunInput,
  IdempotencyRecord,
  JsonValue,
  PlatformDatabase,
  RunRecord,
  StoredHttpResponse,
  WorkspaceReplacement,
  WorkspaceState,
} from './types';
import { LOCAL_OWNER_ID } from './types';
import { validateScenario } from './validation';
import type { CopilotProvider, CopilotProviderReply, CopilotToolGateway } from './openAiCopilot';
import { UnconfiguredCopilotProvider } from './openAiCopilot';
import facilityRegistryJson from '../public-site/data/chick-fil-a-public-distribution-facilities.json';
import type { PublicDistributionFacilityRegistry } from '../src/flywayTypes';
import { answerSavedModelQuestion } from '../src/modelAssistant';
import { openRunView } from '../src/runResultView';
import type { RunResultReader } from '../src/runArtifacts';

const LEGACY_FULL_RESULT_LIMIT_BYTES = 1024 * 1024;
const publicFacilityRegistry = facilityRegistryJson as PublicDistributionFacilityRegistry;

export class PlatformError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'PlatformError';
  }
}

export interface EngineAdapter {
  freeze(input: FrozenPlatformRunInput, sourceInput?: unknown): Promise<unknown>;
  execute(input: unknown, signal?: AbortSignal): Promise<ScenarioResult>;
  executeToArtifacts?(input: unknown, inputArtifact: RunArtifactReference, writeArtifact: RunArtifactWriter, signal?: AbortSignal): Promise<PublishedRunArtifacts>;
  shutdown?(): Promise<void>;
}

const ENGINE_DEFAULT_KEYS: Array<keyof EngineDefaults> = [
  'schemaVersion', 'serviceTarget', 'distanceUnit', 'defaultGrain', 'dieselCostMicrosPerGallon', 'routingMode', 'startDate',
  'includeShortagePenalty', 'productWeights', 'defaultSeasonalityByWeekday', 'defaultSafetyStockDays', 'defaultOrderUpToDays',
  'defaultLeadTimeDays', 'defaultVehicleCapacity', 'fixedStopCostMicros', 'driverCostMicrosPerHour', 'handlingCostMicrosPerUnit',
  'carryingCostMicrosPerUnitDay', 'purchaseCostMicrosByProduct', 'shortagePenaltyMicrosByProduct',
];

function engineDefaultsFromWorkspace(defaults: FrozenPlatformRunInput['defaults']): Partial<EngineDefaults> {
  return Object.fromEntries(ENGINE_DEFAULT_KEYS.flatMap((key) => defaults[key] === undefined ? [] : [[key, defaults[key]]])) as Partial<EngineDefaults>;
}

export function createDefaultEngineAdapter(): EngineAdapter {
  return {
    async freeze(input, sourceInput) {
      const source = sourceInput && typeof sourceInput === 'object' ? sourceInput as Record<string, unknown> : undefined;
      if (source && source.schemaVersion !== 2) throw new Error('The source run uses an incompatible frozen input schema and cannot be replayed by this engine.');
      const sourceLocations = Array.isArray(source?.locations) ? source.locations as FrozenPlatformRunInput['locations'] : input.locations;
      const sourceLanes = Array.isArray(source?.lanes) ? source.lanes as FrozenPlatformRunInput['lanes'] : input.lanes;
      const sourceDefaults = source?.defaults && typeof source.defaults === 'object' ? source.defaults as Partial<EngineDefaults> : engineDefaultsFromWorkspace(input.defaults);
      const sourceVersions = Array.isArray(source?.sourceVersions) && source.sourceVersions.every((item) => typeof item === 'string') ? source.sourceVersions as string[] : [
        ...input.evidenceLedger.snapshots.flatMap((snapshot) => snapshot.checksumSha256 ? [snapshot.checksumSha256] : []),
        ...input.evidenceLedger.artifacts.flatMap((artifact) => artifact.checksumSha256 ? [artifact.checksumSha256] : []),
      ];
      return flywayEngine.createRunInput(
        sourceLocations,
        sourceLanes,
        input.scenario,
        sourceDefaults,
        {
          sourceVersions,
          routeVersions: Array.isArray(source?.routeVersions) ? source.routeVersions as string[] : [],
          forecastVersions: Array.isArray(source?.forecastVersions) ? source.forecastVersions as string[] : [],
          warningsAcknowledged: Array.isArray(source?.warningsAcknowledged) ? source.warningsAcknowledged as string[] : [],
        },
      );
    },
    async execute(input, signal) {
      const frozen = input as Partial<RunInputV2>;
      if (frozen.schemaVersion !== 2) throw new Error('Run input is not compatible with the deterministic engine contract.');
      return executeEngineWorker(frozen as RunInputV2, signal);
    },
    async executeToArtifacts(input, inputArtifact, writeArtifact, signal) {
      const frozen = input as Partial<RunInputV2>;
      if (frozen.schemaVersion !== 2) throw new Error('Run input is not compatible with the deterministic engine contract.');
      return executeEngineWorkerToArtifacts(frozen as RunInputV2, inputArtifact, writeArtifact, signal);
    },
  };
}

function json<T>(value: T): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function auditEvent(database: PlatformDatabase, input: Omit<AuditEvent, 'seq' | 'id' | 'at' | 'actorId'>) {
  database.audit.push({
    ...input,
    seq: (database.audit.at(-1)?.seq || 0) + 1,
    id: randomUUID(),
    at: new Date().toISOString(),
    actorId: LOCAL_OWNER_ID,
  });
}

function addRunEvent(run: RunRecord, status: RunRecord['status'], message: string) {
  run.events.push({
    seq: (run.events.at(-1)?.seq || 0) + 1,
    at: new Date().toISOString(),
    status,
    message,
    attempt: run.attempt,
  });
}

function idempotencyIndex(scope: string, key: string) {
  return sha256(`${scope}\0${key}`);
}

function checkIdempotency(database: PlatformDatabase, scope: string, key: string, hash: string) {
  const existing = database.idempotency[idempotencyIndex(scope, key)];
  if (!existing) return undefined;
  if (existing.scope !== scope || existing.key !== key || existing.requestHash !== hash) {
    throw new PlatformError(409, 'idempotency_key_reused', 'The idempotency key was already used for a different request.');
  }
  return existing.response;
}

function storeIdempotency(database: PlatformDatabase, scope: string, key: string, hash: string, response: StoredHttpResponse) {
  const record: IdempotencyRecord = { scope, key, requestHash: hash, response, createdAt: new Date().toISOString() };
  database.idempotency[idempotencyIndex(scope, key)] = record;
}

export class PlatformService {
  private processing = false;
  private processScheduled = false;
  private processingPromise?: Promise<void>;
  private readonly activeExecutions = new Map<string, AbortController>();
  private stopping = false;
  private queueFailure?: { at:string; code:'queue_processing_failed'|'output_cleanup_failed'; message:string };
  private readonly cursorSecret = randomBytes(32);
  private readonly copilotInflight = new Map<string, { hash: string; promise: Promise<{ response: CopilotResponse; replayed: boolean }> }>();

  constructor(
    readonly store: PlatformStore,
    readonly engine: EngineAdapter = createDefaultEngineAdapter(),
    readonly copilot: CopilotProvider = new UnconfiguredCopilotProvider(),
  ) {}

  async initialize() {
    await this.store.initialize();
    await this.store.transaction((database) => {
      if (!database.workspace.intelligence) database.workspace.intelligence = createIntelligenceState();
      else validateIntelligenceState(database.workspace.intelligence);
      for (const run of Object.values(database.runs)) {
        if (run.status !== 'running') continue;
        run.status = 'queued';
        run.startedAt = undefined;
        run.error = undefined;
        addRunEvent(run, 'queued', 'Recovered after an interrupted worker process.');
        database.metrics.recoveredJobs += 1;
        auditEvent(database, {
          workspaceId: run.workspaceId,
          correlationId: run.correlationId,
          action: 'run.recovered',
          aggregateType: 'run',
          aggregateId: run.id,
          detail: { attempt: run.attempt },
        });
      }
    });
    await this.migrateLegacyWorkspaceScenarios();
    this.scheduleProcessing();
  }

  async workspace() {
    return (await this.store.read()).workspace;
  }

  async intelligence(): Promise<IntelligenceResponse> {
    const workspace = (await this.store.read()).workspace;
    const state = workspace.intelligence || createIntelligenceState();
    validateIntelligenceState(state);
    return { state: structuredClone(state), workspaceRevision: workspace.revision };
  }

  copilotStatus() { return this.copilot.status(); }

  async updateDecisionPolicy(input: { policy: DecisionPolicy; expectedRevision: number; idempotencyKey: string; correlationId: string }): Promise<{ response: IntelligenceResponse; replayed: boolean }> {
    const policy = validatePolicy(input.policy);
    const scope = 'PUT:/api/v1/intelligence/policy';
    const hash = requestHash({ policy, expectedRevision: input.expectedRevision });
    return this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, input.idempotencyKey, hash);
      if (replay) return { response: structuredClone(replay.body as unknown as IntelligenceResponse), replayed: true };
      const state = database.workspace.intelligence || createIntelligenceState();
      if (state.revision !== input.expectedRevision) throw new PlatformError(412, 'intelligence_revision_conflict', `Intelligence revision ${input.expectedRevision} is stale; current revision is ${state.revision}.`);
      const next: IntelligenceState = { ...structuredClone(state), revision: state.revision + 1, policy };
      validateIntelligenceState(next);
      database.workspace.intelligence = next;
      database.workspace.updatedAt = new Date().toISOString();
      auditEvent(database, { workspaceId: database.workspace.id, correlationId: input.correlationId, action: 'intelligence.policy.updated', aggregateType: 'intelligence', aggregateId: database.workspace.id, revision: next.revision, detail: { autonomyEnabled: policy.autonomyEnabled, maxCapacityIncreasePct: policy.maxCapacityIncreasePct, maxCostIncreasePct: policy.maxCostIncreasePct, maxLocations: policy.maxLocations, minServiceGainPp: policy.minServiceGainPp } });
      const response: IntelligenceResponse = { state: structuredClone(next), workspaceRevision: database.workspace.revision };
      storeIdempotency(database, scope, input.idempotencyKey, hash, { status: 200, body: json(response) });
      return { response, replayed: false };
    });
  }

  async analyzeDecisions(input: { expectedRevision: number; idempotencyKey: string; correlationId: string }): Promise<{ response: IntelligenceResponse; replayed: boolean }> {
    const scope = 'POST:/api/v1/intelligence/analyze';
    const hash = requestHash({ expectedRevision: input.expectedRevision });
    const initial = await this.store.read();
    const replay = checkIdempotency(initial, scope, input.idempotencyKey, hash);
    if (replay) return { response: structuredClone(replay.body as unknown as IntelligenceResponse), replayed: true };
    const initialState = initial.workspace.intelligence || createIntelligenceState();
    if (initialState.revision !== input.expectedRevision) throw new PlatformError(412, 'intelligence_revision_conflict', `Intelligence revision ${input.expectedRevision} is stale; current revision is ${initialState.revision}.`);
    const initialNetwork = decisionNetwork(initial.workspace);
    const baselineScenario = decisionBaselineScenario(initial.workspace, initialNetwork);
    const baselineSubmission = await this.createRun({ scenario: baselineScenario, expectedWorkspaceRevision: initial.workspace.revision, idempotencyKey: `decision-baseline:${input.idempotencyKey}`, correlationId: input.correlationId });
    const sourceRun = await this.waitForCompletedRun(baselineSubmission.run.id, 30_000);
    if (sourceRun.status !== 'succeeded') throw new PlatformError(409, 'decision_source_run_failed', 'The deterministic baseline run did not complete successfully.');
    const sourceResult = await (await this.repository(sourceRun)).materialize();
    let candidates;
    try { candidates = generateDecisionCandidates(sourceResult, initialNetwork, initialState); }
    catch (error) { throw decisionError(error); }
    const evaluated: Array<{ candidate: (typeof candidates)[number]; candidateInput: RunInputV2; result: ScenarioResult; authority: 'ai' | 'human' }> = [];
    for (const candidate of candidates) {
      const candidateInput = candidateInputFor(sourceResult, candidate);
      const result = await this.engine.execute(candidateInput);
      const preview = recordEvaluatedDecision({ state: initialState, network: initialNetwork, sourceResult, candidate, candidateResult: result });
      evaluated.push({ candidate, candidateInput, result, authority: preview.decision.authority });
    }
    const automatic = evaluated.find((item) => item.authority === 'ai');
    let state = structuredClone(initialState);
    let network = structuredClone(initialNetwork);
    const outcomes: Array<ReturnType<typeof recordEvaluatedDecision>> = [];
    const stagedRuns: RunRecord[] = [];
    const record = async (item: (typeof evaluated)[number], basis: ScenarioResult, basisRunId: string, workspaceRevision: number) => {
      const outcome = recordEvaluatedDecision({ state, network, sourceResult: basis, candidate: item.candidate, candidateResult: item.result });
      if (!outcome.duplicate) {
        const candidateRun = await this.stagePublishedRun(item.candidateInput, item.result, workspaceRevision, input.correlationId);
        stagedRuns.push(candidateRun);
        setDecisionRunReferences(outcome, basisRunId, candidateRun.id);
      }
      state = outcome.state;
      network = { locations: outcome.locations, lanes: outcome.lanes, defaults: outcome.defaults };
      outcomes.push(outcome);
    };
    if (automatic) {
      await record(automatic, sourceResult, sourceRun.id, initial.workspace.revision);
      const updatedWorkspace = { ...initial.workspace, locations: network.locations, lanes: network.lanes, revision: initial.workspace.revision + 1 };
      const freshScenario = decisionBaselineScenario(updatedWorkspace, network);
      const freshInput = flywayEngine.createRunInput(network.locations, network.lanes, freshScenario, network.defaults, {
        sourceVersions: sourceResult.input!.sourceVersions,
        routeVersions: sourceResult.input!.routeVersions,
        forecastVersions: sourceResult.input!.forecastVersions,
        warningsAcknowledged: sourceResult.input!.warningsAcknowledged,
      });
      const freshResult = await this.engine.execute(freshInput);
      const freshSourceRun = await this.stagePublishedRun(freshInput, freshResult, updatedWorkspace.revision, input.correlationId);
      stagedRuns.push(freshSourceRun);
      const freshCandidates = generateDecisionCandidates(freshResult, network, state);
      for (const candidate of freshCandidates) {
        const candidateInput = candidateInputFor(freshResult, candidate);
        const result = await this.engine.execute(candidateInput);
        const preview = recordEvaluatedDecision({ state, network, sourceResult: freshResult, candidate, candidateResult: result });
        if (preview.decision.authority === 'ai') continue;
        await record({ candidate, candidateInput, result, authority: 'human' }, freshResult, freshSourceRun.id, updatedWorkspace.revision);
      }
    } else {
      for (const item of evaluated.filter((candidate) => candidate.authority === 'human')) await record(item, sourceResult, sourceRun.id, initial.workspace.revision);
    }
    return this.store.transaction((database) => {
      const replayInside = checkIdempotency(database, scope, input.idempotencyKey, hash);
      if (replayInside) return { response: structuredClone(replayInside.body as unknown as IntelligenceResponse), replayed: true };
      const currentState = database.workspace.intelligence || createIntelligenceState();
      if (currentState.revision !== input.expectedRevision || networkFingerprint(decisionNetwork(database.workspace)) !== networkFingerprint(initialNetwork)) throw new PlatformError(412, 'intelligence_revision_conflict', 'The planning network or decision state changed during analysis. Rerun analysis from the latest state.');
      database.workspace.intelligence = structuredClone(state);
      const autoApplied = outcomes.some((outcome) => outcome.autoApplied && !outcome.duplicate);
      if (autoApplied) {
        database.workspace.locations = structuredClone(network.locations);
        database.workspace.lanes = structuredClone(network.lanes);
        database.workspace.revision += 1;
      }
      for (const run of stagedRuns) {
        if (database.runs[run.id]) throw new PlatformError(409, 'decision_run_conflict', 'A staged decision run identity already exists. Retry analysis.');
        database.runs[run.id] = structuredClone(run);
        auditEvent(database, { workspaceId: database.workspace.id, correlationId: input.correlationId, action: 'run.succeeded', aggregateType: 'run', aggregateId: run.id, detail: { inputHash: run.inputHash, outputChecksum: run.outputChecksum || '', decisionAnalysis: true } });
      }
      database.workspace.updatedAt = new Date().toISOString();
      for (const outcome of outcomes.filter((item) => !item.duplicate)) auditEvent(database, { workspaceId: database.workspace.id, correlationId: input.correlationId, action: outcome.autoApplied ? 'decision.auto-applied' : 'decision.awaiting-human', aggregateType: 'intelligence', aggregateId: outcome.decision.id, revision: state.revision, detail: { sourceRunId: outcome.decision.evidence.runId, authority: outcome.decision.authority, risk: outcome.decision.risk } });
      const response: IntelligenceResponse = { state: structuredClone(state), workspaceRevision: database.workspace.revision };
      storeIdempotency(database, scope, input.idempotencyKey, hash, { status: 200, body: json(response) });
      return { response, replayed: false };
    });
  }

  async resolveDecision(input: { decisionId: string; resolution: DecisionResolution; reason: string; expectedRevision: number; idempotencyKey: string; correlationId: string }): Promise<{ response: IntelligenceResponse; replayed: boolean }> {
    if (!input.reason.trim() || input.reason.trim().length > 2_000) throw new PlatformError(422, 'invalid_decision_reason', 'A decision reason of 1 to 2,000 characters is required.');
    const scope = `POST:/api/v1/intelligence/decisions/${input.decisionId}/resolve`;
    const hash = requestHash({ decisionId: input.decisionId, resolution: input.resolution, reason: input.reason.trim(), expectedRevision: input.expectedRevision });
    return this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, input.idempotencyKey, hash);
      if (replay) return { response: structuredClone(replay.body as unknown as IntelligenceResponse), replayed: true };
      const state = database.workspace.intelligence || createIntelligenceState();
      if (state.revision !== input.expectedRevision) throw new PlatformError(412, 'intelligence_revision_conflict', `Intelligence revision ${input.expectedRevision} is stale; current revision is ${state.revision}.`);
      let outcome;
      try { outcome = resolveDomainDecision({ state, network: decisionNetwork(database.workspace), decisionId: input.decisionId, resolution: input.resolution, reason: input.reason.trim(), expectedRevision: input.expectedRevision }); }
      catch (error) { throw decisionError(error); }
      database.workspace.intelligence = structuredClone(outcome.state);
      const changedNetwork = networkFingerprint(decisionNetwork(database.workspace)) !== networkFingerprint({ locations: outcome.locations, lanes: outcome.lanes, defaults: outcome.defaults });
      if (changedNetwork) {
        database.workspace.locations = structuredClone(outcome.locations);
        database.workspace.lanes = structuredClone(outcome.lanes);
        database.workspace.revision += 1;
      }
      database.workspace.updatedAt = new Date().toISOString();
      if (!outcome.idempotent) auditEvent(database, { workspaceId: database.workspace.id, correlationId: input.correlationId, action: `decision.${outcome.decision.status}`, aggregateType: 'intelligence', aggregateId: outcome.decision.id, revision: outcome.state.revision, detail: { resolution: input.resolution, networkChanged: changedNetwork } });
      const response: IntelligenceResponse = { state: structuredClone(outcome.state), workspaceRevision: database.workspace.revision };
      storeIdempotency(database, scope, input.idempotencyKey, hash, { status: 200, body: json(response) });
      return { response, replayed: false };
    });
  }

  async askCopilot(input: { request: CopilotRequest; idempotencyKey: string; correlationId: string; signal?: AbortSignal }): Promise<{ response: CopilotResponse; replayed: boolean }> {
    const request = validateCopilotRequest(input.request);
    const scope = 'POST:/api/v1/copilot/responses';
    const hash = requestHash(request);
    const existing = checkIdempotency(await this.store.read(), scope, input.idempotencyKey, hash);
    if (existing) return { response: structuredClone(existing.body as unknown as CopilotResponse), replayed: true };
    const inflightKey = idempotencyIndex(scope, input.idempotencyKey);
    const inflight = this.copilotInflight.get(inflightKey);
    if (inflight) {
      if (inflight.hash !== hash) throw new PlatformError(409, 'idempotency_key_reused', 'The idempotency key was already used for a different request.');
      return inflight.promise;
    }
    if ((request.mode || 'ai') === 'ai' && !this.copilot.status().configured) throw new PlatformError(503, 'copilot_not_configured', this.copilot.status().detail, false);
    const promise = this.performCopilotRequest(request, input.idempotencyKey, input.correlationId, hash, input.signal);
    this.copilotInflight.set(inflightKey, { hash, promise });
    try { return await promise; }
    finally { this.copilotInflight.delete(inflightKey); }
  }

  private async performCopilotRequest(request: CopilotRequest, idempotencyKeyValue: string, correlationId: string, hash: string, signal?: AbortSignal): Promise<{ response: CopilotResponse; replayed: boolean }> {
    const snapshot = await this.intelligence();
    if (snapshot.state.revision !== request.expectedRevision) throw new PlatformError(412, 'intelligence_revision_conflict', `Intelligence revision ${request.expectedRevision} is stale; current revision is ${snapshot.state.revision}.`);
    const conversation = request.conversationId
      ? snapshot.state.conversations.find((item) => item.id === request.conversationId)
      : undefined;
    if (request.conversationId && !conversation) throw new PlatformError(404, 'conversation_not_found', 'The requested copilot conversation does not exist.');
    if ((conversation?.messages.length || 0) >= 200) throw new PlatformError(422, 'conversation_full', 'This conversation has reached 100 exchanges. Start a new conversation to continue.');
    const now = new Date().toISOString();
    const mode = request.mode || 'ai';
    const userMessage: CopilotMessage = { id: randomUUID(), role: 'user', content: request.message, createdAt: now, mode, tools: [] };
    const messages = [...(conversation?.messages || []), userMessage];
    let permittedRevision = snapshot.state.revision;
    const gateway = this.copilotGateway(request.activeRunId, correlationId, () => permittedRevision, (value) => { permittedRevision = value; });
    let providerReply: CopilotProviderReply;
    try { providerReply = mode === 'ai' ? await this.copilot.respond({ messages, gateway, signal }) : await this.modelToolsReply(request.message, request.activeRunId, gateway); }
    catch (error) {
      if (signal?.aborted) throw new PlatformError(499, 'copilot_cancelled', 'The copilot request was cancelled.', true);
      const currentWorkspaceRevision = (await this.workspace()).revision;
      if (permittedRevision !== snapshot.state.revision || currentWorkspaceRevision !== snapshot.workspaceRevision) {
        throw new PlatformError(502, 'copilot_provider_failed_after_changes', `The AI provider failed after a tool saved model changes. Reload the workspace before retrying. ${error instanceof Error ? error.message : ''}`.trim(), true);
      }
      throw new PlatformError(502, 'copilot_provider_failed', `${error instanceof Error ? error.message : 'The AI provider failed.'} No final copilot response was saved. Tool actions may already be recorded; review current decisions and saved runs before retrying.`, true);
    }
    const assistantMessage: CopilotMessage = { id: randomUUID(), role: 'assistant', content: providerReply.content, createdAt: new Date().toISOString(), mode, tools: providerReply.tools };
    const conversationId = conversation?.id || randomUUID();
    const scope = 'POST:/api/v1/copilot/responses';
    return this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, idempotencyKeyValue, hash);
      if (replay) return { response: structuredClone(replay.body as unknown as CopilotResponse), replayed: true };
      const state = database.workspace.intelligence || createIntelligenceState();
      if (state.revision !== permittedRevision) throw new PlatformError(412, 'intelligence_revision_conflict', 'Decision intelligence changed while the copilot was responding. Retry from the latest state.');
      const currentConversation = conversation ? state.conversations.find((item) => item.id === conversationId) : undefined;
      if (conversation && (!currentConversation || currentConversation.messages.length !== conversation.messages.length)) throw new PlatformError(412, 'conversation_revision_conflict', 'The conversation changed while the copilot was responding.');
      const saved: CopilotConversation = currentConversation
        ? { ...structuredClone(currentConversation), updatedAt: assistantMessage.createdAt, messages: [...currentConversation.messages, userMessage, assistantMessage] }
        : { id: conversationId, title: request.message.trim().slice(0, 80), createdAt: now, updatedAt: assistantMessage.createdAt, messages: [userMessage, assistantMessage] };
      const next: IntelligenceState = { ...structuredClone(state), revision: state.revision + 1, conversations: [saved, ...state.conversations.filter((item) => item.id !== conversationId)] };
      validateIntelligenceState(next);
      database.workspace.intelligence = next;
      database.workspace.updatedAt = assistantMessage.createdAt;
      auditEvent(database, { workspaceId: database.workspace.id, correlationId, action: 'copilot.response.saved', aggregateType: 'intelligence', aggregateId: conversationId, revision: next.revision, detail: { toolCount: providerReply.tools.length, activeRunId: request.activeRunId || '' } });
      const response: CopilotResponse = { state: structuredClone(next), workspaceRevision: database.workspace.revision, conversationId };
      storeIdempotency(database, scope, idempotencyKeyValue, hash, { status: 200, body: json(response) });
      return { response, replayed: false };
    });
  }

  private async modelToolsReply(message: string, activeRunId: string | undefined, gateway: CopilotToolGateway): Promise<CopilotProviderReply> {
    const normalized = message.toLowerCase();
    if (/(analy[sz]e.*(model|network|decision)|create decisions|decision queue)/.test(normalized)) {
      const result = await gateway.execute('analyze_decisions', {});
      const output = result.output as { decisions?: Array<{ id: string; title: string; status: string; authority: string; policyReasons: string[] }> };
      const decisions = output.decisions || [];
      return { content: decisions.length ? `Decision analysis is complete. ${decisions.slice(0, 3).map((item) => `${item.title}: ${item.status}, routed to ${item.authority}. ${item.policyReasons[0] || ''}`).join(' ')}` : 'Decision analysis found no eligible changes for the current planning network.', tools: [result.run] };
    }
    const decisionId = message.match(/decision-[a-f0-9-]{8,}/i)?.[0];
    if (decisionId || /explain.*decision|why.*decision/.test(normalized)) {
      const result = await gateway.execute('get_decision', { decision_id: decisionId || '' });
      const decision = result.output as { id: string; title: string; status: string; authority: string; before: { serviceLevel: number; stockoutUnits: number; totalLandedCost: number }; after: { serviceLevel: number; stockoutUnits: number; totalLandedCost: number }; policyReasons: string[] };
      return { content: `${decision.title} is ${decision.status} and routed to ${decision.authority} authority. Modeled service changes from ${decision.before.serviceLevel.toFixed(1)}% to ${decision.after.serviceLevel.toFixed(1)}%; stockout units from ${decision.before.stockoutUnits.toLocaleString()} to ${decision.after.stockoutUnits.toLocaleString()}; total landed cost from $${decision.before.totalLandedCost.toLocaleString()} to $${decision.after.totalLandedCost.toLocaleString()}. ${decision.policyReasons.join(' ')}`, tools: [result.run] };
    }
    if (/(compare|last two|previous two)/.test(normalized)) {
      const saved = await gateway.execute('list_saved_scenarios', { limit: 2 });
      const scenarios = (saved.output as { scenarios: Array<{ runId: string }> }).scenarios;
      if (scenarios.length < 2) return { content: 'Save at least two scenarios before asking for a comparison. Each comparison uses immutable saved-run metrics.', tools: [saved.run] };
      const result = await gateway.execute('compare_runs', { baseline_run_id: scenarios[1].runId, candidate_run_id: scenarios[0].runId });
      const value = result.output as { baselineRunId: string; candidateRunId: string; delta: { serviceLevelPp: number; stockoutUnits: number; totalLandedCost: number } };
      return { content: `Saved run ${value.candidateRunId} versus ${value.baselineRunId}: service ${signed(value.delta.serviceLevelPp)} percentage points, stockouts ${signed(value.delta.stockoutUnits)} units, and total modeled cost ${signedCurrency(value.delta.totalLandedCost)}. Different horizons, dates or frozen assumptions can limit direct comparison; inspect both runs before using the deltas.`, tools: [saved.run, result.run] };
    }
    if (/(test|simulate|what if|run a|run.*scenario)/.test(normalized)) {
      const workspace = await this.workspace();
      const activeView = activeRunId ? await this.serviceRunView(activeRunId) : undefined;
      const modeledLocations = activeView?.input.locations || workspace.locations;
      const magnitude = Number(normalized.match(/(\d+(?:\.\d+)?)\s*%/)?.[1] || 20);
      if (!Number.isFinite(magnitude) || magnitude < 1 || magnitude > 100) throw new Error('Choose a scenario magnitude from 1% to 100%.');
      const type = inferScenarioType(normalized);
      if (!type) return { content: 'Model tools can test a demand surge, supplier failure, DC outage, severe weather, price change, or capacity change. Name the change and location, or use the scenario editor for detailed changes.', tools: [] };
      const eligible = modeledLocations.filter((item) => type === 'demand-surge' ? item.type === 'restaurant' : type === 'supplier-failure' ? item.type === 'supplier' : type === 'dc-outage' || type === 'capacity-constraint' ? item.type === 'dc' : true);
      const target = eligible.find((item) => normalized.includes(item.name.toLowerCase()) || normalized.includes(item.city.toLowerCase())) || [...eligible].sort((left, right) => left.id.localeCompare(right.id))[0];
      if (!target) throw new Error('There is no compatible modeled location for that scenario.');
      const increaseCapacity = type === 'capacity-constraint' && /increas|expand|add|more/.test(normalized);
      const label = increaseCapacity ? 'capacity increase' : type.replace(/-/g, ' ');
      const result = await gateway.execute('run_scenario', { name: `Copilot · ${label} · ${target.city}`, description: message, scenario_type: type, capacity_direction: type === 'capacity-constraint' ? (increaseCapacity ? 'increase' : 'decrease') : null, target_id: target.id, magnitude: ['dc-outage', 'supplier-failure'].includes(type) ? 100 : magnitude, grain: 'daily', horizon: 14 });
      const output = result.output as { run: { id: string; status: string }; summary: RunSummaryV2 | null };
      if (output.run.status !== 'succeeded' || !output.summary) throw new Error(`Scenario run ${output.run.id} ended with status ${output.run.status}.`);
      return { content: `Saved run ${output.run.id}${activeRunId ? ` from frozen source run ${activeRunId}` : ' from the current planning workspace'}. Modeled service is ${output.summary.scenario.serviceLevel.toFixed(1)}%, unmet demand is ${output.summary.scenario.stockoutUnits.toLocaleString()} units, and total modeled cost is $${output.summary.scenario.totalLandedCost.toLocaleString()}.`, tools: [result.run] };
    }
    if (activeRunId) {
      const view = await this.serviceRunView(activeRunId);
      const answer = await answerSavedModelQuestion(message, { result: view, locations: view.input.locations, facilities: publicFacilityRegistry });
      return { content: answer.text, tools: [{ id: randomUUID(), name: answer.tool, label: 'Evidence and model query', status: 'completed', summary: answer.citations.map((item) => `${item.label}: ${item.detail}${item.url ? ` (${item.url})` : ''}`).join('\n') || answer.limitation, runId: activeRunId }] };
    }
    if (/(summar|network|location|lane)/.test(normalized) && !/(source|official|verified|public)/.test(normalized)) {
      const result = await gateway.execute('get_network_summary', {});
      const output = result.output as { workspaceRevision: number; locationCounts: Record<string, number>; laneCount: number };
      return { content: `Planning revision ${output.workspaceRevision} contains ${output.locationCounts.restaurant} restaurants, ${output.locationCounts.dc} distribution centers, ${output.locationCounts.supplier} suppliers, and ${output.laneCount} modeled lanes. Open or run a scenario for calculated service, stockout, cost, and capacity results.`, tools: [result.run] };
    }
    const workspace = await this.workspace();
    const answer = await answerSavedModelQuestion(message, { locations: workspace.locations, facilities: publicFacilityRegistry });
    return { content: answer.text, tools: [{ id: randomUUID(), name: answer.tool, label: 'Evidence and model query', status: 'completed', summary: answer.citations.map((item) => `${item.label}: ${item.detail}${item.url ? ` (${item.url})` : ''}`).join('\n') || answer.limitation }] };
  }

  private async serviceRunView(id: string) {
    const run = await this.requirePublishedRun(id);
    const repository = await this.repository(run);
    const reader: RunResultReader = {
      summary: run.resultSummary!, locator: { kind: 'service', runId: run.id, workspaceId: run.workspaceId },
      input: () => repository.input(), scope: (query) => repository.scope(query), metrics: (query) => repository.metrics(query),
      impacts: (cursor) => repository.impacts(cursor), recommendations: (cursor) => repository.recommendations(cursor),
      warnings: (cursor) => repository.warnings(cursor), constraints: (cursor) => repository.constraints(cursor),
    };
    return openRunView(reader);
  }

  private copilotGateway(activeRunId: string | undefined, correlationId: string, revision: () => number, setRevision: (value: number) => void): CopilotToolGateway {
    const completed = (name: string, label: string, summary: string, extra: { runId?: string; decisionId?: string } = {}) => ({ id: randomUUID(), name, label, status: 'completed' as const, summary, ...extra });
    return {
      execute: async (name, rawArguments) => {
        const args = toolArguments(rawArguments);
        if (name === 'get_network_summary') {
          const workspace = await this.workspace();
          const network = decisionNetwork(workspace);
          return { output: { workspaceRevision: workspace.revision, networkHash: networkFingerprint(network), locationCounts: locationCounts(workspace.locations), laneCount: workspace.lanes.length }, run: completed(name, 'Read network summary', `Read revision ${workspace.revision} with ${workspace.locations.length} modeled locations.`) };
        }
        if (name === 'list_locations') {
          const workspace = await this.workspace();
          const source = activeRunId ? await this.runInput(activeRunId) : undefined;
          const scopedLocations = frozenRunLocations(source) || workspace.locations;
          const query = typeof args.query === 'string' ? args.query.trim().toLowerCase() : '';
          const locationType = typeof args.location_type === 'string' ? args.location_type : '';
          const limit = boundedToolLimit(args.limit, 25);
          const locations = scopedLocations.filter((location) => !locationType || location.type === locationType).filter((location) => !query || [location.id, location.name, location.city, location.state].some((value) => value.toLowerCase().includes(query))).slice(0, limit).map((location) => ({ id: location.id, name: location.name, type: location.type, city: location.city, state: location.state, status: location.status, evidenceClassification: location.evidence.classification }));
          return { output: { locations, returned: locations.length, context: activeRunId ? `frozen source run ${activeRunId}` : 'current planning workspace' }, run: completed(name, 'Find modeled locations', `Returned ${locations.length} bounded location records.`) };
        }
        if (name === 'get_public_facility_sources') {
          const query = requiredToolText(args, 'query').toLowerCase();
          const limit = boundedToolLimit(args.limit, 10);
          const facility = publicFacilityRegistry.facilities.find((item) => [item.id, item.name, item.city].some((value) => value.toLowerCase().includes(query) || query.includes(value.toLowerCase())));
          if (!facility) throw new Error('No publicly evidenced distribution facility matches that query.');
          const evidence = publicFacilityRegistry.evidence.filter((item) => facility.evidenceIds.includes(item.id)).slice(0, limit).map((item) => ({ title: item.title, sourceUrl: item.sourceUrl, verifiedAt: item.verifiedAt, supportedClaims: item.supportedClaims, supportSummary: item.supportSummary }));
          return { output: { facility: { id: facility.id, name: facility.name, city: facility.city, state: facility.state, address: facility.address, mapPrecision: facility.mapPrecision, lifecycleSummary: facility.lifecycleSummary, lastVerifiedAt: facility.lastVerifiedAt, numericalConfidence: null }, evidence, limitation: publicFacilityRegistry.limitations }, run: completed(name, 'Read public facility sources', `${facility.name} · ${facility.mapPrecision} · checked ${facility.lastVerifiedAt}. Numerical confidence is not supplied by this registry.\n${evidence.map((item) => `${item.title} — ${item.sourceUrl} · verified ${item.verifiedAt} · supported claims: ${item.supportedClaims.join(', ')}`).join('\n')}`) };
        }
        if (name === 'get_run_summary') {
          const runId = requiredToolText(args, 'run_id');
          const value = await this.getRun(runId);
          if (value.run.status !== 'succeeded' || !value.summary) throw new Error('The requested run has no completed result summary.');
          return { output: { runId, scenario: value.run.scenario, summary: value.summary }, run: completed(name, 'Read simulation result', `Read completed run ${runId}.`, { runId }) };
        }
        if (name === 'compare_runs') {
          const baselineId = requiredToolText(args, 'baseline_run_id');
          const candidateId = requiredToolText(args, 'candidate_run_id');
          const [baseline, candidate] = await Promise.all([this.getRun(baselineId), this.getRun(candidateId)]);
          if (!baseline.summary || !candidate.summary || baseline.run.status !== 'succeeded' || candidate.run.status !== 'succeeded') throw new Error('Both runs must be completed before comparison.');
          const before = baseline.summary.scenario, after = candidate.summary.scenario;
          const output = { baselineRunId: baselineId, candidateRunId: candidateId, baseline: before, candidate: after, baselineContext: { grain: baseline.run.scenario.grain, horizon: baseline.run.scenario.horizon, startDate: baseline.run.scenario.startDate }, candidateContext: { grain: candidate.run.scenario.grain, horizon: candidate.run.scenario.horizon, startDate: candidate.run.scenario.startDate }, limitation: 'Different dates, horizons or frozen assumptions limit direct comparison. Inspect both inputs before using deltas.', delta: { serviceLevelPp: after.serviceLevel - before.serviceLevel, stockoutUnits: after.stockoutUnits - before.stockoutUnits, totalLandedCost: after.totalLandedCost - before.totalLandedCost, affectedRestaurants: after.affectedRestaurants - before.affectedRestaurants, maxUtilization: after.maxUtilization - before.maxUtilization } };
          return { output, run: completed(name, 'Compare simulation results', `Compared completed runs ${baselineId} and ${candidateId}.`, { runId: candidateId }) };
        }
        if (name === 'list_saved_scenarios') {
          const workspace = await this.workspace();
          const limit = boundedToolLimit(args.limit, 25);
          const scenarios = [...workspace.scenarios]
            .sort((left, right) => scenarioSavedAt(right).localeCompare(scenarioSavedAt(left)) || right.id.localeCompare(left.id))
            .slice(0, limit)
            .map((scenario) => ({ id: scenario.id, name: scenario.name, type: scenario.type, grain: scenario.grain, horizon: scenario.horizon, startDate: scenario.startDate || null, savedAt: scenarioSavedAt(scenario), runId: savedScenarioRunId(scenario) }));
          return { output: { scenarios, returned: scenarios.length }, run: completed(name, 'Read saved scenarios', `Read ${scenarios.length} saved scenario references.`) };
        }
        if (name === 'query_run_metrics') {
          const runId = requiredToolText(args, 'run_id');
          const kind = args.kind === 'baseline' ? 'baseline' : args.kind === 'scenario' ? 'scenario' : undefined;
          if (!kind) throw new Error('kind must be baseline or scenario.');
          const page = await this.runMetrics(runId, { kind, stockoutsOnly: args.stockouts_only === true, ...(typeof args.location_id === 'string' ? { locationId: args.location_id } : {}), ...(typeof args.product === 'string' ? { product: args.product as never } : {}), limit: boundedToolLimit(args.limit, 50) });
          return { output: page, run: completed(name, 'Read saved model metrics', `Read ${page.items.length} of ${page.total} matching metric rows.`, { runId }) };
        }
        if (name === 'get_decisions') {
          const current = await this.intelligence();
          const limit = boundedToolLimit(args.limit, 25);
          const decisions = current.state.decisions.slice(0, limit);
          return { output: { intelligenceRevision: current.state.revision, decisions }, run: completed(name, 'Read decision queue', `Read ${decisions.length} of ${current.state.decisions.length} decisions.`, decisions[0] ? { decisionId: decisions[0].id } : {}) };
        }
        if (name === 'get_decision') {
          const current = await this.intelligence();
          const requested = typeof args.decision_id === 'string' ? args.decision_id : '';
          const decision = requested ? current.state.decisions.find((item) => item.id === requested) : current.state.decisions[0];
          if (!decision) throw new Error('The requested decision does not exist.');
          return { output: decision, run: completed(name, 'Read decision evidence', `Read decision ${decision.id}; status ${decision.status}.`, { decisionId: decision.id, runId: decision.evidence.candidateRunId || decision.evidence.runId }) };
        }
        if (name === 'run_scenario') {
          const workspace = await this.workspace();
          const sourceInput = activeRunId ? await this.runInput(activeRunId) : undefined;
          const sourceLocations = frozenRunLocations(sourceInput) || workspace.locations;
          const scenario = scenarioFromTool(args, sourceLocations, activeRunId ? `source-run-${activeRunId}` : networkFingerprint(decisionNetwork(workspace)));
          const created = await this.createRun({ scenario, expectedWorkspaceRevision: workspace.revision, idempotencyKey: `copilot-run:${randomUUID()}`, correlationId, ...(activeRunId ? { sourceRunId: activeRunId } : {}) });
          const run = await this.waitForCompletedRun(created.run.id, 30_000);
          if (run.status !== 'succeeded') throw new Error(`Scenario run ${run.id} ended with status ${run.status}.`);
          const value = await this.getRun(run.id);
          const saved = await this.saveScenario({ runId: run.id, expectedWorkspaceRevision: workspace.revision, idempotencyKey: `copilot-save:${run.id}`, correlationId });
          return { output: { run: { id: run.id, status: run.status, scenario: run.scenario, sourceRunId: run.sourceRunId || null }, savedScenario: saved.scenario, summary: value.summary || null }, run: completed(name, 'Calculate and save deterministic scenario', `Scenario run ${run.id} succeeded and its immutable reference was saved${activeRunId ? ` from source run ${activeRunId}` : ''}.`, { runId: run.id }) };
        }
        if (name === 'analyze_decisions') {
          const outcome = await this.analyzeDecisions({ expectedRevision: revision(), idempotencyKey: `copilot-analysis:${randomUUID()}`, correlationId });
          setRevision(outcome.response.state.revision);
          const newest = outcome.response.state.decisions[0];
          return { output: { intelligenceRevision: outcome.response.state.revision, decisions: outcome.response.state.decisions.slice(0, 4) }, run: completed(name, 'Analyze decision candidates', newest ? `Evaluated decision ${newest.id}; status ${newest.status}.` : 'No eligible decision candidates were found.', newest ? { decisionId: newest.id, runId: newest.evidence.runId } : {}) };
        }
        if (name === 'get_active_run') {
          if (!activeRunId) return { output: { run: null, summary: null, context: 'Current planning workspace; no frozen result is open.' }, run: completed(name, 'Read active context', 'No frozen result was supplied with this question.') };
          const value = await this.getRun(activeRunId);
          return { output: { run: value.run, summary: value.summary || null }, run: completed(name, 'Read active result', `Read active run ${activeRunId}.`, { runId: activeRunId }) };
        }
        throw new Error(`Tool ${name} is not available.`);
      },
    };
  }

  private async waitForCompletedRun(id: string, timeoutMs: number) {
    const started = Date.now();
    while (true) {
      const run = (await this.getRun(id)).run;
      if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') return run;
      if (Date.now() - started >= timeoutMs) throw new PlatformError(504, 'run_timeout', `Run ${id} did not complete within the tool timeout.`, true);
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }

  private async stagePublishedRun(runInput: RunInputV2, result: ScenarioResult, workspaceRevision: number, correlationId: string): Promise<RunRecord> {
    const inputArtifact = await this.store.writeArtifact('inputs', runInput);
    const publication = await persistRunResult(result, inputArtifact, (value) => this.store.writeArtifact('outputs', value));
    const now = new Date().toISOString();
    const run: RunRecord = {
      id: randomUUID(), workspaceId: (await this.workspace()).id, workspaceRevision,
      scenario: structuredClone(runInput.scenario), status: 'succeeded', attempt: 1, cancelRequested: false,
      inputHash: inputArtifact.checksum, inputArtifact: inputArtifact.relativePath, inputArtifactReference: inputArtifact,
      outputChecksum: result.outputChecksum, resultFormat: 'manifest-v2', resultManifestArtifact: publication.manifestArtifact,
      resultSummary: publication.manifest.summary, createdAt: now, startedAt: now, completedAt: result.completedAt || now,
      correlationId, events: [],
    };
    addRunEvent(run, 'succeeded', 'Decision analysis result verified and published as a bounded manifest.');
    return run;
  }

  private async migrateLegacyWorkspaceScenarios() {
    const legacy = (await this.store.read()).workspace.scenarios.filter((scenario) => !isScenarioReference(scenario) && scenario.result.input?.schemaVersion === 2);
    for (const scenario of legacy) {
      if (isScenarioReference(scenario) || !scenario.result.input || !scenario.result.outputChecksum) continue;
      try {
        const inputArtifact = await this.store.writeArtifact('inputs', scenario.result.input);
        if (inputArtifact.checksum !== scenario.result.inputHash) continue;
        const publication = await persistLegacyRunResult(scenario.result, inputArtifact, (value) => this.store.writeArtifact('outputs', value));
        await this.store.transaction((database) => {
          const current = database.workspace.scenarios.find((item) => item.id === scenario.id);
          if (!current || isScenarioReference(current) || canonicalize(current) !== canonicalize(scenario)) return;
          let run = Object.values(database.runs).find((item) => item.status === 'succeeded' && item.inputHash === scenario.result.inputHash && item.outputChecksum === scenario.result.outputChecksum);
          if (!run) {
            const runId = randomUUID();
            run = {
              id: runId,
              workspaceId: database.workspace.id,
              workspaceRevision: database.workspace.revision,
              scenario: scenarioDefinition(scenario),
              status: 'succeeded',
              attempt: 1,
              cancelRequested: false,
              inputHash: inputArtifact.checksum,
              inputArtifact: inputArtifact.relativePath,
              inputArtifactReference: inputArtifact,
              outputChecksum: publication.manifest.logicalOutputChecksum,
              resultFormat: 'manifest-v2',
              resultManifestArtifact: publication.manifestArtifact,
              resultSummary: publication.manifest.summary,
              createdAt: scenario.createdAt,
              completedAt: scenario.result.completedAt,
              correlationId: randomUUID(),
              events: [],
            };
            addRunEvent(run, 'succeeded', 'Legacy saved scenario migrated to a verified immutable run manifest.');
            database.runs[runId] = run;
          }
          const reference: SavedScenarioReferenceV2 = { ...scenarioDefinition(scenario), schemaVersion: 2, savedAt: scenario.result.completedAt, latestRun: structuredClone(run.resultSummary!), resultRef: { kind: 'service', runId: run.id, workspaceId: run.workspaceId } };
          database.workspace.scenarios = database.workspace.scenarios.map((item) => item.id === scenario.id ? reference : item);
          auditEvent(database, { workspaceId: database.workspace.id, correlationId: run.correlationId, action: 'scenario.result.migrated', aggregateType: 'workspace', aggregateId: scenario.id, revision: database.workspace.revision, detail: { runId: run.id, manifestChecksum: publication.manifest.manifestChecksum } });
        });
      } catch {
        // The original embedded result remains untouched and recoverable. A later
        // startup can retry after storage/checksum failures are resolved.
      }
    }
  }

  async replaceWorkspace(input: {
    expectedRevision: number;
    idempotencyKey: string;
    correlationId: string;
    replacement: WorkspaceReplacement;
  }): Promise<{ workspace: WorkspaceState; replayed: boolean }> {
    const scope = 'PUT:/api/v1/workspace';
    const hash = requestHash({ expectedRevision: input.expectedRevision, replacement: input.replacement });
    return this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, input.idempotencyKey, hash);
      if (replay) return { workspace: (replay.body as unknown as { workspace: WorkspaceState }).workspace, replayed: true };
      if (database.workspace.revision !== input.expectedRevision) throw new PlatformError(412, 'revision_conflict', `Workspace revision ${input.expectedRevision} is stale; current revision is ${database.workspace.revision}.`);
      for (const scenario of input.replacement.scenarios || []) {
        if (!isScenarioReference(scenario)) continue;
        const trusted = database.workspace.scenarios.find((item) => item.id === scenario.id);
        if (!trusted || !isScenarioReference(trusted) || canonicalize(trusted) !== canonicalize(scenario)) {
          throw new PlatformError(422, 'untrusted_scenario_reference', 'Connected scenario references must be created from a completed owned run through POST /api/v1/scenarios.');
        }
      }
      const beforeRevision = database.workspace.revision;
      database.workspace = {
        ...database.workspace,
        revision: beforeRevision + 1,
        updatedAt: new Date().toISOString(),
        defaults: structuredClone(input.replacement.defaults),
        locations: structuredClone(input.replacement.locations),
        lanes: structuredClone(input.replacement.lanes),
        scenarios: structuredClone(input.replacement.scenarios || database.workspace.scenarios),
        evidenceLedger: structuredClone(input.replacement.evidenceLedger || database.workspace.evidenceLedger),
      };
      auditEvent(database, {
        workspaceId: database.workspace.id,
        correlationId: input.correlationId,
        action: 'workspace.replaced',
        aggregateType: 'workspace',
        aggregateId: database.workspace.id,
        revision: database.workspace.revision,
        detail: {
          previousRevision: beforeRevision,
          locationCount: database.workspace.locations.length,
          laneCount: database.workspace.lanes.length,
          scenarioCount: database.workspace.scenarios.length,
          evidenceRecordCount: database.workspace.evidenceLedger.values.length,
        },
      });
      const response: StoredHttpResponse = { status: 200, headers: { etag: `"${database.workspace.revision}"` }, body: json({ workspace: database.workspace }) };
      storeIdempotency(database, scope, input.idempotencyKey, hash, response);
      return { workspace: structuredClone(database.workspace), replayed: false };
    });
  }

  async createRun(input: {
    scenario: ScenarioDefinition;
    expectedWorkspaceRevision: number;
    idempotencyKey: string;
    correlationId: string;
    sourceRunId?: string;
  }): Promise<{ run: RunRecord; replayed: boolean }> {
    const scope = 'POST:/api/v1/runs';
    const hash = requestHash({ scenario: input.scenario, expectedWorkspaceRevision: input.expectedWorkspaceRevision, sourceRunId: input.sourceRunId || null });
    const snapshot = await this.workspace();
    if (snapshot.revision !== input.expectedWorkspaceRevision) throw new PlatformError(412, 'revision_conflict', `Workspace revision ${input.expectedWorkspaceRevision} is stale; current revision is ${snapshot.revision}.`);
    const platformInput: FrozenPlatformRunInput = {
      schemaVersion: 1,
      workspaceId: snapshot.id,
      workspaceRevision: snapshot.revision,
      defaults: structuredClone(snapshot.defaults),
      locations: structuredClone(snapshot.locations),
      lanes: structuredClone(snapshot.lanes),
      evidenceLedger: structuredClone(snapshot.evidenceLedger),
      scenario: structuredClone(input.scenario),
    };
    let sourceInput: unknown;
    if (input.sourceRunId) {
      const sourceRun = (await this.store.read()).runs[input.sourceRunId];
      if (!sourceRun || sourceRun.workspaceId !== snapshot.id) throw new PlatformError(404, 'source_run_not_found', 'The source run does not exist in this workspace.');
      if (sourceRun.status !== 'succeeded') throw new PlatformError(409, 'source_run_not_replayable', 'Only a successful source run can be used as a frozen baseline.');
      sourceInput = await this.store.readArtifact(sourceRun.inputArtifact);
    }
    const validationLocations = sourceInput && typeof sourceInput === 'object' && Array.isArray((sourceInput as { locations?: unknown }).locations)
      ? (sourceInput as { locations: FrozenPlatformRunInput['locations'] }).locations
      : snapshot.locations;
    validateScenario(input.scenario, validationLocations);
    let frozenInput: unknown;
    try {
      frozenInput = await this.engine.freeze(platformInput, sourceInput);
    } catch (error) {
      throw new PlatformError(422, 'model_input_invalid', error instanceof Error ? error.message : 'The model input could not be frozen.');
    }
    const inputArtifact = await this.store.writeArtifact('inputs', frozenInput);
    const created = await this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, input.idempotencyKey, hash);
      if (replay) {
        const runId = (replay.body as { runId: string }).runId;
        return { run: structuredClone(database.runs[runId]), replayed: true };
      }
      if (database.workspace.revision !== input.expectedWorkspaceRevision) throw new PlatformError(412, 'revision_conflict', `Workspace changed while the run was being frozen; current revision is ${database.workspace.revision}.`);
      const runId = randomUUID();
      const run: RunRecord = {
        id: runId,
        workspaceId: snapshot.id,
        workspaceRevision: snapshot.revision,
        scenario: structuredClone(input.scenario),
        ...(input.sourceRunId ? { sourceRunId: input.sourceRunId } : {}),
        status: 'queued',
        attempt: 0,
        cancelRequested: false,
        inputHash: inputArtifact.checksum,
        inputArtifact: inputArtifact.relativePath,
        inputArtifactReference: inputArtifact,
        createdAt: new Date().toISOString(),
        correlationId: input.correlationId,
        events: [],
      };
      addRunEvent(run, 'queued', 'Run accepted and immutable input stored.');
      database.runs[runId] = run;
      auditEvent(database, {
        workspaceId: snapshot.id,
        correlationId: input.correlationId,
        action: 'run.queued',
        aggregateType: 'run',
        aggregateId: runId,
        detail: { inputHash: inputArtifact.checksum, workspaceRevision: snapshot.revision },
      });
      storeIdempotency(database, scope, input.idempotencyKey, hash, { status: 202, body: json({ runId, status: 'queued', workspaceRevision: snapshot.revision, inputHash: inputArtifact.checksum }) });
      return { run: structuredClone(run), replayed: false };
    });
    this.scheduleProcessing();
    return created;
  }

  async getRun(id: string, includeOutput = false) {
    let run = (await this.store.read()).runs[id];
    if (!run) throw new PlatformError(404, 'run_not_found', 'The requested run does not exist.');
    let output: ScenarioResult | undefined;
    if (includeOutput) {
      if (run.resultManifestArtifact) {
        const manifest = await this.store.readArtifact<RunResultManifestV2>(run.resultManifestArtifact.relativePath);
        // Reject from immutable metadata before any trace chunk is read. The
        // compatibility endpoint is deliberately unavailable when the input,
        // chunks, manifest, and summary already exceed its response ceiling.
        const declaredBytes = manifest.inputArtifact.byteLength
          + manifest.chunkByteLength
          + run.resultManifestArtifact.byteLength
          + Buffer.byteLength(canonicalizeArtifact(manifest.summary));
        if (declaredBytes > LEGACY_FULL_RESULT_LIMIT_BYTES) {
          throw new PlatformError(413, 'full_result_too_large', 'The complete result exceeds the compatibility response limit. Use summary and paginated result endpoints.');
        }
        output = await createRunArtifactRepository(manifest, <T>(reference: RunArtifactReference) => this.store.readArtifact<T>(reference.relativePath)).materialize();
      }
      else if (run.outputArtifact) output = await this.store.readArtifact<ScenarioResult>(run.outputArtifact);
    }
    if (output && Buffer.byteLength(JSON.stringify(output)) > LEGACY_FULL_RESULT_LIMIT_BYTES) throw new PlatformError(413, 'full_result_too_large', 'The complete result exceeds the compatibility response limit. Use summary and paginated result endpoints.');
    return { run, summary: run.resultSummary, output };
  }

  async runInput(id: string) { return (await this.repository(await this.requirePublishedRun(id))).input(); }
  async runMetrics(id: string, query: RunMetricQuery) {
    const { cursor, ...scope } = query, bind = requestHash({ id, type: 'metrics', scope });
    const page = await this.repositoryQuery(() => this.repositoryForId(id).then((repository) => repository.metrics({ ...scope, cursor: this.artifactCursor(cursor, 'run-metrics', bind) })));
    return this.protectArtifactPage(page, 'run-metrics', bind);
  }
  async runScope(id: string, query: RunScopeQuery) {
    const { cursor, ...scope } = query, bind = requestHash({ id, type: 'scope', scope });
    const value = await this.repositoryQuery(() => this.repositoryForId(id).then((repository) => repository.scope({ ...scope, cursor: this.artifactCursor(cursor, 'run-scope', bind) })));
    return { ...value, restaurants: this.protectArtifactPage(value.restaurants, 'run-scope', bind) };
  }
  async runImpacts(id: string, cursor?: string, limit?: number) { return this.runArtifactPage(id, 'impacts', cursor, limit); }
  async runRecommendations(id: string, cursor?: string, limit?: number) { return this.runArtifactPage(id, 'recommendations', cursor, limit); }
  async runWarnings(id: string, cursor?: string, limit?: number) { return this.runArtifactPage(id, 'warnings', cursor, limit); }
  async runConstraints(id: string, cursor?: string, limit?: number) { return this.runArtifactPage(id, 'constraints', cursor, limit); }

  async listRuns(input: { cursor?: string; limit?: number; scenarioId?: string; status?: RunRecord['status'] } = {}): Promise<RunPage<RunRecord>> {
    const database = await this.store.read();
    const bind = requestHash({ scenarioId: input.scenarioId || null, status: input.status || null });
    const records = Object.values(database.runs)
      .filter((run) => !input.scenarioId || run.scenario.id === input.scenarioId)
      .filter((run) => !input.status || run.status === input.status)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
    return this.paginate(records, input.cursor, boundedLimit(input.limit, 50, 100), 'runs', bind, (run) => run.id);
  }

  async findRunByInputHash(inputHash: string) {
    if (!/^[a-f0-9]{64}$/.test(inputHash)) throw new PlatformError(422, 'invalid_input_hash', 'Input hash must be a lowercase SHA-256 digest.');
    const match = Object.values((await this.store.read()).runs)
      .filter((run) => run.inputHash === inputHash && run.status === 'succeeded')
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id))[0];
    if (!match) throw new PlatformError(404, 'run_not_found', 'No run in this workspace has that frozen input hash.');
    return this.getRun(match.id);
  }

  async listScenarios(input: { cursor?: string; limit?: number } = {}): Promise<RunPage<StoredScenario>> {
    const scenarios = [...(await this.workspace()).scenarios].sort((a, b) => scenarioSavedAt(b).localeCompare(scenarioSavedAt(a)) || b.id.localeCompare(a.id));
    return this.paginate(scenarios, input.cursor, boundedLimit(input.limit, 50, 100), 'scenarios', 'all', (scenario) => scenario.id);
  }

  async getScenario(id: string) {
    const scenario = (await this.workspace()).scenarios.find((item) => item.id === id);
    if (!scenario) throw new PlatformError(404, 'scenario_not_found', 'The requested saved scenario does not exist.');
    return scenario;
  }

  async listScenarioRuns(id: string, input: { cursor?: string; limit?: number } = {}) {
    await this.getScenario(id);
    return this.listRuns({ ...input, scenarioId: id });
  }

  async saveScenario(input: { runId: string; expectedWorkspaceRevision: number; idempotencyKey: string; correlationId: string }): Promise<{ scenario: SavedScenarioReferenceV2; workspaceRevision: number; replayed: boolean }> {
    await this.requirePublishedRun(input.runId);
    const scope = 'POST:/api/v1/scenarios';
    const hash = requestHash({ runId: input.runId, expectedWorkspaceRevision: input.expectedWorkspaceRevision });
    return this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, input.idempotencyKey, hash);
      if (replay) {
        const body = replay.body as unknown as { scenario: SavedScenarioReferenceV2; workspaceRevision: number };
        return { scenario: structuredClone(body.scenario), workspaceRevision: body.workspaceRevision, replayed: true };
      }
      if (database.workspace.revision !== input.expectedWorkspaceRevision) throw new PlatformError(412, 'revision_conflict', `Workspace revision ${input.expectedWorkspaceRevision} is stale; current revision is ${database.workspace.revision}.`);
      const run = database.runs[input.runId];
      if (!run || run.workspaceId !== database.workspace.id) throw new PlatformError(404, 'run_not_found', 'The completed run does not exist in this workspace.');
      if (run.status !== 'succeeded' || !run.resultSummary || !run.resultManifestArtifact) throw new PlatformError(409, 'run_not_publishable', 'Only a successful run with a verified result manifest can be saved.');
      const scenario: SavedScenarioReferenceV2 = {
        ...structuredClone(run.scenario),
        schemaVersion: 2,
        savedAt: new Date().toISOString(),
        latestRun: structuredClone(run.resultSummary),
        resultRef: { kind: 'service', runId: run.id, workspaceId: run.workspaceId },
      };
      database.workspace.scenarios = [scenario, ...database.workspace.scenarios.filter((item) => item.id !== scenario.id)];
      database.workspace.revision += 1;
      database.workspace.updatedAt = new Date().toISOString();
      auditEvent(database, {
        workspaceId: database.workspace.id,
        correlationId: input.correlationId,
        action: 'scenario.saved',
        aggregateType: 'workspace',
        aggregateId: scenario.id,
        revision: database.workspace.revision,
        detail: { runId: run.id, inputHash: run.inputHash, outputChecksum: run.outputChecksum || '' },
      });
      const responseBody = { scenario, workspaceRevision: database.workspace.revision };
      storeIdempotency(database, scope, input.idempotencyKey, hash, { status: 200, headers: { etag: `"${database.workspace.revision}"` }, body: json(responseBody) });
      return { ...structuredClone(responseBody), replayed: false };
    });
  }

  async runEvents(id: string, after: number) {
    const { run } = await this.getRun(id);
    return run.events.filter((event) => event.seq > after);
  }

  private async runArtifactPage(id: string, kind: 'impacts' | 'recommendations' | 'warnings' | 'constraints', cursor?: string, limit?: number) {
    const bind = requestHash({ id, type: kind, limit: limit || 50 });
    const internal = this.artifactCursor(cursor, `run-${kind}`, bind);
    const repository = await this.repositoryForId(id);
    let page: RunPage<unknown>;
    if (kind === 'impacts') page = await this.repositoryQuery(() => repository.impacts(internal, limit));
    else if (kind === 'recommendations') page = await this.repositoryQuery(() => repository.recommendations(internal, limit));
    else if (kind === 'warnings') page = await this.repositoryQuery(() => repository.warnings(internal, limit));
    else page = await this.repositoryQuery(() => repository.constraints(internal, limit));
    return this.protectArtifactPage(page, `run-${kind}`, bind);
  }

  private artifactCursor(cursor: string | undefined, kind: string, bind: string) {
    if (!cursor) return undefined;
    const value = this.decodeCursor(cursor);
    if (value.kind !== kind || value.bind !== bind) throw new PlatformError(400, 'invalid_cursor', 'The cursor does not match this result scope.');
    return value.lastId;
  }

  private protectArtifactPage<T extends { nextCursor?: string }>(page: T, kind: string, bind: string): T {
    return { ...page, ...(page.nextCursor ? { nextCursor: this.encodeCursor({ kind, bind, lastId: page.nextCursor }) } : {}) };
  }

  private async repositoryForId(id: string) { return this.repository(await this.requirePublishedRun(id)); }

  private async requirePublishedRun(id: string) {
    let run = (await this.store.read()).runs[id];
    if (!run) throw new PlatformError(404, 'run_not_found', 'The requested run does not exist.');
    if (run.status !== 'succeeded') throw new PlatformError(409, 'run_not_published', 'The run has not published a successful result.');
    if (!run.resultManifestArtifact || !run.resultSummary) run = await this.ensureManifest(run);
    if (!run.resultManifestArtifact || !run.resultSummary) throw new PlatformError(409, 'run_not_published', 'The run has no verified result manifest.');
    return run;
  }

  private async repository(run: RunRecord) {
    if (!run.resultManifestArtifact) throw new PlatformError(409, 'run_not_published', 'The run has no verified result manifest.');
    const manifest = await this.store.readArtifact<RunResultManifestV2>(run.resultManifestArtifact.relativePath);
    return createRunArtifactRepository(manifest, <T>(reference: RunArtifactReference) => this.store.readArtifact<T>(reference.relativePath));
  }

  private async ensureManifest(run: RunRecord) {
    if (run.resultManifestArtifact && run.resultSummary) return structuredClone(run);
    if (run.status !== 'succeeded' || !run.outputArtifact) throw new PlatformError(409, 'legacy_result_not_migratable', 'The successful legacy run has no recoverable output artifact.');
    const [output, input] = await Promise.all([
      this.store.readArtifact<ScenarioResult>(run.outputArtifact),
      this.store.readArtifact<RunInputV2>(run.inputArtifact),
    ]);
    const inputArtifact = artifactReference(run.inputHash, run.inputArtifact, input);
    if (output.inputHash !== run.inputHash || output.outputChecksum !== run.outputChecksum) throw new PlatformError(409, 'legacy_result_checksum_mismatch', 'The legacy result failed checksum verification and was preserved without migration.');
    const publication = await persistLegacyRunResult(output, inputArtifact, (value) => this.store.writeArtifact('outputs', value));
    return this.store.transaction((database) => {
      const current = database.runs[run.id];
      if (!current || current.status !== 'succeeded' || current.outputArtifact !== run.outputArtifact || current.outputChecksum !== run.outputChecksum) {
        throw new PlatformError(409, 'legacy_result_changed', 'The legacy result changed during migration and was preserved for a later retry.');
      }
      if (!current.resultManifestArtifact || !current.resultSummary) {
        current.resultFormat = 'manifest-v2';
        current.resultManifestArtifact = structuredClone(publication.manifestArtifact);
        current.resultSummary = structuredClone(publication.manifest.summary);
        addRunEvent(current, 'succeeded', 'Legacy result verified and published as a bounded manifest; the original artifact remains recoverable.');
        auditEvent(database, { workspaceId: current.workspaceId, correlationId: current.correlationId, action: 'run.result.migrated', aggregateType: 'run', aggregateId: current.id, detail: { manifestChecksum: publication.manifest.manifestChecksum, legacyArtifact: current.outputArtifact || '' } });
      }
      return structuredClone(current);
    });
  }

  private async repositoryQuery<T>(operation: () => Promise<T>) {
    try { return await operation(); }
    catch (error) {
      if (error instanceof PlatformError) throw error;
      if (error instanceof Error && error.message === 'invalid_cursor') throw new PlatformError(400, 'invalid_cursor', 'The pagination cursor is invalid or does not match this result scope.');
      if (error instanceof Error && /limit must be between/.test(error.message)) throw new PlatformError(422, 'invalid_limit', error.message);
      if (error instanceof Error && /^period must be -1 or between/.test(error.message)) throw new PlatformError(422, 'invalid_period', error.message);
      throw error;
    }
  }

  private paginate<T>(records: T[], cursor: string | undefined, limit: number, kind: string, bind: string, identity: (value: T) => string): RunPage<T> {
    let start = 0;
    if (cursor) {
      const value = this.decodeCursor(cursor);
      if (value.kind !== kind || value.bind !== bind) throw new PlatformError(400, 'invalid_cursor', 'The cursor does not match this result set.');
      const index = records.findIndex((record) => identity(record) === value.lastId);
      if (index < 0) throw new PlatformError(400, 'invalid_cursor', 'The cursor no longer identifies this result set.');
      start = index + 1;
    }
    const items = records.slice(start, start + limit);
    const last = items.at(-1);
    return {
      items: structuredClone(items),
      total: records.length,
      ...(last && start + items.length < records.length ? { nextCursor: this.encodeCursor({ kind, bind, lastId: identity(last) }) } : {}),
    };
  }

  private encodeCursor(value: { kind: string; bind: string; lastId: string }) {
    const payload = Buffer.from(JSON.stringify(value)).toString('base64url');
    const signature = createHmac('sha256', this.cursorSecret).update(payload).digest('base64url');
    return `${payload}.${signature}`;
  }

  private decodeCursor(cursor: string): { kind: string; bind: string; lastId: string } {
    const [payload, supplied, extra] = cursor.split('.');
    if (!payload || !supplied || extra) throw new PlatformError(400, 'invalid_cursor', 'The pagination cursor is invalid.');
    const expected = createHmac('sha256', this.cursorSecret).update(payload).digest();
    let signature: Buffer;
    try { signature = Buffer.from(supplied, 'base64url'); } catch { throw new PlatformError(400, 'invalid_cursor', 'The pagination cursor is invalid.'); }
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) throw new PlatformError(400, 'invalid_cursor', 'The pagination cursor is invalid.');
    try {
      const value = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Record<string, unknown>;
      if (typeof value.kind !== 'string' || typeof value.bind !== 'string' || typeof value.lastId !== 'string') throw new Error('shape');
      return value as { kind: string; bind: string; lastId: string };
    } catch { throw new PlatformError(400, 'invalid_cursor', 'The pagination cursor is invalid.'); }
  }

  async cancelRun(id: string, idempotencyKey: string, correlationId: string) {
    const scope = `POST:/api/v1/runs/${id}/cancel`;
    const hash = requestHash({ id });
    const result = await this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, idempotencyKey, hash);
      if (replay) return { run: structuredClone(database.runs[id]), replayed: true };
      const run = database.runs[id];
      if (!run) throw new PlatformError(404, 'run_not_found', 'The requested run does not exist.');
      if (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled') throw new PlatformError(409, 'run_terminal', `A ${run.status} run cannot be cancelled.`);
      run.cancelRequested = true;
      if (run.status === 'queued') {
        run.status = 'cancelled';
        run.completedAt = new Date().toISOString();
        addRunEvent(run, 'cancelled', 'Queued run cancelled by owner.');
        database.metrics.jobsCancelled += 1;
      } else addRunEvent(run, 'running', 'Cancellation requested; the isolated engine worker is being terminated.');
      auditEvent(database, { workspaceId: run.workspaceId, correlationId, action: 'run.cancel.requested', aggregateType: 'run', aggregateId: id, detail: { status: run.status } });
      storeIdempotency(database, scope, idempotencyKey, hash, { status: 202, body: json({ runId: id, status: run.status, cancelRequested: true }) });
      return { run: structuredClone(run), replayed: false };
    });
    if (result.run.status === 'running' && result.run.cancelRequested) this.activeExecutions.get(id)?.abort();
    return result;
  }

  async retryRun(id: string, idempotencyKey: string, correlationId: string) {
    const scope = `POST:/api/v1/runs/${id}/retry`;
    const hash = requestHash({ id });
    const result = await this.store.transaction((database) => {
      const replay = checkIdempotency(database, scope, idempotencyKey, hash);
      if (replay) return { run: structuredClone(database.runs[id]), replayed: true };
      const run = database.runs[id];
      if (!run) throw new PlatformError(404, 'run_not_found', 'The requested run does not exist.');
      if (run.status !== 'failed' && run.status !== 'cancelled') throw new PlatformError(409, 'run_not_retryable', `A ${run.status} run cannot be retried.`);
      run.status = 'queued';
      run.cancelRequested = false;
      run.error = undefined;
      run.startedAt = undefined;
      run.completedAt = undefined;
      addRunEvent(run, 'queued', 'Run queued for an explicit retry.');
      auditEvent(database, { workspaceId: run.workspaceId, correlationId, action: 'run.retried', aggregateType: 'run', aggregateId: id, detail: { previousAttempts: run.attempt } });
      storeIdempotency(database, scope, idempotencyKey, hash, { status: 202, body: json({ runId: id, status: 'queued' }) });
      return { run: structuredClone(run), replayed: false };
    });
    this.scheduleProcessing();
    return result;
  }

  async audit(after: number) {
    return (await this.store.read()).audit.filter((event) => event.seq > after);
  }

  async metrics() {
    const database = await this.store.read();
    const queue = Object.values(database.runs).reduce<Record<string, number>>((counts, run) => {
      counts[run.status] = (counts[run.status] || 0) + 1;
      return counts;
    }, {});
    const queuedAt = Object.values(database.runs).filter((run) => run.status === 'queued').map((run) => Date.parse(run.createdAt)).filter(Number.isFinite);
    const oldestQueuedAgeSeconds = queuedAt.length ? Math.max(0, Math.floor((Date.now() - Math.min(...queuedAt)) / 1_000)) : 0;
    return { ...database.metrics, uptimeSeconds: Math.max(0, Math.floor((Date.now() - Date.parse(database.metrics.startedAt)) / 1_000)), queue, oldestQueuedAgeSeconds, workspaceRevision: database.workspace.revision, auditEvents: database.audit.length };
  }

  healthStatus() {
    return this.queueFailure
      ? {
          status:'degraded' as const,
          schemaVersion:1,
          service:'flyway-platform',
          code:this.queueFailure.code,
          timestamp:this.queueFailure.at,
          queue:{ status:'degraded' as const, code:this.queueFailure.code },
        }
      : { status:'ok' as const, schemaVersion:1, service:'flyway-platform', queue:{ status:'ok' as const } };
  }

  async recordRequest(error: boolean) {
    await this.store.transaction((database) => {
      database.metrics.requests += 1;
      if (error) database.metrics.errors += 1;
    });
  }

  private scheduleProcessing() {
    if (this.processScheduled || this.stopping) return;
    this.processScheduled = true;
    queueMicrotask(() => {
      this.processScheduled = false;
      if (this.processingPromise || this.stopping) return;
      this.processingPromise = this.runQueueSupervised();
    });
  }

  private async runQueueSupervised() {
    let pending = false;
    const priorFailure=this.queueFailure;
    try {
      await this.processQueue();
      if (!this.stopping) pending = Object.values((await this.store.read()).runs).some((run) => run.status === 'queued');
      if(this.queueFailure===priorFailure)this.queueFailure = undefined;
    } catch (error) {
      await this.recordQueueFailure(error);
    } finally {
      this.processingPromise = undefined;
      if (pending && !this.stopping) this.scheduleProcessing();
    }
  }

  private async recordQueueFailure(error:unknown) {
    const message=error instanceof Error?error.message:'The run queue failed outside deterministic execution.';
    this.queueFailure={at:new Date().toISOString(),code:'queue_processing_failed',message};
    try {
      await this.store.transaction((state)=>{
        const affected=Object.values(state.runs).filter(run=>run.status==='running').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0]
          ||Object.values(state.runs).filter(run=>run.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
        if(!affected)return;
        affected.status='failed';
        affected.completedAt=new Date().toISOString();
        affected.error={code:'queue_processing_failed',message:`Run queue failure: ${message}`,retryable:true};
        affected.outputArtifact=undefined;
        affected.outputChecksum=undefined;
        affected.resultManifestArtifact=undefined;
        affected.resultSummary=undefined;
        addRunEvent(affected,'failed',affected.error.message);
        state.metrics.jobsFailed+=1;
        auditEvent(state,{workspaceId:affected.workspaceId,correlationId:affected.correlationId,action:'run.failed',aggregateType:'run',aggregateId:affected.id,detail:{attempt:affected.attempt,code:affected.error.code}});
      });
    } catch (recoveryError) {
      this.queueFailure={at:this.queueFailure.at,code:'queue_processing_failed',message:`${message}; durable recovery also failed: ${recoveryError instanceof Error?recoveryError.message:'unknown store error'}`};
    }
  }

  async shutdown() {
    this.stopping = true;
    for (const controller of this.activeExecutions.values()) controller.abort();
    await this.processingPromise;
    await this.engine.shutdown?.();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;
    try {
      while (!this.stopping) {
        const database = await this.store.read();
        const next = Object.values(database.runs).filter((run) => run.status === 'queued').sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
        if (!next) break;
        const run = await this.store.transaction((state) => {
          const current = state.runs[next.id];
          if (!current || current.status !== 'queued') return undefined;
          if (current.cancelRequested) {
            current.status = 'cancelled';
            current.completedAt = new Date().toISOString();
            addRunEvent(current, 'cancelled', 'Run cancelled before execution.');
            state.metrics.jobsCancelled += 1;
            return undefined;
          }
          current.status = 'running';
          current.attempt += 1;
          current.startedAt = new Date().toISOString();
          addRunEvent(current, 'running', 'Worker started deterministic execution.');
          auditEvent(state, { workspaceId: current.workspaceId, correlationId: current.correlationId, action: 'run.started', aggregateType: 'run', aggregateId: current.id, detail: { attempt: current.attempt } });
          return structuredClone(current);
        });
        if (!run) continue;
        const execution = new AbortController();
        const streamedRefs: RunArtifactReference[] = [];
        const writeOutput: RunArtifactWriter = async (value) => {
          const reference = await this.store.writeArtifact('outputs', value);
          streamedRefs.push(reference);
          return reference;
        };
        this.activeExecutions.set(run.id, execution);
        try {
          const input = await this.store.readArtifact<unknown>(run.inputArtifact);
          const inputArtifact = run.inputArtifactReference || artifactReference(run.inputHash, run.inputArtifact, input);
          const latest = (await this.store.read()).runs[run.id];
          if (latest?.cancelRequested) execution.abort();
          let publication: PublishedRunArtifacts | undefined;
          let legacyOutput: { artifact: RunArtifactReference; outputChecksum: string } | undefined;
          if (this.engine.executeToArtifacts) {
            publication = await this.engine.executeToArtifacts(input, inputArtifact, writeOutput, execution.signal);
          } else {
            const output = await this.engine.execute(input, execution.signal);
            if (output.input?.schemaVersion === 2 && output.inputHash === inputArtifact.checksum && output.outputChecksum) {
              publication = await persistRunResult(output, inputArtifact, writeOutput);
            } else {
              const artifact = await writeOutput(output);
              legacyOutput = { artifact, outputChecksum: output.outputChecksum || artifact.checksum };
            }
          }
          const afterExecution = (await this.store.read()).runs[run.id];
          if (afterExecution?.cancelRequested) {
            await this.finishCancelledRun(run.id, 'Run cancelled after deterministic execution; no result manifest was attached.');
            await this.cleanupArtifacts(streamedRefs);
            continue;
          }
          const outputCommitted=await this.store.transaction((state) => {
            const current = state.runs[run.id];
            if (current.cancelRequested) {
              current.status = 'cancelled';
              current.completedAt = new Date().toISOString();
              addRunEvent(current, 'cancelled', 'Run cancelled during manifest commit; result artifacts were not attached to the decision record.');
              state.metrics.jobsCancelled += 1;
              auditEvent(state, { workspaceId: current.workspaceId, correlationId: current.correlationId, action: 'run.cancelled', aggregateType: 'run', aggregateId: current.id, detail: { attempt: current.attempt } });
              return false;
            }
            current.status = 'succeeded';
            current.completedAt = new Date().toISOString();
            current.outputArtifact = legacyOutput?.artifact.relativePath;
            current.resultFormat = publication ? 'manifest-v2' : 'monolith-v1';
            current.resultManifestArtifact = publication ? structuredClone(publication.manifestArtifact) : undefined;
            current.resultSummary = publication ? structuredClone(publication.manifest.summary) : undefined;
            current.outputChecksum = publication?.manifest.logicalOutputChecksum || legacyOutput?.outputChecksum;
            current.error = undefined;
            addRunEvent(current, 'succeeded', 'Deterministic result manifest committed after bounded artifacts became durable.');
            state.metrics.jobsSucceeded += 1;
            auditEvent(state, { workspaceId: current.workspaceId, correlationId: current.correlationId, action: 'run.succeeded', aggregateType: 'run', aggregateId: current.id, detail: { attempt: current.attempt, outputChecksum: current.outputChecksum || '' } });
            return true;
          });
          if(!outputCommitted)await this.cleanupArtifacts(streamedRefs);
        } catch (error) {
          await this.cleanupArtifacts(streamedRefs);
          await this.store.transaction((state) => {
            const current = state.runs[run.id];
            const executionAborted = error instanceof EngineExecutionAbortedError || this.stopping && error instanceof Error && error.name === 'AbortError';
            if (current.cancelRequested || executionAborted) {
              if (this.stopping && !current.cancelRequested) {
                current.status = 'queued';
                current.startedAt = undefined;
                addRunEvent(current, 'queued', 'Execution interrupted by platform shutdown; queued for recovery.');
                return;
              }
              current.status = 'cancelled';
              current.completedAt = new Date().toISOString();
              current.outputArtifact = undefined;
              current.resultManifestArtifact = undefined;
              current.resultSummary = undefined;
              current.outputChecksum = undefined;
              addRunEvent(current, 'cancelled', 'Isolated engine execution terminated; no output artifact was committed.');
              state.metrics.jobsCancelled += 1;
              auditEvent(state, { workspaceId: current.workspaceId, correlationId: current.correlationId, action: 'run.cancelled', aggregateType: 'run', aggregateId: current.id, detail: { attempt: current.attempt } });
              return;
            }
            current.status = 'failed';
            current.completedAt = new Date().toISOString();
            current.resultManifestArtifact = undefined;
            current.resultSummary = undefined;
            current.error = { code: 'engine_execution_failed', message: error instanceof Error ? error.message : 'Engine execution failed.', retryable: true };
            addRunEvent(current, 'failed', current.error.message);
            state.metrics.jobsFailed += 1;
            auditEvent(state, { workspaceId: current.workspaceId, correlationId: current.correlationId, action: 'run.failed', aggregateType: 'run', aggregateId: current.id, detail: { attempt: current.attempt, code: current.error.code } });
          });
        } finally {
          this.activeExecutions.delete(run.id);
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private async finishCancelledRun(id: string, message: string) {
    await this.store.transaction((state) => {
      const current = state.runs[id];
      if (!current || current.status === 'cancelled') return;
      current.status = 'cancelled';
      current.completedAt = new Date().toISOString();
      current.outputArtifact = undefined;
      current.resultManifestArtifact = undefined;
      current.resultSummary = undefined;
      current.outputChecksum = undefined;
      addRunEvent(current, 'cancelled', message);
      state.metrics.jobsCancelled += 1;
      auditEvent(state, { workspaceId: current.workspaceId, correlationId: current.correlationId, action: 'run.cancelled', aggregateType: 'run', aggregateId: current.id, detail: { attempt: current.attempt } });
    });
  }

  private async cleanupArtifacts(references: RunArtifactReference[]) {
    for (const reference of references) {
      await this.store.deleteOutputArtifactIfUnreferenced(reference.relativePath).catch((error) => {
        this.queueFailure = { at: new Date().toISOString(), code: 'output_cleanup_failed', message: `Abandoned result cleanup failed: ${error instanceof Error ? error.message : 'unknown store error'}` };
      });
    }
  }
}

export function workspaceEtag(workspace: Pick<WorkspaceState, 'revision'>) {
  return `"${workspace.revision}"`;
}

function decisionNetwork(workspace: WorkspaceState) {
  const partial = workspace.defaults;
  const defaults: EngineDefaults = {
    ...structuredClone(flywayEngine.defaultEngineDefaults),
    ...structuredClone(partial),
    productWeights: { ...flywayEngine.defaultEngineDefaults.productWeights, ...(partial.productWeights || {}) },
    purchaseCostMicrosByProduct: { ...flywayEngine.defaultEngineDefaults.purchaseCostMicrosByProduct, ...(partial.purchaseCostMicrosByProduct || {}) },
    shortagePenaltyMicrosByProduct: { ...flywayEngine.defaultEngineDefaults.shortagePenaltyMicrosByProduct, ...(partial.shortagePenaltyMicrosByProduct || {}) },
    defaultSeasonalityByWeekday: [...(partial.defaultSeasonalityByWeekday || flywayEngine.defaultEngineDefaults.defaultSeasonalityByWeekday)],
  };
  delete (defaults as EngineDefaults & { workspacePreferences?: unknown }).workspacePreferences;
  return { locations: structuredClone(workspace.locations), lanes: structuredClone(workspace.lanes), defaults };
}

function decisionBaselineScenario(workspace: WorkspaceState, network: ReturnType<typeof decisionNetwork>): ScenarioDefinition {
  if (!network.locations.length) throw new PlatformError(409, 'decision_network_empty', 'Add at least one modeled location before analyzing decisions.');
  const grain = network.defaults.defaultGrain;
  const networkHash = networkFingerprint(network);
  return {
    id: `decision-baseline-${networkHash.slice(0, 16)}`,
    name: 'Decision Intelligence baseline',
    description: 'No-change deterministic baseline used to evaluate decision candidates.',
    type: 'price-change', targetId: network.locations[0].id, magnitude: 0,
    grain, horizon: grain === 'daily' ? 14 : 4,
    createdAt: `${network.defaults.startDate}T00:00:00.000Z`,
    baselineRevision: networkHash,
    startDate: network.defaults.startDate,
    changes: [],
  };
}

function validatePolicy(value: DecisionPolicy): DecisionPolicy {
  const candidate: DecisionPolicy = {
    autonomyEnabled: value?.autonomyEnabled,
    maxCapacityIncreasePct: value?.maxCapacityIncreasePct,
    maxCostIncreasePct: value?.maxCostIncreasePct,
    maxLocations: value?.maxLocations,
    minServiceGainPp: value?.minServiceGainPp,
  };
  if (typeof candidate.autonomyEnabled !== 'boolean'
    || !Number.isFinite(candidate.maxCapacityIncreasePct) || candidate.maxCapacityIncreasePct < 0 || candidate.maxCapacityIncreasePct > defaultDecisionPolicy.maxCapacityIncreasePct
    || !Number.isFinite(candidate.maxCostIncreasePct) || candidate.maxCostIncreasePct < 0 || candidate.maxCostIncreasePct > defaultDecisionPolicy.maxCostIncreasePct
    || !Number.isInteger(candidate.maxLocations) || candidate.maxLocations < 0 || candidate.maxLocations > defaultDecisionPolicy.maxLocations
    || !Number.isFinite(candidate.minServiceGainPp) || candidate.minServiceGainPp < defaultDecisionPolicy.minServiceGainPp) {
    throw new PlatformError(422, 'invalid_decision_policy', 'Decision policy may only tighten the bounded automatic-change rules.');
  }
  return candidate;
}

function validateCopilotRequest(value: CopilotRequest): CopilotRequest {
  if (!value || typeof value !== 'object' || typeof value.message !== 'string' || !value.message.trim() || value.message.length > 4_000 || !Number.isInteger(value.expectedRevision) || value.expectedRevision < 0) throw new PlatformError(422, 'invalid_copilot_request', 'Copilot requests require a message of 1 to 4,000 characters and a valid intelligence revision.');
  if (value.conversationId !== undefined && (typeof value.conversationId !== 'string' || value.conversationId.length > 200)) throw new PlatformError(422, 'invalid_conversation_id', 'Conversation ID is invalid.');
  if (value.activeRunId !== undefined && (typeof value.activeRunId !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.activeRunId))) throw new PlatformError(422, 'invalid_run_id', 'Active run ID must be a service run UUID.');
  if (value.mode !== undefined && value.mode !== 'ai' && value.mode !== 'model-tools') throw new PlatformError(422, 'invalid_copilot_mode', 'Choose ai or model-tools mode.');
  return { ...structuredClone(value), message: value.message.trim() };
}

function decisionError(error: unknown) {
  const message = error instanceof Error ? error.message : 'The decision operation failed.';
  if (/does not exist/.test(message)) return new PlatformError(404, 'decision_not_found', message);
  if (/stale|changed before|changed during|source run/i.test(message)) return new PlatformError(409, 'decision_stale', message);
  return new PlatformError(422, 'decision_invalid', message);
}

function toolArguments(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Tool arguments must be an object.');
  return value as Record<string, unknown>;
}

function requiredToolText(value: Record<string, unknown>, name: string) {
  const item = value[name];
  if (typeof item !== 'string' || !item.trim() || item.length > 500) throw new Error(`${name} must be a non-empty string.`);
  return item.trim();
}

function boundedToolLimit(value: unknown, maximum: number) {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > maximum) throw new Error(`limit must be between 1 and ${maximum}.`);
  return Number(value);
}

function signed(value: number) { return `${value >= 0 ? '+' : ''}${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`; }
function signedCurrency(value: number) { return `${value >= 0 ? '+' : '-'}$${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: 0 })}`; }

function locationCounts(locations: WorkspaceState['locations']) {
  return locations.reduce((counts, location) => ({ ...counts, [location.type]: counts[location.type] + 1 }), { restaurant: 0, dc: 0, supplier: 0 });
}

function inferScenarioType(text: string): ScenarioDefinition['type'] | undefined {
  if (/demand|surge/.test(text)) return 'demand-surge';
  if (/supplier/.test(text)) return 'supplier-failure';
  if (/weather/.test(text)) return 'severe-weather';
  if (/price|cost/.test(text)) return 'price-change';
  if (/capacity/.test(text)) return 'capacity-constraint';
  if (/(dc|distribution.center).*outage|outage.*(dc|distribution.center)/.test(text)) return 'dc-outage';
  return undefined;
}

function frozenRunLocations(value: unknown): WorkspaceState['locations'] | undefined {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { locations?: unknown }).locations)) return undefined;
  return (value as { locations: WorkspaceState['locations'] }).locations;
}

function scenarioFromTool(args: Record<string, unknown>, locations: WorkspaceState['locations'], baselineRevision: string): ScenarioDefinition {
  const name = requiredToolText(args, 'name').slice(0, 120);
  const description = requiredToolText(args, 'description').slice(0, 1_000);
  const type = requiredToolText(args, 'scenario_type') as ScenarioDefinition['type'];
  const targetId = requiredToolText(args, 'target_id');
  const grain = requiredToolText(args, 'grain') as ScenarioDefinition['grain'];
  const magnitude = args.magnitude;
  const horizon = args.horizon;
  if (!['dc-outage', 'supplier-failure', 'demand-surge', 'severe-weather', 'price-change', 'capacity-constraint', 'location-closure'].includes(type)) throw new Error('scenario_type is invalid.');
  if (!locations.some((location) => location.id === targetId)) throw new Error('target_id does not identify a modeled location in the selected scenario context.');
  if (!Number.isFinite(magnitude) || Number(magnitude) < 0 || Number(magnitude) > 1_000) throw new Error('magnitude must be between 0 and 1,000.');
  const maxHorizon = grain === 'daily' ? 90 : grain === 'weekly' ? 26 : 0;
  if (!Number.isInteger(horizon) || Number(horizon) < 1 || Number(horizon) > maxHorizon) throw new Error(`horizon must be between 1 and ${maxHorizon}.`);
  const direction = args.capacity_direction;
  if (type === 'capacity-constraint' && direction !== 'decrease' && direction !== 'increase') throw new Error('capacity_direction must be decrease or increase for a capacity scenario.');
  if (type !== 'capacity-constraint' && direction !== undefined && direction !== null) throw new Error('capacity_direction must be null unless scenario_type is capacity-constraint.');
  return {
    id: `copilot-scenario-${randomUUID()}`, name, description, type, targetId, magnitude: Number(magnitude), grain, horizon: Number(horizon), createdAt: new Date().toISOString(), baselineRevision,
    ...(type === 'capacity-constraint' && direction === 'increase' ? { changes: [{ id: `copilot-change-${randomUUID()}`, kind: 'adjust-capacity' as const, locationId: targetId, multiplier: 1 + Number(magnitude) / 100, effectiveDay: 0 }] } : {}),
  };
}

function setDecisionRunReferences(outcome: ReturnType<typeof recordEvaluatedDecision>, sourceRunId: string, candidateRunId: string) {
  const apply = (decision: typeof outcome.decision) => {
    decision.evidence.runId = sourceRunId;
    (decision.evidence as typeof decision.evidence & { candidateRunId?: string }).candidateRunId = candidateRunId;
  };
  apply(outcome.decision);
  const stored = outcome.state.decisions.find((decision) => decision.id === outcome.decision.id);
  if (stored) apply(stored);
}

export function outputArtifactDigest(output: unknown) {
  return sha256(canonicalize(output));
}

function boundedLimit(value: number | undefined, fallback: number, maximum: number) {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < 1 || value > maximum) throw new PlatformError(422, 'invalid_limit', `Limit must be an integer from 1 to ${maximum}.`);
  return value;
}

function scenarioSavedAt(value: StoredScenario) {
  return isScenarioReference(value) ? value.savedAt : value.result.completedAt || value.createdAt;
}

function savedScenarioRunId(value: StoredScenario) {
  return isScenarioReference(value) ? value.resultRef.runId : value.result.runId;
}

function artifactReference(checksum: string, relativePath: string, value: unknown): RunArtifactReference {
  const content = canonicalizeArtifact(value);
  if (contentHash(value) !== checksum) throw new PlatformError(409, 'input_artifact_checksum_mismatch', 'The immutable input artifact failed checksum verification.');
  return { checksum, relativePath, byteLength: Buffer.byteLength(content) };
}

function scenarioDefinition(value: StoredScenario): ScenarioDefinition {
  const { result: _legacyResult, schemaVersion: _schemaVersion, savedAt: _savedAt, latestRun: _latestRun, resultRef: _resultRef, ...definition } = value as StoredScenario & Partial<SavedScenarioReferenceV2> & { result?: ScenarioResult };
  return structuredClone(definition) as ScenarioDefinition;
}
