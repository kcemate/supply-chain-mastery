import type {
  CostBreakdown,
  EngineDefaults,
  Lane,
  LocationImpact,
  LocationProductPolicy,
  PeriodProductMetric,
  ProductCategory,
  ProductMetric,
  RunInputV2,
  ScenarioChange,
  SimulationDiagnostics,
  TwinLocation,
  TwinMetrics,
} from '../flywayTypes';
import { cloneJson } from './canonical';
import { ENGINE_BUILD_DIGEST } from './buildDigest.generated';

export const ENGINE_VERSION = 'flyway-deterministic-2.0.1';
export { ENGINE_BUILD_DIGEST };

const PRODUCTS: ProductCategory[] = ['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment'];
const DAY_MS = 86_400_000;
const EPSILON = 1e-7;

export const defaultEngineDefaults: EngineDefaults = {
  schemaVersion: 2,
  serviceTarget: 98,
  distanceUnit: 'miles',
  defaultGrain: 'weekly',
  dieselCostMicrosPerGallon: 3_870_000,
  routingMode: 'road',
  startDate: new Date().toISOString().slice(0, 10),
  includeShortagePenalty: true,
  productWeights: { Chicken: 0.28, Produce: 0.18, 'Buns & bakery': 0.14, Packaging: 0.12, Beverages: 0.14, 'Cooking oil': 0.08, Equipment: 0.06 },
  defaultSeasonalityByWeekday: [1, 1, 1, 1, 1, 1, 1],
  defaultSafetyStockDays: 1.5,
  defaultOrderUpToDays: 7,
  defaultLeadTimeDays: 1,
  defaultVehicleCapacity: 1_800,
  fixedStopCostMicros: 72_000_000,
  driverCostMicrosPerHour: 32_000_000,
  handlingCostMicrosPerUnit: 180_000,
  carryingCostMicrosPerUnitDay: 9_000,
  purchaseCostMicrosByProduct: { Chicken: 10_200_000, Produce: 7_100_000, 'Buns & bakery': 6_400_000, Packaging: 3_900_000, Beverages: 5_800_000, 'Cooking oil': 8_600_000, Equipment: 13_500_000 },
  shortagePenaltyMicrosByProduct: { Chicken: 24_000_000, Produce: 19_000_000, 'Buns & bakery': 17_000_000, Packaging: 11_000_000, Beverages: 15_000_000, 'Cooking oil': 18_000_000, Equipment: 22_000_000 },
};

export interface RunInputLineageOptions {
  sourceVersions?: string[];
  routeVersions?: string[];
  forecastVersions?: string[];
  warningsAcknowledged?: string[];
}

export interface SimulationCore {
  metrics: TwinMetrics;
  periodMetrics: PeriodProductMetric[];
  productMetrics: ProductMetric[];
  costBreakdown: CostBreakdown;
  diagnostics: SimulationDiagnostics;
}

interface DynamicLane {
  lane: Lane;
  capacityMultiplier: number;
  transitTimeMultiplier: number;
  costMultiplier: number;
}

function round(value: number, precision = 4) {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function mergeDefaults(overrides?: Partial<EngineDefaults>): EngineDefaults {
  if (!overrides) return cloneJson(defaultEngineDefaults);
  return {
    ...cloneJson(defaultEngineDefaults), ...cloneJson(overrides),
    productWeights: { ...defaultEngineDefaults.productWeights, ...(overrides.productWeights || {}) },
    purchaseCostMicrosByProduct: { ...defaultEngineDefaults.purchaseCostMicrosByProduct, ...(overrides.purchaseCostMicrosByProduct || {}) },
    shortagePenaltyMicrosByProduct: { ...defaultEngineDefaults.shortagePenaltyMicrosByProduct, ...(overrides.shortagePenaltyMicrosByProduct || {}) },
    defaultSeasonalityByWeekday: [...(overrides.defaultSeasonalityByWeekday || defaultEngineDefaults.defaultSeasonalityByWeekday)],
    schemaVersion: 2,
  };
}

function horizonDays(grain: 'daily' | 'weekly', horizon: number) {
  if (!Number.isInteger(horizon) || horizon < 1) throw new Error('Scenario horizon must be a positive integer.');
  return grain === 'weekly' ? horizon * 7 : horizon;
}

function changeIsActive(change: ScenarioChange, day: number) {
  return day >= change.effectiveDay && (change.durationDays == null || day < change.effectiveDay + change.durationDays);
}

function changeHasStarted(change: ScenarioChange, day: number) {
  return day >= change.effectiveDay;
}

function productsFor(location: TwinLocation) {
  return PRODUCTS.filter((product) => location.products.includes(product));
}

function explicitPolicy(location: TwinLocation, product: ProductCategory): LocationProductPolicy | undefined {
  return location.productPolicies?.find((policy) => policy.product === product);
}

function weightWithinLocation(location: TwinLocation, product: ProductCategory, defaults: EngineDefaults) {
  const applicable = productsFor(location);
  const total = applicable.reduce((sum, item) => sum + defaults.productWeights[item], 0);
  return total > 0 ? defaults.productWeights[product] / total : 0;
}

function weeklyDemand(location: TwinLocation, product: ProductCategory, defaults: EngineDefaults) {
  const explicit = explicitPolicy(location, product)?.weeklyDemand;
  return explicit != null ? Math.max(0, explicit) : Math.max(0, location.weeklyDemand || 0) * weightWithinLocation(location, product, defaults);
}

function weeklyProduction(location: TwinLocation, product: ProductCategory, defaults: EngineDefaults) {
  const explicit = explicitPolicy(location, product)?.weeklyProductionCapacity;
  return explicit != null ? Math.max(0, explicit) : Math.max(0, location.weeklyCapacity || 0) * weightWithinLocation(location, product, defaults);
}

function calendarOpen(location: TwinLocation, date: Date) {
  const isoDate = date.toISOString().slice(0, 10);
  const exception = location.calendar?.exceptions?.find((item) => item.date === isoDate);
  if (exception) return exception.open;
  return (location.calendar?.operatingWeekdays || [0, 1, 2, 3, 4, 5, 6]).includes(date.getUTCDay());
}

function laneOpen(lane: Lane, date: Date) {
  const schedules = [[1], [1, 4], [1, 3, 5], [1, 2, 4, 5], [1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5, 6]];
  const modeledDays = lane.deliveriesPerWeek <= 0 ? [] : schedules[Math.min(7, Math.max(1, Math.ceil(lane.deliveriesPerWeek))) - 1];
  const weekdayOpen = (lane.operatingDays || modeledDays).includes(date.getUTCDay());
  const hourInWindow = (window?: Lane['deliveryWindow']) => !window || (window.startHour >= 0 && window.endHour <= 24 && window.startHour < window.endHour);
  return weekdayOpen && hourInWindow(lane.deliveryWindow) && hourInWindow(lane.receivingWindow);
}

function demandForDay(location: TwinLocation, product: ProductCategory, date: Date, day: number, defaults: EngineDefaults) {
  if (!calendarOpen(location, date)) return 0;
  const policy = explicitPolicy(location, product);
  const weights = policy?.seasonalityByWeekday || defaults.defaultSeasonalityByWeekday;
  if (weights.length !== 7 || weights.some((value) => !Number.isFinite(value) || value < 0)) throw new Error(`Invalid seven-day seasonality for ${location.id}/${product}.`);
  const operatingWeekdays = location.calendar?.operatingWeekdays || [0, 1, 2, 3, 4, 5, 6];
  const openWeight = weights.reduce((sum, value, weekday) => sum + (operatingWeekdays.includes(weekday) ? value : 0), 0);
  if (openWeight <= 0) return 0;
  const growth = Math.max(0, 1 + (policy?.growthRatePerPeriod || 0)) ** day;
  return weeklyDemand(location, product, defaults) * weights[date.getUTCDay()] / openWeight * growth * (policy?.eventMultiplier ?? 1);
}

function legacyChanges(scenario: RunInputV2['scenario'], locations: TwinLocation[], lanes: Lane[], days: number): ScenarioChange[] {
  if (scenario.changes !== undefined) return cloneJson(scenario.changes);
  const base = { id: `legacy-${scenario.id}`, effectiveDay: 0, durationDays: days };
  const multiplier = Math.max(0, 1 - scenario.magnitude / 100);
  switch (scenario.type) {
    case 'dc-outage':
    case 'supplier-failure':
    case 'location-closure':
      return [{ ...base, kind: 'set-location-status', locationId: scenario.targetId, status: 'unavailable' }];
    case 'demand-surge':
      return [{ ...base, kind: 'adjust-demand', locationId: scenario.targetId, multiplier: 1 + scenario.magnitude / 100 }];
    case 'capacity-constraint':
      return [{ ...base, kind: 'adjust-capacity', locationId: scenario.targetId, multiplier }];
    case 'price-change':
      return [{ ...base, kind: 'adjust-price', locationId: scenario.targetId === 'network' ? undefined : scenario.targetId, multiplier: 1 + scenario.magnitude / 100 }];
    case 'severe-weather': {
      const locationIds = scenario.targetId === 'network' ? locations.map((location) => location.id) : [scenario.targetId];
      const affected = new Set(locationIds);
      const laneIds = lanes.filter((lane) => affected.has(lane.originId) || affected.has(lane.destinationId)).map((lane) => lane.id);
      return [{ ...base, kind: 'weather-disruption', locationIds, laneIds, capacityMultiplier: multiplier, transitTimeMultiplier: 1 + scenario.magnitude / 100, costMultiplier: 1 + scenario.magnitude / 200 }];
    }
  }
}

function validateLane(lane: Lane, locationIds: Set<string>) {
  if (!locationIds.has(lane.originId) || !locationIds.has(lane.destinationId)) throw new Error(`Lane ${lane.id} references a missing location.`);
  if (!Number.isFinite(lane.miles) || lane.miles < 0 || !Number.isFinite(lane.transitHours) || lane.transitHours < 0) throw new Error(`Lane ${lane.id} has invalid distance or transit time.`);
  if (!Number.isFinite(lane.deliveriesPerWeek) || lane.deliveriesPerWeek < 0 || !Number.isFinite(lane.costPerMile) || lane.costPerMile < 0) throw new Error(`Lane ${lane.id} has invalid frequency or cost.`);
  if (lane.weeklyCapacity != null && (!Number.isFinite(lane.weeklyCapacity) || lane.weeklyCapacity < 0)) throw new Error(`Lane ${lane.id} has invalid weekly capacity.`);
  if (lane.operatingDays?.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error(`Lane ${lane.id} has an invalid operating day.`);
  for (const policy of lane.productPolicies || []) {
    if (!lane.products.includes(policy.product)) throw new Error(`Lane ${lane.id} has a policy for an unsupported product.`);
    if (policy.maxQuantityPerDay != null && (!Number.isFinite(policy.maxQuantityPerDay) || policy.maxQuantityPerDay < 0)) throw new Error(`Lane ${lane.id} has an invalid product capacity.`);
    if (policy.allocationPct != null && (!Number.isFinite(policy.allocationPct) || policy.allocationPct < 0 || policy.allocationPct > 100)) throw new Error(`Lane ${lane.id} has an invalid allocation percentage.`);
  }
  if (lane.vehicleCapacity != null && lane.vehicleCapacity <= 0) throw new Error(`Lane ${lane.id} has invalid vehicle capacity.`);
  if (lane.vehicleType && (lane.vehicleType.capacity <= 0 || lane.vehicleType.fixedCostMicros < 0)) throw new Error(`Lane ${lane.id} has invalid vehicle type.`);
  if (lane.fuelEconomyMpg != null && lane.fuelEconomyMpg <= 0) throw new Error(`Lane ${lane.id} has invalid fuel economy.`);
  if (lane.maxDriverHours != null && lane.transitHours + (lane.dwellHours || 0) > lane.maxDriverHours) throw new Error(`Lane ${lane.id} exceeds its driver-hours constraint.`);
  for (const window of [lane.deliveryWindow, lane.receivingWindow]) if (window && (window.startHour < 0 || window.endHour > 24 || window.startHour >= window.endHour)) throw new Error(`Lane ${lane.id} has an invalid delivery window.`);
}

function validateLocation(location: TwinLocation) {
  if (!Number.isFinite(location.latitude) || location.latitude < -90 || location.latitude > 90 || !Number.isFinite(location.longitude) || location.longitude < -180 || location.longitude > 180) throw new Error(`Location ${location.id} has invalid coordinates.`);
  if (!location.products.length || new Set(location.products).size !== location.products.length) throw new Error(`Location ${location.id} must have unique supported products.`);
  if (location.calendar?.operatingWeekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) throw new Error(`Location ${location.id} has an invalid operating weekday.`);
  for (const value of [location.weeklyDemand, location.weeklyCapacity, location.inventoryDays, location.serviceRadiusMiles, location.inboundCapacityPerDay, location.outboundCapacityPerDay, location.storageCapacity]) if (value != null && (!Number.isFinite(value) || value < 0)) throw new Error(`Location ${location.id} has an invalid nonnegative operating value.`);
  for (const policy of location.productPolicies || []) {
    if (!location.products.includes(policy.product)) throw new Error(`Location ${location.id} has a policy for an unsupported product.`);
    const values = [policy.weeklyDemand, policy.weeklyProductionCapacity, policy.openingInventory, policy.storageCapacity, policy.safetyStock, policy.reorderPoint, policy.orderUpTo, policy.leadTimeDays, policy.minimumOrderQuantity, policy.orderMultiple, policy.purchaseCostMicros, policy.handlingCostMicros, policy.carryingCostMicrosPerUnitDay];
    if (values.some((value) => value != null && (!Number.isFinite(value) || value < 0))) throw new Error(`Location ${location.id}/${policy.product} has an invalid nonnegative policy value.`);
    if (policy.seasonalityByWeekday && (policy.seasonalityByWeekday.length !== 7 || policy.seasonalityByWeekday.some((value) => !Number.isFinite(value) || value < 0))) throw new Error(`Location ${location.id}/${policy.product} has invalid seven-day seasonality.`);
    if (policy.growthRatePerPeriod != null && (!Number.isFinite(policy.growthRatePerPeriod) || policy.growthRatePerPeriod < -1)) throw new Error(`Location ${location.id}/${policy.product} has an invalid growth rate.`);
    if (policy.eventMultiplier != null && (!Number.isFinite(policy.eventMultiplier) || policy.eventMultiplier < 0)) throw new Error(`Location ${location.id}/${policy.product} has an invalid event multiplier.`);
    if (policy.reviewPeriodDays != null && (!Number.isInteger(policy.reviewPeriodDays) || policy.reviewPeriodDays < 1)) throw new Error(`Location ${location.id}/${policy.product} has an invalid review period.`);
    if (policy.scheduledReplenishment?.some((item) => !Number.isInteger(item.weekday) || item.weekday < 0 || item.weekday > 6 || !Number.isFinite(item.quantity) || item.quantity < 0)) throw new Error(`Location ${location.id}/${policy.product} has an invalid replenishment schedule.`);
  }
}

function validateDefaults(defaults: EngineDefaults) {
  if (!Number.isFinite(defaults.serviceTarget) || defaults.serviceTarget < 0 || defaults.serviceTarget > 100) throw new Error('Service target must be between 0 and 100 percent.');
  if (defaults.defaultSeasonalityByWeekday.length !== 7 || defaults.defaultSeasonalityByWeekday.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Default seasonality must contain seven nonnegative values.');
  for (const value of [defaults.dieselCostMicrosPerGallon, defaults.defaultSafetyStockDays, defaults.defaultOrderUpToDays, defaults.defaultLeadTimeDays, defaults.defaultVehicleCapacity, defaults.fixedStopCostMicros, defaults.driverCostMicrosPerHour, defaults.handlingCostMicrosPerUnit, defaults.carryingCostMicrosPerUnitDay]) if (!Number.isFinite(value) || value < 0) throw new Error('Engine cost, inventory, and capacity defaults must be finite and nonnegative.');
  dateFor(defaults.startDate, 0);
}

function validateInputReferences(locations: TwinLocation[], lanes: Lane[], changes: ScenarioChange[], scenario: RunInputV2['scenario']) {
  if (new Set(locations.map((location) => location.id)).size !== locations.length) throw new Error('Location identifiers must be unique.');
  if (new Set(lanes.map((lane) => lane.id)).size !== lanes.length) throw new Error('Lane identifiers must be unique.');
  locations.forEach(validateLocation);
  const locationIds = new Set(locations.map((location) => location.id));
  const laneIds = new Set(lanes.map((lane) => lane.id));
  for (const change of changes) {
    if (change.kind === 'add-location') locationIds.add(change.location.id);
    if (change.kind === 'add-lane') laneIds.add(change.lane.id);
  }
  if (scenario.targetId !== 'network' && !locationIds.has(scenario.targetId)) throw new Error(`Scenario target does not exist: ${scenario.targetId}`);
  lanes.forEach((lane) => validateLane(lane, locationIds));
  for (const change of changes) {
    const locationRef = change.kind === 'set-location-status' || change.kind === 'adjust-demand' || change.kind === 'adjust-capacity' ? change.locationId : change.kind === 'reassign-restaurant' ? change.restaurantId : change.kind === 'set-inventory-policy' ? change.dcId : undefined;
    if (locationRef && !locationIds.has(locationRef)) throw new Error(`Change ${change.id} references a missing location: ${locationRef}`);
    if (change.kind === 'reassign-restaurant' && !locationIds.has(change.dcId)) throw new Error(`Change ${change.id} references a missing DC: ${change.dcId}`);
    if ((change.kind === 'adjust-lane' || change.kind === 'remove-lane') && !laneIds.has(change.laneId)) throw new Error(`Change ${change.id} references a missing lane: ${change.laneId}`);
    if (change.kind === 'add-lane') validateLane(change.lane, locationIds);
    if (change.kind === 'add-location') validateLocation(change.location);
    if (change.effectiveDay < 0 || !Number.isInteger(change.effectiveDay)) throw new Error(`Change ${change.id} has an invalid effective day.`);
    if (change.durationDays != null && (!Number.isInteger(change.durationDays) || change.durationDays <= 0)) throw new Error(`Change ${change.id} has an invalid duration.`);
    const multiplier = change.kind === 'adjust-demand' || change.kind === 'adjust-capacity' || change.kind === 'adjust-price' ? change.multiplier : undefined;
    if (multiplier != null && (!Number.isFinite(multiplier) || multiplier < 0)) throw new Error(`Change ${change.id} has an invalid multiplier.`);
  }
  const effectiveLocations = [...locations, ...changes.flatMap((change) => change.kind === 'add-location' ? [change.location] : [])];
  const units = new Set(effectiveLocations.flatMap((location) => productsFor(location).map((product) => explicitPolicy(location, product)?.baseUnit || 'case-equivalent')));
  if (units.size > 1) throw new Error(`Aggregate metrics require one normalized quantity unit; found ${[...units].sort().join(', ')}. Configure an explicit conversion before mixing units.`);
}

function normalizeForInput<T extends TwinLocation | Lane>(values: T[]): T[] {
  return cloneJson(values).sort((left, right) => left.id.localeCompare(right.id)).map((value) => {
    value.products = [...value.products].sort() as ProductCategory[];
    if (value.productPolicies) value.productPolicies.sort((left, right) => left.product.localeCompare(right.product));
    return value;
  });
}

export function createRunInput(locations: TwinLocation[], lanes: Lane[], scenario: RunInputV2['scenario'], defaults?: Partial<EngineDefaults>, lineage: RunInputLineageOptions = {}): RunInputV2 {
  const resolvedDefaults = mergeDefaults(defaults);
  validateDefaults(resolvedDefaults);
  const days = horizonDays(scenario.grain, scenario.horizon);
  const normalizedLocations = normalizeForInput(locations);
  const normalizedLanes = normalizeForInput(lanes);
  const changes = legacyChanges(scenario, normalizedLocations, normalizedLanes, days);
  validateInputReferences(normalizedLocations, normalizedLanes, changes, scenario);
  return { schemaVersion: 2, engineVersion: ENGINE_VERSION, engineBuildDigest: ENGINE_BUILD_DIGEST, baselineRevision: scenario.baselineRevision, startDate: scenario.startDate || resolvedDefaults.startDate, grain: scenario.grain, horizon: scenario.horizon, locations: normalizedLocations, lanes: normalizedLanes, scenario: cloneJson({ ...scenario, changes }), changes: cloneJson(changes), defaults: resolvedDefaults, sourceVersions: [...(lineage.sourceVersions || [])].sort(), routeVersions: [...(lineage.routeVersions || [])].sort(), forecastVersions: [...(lineage.forecastVersions || [])].sort(), warningsAcknowledged: [...(lineage.warningsAcknowledged || [])].sort() };
}

function locationsForDay(input: RunInputV2, day: number) {
  const values = cloneJson(input.locations);
  for (const change of input.changes) if (change.kind === 'add-location' && changeHasStarted(change, day) && !values.some((item) => item.id === change.location.id)) values.push(cloneJson(change.location));
  const byId = new Map(values.map((location) => [location.id, location]));
  for (const change of input.changes) if (change.kind === 'set-location-status' && changeIsActive(change, day)) {
    const location = byId.get(change.locationId);
    if (location) location.status = change.status;
  }
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function lanesForDay(input: RunInputV2, day: number, date: Date): DynamicLane[] {
  const values = cloneJson(input.lanes);
  for (const change of input.changes) if (change.kind === 'add-lane' && changeHasStarted(change, day) && !values.some((item) => item.id === change.lane.id)) values.push(cloneJson(change.lane));
  const removed = new Set(input.changes.flatMap((change) => change.kind === 'remove-lane' && changeHasStarted(change, day) ? [change.laneId] : []));
  return values.filter((lane) => !removed.has(lane.id) && laneOpen(lane, date)).map((lane) => {
    let capacityMultiplier = 1;
    let transitTimeMultiplier = 1;
    let costMultiplier = 1;
    let status = lane.status;
    for (const change of input.changes) {
      if (!changeIsActive(change, day)) continue;
      if (change.kind === 'adjust-lane' && change.laneId === lane.id) {
        capacityMultiplier *= change.capacityMultiplier ?? 1;
        transitTimeMultiplier *= change.transitTimeMultiplier ?? 1;
        costMultiplier *= change.costMultiplier ?? 1;
        status = change.status ?? status;
      }
      if (change.kind === 'weather-disruption' && change.laneIds.includes(lane.id)) {
        capacityMultiplier *= change.capacityMultiplier;
        transitTimeMultiplier *= change.transitTimeMultiplier;
        costMultiplier *= change.costMultiplier;
      }
    }
    return { lane: { ...lane, status }, capacityMultiplier, transitTimeMultiplier, costMultiplier };
  }).filter(({ lane }) => lane.status !== 'inactive').sort((left, right) => left.lane.id.localeCompare(right.lane.id));
}

function statusAvailable(status: TwinLocation['status']) {
  return status === 'active';
}

function capacityMultiplier(input: RunInputV2, locationId: string, product: ProductCategory, day: number) {
  let multiplier = 1;
  for (const change of input.changes) {
    if (!changeIsActive(change, day)) continue;
    if (change.kind === 'adjust-capacity' && change.locationId === locationId && (!change.product || change.product === product)) multiplier *= change.multiplier;
    if (change.kind === 'weather-disruption' && change.locationIds.includes(locationId)) multiplier *= change.capacityMultiplier;
  }
  return Math.max(0, multiplier);
}

function aggregateCapacityMultiplier(input: RunInputV2, locationId: string, day: number) {
  let multiplier = 1;
  for (const change of input.changes) {
    if (!changeIsActive(change, day)) continue;
    if (change.kind === 'adjust-capacity' && change.locationId === locationId && !change.product) multiplier *= change.multiplier;
    if (change.kind === 'weather-disruption' && change.locationIds.includes(locationId)) multiplier *= change.capacityMultiplier;
  }
  return Math.max(0, multiplier);
}

function demandMultiplier(input: RunInputV2, locationId: string, product: ProductCategory, day: number) {
  return input.changes.reduce((multiplier, change) => changeIsActive(change, day) && change.kind === 'adjust-demand' && change.locationId === locationId && (!change.product || change.product === product) ? multiplier * change.multiplier : multiplier, 1);
}

function purchaseMultiplier(input: RunInputV2, product: ProductCategory, day: number) {
  return input.changes.reduce((multiplier, change) => {
    if (!changeIsActive(change, day) || change.kind !== 'adjust-price' || (change.product && change.product !== product)) return multiplier;
    if (!change.locationId) return multiplier * change.multiplier;
    const target = input.locations.find((location) => location.id === change.locationId);
    return target?.products.includes(product) ? multiplier * change.multiplier : multiplier;
  }, 1);
}

function assignmentFor(input: RunInputV2, restaurant: TwinLocation, day: number) {
  let assigned = restaurant.assignedDcId;
  for (const change of input.changes) if (change.kind === 'reassign-restaurant' && change.restaurantId === restaurant.id && changeIsActive(change, day)) assigned = change.dcId;
  return assigned;
}

function policyForDay(input: RunInputV2, dc: TwinLocation, product: ProductCategory, day: number, assignedWeeklyDemand: number) {
  const policy: LocationProductPolicy = { ...(explicitPolicy(dc, product) || { product, baseUnit: 'case-equivalent' }) };
  for (const change of input.changes) if (change.kind === 'set-inventory-policy' && change.dcId === dc.id && change.product === product && changeHasStarted(change, day)) Object.assign(policy, change);
  const dailyDemand = assignedWeeklyDemand / 7;
  return {
    ...policy,
    openingInventory: Math.max(0, policy.openingInventory ?? dailyDemand * (dc.inventoryDays ?? input.defaults.defaultOrderUpToDays)),
    storageCapacity: Math.max(0, policy.storageCapacity ?? dc.storageCapacity ?? dailyDemand * Math.max((dc.inventoryDays ?? input.defaults.defaultOrderUpToDays) * 1.5, input.defaults.defaultOrderUpToDays + 2)),
    safetyStock: Math.max(0, policy.safetyStock ?? dailyDemand * input.defaults.defaultSafetyStockDays),
    reorderPoint: Math.max(0, policy.reorderPoint ?? dailyDemand * Math.max(input.defaults.defaultSafetyStockDays, input.defaults.defaultLeadTimeDays + 1)),
    orderUpTo: Math.max(0, policy.orderUpTo ?? dailyDemand * input.defaults.defaultOrderUpToDays),
    leadTimeDays: Math.max(0, Math.ceil(policy.leadTimeDays ?? input.defaults.defaultLeadTimeDays)),
    replenishmentPolicy: policy.replenishmentPolicy || 'reorder-point',
    reviewPeriodDays: Math.max(1, Math.ceil(policy.reviewPeriodDays || 1)),
    minimumOrderQuantity: Math.max(0, policy.minimumOrderQuantity || 0),
    orderMultiple: Math.max(0, policy.orderMultiple || 0),
    scheduledReplenishment: policy.scheduledReplenishment || [],
    baseUnit: policy.baseUnit || 'case-equivalent',
  };
}

function activeWeekdays(location: TwinLocation) {
  return Math.max(1, location.calendar?.operatingWeekdays.length || 7);
}

function locationDailyCapacity(location: TwinLocation, direction: 'inbound' | 'outbound') {
  const explicit = direction === 'inbound' ? location.inboundCapacityPerDay : location.outboundCapacityPerDay;
  return explicit != null ? Math.max(0, explicit) : Math.max(0, location.weeklyCapacity || 0) / activeWeekdays(location);
}

function windowHours(window?: Lane['deliveryWindow']) {
  return window ? window.endHour - window.startHour : 24;
}

function transportCapacity(lane: Lane, transitMultiplier: number, defaults: EngineDefaults) {
  if (!lane.vehicleCapacity && !lane.vehicleType && !lane.maxDriverHours && !lane.deliveryWindow && !lane.receivingWindow) return Number.POSITIVE_INFINITY;
  const dutyHours = Math.max(0.25, lane.transitHours * transitMultiplier * 2 + (lane.dwellHours || 0));
  const availableHours = Math.min(lane.maxDriverHours || 24, windowHours(lane.deliveryWindow), windowHours(lane.receivingWindow));
  const trips = Math.max(0, Math.floor(availableHours / dutyHours));
  return trips * (lane.vehicleType?.capacity || lane.vehicleCapacity || defaults.defaultVehicleCapacity);
}

function laneDailyCapacity(dynamic: DynamicLane, product: ProductCategory, origin: TwinLocation, destination: TwinLocation, defaults: EngineDefaults) {
  const productPolicy = dynamic.lane.productPolicies?.find((policy) => policy.product === product);
  const explicit = productPolicy?.maxQuantityPerDay;
  const modeled = explicit != null ? explicit : dynamic.lane.weeklyCapacity != null ? dynamic.lane.weeklyCapacity / 7 : destination.type === 'restaurant' ? weeklyDemand(destination, product, defaults) * 1.25 / 7 : weeklyProduction(origin, product, defaults) / activeWeekdays(origin);
  const allocated = modeled * ((productPolicy?.allocationPct ?? 100) / 100);
  return Math.max(0, Math.min(allocated * dynamic.capacityMultiplier, transportCapacity(dynamic.lane, dynamic.transitTimeMultiplier, defaults)));
}

function dateFor(startDate: string, day: number) {
  const parsed = new Date(`${startDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid scenario start date: ${startDate}`);
  return new Date(parsed.getTime() + day * DAY_MS);
}

const inventoryKey = (locationId: string, product: ProductCategory) => `${locationId}\u001f${product}`;
const receiptKey = (day: number, locationId: string, product: ProductCategory) => `${day}\u001f${locationId}\u001f${product}`;
const laneProductKey = (laneId: string, product: ProductCategory) => `${laneId}\u001f${product}`;
const pathProductKey = (originId: string, destinationId: string, product: ProductCategory) => `${originId}\u001f${destinationId}\u001f${product}`;

function addMoney(cost: CostBreakdown, key: keyof Omit<CostBreakdown, 'totalMicros'>, amount: number) {
  cost[key] += Math.max(0, Math.round(amount));
}

function dispatchCost(cost: CostBreakdown, dynamic: DynamicLane, quantities: Partial<Record<ProductCategory, number>>, defaults: EngineDefaults) {
  const quantity = Object.values(quantities).reduce((sum, value) => sum + (value || 0), 0);
  if (quantity <= EPSILON) return;
  const lane = dynamic.lane;
  const routeFactor = defaults.routingMode === 'straight' ? 0.82 : 1;
  const vehicles = Math.max(1, Math.ceil(quantity / Math.max(EPSILON, lane.vehicleType?.capacity || lane.vehicleCapacity || defaults.defaultVehicleCapacity)));
  const fuelCost = lane.fuelEconomyMpg ? lane.miles / lane.fuelEconomyMpg * defaults.dieselCostMicrosPerGallon * vehicles : lane.miles * lane.costPerMile * 1_000_000 * (defaults.dieselCostMicrosPerGallon / defaultEngineDefaults.dieselCostMicrosPerGallon);
  addMoney(cost, 'linehaulVariableMicros', fuelCost * routeFactor * dynamic.costMultiplier);
  addMoney(cost, 'linehaulVariableMicros', Object.entries(quantities).reduce((sum, [product, productQuantity]) => sum + (productQuantity || 0) * (lane.productPolicies?.find((policy) => policy.product === product)?.variableCostMicrosPerUnit || 0), 0) * dynamic.costMultiplier);
  addMoney(cost, 'vehicleFixedMicros', vehicles * (lane.vehicleType?.fixedCostMicros ?? defaults.fixedStopCostMicros) * dynamic.costMultiplier);
  addMoney(cost, 'driverTimeMicros', (lane.transitHours * dynamic.transitTimeMultiplier + (lane.dwellHours || 0)) * (lane.driverCostMicrosPerHour ?? defaults.driverCostMicrosPerHour) * vehicles * dynamic.costMultiplier);
  addMoney(cost, 'stopMicros', (lane.fixedDispatchCostMicros || 0) * dynamic.costMultiplier);
  addMoney(cost, 'tollMicros', (lane.tollCostMicros || 0) * vehicles * dynamic.costMultiplier);
}

function emptyCost(): CostBreakdown {
  return { purchaseMicros: 0, linehaulVariableMicros: 0, vehicleFixedMicros: 0, driverTimeMicros: 0, stopMicros: 0, handlingMicros: 0, inventoryCarryingMicros: 0, tollMicros: 0, shortagePenaltyMicros: 0, totalMicros: 0 };
}

export function simulateInput(input: RunInputV2): SimulationCore {
  if (input.schemaVersion !== 2 || input.engineVersion !== ENGINE_VERSION || input.engineBuildDigest !== ENGINE_BUILD_DIGEST) throw new Error('Run input engine contract is incompatible with this engine build.');
  validateDefaults(input.defaults);
  validateInputReferences(input.locations, input.lanes, input.changes, input.scenario);
  const days = horizonDays(input.grain, input.horizon);
  const inventory = new Map<string, number>();
  const pending = new Map<string, number>();
  const periodMetrics: PeriodProductMetric[] = [];
  const cost = emptyCost();
  const warnings = new Set<string>();
  const constraints: SimulationDiagnostics['bindingConstraints'] = [];
  const conservation: Partial<Record<ProductCategory, number>> = {};
  let peakUtilization = { value: 0, locationId: input.locations.find((location) => location.type === 'dc')?.id || '' };
  const observeUtilization = (value: number, locationId: string) => {
    if (value > peakUtilization.value + EPSILON || (Math.abs(value - peakUtilization.value) <= EPSILON && locationId < peakUtilization.locationId)) peakUtilization = { value, locationId };
  };

  for (let day = 0; day < days; day += 1) {
    const date = dateFor(input.startDate, day);
    const dateLabel = date.toISOString().slice(0, 10);
    const locations = locationsForDay(input, day);
    const locationMap = new Map(locations.map((location) => [location.id, location]));
    const dynamicLanes = lanesForDay(input, day, date);
    const dcs = locations.filter((location) => location.type === 'dc').sort((left, right) => left.id.localeCompare(right.id));
    const suppliers = locations.filter((location) => location.type === 'supplier').sort((left, right) => left.id.localeCompare(right.id));
    const restaurants = locations.filter((location) => location.type === 'restaurant').sort((left, right) => (left.servicePriority ?? 100) - (right.servicePriority ?? 100) || left.id.localeCompare(right.id));
    const assignedDemand = new Map<string, number>();
    for (const restaurant of restaurants) {
      const dcId = assignmentFor(input, restaurant, day);
      if (!dcId) continue;
      for (const product of productsFor(restaurant)) {
        const key = inventoryKey(dcId, product);
        assignedDemand.set(key, (assignedDemand.get(key) || 0) + weeklyDemand(restaurant, product, input.defaults));
      }
    }
    const restaurantLaneByPath = new Map<string, DynamicLane>();
    const supplierLanesByDestination = new Map<string, DynamicLane[]>();
    for (const dynamic of dynamicLanes) for (const product of dynamic.lane.products) {
      const origin = locationMap.get(dynamic.lane.originId);
      const destination = locationMap.get(dynamic.lane.destinationId);
      if (origin?.type === 'dc' && destination?.type === 'restaurant') restaurantLaneByPath.set(pathProductKey(origin.id, destination.id, product), dynamic);
      if (origin?.type === 'supplier' && destination?.type === 'dc') {
        const key = inventoryKey(destination.id, product);
        const values = supplierLanesByDestination.get(key) || [];
        values.push(dynamic);
        supplierLanesByDestination.set(key, values);
      }
    }
    for (const values of supplierLanesByDestination.values()) values.sort((left, right) => left.lane.costPerMile - right.lane.costPerMile || left.lane.id.localeCompare(right.lane.id));
    const dcInboundRemaining = new Map(dcs.map((dc) => [dc.id, statusAvailable(dc.status) && calendarOpen(dc, date) ? locationDailyCapacity(dc, 'inbound') * aggregateCapacityMultiplier(input, dc.id, day) : 0]));
    const dcOutboundRemaining = new Map(dcs.map((dc) => [dc.id, statusAvailable(dc.status) && calendarOpen(dc, date) ? locationDailyCapacity(dc, 'outbound') * aggregateCapacityMultiplier(input, dc.id, day) : 0]));
    // Product ceilings share the changed aggregate resource. Leaving them at the
    // old total silently canceled aggregate increases for single-product DCs.
    const dcProductInboundRemaining = new Map(dcs.flatMap((dc) => productsFor(dc).map((product) => [inventoryKey(dc.id, product), locationDailyCapacity(dc, 'inbound') * capacityMultiplier(input, dc.id, product, day)] as const)));
    const dcProductOutboundRemaining = new Map(dcs.flatMap((dc) => productsFor(dc).map((product) => [inventoryKey(dc.id, product), locationDailyCapacity(dc, 'outbound') * capacityMultiplier(input, dc.id, product, day)] as const)));
    const supplierRemaining = new Map<string, number>();
    const laneRemaining = new Map<string, number>();
    const opening = new Map<string, number>();
    const receipts = new Map<string, number>();
    const inbound = new Map<string, number>();
    const outbound = new Map<string, number>();
    const production = new Map<string, number>();
    const dispatches = new Map<string, { dynamic: DynamicLane; quantities: Partial<Record<ProductCategory, number>> }>();
    const recordDispatch = (dynamic: DynamicLane, product: ProductCategory, quantity: number) => {
      if (quantity <= EPSILON) return;
      const dispatch = dispatches.get(dynamic.lane.id) || { dynamic, quantities: {} };
      dispatch.quantities[product] = (dispatch.quantities[product] || 0) + quantity;
      dispatches.set(dynamic.lane.id, dispatch);
    };

    for (const dc of dcs) for (const product of productsFor(dc)) {
      const key = inventoryKey(dc.id, product);
      const policy = policyForDay(input, dc, product, day, assignedDemand.get(key) || 0);
      if (!inventory.has(key)) inventory.set(key, policy.openingInventory);
      opening.set(key, inventory.get(key) || 0);
      const received = pending.get(receiptKey(day, dc.id, product)) || 0;
      receipts.set(key, received);
      inventory.set(key, Math.min(policy.storageCapacity, (inventory.get(key) || 0) + received));
    }

    for (const supplier of suppliers) for (const product of productsFor(supplier)) {
      const available = statusAvailable(supplier.status) && calendarOpen(supplier, date) ? weeklyProduction(supplier, product, input.defaults) / activeWeekdays(supplier) * capacityMultiplier(input, supplier.id, product, day) : 0;
      supplierRemaining.set(inventoryKey(supplier.id, product), available);
    }

    for (const dc of dcs) {
      if (!statusAvailable(dc.status)) continue;
      for (const product of productsFor(dc)) {
        const key = inventoryKey(dc.id, product);
        const policy = policyForDay(input, dc, product, day, assignedDemand.get(key) || 0);
        const scheduled = [...pending.entries()].filter(([pendingKey]) => pendingKey.endsWith(`\u001f${dc.id}\u001f${product}`) && Number(pendingKey.split('\u001f')[0]) > day).reduce((sum, [, quantity]) => sum + quantity, 0);
        const inventoryPosition = (inventory.get(key) || 0) + scheduled;
        let desired = policy.replenishmentPolicy === 'scheduled'
          ? policy.scheduledReplenishment.filter((item) => item.weekday === date.getUTCDay()).reduce((sum, item) => sum + item.quantity, 0)
          : day % policy.reviewPeriodDays === 0 && inventoryPosition <= policy.reorderPoint ? Math.max(0, policy.orderUpTo - inventoryPosition) : 0;
        if (desired > EPSILON) desired = Math.max(desired, policy.minimumOrderQuantity);
        if (desired > EPSILON && policy.orderMultiple > EPSILON) desired = Math.ceil(desired / policy.orderMultiple) * policy.orderMultiple;
        desired = Math.min(desired, Math.max(0, policy.storageCapacity - inventoryPosition));
        const candidates = supplierLanesByDestination.get(key) || [];
        for (const dynamic of candidates) {
          if (desired <= EPSILON) break;
          const supplier = locationMap.get(dynamic.lane.originId)!;
          if (!statusAvailable(supplier.status)) continue;
          const supplierKey = inventoryKey(supplier.id, product);
          const laneKey = laneProductKey(dynamic.lane.id, product);
          if (!laneRemaining.has(laneKey)) laneRemaining.set(laneKey, laneDailyCapacity(dynamic, product, supplier, dc, input.defaults));
          const quantity = Math.max(0, Math.min(desired, supplierRemaining.get(supplierKey) || 0, dcInboundRemaining.get(dc.id) || 0, dcProductInboundRemaining.get(key) || 0, laneRemaining.get(laneKey) || 0));
          if (quantity <= EPSILON) continue;
          supplierRemaining.set(supplierKey, (supplierRemaining.get(supplierKey) || 0) - quantity);
          dcInboundRemaining.set(dc.id, (dcInboundRemaining.get(dc.id) || 0) - quantity);
          dcProductInboundRemaining.set(key, (dcProductInboundRemaining.get(key) || 0) - quantity);
          laneRemaining.set(laneKey, (laneRemaining.get(laneKey) || 0) - quantity);
          desired -= quantity;
          production.set(supplierKey, (production.get(supplierKey) || 0) + quantity);
          inbound.set(key, (inbound.get(key) || 0) + quantity);
          const lead = Math.max(policy.leadTimeDays, Math.ceil(dynamic.lane.transitHours * dynamic.transitTimeMultiplier / 24));
          const arrivalDay = day + lead;
          pending.set(receiptKey(arrivalDay, dc.id, product), (pending.get(receiptKey(arrivalDay, dc.id, product)) || 0) + quantity);
          recordDispatch(dynamic, product, quantity);
        }
        if (desired > EPSILON) warnings.add(`Unfilled replenishment order at ${dc.id}/${product} on ${dateLabel}.`);
      }
    }

    const restaurantRows = new Map<string, { requested: number; fulfilled: number; stockout: number; unit: PeriodProductMetric['unit'] }>();
    for (const restaurant of restaurants) for (const product of productsFor(restaurant)) {
      const demand = statusAvailable(restaurant.status) ? demandForDay(restaurant, product, date, day, input.defaults) * demandMultiplier(input, restaurant.id, product, day) : 0;
      let fulfilled = 0;
      const dcId = assignmentFor(input, restaurant, day);
      const dc = dcId ? locationMap.get(dcId) : undefined;
      const dynamic = dc ? restaurantLaneByPath.get(pathProductKey(dc.id, restaurant.id, product)) : undefined;
      if (dc && dc.type === 'dc' && statusAvailable(dc.status) && dynamic) {
        const inventoryId = inventoryKey(dc.id, product);
        const laneKey = laneProductKey(dynamic.lane.id, product);
        if (!laneRemaining.has(laneKey)) laneRemaining.set(laneKey, laneDailyCapacity(dynamic, product, dc, restaurant, input.defaults));
        fulfilled = Math.max(0, Math.min(demand, inventory.get(inventoryId) || 0, dcOutboundRemaining.get(dc.id) || 0, dcProductOutboundRemaining.get(inventoryId) || 0, laneRemaining.get(laneKey) || 0));
        inventory.set(inventoryId, Math.max(0, (inventory.get(inventoryId) || 0) - fulfilled));
        dcOutboundRemaining.set(dc.id, (dcOutboundRemaining.get(dc.id) || 0) - fulfilled);
        dcProductOutboundRemaining.set(inventoryId, (dcProductOutboundRemaining.get(inventoryId) || 0) - fulfilled);
        laneRemaining.set(laneKey, (laneRemaining.get(laneKey) || 0) - fulfilled);
        outbound.set(inventoryId, (outbound.get(inventoryId) || 0) + fulfilled);
        recordDispatch(dynamic, product, fulfilled);
      }
      const stockout = Math.max(0, demand - fulfilled);
      if (stockout > EPSILON) warnings.add(`Unmet demand at ${restaurant.id}/${product} on ${dateLabel}.`);
      const policy = explicitPolicy(restaurant, product);
      restaurantRows.set(inventoryKey(restaurant.id, product), { requested: demand, fulfilled, stockout, unit: policy?.baseUnit || 'case-equivalent' });
      addMoney(cost, 'purchaseMicros', fulfilled * (policy?.purchaseCostMicros ?? input.defaults.purchaseCostMicrosByProduct[product]) * purchaseMultiplier(input, product, day));
      addMoney(cost, 'handlingMicros', fulfilled * (policy?.handlingCostMicros ?? input.defaults.handlingCostMicrosPerUnit));
      if (input.defaults.includeShortagePenalty) addMoney(cost, 'shortagePenaltyMicros', stockout * input.defaults.shortagePenaltyMicrosByProduct[product]);
    }

    for (const dispatch of [...dispatches.values()].sort((left, right) => left.dynamic.lane.id.localeCompare(right.dynamic.lane.id))) dispatchCost(cost, dispatch.dynamic, dispatch.quantities, input.defaults);

    for (const supplier of suppliers) for (const product of productsFor(supplier)) {
      const key = inventoryKey(supplier.id, product);
      const capacity = weeklyProduction(supplier, product, input.defaults) / activeWeekdays(supplier) * capacityMultiplier(input, supplier.id, product, day);
      const produced = production.get(key) || 0;
      const utilization = capacity > 0 ? produced / capacity : produced > 0 ? 1 : 0;
      observeUtilization(utilization * 100, supplier.id);
      if (utilization >= 0.9) constraints.push({ periodIndex: day, locationId: supplier.id, product, dimension: 'supplier-production', utilization: round(utilization * 100, 4) });
      periodMetrics.push({ periodIndex: day, date: dateLabel, locationId: supplier.id, locationType: 'supplier', product, unit: explicitPolicy(supplier, product)?.baseUnit || 'case-equivalent', openingInventory: 0, receipts: 0, requestedDemand: 0, fulfilledDemand: 0, stockoutQuantity: 0, closingInventory: 0, production: round(produced), inboundQuantity: 0, outboundQuantity: round(produced), storageUtilization: 0, inboundUtilization: 0, outboundUtilization: round(utilization * 100, 4) });
    }

    for (const dc of dcs) {
      let totalClosing = 0;
      let totalStorage = 0;
      for (const product of productsFor(dc)) {
        const key = inventoryKey(dc.id, product);
        const policy = policyForDay(input, dc, product, day, assignedDemand.get(key) || 0);
        const close = inventory.get(key) || 0;
        const received = receipts.get(key) || 0;
        const sent = outbound.get(key) || 0;
        conservation[product] = (conservation[product] || 0) + (opening.get(key) || 0) + received - sent - close;
        totalClosing += close;
        totalStorage += policy.storageCapacity;
        addMoney(cost, 'inventoryCarryingMicros', close * (explicitPolicy(dc, product)?.carryingCostMicrosPerUnitDay ?? input.defaults.carryingCostMicrosPerUnitDay));
        const inboundCapacity = locationDailyCapacity(dc, 'inbound') * capacityMultiplier(input, dc.id, product, day);
        const outboundCapacity = locationDailyCapacity(dc, 'outbound') * capacityMultiplier(input, dc.id, product, day);
        periodMetrics.push({ periodIndex: day, date: dateLabel, locationId: dc.id, locationType: 'dc', product, unit: policy.baseUnit, openingInventory: round(opening.get(key) || 0), receipts: round(received), requestedDemand: 0, fulfilledDemand: 0, stockoutQuantity: 0, closingInventory: round(close), production: 0, inboundQuantity: round(inbound.get(key) || 0), outboundQuantity: round(sent), storageUtilization: round((policy.storageCapacity > 0 ? close / policy.storageCapacity : 0) * 100, 4), inboundUtilization: round((inboundCapacity > 0 ? (inbound.get(key) || 0) / inboundCapacity : 0) * 100, 4), outboundUtilization: round((outboundCapacity > 0 ? sent / outboundCapacity : 0) * 100, 4) });
      }
      const storageUtilization = totalStorage > 0 ? totalClosing / totalStorage * 100 : 0;
      observeUtilization(storageUtilization, dc.id);
      if (storageUtilization >= 90) constraints.push({ periodIndex: day, locationId: dc.id, dimension: 'dc-storage', utilization: round(storageUtilization, 4) });
      const inboundCapacity = locationDailyCapacity(dc, 'inbound') * aggregateCapacityMultiplier(input, dc.id, day);
      const outboundCapacity = locationDailyCapacity(dc, 'outbound') * aggregateCapacityMultiplier(input, dc.id, day);
      const inboundUtilization = inboundCapacity > 0 ? (inboundCapacity - (dcInboundRemaining.get(dc.id) || 0)) / inboundCapacity * 100 : 0;
      const outboundUtilization = outboundCapacity > 0 ? (outboundCapacity - (dcOutboundRemaining.get(dc.id) || 0)) / outboundCapacity * 100 : 0;
      observeUtilization(inboundUtilization, dc.id);
      observeUtilization(outboundUtilization, dc.id);
      if (inboundUtilization >= 90) constraints.push({ periodIndex: day, locationId: dc.id, dimension: 'dc-inbound', utilization: round(inboundUtilization, 4) });
      if (outboundUtilization >= 90) constraints.push({ periodIndex: day, locationId: dc.id, dimension: 'dc-outbound', utilization: round(outboundUtilization, 4) });
    }

    for (const restaurant of restaurants) for (const product of productsFor(restaurant)) {
      const row = restaurantRows.get(inventoryKey(restaurant.id, product)) || { requested: 0, fulfilled: 0, stockout: 0, unit: 'case-equivalent' as const };
      periodMetrics.push({ periodIndex: day, date: dateLabel, locationId: restaurant.id, locationType: 'restaurant', product, unit: row.unit, openingInventory: 0, receipts: 0, requestedDemand: round(row.requested), fulfilledDemand: round(row.fulfilled), stockoutQuantity: round(row.stockout), closingInventory: 0, production: 0, inboundQuantity: round(row.fulfilled), outboundQuantity: 0, storageUtilization: 0, inboundUtilization: 0, outboundUtilization: 0 });
    }
  }

  cost.totalMicros = cost.purchaseMicros + cost.linehaulVariableMicros + cost.vehicleFixedMicros + cost.driverTimeMicros + cost.stopMicros + cost.handlingMicros + cost.inventoryCarryingMicros + cost.tollMicros + cost.shortagePenaltyMicros;
  const restaurantMetrics = periodMetrics.filter((metric) => metric.locationType === 'restaurant');
  const requested = restaurantMetrics.reduce((sum, metric) => sum + metric.requestedDemand, 0);
  const fulfilled = restaurantMetrics.reduce((sum, metric) => sum + metric.fulfilledDemand, 0);
  const affected = new Set(restaurantMetrics.filter((metric) => metric.stockoutQuantity > EPSILON).map((metric) => metric.locationId));
  const stockoutRestaurantPeriods = restaurantMetrics.filter((metric) => metric.stockoutQuantity > EPSILON).length;
  const productMetrics = PRODUCTS.map((product): ProductMetric => {
    const rows = restaurantMetrics.filter((metric) => metric.product === product);
    const productRequested = rows.reduce((sum, metric) => sum + metric.requestedDemand, 0);
    const productFulfilled = rows.reduce((sum, metric) => sum + metric.fulfilledDemand, 0);
    return { product, unit: rows[0]?.unit || 'case-equivalent', requestedDemand: round(productRequested), fulfilledDemand: round(productFulfilled), stockoutQuantity: round(Math.max(0, productRequested - productFulfilled)), serviceLevel: productRequested > 0 ? round(productFulfilled / productRequested * 100, 2) : 100 };
  }).filter((metric) => metric.requestedDemand > 0);

  return {
    metrics: { serviceLevel: requested > 0 ? round(fulfilled / requested * 100, 1) : 100, stockoutUnits: Math.round(Math.max(0, requested - fulfilled)), affectedRestaurants: affected.size, totalLandedCost: Math.round(cost.totalMicros / 1_000_000), maxUtilization: round(peakUtilization.value, 1), maxUtilizationLocationId: peakUtilization.locationId, totalDemand: Math.round(requested), fulfilledDemand: Math.round(fulfilled), quantityUnit: restaurantMetrics[0]?.unit || 'case-equivalent', stockoutRestaurantPeriods, serviceTarget: input.defaults.serviceTarget },
    periodMetrics,
    productMetrics,
    costBreakdown: cost,
    diagnostics: { warnings: [...warnings].sort(), invalidTargets: [], conservationDeltaByProduct: Object.fromEntries(Object.entries(conservation).map(([product, value]) => [product, round(value || 0, 6)])), bindingConstraints: constraints },
  };
}

export function impactsBetween(baseline: SimulationCore, scenario: SimulationCore): LocationImpact[] {
  const group = (rows: PeriodProductMetric[]) => rows.reduce((result, metric) => {
    const values = result.get(metric.locationId) || [];
    values.push(metric);
    result.set(metric.locationId, values);
    return result;
  }, new Map<string, PeriodProductMetric[]>());
  const baselineByLocation = group(baseline.periodMetrics.filter((metric) => metric.locationType === 'restaurant'));
  const scenarioByLocation = group(scenario.periodMetrics.filter((metric) => metric.locationType === 'restaurant'));
  const ids = [...new Set([...baselineByLocation.keys(), ...scenarioByLocation.keys()])].sort();
  return ids.map((locationId) => {
    const baseRows = baselineByLocation.get(locationId) || [];
    const scenarioRows = scenarioByLocation.get(locationId) || [];
    const baseDemand = baseRows.reduce((sum, row) => sum + row.requestedDemand, 0);
    const baseFulfilled = baseRows.reduce((sum, row) => sum + row.fulfilledDemand, 0);
    const demand = scenarioRows.reduce((sum, row) => sum + row.requestedDemand, 0);
    const fulfilled = scenarioRows.reduce((sum, row) => sum + row.fulfilledDemand, 0);
    const baselineService = baseDemand > 0 ? baseFulfilled / baseDemand * 100 : 100;
    const scenarioService = demand > 0 ? fulfilled / demand * 100 : 100;
    const stockout = Math.max(0, demand - fulfilled);
    const baseStockout = Math.max(0, baseDemand - baseFulfilled);
    return { locationId, serviceDelta: round(scenarioService - baselineService, 1), stockoutUnits: Math.round(stockout), costDelta: Math.round(stockout - baseStockout), cause: stockout > baseStockout + EPSILON ? 'Product-period demand exceeds a feasible inventory and lane path' : 'Modeled service changed under the scenario' };
  }).filter((impact) => Math.abs(impact.serviceDelta) > 0.05 || impact.stockoutUnits > 0).sort((left, right) => right.stockoutUnits - left.stockoutUnits || left.locationId.localeCompare(right.locationId));
}
