import type { PublicDistributionFacilityRegistry, PublicFootprintSnapshot } from '../flywayTypes';
import { evaluateFreshness } from './freshness';
import { reopenDeferredConflicts } from './review';
import type { EvidenceLedger, EvidenceSnapshot, EvidenceWorkspace, SourceArtifact } from './types';

function latestBySource(artifacts: SourceArtifact[]) {
  const result = new Map<string, SourceArtifact>();
  for (const artifact of artifacts) {
    const previous = result.get(artifact.sourceId);
    if (!previous || Date.parse(artifact.retrievedAt) > Date.parse(previous.retrievedAt)) result.set(artifact.sourceId, artifact);
  }
  return result;
}

function latestSnapshots(snapshots: EvidenceSnapshot[]) {
  const result: Record<string, EvidenceSnapshot> = {};
  for (const snapshot of snapshots) {
    const previous = result[snapshot.datasetId];
    if (!previous || Date.parse(snapshot.createdAt) > Date.parse(previous.createdAt)) result[snapshot.datasetId] = snapshot;
  }
  return result;
}

export function buildEvidenceWorkspace(input: {
  footprint: PublicFootprintSnapshot;
  facilities: PublicDistributionFacilityRegistry;
  ledger: EvidenceLedger;
  now?: string | Date;
}): EvidenceWorkspace {
  const latestArtifacts = latestBySource(input.ledger.artifacts.filter((artifact) => artifact.status !== 'failed'));
  const sources = input.ledger.sources.map((source) => {
    const latestArtifact = latestArtifacts.get(source.id) || null;
    return { source, latestArtifact, freshness: evaluateFreshness(source, latestArtifact, input.now) };
  });
  const now = input.now instanceof Date ? input.now.toISOString() : input.now || new Date().toISOString();
  // Deferred records remain in immutable decision history, not the active queue.
  // Their due-date projection reopens them without silently rewriting the ledger.
  const reviewQueue = reopenDeferredConflicts(input.ledger.conflicts, now).filter((conflict) => conflict.status === 'open');
  return {
    summary: {
      publicRestaurantRecords: input.footprint.metadata.officialRecordCount,
      mappedRestaurantRecords: input.footprint.metadata.exactMappedCount,
      publicFacilityRecords: input.facilities.facilityCount,
      exactFacilityRecords: input.facilities.exactAddressCount,
      cityLevelFacilityRecords: input.facilities.cityLevelCount,
      openReviewItems: reviewQueue.length,
      staleSources: sources.filter(({ freshness }) => freshness.status === 'stale' || freshness.status === 'never-verified').length,
    },
    sources,
    reviewQueue,
    latestSnapshots: latestSnapshots(input.ledger.snapshots),
  };
}
