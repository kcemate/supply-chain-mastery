export type EvidenceClassification =
  | 'verified-public'
  | 'corroborated'
  | 'user-input'
  | 'derived'
  | 'synthetic';

export type EvidenceReviewStatus = 'accepted' | 'needs-review' | 'rejected' | 'superseded';
export type EvidenceFreshnessStatus = 'current' | 'due-soon' | 'stale' | 'never-verified';
export type EvidenceConflictStatus = 'open' | 'accepted' | 'rejected' | 'deferred';
export type EvidenceReviewAction = 'accept' | 'reject' | 'defer';

export interface EvidenceValue<T> {
  id: string;
  entityType: string;
  entityId: string;
  fieldPath: string;
  value: T;
  unit: string | null;
  classification: EvidenceClassification;
  confidence: number | null;
  sourceId: string | null;
  sourceArtifactId: string | null;
  sourceUrl: string | null;
  sourceTitle: string;
  sourcePublisher: string;
  sourcePublishedAt: string | null;
  verifiedAt: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  extractionMethod: string;
  extractorVersion: string;
  reviewStatus: EvidenceReviewStatus;
  reviewNote: string | null;
  supersedesId: string | null;
}

export interface SourceDefinition {
  id: string;
  publisher: string;
  title: string;
  canonicalUrl: string;
  sourceType: 'official-location-index' | 'official-careers-api' | 'official-announcement' | 'government' | 'other-public';
  cadenceDays: number;
  staleAfterDays: number;
  termsNote: string;
}

export interface SourceArtifact {
  id: string;
  sourceId: string;
  retrievedAt: string;
  checksumSha256: string | null;
  artifactUri: string;
  parserVersion: string;
  status: 'fetched' | 'parsed' | 'failed';
  recordCount: number;
  pageCount: number;
  previousArtifactId: string | null;
}

export interface EvidenceSnapshot {
  id: string;
  datasetId: string;
  createdAt: string;
  artifactIds: string[];
  recordIds: string[];
  reviewConflictIds: string[];
  checksumSha256: string | null;
  previousSnapshotId: string | null;
}

export interface PublishedEvidenceRecord<T = unknown> {
  stableKey: string;
  data: T;
  status: 'published' | 'retired';
  evidenceValueIds: string[];
  publishedAt: string;
  retiredAt: string | null;
}

export interface EvidencePublication<T = unknown> {
  id: string;
  datasetId: string;
  createdAt: string;
  createdBy: string;
  reason: string;
  previousPublicationId: string | null;
  sourceArtifactIds: string[];
  acceptedConflictIds: string[];
  records: Array<PublishedEvidenceRecord<T>>;
  checksumSha256: string;
}

export interface EvidencePublicationChange<T = unknown> {
  datasetId: string;
  operation: 'upsert' | 'retire';
  stableKey: string;
  record: T | null;
  requiredEvidenceValueIds: string[];
}

export interface EvidenceReviewDecision {
  id: string;
  conflictId: string;
  action: EvidenceReviewAction;
  actorId: string;
  decidedAt: string;
  reason: string;
}

export interface EvidenceConflict<T = unknown> {
  id: string;
  entityType: string;
  entityId: string;
  fieldPath: string;
  previousEvidenceValueId: string | null;
  candidateEvidenceValueId: string | null;
  previousValue: T | null;
  candidateValue: T | null;
  reason: 'added' | 'changed' | 'removed' | 'conflicting-sources' | 'extraction-failed' | 'stale';
  supportingSourceTitle?: string;
  supportingSourceUrl?: string;
  publicationChange?: EvidencePublicationChange<T>;
  status: EvidenceConflictStatus;
  createdAt: string;
  deferredUntil: string | null;
  decisions: EvidenceReviewDecision[];
}

export interface EvidenceLedger {
  schemaVersion: 1;
  sources: SourceDefinition[];
  artifacts: SourceArtifact[];
  snapshots: EvidenceSnapshot[];
  values: EvidenceValue<unknown>[];
  conflicts: EvidenceConflict[];
  publications?: EvidencePublication[];
}

export interface FreshnessEvaluation {
  sourceId: string;
  status: EvidenceFreshnessStatus;
  lastSuccessAt: string | null;
  nextRefreshAt: string | null;
  staleAt: string | null;
  ageDays: number | null;
}

export interface EvidenceWorkspaceSummary {
  publicRestaurantRecords: number;
  mappedRestaurantRecords: number;
  publicFacilityRecords: number;
  exactFacilityRecords: number;
  cityLevelFacilityRecords: number;
  openReviewItems: number;
  staleSources: number;
}

export interface EvidenceWorkspace {
  summary: EvidenceWorkspaceSummary;
  sources: Array<{ source: SourceDefinition; latestArtifact: SourceArtifact | null; freshness: FreshnessEvaluation }>;
  reviewQueue: EvidenceConflict[];
  latestSnapshots: Record<string, EvidenceSnapshot>;
}
