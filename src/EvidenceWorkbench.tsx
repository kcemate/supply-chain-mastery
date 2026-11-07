import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Archive, Check, ChevronRight, Clock3, Database, ExternalLink, FileClock, Search, ShieldCheck, X } from 'lucide-react';
import type { PublicDistributionFacilityRegistry, PublicFootprintSnapshot } from './flywayTypes';
import { buildEvidenceWorkspace, canAcceptConflict, decideAndPublish, type EvidenceConflict, type EvidenceLedger, type EvidencePublication, type EvidenceReviewAction } from './evidence';
import './evidence-workbench.css';

export interface EvidenceWorkbenchProps {
  footprint?: PublicFootprintSnapshot;
  facilities?: PublicDistributionFacilityRegistry;
  ledger: EvidenceLedger;
  onLedger: (ledger: EvidenceLedger) => Promise<boolean> | boolean | void;
  onPublish?: (publication: EvidencePublication) => void;
  loading?: boolean;
  error?: string;
  now?: string | Date;
  actorId?: string;
}

type WorkbenchView = 'sources' | 'review' | 'history';
type QueueFilter = 'all' | EvidenceConflict['reason'];
const reasonLabels: Record<EvidenceConflict['reason'], string> = {
  added: 'New public record', changed: 'Changed field', removed: 'Removed at source', 'conflicting-sources': 'Conflicting sources',
  'extraction-failed': 'Extraction failed', stale: 'Stale evidence',
};

const readableField = (fieldPath: string) => fieldPath.replace(/([A-Z])/g, ' $1').replace(/\./g, ' / ').toLowerCase();
const displayValue = (value: unknown, empty: string) => value === null ? empty : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: value.includes('T') ? 'short' : undefined, timeZone: value.includes('T') ? undefined : 'UTC' }).format(new Date(value)) : 'Not available';
const coordinateAcceptanceBlocked = (conflict: EvidenceConflict) => /(^|\.)(mapPosition|coordinates|latitude|longitude)$/i.test(conflict.fieldPath) && (!conflict.candidateEvidenceValueId || conflict.candidateValue === null);

export function EvidenceWorkbench({ footprint, facilities, ledger, onLedger, onPublish, loading = false, error = '', now, actorId = 'workspace-owner' }: EvidenceWorkbenchProps) {
  const [observedNow, setObservedNow] = useState(() => new Date());
  useEffect(() => {
    if (now !== undefined) return;
    const refresh = () => setObservedNow(new Date());
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener('focus', refresh);
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh); };
  }, [now]);
  const effectiveNow = now ?? observedNow;
  const [view, setView] = useState<WorkbenchView>('sources');
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [deferredUntil, setDeferredUntil] = useState('');
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const actionPendingRef = useRef(false);
  const workspace = useMemo(() => footprint && facilities ? buildEvidenceWorkspace({ footprint, facilities, ledger, now: effectiveNow }) : null, [facilities, footprint, ledger, effectiveNow]);
  const queue = useMemo(() => (workspace?.reviewQueue || []).filter((item) => {
    const searchable = `${item.entityId} ${item.fieldPath} ${item.reason} ${item.supportingSourceTitle || ''}`.toLowerCase();
    return (filter === 'all' || item.reason === filter) && searchable.includes(query.trim().toLowerCase());
  }), [filter, query, workspace]);
  const selected = workspace?.reviewQueue.find((item) => item.id === selectedId) || queue[0] || null;
  const history = ledger.conflicts.flatMap((conflict) => conflict.decisions.map((decision) => ({ conflict, decision }))).sort((a, b) => Date.parse(b.decision.decidedAt) - Date.parse(a.decision.decidedAt));

  const applyDecision = async (action: EvidenceReviewAction) => {
    if (!selected || actionPendingRef.current) return;
    if (!reason.trim()) return setActionError('Add a reason so the evidence decision is auditable.');
    const acceptance = canAcceptConflict(ledger, selected);
    if (action === 'accept' && (coordinateAcceptanceBlocked(selected) || !acceptance.allowed)) return setActionError(acceptance.reason || 'This record has no supported candidate coordinate. Keep it unplotted, reject it, or defer it for more evidence.');
    try {
      actionPendingRef.current = true;
      setActionPending(true);
      const decidedAt = new Date().toISOString();
      const outcome = await decideAndPublish({ ledger, conflictId: selected.id, decision: { id: `decision:${selected.id}:${decidedAt}`, action, actorId, decidedAt, reason: reason.trim(), deferredUntil: action === 'defer' ? deferredUntil : undefined } });
      const persisted = await onLedger(outcome.ledger);
      if (persisted === false) throw new Error('The evidence decision was not saved. Your selection and reason are retained; review the storage notice and retry.');
      if (outcome.publication) onPublish?.(outcome.publication);
      setReason(''); setDeferredUntil(''); setActionError(''); setSelectedId(null);
    } catch (decisionError) {
      setActionError(decisionError instanceof Error ? decisionError.message : 'The review decision could not be saved.');
    } finally {
      actionPendingRef.current = false;
      setActionPending(false);
    }
  };

  if (loading) return <section className="evidence-workbench" aria-busy="true" aria-label="Evidence workbench loading"><div className="evidence-state"><Database aria-hidden="true" /><h2>Loading evidence workspace</h2><p>Reading preserved source versions and review history.</p><span className="evidence-loading-bar" /></div></section>;
  if (error) return <section className="evidence-workbench" role="alert"><div className="evidence-state is-error"><AlertTriangle aria-hidden="true" /><h2>Evidence workspace unavailable</h2><p>{error}</p><p>Public records remain unchanged. Retry after the source ledger is available.</p></div></section>;
  if (!workspace) return <section className="evidence-workbench"><div className="evidence-state"><Archive aria-hidden="true" /><h2>No evidence snapshot loaded</h2><p>Load both the restaurant footprint and facility registry to inspect provenance and review changes.</p></div></section>;

  return <section className="evidence-workbench" aria-labelledby="evidence-workbench-title">
    <header className="evidence-workbench-header"><div><h1 id="evidence-workbench-title">Evidence operations</h1><p>Review public-source changes without promoting unsupported operating claims.</p></div><div className="evidence-counts" aria-label="Evidence scope counts"><span><strong>{workspace.summary.publicRestaurantRecords.toLocaleString()}</strong> public restaurant records</span><span><strong>{workspace.summary.publicFacilityRecords}</strong> named facility records</span><span><strong>{workspace.summary.openReviewItems}</strong> review items</span></div></header>
    <nav className="evidence-view-tabs" aria-label="Evidence views">{(['sources', 'review', 'history'] as const).map((item) => <button type="button" key={item} aria-current={view === item ? 'page' : undefined} onClick={() => setView(item)}>{item === 'review' ? `Review queue (${workspace.summary.openReviewItems})` : item === 'sources' ? 'Source register' : `Decision history (${history.length})`}</button>)}</nav>
    {view === 'sources' && <div className="evidence-source-register">{workspace.sources.map(({ source, latestArtifact, freshness }) => <article key={source.id}><span className={`evidence-source-status is-${freshness.status}`}><ShieldCheck aria-hidden="true" />{freshness.status.replace('-', ' ')}</span><div><h2>{source.title}</h2><p>{source.publisher} · {source.sourceType.replace(/-/g, ' ')}</p><dl><div><dt>Last successful check</dt><dd>{formatDate(freshness.lastSuccessAt)}</dd></div><div><dt>Next refresh</dt><dd>{formatDate(freshness.nextRefreshAt)}</dd></div><div><dt>Stale after</dt><dd>{formatDate(freshness.staleAt)}</dd></div><div><dt>Records / pages</dt><dd>{latestArtifact ? `${latestArtifact.recordCount.toLocaleString()} / ${latestArtifact.pageCount}` : 'No preserved artifact'}</dd></div></dl></div><a href={source.canonicalUrl} target="_blank" rel="noreferrer">Open source <ExternalLink size={16} aria-hidden="true" /></a></article>)}{workspace.summary.staleSources > 0 && <div className="evidence-inline-warning" role="status"><Clock3 aria-hidden="true" /><span><strong>{workspace.summary.staleSources} source{workspace.summary.staleSources === 1 ? '' : 's'} need attention.</strong> Existing evidence remains visible with its last successful date.</span></div>}</div>}
    {view === 'review' && <div className="evidence-review-layout"><div className="evidence-review-list-panel"><div className="evidence-review-tools"><label><span className="sr-only">Search evidence review queue</span><Search size={17} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search entity, field, or source" /></label><select aria-label="Filter review queue" value={filter} onChange={(event) => setFilter(event.target.value as QueueFilter)}><option value="all">All reasons</option>{Object.entries(reasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div><div className="evidence-review-list" aria-label="Evidence review items">{queue.map((item) => <button type="button" key={item.id} className={selected?.id === item.id ? 'is-selected' : ''} onClick={() => { setSelectedId(item.id); setActionError(''); }}><span><strong>{item.entityId}</strong><small>{readableField(item.fieldPath)} · {reasonLabels[item.reason]}</small></span><ChevronRight size={18} aria-hidden="true" /></button>)}{!queue.length && <div className="evidence-empty-list"><Check aria-hidden="true" /><strong>No matching review items</strong><p>Change the filter or search. Resolved decisions remain in history.</p></div>}</div></div>
      <aside className="evidence-review-detail" aria-label="Selected evidence review item" aria-busy={actionPending}>{selected ? <><div className="evidence-detail-heading"><span className={`evidence-reason is-${selected.reason}`}><AlertTriangle size={16} aria-hidden="true" />{reasonLabels[selected.reason]}</span><h2>{selected.entityId}</h2><p>Field under review: <strong>{readableField(selected.fieldPath)}</strong></p></div><div className="evidence-comparison"><div><span>Previous value</span><pre>{displayValue(selected.previousValue, 'No accepted value')}</pre></div><div><span>Candidate value</span><pre>{displayValue(selected.candidateValue, 'No supported candidate')}</pre></div></div><section className="evidence-support"><h3>Supporting evidence</h3>{selected.supportingSourceUrl ? <a href={selected.supportingSourceUrl} target="_blank" rel="noreferrer">{selected.supportingSourceTitle || 'Open public source'} <ExternalLink size={15} aria-hidden="true" /></a> : <p>No preserved supporting link is attached to this legacy review item.</p>}</section>{(coordinateAcceptanceBlocked(selected) || !canAcceptConflict(ledger, selected).allowed) && <div className="evidence-inline-warning"><ShieldCheck aria-hidden="true" /><span><strong>Coordinate promotion blocked.</strong> {canAcceptConflict(ledger, selected).reason || 'The candidate has no field-level source artifact for an exact map position.'}</span></div>}<div className="evidence-decision-form"><label htmlFor="evidence-decision-reason">Decision reason</label><textarea id="evidence-decision-reason" value={reason} disabled={actionPending} onChange={(event) => setReason(event.target.value)} placeholder="Record why this evidence should be accepted, rejected, or deferred." /><label htmlFor="evidence-defer-until">Defer until</label><input id="evidence-defer-until" type="date" value={deferredUntil} disabled={actionPending} onChange={(event) => setDeferredUntil(event.target.value)} />{actionError && <p className="evidence-action-error" role="alert">{actionError}</p>}<div><button type="button" className="is-accept" disabled={actionPending || coordinateAcceptanceBlocked(selected) || !canAcceptConflict(ledger, selected).allowed} onClick={() => void applyDecision('accept')}><Check size={16} aria-hidden="true" />{actionPending ? 'Saving…' : 'Accept'}</button><button type="button" disabled={actionPending} onClick={() => void applyDecision('reject')}><X size={16} aria-hidden="true" />Reject</button><button type="button" disabled={actionPending} onClick={() => void applyDecision('defer')}><Clock3 size={16} aria-hidden="true" />Defer</button></div></div></> : <div className="evidence-state"><FileClock aria-hidden="true" /><h2>Select a review item</h2><p>Inspect the disputed field, source, and history before recording a decision.</p></div>}</aside></div>}
    {view === 'history' && <div className="evidence-history">{history.length ? history.map(({ conflict, decision }) => <article key={decision.id}><span className={`evidence-history-action is-${decision.action}`}>{decision.action}</span><div><h2>{conflict.entityId} · {readableField(conflict.fieldPath)}</h2><p>{decision.reason}</p><small>{decision.actorId} · {formatDate(decision.decidedAt)}</small></div></article>) : <div className="evidence-state"><Archive aria-hidden="true" /><h2>No review decisions yet</h2><p>Accepted, rejected, and deferred actions will appear here with actor, time, and reason.</p></div>}</div>}
  </section>;
}
