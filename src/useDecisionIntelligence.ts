import { useEffect, useRef, useState } from 'react';
import type { CopilotController } from './copilotController';
import type { CopilotConversation, CopilotMessage, CopilotProviderStatus, CopilotToolRun, DecisionPolicy, DecisionResolution, IntelligenceState } from './intelligenceTypes';
import { candidateInputFor, createIntelligenceState, generateDecisionCandidates, networkFingerprint, recordEvaluatedDecision, resolveDecision, validateIntelligenceState, type DecisionNetwork } from './decisionIntelligence';
import type { useWorkspace, WorkspaceDocument } from './useWorkspace';
import { toEngineDefaults } from './workspacePreferences';
import { createRunInput } from './flywayEngine';
import type { PublicDistributionFacilityRegistry, ScenarioDefinition, ScenarioResult } from './flywayTypes';
import { simulateAsync } from './simulationClient';
import { openLocalRun, persistLocalRun, createLocalScenarioReference } from './localRunRepository';
import { answerSavedModelQuestion } from './modelAssistant';
import { isScenarioReference } from './runArtifacts';

type Workspace = ReturnType<typeof useWorkspace>;
const disconnectedProvider:CopilotProviderStatus={configured:false,provider:'openai',model:null,detail:'Connect a workspace service with an AI provider configured to use real AI. Calculated model tools are available in this browser.'};
const makeTool=(name:string,label:string,summary:string,extra:Partial<CopilotToolRun>={}):CopilotToolRun=>({id:crypto.randomUUID(),name,label,status:'completed',summary,...extra});
function networkOf(document:WorkspaceDocument):DecisionNetwork{return {locations:document.locations,lanes:document.lanes,defaults:toEngineDefaults(document.preferences)};}
function baselineScenario(network:DecisionNetwork):ScenarioDefinition{
  const hash=networkFingerprint(network);
  return {id:`decision-analysis-${hash.slice(0,20)}`,name:'Decision analysis baseline',description:'No-change planning-model baseline for evaluated decisions.',type:'price-change',targetId:'network',magnitude:0,grain:'daily',horizon:14,startDate:network.defaults.startDate,createdAt:`${network.defaults.startDate}T00:00:00.000Z`,baselineRevision:`model-${hash.slice(0,16)}`,changes:[]};
}
async function persistResult(result:ScenarioResult,signal:AbortSignal){
  try{const reader=await openLocalRun({kind:'local',runId:result.runId},{signal});if(reader.summary.inputHash!==result.inputHash||reader.summary.outputChecksum!==result.outputChecksum)throw new Error('Stored result identity conflicts with this calculation.');return reader;}
  catch(reason){if(!(reason instanceof Error)||!reason.message.includes('was not found'))throw reason;}
  return persistLocalRun(result,{signal});
}

/** One workspace transaction saves a local model application and its decision record. */
export function useDecisionIntelligence(workspace:Workspace,facilities?:PublicDistributionFacilityRegistry){
  const current=useRef(workspace);current.current=workspace;
  const context=workspace.connected?`${workspace.serviceUrl}:${workspace.baselineRevision.split(':r')[0]}`:'local';
  const contextRef=useRef(context);contextRef.current=context;
  const active=useRef<AbortController>();
  const [busy,setBusy]=useState(''),[error,setError]=useState('');
  const [providerStatus,setProviderStatus]=useState<CopilotProviderStatus>(disconnectedProvider);
  const state=workspace.document.intelligence||createIntelligenceState();
  useEffect(()=>{active.current?.abort();active.current=undefined;setBusy('');setError('');setProviderStatus(disconnectedProvider);},[context]);
  useEffect(()=>()=>active.current?.abort(),[]);
  const refreshProvider=async()=>{
    const client=current.current.client,scope=contextRef.current;
    if(!client){setProviderStatus(disconnectedProvider);return;}
    try{const status=await client.copilotStatus();if(scope===contextRef.current&&client===current.current.client)setProviderStatus(status);}
    catch(reason){if(scope===contextRef.current)setProviderStatus({...disconnectedProvider,detail:reason instanceof Error?reason.message:'The AI service status could not be read. Retry the connection.'});}
  };
  useEffect(()=>{void refreshProvider();},[workspace.client,context]);
  const operation=async<T,>(label:string,work:(signal:AbortSignal,scope:string)=>Promise<T>,throwOnError=false):Promise<T|undefined>=>{
    if(active.current){const conflict=new Error('Wait for the current analysis or save to finish.');setError(conflict.message);if(throwOnError)throw conflict;return;}
    const controller=new AbortController(),scope=contextRef.current;active.current=controller;setBusy(label);setError('');
    try{return await work(controller.signal,scope);}
    catch(reason){if(!controller.signal.aborted&&scope===contextRef.current)setError(reason instanceof Error?reason.message:'The operation was not saved. Retry with your current model.');if(throwOnError)throw reason;}
    finally{if(active.current===controller){active.current=undefined;setBusy('');}}
  };
  const assertContext=(scope:string,signal:AbortSignal)=>{if(signal.aborted||scope!==contextRef.current)throw new DOMException('The workspace changed. This response was not applied.','AbortError');};
  const serviceOperation=async<T,>(request:()=>Promise<T>,scope:string,signal:AbortSignal):Promise<T>=>{
    try{const response=await request();assertContext(scope,signal);await current.current.reload();return response;}
    catch(reason){
      assertContext(scope,signal);
      let refreshed=false;
      try{await current.current.reload();assertContext(scope,signal);refreshed=true;}catch{assertContext(scope,signal);}
      const detail=reason instanceof Error?reason.message:'The service request did not finish.';
      throw new Error(`${detail} ${refreshed?'Workspace status was refreshed.':'Current status could not be confirmed; reload the service workspace.'} Tool actions may already be saved. Review Decision Intelligence and saved runs before retrying.`);
    }
  };
  const runLocalAnalysis=async(signal:AbortSignal,scope:string)=>{
    const start=current.current.document,startNetwork=networkOf(start),originalHash=networkFingerprint(startNetwork),originalState=start.intelligence||createIntelligenceState();
    let network=startNetwork,nextState=originalState;
    let source=await simulateAsync({kind:'frozen',input:createRunInput(network.locations,network.lanes,baselineScenario(network),network.defaults)},signal) as ScenarioResult;
    const definitions=generateDecisionCandidates(source,network,nextState);
    for(let index=0;index<definitions.length;index++){
      assertContext(scope,signal);setBusy(`Evaluating decision ${index+1} of ${definitions.length}…`);
      if(networkFingerprint(network)!==networkFingerprint({locations:source.input!.locations,lanes:source.input!.lanes,defaults:source.input!.defaults}))source=await simulateAsync({kind:'frozen',input:createRunInput(network.locations,network.lanes,baselineScenario(network),network.defaults)},signal) as ScenarioResult;
      const candidate=definitions[index];
      const evaluated=await simulateAsync({kind:'frozen',input:candidateInputFor(source,candidate)},signal) as ScenarioResult;
      await persistResult(source,signal);await persistResult(evaluated,signal);
      const recorded=recordEvaluatedDecision({state:nextState,network,sourceResult:source,candidate,candidateResult:evaluated});
      nextState=recorded.state;network={locations:recorded.locations,lanes:recorded.lanes,defaults:recorded.defaults};
    }
    assertContext(scope,signal);
    const saved=await current.current.mutate(document=>{
      if(networkFingerprint(networkOf(document))!==originalHash||(document.intelligence?.revision||0)!==originalState.revision)throw new Error('The model or decision queue changed during analysis. Rerun against the latest revision.');
      return {...document,locations:network.locations,lanes:network.lanes,intelligence:nextState};
    });
    if(!saved)throw new Error(current.current.error||'Decision analysis was calculated but could not be saved. The planning model is unchanged.');
    return nextState;
  };
  const analyze=()=>operation('Analyzing the planning model…',async(signal,scope)=>{
    const client=current.current.client;
    if(client)await serviceOperation(()=>client.analyzeDecisions(current.current.document.intelligence?.revision||0,{signal}),scope,signal);
    else await runLocalAnalysis(signal,scope);
  });
  const resolve=(id:string,action:DecisionResolution,reason:string)=>operation('Saving your decision…',async(signal,scope)=>{
    const client=current.current.client;
    if(client)await serviceOperation(()=>client.resolveDecision(id,action,reason,current.current.document.intelligence?.revision||0,{signal}),scope,signal);
    else {
      const saved=await current.current.mutate(document=>{const result=resolveDecision({state:document.intelligence||createIntelligenceState(),network:networkOf(document),decisionId:id,resolution:action,reason});return {...document,locations:result.locations,lanes:result.lanes,intelligence:result.state};});
      if(!saved)throw new Error('The decision was not saved. Keep your reason and retry after resolving the workspace error.');
    }
  },true);
  const updatePolicy=(policy:DecisionPolicy)=>operation('Saving decision rules…',async(signal,scope)=>{
    const client=current.current.client;
    if(client)await serviceOperation(()=>client.updateDecisionPolicy(policy,current.current.document.intelligence?.revision||0,{signal}),scope,signal);
    else {const saved=await current.current.mutate(document=>{const previous=document.intelligence||createIntelligenceState();return {...document,intelligence:validateIntelligenceState({...previous,revision:previous.revision+1,policy})};});if(!saved)throw new Error('Decision rules were not saved. Retry after resolving the workspace error.');}
  },true);
  const appendConversation=async(message:string,text:string,tools:CopilotToolRun[],conversationId:string|undefined,scope:string,signal:AbortSignal)=>{
    const id=conversationId||crypto.randomUUID(),at=new Date().toISOString();
    assertContext(scope,signal);
    const saved=await current.current.mutate(document=>{
      const previous=document.intelligence||createIntelligenceState();
      const existing=previous.conversations.find(item=>item.id===id);
      if(conversationId&&!existing)throw new Error('This conversation no longer exists in the current workspace. Start a new conversation.');
      if((existing?.messages.length||0)>=200)throw new Error('This conversation has reached 100 exchanges. Start a new conversation to continue.');
      const messages:CopilotMessage[]=[{id:crypto.randomUUID(),role:'user',content:message,createdAt:at,mode:'model-tools',tools:[]},{id:crypto.randomUUID(),role:'assistant',content:text,createdAt:at,mode:'model-tools',tools}];
      const conversation:CopilotConversation={id,title:existing?.title||message.slice(0,90),createdAt:existing?.createdAt||at,updatedAt:at,messages:[...(existing?.messages||[]),...messages]};
      return {...document,intelligence:validateIntelligenceState({...previous,revision:previous.revision+1,conversations:[conversation,...previous.conversations.filter(item=>item.id!==id)]})};
    });
    if(!saved)throw new Error('The response could not be saved. Your question is retained; retry after resolving storage.');
    return id;
  };
  const ask:CopilotController['ask']=(message,conversationId,mode='model-tools',activeResult)=>operation(mode==='ai'?'AI is working with your model…':'Reading calculated model tools…',async(signal,scope)=>{
    const client=current.current.client;
    if(client){
      const locator=activeResult?.reader.locator;
      const response=await serviceOperation(()=>client.askCopilot({message,conversationId,mode,expectedRevision:current.current.document.intelligence?.revision||0,activeRunId:locator?.kind==='service'?locator.runId:undefined},{signal}),scope,signal);
      return response.conversationId;
    }
    if(mode==='ai')throw new Error('Connect a workspace service to use real AI.');
    const q=message.toLowerCase();let text='',tools:CopilotToolRun[]=[];
    const decision=current.current.document.intelligence?.decisions.find(item=>q.includes(item.id.toLowerCase()));
    if(decision){
      text=`${decision.title}\n\n${decision.summary}\n\n${decision.rationale}\n\nMeasured service: ${decision.before.serviceLevel.toFixed(1)}% → ${decision.after.serviceLevel.toFixed(1)}%. Unmet demand: ${decision.before.stockoutUnits.toLocaleString()} → ${decision.after.stockoutUnits.toLocaleString()} units. Modeled landed cost: $${Math.round(decision.before.totalLandedCost).toLocaleString()} → $${Math.round(decision.after.totalLandedCost).toLocaleString()}. Capacity investment and implementation costs are excluded.\n\nRouting: ${decision.policyReasons.join(' ')}\nStatus: ${decision.status}. ${decision.authority==='human'?'A human must record a reason in Decision Intelligence to apply or reject this proposal.':'A bounded policy rule applied this planning-model change; it was not an external operating action.'}`;
      tools=[makeTool('get_decision','Saved decision and calculation evidence',`Engine ${decision.evidence.engineVersion} · candidate input ${decision.evidence.candidateInputHash} · candidate output ${decision.evidence.candidateOutputChecksum}`,{decisionId:decision.id,runId:decision.evidence.candidateRunId||decision.evidence.runId})];
    }else if(/(analy[sz]e.*(model|network|decision)|create decisions|decision queue)/.test(q)){
      const analyzed=await runLocalAnalysis(signal,scope);
      text=`Analysis evaluated actual model changes. ${analyzed.decisions.filter(item=>item.status==='awaiting-human').length} decisions await human judgment; ${analyzed.decisions.filter(item=>item.status==='applied').length} decisions have been applied. Open Decision Intelligence to inspect measured impacts, rules and history.`;
      tools=[makeTool('analyze_decisions','Evaluated decision analysis',text,{decisionId:analyzed.decisions[0]?.id})];
    }else if(/(compare|last two|previous two)/.test(q)){
      const saved=current.current.document.scenarios.slice(0,2);
      if(saved.length<2)text='Save at least two scenarios, then ask me to compare them. Each comparison uses its frozen run metrics.';
      else {const summaries=saved.map(item=>isScenarioReference(item)?item.latestRun:item.result);text=saved.map((item,index)=>`${item.name}: ${summaries[index].scenario.serviceLevel.toFixed(1)}% service, ${summaries[index].scenario.stockoutUnits.toLocaleString()} unmet units, $${Math.round(summaries[index].scenario.totalLandedCost).toLocaleString()} total modeled cost.`).join('\n\n');text+=`\n\nService difference: ${(summaries[0].scenario.serviceLevel-summaries[1].scenario.serviceLevel).toFixed(1)} percentage points. Different horizons or assumptions can limit direct comparison.`;tools=saved.map((item,index)=>makeTool('compare_runs','Saved scenario comparison',`${item.name} · input ${summaries[index].inputHash}`,{runId:isScenarioReference(item)?item.resultRef.runId:item.result.runId}));}
    }else if(/(test|simulate|what if|run a|run.*scenario)/.test(q)){
      const network=activeResult?{locations:activeResult.input.locations,lanes:activeResult.input.lanes,defaults:activeResult.input.defaults}:networkOf(current.current.document);
      const magnitude=Number(q.match(/(\d+(?:\.\d+)?)\s*%/)?.[1]||20);
      if(!Number.isFinite(magnitude)||magnitude<1||magnitude>100)throw new Error('Choose a scenario magnitude from 1% to 100%.');
      const type=/demand|surge/.test(q)?'demand-surge':/supplier/.test(q)?'supplier-failure':/weather/.test(q)?'severe-weather':/price|cost/.test(q)?'price-change':/capacity/.test(q)?'capacity-constraint':/(dc|distribution.center).*outage|outage.*(dc|distribution.center)/.test(q)?'dc-outage':undefined;
      if(!type)throw new Error('Model tools can test a demand surge, supplier failure, DC outage, severe weather, price change or capacity change. Name the change and location, or use the scenario editor for detailed changes.');
      const eligible=network.locations.filter(item=>type==='demand-surge'?item.type==='restaurant':type==='supplier-failure'?item.type==='supplier':type==='dc-outage'||type==='capacity-constraint'?item.type==='dc':true);
      const named=eligible.find(item=>q.includes(item.name.toLowerCase())||q.includes(item.city.toLowerCase()));
      const target=named||[...eligible].sort((left,right)=>left.id.localeCompare(right.id))[0];
      if(!target)throw new Error('There is no compatible modeled location for that scenario. Add a location first.');
      const increaseCapacity=type==='capacity-constraint'&&/increas|expand|add|more/.test(q);
      const label=increaseCapacity?'capacity increase':type.replace(/-/g,' ');
      const at=new Date().toISOString();const scenario:ScenarioDefinition={id:crypto.randomUUID(),name:`Copilot · ${label} · ${target.city}`,description:message,type,targetId:target.id,magnitude:['dc-outage','supplier-failure'].includes(type)?100:magnitude,grain:'daily',horizon:14,startDate:network.defaults.startDate,createdAt:at,baselineRevision:`model-${networkFingerprint(network).slice(0,16)}`,...(increaseCapacity?{changes:[{id:crypto.randomUUID(),kind:'adjust-capacity' as const,locationId:target.id,multiplier:1+magnitude/100,effectiveDay:0}]}:{})};
      const output=await simulateAsync({kind:'scenario',locations:network.locations,lanes:network.lanes,defaults:network.defaults,scenario},signal) as ScenarioResult;
      const reader=await persistResult(output,signal),reference=createLocalScenarioReference(scenario,reader);
      assertContext(scope,signal);
      if(!await current.current.saveScenarioReference(reference))throw new Error('The calculation completed, but its saved-scenario reference failed. Retry after resolving storage.');
      text=`Saved a 14-day ${label} scenario for ${target.name}${named?'':', selected as the first compatible location in ID order'}. Modeled service is ${output.scenario.serviceLevel.toFixed(1)}%, compared with ${output.baseline.serviceLevel.toFixed(1)}% baseline; unmet demand is ${output.scenario.stockoutUnits.toLocaleString()} units. The planning baseline is unchanged.`;
      tools=[makeTool('run_scenario','Calculated and saved scenario',text,{runId:output.runId})];
    }else {
      const answer=await answerSavedModelQuestion(message,{result:activeResult,locations:activeResult?.input.locations||current.current.document.locations,facilities},signal);
      text=answer.text;tools=[makeTool(answer.tool,'Evidence and model query',answer.citations.map(item=>`${item.label}: ${item.detail}${item.url?` (${item.url})`:''}`).join('\n')||answer.limitation)];
    }
    return appendConversation(message,text,tools,conversationId,scope,signal);
  });
  return {state,busy,error,providerStatus,refreshProvider,analyze,resolve,updatePolicy,ask,conversations:state.conversations} satisfies CopilotController&Record<string,unknown>;
}
