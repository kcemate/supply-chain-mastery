import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { incrementalStockoutLocationIds, periodRows, scopedMetrics, topologyDayForSelection } from '../src/decisionMetrics';
import { applyRecommendationProposal, calculateMetrics, createRunInput, defaultEngineDefaults, ENGINE_VERSION, replayRun, runScenario } from '../src/flywayEngine';
import type { Evidence, Lane, PeriodProductMetric, ScenarioDefinition, ScenarioType, TwinLocation } from '../src/flywayTypes';

const evidence: Evidence = { classification: 'synthetic', confidence: null, sourceTitle: 'Engine test fixture', publisher: 'Flyway', verifiedAt: '2026-09-04', note: 'Synthetic deterministic test data.' };
const product = 'Chicken' as const;

execFileSync(process.execPath, ['scripts/generate-engine-build-digest.mjs', '--check'], { stdio: 'pipe' });

function fixture() {
  const locations: TwinLocation[] = [
    { id: 'supplier', type: 'supplier', name: 'Supplier', city: 'A', state: 'GA', address: '1 A', latitude: 33, longitude: -84.2, status: 'active', products: [product], weeklyCapacity: 700, productPolicies: [{ product, baseUnit: 'case', weeklyProductionCapacity: 700 }], evidence, operatingSchedule: 'Daily' },
    { id: 'dc-1', type: 'dc', name: 'Primary DC', city: 'B', state: 'GA', address: '1 B', latitude: 33, longitude: -84.1, status: 'active', products: [product], weeklyCapacity: 700, productPolicies: [{ product, baseUnit: 'case', openingInventory: 70, storageCapacity: 200, safetyStock: 0, reorderPoint: 0, orderUpTo: 0, leadTimeDays: 1 }], evidence, operatingSchedule: 'Daily' },
    { id: 'dc-2', type: 'dc', name: 'Alternate DC', city: 'C', state: 'GA', address: '1 C', latitude: 33.1, longitude: -84, status: 'active', products: [product], weeklyCapacity: 700, productPolicies: [{ product, baseUnit: 'case', openingInventory: 70, storageCapacity: 200, safetyStock: 0, reorderPoint: 0, orderUpTo: 0, leadTimeDays: 1 }], evidence, operatingSchedule: 'Daily' },
    { id: 'restaurant', type: 'restaurant', name: 'Restaurant', city: 'D', state: 'GA', address: '1 D', latitude: 33.05, longitude: -84.05, status: 'active', products: [product], weeklyDemand: 70, productPolicies: [{ product, baseUnit: 'case', weeklyDemand: 70 }], assignedDcId: 'dc-1', evidence, operatingSchedule: 'Daily' },
  ];
  const lanes: Lane[] = [
    { id: 'supplier-dc-1', originId: 'supplier', destinationId: 'dc-1', products: [product], miles: 20, transitHours: 1, deliveriesPerWeek: 7, costPerMile: 2, status: 'active', weeklyCapacity: 700, evidence },
    { id: 'supplier-dc-2', originId: 'supplier', destinationId: 'dc-2', products: [product], miles: 25, transitHours: 1, deliveriesPerWeek: 7, costPerMile: 2, status: 'active', weeklyCapacity: 700, evidence },
    { id: 'dc-1-restaurant', originId: 'dc-1', destinationId: 'restaurant', products: [product], miles: 10, transitHours: 0.5, deliveriesPerWeek: 7, costPerMile: 2, status: 'active', weeklyCapacity: 100, evidence },
  ];
  return { locations, lanes };
}

function scenario(type: ScenarioType, targetId: string, overrides: Partial<ScenarioDefinition> = {}): ScenarioDefinition {
  return { id: `test-${type}`, name: `Test ${type}`, description: 'Deterministic verification', type, targetId, magnitude: 50, grain: 'daily', horizon: 7, createdAt: '2026-09-04T12:00:00.000Z', baselineRevision: 'test-baseline', startDate: '2026-09-07', ...overrides };
}

const base = fixture();
const preview = calculateMetrics(base.locations, base.lanes, undefined, { defaultGrain: 'daily' });
assert.equal(preview.grain, 'daily');
assert.equal(preview.horizon, 14);
assert.equal(preview.periodMetrics.length, 14 * base.locations.length);

// Every legacy scenario type has a concrete, target-specific modeled effect.
const outage = runScenario(base.locations, base.lanes, scenario('dc-outage', 'dc-1', { magnitude: 100 }));
assert.equal(outage.engineVersion, ENGINE_VERSION);
assert.equal(outage.scenario.serviceLevel, 0);
assert.equal(outage.scenario.stockoutUnits, 70);
assert.ok(outage.recommendations.some((item) => item.proposal?.some((change) => change.kind === 'reassign-restaurant')));

const surge = runScenario(base.locations, base.lanes, scenario('demand-surge', 'restaurant'));
assert.ok(surge.scenario.totalDemand > surge.baseline.totalDemand);
assert.ok(surge.scenario.serviceLevel < surge.baseline.serviceLevel);

const constrained = fixture();
constrained.locations.find((location) => location.id === 'dc-1')!.outboundCapacityPerDay = 10;
const weather = runScenario(constrained.locations, constrained.lanes, scenario('severe-weather', 'dc-1'));
assert.equal(weather.scenario.fulfilledDemand, 35);
const capacity = runScenario(constrained.locations, constrained.lanes, scenario('capacity-constraint', 'dc-1'));
assert.equal(capacity.scenario.fulfilledDemand, 35);
const price = runScenario(base.locations, base.lanes, scenario('price-change', 'network'));
assert.ok(price.scenario.totalLandedCost > price.baseline.totalLandedCost);
const closure = runScenario(base.locations, base.lanes, scenario('location-closure', 'restaurant', { magnitude: 100 }));
assert.equal(closure.scenario.totalDemand, 0);

// Supplier lead time and inventory position drive daily stockouts and receipts.
const replenishment = fixture();
const primary = replenishment.locations.find((location) => location.id === 'dc-1')!;
primary.productPolicies![0] = { product, baseUnit: 'case', openingInventory: 10, storageCapacity: 100, safetyStock: 10, reorderPoint: 20, orderUpTo: 65, orderMultiple: 20, reviewPeriodDays: 1, leadTimeDays: 3 };
const replenishmentBaseline = runScenario(replenishment.locations, replenishment.lanes, scenario('price-change', 'network', { magnitude: 0, changes: [] }));
const dcRows = replenishmentBaseline.periodMetrics!.filter((row) => row.locationId === 'dc-1');
assert.equal(dcRows[0].openingInventory, 10);
assert.equal(dcRows[3].receipts, 60);
assert.equal(replenishmentBaseline.scenario.stockoutUnits, 20);
assert.deepEqual(replenishmentBaseline.diagnostics!.conservationDeltaByProduct, { Chicken: 0 });
const cost = replenishmentBaseline.costBreakdown!;
assert.equal(cost.totalMicros, cost.purchaseMicros + cost.linehaulVariableMicros + cost.vehicleFixedMicros + cost.driverTimeMicros + cost.stopMicros + cost.handlingMicros + cost.inventoryCarryingMicros + cost.tollMicros + cost.shortagePenaltyMicros);
assert.ok(replenishmentBaseline.periodMetrics!.every((row) => row.closingInventory >= 0 && row.fulfilledDemand <= row.requestedDemand + Number.EPSILON));

const supplierFailure = runScenario(replenishment.locations, replenishment.lanes, scenario('supplier-failure', 'supplier', { magnitude: 100 }));
assert.ok(supplierFailure.scenario.stockoutUnits > replenishmentBaseline.scenario.stockoutUnits);

// Daily and weekly presentation grains resolve to the same internal daily physics.
const explicitChange = [{ id: 'surge', kind: 'adjust-demand' as const, locationId: 'restaurant', multiplier: 1.2, effectiveDay: 0 }];
const daily = runScenario(base.locations, base.lanes, scenario('demand-surge', 'restaurant', { grain: 'daily', horizon: 7, changes: explicitChange }));
const weekly = runScenario(base.locations, base.lanes, scenario('demand-surge', 'restaurant', { grain: 'weekly', horizon: 1, changes: explicitChange }));
assert.deepEqual(daily.scenario, weekly.scenario);
assert.deepEqual(daily.costBreakdown, weekly.costBreakdown);

// Complete canonical inputs change with an operating value and replay exactly.
const lineage = { sourceVersions: ['public-snapshot-1'], routeVersions: ['route-model-1'], forecastVersions: ['forecast-1'], warningsAcknowledged: ['estimate-warning-1'] };
const frozen = createRunInput(base.locations, base.lanes, scenario('dc-outage', 'dc-1', { magnitude: 100 }), defaultEngineDefaults, lineage);
lineage.sourceVersions.push('later-source');
lineage.routeVersions.push('later-route');
lineage.forecastVersions.push('later-forecast');
lineage.warningsAcknowledged.push('later-warning');
assert.deepEqual(frozen.sourceVersions, ['public-snapshot-1']);
assert.deepEqual(frozen.routeVersions, ['route-model-1']);
assert.deepEqual(frozen.forecastVersions, ['forecast-1']);
assert.deepEqual(frozen.warningsAcknowledged, ['estimate-warning-1']);
const replayed = replayRun(frozen);
assert.match(replayed.inputHash, /^[a-f0-9]{64}$/);
const replayedAgain = replayRun(frozen);
assert.equal(replayed.outputChecksum, replayedAgain.outputChecksum);
assert.deepEqual(replayed.periodMetrics, replayedAgain.periodMetrics);
const changed = fixture();
changed.locations.find((location) => location.id === 'restaurant')!.productPolicies![0].weeklyDemand = 71;
const changedFrozen = createRunInput(changed.locations, changed.lanes, frozen.scenario, defaultEngineDefaults, { sourceVersions: ['public-snapshot-1'], routeVersions: ['route-model-1'] });
assert.notEqual(replayRun(changedFrozen).inputHash, replayed.inputHash);
const renamed = fixture();
renamed.locations.find((location) => location.id === 'restaurant')!.name = 'Renamed UI label';
const renamedRun = replayRun(createRunInput(renamed.locations, renamed.lanes, frozen.scenario, defaultEngineDefaults, { sourceVersions: ['public-snapshot-1'], routeVersions: ['route-model-1'] }));
assert.notEqual(renamedRun.inputHash, replayed.inputHash);
assert.equal(renamedRun.outputChecksum, replayed.outputChecksum);

// Recommendations are executable evaluated changes against the frozen source input.
const recommendation = outage.recommendations.find((item) => item.proposal?.length)!;
const applied = applyRecommendationProposal(outage, recommendation);
assert.equal(applied.inputHash, recommendation.candidateInputHash);
assert.equal(applied.outputChecksum, recommendation.candidateOutputChecksum);
assert.equal(roundForTest(applied.scenario.serviceLevel - outage.scenario.serviceLevel), recommendation.serviceDelta);
assert.ok(applied.scenario.serviceLevel > outage.scenario.serviceLevel);

// Effective-dated added locations and lanes are part of actual flow physics.
const newDc = { ...base.locations.find((location) => location.id === 'dc-2')!, id: 'dc-3', name: 'Added DC', latitude: 33.2 };
const newLane = { ...base.lanes.find((lane) => lane.id === 'dc-1-restaurant')!, id: 'dc-3-restaurant', originId: 'dc-3' };
const facilityScenario = scenario('dc-outage', 'dc-1', { magnitude: 100, changes: [
  { id: 'outage', kind: 'set-location-status', locationId: 'dc-1', status: 'unavailable', effectiveDay: 0 },
  { id: 'add-dc', kind: 'add-location', location: newDc, effectiveDay: 0 },
  { id: 'add-lane', kind: 'add-lane', lane: newLane, effectiveDay: 0 },
  { id: 'reassign', kind: 'reassign-restaurant', restaurantId: 'restaurant', dcId: 'dc-3', effectiveDay: 0 },
] });
assert.equal(runScenario(base.locations, base.lanes, facilityScenario).scenario.serviceLevel, 100);

assert.throws(() => runScenario(base.locations, base.lanes, scenario('dc-outage', 'missing')), /target does not exist/i);
const invalidTransport = fixture();
invalidTransport.lanes[2].maxDriverHours = 1;
invalidTransport.lanes[2].transitHours = 1;
invalidTransport.lanes[2].dwellHours = 0.5;
assert.throws(() => calculateMetrics(invalidTransport.locations, invalidTransport.lanes), /driver-hours constraint/i);
const mixedUnits = fixture();
mixedUnits.locations.find((location) => location.id === 'restaurant')!.productPolicies![0].baseUnit = 'each';
assert.throws(() => calculateMetrics(mixedUnits.locations, mixedUnits.lanes), /one normalized quantity unit/i);

// Weekly comparison scopes scenario, baseline, deltas, and topology to one coherent decision context.
const periodRow = (periodIndex:number, locationId:string, requestedDemand:number, fulfilledDemand:number):PeriodProductMetric => ({
  periodIndex,
  date: `2026-09-${String(7+periodIndex).padStart(2,'0')}`,
  locationId,
  locationType: 'restaurant',
  product,
  unit: 'case',
  openingInventory: 0,
  receipts: 0,
  requestedDemand,
  fulfilledDemand,
  stockoutQuantity: requestedDemand-fulfilledDemand,
  closingInventory: 0,
  production: 0,
  inboundQuantity: fulfilledDemand,
  outboundQuantity: 0,
  storageUtilization: 0,
  inboundUtilization: 0,
  outboundUtilization: 0,
});
const baselineDecisionRows = Array.from({length:14},(_,day)=>periodRow(day,'restaurant',10,day>=7?9:10));
const scenarioDecisionRows = Array.from({length:14},(_,day)=>periodRow(day,'restaurant',10,day>=7?7:10));
const baselineWeekTwo = periodRows(baselineDecisionRows,product,1,7);
const scenarioWeekTwo = periodRows(scenarioDecisionRows,product,1,7);
assert.equal(baselineWeekTwo.length,7);
assert.equal(scenarioWeekTwo.every((row)=>row.periodIndex>=7&&row.periodIndex<14),true);
assert.equal(scopedMetrics(baselineWeekTwo,preview.metrics).stockoutUnits,7);
assert.equal(scopedMetrics(scenarioWeekTwo,preview.metrics).stockoutUnits,21);
assert.deepEqual(incrementalStockoutLocationIds(scenarioWeekTwo,baselineWeekTwo),['restaurant']);
assert.equal(topologyDayForSelection(1,7,14),7);
assert.equal(topologyDayForSelection(-1,7,14),13);

function roundForTest(value: number) { return Math.round((value + Number.EPSILON) * 10) / 10; }
console.log('Flyway engine passed product-period physics, all seven scenario effects, lead-time inventory, conservation, grain equivalence, full lineage cloning, scoped weekly reporting, canonical replay, effective-dated topology, transport validation, and evaluated proposals.');
