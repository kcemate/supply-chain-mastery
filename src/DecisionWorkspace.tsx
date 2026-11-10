import React, { useMemo, useState } from 'react';
import { Activity, ArrowRight, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Database, Layers3, List, LocateFixed, Map as MapIcon, Plus, Search, ShieldCheck, Warehouse, X } from 'lucide-react';
import { periodRows, scopedMetrics, topologyDayForSelection } from './decisionMetrics';
import type { RunResultView } from './runResultView';
import { useRunScope } from './useRunScope';
import { useRunPage } from './useRunPage';
import { RunPageControls } from './RunPageControls';
import { productCategories } from './flywayData';
import type { SimulationPreview } from './simulationClient';
import type { EngineDefaults, Lane, MapLayerState, ProductCategory, PublicDistributionFacilityRegistry, PublicFootprintSnapshot, ScenarioResult, TwinLocation, TwinMetrics } from './flywayTypes';

const FlywayMap = React.lazy(() => import('./FlywayMap').then(module => ({default:module.FlywayMap})));
export type WorkspaceMode = 'public' | 'planning' | 'compare';
const modeLabels = {public:'Public network',planning:'Planning model',compare:'Compare scenarios'};
const money = (v:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(v);
const number = (v:number) => new Intl.NumberFormat('en-US',{maximumFractionDigits:1}).format(v);
type Point = {latitude:number;longitude:number};
type Props = {
  locations:TwinLocation[];lanes:Lane[];defaults:EngineDefaults;mode:WorkspaceMode;onMode:(mode:WorkspaceMode)=>void;
  selectedId?:string;onSelect:(id:string)=>void;onAdd:()=>void;onScenario:()=>void;onSources:()=>void;
  activeResult?:RunResultView;onResults:()=>void;addMode:boolean;draftPoint:Point|null;onAddPoint:(p:Point)=>void;onDraftMove:(p:Point)=>void;
  publicFootprint?:PublicFootprintSnapshot;publicFootprintError?:string;publicFacilities?:PublicDistributionFacilityRegistry;publicFacilitiesError?:string;
  selectedPublicFacilityId?:string;onPublicFacilitySelect:(id:string)=>void;
  baselineMetrics?:SimulationPreview;baselineError?:string;
  syntheticNetworkPanel?: React.ReactNode;
};

function EvidenceRail({footprint,facilities,onSelect,onSources}: {footprint?:PublicFootprintSnapshot;facilities?:PublicDistributionFacilityRegistry;onSelect:(id:string)=>void;onSources:()=>void}) {
  const reviews=(footprint?.needsReview?.length||0)+(facilities?.needsReview.length||0);
  return <aside className="evidence-inspector" aria-label="Public network evidence">
    <div className="inspector-title"><ShieldCheck size={22}/><h2>What the evidence supports</h2></div>
    <p>Facility identity and placement. Actual inventory, routes, allocations, and operating performance are not public.</p>
    <dl className="coverage-facts" data-testid="coverage-summary">
      <div><dt>Restaurant points</dt><dd>{footprint?number(footprint.metadata.exactMappedCount):'—'}</dd></div>
      <div><dt>Official records indexed</dt><dd>{footprint?number(footprint.metadata.officialRecordCount):'—'}</dd></div>
      <div><dt>Evidenced DCs</dt><dd>{facilities?.facilityCount??'—'}</dd></div>
      <div><dt>DC address precision</dt><dd>{facilities?.exactAddressCount??0} exact / {facilities?.cityLevelCount??0} city</dd></div>
    </dl>
    <button type="button" className="evidence-review-link" onClick={onSources}><Database size={18}/><span><strong>{reviews} evidence review records</strong><small>Includes unplotted locations and unresolved DC claims</small></span><ArrowRight size={17}/></button>
    <div className="inspector-section-heading"><h3>Distribution facilities</h3><span>{facilities?.facilityCount??0}</span></div>
    <div className="public-facility-index">{facilities?.facilities.map(f=><button type="button" key={f.id} onClick={()=>onSelect(f.id)}><span className={`facility-index-symbol ${f.mapPrecision==='exact-public-address'?'is-exact':'is-city'}`} /><span><strong>{f.name.replace(' Distribution Center',' DC')}</strong><small>{f.city}, {f.state} · {f.mapPrecision==='exact-public-address'?'exact address':'city-level evidence'}</small></span><ChevronRight size={15}/></button>)}</div>
    <p className="evidence-boundary">Snapshot: {facilities?.snapshotDate||'loading'}. A list of evidenced facilities is not a complete current operating network. No verified supplier relationships or service territories are asserted.</p>
  </aside>;
}

function ResponsePreview({result,onResults}:{result:RunResultView;onResults:()=>void}) {
  const responses=useRunPage(result.reader,'recommendations');
  if(responses.error)return <p role="alert">{responses.error} <button type="button" onClick={responses.retry}>Retry responses</button></p>;
  if(responses.loading)return <p role="status">Loading evaluated responses…</p>;
  return responses.page?.total?<div className="evaluated-responses">{responses.page.items.slice(0,3).map(r=><button type="button" key={r.id} onClick={onResults}><strong>{r.title}</strong><span>{r.serviceDelta>=0?'+':''}{number(r.serviceDelta)} pts · {money(r.costDelta)}</span><small>{r.candidateInputHash?'Candidate rerun verified':'Legacy result — rerun to evaluate'}</small><ArrowRight size={16}/></button>)}</div>:<p>No evaluated feasible improvement was found. Review the binding constraints or edit your assumptions.</p>;
}

function PlanningRail({metrics,comparisonBaseline,result,locations,onSelect,onScenario,onResults,compare}: {metrics:TwinMetrics;comparisonBaseline?:TwinMetrics;result?:RunResultView;locations:TwinLocation[];onSelect:(id:string)=>void;onScenario:()=>void;onResults:()=>void;compare:boolean}) {
  const target=result?.input?.defaults.serviceTarget??metrics.serviceTarget??98;
  const constraint=locations.find(l=>l.id===metrics.maxUtilizationLocationId);
  return <aside className="planning-inspector" aria-label="Modeled performance">
    <div className="model-label"><span/>MODELED · NOT COMPANY ACTUALS</div>
    <h2>{metrics.serviceLevel>=target?'Within the modeled service target':'A recovery decision is needed'}</h2>
    <p>{compare?'Measured against the frozen baseline.':'This workspace uses editable operating assumptions.'} {result?`${result.input?.horizon??''} ${result.input?.grain==='daily'?'days':'weeks'}.`:'Baseline preview.'}</p>
    <dl className="planning-metrics">
      <div><dt>Service level</dt><dd className={metrics.serviceLevel<target?'is-risk':''}>{number(metrics.serviceLevel)}%</dd><dd className="metric-note"><small>Target {number(target)}%</small></dd></div>
      <div><dt>Unmet demand</dt><dd className={metrics.stockoutUnits?'is-risk':''}>{number(metrics.stockoutUnits)}</dd><dd className="metric-note"><small>{metrics.affectedRestaurants} affected restaurants</small></dd></div>
      <div><dt>Total modeled cost</dt><dd>{money(metrics.totalLandedCost)}</dd><dd className="metric-note"><small>{result?'Full run horizon':'Baseline preview horizon'} · includes configured shortage economics</small></dd></div>
      <div><dt>Peak utilization</dt><dd>{number(metrics.maxUtilization)}%</dd><dd className="metric-note"><small>{constraint?.name||'No capacity constraint'}</small></dd></div>
    </dl>
    {compare&&result&&comparisonBaseline&&<div className="compare-summary"><h3>Change from selected baseline</h3><p><strong>{number(metrics.serviceLevel-comparisonBaseline.serviceLevel)} pts</strong> service · <strong>{number(metrics.stockoutUnits-comparisonBaseline.stockoutUnits)}</strong> unmet units · <strong>{money(result.scenario.totalLandedCost-result.baseline.totalLandedCost)}</strong> full-horizon cost</p>{metrics.serviceLevel<comparisonBaseline.serviceLevel&&result.scenario.totalLandedCost<result.baseline.totalLandedCost&&<p className="risk-copy">Lower spending accompanies lower fulfillment. It is not a service improvement.</p>}</div>}
    <div className="inspector-section-heading"><h3>{result?'Evaluated responses':'Next decision'}</h3></div>
    {result?<ResponsePreview result={result} onResults={onResults}/>:<button type="button" className="button primary wide" onClick={onScenario}><Activity size={17}/>Evaluate a disruption</button>}
    {constraint&&<button type="button" className="button secondary wide" onClick={()=>onSelect(constraint.id)}>Inspect the bottleneck <ArrowRight size={15}/></button>}
    {result&&<button type="button" className="text-action" onClick={onResults}>Open full results and input lineage <ArrowRight size={15}/></button>}
  </aside>;
}

export function DecisionWorkspace(props:Props) {
  const {mode,onMode,publicFootprint,publicFacilities,activeResult:lastResult}=props;
  const activeResult=mode==='compare'?lastResult:undefined;
  const [query,setQuery]=useState(''); const [product,setProduct]=useState<ProductCategory|'all'>('all');
  const [selectedPeriod,setPeriod]=useState(-1); const [listView,setListView]=useState(false); const [listPage,setListPage]=useState(0);
  const period=activeResult&&selectedPeriod>=activeResult.input.horizon?-1:selectedPeriod;
  const [layersOpen,setLayersOpen]=useState(false); const [showDensity,setShowDensity]=useState(false); const [showNames,setShowNames]=useState(true);
  const [showRestaurants,setShowRestaurants]=useState(true); const [showLanes,setShowLanes]=useState(true); const [inspector,setInspector]=useState(true);
  const [fitRequest,setFitRequest]=useState(0); const [focusPoint,setFocusPoint]=useState<(Point&{id:string})|null>(null);
  const [sort,setSort]=useState<'impact'|'name'>('impact');
  const [impactPage,setImpactPage]=useState(0);
  const runScope=useRunScope(activeResult?.reader,{product,period,sort});
  const publicMode=mode==='public';
  const frozen=mode==='compare'?activeResult?.input:undefined;
  const locations=frozen?frozen.locations:props.locations, lanes=frozen?frozen.lanes:props.lanes;
  const frozenDaysPerPeriod=frozen?.grain==='weekly'?7:1;
  const topologyDay=frozen?topologyDayForSelection(period,frozenDaysPerPeriod,frozen.horizon*frozenDaysPerPeriod):0;
  const activeLocations=useMemo(()=>{
    if(!frozen)return locations;
    const map=new Map(locations.map(l=>[l.id,{...l}]));
    for(const change of frozen.changes){if(change.effectiveDay>topologyDay||change.durationDays!=null&&topologyDay>=change.effectiveDay+change.durationDays)continue;if(change.kind==='add-location')map.set(change.location.id,change.location);if(change.kind==='set-location-status'&&map.has(change.locationId))map.get(change.locationId)!.status=change.status;if(change.kind==='reassign-restaurant'&&map.has(change.restaurantId))map.get(change.restaurantId)!.assignedDcId=change.dcId;}
    return [...map.values()];
  },[frozen,locations,topologyDay]);
  const baseline=publicMode?undefined:activeResult?.baseline||props.baselineMetrics?.metrics;
  const trace=activeResult?undefined:props.baselineMetrics?.periodMetrics;
  const grain=activeResult?.input?.grain||props.baselineMetrics?.grain||props.defaults.defaultGrain;
  const daysPerPeriod=grain==='weekly'?7:1;
  const rows=useMemo(()=>periodRows(trace,product,period,daysPerPeriod),[trace,product,period,daysPerPeriod]);
  const baselineTrace=activeResult?undefined:props.baselineMetrics?.periodMetrics;
  const baselineRows=useMemo(()=>periodRows(baselineTrace,product,period,daysPerPeriod),[baselineTrace,product,period,daysPerPeriod]);
  // Query totals deliberately omit cost: displayed cost is explicitly full-run.
  const metrics=activeResult?(runScope.value?{...activeResult.scenario,...runScope.value.scenario,maxUtilizationLocationId:runScope.value.scenario.maxUtilizationLocationId||''}:undefined):baseline?(trace?scopedMetrics(rows,baseline):baseline):undefined;
  const comparisonBaseline=activeResult&&runScope.value?{...activeResult.baseline,...runScope.value.baseline,maxUtilizationLocationId:runScope.value.baseline.maxUtilizationLocationId||''}:undefined;
  const impactedIds=activeResult?(runScope.value?.incrementalStockoutLocationIds||[]):[...new Set(rows.filter(r=>r.stockoutQuantity>0).map(r=>r.locationId))];
  const periods=useMemo(()=>{if(frozen)return Array.from({length:frozen.horizon},(_,index)=>[index,new Date(Date.parse(`${frozen.startDate}T00:00:00Z`)+index*daysPerPeriod*86400000).toISOString().slice(0,10)] as [number,string]);const dates=new Map<number,string>();for(const row of trace||[]){const index=Math.floor(row.periodIndex/daysPerPeriod);if(!dates.has(index))dates.set(index,row.date);}return [...dates.entries()];},[frozen,trace,daysPerPeriod]);
  const normalized=query.trim().toLowerCase();
  const publicRecords=useMemo(()=>[
    ...(publicFacilities?.facilities||[]).map(f=>({id:f.id,name:f.name,address:f.address||'',city:f.city,state:f.state,type:'dc',latitude:f.latitude,longitude:f.longitude,source:f.evidenceIds.map(id=>publicFacilities?.evidence.find(e=>e.id===id)?.sourceUrl).find(Boolean),precision:f.mapPrecision})),
    ...(publicFootprint?.locations||[]).map(l=>({id:l.id,name:l.name,address:l.address,city:l.city,state:l.state,type:'restaurant',latitude:l.latitude,longitude:l.longitude,source:l.sourceUrl,precision:'exact-public-address'})),
  ],[publicFacilities,publicFootprint]);
  const records=publicMode?publicRecords:activeLocations.map(l=>({id:l.id,name:l.name,address:l.address,city:l.city,state:l.state,type:l.type,latitude:l.latitude,longitude:l.longitude,source:undefined,precision:'modeled'}));
  const filtered=records.filter(l=>`${l.name} ${l.address} ${l.city} ${l.state}`.toLowerCase().includes(normalized));
  const select=(record:typeof records[number])=>{
    if(record.latitude!=null&&record.longitude!=null)setFocusPoint({id:record.id,latitude:record.latitude,longitude:record.longitude});
    if(publicMode&&record.type==='dc')props.onPublicFacilitySelect(record.id);
    else if(!publicMode)props.onSelect(record.id);
    setQuery('');setListView(false);
  };
  const layerState:MapLayerState={officialDensity:publicMode&&showDensity,publicRestaurants:publicMode&&showRestaurants,publicFacilities:publicMode,sampleModel:!publicMode,sampleLanes:!publicMode&&showLanes,risk:!publicMode,facilityLabels:showNames};
  const displayLanes=useMemo(()=>{
    const current=new Map(lanes.map(l=>[l.id,{...l}]));
    if(frozen){for(const change of frozen.changes){if(change.effectiveDay>topologyDay||change.durationDays!=null&&topologyDay>=change.effectiveDay+change.durationDays)continue;if(change.kind==='add-lane')current.set(change.lane.id,change.lane);if(change.kind==='remove-lane')current.delete(change.laneId);if(change.kind==='adjust-lane'&&change.status&&current.has(change.laneId))current.get(change.laneId)!.status=change.status;}}
    return [...current.values()].filter(l=>product==='all'||l.products.includes(product));
  },[frozen,lanes,topologyDay,product]);
  const impactTable=useMemo(()=>{
    const aggregates=new Map(activeLocations.filter(l=>l.type==='restaurant').map(location=>[location.id,{location,stockout:0,baselineStockout:0,demand:0,fulfilled:0}]));
    for(const row of rows){const item=aggregates.get(row.locationId);if(item){item.stockout+=row.stockoutQuantity;item.demand+=row.requestedDemand;item.fulfilled+=row.fulfilledDemand;}}
    for(const row of baselineRows){const item=aggregates.get(row.locationId);if(item)item.baselineStockout+=row.stockoutQuantity;}
    return [...aggregates.values()].filter(item=>`${item.location.name} ${item.location.city} ${item.location.state}`.toLowerCase().includes(normalized)).sort((a,b)=>sort==='impact'?b.stockout-a.stockout:a.location.name.localeCompare(b.location.name));
  },[activeLocations,rows,baselineRows,sort,normalized]);
  const visibleImpactRows=activeResult?(runScope.value?.restaurants.items||[]).map(row=>({...row,location:{id:row.locationId,name:row.name}})):impactTable.slice(impactPage*40,(impactPage+1)*40);
  return <main id="main-content" className={`control-tower decision-workspace mode-${mode}`} data-testid="control-tower">
    <section className="workspace-heading"><div><h1>{publicMode?'U.S. public network':mode==='compare'?'Scenario comparison':'Network planning'}</h1><p>{publicMode?'Verified identities. Clear evidence boundaries.':`${activeLocations.length} modeled locations · ${displayLanes.length} product-compatible lanes · ${mode==='compare'?'frozen scenario inputs':'editable assumptions'}`}</p></div><div className="decision-band-actions"><button type="button" className="button secondary" onClick={props.onAdd}><Plus size={17}/>Add location</button><button type="button" className="button primary" onClick={props.onScenario}><Activity size={17}/>Create scenario</button></div></section>
    <div className="workspace-mode-bar"><div className="workspace-modes" role="tablist" aria-label="Network context">{(['public','planning','compare'] as const).map(item=><button type="button" role="tab" aria-selected={mode===item} disabled={item==='compare'&&!lastResult} key={item} onClick={()=>{onMode(item);setQuery('');setPeriod(-1);setListPage(0);}}>{modeLabels[item]}{item==='compare'&&!lastResult&&<span className="sr-only"> — run a scenario first</span>}</button>)}</div><span className="workspace-context-note">{publicMode?`Evidence snapshot ${publicFacilities?.snapshotDate||'loading'}`:mode==='compare'?`Frozen ${activeResult?.inputHash.slice(0,10)||'legacy run'}`:'Editable baseline · sample assumptions'}</span></div>
    {mode === 'planning' && props.syntheticNetworkPanel}
    <div className={`workspace-grid ${!inspector?'inspector-collapsed':''}`}>
      <section className="map-workspace">
        <div className="map-search-row"><div className="map-search"><Search size={18}/><input aria-label="Search network" placeholder={publicMode?'Search public facilities, city, or address…':'Search modeled locations…'} value={query} onChange={e=>{setQuery(e.target.value);setListPage(0);}}/>{query&&<button type="button" aria-label="Clear search" onClick={()=>setQuery('')}><X size={16}/></button>}{normalized&&!listView&&<div className="search-results">{filtered.slice(0,6).map(record=><button type="button" key={record.id} onClick={()=>select(record)}><Warehouse size={16}/><span><strong>{record.name}</strong><small>{record.city}, {record.state} · {record.precision.split('-').join(' ')}</small></span></button>)}{!filtered.length&&<p className="empty-search">No matching records. Try a city or state.</p>}</div>}</div><button type="button" className="map-view-toggle" onClick={()=>setListView(!listView)} aria-pressed={listView}>{listView?<MapIcon size={17}/>:<List size={17}/>}<span>{listView?'Map':'List'}</span></button><button type="button" className="map-view-toggle" aria-label={inspector?'Hide inspector':'Show inspector'} aria-pressed={inspector} onClick={()=>setInspector(!inspector)}><ChevronDown size={17}/></button></div>
        {listView?<div className="network-list-view"><div className="network-list-caption"><strong>{filtered.length.toLocaleString()} {publicMode?'public':'modeled'} records</strong><span>{publicMode?'Identity evidence, not operating assignments':'Assumptions are not company facts'}</span></div><div className="registry-table-wrap"><table className="registry-table"><thead><tr><th>Facility</th><th>Location</th><th>Type</th><th>Evidence</th><th>Source</th></tr></thead><tbody>{filtered.slice(listPage*40,(listPage+1)*40).map(record=><tr key={record.id}><td><button type="button" className="location-name-button" onClick={()=>select(record)}>{record.name}</button></td><td>{record.city}, {record.state}</td><td>{record.type==='dc'?'Distribution center':record.type}</td><td>{record.precision.split('-').join(' ')}</td><td>{record.source?<a href={record.source} target="_blank" rel="noreferrer">Official source</a>:<span>Model input</span>}</td></tr>)}</tbody></table></div><div className="list-pagination"><button type="button" disabled={listPage===0} onClick={()=>setListPage(p=>p-1)}><ChevronLeft size={18}/>Previous</button><span>Page {listPage+1} of {Math.max(1,Math.ceil(filtered.length/40))}</span><button type="button" disabled={(listPage+1)*40>=filtered.length} onClick={()=>setListPage(p=>p+1)}>Next<ChevronRight size={18}/></button></div></div>:<>
          <div className="map-toolbar-wrap"><div className="map-toolbar"><button type="button" aria-label="Fit network" onClick={()=>setFitRequest(v=>v+1)}><LocateFixed size={18}/></button><button type="button" aria-label="Map layers" aria-expanded={layersOpen} onClick={()=>setLayersOpen(!layersOpen)}><Layers3 size={18}/></button></div>{layersOpen&&<div className="layer-popover" data-testid="layer-popover"><strong>{publicMode?'Public evidence':'Planning layers'}</strong>{publicMode?<><label><input type="checkbox" checked={showRestaurants} onChange={()=>setShowRestaurants(!showRestaurants)}/>Official location records</label><label><input type="checkbox" checked={showDensity} onChange={()=>setShowDensity(!showDensity)}/>Official page density</label></>:<label><input type="checkbox" checked={showLanes} onChange={()=>setShowLanes(!showLanes)}/>Modeled lanes</label>}<label><input type="checkbox" checked={showNames} onChange={()=>setShowNames(!showNames)}/>Facility names</label><p>{publicMode?'Switch to Planning model to work with assumptions.':'Connections and quantities are modeled assumptions.'}</p></div>}</div>
          <React.Suspense fallback={<div className="map-loading" role="status">Loading U.S. atlas…</div>}><FlywayMap locations={activeLocations.filter(l=>product==='all'||l.products.includes(product))} lanes={displayLanes} selectedId={props.selectedId} selectedPublicFacilityId={props.selectedPublicFacilityId} onSelect={props.onSelect} onPublicFacilitySelect={props.onPublicFacilitySelect} addPoint={props.draftPoint} onAddPoint={props.addMode?props.onAddPoint:undefined} onDraftMove={props.onDraftMove} placementMode={props.addMode} fitRequest={fitRequest} layerState={layerState} publicFootprint={publicFootprint} publicFacilities={publicFacilities} focusPoint={focusPoint} impactedIds={impactedIds}/></React.Suspense>
          <div className="atlas-compact-legend"><span><i className="atlas-symbol restaurant"/>{publicMode?'Official restaurant':'Modeled restaurant'}</span><span><i className="atlas-symbol dc-exact"/>{publicMode?'Exact DC':'Modeled DC'}</span>{publicMode?<span><i className="atlas-symbol dc-city"/>City-level DC</span>:<span><i className="atlas-symbol supplier"/>Modeled supplier</span>}</div>
        </>}
        {(props.publicFootprintError||props.publicFacilitiesError)&&publicMode&&<div className="map-data-error" role="alert">Public evidence could not load. {props.publicFootprintError||props.publicFacilitiesError} <button type="button" onClick={()=>location.reload()}>Retry</button></div>}
        <div className="map-status-strip"><span>{publicMode?<><CheckCircle2 size={14}/>Public identities only · no verified territories or assignments</>:<>Sample assumptions · {locations.length} locations · {lanes.length} lanes</>}</span><span>Bundled U.S. atlas · no live street routing</span></div>
      </section>
      {inspector&&(publicMode?<EvidenceRail footprint={publicFootprint} facilities={publicFacilities} onSelect={props.onPublicFacilitySelect} onSources={props.onSources}/>:metrics?<PlanningRail metrics={metrics} comparisonBaseline={comparisonBaseline} result={activeResult} locations={activeLocations} onSelect={props.onSelect} onScenario={props.onScenario} onResults={props.onResults} compare={mode==='compare'}/>:activeResult?<aside className="planning-inspector" aria-label="Modeled performance"><h2>Selected result scope</h2>{runScope.error?<p role="alert">{runScope.error} <button type="button" className="button secondary" onClick={runScope.retry}>Retry saved metrics</button></p>:<p role="status">Loading the saved product and period metrics…</p>}<p>No live baseline is substituted while this result loads.</p></aside>:null)}
    </div>
    {!publicMode&&!baseline&&<div className="model-calculation-status" role={props.baselineError?'alert':'status'}>{props.baselineError||'Calculating baseline in a background worker…'}</div>}
    {!publicMode&&<section className="model-time-workbench" aria-label="Product and period analysis">
      <div className="analysis-toolbar">
        <label>Product<select aria-label="Analysis product" value={product} onChange={e=>{setProduct(e.target.value as ProductCategory|'all');setImpactPage(0);}}><option value="all">All product groups</option>{productCategories.map(p=><option key={p}>{p}</option>)}</select></label>
        <label>Period<select aria-label="Analysis period" value={period} onChange={e=>{setPeriod(Number(e.target.value));setImpactPage(0);}}><option value={-1}>Full horizon</option>{periods.map(([id,date])=><option key={id} value={id}>{date} · {grain==='weekly'?'week':'day'} {id+1}</option>)}</select></label>
        <span>{trace||activeResult?(period<0?'Quantities aggregate the full horizon; cost remains the full run total. Map topology shows the final day, so temporary changes may have expired.':'Quantities and exposure follow this selection. Cost remains the full run total. Map topology shows the first day of the period.'):'Calculating product and period exposure…'}</span>
      </div>
      {(trace||activeResult)&&<><div className="impact-table-heading"><h2>{activeResult?'Restaurant impact':'Baseline fulfillment'}</h2><label>Sort<select aria-label="Sort impacts" value={sort} onChange={e=>{setSort(e.target.value as typeof sort);setImpactPage(0);}}><option value="impact">Unmet demand</option><option value="name">Location name</option></select></label></div>
        <p className="evidence-boundary">Quantities use the model's product units. Select one product for unit-specific decisions; combined case-equivalent totals are planning measures.</p>
        {activeResult&&runScope.loading&&<p role="status">Loading a page of saved impacts…</p>}
        {activeResult&&runScope.error&&<p role="alert">{runScope.error} <button type="button" onClick={runScope.retry}>Retry impacts</button></p>}
        <div className="registry-table-wrap"><table className="registry-table"><thead><tr><th>Restaurant</th><th>Demand</th><th>Fulfilled</th><th>Baseline shortage</th>{activeResult&&<><th>Scenario shortage</th><th>Change</th></>}</tr></thead><tbody>{visibleImpactRows.map(({location,demand,fulfilled,stockout,baselineStockout})=><tr key={location.id}><td><button type="button" className="location-name-button" onClick={()=>props.onSelect(location.id)}>{location.name}</button></td><td>{number(demand)}</td><td>{number(fulfilled)}</td><td>{number(baselineStockout)}</td>{activeResult&&<><td className={stockout?'is-risk':''}>{number(stockout)}</td><td>{number(stockout-baselineStockout)}</td></>}</tr>)}</tbody></table></div>
        {activeResult?<RunPageControls page={runScope.pageNumber} total={runScope.value?.restaurants.total} hasPrevious={runScope.hasPrevious} hasNext={!!runScope.value?.restaurants.nextCursor} loading={runScope.loading} onPrevious={runScope.previous} onNext={runScope.next}/>:<div className="list-pagination"><button type="button" disabled={impactPage===0} onClick={()=>setImpactPage(p=>p-1)}>Previous</button><span>{impactTable.length} restaurants · page {impactPage+1} of {Math.max(1,Math.ceil(impactTable.length/40))}</span><button type="button" disabled={(impactPage+1)*40>=impactTable.length} onClick={()=>setImpactPage(p=>p+1)}>Next</button></div>}
      </>}
    </section>}
  </main>;
}
