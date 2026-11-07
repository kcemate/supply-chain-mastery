import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initialLocations } from '../src/flywayData';
import type { PublicDistributionFacilityRegistry, PublicFootprintSnapshot } from '../src/flywayTypes';

const footprint = JSON.parse(await readFile('public-site/data/chick-fil-a-verified-locations.json', 'utf8')) as PublicFootprintSnapshot;
const facilities = JSON.parse(await readFile('public-site/data/chick-fil-a-public-distribution-facilities.json', 'utf8')) as PublicDistributionFacilityRegistry;
const stateAtlas = JSON.parse(await readFile('public-site/data/us-state-atlas.geojson', 'utf8')) as {
  features: Array<{ properties: { state: string; officialLocationPages: number } }>;
};
const review = footprint.needsReview || [];
const metadata = footprint.metadata;

assert.equal(metadata.snapshotDate, '2026-08-20');
assert.equal(metadata.officialRecordCount, 3458);
assert.equal(metadata.exactMappedCount, footprint.locations.length);
assert.equal(metadata.needsReviewCount, review.length);
assert.equal(footprint.locations.length + review.length, metadata.officialRecordCount);
assert.equal(new Set(footprint.locations.map((location) => location.id)).size, footprint.locations.length);
assert.equal(new Set(footprint.locations.map((location) => location.wpPostId)).size, footprint.locations.length);
assert.ok(footprint.locations.every((location) => location.evidenceClass === undefined || location.evidenceClass === 'verified-public'));
assert.ok(footprint.locations.every((location) => /^https:\/\/www\.chick-fil-a\.com\/locations\/[a-z]{2}\//.test(location.sourceUrl)));
assert.ok(footprint.locations.every((location) => Boolean(location.name && location.address && location.city && location.state && location.postalCode)));
assert.ok(footprint.locations.every((location) => /^[a-f0-9]{64}$/.test(location.sourceChecksum || '')));
assert.ok(footprint.locations.every((location) => Number.isFinite(location.latitude) && location.latitude >= 18 && location.latitude <= 72));
assert.ok(footprint.locations.every((location) => Number.isFinite(location.longitude) && location.longitude >= -180 && location.longitude <= -60));
assert.match(metadata.methodology, /official Chick-fil-A location pages/i);
assert.match(metadata.limitations, /not current operating status/i);

assert.equal(stateAtlas.features.length, 51);
assert.equal(stateAtlas.features.reduce((sum, feature) => sum + feature.properties.officialLocationPages, 0), 3458);
assert.ok(stateAtlas.features.every((feature) => !('servedBy' in feature.properties) && !('territory' in feature.properties)));

const modeledRestaurants = initialLocations.filter((location) => location.type === 'restaurant');
const modeledSuppliers = initialLocations.filter((location) => location.type === 'supplier');
assert.ok(modeledRestaurants.every((location) => location.mapPrecision === 'model-only' && location.evidence.classification === 'synthetic'));
assert.ok(modeledSuppliers.every((location) => location.evidence.classification === 'synthetic'));
assert.ok(!footprint.locations.some((location) => modeledSuppliers.some((supplier) => supplier.name === location.name)));

assert.equal(facilities.schemaVersion, 1);
assert.equal(facilities.snapshotDate, '2026-08-21');
assert.equal(facilities.currentOfficialJobCount, 59);
assert.equal(facilities.facilityCount, 16);
assert.equal(facilities.plottedFacilityCount, 16);
assert.equal(facilities.exactAddressCount, 13);
assert.equal(facilities.cityLevelCount, 3);
assert.equal(facilities.launchOrStandupCount, 1);
assert.equal(facilities.addressConflictCount, 3);
assert.equal(facilities.evidenceCount, 19);
assert.equal(facilities.historicalReportedCount, 9);
assert.equal(facilities.facilities.length, facilities.facilityCount);
assert.equal(facilities.evidence.length, facilities.evidenceCount);
assert.equal(new Set(facilities.facilities.map((facility) => facility.id)).size, facilities.facilityCount);
assert.equal(new Set(facilities.facilities.map((facility) => facility.stableKey)).size, facilities.facilityCount);
assert.equal(new Set(facilities.evidence.map((evidence) => evidence.id)).size, facilities.evidenceCount);
assert.ok(facilities.facilities.every((facility) => facility.country === 'US' && facility.evidenceIds.length > 0 && facility.directEvidenceJobIds.length > 0));
assert.ok(facilities.facilities.every((facility) => Number.isFinite(facility.latitude) && Number.isFinite(facility.longitude)));
assert.ok(facilities.facilities.filter((facility) => facility.mapPrecision === 'exact-public-address').every((facility) => Boolean(facility.address && facility.coordinateSource === 'official-careers-api')));
assert.ok(facilities.facilities.filter((facility) => facility.mapPrecision === 'city-level-public-evidence').every((facility) => Boolean(facility.reviewNote && facility.coordinateSource === 'official-city-coordinate')));
assert.equal(facilities.facilities.filter((facility) => facility.mapPrecision === 'city-level-public-evidence').length, 3);
assert.ok(facilities.evidence.every((evidence) => evidence.publisher === 'Chick-fil-A, Inc.' && /^https:\/\/(www\.)?(chick-fil-a\.com|careers\.chick-fil-a\.com)\//.test(evidence.sourceUrl)));
assert.ok(facilities.evidence.every((evidence) => /^[a-f0-9]{64}$/.test(evidence.sourceChecksum)));
assert.match(facilities.limitations, /not.*operating/i);
assert.ok(facilities.needsReview.some((item) => item.candidateKey === 'aggregate:2024-nine-dcs'));
assert.ok(facilities.exclusions.some((item) => /Partner distributors/i.test(item.candidate)));
assert.ok(!facilities.facilities.some((facility) => initialLocations.some((location) => location.id === facility.id)));
const serializedFacilities = JSON.stringify(facilities);
for (const forbiddenField of ['weeklyCapacity', 'inventoryDays', 'assignedDcId', 'serviceRadiusMiles', 'routes', 'territory']) assert.ok(!serializedFacilities.includes(`\"${forbiddenField}\"`), `public registry must not contain ${forbiddenField}`);

console.log(`Public evidence atlas passed: ${metadata.officialRecordCount.toLocaleString()} official records, ${footprint.locations.length.toLocaleString()} validated official points, ${facilities.facilityCount} directly named DCs (${facilities.exactAddressCount} exact, ${facilities.cityLevelCount} city-level), ${review.length.toLocaleString()} unplotted restaurant review records, 51-state atlas, and no invented territories or suppliers.`);
