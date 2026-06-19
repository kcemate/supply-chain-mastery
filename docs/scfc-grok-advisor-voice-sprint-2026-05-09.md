# SCFC Grok Advisor Voice Sprint - 2026-05-09

## Executive Result

The current SCFC `ASK ADVISOR` implementation is directionally correct for xAI/Grok Voice: browser mic capture stays client-side, Railway mints an ephemeral xAI Realtime secret, the browser authenticates the WebSocket with `xai-client-secret.<token>`, and the Grok Voice session receives SCFC read-only tools plus current lesson context.

The live blocker is not frontend UI or xAI API viability. The blocker is Railway production config: the linked `scfc-progress-api` production service has no `XAI_API_KEY`, `GROK_API_KEY`, or `OPENAI_API_KEY` variable set, so the live endpoint returns `503 {"error":"xai_not_configured"}`. The backend is healthy.

## Official xAI Findings

Sources checked on 2026-05-09:

- Voice overview: https://docs.x.ai/developers/model-capabilities/audio/voice
- Voice Agent guide: https://docs.x.ai/developers/model-capabilities/audio/voice-agent
- Ephemeral tokens: https://docs.x.ai/developers/model-capabilities/audio/ephemeral-tokens
- REST voice reference: https://docs.x.ai/developers/rest-api-reference/inference/voice
- Text to Speech: https://docs.x.ai/developers/model-capabilities/audio/text-to-speech

Relevant docs facts:

- Realtime endpoint: `wss://api.x.ai/v1/realtime`
- Recommended model: `grok-voice-think-fast-1.0`; `grok-voice-fast-1.0` is the older/default model and is documented as deprecated/soon-to-be removed.
- Browser authentication: create `POST https://api.x.ai/v1/realtime/client_secrets`, then pass the returned value as a WebSocket subprotocol with `xai-client-secret.` prefix.
- Ephemeral token request body supports `expires_after: { seconds: 300 }`; xAI docs explicitly note it does not support `session` or `expires_after.anchor` fields in the token request.
- Built-in voices documented: `eve`, `ara`, `rex`, `sal`, `leo`.
- Voice Agent pricing: `$0.05/min` / `$3.00/hr`, billed by audio duration sent to the API.
- TTS pricing in the current docs: `$4.20 / 1M chars`; STT is listed at `$0.20/hr`.

## Existing Implementation Review

Files reviewed:

- `app.js`
- `backend/server.js`
- `backend/README.md`
- `backend/.env.example`
- `build/generate-advisor-voice-samples.js`
- `docs/scfc-advisor-voice-2026-05-08.md`
- `docs/scfc-advisor-grok-voice-2026-05-08.md`

Backend:

- `GET /api/realtime/session?provider=xai` calls `POST https://api.x.ai/v1/realtime/client_secrets`.
- It sends only `expires_after: { seconds: 300 }`, which matches xAI ephemeral token docs.
- It accepts `XAI_API_KEY` or `GROK_API_KEY`.
- It returns `provider`, `model`, `voice`, and `websocketUrl`.
- It never exposes the long-lived xAI key to the browser.

Frontend:

- Default provider is xAI/Grok unless `?advisor=openai` is present.
- Browser requests microphone only after `ASK ADVISOR` is clicked.
- xAI path opens `new WebSocket(..., [\`xai-client-secret.${session.value}\`])`, matching the browser auth docs.
- It sends `session.update` with voice, instructions, server VAD, 24 kHz PCM input/output, read-only SCFC tools, and `tool_choice: 'auto'`.
- It streams mic PCM with `input_audio_buffer.append`.
- It handles both xAI-style `response.output_audio.delta` and OpenAI-style `response.audio.delta`.
- Tool outputs are local/read-only: current day, glossary lookup, readings, framework explanation, and quiz prompt.

UI:

- Original beige machine / green LCD shell is intact.
- `Field Notes` is not revived.
- `ASK ADVISOR` remains a compact machine control below the audio deck.

## Local Improvements Made

- Added `build/test-advisor-voice-shapes.mjs`.
  - Validates xAI WebSocket URL construction.
  - Validates ephemeral token extraction variants.
  - Validates browser subprotocol auth string.
  - Validates mic request is user-started.
  - Validates SCFC read-only tools/context are wired.
  - Validates backend xAI client secret request body follows docs.
  - Validates documented built-in voice coverage in the sample generator.
- Added xAI Realtime env vars to `backend/.env.example`:
  - `XAI_API_KEY=xai-...`
  - `XAI_REALTIME_MODEL=grok-voice-think-fast-1.0`
  - `XAI_REALTIME_VOICE=rex`

## API Verification

Local OpenClaw config has an xAI key available under `models.providers.xai.apiKey`; shell env does not have `XAI_API_KEY` or `GROK_API_KEY`.

Generated real xAI TTS samples for all five documented built-in voices:

- `tmp/advisor-voice-2026-05-09/scfc-advisor-eve-plain.mp3` - 23.784s, 380,544 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-eve-paced.mp3` - 25.968s, 415,488 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-ara-plain.mp3` - 23.592s, 377,472 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-ara-paced.mp3` - 24.432s, 390,912 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-rex-plain.mp3` - 21.432s, 342,912 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-rex-paced.mp3` - 25.176s, 402,816 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-sal-plain.mp3` - 23.664s, 378,624 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-sal-paced.mp3` - 26.544s, 424,704 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-leo-plain.mp3` - 26.760s, 428,160 bytes
- `tmp/advisor-voice-2026-05-09/scfc-advisor-leo-paced.mp3` - 25.872s, 413,952 bytes

Summary JSON:

- `tmp/advisor-voice-2026-05-09/api-check-summary.json`

Realtime smoke test:

- Created an xAI ephemeral client secret.
- Opened `wss://api.x.ai/v1/realtime?model=grok-voice-think-fast-1.0`.
- Received first events: `conversation.created`, `ping`, `session.updated`.
- Error: `null`.

The `GET /v1/tts/voices` response included the five documented built-ins plus many team/custom voice IDs. I generated the five documented built-ins only to avoid a large cost/time spike on unknown custom voices.

## Voice Quality Notes

Best default: `rex`.

- `rex` is the best fit for SCFC Advisor: businesslike, clear, low-friction, and not too theatrical.
- `leo` is strong for instructional prompts and harder coaching moments, but can feel over-commanding for everyday tutoring. Good alternate for "hard mode" or capstone briefings.
- `ara` is warmer and better for supportive coaching, but less boardroom/direct.
- `sal` is balanced and safe, but less distinctive.
- `eve` is useful for demos and energy, but too upbeat for a serious supply-chain tutor.

Recommendation:

- Production default: `XAI_REALTIME_VOICE=rex`.
- Optional mode for capstones or strict quizzes: `leo`.
- Keep `ara` as a future "softer coach" option if voice selection is ever added.

## Sample Scripts / Prompts

Plain sample:

```text
SCFC advisor sample. Today we are using total cost of ownership to separate purchase price from the full landed cost. If EOQ looks cheaper on paper, test the SKU-level carrying cost, supplier risk, and QBR cadence before you commit. Your move is to explain the tradeoff in one sentence, then decide what evidence would change your mind.
```

Paced sample:

```text
<slow>SCFC advisor sample with pacing.</slow> Start with the business outcome: service level, cash, and margin. [pause] <emphasis>TCO is not a slogan.</emphasis> It is the bill after freight, storage, defects, expediting, and supplier failure show up. [long-pause] Now compare EOQ, SKU rationalization, and the next QBR as one operating system.
```

Recommended Realtime system prompt:

```text
You are ASK ADVISOR, the voice tutor inside the Supply Chain Fluency Canon machine. Use concise spoken answers in practical supply-chain language. Ground answers in the SCFC lesson context and tool outputs provided by the browser. Ask one follow-up question at a time. If the user asks outside SCFC, redirect back to the current lesson, framework, reading, or decision case. Do not claim to know sources beyond loaded SCFC content.
```

## Railway Production State

Linked Railway context:

- Project: `scfc-progress-api`
- Environment: `production`
- Service: `scfc-progress-api`

Railway variables are present for core API operation, but these voice variables are absent:

- `XAI_API_KEY`
- `GROK_API_KEY`
- `OPENAI_API_KEY`

Live checks:

- `GET https://scfc-progress-api-production.up.railway.app/health` -> `200 {"ok":true}`
- `GET https://scfc-progress-api-production.up.railway.app/api/realtime/session?provider=xai` -> `503 {"error":"xai_not_configured"}`

Exact activation command once Kyle approves using the available xAI key in Railway:

```bash
cd "/Users/giovanni/Documents/Codex/Supply Chain Mastery/backend"
HOME=/Users/giovanni OPENCLAW_REAL_HOME=/Users/giovanni railway variables --set "XAI_API_KEY=<xai key>"
HOME=/Users/giovanni OPENCLAW_REAL_HOME=/Users/giovanni railway variables --set "XAI_REALTIME_MODEL=grok-voice-think-fast-1.0"
HOME=/Users/giovanni OPENCLAW_REAL_HOME=/Users/giovanni railway variables --set "XAI_REALTIME_VOICE=rex"
HOME=/Users/giovanni OPENCLAW_REAL_HOME=/Users/giovanni railway up --detach
```

Do not paste or log the key. Use Railway's variable setter or dashboard secret field.

## Browser / Hosting Constraints

- Browser WebSockets cannot set arbitrary `Authorization` headers, so the `xai-client-secret.<token>` subprotocol path is required.
- Browser mic capture requires HTTPS or localhost plus a host that allows microphone permission.
- Prior here.now previews sent `Permissions-Policy: microphone=()`, which blocks real mic capture even with valid xAI credentials.
- Use a production frontend host that allows microphone access, or test locally on `localhost` against the Railway backend after adding `localhost` to allowed origins if needed.

## Cost Notes

- Voice Agent API: `$0.05/min` / `$3.00/hr`.
- TTS: `$4.20 / 1M chars`.
- The generated sample set is small. The bigger cost risk is leaving Realtime active during silent browser sessions because billing follows audio duration sent to the API.
- Current implementation streams mic audio while active. Keep the explicit `Close channel` control and consider an inactivity timeout before broad release.

## Test Results

Passed:

```bash
node --check app.js
node --check backend/server.js
node --check build/test-advisor-voice-shapes.mjs
node build/test-advisor-voice-shapes.mjs
node build/verify.mjs
cd backend && npm run check
```

Additional checks:

```bash
node build/generate-advisor-voice-samples.js
ffprobe tmp/advisor-voice-2026-05-09/*.mp3
curl -i https://scfc-progress-api-production.up.railway.app/health
curl -i "https://scfc-progress-api-production.up.railway.app/api/realtime/session?provider=xai"
HOME=/Users/giovanni OPENCLAW_REAL_HOME=/Users/giovanni railway variables --json
```

## Exact Blockers

1. Railway production lacks an xAI provider key.
   - Effect: live `/api/realtime/session?provider=xai` returns `xai_not_configured`.
   - Fix: set `XAI_API_KEY` or `GROK_API_KEY` on Railway.

2. here.now preview hosting blocks microphone.
   - Effect: visual preview can load, but real browser mic capture cannot work there.
   - Fix: use a frontend host with microphone permission policy enabled, or local HTTPS/localhost for testing.

3. No live end-to-end browser mic test was run against production because production has no xAI key.
   - Local API and WebSocket smoke tests succeeded with the OpenClaw-held xAI key.

## Next Actions

1. Add `XAI_API_KEY`, `XAI_REALTIME_MODEL=grok-voice-think-fast-1.0`, and `XAI_REALTIME_VOICE=rex` to Railway production.
2. Redeploy backend.
3. Recheck:

```bash
curl -sS "https://scfc-progress-api-production.up.railway.app/api/realtime/session?provider=xai"
```

Expected: JSON containing `value`, `expires_at`, `provider: "xai"`, `model`, `voice`, and `websocketUrl`.

4. Test `ASK ADVISOR` from localhost or a host that allows microphone.
5. Keep `rex` as default; optionally expose `leo` for capstone/hard-mode sessions later.
