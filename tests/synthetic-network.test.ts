import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runScenario } from '../src/flywayEngine';
import { decodeWorkspaceDocument } from '../src/schemaDecoders';
import { addSyntheticNetwork, SYNTHETIC_NETWORK_VERSION, syntheticNetwork } from '../src/syntheticNetwork';
import type { Lane, ScenarioDefinition, TwinLocation } from '../src/flywayTypes';
import { initialPreferences } from '../src/workspacePreferences';

const prefix = `${SYNTHETIC_NETWORK_VERSION}-`;
const restaurants = syntheticNetwork.locations.filter((item) => item.type === 'restaurant');
const dcs = syntheticNetwork.locations.filter((item) => item.type === 'dc');
const suppliers = syntheticNetwork.locations.filter((item) => item.type === 'supplier');
const serialized = JSON.stringify({ locations: syntheticNetwork.locations, lanes: syntheticNetwork.lanes });

type AtlasGeometry = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
type Atlas = { features: Array<{ properties: { state: string }; geometry: AtlasGeometry }> };
function inRing(longitude: number, latitude: number, ring: number[][]) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [leftLongitude, leftLatitude] = ring[index];
    const [rightLongitude, rightLatitude] = ring[previous];
    if ((leftLatitude > latitude) !== (rightLatitude > latitude) && longitude < (rightLongitude - leftLongitude) * (latitude - leftLatitude) / (rightLatitude - leftLatitude) + leftLongitude) inside = !inside;
  }
  return inside;
}
function inPolygon(longitude: number, latitude: number, polygon: number[][][]) {
  return inRing(longitude, latitude, polygon[0]) && !polygon.slice(1).some((hole) => inRing(longitude, latitude, hole));
}
function inGeometry(longitude: number, latitude: number, geometry: AtlasGeometry) {
  return geometry.type === 'Polygon' ? inPolygon(longitude, latitude, geometry.coordinates) : geometry.coordinates.some((polygon) => inPolygon(longitude, latitude, polygon));
}

assert.equal(syntheticNetwork.version, 'sample-expansion-v1');
assert.equal(syntheticNetwork.locations.length, 120);
assert.equal(restaurants.length, 88);
assert.equal(dcs.length, 8);
assert.equal(suppliers.length, 24);
assert.equal(syntheticNetwork.lanes.length, 112);
assert.ok(Buffer.byteLength(serialized) < 700_000, `Expansion must remain below 700 KB; received ${Buffer.byteLength(serialized).toLocaleString()} bytes.`);
assert.ok(syntheticNetwork.locations.every((item) => item.id.startsWith(prefix)));
assert.ok(syntheticNetwork.lanes.every((item) => item.id.startsWith(prefix)));
assert.equal(new Set(syntheticNetwork.locations.map((item) => item.id)).size, syntheticNetwork.locations.length);
assert.equal(new Set(syntheticNetwork.lanes.map((item) => item.id)).size, syntheticNetwork.lanes.length);

const allProducts = new Set(syntheticNetwork.locations.flatMap((item) => item.products));
assert.deepEqual([...allProducts].sort(), ['Beverages', 'Buns & bakery', 'Chicken', 'Cooking oil', 'Equipment', 'Packaging', 'Produce']);
for (const location of syntheticNetwork.locations) {
  assert.equal(location.evidence.classification, 'synthetic');
  assert.equal(location.evidence.confidence, 0);
  assert.equal(location.evidence.sourceUrl, undefined);
  assert.equal(location.mapPrecision, 'model-only');
  assert.match(location.name, /^Sample /);
  assert.match(location.address, /^Fictional /);
  assert.ok(location.evidence.note?.includes('not a verified company'));
  assert.ok(Object.values(location.fieldEvidence || {}).every((item) => item.classification === 'synthetic' && item.extractorVersion === SYNTHETIC_NETWORK_VERSION));
}
const atlas = JSON.parse(await readFile('public-site/data/us-state-atlas.geojson', 'utf8')) as Atlas;
const geometryByState = new Map(atlas.features.map((feature) => [feature.properties.state, feature.geometry]));
for (const location of syntheticNetwork.locations) {
  const geometry = geometryByState.get(location.state);
  assert.ok(geometry, `Missing state geometry for ${location.state}`);
  assert.ok(inGeometry(location.longitude, location.latitude, geometry!), `${location.id} must be located inside ${location.state}.`);
}
for (const lane of syntheticNetwork.lanes) {
  assert.equal(lane.evidence.classification, 'synthetic');
  assert.equal(lane.evidence.sourceUrl, undefined);
  assert.ok(lane.evidence.note?.includes('not a verified company'));
  assert.ok(Object.values(lane.fieldEvidence || {}).every((item) => item.classification === 'synthetic' && item.extractorVersion === SYNTHETIC_NETWORK_VERSION));
}

const locationsById = new Map(syntheticNetwork.locations.map((item) => [item.id, item]));
const lanesByPath = new Map(syntheticNetwork.lanes.map((item) => [`${item.originId}:${item.destinationId}`, item]));
for (const restaurant of restaurants) {
  const assigned = restaurant.assignedDcId ? locationsById.get(restaurant.assignedDcId) : undefined;
  assert.equal(assigned?.type, 'dc');
  const lane = lanesByPath.get(`${restaurant.assignedDcId}:${restaurant.id}`);
  assert.ok(lane, `Missing assigned lane for ${restaurant.id}`);
  assert.ok(restaurant.products.every((product) => lane?.products.includes(product)));
  assert.equal(restaurant.productPolicies?.length, 7);
}
for (const dc of dcs) {
  const inbound = syntheticNetwork.lanes.filter((lane) => lane.destinationId === dc.id && locationsById.get(lane.originId)?.type === 'supplier');
  assert.equal(inbound.length, 3, `${dc.id} should have three product-group suppliers.`);
  assert.deepEqual([...new Set(inbound.flatMap((lane) => lane.products))].sort(), [...dc.products].sort());
  for (const product of ['Chicken', 'Packaging', 'Cooking oil'] as const) assert.ok(inbound.filter((lane) => lane.products.includes(product)).length >= 2, `${dc.id}/${product} should have redundant synthetic supply paths.`);
}
for (const lane of syntheticNetwork.lanes) {
  assert.ok(locationsById.has(lane.originId));
  assert.ok(locationsById.has(lane.destinationId));
}

const userLocation: TwinLocation = {
  id: 'user-location', type: 'restaurant', name: 'User planning location', city: 'Example', state: 'GA', address: 'User-entered', latitude: 33, longitude: -84,
  status: 'active', products: ['Chicken'], weeklyDemand: 10, evidence: { classification: 'user-input', confidence: null, sourceTitle: 'User-entered record', publisher: 'Workspace user', verifiedAt: '2026-11-09' }, operatingSchedule: 'User schedule',
};
const original = { schemaVersion: 1 as const, revision: 7, locations: [userLocation], lanes: [] as Lane[], preferences: initialPreferences, scenarios: [], marker: 'preserve-me' };
const expanded = addSyntheticNetwork(original);
assert.notEqual(expanded, original);
assert.equal(expanded.revision, 7);
assert.equal(expanded.marker, 'preserve-me');
assert.equal(expanded.locations[0], userLocation);
assert.equal(expanded.locations.length, 121);
assert.equal(expanded.lanes.length, 112);
assert.equal(addSyntheticNetwork(expanded), expanded, 'A fully installed expansion should return the original object.');
assert.deepEqual({ locations: syntheticNetwork.locations, lanes: syntheticNetwork.lanes }, JSON.parse(serialized), 'The exported fixture must remain unchanged by merging.');

const partial = { ...original, locations: [userLocation, structuredClone(syntheticNetwork.locations[0])], lanes: [] as Lane[] };
partial.locations[1].weeklyCapacity! += 500;
partial.locations[1].name = 'User-renamed sample hub';
const completed = addSyntheticNetwork(partial);
assert.equal(completed.locations.length, 121);
assert.equal(completed.locations.find((item) => item.id === partial.locations[1].id)?.weeklyCapacity, partial.locations[1].weeklyCapacity, 'Existing edits must win over generated defaults.');
assert.equal(completed.locations.find((item) => item.id === partial.locations[1].id)?.name, 'User-renamed sample hub');
const editedLane = { ...structuredClone(syntheticNetwork.lanes[0]), destinationId: 'user-location', weeklyCapacity: 500, evidence: userLocation.evidence };
const laneCompleted = addSyntheticNetwork({ ...original, lanes: [editedLane] });
assert.equal(laneCompleted.lanes.find((item) => item.id === editedLane.id)?.destinationId, 'user-location', 'A user-edited generated lane must be preserved.');
assert.equal(laneCompleted.lanes.find((item) => item.id === editedLane.id)?.weeklyCapacity, 500, 'A capacity edit must not erase the lane’s sample identity.');
assert.throws(() => addSyntheticNetwork({ ...original, locations: [{ ...structuredClone(syntheticNetwork.locations[0]), evidence: userLocation.evidence, fieldEvidence: {}, notes: 'Unrelated record' }] }), /already used by an unrelated record/);
assert.throws(() => addSyntheticNetwork({ ...original, lanes: [{ ...structuredClone(syntheticNetwork.lanes[0]), evidence: userLocation.evidence, fieldEvidence: {} }] }), /already used by an unrelated record/);

const decoded = decodeWorkspaceDocument({ schemaVersion: 1, revision: 0, locations: syntheticNetwork.locations, lanes: syntheticNetwork.lanes, preferences: initialPreferences, scenarios: [] });
assert.equal(decoded.ok, true, decoded.ok ? '' : JSON.stringify(decoded.errors));

function scenario(type: ScenarioDefinition['type'], targetId: string, magnitude: number): ScenarioDefinition {
  return { id: `synthetic-${type}`, name: `Synthetic ${type}`, description: 'Synthetic-network domain verification.', type, targetId, magnitude, grain: 'weekly', horizon: 4, startDate: '2026-11-09', createdAt: '2026-11-09T12:00:00.000Z', baselineRevision: SYNTHETIC_NETWORK_VERSION };
}

const baseline = runScenario(syntheticNetwork.locations, syntheticNetwork.lanes, scenario('price-change', 'network', 0), undefined, { sourceVersions: [SYNTHETIC_NETWORK_VERSION], routeVersions: [SYNTHETIC_NETWORK_VERSION], forecastVersions: [SYNTHETIC_NETWORK_VERSION] });
assert.ok(baseline.baseline.totalDemand > 1_000_000, 'The expansion should exercise a material amount of modeled demand.');
assert.ok(baseline.baseline.serviceLevel >= 98, `Expected a usable baseline at or above target; received ${baseline.baseline.serviceLevel}%.`);
assert.ok(baseline.baseline.stockoutUnits <= baseline.baseline.totalDemand * 0.02);
assert.deepEqual(baseline.diagnostics?.invalidTargets, []);
assert.deepEqual(baseline.input?.sourceVersions, [SYNTHETIC_NETWORK_VERSION]);

const outage = runScenario(syntheticNetwork.locations, syntheticNetwork.lanes, scenario('dc-outage', syntheticNetwork.scenarioHubId, 100));
assert.ok(outage.scenario.serviceLevel < outage.baseline.serviceLevel - 5, 'A regional hub outage should materially reduce service.');
assert.ok(outage.scenario.stockoutUnits > outage.baseline.stockoutUnits + 50_000, 'A regional hub outage should create meaningful unmet demand.');
assert.ok(outage.scenario.affectedRestaurants >= 11);
assert.ok(outage.impacts.some((impact) => impact.stockoutUnits > 0));

const backupSupplier = suppliers.find((item) => item.id.includes('southeast-protein'))!;
const supplierFailure = runScenario(syntheticNetwork.locations, syntheticNetwork.lanes, scenario('supplier-failure', backupSupplier.id, 100));
assert.equal(supplierFailure.scenario.serviceLevel, 100, 'Overlapping supplier product groups should protect service from one synthetic protein supplier failure.');
assert.equal(supplierFailure.scenario.stockoutUnits, 0);

const surgeTarget = restaurants.find((item) => item.assignedDcId === syntheticNetwork.scenarioHubId)!;
const surge = runScenario(syntheticNetwork.locations, syntheticNetwork.lanes, scenario('demand-surge', surgeTarget.id, 65));
assert.ok(surge.scenario.totalDemand > surge.baseline.totalDemand);
assert.ok(surge.scenario.stockoutUnits > surge.baseline.stockoutUnits, 'A severe local surge should exercise actual lane/inventory limits.');

console.log(JSON.stringify({
  version: syntheticNetwork.version,
  counts: { locations: syntheticNetwork.locations.length, dcs: dcs.length, restaurants: restaurants.length, suppliers: suppliers.length, lanes: syntheticNetwork.lanes.length },
  serializedBytes: Buffer.byteLength(serialized),
  baseline: baseline.baseline,
  hubOutage: outage.scenario,
  redundantSupplierFailure: supplierFailure.scenario,
  surge: surge.scenario,
}, null, 2));
