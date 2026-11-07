import type { EvidenceConflict, EvidenceReviewAction } from './types';

export function createConflict<T>(input: Omit<EvidenceConflict<T>, 'status' | 'deferredUntil' | 'decisions'>): EvidenceConflict<T> {
  if (!Number.isFinite(Date.parse(input.createdAt))) throw new Error('createdAt must be a valid date');
  return { ...input, status: 'open', deferredUntil: null, decisions: [] };
}

export function decideConflict<T>(
  conflict: EvidenceConflict<T>,
  input: { id: string; action: EvidenceReviewAction; actorId: string; decidedAt: string; reason: string; deferredUntil?: string },
): EvidenceConflict<T> {
  if (!input.actorId.trim()) throw new Error('actorId is required');
  if (!input.reason.trim()) throw new Error('reason is required');
  if (!Number.isFinite(Date.parse(input.decidedAt))) throw new Error('decidedAt must be a valid date');
  if (input.action === 'defer' && (!input.deferredUntil || !Number.isFinite(Date.parse(input.deferredUntil)) || Date.parse(input.deferredUntil) <= Date.parse(input.decidedAt))) {
    throw new Error('deferredUntil must be after decidedAt');
  }
  return {
    ...conflict,
    status: input.action === 'accept' ? 'accepted' : input.action === 'reject' ? 'rejected' : 'deferred',
    deferredUntil: input.action === 'defer' ? input.deferredUntil! : null,
    decisions: [...conflict.decisions, {
      id: input.id,
      conflictId: conflict.id,
      action: input.action,
      actorId: input.actorId,
      decidedAt: input.decidedAt,
      reason: input.reason,
    }],
  };
}

export function reopenDeferredConflicts<T>(conflicts: Array<EvidenceConflict<T>>, now: string): Array<EvidenceConflict<T>> {
  const timestamp = Date.parse(now);
  if (!Number.isFinite(timestamp)) throw new Error('now must be a valid date');
  return conflicts.map((conflict) => conflict.status === 'deferred' && conflict.deferredUntil && Date.parse(conflict.deferredUntil) <= timestamp
    ? { ...conflict, status: 'open', deferredUntil: null }
    : conflict);
}
