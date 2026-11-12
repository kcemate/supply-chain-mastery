import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  Check,
  ChevronRight,
  CirclePause,
  Clock3,
  ExternalLink,
  FileCheck2,
  Filter,
  History,
  Play,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
  X,
} from 'lucide-react';
import type {
  CopilotProviderStatus,
  DecisionPolicy,
  DecisionRecord,
  DecisionResolution,
  DecisionStatus,
  IntelligenceState,
} from './intelligenceTypes';
import type { ScenarioChange, TwinMetrics } from './flywayTypes';
import './decision-intelligence.css';

export interface DecisionIntelligencePageProps {
  state: IntelligenceState;
  busy?: boolean;
  error?: string;
  onAnalyze: () => void | Promise<void>;
  onResolve: (id: string, action: DecisionResolution, reason: string) => void | Promise<void>;
  onPolicyChange: (policy: DecisionPolicy) => void | Promise<void>;
  onOpenRun: (runId: string) => void;
  onAsk: (prompt: string) => void;
  providerStatus: CopilotProviderStatus;
  onConfigureAI: () => void;
}

type DecisionView = 'queue' | 'history' | 'policy';
type DecisionFilter = 'all' | DecisionStatus;

const statusLabels: Record<DecisionStatus, string> = {
  'awaiting-human': 'Needs decision',
  applied: 'Applied',
  rejected: 'Rejected',
  deferred: 'Deferred',
  superseded: 'Superseded',
};

const eventLabels: Record<string, string> = {
  evaluated: 'Evaluated', applied: 'Applied automatically',
  'approved-and-applied': 'Approved and applied', rejected: 'Rejected',
  deferred: 'Deferred', superseded: 'Superseded',
  'stale-approval-blocked': 'Stale approval blocked',
};
const eventLabel = (action: string) => eventLabels[action] || action.replace(/-/g, ' ');

const formatDate = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
    : 'Time unavailable';
};

const percent = (value: number) => `${value.toFixed(1)}%`;
const integer = (value: number) => Math.round(value).toLocaleString();
const money = (value: number) => new Intl.NumberFormat('en-US', {
  style: 'currency', currency: 'USD', maximumFractionDigits: 0,
}).format(value);
const signed = (value: number, formatter: (amount: number) => string) => `${value > 0 ? '+' : ''}${formatter(value)}`;

function changeLabel(change: ScenarioChange) {
  switch (change.kind) {
    case 'adjust-capacity': return `Adjust capacity at ${change.locationId} to ${(change.multiplier * 100).toFixed(1)}%${change.product ? ` for ${change.product}` : ''}`;
    case 'adjust-demand': return `Adjust demand at ${change.locationId} to ${(change.multiplier * 100).toFixed(1)}%${change.product ? ` for ${change.product}` : ''}`;
    case 'adjust-price': return `Adjust ${change.product || 'modeled'} price to ${(change.multiplier * 100).toFixed(1)}%${change.locationId ? ` at ${change.locationId}` : ''}`;
    case 'adjust-lane': return `Adjust lane ${change.laneId}`;
    case 'set-location-status': return `Set ${change.locationId} to ${change.status}`;
    case 'weather-disruption': return `Model weather disruption across ${change.locationIds.length} locations and ${change.laneIds.length} lanes`;
    case 'reassign-restaurant': return `Reassign ${change.restaurantId} to ${change.dcId}`;
    case 'add-location': return `Add modeled ${change.location.type}: ${change.location.name}`;
    case 'add-lane': return `Add modeled lane ${change.lane.id}`;
    case 'remove-lane': return `Remove modeled lane ${change.laneId}`;
    case 'set-inventory-policy': return `Update ${change.product} inventory policy at ${change.dcId}`;
  }
}

function decisionSearchText(decision: DecisionRecord) {
  return `${decision.title} ${decision.summary} ${decision.rationale} ${decision.status} ${decision.authority} ${decision.risk} ${decision.policyReasons.join(' ')}`.toLowerCase();
}

function MetricComparison({ before, after }: { before: TwinMetrics; after: TwinMetrics }) {
  const rows = [
    { label: 'Service level', before: percent(before.serviceLevel), after: percent(after.serviceLevel), delta: signed(after.serviceLevel - before.serviceLevel, (value) => `${value.toFixed(1)} pp`), favorable: after.serviceLevel >= before.serviceLevel },
    { label: 'Stockout units', before: integer(before.stockoutUnits), after: integer(after.stockoutUnits), delta: signed(after.stockoutUnits - before.stockoutUnits, integer), favorable: after.stockoutUnits <= before.stockoutUnits },
    { label: 'Landed cost', before: money(before.totalLandedCost), after: money(after.totalLandedCost), delta: signed(after.totalLandedCost - before.totalLandedCost, money), favorable: after.totalLandedCost <= before.totalLandedCost },
    { label: 'Peak utilization', before: percent(before.maxUtilization), after: percent(after.maxUtilization), delta: signed(after.maxUtilization - before.maxUtilization, (value) => `${value.toFixed(1)} pp`), favorable: after.maxUtilization <= before.maxUtilization },
  ];
  return <div className="di-metric-comparison" role="group" aria-label="Before and after modeled results">
    <div className="di-metric-head" aria-hidden="true"><span>Measure</span><span>Before</span><span>After</span><span>Change</span></div>
    {rows.map((row) => <div className="di-metric-row" key={row.label}>
      <span>{row.label}</span><strong>{row.before}</strong><strong>{row.after}</strong><span className={row.favorable ? 'is-favorable' : 'is-unfavorable'}>{row.delta}</span>
    </div>)}
  </div>;
}

function DecisionDetail({ decision, busy, onResolve, onOpenRun, onAsk }: {
  decision: DecisionRecord;
  busy: boolean;
  onResolve: DecisionIntelligencePageProps['onResolve'];
  onOpenRun: DecisionIntelligencePageProps['onOpenRun'];
  onAsk: DecisionIntelligencePageProps['onAsk'];
}) {
  const [reason, setReason] = useState('');
  const [actionError, setActionError] = useState('');
  const [pendingAction, setPendingAction] = useState<DecisionResolution | null>(null);
  const inFlight = useRef(false);
  const canResolve = decision.authority === 'human' && (decision.status === 'awaiting-human' || decision.status === 'deferred');

  useEffect(() => { setReason(''); setActionError(''); setPendingAction(null); inFlight.current = false; }, [decision.id]);

  const resolve = async (action: DecisionResolution) => {
    if (busy || inFlight.current || !canResolve) return;
    if (!reason.trim()) {
      setActionError('Add a reason so this decision remains auditable.');
      return;
    }
    try {
      inFlight.current = true;
      setPendingAction(action);
      setActionError('');
      await onResolve(decision.id, action, reason.trim());
      setReason('');
    } catch (resolutionError) {
      setActionError(resolutionError instanceof Error ? resolutionError.message : 'The decision could not be saved. Review the workspace status and retry.');
    } finally {
      inFlight.current = false;
      setPendingAction(null);
    }
  };

  return <article className="di-detail" aria-labelledby={`decision-title-${decision.id}`} aria-busy={busy || pendingAction !== null}>
    <header className="di-detail-header">
      <div className="di-badge-row">
        <span className={`di-status is-${decision.status}`}>{statusLabels[decision.status]}</span>
        <span className={`di-risk is-${decision.risk}`}>{decision.risk === 'high' ? 'High impact' : 'Low risk'}</span>
        <span className="di-authority">{decision.authority === 'ai' ? <Bot size={15} aria-hidden="true" /> : <UserRoundCheck size={15} aria-hidden="true" />}{decision.authority === 'ai' ? 'Automatic · policy rules' : 'Human decision'}</span>
      </div>
      <h2 id={`decision-title-${decision.id}`}>{decision.title}</h2>
      <p>{decision.summary}</p>
      <small>Created {formatDate(decision.createdAt)} · Updated {formatDate(decision.updatedAt)}</small>
    </header>

    <section className="di-detail-section" aria-labelledby={`impact-${decision.id}`}>
      <div className="di-section-heading"><div><h3 id={`impact-${decision.id}`}>Measured impact</h3><p>Calculated by the deterministic simulation engine.</p></div><button type="button" className="button secondary" onClick={() => onOpenRun(decision.evidence.candidateRunId || decision.evidence.runId)}>Open run <ExternalLink size={15} aria-hidden="true" /></button></div>
      <MetricComparison before={decision.before} after={decision.after} />
      <p className="di-muted">Planning estimates, not operating results. Capacity investment and implementation costs are not included in landed cost.</p>
    </section>

    <section className="di-detail-section" aria-labelledby={`proposal-${decision.id}`}>
      <h3 id={`proposal-${decision.id}`}>Proposed model changes</h3>
      <ol className="di-change-list">{decision.proposal.map((change, index) => <li key={change.id || `${decision.id}-${index}`}><span>{index + 1}</span><div><strong>{changeLabel(change)}</strong><small>Effective day {change.effectiveDay + 1}{change.durationDays ? ` · ${change.durationDays} day duration` : ''}{change.note ? ` · ${change.note}` : ''}</small></div></li>)}</ol>
    </section>

    <section className="di-detail-section" aria-labelledby={`reasoning-${decision.id}`}>
      <h3 id={`reasoning-${decision.id}`}>Why it was routed here</h3>
      <p>{decision.rationale}</p>
      {decision.policyReasons.length > 0 ? <ul className="di-policy-reasons">{decision.policyReasons.map((item) => <li key={item}><ShieldCheck size={15} aria-hidden="true" />{item}</li>)}</ul> : <p className="di-muted">No additional policy reasons were recorded.</p>}
      <button type="button" className="di-text-action" onClick={() => onAsk(`Explain decision ${decision.id}, its measured tradeoffs, and the evidence behind the recommendation.`)}><Sparkles size={16} aria-hidden="true" />Ask copilot to explain this decision</button>
    </section>

    <section className="di-detail-section" aria-labelledby={`evidence-${decision.id}`}>
      <h3 id={`evidence-${decision.id}`}>Evidence and calculation lineage</h3>
      <dl className="di-lineage">
        <div><dt>Engine</dt><dd>{decision.evidence.engineVersion}</dd></div>
        <div><dt>Baseline input</dt><dd title={decision.evidence.inputHash}>{decision.evidence.inputHash}</dd></div>
        <div><dt>Baseline output</dt><dd title={decision.evidence.outputChecksum}>{decision.evidence.outputChecksum}</dd></div>
        <div><dt>Candidate input</dt><dd title={decision.evidence.candidateInputHash}>{decision.evidence.candidateInputHash}</dd></div>
        <div><dt>Candidate output</dt><dd title={decision.evidence.candidateOutputChecksum}>{decision.evidence.candidateOutputChecksum}</dd></div>
      </dl>
    </section>

    {canResolve && <section className="di-decision-form" aria-labelledby={`resolve-${decision.id}`}>
      <div><h3 id={`resolve-${decision.id}`}>Record your decision</h3><p>Approval changes the planning model. It does not execute an external operational action.</p></div>
      <label htmlFor={`decision-reason-${decision.id}`}>Decision reason</label>
      <textarea id={`decision-reason-${decision.id}`} value={reason} disabled={busy || pendingAction !== null} onChange={(event) => setReason(event.target.value)} placeholder="Explain the judgment, tradeoff, or evidence behind your choice." />
      {actionError && <p className="di-action-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{actionError}</p>}
      <div className="di-resolution-actions">
        <button type="button" className="button primary" disabled={busy || pendingAction !== null} onClick={() => void resolve('approve')}><Check size={16} aria-hidden="true" />{pendingAction === 'approve' ? 'Approving…' : 'Approve and apply'}</button>
        <button type="button" className="button secondary" disabled={busy || pendingAction !== null} onClick={() => void resolve('defer')}><CirclePause size={16} aria-hidden="true" />{pendingAction === 'defer' ? 'Deferring…' : 'Defer'}</button>
        <button type="button" className="button secondary is-danger" disabled={busy || pendingAction !== null} onClick={() => void resolve('reject')}><X size={16} aria-hidden="true" />{pendingAction === 'reject' ? 'Rejecting…' : 'Reject'}</button>
      </div>
    </section>}

    <section className="di-detail-section" aria-labelledby={`history-${decision.id}`}>
      <h3 id={`history-${decision.id}`}>Decision history</h3>
      {decision.history.length > 0 ? <ol className="di-event-list">{[...decision.history].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map((event) => <li key={event.id}><span className={`di-event-actor is-${event.actor}`}>{event.actor === 'human' ? <UserRoundCheck size={15} aria-hidden="true" /> : event.actor === 'ai' ? <Bot size={15} aria-hidden="true" /> : <ShieldCheck size={15} aria-hidden="true" />}</span><div><strong>{eventLabel(event.action)}</strong><p>{event.reason}</p><small>{event.actor} · {formatDate(event.at)}</small></div></li>)}</ol> : <p className="di-muted">No decision events have been recorded.</p>}
    </section>
  </article>;
}

function PolicyEditor({ policy, busy, onPolicyChange }: { policy: DecisionPolicy; busy: boolean; onPolicyChange: DecisionIntelligencePageProps['onPolicyChange'] }) {
  const [draft, setDraft] = useState(policy);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(policy); setSaved(false); setSaveError(''); }, [policy]);
  const changed = JSON.stringify(draft) !== JSON.stringify(policy);
  const valid = [draft.maxCapacityIncreasePct, draft.maxCostIncreasePct, draft.maxLocations, draft.minServiceGainPp].every(Number.isFinite)
    && draft.maxCapacityIncreasePct >= 0 && draft.maxCapacityIncreasePct <= 5 && draft.maxCostIncreasePct >= 0 && draft.maxCostIncreasePct <= 2 && draft.maxLocations >= 0 && draft.maxLocations <= 1 && Number.isInteger(draft.maxLocations) && draft.minServiceGainPp >= 0;
  const setNumber = (key: keyof DecisionPolicy, value: string) => setDraft((current) => ({ ...current, [key]: Number(value) }));
  const save = async () => {
    if (!valid || !changed || saving || busy) return;
    try {
      setSaving(true); setSaveError(''); setSaved(false);
      await onPolicyChange(draft);
      setSaved(true);
    } catch (policyError) {
      setSaveError(policyError instanceof Error ? policyError.message : 'The policy could not be saved. Review the workspace status and retry.');
    } finally { setSaving(false); }
  };
  return <div className="di-policy-panel">
    <div className="di-policy-intro"><ShieldCheck size={24} aria-hidden="true" /><div><h2>Autonomy policy</h2><p>These rules can tighten automatic planning-model changes. Structural and high-impact changes always require a person.</p></div></div>
    <form onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label className="di-toggle"><input type="checkbox" checked={draft.autonomyEnabled} disabled={busy || saving} onChange={(event) => setDraft((current) => ({ ...current, autonomyEnabled: event.target.checked }))} /><span><strong>Allow qualifying low-risk changes</strong><small>Capacity increases must reduce shortages, improve service, or lower landed cost versus doing nothing, and pass every rule below.</small></span></label>
      <div className="di-policy-grid">
        <label><span>Maximum capacity increase</span><input type="number" min="0" max="5" step="0.1" value={draft.maxCapacityIncreasePct} disabled={busy || saving} onChange={(event) => setNumber('maxCapacityIncreasePct', event.target.value)} /><small>0–5% at each modeled location</small></label>
        <label><span>Maximum landed-cost increase</span><input type="number" min="0" max="2" step="0.1" value={draft.maxCostIncreasePct} disabled={busy || saving} onChange={(event) => setNumber('maxCostIncreasePct', event.target.value)} /><small>0–2% across the evaluated horizon</small></label>
        <label><span>Maximum locations changed</span><input type="number" min="0" max="1" step="1" value={draft.maxLocations} disabled={busy || saving} onChange={(event) => setNumber('maxLocations', event.target.value)} /><small>0 or 1 per automatic decision</small></label>
        <label><span>Minimum service gain</span><input type="number" min="0" max="100" step="0.1" value={draft.minServiceGainPp} disabled={busy || saving} onChange={(event) => setNumber('minServiceGainPp', event.target.value)} /><small>Required percentage-point improvement</small></label>
      </div>
      {!valid && <p className="di-action-error" role="alert"><AlertCircle size={16} aria-hidden="true" />Use 0–5% capacity, 0–2% cost, 0 or 1 location, and a nonnegative service gain.</p>}
      {saveError && <p className="di-action-error" role="alert"><AlertCircle size={16} aria-hidden="true" />{saveError}</p>}
      {saved && !changed && <p className="di-save-success" role="status"><Check size={16} aria-hidden="true" />Policy saved.</p>}
      <div className="di-policy-actions"><button className="button secondary" type="button" disabled={!changed || busy || saving} onClick={() => setDraft(policy)}>Discard changes</button><button className="button primary" type="submit" disabled={!changed || !valid || busy || saving}>{saving ? 'Saving policy…' : 'Save policy'}</button></div>
    </form>
  </div>;
}

export function DecisionIntelligencePage({ state, busy = false, error = '', onAnalyze, onResolve, onPolicyChange, onOpenRun, onAsk, providerStatus, onConfigureAI }: DecisionIntelligencePageProps) {
  const [view, setView] = useState<DecisionView>('queue');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<DecisionFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState('');
  const analyzeRef = useRef(false);

  const awaiting = useMemo(() => state.decisions.filter((decision) => decision.status === 'awaiting-human' || decision.status === 'deferred'), [state.decisions]);
  const completed = useMemo(() => state.decisions.filter((decision) => !awaiting.includes(decision)), [state.decisions, awaiting]);
  const base = view === 'queue' ? awaiting : completed;
  const visible = useMemo(() => base.filter((decision) => {
    const matchesStatus = filter === 'all' || decision.status === filter;
    return matchesStatus && decisionSearchText(decision).includes(query.trim().toLowerCase());
  }).sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt)), [base, filter, query]);
  const selected = visible.find((decision) => decision.id === selectedId) || visible[0] || null;
  const automatedCount = state.decisions.filter((decision) => decision.authority === 'ai' && decision.status === 'applied').length;

  useEffect(() => { if (selected && selected.id !== selectedId) setSelectedId(selected.id); }, [selected, selectedId]);
  useEffect(() => { setFilter('all'); setQuery(''); setSelectedId(null); }, [view]);

  const analyze = async () => {
    if (busy || analyzeRef.current) return;
    try {
      analyzeRef.current = true; setAnalyzing(true); setAnalyzeError('');
      await onAnalyze();
    } catch (analysisError) {
      setAnalyzeError(analysisError instanceof Error ? analysisError.message : 'The network analysis could not be completed. Review the workspace status and retry.');
    } finally { analyzeRef.current = false; setAnalyzing(false); }
  };

  return <main id="main-content" className="decision-intelligence" aria-labelledby="decision-intelligence-title" aria-busy={busy || analyzing}>
    <header className="di-page-header">
      <div><h1 id="decision-intelligence-title">Decision intelligence</h1><p>See what automation changed, what needs human judgment, and the calculated evidence behind every action.</p></div>
      <button type="button" className="button primary" disabled={busy || analyzing} onClick={() => void analyze()}><Play size={16} aria-hidden="true" />{analyzing ? 'Analyzing network…' : 'Analyze network'}</button>
    </header>

    <div className={`di-provider-status ${providerStatus.configured ? 'is-configured' : 'is-unconfigured'}`} role="status">
      <span><Bot size={18} aria-hidden="true" /></span>
      <div><strong>{providerStatus.configured ? `AI copilot connected${providerStatus.model ? ` · ${providerStatus.model}` : ''}` : 'AI copilot needs setup'}</strong><p>{providerStatus.detail}</p></div>
      <button type="button" className="button secondary" onClick={onConfigureAI}>{providerStatus.configured ? 'AI settings' : 'Set up AI'}</button>
    </div>

    {(error || analyzeError) && <div className="di-page-error" role="alert"><AlertCircle size={18} aria-hidden="true" /><div><strong>Decision intelligence needs attention</strong><p>{analyzeError || error}</p></div></div>}

    <section className="di-summary" aria-label="Decision summary">
      <div><span><UserRoundCheck size={18} aria-hidden="true" /></span><div><strong>{awaiting.length}</strong><small>Need human judgment</small></div></div>
      <div><span><Bot size={18} aria-hidden="true" /></span><div><strong>{automatedCount}</strong><small>Applied automatically</small></div></div>
      <div><span><History size={18} aria-hidden="true" /></span><div><strong>{completed.length}</strong><small>Completed decisions</small></div></div>
      <div><span><ShieldCheck size={18} aria-hidden="true" /></span><div><strong>{state.policy.autonomyEnabled ? 'On' : 'Off'}</strong><small>Low-risk autonomy</small></div></div>
    </section>

    <nav className="di-tabs" aria-label="Decision intelligence views">
      <button type="button" aria-current={view === 'queue' ? 'page' : undefined} onClick={() => setView('queue')}><UserRoundCheck size={17} aria-hidden="true" />Human queue <span>{awaiting.length}</span></button>
      <button type="button" aria-current={view === 'history' ? 'page' : undefined} onClick={() => setView('history')}><History size={17} aria-hidden="true" />Decision history <span>{completed.length}</span></button>
      <button type="button" aria-current={view === 'policy' ? 'page' : undefined} onClick={() => setView('policy')}><Settings2 size={17} aria-hidden="true" />Autonomy policy</button>
    </nav>

    {view === 'policy' ? <PolicyEditor policy={state.policy} busy={busy} onPolicyChange={onPolicyChange} /> : <div className="di-workspace">
      <section className="di-list-panel" aria-label={view === 'queue' ? 'Decisions requiring human review' : 'Decision history'}>
        <div className="di-list-tools">
          <label className="di-search"><Search size={17} aria-hidden="true" /><span className="sr-only">Search decisions</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search decisions" /></label>
          <label className="di-filter"><Filter size={16} aria-hidden="true" /><span className="sr-only">Filter decisions by status</span><select value={filter} onChange={(event) => setFilter(event.target.value as DecisionFilter)}><option value="all">All statuses</option>{(Object.keys(statusLabels) as DecisionStatus[]).filter((status) => base.some((decision) => decision.status === status)).map((status) => <option value={status} key={status}>{statusLabels[status]}</option>)}</select></label>
        </div>
        <div className="di-decision-list">
          {visible.length > 0 && <table aria-label={view === 'queue' ? 'Human decision queue' : 'Completed decision history'}>
            <thead><tr><th>Decision</th><th>Status</th></tr></thead>
            <tbody>{visible.map((decision) => <tr key={decision.id} className={selected?.id === decision.id ? 'is-selected' : ''}>
              <td><button type="button" aria-current={selected?.id === decision.id ? 'true' : undefined} onClick={() => setSelectedId(decision.id)}><span className={`di-list-icon is-${decision.authority}`}>{decision.authority === 'ai' ? <Bot size={17} aria-hidden="true" /> : <UserRoundCheck size={17} aria-hidden="true" />}</span><span className="di-list-copy"><strong>{decision.title}</strong><span>{decision.summary}</span></span><ChevronRight size={18} aria-hidden="true" /></button></td>
              <td><span className={`di-table-status is-${decision.status}`}>{statusLabels[decision.status]}</span><small>{decision.risk === 'high' ? 'High impact' : 'Low risk'}</small></td>
            </tr>)}</tbody>
          </table>}
          {!visible.length && <div className="di-empty-list"><FileCheck2 size={26} aria-hidden="true" /><strong>{query || filter !== 'all' ? 'No matching decisions' : view === 'queue' ? 'No decisions need review' : 'No completed decisions yet'}</strong><p>{query || filter !== 'all' ? 'Change the search or status filter.' : view === 'queue' ? 'Analyze the planning model to evaluate potential improvements.' : 'Applied, rejected, and superseded decisions will appear here.'}</p>{view === 'queue' && !query && filter === 'all' && <button type="button" className="button secondary" disabled={busy || analyzing} onClick={() => void analyze()}>{analyzing ? 'Analyzing…' : 'Analyze network'}</button>}</div>}
        </div>
      </section>
      <section className="di-detail-panel" aria-live="polite">{selected ? <DecisionDetail decision={selected} busy={busy} onResolve={onResolve} onOpenRun={onOpenRun} onAsk={onAsk} /> : <div className="di-empty-detail"><Clock3 size={28} aria-hidden="true" /><h2>Select a decision</h2><p>Review measured impact, evidence, policy routing, and the complete event history.</p></div>}</section>
    </div>}
  </main>;
}
