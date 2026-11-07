import type { ScenarioChange, TwinMetrics } from './flywayTypes';

export interface DecisionPolicy {
  autonomyEnabled: boolean;
  maxCapacityIncreasePct: number;
  maxCostIncreasePct: number;
  maxLocations: number;
  minServiceGainPp: number;
}
export type DecisionStatus = 'awaiting-human' | 'applied' | 'rejected' | 'deferred' | 'superseded';
export type DecisionResolution = 'approve' | 'reject' | 'defer';
export interface DecisionEvent { id:string; at:string; actor:'ai'|'rules'|'human'; action:string; reason:string; }
export interface DecisionRecord {
  id:string; title:string; summary:string; rationale:string;
  createdAt:string; updatedAt:string; createdBy:'ai'|'rules'|'human';
  status:DecisionStatus; authority:'ai'|'human'; risk:'low'|'high';
  networkHash:string; proposal:ScenarioChange[];
  before:TwinMetrics; after:TwinMetrics;
  evidence:{ runId:string; candidateRunId?:string; inputHash:string; outputChecksum:string; candidateInputHash:string; candidateOutputChecksum:string; engineVersion:string; };
  policyReasons:string[]; history:DecisionEvent[];
  appliedNetworkHash?:string;
}
export interface DecisionCandidateDefinition {
  id:string;
  title:string;
  summary:string;
  rationale:string;
  proposal:ScenarioChange[];
  affectedLocationIds:string[];
}
export interface CopilotToolRun { id:string; name:string; label:string; status:'completed'|'failed'; summary:string; runId?:string; decisionId?:string; }
export interface CopilotMessage { id:string; role:'user'|'assistant'; content:string; createdAt:string; mode:'ai'|'model-tools'; tools:CopilotToolRun[]; }
export interface CopilotConversation { id:string; title:string; createdAt:string; updatedAt:string; messages:CopilotMessage[]; }
export interface IntelligenceState { schemaVersion:1; revision:number; policy:DecisionPolicy; decisions:DecisionRecord[]; conversations:CopilotConversation[]; }
export interface CopilotProviderStatus { configured:boolean; provider:'openai'; model:string|null; detail:string; }
export interface IntelligenceResponse { state:IntelligenceState; workspaceRevision:number; }
export interface CopilotRequest { message:string; conversationId?:string; expectedRevision:number; activeRunId?:string; mode?:'ai'|'model-tools'; }
export interface CopilotResponse extends IntelligenceResponse { conversationId:string; }
