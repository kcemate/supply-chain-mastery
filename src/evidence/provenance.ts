import type { EvidenceClassification, EvidenceValue } from './types';

export interface CreateEvidenceValueInput<T> {
  id: string;
  entityType: string;
  entityId: string;
  fieldPath: string;
  value: T;
  unit?: string | null;
  classification: EvidenceClassification;
  confidence: number | null;
  sourceId?: string | null;
  sourceArtifactId?: string | null;
  sourceUrl?: string | null;
  sourceTitle: string;
  sourcePublisher: string;
  sourcePublishedAt?: string | null;
  verifiedAt: string;
  effectiveFrom?: string;
  extractionMethod: string;
  extractorVersion: string;
  reviewStatus?: 'accepted' | 'needs-review' | 'rejected' | 'superseded';
  reviewNote?: string | null;
  supersedesId?: string | null;
}

function assertIsoDate(value: string, field: string) {
  if (!Number.isFinite(Date.parse(value))) throw new Error(`${field} must be an ISO date or timestamp`);
}

export function createEvidenceValue<T>(input: CreateEvidenceValueInput<T>): EvidenceValue<T> {
  assertIsoDate(input.verifiedAt, 'verifiedAt');
  if (input.confidence !== null && (input.confidence < 0 || input.confidence > 1)) {
    throw new Error('confidence must be between 0 and 1 or null');
  }
  if (input.classification === 'user-input' && input.confidence !== null) {
    throw new Error('user-input confidence must be null');
  }
  if (input.classification === 'verified-public' && (!input.sourceId || !input.sourceArtifactId || !input.sourceUrl)) {
    throw new Error('verified-public evidence requires a source, preserved artifact, and URL');
  }
  const effectiveFrom = input.effectiveFrom || input.verifiedAt;
  assertIsoDate(effectiveFrom, 'effectiveFrom');
  return {
    id: input.id,
    entityType: input.entityType,
    entityId: input.entityId,
    fieldPath: input.fieldPath,
    value: input.value,
    unit: input.unit ?? null,
    classification: input.classification,
    confidence: input.confidence,
    sourceId: input.sourceId ?? null,
    sourceArtifactId: input.sourceArtifactId ?? null,
    sourceUrl: input.sourceUrl ?? null,
    sourceTitle: input.sourceTitle,
    sourcePublisher: input.sourcePublisher,
    sourcePublishedAt: input.sourcePublishedAt ?? null,
    verifiedAt: input.verifiedAt,
    effectiveFrom,
    effectiveTo: null,
    extractionMethod: input.extractionMethod,
    extractorVersion: input.extractorVersion,
    reviewStatus: input.reviewStatus ?? 'accepted',
    reviewNote: input.reviewNote ?? null,
    supersedesId: input.supersedesId ?? null,
  };
}

export function editEvidenceValue<T>(
  current: EvidenceValue<T>,
  next: { id: string; value: T; actorId: string; editedAt: string; note?: string },
): { previous: EvidenceValue<T>; current: EvidenceValue<T> } {
  assertIsoDate(next.editedAt, 'editedAt');
  if (!next.actorId.trim()) throw new Error('actorId is required');
  return {
    previous: { ...current, effectiveTo: next.editedAt, reviewStatus: 'superseded' },
    current: createEvidenceValue({
      id: next.id,
      entityType: current.entityType,
      entityId: current.entityId,
      fieldPath: current.fieldPath,
      value: next.value,
      unit: current.unit,
      classification: 'user-input',
      confidence: null,
      sourceTitle: `User edit by ${next.actorId}`,
      sourcePublisher: next.actorId,
      verifiedAt: next.editedAt,
      effectiveFrom: next.editedAt,
      extractionMethod: 'manual-edit',
      extractorVersion: 'manual-v1',
      reviewNote: next.note || 'User supplied value; prior public evidence remains in history.',
      supersedesId: current.id,
    }),
  };
}

export function lowestMaterialConfidence(values: Array<EvidenceValue<unknown>>): number | null {
  const scored = values.map((value) => value.confidence).filter((value): value is number => value !== null);
  return scored.length ? Math.min(...scored) : null;
}
