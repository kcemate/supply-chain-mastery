import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bot, Database, Plus, Settings2, Sparkles, X } from 'lucide-react';
import { answerSavedModelQuestion, type ModelAnswer } from './modelAssistant';
import type { RunResultView } from './runResultView';
import type { PublicDistributionFacilityRegistry, ScenarioResult, TwinLocation } from './flywayTypes';
import type { CopilotController } from './copilotController';
import './intelligent-copilot.css';

function EvidenceText({text}:{text:string}){
  return <>{text.split(/(https?:\/\/[^\s)<>]+)/g).map((part,index)=>/^https?:\/\//.test(part)?<a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>:part)}</>;
}

export function FlywayCopilot(props:{result?:RunResultView;locations:TwinLocation[];facilities?:PublicDistributionFacilityRegistry;onClose:()=>void;onSelect:(id:string)=>void;open:boolean;controller?:CopilotController;onOpenRun?:(id:string)=>void;onDecisions?:()=>void;onConfigure?:()=>void;initialPrompt?:{id:string;text:string}}) {
  if(props.controller)return <ConnectedCopilot {...props} controller={props.controller}/>;
  return <ModelToolCopilot {...props}/>;
}

function ConnectedCopilot({result,open,onClose,controller,onOpenRun,onDecisions,onConfigure,initialPrompt}:{result?:RunResultView;open:boolean;onClose:()=>void;controller:CopilotController;onOpenRun?:(id:string)=>void;onDecisions?:()=>void;onConfigure?:()=>void;initialPrompt?:{id:string;text:string}}){
  const [prompt,setPrompt]=useState(initialPrompt?.text||'');
  const [conversationId,setConversationId]=useState(controller.conversations[0]?.id||'');
  const [mode,setMode]=useState<'ai'|'model-tools'>(controller.providerStatus.configured?'ai':'model-tools');
  const [sending,setSending]=useState(false);
  const historyRef=useRef<HTMLDivElement>(null);
  const conversation=controller.conversations.find(item=>item.id===conversationId);
  const messages=conversation?.messages||[];
  const busy=sending||!!controller.busy;
  useEffect(()=>{if(initialPrompt)setPrompt(initialPrompt.text);},[initialPrompt?.id]);
  useEffect(()=>{if(controller.providerStatus.configured)setMode('ai');},[controller.providerStatus.configured]);
  useEffect(()=>{if(conversationId&&!controller.conversations.some(item=>item.id===conversationId))setConversationId('');},[controller.conversations,conversationId]);
  useEffect(()=>{historyRef.current?.scrollTo({top:historyRef.current.scrollHeight,behavior:'auto'});},[messages.length]);
  const send=async(text=prompt)=>{
    if(!text.trim()||busy)return;
    setSending(true);
    try{const id=await controller.ask(text,conversationId||undefined,mode,result);if(id){setConversationId(id);setPrompt('');}}
    finally{setSending(false);}
  };
  return <aside className="detail-drawer copilot-drawer intelligent-copilot t-panel-slide" data-open={open} role="dialog" aria-modal="true" aria-label="Flyway copilot">
    <div className="drawer-header"><Bot size={23}/><div><h2>Ask Flyway</h2><p>{result?'Frozen scenario context':'Current planning model'}</p></div><button type="button" className="icon-button" aria-label="Close copilot" onClick={onClose}><X size={19}/></button></div>
    <div className="copilot-workspace-tools">
      <label><span>Conversation</span><select aria-label="Saved conversation" value={conversationId} disabled={busy} onChange={event=>setConversationId(event.target.value)}><option value="">New conversation</option>{controller.conversations.map(item=><option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <button type="button" className="icon-button" aria-label="New conversation" disabled={busy} onClick={()=>{setConversationId('');setPrompt('');}}><Plus size={17}/></button>
      <label className="copilot-mode"><span>Assistant</span><select aria-label="Assistant mode" value={mode} disabled={busy} onChange={event=>setMode(event.target.value as 'ai'|'model-tools')}><option value="ai" disabled={!controller.providerStatus.configured}>AI + model tools</option><option value="model-tools">Model tools</option></select></label>
    </div>
    <div className="copilot-connection-state"><Database size={15}/><span>{controller.providerStatus.configured?`OpenAI · ${controller.providerStatus.model}`:'Model tools available · AI connection needed'}</span><button type="button" className="icon-button" aria-label="Configure AI connection" onClick={onConfigure}><Settings2 size={16}/></button></div>
    <div className="drawer-body copilot-body" ref={historyRef}>
      {!messages.length&&<div className="copilot-intro"><Sparkles size={23}/><div><h3>From a question to a decision</h3><p>Explore risk, test a change, compare alternatives and review the evidence before acting.</p>{!controller.providerStatus.configured&&<p>Real AI needs a configured workspace service. Model tools can calculate scenarios and maintain your decision queue now.</p>}</div></div>}
      <div className="suggested-prompts">{['Analyze the planning model and create decisions.','Which products run out first and on which dates?','Test a 20% demand surge.','Compare the last two saved scenarios.','Show official sources for Mebane.','Which inputs are synthetic?'].map(question=><button type="button" key={question} disabled={busy} onClick={()=>void send(question)}>{question}<ArrowRight size={14}/></button>)}</div>
      <div className="assistant-history" aria-live="polite">{messages.map(message=>message.role==='user'?<h3 className="copilot-user-message" key={message.id}>{message.content}</h3>:<section key={message.id}><div className="copilot-answer"><div className="answer-label"><Sparkles size={15}/>{message.mode==='ai'?'AI response with model tools':'Grounded tool result'}</div><p style={{whiteSpace:'pre-line'}}><EvidenceText text={message.content}/></p>{message.tools.length>0&&<details className="answer-evidence" open><summary>Evidence and actions · {message.tools.length}</summary>{message.tools.map(tool=><div className="copilot-tool-run" key={tool.id}><strong>{tool.label} · {tool.status==='completed'?'Completed':'Failed'}</strong><small><EvidenceText text={tool.summary}/></small>{tool.runId&&<button type="button" className="button secondary" disabled={busy} onClick={()=>onOpenRun?.(tool.runId!)}>Open scenario result <ArrowRight size={13}/></button>}{tool.decisionId&&<button type="button" className="button secondary" disabled={busy} onClick={onDecisions}>Review decision <ArrowRight size={13}/></button>}</div>)}</details>}<p className="assistant-limitation">Calculated results use editable model assumptions. Public facts retain their sources.</p></div></section>)}</div>
    </div>
    {busy&&<p className="copilot-operation" role="status">{controller.busy||'Preparing your response…'}</p>}
    {controller.error&&<p className="form-error copilot-operation" role="alert">{controller.error}</p>}
    <form className="copilot-composer" onSubmit={event=>{event.preventDefault();void send();}}><label className="sr-only" htmlFor="flyway-question">Ask Flyway</label><textarea id="flyway-question" value={prompt} maxLength={6000} disabled={busy} onChange={event=>setPrompt(event.target.value)} placeholder="Ask, test a change, or compare your options…" onKeyDown={event=>{if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();void send();}}}/><button type="submit" className="button primary" disabled={busy||!prompt.trim()}>{busy?'Working…':'Ask'}<ArrowRight size={16}/></button></form>
  </aside>;
}

function ModelToolCopilot({result,locations,facilities,onClose,onSelect,open}:{result?:RunResultView;locations:TwinLocation[];facilities?:PublicDistributionFacilityRegistry;onClose:()=>void;onSelect:(id:string)=>void;open:boolean}) {
  const [prompt,setPrompt]=useState('What is driving service risk?');
  const [history,setHistory]=useState<Array<{question:string;answer:ModelAnswer}>>([]);
  const [loading,setLoading]=useState(false),[error,setError]=useState('');
  const request=useRef<AbortController>();
  useEffect(()=>{request.current?.abort();setHistory([]);setError('');setLoading(false);return()=>request.current?.abort();},[result?.reader]);
  const ask=async(question=prompt)=>{
    if(!question.trim()||loading)return;
    const controller=new AbortController();request.current?.abort();request.current=controller;setLoading(true);setError('');
    try{const answer=await answerSavedModelQuestion(question,{result,locations,facilities},controller.signal);if(!controller.signal.aborted){setHistory(current=>[...current,{question,answer}]);setPrompt('');}}
    catch(reason){if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Saved evidence could not be retrieved. Your question is retained; retry when the service is available.');}
    finally{if(request.current===controller)setLoading(false);}
  };
  return <aside className="detail-drawer copilot-drawer t-panel-slide" data-open={open} role="dialog" aria-modal="true" aria-label="Flyway copilot">
    <div className="drawer-header"><Bot size={23}/><div><h2>Ask Flyway</h2><p>{result?`Frozen run ${result.inputHash.slice(0,12)}`:'Public evidence and model context'}</p></div><button type="button" className="icon-button" aria-label="Close copilot" onClick={onClose}><X size={19}/></button></div>
    <div className="drawer-body copilot-body"><div className="copilot-intro"><Database size={22}/><p>Answers come from inspectable evidence and model tools. Numbers are calculated by the engine. No language-model provider is connected, and this assistant cannot modify your network.</p></div><div className="suggested-prompts">{['Which products run out first and on which dates?','Show official sources for Mebane.','Which inputs are synthetic?','What should I do next?'].map(question=><button type="button" key={question} onClick={()=>ask(question)}>{question}<ArrowRight size={14}/></button>)}</div>
      <div className="assistant-history" aria-live="polite">{history.map(({question,answer},index)=><section key={index}><h3>{question}</h3><div className="copilot-answer"><div className="answer-label"><Sparkles size={15}/>Grounded tool result</div><p style={{whiteSpace:'pre-line'}}>{answer.text}</p><details className="answer-evidence" open><summary>Evidence used · {answer.tool.split('_').join(' ')}</summary>{answer.citations.map((cite,i)=><div key={i}>{cite.url?<a href={cite.url} target="_blank" rel="noreferrer">{cite.label}<ArrowRight size={13}/></a>:cite.locationId?<button type="button" onClick={()=>onSelect(cite.locationId!)}>{cite.label}</button>:<strong>{cite.label}</strong>}<small>{cite.detail}</small></div>)}{!answer.citations.length&&<p>No completed run was used.</p>}</details><p className="assistant-limitation">{answer.limitation}</p></div></section>)}</div>
    </div>
    {loading&&<p role="status">Reading the saved evidence for this question…</p>}{error&&<p role="alert">{error}</p>}
    <form className="copilot-composer" onSubmit={event=>{event.preventDefault();void ask();}}><label className="sr-only" htmlFor="flyway-question">Ask Flyway</label><textarea id="flyway-question" value={prompt} disabled={loading} onChange={e=>setPrompt(e.target.value)} placeholder="Ask about a facility, product, or run…" onKeyDown={e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)){e.preventDefault();void ask();}}}/><button type="submit" className="button primary" disabled={!prompt.trim()||loading}>{loading?'Reading…':'Ask'}<ArrowRight size={16}/></button></form>
  </aside>;
}
