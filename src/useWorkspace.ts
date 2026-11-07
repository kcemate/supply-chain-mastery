import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { initialLanes, initialLocations } from './flywayData';
import type { Lane, ScenarioDefinition, TwinLocation } from './flywayTypes';
import type { EvidenceLedger } from './evidence';
import { getLocalStore, usePersistedState, validateStoredValue } from './workspaceStorage';
import { initialPreferences, toEngineDefaults, type WorkspacePreferences } from './workspacePreferences';
import { createPlatformClient, type PlatformClient, type PlatformWorkspace } from './platformClient';
import type { SavedScenarioReferenceV2, StoredScenario } from './runArtifacts';
import { decodeSavedScenarioReference } from './runArtifactDecoders';
import { openLocalRun } from './localRunRepository';
import { contentHash } from './engine/canonical';
import type { IntelligenceState } from './intelligenceTypes';

function scenarioIdentity(value:StoredScenario|ScenarioDefinition,includeChanges=value.changes!==undefined){return {id:value.id,name:value.name,description:value.description,type:value.type,targetId:value.targetId,magnitude:value.magnitude,grain:value.grain,horizon:value.horizon,createdAt:value.createdAt,baselineRevision:value.baselineRevision,...(value.startDate===undefined?{}:{startDate:value.startDate}),...(includeChanges?{changes:value.changes}: {})};}

export interface WorkspaceDocument {
  schemaVersion:1; revision:number; locations:TwinLocation[]; lanes:Lane[];
  preferences:WorkspacePreferences; scenarios:StoredScenario[]; evidenceLedger?:EvidenceLedger; intelligence?:IntelligenceState;
}
function initialWorkspace():WorkspaceDocument {
  return {schemaVersion:1,revision:0,
    locations:getLocalStore('flyway-locations',initialLocations).getSnapshot(),
    lanes:getLocalStore('flyway-lanes',initialLanes).getSnapshot(),
    scenarios:getLocalStore<StoredScenario[]>('flyway-scenarios',[]).getSnapshot(),
    preferences:getLocalStore('flyway-preferences',initialPreferences).getSnapshot()};
}
function fromService(workspace:PlatformWorkspace):WorkspaceDocument {
  const defaults=workspace.defaults;
  const preferences=validateStoredValue('flyway-preferences',defaults.workspacePreferences)
    ? defaults.workspacePreferences as unknown as WorkspacePreferences
    : {...initialPreferences,grain:defaults.defaultGrain||initialPreferences.grain,distance:defaults.distanceUnit||initialPreferences.distance,serviceTarget:defaults.serviceTarget??initialPreferences.serviceTarget,dieselCost:(defaults.dieselCostMicrosPerGallon??Math.round(initialPreferences.dieselCost*1e6))/1e6,routingMode:defaults.routingMode||initialPreferences.routingMode,engineOverrides:defaults as unknown as WorkspacePreferences['engineOverrides']};
  const value:WorkspaceDocument={schemaVersion:1,revision:workspace.revision,locations:workspace.locations,lanes:workspace.lanes,preferences,scenarios:workspace.scenarios,evidenceLedger:workspace.evidenceLedger,intelligence:workspace.intelligence};
  if(!validateStoredValue('flyway-workspace',value))throw new Error('The service returned an unsupported workspace. Your local work is unchanged.');
  return value;
}
export function useWorkspace() {
  const initial=useMemo(initialWorkspace,[]);
  const [local,saveLocal]=usePersistedState('flyway-workspace',initial);
  const [remote,setRemote]=useState<{document:WorkspaceDocument;etag:string;id:string}|null>(null);
  const remoteRef=useRef(remote);remoteRef.current=remote;
  const clientRef=useRef<PlatformClient>();
  const [error,setError]=useState(''),[pending,setPending]=useState(0),[serviceUrl,setServiceUrl]=useState('');
  const [connectionActivity,setConnectionActivity]=useState<'connecting'|'reloading'|null>(null);
  const queue=useRef(Promise.resolve());
  const pendingRef=useRef(0),connectionGeneration=useRef(0);
  const connectionRead=useRef<AbortController>();
  useEffect(()=>()=>{connectionGeneration.current++;connectionRead.current?.abort();connectionRead.current=undefined;},[]);
  const mutate=useCallback((update:(current:WorkspaceDocument)=>WorkspaceDocument):Promise<boolean>=>{
    if(connectionRead.current){setError('Wait for the workspace connection or reload to finish before saving.');return Promise.resolve(false);}
    const generation=connectionGeneration.current;
    pendingRef.current++;
    setPending(n=>n+1);setError('');let saved=false;
    const operation=queue.current.then(async()=>{
      if(generation!==connectionGeneration.current)throw new Error('The workspace changed before this save started. Your draft was not applied to another workspace.');
      const currentRemote=remoteRef.current;
      if(!currentRemote){saved=await saveLocal(current=>({...update(current),schemaVersion:1,revision:current.revision+1}));if(!saved)setError('This change was not saved. Review the storage notice and retry.');return;}
      const next=update(currentRemote.document);
      if(!validateStoredValue('flyway-workspace',next))throw new Error('The change contains invalid fields and was not saved.');
      const client=clientRef.current;
      if(!client)throw new Error('The service connection is unavailable. Reconnect before saving; your draft is retained.');
      const response=await client.putWorkspace({locations:next.locations,lanes:next.lanes,defaults:JSON.parse(JSON.stringify({...toEngineDefaults(next.preferences),workspacePreferences:next.preferences})),scenarios:JSON.parse(JSON.stringify(next.scenarios)),evidenceLedger:next.evidenceLedger},{etag:currentRemote.etag,idempotencyKey:crypto.randomUUID()});
      if(generation!==connectionGeneration.current||client!==clientRef.current)throw new Error('The workspace changed while saving. Reconnect to its original service to confirm the saved revision.');
      const connected={document:fromService(response.workspace),etag:response.etag,id:response.workspace.id};
      remoteRef.current=connected;setRemote(connected);saved=true;
    }).catch(reason=>setError(reason instanceof Error?reason.message:'Save failed. Your draft is still available.')).finally(()=>{pendingRef.current--;setPending(n=>n-1);});
    queue.current=operation;return operation.then(()=>saved);
  },[saveLocal]);
  const saveScenarioReference=useCallback((reference:SavedScenarioReferenceV2,expectedRevision?:number):Promise<boolean>=>{
    const decoded=decodeSavedScenarioReference(reference);
    if(!decoded.ok){setError('The saved-run reference is invalid. The completed result remains open and was not added to the workspace.');return Promise.resolve(false);}
    if(connectionRead.current){setError('Wait for the workspace connection or reload to finish before saving this scenario.');return Promise.resolve(false);}
    const generation=connectionGeneration.current;
    pendingRef.current++;setPending(n=>n+1);setError('');let saved=false;
    const operation=queue.current.then(async()=>{
      if(generation!==connectionGeneration.current)throw new Error('The workspace changed before this scenario save started. The completed result remains open.');
      const currentRemote=remoteRef.current;
      if(!currentRemote){
        if(reference.resultRef.kind!=='local')throw new Error('A service run cannot be saved into the browser-only workspace. Reconnect to its service first.');
        const reader=await openLocalRun(reference.resultRef);
        if(reader.summary.runId!==reference.latestRun.runId||reader.summary.outputChecksum!==reference.latestRun.outputChecksum)throw new Error('The durable local run does not match this scenario reference. The workspace was not changed.');
        const input=await reader.input();
        const includeChanges=reference.changes!==undefined;
        if(contentHash(scenarioIdentity(reference,includeChanges))!==contentHash(scenarioIdentity(input.scenario,includeChanges)))throw new Error('The scenario definition does not match the durable run input. The workspace was not changed.');
        saved=await saveLocal(current=>{
          if(expectedRevision!==undefined&&current.revision!==expectedRevision)throw new Error('The workspace changed before this scenario reference could be saved.');
          return {...current,schemaVersion:1 as const,revision:current.revision+1,scenarios:[reference,...current.scenarios.filter(item=>item.id!==reference.id)]};
        });
        if(!saved)setError('The run artifacts are durable, but the scenario reference could not be added to this workspace. Retry Save; the completed result remains available.');
        return;
      }
      if(reference.resultRef.kind!=='service'||reference.resultRef.workspaceId!==currentRemote.id)throw new Error('This run reference belongs to a different workspace. Reopen the original service before saving.');
      if(expectedRevision!==undefined&&currentRemote.document.revision!==expectedRevision)throw new Error('The connected workspace changed before this scenario could be saved. Reload it and retry from the completed run.');
      const client=clientRef.current;if(!client)throw new Error('The service connection is unavailable. Reconnect before saving; the completed result remains open.');
      const response=await client.saveScenario(reference.resultRef.runId,currentRemote.document.revision,{idempotencyKey:crypto.randomUUID()});
      if(generation!==connectionGeneration.current||client!==clientRef.current)throw new Error('The workspace changed while saving. Reconnect to the original service to confirm the scenario reference.');
      const confirmed=decodeSavedScenarioReference(response.scenario);
      if(!confirmed.ok||confirmed.value.resultRef.kind!=='service'||confirmed.value.resultRef.workspaceId!==currentRemote.id)throw new Error('The service returned an invalid or cross-workspace scenario reference. Reload the workspace before continuing.');
      const connected={document:{...currentRemote.document,revision:response.workspaceRevision,scenarios:[confirmed.value,...currentRemote.document.scenarios.filter(item=>item.id!==confirmed.value.id)]},etag:response.etag,id:currentRemote.id};
      if(!validateStoredValue('flyway-workspace',connected.document))throw new Error('The service returned a scenario reference that is incompatible with this workspace. Reload before continuing.');
      remoteRef.current=connected;setRemote(connected);saved=true;
    }).catch(reason=>setError(reason instanceof Error?reason.message:'Scenario save failed. The completed result remains available.')).finally(()=>{pendingRef.current--;setPending(n=>n-1);});
    queue.current=operation;return operation.then(()=>saved);
  },[saveLocal]);
  const connect=async(baseUrl:string,ownerToken:string)=>{
    if(pendingRef.current||connectionRead.current)throw new Error('Wait for pending saves or connection before connecting.');
    const client=createPlatformClient({baseUrl,ownerToken});
    const generation=++connectionGeneration.current,controller=new AbortController();
    connectionRead.current=controller;setConnectionActivity('connecting');
    try {
      const response=await client.getWorkspace({signal:controller.signal});
      if(generation!==connectionGeneration.current||controller.signal.aborted)return;
      const connected={document:fromService(response.workspace),etag:response.etag,id:response.workspace.id};
      clientRef.current=client;remoteRef.current=connected;setRemote(connected);setServiceUrl(client.baseUrl);setError('');
    }catch(reason){if(generation===connectionGeneration.current&&!controller.signal.aborted)throw reason;}
    finally{if(generation===connectionGeneration.current){connectionRead.current=undefined;setConnectionActivity(null);}}
  };
  const reload=async()=>{
    if(pendingRef.current||connectionRead.current)throw new Error('Wait for pending saves or connection before reloading.');
    const client=clientRef.current;
    if(!client)return;
    const generation=++connectionGeneration.current,controller=new AbortController();
    connectionRead.current=controller;setConnectionActivity('reloading');
    try {
      const response=await client.getWorkspace({signal:controller.signal});
      if(generation!==connectionGeneration.current||controller.signal.aborted||client!==clientRef.current)return;
      const connected={document:fromService(response.workspace),etag:response.etag,id:response.workspace.id};
      remoteRef.current=connected;setRemote(connected);setError('');
    }catch(reason){if(generation===connectionGeneration.current&&!controller.signal.aborted)throw reason;}
    finally{if(generation===connectionGeneration.current){connectionRead.current=undefined;setConnectionActivity(null);}}
  };
  const disconnect=()=>{
    if(pendingRef.current){setError('Wait for pending saves before changing workspace.');return;}
    connectionGeneration.current++;connectionRead.current?.abort();connectionRead.current=undefined;
    clientRef.current=undefined;remoteRef.current=null;setRemote(null);setConnectionActivity(null);setServiceUrl('');setError('');
  };
  return {document:remote?.document||local,mutate,saveScenarioReference,connect,disconnect,reload,client:clientRef.current,connected:!!remote,pending,connectionActivity,error,setError,serviceUrl,baselineRevision:remote?`${remote.id}:r${remote.document.revision}`:`local:r${local.revision}`};
}
