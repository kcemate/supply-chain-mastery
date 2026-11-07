import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScenarioDefinition } from './flywayTypes';
import type { RunResultReader } from './runArtifacts';
import type { PlatformClient, PlatformRun } from './platformClient';

export function useServiceRuns(client:PlatformClient|undefined) {
  const [runs,setRuns]=useState<PlatformRun[]>([]),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [active,setActive]=useState<PlatformRun>();
  const [nextCursor,setNextCursor]=useState<string>();
  const generation=useRef(0),controller=useRef<AbortController>();
  const currentClient=useRef(client);currentClient.current=client;
  const accept=useCallback((run:PlatformRun)=>{setRuns(current=>[run,...current.filter(item=>item.id!==run.id)]);},[]);
  const refresh=useCallback(async()=>{
    if(!client)return;
    const current=generation.current;setLoading(true);setError('');
    try {const next=await client.listRuns({limit:50});if(current===generation.current&&client===currentClient.current){setRuns(next.items);setNextCursor(next.nextCursor);}}
    catch(reason){if(current===generation.current&&client===currentClient.current)setError(reason instanceof Error?reason.message:'Could not load service runs. Retry to reconnect.');}
    finally{if(current===generation.current&&client===currentClient.current)setLoading(false);}
  },[client]);
  useEffect(()=>{generation.current++;setRuns([]);setNextCursor(undefined);setLoading(false);setActive(undefined);setError('');void refresh();return()=>{generation.current++;controller.current?.abort();};},[refresh]);
  const more=async()=>{
    if(!client||client!==currentClient.current||!nextCursor||loading)return;
    const current=generation.current;setLoading(true);setError('');
    try{const page=await client.listRuns({cursor:nextCursor,limit:50});if(current===generation.current&&client===currentClient.current){setRuns(previous=>[...previous,...page.items.filter(item=>!previous.some(existing=>existing.id===item.id))]);setNextCursor(page.nextCursor);}}
    catch(reason){if(current===generation.current&&client===currentClient.current)setError(reason instanceof Error?reason.message:'Could not load the next page of saved runs. Retry to continue.');}
    finally{if(current===generation.current&&client===currentClient.current)setLoading(false);}
  };
  const wait=async(run:PlatformRun):Promise<RunResultReader>=>{
    if(!client||client!==currentClient.current)throw new Error('Reconnect to the workspace service to retrieve this run.');
    const current=generation.current;accept(run);setActive(run);controller.current?.abort();
    const watching=new AbortController();controller.current=watching;
    try {
      const value=await client.pollRun(run.id,{intervalMs:1000,timeoutMs:600_000,signal:watching.signal,onUpdate:({run:next})=>{if(current===generation.current&&client===currentClient.current&&controller.current===watching){accept(next);setActive(next);}}});
      if(current!==generation.current||client!==currentClient.current||controller.current!==watching)throw new Error('Workspace or watched run changed while the job was running. Reconnect to retrieve it.');
      accept(value.run);
      if(value.run.status!=='succeeded'||!value.summary)throw new Error(value.run.error?.message||`Run ${value.run.status}. The job record is retained in Service runs.`);
      return client.createRunReader(value.run,value.summary);
    } finally {if(current===generation.current&&client===currentClient.current&&controller.current===watching){controller.current=undefined;setActive(undefined);}}
  };
  const submit=async(scenario:ScenarioDefinition,revision:number,sourceInputHash?:string)=>{
    if(!client||client!==currentClient.current)throw new Error('No workspace service is connected.');
    const current=generation.current;
    // Look up frozen lineage on the server; never rebuild it from a changed live model.
    const source=sourceInputHash?(await client.findRunByInputHash(sourceInputHash)).run:undefined;
    if(current!==generation.current||client!==currentClient.current)throw new Error('Workspace changed before submission. The draft was not submitted to another workspace.');
    if(sourceInputHash&&!source)throw new Error('This frozen result was not found in the connected service. Return to its original workspace to rerun it; the live model will not be substituted.');
    const run=await client.submitRun(scenario,revision,{sourceRunId:source?.id});
    if(current!==generation.current||client!==currentClient.current)throw new Error('Workspace changed during submission. Reconnect to the original service to retrieve its job.');
    return wait(run);
  };
  const resume=async(run:PlatformRun)=>wait(run);
  const retry=async(run:PlatformRun)=>{
    if(!client||client!==currentClient.current)throw new Error('Reconnect first.');
    const current=generation.current;
    const retried=await client.retryRun(run.id);
    if(current!==generation.current||client!==currentClient.current)throw new Error('Workspace changed during retry. Reconnect to its original service to retrieve the job.');
    return wait(retried);
  };
  const cancel=async(id=active?.id)=>{
    if(!client||client!==currentClient.current||!id)return;setError('');
    const current=generation.current;
    try{const next=await client.cancelRun(id);if(current===generation.current&&client===currentClient.current){accept(next);if(active?.id===id)setActive(next);}}
    catch(reason){if(current===generation.current&&client===currentClient.current)setError(reason instanceof Error?reason.message:'Cancellation could not be confirmed. The job may still be running.');}
  };
  return {runs,error,loading,active,refresh,more,nextCursor,submit,resume,retry,cancel};
}

export function ServiceRunHistory({jobs,onOpen,busy}:{jobs:ReturnType<typeof useServiceRuns>;onOpen:(run:PlatformRun,retry?:boolean)=>void;busy:boolean}) {
  return <section className="service-run-list" aria-label="Durable service runs"><div className="impact-table-heading"><div><h2>Service runs</h2><p>Jobs survive browser closure. Reopen a completed result or resume watching a queued job.</p></div><button type="button" className="button secondary" onClick={()=>void jobs.refresh()} disabled={jobs.loading}>{jobs.loading?'Loading…':'Refresh runs'}</button></div>
    {jobs.error&&<p role="alert" className="form-error">{jobs.error}</p>}
    {!jobs.runs.length&&!jobs.loading&&<p>No service runs yet. Create a scenario in this connected workspace.</p>}
    {jobs.runs.map(run=><article key={run.id} className="service-run-row"><div><strong>{run.scenario.name}</strong><small>{new Date(run.createdAt).toLocaleString()} · revision {run.workspaceRevision} · attempt {run.attempt}</small>{run.error&&<small className="is-risk">{run.error.message}</small>}</div><span className="service-run-status">{run.status}{run.cancelRequested&&run.status!=='cancelled'?' · cancellation requested':''}</span><div className="service-run-actions">{(run.status==='queued'||run.status==='running')&&<><button className="button secondary" type="button" disabled={busy} onClick={()=>onOpen(run)}>Watch run</button><button className="button secondary" type="button" disabled={run.cancelRequested} onClick={()=>void jobs.cancel(run.id)}>Cancel</button></>}{run.status==='succeeded'&&<button className="button secondary" type="button" disabled={busy} onClick={()=>onOpen(run)}>Open result</button>}{(run.status==='failed'||run.status==='cancelled')&&<button className="button secondary" type="button" disabled={busy} onClick={()=>onOpen(run,true)}>Retry frozen run</button>}</div></article>)}
    {jobs.nextCursor&&<button type="button" className="button secondary" disabled={jobs.loading} onClick={()=>void jobs.more()}>{jobs.loading?'Loading saved runs…':'Load more runs'}</button>}
  </section>;
}
