import assert from 'node:assert/strict';
import {
  applyDecisionToNetwork,
  buildDecisionRecord,
  candidateInputFor,
  createIntelligenceState,
  defaultDecisionPolicy,
  generateDecisionCandidates,
  isIntelligenceState,
  networkFingerprint,
  recordEvaluatedDecision,
  resolveDecision,
  validateIntelligenceState,
  type DecisionNetwork,
} from '../src/decisionIntelligence';
import { defaultEngineDefaults, runInput, runScenario } from '../src/flywayEngine';
import type { DecisionCandidateDefinition } from '../src/intelligenceTypes';
import type { Evidence, Lane, ScenarioDefinition, TwinLocation } from '../src/flywayTypes';
import { initialLocations } from '../src/flywayData';

const product = 'Chicken' as const;
const evidence: Evidence = { classification: 'synthetic', confidence: 0, sourceTitle: 'Decision Intelligence test fixture', publisher: 'Flyway', verifiedAt: '2026-11-06', note: 'Synthetic deterministic fixture.' };
const at = '2026-11-06T12:00:00.000Z';

function fixture(): DecisionNetwork {
  const locations: TwinLocation[] = [
    { id: 'supplier', type: 'supplier', name: 'Synthetic supplier', city: 'A', state: 'GA', address: '1 A', latitude: 33, longitude: -84.2, status: 'active', products: [product], weeklyCapacity: 700, productPolicies: [{ product, baseUnit: 'case', weeklyProductionCapacity: 700 }], evidence, operatingSchedule: 'Daily' },
    { id: 'dc', type: 'dc', name: 'Synthetic DC', city: 'B', state: 'GA', address: '1 B', latitude: 33, longitude: -84.1, status: 'active', products: [product], weeklyCapacity: 700, outboundCapacityPerDay: 5, productPolicies: [{ product, baseUnit: 'case', openingInventory: 140, storageCapacity: 250, safetyStock: 0, reorderPoint: 0, orderUpTo: 0, leadTimeDays: 1 }], evidence, operatingSchedule: 'Daily' },
    { id: 'restaurant', type: 'restaurant', name: 'Synthetic restaurant', city: 'C', state: 'GA', address: '1 C', latitude: 33.05, longitude: -84.05, status: 'active', products: [product], weeklyDemand: 70, productPolicies: [{ product, baseUnit: 'case', weeklyDemand: 70 }], assignedDcId: 'dc', evidence, operatingSchedule: 'Daily' },
  ];
  const lanes: Lane[] = [
    { id: 'supplier-dc', originId: 'supplier', destinationId: 'dc', products: [product], miles: 20, transitHours: 1, deliveriesPerWeek: 7, costPerMile: 2, status: 'active', weeklyCapacity: 700, evidence },
    { id: 'dc-restaurant', originId: 'dc', destinationId: 'restaurant', products: [product], miles: 10, transitHours: 0.5, deliveriesPerWeek: 7, costPerMile: 2, status: 'active', weeklyCapacity: 700, evidence },
  ];
  return { locations, lanes, defaults: structuredClone(defaultEngineDefaults) };
}

function baselineScenario(network: DecisionNetwork): ScenarioDefinition {
  return { id: 'decision-baseline', name: 'Decision baseline', description: 'Explicit no-change baseline', type: 'price-change', targetId: 'network', magnitude: 0, grain: 'daily', horizon: 7, createdAt: at, startDate: '2026-11-09', baselineRevision: networkFingerprint(network), changes: [] };
}

function baselineResult(network: DecisionNetwork) {
  return runScenario(network.locations, network.lanes, baselineScenario(network), network.defaults);
}

function evaluate(source: ReturnType<typeof baselineResult>, candidate: DecisionCandidateDefinition) {
  return runInput(candidateInputFor(source, candidate));
}

const initial = createIntelligenceState();
for (const location of initialLocations.filter((item) => item.type === 'dc')) {
  assert.equal(location.fieldEvidence?.weeklyCapacity.classification, 'synthetic', 'Seeded operating capacity must not inherit public facility-identity evidence.');
  assert.equal(location.evidence.classification, 'corroborated', 'Adding sample capacity provenance must preserve public identity evidence.');
}
assert.deepEqual(initial.policy, defaultDecisionPolicy);
assert.equal(isIntelligenceState(initial), true);
assert.notEqual(validateIntelligenceState(initial), initial, 'Validation returns a detached value safe for pure mutation.');
assert.equal(isIntelligenceState({ ...initial, policy: { ...initial.policy, maxCapacityIncreasePct: 6 } }), false, 'Configured autonomy rules may tighten but cannot exceed conservative hard limits.');
for (const field of ['maxCapacityIncreasePct', 'maxCostIncreasePct', 'maxLocations', 'minServiceGainPp'] as const) {
  assert.equal(isIntelligenceState({ ...initial, policy: { ...initial.policy, [field]: -0.1 } }), false, `Negative ${field} cannot loosen or corrupt policy routing.`);
}
assert.equal(isIntelligenceState({ ...initial, decisions: [{ value: Number.NaN }] }), false, 'Nested non-finite state is rejected.');

const original = fixture();
const reordered: DecisionNetwork = { ...original, locations: [...original.locations].reverse(), lanes: [...original.lanes].reverse() };
assert.equal(networkFingerprint(original), networkFingerprint(reordered), 'Network identity is independent of array order.');
const changed = structuredClone(original); changed.locations[0].weeklyCapacity = 701;
assert.notEqual(networkFingerprint(original), networkFingerprint(changed), 'Operating assumptions participate in stale-input identity.');

const source = baselineResult(original);
assert.equal(source.input!.changes.length, 0);
const candidates = generateDecisionCandidates(source, original, initial);
const bounded = candidates.find((candidate) => candidate.proposal.some((change) => change.kind === 'adjust-capacity' && change.multiplier === 1.05));
const strategic = candidates.find((candidate) => candidate.proposal.some((change) => change.kind === 'adjust-capacity' && change.multiplier === 1.2));
assert.ok(bounded, 'A bounded candidate is generated from the measured utilization constraint.');
assert.ok(strategic, 'A larger evaluated alternative gives the human queue a real decision.');

const boundedResult = evaluate(source, bounded!);
const automatic = recordEvaluatedDecision({ state: initial, network: original, sourceResult: source, candidate: bounded!, candidateResult: boundedResult, at });
assert.equal(automatic.autoApplied, true);
assert.equal(automatic.decision.authority, 'ai');
assert.equal(automatic.decision.status, 'applied');
assert.ok(automatic.decision.after.serviceLevel > automatic.decision.before.serviceLevel, 'The bounded explicit-capacity fixture must measure a real service improvement.');
assert.equal(automatic.state.revision, 1);
assert.equal(automatic.decision.evidence.candidateInputHash, boundedResult.inputHash);
assert.equal(automatic.decision.evidence.candidateOutputChecksum, boundedResult.outputChecksum);
assert.equal(automatic.decision.evidence.candidateRunId, boundedResult.runId);
const targetId = (bounded!.proposal[0] as Extract<(typeof bounded)['proposal'][number], { kind: 'adjust-capacity' }>).locationId;
const beforeTarget = original.locations.find((location) => location.id === targetId)!;
const afterTarget = automatic.locations.find((location) => location.id === targetId)!;
assert.equal(afterTarget.weeklyCapacity, beforeTarget.weeklyCapacity! * 1.05);
assert.equal(afterTarget.outboundCapacityPerDay, beforeTarget.outboundCapacityPerDay! * 1.05);
assert.deepEqual(afterTarget.evidence, beforeTarget.evidence, 'Public or modeled identity evidence is not overwritten by an operating assumption change.');
assert.equal(afterTarget.fieldEvidence?.weeklyCapacity?.classification, 'derived');
assert.equal(afterTarget.fieldEvidence?.weeklyCapacity?.extractionMethod, 'bounded-policy-application');
assert.equal(original.locations.find((location) => location.id === targetId)!.weeklyCapacity, beforeTarget.weeklyCapacity, 'The source network remains immutable.');

const automaticNetwork: DecisionNetwork = { locations: automatic.locations, lanes: automatic.lanes, defaults: automatic.defaults };
assert.deepEqual(baselineResult(automaticNetwork).scenario, boundedResult.scenario, 'The applied model must reproduce the measured candidate impacts, not only change the displayed capacity.');
const duplicate = recordEvaluatedDecision({ state: automatic.state, network: automaticNetwork, sourceResult: source, candidate: bounded!, candidateResult: boundedResult, at });
assert.equal(duplicate.duplicate, true);
assert.equal(duplicate.state.revision, 1);
assert.equal(duplicate.locations.find((location) => location.id === targetId)!.weeklyCapacity, afterTarget.weeklyCapacity, 'An idempotent retry does not apply capacity twice.');

const refreshedSource = baselineResult(automaticNetwork);
const refreshedCandidates = generateDecisionCandidates(refreshedSource, automaticNetwork, automatic.state);
assert.equal(refreshedCandidates.some((candidate) => candidate.proposal.some((change) => change.kind === 'adjust-capacity' && change.multiplier === 1.05)), false, 'The same location is not changed automatically twice.');
const refreshedStrategic = refreshedCandidates.find((candidate) => candidate.proposal.some((change) => change.kind === 'adjust-capacity' && change.multiplier === 1.2))!;
const strategicResult = evaluate(refreshedSource, refreshedStrategic);
const pending = recordEvaluatedDecision({ state: automatic.state, network: automaticNetwork, sourceResult: refreshedSource, candidate: refreshedStrategic, candidateResult: strategicResult, at: '2026-11-06T12:01:00.000Z' });
assert.equal(pending.autoApplied, false);
assert.equal(pending.decision.authority, 'human');
assert.equal(pending.decision.status, 'awaiting-human');
assert.match(pending.decision.policyReasons.join(' '), /exceeds the automatic/i);

const pendingNetwork: DecisionNetwork = { locations: pending.locations, lanes: pending.lanes, defaults: pending.defaults };
const approved = resolveDecision({ state: pending.state, network: pendingNetwork, decisionId: pending.decision.id, resolution: 'approve', reason: 'Approve the modeled capacity alternative after reviewing the measured service and cost change.', expectedRevision: pending.state.revision, at: '2026-11-06T12:02:00.000Z' });
assert.equal(approved.decision.status, 'applied');
assert.deepEqual(baselineResult({locations:approved.locations,lanes:approved.lanes,defaults:approved.defaults}).scenario, strategicResult.scenario, 'Human-applied capacity must reproduce the same measured candidate metrics.');
assert.equal(approved.state.revision, pending.state.revision + 1);
const approvedAgain = resolveDecision({ state: approved.state, network: { locations: approved.locations, lanes: approved.lanes, defaults: approved.defaults }, decisionId: approved.decision.id, resolution: 'approve', reason: 'Idempotent retry.', expectedRevision: approved.state.revision, at: '2026-11-06T12:03:00.000Z' });
assert.equal(approvedAgain.idempotent, true);
assert.equal(approvedAgain.state.revision, approved.state.revision);

const staleSource = baselineResult(original);
const staleCandidate = generateDecisionCandidates(staleSource, original, { ...createIntelligenceState(), policy: { ...defaultDecisionPolicy, autonomyEnabled: false } })[0];
const staleResult = evaluate(staleSource, staleCandidate);
const held = recordEvaluatedDecision({ state: { ...createIntelligenceState(), policy: { ...defaultDecisionPolicy, autonomyEnabled: false } }, network: original, sourceResult: staleSource, candidate: staleCandidate, candidateResult: staleResult, at });
const externallyChanged = structuredClone(original); externallyChanged.locations.find((location) => location.id === 'restaurant')!.weeklyDemand = 71;
const staleResolution = resolveDecision({ state: held.state, network: externallyChanged, decisionId: held.decision.id, resolution: 'approve', reason: 'Attempt approval after another model edit.', at: '2026-11-06T12:04:00.000Z' });
assert.equal(staleResolution.decision.status, 'superseded');
assert.equal(staleResolution.locations.find((location) => location.id === 'restaurant')!.weeklyDemand, 71);
assert.match(staleResolution.decision.history.at(-1)!.reason, /planning network changed/i);
const previousEngineState = structuredClone(held.state);
previousEngineState.decisions[0].evidence.engineVersion = 'flyway-deterministic-1.0.0';
const engineChanged = resolveDecision({state:previousEngineState,network:original,decisionId:held.decision.id,resolution:'approve',reason:'Review after an engine upgrade.',at});
assert.equal(engineChanged.decision.status,'superseded','An older engine result cannot authorize a model change under a new calculation engine.');
assert.deepEqual(engineChanged.locations,original.locations);
assert.match(engineChanged.decision.history.at(-1)!.reason,/engine version changed/);

const rejectedSource = baselineResult(original);
const rejectedCandidate = generateDecisionCandidates(rejectedSource, original)[1];
const rejectedResult = evaluate(rejectedSource, rejectedCandidate);
const rejectedPending = recordEvaluatedDecision({ state: createIntelligenceState(), network: original, sourceResult: rejectedSource, candidate: rejectedCandidate, candidateResult: rejectedResult, at });
const rejected = resolveDecision({ state: rejectedPending.state, network: original, decisionId: rejectedPending.decision.id, resolution: 'reject', reason: 'The modeled cost tradeoff is outside the current plan.', at: '2026-11-06T12:05:00.000Z' });
assert.equal(rejected.decision.status, 'rejected');
assert.deepEqual(rejected.locations, original.locations);
assert.throws(() => resolveDecision({ state: rejected.state, network: original, decisionId: rejected.decision.id, resolution: 'approve', reason: 'Try to reverse final state.', at: '2026-11-06T12:06:00.000Z' }), /already rejected/i);

const statusCandidate: DecisionCandidateDefinition = {
  id: 'status-review', title: 'Place the restaurant in planned status', summary: 'Review a structural status change.', rationale: 'Structural model changes always require a person.', affectedLocationIds: ['restaurant'],
  proposal: [{ id: 'status-change', kind: 'set-location-status', locationId: 'restaurant', status: 'planned', effectiveDay: 0 }],
};
const statusResult = evaluate(source, statusCandidate);
const statusPending = recordEvaluatedDecision({ state: createIntelligenceState(), network: original, sourceResult: source, candidate: statusCandidate, candidateResult: statusResult, at });
assert.equal(statusPending.decision.authority, 'human');
assert.equal(statusPending.decision.risk, 'high');
assert.match(statusPending.decision.policyReasons.join(' '), /always require human approval/i);
const statusApplied = resolveDecision({ state: statusPending.state, network: original, decisionId: statusPending.decision.id, resolution: 'approve', reason: 'The workspace owner approves this modeled status assumption.', at: '2026-11-06T12:05:30.000Z' });
const plannedRestaurant = statusApplied.locations.find((location) => location.id === 'restaurant')!;
assert.equal(plannedRestaurant.status, 'planned');
assert.equal(plannedRestaurant.fieldEvidence?.status?.classification, 'user-input');
assert.equal(original.locations.find((location) => location.id === 'restaurant')!.status, 'active');

const invalidAddedLocation = { ...structuredClone(original.locations[2]), id: 'invalid-added-location', products: ['Unsupported product'], weeklyCapacity: -1 };
const invalidLocationChange = { id: 'invalid-location', kind: 'add-location', location: invalidAddedLocation, effectiveDay: 0 } as unknown as DecisionCandidateDefinition['proposal'][number];
const invalidLocationState = { ...statusPending.state, decisions: [{ ...statusPending.decision, proposal: [invalidLocationChange] }] };
assert.equal(isIntelligenceState(invalidLocationState), false, 'Persisted add-location payloads are deeply validated, including product and nonnegative operating fields.');
assert.throws(() => candidateInputFor(source, { id: 'invalid-location-candidate', title: 'Invalid', summary: 'Invalid', rationale: 'Invalid', affectedLocationIds: [], proposal: [invalidLocationChange] }), /proposal is invalid/i);
const invalidAddedLane = { ...structuredClone(original.lanes[0]), id: 'invalid-added-lane', weeklyCapacity: -10, deliveryWindow: { startHour: 20, endHour: 4 } };
const invalidLaneChange = { id: 'invalid-lane', kind: 'add-lane', lane: invalidAddedLane, effectiveDay: 0 } as unknown as DecisionCandidateDefinition['proposal'][number];
assert.equal(isIntelligenceState({ ...statusPending.state, decisions: [{ ...statusPending.decision, proposal: [invalidLaneChange] }] }), false, 'Persisted add-lane payloads reject negative capacity and invalid operating windows.');
assert.throws(() => candidateInputFor(source, { id: 'invalid-lane-candidate', title: 'Invalid', summary: 'Invalid', rationale: 'Invalid', affectedLocationIds: [], proposal: [invalidLaneChange] }), /proposal is invalid/i);
const claimedPublicLocation = { ...structuredClone(original.locations[2]), id: 'claimed-public-location', evidence: { ...evidence, classification: 'corroborated' as const } };
const publicClaimChange = { id: 'public-claim', kind: 'add-location', location: claimedPublicLocation, effectiveDay: 0 } as const;
assert.throws(() => candidateInputFor(source, { id: 'public-claim-candidate', title: 'Claim public identity', summary: 'Invalid public claim', rationale: 'AI cannot establish public facts.', affectedLocationIds: [], proposal: [publicClaimChange] }), /cannot establish.*public/i);

const frozenSource = structuredClone(source), frozenCandidate = structuredClone(bounded!), frozenResult = structuredClone(boundedResult);
const frozenRecord = buildDecisionRecord({ state: createIntelligenceState(), network: original, sourceResult: frozenSource, candidate: frozenCandidate, candidateResult: frozenResult, at });
const frozenBefore = structuredClone(frozenRecord.before), frozenAfter = structuredClone(frozenRecord.after), frozenProposal = structuredClone(frozenRecord.proposal), frozenEvidence = structuredClone(frozenRecord.evidence);
frozenSource.scenario.serviceLevel = 0;
frozenResult.scenario.serviceLevel = 0;
(frozenCandidate.proposal[0] as Extract<DecisionCandidateDefinition['proposal'][number], {kind:'adjust-capacity'}>).multiplier = 9;
assert.deepEqual(frozenRecord.before, frozenBefore);
assert.deepEqual(frozenRecord.after, frozenAfter);
assert.deepEqual(frozenRecord.proposal, frozenProposal);
assert.deepEqual(frozenRecord.evidence, frozenEvidence, 'Decision calculation evidence is frozen independently of caller-owned results.');

const invalidCandidate: DecisionCandidateDefinition = { id: 'unsupported', title: 'Temporary price', summary: 'Unsupported', rationale: 'Regression', affectedLocationIds: [], proposal: [{ id: 'price', kind: 'adjust-price', multiplier: 1.01, effectiveDay: 0 }] };
assert.throws(() => candidateInputFor(source, invalidCandidate), /not a supported durable/i, 'The queue cannot contain an approval that the durable model cannot apply.');
const temporaryCandidate: DecisionCandidateDefinition = { ...bounded!, id: 'temporary', proposal: [{ ...(bounded!.proposal[0] as Extract<(typeof bounded)['proposal'][number], {kind:'adjust-capacity'}>), durationDays: 2 }] };
assert.throws(() => candidateInputFor(source, temporaryCandidate), /cannot contain a temporary duration/i);

const disrupted = runScenario(original.locations, original.lanes, { ...baselineScenario(original), id: 'disrupted', type: 'demand-surge', targetId: 'restaurant', magnitude: 25, changes: [{ id: 'surge', kind: 'adjust-demand', locationId: 'restaurant', multiplier: 1.25, effectiveDay: 0 }] }, original.defaults);
assert.throws(() => generateDecisionCandidates(disrupted, original), /explicit no-change planning baseline/i, 'A disruption context cannot silently become the durable planning baseline.');
assert.throws(() => buildDecisionRecord({ state: createIntelligenceState(), network: original, sourceResult: source, candidate: bounded!, candidateResult: { ...boundedResult, inputHash: 'tampered' }, at }), /input identity does not match|does not match the proposed frozen input/i);
assert.throws(() => applyDecisionToNetwork(externallyChanged, held.decision, at, 'human'), /stale/i);

console.log('Decision Intelligence domain passed evaluated candidate generation, bounded automatic application, human approval/rejection, provenance, deep validation, idempotency, and stale/unsupported decision safety.');
