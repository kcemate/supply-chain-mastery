import type {
  EvidenceConflict,
  EvidenceLedger,
  EvidencePublication,
  EvidenceReviewAction,
  EvidenceValue,
  PublishedEvidenceRecord,
  SourceArtifact,
} from './types';
import { decideConflict } from './review';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter(([, child]) => child !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => [key, canonicalize(child)]));
  return value;
}

async function sha256(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function latestPublication(ledger: EvidenceLedger, datasetId: string) {
  return (ledger.publications || []).filter((item) => item.datasetId === datasetId)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
}

function candidateValues(ledger: EvidenceLedger, ids: string[]) {
  return ids.map((id) => ledger.values.find((value) => value.id === id)).filter((value): value is EvidenceValue<unknown> => Boolean(value));
}

export function canAcceptConflict(ledger: EvidenceLedger, conflict: EvidenceConflict): { allowed: boolean; reason: string | null } {
  const change = conflict.publicationChange;
  if (!change || change.operation === 'retire') return { allowed: true, reason: null };
  const record = change.record as Record<string, unknown> | null;
  const declaresExactPoint = record?.mapPrecision === 'exact-public-address' || (Number.isFinite(record?.latitude) && Number.isFinite(record?.longitude));
  if (!declaresExactPoint) return { allowed: true, reason: null };
  const values = candidateValues(ledger, change.requiredEvidenceValueIds);
  const latitude = values.find((value) => value.fieldPath === 'latitude');
  const longitude = values.find((value) => value.fieldPath === 'longitude');
  const supported = [latitude, longitude].every((value) => value && ['verified-public', 'corroborated'].includes(value.classification) && value.sourceArtifactId && value.sourceUrl);
  return supported
    ? { allowed: true, reason: null }
    : { allowed: false, reason: 'Exact coordinates require field-level public evidence and a preserved source artifact.' };
}

export async function decideAndPublish(input: {
  ledger: EvidenceLedger;
  conflictId: string;
  decision: { id: string; action: EvidenceReviewAction; actorId: string; decidedAt: string; reason: string; deferredUntil?: string };
}): Promise<{ ledger: EvidenceLedger; publication: EvidencePublication | null }> {
  const conflict = input.ledger.conflicts.find((item) => item.id === input.conflictId);
  if (!conflict) throw new Error(`Unknown evidence conflict ${input.conflictId}`);
  if (conflict.status !== 'open' && conflict.status !== 'deferred') throw new Error('Only open or deferred conflicts can be decided');
  if (input.decision.action === 'accept') {
    const acceptance = canAcceptConflict(input.ledger, conflict);
    if (!acceptance.allowed) throw new Error(acceptance.reason || 'Conflict cannot be accepted');
  }
  const decided = decideConflict(conflict, input.decision);
  let values = input.ledger.values;
  let publication: EvidencePublication | null = null;
  let snapshots = input.ledger.snapshots;
  if (input.decision.action === 'accept' && conflict.publicationChange) {
    const change = conflict.publicationChange;
    const required = new Set(change.requiredEvidenceValueIds);
    values = values.map((value) => value.id === conflict.previousEvidenceValueId
      ? { ...value, reviewStatus: 'superseded' as const, effectiveTo: input.decision.decidedAt }
      : required.has(value.id) ? { ...value, reviewStatus: 'accepted' as const } : value);
    const previous = latestPublication(input.ledger, change.datasetId);
    const records = new Map((previous?.records || []).map((record) => [record.stableKey, record]));
    if (change.operation === 'retire') {
      const existing = records.get(change.stableKey);
      if (!existing) throw new Error(`Cannot retire unpublished record ${change.stableKey}`);
      records.set(change.stableKey, { ...existing, status: 'retired', retiredAt: input.decision.decidedAt });
    } else {
      records.set(change.stableKey, {
        stableKey: change.stableKey,
        data: change.record,
        status: 'published',
        evidenceValueIds: change.requiredEvidenceValueIds,
        publishedAt: input.decision.decidedAt,
        retiredAt: null,
      });
    }
    const publicationBody = {
      datasetId: change.datasetId,
      createdAt: input.decision.decidedAt,
      createdBy: input.decision.actorId,
      reason: input.decision.reason,
      previousPublicationId: previous?.id || null,
      sourceArtifactIds: [...new Set(candidateValues(input.ledger, change.requiredEvidenceValueIds).map((value) => value.sourceArtifactId).filter((id): id is string => Boolean(id)))].sort(),
      acceptedConflictIds: [conflict.id],
      records: [...records.values()].sort((left, right) => left.stableKey.localeCompare(right.stableKey)),
    };
    const checksumSha256 = await sha256(publicationBody);
    publication = { id: `publication:${change.datasetId}:${checksumSha256}`, ...publicationBody, checksumSha256 };
    const previousSnapshot = input.ledger.snapshots.filter((snapshot) => snapshot.datasetId === change.datasetId)
      .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0] || null;
    snapshots = [...input.ledger.snapshots, {
      id: `snapshot:${change.datasetId}:${checksumSha256}`,
      datasetId: change.datasetId,
      createdAt: input.decision.decidedAt,
      artifactIds: publication.sourceArtifactIds,
      recordIds: publication.records.map((record) => record.stableKey),
      reviewConflictIds: [conflict.id],
      checksumSha256,
      previousSnapshotId: previousSnapshot?.id || null,
    }];
  }
  const conflicts = input.ledger.conflicts.map((item) => item.id === conflict.id ? decided : item);
  return {
    ledger: { ...input.ledger, values, conflicts, snapshots, publications: publication ? [...(input.ledger.publications || []), publication] : input.ledger.publications || [] },
    publication,
  };
}

export interface RefreshCandidate<T extends Record<string, unknown>> {
  stableKey: string;
  record: T;
}

export function quarantineRefresh<T extends Record<string, unknown>>(input: {
  ledger: EvidenceLedger;
  datasetId: string;
  artifact: SourceArtifact;
  candidates: Array<RefreshCandidate<T>>;
  currentRecords: Array<PublishedEvidenceRecord<T>>;
  materialFields: Array<keyof T & string>;
  entityType: string;
  sourceTitle: string;
  sourcePublisher: string;
  sourceUrl: string;
  classification: 'verified-public' | 'corroborated';
  confidence: number;
  createdAt: string;
  extractorVersion: string;
}): EvidenceLedger {
  const previous = new Map(input.currentRecords.filter((record) => record.status === 'published').map((record) => [record.stableKey, record]));
  const incoming = new Map(input.candidates.map((candidate) => [candidate.stableKey, candidate.record]));
  const values: EvidenceValue<unknown>[] = [];
  const conflicts: EvidenceConflict[] = [];
  const makeValue = (stableKey: string, fieldPath: string, value: unknown) => {
    const id = `candidate:${input.artifact.id}:${stableKey}:${fieldPath}`;
    values.push({
      id, entityType: input.entityType, entityId: stableKey, fieldPath, value, unit: null,
      classification: input.classification, confidence: input.confidence, sourceId: input.artifact.sourceId,
      sourceArtifactId: input.artifact.id, sourceUrl: input.sourceUrl, sourceTitle: input.sourceTitle,
      sourcePublisher: input.sourcePublisher, sourcePublishedAt: null, verifiedAt: input.createdAt,
      effectiveFrom: input.createdAt, effectiveTo: null, extractionMethod: 'refresh-candidate',
      extractorVersion: input.extractorVersion, reviewStatus: 'needs-review', reviewNote: 'Quarantined until explicit review.', supersedesId: null,
    });
    return id;
  };
  for (const [stableKey, record] of incoming) {
    const existing = previous.get(stableKey);
    if (!existing) {
      const requiredEvidenceValueIds = input.materialFields.map((field) => makeValue(stableKey, field, record[field]));
      conflicts.push({
        id: `conflict:${input.artifact.id}:${stableKey}:new`, entityType: input.entityType, entityId: stableKey, fieldPath: '$record',
        previousEvidenceValueId: null, candidateEvidenceValueId: requiredEvidenceValueIds[0] || null,
        previousValue: null, candidateValue: record, reason: 'added', supportingSourceTitle: input.sourceTitle,
        supportingSourceUrl: input.sourceUrl, status: 'open', createdAt: input.createdAt, deferredUntil: null, decisions: [],
        publicationChange: { datasetId: input.datasetId, operation: 'upsert', stableKey, record, requiredEvidenceValueIds },
      });
      continue;
    }
    for (const field of input.materialFields) {
      if (JSON.stringify(existing.data[field]) === JSON.stringify(record[field])) continue;
      const valueId = makeValue(stableKey, field, record[field]);
      conflicts.push({
        id: `conflict:${input.artifact.id}:${stableKey}:${field}`, entityType: input.entityType, entityId: stableKey, fieldPath: field,
        previousEvidenceValueId: existing.evidenceValueIds.find((id) => input.ledger.values.find((value) => value.id === id)?.fieldPath === field) || null,
        candidateEvidenceValueId: valueId, previousValue: existing.data[field], candidateValue: record[field], reason: 'changed',
        supportingSourceTitle: input.sourceTitle, supportingSourceUrl: input.sourceUrl, status: 'open', createdAt: input.createdAt,
        deferredUntil: null, decisions: [], publicationChange: { datasetId: input.datasetId, operation: 'upsert', stableKey, record: { ...existing.data, [field]: record[field] }, requiredEvidenceValueIds: [...existing.evidenceValueIds, valueId] },
      });
    }
  }
  for (const [stableKey, existing] of previous) {
    if (incoming.has(stableKey)) continue;
    conflicts.push({
      id: `conflict:${input.artifact.id}:${stableKey}:removed`, entityType: input.entityType, entityId: stableKey, fieldPath: 'sourcePresence',
      previousEvidenceValueId: existing.evidenceValueIds[0] || null, candidateEvidenceValueId: null, previousValue: true, candidateValue: false,
      reason: 'removed', supportingSourceTitle: input.sourceTitle, supportingSourceUrl: input.sourceUrl, status: 'open', createdAt: input.createdAt,
      deferredUntil: null, decisions: [], publicationChange: { datasetId: input.datasetId, operation: 'retire', stableKey, record: null, requiredEvidenceValueIds: [] },
    });
  }
  const priorArtifact = input.ledger.artifacts.filter((artifact) => artifact.sourceId === input.artifact.sourceId).sort((a, b) => Date.parse(b.retrievedAt) - Date.parse(a.retrievedAt))[0];
  return {
    ...input.ledger,
    artifacts: [...input.ledger.artifacts, { ...input.artifact, previousArtifactId: priorArtifact?.id || null }],
    values: [...input.ledger.values, ...values],
    conflicts: [...input.ledger.conflicts, ...conflicts],
    publications: input.ledger.publications || [],
  };
}
