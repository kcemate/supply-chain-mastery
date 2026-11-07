import type { RunInputV2 } from './flywayTypes';
import type { RunResultReader, RunSummaryV2, StoredScenario } from './runArtifacts';
import { isScenarioReference } from './runArtifacts';
import { decodeRunInput } from './schemaDecoders';
import { decodeRunSummary } from './runArtifactDecoders';
import { contentHash } from './engine/canonical';

/** A summary and explicit frozen map input, never a full in-memory period trace. */
export interface RunResultView extends RunSummaryV2 {
  input: RunInputV2;
  reader: RunResultReader;
}

export async function openRunView(reader: RunResultReader, signal?: AbortSignal): Promise<RunResultView> {
  const summary=decodeRunSummary(reader.summary);
  if(!summary.ok)throw new Error('The saved run summary is invalid. No current-model values have been substituted.');
  const input = await reader.input(signal);
  if (signal?.aborted) throw signal.reason || new DOMException('Aborted', 'AbortError');
  if(!decodeRunInput(input).ok||contentHash(input)!==reader.summary.inputHash)throw new Error('The saved input failed its frozen identity check. Do not use this result; reopen the original workspace or restore its verified artifacts.');
  return { ...reader.summary, input, reader };
}

export function savedScenarioMetrics(saved: StoredScenario) {
  return isScenarioReference(saved) ? saved.latestRun.scenario : saved.result.scenario;
}
