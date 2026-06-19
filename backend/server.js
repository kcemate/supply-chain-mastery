import express from 'express';
import { createHash } from 'crypto';
import { Pool } from 'pg';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const PORT = Number(process.env.PORT || 8787);
const DATABASE_URL = process.env.DATABASE_URL;
const CLERK_JWKS_URL = process.env.CLERK_JWKS_URL;
const CLERK_ISSUER = process.env.CLERK_ISSUER;
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
const ADMIN_USER_IDS = new Set((process.env.ADMIN_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const JSON_LIMIT_BYTES = Number(process.env.JSON_LIMIT_BYTES || 262144);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 60000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 120);
const REALTIME_RATE_LIMIT_WINDOW_MS = Number(process.env.REALTIME_RATE_LIMIT_WINDOW_MS || 60000);
const REALTIME_RATE_LIMIT_MAX = Number(process.env.REALTIME_RATE_LIMIT_MAX || 6);
const REALTIME_ACCESS_CODES = new Set((process.env.REALTIME_ACCESS_CODES || '').split(',').map(x => x.trim()).filter(Boolean));
const REALTIME_ALLOWED_USER_IDS = new Set((process.env.REALTIME_ALLOWED_USER_IDS || '').split(',').map(x => x.trim()).filter(Boolean));
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime';
const OPENAI_REALTIME_VOICE = process.env.OPENAI_REALTIME_VOICE || 'marin';
const XAI_API_KEY = process.env.XAI_API_KEY || process.env.GROK_API_KEY;
const XAI_REALTIME_MODEL = process.env.XAI_REALTIME_MODEL || 'grok-voice-think-fast-1.0';
const XAI_REALTIME_VOICE = process.env.XAI_REALTIME_VOICE || 'rex';

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!CLERK_JWKS_URL) throw new Error('CLERK_JWKS_URL is required');

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'disable' ? false : { rejectUnauthorized: false }
});
const jwks = createRemoteJWKSet(new URL(CLERK_JWKS_URL));
const app = express();
const rateBuckets = new Map();
const realtimeRateBuckets = new Map();
let lastRateLimitPrune = 0;
let lastRealtimeRateLimitPrune = 0;

app.set('trust proxy', 1);
app.use(express.json({ limit: JSON_LIMIT_BYTES }));
app.use(cors);
app.use(rateLimit);

function clientIp(req) {
  const forwarded = String(req.get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded || req.ip || req.socket?.remoteAddress || 'unknown';
}

function cors(req, res, next) {
  const origin = req.headers.origin;
  if (origin && (!ALLOWED_ORIGINS.length || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,PATCH,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-SCFC-Access');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

function rateLimit(req, res, next) {
  const key = `${clientIp(req)}:${req.headers.authorization ? 'auth' : 'anon'}`;
  const now = Date.now();
  if (now - lastRateLimitPrune > RATE_LIMIT_WINDOW_MS) {
    for (const [bucketKey, bucket] of rateBuckets) {
      if (now > bucket.resetAt) rateBuckets.delete(bucketKey);
    }
    lastRateLimitPrune = now;
  }
  const bucket = rateBuckets.get(key) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  rateBuckets.set(key, bucket);
  if (bucket.count > RATE_LIMIT_MAX) return res.status(429).json({ error: 'rate_limited' });
  next();
}

function realtimeRateLimit(req, res, next) {
  const principal = req.userId || betaAccessCode(req) || 'anonymous';
  const key = principal;
  const now = Date.now();
  if (now - lastRealtimeRateLimitPrune > REALTIME_RATE_LIMIT_WINDOW_MS) {
    for (const [bucketKey, bucket] of realtimeRateBuckets) {
      if (now > bucket.resetAt) realtimeRateBuckets.delete(bucketKey);
    }
    lastRealtimeRateLimitPrune = now;
  }
  const bucket = realtimeRateBuckets.get(key) || { count: 0, resetAt: now + REALTIME_RATE_LIMIT_WINDOW_MS };
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + REALTIME_RATE_LIMIT_WINDOW_MS;
  }
  bucket.count += 1;
  realtimeRateBuckets.set(key, bucket);
  res.setHeader('X-Realtime-RateLimit-Limit', String(REALTIME_RATE_LIMIT_MAX));
  res.setHeader('X-Realtime-RateLimit-Remaining', String(Math.max(0, REALTIME_RATE_LIMIT_MAX - bucket.count)));
  if (bucket.count > REALTIME_RATE_LIMIT_MAX) return res.status(429).json({ error: 'realtime_rate_limited' });
  next();
}

async function auth(req, res, next) {
  try {
    const payload = await verifyAuthPayload(req);
    req.userId = payload.sub;
    if (!req.userId) return res.status(401).json({ error: 'missing_subject' });
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

async function optionalAuth(req, res, next) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return next();
  try {
    const payload = await verifyAuthPayload(req);
    req.userId = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: 'invalid_token' });
  }
}

async function verifyAuthPayload(req) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) throw new Error('missing_token');
  const options = CLERK_ISSUER ? { issuer: CLERK_ISSUER } : {};
  const verified = await jwtVerify(token, jwks, options);
  return verified.payload;
}

function requireAdmin(req, res, next) {
  if (!ADMIN_USER_IDS.has(req.userId)) return res.status(403).json({ error: 'admin_required' });
  next();
}

function betaAccessCode(req) {
  return String(req.get('x-scfc-access') || req.query.access || '').trim();
}

function hasRealtimeBetaAccess(req) {
  const code = betaAccessCode(req);
  return Boolean(code && REALTIME_ACCESS_CODES.has(code));
}

function requireAllowedOrigin(req, res, next) {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.length && !ALLOWED_ORIGINS.includes(origin)) {
    return res.status(403).json({ error: 'origin_not_allowed' });
  }
  next();
}

function requireRealtimeAccess(req, res, next) {
  if (req.userId) {
    if (REALTIME_ALLOWED_USER_IDS.size && !REALTIME_ALLOWED_USER_IDS.has(req.userId)) {
      return res.status(403).json({ error: 'realtime_entitlement_required' });
    }
    return next();
  }
  if (hasRealtimeBetaAccess(req)) return next();
  return res.status(401).json({ error: 'realtime_auth_required' });
}

app.get('/health', async (_req, res) => {
  await pool.query('select 1');
  res.json({ ok: true });
});

app.get('/api/realtime/session', requireAllowedOrigin, optionalAuth, requireRealtimeAccess, realtimeRateLimit, async (req, res) => {
  const provider = String(req.query.provider || 'xai').toLowerCase();
  if (provider === 'xai' || provider === 'grok') return xaiRealtimeSession(req, res);
  if (provider !== 'openai') return res.status(400).json({ error: 'unsupported_realtime_provider' });
  return openaiRealtimeSession(req, res);
});

async function openaiRealtimeSession(req, res) {
  if (!OPENAI_API_KEY) return res.status(503).json({ error: 'openai_not_configured' });
  const safetyId = safetyIdentifier(req.userId || req.ip || 'anonymous');
  const sessionConfig = {
    session: {
      type: 'realtime',
      model: OPENAI_REALTIME_MODEL,
      instructions: advisorInstructions(),
      audio: {
        output: {
          voice: OPENAI_REALTIME_VOICE
        }
      },
      tools: advisorTools(),
      tool_choice: 'auto'
    }
  };
  const response = await fetch('https://api.openai.com/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
      'OpenAI-Safety-Identifier': safetyId
    },
    body: JSON.stringify(sessionConfig)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({ error: 'realtime_session_failed', detail: payload.error?.message || payload.error || 'OpenAI request failed' });
  }
  res.json({
    ...payload,
    provider: 'openai',
    model: OPENAI_REALTIME_MODEL,
    voice: OPENAI_REALTIME_VOICE
  });
}

async function xaiRealtimeSession(_req, res) {
  if (!XAI_API_KEY) return res.status(503).json({ error: 'xai_not_configured' });
  const response = await fetch('https://api.x.ai/v1/realtime/client_secrets', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${XAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ expires_after: { seconds: 300 } })
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return res.status(response.status).json({ error: 'realtime_session_failed', detail: payload.error?.message || payload.error || 'xAI request failed' });
  }
  res.json({
    ...payload,
    provider: 'xai',
    model: XAI_REALTIME_MODEL,
    voice: XAI_REALTIME_VOICE,
    websocketUrl: `wss://api.x.ai/v1/realtime?model=${encodeURIComponent(XAI_REALTIME_MODEL)}`
  });
}

app.get('/api/progress', auth, async (req, res) => {
  const result = await pool.query(
    `select state, version, schema_version, last_client_updated_at, updated_at
     from user_progress where user_id = $1`,
    [req.userId]
  );
  if (!result.rowCount) return res.json({ state: null, version: 1, schemaVersion: 1, updatedAt: null });
  const row = result.rows[0];
  res.json({
    state: row.state,
    version: row.version,
    schemaVersion: row.schema_version,
    lastClientUpdatedAt: row.last_client_updated_at,
    updatedAt: row.updated_at
  });
});

function safetyIdentifier(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function advisorInstructions() {
  return [
    'You are ASK ADVISOR, the voice tutor inside the Supply Chain Fluency Canon machine.',
    'Use concise spoken answers in practical supply-chain language.',
    'Ground answers in the SCFC lesson context and tool outputs provided by the browser.',
    'Ask one follow-up question at a time.',
    'If the user asks outside SCFC, redirect back to the current lesson, framework, reading, or decision case.',
    'Do not claim to know sources beyond loaded SCFC content.'
  ].join(' ');
}

function advisorTools() {
  const dayParameter = {
    type: 'object',
    properties: {
      day: { type: 'integer', minimum: 1, maximum: 80 }
    },
    additionalProperties: false
  };
  return [
    {
      type: 'function',
      name: 'get_current_day',
      description: 'Return the active SCFC day, framework, citation, summary, scenario, decision state, and progress context.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      type: 'function',
      name: 'get_glossary_term',
      description: 'Look up an SCFC glossary term by name or partial query.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query'],
        additionalProperties: false
      }
    },
    {
      type: 'function',
      name: 'get_readings_for_day',
      description: 'Return SCFC reading entries connected to a day.',
      parameters: dayParameter
    },
    {
      type: 'function',
      name: 'explain_current_framework',
      description: 'Return a compact explanation target for the active day framework.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    },
    {
      type: 'function',
      name: 'quiz_current_day',
      description: 'Return a short read-only quiz prompt for the current lesson.',
      parameters: { type: 'object', properties: {}, additionalProperties: false }
    }
  ];
}

app.put('/api/progress', auth, async (req, res) => {
  const state = sanitizeState(req.body?.state);
  const clientUpdatedAt = parseClientDate(req.body?.clientUpdatedAt);
  const result = await saveProgress(req.userId, state, clientUpdatedAt);
  if (!result.rowCount) return res.status(409).json({ error: 'stale_progress' });
  res.json(progressResponse(result.rows[0]));
});

app.patch('/api/progress', auth, async (req, res) => {
  const partial = sanitizeStatePatch(req.body?.state || req.body?.patch || {});
  const clientUpdatedAt = parseClientDate(req.body?.clientUpdatedAt);
  const existing = await pool.query('select state from user_progress where user_id = $1', [req.userId]);
  const base = existing.rowCount ? existing.rows[0].state : {};
  const state = sanitizeState(deepMerge(base, partial));
  const result = await saveProgress(req.userId, state, clientUpdatedAt);
  if (!result.rowCount) return res.status(409).json({ error: 'stale_progress' });
  res.json(progressResponse(result.rows[0]));
});

app.post('/api/progress/events', auth, async (req, res) => {
  const eventType = string(req.body?.eventType || req.body?.event_type, 'progress_event').slice(0, 80);
  const payload = sanitizePayload(req.body?.payload || {});
  await pool.query(
    'insert into progress_events (user_id, event_type, payload) values ($1, $2, $3::jsonb)',
    [req.userId, eventType, JSON.stringify(payload)]
  );
  res.json({ ok: true });
});

app.get('/api/admin/users', auth, requireAdmin, async (_req, res) => {
  const result = await pool.query(
    `select user_id, current_day, completion_pct, last_active_at, domain_strengths,
            audio_completion_count, updated_at,
            coalesce(jsonb_array_length(state->'completions'), 0) as completed_count
     from user_progress
     order by last_active_at desc
     limit 500`
  );
  res.json({
    users: result.rows.map(row => ({
      userId: row.user_id,
      currentDay: row.current_day,
      completionPct: row.completion_pct === null ? null : Number(row.completion_pct),
      completedCount: Number(row.completed_count || 0),
      lastActiveAt: row.last_active_at,
      domainStrengths: row.domain_strengths || {},
      audioCompletionCount: row.audio_completion_count,
      stuck: isStuck(row),
      unstarted: Number(row.completed_count || 0) === 0,
      updatedAt: row.updated_at
    }))
  });
});

app.get('/api/admin/users/:id/progress', auth, requireAdmin, async (req, res) => {
  const result = await pool.query(
    'select user_id, state, version, schema_version, last_active_at, updated_at from user_progress where user_id = $1',
    [req.params.id]
  );
  if (!result.rowCount) return res.status(404).json({ error: 'not_found' });
  res.json(result.rows[0]);
});

function sanitizeState(input) {
  const payload = sanitizePayload(input);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw badRequest('invalid_state');
  const state = {
    ...payload,
    schemaVersion: clampInt(payload.schemaVersion, 1, 100, 1),
    view: string(payload.view, 'home'),
    sub: string(payload.sub, 'briefing'),
    currentDay: clampInt(payload.currentDay, 1, 80, 1),
    streak: clampInt(payload.streak, 0, 10000, 0),
    lastCompletedDate: payload.lastCompletedDate || null,
    completions: uniqueInts(payload.completions, 1, 80),
    domains: plainObject(payload.domains),
    tier: payload.tier === 'mastery' ? 'mastery' : 'foundation',
    audioPositions: numberMap(payload.audioPositions, 0, 60 * 60),
    audioCompleted: uniqueInts(payload.audioCompleted, 1, 80),
    decisions: plainObject(payload.decisions),
    scenarioOutcomes: plainObject(payload.scenarioOutcomes),
    capstones: plainObject(payload.capstones),
    masteryUnlocked: Boolean(payload.masteryUnlocked || uniqueInts(payload.completions, 1, 80).includes(60)),
    syncedAt: new Date().toISOString()
  };
  return state;
}

function sanitizeStatePatch(input) {
  const payload = sanitizePayload(input);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw badRequest('invalid_patch');
  return payload;
}

function sanitizePayload(input) {
  const text = JSON.stringify(input ?? {});
  if (Buffer.byteLength(text, 'utf8') > JSON_LIMIT_BYTES) throw badRequest('payload_too_large');
  return JSON.parse(text);
}

function progressMeta(state) {
  const completions = Array.isArray(state.completions) ? state.completions : [];
  return {
    currentDay: clampInt(state.currentDay, 1, 80, 1),
    completionPct: Math.round((completions.length / 80) * 1000) / 10,
    domainStrengths: plainObject(state.domains),
    audioCompletionCount: Array.isArray(state.audioCompleted) ? state.audioCompleted.length : 0
  };
}

async function saveProgress(userId, state, clientUpdatedAt) {
  const meta = progressMeta(state);
  return pool.query(
    `insert into user_progress (
       user_id, state, version, schema_version, last_client_updated_at,
       current_day, completion_pct, last_active_at, domain_strengths, audio_completion_count, updated_at
     )
     values ($1, $2::jsonb, 1, $3, $4, $5, $6, now(), $7::jsonb, $8, now())
     on conflict (user_id) do update set
       state = excluded.state,
       version = user_progress.version + 1,
       schema_version = excluded.schema_version,
       last_client_updated_at = excluded.last_client_updated_at,
       current_day = excluded.current_day,
       completion_pct = excluded.completion_pct,
       last_active_at = now(),
       domain_strengths = excluded.domain_strengths,
       audio_completion_count = excluded.audio_completion_count,
       updated_at = now()
     where user_progress.last_client_updated_at is null
        or excluded.last_client_updated_at >= user_progress.last_client_updated_at
     returning state, version, schema_version, last_client_updated_at, updated_at`,
    [
      userId,
      JSON.stringify(state),
      state.schemaVersion || 1,
      clientUpdatedAt.toISOString(),
      meta.currentDay,
      meta.completionPct,
      JSON.stringify(meta.domainStrengths),
      meta.audioCompletionCount
    ]
  );
}

function progressResponse(row) {
  return {
    ok: true,
    state: row.state,
    version: row.version,
    schemaVersion: row.schema_version,
    lastClientUpdatedAt: row.last_client_updated_at,
    updatedAt: row.updated_at
  };
}

function parseClientDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw badRequest('invalid_client_updated_at');
  return date;
}

function deepMerge(base, patch) {
  const out = { ...plainObject(base) };
  for (const [key, value] of Object.entries(plainObject(patch))) {
    if (value && typeof value === 'object' && !Array.isArray(value) && out[key] && typeof out[key] === 'object' && !Array.isArray(out[key])) {
      out[key] = deepMerge(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function isStuck(row) {
  const lastActive = row.last_active_at ? new Date(row.last_active_at).getTime() : 0;
  const daysIdle = (Date.now() - lastActive) / 86400000;
  return Number(row.completed_count || 0) > 0 && Number(row.completion_pct || 0) < 100 && daysIdle >= 7;
}

function badRequest(error) {
  const err = new Error(error);
  err.status = 400;
  return err;
}

function string(value, fallback) {
  return typeof value === 'string' ? value : fallback;
}

function plainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function clampInt(value, min, max, fallback) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function uniqueInts(values, min, max) {
  return [...new Set(Array.isArray(values) ? values.map(v => clampInt(v, min, max, null)).filter(v => v !== null) : [])].sort((a, b) => a - b);
}

function numberMap(input, min, max) {
  const out = {};
  for (const [key, value] of Object.entries(plainObject(input))) {
    const n = Number(value);
    if (Number.isFinite(n)) out[key] = Math.max(min, Math.min(max, Math.floor(n)));
  }
  return out;
}

app.use((err, _req, res, _next) => {
  res.status(err.status || 500).json({ error: err.message || 'server_error' });
});

app.listen(PORT, () => {
  console.log(`SCFC progress API listening on ${PORT}`);
});
