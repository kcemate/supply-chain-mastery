import type { FreshnessEvaluation, SourceArtifact, SourceDefinition } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

function addDays(value: Date, days: number) {
  return new Date(value.getTime() + days * DAY_MS);
}

export function evaluateFreshness(
  source: SourceDefinition,
  artifact: SourceArtifact | null,
  now: string | Date = new Date(),
): FreshnessEvaluation {
  const reference = typeof now === 'string' ? new Date(now) : now;
  if (!Number.isFinite(reference.getTime())) throw new Error('now must be a valid date');
  if (!artifact || artifact.status === 'failed') {
    return { sourceId: source.id, status: 'never-verified', lastSuccessAt: null, nextRefreshAt: null, staleAt: null, ageDays: null };
  }
  const retrieved = new Date(artifact.retrievedAt);
  if (!Number.isFinite(retrieved.getTime())) throw new Error('artifact retrievedAt must be a valid date');
  const nextRefresh = addDays(retrieved, source.cadenceDays);
  const staleAt = addDays(retrieved, source.staleAfterDays);
  const ageDays = Math.max(0, Math.floor((reference.getTime() - retrieved.getTime()) / DAY_MS));
  const status = reference >= staleAt ? 'stale' : reference >= nextRefresh ? 'due-soon' : 'current';
  return {
    sourceId: source.id,
    status,
    lastSuccessAt: artifact.retrievedAt,
    nextRefreshAt: nextRefresh.toISOString(),
    staleAt: staleAt.toISOString(),
    ageDays,
  };
}
