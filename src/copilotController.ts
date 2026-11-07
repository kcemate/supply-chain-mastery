import type { CopilotConversation, CopilotProviderStatus } from './intelligenceTypes';
import type { RunResultView } from './runResultView';

export interface CopilotController {
  conversations:CopilotConversation[];
  providerStatus:CopilotProviderStatus;
  busy:string;
  error:string;
  ask:(message:string,conversationId?:string,mode?:'ai'|'model-tools',activeResult?:RunResultView)=>Promise<string|undefined>;
}
