import { readFile } from 'node:fs/promises';
import { preserveRawArtifact, sha256, writeVersionedSnapshot } from './evidence-refresh-core.mjs';
import { extractRestaurantCandidate } from './restaurant-evidence-adapter.mjs';

const API = 'https://www.chick-fil-a.com/wp-json/wp/v2/location';
const CURRENT_OUTPUT = 'public-site/data/chick-fil-a-verified-locations.json';
const CANDIDATE_OUTPUT = 'public-site/data/evidence-candidates/verified-locations-latest.json';
const CANDIDATE_ARCHIVE = 'public-site/data/evidence-candidates/verified-locations';
const ARTIFACT_ROOT = 'public-site/data/evidence-artifacts';
const USER_AGENT = 'Flyway-Public-Evidence-Atlas/1.0 (+independent educational research)';
const EXTRACTOR_VERSION = 'official-location-page-v1';
const CONCURRENCY = Math.max(1, Number(process.env.CFA_CONCURRENCY || 3));
const LIMIT = Number(process.env.CFA_LIMIT || 0);
const DELAY_MS = Math.max(100, Number(process.env.CFA_DELAY_MS || 450));

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
function needsReview(record, reason, status = 0) {
  return { wpPostId: record.id, slug: record.slug, sourceUrl: record.link, modifiedAt: record.modified_gmt, status: 'needs_review', reason, httpStatus: status };
}

async function extractRecord(record) {
  let response;
  try {
    response = await fetch(record.link, { headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' }, redirect: 'follow' });
  } catch (error) {
    return needsReview(record, `fetch_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) return needsReview(record, `http_${response.status}`, response.status);
  const finalUrl = new URL(response.url);
  if (finalUrl.hostname !== 'www.chick-fil-a.com' || !finalUrl.pathname.startsWith('/locations/')) return needsReview(record, 'canonical_redirect_mismatch', response.status);
  const html = await response.text();
  const retrievedAt = new Date().toISOString();
  const artifact = await preserveRawArtifact({ rootDir: ARTIFACT_ROOT, sourceId: `official-location-${record.id}`, retrievedAt, parserVersion: EXTRACTOR_VERSION, sourceUrl: record.link, payload: html, pageCount: 1, recordCount: 1 });
  return extractRestaurantCandidate({ record, html, finalUrl: response.url, retrievedAt, sourceArtifactId: artifact.id, extractorVersion: EXTRACTOR_VERSION, httpStatus: response.status });
}

async function getManifest() {
  const first = await fetch(`${API}?per_page=100&page=1&_fields=id,slug,link,modified_gmt,title`, { headers: { 'User-Agent': USER_AGENT } });
  if (!first.ok) throw new Error(`Official manifest returned ${first.status}`);
  const pages = Number(first.headers.get('x-wp-totalpages') || 1);
  const firstPayload = await first.json();
  const records = [...firstPayload];
  const pagePayloads = [{ page: 1, records: firstPayload }];
  for (let page = 2; page <= pages; page += 1) {
    const response = await fetch(`${API}?per_page=100&page=${page}&_fields=id,slug,link,modified_gmt,title`, { headers: { 'User-Agent': USER_AGENT } });
    if (!response.ok) throw new Error(`Official manifest page ${page} returned ${response.status}`);
    const payload = await response.json();
    records.push(...payload);
    pagePayloads.push({ page, records: payload });
    await sleep(80);
  }
  return { records: LIMIT ? records.slice(0, LIMIT) : records, pagePayloads };
}

async function readExisting() {
  try {
    return JSON.parse(await readFile(CURRENT_OUTPUT, 'utf8'));
  } catch {
    return { locations: [], needsReview: [] };
  }
}

const { records: manifest, pagePayloads } = await getManifest();
const existing = await readExisting();
const currentSnapshotChecksum = sha256(await readFile(CURRENT_OUTPUT, 'utf8'));
const refreshStartedAt = new Date().toISOString();
const manifestArtifact = await preserveRawArtifact({ rootDir: ARTIFACT_ROOT, sourceId: 'official-location-index', retrievedAt: refreshStartedAt, parserVersion: EXTRACTOR_VERSION, sourceUrl: API, payload: pagePayloads, pageCount: pagePayloads.length, recordCount: manifest.length });
const existingById = new Map([...(existing.locations || []), ...(existing.needsReview || [])].map((record) => [record.wpPostId, record]));
const results = [];
const queue = manifest.filter((record) => {
  const cached = existingById.get(record.id);
  if (cached?.status === 'verified_public' && cached.modifiedAt === record.modified_gmt) {
    results.push(cached);
    return false;
  }
  return true;
});
let cursor = 0;
let completed = 0;
const manifestIds = new Set(manifest.map((record) => record.id));
const removedRecords = LIMIT ? [] : (existing.locations || []).filter((record) => !manifestIds.has(record.wpPostId)).map((record) => ({ ...record, retirementStatus: 'needs_review', removedFromManifestAt: refreshStartedAt }));

async function writeSnapshot() {
  const failures = results.filter((record) => record.status !== 'verified_public');
  const preservedAfterFailure = failures.flatMap((failure) => {
    const existingRecord = existingById.get(failure.wpPostId);
    return existingRecord?.status === 'verified_public' ? [existingRecord] : [];
  });
  const locations = [...results.filter((record) => record.status === 'verified_public'), ...preservedAfterFailure, ...(LIMIT ? (existing.locations || []).filter((record) => !manifestIds.has(record.wpPostId)) : [])].filter((record, index, all) => all.findIndex((candidate) => candidate.wpPostId === record.wpPostId) === index).sort((a, b) => a.longitude - b.longitude || a.latitude - b.latitude);
  const review = results.filter((record) => record.status !== 'verified_public').sort((a, b) => a.sourceUrl.localeCompare(b.sourceUrl));
  const officialByState = Object.fromEntries([...new Set(manifest.map((record) => new URL(record.link).pathname.split('/')[2]?.toUpperCase()).filter(Boolean))].sort().map((state) => [state, manifest.filter((record) => new URL(record.link).pathname.split('/')[2]?.toUpperCase() === state).length]));
  const snapshot = {
    metadata: {
      evidenceSchemaVersion: 2,
      publicationStatus: 'quarantined-candidate',
      refreshScope: LIMIT ? `partial-fixture:${LIMIT}` : 'complete-manifest',
      candidateForSnapshotChecksum: currentSnapshotChecksum,
      snapshotDate: new Date().toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      officialRecordCount: LIMIT ? existing.metadata?.officialRecordCount || locations.length : manifest.length,
      candidateRecordCount: manifest.length,
      exactMappedCount: locations.length,
      needsReviewCount: review.length,
      officialByState,
      officialSource: API,
      extractorVersion: EXTRACTOR_VERSION,
      manifestArtifactId: manifestArtifact.id,
      methodology: 'Exact coordinates and structured addresses are extracted directly from official Chick-fil-A location pages. Records are plotted only after canonical URL, Restaurant JSON-LD, U.S. state, unique directions coordinates, and geographic scope checks pass.',
      limitations: 'A published page verifies a public location record at the displayed coordinate, not current operating status, demand, capacity, routes, suppliers, distribution-center assignment, or service territory. Blocked or ambiguous pages remain unplotted.',
    },
    locations,
    needsReview: review,
    removedRecords,
  };
  await writeVersionedSnapshot({ currentPath: CANDIDATE_OUTPUT, archiveDir: CANDIDATE_ARCHIVE, datasetId: 'public-restaurants-candidate', snapshot });
}

async function worker() {
  while (cursor < queue.length) {
    const index = cursor;
    cursor += 1;
    const record = queue[index];
    const result = await extractRecord(record);
    results.push(result);
    completed += 1;
    if (completed % 100 === 0) console.log(JSON.stringify({ completed, queued: queue.length, verified: results.filter((item) => item.status === 'verified_public').length, needsReview: results.filter((item) => item.status !== 'verified_public').length }));
    await sleep(DELAY_MS + Math.floor(Math.random() * DELAY_MS));
  }
}

await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length || 1) }, worker));
await writeSnapshot();
console.log(JSON.stringify({ officialRecords: manifest.length, fetched: queue.length, verified: results.filter((record) => record.status === 'verified_public').length, needsReview: results.filter((record) => record.status !== 'verified_public').length, removedPendingReview: removedRecords.length, candidateOutput: CANDIDATE_OUTPUT, currentOutputUnchanged: CURRENT_OUTPUT }, null, 2));
