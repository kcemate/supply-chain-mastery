import { createEvidenceValue } from './evidence/provenance';
import type { Evidence, Lane, LocationProductPolicy, ProductCategory, TwinLocation } from './flywayTypes';

export const SYNTHETIC_NETWORK_VERSION = 'sample-expansion-v1';
const PREFIX = `${SYNTHETIC_NETWORK_VERSION}-`;
const VERIFIED_AT = '2026-11-09';
const PRODUCTS: ProductCategory[] = ['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment'];
const PRODUCT_WEIGHTS: Record<ProductCategory, number> = { Chicken: 0.28, Produce: 0.18, 'Buns & bakery': 0.14, Packaging: 0.12, Beverages: 0.14, 'Cooking oil': 0.08, Equipment: 0.06 };
const RESTAURANT_OFFSETS = [
  [-0.34, -0.32], [-0.27, 0.22], [-0.2, -0.1], [-0.13, 0.34], [-0.05, -0.26], [0.03, 0.09],
  [0.11, -0.04], [0.18, 0.28], [0.25, -0.19], [0.31, 0.14], [0.37, -0.3],
] as const;

type Region = {
  slug: string; label: string; city: string; state: string; latitude: number; longitude: number;
  timezone: string; demandFactor: number; serviceRadiusMiles: number;
};

const REGIONS: Region[] = [
  { slug: 'northwest', label: 'Northwest', city: 'Spokane', state: 'WA', latitude: 47.66, longitude: -117.43, timezone: 'America/Los_Angeles', demandFactor: 0.94, serviceRadiusMiles: 410 },
  { slug: 'pacific', label: 'Pacific', city: 'Fresno', state: 'CA', latitude: 36.74, longitude: -119.79, timezone: 'America/Los_Angeles', demandFactor: 1.08, serviceRadiusMiles: 390 },
  { slug: 'mountain', label: 'Mountain', city: 'Aurora', state: 'CO', latitude: 39.72, longitude: -104.81, timezone: 'America/Denver', demandFactor: 0.91, serviceRadiusMiles: 470 },
  { slug: 'south-central', label: 'South Central', city: 'Fort Worth', state: 'TX', latitude: 32.76, longitude: -97.33, timezone: 'America/Chicago', demandFactor: 1.12, serviceRadiusMiles: 430 },
  { slug: 'midwest', label: 'Midwest', city: 'Springfield', state: 'IL', latitude: 39.78, longitude: -89.65, timezone: 'America/Chicago', demandFactor: 1.01, serviceRadiusMiles: 420 },
  { slug: 'southeast', label: 'Southeast', city: 'Macon', state: 'GA', latitude: 32.84, longitude: -83.63, timezone: 'America/New_York', demandFactor: 1.09, serviceRadiusMiles: 410 },
  { slug: 'mid-atlantic', label: 'Mid-Atlantic', city: 'Richmond', state: 'VA', latitude: 37.54, longitude: -77.44, timezone: 'America/New_York', demandFactor: 1.04, serviceRadiusMiles: 390 },
  { slug: 'northeast', label: 'Northeast', city: 'Harrisburg', state: 'PA', latitude: 40.27, longitude: -76.89, timezone: 'America/New_York', demandFactor: 1.07, serviceRadiusMiles: 360 },
];

const SUPPLIER_GROUPS: Array<{ slug: string; label: string; products: ProductCategory[] }> = [
  { slug: 'protein', label: 'Protein', products: ['Chicken', 'Cooking oil'] },
  { slug: 'fresh', label: 'Fresh & Bakery', products: ['Produce', 'Buns & bakery', 'Beverages', 'Packaging'] },
  { slug: 'operations', label: 'Operations', products: ['Chicken', 'Packaging', 'Cooking oil', 'Equipment'] },
];

const round = (value: number, precision = 2) => Math.round(value * 10 ** precision) / 10 ** precision;
const id = (...parts: Array<string | number>) => `${PREFIX}${parts.join('-')}`;
const clone = <T>(value: T): T => structuredClone(value);

const evidenceFor = (kind: 'location' | 'lane', formula: string): Evidence => ({
  classification: 'synthetic', confidence: 0,
  sourceTitle: `Flyway synthetic planning expansion ${SYNTHETIC_NETWORK_VERSION}`,
  publisher: 'Flyway', verifiedAt: VERIFIED_AT,
  note: `Fictional, editable ${kind} generated deterministically from ${formula}. It is not a verified company facility, relationship, route, demand, capacity, inventory, cost, or forecast.`,
});

function fieldEvidence(entityType: 'location' | 'lane', entityId: string, fieldPath: string, value: number | string, unit: string | undefined, formula: string) {
  return createEvidenceValue({
    id: id('evidence', entityType, entityId.slice(PREFIX.length), fieldPath.replace(/\./g, '-')),
    entityType, entityId, fieldPath, value, unit, classification: 'synthetic', confidence: 0,
    sourceTitle: `Flyway synthetic planning expansion ${SYNTHETIC_NETWORK_VERSION}`, sourcePublisher: 'Flyway',
    verifiedAt: VERIFIED_AT, extractionMethod: `deterministic-formula:${formula}`, extractorVersion: SYNTHETIC_NETWORK_VERSION,
    reviewNote: 'Editable sample estimate. No public or private operating data was used.',
  });
}

function productDemand(total: number, product: ProductCategory) {
  return round(total * PRODUCT_WEIGHTS[product], 2);
}

function restaurantPolicies(total: number, restaurantIndex: number): LocationProductPolicy[] {
  const seasonality = restaurantIndex % 3 === 0 ? [0, 0.96, 1, 1.02, 1.08, 1.18, 1.06] : restaurantIndex % 3 === 1 ? [0, 1.02, 0.98, 1, 1.04, 1.12, 1.1] : [0, 0.94, 0.98, 1.04, 1.1, 1.16, 1.08];
  return PRODUCTS.map((product) => ({
    product, baseUnit: 'case-equivalent', weeklyDemand: productDemand(total, product),
    seasonalityByWeekday: seasonality, growthRatePerPeriod: 0, eventMultiplier: 1,
  }));
}

function dcPolicies(regionDemand: number): LocationProductPolicy[] {
  return PRODUCTS.map((product) => {
    const weekly = productDemand(regionDemand, product);
    const daily = weekly / 6;
    return {
      product, baseUnit: 'case-equivalent', openingInventory: round(daily * 12), storageCapacity: round(daily * 18),
      safetyStock: round(daily * 2), reorderPoint: round(daily * 4), orderUpTo: round(daily * 12), leadTimeDays: 1,
      replenishmentPolicy: 'reorder-point', reviewPeriodDays: 1, minimumOrderQuantity: 25, orderMultiple: 25,
    };
  });
}

function distanceMiles(left: { latitude: number; longitude: number }, right: { latitude: number; longitude: number }) {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const latitudeDelta = radians(right.latitude - left.latitude);
  const longitudeDelta = radians(right.longitude - left.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(left.latitude)) * Math.cos(radians(right.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return round(3_958.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)), 1);
}

const locations: TwinLocation[] = [];
const lanes: Lane[] = [];

for (const [regionIndex, region] of REGIONS.entries()) {
  const dcId = id('dc', region.slug);
  const restaurantTotals = RESTAURANT_OFFSETS.map((_, restaurantIndex) => Math.round((2_650 + regionIndex * 85 + restaurantIndex * 73) * region.demandFactor));
  const regionDemand = restaurantTotals.reduce((sum, value) => sum + value, 0);
  const dcCapacity = Math.ceil(regionDemand * 1.34 / 100) * 100;
  const inboundCapacityPerDay = round(dcCapacity / 4.2);
  const outboundCapacityPerDay = round(dcCapacity / 5.4);
  const storageCapacity = Math.ceil(regionDemand * 3);
  locations.push({
    id: dcId, type: 'dc', name: `Sample ${region.label} Distribution Hub`, city: region.city, state: region.state,
    address: `Fictional planning location · ${region.city}, ${region.state}`, latitude: region.latitude, longitude: region.longitude,
    status: 'active', products: PRODUCTS, weeklyCapacity: dcCapacity, inventoryDays: 12, serviceRadiusMiles: region.serviceRadiusMiles,
    inboundCapacityPerDay, outboundCapacityPerDay, storageCapacity,
    evidence: evidenceFor('location', `regional demand template ${regionIndex + 1}`), operatingSchedule: 'Sample schedule · daily receiving and dispatch',
    notes: `${SYNTHETIC_NETWORK_VERSION} fictional regional planning hub.`, mapPrecision: 'model-only', timezone: region.timezone,
    calendar: { operatingWeekdays: [0, 1, 2, 3, 4, 5, 6] }, productPolicies: dcPolicies(regionDemand),
    fieldEvidence: {
      weeklyCapacity: fieldEvidence('location', dcId, 'weeklyCapacity', dcCapacity, 'case-equivalent/week', 'region-demand-x-1.34'),
      inboundCapacityPerDay: fieldEvidence('location', dcId, 'inboundCapacityPerDay', inboundCapacityPerDay, 'case-equivalent/day', 'weekly-capacity-divided-by-4.2'),
      outboundCapacityPerDay: fieldEvidence('location', dcId, 'outboundCapacityPerDay', outboundCapacityPerDay, 'case-equivalent/day', 'weekly-capacity-divided-by-5.4'),
      storageCapacity: fieldEvidence('location', dcId, 'storageCapacity', storageCapacity, 'case-equivalent', 'regional-demand-x-3.00'),
      inventoryDays: fieldEvidence('location', dcId, 'inventoryDays', 12, 'days', 'fixed-planning-template'),
    },
  });

  for (const [restaurantIndex, [latitudeOffset, longitudeOffset]] of RESTAURANT_OFFSETS.entries()) {
    const restaurantId = id('restaurant', region.slug, String(restaurantIndex + 1).padStart(2, '0'));
    const weeklyDemand = restaurantTotals[restaurantIndex];
    locations.push({
      id: restaurantId, type: 'restaurant', name: `Sample ${region.label} Restaurant ${String(restaurantIndex + 1).padStart(2, '0')}`,
      city: `${region.label} market ${String(restaurantIndex + 1).padStart(2, '0')}`, state: region.state,
      address: `Fictional city-area point · ${region.state}`, latitude: round(region.latitude + latitudeOffset), longitude: round(region.longitude + longitudeOffset),
      status: 'active', products: PRODUCTS, weeklyDemand, inventoryDays: round(1.8 + (restaurantIndex % 4) * 0.25, 2), assignedDcId: dcId,
      evidence: evidenceFor('location', `regional demand band ${regionIndex + 1}, restaurant band ${restaurantIndex + 1}`),
      operatingSchedule: 'Sample schedule · Mon–Sat 6:30 AM–10 PM', notes: `${SYNTHETIC_NETWORK_VERSION} fictional restaurant demand point.`,
      mapPrecision: 'model-only', timezone: region.timezone, calendar: { operatingWeekdays: [1, 2, 3, 4, 5, 6] },
      productPolicies: restaurantPolicies(weeklyDemand, restaurantIndex), servicePriority: 1 + (restaurantIndex % 3),
      fieldEvidence: { weeklyDemand: fieldEvidence('location', restaurantId, 'weeklyDemand', weeklyDemand, 'case-equivalent/week', 'regional-demand-band') },
    });
    const restaurant = locations.at(-1)!;
    const miles = Math.max(12, distanceMiles(region, restaurant));
    const weeklyLaneCapacity = Math.ceil(weeklyDemand * 1.5);
    const laneId = id('lane', 'dc', region.slug, 'restaurant', String(restaurantIndex + 1).padStart(2, '0'));
    lanes.push({
      id: laneId, originId: dcId, destinationId: restaurantId, products: PRODUCTS, miles,
      transitHours: round(Math.max(0.55, miles / 48), 2), deliveriesPerWeek: 6, costPerMile: round(2.58 + regionIndex * 0.035, 3),
      status: 'active', evidence: evidenceFor('lane', 'great-circle planning distance and regional cost band'), weeklyCapacity: weeklyLaneCapacity,
      operatingDays: [1, 2, 3, 4, 5, 6], productPolicies: PRODUCTS.map((product) => ({
        product, maxQuantityPerDay: round(productDemand(weeklyDemand, product) / 6 * 1.5), variableCostMicrosPerUnit: 42_000 + regionIndex * 1_500,
      })),
      fixedDispatchCostMicros: 48_000_000, driverCostMicrosPerHour: 34_000_000, tollCostMicros: regionIndex % 2 ? 4_500_000 : 1_500_000,
      vehicleCapacity: 1_800, vehicleType: { id: 'sample-refrigerated-route', name: 'Sample refrigerated route vehicle', capacity: 1_800, fixedCostMicros: 12_000_000 },
      dwellHours: 0.65, maxDriverHours: 14, deliveryWindow: { startHour: 4, endHour: 20 }, receivingWindow: { startHour: 4, endHour: 21 }, fuelEconomyMpg: 8.2,
      fieldEvidence: {
        id: fieldEvidence('lane', laneId, 'id', laneId, undefined, 'hub-and-restaurant-template-identity'),
      },
    });
  }

  for (const [groupIndex, group] of SUPPLIER_GROUPS.entries()) {
    const supplierId = id('supplier', region.slug, group.slug);
    const groupDemand = group.products.reduce((sum, product) => sum + productDemand(regionDemand, product), 0);
    const weeklyCapacity = Math.ceil(groupDemand * 2 / 100) * 100;
    const latitude = round(region.latitude + 0.32 + groupIndex * 0.08);
    const longitude = round(region.longitude - 0.34 + groupIndex * 0.17);
    locations.push({
      id: supplierId, type: 'supplier', name: `Sample ${region.label} ${group.label} Supplier`, city: `${region.label} supply market`, state: region.state,
      address: `Fictional supplier location · ${region.state}`, latitude, longitude, status: 'active', products: group.products,
      weeklyCapacity, reliability: round(0.94 + ((regionIndex + groupIndex) % 4) * 0.01, 2), evidence: evidenceFor('location', `regional product demand x 2.00 for ${group.label}`),
      operatingSchedule: 'Sample schedule · daily shipping', notes: `${SYNTHETIC_NETWORK_VERSION} fictional supplier placeholder.`, mapPrecision: 'model-only',
      timezone: region.timezone, calendar: { operatingWeekdays: [0, 1, 2, 3, 4, 5, 6] },
      productPolicies: group.products.map((product) => ({ product, baseUnit: 'case-equivalent', weeklyProductionCapacity: round(productDemand(regionDemand, product) * 2) })),
      fieldEvidence: { weeklyCapacity: fieldEvidence('location', supplierId, 'weeklyCapacity', weeklyCapacity, 'case-equivalent/week', 'regional-product-demand-x-2.00') },
    });
    const miles = distanceMiles({ latitude, longitude }, region);
    const laneId = id('lane', 'supplier', region.slug, group.slug, 'dc');
    lanes.push({
      id: laneId, originId: supplierId, destinationId: dcId, products: group.products, miles, transitHours: round(Math.max(0.8, miles / 46), 2),
      deliveriesPerWeek: 7, costPerMile: round(2.71 + groupIndex * 0.06, 2), status: 'active', weeklyCapacity: Math.ceil(groupDemand * 1.55 / 100) * 100,
      operatingDays: [0, 1, 2, 3, 4, 5, 6], evidence: evidenceFor('lane', 'great-circle planning distance and product-group capacity'),
      productPolicies: group.products.map((product) => ({ product, maxQuantityPerDay: round(productDemand(regionDemand, product) * 1.55 / 7), variableCostMicrosPerUnit: 31_000 + groupIndex * 4_000 })),
      fixedDispatchCostMicros: 58_000_000, driverCostMicrosPerHour: 36_000_000, vehicleCapacity: 2_400,
      vehicleType: { id: 'sample-inbound-tractor', name: 'Sample inbound tractor-trailer', capacity: 2_400, fixedCostMicros: 18_000_000 },
      dwellHours: 0.9, maxDriverHours: 14, deliveryWindow: { startHour: 2, endHour: 20 }, receivingWindow: { startHour: 2, endHour: 20 }, fuelEconomyMpg: 7.4,
      fieldEvidence: {
        id: fieldEvidence('lane', laneId, 'id', laneId, undefined, 'hub-and-supplier-group-template-identity'),
      },
    });
  }
}

export const syntheticNetwork = {
  version: SYNTHETIC_NETWORK_VERSION,
  locations,
  lanes,
  scenarioHubId: id('dc', 'southeast'),
} as const;

function hasGeneratorMarker(value: TwinLocation | Lane) {
  return value.evidence.sourceTitle.includes(SYNTHETIC_NETWORK_VERSION)
    || Object.values(value.fieldEvidence || {}).some((item) => item.extractorVersion === SYNTHETIC_NETWORK_VERSION)
    || ('notes' in value && value.notes?.includes(SYNTHETIC_NETWORK_VERSION));
}

function assertCompatible(existing: TwinLocation | Lane, expected: TwinLocation | Lane) {
  if ('type' in expected) {
    if (!('type' in existing) || existing.type !== expected.type || !hasGeneratorMarker(existing)) throw new Error(`Synthetic location ID ${expected.id} is already used by an unrelated record.`);
    return;
  }
  if ('type' in existing || !hasGeneratorMarker(existing)) throw new Error(`Synthetic lane ID ${expected.id} is already used by an unrelated record.`);
}

export function addSyntheticNetwork<T extends { locations: TwinLocation[]; lanes: Lane[] }>(workspace: T): T {
  const locationById = new Map(workspace.locations.map((item) => [item.id, item]));
  const laneById = new Map(workspace.lanes.map((item) => [item.id, item]));
  for (const item of syntheticNetwork.locations) {
    const existing = locationById.get(item.id);
    if (existing) assertCompatible(existing, item);
  }
  for (const item of syntheticNetwork.lanes) {
    const existing = laneById.get(item.id);
    if (existing) assertCompatible(existing, item);
  }
  const missingLocations = syntheticNetwork.locations.filter((item) => !locationById.has(item.id));
  const missingLanes = syntheticNetwork.lanes.filter((item) => !laneById.has(item.id));
  if (!missingLocations.length && !missingLanes.length) return workspace;
  return { ...workspace, locations: [...workspace.locations, ...clone(missingLocations)], lanes: [...workspace.lanes, ...clone(missingLanes)] };
}
