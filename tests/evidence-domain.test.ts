import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildEvidenceWorkspace,
  createBundledEvidenceLedger,
  mergeBundledEvidenceLedger,
  createConflict,
  createEvidenceValue,
  decideConflict,
  decideAndPublish,
  editEvidenceValue,
  evaluateFreshness,
  reopenDeferredConflicts,
  quarantineRefresh,
} from '../src/evidence';
import type { PublishedEvidenceRecord } from '../src/evidence';
import type { PublicDistributionFacilityRegistry, PublicFootprintSnapshot } from '../src/flywayTypes';

const verified = createEvidenceValue({
  id: 'value:facility-1:name:v1',
  entityType: 'public-distribution-facility',
  entityId: 'facility-1',
  fieldPath: 'name',
  value: 'Example Distribution Center',
  classification: 'verified-public',
  confidence: 0.98,
  sourceId: 'source:careers',
  sourceArtifactId: 'artifact:careers:abc',
  sourceUrl: 'https://careers.example.test/jobs/1',
  sourceTitle: 'Official job record',
  sourcePublisher: 'Example, Inc.',
  verifiedAt: '2026-08-20T00:00:00.000Z',
  extractionMethod: 'structured-api',
  extractorVersion: 'v1',
});

const edited = editEvidenceValue(verified, {
  id: 'value:facility-1:name:v2',
  value: 'Planning name',
  actorId: 'owner@example.test',
  editedAt: '2026-09-04T12:00:00.000Z',
  note: 'Local planning label',
});
assert.equal(edited.previous.reviewStatus, 'superseded');
assert.equal(edited.previous.effectiveTo, '2026-09-04T12:00:00.000Z');
assert.equal(edited.current.classification, 'user-input');
assert.equal(edited.current.confidence, null);
assert.equal(edited.current.sourceArtifactId, null);
assert.equal(edited.current.supersedesId, verified.id);

assert.throws(() => createEvidenceValue({ ...verified, id: 'bad', sourceArtifactId: null }), /preserved artifact/);
assert.throws(() => createEvidenceValue({ ...verified, id: 'bad-confidence', confidence: 1.2 }), /between 0 and 1/);

const restaurantSource = {
  id: 'source:restaurants', publisher: 'Publisher', title: 'Restaurants', canonicalUrl: 'https://example.test',
  sourceType: 'official-location-index' as const, cadenceDays: 7, staleAfterDays: 30, termsNote: 'Test fixture',
};
const artifact = {
  id: 'artifact:restaurants:1', sourceId: restaurantSource.id, retrievedAt: '2026-08-20T00:00:00.000Z',
  checksumSha256: 'a'.repeat(64), artifactUri: '/fixture.json', parserVersion: 'v1', status: 'parsed' as const,
  recordCount: 1, pageCount: 1, previousArtifactId: null,
};
assert.equal(evaluateFreshness(restaurantSource, artifact, '2026-08-26T00:00:00.000Z').status, 'current');
assert.equal(evaluateFreshness(restaurantSource, artifact, '2026-08-28T00:00:00.000Z').status, 'due-soon');
assert.equal(evaluateFreshness(restaurantSource, artifact, '2026-09-19T00:00:00.000Z').status, 'stale');
assert.equal(evaluateFreshness(restaurantSource, null, '2026-09-19T00:00:00.000Z').status, 'never-verified');

const conflict = createConflict({
  id: 'conflict:facility-1:address', entityType: 'public-distribution-facility', entityId: 'facility-1', fieldPath: 'address',
  previousEvidenceValueId: 'old', candidateEvidenceValueId: 'new', previousValue: '100 Old St', candidateValue: '200 New St',
  reason: 'conflicting-sources', createdAt: '2026-09-04T12:00:00.000Z',
});
const deferred = decideConflict(conflict, {
  id: 'decision:1', action: 'defer', actorId: 'reviewer@example.test', decidedAt: '2026-09-04T12:05:00.000Z',
  deferredUntil: '2026-09-11T12:05:00.000Z', reason: 'Await second official source',
});
assert.equal(deferred.status, 'deferred');
assert.equal(deferred.decisions[0].actorId, 'reviewer@example.test');
assert.equal(reopenDeferredConflicts([deferred], '2026-09-12T00:00:00.000Z')[0].status, 'open');
const rejectedRemoval = decideConflict(createConflict({
  id: 'conflict:facility-1:removed', entityType: 'public-distribution-facility', entityId: 'facility-1', fieldPath: 'sourcePresence',
  previousEvidenceValueId: 'old', candidateEvidenceValueId: null, previousValue: true, candidateValue: false,
  reason: 'removed', createdAt: '2026-09-04T12:00:00.000Z',
}), { id: 'decision:2', action: 'reject', actorId: 'reviewer@example.test', decidedAt: '2026-09-04T12:10:00.000Z', reason: 'Temporary source removal' });
assert.equal(rejectedRemoval.status, 'rejected');

const footprint = JSON.parse(await readFile('public-site/data/chick-fil-a-verified-locations.json', 'utf8')) as PublicFootprintSnapshot;
const facilities = JSON.parse(await readFile('public-site/data/chick-fil-a-public-distribution-facilities.json', 'utf8')) as PublicDistributionFacilityRegistry;
const ledger = createBundledEvidenceLedger(footprint, facilities);
const emptyServiceLedger = { schemaVersion: 1 as const, sources: [], artifacts: [], snapshots: [], values: [], conflicts: [] };
const hydratedLedger = mergeBundledEvidenceLedger(emptyServiceLedger, ledger)!;
assert.equal(hydratedLedger.conflicts.filter((item) => item.status === 'open').length, 38, 'a new connected ledger must not hide bundled public reviews');
assert.equal(emptyServiceLedger.conflicts.length, 0, 'read-time hydration must not mutate or silently persist the server document');
const reviewedBundledConflict = decideConflict(hydratedLedger.conflicts[0], {
  id: 'decision:hydrated-review', action: 'defer', actorId: 'workspace-owner',
  decidedAt: '2026-09-04T12:00:00.000Z', deferredUntil: '2026-09-11T12:00:00.000Z', reason: 'Await a permitted official source response.',
});
const partialSavedLedger = { ...emptyServiceLedger, values: [edited.current], conflicts: [reviewedBundledConflict] };
const rehydratedLedger = mergeBundledEvidenceLedger(partialSavedLedger, ledger)!;
assert.equal(rehydratedLedger.conflicts.length, 38);
assert.deepEqual(rehydratedLedger.conflicts.find((item) => item.id === reviewedBundledConflict.id), reviewedBundledConflict, 'saved decisions must win over the original bundled open state');
assert.ok(rehydratedLedger.values.some((item) => item.id === edited.current.id), 'user evidence is preserved alongside the public bundle');
assert.deepEqual(mergeBundledEvidenceLedger(rehydratedLedger, ledger), rehydratedLedger, 'repeated hydration is idempotent');
assert.equal(mergeBundledEvidenceLedger(partialSavedLedger, undefined), partialSavedLedger, 'provider failure keeps the saved ledger');
const beforeDeferredDue = buildEvidenceWorkspace({ footprint, facilities, ledger: rehydratedLedger, now: '2026-09-10T12:00:00.000Z' });
assert.equal(beforeDeferredDue.summary.openReviewItems, 37, 'future-deferred records leave the active review queue');
const atDeferredDue = buildEvidenceWorkspace({ footprint, facilities, ledger: rehydratedLedger, now: '2026-09-11T12:00:00.000Z' });
assert.equal(atDeferredDue.summary.openReviewItems, 38, 'deferred records re-enter the active queue at their due timestamp');
assert.equal(atDeferredDue.reviewQueue.find((item) => item.id === reviewedBundledConflict.id)?.status, 'open');
assert.equal(rehydratedLedger.conflicts.find((item) => item.id === reviewedBundledConflict.id)?.status, 'deferred', 'due-date projection must not rewrite saved history');
assert.equal(reviewedBundledConflict.decisions.length, 1);
assert.throws(() => decideConflict(conflict, { id: 'invalid-defer', action: 'defer', actorId: 'owner', decidedAt: '2026-09-04T12:00:00.000Z', deferredUntil: 'not-a-date', reason: 'Fixture' }), /deferredUntil/);
const workspace = buildEvidenceWorkspace({ footprint, facilities, ledger, now: '2026-09-04T00:00:00.000Z' });
assert.equal(workspace.summary.publicRestaurantRecords, 3458);
assert.equal(workspace.summary.mappedRestaurantRecords, 3424);
assert.equal(workspace.summary.publicFacilityRecords, 16);
assert.equal(workspace.summary.openReviewItems, (footprint.needsReview?.length || 0) + facilities.needsReview.length);
assert.equal(workspace.reviewQueue.length, 38);
assert.equal(new Set(workspace.reviewQueue.map((item) => item.id)).size, workspace.reviewQueue.length);
assert.equal(workspace.sources.length, 2);
assert.equal(workspace.summary.staleSources, 0);
assert.equal(ledger.values.length, facilities.facilityCount * 8);
assert.ok(ledger.values.some((value) => value.entityId === facilities.facilities[0].id && value.fieldPath === 'latitude'));
assert.ok(ledger.values.filter((value) => value.fieldPath === 'latitude').every((value) => Boolean(value.sourceArtifactId && value.sourceUrl)));

const source = ledger.sources[1];
const originalArtifact = { ...ledger.artifacts[1], id: 'artifact:facilities:original', checksumSha256: '1'.repeat(64) };
const baseRecord = { stableKey: 'facility:a', name: 'Alpha DC', latitude: 33, longitude: -84, mapPrecision: 'exact-public-address' };
const publicationLedger = {
  ...ledger,
  artifacts: [originalArtifact],
  values: [],
  conflicts: [],
  publications: [{
    id: 'publication:facilities:v1', datasetId: 'facilities', createdAt: '2026-08-20T00:00:00.000Z', createdBy: 'system',
    reason: 'Initial fixture', previousPublicationId: null, sourceArtifactIds: [originalArtifact.id], acceptedConflictIds: [],
    records: [{ stableKey: 'facility:a', data: baseRecord, status: 'published' as const, evidenceValueIds: [], publishedAt: '2026-08-20T00:00:00.000Z', retiredAt: null }],
    checksumSha256: '2'.repeat(64),
  }],
};
const candidateArtifact = { ...originalArtifact, id: 'artifact:facilities:candidate', retrievedAt: '2026-09-04T00:00:00.000Z', checksumSha256: '3'.repeat(64), previousArtifactId: null };
const quarantined = quarantineRefresh({
  ledger: publicationLedger, datasetId: 'facilities', artifact: candidateArtifact,
  candidates: [
    { stableKey: 'facility:a', record: { ...baseRecord, name: 'Alpha Distribution Center' } },
    { stableKey: 'facility:b', record: { stableKey: 'facility:b', name: 'Beta DC', latitude: 35, longitude: -80, mapPrecision: 'exact-public-address' } },
  ],
  currentRecords: publicationLedger.publications[0].records,
  materialFields: ['name', 'latitude', 'longitude', 'mapPrecision'], entityType: 'public-distribution-facility',
  sourceTitle: source.title, sourcePublisher: source.publisher, sourceUrl: source.canonicalUrl,
  classification: 'verified-public', confidence: 0.96, createdAt: '2026-09-04T00:00:00.000Z', extractorVersion: 'fixture-v2',
});
assert.equal(quarantined.artifacts.at(-1)?.previousArtifactId, originalArtifact.id);
assert.equal(quarantined.conflicts.length, 2);
assert.equal(quarantined.publications?.length, 1, 'quarantine must not publish candidates');
const changedFacilityConflict = quarantined.conflicts.find((item) => item.entityId === 'facility:a')!;
const deferredCandidate = await decideAndPublish({
  ledger: quarantined,
  conflictId: changedFacilityConflict.id,
  decision: { id: 'decision:defer-a', action: 'defer', actorId: 'reviewer@example.test', decidedAt: '2026-09-04T00:30:00.000Z', deferredUntil: '2026-09-11T00:30:00.000Z', reason: 'Awaiting a second preserved official artifact' },
});
assert.equal(deferredCandidate.publication, null, 'defer must not publish a candidate');
assert.equal(deferredCandidate.ledger.publications?.length, 1);
assert.equal(deferredCandidate.ledger.conflicts.find((item) => item.id === changedFacilityConflict.id)?.status, 'deferred');

const rejectedCandidate = await decideAndPublish({
  ledger: quarantined,
  conflictId: changedFacilityConflict.id,
  decision: { id: 'decision:reject-a', action: 'reject', actorId: 'reviewer@example.test', decidedAt: '2026-09-04T00:45:00.000Z', reason: 'The candidate conflicts with the accepted naming record' },
});
assert.equal(rejectedCandidate.publication, null, 'reject must not publish a candidate');
assert.equal(rejectedCandidate.ledger.publications?.length, 1);
assert.equal(rejectedCandidate.ledger.conflicts.find((item) => item.id === changedFacilityConflict.id)?.status, 'rejected');
const newFacilityConflict = quarantined.conflicts.find((item) => item.entityId === 'facility:b')!;
const acceptedCandidate = await decideAndPublish({
  ledger: quarantined, conflictId: newFacilityConflict.id,
  decision: { id: 'decision:publish-b', action: 'accept', actorId: 'reviewer@example.test', decidedAt: '2026-09-04T01:00:00.000Z', reason: 'Exact fields match the preserved official artifact' },
});
assert.match(acceptedCandidate.publication?.checksumSha256 || '', /^[a-f0-9]{64}$/);
assert.equal(acceptedCandidate.publication?.previousPublicationId, 'publication:facilities:v1');
assert.equal(acceptedCandidate.publication?.records.length, 2);
assert.equal(acceptedCandidate.ledger.publications?.length, 2);
assert.equal(acceptedCandidate.ledger.snapshots.at(-1)?.previousSnapshotId, null);
assert.equal(acceptedCandidate.ledger.snapshots.at(-1)?.checksumSha256, acceptedCandidate.publication?.checksumSha256);
assert.equal(publicationLedger.publications[0].records.length, 1, 'older publication remains immutable');

const retiredQuarantine = quarantineRefresh({
  ledger: acceptedCandidate.ledger, datasetId: 'facilities', artifact: { ...candidateArtifact, id: 'artifact:facilities:next', retrievedAt: '2026-09-05T00:00:00.000Z' },
  candidates: [{ stableKey: 'facility:b', record: { stableKey: 'facility:b', name: 'Beta DC', latitude: 35, longitude: -80, mapPrecision: 'exact-public-address' } }],
  currentRecords: acceptedCandidate.publication!.records as PublishedEvidenceRecord<Record<string, unknown>>[],
  materialFields: ['name', 'latitude', 'longitude', 'mapPrecision'], entityType: 'public-distribution-facility',
  sourceTitle: source.title, sourcePublisher: source.publisher, sourceUrl: source.canonicalUrl,
  classification: 'verified-public', confidence: 0.96, createdAt: '2026-09-05T00:00:00.000Z', extractorVersion: 'fixture-v2',
});
const removal = retiredQuarantine.conflicts.find((item) => item.entityId === 'facility:a' && item.reason === 'removed')!;
const retired = await decideAndPublish({ ledger: retiredQuarantine, conflictId: removal.id, decision: { id: 'decision:retire-a', action: 'accept', actorId: 'reviewer@example.test', decidedAt: '2026-09-05T01:00:00.000Z', reason: 'Confirmed removed after review' } });
assert.equal(retired.publication?.records.find((item) => item.stableKey === 'facility:a')?.status, 'retired');
assert.equal(acceptedCandidate.publication?.records.find((item) => item.stableKey === 'facility:a')?.status, 'published');
assert.equal(retired.ledger.snapshots.at(-1)?.previousSnapshotId, acceptedCandidate.ledger.snapshots.at(-1)?.id);

console.log('Evidence domain passed: field provenance, freshness, review decisions, quarantined candidates, immutable publication revisions, soft retirement, and a consistent 38-item queue.');
