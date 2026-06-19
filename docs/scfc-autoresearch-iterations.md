# SCFC Autoresearch Iterations

## 2026-05-08 - Mobile LCD First-Screen Priority

Mission Control ticket: `tk_evos`

Analyze: At 390px with `?access=CANON80`, the active machine/LCD UI was correct, but the first-screen sequence put the compact access banner, machine header, mode buttons, and full 18-domain meter before the LCD. The LCD began below the first viewport, delaying access to the daily learning content.

Improvement: Reorder the access-granted mobile machine layout so the original nameplate and mode buttons remain first, the green LCD learning panel comes next, and the 18-domain meter moves below the active work area.

Built: Added a narrow-screen access-granted flex ordering rule in `app.css`, preserving the beige machine, green LCD, modes, audio deck, primary CTA, and non-scrolling 18-domain meter. Advanced the runtime asset token in `index.html` and added verifier coverage for the mobile ordering rule.

Verify: `node --check app.js`, `node --check build/verify.mjs`, and `node build/verify.mjs` passed. Local 390px Playwright confirmed `.machine=true`, `.lcd=true`, `.view-today=false`, no horizontal overflow, and ordering of nameplate -> modes -> LCD -> audio -> primary -> meter. Geometry was checked before scroll, after scroll, and after a viewport-height change; the 18-row meter stayed 394px high and remained below the active learning/audio area.

Evaluate: The daily learning panel now appears in the first mobile viewport instead of being pushed below the full domain meter. This preserves the original SCFC machine identity while making the actual lesson content much easier to reach on mobile.

Changed files: `app.css`, `index.html`, `build/verify.mjs`, `docs/scfc-autoresearch-iterations.md`.
