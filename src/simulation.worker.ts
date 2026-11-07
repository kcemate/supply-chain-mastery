import { calculateMetrics, createRunInput, runInput } from './flywayEngine';
import type { SimulationRequest } from './simulationClient';
type Request=SimulationRequest&{id:string};
self.onmessage=(event:MessageEvent<Request>)=>{
  const {id,kind}=event.data;
  try {let result;if(event.data.kind==='frozen')result=runInput(event.data.input);else {const {locations,lanes,scenario,defaults,lineage}=event.data;result=kind==='metrics'?calculateMetrics(locations,lanes,undefined,defaults):runInput(createRunInput(locations,lanes,scenario!,defaults,lineage));}self.postMessage({id,result});}
  catch(error){self.postMessage({id,error:error instanceof Error?error.message:'Simulation failed'});}
};
