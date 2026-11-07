import type { RunInputV2,ScenarioDefinition } from './flywayTypes';
/** One discoverable draft per workspace, including every frozen-source dependency. */
export interface DecisionDraft {
  schemaVersion:1;
  kind:'new'|'frozen';
  scenario:ScenarioDefinition;
  sourceInput?:RunInputV2;
  sourceInputHash?:string;
}
