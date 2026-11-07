import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  Box,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  CloudLightning,
  Database,
  Factory,
  Gauge,
  HelpCircle,
  Layers3,
  LocateFixed,
  Map as MapIcon,
  MapPin,
  Menu,
  Moon,
  MoreHorizontal,
  Navigation,
  PanelLeftClose,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Sparkles,
  Store,
  Sun,
  Truck,
  Warehouse,
  X,
  type LucideIcon,
} from 'lucide-react';
import { calculateMetrics, runScenario } from './flywayEngine';
import {
  initialLanes,
  initialLocations,
  productCategories,
  sourceRegister,
  syntheticEvidence,
  userEvidence,
} from './flywayData';
import type {
  EvidenceClass,
  Lane,
  LocationStatus,
  LocationType,
  MapLayerState,
  PublicDistributionFacility,
  PublicDistributionFacilityRegistry,
  PublicFootprintLocation,
  PublicFootprintSnapshot,
  SavedScenario,
  EngineDefaults,
  Recommendation,
  RunInputV2,
  ScenarioDefinition,
  ScenarioResult,
  ScenarioType,
  TwinLocation,
  TwinMetrics,
  ViewId,
} from './flywayTypes';
import './flyway.css';
import { DecisionWorkspace, type WorkspaceMode } from './DecisionWorkspace';
import { AddLocationPanel } from './AddLocationPanel';
import { FlywayCopilot } from './FlywayCopilot';
import { usePersistedState, useStorageNotices, dismissStorageNotice } from './workspaceStorage';
import { initialPreferences, toEngineDefaults, formatDistance, type WorkspacePreferences } from './workspacePreferences';
import { haversineMiles } from './locationPlacement';
import { createBundledEvidenceLedger, mergeBundledEvidenceLedger, createEvidenceValue, editEvidenceValue, type EvidenceLedger } from './evidence';
import { EvidenceWorkbench } from './EvidenceWorkbench';
import { WorkspaceSettings } from './WorkspaceSettings';
import { useWorkspace } from './useWorkspace';
import { simulateAsync, type SimulationPreview } from './simulationClient';
import { useServiceRuns, ServiceRunHistory } from './useServiceRuns';
import { RunAuditDetails } from './RunAuditDetails';
import { ModelLocationPanel } from './ModelLocationPanel';
import type { DecisionDraft } from './decisionDraft';
import { isScenarioReference, type SavedScenarioReferenceV2, type StoredScenario } from './runArtifacts';
import { openRunView, savedScenarioMetrics, type RunResultView } from './runResultView';
import { persistLocalRun, openLocalRun, migrateLegacyScenario, createMemoryRunReader } from './localRunRepository';
import { useRunPage } from './useRunPage';
import { RunPageControls } from './RunPageControls';
import { DecisionIntelligencePage } from './DecisionIntelligencePage';
import { useDecisionIntelligence } from './useDecisionIntelligence';
import './enterprise-workspace.css';

const FlywayMap = React.lazy(() => import('./FlywayMap').then((module) => ({ default: module.FlywayMap })));

type Drawer = 'add' | 'location' | 'public-facility' | 'scenario' | 'results' | 'copilot' | null;
type Theme = 'light' | 'dark';

const navigationItems: Array<{ id: ViewId; label: string; icon: LucideIcon }> = [
  { id: 'control-tower', label: 'Control Tower', icon: MapIcon },
  { id: 'decisions', label: 'Decision Intelligence', icon: Bot },
  { id: 'locations', label: 'Locations', icon: Building2 },
  { id: 'scenarios', label: 'Scenarios', icon: Activity },
  { id: 'sources', label: 'Data & Sources', icon: Database },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const scenarioOptions: Array<{ id: ScenarioType; label: string; hint: string; icon: LucideIcon }> = [
  { id: 'dc-outage', label: 'DC outage', hint: 'Remove modeled DC capacity', icon: Warehouse },
  { id: 'supplier-failure', label: 'Supplier failure', hint: 'Interrupt inbound product flow', icon: Factory },
  { id: 'demand-surge', label: 'Demand surge', hint: 'Increase restaurant demand', icon: Activity },
  { id: 'severe-weather', label: 'Severe weather', hint: 'Reduce capacity and slow routes', icon: CloudLightning },
  { id: 'price-change', label: 'Price change', hint: 'Change modeled product cost', icon: CircleDollarSign },
  { id: 'capacity-constraint', label: 'Capacity constraint', hint: 'Reduce throughput temporarily', icon: Gauge },
  { id: 'location-closure', label: 'Close location', hint: 'Close a node for the horizon', icon: X },
];

const typeMeta: Record<LocationType, { label: string; icon: LucideIcon }> = {
  restaurant: { label: 'Restaurant', icon: Store },
  dc: { label: 'Distribution center', icon: Warehouse },
  supplier: { label: 'Supplier', icon: Factory },
};

const stateCentroids: Record<string, [number, number]> = {
  GA: [32.68, -83.22], NC: [35.54, -79.39], KS: [38.5, -98.0], MO: [38.46, -92.29],
  AL: [32.81, -86.79], TX: [31.47, -99.33], FL: [27.77, -81.69], TN: [35.86, -86.35],
  OH: [40.42, -82.91], CO: [38.99, -105.55], UT: [39.3, -111.67], SC: [33.84, -80.9],
  IL: [40.0, -89.2], CA: [37.2, -119.7], NY: [42.9, -75.5], VA: [37.5, -78.8],
};

const evidenceLabels: Record<EvidenceClass, string> = {
  'verified-public': 'Verified public',
  corroborated: 'Corroborated',
  'user-input': 'User input',
  derived: 'Derived',
  synthetic: 'Sample estimate',
};

function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
}



function usePublicFootprint() {
  const [snapshot, setSnapshot] = useState<PublicFootprintSnapshot>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/data/chick-fil-a-verified-locations.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Public footprint returned ${response.status}`);
        return response.json() as Promise<PublicFootprintSnapshot>;
      })
      .then((data) => { if (active) setSnapshot(data); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  return { snapshot, error };
}

function usePublicDcRegistry() {
  const [registry, setRegistry] = useState<PublicDistributionFacilityRegistry>();
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    fetch('/data/chick-fil-a-public-distribution-facilities.json')
      .then((response) => {
        if (!response.ok) throw new Error(`Public DC registry returned ${response.status}`);
        return response.json() as Promise<PublicDistributionFacilityRegistry>;
      })
      .then((data) => { if (active) setRegistry(data); })
      .catch((reason: Error) => { if (active) setError(reason.message); });
    return () => { active = false; };
  }, []);
  return { registry, error };
}

function BrandMark() {
  return (
    <span className="flyway-mark" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}

function EvidenceBadge({ classification }: { classification: EvidenceClass }) {
  return <span className={classNames('evidence-badge', `is-${classification}`)}>{evidenceLabels[classification]}</span>;
}

function MetricCard({
  label,
  value,
  context,
  tone = 'neutral',
  onClick,
}: {
  label: string;
  value: string;
  context: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'critical';
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="metric-label">{label}</span>
      <strong className="metric-value">{value}</strong>
      <span className="metric-context">{context}</span>
    </>
  );
  return onClick ? (
    <button type="button" className={classNames('metric-card', `tone-${tone}`)} onClick={onClick}>{content}</button>
  ) : (
    <div className={classNames('metric-card', `tone-${tone}`)}>{content}</div>
  );
}

function Sidebar({ view, onNavigate, collapsed, onCollapse }: {
  view: ViewId;
  onNavigate: (view: ViewId) => void;
  collapsed: boolean;
  onCollapse: () => void;
}) {
  return (
    <aside className={classNames('flyway-sidebar', collapsed && 'is-collapsed')}>
      <div className="sidebar-brand">
        <BrandMark />
        <span className="brand-copy"><strong>Flyway</strong><small>Network intelligence</small></span>
      </div>
      <div className="workspace-switcher">
        <span className="workspace-avatar">US</span>
        <span className="workspace-copy"><strong>U.S. public footprint</strong><small>Public map + operating model</small></span>
        <ChevronDown size={15} aria-hidden="true" />
      </div>
      <nav aria-label="Primary" className="flyway-nav">
        <span className="nav-section-label">Workspace</span>
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              type="button"
              key={item.id}
              className={classNames('flyway-nav-button', view === item.id && 'is-active')}
              aria-current={view === item.id ? 'page' : undefined}
              aria-label={item.label}
              title={item.label}
              onClick={() => onNavigate(item.id)}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="sidebar-trust">
        <div className="trust-head"><CheckCircle2 size={16} aria-hidden="true" /><strong>Evidence-aware</strong></div>
        <p>Public facts and sample estimates stay visibly separate.</p>
      </div>
      <button type="button" className="collapse-button" onClick={onCollapse} aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
        <PanelLeftClose size={17} aria-hidden="true" />
        <span>Collapse</span>
      </button>
    </aside>
  );
}

function TopBar({
  theme,
  onTheme,
  onCopilot,
  onMobileMenu,
  onContext,
  onFreshness,
  mobileNavOpen,
  activeScenario,
  mode,
  snapshotDate,
}: {
  theme: Theme;
  onTheme: () => void;
  onCopilot: () => void;
  onMobileMenu: () => void;
  onContext: () => void;
  onFreshness: () => void;
  mobileNavOpen: boolean;
  activeScenario?: ScenarioDefinition;
  mode: WorkspaceMode;
  snapshotDate?: string;
}) {
  return (
    <header className="flyway-topbar">
      <button type="button" className="mobile-menu-button" onClick={onMobileMenu} aria-label={mobileNavOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={mobileNavOpen}><Menu size={20} /></button>
      <div className="scenario-context">
        <span className="context-label">{mode === 'public' ? 'Evidence context' : 'Model context'}</span>
        <button type="button" className="context-button" onClick={onContext} aria-label={activeScenario ? `Open results for ${activeScenario.name}` : 'Open model baseline'}>
          <strong>{mode === 'public' ? 'U.S. public network' : activeScenario?.name || 'Sample operating model'}</strong>
          <span className={classNames('context-status', mode === 'compare' && 'is-results')}>{mode === 'public' ? 'Public snapshot' : mode === 'compare' ? 'Frozen results' : 'Editable baseline'}</span>
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </div>
      <div className="topbar-actions">
        <button type="button" className="freshness-button" onClick={onFreshness}><Database size={15} />Evidence {snapshotDate || 'loading'}</button>
        <button type="button" className="icon-button" onClick={onTheme} aria-label={`Use ${theme === 'dark' ? 'light' : 'dark'} mode`}>
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <button type="button" className="copilot-button" onClick={onCopilot}><Sparkles size={17} />Ask Flyway</button>
        <span className="user-avatar" aria-label="Local workspace owner" title="Local workspace owner">L</span>
      </div>
    </header>
  );
}



function PublicFacilityDrawer({ facility, registry, onClose, open }: { facility: PublicDistributionFacility; registry: PublicDistributionFacilityRegistry; onClose: () => void; open: boolean }) {
  const evidence = facility.evidenceIds.map((id) => registry.evidence.find((item) => item.id === id)).filter(Boolean) as PublicDistributionFacilityRegistry['evidence'];
  const precision = facility.mapPrecision === 'exact-public-address' ? 'Exact official address and coordinate' : facility.mapPrecision === 'city-level-public-evidence' ? 'City-level placement; address conflict under review' : 'Verified identity; not plotted';
  return (
    <aside className="detail-drawer public-facility-drawer t-panel-slide" data-open={open} role="dialog" aria-modal="true" aria-label={`${facility.name} public evidence`}>
      <div className="drawer-header"><div><span className="eyebrow">Public distribution facility evidence</span><h2>{facility.name}</h2><p>{facility.city}, {facility.state} · verified {facility.lastVerifiedAt}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close public facility evidence"><X size={19} /></button></div>
      <div className="drawer-body">
        <section className="facility-evidence-summary"><div><span className={classNames('facility-precision-symbol', facility.mapPrecision === 'exact-public-address' ? 'is-exact' : 'is-city')} /><span><strong>{precision}</strong><small>{facility.address || `${facility.city}, ${facility.state}`}</small></span></div><EvidenceBadge classification="verified-public" /></section>
        <section className="drawer-section"><span className="section-label">Evidence posture</span><dl className="fact-list"><div><dt>Lifecycle evidence</dt><dd>{facility.lifecycle.split('-').join(' ')}</dd></div><div><dt>Current job records</dt><dd>{facility.directEvidenceJobIds.length}</dd></div><div><dt>Coordinate source</dt><dd>{facility.coordinateSource.split('-').join(' ')}</dd></div></dl><p className="facility-lifecycle-copy">{facility.lifecycleSummary}</p>{facility.reviewNote && <div className="facility-review-note"><AlertTriangle size={16} /><span><strong>Review note</strong>{facility.reviewNote}</span></div>}</section>
        <section className="drawer-section"><span className="section-label">Official sources · {evidence.length}</span><div className="facility-source-list">{evidence.map((item) => <a key={item.id} href={item.sourceUrl} target="_blank" rel="noreferrer"><Database size={16} /><span><strong>{item.title}</strong><small>{item.sourceKind.split('-').join(' ')} · checked {item.verifiedAt}</small><em>{item.supportSummary}</em></span><ArrowRight size={15} /></a>)}</div></section>
        <section className="facility-boundary-note"><HelpCircle size={17} /><span><strong>Public evidence boundary</strong>No public capacity, inventory, routes, restaurant assignments, suppliers, service territory, or present operating status is asserted by this registry.</span></section>
      </div>
    </aside>
  );
}

function LocationDrawer({ location, lanes, locations, onClose, onCreateScenario, onUpdate, onAddLane, open }: {
  location: TwinLocation;
  lanes: Lane[];
  locations: TwinLocation[];
  onClose: () => void;
  onCreateScenario: () => void;
  onUpdate: (id: string, changes: Partial<TwinLocation>) => void;
  onAddLane: (lane: Lane) => void;
  open: boolean;
}) {
  const [tab, setTab] = useState<'overview' | 'products' | 'connections' | 'evidence'>('overview');
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(location);
  const [connectionId, setConnectionId] = useState('');
  const Icon = typeMeta[location.type].icon;
  const connectedLanes = lanes.filter((lane) => lane.originId === location.id || lane.destinationId === location.id);
  const byId = new Map(locations.map((item) => [item.id, item]));
  const connectedIds = new Set(connectedLanes.flatMap((lane) => [lane.originId, lane.destinationId]));
  const candidates = locations.filter((item) => item.id !== location.id && !connectedIds.has(item.id) && (
    location.type === 'restaurant' ? item.type === 'dc' : location.type === 'supplier' ? item.type === 'dc' : item.type !== 'dc'
  ));
  const recommended = [...candidates].sort((a, b) => {
    const distance = (item: TwinLocation) => (item.latitude - location.latitude) ** 2 + (item.longitude - location.longitude) ** 2;
    return distance(a) - distance(b);
  })[0];
  const addConnection = (target: TwinLocation, status: Lane['status']) => {
    const origin = location.type === 'restaurant' ? target : location;
    const destination = location.type === 'restaurant' ? location : target;
    const miles = Math.max(10, Math.round(Math.hypot(location.latitude - target.latitude, location.longitude - target.longitude) * 60));
    onAddLane({ id: `lane-${Date.now()}`, originId: origin.id, destinationId: destination.id, products: productCategories.filter((product) => origin.products.includes(product) && destination.products.includes(product)), miles, transitHours: Math.max(1, Math.round(miles / 52)), deliveriesPerWeek: 3, costPerMile: 2.45, status, evidence: syntheticEvidence });
    if (location.type === 'restaurant' && target.type === 'dc') onUpdate(location.id, { assignedDcId: target.id });
    if (location.type === 'dc' && target.type === 'restaurant') onUpdate(target.id, { assignedDcId: location.id });
    setConnectionId('');
  };
  return (
    <aside className="detail-drawer t-panel-slide" data-open={open} role="dialog" aria-modal="true" aria-label={`${location.name} details`}>
      <div className="drawer-header">
        <span className={classNames('drawer-type-icon', `is-${location.type}`)}><Icon size={20} /></span>
        <div><span className="eyebrow">{typeMeta[location.type].label}</span><h2>{location.name}</h2><p>{location.city}, {location.state}</p></div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close location details"><X size={19} /></button>
      </div>
      <div className="drawer-status-row"><span className={classNames('status-chip', `is-${location.status}`)}>{location.status}</span><EvidenceBadge classification={location.evidence.classification} /></div>
      <div className="drawer-tabs" role="tablist">
        {(['overview', 'products', 'connections', 'evidence'] as const).map((item) => <button type="button" role="tab" aria-selected={tab === item} key={item} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      <div className="drawer-body">
        {tab === 'overview' && editing && (
          <section className="drawer-section edit-location-form"><span className="section-label">Edit operating record</span><div className="form-grid">
            <label className="field field-full"><span>Location name</span><input aria-label="Edit location name" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label className="field field-full"><span>Address</span><input aria-label="Edit address" value={draft.address} onChange={(event) => setDraft({ ...draft, address: event.target.value })} /></label>
            <label className="field"><span>City</span><input aria-label="Edit city" value={draft.city} onChange={(event) => setDraft({ ...draft, city: event.target.value })} /></label>
            <label className="field"><span>State</span><input aria-label="Edit state" maxLength={2} value={draft.state} onChange={(event) => setDraft({ ...draft, state: event.target.value.toUpperCase() })} /></label>
            <label className="field"><span>Status</span><select aria-label="Edit status" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LocationStatus })}><option value="active">Active</option><option value="planned">Planned</option><option value="unavailable">Unavailable</option><option value="closed">Closed</option></select></label>
            <label className="field"><span>{location.type === 'restaurant' ? 'Weekly demand' : 'Weekly capacity'}</span><input aria-label="Edit volume" type="number" min="0" value={location.type === 'restaurant' ? draft.weeklyDemand || 0 : draft.weeklyCapacity || 0} onChange={(event) => setDraft({ ...draft, ...(location.type === 'restaurant' ? { weeklyDemand: Number(event.target.value) } : { weeklyCapacity: Number(event.target.value) }) })} /></label>
            <label className="field"><span>Inventory days</span><input aria-label="Edit inventory days" type="number" min="0" step="0.1" value={draft.inventoryDays || 0} onChange={(event) => setDraft({ ...draft, inventoryDays: Number(event.target.value) })} /></label>
            <label className="field"><span>Service radius</span><input aria-label="Edit service radius" type="number" min="0" value={draft.serviceRadiusMiles || 0} onChange={(event) => setDraft({ ...draft, serviceRadiusMiles: Number(event.target.value) })} /></label>
            <label className="field field-full"><span>Operating schedule</span><input aria-label="Edit operating schedule" value={draft.operatingSchedule} onChange={(event) => setDraft({ ...draft, operatingSchedule: event.target.value })} /></label>
          </div><div className="inline-actions"><button type="button" className="button secondary" onClick={() => { setDraft(location); setEditing(false); }}>Cancel</button><button type="button" className="button primary" onClick={() => { onUpdate(location.id, draft); setEditing(false); }}>Save changes</button></div><p className="field-help">Edited operating values remain model inputs; the evidence record is preserved separately.</p></section>
        )}
        {tab === 'overview' && !editing && (
          <>
            <section className="drawer-section"><span className="section-label">Location</span><p className="address-line"><MapPin size={16} />{location.address}</p><div className="coordinate-row"><code>{location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}</code><span>America/{location.state === 'GA' || location.state === 'NC' ? 'New_York' : 'Chicago'}</span></div></section>
            <section className="drawer-section"><span className="section-label">Operating model</span><dl className="fact-list">
              <div><dt>Schedule</dt><dd>{location.operatingSchedule}</dd></div>
              {location.weeklyDemand != null && <div><dt>Weekly demand</dt><dd>{location.weeklyDemand.toLocaleString()} cases <EvidenceBadge classification="synthetic" /></dd></div>}
              {location.weeklyCapacity != null && <div><dt>Weekly capacity</dt><dd>{location.weeklyCapacity.toLocaleString()} cases <EvidenceBadge classification="synthetic" /></dd></div>}
              {location.inventoryDays != null && <div><dt>Inventory</dt><dd>{location.inventoryDays.toFixed(1)} days <EvidenceBadge classification="synthetic" /></dd></div>}
              {location.assignedDcId && <div><dt>Primary DC</dt><dd>{byId.get(location.assignedDcId)?.name || 'Unassigned'}</dd></div>}
            </dl></section>
            <section className="drawer-section"><span className="section-label">Model posture</span><div className="posture-note"><CheckCircle2 size={18} /><span><strong>No active exception</strong>Location is available in the baseline model.</span></div></section>
          </>
        )}
        {tab === 'products' && (
          <section className="drawer-section"><span className="section-label">Product capabilities</span><div className="product-list">{location.products.map((product) => <div key={product}><Box size={16} /><span><strong>{product}</strong><small>{location.type === 'restaurant' ? 'Modeled demand' : 'Available capacity'}</small></span><EvidenceBadge classification="synthetic" /></div>)}</div></section>
        )}
        {tab === 'connections' && (
          <section className="drawer-section"><span className="section-label">Active lanes · {connectedLanes.length}</span><div className="connection-builder"><select aria-label="Connection location" value={connectionId} onChange={(event) => setConnectionId(event.target.value)}><option value="">Choose a compatible location…</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="button secondary" disabled={!connectionId} onClick={() => { const target = byId.get(connectionId); if (target) addConnection(target, 'active'); }}><Plus size={15} />Add lane</button></div>{recommended && <button type="button" className="connection-recommendation" onClick={() => addConnection(recommended, 'recommended')}><Sparkles size={16} /><span><strong>Recommended connection</strong><small>{recommended.name} · nearest compatible unlinked node</small></span><Plus size={16} /></button>}<div className="connection-list">{connectedLanes.map((lane) => {
            const other = byId.get(lane.originId === location.id ? lane.destinationId : lane.originId);
            return <div key={lane.id}><Truck size={17} /><span><strong>{other?.name}</strong><small>{lane.miles} mi · {lane.deliveriesPerWeek} deliveries/week · {lane.transitHours} hr</small></span><ChevronRight size={16} /></div>;
          })}</div></section>
        )}
        {tab === 'evidence' && (
          <section className="drawer-section evidence-panel"><div className="evidence-panel-head"><EvidenceBadge classification={location.evidence.classification} /><strong>{location.evidence.confidence == null ? 'User asserted' : `${Math.round(location.evidence.confidence * 100)}% confidence`}</strong></div><h3>{location.evidence.sourceTitle}</h3><p>{location.evidence.note || 'This record was entered directly in the Flyway workspace.'}</p><dl className="fact-list"><div><dt>Publisher</dt><dd>{location.evidence.publisher}</dd></div><div><dt>Last verified</dt><dd>{location.evidence.verifiedAt}</dd></div></dl>{location.evidence.sourceUrl && <a href={location.evidence.sourceUrl} target="_blank" rel="noreferrer">Open public source <ArrowRight size={14} /></a>}</section>
        )}
      </div>
      <div className="drawer-footer">{tab === 'overview' && !editing && <button type="button" className="button secondary" onClick={() => { setDraft(location); setEditing(true); }}>Edit location</button>}<button type="button" className="button primary" onClick={onCreateScenario}>Create scenario</button></div>
    </aside>
  );
}



type DraftSaveResult = { ok: boolean; revision: number };
type ScenarioCloseRequest = (afterClose?: () => void) => Promise<boolean>;

function ScenarioDrawer({ locations, initialTargetId, initialScenario, initiallySaved, storageRevision, registerClose, onClose, onRun, onDraftChange, onDiscardDraft, open, preferences, baselineRevision, running, runError }: {
  locations: TwinLocation[];
  initialTargetId?: string;
  initialScenario?: ScenarioDefinition;
  initiallySaved: boolean;
  storageRevision: number;
  registerClose: (request: ScenarioCloseRequest | null) => void;
  onClose: () => void;
  onRun: (scenario: ScenarioDefinition, draftStorageRevision: number) => Promise<boolean>;
  onDraftChange:(scenario:ScenarioDefinition, expectedRevision:number)=>Promise<DraftSaveResult>;
  onDiscardDraft:(expectedRevision:number)=>Promise<DraftSaveResult>;
  open: boolean;
  preferences: WorkspacePreferences;
  baselineRevision: string;
  running: boolean;
  runError?: string;
}) {
  const draft=initialScenario;
  const [type, setType] = useState<ScenarioType>(draft?.type || 'dc-outage');
  const [targetId, setTargetId] = useState(draft?.targetId || initialTargetId || locations.find(l=>l.type==='dc')?.id || '');
  const [name, setName] = useState(draft?.name || 'Distribution resilience test');
  const [magnitude, setMagnitude] = useState(draft?.magnitude ?? 100);
  const [grain, setGrain] = useState<'daily' | 'weekly'>(draft?.grain || preferences.grain);
  const [horizon, setHorizon] = useState(draft?.horizon || (preferences.grain === 'daily' ? 14 : 4));
  const [startDate, setStartDate] = useState(draft?.startDate || toEngineDefaults(preferences).startDate);
  const [draftRevision,setDraftRevision]=useState(draft?.baselineRevision||baselineRevision);
  const [draftStatus,setDraftStatus]=useState(initialScenario?'Recovered or frozen scenario draft':'');
  const [draftActionPending,setDraftActionPending]=useState(false);
  const [draftDirty,setDraftDirty]=useState(!initiallySaved);
  const [draftId]=useState(draft?.id||'working-scenario');
  const [createdAt]=useState(draft?.createdAt||new Date().toISOString());
  const explicitProposal=initialScenario?.changes!==undefined;
  const staleDraft=draftRevision!==baselineRevision;
  const editingDisabled=draftActionPending||running;
  const currentScenario=useMemo<ScenarioDefinition>(()=>({id:draftId,name,description:draft?.description||'Unsaved scenario draft',type,targetId,magnitude,grain,horizon,startDate,createdAt,baselineRevision:draftRevision,...(explicitProposal?{changes:initialScenario!.changes}:{})}),[createdAt,draft?.description,draftId,draftRevision,explicitProposal,grain,horizon,initialScenario,name,startDate,targetId,type,magnitude]);
  const latestScenarioRef=useRef(currentScenario);latestScenarioRef.current=currentScenario;
  const storageRevisionRef=useRef(storageRevision);
  const lastSavedSignatureRef=useRef(initiallySaved?JSON.stringify(currentScenario):'');
  const saveQueueRef=useRef(Promise.resolve<DraftSaveResult>({ok:true,revision:storageRevision}));
  const autosaveTimerRef=useRef<number>();
  const retiredRef=useRef(false);
  const onDraftChangeRef=useRef(onDraftChange);onDraftChangeRef.current=onDraftChange;
  const onCloseRef=useRef(onClose);onCloseRef.current=onClose;
  const cancelAutosave=()=>{window.clearTimeout(autosaveTimerRef.current);autosaveTimerRef.current=undefined;};
  const persistDraft=useCallback((scenario:ScenarioDefinition)=>{
    const signature=JSON.stringify(scenario);
    if(signature===lastSavedSignatureRef.current)return Promise.resolve<DraftSaveResult>({ok:true,revision:storageRevisionRef.current});
    setDraftStatus('Saving complete recovery draft…');
    const operation=saveQueueRef.current.then(async()=>{
      if(retiredRef.current)return {ok:false,revision:storageRevisionRef.current};
      const result=await onDraftChangeRef.current(scenario,storageRevisionRef.current);
      if(result.ok){storageRevisionRef.current=result.revision;lastSavedSignatureRef.current=signature;if(JSON.stringify(latestScenarioRef.current)===signature)setDraftDirty(false);setDraftStatus('Complete draft saved in this browser');}
      else setDraftStatus('Draft not saved. Another tab or storage change won the revision; your edits remain open.');
      return result;
    });
    saveQueueRef.current=operation.catch(()=>({ok:false,revision:storageRevisionRef.current}));
    return operation.catch(()=>{setDraftStatus('Draft not saved. Your edits remain open; retry after restoring storage.');return {ok:false,revision:storageRevisionRef.current};});
  },[]);
  useEffect(()=>{cancelAutosave();if(JSON.stringify(currentScenario)===lastSavedSignatureRef.current){setDraftDirty(false);return;}setDraftDirty(true);autosaveTimerRef.current=window.setTimeout(()=>{void persistDraft(latestScenarioRef.current);},200);return cancelAutosave;},[currentScenario,persistDraft]);
  useEffect(()=>{if(!draftDirty&&!draftActionPending)return;const protect=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',protect);return()=>window.removeEventListener('beforeunload',protect);},[draftActionPending,draftDirty]);
  const requestClose=useCallback<ScenarioCloseRequest>(async(afterClose)=>{
    if(draftActionPending||running)return false;
    cancelAutosave();setDraftActionPending(true);
    const saved=await persistDraft(latestScenarioRef.current);
    if(!saved.ok){setDraftActionPending(false);return false;}
    retiredRef.current=true;onCloseRef.current();afterClose?.();return true;
  },[draftActionPending,persistDraft,running]);
  useEffect(()=>{registerClose(requestClose);return()=>registerClose(null);},[registerClose,requestClose]);
  const eligible = locations.filter((location) => {
    if (type === 'dc-outage' || type === 'capacity-constraint') return location.type === 'dc';
    if (type === 'supplier-failure') return location.type === 'supplier';
    if (type === 'demand-surge') return location.type === 'restaurant';
    if (type === 'price-change' || type === 'severe-weather') return true;
    return true;
  });
  useEffect(() => {
    if (!eligible.some((location) => location.id === targetId)) setTargetId(eligible[0]?.id || 'network');
  }, [type]);
  const submit = async () => {
    cancelAutosave();setDraftActionPending(true);
    const scenario={...latestScenarioRef.current,id:crypto.randomUUID(),name:name.trim()||'Untitled scenario',description:scenarioOptions.find((item)=>item.id===type)?.hint||''};
    const saved=await persistDraft(scenario);
    if(!saved.ok){setDraftActionPending(false);return;}
    retiredRef.current=true;
    const completed=await onRun(scenario,saved.revision);
    if(!completed){retiredRef.current=false;setDraftActionPending(false);}
  };
  const discard=async()=>{
    cancelAutosave();setDraftActionPending(true);retiredRef.current=true;await saveQueueRef.current;
    const discarded=await onDiscardDraft(storageRevisionRef.current);
    if(!discarded.ok){retiredRef.current=false;setDraftActionPending(false);setDraftStatus('Draft was not discarded because another tab changed it. Your edits remain open.');}
  };
  return (
    <aside className="detail-drawer scenario-drawer t-panel-slide" data-open={open} role="dialog" aria-modal="true" aria-label="Create scenario">
      <div className="drawer-header"><div><span className="eyebrow">Scenario builder</span><h2>Stress-test the network</h2><p>Changes apply to a frozen baseline snapshot.</p></div><button type="button" className="icon-button" disabled={draftActionPending||running} onClick={()=>void requestClose()} aria-label="Close scenario builder"><X size={19} /></button></div>
      <div className="drawer-body">
        <p role="status">{draftStatus}</p><button type="button" className="text-action" disabled={running||draftActionPending} onClick={()=>void discard()}>Discard this draft and start a new scenario</button>
        {staleDraft&&<div className="form-error" role="alert"><span>This draft was created against {draftRevision}. The current model has changed.</span><button type="button" className="button secondary" disabled={editingDisabled} onClick={()=>setDraftRevision(baselineRevision)}>Use current baseline</button></div>}
        {runError && <div className="form-error" role="alert"><AlertTriangle size={17}/>{runError}</div>}
        {initialScenario?.changes?.length ? <section className="proposal-preview"><h3>Proposed changes in this draft</h3><ul>{initialScenario.changes.map(change=><li key={change.id}>{change.kind.split('-').join(' ')} · day {change.effectiveDay+1}{change.durationDays?` · ${change.durationDays} days`:''}{change.note?` — ${change.note}`:''}</li>)}</ul><p>The baseline is unchanged. Running this draft evaluates these exact changes.</p></section> : null}
        <label className="field"><span>Scenario name</span><input disabled={editingDisabled} value={name} onChange={(event) => setName(event.target.value)} /></label>
        <fieldset className="scenario-type-grid" disabled={explicitProposal||editingDisabled}><legend>Change type</legend>{scenarioOptions.map((option) => { const Icon = option.icon; return <label key={option.id} className={classNames(type === option.id && 'is-selected')}><input type="radio" name="scenario-type" value={option.id} checked={type === option.id} onChange={() => { setType(option.id); setName(option.label); setMagnitude(option.id.includes('outage') || option.id.includes('failure') ? 100 : 25); }} /><Icon size={18} /><span><strong>{option.label}</strong><small>{option.hint}</small></span></label>; })}</fieldset>
        <label className="field"><span>Target location</span><select disabled={explicitProposal||editingDisabled} value={targetId} onChange={(event) => setTargetId(event.target.value)}>{eligible.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>
        {!['dc-outage', 'supplier-failure', 'location-closure'].includes(type) && <label className="field range-field"><span>Magnitude <strong>{magnitude}%</strong></span><input disabled={explicitProposal||editingDisabled} type="range" min="5" max="100" step="5" value={magnitude} onChange={(event) => setMagnitude(Number(event.target.value))} /></label>}
        <div className="form-grid"><label className="field"><span>Time grain</span><select disabled={editingDisabled} value={grain} onChange={(event) => { const next=event.target.value as 'daily'|'weekly'; setGrain(next);setHorizon(next==='daily'?14:4); }}><option value="daily">Daily</option><option value="weekly">Weekly</option></select></label><label className="field"><span>Horizon</span><input disabled={editingDisabled} type="number" min="1" max={grain==='daily'?365:52} value={horizon} onChange={event=>setHorizon(Number(event.target.value))}/></label><label className="field field-full"><span>Start date</span><input disabled={editingDisabled} type="date" value={startDate} onChange={event=>setStartDate(event.target.value)}/></label></div>
        <section className="validation-panel"><div><Database size={17}/><span><strong>Validation runs before calculation</strong><small>Targets, topology, units, calendars, and constraints are checked by the engine—not pre-approved by this form.</small></span></div><div className="is-warning"><AlertTriangle size={17}/><span><strong>Modeled assumptions, not company actuals</strong><small>Service target {preferences.serviceTarget}%. The full effective input is frozen with the result.</small></span></div></section>
      </div>
      <div className="drawer-footer"><button type="button" className="button secondary" disabled={running||draftActionPending} onClick={()=>void requestClose()}>{draftActionPending?'Saving draft…':'Close draft'}</button><button type="button" className="button primary" disabled={running||draftActionPending||staleDraft||!targetId||!name.trim()||!Number.isInteger(horizon)||horizon<1||horizon>(grain==='daily'?365:52)||!startDate} onClick={()=>void submit()}><Activity size={17} />{running?'Evaluating…':draftActionPending?'Saving draft…':'Run scenario'}</button></div>
    </aside>
  );
}

function ResultsDrawer({ result, scenario, locations, onClose, onSave, onRerun, onApply, saved, saving, open }: {
  result: RunResultView;
  scenario: ScenarioDefinition;
  locations: TwinLocation[];
  onClose: () => void;
  onSave: () => void;
  onRerun: () => void;
  onApply: (recommendation: Recommendation) => void;
  saved: boolean;
  saving?: boolean;
  open: boolean;
}) {
  const byId = new Map(locations.map((location) => [location.id, location]));
  const impacts=useRunPage(result.reader,'impacts'),recommendations=useRunPage(result.reader,'recommendations');
  const delta = (key: keyof Pick<TwinMetrics, 'serviceLevel' | 'stockoutUnits' | 'totalLandedCost' | 'maxUtilization'>) => Number(result.scenario[key]) - Number(result.baseline[key]);
  return (
    <aside className="detail-drawer results-drawer t-panel-slide" data-open={open} role="dialog" aria-modal="true" aria-label="Scenario results">
      <div className="drawer-header"><div><span className="eyebrow">Completed · {result.runId}</span><h2>{scenario.name}</h2><p>{scenario.grain} model · {scenario.horizon} periods · {result.engineVersion}</p></div><button type="button" className="icon-button" onClick={onClose} aria-label="Close scenario results"><X size={19} /></button></div>
      <div className="drawer-body">
        <section className="result-narrative"><Sparkles size={19} /><p>{result.narrative}</p></section>
        <div className="comparison-grid">
          <div><span>Service level</span><strong>{result.scenario.serviceLevel.toFixed(1)}%</strong><small className={delta('serviceLevel') < 0 ? 'negative' : 'positive'}>{delta('serviceLevel') >= 0 ? '+' : ''}{delta('serviceLevel').toFixed(1)} pts</small></div>
          <div><span>Stockout units</span><strong>{result.scenario.stockoutUnits.toLocaleString()}</strong><small className={delta('stockoutUnits') > 0 ? 'negative' : 'positive'}>+{delta('stockoutUnits').toLocaleString()}</small></div>
          <div><span>Landed cost</span><strong>{formatMoney(result.scenario.totalLandedCost)}</strong><small className={delta('totalLandedCost') > 0 ? 'negative' : 'positive'}>+{formatMoney(delta('totalLandedCost'))}</small></div>
          <div><span>Peak utilization</span><strong>{result.scenario.maxUtilization.toFixed(1)}%</strong><small className={delta('maxUtilization') > 0 ? 'negative' : 'positive'}>{delta('maxUtilization') >= 0 ? '+' : ''}{delta('maxUtilization').toFixed(1)} pts</small></div>
        </div>
        <section className="drawer-section"><div className="section-heading"><h3>{result.impactCount} modeled impacts</h3></div>
          {impacts.loading&&<p role="status">Loading saved impact records…</p>}{impacts.error&&<p role="alert">{impacts.error} <button type="button" onClick={impacts.retry}>Retry impacts</button></p>}
          <div className="impact-list">{impacts.page?.items.map(impact=><div key={impact.locationId}><span className="impact-dot"/><span><strong>{byId.get(impact.locationId)?.name||impact.locationId}</strong><small>{impact.cause}</small></span><b>{impact.stockoutUnits.toLocaleString()} units</b></div>)}{impacts.page?.total===0&&<p className="empty-copy">No restaurant-period stockouts in this scenario.</p>}</div>
          {result.impactCount>0&&<RunPageControls page={impacts.pageNumber} total={impacts.page?.total} hasPrevious={impacts.hasPrevious} hasNext={!!impacts.page?.nextCursor} loading={impacts.loading} onPrevious={impacts.previous} onNext={impacts.next}/>}
        </section>
        <section className="drawer-section"><div className="section-heading"><h3>Explainable recovery actions</h3></div>
          {recommendations.loading&&<p role="status">Loading evaluated responses…</p>}{recommendations.error&&<p role="alert">{recommendations.error} <button type="button" onClick={recommendations.retry}>Retry responses</button></p>}
          {recommendations.page?.total===0&&<p>No feasible evaluated improvement was found in this run.</p>}
          <div className="recommendation-list">{recommendations.page?.items.map(recommendation=><article key={recommendation.id}><div><h4>{recommendation.title}</h4><p>{recommendation.action}</p><small>{recommendation.rationale}</small><div className="recommendation-impact"><span>{recommendation.serviceDelta>=0?'+':''}{recommendation.serviceDelta.toFixed(1)} pts service</span><span>{formatMoney(recommendation.costDelta)}</span><span>{recommendation.confidence} confidence</span></div><button type="button" onClick={()=>onApply(recommendation)}>Model this response <ArrowRight size={14}/></button></div></article>)}</div>
          {result.recommendationCount>0&&<RunPageControls page={recommendations.pageNumber} total={recommendations.page?.total} hasPrevious={recommendations.hasPrevious} hasNext={!!recommendations.page?.nextCursor} loading={recommendations.loading} onPrevious={recommendations.previous} onNext={recommendations.next}/>}
        </section>
        <section className="run-lineage"><span><strong>Frozen input</strong>{result.inputHash}</span><span><strong>Baseline</strong>{scenario.baselineRevision}</span><span><strong>Completed</strong>{new Date(result.completedAt).toLocaleString()}</span></section>
        <RunAuditDetails result={result}/>
      </div>
      <div className="drawer-footer"><button type="button" className="button secondary" onClick={onRerun}><RotateCcw size={16} />Rerun</button><button type="button" className="button primary" onClick={onSave} disabled={saved||saving}>{saving?'Saving…':saved ? <><Check size={17} />Saved</> : 'Save scenario'}</button></div>
    </aside>
  );
}



function LocationsPage({ locations, onSelect, onAdd }: { locations: TwinLocation[]; onSelect: (id: string) => void; onAdd: () => void }) {
  const [query, setQuery] = useState('');
  const [type, setType] = useState<LocationType | 'all'>('all');
  const filtered = locations.filter((location) => (type === 'all' || location.type === type) && `${location.name} ${location.city} ${location.state}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <main id="main-content" className="page-view" data-testid="locations-page">
      <div className="page-header"><div><span className="eyebrow">Operational model registry</span><h1>Modeled locations</h1><p>Manage the editable nodes used in scenarios. The national public restaurant footprint remains a separate map layer.</p></div><button type="button" className="button primary" onClick={onAdd}><Plus size={17} />New modeled location</button></div>
      <div className="registry-summary">{(['restaurant', 'dc', 'supplier'] as LocationType[]).map((item) => { const Icon = typeMeta[item].icon; const count = locations.filter((location) => location.type === item).length; return <button type="button" key={item} className={classNames(type === item && 'is-active')} onClick={() => setType(type === item ? 'all' : item)}><Icon size={19} /><span><strong>{count}</strong><small>{typeMeta[item].label}{count === 1 ? '' : 's'}</small></span></button>; })}</div>
      <div className="table-toolbar"><label><Search size={17} /><input aria-label="Search locations" placeholder="Search locations…" value={query} onChange={(event) => setQuery(event.target.value)} /></label><span className="table-result-count" aria-live="polite">{filtered.length} of {locations.length} modeled locations</span></div>
      <div className="registry-table-wrap"><table className="registry-table"><thead><tr><th>Location</th><th>Type</th><th>Status</th><th>Demand / capacity</th><th>Assignment</th><th>Evidence</th><th>Last verified</th></tr></thead><tbody>{filtered.map((location) => <tr key={location.id}><td><button type="button" className="location-name-button" onClick={() => onSelect(location.id)}><strong>{location.name}</strong><small>{location.city}, {location.state}</small></button></td><td><span className={classNames('table-type', `is-${location.type}`)}>{React.createElement(typeMeta[location.type].icon, { size: 15 })}{typeMeta[location.type].label}</span></td><td><span className={classNames('status-chip', `is-${location.status}`)}>{location.status}</span></td><td><strong>{(location.weeklyDemand || location.weeklyCapacity || 0).toLocaleString()}</strong><small>{location.weeklyDemand ? 'cases / week demand' : 'cases / week capacity'}</small></td><td>{location.assignedDcId ? locations.find((item) => item.id === location.assignedDcId)?.city : '—'}</td><td><EvidenceBadge classification={location.evidence.classification} /></td><td>{location.evidence.verifiedAt}</td></tr>)}</tbody></table>{!filtered.length && <div className="empty-state"><Search size={24} /><h3>No locations match</h3><p>Clear the search or type filter to see the full network.</p><button type="button" className="button secondary" onClick={() => { setQuery(''); setType('all'); }}>Clear filters</button></div>}</div>
    </main>
  );
}

function ScenariosPage({ scenarios, onOpen, onCreate }: { scenarios: StoredScenario[]; onOpen: (scenario: StoredScenario) => void; onCreate: () => void }) {
  return (
    <main id="main-content" className="page-view" data-testid="scenarios-page">
      <div className="page-header"><div><span className="eyebrow">Decision workspace</span><h1>Scenarios</h1><p>Saved definitions, immutable inputs, and reproducible results.</p></div><button type="button" className="button primary" onClick={onCreate}><Plus size={17} />New scenario</button></div>
      <div className="scenario-summary"><MetricCard label="Saved scenarios" value={String(scenarios.length)} context="Single-user workspace" /><MetricCard label="Completed runs" value={String(scenarios.length)} context="Deterministic engine" /><MetricCard label="Baseline revision" value="Aug 20" context="baseline-2026-08-20" /></div>
      {scenarios.length ? <div className="scenario-list">{scenarios.map((scenario) => <button type="button" key={scenario.id} onClick={() => onOpen(scenario)}><span className="scenario-list-icon"><Activity size={19} /></span><span><strong>{scenario.name}</strong><small>{scenarioOptions.find((item) => item.id === scenario.type)?.label} · {scenario.grain} · {scenario.horizon} periods</small></span><span className="scenario-delta"><strong>{savedScenarioMetrics(scenario).serviceLevel.toFixed(1)}%</strong><small>{savedScenarioMetrics(scenario).stockoutUnits.toLocaleString()} stockout units</small></span><span className="status-chip is-active">Completed</span><ChevronRight size={18} /></button>)}</div> : <div className="large-empty-state"><span><Activity size={28} /></span><h2>No saved scenarios yet</h2><p>Create a deterministic scenario to compare service, stockouts, landed cost, and capacity utilization with baseline.</p><button type="button" className="button primary" onClick={onCreate}>Create first scenario</button></div>}
    </main>
  );
}

function SourcesPage({ publicFootprint, publicFacilities }: { publicFootprint?: PublicFootprintSnapshot; publicFacilities?: PublicDistributionFacilityRegistry }) {
  const [tab, setTab] = useState<'register' | 'assumptions' | 'conflicts' | 'history'>('register');
  const officialCount = publicFootprint?.metadata.officialRecordCount ?? 3458;
  const mappedCount = publicFootprint?.metadata.exactMappedCount ?? 0;
  const reviewCount = publicFootprint?.metadata.needsReviewCount ?? Math.max(0, officialCount - mappedCount);
  return (
    <main id="main-content" className="page-view" data-testid="sources-page">
      <div className="page-header"><div><span className="eyebrow">Trust & provenance</span><h1>Data & Sources</h1><p>Know what is verified, what is derived, and what remains a sample.</p></div><button type="button" className="button secondary" onClick={() => setTab('conflicts')}><RefreshCw size={17} />Review freshness</button></div>
      <div className="source-health-grid"><MetricCard label="Official records" value={officialCount.toLocaleString()} context="U.S. location pages" tone="positive" /><MetricCard label="Verified map points" value={mappedCount.toLocaleString()} context="Official page coordinates" tone="positive" /><MetricCard label="Needs review" value={reviewCount.toLocaleString()} context="Unplotted official records" tone={reviewCount ? 'warning' : 'positive'} /></div>
      <section className="coverage-methodology" aria-label="National footprint methodology"><div><span className="eyebrow">National footprint method</span><h2>Official evidence, conservative mapping</h2></div><p>The official public index contains {officialCount.toLocaleString()} U.S. location pages. Flyway plots {mappedCount.toLocaleString()} records only after the official page yields a matching structured address and a single valid coordinate from its own directions link. {reviewCount.toLocaleString()} records remain unplotted because they could not pass every validation rule.</p><span>Point-in-time snapshot · Aug 20, 2026 · Not an official operational master</span></section>
      {publicFacilities && <section className="coverage-methodology dc-registry-methodology" aria-label="Distribution center registry methodology"><div><span className="eyebrow">Distribution center registry</span><h2>{publicFacilities.facilityCount} directly named facilities</h2></div><p>Flyway systematically scanned all {publicFacilities.currentOfficialJobCount} current official Supply and Supply Services career records. It accepted only facilities directly named in an official job description or company announcement: {publicFacilities.exactAddressCount} plot at an exact official address and {publicFacilities.cityLevelCount} remain at city level while official address conflicts are reviewed.</p><span>{publicFacilities.evidenceCount} preserved evidence records · {publicFacilities.needsReview.length} review items · no inferred partners, territories, routes, capacity, inventory, or operating status</span><div className="dc-methodology-warning"><AlertTriangle size={17} /><p>A 2024 official article reported nine DCs expected by year-end; current official career evidence names {publicFacilities.facilityCount}. These are different point-in-time snapshots, so Flyway does not present either number as a reconciled current operating count.</p></div></section>}
      <div className="page-tabs" role="tablist" aria-label="Source views">{(['register', 'assumptions', 'conflicts', 'history'] as const).map((item) => <button type="button" role="tab" id={`source-tab-${item}`} aria-controls={`source-panel-${item}`} aria-selected={tab === item} key={item} onClick={() => setTab(item)}>{item === 'register' ? 'Source register' : item === 'conflicts' ? `Review queue (${reviewCount + (publicFacilities?.needsReview.length || 0)})` : item}</button>)}</div>
      {tab === 'register' && <div className="source-list" id="source-panel-register" role="tabpanel" aria-labelledby="source-tab-register">{sourceRegister.map((source) => <article key={source.id}><span className="source-icon"><Database size={19} /></span><div><span className="source-meta">{source.publisher} · {source.type}</span><h3>{source.title}</h3><p>{source.records} records · {source.cadence} · Verified {source.verifiedAt}</p></div><span className={classNames('status-chip', source.status === 'Current' ? 'is-active' : 'is-planned')}>{source.status}</span>{source.url ? <a href={source.url} target="_blank" rel="noreferrer" aria-label={`Open ${source.title}`}><ArrowRight size={17} /></a> : <span />}</article>)}</div>}
      {tab === 'assumptions' && <div className="assumption-table"><div className="assumption-row header"><span>Assumption</span><span>Value</span><span>Classification</span><span>Used by</span></div>{[['Restaurant weekly demand','2,540–3,470 cases','Forecast + simulation'],['DC weekly throughput','12,600–18,400 cases','Capacity + allocation'],['Linehaul cost','$2.74 / mile','Landed cost'],['Inventory policy','6.6–8.4 days','Replenishment'],['Supplier reliability','94–97%','Risk context']].map(([name,value,used]) => <div className="assumption-row" key={name}><span><strong>{name}</strong><small>Flyway sample generator v1</small></span><span>{value}</span><EvidenceBadge classification="synthetic" /><span>{used}</span></div>)}</div>}
      {tab === 'conflicts' && <div className="review-queue" id="source-panel-conflicts" role="tabpanel" aria-labelledby="source-tab-conflicts"><div className="review-queue-head"><span><AlertTriangle size={20} /></span><div><h2>{reviewCount + (publicFacilities?.needsReview.length || 0)} records need review</h2><p>Unresolved evidence stays unplotted or city-level; it is never promoted into the operating model automatically.</p></div></div><div className="review-queue-list"><article><strong>{reviewCount.toLocaleString()} official restaurant pages</strong><p>Coordinates could not pass every official-page validation rule. These records remain counted but unplotted.</p><span className="status-chip is-planned">Unplotted</span></article>{publicFacilities?.needsReview.map((item) => <article key={item.candidateKey}><strong>{item.candidateKey.split('-').join(' ')}</strong><p>{item.reason}</p><span className="status-chip is-planned">Review</span></article>)}</div></div>}
      {tab === 'history' && <div className="history-list"><div><CheckCircle2 size={18} /><span><strong>Official public-location snapshot built</strong><small>Aug 20, 2026 · {officialCount.toLocaleString()} official pages · {mappedCount.toLocaleString()} validated exact points</small></span></div><div><CheckCircle2 size={18} /><span><strong>Sample operating model initialized</strong><small>Aug 20, 2026 · 12 locations · 12 lanes · generator v1</small></span></div><div><CheckCircle2 size={18} /><span><strong>Public facility evidence reviewed</strong><small>Aug 20, 2026 · official company pages and job listings</small></span></div></div>}
    </main>
  );
}

type SettingsSection = 'appearance' | 'model' | 'cost' | 'routing' | 'copilot' | 'data' | 'about';

function SettingsPage({ theme, onTheme }: { theme: Theme; onTheme: () => void }) {
  const [section, setSection] = useState<SettingsSection>('appearance');
  const [preferences, setPreferences] = usePersistedState('flyway-preferences', { distance: 'miles', grain: 'weekly', serviceTarget: 98, dieselCost: 3.87, routingMode: 'road' });
  const [savedMessage, setSavedMessage] = useState('');
  const updatePreference = (changes: Partial<typeof preferences>) => {
    setPreferences((current) => ({ ...current, ...changes }));
    setSavedMessage('Saved to this workspace');
    window.setTimeout(() => setSavedMessage(''), 2400);
  };
  const sectionLabels: Array<[SettingsSection, string]> = [['appearance', 'Appearance'], ['model', 'Model defaults'], ['cost', 'Cost assumptions'], ['routing', 'Routing'], ['copilot', 'Copilot'], ['data', 'Data management'], ['about', 'About']];
  return (
    <main id="main-content" className="page-view settings-page" data-testid="settings-page">
      <div className="page-header"><div><span className="eyebrow">Workspace configuration</span><h1>Settings</h1><p>Model defaults, units, appearance, routing, and trust controls.</p></div><span className="settings-save-status" role="status" aria-live="polite">{savedMessage}</span></div>
      <div className="settings-layout">
        <nav aria-label="Settings sections">{sectionLabels.map(([id, label]) => <button type="button" key={id} className={section === id ? 'is-active' : ''} aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>)}</nav>
        <div className="settings-panel">
          {section === 'appearance' && <><span className="eyebrow">Appearance</span><h2>Choose how Flyway looks</h2><p>Both themes preserve the same evidence, status, and selection meanings.</p><div className="theme-options"><button type="button" aria-pressed={theme === 'light'} className={classNames(theme === 'light' && 'is-selected')} onClick={() => theme !== 'light' && onTheme()}><span className="theme-preview light"><i /><i /><i /></span><strong><Sun size={17} />Light</strong></button><button type="button" aria-pressed={theme === 'dark'} className={classNames(theme === 'dark' && 'is-selected')} onClick={() => theme !== 'dark' && onTheme()}><span className="theme-preview dark"><i /><i /><i /></span><strong><Moon size={17} />Dark</strong></button></div></>}
          {section === 'model' && <><span className="eyebrow">Model defaults</span><h2>Set new-scenario defaults</h2><p>These preferences shape new drafts. Saved scenario inputs remain immutable.</p><div className="settings-row"><label htmlFor="distance-unit"><strong>Distance</strong><small>Used on routes, service areas, and recommendations</small></label><select id="distance-unit" value={preferences.distance} onChange={(event) => updatePreference({ distance: event.target.value })}><option value="miles">Miles</option><option value="km">Kilometers</option></select></div><div className="settings-row"><label htmlFor="default-grain"><strong>Default time grain</strong><small>New scenarios may override this value</small></label><select id="default-grain" value={preferences.grain} onChange={(event) => updatePreference({ grain: event.target.value })}><option value="weekly">Weekly</option><option value="daily">Daily</option></select></div><div className="settings-row"><label htmlFor="service-target"><strong>Service target</strong><small>Used for executive posture and recommendation ranking</small></label><span className="input-with-suffix"><input id="service-target" type="number" min="0" max="100" step="0.1" value={preferences.serviceTarget} onChange={(event) => updatePreference({ serviceTarget: Number(event.target.value) })} /><span>%</span></span></div></>}
          {section === 'cost' && <><span className="eyebrow">Cost assumptions</span><h2>Maintain modeled cost inputs</h2><p>All values remain labeled as editable sample assumptions, never public company facts.</p><div className="settings-row"><label htmlFor="diesel-cost"><strong>Diesel benchmark</strong><small>Sample dollars per gallon used by new route drafts</small></label><span className="input-with-prefix"><span>$</span><input id="diesel-cost" type="number" min="0" step="0.01" value={preferences.dieselCost} onChange={(event) => updatePreference({ dieselCost: Number(event.target.value) })} /></span></div><section className="about-disclosure"><strong>Sample estimate</strong><p>Changing this preference does not rewrite frozen scenario runs.</p></section></>}
          {section === 'routing' && <><span className="eyebrow">Routing</span><h2>Choose the planning method</h2><p>The MVP uses deterministic estimated mileage; no live routing service is connected.</p><div className="settings-row"><label htmlFor="routing-mode"><strong>Routing basis</strong><small>Applied to newly created sample lanes</small></label><select id="routing-mode" value={preferences.routingMode} onChange={(event) => updatePreference({ routingMode: event.target.value })}><option value="road">Estimated road mileage</option><option value="straight">Straight-line estimate</option></select></div></>}
          {section === 'copilot' && <><span className="eyebrow">Copilot</span><h2>Grounding and authority</h2><p>Flyway answers from the active local model and source register. It cannot modify the network without an explicit user action.</p><section className="about-disclosure"><strong>Decision-support boundary</strong><p>Copilot language never replaces deterministic calculations or establishes unsupported public facts.</p></section></>}
          {section === 'data' && <><span className="eyebrow">Data management</span><h2>Local prototype storage</h2><p>Modeled locations, lanes, scenarios, theme, and preferences are stored only in this browser profile.</p><dl className="fact-list"><div><dt>Workspace isolation</dt><dd>Single browser profile</dd></div><div><dt>External sync</dt><dd>Not connected</dd></div><div><dt>Exports</dt><dd>Not included in MVP</dd></div></dl></>}
          {section === 'about' && <><span className="eyebrow">About</span><h2>Independent product disclosure</h2><section className="about-disclosure"><strong>Independent and unaffiliated</strong><p>Flyway is an independent educational simulation built from public sources and editable sample assumptions. It is not affiliated with or endorsed by Chick-fil-A, Inc.</p></section><dl className="fact-list"><div><dt>Model engine</dt><dd>flyway-deterministic-v1</dd></div><div><dt>Public snapshot</dt><dd>Aug 20, 2026</dd></div></dl></>}
        </div>
      </div>
    </main>
  );
}

function Onboarding({ onComplete, publicFootprint }: { onComplete: () => void; publicFootprint?: PublicFootprintSnapshot }) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [step, setStep] = useState(1);
  const officialCount = publicFootprint?.metadata.officialRecordCount ?? 3458;
  const mappedCount = publicFootprint?.metadata.exactMappedCount ?? 0;
  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-modal t-modal is-open">
        <div className="onboarding-aside"><BrandMark /><span className="onboarding-step">0{step} / 04</span><div><span className={step >= 1 ? 'is-active' : ''} /><span className={step >= 2 ? 'is-active' : ''} /><span className={step >= 3 ? 'is-active' : ''} /><span className={step >= 4 ? 'is-active' : ''} /></div><p>From public evidence to explainable network decisions.</p></div>
        <div className="onboarding-content">
          {step === 1 && <><span className="eyebrow">Welcome to Flyway</span><h1 id="onboarding-title">Explore a public-data supply network.</h1><p>Flyway is an independent educational and decision-support simulation. Public location evidence and editable sample operating assumptions are always distinguished.</p><div className="legal-notice"><AlertTriangle size={20} /><span><strong>Independent and unaffiliated</strong>This is not an official Chick-fil-A system. It does not contain private operating data, supplier relationships, or company forecasts.</span></div><label className="acknowledgement"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} />I understand this is an independent simulation built from public information.</label></>}
          {step === 2 && <><span className="eyebrow">Coverage and model</span><h1 id="onboarding-title">Separate public evidence from assumptions.</h1><p>The map indexes {officialCount.toLocaleString()} official U.S. location pages and plots {mappedCount.toLocaleString()} records validated directly against official page addresses and coordinates. A separate 12-node sample model drives scenarios, costs, capacity, and inventory.</p><div className="start-option is-selected"><CheckCircle2 size={21} /><span><strong>Official evidence atlas + sample model</strong><small>{officialCount.toLocaleString()} official pages · {mappedCount.toLocaleString()} validated exact points · 12 modeled nodes</small></span><EvidenceBadge classification="verified-public" /></div><div className="start-option"><span className="empty-radio" /><span><strong>Empty operating model</strong><small>Keep the public evidence atlas, but build modeled nodes manually</small></span></div></>}
          {step === 3 && <><span className="eyebrow">Executive priorities</span><h1 id="onboarding-title">Rank decisions by what matters.</h1><p>Flyway uses these priorities to rank recommendations. Raw metrics never change.</p><div className="priority-list">{['Protect service level','Avoid stockouts','Control total landed cost','Balance capacity utilization'].map((item, index) => <div key={item}><span>0{index + 1}</span><strong>{item}</strong><MoreHorizontal size={18} /></div>)}</div></>}
          {step === 4 && <><span className="eyebrow">Ready to model</span><h1 id="onboarding-title">Your control tower is ready.</h1><p>Explore official public restaurant evidence, inspect modeled-node assumptions, or run a distribution-center outage. Scenario results apply only to the editable sample model.</p><div className="ready-preview"><div><MapIcon size={22} /><span><strong>National public evidence atlas</strong><small>{officialCount.toLocaleString()} official pages · {mappedCount.toLocaleString()} validated map points</small></span></div><div><Activity size={22} /><span><strong>7 scenario types</strong><small>12-node deterministic sample model</small></span></div><div><Database size={22} /><span><strong>Evidence boundaries visible</strong><small>Public, modeled, and synthetic data stay separate</small></span></div></div></>}
          <div className="onboarding-actions">{step > 1 && <button type="button" className="button secondary" onClick={() => setStep(step - 1)}>Back</button>}<button type="button" className="button primary" disabled={step === 1 && !acknowledged} onClick={() => step < 4 ? setStep(step + 1) : onComplete()}>{step < 4 ? 'Continue' : 'Open Control Tower'}<ArrowRight size={17} /></button></div>
        </div>
      </div>
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return <div className="flyway-toast-host"><div className={classNames('flyway-toast', 't-toast', message && 'is-open')} role="status" aria-live="polite"><CheckCircle2 size={18} /><span>{message}</span></div></div>;
}

export function FlywayApp() {
  const { snapshot: publicFootprint, error: publicFootprintError } = usePublicFootprint();
  const { registry: publicFacilities, error: publicFacilitiesError } = usePublicDcRegistry();
  const workspace=useWorkspace();
  const intelligence=useDecisionIntelligence(workspace,publicFacilities);
  const serviceJobs=useServiceRuns(workspace.client);
  const {locations,lanes,scenarios,preferences}=workspace.document;
  const defaults=useMemo(()=>toEngineDefaults(preferences),[preferences]);
  const bundledLedger=useMemo(()=>publicFootprint&&publicFacilities?createBundledEvidenceLedger(publicFootprint,publicFacilities):undefined,[publicFootprint,publicFacilities]);
  const ledger=useMemo(()=>mergeBundledEvidenceLedger(workspace.document.evidenceLedger,bundledLedger),[workspace.document.evidenceLedger,bundledLedger]);
  const [theme,setTheme]=usePersistedState<Theme>('flyway-theme','light');
  const [onboarded,setOnboarded]=usePersistedState('flyway-onboarded',false);
  const [view,setView]=useState<ViewId>('control-tower');
  const [settingsSection,setSettingsSection]=useState('model');
  const [copilotPrompt,setCopilotPrompt]=useState<{id:string;text:string}>();
  const [mode,setMode]=useState<WorkspaceMode>('public');
  const [drawer,setDrawer]=useState<Drawer>(null);
  const [selectedId,setSelectedId]=useState<string>();
  const [selectedPublicFacilityId,setSelectedPublicFacilityId]=useState<string>();
  const [draftPoint,setDraftPoint]=useState<{latitude:number;longitude:number}|null>(null);
  const [activeScenario,setActiveScenario]=useState<StoredScenario>();
  const [pendingScenario,setPendingScenario]=useState<ScenarioDefinition>();
  const [pendingResult,setPendingResult]=useState<RunResultView>();
  const [retainedOutput,setRetainedOutput]=useState<ScenarioResult>();
  const [resultStorageError,setResultStorageError]=useState(''),[savingResult,setSavingResult]=useState(false);
  const [scenarioDraft,setScenarioDraft]=useState<ScenarioDefinition>();
  const [scenarioSource,setScenarioSource]=useState<RunInputV2>();
  const [scenarioSourceHash,setScenarioSourceHash]=useState<string>();
  const [scenarioEditorId,setScenarioEditorId]=useState('initial');
  const workspaceContext=workspace.connected?`${workspace.serviceUrl}:${workspace.baselineRevision.split(':r')[0]}`:'local';
  const workspaceContextRef=useRef(workspaceContext);workspaceContextRef.current=workspaceContext;
  const [decisionDraft,saveDecisionDraft,decisionDraftStorageRevision]=usePersistedState<DecisionDraft|null>(`flyway-decision-draft:${workspaceContext}`,null);
  const [sidebarCollapsed,setSidebarCollapsed]=useState(true),[mobileNav,setMobileNav]=useState(false);
  const [toast,setToast]=useState(''),[runError,setRunError]=useState(''),[running,setRunning]=useState(false);
  const [baseline,setBaseline]=useState<SimulationPreview>(),[baselineError,setBaselineError]=useState('');
  const [drawerEntered,setDrawerEntered]=useState(false),[drawerClosing,setDrawerClosing]=useState(false);
  const runAbort=useRef<AbortController>(),drawerTriggerRef=useRef<HTMLElement|null>(null),toastTimer=useRef<number>();
  const scenarioCloseRef=useRef<ScenarioCloseRequest>();
  const notices=useStorageNotices();
  const activeResult=pendingResult;
  const selectedLocation=(mode==='compare'&&activeResult?.input?.locations||locations).find(l=>l.id===selectedId)||(mode==='compare'?activeResult?.input?.changes.flatMap(change=>change.kind==='add-location'?[change.location]:[]).find(l=>l.id===selectedId):undefined);
  const selectedPublicFacility=publicFacilities?.facilities.find(f=>f.id===selectedPublicFacilityId);
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  useEffect(()=>{runAbort.current?.abort();setDrawer(null);setPendingResult(undefined);setRetainedOutput(undefined);setResultStorageError('');setPendingScenario(undefined);setActiveScenario(undefined);setScenarioSource(undefined);setScenarioSourceHash(undefined);setScenarioDraft(undefined);setSelectedId(undefined);setSelectedPublicFacilityId(undefined);setRunError('');setMode('public');},[workspaceContext]);
  useEffect(()=>{
    if(mode==='public')return;
    const abort=new AbortController();setBaseline(undefined);setBaselineError('');
    simulateAsync({kind:'metrics',locations,lanes,defaults},abort.signal).then(result=>setBaseline(result as SimulationPreview)).catch(e=>{if(e.name!=='AbortError')setBaselineError(e.message);});
    return()=>abort.abort();
  },[locations,lanes,defaults,mode==='public']);
  useEffect(()=>()=>{runAbort.current?.abort();window.clearTimeout(toastTimer.current);},[]);
  useEffect(()=>{if(!retainedOutput)return;const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[retainedOutput]);
  useEffect(()=>{if(!drawer){setDrawerEntered(false);return;}setDrawerClosing(false);const frame=requestAnimationFrame(()=>setDrawerEntered(true));return()=>cancelAnimationFrame(frame);},[drawer]);
  const notify=(message:string)=>{window.clearTimeout(toastTimer.current);setToast(message);toastTimer.current=window.setTimeout(()=>setToast(''),4000);};
  const protectResult=()=>{
    if(!retainedOutput&&!savingResult&&!running&&!intelligence.busy)return false;
    notify(retainedOutput?'Save the in-memory result before changing workspaces or opening another result. Keep this tab open.':'Wait for the current result operation before changing workspaces.');
    return true;
  };
  const connectWorkspace=async(url:string,token:string)=>{if(protectResult())throw new Error('The current result must finish saving before you connect to another workspace.');await workspace.connect(url,token);};
  const disconnectWorkspace=()=>{if(!protectResult())workspace.disconnect();};
  const rememberTrigger=()=>{drawerTriggerRef.current=document.activeElement instanceof HTMLElement?document.activeElement:null;};
  const closeDrawer=()=>{if(!drawer||drawerClosing)return;setDrawerClosing(true);setDrawerEntered(false);window.setTimeout(()=>{setDrawer(null);setDrawerClosing(false);if(drawerTriggerRef.current?.isConnected)drawerTriggerRef.current.focus();},matchMedia('(prefers-reduced-motion: reduce)').matches?0:250);};
  const transitionFromScenario=(action:()=>void)=>{if(drawer==='scenario'&&scenarioCloseRef.current){void scenarioCloseRef.current(()=>window.setTimeout(action,matchMedia('(prefers-reduced-motion: reduce)').matches?0:250));return;}action();};
  const openLocation=(id:string)=>transitionFromScenario(()=>{rememberTrigger();setSelectedPublicFacilityId(undefined);setSelectedId(id);setDrawer('location');});
  const openPublicFacility=(id:string)=>transitionFromScenario(()=>{rememberTrigger();setSelectedId(undefined);setSelectedPublicFacilityId(id);setDrawer('public-facility');});
  const openAdd=()=>transitionFromScenario(()=>{rememberTrigger();setMode('planning');setView('control-tower');setDraftPoint(null);setDrawer('add');});
  const openScenario=(targetId?:string)=>transitionFromScenario(()=>{rememberTrigger();setScenarioSource(decisionDraft?.sourceInput);setScenarioSourceHash(decisionDraft?.sourceInputHash);setScenarioDraft(decisionDraft?.scenario);setScenarioEditorId(crypto.randomUUID());setRunError('');if(targetId)setSelectedId(targetId);setDrawer('scenario');setMode('planning');setView('control-tower');});
  const navigateNow=(next:ViewId)=>{setView(next);setRunError('');setMobileNav(false);if(next!=='control-tower')setDrawer(null);};
  const handleNavigate=(next:ViewId)=>transitionFromScenario(()=>navigateNow(next));
  const configureAI=()=>transitionFromScenario(()=>{setSettingsSection('copilot');navigateNow('settings');});
  const askDecision=(text:string)=>transitionFromScenario(()=>{rememberTrigger();setCopilotPrompt({id:crypto.randomUUID(),text});setDrawer('copilot');});
  const registerScenarioClose=useCallback((request:ScenarioCloseRequest|null)=>{scenarioCloseRef.current=request||undefined;},[]);
  useEffect(()=>{
    if(!drawer&&!mobileNav)return;
    const dialog=drawer&&drawer!=='add'?document.querySelector<HTMLElement>('[role="dialog"][aria-modal="true"]'):null;
    const focusables=()=>dialog?Array.from(dialog.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex="0"]')).filter(el=>el.getClientRects().length>0):[];
    const frame=requestAnimationFrame(()=>{if(dialog&&!dialog.contains(document.activeElement))focusables()[0]?.focus();});
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){if(drawer==='scenario')void scenarioCloseRef.current?.();else if(drawer&&drawer!=='location')closeDrawer();else if(!drawer)setMobileNav(false);}
      if(event.key==='Tab'&&dialog){const items=focusables(),first=items[0],last=items[items.length-1];if(!first){event.preventDefault();return;}if(event.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){event.preventDefault();last.focus();}else if(!event.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){event.preventDefault();first.focus();}}
    };
    window.addEventListener('keydown',key);return()=>{cancelAnimationFrame(frame);window.removeEventListener('keydown',key);};
  },[drawer,mobileNav,drawerClosing]);
  const handleRun=async(scenario:ScenarioDefinition,draftStorageRevision:number)=>{
    if(running||savingResult)return false;
    if(retainedOutput){setRunError('Save the completed in-memory result before starting another run. Its storage failure has not been resolved.');return false;}
    if(workspace.pending){setRunError('Wait for pending workspace saves before running.');return false;}
    setRunning(true);setRunError('');runAbort.current=new AbortController();
    const runContext=workspaceContext;
    try {
      let reader;
      if(workspace.connected)reader=await serviceJobs.submit(scenario,workspace.document.revision,scenarioSourceHash);
      else {
        const output=await simulateAsync({kind:'scenario',locations:scenarioSource?.locations||locations,lanes:scenarioSource?.lanes||lanes,scenario,defaults:scenarioSource?.defaults||defaults,lineage:scenarioSource?{sourceVersions:scenarioSource.sourceVersions,routeVersions:scenarioSource.routeVersions,forecastVersions:scenarioSource.forecastVersions,warningsAcknowledged:scenarioSource.warningsAcknowledged}:{sourceVersions:ledger?.snapshots.map(s=>s.checksumSha256||s.id)||[]}},runAbort.current.signal) as ScenarioResult;
        try{reader=await persistLocalRun(output,{signal:runAbort.current.signal});if(runContext===workspaceContextRef.current){setRetainedOutput(undefined);setResultStorageError('');}}
        catch(reason){if(runAbort.current.signal.aborted)throw reason;reader=await createMemoryRunReader(output);if(runContext===workspaceContextRef.current){setRetainedOutput(output);setResultStorageError('The calculation completed, but browser artifact storage failed. This result is retained in memory. Keep this tab open and choose Save scenario to retry.');}}
      }
      const result=await openRunView(reader,runAbort.current.signal);
      if(runContext!==workspaceContextRef.current)return false;
      setPendingScenario(scenario);setPendingResult(result);setActiveScenario(undefined);setScenarioDraft(undefined);setMode('compare');setDrawer('results');setView('control-tower');setSelectedId(undefined);
      if(!await saveDecisionDraft(null,draftStorageRevision))notify('Run completed. A newer recovery draft was preserved; review it before reuse.');
      return true;
    } catch(reason){if(runContext===workspaceContextRef.current)setRunError(reason instanceof Error?reason.message:'The simulation failed. Your draft remains available.');return false;}
    finally{setRunning(false);}
  };
  const saveScenario=async()=>{
    if(!pendingScenario||!pendingResult||workspace.pending||savingResult)return;
    const context=workspaceContext,expectedRevision=workspace.document.revision;
    setSavingResult(true);
    try{
      let reader=pendingResult.reader;
      if(retainedOutput){reader=await persistLocalRun(retainedOutput);if(context!==workspaceContextRef.current)return;setPendingResult(await openRunView(reader));setRetainedOutput(undefined);setResultStorageError('');}
      const saved:SavedScenarioReferenceV2={...pendingScenario,schemaVersion:2,savedAt:new Date().toISOString(),latestRun:reader.summary,resultRef:reader.locator};
      if(context!==workspaceContextRef.current)return;
      if(await workspace.saveScenarioReference(saved,expectedRevision)){if(context!==workspaceContextRef.current)return;setActiveScenario(saved);notify(workspace.connected?'Scenario saved to service':'Scenario saved in this browser');}
    }catch(reason){if(context===workspaceContextRef.current)setResultStorageError(reason instanceof Error?reason.message:'The scenario was not saved. Keep this tab open and retry.');}
    finally{setSavingResult(false);}
  };
  const openSavedScenario=async(saved:StoredScenario)=>{
    if(running||savingResult)return;
    if(retainedOutput){setRunError('Save the current in-memory result before replacing it with another saved scenario.');return;}
    const context=workspaceContext;setRunning(true);setRunError('');runAbort.current=new AbortController();
    try{
      let reference:SavedScenarioReferenceV2;
      if(isScenarioReference(saved))reference=saved;
      else {reference=await migrateLegacyScenario(saved,{signal:runAbort.current.signal});if(context!==workspaceContextRef.current)return;if(!await workspace.saveScenarioReference(reference,workspace.document.revision))notify('Legacy result opened. Its original saved copy is retained because reference migration was not committed.');}
      let reader;
      if(reference.resultRef.kind==='local')reader=await openLocalRun(reference.resultRef,{signal:runAbort.current.signal});
      else {
        if(!workspace.client)throw new Error('Connect to the original workspace service to open this result. No live-model values have been substituted.');
        const response=await workspace.client.getRun(reference.resultRef.runId,{signal:runAbort.current.signal});
        if(response.run.workspaceId!==reference.resultRef.workspaceId||!response.summary)throw new Error('The saved result does not belong to this connected workspace or is unavailable.');
        reader=workspace.client.createRunReader(response.run,response.summary);
      }
      const result=await openRunView(reader,runAbort.current.signal);
      if(context!==workspaceContextRef.current)return;
      setActiveScenario(saved);setPendingResult(result);setPendingScenario(undefined);setRetainedOutput(undefined);setResultStorageError('');setMode('compare');setView('control-tower');setDrawer('results');
    }catch(reason){if(context===workspaceContextRef.current)setRunError(reason instanceof Error?reason.message:'This saved result could not be opened. Retry without changing its original inputs.');}
    finally{setRunning(false);}
  };
  const openIntelligenceRun=async(id:string)=>{
    if(protectResult())return;
    const saved=scenarios.find(item=>isScenarioReference(item)?item.resultRef.runId===id:item.result.runId===id);
    if(saved){await openSavedScenario(saved);return;}
    const context=workspaceContext,controller=new AbortController();runAbort.current=controller;setRunning(true);setRunError('');
    try{
      let reader;
      if(workspace.client){const value=await workspace.client.getRun(id,{signal:controller.signal});reader=await serviceJobs.resume(value.run);}
      else reader=await openLocalRun({kind:'local',runId:id},{signal:controller.signal});
      const result=await openRunView(reader,controller.signal);
      if(context!==workspaceContextRef.current)return;
      setPendingResult(result);setPendingScenario(result.input.scenario);setActiveScenario(undefined);setMode('compare');setView('control-tower');setDrawer('results');
    }catch(reason){if(context===workspaceContextRef.current)setRunError(reason instanceof Error?reason.message:'The saved analysis result could not be opened.');}
    finally{if(context===workspaceContextRef.current)setRunning(false);}
  };
  const updateLocation=async(id:string,changes:Partial<TwinLocation>,laneChanges?:{additions:Lane[];updates:Lane[];removals:string[]},expectedRevision?:number)=>{
    const ok=await workspace.mutate(current=>{
      if(expectedRevision!==undefined&&current.revision!==expectedRevision)throw new Error('The workspace changed after this draft was opened. Your changes were not saved. Review the latest revision.');
      const original=current.locations.find(l=>l.id===id);if(!original)throw new Error('This location no longer exists in the current revision.');
      const at=new Date().toISOString(),fieldEvidence={...original.fieldEvidence};
      const evidenceLedger=mergeBundledEvidenceLedger(current.evidenceLedger,bundledLedger);
      const values=new Map((evidenceLedger?.values||[]).map(value=>[value.id,value]));
      for(const [field,value] of Object.entries(changes)){
        if(['id','evidence','fieldEvidence'].includes(field)||JSON.stringify(value)===JSON.stringify((original as unknown as Record<string,unknown>)[field]))continue;
        const previous=fieldEvidence[field];
        if(previous){const edited=editEvidenceValue(previous,{id:crypto.randomUUID(),value,actorId:'workspace-owner',editedAt:at,note:'Edited planning assumption'});fieldEvidence[field]=edited.current;values.set(edited.previous.id,edited.previous);values.set(edited.current.id,edited.current);}
        else {const next=createEvidenceValue({id:crypto.randomUUID(),entityType:'location',entityId:id,fieldPath:field,value,classification:'user-input',confidence:null,sourceTitle:'Workspace edit',sourcePublisher:'Workspace owner',verifiedAt:at,extractionMethod:'manual-entry',extractorVersion:'flyway-authoring-2'});fieldEvidence[field]=next;values.set(next.id,next);}
      }
      const identityChanged=['name','address','city','state','latitude','longitude'].some(k=>k in changes&&JSON.stringify(changes[k as keyof TwinLocation])!==JSON.stringify(original[k as keyof TwinLocation]));
      const next={...original,...changes,id,fieldEvidence,evidence:identityChanged?{classification:'user-input' as const,confidence:null,sourceTitle:'User-edited modeled identity',publisher:'Workspace owner',verifiedAt:at,note:'Original public evidence is retained separately. This modeled identity is user input.'}:original.evidence};
      const nextLanes=new Map(current.lanes.map(l=>[l.id,l]));
      if(laneChanges){
        for(const laneId of laneChanges.removals)nextLanes.delete(laneId);
        for(const lane of [...laneChanges.additions,...laneChanges.updates]){
          const previous=nextLanes.get(lane.id),laneEvidence={...previous?.fieldEvidence};
          for(const [field,value] of Object.entries(lane)){
            if(['id','evidence','fieldEvidence'].includes(field)||JSON.stringify(value)===JSON.stringify((previous as unknown as Record<string,unknown>|undefined)?.[field]))continue;
            const evidenceValue=createEvidenceValue({id:crypto.randomUUID(),entityType:'lane',entityId:lane.id,fieldPath:field,value,classification:'user-input',confidence:null,sourceTitle:'Workspace lane edit',sourcePublisher:'Workspace owner',verifiedAt:at,extractionMethod:'manual-entry',extractorVersion:'flyway-authoring-2'});laneEvidence[field]=evidenceValue;values.set(evidenceValue.id,evidenceValue);
          }
          nextLanes.set(lane.id,{...lane,fieldEvidence:laneEvidence,evidence:{classification:'user-input',confidence:null,sourceTitle:'Modeled lane',publisher:'Workspace owner',verifiedAt:at,note:'User-defined connection and transport assumptions, not a verified company route.'}});
        }
      }
      return {...current,locations:current.locations.map(l=>l.id===id?next:l),lanes:[...nextLanes.values()],evidenceLedger:evidenceLedger?{...evidenceLedger,values:[...values.values()]}:undefined};
    });
    if(ok)notify('Location revision saved');return ok;
  };
  const applyRecommendation=(recommendation:Recommendation)=>{
    if(!activeResult?.input||!recommendation.proposal?.length){setRunError('This legacy recommendation has no executable proposal. Run a new scenario.');return;}
    const input=activeResult.input;
    const scenario={...input.scenario,id:crypto.randomUUID(),name:recommendation.title,createdAt:new Date().toISOString(),changes:[...input.changes,...recommendation.proposal]};
    setScenarioSource(input);setScenarioSourceHash(activeResult.inputHash);setScenarioDraft(scenario);setScenarioEditorId(crypto.randomUUID());setRunError('');setDrawer('scenario');
  };
  const shownOpen=drawerEntered&&!drawerClosing;
  return <div className={classNames('flyway-app',sidebarCollapsed&&'sidebar-collapsed',drawerClosing&&'drawer-closing')} data-testid="app-shell">
    <a className="skip-link" href="#main-content">Skip to main content</a>
    <button type="button" className={classNames('mobile-nav-scrim',mobileNav&&'is-open')} onClick={()=>setMobileNav(false)} aria-label="Close navigation" tabIndex={mobileNav?0:-1}/>
    <div className={classNames('sidebar-host',mobileNav&&'is-mobile-open')}><Sidebar view={view} onNavigate={handleNavigate} collapsed={sidebarCollapsed} onCollapse={()=>setSidebarCollapsed(!sidebarCollapsed)}/></div>
    <div className="flyway-main-shell">
      <TopBar theme={theme} onTheme={()=>setTheme(v=>v==='dark'?'light':'dark')} onCopilot={()=>transitionFromScenario(()=>{rememberTrigger();setDrawer('copilot');})} onMobileMenu={()=>setMobileNav(v=>!v)} onContext={()=>transitionFromScenario(()=>{setView('control-tower');if(view==='decisions'){setMode('planning');setDrawer(null);}else if(activeResult){setMode('compare');setDrawer('results');}})} onFreshness={()=>handleNavigate('sources')} mobileNavOpen={mobileNav} activeScenario={view==='decisions'?undefined:activeScenario||pendingScenario} mode={view==='decisions'?'planning':mode} snapshotDate={publicFacilities?.snapshotDate}/>
      <div className="workspace-save-bar" role="status"><span>{workspace.connected?'Connected workspace':'Browser-only workspace'} · {workspace.baselineRevision}</span><span>{workspace.connectionActivity==='connecting'?'Connecting…':workspace.connectionActivity==='reloading'?'Reloading…':workspace.pending?'Saving…':workspace.connected?'Durable service connected':'Not synced to a service'}</span></div>
      {workspace.error&&<div className="workspace-error" role="alert"><AlertTriangle size={18}/><span>{workspace.error}</span>{workspace.connected&&<button type="button" onClick={()=>workspace.reload().catch(e=>workspace.setError(e.message))}>Reload latest revision</button>}</div>}
      {resultStorageError&&<div className="workspace-error" role="alert"><AlertTriangle size={18}/><span>{resultStorageError}</span><button type="button" disabled={savingResult} onClick={()=>void saveScenario()}>Retry saving result</button></div>}
      {notices.map(n=><div className="workspace-error" role="alert" key={n.id}><AlertTriangle size={18}/><span>{n.message}</span><button type="button" aria-label="Dismiss storage notice" onClick={()=>dismissStorageNotice(n.id)}><X size={16}/></button></div>)}
      {running&&<div className="run-progress" role="status"><Activity size={18}/><span>{workspace.connected?`Service job ${serviceJobs.active?.status||'submitting'} · ${serviceJobs.active?.id||'awaiting confirmation'}. Closing the browser does not lose this job.`:'Evaluating frozen inputs in a background worker. The model is unchanged.'}</span><button type="button" disabled={workspace.connected&&!serviceJobs.active} onClick={()=>workspace.connected?void serviceJobs.cancel():runAbort.current?.abort()}>Cancel run</button></div>}
      {view==='control-tower'&&<DecisionWorkspace locations={locations} lanes={lanes} defaults={defaults} baselineMetrics={baseline} baselineError={baselineError} mode={mode} onMode={setMode} selectedId={selectedId} onSelect={openLocation} selectedPublicFacilityId={selectedPublicFacilityId} onPublicFacilitySelect={openPublicFacility} onAdd={openAdd} onScenario={()=>openScenario()} onSources={()=>handleNavigate('sources')} onResults={()=>transitionFromScenario(()=>setDrawer('results'))} activeResult={activeResult} addMode={drawer==='add'} draftPoint={draftPoint} onAddPoint={setDraftPoint} onDraftMove={setDraftPoint} publicFootprint={publicFootprint} publicFootprintError={publicFootprintError} publicFacilities={publicFacilities} publicFacilitiesError={publicFacilitiesError}/>}
      {view==='locations'&&<LocationsPage locations={locations} onSelect={openLocation} onAdd={openAdd}/>}
      {view==='decisions'&&<><DecisionIntelligencePage state={intelligence.state} busy={!!intelligence.busy||running||workspace.pending>0} error={intelligence.error||runError||workspace.error} onAnalyze={async()=>{if(protectResult())throw new Error('Save the current result or wait for its operation to finish before analyzing.');await intelligence.analyze();}} onResolve={async(id,action,reason)=>{if(protectResult())throw new Error('Save the current result or wait for its operation to finish. Your decision reason is retained.');await intelligence.resolve(id,action,reason);}} onPolicyChange={async policy=>{if(protectResult())throw new Error('Save the current result or wait for its operation to finish before changing policy.');await intelligence.updatePolicy(policy);}} onOpenRun={id=>void openIntelligenceRun(id)} onAsk={askDecision} providerStatus={intelligence.providerStatus} onConfigureAI={configureAI}/>{intelligence.busy&&<p className="decision-operation-message" role="status">{intelligence.busy}</p>}</>}
      {view==='scenarios'&&<><ScenariosPage scenarios={scenarios} onCreate={()=>openScenario()} onOpen={scenario=>void openSavedScenario(scenario)}/>{workspace.connected&&<div className="page-view"><ServiceRunHistory jobs={serviceJobs} busy={running||savingResult} onOpen={async(run,retry)=>{if(protectResult())return;const context=workspaceContext;setRunning(true);setRunError('');runAbort.current=new AbortController();try{const reader=await(retry?serviceJobs.retry(run):serviceJobs.resume(run));const result=await openRunView(reader,runAbort.current.signal);if(context!==workspaceContextRef.current)return;setPendingScenario(result.input.scenario);setPendingResult(result);setRetainedOutput(undefined);setResultStorageError('');setActiveScenario(undefined);setMode('compare');setView('control-tower');setDrawer('results');}catch(reason){if(context===workspaceContextRef.current)setRunError(reason instanceof Error?reason.message:'Could not retrieve this run.');}finally{setRunning(false);}}}/></div>}{runError&&<p role="alert" className="form-error">{runError}</p>}</>}
      {view==='sources'&&<main id="main-content" className="page-view" data-testid="sources-page"><EvidenceWorkbench footprint={publicFootprint} facilities={publicFacilities} ledger={ledger||{schemaVersion:1,sources:[],artifacts:[],snapshots:[],values:[],conflicts:[]}} loading={!publicFootprint&&!publicFootprintError||!publicFacilities&&!publicFacilitiesError} error={publicFootprintError||publicFacilitiesError} onLedger={next=>workspace.mutate(current=>{if(current.revision!==workspace.document.revision)throw new Error('Evidence changed before this decision could be saved. Your review reason is retained; reload and review the latest record.');return {...current,evidenceLedger:next};})}/></main>}
      {view==='settings'&&<WorkspaceSettings key={workspace.serviceUrl||'local'} theme={theme} onTheme={()=>setTheme(v=>v==='dark'?'light':'dark')} preferences={preferences} revision={workspace.document.revision} onSave={(next,expected)=>workspace.mutate(current=>{if(current.revision!==expected)throw new Error('Settings changed in another tab or action. Your edits are retained; reload the latest defaults before saving.');return {...current,preferences:next};})} connected={workspace.connected} serviceUrl={workspace.serviceUrl} pending={workspace.pending} connectionActivity={workspace.connectionActivity} onConnect={connectWorkspace} onDisconnect={disconnectWorkspace} onReload={workspace.reload} initialSection={settingsSection} providerStatus={intelligence.providerStatus} onCheckProvider={intelligence.refreshProvider} onOpenDecisions={()=>handleNavigate('decisions')}/>}
    </div>
    {drawer&&drawer!=='add'&&<div className="drawer-scrim" onClick={drawer==='location'?undefined:drawer==='scenario'?()=>void scenarioCloseRef.current?.():closeDrawer}/>}
    {drawer==='location'&&selectedLocation&&<ModelLocationPanel key={selectedLocation.id} open={shownOpen} location={selectedLocation} lanes={mode==='compare'?activeResult?.input?.lanes||lanes:lanes} locations={mode==='compare'?activeResult?.input?.locations||locations:locations} defaults={mode==='compare'?activeResult?.input?.defaults||defaults:defaults} revision={workspace.document.revision} readOnly={mode==='compare'} onClose={closeDrawer} onCreateScenario={mode==='compare'?undefined:()=>openScenario(selectedLocation.id)} onSave={async request=>{const ok=await updateLocation(request.location.id,request.location,request.laneChanges,request.expectedRevision);return ok?{ok:true,revision:request.expectedRevision+1}:{ok:false,kind:'storage',message:'The revision was not saved. Review the workspace message; your draft is retained.'};}}/>}
    {drawer==='public-facility'&&selectedPublicFacility&&publicFacilities&&<PublicFacilityDrawer open={shownOpen} facility={selectedPublicFacility} registry={publicFacilities} onClose={closeDrawer}/>}
    {drawer==='add'&&<AddLocationPanel open={shownOpen} draftPoint={draftPoint} onPoint={setDraftPoint} onClose={closeDrawer} locations={locations} footprint={publicFootprint} facilities={publicFacilities} geocode={workspace.client?async address=>(await workspace.client!.geocode(address)).candidates:undefined} onSave={async location=>{const saved=await workspace.mutate(current=>({...current,locations:[...current.locations,location]}));if(!saved)throw new Error('Location was not saved. Your draft is retained.');setSelectedId(location.id);setDrawer('location');setDraftPoint(null);notify('Modeled location saved');}}/>}
    {drawer==='scenario'&&<ScenarioDrawer key={scenarioEditorId} open={shownOpen} locations={scenarioSource?.locations||locations} initialTargetId={selectedId} initialScenario={scenarioDraft} initiallySaved={Boolean(decisionDraft&&scenarioDraft&&decisionDraft.scenario.id===scenarioDraft.id&&decisionDraft.sourceInputHash===scenarioSourceHash)} storageRevision={decisionDraftStorageRevision} registerClose={registerScenarioClose} onClose={closeDrawer} onRun={handleRun} onDraftChange={async(scenario,expectedRevision)=>{const ok=await saveDecisionDraft(()=>({schemaVersion:1,kind:scenarioSource?'frozen':'new',scenario,sourceInput:scenarioSource,sourceInputHash:scenarioSourceHash}),expectedRevision);return {ok,revision:ok?expectedRevision+1:expectedRevision};}} onDiscardDraft={async expectedRevision=>{const ok=await saveDecisionDraft(null,expectedRevision);if(ok){setScenarioSource(undefined);setScenarioSourceHash(undefined);setScenarioDraft(undefined);setScenarioEditorId(crypto.randomUUID());setRunError('');}else setRunError('Draft could not be discarded because another tab or storage change won the revision. Keep the current draft open.');return {ok,revision:ok?expectedRevision+1:expectedRevision};}} preferences={preferences} baselineRevision={scenarioSource?.baselineRevision||workspace.baselineRevision} running={running} runError={runError}/>}
    {drawer==='results'&&activeResult&&(pendingScenario||activeScenario)&&<ResultsDrawer open={shownOpen} result={activeResult} scenario={pendingScenario||activeScenario!} locations={activeResult.input.locations} onClose={closeDrawer} onSave={saveScenario} onRerun={()=>{const scenario=activeResult.input.scenario;setScenarioDraft({...scenario,id:crypto.randomUUID(),createdAt:new Date().toISOString()});setScenarioSource(activeResult.input);setScenarioSourceHash(activeResult.inputHash);setScenarioEditorId(crypto.randomUUID());setDrawer('scenario');}} onApply={applyRecommendation} saved={!!activeScenario} saving={workspace.pending>0||savingResult}/>}
    {drawer==='copilot'&&<FlywayCopilot open={shownOpen} result={view==='control-tower'&&mode==='compare'?activeResult:undefined} locations={view==='control-tower'&&mode==='compare'?activeResult?.input?.locations||locations:locations} facilities={publicFacilities} onClose={closeDrawer} onSelect={openLocation} controller={intelligence} initialPrompt={copilotPrompt} onOpenRun={id=>void openIntelligenceRun(id)} onDecisions={()=>{closeDrawer();handleNavigate('decisions');}} onConfigure={configureAI}/>}
    {!onboarded&&<Onboarding publicFootprint={publicFootprint} onComplete={()=>{void setOnboarded(true);}}/>}
    <Toast message={toast}/>
  </div>;
}
