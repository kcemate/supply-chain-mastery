import { fetchAllPages, preserveRawArtifact, sha256, writeVersionedSnapshot } from './evidence-refresh-core.mjs';
import { readFile } from 'node:fs/promises';
import { discoverDirectFacilityJobs, groupFacilityJobs, selectStrongestFacilityJob } from './facility-evidence-adapter.mjs';

const CAREERS_API = 'https://careers.chick-fil-a.com/api/jobs?tags1=CFA%20Supply%7CCFA%20Supply%20Services&internal=false';
const CURRENT_OUTPUT = 'public-site/data/chick-fil-a-public-distribution-facilities.json';
const CANDIDATE_OUTPUT = 'public-site/data/evidence-candidates/public-distribution-facilities-latest.json';
const ARCHIVE = 'public-site/data/evidence-candidates/public-distribution-facilities';
const ARTIFACT_ROOT = 'public-site/data/evidence-artifacts';
const USER_AGENT = 'Flyway-Public-Evidence-Registry/1.0 (+independent educational research)';

const stateCodes = Object.fromEntries([
  ['Alabama','AL'],['Alaska','AK'],['Arizona','AZ'],['Arkansas','AR'],['California','CA'],['Colorado','CO'],['Connecticut','CT'],['Delaware','DE'],['District of Columbia','DC'],['Florida','FL'],['Georgia','GA'],['Hawaii','HI'],['Idaho','ID'],['Illinois','IL'],['Indiana','IN'],['Iowa','IA'],['Kansas','KS'],['Kentucky','KY'],['Louisiana','LA'],['Maine','ME'],['Maryland','MD'],['Massachusetts','MA'],['Michigan','MI'],['Minnesota','MN'],['Mississippi','MS'],['Missouri','MO'],['Montana','MT'],['Nebraska','NE'],['Nevada','NV'],['New Hampshire','NH'],['New Jersey','NJ'],['New Mexico','NM'],['New York','NY'],['North Carolina','NC'],['North Dakota','ND'],['Ohio','OH'],['Oklahoma','OK'],['Oregon','OR'],['Pennsylvania','PA'],['Rhode Island','RI'],['South Carolina','SC'],['South Dakota','SD'],['Tennessee','TN'],['Texas','TX'],['Utah','UT'],['Vermont','VT'],['Virginia','VA'],['Washington','WA'],['West Virginia','WV'],['Wisconsin','WI'],['Wyoming','WY'],
]);

const reviewedOverrides = {
  'Cartersville Distribution Center': { lifecycle: 'mixed-lifecycle-language', precision: 'city-level-public-evidence', reviewNote: 'Current official sources conflict between 731 Cassville White Rd. and 726 Cassville White Rd. NW; the record remains city-level.' },
  'Dallas Distribution Center': { lifecycle: 'mixed-lifecycle-language' },
  'Charlotte Distribution Center': { lifecycle: 'current-career-evidence' },
  'Lubbock Distribution Center': { lifecycle: 'launch-or-standup' },
  'Salt Lake City Distribution Center': { lifecycle: 'current-career-evidence', precision: 'city-level-public-evidence', reviewNote: 'Current official sources conflict between 734 N 7400 W and 734 N 7200 W; the record remains city-level.' },
  'Columbia Distribution Center': { lifecycle: 'mixed-lifecycle-language', precision: 'city-level-public-evidence', reviewNote: 'Current official sources conflict between 4424 and 424 12th Street Extension; the record remains city-level.' },
  'Fort Lauderdale Distribution Center': { lifecycle: 'mixed-lifecycle-language' },
  'Lakeland Distribution Center': { lifecycle: 'mixed-lifecycle-language', reviewNote: 'The directly named DC uses 4050 Logistics Parkway. A fleet-maintenance listing uses 4100; it is retained as a review note, not a second DC.' },
};

const announcements = [
  {
    id: 'announcement-cartersville-five-years', facilityName: 'Cartersville Distribution Center', title: 'Five Things to Know About Chick-fil-A Supply',
    url: 'https://www.chick-fil-a.com/press-room/chick-fil-a-supply-five-years-supporting-restaurants', publishedAt: '2024-07-22',
    claims: ['facility-exists', 'city-state', 'operating-at-source-date', 'historical-aggregate'],
    summary: 'The official article identifies Cartersville as the first Supply DC and says nine DCs were expected across seven states by the end of 2024.',
  },
  {
    id: 'announcement-mebane-helene', facilityName: 'Mebane Distribution Center', title: 'How Local Owner-Operators are Helping in Communities Affected by Helene',
    url: 'https://www.chick-fil-a.com/press-room/activating-in-the-community-following-hurricane-helene', publishedAt: '2024-10-09',
    claims: ['facility-exists', 'city-state', 'operating-at-source-date'],
    summary: 'The official article identifies a Chick-fil-A Supply distribution center in Mebane, North Carolina during the Helene response.',
  },
  {
    id: 'announcement-charlotte-shared-table', facilityName: 'Charlotte Distribution Center', title: 'Chick-fil-A Shared Table Surpasses 30 Million Meals Donated',
    url: 'https://www.chick-fil-a.com/press-room/charlotte-shared-table', publishedAt: '2025-02-06',
    claims: ['facility-exists', 'announced'],
    summary: 'The official article announced a newest Charlotte-area DC; current career evidence now identifies the Charlotte Distribution Center in Kannapolis.',
  },
];

const slugify = (value) => value.toLowerCase().replace(/distribution center/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function fetchJson(url) {
  const response = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Official source returned ${response.status}: ${url}`);
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { headers: { Accept: 'text/html', 'User-Agent': USER_AGENT } });
  if (!response.ok) throw new Error(`Official source returned ${response.status}: ${url}`);
  return response.text();
}

const careerPages = await fetchAllPages({
  fetchPage: (page, limit) => fetchJson(`${CAREERS_API}&limit=${limit}&page=${page}`),
  itemsFromPage: (payload) => payload.jobs || [],
});
const jobs = careerPages.items.map((entry) => entry.data).filter(Boolean);
const directJobs = discoverDirectFacilityJobs(jobs);
const grouped = groupFacilityJobs(directJobs);

const retrievedAt = new Date().toISOString();
const verifiedAt = retrievedAt.slice(0, 10);
const currentSnapshot = await readFile(CURRENT_OUTPUT, 'utf8');
const careersArtifact = await preserveRawArtifact({
  rootDir: ARTIFACT_ROOT,
  sourceId: 'official-supply-careers',
  retrievedAt,
  parserVersion: 'public-dc-registry-v2',
  sourceUrl: CAREERS_API,
  payload: careerPages.pages.map(({ page, payload }) => ({ page, payload })),
  pageCount: careerPages.pages.length,
  recordCount: jobs.length,
});
const evidence = [];
const facilities = [];
const sourceArtifacts = [careersArtifact];

for (const [name, unsortedJobs] of grouped.entries()) {
  const policy = reviewedOverrides[name] || {};
  const lifecycle = policy.lifecycle || 'current-career-evidence';
  const facilityJobs = [...unsortedJobs];
  const strongest = selectStrongestFacilityJob(facilityJobs);
  const state = stateCodes[strongest.state];
  if (!state || strongest.country_code !== 'US') throw new Error(`Unsupported geography for ${name}.`);
  const facilityId = `public-dc:${slugify(name)}-${state.toLowerCase()}`;
  const evidenceId = `career-job-${strongest.slug}`;
  const precision = policy.precision || 'exact-public-address';
  const claims = ['facility-exists', 'city-state', 'current-career-evidence'];
  if (precision === 'exact-public-address') claims.push('street-address');
  if (lifecycle === 'launch-or-standup') claims.push('launch-or-standup');
  evidence.push({
    id: evidenceId,
    facilityId,
    sourceKind: 'official-career-page',
    publisher: 'Chick-fil-A, Inc.',
    title: `${strongest.title} — ${name}`,
    sourceUrl: `https://careers.chick-fil-a.com/supply/jobs/${strongest.slug}?lang=en-us`,
    publishedAt: strongest.posted_date?.slice(0, 10),
    retrievedAt,
    verifiedAt,
    sourceChecksum: sha256(JSON.stringify({ slug: strongest.slug, location_name: strongest.location_name, street_address: strongest.street_address, city: strongest.city, state: strongest.state, postal_code: strongest.postal_code, latitude: strongest.latitude, longitude: strongest.longitude, description: strongest.description })),
    sourceArtifactId: careersArtifact.id,
    reviewMethod: 'systematic-official-source-audit-v1',
    supportedClaims: claims,
    supportSummary: `A current official job description directly identifies ${name} in ${strongest.city}, ${state}.`,
  });
  const lifecycleSummary = lifecycle === 'launch-or-standup'
    ? 'Current official recruiting evidence describes a new facility in launch or stand-up; no opening date is asserted.'
    : lifecycle === 'mixed-lifecycle-language'
      ? 'Current official recruiting evidence contains both current-operations and “new” or stand-up language; no opening date or current status is inferred.'
      : 'A current official job description contains facility-specific work language; this is evidence of the named facility, not an independently verified operating-status claim.';
  facilities.push({
    id: facilityId,
    stableKey: `cfa-supply:${slugify(name)}-${state.toLowerCase()}`,
    name,
    city: strongest.city,
    state,
    country: 'US',
    address: precision === 'exact-public-address' ? `${strongest.street_address}, ${strongest.city}, ${state} ${strongest.postal_code}` : `${strongest.city}, ${state}`,
    postalCode: strongest.postal_code,
    latitude: strongest.latitude,
    longitude: strongest.longitude,
    mapPrecision: precision,
    coordinateSource: precision === 'exact-public-address' ? 'official-careers-api' : 'official-city-coordinate',
    coordinateEvidenceId: evidenceId,
    evidenceIds: [evidenceId],
    directEvidenceJobIds: facilityJobs.map((job) => String(job.slug)),
    lifecycle,
    lifecycleSummary,
    reviewNote: policy.reviewNote,
    lastVerifiedAt: verifiedAt,
  });
}

for (const item of announcements) {
  const html = await fetchText(item.url);
  const announcementArtifact = await preserveRawArtifact({ rootDir: ARTIFACT_ROOT, sourceId: item.id, retrievedAt, parserVersion: 'official-announcement-v1', sourceUrl: item.url, payload: html, pageCount: 1, recordCount: 1 });
  sourceArtifacts.push(announcementArtifact);
  const facility = facilities.find((record) => record.name === item.facilityName);
  const evidenceId = item.id;
  evidence.push({
    id: evidenceId,
    facilityId: facility?.id,
    sourceKind: 'official-announcement',
    publisher: 'Chick-fil-A, Inc.',
    title: item.title,
    sourceUrl: item.url,
    publishedAt: item.publishedAt,
    retrievedAt,
    verifiedAt,
    sourceChecksum: sha256(html),
    sourceArtifactId: announcementArtifact.id,
    reviewMethod: 'systematic-official-source-audit-v1',
    supportedClaims: item.claims,
    supportSummary: item.summary,
  });
  if (facility) facility.evidenceIds.push(evidenceId);
}

facilities.sort((a, b) => a.name.localeCompare(b.name));
evidence.sort((a, b) => a.id.localeCompare(b.id));
const review = facilities.filter((facility) => facility.mapPrecision === 'city-level-public-evidence').map((facility) => ({
  candidateKey: facility.stableKey,
  reason: facility.reviewNote,
  sourceUrl: evidence.find((item) => item.id === facility.coordinateEvidenceId)?.sourceUrl,
}));
review.push({
  candidateKey: 'aggregate:2024-nine-dcs',
  reason: 'Official 2024/2026 aggregate copy reports nine DCs, while the current official careers audit directly names 16. The snapshots are not treated as a reconciled current operating count.',
  sourceUrl: announcements[0].url,
});

const registry = {
  schemaVersion: 1,
  evidenceSchemaVersion: 2,
  publicationStatus: 'quarantined-candidate',
  candidateForSnapshotChecksum: sha256(currentSnapshot),
  snapshotDate: verifiedAt,
  generatedAt: retrievedAt,
  facilityCount: facilities.length,
  plottedFacilityCount: facilities.filter((facility) => facility.mapPrecision !== 'not-plotted').length,
  exactAddressCount: facilities.filter((facility) => facility.mapPrecision === 'exact-public-address').length,
  cityLevelCount: facilities.filter((facility) => facility.mapPrecision === 'city-level-public-evidence').length,
  launchOrStandupCount: facilities.filter((facility) => facility.lifecycle === 'launch-or-standup').length,
  addressConflictCount: facilities.filter((facility) => facility.mapPrecision === 'city-level-public-evidence').length,
  evidenceCount: evidence.length,
  currentOfficialJobCount: jobs.length,
  historicalReportedCount: 9,
  methodology: 'All pages of current U.S. Chick-fil-A Supply jobs were scanned from the official careers API until exhaustion. Facility candidates are discovered from direct distribution-center language rather than a fixed candidate list. Official newsroom records were separately audited. Recruiting filters alone are excluded.',
  limitations: 'This is the complete set accepted by the documented public-source audit, not an official operational master. Current job evidence does not prove operating status, opening date, capacity, inventory, routes, assignments, suppliers, service territory, or continued existence after the snapshot date. Address conflicts remain city-level.',
  officialCareersApi: CAREERS_API,
  sourceArtifacts,
  facilities,
  evidence,
  needsReview: review,
  exclusions: [
    { candidate: 'Atlanta, GA', reason: 'Current Supply Services jobs are support-center or network-wide roles, not an identified Atlanta Supply DC.' },
    { candidate: 'Nashville city filter', reason: 'The named Nashville DC is physically evidenced in Antioch; no second Nashville-city facility is supported.' },
    { candidate: 'Midwest / Northeast / Southeast / Southwest / West', reason: 'Regional recruiting filters are not facilities.' },
    { candidate: 'Valencia, CA', reason: 'The careers directory lists the city, but the complete current job response contains no direct facility description.' },
    { candidate: 'Mississauga, Ontario', reason: 'Outside U.S. scope and supported only by a recruiting filter.' },
    { candidate: 'Partner distributors', reason: 'Official sources mention partners but disclose no facility identities.' },
    { candidate: 'Bay Center Foods', reason: 'A separate production/distribution entity, not a named Chick-fil-A Supply DC.' },
  ],
};

await writeVersionedSnapshot({ currentPath: CANDIDATE_OUTPUT, archiveDir: ARCHIVE, datasetId: 'public-distribution-facilities-candidate', snapshot: registry });
console.log(JSON.stringify({ candidateOutput: CANDIDATE_OUTPUT, currentOutputUnchanged: CURRENT_OUTPUT, currentJobs: jobs.length, facilities: registry.facilityCount, exact: registry.exactAddressCount, cityLevel: registry.cityLevelCount, evidence: registry.evidenceCount, review: registry.needsReview.length }, null, 2));
