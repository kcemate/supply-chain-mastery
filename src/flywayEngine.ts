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

function simulationChecksum(baseline: SimulationCore, scenario: SimulationCore, defaults: EngineDefaults) {
  return contentHash({ engineVersion: ENGINE_VERSION, baselineCoreHash: coreChecksum(baseline), scenarioCoreHash: coreChecksum(scenario), impactsHash: contentHash(impactsBetween(baseline, scenario, defaults)) });
}

function evaluateProposal(input: RunInputV2, baseline: SimulationCore, scenarioCore: SimulationCore, proposal: ScenarioChange[]) {
  const candidateInput = withProposal(input, proposal);
  const core = simulateInput(candidateInput);
  const inputHash = contentHash(candidateInput);
  return { input: candidateInput, core, serviceDelta: round(core.metrics.serviceLevel - scenarioCore.metrics.serviceLevel, 1), costDelta: core.metrics.totalLandedCost - scenarioCore.metrics.totalLandedCost, inputHash, outputChecksum: simulationChecksum(baseline, core, candidateInput.defaults) };
}

// Fictional planning assumption used only for explicitly labeled out-of-radius contingency lanes.
// It is not a compliance determination; a human must validate any operating-hours plan before use.
const TEAM_DRIVER_HOURS = 22;
const LONG_HAUL_DWELL_HOURS = 0.75;

interface DcDisruptionWindow { dcId: string; effectiveDay: number; durationDays?: number }

function routeOptionsFor(input: RunInputV2) {
  const byOrigin = new Map<string, Map<string, Lane[]>>();
  for (const lane of input.lanes) {
    if (lane.status === 'inactive') continue;
    const destinations = byOrigin.get(lane.originId) || new Map<string, Lane[]>();
    const routes = destinations.get(lane.destinationId) || [];
    routes.push(lane);
    destinations.set(lane.destinationId, routes);
    byOrigin.set(lane.originId, destinations);
  }
  return (dc: TwinLocation, restaurant: TwinLocation) => {
    const products = dc.products.filter((product) => restaurant.products.includes(product));
    const existing = (byOrigin.get(dc.id)?.get(restaurant.id) || []).filter((lane) => lane.products.some((product) => products.includes(product)));
    // Treat a path conservatively if any of its product-compatible modeled lanes exceeds the radius.
    const miles = existing.length ? Math.max(...existing.map((lane) => lane.miles)) : distanceMiles(dc, restaurant);
    return { dc, products, miles, hasExistingLane: existing.length > 0 };
  };
}

function dcDisruptionWindows(input: RunInputV2) {
  const dcIds = new Set(input.locations.filter((location) => location.type === 'dc').map((location) => location.id));
  const windows = new Map<string, DcDisruptionWindow>();
  const changes = [...input.changes].sort((a, b) => a.effectiveDay - b.effectiveDay || a.id.localeCompare(b.id));
  for (const change of changes) {
    if (change.kind !== 'set-location-status' || !['unavailable', 'closed'].includes(change.status) || !dcIds.has(change.locationId) || windows.has(change.locationId)) continue;
    windows.set(change.locationId, { dcId: change.locationId, effectiveDay: change.effectiveDay, ...(change.durationDays != null ? { durationDays: change.durationDays } : {}) });
  }
  return windows;
}

function windowsOverlap(left: DcDisruptionWindow, right: DcDisruptionWindow) {
  const leftEnd = left.durationDays == null ? Number.POSITIVE_INFINITY : left.effectiveDay + left.durationDays;
  const rightEnd = right.durationDays == null ? Number.POSITIVE_INFINITY : right.effectiveDay + right.durationDays;
  return left.effectiveDay < rightEnd && right.effectiveDay < leftEnd;
}

/**
 * When a scenario makes a DC unavailable and no in-radius alternate improves service, evaluate a temporary
 * reassignment of the impacted restaurants to the nearest active DCs even though those DCs are beyond their
 * modeled service radius. Each proposal is rerun by the deterministic engine, kept only if service improves,
 * labeled as exceeding the service radius, and marked as requiring human approval.
 */
function outOfRadiusRecommendations(input: RunInputV2, baseline: SimulationCore, scenario: SimulationCore, restaurants: TwinLocation[], activeDcs: TwinLocation[], routeFor: ReturnType<typeof routeOptionsFor>): Recommendation[] {
  const windows = dcDisruptionWindows(input);
  if (!windows.size) return [];
  const restaurantWindows = restaurants.flatMap((restaurant) => {
    const window = restaurant.assignedDcId ? windows.get(restaurant.assignedDcId) : undefined;
    if (!window || input.changes.some((change) => change.kind === 'reassign-restaurant' && change.restaurantId === restaurant.id)) return [];
    return [{ restaurant, window }];
  });
  if (!restaurantWindows.length) return [];
  const weeklyDemandOf = (restaurant: TwinLocation) => restaurant.productPolicies?.reduce((sum, policy) => sum + (policy.weeklyDemand || 0), 0) || restaurant.weeklyDemand || 0;
  const options = restaurantWindows.map(({ restaurant, window }) => ({
    restaurant, window,
    alternates: activeDcs
      .filter((dc) => dc.id !== restaurant.assignedDcId && !(windows.has(dc.id) && windowsOverlap(windows.get(dc.id)!, window)))
      .map((dc) => routeFor(dc, restaurant))
      .filter((option) => option.products.length && (option.hasExistingLane || round(Math.max(0.5, option.miles / 48), 2) * 2 + LONG_HAUL_DWELL_HOURS <= TEAM_DRIVER_HOURS))
      .sort((a, b) => a.miles - b.miles || a.dc.id.localeCompare(b.dc.id)),
  })).filter((option) => option.alternates.length);
  if (!options.length) return [];

  const nearest = options.map((option) => ({ ...option, choice: option.alternates[0] }));
  const load = new Map<string, number>();
  const balanced = [...options].sort((a, b) => a.restaurant.id.localeCompare(b.restaurant.id)).map((option) => {
    const pair = option.alternates.slice(0, 2);
    const choice = pair.reduce((best, candidate) => (load.get(candidate.dc.id) || 0) < (load.get(best.dc.id) || 0) - EPSILON ? candidate : best, pair[0]);
    load.set(choice.dc.id, (load.get(choice.dc.id) || 0) + weeklyDemandOf(option.restaurant));
    return { ...option, choice };
  });
  const variants = [{ key: 'nearest', plan: nearest }, { key: 'two-nearest', plan: balanced }]
    .filter((variant, index, values) => index === 0 || values[0].plan.some((item) => !variant.plan.some((other) => other.restaurant.id === item.restaurant.id && other.choice.dc.id === item.choice.dc.id)));

  const recommendations: Recommendation[] = [];
  for (const variant of variants) {
    const proposal: ScenarioChange[] = [];
    const beyond = new Map<string, { dc: TwinLocation; count: number; minMiles: number; maxMiles: number }>();
    for (const { restaurant, window, choice } of [...variant.plan].sort((a, b) => a.restaurant.id.localeCompare(b.restaurant.id))) {
      const { dc, miles, products, hasExistingLane } = choice;
      const outsideRadius = dc.serviceRadiusMiles != null && miles > dc.serviceRadiusMiles;
      if (outsideRadius) {
        const entry = beyond.get(dc.id) || { dc, count: 0, minMiles: miles, maxMiles: miles };
        beyond.set(dc.id, { dc, count: entry.count + 1, minMiles: Math.min(entry.minMiles, miles), maxMiles: Math.max(entry.maxMiles, miles) });
      }
      if (!hasExistingLane) {
        const transitHours = round(Math.max(0.5, miles / 48), 2);
        const lane: Lane = {
          id: `rec-longhaul-lane-${dc.id}-${restaurant.id}`, originId: dc.id, destinationId: restaurant.id, products,
          miles, transitHours, deliveriesPerWeek: 7, costPerMile: 2.65, status: 'active',
          weeklyCapacity: Math.max(1, weeklyDemandOf(restaurant) * 1.25), vehicleCapacity: input.defaults.defaultVehicleCapacity,
          vehicleType: { id: 'modeled-team-refrigerated-tractor', name: 'Modeled team-driver refrigerated tractor', capacity: input.defaults.defaultVehicleCapacity, fixedCostMicros: 0 },
          dwellHours: LONG_HAUL_DWELL_HOURS, maxDriverHours: TEAM_DRIVER_HOURS, fuelEconomyMpg: 6.5,
          evidence: { classification: 'derived', confidence: null, sourceTitle: 'Evaluated outage contingency recommendation', publisher: 'Flyway deterministic engine', verifiedAt: input.startDate, note: `Contingency lane generated from the frozen scenario input. ${outsideRadius ? 'It exceeds the modeled service radius. ' : ''}It assumes a two-driver team (${TEAM_DRIVER_HOURS} modeled hours) with no delivery or receiving window and uses sample cost estimates. It is not a public operating fact and requires human approval.` },
        };
        proposal.push({ id: `rec-add-longhaul-lane-${dc.id}-${restaurant.id}`, kind: 'add-lane', lane, effectiveDay: window.effectiveDay, ...(window.durationDays != null ? { durationDays: window.durationDays } : {}) });
      }
      proposal.push({ id: `rec-temporary-reassign-${dc.id}-${restaurant.id}`, kind: 'reassign-restaurant', restaurantId: restaurant.id, dcId: dc.id, effectiveDay: window.effectiveDay, ...(window.durationDays != null ? { durationDays: window.durationDays } : {}) });
    }
    const evaluated = evaluateProposal(input, baseline, scenario, proposal);
    if (evaluated.serviceDelta <= EPSILON) continue;
    const dcNames = [...new Set(variant.plan.map((item) => item.choice.dc.name))].sort();
    const restaurantCount = variant.plan.length;
    const windowLabel = [...new Set(variant.plan.map(({ window }) => window.durationDays != null ? `scenario days ${window.effectiveDay + 1}–${window.effectiveDay + window.durationDays}` : `scenario day ${window.effectiveDay + 1} through the end of the run`))].join(', ');
    const transportAssumption = proposal.some((change) => change.kind === 'add-lane') ? 'New lanes assume a two-driver team and sample cost estimates.' : 'Existing lanes retain their modeled transport and cost assumptions.';
    recommendations.push({
      id: `rec-longhaul-${variant.key}-${input.scenario.id}`,
      title: beyond.size ? `Temporary out-of-radius reassignment through ${dcNames.join(' and ')} (exceeds modeled service radius)` : `Temporary outage reassignment through ${dcNames.join(' and ')}`,
      action: `Temporarily reassign ${restaurantCount} restaurant${restaurantCount === 1 ? '' : 's'} served by the unavailable DC to ${dcNames.join(' and ')} for ${windowLabel}. ${beyond.size ? 'This exceeds the modeled service radius and requires' : 'This contingency requires'} human approval before any operational use.`,
      rationale: `No ordinary in-radius alternate improved service. A deterministic candidate rerun of the frozen input improves service by ${evaluated.serviceDelta.toFixed(1)} points at a modeled cost change of ${evaluated.costDelta >= 0 ? '+' : '−'}$${Math.abs(evaluated.costDelta).toLocaleString('en-US')}. Beyond modeled service radius: ${beyond.size ? [...beyond.values()].sort((a, b) => a.dc.id.localeCompare(b.dc.id)).map((entry) => `${entry.count} restaurant${entry.count === 1 ? '' : 's'} at ${Math.round(entry.minMiles).toLocaleString('en-US')}–${Math.round(entry.maxMiles).toLocaleString('en-US')} mi from ${entry.dc.name} (radius ${entry.dc.serviceRadiusMiles!.toLocaleString('en-US')} mi)`).join('; ') : 'none'}. ${transportAssumption}`,
      serviceDelta: evaluated.serviceDelta, costDelta: evaluated.costDelta, confidence: 'Low', affectedLocationIds: variant.plan.map((item) => item.restaurant.id).sort(), proposal,
      candidateInputHash: evaluated.inputHash, candidateOutputChecksum: evaluated.outputChecksum,
      constraintsConsidered: ['Product compatibility', 'DC status and calendar', 'Disruption window', 'Lane capacity', 'Vehicle capacity', 'Team-driver hours', 'Inventory availability'],
      rejectedAlternatives: ['In-radius alternate DCs did not improve modeled service.'],
      exceedsServiceRadius: beyond.size > 0,
      requiresHumanApproval: true,
    });
  }
  return recommendations;
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
  const disruptionWindows = dcDisruptionWindows(input);
  const routeFor = routeOptionsFor(input);
  const recommendations: Recommendation[] = [];

  for (const alternate of activeDcs) {
    const eligible = restaurants.filter((restaurant) => restaurant.assignedDcId !== alternate.id);
    if (!eligible.length) continue;
    const proposal: ScenarioChange[] = [];
    const proposedRestaurants: TwinLocation[] = [];
    for (const restaurant of eligible) {
      const { products, miles, hasExistingLane } = routeFor(alternate, restaurant);
      if (!products.length) continue;
      // Existing lanes do not waive the modeled service-radius policy. Beyond-radius candidates must
      // pass through the explicitly labeled, human-gated contingency path below.
      if (alternate.serviceRadiusMiles != null && miles > alternate.serviceRadiusMiles) continue;
      const sourceWindow = restaurant.assignedDcId ? disruptionWindows.get(restaurant.assignedDcId) : undefined;
      const alternateWindow = disruptionWindows.get(alternate.id);
      if (sourceWindow && alternateWindow && windowsOverlap(sourceWindow, alternateWindow)) continue;
      const timing = { effectiveDay: sourceWindow?.effectiveDay ?? 0, ...(sourceWindow?.durationDays != null ? { durationDays: sourceWindow.durationDays } : {}) };
      if (!hasExistingLane) {
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
        proposal.push({ id: `rec-add-lane-${alternate.id}-${restaurant.id}`, kind: 'add-lane', lane, ...timing });
      }
      proposal.push({ id: `rec-reassign-${alternate.id}-${restaurant.id}`, kind: 'reassign-restaurant', restaurantId: restaurant.id, dcId: alternate.id, ...timing });
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

  if (!recommendations.length) recommendations.push(...outOfRadiusRecommendations(input, baseline, scenario, restaurants, activeDcs, routeFor));

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
  const impacts = impactsBetween(baseline, scenario, input.defaults);
  const recommendations = recommendationCandidates(input, baseline, scenario);
  const serviceDelta = round(scenario.metrics.serviceLevel - baseline.metrics.serviceLevel, 1);
  const costDelta = scenario.metrics.totalLandedCost - baseline.metrics.totalLandedCost;
  const body: Omit<ScenarioResult, 'runId' | 'completedAt' | 'outputChecksum'> = {
    engineVersion: ENGINE_VERSION, inputHash, baseline: baseline.metrics, scenario: scenario.metrics, impacts, recommendations,
    narrative: `Modeled service is ${scenario.metrics.serviceLevel.toFixed(1)}%, ${Math.abs(serviceDelta).toFixed(1)} points ${serviceDelta >= 0 ? 'above' : 'below'} baseline. ${scenario.metrics.affectedRestaurants} restaurant${scenario.metrics.affectedRestaurants === 1 ? '' : 's'} experience unmet product-period demand, and total landed cost changes by ${costDelta >= 0 ? '+' : '−'}$${Math.abs(costDelta).toLocaleString()} over the modeled horizon.`,
    input, baselinePeriodMetrics: baseline.periodMetrics, periodMetrics: scenario.periodMetrics, productMetrics: scenario.productMetrics,
    baselineCostBreakdown: baseline.costBreakdown, costBreakdown: scenario.costBreakdown, diagnostics: scenario.diagnostics,
  };
  return { runId: `run-${inputHash.slice(0, 16)}`, completedAt: new Date().toISOString(), ...body, outputChecksum: simulationChecksum(baseline, scenario, input.defaults) };
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
  return { ...trace, impacts: impactsBetween(baseline, core, input.defaults) };
}

export function runScenario(locations: TwinLocation[], lanes: Lane[], scenario: ScenarioDefinition, defaults?: Partial<EngineDefaults>, lineage?: RunInputLineageOptions) {
  return runInput(createRunInput(locations, lanes, scenario, defaults, lineage));
}
