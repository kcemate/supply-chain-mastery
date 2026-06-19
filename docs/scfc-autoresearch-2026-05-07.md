# SCFC Autoresearch - 2026-05-07

Mission Control ticket: `tk_7brv`

## App Map

- `index.html`: static shell, private access gate, original beige machine / green LCD interface, audio deck, palette overlay, cache-busted runtime assets currently at `20260507fit4` for `app.css` and `app.js`.
- `app.css`: machine/LCD UI, responsive/mobile layout, compact width-locked 18-domain meter. It also still contains dormant Field Notes styling from an earlier rejected UI experiment, but the active runtime no longer emits `.view-today`.
- `app.js`: all frontend state, curriculum rendering, source links, audio playback/fallback, local persistence, Clerk bootstrap, remote sync, scenario decisions, and access gate behavior.
- `data.js`: generated one-line SCFC data payload with 18 domains, 80 days, 80 glossary terms, 43 readings, and embedded scripts.
- `build/verify.mjs`: structural verifier for content counts, audio assets, original UI retention, source links, meter stability rules, and manifest consistency.
- `backend/`: Clerk JWT + Postgres progress API for account sync, progress events, and admin progress summaries.
- `scripts/` and `audio/`: 80 podcast script files and 80 production MP3s.
- `tasks/` and docs: build/completion notes, rollback notes, account sync activation notes, and prior Field Notes iteration log.

## Major Risks

- Launch/account sync: the current live `pure-fennel-3dq9` origin still needs Railway/Clerk CORS/origin configuration; Railway CLI was previously logged out, so this remains externally blocked without credentials.
- UI regression: Kyle's desired default is the original machine/LCD UI. Dormant Field Notes CSS is a future accidental-regression risk even though the active app currently passes original UI gates.
- Mobile meter: the latest verified 390px meter height is about 394px; any viewport-height sizing or internal scroll would reintroduce the real-device stretch bug.
- Sync/local fallback: frontend must stay usable without backend/auth and should avoid excessive save/sync churn during audio playback.
- Source linking: Today citation and all Reading rows must keep `SOURCE ↗` links with safe new-tab attributes.
- Verifier coverage: current verifier is strong on counts/assets but can still be hardened around data integrity, runtime UX paths, and backend defaults.

## Iteration 1 - Verifier Data Integrity Gates

- Analyze: The app relies on generated `data.js`, but the verifier mostly checked counts. A bad domain reference, invalid scenario answer key, or malformed reading row could pass as long as totals stayed correct.
- Improvement: Add explicit verifier gates for curriculum domain references, scenario answer-key bounds, and reading row shape/day/tier validity.
- Built: Updated `build/verify.mjs` with the new integrity checks. The first pass correctly exposed that readings use the existing `CANON` tier as well as `CORE`/`EMERGING`, so the gate was adjusted to match the real data contract.
- Verify: `node --check build/verify.mjs && node build/verify.mjs` passed.
- Evaluate: Higher confidence in data integrity with no runtime behavior change. This is a safe verifier-only improvement.
- Changed files: `build/verify.mjs`, `docs/scfc-autoresearch-2026-05-07.md`.

## Iteration 2 - Mobile Source Link Wrapping

- Analyze: Source links were recently added to Today and all Reading rows. On narrow mobile screens, the source header row could become the next overflow risk because it used a non-wrapping horizontal flex layout.
- Improvement: Add a narrow-screen wrapping rule for `.source-head` and tighten source link dimensions below 480px.
- Built: Updated `app.css` with a `max-width:480px` rule for `.source-head`, `.source-link`, and Reading row spacing. Added a verifier gate so the mobile source wrapping rule does not disappear.
- Verify: `node --check build/verify.mjs && node build/verify.mjs` passed. Local Playwright at 390px on the Reading view found 43 links, 0 horizontally overflowing links, and `scrollWidth === innerWidth === 390`; screenshot written to `/Users/giovanni/.openclaw/workspace/tmp/scfc-autoresearch-iter2-mobile-read-390.png`. Desktop Playwright confirmed original machine/LCD UI, no `.view-today`, and 18 meter rows.
- Evaluate: Keeps source link-outs while reducing mobile overflow risk. No change to source URLs or new-tab safety attributes.
- Changed files: `app.css`, `build/verify.mjs`, `docs/scfc-autoresearch-2026-05-07.md`.

## Iteration 3 - Audio Position Save Deduping

- Analyze: MP3 `timeupdate` fires multiple times per second. The code only intended to save every 5 seconds, but every event inside a second where `floor(currentTime) % 5 === 0` could rewrite localStorage and schedule sync repeatedly.
- Improvement: Deduplicate `saveAudioPosition()` by returning early when the floored audio position has not changed.
- Built: Updated `app.js` so `saveAudioPosition(dayNum, position)` calculates `next`, skips identical saved positions, and only writes when the persisted second changes. Added verifier coverage.
- Verify: `node --check app.js`, `node --check build/verify.mjs`, and `node build/verify.mjs` passed. Local Playwright monkeypatched `Storage.prototype.setItem`; calls at `5.1`, `5.8`, and `6.0` produced exactly 2 state writes and persisted position `6`. The same 390px check confirmed meter height `394`, `scrollHeight` `394`, 18 rows, and `overflow:hidden`.
- Evaluate: Reduces local write/sync churn during audio playback while preserving position persistence and completion behavior.
- Changed files: `app.js`, `build/verify.mjs`, `docs/scfc-autoresearch-2026-05-07.md`.

## Iteration 4 - Palette Keyboard Selection

- Analyze: The Find palette was useful but mouse/touch-biased. Keyboard users could open it with `Cmd/Ctrl+K`, but could not arrow through results or press Enter to navigate.
- Improvement: Add active-result tracking plus ArrowUp/ArrowDown/Enter handling for palette results.
- Built: Added `paletteIndex`, active result rendering, `updatePaletteActive()`, input key handling, and `.pal-item.active` styling. Added verifier coverage for the keyboard path.
- Verify: `node --check app.js`, `node --check build/verify.mjs`, and `node build/verify.mjs` passed. Local Playwright at 390px opened Find, searched `Day 11`, pressed Enter, and landed on Day 11 (`EOQ · ECONOMIC ORDER QTY`) with the palette hidden. A second check verified ArrowDown moves the active index to `1`. The meter remained 394px tall with 18 rows and no internal scroll.
- Evaluate: Improves navigation ergonomics without changing the current visual default or persistence model.
- Changed files: `app.js`, `app.css`, `build/verify.mjs`, `docs/scfc-autoresearch-2026-05-07.md`.

## Iteration 5 - Backend Rate-Limit Bucket Cleanup

- Analyze: The API has a simple in-memory rate limiter, but expired buckets were never pruned. A long-running public API could retain one bucket per unique IP/auth class indefinitely.
- Improvement: Prune expired rate-limit buckets at most once per rate-limit window.
- Built: Added `lastRateLimitPrune` and a cleanup loop in `backend/server.js`. Added verifier coverage that the backend pruning guard remains present.
- Verify: `node --check build/verify.mjs && node build/verify.mjs` passed. `cd backend && npm run check` passed (`node --check server.js && node --check scripts/apply-schema.js`).
- Evaluate: Reduces long-run API memory risk without changing request limits or auth behavior.
- Changed files: `backend/server.js`, `build/verify.mjs`, `docs/scfc-autoresearch-2026-05-07.md`.

## Iteration 6 - Publish-Safe Runtime Cache Bust

- Analyze: Iterations 2-4 changed `app.css` and `app.js`. Publishing those changes behind the previous `20260507fit4` asset query could let mobile/webview caches keep stale runtime files.
- Improvement: Advance only the changed runtime asset query strings to a fresh autoresearch token.
- Built: Updated `index.html` so `app.css` and `app.js` use `20260507ar5`. Left unchanged data/config/font assets on their existing versions. Added verifier coverage for the new asset token.
- Verify: `node --check build/verify.mjs && node build/verify.mjs` passed. Local Playwright confirmed the loaded CSS and JS URLs include `20260507ar5`. The 390px meter remained 394px before scroll, after scroll, and after viewport height changed from 844 to 700; all 18 rows stayed visible with no internal scroll.
- Evaluate: Ready for a later publish without stale CSS/JS risk. This does not publish to here.now.
- Changed files: `index.html`, `build/verify.mjs`, `docs/scfc-autoresearch-2026-05-07.md`.

## Final Status

- Iterations completed: 6.
- Repository status: `/Users/giovanni/Documents/Codex/Supply Chain Mastery` is not a git repository, so no commits were made. Changed files are recorded here instead.
- Changed files: `index.html`, `app.css`, `app.js`, `build/verify.mjs`, `backend/server.js`, `docs/scfc-autoresearch-2026-05-07.md`.
- Final verification:
  - `node --check app.js` passed.
  - `node --check build/verify.mjs` passed.
  - `node build/verify.mjs` passed all checks.
  - `cd backend && npm run check` passed.
  - Local Playwright mobile/desktop smoke passed. Mobile 390px meter stayed 394px before scroll, after scroll, and after viewport height change; Reading view had 43 source links with no horizontal overflow; palette Enter navigation landed on Day 11; desktop retained machine/LCD UI with no `.view-today`; Today source link opened a Scholar URL with `target="_blank"` and `rel="noopener noreferrer"`.
- Remaining blockers: account sync on `https://pure-fennel-3dq9.here.now` may remain local-only until the origin is added to Railway/Clerk CORS/allowed origins by a signed-in operator. No secrets or account credentials were used.
- Ready-to-publish recommendation: ready for review/publish after the external CORS/origin update is handled or explicitly accepted as local-only for this anonymous here.now slug. Publish URL should use `fresh=20260507ar5`.
