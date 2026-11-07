# Decision Intelligence here.now publication receipt

User request: create a new here.now for the latest Flyway prototype. This is a public browser-only publication, not a production or live-AI deployment.

## Publication

- Live URL: https://steady-anvil-kj2r.here.now/
- Current publish command finalized successfully; anonymous, no API key used.
- Expires at `2026-11-08T03:34:54.160Z` unless claimed. One-time claim URL is supplied privately in the user handoff, not this receipt.
- Thirteen allowlisted public browser files, approximately 6.2 MB. No workspace data, credentials, service intermediates, or hosting control-plane metadata uploaded.
- Root, all 13 files, and `/decisions` SPA fallback return HTTP 200 and match staged bytes by SHA-256.
- Index SHA-256: `145c9e0d1db5301f12bc33863e2fdf68aa1c52b92530f79f1afb9efa1c7aa1a8`.
- Fresh TypeScript/Vite build, design lint and whitespace checks pass. Same index identity as the previously tested prototype.
- Route: here-now and otto-os-rails; hosted verification through browse with a disposable bundled Chromium/CDP browser. Existing hosting metadata and user browser state were preserved. No duplicate upload after interruption.

## Hosted interactions and visual inspection

1. Opened the live URL in a fresh browser context and completed all four onboarding steps, including the independent-simulation acknowledgment.
2. Confirmed the public atlas describes 3,458 official location pages, 16 publicly evidenced distribution facilities, and no verified service territories.
3. Opened Decision Intelligence and clicked Analyze network. Calculated analysis produced one automatic decision and one human-review decision.
4. Inspected the human capacity proposal: 20% modeled Mebane capacity change, deterministic engine `flyway-deterministic-2.0.1`, measured before/after metrics, explicit synthetic operating assumptions, routing reasons, input/output hashes, and reasoned approval/defer/reject controls.
5. Opened the decision-linked copilot and submitted its explanation prompt. Model tools returned the actual decision status, measured tradeoffs, human-authority boundary and saved calculation lineage.
6. Captured and visually inspected desktop 1440×1000, tablet copilot 1024×768, and dark tablet 1024×768. Main controls remain visible and the copilot retains its composer/close control. Reload returns to the public atlas without a page error. This hosted check does not independently prove persisted decision reload; prior local tests cover persistence.

Screenshots under `tasks/browser-evidence/`:

- `here-now-decision-desktop.png`
- `here-now-copilot-tablet.png`
- `here-now-decision-tablet-dark.png`

## Browser health and limitations

Unfiltered hosted-session observations: four WebGL `GPU stall due to ReadPixels` warnings, zero console errors, zero page exceptions, zero failed requests and zero HTTP errors. The existing strict warning-free browser release gate remains failed; publication success does not waive it. The disposable verification browser was closed after the check.

This origin begins with a new per-browser local sample workspace. Existing local or service workspaces were not uploaded. Decision Intelligence and calculated copilot model tools work without a backend; real AI and service synchronization require a separately configured authenticated service/provider. No credentials were read/configured and no live provider call or paid operation was performed. Other production-readiness gaps remain as documented in `decision-intelligence-prototype-2026-11-06.md`.
