import { cloneJson, contentHash } from './engine/canonical';
import { createEvidenceValue } from './evidence/provenance';
import { ENGINE_BUILD_DIGEST, ENGINE_VERSION } from './flywayEngine';
import type { EvidenceClassification, EvidenceValue } from './evidence/types';
import type {
  DecisionCandidateDefinition,
  DecisionEvent,
  DecisionPolicy,
  DecisionRecord,
  DecisionResolution,
  IntelligenceState,
} from './intelligenceTypes';
import type {
  EngineDefaults,
  Lane,
  RunInputV2,
  ScenarioChange,
  ScenarioResult,
  TwinLocation,
  TwinMetrics,
} from './flywayTypes';

const EPSILON = 1e-7;
const CAPACITY_FIELDS = ['weeklyCapacity', 'inboundCapacityPerDay', 'outboundCapacityPerDay'] as const;
const FINAL_STATUSES = new Set(['applied', 'rejected', 'superseded']);
const PRODUCTS = new Set(['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment']);
const EVIDENCE_CLASSES = new Set(['verified-public', 'corroborated', 'user-input', 'derived', 'synthetic']);
const UNITS = new Set(['case-equivalent', 'case', 'each', 'pallet']);

export interface DecisionNetwork {
  locations: TwinLocation[];
  lanes: Lane[];
  defaults: EngineDefaults;
}

export interface BuildDecisionRecordInput {
  state: IntelligenceState;
  network: DecisionNetwork;
  sourceResult: ScenarioResult;
  candidate: DecisionCandidateDefinition;
  candidateResult: ScenarioResult;
  at?: string;
}

export interface DecisionMutationResult {
  state: IntelligenceState;
  locations: TwinLocation[];
  lanes: Lane[];
  defaults: EngineDefaults;
  decision: DecisionRecord;
}

export interface RecordEvaluatedDecisionInput extends BuildDecisionRecordInput {}
export interface RecordEvaluatedDecisionResult extends DecisionMutationResult {
  duplicate: boolean;
  autoApplied: boolean;
}

export interface ResolveDecisionInput {
  state: IntelligenceState;
  network: DecisionNetwork;
  decisionId: string;
  resolution: DecisionResolution;
  reason: string;
  expectedRevision?: number;
  at?: string;
}

export interface ResolveDecisionResult extends DecisionMutationResult {
  idempotent: boolean;
}

export const defaultDecisionPolicy: DecisionPolicy = Object.freeze({
  autonomyEnabled: true,
  maxCapacityIncreasePct: 5,
  maxCostIncreasePct: 2,
  maxLocations: 1,
  minServiceGainPp: 0,
});

export function createIntelligenceState(): IntelligenceState {
  return { schemaVersion: 1, revision: 0, policy: { ...defaultDecisionPolicy }, decisions: [], conversations: [] };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function jsonSafe(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object') return false;
  if (seen.has(value as object)) return false;
  seen.add(value as object);
  const valid = Array.isArray(value)
    ? value.every((item) => jsonSafe(item, seen))
    : Object.getPrototypeOf(value) === Object.prototype && Object.values(value as Record<string, unknown>).every((item) => jsonSafe(item, seen));
  seen.delete(value as object);
  return valid;
}

function iso(value: unknown): value is string {
  return nonEmpty(value) && Number.isFinite(Date.parse(value));
}

function validMetrics(value: unknown): value is TwinMetrics {
  if (!record(value)) return false;
  const numeric = ['serviceLevel', 'stockoutUnits', 'affectedRestaurants', 'totalLandedCost', 'maxUtilization', 'totalDemand', 'fulfilledDemand'];
  if (!numeric.every((key) => finite(value[key]))) return false;
  if ((value.serviceLevel as number) < 0 || (value.serviceLevel as number) > 100) return false;
  if (numeric.filter((key) => key !== 'serviceLevel' && key !== 'totalLandedCost').some((key) => (value[key] as number) < 0)) return false;
  return typeof value.maxUtilizationLocationId === 'string';
}

function validPolicy(value: unknown): value is DecisionPolicy {
  if (!record(value) || typeof value.autonomyEnabled !== 'boolean') return false;
  const keys = ['maxCapacityIncreasePct', 'maxCostIncreasePct', 'maxLocations', 'minServiceGainPp'];
  if (!keys.every((key) => finite(value[key]))) return false;
  return (value.maxCapacityIncreasePct as number) >= 0
    && (value.maxCapacityIncreasePct as number) <= defaultDecisionPolicy.maxCapacityIncreasePct
    && (value.maxCostIncreasePct as number) >= 0
    && (value.maxCostIncreasePct as number) <= defaultDecisionPolicy.maxCostIncreasePct
    && Number.isInteger(value.maxLocations)
    && (value.maxLocations as number) >= 0
    && (value.maxLocations as number) <= defaultDecisionPolicy.maxLocations
    && (value.minServiceGainPp as number) >= defaultDecisionPolicy.minServiceGainPp;
}

function optionalNonnegative(value: unknown) {
  return value === undefined || finite(value) && value >= 0;
}

function validIdentityEvidence(value: unknown) {
  return record(value)
    && EVIDENCE_CLASSES.has(String(value.classification))
    && (value.confidence === null || finite(value.confidence) && value.confidence >= 0 && value.confidence <= 1)
    && nonEmpty(value.sourceTitle) && nonEmpty(value.publisher) && iso(value.verifiedAt)
    && (value.sourceUrl === undefined || nonEmpty(value.sourceUrl))
    && (value.note === undefined || typeof value.note === 'string');
}

function validFieldEvidenceValue(value: unknown) {
  return record(value)
    && [value.id, value.entityType, value.entityId, value.fieldPath, value.sourceTitle, value.sourcePublisher, value.extractionMethod, value.extractorVersion].every(nonEmpty)
    && EVIDENCE_CLASSES.has(String(value.classification))
    && (value.confidence === null || finite(value.confidence) && value.confidence >= 0 && value.confidence <= 1)
    && (value.unit === null || typeof value.unit === 'string')
    && (value.sourceId === null || typeof value.sourceId === 'string')
    && (value.sourceArtifactId === null || typeof value.sourceArtifactId === 'string')
    && (value.sourceUrl === null || typeof value.sourceUrl === 'string')
    && (value.sourcePublishedAt === null || iso(value.sourcePublishedAt))
    && iso(value.verifiedAt) && iso(value.effectiveFrom)
    && (value.effectiveTo === null || iso(value.effectiveTo))
    && ['accepted', 'needs-review', 'rejected', 'superseded'].includes(String(value.reviewStatus))
    && (value.reviewNote === null || typeof value.reviewNote === 'string')
    && (value.supersedesId === null || typeof value.supersedesId === 'string');
}

function validFieldEvidence(value: unknown) {
  return value === undefined || record(value) && Object.entries(value).every(([field, evidence]) => nonEmpty(field) && validFieldEvidenceValue(evidence));
}

function validProductPolicy(value: unknown, enabledProducts: Set<string>) {
  if (!record(value) || !PRODUCTS.has(String(value.product)) || !enabledProducts.has(String(value.product)) || !UNITS.has(String(value.baseUnit))) return false;
  const nonnegativeFields = ['weeklyDemand', 'weeklyProductionCapacity', 'openingInventory', 'storageCapacity', 'safetyStock', 'reorderPoint', 'orderUpTo', 'leadTimeDays', 'minimumOrderQuantity', 'orderMultiple', 'eventMultiplier', 'purchaseCostMicros', 'handlingCostMicros', 'carryingCostMicrosPerUnitDay'];
  if (!nonnegativeFields.every((field) => optionalNonnegative(value[field]))) return false;
  if (value.growthRatePerPeriod !== undefined && (!finite(value.growthRatePerPeriod) || value.growthRatePerPeriod < -1)) return false;
  if (value.reviewPeriodDays !== undefined && (!Number.isInteger(value.reviewPeriodDays) || (value.reviewPeriodDays as number) < 1)) return false;
  if (value.replenishmentPolicy !== undefined && !['min-max', 'reorder-point', 'scheduled'].includes(String(value.replenishmentPolicy))) return false;
  if (value.seasonalityByWeekday !== undefined && (!Array.isArray(value.seasonalityByWeekday) || value.seasonalityByWeekday.length !== 7 || !value.seasonalityByWeekday.every((item) => finite(item) && item >= 0))) return false;
  return value.scheduledReplenishment === undefined || Array.isArray(value.scheduledReplenishment) && value.scheduledReplenishment.every((item) => record(item) && Number.isInteger(item.weekday) && (item.weekday as number) >= 0 && (item.weekday as number) <= 6 && finite(item.quantity) && item.quantity >= 0);
}

function validAddedLocation(value: unknown) {
  if (!record(value) || ![value.id, value.type, value.name, value.city, value.state, value.address, value.status, value.operatingSchedule].every(nonEmpty)) return false;
  if (!['restaurant', 'dc', 'supplier'].includes(String(value.type)) || !['active', 'planned', 'unavailable', 'closed'].includes(String(value.status))) return false;
  if (!finite(value.latitude) || value.latitude < -90 || value.latitude > 90 || !finite(value.longitude) || value.longitude < -180 || value.longitude > 180) return false;
  if (!Array.isArray(value.products) || !value.products.length || !value.products.every((item) => PRODUCTS.has(String(item))) || new Set(value.products).size !== value.products.length) return false;
  if (!validIdentityEvidence(value.evidence) || !validFieldEvidence(value.fieldEvidence)) return false;
  if (!['weeklyDemand', 'weeklyCapacity', 'inventoryDays', 'serviceRadiusMiles', 'inboundCapacityPerDay', 'outboundCapacityPerDay', 'storageCapacity', 'servicePriority'].every((field) => optionalNonnegative(value[field]))) return false;
  if (value.reliability !== undefined && (!finite(value.reliability) || value.reliability < 0 || value.reliability > 1)) return false;
  if (value.assignedDcId !== undefined && !nonEmpty(value.assignedDcId)) return false;
  if (value.mapPrecision !== undefined && !['exact-public-address', 'city-level-public-evidence', 'model-only'].includes(String(value.mapPrecision))) return false;
  if (value.calendar !== undefined) {
    if (!record(value.calendar) || !Array.isArray(value.calendar.operatingWeekdays) || value.calendar.operatingWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(value.calendar.operatingWeekdays).size !== value.calendar.operatingWeekdays.length) return false;
    if (value.calendar.exceptions !== undefined && (!Array.isArray(value.calendar.exceptions) || !value.calendar.exceptions.every((item) => record(item) && nonEmpty(item.date) && typeof item.open === 'boolean'))) return false;
  }
  const enabledProducts = new Set(value.products.map(String));
  return value.productPolicies === undefined || Array.isArray(value.productPolicies)
    && value.productPolicies.every((policy) => validProductPolicy(policy, enabledProducts))
    && new Set(value.productPolicies.map((policy) => record(policy) ? policy.product : undefined)).size === value.productPolicies.length;
}

function validAddedLane(value: unknown) {
  if (!record(value) || ![value.id, value.originId, value.destinationId, value.status].every(nonEmpty) || value.originId === value.destinationId) return false;
  if (!['active', 'recommended', 'inactive'].includes(String(value.status))) return false;
  if (!['miles', 'transitHours', 'deliveriesPerWeek', 'costPerMile'].every((field) => optionalNonnegative(value[field])) || !['miles', 'transitHours', 'deliveriesPerWeek', 'costPerMile'].every((field) => value[field] !== undefined)) return false;
  if (!Array.isArray(value.products) || !value.products.length || !value.products.every((item) => PRODUCTS.has(String(item))) || new Set(value.products).size !== value.products.length) return false;
  const products = value.products;
  if (!validIdentityEvidence(value.evidence) || !validFieldEvidence(value.fieldEvidence)) return false;
  if (!['weeklyCapacity', 'fixedDispatchCostMicros', 'driverCostMicrosPerHour', 'tollCostMicros', 'vehicleCapacity', 'dwellHours', 'maxDriverHours', 'fuelEconomyMpg'].every((field) => optionalNonnegative(value[field]))) return false;
  if (value.vehicleCapacity !== undefined && (!finite(value.vehicleCapacity) || value.vehicleCapacity <= 0) || value.fuelEconomyMpg !== undefined && (!finite(value.fuelEconomyMpg) || value.fuelEconomyMpg <= 0)) return false;
  if (value.operatingDays !== undefined && (!Array.isArray(value.operatingDays) || value.operatingDays.some((day) => !Number.isInteger(day) || day < 0 || day > 6) || new Set(value.operatingDays).size !== value.operatingDays.length)) return false;
  for (const window of [value.deliveryWindow, value.receivingWindow]) if (window !== undefined && (!record(window) || !finite(window.startHour) || !finite(window.endHour) || window.startHour < 0 || window.endHour > 24 || window.startHour >= window.endHour)) return false;
  if (value.vehicleType !== undefined && (!record(value.vehicleType) || !nonEmpty(value.vehicleType.id) || !nonEmpty(value.vehicleType.name) || !finite(value.vehicleType.capacity) || value.vehicleType.capacity <= 0 || !optionalNonnegative(value.vehicleType.fixedCostMicros))) return false;
  if (value.maxDriverHours !== undefined && (!finite(value.maxDriverHours) || finite(value.transitHours) && value.transitHours + (finite(value.dwellHours) ? value.dwellHours : 0) > value.maxDriverHours)) return false;
  return value.productPolicies === undefined || Array.isArray(value.productPolicies) && value.productPolicies.every((policy) => record(policy)
    && PRODUCTS.has(String(policy.product)) && products.includes(policy.product)
    && optionalNonnegative(policy.maxQuantityPerDay) && optionalNonnegative(policy.variableCostMicrosPerUnit)
    && (policy.allocationPct === undefined || finite(policy.allocationPct) && policy.allocationPct >= 0 && policy.allocationPct <= 100));
}

function validScenarioChange(value: unknown): value is ScenarioChange {
  if (!record(value) || !nonEmpty(value.id) || !nonEmpty(value.kind) || !Number.isInteger(value.effectiveDay) || (value.effectiveDay as number) < 0) return false;
  if (value.durationDays !== undefined && (!Number.isInteger(value.durationDays) || (value.durationDays as number) <= 0)) return false;
  switch (value.kind) {
    case 'adjust-capacity':
      return nonEmpty(value.locationId) && finite(value.multiplier) && value.multiplier >= 0;
    case 'reassign-restaurant':
      return nonEmpty(value.restaurantId) && nonEmpty(value.dcId);
    case 'add-lane':
      return validAddedLane(value.lane);
    case 'add-location':
      return validAddedLocation(value.location);
    case 'remove-lane':
      return nonEmpty(value.laneId);
    case 'set-location-status':
      return nonEmpty(value.locationId) && ['active', 'planned', 'unavailable', 'closed'].includes(String(value.status));
    case 'adjust-demand':
    case 'adjust-price':
      return finite(value.multiplier) && value.multiplier >= 0;
    case 'adjust-lane':
      return nonEmpty(value.laneId);
    case 'weather-disruption':
      return Array.isArray(value.locationIds) && Array.isArray(value.laneIds)
        && finite(value.capacityMultiplier) && finite(value.transitTimeMultiplier) && finite(value.costMultiplier);
    case 'set-inventory-policy':
      return nonEmpty(value.dcId) && nonEmpty(value.product);
    default:
      return false;
  }
}

function validEvent(value: unknown): value is DecisionEvent {
  return record(value) && nonEmpty(value.id) && iso(value.at)
    && ['ai', 'rules', 'human'].includes(String(value.actor))
    && nonEmpty(value.action) && nonEmpty(value.reason);
}

function validDecision(value: unknown): value is DecisionRecord {
  if (!record(value)) return false;
  if (![value.id, value.title, value.summary, value.rationale, value.networkHash].every(nonEmpty)) return false;
  if (!iso(value.createdAt) || !iso(value.updatedAt)) return false;
  if (!['ai', 'rules', 'human'].includes(String(value.createdBy))) return false;
  if (!['awaiting-human', 'applied', 'rejected', 'deferred', 'superseded'].includes(String(value.status))) return false;
  if (!['ai', 'human'].includes(String(value.authority)) || !['low', 'high'].includes(String(value.risk))) return false;
  if (value.risk === 'high' && value.authority !== 'human') return false;
  if (value.authority === 'ai' && value.status !== 'applied') return false;
  if (Date.parse(value.updatedAt as string) < Date.parse(value.createdAt as string)) return false;
  const hash = /^[a-f0-9]{64}$/;
  if (!hash.test(value.networkHash as string)) return false;
  if (!Array.isArray(value.proposal) || !value.proposal.length || !value.proposal.every(validScenarioChange)) return false;
  if (new Set(value.proposal.map((change) => change.id)).size !== value.proposal.length) return false;
  try { assertDurableProposal(value.proposal as ScenarioChange[]); } catch { return false; }
  if (!validMetrics(value.before) || !validMetrics(value.after)) return false;
  if (!record(value.evidence) || ![value.evidence.runId, value.evidence.inputHash, value.evidence.outputChecksum, value.evidence.candidateInputHash, value.evidence.candidateOutputChecksum, value.evidence.engineVersion].every(nonEmpty)) return false;
  if (value.evidence.candidateRunId !== undefined && !nonEmpty(value.evidence.candidateRunId)) return false;
  if (![value.evidence.inputHash, value.evidence.outputChecksum, value.evidence.candidateInputHash, value.evidence.candidateOutputChecksum].every((item) => hash.test(String(item)))) return false;
  if (!Array.isArray(value.policyReasons) || !value.policyReasons.length || !value.policyReasons.every(nonEmpty)) return false;
  if (!Array.isArray(value.history) || !value.history.length || !value.history.every(validEvent)) return false;
  if (new Set(value.history.map((event) => event.id)).size !== value.history.length) return false;
  if (value.status === 'applied' && !hash.test(String(value.appliedNetworkHash))) return false;
  return value.appliedNetworkHash === undefined || hash.test(String(value.appliedNetworkHash));
}

function validConversation(value: unknown): boolean {
  if (!record(value) || ![value.id, value.title].every(nonEmpty) || !iso(value.createdAt) || !iso(value.updatedAt) || !Array.isArray(value.messages)) return false;
  const validMessages = value.messages.every((message) => record(message)
    && nonEmpty(message.id) && ['user', 'assistant'].includes(String(message.role)) && nonEmpty(message.content)
    && iso(message.createdAt) && ['ai', 'model-tools'].includes(String(message.mode)) && Array.isArray(message.tools)
    && message.tools.every((tool) => record(tool) && nonEmpty(tool.id) && nonEmpty(tool.name) && nonEmpty(tool.label)
      && ['completed', 'failed'].includes(String(tool.status)) && nonEmpty(tool.summary)
      && (tool.runId === undefined || nonEmpty(tool.runId)) && (tool.decisionId === undefined || nonEmpty(tool.decisionId))));
  return validMessages && new Set(value.messages.map((message) => record(message) ? message.id : undefined)).size === value.messages.length;
}

export function isIntelligenceState(value: unknown): value is IntelligenceState {
  if (!jsonSafe(value) || !record(value) || value.schemaVersion !== 1 || !Number.isInteger(value.revision) || (value.revision as number) < 0) return false;
  if (!validPolicy(value.policy) || !Array.isArray(value.decisions) || !value.decisions.every(validDecision)) return false;
  if (new Set(value.decisions.map((decision) => decision.id)).size !== value.decisions.length) return false;
  if (!Array.isArray(value.conversations) || !value.conversations.every(validConversation)) return false;
  return new Set(value.conversations.map((conversation) => conversation.id)).size === value.conversations.length;
}

export function validateIntelligenceState(value: unknown): IntelligenceState {
  if (!isIntelligenceState(value)) throw new Error('Decision intelligence state is invalid or unsupported.');
  return cloneJson(value);
}

function normalizedNetwork(network: DecisionNetwork) {
  const locations = cloneJson(network.locations).sort((left, right) => left.id.localeCompare(right.id)).map((location) => ({
    ...location,
    products: [...location.products].sort(),
    productPolicies: location.productPolicies ? [...location.productPolicies].sort((left, right) => left.product.localeCompare(right.product)) : undefined,
  }));
  const lanes = cloneJson(network.lanes).sort((left, right) => left.id.localeCompare(right.id)).map((lane) => ({
    ...lane,
    products: [...lane.products].sort(),
    productPolicies: lane.productPolicies ? [...lane.productPolicies].sort((left, right) => left.product.localeCompare(right.product)) : undefined,
  }));
  return { locations, lanes, defaults: cloneJson(network.defaults) };
}

export function networkFingerprint(network: DecisionNetwork): string {
  return contentHash(normalizedNetwork(network));
}

function inputNetwork(input: RunInputV2): DecisionNetwork {
  return { locations: input.locations, lanes: input.lanes, defaults: input.defaults };
}

function assertResult(result: ScenarioResult, label: string): asserts result is ScenarioResult & { input: RunInputV2; outputChecksum: string } {
  if (!result.input || result.input.schemaVersion !== 2) throw new Error(`${label} does not contain a frozen version 2 input.`);
  if (result.engineVersion !== ENGINE_VERSION || result.input.engineVersion !== ENGINE_VERSION || result.input.engineBuildDigest !== ENGINE_BUILD_DIGEST) throw new Error(`${label} uses a different engine build. Rerun decision analysis with the current engine.`);
  if (!nonEmpty(result.outputChecksum) || !nonEmpty(result.runId) || !nonEmpty(result.inputHash)) throw new Error(`${label} is missing immutable run identity.`);
  if (contentHash(result.input) !== result.inputHash) throw new Error(`${label} input identity does not match its frozen input.`);
  if (!validMetrics(result.scenario) || !validMetrics(result.baseline)) throw new Error(`${label} contains invalid or non-finite metrics.`);
}

function assertAnalysisSource(result: ScenarioResult & { input: RunInputV2 }) {
  if (result.input.changes.length || (result.input.scenario.changes?.length ?? 0)) throw new Error('Decision analysis requires an explicit no-change planning baseline. Scenario disruptions remain comparison context, not durable model edits.');
}

function assertDurableProposal(proposal: ScenarioChange[]) {
  for (const change of proposal) {
    if (change.effectiveDay !== 0 || change.durationDays !== undefined) throw new Error('Durable planning-model decisions must take effect immediately and cannot contain a temporary duration.');
    if (!['adjust-capacity', 'reassign-restaurant', 'add-lane', 'remove-lane', 'set-location-status', 'add-location'].includes(change.kind)) {
      throw new Error(`Decision change ${change.kind} is not a supported durable planning-model edit.`);
    }
    if ((change.kind === 'add-location' || change.kind === 'add-lane') && ['verified-public', 'corroborated'].includes(change.kind === 'add-location' ? change.location.evidence.classification : change.lane.evidence.classification)) {
      throw new Error('Decision Intelligence cannot establish a verified or corroborated public location or lane. Publish public identity through the evidence workflow first.');
    }
  }
}

function proposalLocationIds(proposal: ScenarioChange[]): string[] {
  return [...new Set(proposal.flatMap((change) => {
    switch (change.kind) {
      case 'adjust-capacity': case 'adjust-demand': case 'set-location-status': return [change.locationId];
      case 'reassign-restaurant': return [change.restaurantId, change.dcId];
      case 'add-location': return [change.location.id];
      case 'add-lane': return [change.lane.originId, change.lane.destinationId];
      case 'weather-disruption': return change.locationIds;
      case 'set-inventory-policy': return [change.dcId];
      default: return [];
    }
  }))].sort();
}

function candidateId(source: ScenarioResult, proposal: ScenarioChange[]) {
  return `candidate-${contentHash({ sourceInputHash: source.inputHash, proposal }).slice(0, 20)}`;
}

export function generateDecisionCandidates(sourceResult: ScenarioResult, currentNetwork: DecisionNetwork, state?: IntelligenceState): DecisionCandidateDefinition[] {
  assertResult(sourceResult, 'Source result');
  assertAnalysisSource(sourceResult);
  if (state) validateIntelligenceState(state);
  if (networkFingerprint(currentNetwork) !== networkFingerprint(inputNetwork(sourceResult.input))) throw new Error('The source run is stale for the current planning network. Rerun it before analyzing decisions.');
  const candidates: DecisionCandidateDefinition[] = [];
  const constrainedId = sourceResult.scenario.maxUtilizationLocationId;
  if (constrainedId && currentNetwork.locations.some((location) => location.id === constrainedId)) {
    const priorAutomaticChange = state?.decisions.some((decision) => decision.status === 'applied' && decision.authority === 'ai' && proposalLocationIds(decision.proposal).includes(constrainedId));
    if (!priorAutomaticChange) {
      const proposal: ScenarioChange[] = [{ id: `decision-capacity-5-${constrainedId}`, kind: 'adjust-capacity', locationId: constrainedId, multiplier: 1.05, effectiveDay: 0 }];
      candidates.push({
        id: candidateId(sourceResult, proposal),
        title: `Test a 5% modeled capacity increase`,
        summary: `Evaluate a bounded capacity adjustment at ${currentNetwork.locations.find((location) => location.id === constrainedId)!.name}.`,
        rationale: 'The current run identifies this location as the peak utilization constraint. The deterministic engine must measure the candidate before policy routing.',
        proposal,
        affectedLocationIds: [constrainedId],
      });
    }
    const strategicProposal: ScenarioChange[] = [{ id: `decision-capacity-20-${constrainedId}`, kind: 'adjust-capacity', locationId: constrainedId, multiplier: 1.2, effectiveDay: 0 }];
    candidates.push({
      id: candidateId(sourceResult, strategicProposal),
      title: `Evaluate a 20% modeled capacity increase`,
      summary: `Compare a larger capacity option at ${currentNetwork.locations.find((location) => location.id === constrainedId)!.name}.`,
      rationale: 'This higher-impact alternative is evaluated by the deterministic engine and always requires human approval because it exceeds the bounded automatic-change limit.',
      proposal: strategicProposal,
      affectedLocationIds: [constrainedId],
    });
  }
  for (const recommendation of sourceResult.recommendations || []) {
    if (!recommendation.proposal?.length || recommendation.proposal.some((change) => change.effectiveDay !== 0 || change.durationDays !== undefined || !['adjust-capacity', 'reassign-restaurant', 'add-lane', 'remove-lane', 'set-location-status', 'add-location'].includes(change.kind)) || candidates.some((candidate) => contentHash(candidate.proposal) === contentHash(recommendation.proposal))) continue;
    const proposal = cloneJson(recommendation.proposal);
    candidates.push({
      id: candidateId(sourceResult, proposal),
      title: recommendation.title,
      summary: recommendation.action,
      rationale: recommendation.rationale,
      proposal,
      affectedLocationIds: [...new Set([...recommendation.affectedLocationIds, ...proposalLocationIds(proposal)])].sort(),
    });
  }
  return candidates.slice(0, 4);
}

export function candidateInputFor(sourceResult: ScenarioResult, candidate: DecisionCandidateDefinition): RunInputV2 {
  assertResult(sourceResult, 'Source result');
  assertAnalysisSource(sourceResult);
  if (!candidate.proposal.length || !candidate.proposal.every(validScenarioChange)) throw new Error('Decision candidate proposal is invalid.');
  assertDurableProposal(candidate.proposal);
  const input = cloneJson(sourceResult.input);
  input.changes = [...input.changes, ...cloneJson(candidate.proposal)];
  input.scenario = { ...input.scenario, changes: cloneJson(input.changes) };
  return input;
}

function percentChange(before: number, after: number) {
  if (Math.abs(before) <= EPSILON) return after <= before + EPSILON ? 0 : Number.POSITIVE_INFINITY;
  return (after - before) / Math.abs(before) * 100;
}

function capacityEvidence(location: TwinLocation, field: string): EvidenceClassification | undefined {
  return location.fieldEvidence?.[field]?.classification ?? (location.evidence.classification === 'synthetic' || location.evidence.classification === 'user-input' ? location.evidence.classification : undefined);
}

function adjustableCapacityFields(location: TwinLocation, product?: string) {
  const fields: string[] = [];
  if (!product) for (const field of CAPACITY_FIELDS) if (location[field] !== undefined) fields.push(field);
  location.productPolicies?.forEach((policy, index) => {
    if ((!product || policy.product === product) && policy.weeklyProductionCapacity !== undefined) fields.push(`productPolicies.${index}.weeklyProductionCapacity`);
  });
  return fields;
}

function policyRoute(state: IntelligenceState, network: DecisionNetwork, proposal: ScenarioChange[], before: TwinMetrics, after: TwinMetrics) {
  const reasons: string[] = [];
  const policy = state.policy;
  const capacityOnly = proposal.every((change) => change.kind === 'adjust-capacity');
  if (!capacityOnly) reasons.push('Structural, status, route, allocation, inventory, price, or demand changes always require human approval.');
  const locationIds = proposalLocationIds(proposal);
  if (locationIds.length > policy.maxLocations) reasons.push(`The proposal affects ${locationIds.length} locations; the automatic limit is ${policy.maxLocations}.`);
  for (const change of proposal) {
    if (change.kind !== 'adjust-capacity') continue;
    const increase = (change.multiplier - 1) * 100;
    if (increase < -EPSILON || increase > policy.maxCapacityIncreasePct + EPSILON) reasons.push(`The ${increase.toFixed(1)}% capacity change exceeds the automatic 0–${policy.maxCapacityIncreasePct}% range.`);
    const location = network.locations.find((item) => item.id === change.locationId);
    if (!location) reasons.push(`The target location ${change.locationId} is missing.`);
    else {
      const fields = adjustableCapacityFields(location, change.product);
      if (!fields.length) reasons.push(`The target location ${location.name} has no explicit capacity assumption to update.`);
      if (fields.some((field) => !['synthetic', 'user-input'].includes(String(capacityEvidence(location, field))))) reasons.push(`Every automatically changed capacity field must be synthetic or user input.`);
    }
  }
  for (const change of proposal) {
    if (change.kind !== 'add-lane') continue;
    const origin = network.locations.find((item) => item.id === change.lane.originId);
    if (origin?.serviceRadiusMiles != null && change.lane.miles > origin.serviceRadiusMiles + EPSILON) reasons.push(`Lane ${change.lane.id} is ${change.lane.miles} mi, beyond the ${origin.serviceRadiusMiles} mi modeled service radius of ${origin.name}; out-of-radius changes always require human approval.`);
  }
  for (const change of proposal) {
    if (change.kind !== 'reassign-restaurant') continue;
    const origin = network.locations.find((item) => item.id === change.dcId);
    const lane = proposal.find((item): item is Extract<ScenarioChange, {kind:'add-lane'}> => item.kind === 'add-lane' && item.lane.originId === change.dcId && item.lane.destinationId === change.restaurantId)?.lane
      || network.lanes.find((item) => item.originId === change.dcId && item.destinationId === change.restaurantId && item.status !== 'inactive');
    if (origin?.serviceRadiusMiles != null && lane && lane.miles > origin.serviceRadiusMiles + EPSILON) {
      const reason = `Lane ${lane.id} is ${lane.miles} mi, beyond the ${origin.serviceRadiusMiles} mi modeled service radius of ${origin.name}; out-of-radius changes always require human approval.`;
      if (!reasons.includes(reason)) reasons.push(reason);
    }
  }
  const serviceGain = after.serviceLevel - before.serviceLevel;
  if (serviceGain + EPSILON < policy.minServiceGainPp) reasons.push(`Service gain ${serviceGain.toFixed(2)} pp is below the ${policy.minServiceGainPp.toFixed(2)} pp rule.`);
  if (after.stockoutUnits > before.stockoutUnits + EPSILON) reasons.push('The candidate increases shortage units.');
  const beatsDoNothing = after.stockoutUnits < before.stockoutUnits - EPSILON
    || after.serviceLevel > before.serviceLevel + EPSILON
    || after.totalLandedCost < before.totalLandedCost - EPSILON;
  if (!beatsDoNothing) reasons.push('The candidate does not beat doing nothing: it neither reduces shortage units, raises service, nor lowers total landed cost (including shortage penalty). Changes without a measured benefit require human approval.');
  const costIncrease = percentChange(before.totalLandedCost, after.totalLandedCost);
  if (costIncrease > policy.maxCostIncreasePct + EPSILON) reasons.push(`Cost increase ${Number.isFinite(costIncrease) ? costIncrease.toFixed(2) : 'unbounded'}% exceeds the ${policy.maxCostIncreasePct}% rule.`);
  const priorAutoLocationIds = new Set(state.decisions.filter((decision) => decision.status === 'applied' && decision.authority === 'ai').flatMap((decision) => proposalLocationIds(decision.proposal)));
  if (locationIds.some((id) => priorAutoLocationIds.has(id))) reasons.push('A prior automatic decision already changed this location; another change requires human review.');
  const low = reasons.length === 0;
  return {
    authority: low && policy.autonomyEnabled ? 'ai' as const : 'human' as const,
    risk: low ? 'low' as const : 'high' as const,
    reasons: low
      ? [policy.autonomyEnabled ? 'All bounded automatic-change rules passed.' : 'All low-risk rules passed, but autonomous application is disabled.']
      : reasons,
  };
}

function event(decisionId: string, index: number, at: string, actor: DecisionEvent['actor'], action: string, reason: string): DecisionEvent {
  return { id: `${decisionId}-event-${index}-${contentHash({ at, actor, action, reason }).slice(0, 8)}`, at, actor, action, reason };
}

export function buildDecisionRecord({ state: rawState, network, sourceResult, candidate, candidateResult, at = new Date().toISOString() }: BuildDecisionRecordInput): DecisionRecord {
  const state = validateIntelligenceState(rawState);
  if (!iso(at)) throw new Error('Decision time must be an ISO timestamp.');
  assertResult(sourceResult, 'Source result');
  assertAnalysisSource(sourceResult);
  assertResult(candidateResult, 'Candidate result');
  assertDurableProposal(candidate.proposal);
  const sourceNetworkHash = networkFingerprint(inputNetwork(sourceResult.input));
  const currentNetworkHash = networkFingerprint(network);
  if (sourceNetworkHash !== currentNetworkHash) throw new Error('The evaluated decision is stale for the current planning network. Rerun analysis.');
  const expectedCandidateInput = candidateInputFor(sourceResult, candidate);
  if (candidateResult.inputHash !== contentHash(expectedCandidateInput)) throw new Error('Candidate result does not match the proposed frozen input.');
  if (contentHash(candidateResult.input) !== candidateResult.inputHash) throw new Error('Candidate result contains a mismatched frozen input.');
  const route = policyRoute(state, network, candidate.proposal, sourceResult.scenario, candidateResult.scenario);
  const id = `decision-${contentHash({ sourceNetworkHash, sourceRunId: sourceResult.runId, proposal: candidate.proposal }).slice(0, 24)}`;
  const created = event(id, 1, at, 'rules', 'evaluated', `Deterministic candidate ${candidateResult.runId} was evaluated and routed to ${route.authority} authority.`);
  return {
    id,
    title: candidate.title,
    summary: candidate.summary,
    rationale: candidate.rationale,
    createdAt: at,
    updatedAt: at,
    createdBy: 'rules',
    status: 'awaiting-human',
    authority: route.authority,
    risk: route.risk,
    networkHash: sourceNetworkHash,
    proposal: cloneJson(candidate.proposal),
    before: cloneJson(sourceResult.scenario),
    after: cloneJson(candidateResult.scenario),
    evidence: {
      runId: sourceResult.runId,
      candidateRunId: candidateResult.runId,
      inputHash: sourceResult.inputHash,
      outputChecksum: sourceResult.outputChecksum,
      candidateInputHash: candidateResult.inputHash,
      candidateOutputChecksum: candidateResult.outputChecksum,
      engineVersion: candidateResult.engineVersion,
    },
    policyReasons: route.reasons,
    history: [created],
  };
}

function updatedEvidence(location: TwinLocation, field: string, value: unknown, decision: DecisionRecord, at: string, actor: 'ai' | 'human'): EvidenceValue<unknown> {
  const previous = location.fieldEvidence?.[field];
  const classification: EvidenceClassification = actor === 'ai' ? 'derived' : 'user-input';
  return createEvidenceValue({
    id: `evidence-${contentHash({ decisionId: decision.id, field, value, previousId: previous?.id || null }).slice(0, 24)}`,
    entityType: 'location', entityId: location.id, fieldPath: field, value,
    unit: previous?.unit ?? null,
    classification,
    confidence: classification === 'user-input' ? null : previous?.confidence ?? 1,
    sourceTitle: actor === 'ai' ? 'Decision Intelligence policy application' : 'Human-approved Decision Intelligence change',
    sourcePublisher: actor === 'ai' ? 'Flyway rules engine' : 'Workspace owner',
    verifiedAt: at,
    extractionMethod: actor === 'ai' ? 'bounded-policy-application' : 'human-approval',
    extractorVersion: 'flyway-decision-intelligence-1',
    reviewNote: `Applied decision ${decision.id}. Prior value remains referenced by provenance.`,
    supersedesId: previous?.id ?? null,
  });
}

function setNestedCapacity(location: TwinLocation, field: string, multiplier: number, decision: DecisionRecord, at: string, actor: 'ai' | 'human') {
  if (field.startsWith('productPolicies.')) {
    const [, indexText] = field.split('.');
    const index = Number(indexText);
    const policy = location.productPolicies?.[index];
    if (!policy || policy.weeklyProductionCapacity === undefined) throw new Error(`Capacity field ${field} is no longer available.`);
    const value = policy.weeklyProductionCapacity * multiplier;
    policy.weeklyProductionCapacity = value;
    location.fieldEvidence = { ...location.fieldEvidence, [field]: updatedEvidence(location, field, value, decision, at, actor) };
    return;
  }
  const key = field as typeof CAPACITY_FIELDS[number];
  const current = location[key];
  if (current === undefined) throw new Error(`Capacity field ${field} is no longer available.`);
  const value = current * multiplier;
  location[key] = value;
  location.fieldEvidence = { ...location.fieldEvidence, [field]: updatedEvidence(location, field, value, decision, at, actor) };
}

export function applyDecisionToNetwork(network: DecisionNetwork, decision: DecisionRecord, at = new Date().toISOString(), actor: 'ai' | 'human' = 'human'): DecisionNetwork {
  if (!iso(at)) throw new Error('Application time must be an ISO timestamp.');
  if (decision.evidence.engineVersion !== ENGINE_VERSION) throw new Error('The decision engine version changed. Rerun analysis before applying it.');
  if (networkFingerprint(network) !== decision.networkHash) throw new Error('Decision source is stale for the current planning network.');
  const next = cloneJson(network);
  const locations = new Map(next.locations.map((location) => [location.id, location]));
  const lanes = new Map(next.lanes.map((lane) => [lane.id, lane]));
  for (const change of decision.proposal) {
    switch (change.kind) {
      case 'adjust-capacity': {
        const location = locations.get(change.locationId);
        if (!location) throw new Error(`Decision target ${change.locationId} no longer exists.`);
        const fields = adjustableCapacityFields(location, change.product);
        if (!fields.length) throw new Error(`Decision target ${location.name} has no explicit capacity assumption to update.`);
        fields.forEach((field) => setNestedCapacity(location, field, change.multiplier, decision, at, actor));
        break;
      }
      case 'reassign-restaurant': {
        const restaurant = locations.get(change.restaurantId);
        const dc = locations.get(change.dcId);
        if (!restaurant || restaurant.type !== 'restaurant' || !dc || dc.type !== 'dc') throw new Error('Decision assignment targets are no longer valid.');
        restaurant.assignedDcId = dc.id;
        restaurant.fieldEvidence = { ...restaurant.fieldEvidence, assignedDcId: updatedEvidence(restaurant, 'assignedDcId', dc.id, decision, at, actor) };
        break;
      }
      case 'add-lane':
        if (lanes.has(change.lane.id)) throw new Error(`Lane ${change.lane.id} already exists.`);
        if (!locations.has(change.lane.originId) || !locations.has(change.lane.destinationId)) throw new Error(`Lane ${change.lane.id} references a missing location.`);
        lanes.set(change.lane.id, cloneJson(change.lane));
        break;
      case 'remove-lane':
        if (!lanes.delete(change.laneId)) throw new Error(`Lane ${change.laneId} no longer exists.`);
        break;
      case 'set-location-status': {
        const location = locations.get(change.locationId);
        if (!location) throw new Error(`Decision target ${change.locationId} no longer exists.`);
        location.status = change.status;
        location.fieldEvidence = { ...location.fieldEvidence, status: updatedEvidence(location, 'status', change.status, decision, at, actor) };
        break;
      }
      case 'add-location':
        if (locations.has(change.location.id)) throw new Error(`Location ${change.location.id} already exists.`);
        locations.set(change.location.id, cloneJson(change.location));
        break;
      default:
        throw new Error(`Decision change ${change.kind} cannot be applied as a durable planning-model edit.`);
    }
  }
  next.locations = [...locations.values()].sort((left, right) => left.id.localeCompare(right.id));
  next.lanes = [...lanes.values()].sort((left, right) => left.id.localeCompare(right.id));
  return next;
}

export function recordEvaluatedDecision(input: RecordEvaluatedDecisionInput): RecordEvaluatedDecisionResult {
  const state = validateIntelligenceState(input.state);
  assertResult(input.sourceResult, 'Source result');
  const anticipatedId = `decision-${contentHash({ sourceNetworkHash: networkFingerprint(inputNetwork(input.sourceResult.input)), sourceRunId: input.sourceResult.runId, proposal: input.candidate.proposal }).slice(0, 24)}`;
  const existing = state.decisions.find((item) => item.id === anticipatedId);
  if (existing) return { state, locations: cloneJson(input.network.locations), lanes: cloneJson(input.network.lanes), defaults: cloneJson(input.network.defaults), decision: existing, duplicate: true, autoApplied: existing.status === 'applied' && existing.authority === 'ai' };
  const decision = buildDecisionRecord({ ...input, state });
  const at = input.at || decision.createdAt;
  let network = cloneJson(input.network);
  let recorded = decision;
  if (decision.authority === 'ai') {
    network = applyDecisionToNetwork(network, decision, at, 'ai');
    recorded = {
      ...decision,
      status: 'applied',
      updatedAt: at,
      appliedNetworkHash: networkFingerprint(network),
      history: [...decision.history, event(decision.id, 2, at, 'ai', 'applied', 'All bounded policy rules passed; the planning-model change was applied automatically.')],
    };
  }
  const nextState: IntelligenceState = { ...state, revision: state.revision + 1, decisions: [recorded, ...state.decisions] };
  return { state: nextState, locations: network.locations, lanes: network.lanes, defaults: network.defaults, decision: recorded, duplicate: false, autoApplied: recorded.status === 'applied' };
}

function sameResolution(decision: DecisionRecord, resolution: DecisionResolution) {
  return (resolution === 'approve' && decision.status === 'applied')
    || (resolution === 'reject' && decision.status === 'rejected')
    || (resolution === 'defer' && decision.status === 'deferred');
}

export function resolveDecision({ state: rawState, network, decisionId, resolution, reason, expectedRevision, at = new Date().toISOString() }: ResolveDecisionInput): ResolveDecisionResult {
  const state = validateIntelligenceState(rawState);
  if (expectedRevision !== undefined && state.revision !== expectedRevision) throw new Error('Decision intelligence changed before this resolution could be saved. Reload and review the latest state.');
  if (!nonEmpty(reason)) throw new Error('A decision reason is required.');
  if (!iso(at)) throw new Error('Decision time must be an ISO timestamp.');
  const index = state.decisions.findIndex((decision) => decision.id === decisionId);
  if (index < 0) throw new Error('Decision does not exist in this workspace.');
  const current = state.decisions[index];
  if (sameResolution(current, resolution)) return { state, locations: cloneJson(network.locations), lanes: cloneJson(network.lanes), defaults: cloneJson(network.defaults), decision: current, idempotent: true };
  if (FINAL_STATUSES.has(current.status)) throw new Error(`Decision is already ${current.status} and cannot be resolved again.`);
  let nextNetwork = cloneJson(network);
  let status: DecisionRecord['status'];
  let action: string;
  if (resolution === 'approve') {
    if (networkFingerprint(network) !== current.networkHash || current.evidence.engineVersion !== ENGINE_VERSION) {
      status = 'superseded';
      action = 'superseded';
      reason = `Approval was blocked because ${current.evidence.engineVersion !== ENGINE_VERSION ? 'the decision engine version changed' : 'the planning network changed'}. ${reason}`;
    } else {
      nextNetwork = applyDecisionToNetwork(network, current, at, 'human');
      status = 'applied';
      action = 'approved-and-applied';
    }
  } else if (resolution === 'reject') {
    status = 'rejected';
    action = 'rejected';
  } else {
    status = 'deferred';
    action = 'deferred';
  }
  const updated: DecisionRecord = {
    ...current,
    status,
    updatedAt: at,
    ...(status === 'applied' ? { appliedNetworkHash: networkFingerprint(nextNetwork) } : {}),
    history: [...current.history, event(current.id, current.history.length + 1, at, 'human', action, reason.trim())],
  };
  const decisions = [...state.decisions];
  decisions[index] = updated;
  return {
    state: { ...state, revision: state.revision + 1, decisions },
    locations: nextNetwork.locations,
    lanes: nextNetwork.lanes,
    defaults: nextNetwork.defaults,
    decision: updated,
    idempotent: false,
  };
}
