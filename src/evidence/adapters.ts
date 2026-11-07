import type { PublicDistributionFacilityRegistry, PublicFootprintSnapshot } from '../flywayTypes';
import type { EvidenceConflict, EvidenceLedger, EvidenceValue, SourceArtifact, SourceDefinition } from './types';

const restaurantSource: SourceDefinition = {
  id: 'source:official-location-index',
  publisher: 'Chick-fil-A, Inc.',
  title: 'Official U.S. restaurant location pages',
  canonicalUrl: 'https://www.chick-fil-a.com/wp-json/wp/v2/location',
  sourceType: 'official-location-index',
  cadenceDays: 7,
  staleAfterDays: 30,
  termsNote: 'Public first-party location pages; retain attribution and conservative validation.',
};

const facilitySource: SourceDefinition = {
  id: 'source:official-supply-careers',
  publisher: 'Chick-fil-A, Inc.',
  title: 'Official Supply careers and announcements',
  canonicalUrl: 'https://careers.chick-fil-a.com/api/jobs',
  sourceType: 'official-careers-api',
  cadenceDays: 30,
  staleAfterDays: 90,
  termsNote: 'Career evidence supports named facilities and source-time claims only; it is not an operating master.',
};

/**
 * Hydrate missing bundled records without resetting workspace review history.
 * This is a read-time projection, not a publication or a remote write. An
 * explicit subsequent workspace/review save makes the projection durable.
 */
export function mergeBundledEvidenceLedger(
  persisted: EvidenceLedger | undefined,
  bundled: EvidenceLedger | undefined,
): EvidenceLedger | undefined {
  if (!bundled) return persisted;
  if (!persisted) return bundled;
  const merge = <T extends { id: string }>(saved: T[], seed: T[]): T[] => {
    const ids = new Set(saved.map((record) => record.id));
    return [...saved, ...seed.filter((record) => !ids.has(record.id))];
  };
  return {
    ...persisted,
    sources: merge(persisted.sources, bundled.sources),
    artifacts: merge(persisted.artifacts, bundled.artifacts),
    snapshots: merge(persisted.snapshots, bundled.snapshots),
    values: merge(persisted.values, bundled.values),
    conflicts: merge(persisted.conflicts, bundled.conflicts),
    publications: merge(persisted.publications || [], bundled.publications || []),
  };
}

function artifact(input: {
  id: string;
  sourceId: string;
  retrievedAt: string;
  parserVersion: string;
  recordCount: number;
  artifactUri: string;
  checksum?: string | null;
}): SourceArtifact {
  return {
    ...input,
    checksumSha256: input.checksum ?? null,
    status: 'parsed',
    pageCount: 1,
    previousArtifactId: null,
  };
}

export function createBundledEvidenceLedger(
  footprint: PublicFootprintSnapshot,
  facilities: PublicDistributionFacilityRegistry,
): EvidenceLedger {
  const restaurantArtifactId = `artifact:restaurants:${footprint.metadata.snapshotDate}`;
  const facilityArtifactId = `artifact:facilities:${facilities.snapshotDate}`;
  const artifacts = [
    artifact({
      id: restaurantArtifactId,
      sourceId: restaurantSource.id,
      retrievedAt: footprint.metadata.generatedAt,
      parserVersion: footprint.locations.find((location) => location.extractorVersion)?.extractorVersion || 'legacy-location-snapshot',
      recordCount: footprint.metadata.officialRecordCount,
      artifactUri: '/data/chick-fil-a-verified-locations.json',
    }),
    artifact({
      id: facilityArtifactId,
      sourceId: facilitySource.id,
      retrievedAt: facilities.generatedAt,
      parserVersion: `public-dc-registry-v${facilities.schemaVersion}`,
      recordCount: facilities.evidenceCount,
      artifactUri: '/data/chick-fil-a-public-distribution-facilities.json',
    }),
  ];
  const restaurantConflicts: EvidenceConflict[] = (footprint.needsReview || []).map((item) => ({
    id: `conflict:restaurant:${item.wpPostId}`,
    entityType: 'public-restaurant',
    entityId: `official-${item.wpPostId}`,
    fieldPath: 'mapPosition',
    previousEvidenceValueId: null,
    candidateEvidenceValueId: null,
    previousValue: null,
    candidateValue: null,
    reason: 'extraction-failed',
    supportingSourceTitle: item.slug || `Official restaurant page ${item.wpPostId}`,
    supportingSourceUrl: item.sourceUrl,
    status: 'open',
    createdAt: item.modifiedAt || footprint.metadata.generatedAt,
    deferredUntil: null,
    decisions: [],
  }));
  const facilityConflicts: EvidenceConflict[] = facilities.needsReview.map((item) => ({
    id: `conflict:facility:${item.candidateKey}`,
    entityType: 'public-distribution-facility',
    entityId: item.candidateKey,
    fieldPath: item.candidateKey.startsWith('aggregate:') ? 'facilityCount' : 'address',
    previousEvidenceValueId: null,
    candidateEvidenceValueId: null,
    previousValue: null,
    candidateValue: null,
    reason: item.candidateKey.startsWith('aggregate:') ? 'conflicting-sources' : 'changed',
    supportingSourceTitle: 'Official facility evidence',
    supportingSourceUrl: item.sourceUrl,
    status: 'open',
    createdAt: facilities.generatedAt,
    deferredUntil: null,
    decisions: [],
  }));
  const facilityEvidenceById = new Map(facilities.evidence.map((item) => [item.id, item]));
  const values: EvidenceValue<unknown>[] = facilities.facilities.flatMap((facility) => {
    const sourceEvidence = facilityEvidenceById.get(facility.coordinateEvidenceId || '') || facilityEvidenceById.get(facility.evidenceIds[0]);
    const classification = facility.mapPrecision === 'exact-public-address' ? 'verified-public' as const : 'corroborated' as const;
    const confidence = facility.mapPrecision === 'exact-public-address' ? 0.95 : 0.78;
    const fields: Array<[string, unknown]> = [
      ['name', facility.name], ['city', facility.city], ['state', facility.state], ['address', facility.address || `${facility.city}, ${facility.state}`],
      ['latitude', facility.latitude ?? null], ['longitude', facility.longitude ?? null], ['mapPrecision', facility.mapPrecision], ['lifecycle', facility.lifecycle],
    ];
    return fields.map(([fieldPath, value]) => ({
      id: `value:${facility.id}:${fieldPath}:${facilities.snapshotDate}`,
      entityType: 'public-distribution-facility', entityId: facility.id, fieldPath, value, unit: fieldPath === 'latitude' || fieldPath === 'longitude' ? 'degrees' : null,
      classification, confidence, sourceId: facilitySource.id, sourceArtifactId: facilityArtifactId,
      sourceUrl: sourceEvidence?.sourceUrl || facilitySource.canonicalUrl, sourceTitle: sourceEvidence?.title || facilitySource.title,
      sourcePublisher: sourceEvidence?.publisher || facilitySource.publisher, sourcePublishedAt: sourceEvidence?.publishedAt || null,
      verifiedAt: `${facilities.snapshotDate}T00:00:00.000Z`, effectiveFrom: `${facilities.snapshotDate}T00:00:00.000Z`, effectiveTo: null,
      extractionMethod: facility.mapPrecision === 'exact-public-address' ? 'official-source-extraction' : 'reviewed-city-level-evidence',
      extractorVersion: `public-dc-registry-v${facilities.schemaVersion}`, reviewStatus: 'accepted' as const,
      reviewNote: facility.reviewNote || null, supersedesId: null,
    }));
  });
  return {
    schemaVersion: 1,
    sources: [restaurantSource, facilitySource],
    artifacts,
    snapshots: [
      {
        id: `snapshot:restaurants:${footprint.metadata.snapshotDate}`,
        datasetId: 'public-restaurants',
        createdAt: footprint.metadata.generatedAt,
        artifactIds: [restaurantArtifactId],
        recordIds: footprint.locations.map((item) => item.id),
        reviewConflictIds: restaurantConflicts.map((item) => item.id),
        checksumSha256: null,
        previousSnapshotId: null,
      },
      {
        id: `snapshot:facilities:${facilities.snapshotDate}`,
        datasetId: 'public-distribution-facilities',
        createdAt: facilities.generatedAt,
        artifactIds: [facilityArtifactId],
        recordIds: facilities.facilities.map((item) => item.id),
        reviewConflictIds: facilityConflicts.map((item) => item.id),
        checksumSha256: null,
        previousSnapshotId: null,
      },
    ],
    values,
    conflicts: [...restaurantConflicts, ...facilityConflicts],
    publications: [],
  };
}
