import { randomUUID } from 'node:crypto';
import type { CopilotMessage, CopilotProviderStatus, CopilotToolRun } from '../src/intelligenceTypes';

const MAX_ROUNDS = 6;
const MAX_TOOL_CALLS = 12;
const MAX_RESPONSE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 30_000;

export interface CopilotToolGateway {
  execute(name: string, argumentsValue: unknown): Promise<{ output: unknown; run: CopilotToolRun }>;
}

export interface CopilotProviderReply {
  content: string;
  tools: CopilotToolRun[];
}

export interface CopilotProvider {
  status(): CopilotProviderStatus;
  respond(input: { messages: CopilotMessage[]; gateway: CopilotToolGateway; signal?: AbortSignal }): Promise<CopilotProviderReply>;
}

export interface OpenAiCopilotOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
}

type ResponseOutput = {
  type?: string;
  id?: string;
  call_id?: string;
  name?: string;
  arguments?: string;
  content?: Array<{ type?: string; text?: string }>;
};

type OpenAiResponse = { id?: string; output?: ResponseOutput[]; output_text?: string };

const tools = [
  {
    type: 'function', name: 'get_network_summary', description: 'Read the current planning network identity, size, and revision before giving network advice.', strict: true,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function', name: 'list_locations', description: 'Find bounded modeled location IDs and names for a scenario target. Public evidence classification is included.', strict: true,
    parameters: { type: 'object', properties: { query: { type: ['string', 'null'] }, location_type: { type: ['string', 'null'], enum: ['restaurant', 'dc', 'supplier', null] }, limit: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['query', 'location_type', 'limit'], additionalProperties: false },
  },
  {
    type: 'function', name: 'get_public_facility_sources', description: 'Read bounded official public-source evidence for a named distribution facility.', strict: true,
    parameters: { type: 'object', properties: { query: { type: 'string' }, limit: { type: 'integer', minimum: 1, maximum: 10 } }, required: ['query', 'limit'], additionalProperties: false },
  },
  {
    type: 'function', name: 'get_run_summary', description: 'Read a completed deterministic simulation result by its service run ID.', strict: true,
    parameters: { type: 'object', properties: { run_id: { type: 'string' } }, required: ['run_id'], additionalProperties: false },
  },
  {
    type: 'function', name: 'get_active_run', description: 'Read the run currently open in the user workspace, when one was supplied with the request.', strict: true,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
  {
    type: 'function', name: 'compare_runs', description: 'Compare two completed deterministic simulation results. Use calculated results rather than inventing impacts.', strict: true,
    parameters: { type: 'object', properties: { baseline_run_id: { type: 'string' }, candidate_run_id: { type: 'string' } }, required: ['baseline_run_id', 'candidate_run_id'], additionalProperties: false },
  },
  {
    type: 'function', name: 'list_saved_scenarios', description: 'List bounded user-saved scenario references and their immutable service run IDs before comparing saved scenarios.', strict: true,
    parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['limit'], additionalProperties: false },
  },
  {
    type: 'function', name: 'query_run_metrics', description: 'Read bounded product-period model metrics, including actual saved shortage rows, from a completed run.', strict: true,
    parameters: { type: 'object', properties: { run_id: { type: 'string' }, kind: { type: 'string', enum: ['baseline', 'scenario'] }, stockouts_only: { type: 'boolean' }, location_id: { type: ['string', 'null'] }, product: { type: ['string', 'null'] }, limit: { type: 'integer', minimum: 1, maximum: 50 } }, required: ['run_id', 'kind', 'stockouts_only', 'location_id', 'product', 'limit'], additionalProperties: false },
  },
  {
    type: 'function', name: 'get_decisions', description: 'List the current bounded decision queue and recent decision history.', strict: true,
    parameters: { type: 'object', properties: { limit: { type: 'integer', minimum: 1, maximum: 25 } }, required: ['limit'], additionalProperties: false },
  },
  {
    type: 'function', name: 'get_decision', description: 'Read one decision with calculated before/after metrics, policy reasons, evidence and history.', strict: true,
    parameters: { type: 'object', properties: { decision_id: { type: 'string' } }, required: ['decision_id'], additionalProperties: false },
  },
  {
    type: 'function', name: 'run_scenario', description: 'Submit a deterministic scenario against the current planning model. The server validates every field and freezes the input.', strict: true,
    parameters: {
      type: 'object', additionalProperties: false,
      properties: {
        name: { type: 'string' }, description: { type: 'string' },
        scenario_type: { type: 'string', enum: ['dc-outage', 'supplier-failure', 'demand-surge', 'severe-weather', 'price-change', 'capacity-constraint', 'location-closure'] },
        capacity_direction: { type: ['string', 'null'], enum: ['decrease', 'increase', null], description: 'Required semantic direction for capacity scenarios; null for other scenario types.' },
        target_id: { type: 'string' }, magnitude: { type: 'number' }, grain: { type: 'string', enum: ['daily', 'weekly'] }, horizon: { type: 'integer' },
      },
      required: ['name', 'description', 'scenario_type', 'capacity_direction', 'target_id', 'magnitude', 'grain', 'horizon'],
    },
  },
  {
    type: 'function', name: 'analyze_decisions', description: 'Evaluate decision candidates with the deterministic engine and route them through the configured decision policy.', strict: true,
    parameters: { type: 'object', properties: {}, required: [], additionalProperties: false },
  },
] as const;

const instructions = `You are Flyway Copilot for an independent educational U.S. restaurant supply-chain planning twin.
Use tools for all network facts, calculations, scenario outcomes, and decisions. Never invent facilities, private supplier relationships, operational facts, or impact numbers. Clearly distinguish verified public evidence from editable planning assumptions. The deterministic engine owns calculated values. Decision policy owns authority: you cannot approve, apply, or bypass a decision. Explain what the model calculated, what the policy routed automatically, and what needs a human decision. Keep responses concise and decision-oriented, and cite run IDs or decision IDs returned by tools. For public facility claims, cite the returned official URLs and last-verified dates; do not invent numerical confidence or imply a complete current operating registry. A derived scenario uses the active run's frozen baseline network and defaults, not its previously applied disruption changes, unless the tool explicitly says otherwise.`;

export class OpenAiCopilotProvider implements CopilotProvider {
  readonly #apiKey: string;
  readonly #model: string;
  readonly #url: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;

  constructor(options: OpenAiCopilotOptions) {
    if (!options.apiKey.trim()) throw new Error('An OpenAI API key is required to configure the copilot provider.');
    this.#apiKey = options.apiKey;
    this.#model = options.model || 'gpt-5-mini';
    const base = new URL(options.baseUrl || 'https://api.openai.com/v1');
    const loopback = base.hostname === '127.0.0.1' || base.hostname === 'localhost' || base.hostname === '[::1]';
    if (base.protocol !== 'https:' && !(base.protocol === 'http:' && loopback)) throw new Error('OpenAI base URL must use HTTPS or loopback HTTP for tests.');
    if (base.username || base.password || base.search || base.hash) throw new Error('OpenAI base URL cannot contain credentials, query parameters, or a fragment.');
    this.#url = `${base.href.replace(/\/$/, '')}/responses`;
    this.#fetch = options.fetch || globalThis.fetch.bind(globalThis);
    this.#timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;
  }

  status(): CopilotProviderStatus {
    return { configured: true, provider: 'openai', model: this.#model, detail: 'OpenAI Responses is configured with server-side model tools.' };
  }

  async respond(input: { messages: CopilotMessage[]; gateway: CopilotToolGateway; signal?: AbortSignal }): Promise<CopilotProviderReply> {
    input.signal?.throwIfAborted();
    let providerInput: unknown[] = input.messages.map((message) => ({ role: message.role, content: message.content }));
    const executed: CopilotToolRun[] = [];
    let toolCallCount = 0;
    for (let round = 0; round < MAX_ROUNDS; round += 1) {
      const response = await this.#request(providerInput, input.signal);
      const output = Array.isArray(response.output) ? response.output : [];
      const calls = output.filter((item) => item.type === 'function_call');
      if (!calls.length) {
        const content = response.output_text?.trim() || output.flatMap((item) => item.content || []).filter((item) => item.type === 'output_text').map((item) => item.text || '').join('\n').trim();
        if (!content) throw new Error('The AI provider returned no assistant text.');
        return { content: content.slice(0, 20_000), tools: executed };
      }
      providerInput = [...providerInput, ...output];
      for (const call of calls) {
        toolCallCount += 1;
        if (toolCallCount > MAX_TOOL_CALLS) throw new Error(`The AI provider exceeded the ${MAX_TOOL_CALLS}-tool-call limit.`);
        if (!call.call_id || !call.name || typeof call.arguments !== 'string') throw new Error('The AI provider returned an invalid function call.');
        let argumentsValue: unknown;
        try { argumentsValue = JSON.parse(call.arguments); }
        catch { throw new Error(`The AI provider returned invalid JSON for ${call.name}.`); }
        try {
          const result = await input.gateway.execute(call.name, argumentsValue);
          executed.push(result.run);
          providerInput.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify(result.output) });
        } catch (error) {
          const failed: CopilotToolRun = { id: randomUUID(), name: call.name, label: call.name.replace(/_/g, ' '), status: 'failed', summary: error instanceof Error ? error.message : 'Tool execution failed.' };
          executed.push(failed);
          providerInput.push({ type: 'function_call_output', call_id: call.call_id, output: JSON.stringify({ error: failed.summary }) });
        }
      }
    }
    throw new Error(`The AI provider exceeded the ${MAX_ROUNDS}-round tool limit.`);
  }

  async #request(input: unknown[], signal?: AbortSignal): Promise<OpenAiResponse> {
    signal?.throwIfAborted();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error('The AI provider request timed out.')), this.#timeoutMs);
    const abort = () => controller.abort(signal?.reason || new DOMException('Aborted', 'AbortError'));
    signal?.addEventListener('abort', abort, { once: true });
    try {
      const response = await this.#fetch(this.#url, {
        method: 'POST', signal: controller.signal,
        headers: { authorization: `Bearer ${this.#apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ model: this.#model, instructions, input, tools, tool_choice: 'auto', parallel_tool_calls: false, max_output_tokens: 1_200, store: false }),
      });
      const text = await response.text();
      if (Buffer.byteLength(text) > MAX_RESPONSE_BYTES) throw new Error('The AI provider response exceeded the safe size limit.');
      if (!response.ok) throw new Error(`The AI provider returned HTTP ${response.status}.`);
      try { return JSON.parse(text) as OpenAiResponse; }
      catch { throw new Error('The AI provider returned invalid JSON.'); }
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
    }
  }
}

export class UnconfiguredCopilotProvider implements CopilotProvider {
  status(): CopilotProviderStatus {
    return { configured: false, provider: 'openai', model: null, detail: 'Add server-side OpenAI configuration to enable real AI conversations.' };
  }
  async respond(): Promise<CopilotProviderReply> { throw new Error('The AI provider is not configured.'); }
}
