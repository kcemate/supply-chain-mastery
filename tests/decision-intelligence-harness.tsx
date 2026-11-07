import { useState } from 'react';
import ReactDOM from 'react-dom/client';
import { DecisionIntelligencePage } from '../src/DecisionIntelligencePage';
import type { DecisionPolicy, DecisionRecord, IntelligenceState } from '../src/intelligenceTypes';
import '../src/flyway.css';

const baseline = {
  serviceLevel: 96.2, stockoutUnits: 1_240, affectedRestaurants: 14, totalLandedCost: 480_000,
  maxUtilization: 93.4, maxUtilizationLocationId: 'dc-atl', totalDemand: 32_000, fulfilledDemand: 30_784,
};
const evidence = {
  runId: 'run-capacity-1', inputHash: 'a'.repeat(64), outputChecksum: 'b'.repeat(64),
  candidateInputHash: 'c'.repeat(64), candidateOutputChecksum: 'd'.repeat(64), engineVersion: 'flyway-engine-2',
};
const decisions: DecisionRecord[] = [
  {
    id: 'decision-capacity', title: 'Increase Atlanta modeled capacity',
    summary: 'A 7% capacity increase improves service but exceeds the automatic-change limit.',
    rationale: 'The candidate reduces modeled shortages during the demand surge. The requested increase is above the configured 5% autonomy threshold.',
    createdAt: '2026-11-06T13:00:00.000Z', updatedAt: '2026-11-06T13:00:00.000Z', createdBy: 'ai',
    status: 'awaiting-human', authority: 'human', risk: 'high', networkHash: 'network-a',
    proposal: [{ id: 'change-capacity', kind: 'adjust-capacity', effectiveDay: 0, locationId: 'dc-atl', multiplier: 1.07, note: 'Modeled capacity assumption' }],
    before: baseline, after: { ...baseline, serviceLevel: 98.1, stockoutUnits: 608, affectedRestaurants: 7, totalLandedCost: 486_500, maxUtilization: 87.1, fulfilledDemand: 31_392 },
    evidence, policyReasons: ['Capacity increase exceeds the 5% automatic-change limit.', 'A person must approve higher-impact model changes.'],
    history: [{ id: 'event-route', at: '2026-11-06T13:00:00.000Z', actor: 'rules', action: 'routed for approval', reason: 'The evaluated change exceeded the configured capacity threshold.' }],
  },
  {
    id: 'decision-auto', title: 'Increase Nashville modeled capacity',
    summary: 'A 3% capacity increase passed every low-risk autonomy rule.',
    rationale: 'The evaluated change improved service without increasing shortages or exceeding cost policy.',
    createdAt: '2026-11-06T12:00:00.000Z', updatedAt: '2026-11-06T12:01:00.000Z', createdBy: 'ai',
    status: 'applied', authority: 'ai', risk: 'low', networkHash: 'network-a', appliedNetworkHash: 'network-b',
    proposal: [{ id: 'change-auto', kind: 'adjust-capacity', effectiveDay: 0, locationId: 'dc-nashville', multiplier: 1.03 }],
    before: baseline, after: { ...baseline, serviceLevel: 96.8, stockoutUnits: 1_010, affectedRestaurants: 11, totalLandedCost: 481_200, maxUtilization: 91.2, fulfilledDemand: 30_990 },
    evidence: { ...evidence, runId: 'run-auto-1', candidateInputHash: 'e'.repeat(64), candidateOutputChecksum: 'f'.repeat(64) },
    policyReasons: ['Change stayed within all configured low-risk thresholds.'],
    history: [{ id: 'event-auto', at: '2026-11-06T12:01:00.000Z', actor: 'ai', action: 'applied', reason: 'All low-risk autonomy rules passed.' }],
  },
];

const initialState: IntelligenceState = {
  schemaVersion: 1, revision: 3,
  policy: { autonomyEnabled: true, maxCapacityIncreasePct: 5, maxCostIncreasePct: 2, maxLocations: 1, minServiceGainPp: 0 },
  decisions, conversations: [],
};

function Harness() {
  const [state, setState] = useState(initialState);
  const [busy, setBusy] = useState(false);
  const [event, setEvent] = useState('Ready');
  const resolve = async (id: string, action: 'approve' | 'reject' | 'defer', reason: string) => {
    setBusy(true);
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 120));
    const at = new Date('2026-11-06T14:00:00.000Z').toISOString();
    setState((current) => ({ ...current, revision: current.revision + 1, decisions: current.decisions.map((decision) => decision.id === id ? {
      ...decision, status: action === 'approve' ? 'applied' : action === 'reject' ? 'rejected' : 'deferred', updatedAt: at,
      history: [...decision.history, { id: `event-${action}`, at, actor: 'human', action, reason }],
    } : decision) }));
    setEvent(`${action}:${id}:${reason}`);
    setBusy(false);
  };
  const policy = async (next: DecisionPolicy) => { setBusy(true); await new Promise((resolveDelay) => setTimeout(resolveDelay, 80)); setState((current) => ({ ...current, revision: current.revision + 1, policy: next })); setEvent('policy-saved'); setBusy(false); };
  return <div className="flyway-app">
    <output aria-live="polite" data-testid="harness-event">{event}</output>
    <DecisionIntelligencePage
      state={state} busy={busy} providerStatus={{ configured: true, provider: 'openai', model: 'configured-model', detail: 'Connected through the workspace service.' }}
      onAnalyze={async () => { setEvent('analysis-started'); }} onResolve={resolve} onPolicyChange={policy}
      onOpenRun={(runId) => setEvent(`open:${runId}`)} onAsk={(prompt) => setEvent(`ask:${prompt}`)} onConfigureAI={() => setEvent('configure-ai')}
    />
  </div>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Harness />);
