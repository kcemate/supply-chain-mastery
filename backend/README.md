# SCFC Progress API

Railway-ready Node/Express API for per-user SCFC progress sync with Clerk JWT verification and Postgres persistence.

## Environment

```bash
DATABASE_URL=[REDACTED]
CLERK_JWKS_URL=https://your-clerk-frontend-api/.well-known/jwks.json
CLERK_ISSUER=https://your-clerk-frontend-api
ALLOWED_ORIGINS=https://your-frontend-origin
ADMIN_USER_IDS=user_abc,user_def
PORT=8787
JSON_LIMIT_BYTES=262144
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=120
REALTIME_RATE_LIMIT_WINDOW_MS=60000
REALTIME_RATE_LIMIT_MAX=6
REALTIME_ACCESS_CODES=CANON80
REALTIME_ALLOWED_USER_IDS=
OPENAI_API_KEY=sk-...
OPENAI_REALTIME_MODEL=gpt-realtime
OPENAI_REALTIME_VOICE=marin
XAI_API_KEY=[REDACTED]...
XAI_REALTIME_MODEL=grok-voice-think-fast-1.0
XAI_REALTIME_VOICE=rex
```

`ADMIN_USER_IDS` is optional. Leave it empty to disable admin access.
`XAI_API_KEY` powers the default Grok Voice path for the read-only `ASK ADVISOR` tutor.
`OPENAI_API_KEY` is optional fallback support when the frontend uses `?advisor=openai`.
`REALTIME_ACCESS_CODES` is the explicit beta/test bypass for minting Advisor realtime sessions without Clerk auth. Leave it empty to require Clerk auth. `REALTIME_ALLOWED_USER_IDS` can further restrict Clerk-authenticated users.

## Local Setup

```bash
npm install
npm run apply-schema
npm start
```

`npm run apply-schema` reads `schema.sql` and applies it to `DATABASE_URL`.

## Railway Deploy

```bash
railway init
railway add --database postgresql
railway variables --set "CLERK_JWKS_URL=https://your-clerk-frontend-api/.well-known/jwks.json"
railway variables --set "CLERK_ISSUER=https://your-clerk-frontend-api"
railway variables --set "ALLOWED_ORIGINS=https://your-frontend-origin"
railway variables --set "ADMIN_USER_IDS=user_..."
railway up --detach
railway run npm run apply-schema
```

## API

All `/api/*` routes require:

```text
Authorization: Bearer <Clerk session JWT>
```

User routes:

- `GET /api/progress` - returns the authenticated user's state or `state: null`
- `PUT /api/progress` - replaces the authenticated user's state
- `PATCH /api/progress` - deep-merges a partial state patch into the authenticated user's state
- `POST /api/progress/events` - records progress/diagnostic events
- `GET /api/realtime/session` - mints a short-lived xAI or OpenAI Realtime client secret for `ASK ADVISOR`; accepts `?provider=xai` or `?provider=openai`, requires Clerk auth or a configured beta access code, has a stricter minting rate limit, and never exposes long-lived provider API keys

Admin routes:

- `GET /api/admin/users` - lists user summary rows: current day, completion percent, last active, domain strengths, audio completion count, stuck/unstarted flags
- `GET /api/admin/users/:id/progress` - fetches one user's full progress row

Security rules:

- The authenticated Clerk `sub` is always the owner for user routes.
- User IDs sent by the client are ignored for ownership.
- CORS is limited by `ALLOWED_ORIGINS` when set.
- JSON request size is capped by `JSON_LIMIT_BYTES`.
- A simple IP/auth bucket rate limiter protects the API.
- Realtime session minting rejects unknown browser origins when `ALLOWED_ORIGINS` is set, then requires Clerk auth or `X-SCFC-Access`/`?access=` matching `REALTIME_ACCESS_CODES`.

## Schema

Primary tables:

- `user_progress`
- `progress_events`

`user_progress.state` stores the preserved `scfc-masters-v3` JSON shape. Materialized columns (`current_day`, `completion_pct`, `last_active_at`, `domain_strengths`, `audio_completion_count`) support admin/operator views without changing frontend behavior.

## Checks

```bash
npm run check
```
