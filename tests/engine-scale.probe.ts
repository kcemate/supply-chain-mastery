import { runScenario } from '../src/flywayEngine';
import type { Evidence, Lane, ProductCategory, TwinLocation } from '../src/flywayTypes';

const products: ProductCategory[] = ['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment'];
const evidence: Evidence = { classification: 'synthetic', confidence: null, sourceTitle: 'Scale probe', publisher: 'Flyway', verifiedAt: '2026-09-04' };
const locations: TwinLocation[] = [];
const lanes: Lane[] = [];

for (let supplier = 0; supplier < 100; supplier += 1) locations.push({ id: `s${supplier}`, type: 'supplier', name: `S${supplier}`, city: 'X', state: 'GA', address: 'X', latitude: 30 + supplier / 100, longitude: -90, status: 'active', products, weeklyCapacity: 35_000, productPolicies: products.map((product) => ({ product, baseUnit: 'case', weeklyProductionCapacity: 5_000 })), evidence, operatingSchedule: 'Daily' });
for (let dc = 0; dc < 25; dc += 1) {
  locations.push({ id: `d${dc}`, type: 'dc', name: `D${dc}`, city: 'X', state: 'GA', address: 'X', latitude: 32 + dc / 100, longitude: -88, status: 'active', products, weeklyCapacity: 14_000, productPolicies: products.map((product) => ({ product, baseUnit: 'case', openingInventory: 1_400, storageCapacity: 7_000, safetyStock: 700, reorderPoint: 1_400, orderUpTo: 5_600, leadTimeDays: 1 })), evidence, operatingSchedule: 'Daily' });
  for (let index = 0; index < 4; index += 1) {
    const supplier = dc * 4 + index;
    lanes.push({ id: `s${supplier}-d${dc}`, originId: `s${supplier}`, destinationId: `d${dc}`, products, miles: 100 + index * 10, transitHours: 3, deliveriesPerWeek: 7, costPerMile: 2.5, status: 'active', weeklyCapacity: 100_000, evidence });
  }
}
for (let restaurant = 0; restaurant < 3_500; restaurant += 1) {
  const dc = restaurant % 25;
  locations.push({ id: `r${restaurant}`, type: 'restaurant', name: `R${restaurant}`, city: 'X', state: 'GA', address: 'X', latitude: 33 + (restaurant % 100) / 1_000, longitude: -84, status: 'active', products, weeklyDemand: 70, productPolicies: products.map((product) => ({ product, baseUnit: 'case', weeklyDemand: 10 })), assignedDcId: `d${dc}`, evidence, operatingSchedule: 'Daily' });
  lanes.push({ id: `d${dc}-r${restaurant}`, originId: `d${dc}`, destinationId: `r${restaurant}`, products, miles: 20 + restaurant % 80, transitHours: 2, deliveriesPerWeek: 7, costPerMile: 2.4, status: 'active', weeklyCapacity: 100, evidence });
}

const heapBefore = process.memoryUsage().heapUsed;
const started = performance.now();
const result = runScenario(locations, lanes, { id: 'scale', name: 'Scale', description: 'Connected replenishment scale probe', type: 'price-change', targetId: 'network', magnitude: 0, grain: 'weekly', horizon: 4, createdAt: '2026-09-04T00:00:00Z', baselineRevision: 'scale', startDate: '2026-09-07', changes: [] });
const memory = process.memoryUsage();
console.log(JSON.stringify({ locations: locations.length, lanes: lanes.length, periodRows: result.periodMetrics?.length, baselineRows: result.baselinePeriodMetrics?.length, service: result.scenario.serviceLevel, stockouts: result.scenario.stockoutUnits, elapsedMs: Math.round(performance.now() - started), heapDeltaMiB: Math.round((memory.heapUsed - heapBefore) / 1_048_576), heapUsedMiB: Math.round(memory.heapUsed / 1_048_576), rssMiB: Math.round(memory.rss / 1_048_576), recommendations: result.recommendations.length, checksumLength: result.outputChecksum?.length }));
