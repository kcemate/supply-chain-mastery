# SCFC Ask Advisor Grok Voice Wiring - 2026-05-08

## Goal

Wire `ASK ADVISOR` to Grok Voice while preserving the original beige machine / green LCD SCFC interface.

## Result

- Added xAI as the default realtime voice provider.
- Kept OpenAI Realtime available as an explicit fallback with `?advisor=openai`.
- Added `GET /api/realtime/session?provider=xai` on the Railway backend.
- The backend mints short-lived xAI client secrets and never exposes the long-lived `XAI_API_KEY` / `GROK_API_KEY`.
- The frontend opens an xAI WebSocket voice channel using `grok-voice-think-fast-1.0`.
- The same read-only Advisor tools are preserved:
  - `get_current_day`
  - `get_glossary_term`
  - `get_readings_for_day`
  - `explain_current_framework`
  - `quiz_current_day`

## Provider Behavior

- Default: xAI / Grok Voice.
- Fallback: OpenAI Realtime when the page is loaded with `?advisor=openai`.
- xAI runtime env:
  - `XAI_API_KEY` or `GROK_API_KEY`
  - `XAI_REALTIME_MODEL`, default `grok-voice-think-fast-1.0`
  - `XAI_REALTIME_VOICE`, default `rex`
- OpenAI runtime env:
  - `OPENAI_API_KEY`
  - `OPENAI_REALTIME_MODEL`, default `gpt-realtime`
  - `OPENAI_REALTIME_VOICE`, default `marin`

## Current Production State

Railway backend code is deployed, but production currently has no provider key configured:

- `XAI_API_KEY=false`
- `GROK_API_KEY=false`
- `OPENAI_API_KEY=false`

Expected live response until a key is added:

```json
{"error":"xai_not_configured"}
```

## Verification

- `node --check app.js`
- `node --check backend/server.js`
- `node --check build/verify.mjs`
- `node build/verify.mjs`
- Local 390px Playwright check:
  - `.machine=true`
  - `.lcd=true`
  - `.view-today=false`
  - `ASK ADVISOR` visible
  - no horizontal overflow
  - domain meter stable before scroll, after scroll, and after viewport-height change
- Live 390px Playwright check:
  - `.machine=true`
  - `.lcd=true`
  - `.view-today=false`
  - `ASK ADVISOR` visible
  - no horizontal overflow

## Preview

Visual-only preview:

https://chilly-vessel-5kyg.here.now/?access=CANON80&fresh=20260508grok1

here.now still sends `Permissions-Policy: microphone=()`, so this preview cannot exercise real microphone capture. Use a frontend host that allows microphone access for the live voice test.

## Regression Fix

Kyle reported that the recordings fell back to robot speech and `ASK ADVISOR` did not work on the Grok preview.

Findings:
- The `chilly-vessel-5kyg` preview was a lightweight publish that omitted `/audio/day-XX.mp3`; `/audio/day-11.mp3` returned 404, which triggered the scripted browser speech fallback.
- Source MP3 files were intact locally.
- The backend still returns `xai_not_configured` / `openai_not_configured`, and the local Railway CLI is logged out, so voice credentials/CORS cannot be corrected from this machine yet.
- here.now continues to send `Permissions-Policy: microphone=()`, so hosted here.now previews cannot perform real microphone capture even after API credentials are configured.

Fix:
- Republished a full-audio bundle at `https://cerulean-inlet-b2x3.here.now/?access=CANON80&fresh=20260508grok2`.
- Hardened the player so missing/invalid MP3s no longer switch to robot speech by default. Browser speech fallback is now opt-in via `window.SCFC_CONFIG.enableSpeechFallback === true`.
- Added a verifier gate for the no-robot fallback behavior.
