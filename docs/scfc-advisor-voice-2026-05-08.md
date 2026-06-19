# SCFC Ask Advisor Voice Tutor - 2026-05-08

## Scope
- Added a read-only `ASK ADVISOR` voice tutor surface to the original beige machine / green LCD UI.
- Preserved the post-`CANON80` machine interface. Field Notes remains inactive by default.

## Backend
- Added `GET /api/realtime/session` to the Railway backend.
- The backend mints short-lived OpenAI Realtime client secrets through `OPENAI_API_KEY`.
- The browser never receives the long-lived OpenAI API key.
- Model and voice are configurable with:
  - `OPENAI_REALTIME_MODEL` default: `gpt-realtime`
  - `OPENAI_REALTIME_VOICE` default: `marin`

## Frontend
- Added an `ADVISOR CHANNEL` panel below the episode audio deck.
- Added a compact `ASK ADVISOR` button, plus quick prompts:
  - `Explain framework`
  - `Quiz me`
  - `Close channel`
- The browser uses WebRTC against the OpenAI Realtime API after receiving a short-lived client secret from the backend.

## Read-Only Tools
- `get_current_day`
- `get_glossary_term`
- `get_readings_for_day`
- `explain_current_framework`
- `quiz_current_day`

No write tools were added. The Advisor cannot complete a day, record a decision, or mutate progress.

## Verification
- `node --check app.js`
- `node --check backend/server.js`
- `node --check build/verify.mjs`
- `node build/verify.mjs`
- Local 390px Playwright:
  - `.machine=true`
  - `.lcd=true`
  - `.view-today=false`
  - `ASK ADVISOR` visible
  - no horizontal overflow
  - meter height stable before scroll, after scroll, and after viewport-height change
- Live here.now 390px Playwright passed the same visual checks.

## Preview
- URL: `https://marine-marsh-d7cs.here.now/?access=CANON80&fresh=20260508advisor1`
- Expires: `2026-05-09T11:39:26.748Z`
- Claim URL: `https://here.now/claim?slug=marine-marsh-d7cs&token=a2c09d41252363042831e161b981fa9d8c6bf29aec9fd993896826c80bf36fd4`

## Activation Blockers
- Railway production now has the route deployed, but does not have `OPENAI_API_KEY` configured, so `/api/realtime/session` returns `openai_not_configured`.
- here.now preview responses include `Permissions-Policy: microphone=()`, so the hosted preview can show the UI but cannot exercise real microphone capture.
- Full voice activation needs a production frontend host that allows microphone access and a Railway `OPENAI_API_KEY` configured with explicit approval.
