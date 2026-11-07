import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initialLanes, initialLocations, syntheticEvidence } from '../src/flywayData';
import { createPlatformClient, PlatformRequestError } from '../src/platformClient';
import { FilePlatformStore } from '../server/fileStore';
import { closeServer, createPlatformHttpServer, listenOnRandomLoopback } from '../server/httpServer';
import { OpenAiCopilotProvider, UnconfiguredCopilotProvider } from '../server/openAiCopilot';
import { PlatformService } from '../server/platformService';

const ownerToken = 'decision-backend-owner-token-32-characters';

let providerCalls = 0;
const provider = new OpenAiCopilotProvider({
  apiKey: 'test-key-never-sent-to-a-real-provider',
  baseUrl: 'http://127.0.0.1:9999/v1',
  model: 'test-model',
  fetch: (async (_url: RequestInfo | URL, options?: RequestInit) => {
    providerCalls += 1;
    const headers = new Headers(options?.headers);
    assert.equal(headers.get('authorization'), 'Bearer test-key-never-sent-to-a-real-provider');
    const body = JSON.parse(String(options?.body)) as { store: boolean; parallel_tool_calls: boolean; max_output_tokens: number; input: unknown[] };
    assert.equal(body.store, false);
    assert.equal(body.parallel_tool_calls, false);
    assert.equal(body.max_output_tokens, 1_200);
    if (providerCalls === 1) return new Response(JSON.stringify({ id: 'response-1', output: [{ type: 'function_call', call_id: 'call-1', name: 'get_network_summary', arguments: '{}' }] }), { status: 200 });
    assert.ok(body.input.some((item) => (item as { type?: string }).type === 'function_call_output'));
    return new Response(JSON.stringify({ id: 'response-2', output_text: 'The grounded network summary is ready.', output: [] }), { status: 200 });
  }) as typeof fetch,
});
const providerReply = await provider.respond({
  messages: [{ id: 'user-1', role: 'user', content: 'Summarize the network', createdAt: new Date().toISOString(), mode: 'ai', tools: [] }],
  gateway: { execute: async (name) => ({ output: { locationCount: 9 }, run: { id: 'tool-1', name, label: 'Read network summary', status: 'completed', summary: 'Read 9 locations.' } }) },
});
assert.equal(providerReply.content, 'The grounded network summary is ready.');
assert.equal(providerReply.tools[0].name, 'get_network_summary');
assert.equal(providerCalls, 2, 'function output must be returned to the Responses API before accepting assistant text');
const failedProvider = new OpenAiCopilotProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:9999/v1', fetch: (async () => new Response('{"error":"upstream unavailable"}', { status: 503 })) as typeof fetch });
await assert.rejects(() => failedProvider.respond({ messages: [], gateway: { execute: async () => { throw new Error('must not execute'); } } }), /HTTP 503/, 'provider failure must reject instead of manufacturing a successful answer');
let limitRound = 0;
const limitedProvider = new OpenAiCopilotProvider({ apiKey: 'test-key', baseUrl: 'http://127.0.0.1:9999/v1', fetch: (async () => {
  limitRound += 1;
  return new Response(JSON.stringify({ output: [0, 1, 2].map((index) => ({ type: 'function_call', call_id: `limit-${limitRound}-${index}`, name: 'get_network_summary', arguments: '{}' })) }), { status: 200 });
}) as typeof fetch });
await assert.rejects(() => limitedProvider.respond({ messages: [], gateway: { execute: async (name) => ({ output: {}, run: { id: name, name, label: name, status: 'completed', summary: name } }) } }), /12-tool-call limit/);

const dataDirectory = await mkdtemp(join(tmpdir(), 'flyway-decision-backend-'));
const modeledLocations = structuredClone(initialLocations).map((location) => location.type === 'dc' ? { ...location, evidence: structuredClone(syntheticEvidence) } : location);
const store = new FilePlatformStore({ dataDirectory, initialLocations: modeledLocations, initialLanes, initialDefaults: { workspacePreferences: { theme: 'dark' } } });
const service = new PlatformService(store, undefined, new UnconfiguredCopilotProvider());
await service.initialize();
const server = createPlatformHttpServer({ service, ownerToken });
const { origin } = await listenOnRandomLoopback(server);
const client = createPlatformClient({ baseUrl: origin, ownerToken });

try {
  const original = await client.intelligence();
  assert.equal(original.state.revision, 0);
  assert.equal(original.state.decisions.length, 0);
  assert.equal((await client.copilotStatus()).configured, false);

  const automatic = await client.analyzeDecisions(0, { idempotencyKey: 'decision-analysis-auto-0001' });
  assert.equal(automatic.state.revision, 2);
  assert.equal(automatic.state.decisions.length, 2);
  const automaticDecision = automatic.state.decisions.find((decision) => decision.authority === 'ai')!;
  const humanDecision = automatic.state.decisions.find((decision) => decision.authority === 'human')!;
  assert.equal(automaticDecision.status, 'applied');
  assert.equal(humanDecision.status, 'awaiting-human');
  assert.notEqual(automaticDecision.networkHash, humanDecision.networkHash, 'human queue must be measured against a fresh post-application network');
  assert.match(automaticDecision.evidence.runId, /^[0-9a-f-]{36}$/i, 'decision evidence must open a service run, not expose an internal logical run ID');
  assert.match(automaticDecision.evidence.candidateRunId || '', /^[0-9a-f-]{36}$/i, 'candidate evidence must open the measured candidate service run');
  assert.match(humanDecision.evidence.runId, /^[0-9a-f-]{36}$/i);
  assert.match(humanDecision.evidence.candidateRunId || '', /^[0-9a-f-]{36}$/i);
  assert.ok((await client.getRun(automaticDecision.evidence.candidateRunId!)).summary, 'automatic candidate evidence must reopen its measured result');
  assert.ok((await client.getRun(humanDecision.evidence.candidateRunId!)).summary, 'human candidate evidence must reopen its measured result');
  assert.equal(automatic.workspaceRevision, 2, 'automatic model application and decision state must commit in one workspace transaction');
  assert.deepEqual((await client.getWorkspace()).workspace.defaults.workspacePreferences, { theme: 'dark' }, 'decision application must preserve workspace preferences');

  const automaticReplay = await client.analyzeDecisions(0, { idempotencyKey: 'decision-analysis-auto-0001' });
  assert.deepEqual(automaticReplay, automatic, 'replayed analysis must not apply the capacity change twice');
  const repeatAnalysis = await client.analyzeDecisions(automatic.state.revision, { idempotencyKey: 'decision-analysis-repeat-same-network' });
  assert.deepEqual(repeatAnalysis.state, automatic.state, 'rerunning unchanged analysis must preserve existing decision history and original immutable run references');
  assert.equal(repeatAnalysis.workspaceRevision, automatic.workspaceRevision);

  const resolved = await client.resolveDecision(humanDecision.id, 'approve', 'Approved after reviewing deterministic service and cost impact.', automatic.state.revision, { idempotencyKey: 'decision-resolution-approve-0001' });
  assert.equal(resolved.state.decisions.find((decision) => decision.id === humanDecision.id)?.status, 'applied');
  assert.equal(resolved.workspaceRevision, 3);
  const resolvedReplay = await client.resolveDecision(humanDecision.id, 'approve', 'Approved after reviewing deterministic service and cost impact.', automatic.state.revision, { idempotencyKey: 'decision-resolution-approve-0001' });
  assert.deepEqual(resolvedReplay, resolved);

  const policy = await client.updateDecisionPolicy({ ...resolved.state.policy, maxCostIncreasePct: 1 }, resolved.state.revision, { idempotencyKey: 'decision-policy-tighten-0001' });
  assert.equal(policy.state.policy.maxCostIncreasePct, 1);
  assert.equal(policy.state.revision, resolved.state.revision + 1);

  await assert.rejects(() => client.askCopilot({ message: 'Explain this network', expectedRevision: policy.state.revision, mode: 'ai' }, { idempotencyKey: 'copilot-unconfigured-ai-0001' }), (error: unknown) => error instanceof PlatformRequestError && error.problem.code === 'copilot_not_configured');
  const toolsReply = await client.askCopilot({ message: 'Summarize this planning network', expectedRevision: policy.state.revision, mode: 'model-tools' }, { idempotencyKey: 'copilot-model-tools-0001' });
  assert.match(toolsReply.state.conversations[0].messages[1].content, /modeled lanes/);
  assert.equal(toolsReply.state.conversations[0].messages[1].mode, 'model-tools');
  assert.equal(toolsReply.state.conversations[0].messages[1].tools[0].name, 'get_network_summary');
  const sourceReply = await client.askCopilot({ message: 'What are the public sources for Mebane?', expectedRevision: toolsReply.state.revision, mode: 'model-tools' }, { idempotencyKey: 'copilot-model-tools-sources-0001' });
  assert.match(sourceReply.state.conversations[0].messages[1].content, /Mebane Distribution Center/);
  assert.match(sourceReply.state.conversations[0].messages[1].tools[0].summary, /chick-fil-a\.com/);
  const costReply = await client.askCopilot({ message: 'Break down the modeled cost.', expectedRevision: sourceReply.state.revision, mode: 'model-tools', activeRunId: humanDecision.evidence.runId }, { idempotencyKey: 'copilot-model-tools-cost-0001' });
  assert.match(costReply.state.conversations[0].messages[1].content, /Total modeled cost/);
  const shortageReply = await client.askCopilot({ message: 'Which restaurants have shortages?', expectedRevision: costReply.state.revision, mode: 'model-tools', activeRunId: humanDecision.evidence.runId }, { idempotencyKey: 'copilot-model-tools-shortage-0001' });
  assert.notEqual(shortageReply.state.conversations[0].messages[1].content, costReply.state.conversations[0].messages[1].content, 'prompt-sensitive model tools must not return one generic metric summary');
  await assert.rejects(() => client.askCopilot({ message: 'Analyze the network', expectedRevision: shortageReply.state.revision, mode: 'invalid' as never }), (error: unknown) => error instanceof PlatformRequestError && error.problem.code === 'invalid_copilot_mode', 'invalid modes must fail before any tool action');
  assert.equal((await client.intelligence()).state.revision, shortageReply.state.revision);
  const capacityReply = await client.askCopilot({ message: 'Test a 20% capacity increase at Mebane.', expectedRevision: shortageReply.state.revision, mode: 'model-tools', activeRunId: humanDecision.evidence.runId }, { idempotencyKey: 'copilot-capacity-increase-0001' });
  const capacityRunId = capacityReply.state.conversations[0].messages[1].tools[0].runId!;
  const capacityInput = await (await client.getRunReader(capacityRunId)).input();
  assert.equal(capacityInput.changes[0].kind, 'adjust-capacity');
  assert.equal(capacityInput.changes[0].kind === 'adjust-capacity' && capacityInput.changes[0].multiplier, 1.2, 'capacity increase must never become a decrease');
  const sourceInput = await (await client.getRunReader(humanDecision.evidence.runId)).input();
  assert.deepEqual(capacityInput.locations, sourceInput.locations, 'an active frozen context must not silently use the mutated live model');
  assert.equal((await client.getWorkspace()).workspace.scenarios.length, 1, 'copilot scenarios must be saved, not only submitted as jobs');
  const demandReply = await client.askCopilot({ message: 'Test a 20% demand surge.', expectedRevision: capacityReply.state.revision, mode: 'model-tools' }, { idempotencyKey: 'copilot-demand-surge-0001' });
  const demandRunId = demandReply.state.conversations[0].messages[1].tools[0].runId!;
  const comparison = await client.askCopilot({ message: 'Compare the last two saved scenarios.', expectedRevision: demandReply.state.revision, mode: 'model-tools' }, { idempotencyKey: 'copilot-saved-comparison-0001' });
  const comparisonMessage = comparison.state.conversations[0].messages[1];
  assert.match(comparisonMessage.content, new RegExp(capacityRunId));
  assert.match(comparisonMessage.content, new RegExp(demandRunId));
  assert.equal(comparisonMessage.tools[0].name, 'list_saved_scenarios', 'saved comparisons must not silently substitute analysis baseline/candidate runs');
  assert.match(comparisonMessage.content, /Different horizons/);
} finally {
  await closeServer(server);
  await service.shutdown();
}

const restartedStore = new FilePlatformStore({ dataDirectory, initialLocations: [], initialLanes: [] });
const restartedService = new PlatformService(restartedStore, undefined, new UnconfiguredCopilotProvider());
await restartedService.initialize();
const restartedState = await restartedService.intelligence();
assert.equal(restartedState.state.decisions.length, 2);
assert.equal(restartedState.state.conversations.length, 7);
assert.equal(restartedState.state.policy.maxCostIncreasePct, 1);
assert.equal(restartedState.workspaceRevision, 5);
await restartedService.shutdown();

const aiDirectory = await mkdtemp(join(tmpdir(), 'flyway-decision-ai-pipeline-'));
let aiCalls = 0;
const serviceProvider = new OpenAiCopilotProvider({ apiKey: 'pipeline-test-key', model: 'pipeline-model', baseUrl: 'http://127.0.0.1:9998/v1', fetch: (async () => {
  aiCalls += 1;
  if (aiCalls === 1) return new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: 'network-call', name: 'get_network_summary', arguments: '{}' }] }), { status: 200 });
  if (aiCalls === 2) return new Response(JSON.stringify({ output_text: 'I read the current modeled network through the bounded tool.', output: [] }), { status: 200 });
  if (aiCalls === 3) return new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: 'bad-scenario-call', name: 'run_scenario', arguments: JSON.stringify({ name: 'Invalid target', description: 'Exercise tool failure labeling.', scenario_type: 'dc-outage', target_id: 'missing-location', magnitude: 100, grain: 'daily', horizon: 14 }) }] }), { status: 200 });
  if (aiCalls === 5) return new Response(JSON.stringify({ output: [{ type: 'function_call', call_id: 'public-sources-call', name: 'get_public_facility_sources', arguments: JSON.stringify({ query: 'Mebane', limit: 2 }) }] }), { status: 200 });
  if (aiCalls === 6) return new Response(JSON.stringify({ output_text: 'Official source evidence is available in the tool trace.', output: [] }), { status: 200 });
  return new Response(JSON.stringify({ output_text: 'The scenario tool reported a validation failure.', output: [] }), { status: 200 });
}) as typeof fetch });
const aiStore = new FilePlatformStore({ dataDirectory: aiDirectory, initialLocations: modeledLocations, initialLanes });
const aiService = new PlatformService(aiStore, undefined, serviceProvider);
await aiService.initialize();
const aiServer = createPlatformHttpServer({ service: aiService, ownerToken });
const aiOrigin = (await listenOnRandomLoopback(aiServer)).origin;
const aiClient = createPlatformClient({ baseUrl: aiOrigin, ownerToken });
const aiRequest = { message: 'Use your tools to describe the current network.', expectedRevision: 0, mode: 'ai' as const };
const aiReply = await aiClient.askCopilot(aiRequest, { idempotencyKey: 'copilot-real-pipeline-0001' });
assert.equal(aiReply.state.conversations[0].messages[1].mode, 'ai');
assert.equal(aiReply.state.conversations[0].messages[1].tools[0].name, 'get_network_summary');
assert.equal(aiCalls, 2);
const failedToolReply = await aiClient.askCopilot({ message: 'Run a scenario with the proposed target.', expectedRevision: aiReply.state.revision, mode: 'ai' }, { idempotencyKey: 'copilot-failed-tool-pipeline-0001' });
assert.equal(failedToolReply.state.conversations[0].messages[1].tools[0].name, 'run_scenario');
assert.equal(failedToolReply.state.conversations[0].messages[1].tools[0].status, 'failed', 'a failed scenario tool must never be labeled completed');
assert.equal(aiCalls, 4);
const publicSources = await aiClient.askCopilot({ message: 'Show the official public evidence for Mebane.', expectedRevision: failedToolReply.state.revision, mode: 'ai' }, { idempotencyKey: 'copilot-public-sources-pipeline-0001' });
const sourceTool = publicSources.state.conversations[0].messages[1].tools[0];
assert.equal(sourceTool.name, 'get_public_facility_sources');
assert.match(sourceTool.summary, /https:\/\//);
assert.match(sourceTool.summary, /verified 20\d\d-/);
assert.match(sourceTool.summary, /Numerical confidence is not supplied/);
assert.equal(aiCalls, 6);
await closeServer(aiServer);
await aiService.shutdown();
const aiRestarted = new PlatformService(new FilePlatformStore({ dataDirectory: aiDirectory, initialLocations: [], initialLanes: [] }), undefined, new UnconfiguredCopilotProvider());
await aiRestarted.initialize();
const replayAfterRestart = await aiRestarted.askCopilot({ request: aiRequest, idempotencyKey: 'copilot-real-pipeline-0001', correlationId: 'pipeline-replay' });
assert.equal(replayAfterRestart.replayed, true, 'a saved AI response must replay after restart without another paid provider call');
assert.equal(replayAfterRestart.response.conversationId, aiReply.conversationId);
assert.equal((await aiRestarted.intelligence()).state.conversations.length, 3);
await aiRestarted.shutdown();

console.log('Decision backend passed: Responses tool dispatch, bounded autonomous application, human approval, idempotency, saved conversations, and restart durability.');
