# Structured Ontology Scene Plan

## GitHub Publish Plan - 2026-06-19

- [x] Confirm the current project should be published as one repo first instead of splitting into separate repos.
- [x] Make a temporary readable working copy because the original `Documents/Codex` folder is protected by macOS.
- [x] Inspect project shape, package scripts, large files, and local config before initializing Git.
- [x] Add repo hygiene files and keep generated/local artifacts out of the first commit.
- [x] Run frontend and backend verification from the working copy.
- [x] Create a private `kcemate/supply-chain-mastery` GitHub repository.
- [x] Commit the publishable source/content set.
- [x] Push the initial commit to GitHub.
- [x] Record final repository URL and verification results.

### Verification Results

- `npm run verify`: passed after installing the missing Playwright Chromium runtime.
- `npm run design:lint`: passed with 0 errors and 0 warnings.
- `npm run check` in `backend/`: passed.

### Publish Review

- Repository: https://github.com/kcemate/supply-chain-mastery
- Visibility: private.
- Branch: `main`.
- Initial commit: `6551b31`.
- Included source/content: frontend app, backend API, course scripts, audio, docs, PDFs, build utilities, and working notes.
- Excluded generated/local artifacts: dependency folders, `dist/`, `tmp/`, backups, local deployment metadata, `config.js`, logs, and generated task screenshots.

## Active Fidelity Replan - 2026-06-18

The current app is a strong structured SVG approximation, but the active goal is stricter than the previous checklist: beside `public/ontology-system.png`, the app should read as the same diagram with only the bottom-left vendor logo/wordmark removed. The current evidence does not prove that yet because visible app chrome changes the first view, editable labels are rendered as HTML `foreignObject` buttons instead of SVG `<text>`, data-card values/status dots are mutable even though only text labels should be editable, and several source-image details are simplified.

### Source Tokens Extracted From `public/ontology-system.png`

- Canvas/header: near white `#f8f8f8`; page canvas median `#f8f8fa`; lavender wash median `#eae6fb`.
- Ink/linework: black `#000000`; dark UI line `#202020`; medium line `#808080` / `#909090`; soft grid and connector grays around `#c8c8c8`, `#d8d8d8`, `#e8e8e8`.
- Accent fills: object/action blue median around `#358cff`; action green around `#5f8ccd` / dark green quantized `#507868`; automation purple around `#9880f0`; source blue tile median `#d8eeff`; logic tile median `#eeeaff`; systems tile median `#d2e0da`.
- Typography: title is large black proportional sans; diagram headings are narrow squared mono/sans caps; data-card/body labels are compact sans with tabular mono values.
- Geometry/style: 3201 x 1801 source, 16:9 composition; static isometric SVG line art, mostly 1-2 px strokes, 2-8 px radii, pale translucent planes, thin curved connector bundles with dot markers.

### Current Gap Checklist

- [x] Make the default viewport diagram-first: no visible toolbar, border, minimap, zoom buttons, or other chrome in the first visual state.
- [x] Fit the complete 3200 x 1800 scene without cropping the `Ontology System` title.
- [x] Replace default editable label rendering with real inline SVG `<text>` elements; use HTML input only while an item is actively being edited.
- [x] Restrict editing to text labels only: title, section headers, pill tags, platform/tile labels, object names, relationship verbs, action chips, data-card title/row labels. Keep data-card values and status dots fixed.
- [x] Remove CSS/pointer 3D/parallax effects so the implementation is a static inline-SVG isometric drawing, not a 3D-presented scene.
- [ ] Tighten source-image fidelity for the top app illustrations, central object icons, connector bundles, and lower source platforms.
- [x] Update browser smoke verification to assert SVG text labels, no default `foreignObject`, fixed status/value behavior, no visible chrome in the screenshot state, no canvas/WebGL, and no vendor branding.
- [x] Re-run build, browser smoke, and visual screenshots; record the remaining fidelity gaps honestly.

### 2026-06-18 Review

- Converted editable labels from default HTML `foreignObject` buttons to SVG `<text>` with transparent SVG hit rectangles; `foreignObject` now appears only for the active inline input.
- Hid editor chrome from the default diagram view and moved the topbar out of the title hit area; controls reveal on keyboard focus and remain available to tests/clicks.
- Froze data-card values and status dots in SVG, removed status-dot mutation from the store, and ignored incoming hash changes to fixed card values/statuses.
- Removed the visible selected-node halo and CSS/pointer 3D/parallax presentation from the default scene.
- Added a central graph icon pass so object nodes no longer repeat generic plus placeholders; nodes now use bespoke SVG line art for plant, stacks, crates, trucks, documents, server racks, panels, and revenue stacks.
- Restored top-biased overview framing for narrow/tall viewports so the diagram starts at the visible title/header instead of centering with a large blank band above it.
- Verification passed: `npm run verify` and `npm run design:lint`. Browser smoke now checks SVG text labels, no default `foreignObject`, fixed values/status dots, hidden default chrome, readonly share/editable copy, PNG export, narrow layout, no canvas renderer, no vendor text, and no console errors.
- Remaining fidelity gap: the scene is closer but still not indistinguishable from the PNG. Top app-window illustrations, exact connector density/routing, and several miniature isometric object drawings still need a dedicated source-matching pass before the goal can be considered complete.

### Fidelity Tranche 2 Plan

- [x] Increase upper and lower connector bundle density to better match the source diagram's many thin curved lines, including purple automation lines under `AUTOMATIONS`.
- [x] Enrich the three upper app platforms with more source-like line-art: monitor stands, chart details, layered automation panels, small node boxes, controller shapes, and hierarchy diagrams.
- [x] Add source-like hatch/edge detail to bottom source slabs without changing editable tile labels.
- [x] Re-run `npm run verify` and `npm run design:lint`; inspect desktop and narrow smoke screenshots.

### 2026-06-18 Fidelity Tranche 2 Review

- Reworked upper app illustrations: analytics now has overlapped monitor/chart panels and stands; automations has two detailed list windows, central rack panels, and small node cards; products has hierarchy details, controllers, and cube composition.
- Rebuilt connector bundles with left/center/right groups, denser lower source fan-outs, dot markers, and a purple middle automation run under `AUTOMATIONS`.
- Added repeated diagonal hatch marks to slab edges, including lower source platforms.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected regenerated `tasks/ontology-scene-smoke.png` and `tasks/ontology-scene-narrow-smoke.png`.
- Remaining fidelity gap: the result is materially closer but still not objectively pixel-faithful. The next pass should focus on exact source geometry/spacing and the small central isometric object drawings/connector labels, not new interaction features.

### Fidelity Tranche 3 Plan

- [x] Tighten the `PLANT OBJECT` data card width and x-position toward the source image.
- [x] Reduce card field/value typography to match the more compact source card.
- [x] Re-run verification and inspect screenshots.

### 2026-06-18 Fidelity Tranche 3 Review

- Shifted the `PLANT OBJECT` card right and narrowed it from `350` to `305` SVG units to better match the source card footprint.
- Reduced card title, field, and value text sizes for a more compact source-like table.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected regenerated desktop screenshot.

### Fidelity Tranche 4 Plan

- [x] Use the side-by-side central crop to correct `PLANT OBJECT` card x-position.
- [x] Reposition central relationship verb chips closer to their source line labels.
- [x] Nudge several unlabeled central object icons so they read less crowded and closer to the source crop.
- [x] Re-run verification and inspect central screenshot.

### 2026-06-18 Fidelity Tranche 4 Review

- Generated `tasks/central-graph-compare.png` to compare the source and current central graph crops at the same coordinates.
- Moved the `PLANT OBJECT` card back left while keeping the narrower source-like width.
- Repositioned `Supplies`, `Prepares`, `Ships`, `Generates`, and `Updates` relationship labels closer to the source crop.
- Nudged several unlabeled central icons and changed the SVG layer order so relationship labels render above object art and remain readable/clickable.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected the regenerated central crop comparison.
- Remaining fidelity gap: the graph still has visibly different bespoke mini-icons and exact node density compared with the source. The next pass should focus on replacing the central mini-icons with closer source-specific drawings, not on app behavior.

### Fidelity Tranche 5 Plan

- [x] Inspect source/current central graph crops and current `NodeIcon` implementation.
- [x] Replace generic central mini-icons with more source-specific SVG drawings while preserving text targets.
- [x] Re-run verification and inspect desktop, narrow, and central comparison screenshots.
- [x] Document remaining fidelity gaps honestly.

### 2026-06-18 Fidelity Tranche 5 Review

- Generated `tasks/central-icons-compare.png` for a focused source/current comparison of the central mini-icons.
- Replaced several central fixed icon drawings with more source-specific SVG: smaller triangular Warehouse mark, source-like Plant building, layered staff/source stacks, supplier building, inventory cubes, shipment/carrier trucks, contract rack strips, and factory/model structure.
- Removed two non-source visual artifacts from the central graph: the blue card-anchor curve and animated flow pulses.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected regenerated desktop, central graph, and central icon comparison screenshots.
- Remaining fidelity gap: the central plane still differs from the source in exact icon density and some object art silhouettes. A future pass should continue replacing individual mini-icons against the source crop and tune graph-plane scale/position at the pixel level.

### Fidelity Tranche 6 Plan

- [x] Add missing fixed, unlabeled central mini-objects visible in the source crop to increase graph density.
- [x] Give those mini-objects source-like silhouettes without adding any editable labels.
- [x] Tune central graph spacing only where needed to reduce sparse areas.
- [x] Re-run verification and inspect regenerated comparison/screenshots.

### 2026-06-18 Fidelity Tranche 6 Review

- Added fixed, unlabeled mini-objects to the central graph for source-like density: upper-left stack, warehouse process object, customer activity object, schedule documents, and forecast bars.
- Added id-specific SVG silhouettes for those objects while preserving the existing editable text target list.
- Corrected the first size pass after comparison: scaled the new mini-objects down and nudged them so they no longer dominate the graph.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected `tasks/ontology-scene-smoke.png`, `tasks/central-icons-compare.png`, and `tasks/central-graph-compare.png`.
- Remaining fidelity gap: graph density is closer, but exact node locations and silhouettes are still not pixel-matched. A future pass should tune the central plane against the source at object-by-object coordinates.

### Fidelity Tranche 7 Plan

- [x] Add fixed source-like glyphs around the `AI + HUMAN TEAMING` heading.
- [x] Preserve `AI + HUMAN TEAMING` as the only editable text target in that heading area.
- [x] Re-run verification and inspect screenshots.

### 2026-06-18 Fidelity Tranche 7 Review

- Added fixed, source-like sparkle and human-team glyphs around the editable `AI + HUMAN TEAMING` heading.
- Kept the glyphs pointer-events-free and `aria-hidden`; the heading text remains the only editable text target in that area.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected regenerated desktop screenshot.
- Remaining fidelity gap: the top band is closer, but exact glyph proportions and spacing still differ slightly from the source. More meaningful remaining work is central graph plane/object coordinate tuning.

### Fidelity Tranche 8 Plan

- [x] Measure source/current bounding boxes for major diagram bands.
- [x] Patch the largest measured layout mismatch toward the source.
- [x] Re-run verification and inspect regenerated screenshots.
- [x] Record measured results and remaining gaps.

### 2026-06-18 Fidelity Tranche 8 Review

- Measured major region bounds against `public/ontology-system.png` resized to the app's `3200 x 1800` coordinate system.
- Prior to the final right-edge patch, the largest measured layout miss was the central graph right edge: source bbox `[659,780,2467,1320]`, current bbox `[659,780,2509,1320]`.
- Shifted only the far-right central edge cluster and matching automation route/chip left; after regeneration the central graph bbox is `[659,780,2472,1320]`, leaving a 5 px right-edge delta.
- The upper app band remains tightly aligned at source `[677,391,2571,760]` vs current `[678,390,2576,760]`.
- The bottom source band remains tightly aligned after the title-y adjustment at source `[597,1320,2651,1718]` vs current `[595,1320,2654,1717]`.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected `tasks/ontology-scene-smoke.png` and `tasks/central-bbox-compare.png`.
- Remaining fidelity gap: the scene still differs from the PNG in exact miniature object silhouettes, line routing density, and some label/icon positions. The layout bounds are now close enough that the next pass should focus on per-object visual matching rather than broad band geometry.

### Fidelity Tranche 9 Plan

- [x] Extract source/current colored chip component bounds for central blue object labels, green action chips, and purple automation badges.
- [x] Patch central chip geometry and label text sizing toward the source component bounds without changing fixed icons, values, or edit behavior.
- [x] Re-run verification and regenerate smoke screenshots.
- [x] Re-measure the colored chip components and record remaining gaps.

### 2026-06-18 Fidelity Tranche 9 Review

- Extracted colored central chip components from the source and current smoke screenshot inside the central graph region.
- Shrank and repositioned blue object labels to source-sized bounds: examples now match source at `Customer [1577,948,1670,981]`, `Warehouse [1265,984,1357,1016]`, `Plant [968,1186,1060,1218]`, `Order [1632,1186,1725,1218]`, and `Forecast [2189,1184,2282,1216]`.
- Shrank and repositioned green action chips to source component bounds: examples now match source at `Notify Customer [1557,916,1691,942]`, `Allocate Inventory [1244,1026,1378,1052]`, `Schedule Delivery [1604,1148,1753,1181]`, `Change Forecast [2170,1152,2305,1178]`, and `Flag Staff Shortage [948,1153,1083,1180]`.
- Shrank the main automation badges to the source's `93-94 x 19` footprint and moved the plant, warehouse, customer, order, forecast, and right-side automation badges toward their measured source coordinates.
- Narrowed the `PLANT OBJECT` card from `305` to `288` SVG units and adjusted its fixed status/value columns so the card no longer covers the source-aligned `Flag Staff Shortage` chip.
- The central graph diff improved after this tranche from roughly `25.30 / 51.49` mean/RMS to `21.58 / 45.27`; the central graph bbox remains tightly aligned at source `[659,780,2467,1320]` vs current `[659,780,2472,1320]`.
- Verification passed: `npm run verify` and `npm run design:lint`; inspected `tasks/ontology-scene-smoke.png` and regenerated `tasks/central-chips-compare.png`.
- Remaining fidelity gap: object/icon silhouettes and exact internal graph routing still differ visibly from the PNG. The next pass should focus on individual central mini-object drawings and gray relationship label placement rather than the colored chip dimensions.

### Fidelity Tranche 10 Plan

- [x] Extract source/current gray relationship label component bounds for `Supplies`, `Prepares`, `Ships`, `Generates`, and `Updates`.
- [x] Patch relationship chip coordinates, dimensions, and label sizing toward source bboxes without changing edit behavior.
- [x] Re-run verification and regenerate relationship comparison artifacts.
- [x] Re-measure the relationship band and record remaining gaps.

### 2026-06-18 Fidelity Tranche 10 Review

- Extracted gray relationship label boxes from the source/current central crop and generated `tasks/central-relationship-compare.png`.
- Repositioned and resized the five editable relationship chips to source-measured boxes: `Generates [1777,984,1870,1016]`, `Supplies [1152,1075,1245,1107]`, `Ships [1605,1075,1698,1107]`, `Prepares [1435,1092,1528,1125]`, and `Updates [2067,1092,2160,1125]`.
- Reduced relationship label text from `16px` to `15px` in both embedded SVG export styles and runtime CSS so the editable text remains centered inside the source-sized chips.
- Relationship crop diff improved from `31.30 / 55.05` mean/RMS to `29.07 / 52.38`; central graph diff improved to `20.57 / 43.80`.
- Verification passed: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: the relationship labels now occupy source-like boxes, but many underlying central mini-object silhouettes and route paths still differ, causing local overlaps and visual mismatch in the relationship crop.

### Fidelity Tranche 11 Plan

- [x] Compare source/current center-object crop around the shipment mini-object.
- [x] Replace the current oversized single shipment truck with a source-like two-truck silhouette near the measured source footprint.
- [x] Re-run verification and regenerate object comparison crops.
- [x] Record measured diff movement and remaining central object gaps.

### 2026-06-18 Fidelity Tranche 11 Review

- Generated focused crops for central mini-objects, including `tasks/center_objects-compare.png` and `tasks/shipment_cluster-compare.png`.
- Replaced the current oversized single shipment truck with two smaller overlapping trucks and moved the node center toward the source truck cluster.
- Direct dark-component measurement now places the current truck cluster inside the source footprint: source dark components span roughly `x=1472..1561, y=1025..1063`; current dark components span roughly `x=1466..1552, y=1023..1057`.
- Center-object crop diff improved from `32.36 / 56.87` mean/RMS to `31.02 / 54.77`; relationship crop improved slightly from `29.07 / 52.38` to `28.90 / 52.08`; central graph diff improved to `20.49 / 43.64`.
- Verification passed: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: the truck footprint is closer, but the source still has different stroke density and surrounding mini-object silhouettes. The next object pass should target the oversized lower-center warehouse/building icon and the right-side document/model groups.

### Fidelity Tranche 12 Plan

- [x] Compare source/current dock-region crop for the lower-center mini-object under `Prepares`.
- [x] Replace the current oversized warehouse silhouette with a compact source-like multi-block process object.
- [x] Re-run verification and regenerate dock/lower-object comparison crops.
- [x] Record measured diff movement and remaining central object gaps.

### 2026-06-18 Fidelity Tranche 12 Review

- Generated focused dock/lower-center crops: `tasks/dock_region-compare.png`, `tasks/lower_center_objects-compare.png`, and `tasks/lower_objects-compare.png`.
- Replaced the oversized lower-center `dock` warehouse/building silhouette with a compact four-block process object using source-like isometric cubes and blue connector strokes.
- Nudged the `dock` node center left/up so the object sits in the source object's local footprint instead of occupying the oversized warehouse position.
- After a scale refinement, dock-region diff improved from `27.71 / 48.69` mean/RMS to `25.63 / 44.18`; lower-center object diff improved from `26.29 / 44.82` to `25.20 / 42.30`; central graph diff improved slightly to `20.45 / 43.55`.
- Verification passed: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: the dock object now matches the source object category and scale more closely, but exact stroke routing, surrounding graph lines, and right-side document/model mini-objects still differ.

### Fidelity Tranche 13 Plan

- [x] Compare source/current right-side model/docs crop below `Update LTV Model`.
- [x] Replace the oversized factory-like `model` silhouette with a compact source-like stacked model object.
- [x] Re-run verification and regenerate right-side comparison crops.
- [x] Record measured diff movement and remaining right-side object gaps.

### 2026-06-18 Fidelity Tranche 13 Review

- Generated focused right-side crops: `tasks/model_docs_region-compare.png`, `tasks/right_mid_objects-compare.png`, `tasks/forecast_bars_region-compare.png`, and `tasks/contract_channel_region-compare.png`.
- Replaced the oversized factory-like `model` silhouette under `Update LTV Model` with a compact stacked model object using source-like layered isometric strips, dark wedge, and blue dot detail.
- Moved the fixed `model` node center left/down to sit under the source LTV chip instead of occupying the larger factory footprint.
- Target model/docs crop diff improved from `30.72 / 52.23` mean/RMS to `28.87 / 47.93`; right-mid object diff improved from `31.10 / 54.41` to `30.60 / 53.31`; central graph diff improved slightly to `20.41 / 43.43`.
- Verification passed: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: the large factory mismatch is removed, but the right-side document stack, forecast-bar mini-object, and exact purple route geometry still differ from the source.

### Fidelity Tranche 14 Plan

- [x] Compare source/current schedule-docs crop around the right-lower checklist mini-object.
- [x] Replace the current oversized document stack with a narrower source-like three-page checklist.
- [x] Re-run verification and regenerate right-lower comparison crops.
- [x] Record measured diff movement and remaining right-side object gaps.

### 2026-06-18 Fidelity Tranche 14 Review

- Generated focused right-lower crops: `tasks/schedule_docs_region-compare.png`, `tasks/right_lower_objects-compare.png`, and `tasks/right_mid_objects-compare.png`.
- Moved the fixed `schedule-docs` node left into the source object's edge position and replaced the oversized document stack with a narrower three-page checklist silhouette.
- Reduced the checklist drawing scale and tightened its page offsets so it no longer dominates the right-lower crop.
- Target schedule-docs crop diff improved from `29.61 / 52.68` mean/RMS to `25.13 / 46.04`; right-lower object diff improved from `27.63 / 47.62` to `26.36 / 45.63`; right-mid object diff improved from `30.60 / 53.31` to `29.77 / 51.91`; central graph diff improved to `20.31 / 43.24`.
- Verification passed: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: the right-side checklist is closer, but the forecast-bar mini-object, central box object near `Updates`, and exact purple route geometry still differ visibly from the source.

### Fidelity Tranche 15 Plan

- [x] Compare source/current forecast-bars crop near the `Forecast` object.
- [x] Replace the oversized grid-like `forecast-bars` silhouette with a smaller source-like vertical bar cluster.
- [x] Re-run verification and regenerate forecast/right-lower comparison crops.
- [x] Record measured diff movement and remaining right-side object gaps.

### 2026-06-18 Fidelity Tranche 15 Review

- Generated focused forecast/right-lower crops: `tasks/forecast_bars_region-compare.png`, `tasks/forecast_group_region-compare.png`, `tasks/right_lower_objects-compare.png`, and `tasks/right_mid_objects-compare.png`.
- Moved the fixed `forecast-bars` node slightly right toward the source's compact vertical-bar object near `Forecast`.
- Replaced the oversized grid-like bar cluster with a smaller source-like vertical stack and shortened the green baseline detail.
- Target forecast-bars crop diff improved from `29.57 / 49.52` mean/RMS to `27.21 / 45.99`; right-lower object diff improved from `26.36 / 45.63` to `26.18 / 45.48`; central graph diff improved slightly to `20.29 / 43.23`.
- Verification passed: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: the forecast-bar object is closer in scale and position, but it is still taller/more grid-like than the source. The next useful pass should target exact purple route geometry or the central box object near `Updates`.

### Fidelity Tranche 16 Plan

- [x] Compare source/current `Updates` box/route crop and identify the right-side purple route mismatch.
- [x] Patch the right half of the fixed purple automation route toward the lower source path under `Updates`.
- [x] Re-run verification and regenerate `Updates`/right-route comparison crops.
- [x] Record measured diff movement and remaining route/object gaps.

### 2026-06-18 Fidelity Tranche 16 Review

- Generated focused route crops: `tasks/updates_box_region-compare.png`, `tasks/right_route_region-compare.png`, `tasks/forecast_group_region-compare.png`, and `tasks/right_lower_objects-compare.png`.
- Tried adding a fixed `updates-box` object near the source's small box stack, but the first/revised versions worsened the target crop, so that object was removed rather than keeping a false improvement.
- Re-routed the right side of the fixed purple automation route lower through the source-like path around `auto-forecast`, `Updates`, and `Change Forecast`, removing the old high horizontal segment across the top of the right-route crop.
- Right-route crop diff improved slightly from `26.09 / 44.69` mean/RMS to `25.95 / 44.64`; central graph diff improved slightly from `20.29 / 43.23` to `20.28 / 43.23`. The tight `Updates` crop is slightly worse (`24.28 / 39.78` to `24.64 / 40.23`) because the small source box object is still not reproduced.
- Verification passed: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: the route now follows the source path more closely, but the small source cube stack left of `Updates` still needs a better bespoke drawing before the tight `Updates` crop will improve.

### Fidelity Tranche 17 Plan

- [x] Measure the source cube stack left of `Updates` and the current no-object baseline.
- [x] Add a fixed, unlabeled cube-stack object with source-sized faces.
- [x] Keep the patch only if the tight `Updates` crop improves over the current route-only baseline.
- [x] Re-run verification, regenerate crops, and record the outcome.

### 2026-06-18 Fidelity Tranche 17 Review

- Measured the source cube stack left of `Updates`: source ink components span roughly `x=2010..2058, y=1119..1185`; current route-only baseline has no matching object there.
- Tried a second, smaller fixed `updates-box` drawing with source-sized cuboid faces. It still worsened the target crop from the route-only baseline: `updates_box_region` went from `24.64 / 40.23` to `28.08 / 45.68`, and `right_route_region` worsened from `25.95 / 44.64` to `27.39 / 46.69`.
- Reverted the `updates-box` node and SVG case. Post-revert metrics returned to the route-only baseline: `updates_box_region [24.64, 40.23]`, `right_route_region [25.95, 44.64]`, `central_graph [20.28, 43.23]`.
- Verification passed after revert: `npm run verify` and `npm run design:lint`; dev server returned `200 OK` at `http://127.0.0.1:5174/`.
- Remaining fidelity gap: this cube stack needs a different construction approach, likely tighter absolute path geometry or a source-traced mini glyph, before it can improve the crop. Do not repeat the rejected stacked-cuboid versions.

### Fidelity Tranche 18 Plan

- [x] Compare source/current rack-channel crops around `contract` and `channel`, using `tasks/contract_channel_region-compare.png`, `tasks/channel_edge_region-compare.png`, and measured crop diffs as the gate.
- [x] Replace the simplified/misplaced right-side rack/channel fixed art with source-like twin upright rack groups in the same visible footprint as the PNG.
- [x] Avoid adding editable labels or changing relationship/action chip geometry; this tranche is fixed SVG art only.
- [x] Keep the patch only if `contract_channel_region` and/or `right_mid_objects` improve without regressing `central_graph`.
- [x] Re-run `npm run verify`, `npm run design:lint`, and document retained metrics.

### 2026-06-18 Fidelity Tranche 18 Review

- Generated baseline and final local comparison crops for the right-side rack/channel area, including `tasks/tranche18-contract_channel_full-final.png`, `tasks/tranche18-contract_channel_tight-final.png`, `tasks/tranche18-right_mid_objects_full-final.png`, and `tasks/tranche18-channel_edge_full-final.png`.
- Shifted the fixed `contract` node left into the source footprint and replaced its generic document sheets with a compact source-like stacked rack object.
- Shifted the fixed `channel` node left/down into the source rack footprint and replaced the generic off-edge tower sheets with two thinner upright rack groups.
- Rejected a later upward coordinate nudge because it worsened all four local metrics; kept the prior refined coordinates instead.
- Local retained metrics improved: `contract_channel_full` from `25.35 / 46.61` to `24.14 / 45.05`, `contract_channel_tight` from `24.12 / 44.58` to `23.07 / 43.09`, `right_mid_objects_full` from `25.57 / 49.20` to `24.68 / 47.98`, and `channel_edge_full` from `22.00 / 42.69` to `21.46 / 41.70`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the right-side racks now sit closer to the source, but the source still has more exact route geometry and the unresolved small box stack near `Updates`.

### Fidelity Tranche 19 Plan

- [x] Compare the source/current forecast group: the source has two compact blue upright prisms above `Change Forecast ->`, while the current fallback `forecast` icon draws an oversized chart board.
- [x] Patch only the fallback `forecast` icon in `src/OntologyApp.tsx`; do not move chips, labels, route paths, or source data.
- [x] Gate the patch with `forecast_group`, `channel_edge`, and right-side local crop metrics after regenerating `tasks/ontology-scene-smoke.png`.
- [x] Keep the patch only if the forecast/right-side local diffs improve without breaking SVG text edit behavior.
- [x] Run `npm run verify` and `npm run design:lint`, then record retained metrics.

### 2026-06-18 Fidelity Tranche 19 Review

- Generated forecast/right-side comparison crops, including `tasks/tranche19-forecast_group-final.png`, `tasks/tranche19-forecast_group_wide-final.png`, `tasks/tranche19-channel_edge_full-final.png`, and `tasks/tranche19-right_lower_objects_full-final.png`.
- Replaced the fallback `forecast` chart-card icon with two compact blue upright prisms in the source footprint above `Change Forecast ->`.
- Refined the prism colors after the first geometry pass; stronger blue faces improved the measured local diffs, so the color refinement was retained.
- Local retained metrics improved: `forecast_group` from `28.87 / 48.54` to `27.21 / 45.05`, `forecast_group_wide` from `25.90 / 45.87` to `25.15 / 44.21`, `channel_edge_full` from `21.46 / 41.70` to `20.99 / 40.58`, and `right_lower_objects_full` from `24.87 / 45.94` to `24.54 / 45.22`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the `Forecast` object silhouette now matches the source object category, but the local purple route and small unresolved `Updates` cube stack still differ from the PNG.

### Fidelity Tranche 20 Plan

- [x] Add the missing small cube stack left/below `Updates` as fixed decorative SVG, not as an `ObjectNode`, to avoid the node pad/selection regressions from Tranche 17.
- [x] Source-trace the glyph as three compact white boxes with dark top edges and minimal side strokes; do not add labels or edit targets.
- [x] Gate against fresh post-Tranche-19 baselines: `updates_box [26.80 / 45.84]`, `right_route [23.97 / 45.66]`, and `central_graph [23.08 / 46.98]`.
- [x] Keep the patch only if the tight `updates_box` crop improves and broader right-side metrics do not materially regress.
- [x] Re-run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 20 Review

- Generated source-focused and current comparison crops for the cube stack, including `tasks/tranche20-cube-focus-after-4x.png` and `tasks/tranche20-cube-focus-scaled-4x.png`.
- Tried a fixed decorative SVG cube stack instead of an `ObjectNode`, then scaled and lightened it after the first oversized attempt.
- Rejected and removed the glyph because it still worsened the post-Tranche-19 baseline: the scaled attempt measured `updates_box [27.47 / 46.89]`, `right_route [24.26 / 46.12]`, and `central_graph [23.14 / 47.06]` versus the no-glyph baseline `updates_box [26.80 / 45.84]`, `right_route [23.97 / 45.66]`, and `central_graph [23.08 / 46.98]`.
- Verification passed during the attempt, but no source changes from this tranche were retained.
- Remaining fidelity gap: the cube stack likely needs either a tiny oval-backed source-traced object or route/background alignment first; do not repeat the standalone fixed cube glyph.

### Fidelity Tranche 21 Plan

- [x] Compare the small rack object below the Forecast group; source dark component is around `x=2124..2150, y=1193..1227`, while current components sit too high around `y=1163..1206`.
- [x] Move/refine only the fixed `forecast-bars` mini-object; keep Forecast label/chip/route geometry unchanged.
- [x] Gate against fresh clean baselines: `forecast_bars_focus [36.66 / 59.51]`, `forecast_group [27.21 / 45.05]`, `right_lower_objects [24.54 / 45.22]`, and `updates_box [26.80 / 45.84]`.
- [x] Keep the patch only if the forecast-bars focus crop and at least one broader local crop improve without a material regression elsewhere.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 21 Review

- Generated baseline and final comparison crops for the small Forecast-adjacent rack object, including `tasks/tranche21-forecast_bars_focus-baseline.png` and `tasks/tranche21-forecast_bars_focus-final.png`.
- Moved the fixed `forecast-bars` node down from `y=1220` to `y=1252`, matching the source object's dark component band more closely.
- Compressed the internal rack spacing from `16/3` x/y offsets to `8/1` offsets so the icon no longer spills far right of the source footprint.
- Local retained metrics improved: `forecast_bars_focus` from `36.66 / 59.51` to `29.67 / 49.34`, `forecast_group` from `27.21 / 45.05` to `25.23 / 41.46`, `right_lower_objects` from `24.54 / 45.22` to `24.09 / 44.45`, `updates_box` from `26.80 / 45.84` to `25.38 / 43.54`, and `central_graph` from `23.08 / 46.98` to `22.99 / 46.83`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: right-side object placement is closer, but exact purple route bends and the missing source-like cube/oval cluster near `Updates` still differ.

### Fidelity Tranche 22 Plan

- [x] Remove the non-source far-right wireframe `edge-node` cube group; source far-right central crop shows empty plane/border there, not a cube cluster.
- [x] Remove the two connectors that only target `edge-node`, preserving Forecast label/chip geometry and the fixed purple route.
- [x] Gate against fresh baselines: `edge_node_focus [22.41 / 44.55]`, `far_right_central [14.29 / 33.14]`, `right_boundary_wide [16.26 / 35.68]`, `right_route [23.39 / 44.76]`, and `central_graph [22.99 / 46.83]`.
- [x] Keep the patch only if the far-right and right-route crops improve without a material central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 22 Review

- Generated far-right comparison crops, including `tasks/tranche22-far_right_central-after.png`, `tasks/tranche22-edge_node_focus-after.png`, and `tasks/tranche22-right_boundary_wide-after.png`.
- Removed the unlabeled `edge-node` object because the source far-right crop contains only plane grid/border in that area, not the current wireframe cube cluster.
- Removed the `channel-edge` and `edge-forecast` connectors that only served that non-source node.
- Removed the now-unused `edge-node` icon drawing case from `NodeIcon`.
- Local retained metrics improved: `edge_node_focus` from `22.41 / 44.55` to `15.47 / 31.51`, `far_right_central` from `14.29 / 33.14` to `11.55 / 26.60`, `right_boundary_wide` from `16.26 / 35.68` to `14.57 / 32.16`, `right_route` from `23.39 / 44.76` to `22.30 / 42.94`, `updates_box` from `25.38 / 43.54` to `25.27 / 43.48`, and `central_graph` from `22.99 / 46.83` to `22.79 / 46.52`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the far-right false object is gone, but the source/right route still differs around `Updates`, including the exact purple route and the small source cube/oval cluster.

### Fidelity Tranche 23 Plan

- [x] Add the missing lower purple automation route run visible in the source under the Forecast/right-side area.
- [x] Render it as fixed route geometry only; do not change labels, action chips, object nodes, or add the rejected Updates cube glyph.
- [x] Gate against fresh baselines: `route_forecast_lower [25.25 / 42.67]`, `right_route [22.30 / 42.94]`, `route_updates_tight [24.51 / 40.51]`, `updates_box [25.27 / 43.48]`, and `central_graph [22.79 / 46.52]`.
- [x] Keep the patch only if the lower-route/right-route metrics improve without a material regression in the Updates or central graph crops.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 23 Review

- Generated route-focused crops, including `tasks/tranche23-route_forecast_lower-final.png`, `tasks/tranche23-route_updates_tight-final.png`, and `tasks/tranche23-right_route-final.png`.
- Added a fixed lower automation route path under the Forecast/right-side area to match the source's missing lower purple run.
- Shifted the upper right automation-route segment under `Updates` down to the source-like `y=1148` band and kept the dormant `FlowPulses` path in sync.
- Local retained metrics improved: `route_forecast_lower` from `25.25 / 42.67` to `24.42 / 41.77`, `right_route` from `22.30 / 42.94` to `22.20 / 42.83`, `route_updates_tight` from `24.51 / 40.51` to `23.89 / 39.84`, `updates_box` from `25.27 / 43.48` to `25.03 / 43.23`, and `central_graph` from `22.79 / 46.52` to `22.73 / 46.46`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: route geometry is closer, but the source still has a small cube/oval object cluster near `Updates` and several exact mini-object silhouettes are not yet pixel-matched.

### Fidelity Tranche 24 Plan

- [x] Redraw only the `shipment` mini-object so it matches the source's two compact darker trucks instead of the current wide, thin outline truck pair.
- [x] Preserve node data, labels, relationship/action chip geometry, and route paths.
- [x] Gate against fresh baselines: `shipment_cluster [31.70 / 55.93]`, `center_objects [29.40 / 51.97]`, `central_graph [22.73 / 46.46]`, and surrounding lower/object crops.
- [x] Keep the patch only if the tight shipment crop improves without a material central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 24 Review

- Generated shipment comparison crops, including `tasks/tranche24-shipment_cluster-after.png` and `tasks/tranche24-shipment_cluster-scaled.png`.
- Tried a filled compact two-truck redraw, then a smaller compressed variant matched to the source truck bounds.
- Rejected and reverted the redraw because both variants worsened the baseline. The better scaled variant measured `shipment_cluster [32.63 / 58.74]`, `center_objects [29.50 / 52.31]`, and `central_graph [22.75 / 46.52]` versus the original baseline `shipment_cluster [31.70 / 55.93]`, `center_objects [29.40 / 51.97]`, and `central_graph [22.73 / 46.46]`.
- Verification passed after reverting the shipment icon.
- Remaining fidelity gap: the source trucks are still more compact/filled, but a future attempt needs a source-traced angled truck path rather than the orthogonal boxy redraw.

### Fidelity Tranche 25 Plan

- [x] Replace only the `inventory` mini-object under `Allocate Inventory` with a compact source-like dark stack/equipment silhouette.
- [x] Preserve scene data, labels, chips, routes, and relationship geometry.
- [x] Gate against fresh baselines: `inventory_region [33.25 / 56.13]`, `allocate_inventory_region [32.52 / 56.34]`, `supplies_inventory_region [32.10 / 55.48]`, `center_objects [29.40 / 51.97]`, and `central_graph [22.73 / 46.46]`.
- [x] Keep the patch only if the inventory-local crops improve without a material central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 25 Review

- Generated inventory comparison crops, including `tasks/tranche25-inventory_region-final.png`, `tasks/tranche25-allocate_inventory_region-final.png`, and `tasks/tranche25-supplies_inventory_region-final.png`.
- Replaced the oversized white cube cluster under `Allocate Inventory` with a compact source-like dark stack/equipment silhouette inside the source component footprint.
- Scaled/nudged the new glyph after the first pass so its dark component sits closer to source bounds `x=1275..1311, y=1057..1091`.
- Local retained metrics improved: `inventory_region` from `33.25 / 56.13` to `28.54 / 48.18`, `allocate_inventory_region` from `32.52 / 56.34` to `28.53 / 49.71`, `supplies_inventory_region` from `32.10 / 55.48` to `27.76 / 48.10`, `center_objects` from `29.40 / 51.97` to `28.70 / 50.77`, and `central_graph` from `22.73 / 46.46` to `22.62 / 46.26`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the inventory object is closer, but several central mini-icons, especially shipment trucks and the `Updates` cube/oval cluster, still need source-traced paths.

### Fidelity Tranche 26 Plan

- [x] Replace only the unlabeled `customer-activity` mini-object left of `Generates`; source shows a warning/flag cluster, while current shows a chart-like panel shifted right.
- [x] Move the fixed node left into the source oval footprint and redraw it as compact dark warning triangles with white vertical markers.
- [x] Preserve all editable labels, chips, route paths, and other object nodes.
- [x] Gate against fresh baselines: `customer_activity_tight [41.00 / 76.41]`, `model_docs_region [30.88 / 54.47]`, `right_mid_objects [24.11 / 47.00]`, and `central_graph [22.62 / 46.26]`.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 26 Review

- Generated warning-cluster comparison crops, including `tasks/tranche26-customer_activity_tight-final.png`, `tasks/tranche26-model_docs_region-final.png`, and `tasks/tranche26-right_mid_objects-final.png`.
- Moved the unlabeled `customer-activity` node left/down into the source oval footprint and replaced the chart-like panel with compact dark warning triangles plus white markers.
- Rejected the first oversized warning cluster, then retained the smaller/down-shifted version after it improved the local and central metrics.
- Local retained metrics improved: `customer_activity_tight` from `41.00 / 76.41` to `38.47 / 71.04`, `model_docs_region` from `30.88 / 54.47` to `28.74 / 50.38`, `right_mid_objects` from `24.11 / 47.00` to `23.93 / 46.42`, and `central_graph` from `22.62 / 46.26` to `22.58 / 46.11`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the warning cluster category and position are closer, but exact source-traced warning shapes and several other mini-icons still need refinement.

### Fidelity Tranche 27 Plan

- [x] Redraw only the unlabeled `warehouse-process` mini-object above `Warehouse`; source shows a detailed conveyor/process block with cubes and a black crane-like mark, while current shows a simple raised tray.
- [x] Preserve node data, labels, chips, routes, and all edit behavior.
- [x] Gate against fresh baselines: `warehouse_process_region [41.77 / 71.12]`, `center_objects [28.87 / 51.04]`, `left_mid_objects [25.47 / 52.05]`, and `central_graph [22.58 / 46.11]`.
- [x] Keep the patch only if the warehouse-process crop improves without a material central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 27 Review

- Generated warehouse-process comparison crops, including `tasks/tranche27-warehouse_process_focus-4x.png`, `tasks/tranche27-warehouse_process_focus-after.png`, and `tasks/tranche27-warehouse_process_focus-scaled.png`.
- Tried a more detailed conveyor/process block with cubes and a black crane mark, then a scaled-down variant.
- Rejected and reverted the redraw because both variants worsened the baseline. The better scaled variant measured `warehouse_process_region [43.91 / 74.43]`, `center_objects [29.35 / 51.82]`, and `central_graph [22.60 / 46.16]` versus the original baseline `warehouse_process_region [41.77 / 71.12]`, `center_objects [28.87 / 51.04]`, and `central_graph [22.58 / 46.11]`.
- Verification passed after reverting the warehouse-process icon.
- Remaining fidelity gap: the source warehouse-process object is still richer, but a future attempt needs a tighter source-traced path rather than a reconstructed object.

### Fidelity Tranche 28 Plan

- [x] Remove the non-source `carrier` truck/oval below the schedule document stack; source shows the document stack and lower route there, not a truck.
- [x] Remove the two connectors that only serve `carrier`, preserving all editable labels/chips and route paths.
- [x] Gate against fresh baselines: `schedule_docs_tight [35.52 / 61.23]`, `carrier_docs_wide [28.38 / 50.09]`, `right_lower_objects [23.01 / 42.75]`, and `central_graph [22.58 / 46.11]`.
- [x] Keep the patch only if the schedule/carrier crops improve without a material central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 28 Review

- Generated schedule/carrier comparison crops, including `tasks/tranche28-schedule_docs_tight-after.png`, `tasks/tranche28-carrier_docs_wide-after.png`, and `tasks/tranche28-right_lower_objects-after.png`.
- Removed the unlabeled `carrier` truck/oval because the source shows the schedule document stack and lower route in that area, not a truck.
- Removed the `dock-carrier` and `carrier-order` connectors that only served that non-source node.
- Removed the now-unused `carrier` icon drawing case from `NodeIcon`.
- Local retained metrics improved: `schedule_docs_tight` from `35.52 / 61.23` to `30.76 / 55.19`, `carrier_docs_wide` from `28.38 / 50.09` to `26.42 / 47.22`, `carrier_region` from `22.24 / 41.46` to `19.37 / 36.06`, `right_lower_objects` from `23.01 / 42.75` to `22.57 / 42.04`, and `central_graph` from `22.58 / 46.11` to `22.48 / 45.97`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the false truck is gone, but the schedule document stack still needs tighter source-matched placement and silhouette detail.

### Fidelity Tranche 29 Plan

- [x] Adjust only the `schedule-docs` mini-object stack after carrier removal; current pages are shifted right and too narrow/short compared with the source three-page stack.
- [x] Preserve all editable labels, chips, route paths, and other object nodes.
- [x] Gate against fresh baselines: `schedule_docs_tight [30.76 / 55.19]`, `schedule_docs_focus [29.71 / 52.92]`, `schedule_docs_large [26.91 / 47.84]`, `right_lower_objects [22.57 / 42.04]`, and `central_graph [22.48 / 45.97]`.
- [x] Keep the patch only if schedule-docs local crops improve without a material right-lower or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 29 Review

- Generated schedule-docs comparison crops, including `tasks/tranche29-schedule_docs_tight-baseline.png` and `tasks/tranche29-schedule_docs_tight-after.png`.
- Tried moving the fixed `schedule-docs` node left/down and increasing the icon scale/spacing to match the broader source stack.
- Rejected and reverted the adjustment because it worsened every gate: `schedule_docs_tight [31.31 / 55.65]`, `schedule_docs_focus [30.44 / 53.74]`, `schedule_docs_large [27.40 / 48.48]`, `right_lower_objects [22.64 / 42.14]`, and `central_graph [22.50 / 45.99]` versus the baseline `schedule_docs_tight [30.76 / 55.19]`, `schedule_docs_focus [29.71 / 52.92]`, `schedule_docs_large [26.91 / 47.84]`, `right_lower_objects [22.57 / 42.04]`, and `central_graph [22.48 / 45.97]`.
- Verification passed after reverting the schedule-docs adjustment.
- Remaining fidelity gap: schedule-docs still needs tighter source-traced page shapes, but a simple move/scale/spacing change is not enough.

### Fidelity Tranche 30 Plan

- [x] Compare the left-mid Plant/staff crop against the source after the Tranche 29 revert.
- [x] Identify the bounded mismatch in the `staff` object: current renders an oversized layered stack at the upper-right of the Plant card, while the source shows a compact cube-on-oval in that band.
- [x] Replace only the `staff` fixed icon and pad placement with source-like cube-on-oval geometry; leave editable labels, card rows, action chips, and the lower Plant-area cylinders/cloud/platform untouched.
- [x] Gate against fresh baselines: `staff_region [30.40 / 57.33]`, `staff_tight [37.40 / 63.85]`, `plant_left_stack_wide [24.33 / 51.43]`, `left_mid_objects [27.31 / 51.50]`, and `central_graph [22.56 / 45.72]`.
- [x] Keep the patch only if the local staff/left-mid crops improve without a material central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 30 Review

- Generated left-mid/staff comparison crops, including `tasks/tranche30-staff_region-baseline.png`, `tasks/tranche30-staff_region-after.png`, and `tasks/tranche30-plant_left_stack_wide-after.png`.
- Moved the unlabeled `staff` object pad to the source cube/oval band and replaced the oversized layered stack with a compact cube/server glyph with a dark side slot and grille lines.
- Left editable labels, data-card rows, action chips, and the separate lower Plant-area elements unchanged.
- Local retained metrics improved: `staff_region` from `30.40 / 57.33` to `29.67 / 57.20`, `staff_tight` from `37.40 / 63.85` to `33.66 / 60.19`, `plant_left_stack_wide` from `24.33 / 51.43` to `24.08 / 51.36`, `left_mid_objects` from `27.31 / 51.50` to `27.21 / 51.47`, and `central_graph` from `22.56 / 45.72` to `22.53 / 45.71`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the lower Plant-area cylinders/cloud/platform still do not match the source; this tranche only removed the upper false stack.

### Fidelity Tranche 31 Plan

- [x] Compare lower Plant icon, quality, shipment, customer-activity, and contract/channel crops after retaining Tranche 30.
- [x] Select the lower Plant icon as the next bounded target: current renders a generic factory block, while the source shows two vertical cylinders, a blue cloud-like pair, and a low slanted platform under the `Flag Staff Shortage ->` chip.
- [x] Attempt only the `plant` fixed icon with source-like cylinders/cloud/platform geometry; preserve the editable `Plant` label, data-card rows/status dots, action chip, and graph connectors.
- [x] Gate against fresh baselines: `plant_lower_focus [35.07 / 60.91]`, `plant_lower_wide [26.95 / 51.53]`, `plant_region [30.37 / 55.30]`, `left_mid_objects [27.21 / 51.47]`, and `central_graph [22.53 / 45.71]`.
- [x] Keep the patch only if the lower Plant crops improve without a material left-mid or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 31 Review

- Generated comparison crops, including `tasks/tranche31-plant_lower_focus-baseline.png`, `tasks/tranche31-plant_lower_focus-after.png`, and `tasks/tranche31-quality_focus-baseline.png`.
- Tried replacing the fixed `plant` factory glyph with a fuller source-like cylinders/cloud/platform drawing while preserving all editable text and chips.
- Rejected and reverted the redraw because it worsened every gate: `plant_lower_focus [44.65 / 74.43]`, `plant_lower_wide [32.62 / 60.91]`, `plant_region [37.22 / 65.91]`, `left_mid_objects [27.86 / 52.64]`, and `central_graph [22.71 / 46.06]` versus the baseline `plant_lower_focus [35.07 / 60.91]`, `plant_lower_wide [26.95 / 51.53]`, `plant_region [30.37 / 55.30]`, `left_mid_objects [27.21 / 51.47]`, and `central_graph [22.53 / 45.71]`.
- Verification passed after reverting: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: lower Plant still needs a smaller source-traced adjustment; a full replacement drawing added too much visible ink under the chip.

### Fidelity Tranche 32 Plan

- [x] Compare the quality object crop with coordinate grids after retaining Tranche 30 and rejecting Tranche 31.
- [x] Select the quality object as the next bounded target: current renders three generic cubes lower/right, while the source shows one larger cube with a dark top slot and one small blue-topped side cube.
- [x] Attempt moving only the unlabeled `quality` object pad/icon up-left and redrawing its fixed icon as a two-box assembly; preserve all editable text and action chips.
- [x] Gate against fresh baselines: `quality_focus [31.46 / 52.29]`, `quality_region [32.25 / 51.25]`, `lower_center_objects [26.98 / 47.40]`, `left_mid_objects [27.21 / 51.47]`, and `central_graph [22.53 / 45.71]`.
- [x] Keep the patch only if quality crops improve without a material lower-center or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 32 Review

- Generated quality comparison crops and grids, including `tasks/tranche32-quality_source_grid-4x.png`, `tasks/tranche32-quality_current_grid-4x.png`, and `tasks/tranche32-quality_focus-after.png`.
- Tried moving the fixed `quality` object up-left and replacing the three-cube icon with a larger cube plus small blue-topped side cube.
- Rejected and reverted the adjustment because it worsened the gates: `quality_focus [32.88 / 55.66]`, `quality_region [33.77 / 55.77]`, `lower_center_objects [27.09 / 47.93]`, `left_mid_objects [27.34 / 51.83]`, and `central_graph [22.57 / 45.82]` versus the baseline `quality_focus [31.46 / 52.29]`, `quality_region [32.25 / 51.25]`, `lower_center_objects [26.98 / 47.40]`, `left_mid_objects [27.21 / 51.47]`, and `central_graph [22.53 / 45.71]`.
- Verification passed after reverting: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: quality still needs a subtler source trace; moving the pad and using a heavier cube redraw increased local ink mismatch.

### Fidelity Tranche 33 Plan

- [x] Compare customer-activity crops and grids after retaining Tranche 30 and rejecting Tranches 31-32.
- [x] Select a minimal placement-only target: current customer-activity pad/cluster center sits about 15 px right of the source oval center, while a full icon redraw would risk adding ink like the rejected Plant/quality attempts.
- [x] Shift only the unlabeled `customer-activity` node horizontally left into the source oval band; preserve icon geometry, editable labels, chips, routes, and connectors.
- [x] Gate against fresh baselines: `customer_activity_tight [41.87 / 74.81]`, `customer_activity_wide [36.66 / 65.74]`, `right_mid_objects [30.86 / 54.39]`, `model_docs_region [28.74 / 50.38]`, and `central_graph [22.53 / 45.71]`.
- [x] Keep the patch only if customer-activity crops improve without a material right-mid or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 33 Review

- Generated customer-activity comparison grids/crops, including `tasks/tranche33-customer_activity_source_grid-4x.png`, `tasks/tranche33-customer_activity_current_grid-4x.png`, and `tasks/tranche33-customer_activity_tight-after.png`.
- Tested a 15 px left shift first; rejected that exact value because customer crop RMS regressed slightly despite tiny mean improvements.
- Retained a 10 px left shift of the unlabeled `customer-activity` node because it better centered the existing warning cluster in the source oval without adding new geometry.
- Local retained metrics improved: `customer_activity_tight` from `41.87 / 74.81` to `41.13 / 73.73`, `customer_activity_wide` from `36.66 / 65.74` to `36.07 / 64.84`, `right_mid_objects` from `30.86 / 54.39` to `30.77 / 54.24`, `model_docs_region` from `28.74 / 50.38` to `28.41 / 50.37`, and `central_graph` from `22.53 / 45.71` to `22.52 / 45.69`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the customer-activity shapes are still warning-flame approximations rather than the source's wrench-and-warning mix; placement is now closer.

### Fidelity Tranche 34 Plan

- [x] Compare the right-lower forecast-bars crop and coordinate grids after retaining Tranches 30 and 33.
- [x] Select the forecast-bars object as a bounded false-motif target: current renders four thin racks plus a green baseline, while the source shows two wider racks without the green baseline.
- [x] Attempt moving only the unlabeled `forecast-bars` object into the source oval band and redrawing its fixed icon as two source-like racks; preserve editable labels, chips, route paths, and the Forecast label.
- [x] Gate against fresh baselines: `forecast_bars_region [29.42 / 51.92]`, `forecast_group_region [26.91 / 46.24]`, `right_lower_objects [24.90 / 44.66]`, `right_route_region [23.16 / 38.55]`, and `central_graph [22.52 / 45.69]`.
- [x] Keep the patch only if forecast-bars crops improve without a material right-lower, route, or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 34 Review

- Generated forecast-bars comparison crops/grids, including `tasks/tranche34-forecast_bars_source_grid-5x.png`, `tasks/tranche34-forecast_bars_current_grid-5x.png`, and `tasks/tranche34-forecast_bars_region-after.png`.
- Tried moving the fixed `forecast-bars` node left/up and replacing the four-rack glyph plus green baseline with two wider source-like racks.
- Rejected and reverted the adjustment because it worsened every gate: `forecast_bars_region [31.68 / 55.93]`, `forecast_group_region [27.90 / 48.22]`, `right_lower_objects [25.18 / 45.23]`, `right_route_region [23.77 / 39.96]`, and `central_graph [22.56 / 45.76]` versus the baseline `forecast_bars_region [29.42 / 51.92]`, `forecast_group_region [26.91 / 46.24]`, `right_lower_objects [24.90 / 44.66]`, `right_route_region [23.16 / 38.55]`, and `central_graph [22.52 / 45.69]`.
- Verification passed after reverting: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: forecast-bars still differs visually, but a two-rack redraw plus placement shift added too much mismatch.

### Fidelity Tranche 35 Plan

- [x] Compare the LTV/model-docs crop and coordinate grids after retaining Tranches 30 and 33.
- [x] Select a placement-only target: current `model` stack sits lower/right than the source object, which is mostly tucked under the `Update LTV Model ->` chip.
- [x] Shift only the unlabeled `model` node slightly up-left; preserve icon geometry, editable labels, chips, routes, and connectors.
- [x] Gate against fresh baselines: `ltv_model_tight [26.88 / 45.09]`, `model_docs_region [28.41 / 50.37]`, `right_mid_objects [30.77 / 54.24]`, `right_lower_objects [24.90 / 44.66]`, and `central_graph [22.52 / 45.69]`.
- [x] Keep the patch only if model/LTV crops improve without a material right-side or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 35 Review

- Generated LTV/model comparison crops/grids, including `tasks/tranche35-model_source_grid-4x.png`, `tasks/tranche35-model_current_grid-4x.png`, and `tasks/tranche35-ltv_model_tight-after.png`.
- Shifted the unlabeled `model` node 10 px left and 25 px up so the existing stack sits under the `Update LTV Model ->` chip like the source.
- Preserved the fixed icon geometry, all editable text, chips, routes, and connector data.
- Local retained metrics improved: `ltv_model_tight` from `26.88 / 45.09` to `23.59 / 39.33`, `model_docs_region` from `28.41 / 50.37` to `26.63 / 47.79`, `right_mid_objects` from `30.77 / 54.24` to `30.44 / 53.80`, `right_lower_objects` from `24.90 / 44.66` to `24.60 / 44.27`, and `central_graph` from `22.52 / 45.69` to `22.47 / 45.61`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the model stack drawing still differs from the source's dense line stack, but its placement and occlusion now match better.

### Fidelity Tranche 36 Plan

- [x] Compare full-scene, app-tier, and bottom-source crops after retaining Tranches 30, 33, and 35.
- [x] Select a typography-token target: current app/source headings are visibly heavier than the thin mono headings in the source image.
- [x] Reduce only `.platform-title` and `.source-title` font weight; preserve all editable text behavior and geometry.
- [x] Gate against fresh baselines: `app_tier [19.70 / 49.34]`, `app_analytics [17.82 / 47.47]`, `app_automations [24.08 / 55.40]`, `app_products [22.62 / 54.92]`, `bottom_sources_all [17.18 / 43.42]`, and `full_scene [13.00 / 36.49]`.
- [x] Keep the patch only if broad app/source crops improve without a full-scene regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 36 Review

- Generated full-scene and app-tier comparison crops, including `tasks/tranche36-full-overview-baseline.png`, `tasks/tranche36-app_automations-after.png`, and `tasks/tranche36-app_products-after.png`.
- Reduced `.platform-title` and `.source-title` from weight `560` to `300` in both live CSS and embedded SVG export styles to better match the source's thin mono headings.
- Preserved all editable text behavior, heading positions, app/source geometry, and SVG-only rendering.
- Local retained metrics improved: `full_scene` from `13.00 / 36.49` to `12.92 / 36.27`, `app_tier` from `19.70 / 49.34` to `19.47 / 48.84`, `app_analytics` from `17.82 / 47.47` to `17.41 / 46.53`, `app_automations` from `24.08 / 55.40` to `23.86 / 54.95`, and `app_products` from `22.62 / 54.92` to `22.40 / 54.53`. Bottom source and central graph crops were unchanged.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the app-window illustrations are still too sparse compared with the source; this tranche corrected heading weight only.

### Fidelity Tranche 37 Plan

- [x] Compare Automations app crop and coordinate grids after retaining Tranche 36.
- [x] Select a placement-only motif target before adding any new line art: the Automations motif content sits visibly lower/right than the source, while the title and slab are close.
- [x] Shift only the non-text Automations motif group up-left; preserve editable headings, app badges, slab geometry, connector bundles, and all text behavior.
- [x] Gate against fresh baselines: `app_automations [23.86 / 54.95]`, `app_tier [19.47 / 48.84]`, `upper_connectors [17.73 / 41.86]`, `full_scene [12.92 / 36.27]`, and `central_graph [22.47 / 45.61]`.
- [x] Keep the patch only if the Automations/app-tier crops improve without upper-connector, full-scene, or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 37 Review

- Generated Automations app comparison crops/grids, including `tasks/tranche37-automations_source_grid-2x.png`, `tasks/tranche37-automations_current_grid-2x.png`, and `tasks/tranche37-app_automations-after.png`.
- Shifted only the non-text Automations motif group by `translate(-40 -34)` so the existing window/rack artwork sits closer to the source slab content.
- Tested larger variants (`translate(-55 -34)` and `translate(-40 -44)`) and rejected them because they underperformed the retained transform.
- Local retained metrics improved: `app_automations` from `23.86 / 54.95` to `22.73 / 53.51`, `app_tier` from `19.47 / 48.84` to `19.16 / 48.41`, `upper_connectors` from `17.73 / 41.86` to `17.37 / 41.22`, and `full_scene` from `12.92 / 36.27` to `12.87 / 36.17`. `central_graph` was unchanged at `22.47 / 45.61`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: Automations still needs denser source-like internal window/rack detail; this tranche corrected motif placement only.

### Fidelity Tranche 38 Plan

- [x] Compare Products and Analytics app coordinate grids after retaining Tranche 37.
- [x] Select Products as the next bounded app target: its motif content is vertically lower than the source, while a horizontal group shift would likely misalign the central cube.
- [x] Shift the non-text Products motif group upward and align the editable ACTION badge; preserve app title, SDK/API badges, slab geometry, connector bundles, and all text behavior.
- [x] Gate against fresh baselines: `app_products [22.40 / 54.53]`, `app_tier [19.16 / 48.41]`, `upper_connectors [17.37 / 41.22]`, `full_scene [12.87 / 36.17]`, and `central_graph [22.47 / 45.61]`.
- [x] Keep the patch only if Products/app-tier crops improve without upper-connector, full-scene, or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 38 Review

- Generated Products and Analytics comparison grids, including `tasks/tranche38-products_source_grid-2x.png`, `tasks/tranche38-products_current_grid-2x.png`, and `tasks/tranche38-app_products-after.png`.
- Shifted only the non-text Products motif upward by `translate(0 -44)` and moved/widened the editable `ACTION` badge from `x=80, y=86, w=86` to `x=72, y=70, w=96`.
- Tested a smaller motif shift (`translate(0 -34)`) and a larger shift (`translate(0 -54)`); retained `-44` because it gave the best Products gate.
- Local retained metrics improved: `app_products` from `22.40 / 54.53` to `21.83 / 53.85`, `app_tier` from `19.16 / 48.41` to `19.01 / 48.20`, `upper_connectors` from `17.37 / 41.22` to `17.09 / 40.83`, and `full_scene` from `12.87 / 36.17` to `12.85 / 36.13`. `central_graph` was unchanged at `22.47 / 45.61`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: Products internal window/device line art is still simpler than the source; this tranche corrected vertical motif placement and ACTION badge alignment only.

### Fidelity Tranche 39 Plan

- [x] Compare Analytics app coordinate grids after retaining Tranches 37-38.
- [x] Select a placement-only motif target: the Analytics motif content sits lower/right than the source across the top windows and foreground screen.
- [x] Shift only the non-text Analytics motif group up-left; preserve editable heading, slab geometry, connector bundles, and all text behavior.
- [x] Gate against fresh baselines: `app_analytics [17.41 / 46.53]`, `app_tier [19.01 / 48.20]`, `upper_connectors [17.09 / 40.83]`, `full_scene [12.85 / 36.13]`, and `central_graph [22.47 / 45.61]`.
- [x] Keep the patch only if Analytics/app-tier crops improve without upper-connector, full-scene, or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 39 Review

- Generated Analytics comparison grids/crops, including `tasks/tranche38-analytics_source_grid-2x.png`, `tasks/tranche38-analytics_current_grid-2x.png`, and `tasks/tranche39-app_analytics-after.png`.
- Shifted only the non-text Analytics motif by `translate(-40 -34)` so the existing top windows and foreground screen align closer to the source.
- Tested larger variants (`translate(-55 -34)` and `translate(-40 -44)`) and rejected them because they underperformed the retained transform.
- Local retained metrics improved: `app_analytics` from `17.41 / 46.53` to `17.18 / 46.12`, `app_tier` from `19.01 / 48.20` to `18.95 / 48.10`, `upper_connectors` from `17.09 / 40.83` to `16.92 / 40.51`, and `full_scene` from `12.85 / 36.13` to `12.84 / 36.11`. `central_graph` was unchanged at `22.47 / 45.61`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: Analytics internal chart/screen detail is still simpler than the source; this tranche corrected motif placement only.

### Fidelity Tranche 40 Plan

- [x] Refresh full-scene, lower-tier, and top-header crops after retaining Tranches 36-39.
- [x] Select the top teaming header as the next bounded token target: current `AI + HUMAN TEAMING` title and fixed glyphs are visibly heavier than the source, while placement is close.
- [x] Reduce only the top teaming title weight and glyph stroke/fill weight; preserve editable title behavior, pill labels, pill positions, and all scene geometry.
- [x] Gate against fresh baselines: `top_header [13.70 / 34.77]`, `team_full [12.63 / 32.36]`, `team_left [8.85 / 22.33]`, `team_right [17.02 / 46.95]`, `full_scene [12.84 / 36.11]`, and `app_tier [18.95 / 48.10]`.
- [x] Keep the patch only if top-header/team crops improve without app-tier or full-scene regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 40 Review

- Generated top-header/team comparison crops and grids, including `tasks/tranche40-team_source_grid-half.png`, `tasks/tranche40-team_current_grid-half.png`, and `tasks/tranche40-team_full-after.png`.
- Reduced the editable `teaming-title` weight from `620` to `300`, reduced fixed top glyph stroke width from `2.2` to `1.8`, and lightened glyph fill opacity to better match the source's thinner header treatment.
- Preserved editable team title behavior, pill text/editability, pill positions, app tier geometry, and all scene layout.
- Local retained metrics improved: `top_header` from `13.70 / 34.77` to `13.54 / 34.27`, `team_full` from `12.63 / 32.36` to `12.24 / 31.07`, `team_left` from `8.85 / 22.33` to `8.66 / 21.38`, `team_right` from `17.02 / 46.95` to `16.18 / 45.03`, and `full_scene` from `12.84 / 36.11` to `12.82 / 36.06`. `app_tier` was unchanged at `18.95 / 48.10`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the top pill row still differs in exact icon/pill density, but the team title/glyph weight now better matches the source.

### Fidelity Tranche 41 Plan

- [x] Compare the top pill row and left/right pill clusters after retaining Tranche 40.
- [x] Select a pill-token target: current pill labels, icon strokes, and outlines are visibly heavier than the source, while pill positions are close.
- [x] Reduce only pill label weight and pill/icon stroke weights; preserve all editable pill text, pill positions, plus behavior, and header geometry.
- [x] Gate against fresh baselines: `pill_row [20.71 / 51.47]`, `pill_left_cluster [25.99 / 58.77]`, `pill_right_cluster [23.12 / 55.45]`, `team_header_all [14.21 / 36.42]`, `top_header [13.54 / 34.27]`, and `full_scene [12.82 / 36.06]`.
- [x] Keep the patch only if pill-row/header crops improve without a full-scene regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 41 Review

- Generated top pill row comparison crops, including `tasks/tranche41-pill_row-baseline.png`, `tasks/tranche41-pill_row-after.png`, and `tasks/tranche41-team_header_all-after.png`.
- Reduced pill outline stroke from `2.4` to `1.8`, pill icon strokes from `2.2/2.0` to `1.8/1.7`, and pill label weight from `610` to `430` in both live CSS and embedded SVG export styles.
- Tested a lighter `1.5/380` variant and rejected it because it underperformed the retained token and slightly worsened the right-cluster RMS.
- Local retained metrics improved: `pill_row` from `20.71 / 51.47` to `20.22 / 51.00`, `pill_left_cluster` from `25.99 / 58.77` to `25.28 / 57.93`, `pill_right_cluster` from `23.12 / 55.45` to `22.59 / 55.10`, `team_header_all` from `14.21 / 36.42` to `14.06 / 36.22`, `top_header` from `13.54 / 34.27` to `13.40 / 34.08`, and `full_scene` from `12.82 / 36.06` to `12.81 / 36.04`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: exact pill widths/cluster spacing and icon forms still differ from the source; this tranche corrected stroke/text weight only.

### Fidelity Tranche 42 Plan

- [x] Refresh full-scene and central-object regional metrics after retaining Tranche 41.
- [x] Compare warehouse-process grids and select a placement-only target: the right-side process structure currently sits too high/left versus the source, while prior icon redraw attempts regressed.
- [x] Shift only the unlabeled `warehouse-process` node down/right; preserve icon geometry, editable labels, chips, routes, and connectors.
- [x] Gate against fresh baselines: `warehouse_process_focus [46.86 / 80.87]`, `warehouse_process_region [33.42 / 64.25]`, `center_objects [29.63 / 52.39]`, `left_mid_objects [27.21 / 51.47]`, and `central_graph [22.47 / 45.61]`.
- [x] Keep the patch only if warehouse-process local crops improve without a material center/central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 42 Review

- Generated central-object placement grids/crops, including `tasks/tranche42-warehouse_process_source_grid-3x.png`, `tasks/tranche42-warehouse_process_current_grid-3x.png`, and `tasks/tranche42-warehouse_process_wide-after.png`.
- Shifted only the unlabeled `warehouse-process` node from `x=1328, y=928` to `x=1352, y=963`, keeping the existing fixed SVG icon and all editable text/chips/routes unchanged.
- Local retained metrics improved: `warehouse_process_focus` from `46.86 / 80.87` to `39.99 / 72.44`, `warehouse_process_region` from `33.42 / 64.25` to `30.08 / 59.02`, `warehouse_process_wide` from `25.18 / 51.79` to `23.39 / 48.17`, `center_objects` from `29.63 / 52.39` to `29.60 / 52.19`, `left_mid_objects` from `27.21 / 51.47` to `27.18 / 51.28`, and `central_graph` from `22.47 / 45.61` to `22.38 / 45.41`.
- Verification passed: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the warehouse-process drawing is still simpler than the source's detailed machinery, but its placement now matches the source oval band much better.

### Fidelity Tranche 43 Plan

- [x] Compare quality source/current grids after retaining Tranche 42.
- [x] Select a placement-only target: current `quality` cubes sit lower/right than the source object; prior Tranche 32 failed because it combined movement with a heavier redraw.
- [x] Attempt moving only the unlabeled `quality` node up-left; preserve the existing icon geometry, editable labels, chips, routes, and connectors.
- [x] Gate against fresh baselines: `quality_region [32.25 / 51.25]`, `quality_focus [31.46 / 52.29]`, `lower_center_objects [26.83 / 47.17]`, `center_objects [29.60 / 52.19]`, and `central_graph [22.38 / 45.41]`.
- [x] Keep the patch only if quality local crops improve without a material lower-center or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 43 Review

- Used existing quality grids from `tasks/tranche42-quality_source_grid-3x.png` and `tasks/tranche42-quality_current_grid-3x.png`.
- Tried moving only the fixed `quality` node up-left from `x=1178, y=1228` to `x=1136, y=1197`, without changing the icon drawing or editable text.
- Rejected and reverted the placement because it worsened every gate: `quality_region [32.39 / 51.38]`, `quality_focus [32.14 / 52.89]`, `quality_wide [29.32 / 50.17]`, `lower_center_objects [26.94 / 47.27]`, `center_objects [29.66 / 52.24]`, and `central_graph [22.39 / 45.42]` versus the baseline `quality_region [32.25 / 51.25]`, `quality_focus [31.46 / 52.29]`, `quality_wide [28.83 / 49.73]`, `lower_center_objects [26.83 / 47.17]`, `center_objects [29.60 / 52.19]`, and `central_graph [22.38 / 45.41]`.
- Verification passed after reverting: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: the quality object still differs, but a simple placement move is not the fix.

### Fidelity Tranche 44 Plan

- [x] Compare schedule-docs source/current grids after retaining Tranche 42 and rejecting Tranche 43.
- [x] Select a small placement-only target: current schedule-docs pages sit slightly high versus the source, while prior Tranche 29 failed because it combined left/down movement with scale/spacing changes.
- [x] Attempt moving only the unlabeled `schedule-docs` node slightly down; preserve icon geometry, editable labels, chips, routes, and connectors.
- [x] Gate against fresh baselines: `schedule_docs_focus [31.23 / 54.68]`, `schedule_docs_large [25.57 / 45.37]`, `right_lower_objects [24.60 / 44.27]`, `right_mid_objects [30.44 / 53.80]`, and `central_graph [22.38 / 45.41]`.
- [x] Keep the patch only if schedule-docs crops improve without a material right-side or central graph regression.
- [x] Run `npm run verify` and `npm run design:lint`, then document retained metrics.

### 2026-06-18 Fidelity Tranche 44 Review

- Used existing schedule-docs grids from `tasks/tranche42-schedule_docs_source_grid-3x.png` and `tasks/tranche42-schedule_docs_current_grid-3x.png`.
- Tried y-only `schedule-docs` shifts of +15 px, +8 px, and +5 px while preserving the existing fixed icon and all editable text/chips/routes.
- Rejected and reverted the adjustment. The +15 px move improved broad right-side crops but worsened the tight crop to `31.89 / 55.68`; the +8 px move still worsened tight RMS to `54.76`; the +5 px move worsened every gate. Baseline restored to `schedule_docs_focus [31.23 / 54.68]`, `schedule_docs_large [25.57 / 45.37]`, `right_lower_objects [24.60 / 44.27]`, `right_mid_objects [30.44 / 53.80]`, and `central_graph [22.38 / 45.41]`.
- Verification passed after reverting: `npm run verify` and `npm run design:lint`.
- Remaining fidelity gap: schedule-docs still needs a source-traced shape/detail adjustment; simple y-only movement is not enough.

## Legacy Notes Below - Superseded By Active Fidelity Replan

The sections below are retained as history from earlier iterations. The authoritative current checklist and review are the 2026-06-18 Active Fidelity Replan above.

## Current Execution Focus

Rebuild the supplied architecture diagram as a fully client-side React + TypeScript scene. The PNG is only a specification: every visible label, chip, metric, node, connector verb, and data-card row must be live structured data rendered as crisp SVG/DOM, with no vendor branding.

## Design Tokens

- Colors: canvas `#f6f8fb`, ink `#15171c`, muted `#697180`, accent `#1977f3`, positive `#3f7d63`, warning `#e67645`, neutral `#8d95a1`.
- Type: display/UI use Inter/SF Pro fallbacks; diagram labels use a squared UI stack; values use SF Mono with tabular numerals.
- Layout: one wide 3200 x 1800 viewBox, isometric planes stacked vertically, object graph centered, apps above, sources below.
- Signature element: a glass detail card pinned to `PLANT OBJECT` with live status dots and computed-field marking.
- Critique: the risk is making a pretty generic diagram instead of the supplied architecture. Anchor geometry and labels to the reference first; polish second.

## Checklist

- [x] Replace PNG-backed editor entry with the structured ontology app.
- [x] Remove Three.js/WebGL renderer usage from the active app.
- [x] Expand the typed scene model so source tiles, top teaming pills, app platforms, object nodes, relationship verbs, action chips, and data-card fields are all addressable text targets.
- [x] Render the full diagram in SVG/DOM with live text, stacked isometric planes, object graph, connectors, and a no-brand default.
- [x] Add smooth pan/zoom, wheel/pinch behavior, fit controls, and subtle pointer parallax with reduced-motion safeguards.
- [x] Keep inline editing, status-dot cycling, undo/redo, readonly shared links, editable-copy flow, and compressed hash persistence.
- [x] Add guided Presentation mode beats: overview, object graph, data card push, pull back.
- [x] Add retina PNG export that hides controls and captures a clean slide.
- [x] Verify build, desktop/mobile screenshots, editable text, readonly share behavior, presentation motion, and export affordance.
- [x] Add a second polish pass: living flow cues, cleaner stage controls, better narrow-pane framing, and export-safe verification.
- [x] 10x polish tranche: make the scene feel keynote-native rather than a diagram prototype.
- [x] Add richer central graph density with neutral object icons, more relationship structure, and better visual hierarchy.
- [x] Add a stage-grade presentation overlay with beat awareness that does not read as instruction text.
- [x] Add a minimap / location cue for deep zoom without introducing backend or WebGL.
- [x] Improve focus behavior so selected nodes and anchored cards feel connected and intentional.
- [x] Re-verify live mount, SVG/no-canvas constraint, share hash, presentation, export, desktop/narrow-pane screenshots, and no console errors.

## Review

- Replaced the active PNG-backed editor with `src/OntologyApp.tsx`, a live SVG/DOM scene rendered from `src/defaultOntologyScene.ts`.
- Removed inactive Three.js/R3F/Drei dependencies and deleted the old `src/ImageEditorApp.tsx` overlay implementation.
- Added editable structured targets for the title, top teaming label and pills, app headings/badges, bottom source titles/tiles, central object labels, relationship verbs, action chips, and every plant data-card field/value/status dot.
- Share links encode the compressed full scene in the hash; readonly links preserve edits and expose `Open a copy to edit`.
- Browser verification passed for inline edit, undo/redo, status-dot cycling, readonly share, editable copy, presentation transform changes, responsive mobile layout, and PNG export.
- Follow-up polish after live in-app review: tightened narrow-pane toolbar wrapping, hid the decorative kicker in compact panes, top-biased the overview camera, and tightened the overview bounds so the diagram uses more of the stage in the user's current browser.
- Added `tasks/structured-ontology-in-app-pane.png` as a smoke artifact for the actual 627px-wide in-app browser pane; verified no overflow, no console errors, and clean export after the polish pass.
- Second polish pass after "use all the power you can": added SVG flow pulses, a visible data-card anchor line to `Plant`, compact accessible toolbar labels, immersive presentation shell behavior, Escape-to-exit presentation, export-time suppression of motion-only elements, and node-click zoom behavior for graph/detail exploration.
- Verification after second polish: `npm run build` passed; compressed hash remains under limit at 3,744 characters for read-only defaults; scan still shows no Three/R3F/Drei/WebGL dependencies. The in-app browser rejected a reload under its URL policy, so live visual re-check needs a manual browser refresh.
- Final smoke artifacts: `tasks/structured-ontology-desktop.png`, `tasks/structured-ontology-detail.png`, `tasks/structured-ontology-mobile.png`, and `tasks/ontology-system-export-smoke.png`.
- Final checks: `npm run build`; Playwright smoke summary reported SVG present, canvas renderer absent, no vendor text, no horizontal overflow, no console errors, and no failed resources.
- 10x polish tranche: added neutral graph nodes/connectors, selected-node keyboard focus and halo, data-card anchor/roomier columns, a deep-zoom minimap, quiet presentation beat dots, reduced-motion-friendly static presentation beats, and explicit copy/export failure states.
- Hardened share loading with hash-change hydration and schema normalization so same-tab shared links and malformed hashes do not crash or silently ignore read-only state.
- Removed the orphaned workbook editor surface from the active React project (`src/components`, old workbook helpers/tests, workbook dependencies, and Vite preloading) so the app is now one focused ontology scene.
- Replaced stale roadmap smoke coverage with an ontology browser smoke test that drives edit, undo, status dots, presentation, the real Copy link share path, read-only share, editable copy, PNG export, narrow-pane layout, no-canvas/no-vendor checks, failed-resource checks, and console-error checks.
- Current verification: `npm run verify` passed; `npm run design:lint` passed with zero warnings. Live local URL `http://127.0.0.1:5174/` returned `200 OK`; smoke screenshots saved at `tasks/ontology-scene-smoke.png` and `tasks/ontology-scene-narrow-smoke.png`.
