import type { EngineDefaults, Lane, LocationImpact, Recommendation, RunInputV2, ScenarioChange, ScenarioDefinition, ScenarioResult, TwinLocation, TwinMetrics } from './flywayTypes';
import { cloneJson, contentHash } from './engine/canonical';
import { createRunInput, defaultEngineDefaults, ENGINE_BUILD_DIGEST, ENGINE_VERSION, impactsBetween, simulateInput, type RunInputLineageOptions, type SimulationCore } from './engine/simulator';

export { createRunInput, defaultEngineDefaults, ENGINE_BUILD_DIGEST, ENGINE_VERSION };
export type { RunInputLineageOptions };

const EPSILON = 1e-7;
const round = (value: number, precision = 2) => Math.round((value + Number.EPSILON) * 10 ** precision) / 10 ** precision;

function baselineInputFor(input: RunInputV2): RunInputV2 {
  const baseline = cloneJson(input);
  baseline.changes = [];
  baseline.scenario = { ...baseline.scenario, changes: [] };
  return baseline;
}

function distanceMiles(left: TwinLocation, right: TwinLocation) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const value = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return round(3_958.8 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value)), 1);
}

function withProposal(input: RunInputV2, proposal: ScenarioChange[]) {
  const candidate = cloneJson(input);
  candidate.changes = [...candidate.changes, ...cloneJson(proposal)];
  candidate.scenario = { ...candidate.scenario, changes: cloneJson(candidate.changes) };
  return candidate;
}

function chunkHashes<T>(values: T[], chunkSize = 512) {
  const hashes: string[] = [];
  for (let index = 0; index < values.length; index += chunkSize) hashes.push(contentHash(values.slice(index, index + chunkSize)));
  return hashes;
}

function coreChecksum(core: SimulationCore) {
  return contentHash({
    metrics: core.metrics,
    productMetrics: core.productMetrics,
    costBreakdown: core.costBreakdown,
    conservationDeltaByProduct: core.diagnostics.conservationDeltaByProduct,
    invalidTargets: core.diagnostics.invalidTargets,
    periodMetricChunkHashes: chunkHashes(core.periodMetrics),
    warningChunkHashes: chunkHashes(core.diagnostics.warnings),
    bindingConstraintChunkHashes: chunkHashes(core.diagnostics.bindingConstraints),
  });
}

function simulationChecksum(baseline: SimulationCore, scenario: SimulationCore) {
  return contentHash({ engineVersion: ENGINE_VERSION, baselineCoreHash: coreChecksum(baseline), scenarioCoreHash: coreChecksum(scenario), impactsHash: contentHash(impactsBetween(baseline, scenario)) });
}

function evaluateProposal(input: RunInputV2, baseline: SimulationCore, scenarioCore: SimulationCore, proposal: ScenarioChange[]) {
  const candidateInput = withProposal(input, proposal);
  const core = simulateInput(candidateInput);
  const inputHash = contentHash(candidateInput);
  return { input: candidateInput, core, serviceDelta: round(core.metrics.serviceLevel - scenarioCore.metrics.serviceLevel, 1), costDelta: core.metrics.totalLandedCost - scenarioCore.metrics.totalLandedCost, inputHash, outputChecksum: simulationChecksum(baseline, core) };
}

function recommendationCandidates(input: RunInputV2, baseline: SimulationCore, scenario: SimulationCore): Recommendation[] {
  if (scenario.metrics.serviceLevel >= baseline.metrics.serviceLevel - EPSILON && scenario.metrics.stockoutUnits <= baseline.metrics.stockoutUnits) return [];
  const shortageByRestaurant = (core: SimulationCore) => core.periodMetrics.filter((row) => row.locationType === 'restaurant').reduce((map, row) => map.set(row.locationId, (map.get(row.locationId) || 0) + row.stockoutQuantity), new Map<string, number>());
  const scenarioShortages = shortageByRestaurant(scenario);
  const baselineShortages = shortageByRestaurant(baseline);
  const affectedIds = [...scenarioShortages.entries()].filter(([id, quantity]) => quantity > (baselineShortages.get(id) || 0) + EPSILON).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id);
  const locations = new Map(input.locations.map((location) => [location.id, location]));
  const restaurants = affectedIds.map((id) => locations.get(id)).filter((location): location is TwinLocation => location?.type === 'restaurant');
  const activeDcs = input.locations.filter((location) => location.type === 'dc' && location.status === 'active').sort((a, b) => a.id.localeCompare(b.id));
  const recommendations: Recommendation[] = [];

  for (const alternate of activeDcs) {
    const eligible = restaurants.filter((restaurant) => restaurant.assignedDcId !== alternate.id);
    if (!eligible.length) continue;
    const proposal: ScenarioChange[] = [];
    const proposedRestaurants: TwinLocation[] = [];
    for (const restaurant of eligible) {
      const existing = input.lanes.some((lane) => lane.originId === alternate.id && lane.destinationId === restaurant.id && lane.status !== 'inactive');
      if (!existing) {
        const products = alternate.products.filter((product) => restaurant.products.includes(product));
        if (!products.length) continue;
        const miles = distanceMiles(alternate, restaurant);
        if (alternate.serviceRadiusMiles != null && miles > alternate.serviceRadiusMiles) continue;
        const transitHours = round(Math.max(0.5, miles / 48), 2);
        if (transitHours * 2 + 0.75 > 14) continue;
        const weeklyDemand = restaurant.productPolicies?.reduce((sum, policy) => sum + (policy.weeklyDemand || 0), 0) || restaurant.weeklyDemand || 0;
        const lane: Lane = {
          id: `rec-lane-${alternate.id}-${restaurant.id}`, originId: alternate.id, destinationId: restaurant.id, products,
          miles, transitHours, deliveriesPerWeek: 7, costPerMile: 2.65, status: 'active',
          weeklyCapacity: Math.max(1, weeklyDemand * 1.25), vehicleCapacity: input.defaults.defaultVehicleCapacity,
          vehicleType: { id: 'modeled-refrigerated-box', name: 'Modeled refrigerated box truck', capacity: input.defaults.defaultVehicleCapacity, fixedCostMicros: 0 },
          dwellHours: 0.75, maxDriverHours: 14, deliveryWindow: { startHour: 4, endHour: 18 }, receivingWindow: { startHour: 4, endHour: 18 }, fuelEconomyMpg: 8,
          evidence: { classification: 'derived', confidence: null, sourceTitle: 'Evaluated scenario recommendation', publisher: 'Flyway deterministic engine', verifiedAt: input.startDate, note: 'Candidate lane generated from the frozen scenario input; it is not a public operating fact.' },
        };
        proposal.push({ id: `rec-add-lane-${alternate.id}-${restaurant.id}`, kind: 'add-lane', lane, effectiveDay: 0 });
      }
      proposal.push({ id: `rec-reassign-${alternate.id}-${restaurant.id}`, kind: 'reassign-restaurant', restaurantId: restaurant.id, dcId: alternate.id, effectiveDay: 0 });
      proposedRestaurants.push(restaurant);
    }
    if (!proposedRestaurants.length) continue;
    const evaluated = evaluateProposal(input, baseline, scenario, proposal);
    if (evaluated.serviceDelta <= EPSILON) continue;
    recommendations.push({
      id: `rec-reassign-${input.scenario.id}-${alternate.id}`, title: `Evaluate service through ${alternate.name}`,
      action: `Reassign ${proposedRestaurants.length} impacted restaurant${proposedRestaurants.length === 1 ? '' : 's'} and activate the modeled lanes in this proposal.`,
      rationale: `A deterministic candidate rerun of the frozen input improves service by ${evaluated.serviceDelta.toFixed(1)} points at a modeled cost change of ${evaluated.costDelta >= 0 ? '+' : '−'}$${Math.abs(evaluated.costDelta).toLocaleString()}.`,
      serviceDelta: evaluated.serviceDelta, costDelta: evaluated.costDelta, confidence: 'Medium', affectedLocationIds: proposedRestaurants.map((location) => location.id), proposal,
      candidateInputHash: evaluated.inputHash, candidateOutputChecksum: evaluated.outputChecksum,
      constraintsConsidered: ['Product compatibility', 'DC status and calendar', 'Lane capacity', 'Vehicle capacity', 'Driver hours', 'Delivery and receiving windows', 'Inventory availability'],
    });
  }

  const constrainedLocationId = scenario.metrics.maxUtilizationLocationId;
  if (constrainedLocationId && locations.has(constrainedLocationId)) {
    const proposal: ScenarioChange[] = [{ id: `rec-capacity-${constrainedLocationId}`, kind: 'adjust-capacity', locationId: constrainedLocationId, multiplier: 1.25, effectiveDay: 0 }];
    const evaluated = evaluateProposal(input, baseline, scenario, proposal);
    if (evaluated.serviceDelta > EPSILON) recommendations.push({
      id: `rec-capacity-${input.scenario.id}-${constrainedLocationId}`, title: `Add modeled capacity at ${locations.get(constrainedLocationId)!.name}`,
      action: 'Evaluate a 25% inbound and outbound capacity increment for the active scenario window.', rationale: `The frozen candidate rerun improves service by ${evaluated.serviceDelta.toFixed(1)} points.`,
      serviceDelta: evaluated.serviceDelta, costDelta: evaluated.costDelta, confidence: 'Medium', affectedLocationIds: affectedIds, proposal,
      candidateInputHash: evaluated.inputHash, candidateOutputChecksum: evaluated.outputChecksum,
      constraintsConsidered: ['DC inbound capacity', 'DC outbound capacity', 'Inventory availability', 'Lane capacity'],
    });
  }

  return recommendations.sort((a, b) => b.serviceDelta - a.serviceDelta || a.costDelta - b.costDelta || a.id.localeCompare(b.id))
    .filter((candidate, index, values) => !values.slice(0, index).some((other) => other.serviceDelta >= candidate.serviceDelta && other.costDelta <= candidate.costDelta)).slice(0, 3);
}

export function runInput(sourceInput: RunInputV2): ScenarioResult {
  const input = cloneJson(sourceInput);
  const inputHash = contentHash(input);
  const baseline = simulateInput(baselineInputFor(input));
  const scenario = simulateInput(input);
  const impacts = impactsBetween(baseline, scenario);
  const recommendations = recommendationCandidates(input, baseline, scenario);
  const serviceDelta = round(scenario.metrics.serviceLevel - baseline.metrics.serviceLevel, 1);
  const costDelta = scenario.metrics.totalLandedCost - baseline.metrics.totalLandedCost;
  const body: Omit<ScenarioResult, 'runId' | 'completedAt' | 'outputChecksum'> = {
    engineVersion: ENGINE_VERSION, inputHash, baseline: baseline.metrics, scenario: scenario.metrics, impacts, recommendations,
    narrative: `Modeled service is ${scenario.metrics.serviceLevel.toFixed(1)}%, ${Math.abs(serviceDelta).toFixed(1)} points ${serviceDelta >= 0 ? 'above' : 'below'} baseline. ${scenario.metrics.affectedRestaurants} restaurant${scenario.metrics.affectedRestaurants === 1 ? '' : 's'} experience unmet product-period demand, and total landed cost changes by ${costDelta >= 0 ? '+' : '−'}$${Math.abs(costDelta).toLocaleString()} over the modeled horizon.`,
    input, baselinePeriodMetrics: baseline.periodMetrics, periodMetrics: scenario.periodMetrics, productMetrics: scenario.productMetrics,
    baselineCostBreakdown: baseline.costBreakdown, costBreakdown: scenario.costBreakdown, diagnostics: scenario.diagnostics,
  };
  return { runId: `run-${inputHash.slice(0, 16)}`, completedAt: new Date().toISOString(), ...body, outputChecksum: simulationChecksum(baseline, scenario) };
}

export const replayRun = (input: RunInputV2) => runInput(cloneJson(input));

export function applyRecommendationProposal(source: RunInputV2 | ScenarioResult, recommendation: Recommendation) {
  const sourceInput = 'schemaVersion' in source ? source : source.input;
  if (!sourceInput) throw new Error('The source result does not contain its frozen run input.');
  if (!recommendation.proposal?.length) throw new Error('The recommendation does not contain an executable proposal.');
  const result = runInput(withProposal(sourceInput, recommendation.proposal));
  if (recommendation.candidateInputHash && recommendation.candidateInputHash !== result.inputHash) throw new Error('Recommendation input no longer matches its evaluated frozen candidate.');
  return result;
}

export function calculateMetrics(locations: TwinLocation[], lanes: Lane[], scenario?: ScenarioDefinition, defaults?: Partial<EngineDefaults>) {
  const previewGrain = defaults?.defaultGrain || defaultEngineDefaults.defaultGrain;
  const effectiveScenario: ScenarioDefinition = scenario || { id: 'baseline-evaluation', name: 'Baseline evaluation', description: 'No-change deterministic baseline.', type: 'price-change', targetId: 'network', magnitude: 0, grain: previewGrain, horizon: previewGrain === 'daily' ? 14 : 4, createdAt: defaultEngineDefaults.startDate, baselineRevision: 'working-baseline', startDate: defaults?.startDate, changes: [] };
  const input = createRunInput(locations, lanes, effectiveScenario, defaults);
  const core = simulateInput(input);
  const trace = { metrics: core.metrics, periodMetrics: core.periodMetrics, productMetrics: core.productMetrics, costBreakdown: core.costBreakdown, diagnostics: core.diagnostics, grain: input.grain, horizon: input.horizon, startDate: input.startDate };
  if (!scenario) return { ...trace, impacts: [] as LocationImpact[] };
  const baseline = simulateInput(baselineInputFor(input));
  return { ...trace, impacts: impactsBetween(baseline, core) };
}

export function runScenario(locations: TwinLocation[], lanes: Lane[], scenario: ScenarioDefinition, defaults?: Partial<EngineDefaults>, lineage?: RunInputLineageOptions) {
  return runInput(createRunInput(locations, lanes, scenario, defaults, lineage));
}
