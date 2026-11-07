import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { decideAndPublish, quarantineRefresh, type EvidenceLedger } from '../src/evidence';
import { preserveRawArtifact } from '../scripts/evidence-refresh-core.mjs';
import { extractRestaurantCandidate } from '../scripts/restaurant-evidence-adapter.mjs';
import { discoverDirectFacilityJobs, groupFacilityJobs, selectStrongestFacilityJob } from '../scripts/facility-evidence-adapter.mjs';

const record = { id: 42, slug: 'ga/test-restaurant', link: 'https://www.chick-fil-a.com/locations/ga/test-restaurant', modified_gmt: '2026-09-04T00:00:00', title: { rendered: 'Test Restaurant' } };
const html = `<!doctype html><script type="application/ld+json">${JSON.stringify({ '@type': 'Restaurant', url: record.link, name: 'Test Restaurant', telephone: '555-0100', address: { '@type': 'PostalAddress', streetAddress: '100 Test Street', addressLocality: 'Atlanta', addressRegion: 'GA', postalCode: '30303', addressCountry: 'US' } })}</script><a href="https://google.com/maps/dir/Current+Location/33.7501,-84.3902">Directions</a><script>window.x={"locationNumber":"0042"}</script>`;
const directory = await mkdtemp(path.join(tmpdir(), 'flyway-ingestion-'));
const artifact = await preserveRawArtifact({ rootDir: directory, sourceId: 'official-location-42', retrievedAt: '2026-09-04T12:00:00.000Z', parserVersion: 'fixture-v2', sourceUrl: record.link, payload: html, pageCount: 1, recordCount: 1 });
const candidate = extractRestaurantCandidate({ record, html, finalUrl: record.link, retrievedAt: artifact.retrievedAt, sourceArtifactId: artifact.id, extractorVersion: 'fixture-v2' });
assert.equal(candidate.status, 'verified_public');
assert.equal(candidate.id, 'official-42');
assert.equal(candidate.latitude, 33.7501);
assert.equal(candidate.sourceArtifactId, artifact.id);

const ledger: EvidenceLedger = {
  schemaVersion: 1,
  sources: [{ id: artifact.sourceId, publisher: 'Chick-fil-A, Inc.', title: 'Official location page', canonicalUrl: record.link, sourceType: 'official-location-index', cadenceDays: 7, staleAfterDays: 30, termsNote: 'Fixture' }],
  artifacts: [], snapshots: [], values: [], conflicts: [], publications: [],
};
const quarantined = quarantineRefresh({
  ledger, datasetId: 'public-restaurants', artifact, candidates: [{ stableKey: String(candidate.id), record: candidate }], currentRecords: [],
  materialFields: ['name', 'address', 'city', 'state', 'postalCode', 'latitude', 'longitude'], entityType: 'public-restaurant',
  sourceTitle: 'Official location page', sourcePublisher: 'Chick-fil-A, Inc.', sourceUrl: record.link,
  classification: 'verified-public', confidence: 0.98, createdAt: artifact.retrievedAt, extractorVersion: 'fixture-v2',
});
assert.equal(quarantined.publications?.length, 0, 'fresh evidence stays quarantined');
assert.equal(quarantined.conflicts.length, 1);
const published = await decideAndPublish({ ledger: quarantined, conflictId: quarantined.conflicts[0].id, decision: { id: 'decision:42', action: 'accept', actorId: 'fixture-reviewer', decidedAt: '2026-09-04T13:00:00.000Z', reason: 'Structured address and unique official-page coordinate verified' } });
assert.equal(published.publication?.records[0].data, candidate);
assert.equal(published.publication?.records[0].status, 'published');
assert.match(published.publication?.checksumSha256 || '', /^[a-f0-9]{64}$/);

const ambiguous = extractRestaurantCandidate({ record, html: `${html}<a href="https://google.com/maps/dir/Current+Location/34,-85">Other</a>`, finalUrl: record.link, retrievedAt: artifact.retrievedAt, sourceArtifactId: artifact.id, extractorVersion: 'fixture-v2' });
assert.equal(ambiguous.status, 'needs_review');
assert.equal(ambiguous.reason, 'ambiguous_coordinates');

const newFacilityJobs = discoverDirectFacilityJobs([
  { data: { slug: 'new-1', country_code: 'US', location_name: 'New Market Distribution Center', description: '<p>Work in this distribution center.</p>', city: 'Example', state: 'Georgia', posted_date: '2026-09-01' } },
  { data: { slug: 'new-2', country_code: 'US', location_name: 'New Market Distribution Center', description: '<p>Work in this distribution center.</p>', street_address: '1 Public Way', city: 'Example', state: 'Georgia', postal_code: '30000', latitude: 33.1, longitude: -84.1, posted_date: '2026-08-30' } },
  { data: { slug: 'regional', country_code: 'US', location_name: 'Southeast Region', description: 'Distribution center network role' } },
  { data: { slug: 'international', country_code: 'CA', location_name: 'Canada Distribution Center', description: 'Distribution center role' } },
]);
assert.equal(newFacilityJobs.length, 2, 'direct U.S. evidence is discovered without a fixed facility allowlist');
const newGroup = groupFacilityJobs(newFacilityJobs).get('New Market Distribution Center')!;
assert.equal(selectStrongestFacilityJob(newGroup).slug, 'new-2', 'the most complete direct record wins without a hard-coded job ID');

console.log('Evidence ingestion passed: official-page artifact to reviewed publication, ambiguous points stay unplotted, and new direct U.S. facility candidates are discovered without fixed names or job IDs.');
