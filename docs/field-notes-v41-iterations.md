# Field Notes v4.1 Today View Iterations

Ticket: `tk_9rbb`

Scope: SCFC real Today/Home view only. Curriculum, glossary, reading, palette, persistence, and audio pipeline were left intact.

## Iteration 1 - Runtime Font Dependency

- Analyze: The prior app still pulled Google Fonts at runtime and used Caveat Brush for the notebook display.
- Proposed improvement: Install local `@fontsource` packages and generate base64 `@font-face` CSS for the v4.1 Field Notes fonts.
- Built: Added `build/inline-fonts.cjs`, installed font packages, generated `src/fonts-inline.css`, and removed Google Fonts links from `index.html`.
- Test: `node build/inline-fonts.cjs`; `rg "fonts.googleapis|gstatic" index.html app.css app.js`.
- Evaluate: Field Notes fonts load offline from local CSS. Existing Machine fonts now fall back to system serif/mono because v4.1 only required the Today font set.

## Iteration 2 - Real Today Container

- Analyze: The prior notebook attempt used `.view-today-notebook` and retained old scoped CSS.
- Proposed improvement: Rebuild the real Today view under `.view-today`, with body-level activation only while `state.view === 'home'`.
- Built: Updated `render()` and `renderHome()` to emit the v4.1 seven-zone structure: status, day header, domain, framework, action row, audio, progress.
- Test: `node --check app.js`.
- Evaluate: Today/Home now uses the Field Notes structure while other app views still render through the existing Machine surface.

## Iteration 3 - Paper and Wood Base

- Analyze: Screenshot comparison against `IMG_1450.JPG` showed the previous app lacked the full wood tabletop and aged paper depth.
- Proposed improvement: Add fixed wood grain backdrop plus graph-paper page, binding strip, fiber/noise overlays, coffee stain, and bottom paper wear.
- Built: Added v4.1 scoped CSS tokens and texture recipes under `.view-today`.
- Test: Playwright mobile screenshot generated at `/Users/giovanni/.openclaw/workspace/tmp/field-notes-v41-375.png`.
- Evaluate: The screen now reads as an open notebook on wood rather than a flat LCD skin.

## Iteration 4 - Header and Domain Match

- Analyze: The reference relies on chunky marker lettering: `DAY 11 OF 80`, blue domain label, check mark, and red week fraction.
- Proposed improvement: Switch display elements to Permanent Marker and Caveat, preserving real `currentDay` and domain data.
- Built: Styled `.day-text`, `.week-frac`, `.domain-label`, and `.check` from state-driven values.
- Test: Playwright DOM check returned `DAY 16 OF 80` and `THE KRALJIC MATRIX` when seeded to current day 16.
- Evaluate: Visual treatment matches the reference, but the app correctly shows v3 curriculum day numbers rather than hard-coding the reference's inconsistent Day 11/Kraljic pairing.

## Iteration 5 - Framework Card

- Analyze: The framework area needed the torn tape label, bold framework title, typewriter origin/citation, and ruled body text.
- Proposed improvement: Render state-driven framework data into the v4.1 card recipe.
- Built: Added `.framework`, `.tape`, `.framework-card`, `.originator`, `.citation`, and `.body` styles; retained citation copy interaction.
- Test: `node --check app.js`; Playwright screenshot inspection.
- Evaluate: The framework block is the closest state-preserving match to the reference.

## Iteration 6 - Scenario Ticket and Matrix

- Analyze: The reference scenario area uses a beige ticket with red headline and a hand-drawn 2x2 matrix.
- Proposed improvement: Replace the old primary action with a state-integrated scenario ticket and keep the mini matrix SVG beside it.
- Built: Added `.scenario-ticket` and `.action-row` styles; action still calls existing scenario/complete-day behavior.
- Test: Playwright screenshot and DOM interaction path inspection.
- Evaluate: Ticket and matrix are recognizable and remain functional against the existing state machine.

## Iteration 7 - Audio and Progress Strip

- Analyze: The audio card needed a waveform, brass play button, host lines, and bottom progress strip.
- Proposed improvement: Bind the notebook audio controls to the existing `audioElement` state and style the progress strip from streak/completion/domain state.
- Built: Added `.audio-card`, `.waveform`, `.play-stamp`, `.host-row`, `.progress-strip`, bars, calendar, and play/pause UI refresh for `.view-today`.
- Test: Playwright checks confirmed no horizontal scroll at 375px and desktop; generated screenshots at 375px and desktop.
- Evaluate: Audio and progress are visually close and preserve existing audio play/pause/seek persistence.

## Final Notes

- Biggest remaining gap: true photographic paper fiber, irregular handwriting, and real wood/coffee texture still need raster assets to match the reference exactly.
- Data mismatch: the reference image says Day 11 + Kraljic, while the v3 SCFC data has Kraljic on Day 16. The real app preserves current day data instead of hard-coding the reference text.

## Iteration 8 - Photo-Match Base After Design Rejection

- Analyze: Kyle rejected the v4.1 CSS reconstruction because it still looked like a themed web layout rather than the provided photographed notebook design.
- Proposed improvement: Stop approximating the image with CSS cards. Use the provided notebook reference art as the visual base and preserve app behavior through transparent interactive hit areas.
- Built: Copied `IMG_1450.JPG` to `assets/textures/field-notes-reference.jpg`, replaced the Today view visual surface with that raster-backed notebook composition, hid the CSS reconstruction layers, and positioned transparent stateful controls over the art for curriculum/domain/scenario/audio/progress interactions.
- Test: `node --check app.js`, `node build/verify.mjs`, local HTTP asset checks, Playwright 375px screenshot, live HTTP checks after publish, and live 375px screenshot.
- Evaluate: The screenshot now visually matches the reference image instead of reading as a CSS imitation. Remaining limitation: on tall mobile viewports the original reference aspect ratio leaves background space below the notebook; this is filled with a blurred/dark reference backdrop instead of cropping off the right-side matrix/play/progress content.

## Iteration 9 - Remove Faux Phone Chrome

- Analyze: Kyle circled the `7:42 | airplane | 81%` phone/status area and said it was not needed. In the photo-backed pass that text lived inside the reference image, so removing only the hidden HTML overlay would not change the visible result.
- Proposed improvement: Remove the status-row markup and cover the status area on the raster-backed page with a paper-colored patch, preserving the full notebook composition.
- Built: Removed the `.status-bar` markup/style hooks and added a subtle paper patch over the top-left status chrome in the Today image layer.
- Test: `node --check app.js`; live 375px screenshot after publish.
- Evaluate: Rejected. The CSS paint-over visibly looked like a bandaid on top of the photographed notebook.

## Iteration 10 - Raster Cleanup Instead of CSS Patch

- Analyze: Kyle rejected the patched photo pass with "Bro. It looks like ass. Fix it." The problem was not the status removal requirement; it was the visible CSS cover strip.
- Proposed improvement: Remove the CSS patch entirely and edit the notebook JPEG itself so the unwanted status text is gone at the raster layer.
- Built: Cleaned `assets/textures/field-notes-reference.jpg` with a localized delogo/inpaint pass over the baked-in status text, removed `.view-today .page::after`, and cache-busted the notebook image URL with `v=20260507r2`.
- Test: `node --check app.js`, `node build/verify.mjs`, live HTTP checks, and live 375px screenshot at `/Users/giovanni/.openclaw/workspace/tmp/field-notes-raster-clean-live-375.png`.
- Evaluate: The fake phone chrome is gone without a visible paper rectangle. The page now returns to a coherent photographed-notebook look.

## Iteration 11 - Live Interaction Layer

- Analyze: Kyle asked whether the stats were live and pushed the Today view beyond a static image. The photo-backed pass had invisible hit zones, but the visible stats were mostly still the raster reference and the decision scenario had no visible panel.
- Proposed improvement: Keep the photographed notebook as the visual base, then add a visible live overlay for progress/audio stats and a real notebook-style scenario drawer.
- Built: Added live audio time/progress, live streak/domain/completion/audio-complete stats, keyboard-enabled notebook actions, real streak math on completion, progress/stat tap routing, and an in-page decision panel with choices, feedback, debrief, and complete-day flow.
- Test: `node --check app.js`, `node build/verify.mjs`, local Playwright click tests for stats/domain/scenario/audio, local screenshots, live HTTP checks, live Playwright interaction checks, and live 375px screenshot at `/Users/giovanni/.openclaw/workspace/tmp/field-notes-live-stats-live-375.png`.
- Evaluate: Today now behaves like an app surface: tappable notebook zones route to curriculum/scenario/audio/progress, and completion updates the visible live stat layer instead of leaving the page as a static photo.

## Iteration 12 - Account Sync Publish Asset Fix

- Analyze: The `ivory-juniper-2yvj` account-sync publish rendered as a mostly blank brown page after `CANON80` because the clean public bundle omitted `assets/textures/field-notes-reference-clean-20260507.jpg`. The Today view intentionally uses transparent interactive overlays on top of that raster asset, so missing image assets remove the visible notebook.
- Proposed improvement: Include `assets/` in the public bundle and add verifier coverage for the Field Notes raster asset.
- Built: Copied the texture assets into `/Users/giovanni/.openclaw/workspace/tmp/scfc-account-sync-public/assets/`, added `build/verify.mjs` checks for the cleaned raster asset and CSS reference, and published the corrected bundle at `https://frosty-mustard-94bf.here.now/`.
- Test: `node --check app.js`, `node build/verify.mjs`, live HTTP 200 for the cleaned JPEG/CSS/audio, mobile Playwright render at `/Users/giovanni/.openclaw/workspace/tmp/scfc-frosty-fixed-390.png`, Railway health, and CORS preflight from the new origin.
- Evaluate: The blank-page regression is fixed; the notebook raster loads on the live account-sync site and the regression is now covered by verifier checks.

## Iteration 13 - Restore Original SCFC Product UI

- Analyze: Kyle clarified that the account-sync product should be back on the original SCFC UI, not the Field Notes notebook skin. The intended post-access surface is the beige machine shell with the green LCD curriculum panel.
- Proposed improvement: Keep account sync and backend progress persistence, but restore the Today renderer to the original machine/LCD view.
- Built: Replaced the Field Notes `renderHome()` output with the original SCFC LCD content renderer, made the audio deck and primary button visible on Today again, cache-busted runtime assets with `20260507orig1`, and updated the verifier to gate against the original UI contract.
- Test: `node --check app.js`, `node build/verify.mjs`, local Playwright screenshot at `/Users/giovanni/.openclaw/workspace/tmp/scfc-original-ui-restored-local.png`, live Playwright screenshot at `/Users/giovanni/.openclaw/workspace/tmp/scfc-original-ui-restored-live.png`, and live CORS preflight.
- Evaluate: The live account-sync URL now renders the original SCFC machine/LCD interface after `CANON80`; no `.view-today` Field Notes surface is present.

## Iteration 14 - Domain Meter Fit

- Analyze: Kyle sent a mobile screenshot where the 18-domain VU meter panel clipped near the bottom and said it should fully display without scrolling.
- Proposed improvement: Make the domain meter a fixed 18-row grid that scales to the phone viewport instead of using an internally scrolling panel.
- Built: Reworked `.meters-mini` into `grid-template-rows: repeat(18, minmax(0, 1fr))`, removed internal scroll behavior, added mobile viewport sizing/compact rows, cache-busted runtime assets with `20260507fit1`, and added verifier coverage for the non-scrolling 18-row meter contract.
- Test: `node --check app.js`, `node --check build/verify.mjs`, `node build/verify.mjs`, local Playwright meter check (`clientHeight === scrollHeight`, 18 rows, last row present), live HTTP checks, and live Playwright meter check at 390px.
- Evaluate: The meter panel now fits all 18 domains without an internal scroll. Published fresh at `https://pure-fennel-3dq9.here.now/?access=CANON80&fresh=20260507fit1`.

## Iteration 15 - Remove Scroll Stretch

- Analyze: Kyle reported that when he scrolls the mobile page, the meter stretches. The previous fix used `dvh`, which changes as mobile browser chrome collapses/expands.
- Proposed improvement: Remove dynamic viewport units from the meter sizing and use stable small-viewport units instead.
- Built: Replaced `dvh` with `svh` plus a `vh` fallback, added `overscroll-behavior-y:none`, cache-busted runtime assets with `20260507fit2`, and added verifier coverage that rejects `dvh`.
- Test: `node --check app.js`, `node --check build/verify.mjs`, `node build/verify.mjs`, local Playwright scroll metrics, live CSS checks, and live Playwright scroll metrics.
- Evaluate: The live meter height remains stable before and after scroll (`490px` in the 390x844 mobile check), all 18 rows remain present, and no `dvh` remains in the deployed CSS.

## Iteration 16 - Width-Lock Meter Geometry

- Analyze: Kyle sent real-device screenshots showing the meter still stretched after the `svh` pass. The failure was broader than `dvh`: any viewport-height-driven meter geometry could be affected by mobile browser chrome during scroll.
- Proposed improvement: Remove viewport-height units from the meter, row text, and bars entirely; size the meter from viewport width with fixed clamps so scroll/address-bar changes cannot stretch it.
- Built: Added iOS text-size locking, replaced mobile meter height with `height:clamp(470px,126vw,560px)`, replaced row/font/bar sizing with width-based clamps, cache-busted runtime assets with `20260507fit3`, and updated verifier coverage to reject the old `58vh/58svh` pattern.
- Test: `node --check app.js`, `node --check build/verify.mjs`, `node build/verify.mjs`, local Playwright scroll plus viewport-height-resize metrics, live CSS checks, and live Playwright scroll plus viewport-height-resize metrics.
- Evaluate: The live meter stays `491px` high before scroll, after scroll, and after shrinking the viewport height from 844 to 700 at 390px width. All 18 rows remain present and non-scrolling. Published at `https://pure-fennel-3dq9.here.now/?access=CANON80&fresh=20260507fit3`.

## Iteration 17 - Source Link Outs

- Analyze: Kyle asked whether the Reading sources could link out. The app already had citation metadata for every Today framework and 43 reading entries, but no outbound source affordance.
- Proposed improvement: Add a compact `SOURCE ↗` action to Today citations and every Reading card, using Scholar lookup URLs generated from the existing citation/title metadata so every source links out without maintaining brittle hand-entered links.
- Built: Added source URL/link helpers in `app.js`, added `SOURCE ↗` links to `renderHome()` and `renderRead()`, styled `.source-link`/`.source-head`, cache-busted runtime assets with `20260507src1`, and added verifier coverage.
- Test: `node --check app.js`, `node --check build/verify.mjs`, `node build/verify.mjs`, local Playwright source-link check, live HTTP checks, and live Playwright source-link check.
- Evaluate: Today now has a citation source link and the Reading screen renders 43 source links, each opening a Scholar query in a new tab with `rel="noopener noreferrer"`. Published at `https://pure-fennel-3dq9.here.now/?access=CANON80&fresh=20260507src1`.

## Iteration 18 - Meter Section 20% Shrink

- Analyze: Kyle sent a screenshot of the mobile domain meter and said the section was about 20% too big.
- Proposed improvement: Keep the width-locked no-stretch approach but reduce the mobile meter panel and row typography by roughly 20%.
- Built: Changed the mobile meter clamp from `470px/126vw/560px` to `376px/101vw/448px`, tightened row gap/padding, reduced meter row columns/text size/bar height, and cache-busted runtime assets with `20260507fit4`.
- Test: `node --check app.js`, `node --check build/verify.mjs`, `node build/verify.mjs`, local Playwright scroll plus viewport-height-resize metrics, live HTTP checks, and live Playwright scroll plus viewport-height-resize metrics.
- Evaluate: At 390px width the meter is now `394px` high instead of `491px` (about 20% smaller), remains non-scrolling, keeps all 18 rows visible, and stays the same height after scroll and viewport-height changes. Published at `https://pure-fennel-3dq9.here.now/?access=CANON80&fresh=20260507fit4`.
