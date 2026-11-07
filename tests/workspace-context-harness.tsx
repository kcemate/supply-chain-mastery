import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { initialLanes, initialLocations } from '../src/flywayData';
import type { ScenarioResult } from '../src/flywayTypes';
import type { RunSummaryV2 } from '../src/runArtifacts';
import type { PlatformRun, PlatformRunStatus, PlatformWorkspace } from '../src/platformClient';
import { useServiceRuns } from '../src/useServiceRuns';
import { useWorkspace } from '../src/useWorkspace';
import { initialPreferences, toEngineDefaults } from '../src/workspacePreferences';

type Held = { origin: string; runId?: string; resolve: (value: Response) => void; reject: (reason: Error) => void; signal?: AbortSignal };
const serviceIds: Record<string,string> = { 'http://127.0.0.1:4101':'10000000-0000-4000-8000-000000000001', 'http://127.0.0.1:4102':'20000000-0000-4000-8000-000000000002' };
const state = {
  holdWorkspace: false, failWorkspace: false, holdRuns: false, holdRetry: false, holdRunDetail: false,
  heldWorkspaces: [] as Held[], heldRuns: [] as Held[], heldRetries: [] as Held[], heldRunDetails: [] as Held[],
};
const emptyLedger = { schemaVersion:1 as const, sources:[], artifacts:[], snapshots:[], values:[], conflicts:[] };

function workspace(origin:string, revision=1):PlatformWorkspace {
  const key=origin.endsWith('4102')?'B':'A', now='2026-09-04T00:00:00.000Z';
  return {id:serviceIds[origin],ownerId:'local-owner',revision,createdAt:now,updatedAt:now,
    defaults:{...toEngineDefaults(initialPreferences),workspacePreferences:initialPreferences},
    locations:initialLocations.map((item,index)=>index?item:{...item,name:`${key} facility r${revision}`}),lanes:initialLanes,scenarios:[],evidenceLedger:emptyLedger};
}
function run(origin:string,status:PlatformRunStatus='succeeded',tag='history'):PlatformRun {
  const key=origin.endsWith('4102')?'B':'A';
  const terminal=status==='succeeded'||status==='failed'||status==='cancelled';
  return {id:`${key.toLowerCase()}-${tag}`,workspaceId:serviceIds[origin],workspaceRevision:1,
    scenario:{id:`scenario-${key}-${tag}`,name:tag==='history'?`${key} run`:`${key} ${tag}`,description:'Harness fixture',type:'dc-outage',targetId:initialLocations.find(item=>item.type==='dc')!.id,magnitude:100,grain:'daily',horizon:1,startDate:'2026-09-04',createdAt:'2026-09-04T00:00:00.000Z',baselineRevision:`${serviceIds[origin]}:r1`},
    status,attempt:1,cancelRequested:false,inputHash:key.repeat(64).toLowerCase(),createdAt:'2026-09-04T00:00:00.000Z',...(terminal?{completedAt:'2026-09-04T00:00:01.000Z'}:{}),correlationId:`correlation-${key}-${tag}`};
}
function result(value:PlatformRun):ScenarioResult {
  const metrics={serviceLevel:99,stockoutUnits:1,affectedRestaurants:1,totalLandedCost:100,maxUtilization:50,maxUtilizationLocationId:value.scenario.targetId,totalDemand:100,fulfilledDemand:99};
  return {runId:value.id,engineVersion:'harness-engine',inputHash:value.inputHash,completedAt:'2026-09-04T00:00:01.000Z',baseline:metrics,scenario:metrics,impacts:[],recommendations:[],narrative:`Result ${value.scenario.name}`};
}
function summary(value:PlatformRun):RunSummaryV2 {
  const output=result(value);
  return {schemaVersion:2,runId:output.runId,engineVersion:output.engineVersion,inputHash:output.inputHash,outputChecksum:'c'.repeat(64),completedAt:output.completedAt,baseline:output.baseline,scenario:output.scenario,narrative:output.narrative,impactCount:0,recommendationCount:0,diagnosticWarningCount:0,inputInfo:{engineBuildDigest:'d'.repeat(64),baselineRevision:value.scenario.baselineRevision,startDate:'2026-09-04',grain:'daily',horizon:1,sourceVersions:[],routeVersions:[],forecastVersions:[],warningsAcknowledged:[],locationCount:initialLocations.length,laneCount:initialLanes.length,serviceTarget:98,productWeights:{}}};
}
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json',...headers}});
const originalFetch=globalThis.fetch.bind(globalThis);
globalThis.fetch=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(!serviceIds[url.origin])return originalFetch(input,init);
  if(url.pathname==='/api/v1/workspace'&&(!init?.method||init.method==='GET')){
    if(state.failWorkspace){state.failWorkspace=false;throw new Error('Provider workspace read failed');}
    if(state.holdWorkspace){state.holdWorkspace=false;return new Promise<Response>((resolve,reject)=>state.heldWorkspaces.push({origin:url.origin,resolve,reject,signal:init?.signal||undefined}));}
    const value=workspace(url.origin);return json({workspace:value},200,{etag:`"${value.revision}"`});
  }
  if(url.pathname==='/api/v1/workspace'&&init?.method==='PUT'){
    const replacement=JSON.parse(String(init.body||'{}'));const value={...workspace(url.origin,2),...replacement,revision:2};
    return json({workspace:value},200,{etag:'"2"'});
  }
  if(url.pathname==='/api/v1/runs'&&(!init?.method||init.method==='GET')){
    if(state.holdRuns){state.holdRuns=false;return new Promise<Response>((resolve,reject)=>state.heldRuns.push({origin:url.origin,resolve,reject,signal:init?.signal||undefined}));}
    return json({items:[run(url.origin)],total:1});
  }
  const retryMatch=url.pathname.match(/^\/api\/v1\/runs\/([^/]+)\/retry$/);
  if(retryMatch&&init?.method==='POST'){
    const retried=run(url.origin,'queued','retried');
    if(state.holdRetry){state.holdRetry=false;return new Promise<Response>((resolve,reject)=>state.heldRetries.push({origin:url.origin,runId:retryMatch[1],resolve,reject,signal:init?.signal||undefined}));}
    return json(retried);
  }
  const detailMatch=url.pathname.match(/^\/api\/v1\/runs\/([^/]+)$/);
  if(detailMatch&&(!init?.method||init.method==='GET')){
    const tag=decodeURIComponent(detailMatch[1]).replace(/^[ab]-/,'');
    const completed=run(url.origin,'succeeded',tag);
    if(state.holdRunDetail){state.holdRunDetail=false;return new Promise<Response>((resolve,reject)=>state.heldRunDetails.push({origin:url.origin,runId:detailMatch[1],resolve,reject,signal:init?.signal||undefined}));}
    return json({run:completed,summary:summary(completed)});
  }
  return json({type:'about:blank',title:'Missing fixture',status:404,code:'missing_fixture',detail:`No fake route for ${url.pathname}`,correlationId:'harness-correlation',retryable:false},404);
}) as typeof fetch;

function App(){
  const workspaceState=useWorkspace();
  const jobs=useServiceRuns(workspaceState.client);
  const [action,setAction]=useState('idle'),[mutation,setMutation]=useState('none'),[retryOutcome,setRetryOutcome]=useState('none'),[watchOutcome,setWatchOutcome]=useState('none');
  const connect=(origin:string)=>void workspaceState.connect(origin,'workspace-context-harness-token-000001').then(()=>setAction(`connect settled ${origin}`)).catch(error=>setAction(`connect error: ${error.message}`));
  const reload=()=>void workspaceState.reload().then(()=>setAction('reload settled')).catch(error=>setAction(`reload error: ${error.message}`));
  const mutate=()=>void workspaceState.mutate(current=>({...current,preferences:{...current.preferences,serviceTarget:current.preferences.serviceTarget===98?97:98}})).then(ok=>setMutation(ok?'saved':'blocked'));
  const releaseWorkspace=(origin:string,revision:number)=>{const index=state.heldWorkspaces.findIndex(item=>item.origin===origin);if(index<0)return setAction('no held workspace');const [held]=state.heldWorkspaces.splice(index,1);const value=workspace(origin,revision);held.resolve(json({workspace:value},200,{etag:`"${revision}"`}));setAction(`released ${origin} r${revision}`);};
  const releaseRuns=(origin:string)=>{const index=state.heldRuns.findIndex(item=>item.origin===origin);if(index<0)return setAction('no held runs');const [held]=state.heldRuns.splice(index,1);held.resolve(json({items:[run(origin)],total:1}));setAction(`released runs ${origin}`);};
  const retryCurrent=()=>{const origin=workspaceState.client?.baseUrl;if(!origin)return setRetryOutcome('no client');void jobs.retry(run(origin,'failed','failed')).then(value=>setRetryOutcome(value.summary.narrative)).catch(error=>setRetryOutcome(`error: ${error.message}`));};
  const watch=(tag:string)=>{const origin=workspaceState.client?.baseUrl;if(!origin)return setWatchOutcome('no client');void jobs.resume(run(origin,'running',tag)).then(value=>setWatchOutcome(value.summary.narrative)).catch(error=>setWatchOutcome(`error: ${error.message}`));};
  const releaseRetry=(origin:string)=>{const index=state.heldRetries.findIndex(item=>item.origin===origin);if(index<0)return setAction('no held retry');const [held]=state.heldRetries.splice(index,1);held.resolve(json(run(origin,'queued','retried')));setAction(`released retry ${origin}`);};
  const releaseRunDetail=(origin:string,tag:string)=>{const runId=`${origin.endsWith('4102')?'b':'a'}-${tag}`;const index=state.heldRunDetails.findIndex(item=>item.origin===origin&&item.runId===runId);if(index<0)return setAction(`no held detail ${runId}`);const [held]=state.heldRunDetails.splice(index,1);const completed=run(origin,'succeeded',tag);held.resolve(json({run:completed,summary:summary(completed)}));setAction(`released detail ${runId}`);};
  return <main>
    <h1>Workspace context race harness</h1>
    <dl>
      <dt>Connected</dt><dd data-testid="connected">{String(workspaceState.connected)}</dd>
      <dt>Service URL</dt><dd data-testid="service-url">{workspaceState.serviceUrl||'none'}</dd>
      <dt>Client URL</dt><dd data-testid="client-url">{workspaceState.client?.baseUrl||'none'}</dd>
      <dt>Activity</dt><dd data-testid="activity">{workspaceState.connectionActivity||'idle'}</dd>
      <dt>Revision</dt><dd data-testid="revision">{workspaceState.document.revision}</dd>
      <dt>First location</dt><dd data-testid="first-location">{workspaceState.document.locations[0]?.name}</dd>
      <dt>Workspace error</dt><dd data-testid="workspace-error">{workspaceState.error||'none'}</dd>
      <dt>Action</dt><dd data-testid="action">{action}</dd>
      <dt>Mutation</dt><dd data-testid="mutation">{mutation}</dd>
      <dt>Runs</dt><dd data-testid="runs">{jobs.runs.map(item=>item.scenario.name).join(',')||'none'}</dd>
      <dt>Runs loading</dt><dd data-testid="runs-loading">{String(jobs.loading)}</dd>
      <dt>Runs error</dt><dd data-testid="runs-error">{jobs.error||'none'}</dd>
      <dt>Active run</dt><dd data-testid="active-run">{jobs.active?.scenario.name||'none'}</dd>
      <dt>Retry outcome</dt><dd data-testid="retry-outcome">{retryOutcome}</dd>
      <dt>Watch outcome</dt><dd data-testid="watch-outcome">{watchOutcome}</dd>
    </dl>
    <section aria-label="Fake provider controls">
      <button onClick={()=>{state.failWorkspace=true;setAction('next workspace fails');}}>Fail next workspace read</button>
      <button onClick={()=>{state.holdWorkspace=true;setAction('next workspace held');}}>Hold next workspace read</button>
      <button onClick={()=>{state.holdRuns=true;setAction('next runs held');}}>Hold next runs read</button>
      <button onClick={()=>{state.holdRetry=true;setAction('next retry held');}}>Hold next retry</button>
      <button onClick={()=>{state.holdRunDetail=true;setAction('next run detail held');}}>Hold next run detail</button>
      <button onClick={()=>connect('http://127.0.0.1:4101')}>Connect A</button>
      <button onClick={()=>connect('http://127.0.0.1:4102')}>Connect B</button>
      <button onClick={reload}>Reload</button><button onClick={workspaceState.disconnect}>Disconnect</button><button onClick={mutate}>Mutate</button>
      <button onClick={()=>releaseWorkspace('http://127.0.0.1:4101',2)}>Release A r2</button>
      <button onClick={()=>releaseWorkspace('http://127.0.0.1:4101',99)}>Release A r99</button>
      <button onClick={()=>releaseRuns('http://127.0.0.1:4102')}>Release B runs</button>
      <button onClick={()=>void jobs.refresh()}>Refresh runs</button>
      <button onClick={retryCurrent}>Retry current</button>
      <button onClick={()=>releaseRetry('http://127.0.0.1:4101')}>Release A retry</button>
      <button onClick={()=>watch('old-watch')}>Watch old</button>
      <button onClick={()=>watch('new-watch')}>Watch new</button>
      <button onClick={()=>releaseRunDetail('http://127.0.0.1:4101','old-watch')}>Release A old watch</button>
      <button onClick={()=>releaseRunDetail('http://127.0.0.1:4101','new-watch')}>Release A new watch</button>
      <button onClick={()=>releaseRunDetail('http://127.0.0.1:4102','old-watch')}>Release B old watch</button>
    </section>
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
