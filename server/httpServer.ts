import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { CensusGeocoder } from './geocode';
import { PlatformError, PlatformService, workspaceEtag } from './platformService';
import type { JsonValue, ProblemDetail, RunRecord } from './types';
import type { CopilotRequest, DecisionPolicy, DecisionResolution } from '../src/intelligenceTypes';
import { ValidationError, validateWorkspaceReplacement } from './validation';

const MAX_BODY_BYTES = 2 * 1024 * 1024;
const PRODUCTS = new Set(['Chicken', 'Produce', 'Buns & bakery', 'Packaging', 'Beverages', 'Cooking oil', 'Equipment']);
const LOCATION_TYPES = new Set(['restaurant', 'dc', 'supplier']);
const SECURITY_HEADERS: Record<string, string> = {
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'cache-control': 'no-store',
};

export interface PlatformHttpServerOptions {
  service: PlatformService;
  ownerToken: string;
  geocoder?: CensusGeocoder;
  allowedOrigin?: string;
}

function asJsonValue(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value)) as JsonValue;
}

function bearerToken(request: IncomingMessage) {
  const header = request.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function tokenMatches(actual: string, expected: string) {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseRevision(value: string | undefined) {
  if (!value) throw new PlatformError(428, 'expected_revision_required', 'If-Match with the current workspace revision is required.');
  const match = value.match(/^(?:W\/)?"?(\d+)"?$/);
  if (!match) throw new PlatformError(400, 'invalid_expected_revision', 'If-Match must contain a numeric workspace revision.');
  return Number(match[1]);
}

function idempotencyKey(request: IncomingMessage) {
  const value = request.headers['idempotency-key'];
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) throw new PlatformError(428, 'idempotency_key_required', 'Idempotency-Key containing 8 to 200 characters is required.');
  return value;
}

function queryLimit(url: URL, fallback = 50, maximum = 100) {
  const raw = url.searchParams.get('limit');
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > maximum) throw new PlatformError(422, 'invalid_limit', `Limit must be an integer from 1 to ${maximum}.`);
  return value;
}

function queryCursor(url: URL) {
  const value = url.searchParams.get('cursor') || undefined;
  if (value && value.length > 2_048) throw new PlatformError(400, 'invalid_cursor', 'The pagination cursor is invalid.');
  return value;
}

function optionalNonnegativeInteger(url: URL, name: string) {
  const raw = url.searchParams.get(name);
  if (raw === null) return undefined;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 0) throw new PlatformError(422, 'invalid_query', `${name} must be a non-negative integer.`);
  return value;
}

async function readJson(request: IncomingMessage) {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > MAX_BODY_BYTES) throw new PlatformError(413, 'request_too_large', `Request body exceeds ${MAX_BODY_BYTES} bytes.`);
    chunks.push(bytes);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new PlatformError(400, 'invalid_json', 'Request body is not valid JSON.');
  }
}

function send(response: ServerResponse, status: number, body: unknown, correlationId: string, extraHeaders: Record<string, string> = {}) {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    ...SECURITY_HEADERS,
    ...extraHeaders,
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(content),
    'x-correlation-id': correlationId,
  });
  response.end(content);
}

function sendProblem(response: ServerResponse, error: unknown, correlationId: string) {
  const normalized = error instanceof ValidationError
    ? new PlatformError(422, 'validation_failed', error.message, false, error.fieldErrors)
    : error instanceof PlatformError
      ? error
      : new PlatformError(500, 'internal_error', 'The platform could not complete the request.', true);
  const problem: ProblemDetail = {
    type: `https://flyway.local/problems/${normalized.code}`,
    title: normalized.code.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' '),
    status: normalized.status,
    code: normalized.code,
    detail: normalized.message,
    correlationId,
    retryable: normalized.retryable,
    ...(normalized.fieldErrors ? { fieldErrors: normalized.fieldErrors } : {}),
  };
  send(response, normalized.status, problem, correlationId, { 'content-type': 'application/problem+json; charset=utf-8' });
}

function publicRun(run: RunRecord) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    workspaceRevision: run.workspaceRevision,
    scenario: run.scenario,
    sourceRunId: run.sourceRunId,
    status: run.status,
    attempt: run.attempt,
    cancelRequested: run.cancelRequested,
    inputHash: run.inputHash,
    outputChecksum: run.outputChecksum,
    error: run.error,
    createdAt: run.createdAt,
    startedAt: run.startedAt,
    completedAt: run.completedAt,
    correlationId: run.correlationId,
  };
}

export function createPlatformHttpServer(options: PlatformHttpServerOptions): Server {
  if (options.ownerToken.length < 32) throw new Error('Local owner token must contain at least 32 characters.');
  const geocoder = options.geocoder || new CensusGeocoder();
  return createServer(async (request, response) => {
    const suppliedCorrelation = request.headers['x-correlation-id'];
    const correlationId = typeof suppliedCorrelation === 'string' && /^[A-Za-z0-9._:-]{8,128}$/.test(suppliedCorrelation) ? suppliedCorrelation : randomUUID();
    let errored = false;
    try {
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const requestOrigin = request.headers.origin;
      if (requestOrigin && requestOrigin !== options.allowedOrigin) throw new PlatformError(403, 'origin_not_allowed', 'The browser origin is not allowed to access this service.');
      if (requestOrigin && options.allowedOrigin) {
        response.setHeader('access-control-allow-origin', options.allowedOrigin);
        response.setHeader('vary', 'Origin');
      }
      if (request.method === 'OPTIONS' && url.pathname.startsWith('/api/v1/')) {
        response.writeHead(204, {
          ...SECURITY_HEADERS,
          'access-control-allow-origin': options.allowedOrigin || '',
          'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
          'access-control-allow-headers': 'Authorization, Content-Type, If-Match, Idempotency-Key, X-Correlation-ID',
          'access-control-max-age': '600',
          'x-correlation-id': correlationId,
          vary: 'Origin',
        });
        response.end();
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/health') {
        const health=options.service.healthStatus();
        send(response, health.status==='ok'?200:503, health, correlationId);
        return;
      }
      if (!url.pathname.startsWith('/api/v1/')) throw new PlatformError(404, 'route_not_found', 'The requested route does not exist.');
      if (!tokenMatches(bearerToken(request), options.ownerToken)) throw new PlatformError(401, 'authentication_required', 'A valid local owner credential is required.');

      if (request.method === 'GET' && url.pathname === '/api/v1/workspace') {
        const workspace = await options.service.workspace();
        send(response, 200, { workspace }, correlationId, { etag: workspaceEtag(workspace) });
        return;
      }
      if (request.method === 'PUT' && url.pathname === '/api/v1/workspace') {
        const replacement = validateWorkspaceReplacement(await readJson(request));
        const result = await options.service.replaceWorkspace({
          replacement,
          expectedRevision: parseRevision(request.headers['if-match']),
          idempotencyKey: idempotencyKey(request),
          correlationId,
        });
        send(response, 200, { workspace: result.workspace, idempotentReplay: result.replayed }, correlationId, { etag: workspaceEtag(result.workspace) });
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/intelligence') {
        send(response, 200, await options.service.intelligence(), correlationId);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/copilot/status') {
        send(response, 200, options.service.copilotStatus(), correlationId);
        return;
      }
      if (request.method === 'PUT' && url.pathname === '/api/v1/intelligence/policy') {
        const body = await readJson(request) as { policy?: unknown; expectedRevision?: unknown };
        const expectedRevision = parseRevision(request.headers['if-match']);
        if (body.expectedRevision !== expectedRevision || !body.policy || typeof body.policy !== 'object') throw new PlatformError(422, 'validation_failed', 'Policy update requires a policy and matching intelligence revision.');
        const result = await options.service.updateDecisionPolicy({ policy: body.policy as DecisionPolicy, expectedRevision, idempotencyKey: idempotencyKey(request), correlationId });
        send(response, 200, result.response, correlationId, { etag: `"${result.response.state.revision}"` });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/intelligence/analyze') {
        const body = await readJson(request) as { expectedRevision?: unknown };
        const expectedRevision = parseRevision(request.headers['if-match']);
        if (body.expectedRevision !== expectedRevision) throw new PlatformError(422, 'revision_mismatch', 'If-Match and expectedRevision must identify the same intelligence revision.');
        const result = await options.service.analyzeDecisions({ expectedRevision, idempotencyKey: idempotencyKey(request), correlationId });
        send(response, 200, result.response, correlationId, { etag: `"${result.response.state.revision}"` });
        return;
      }
      const decisionResolutionMatch = url.pathname.match(/^\/api\/v1\/intelligence\/decisions\/([^/]+)\/resolve$/);
      if (request.method === 'POST' && decisionResolutionMatch) {
        const body = await readJson(request) as { action?: unknown; reason?: unknown; expectedRevision?: unknown };
        const expectedRevision = parseRevision(request.headers['if-match']);
        if (body.expectedRevision !== expectedRevision || !['approve', 'reject', 'defer'].includes(String(body.action)) || typeof body.reason !== 'string') throw new PlatformError(422, 'validation_failed', 'Decision resolution requires an action, reason, and matching intelligence revision.');
        const result = await options.service.resolveDecision({ decisionId: decodeURIComponent(decisionResolutionMatch[1]), resolution: body.action as DecisionResolution, reason: body.reason, expectedRevision, idempotencyKey: idempotencyKey(request), correlationId });
        send(response, 200, result.response, correlationId, { etag: `"${result.response.state.revision}"` });
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/copilot/responses') {
        const body = await readJson(request) as Partial<CopilotRequest>;
        const expectedRevision = parseRevision(request.headers['if-match']);
        if (body.expectedRevision !== expectedRevision || typeof body.message !== 'string') throw new PlatformError(422, 'validation_failed', 'Copilot request requires a message and matching intelligence revision.');
        const controller = new AbortController();
        const abort = () => controller.abort(new DOMException('Client disconnected', 'AbortError'));
        request.once('aborted', abort);
        try {
          const result = await options.service.askCopilot({ request: body as CopilotRequest, idempotencyKey: idempotencyKey(request), correlationId, signal: controller.signal });
          send(response, 200, result.response, correlationId, { etag: `"${result.response.state.revision}"` });
        } finally { request.off('aborted', abort); }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/geocode') {
        const address = url.searchParams.get('address') || '';
        if (address.length < 3 || address.length > 500) throw new PlatformError(422, 'invalid_address', 'Address must contain 3 to 500 characters.', false, { address: 'Enter a complete U.S. address.' });
        try {
          send(response, 200, await geocoder.search(address), correlationId);
        } catch (error) {
          throw new PlatformError(503, 'geocoder_unavailable', error instanceof Error ? error.message : 'Census Geocoder is unavailable.', true);
        }
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/runs') {
        const status = url.searchParams.get('status') || undefined;
        if (status && !['queued', 'running', 'succeeded', 'failed', 'cancelled'].includes(status)) throw new PlatformError(422, 'invalid_status', 'Run status filter is invalid.');
        const page = await options.service.listRuns({ cursor: queryCursor(url), limit: queryLimit(url), scenarioId: url.searchParams.get('scenarioId') || undefined, status: status as RunRecord['status'] | undefined });
        send(response, 200, { ...page, items: page.items.map(publicRun) }, correlationId);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/runs') {
        const body = await readJson(request) as { scenario?: unknown; expectedWorkspaceRevision?: unknown; sourceRunId?: unknown };
        if (!body || typeof body !== 'object' || typeof body.expectedWorkspaceRevision !== 'number' || !body.scenario) throw new PlatformError(422, 'validation_failed', 'Run payload is invalid.', false, { expectedWorkspaceRevision: 'A numeric revision is required.', scenario: 'A scenario is required.' });
        if (body.sourceRunId !== undefined && (typeof body.sourceRunId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.sourceRunId))) throw new PlatformError(422, 'validation_failed', 'Run payload is invalid.', false, { sourceRunId: 'Must be a run ID.' });
        const result = await options.service.createRun({
          scenario: body.scenario as never,
          expectedWorkspaceRevision: body.expectedWorkspaceRevision,
          idempotencyKey: idempotencyKey(request),
          correlationId,
          sourceRunId: body.sourceRunId as string | undefined,
        });
        send(response, 202, { ...publicRun(result.run), idempotentReplay: result.replayed }, correlationId, { location: `/api/v1/runs/${result.run.id}` });
        return;
      }
      const inputHashMatch = url.pathname.match(/^\/api\/v1\/runs\/by-input-hash\/([a-f0-9]+)$/);
      if (request.method === 'GET' && inputHashMatch) {
        const result = await options.service.findRunByInputHash(inputHashMatch[1]);
        send(response, 200, { run: publicRun(result.run), ...(result.summary ? { summary: result.summary } : {}) }, correlationId);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/scenarios') {
        send(response, 200, await options.service.listScenarios({ cursor: queryCursor(url), limit: queryLimit(url) }), correlationId);
        return;
      }
      if (request.method === 'POST' && url.pathname === '/api/v1/scenarios') {
        const body = await readJson(request) as Record<string, unknown>;
        if (!body || typeof body !== 'object' || Object.keys(body).some((key) => key !== 'runId' && key !== 'expectedWorkspaceRevision') || typeof body.runId !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.runId) || typeof body.expectedWorkspaceRevision !== 'number') {
          throw new PlatformError(422, 'validation_failed', 'Scenario save payload must contain only a run ID and numeric expected workspace revision.', false, { runId: 'A service run ID is required.', expectedWorkspaceRevision: 'A numeric revision is required.' });
        }
        const headerRevision = parseRevision(request.headers['if-match']);
        if (headerRevision !== body.expectedWorkspaceRevision) throw new PlatformError(422, 'revision_mismatch', 'If-Match and expectedWorkspaceRevision must identify the same workspace revision.');
        const result = await options.service.saveScenario({ runId: body.runId, expectedWorkspaceRevision: body.expectedWorkspaceRevision, idempotencyKey: idempotencyKey(request), correlationId });
        const etag = `"${result.workspaceRevision}"`;
        send(response, 200, { scenario: result.scenario, workspaceRevision: result.workspaceRevision, etag, idempotentReplay: result.replayed }, correlationId, { etag });
        return;
      }
      const scenarioRunsMatch = url.pathname.match(/^\/api\/v1\/scenarios\/([^/]+)\/runs$/);
      if (request.method === 'GET' && scenarioRunsMatch) {
        const page = await options.service.listScenarioRuns(decodeURIComponent(scenarioRunsMatch[1]), { cursor: queryCursor(url), limit: queryLimit(url) });
        send(response, 200, { ...page, items: page.items.map(publicRun) }, correlationId);
        return;
      }
      const scenarioMatch = url.pathname.match(/^\/api\/v1\/scenarios\/([^/]+)$/);
      if (request.method === 'GET' && scenarioMatch) {
        send(response, 200, { scenario: await options.service.getScenario(decodeURIComponent(scenarioMatch[1])) }, correlationId);
        return;
      }
      const runMatch = url.pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]+)$/i);
      if (request.method === 'GET' && runMatch) {
        const result = await options.service.getRun(runMatch[1], url.searchParams.get('includeOutput') === 'true');
        send(response, 200, { run: publicRun(result.run), ...(result.summary ? { summary: result.summary } : {}), ...(result.output ? { output: result.output } : {}) }, correlationId);
        return;
      }
      const runInputMatch = url.pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]+)\/input$/i);
      if (request.method === 'GET' && runInputMatch) {
        send(response, 200, { input: await options.service.runInput(runInputMatch[1]) }, correlationId);
        return;
      }
      const runMetricsMatch = url.pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]+)\/metrics$/i);
      if (request.method === 'GET' && runMetricsMatch) {
        const kind = url.searchParams.get('kind');
        if (kind !== 'baseline' && kind !== 'scenario') throw new PlatformError(422, 'invalid_query', 'Metric kind must be baseline or scenario.');
        const periodFrom = optionalNonnegativeInteger(url, 'periodFrom');
        const periodToExclusive = optionalNonnegativeInteger(url, 'periodToExclusive') ?? optionalNonnegativeInteger(url, 'periodTo');
        const product = url.searchParams.get('product') || undefined;
        const locationType = url.searchParams.get('locationType') || undefined;
        const stockoutsRaw = url.searchParams.get('stockoutsOnly');
        if (stockoutsRaw !== null && stockoutsRaw !== 'true' && stockoutsRaw !== 'false') throw new PlatformError(422, 'invalid_query', 'stockoutsOnly must be true or false.');
        if (product && !PRODUCTS.has(product)) throw new PlatformError(422, 'invalid_query', 'Product filter is invalid.');
        if (locationType && !LOCATION_TYPES.has(locationType)) throw new PlatformError(422, 'invalid_query', 'Location type filter is invalid.');
        if (periodFrom !== undefined && periodToExclusive !== undefined && periodToExclusive <= periodFrom) throw new PlatformError(422, 'invalid_query', 'periodToExclusive must be greater than periodFrom.');
        send(response, 200, await options.service.runMetrics(runMetricsMatch[1], {
          kind,
          product: product as never,
          locationType: locationType as never,
          locationId: url.searchParams.get('locationId') || undefined,
          ...(stockoutsRaw !== null ? { stockoutsOnly: stockoutsRaw === 'true' } : {}),
          periodFrom,
          periodToExclusive,
          cursor: queryCursor(url),
          limit: queryLimit(url, 50, 5_000),
        }), correlationId);
        return;
      }
      const runScopeMatch = url.pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]+)\/scope$/i);
      if (request.method === 'GET' && runScopeMatch) {
        const product = url.searchParams.get('product');
        const periodRaw = url.searchParams.get('period');
        const period = periodRaw === '-1' ? -1 : optionalNonnegativeInteger(url, 'period');
        const sort = url.searchParams.get('sort');
        if (!product || (product !== 'all' && !PRODUCTS.has(product)) || period === undefined || (sort !== 'impact' && sort !== 'name')) throw new PlatformError(422, 'invalid_query', 'Scope requires a valid product, period -1 or a reporting-period index, and sort=impact or name.');
        send(response, 200, await options.service.runScope(runScopeMatch[1], { product: product as never, period, sort, cursor: queryCursor(url), limit: queryLimit(url) }), correlationId);
        return;
      }
      const runPageMatch = url.pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]+)\/(impacts|recommendations|warnings|constraints)$/i);
      if (request.method === 'GET' && runPageMatch) {
        const cursor = queryCursor(url), limit = queryLimit(url);
        const value = runPageMatch[2] === 'impacts' ? await options.service.runImpacts(runPageMatch[1], cursor, limit)
          : runPageMatch[2] === 'recommendations' ? await options.service.runRecommendations(runPageMatch[1], cursor, limit)
            : runPageMatch[2] === 'warnings' ? await options.service.runWarnings(runPageMatch[1], cursor, limit)
              : await options.service.runConstraints(runPageMatch[1], cursor, limit);
        send(response, 200, value, correlationId);
        return;
      }
      const eventMatch = url.pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]+)\/events$/i);
      if (request.method === 'GET' && eventMatch) {
        const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0);
        send(response, 200, { events: await options.service.runEvents(eventMatch[1], after) }, correlationId);
        return;
      }
      const actionMatch = url.pathname.match(/^\/api\/v1\/runs\/([0-9a-f-]+)\/(cancel|retry)$/i);
      if (request.method === 'POST' && actionMatch) {
        const result = actionMatch[2] === 'cancel'
          ? await options.service.cancelRun(actionMatch[1], idempotencyKey(request), correlationId)
          : await options.service.retryRun(actionMatch[1], idempotencyKey(request), correlationId);
        send(response, 202, { ...publicRun(result.run), idempotentReplay: result.replayed }, correlationId);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/audit') {
        const after = Math.max(0, Number(url.searchParams.get('after') || 0) || 0);
        send(response, 200, { events: await options.service.audit(after) }, correlationId);
        return;
      }
      if (request.method === 'GET' && url.pathname === '/api/v1/metrics') {
        send(response, 200, await options.service.metrics(), correlationId);
        return;
      }
      throw new PlatformError(404, 'route_not_found', 'The requested API route does not exist.');
    } catch (error) {
      errored = true;
      sendProblem(response, error, correlationId);
    } finally {
      await options.service.recordRequest(errored).catch(() => undefined);
    }
  });
}

export async function listenOnRandomLoopback(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const address = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${address.port}`, port: address.port };
}

export async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}
