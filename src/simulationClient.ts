import type { EngineDefaults,Lane,RunInputV2,ScenarioDefinition,ScenarioResult,TwinLocation,TwinMetrics } from './flywayTypes';
import type { calculateMetrics, RunInputLineageOptions } from './flywayEngine';
export type SimulationPreview = ReturnType<typeof calculateMetrics>;
export type SimulationLineage = Pick<RunInputLineageOptions, 'sourceVersions' | 'routeVersions' | 'forecastVersions' | 'warningsAcknowledged'>;
export type SimulationRequest={kind:'metrics'|'scenario';locations:TwinLocation[];lanes:Lane[];scenario?:ScenarioDefinition;defaults:EngineDefaults;lineage?:SimulationLineage}|{kind:'frozen';input:RunInputV2};
export function simulateAsync(request:SimulationRequest,signal?:AbortSignal):Promise<ScenarioResult|SimulationPreview> {
  return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(new DOMException('Run cancelled','AbortError'));return;}
    const worker=new Worker(new URL('./simulation.worker.ts',import.meta.url),{type:'module'});
    const finish=()=>{worker.terminate();signal?.removeEventListener('abort',cancel);};
    const cancel=()=>{finish();reject(new DOMException('Run cancelled','AbortError'));};
    signal?.addEventListener('abort',cancel,{once:true});
    worker.onmessage=event=>{finish();event.data.error?reject(new Error(event.data.error)):resolve(event.data.result);};
    worker.onerror=event=>{finish();reject(new Error(event.message||'The simulation worker failed. Your model is unchanged.'));};
    worker.postMessage({...request,id:crypto.randomUUID()});
  });
}
