# Flyway — enterprise readiness audit

Audit date: September 4, 2026. Scope: latest local production build, active Flyway code, bundled public evidence, and the authoritative build specification. No application fixes, source refresh, production changes, or publishing were performed.

## Executive verdict

**Useful public-evidence prototype; not yet an enterprise-grade decision platform.** The most important gaps are calculation validity, reproducibility, and dependable state—not cosmetic polish or adding more AI.

Today there are two materially different products on the same screen: a national public-location atlas and a separate 12-node sample operating model. The atlas contains 3,424 plotted restaurant records and 16 publicly evidenced distribution facilities from August snapshots. The service, cost, stockout, and capacity cards describe the sample model, not that national network. Neither the source snapshots nor this audit establish the complete, currently operating Chick-fil-A network.

The public-only constraint is compatible with an enterprise-grade **network intelligence and scenario-planning platform**. It is not sufficient to establish actual inventory, demand, supplier allocation, deliveries, or current service performance. A live operational twin is a separate, optional future product requiring customer-authorized operating data. Until then, these values must remain explicit assumptions, with no invented real suppliers or verified-looking service territories.

The latest previously published here.now address returned HTTP 404. This audit therefore used a freshly built local production preview rather than pretending to verify the expired deployment.

## What was verified

| Check | Result and limits |
|---|---|
| Current release commands | `npm run verify` and `npm run design:lint` passed. Build, data checks, engine smoke, and desktop/tablet browser smoke ran. Design lint reported zero errors/warnings. Passing smoke tests do not establish model correctness; defective fixtures are documented below. |
| Hands-on workflows | 47 recorded interaction sequences: onboarding, map search/layers, public details, keyboard activation/Escape, settings, scenario run/save/reopen, recommendation action, sources/review, two different Copilot prompts, create/edit/connect a location, search empty results, and interrupted drafts. |
| Responsive coverage | 1920, 1440, 1280, 1024, 768, and 375 pixels; default, scenario drawer, navigation, and layer panel at every width. No document-width overflow or narrow-text layout collapse in those states. Tablet map framing and label density still need work. Phone is supplementary coverage, not an expanded authoring requirement. |
| Accessibility | 13 automated scans. Ten settled light-mode views had no WCAG A/AA violations; both dark map views exposed the same serious attribution contrast violation. One early drawer scan ran during its animation; a settled repeat cleared it, so those initial findings were excluded. Sampled keyboard and forced-colors/reduced-motion interactions also ran. This is not a full screen-reader certification. |
| Normal browser health | Zero uncaught page errors and zero HTTP 4xx/5xx in the main local workflow; one reportable map-fit warning. External tile requests cancelled by navigation were retained in evidence, not mislabeled server failures. Only the configured headless GPU warning was allowlisted. |
| Recovery and scale probes | Separate isolated contexts tested two-tab edits, malformed saved state, tile-provider failure, 0/1/100/1,000 model rows, and long Unicode names. A malformed saved-state shape caused a blank screen; two tabs silently lost a setting. Provider failure preserved the bundled atlas and location workflow. |
| Performance | Initial local onboarding LCP 616 ms, CLS 0.0144, max observed event duration 56 ms. A warm-cache, onboarded lab check at 4× CPU/40 ms latency/10 Mbps measured LCP 140 ms, CLS 0.0041, max event duration 56 ms. These are short lab observations, not field INP, cold-network p95, map-render completion, or the required national simulation benchmark. |

The 1,000-row list opened without an error or document overflow; measured settling was 688 ms including an intentional 350 ms observation wait. All 1,000 rows were rendered, so pagination/virtualization still merits benchmarking, but this test did not prove a current performance failure. The build retains a roughly 1.07 MB minified / 289 KB gzip lazy MapLibre chunk warning.

The readiness audit is complete as a diagnosis. **Enterprise release gate: fail. Exhaustive UX certification: incomplete**, because full element-by-element assistive-technology coverage, cold/field performance, authenticated workloads, and national simulation/load/recovery tests are not established. The confirmed defects already prevent a passing verdict.

## Exactly five first priorities

These are ordered implementation priorities, not the complete production checklist. Readability and map-provider repair can proceed alongside them; durable server storage remains mandatory before enterprise release even with one user.

| Rank | Priority | Evidence | Acceptance gate |
|---|---|---|---|
| 1 | Make every run reproducible | Increasing Atlanta demand by 9,000 changed outage service from 52.3% to 35.2%, while both runs retained `run-04eb06db` and input hash `04eb06db`. | Freeze every effective input and referenced artifact; canonical SHA-256 input hash and separate output checksum; replay in a fresh process reproduces results. |
| 2 | Implement actual product-by-period network behavior | No lanes still produces 100% service; zero supplier capacity and 0 versus 100 inventory days leave baseline metrics unchanged. A 90-day run equals a four-week run. | Golden cases prove supply/flow/inventory conservation, lead times, calendars, capacities, product compatibility, stockouts, and correct daily/weekly aggregation. |
| 3 | Make recommendations executable and measured | Displayed gains are constants/caps; “Model this response” opens the outage again rather than applying the proposed reallocation. Copilot ignores the question text. | Apply a feasible proposal to a new scenario revision, run the same engine, and show its actual delta. Every assistant answer references the active run/evidence or admits it cannot answer. |
| 4 | Make facility placement honest | A Dallas address received state-centroid-based coordinates, not an address lookup, labeled “Automatic match.” | Real provider result or explicitly approximate placement; precision/confidence/source visible; user confirmation before exact-distance decisions. |
| 5 | Operate the evidence lifecycle | Review is a static presentation, dates/statuses are partly hard-coded, and no artifact-backed accept/reject/reverify workflow exists. | Versioned raw sources, complete pagination, freshness policy, diff/quarantine, actionable record review, and source versions pinned to each scenario. |

## Confirmed findings and repair contracts

### C1 — Critical: run identity does not identify the input

`src/flywayEngine.ts:181` hashes location IDs, lane IDs, the scenario, and engine version—not the demand, capacity, assignments, cost, or other effective values. A saved result lacks the full frozen network bundle and an output checksum.

Reproduce with the isolated `engine-probes.ts`: run the same Cartersville outage, then increase `rest-atlanta-midtown.weeklyDemand` by 9,000. Results differ while identity remains identical. This is an omitted-input defect, not merely a weak hash-algorithm choice.

Repair: create immutable `RunInputV2` with baseline/scenario revisions, normalized units, all engine-read fields, effective defaults, source/route versions, warnings acknowledged, and engine build digest. Store run timestamps outside the deterministic numerical checksum. Distinguish run-execution ID from input-content hash. Mutation tests must exercise every effective field; UI-only metadata should not alter numerical identity.

### C2 — Critical: the engine is an aggregate calculator, not the specified twin

`src/flywayEngine.ts:53` allocates a weekly restaurant demand scalar against assigned DC capacity. Inventory, replenishment, lead-time progression, product-level demand, delivery calendars/windows, vehicle constraints, and a real period loop are absent. Most lanes affect cost, not feasible fulfillment. The grain/horizon controls do not change the calculation.

Repair: execute a deterministic period loop over location × product. Track opening inventory, receipts, demand, fulfillment, stockouts, orders, shipments, and closing inventory. Distinguish supplier production, DC storage, inbound/outbound throughput, lane, and vehicle limits. Represent effective-dated scenario changes, including new facilities and assignments without changing the baseline. Add forecast versions and editable calendar/seasonality/growth/event assumptions; do not pretend synthetic forecasts are measured company forecasts.

The cost model also needs rebuilding. Its hidden constants include purchase `$8.35`, shortage `$3.25`, and stop `$72`. A full outage reduces displayed landed cost from $180,631 to $135,649 because less demand is fulfilled. Lower spend can be mathematically valid, but it is not an operational improvement. Show purchase, freight, handling, inventory, and shortage economics separately; reconcile every breakdown to its headline and use fixed-point currency. A lower-spend/worse-service result must be clearly unfavorable against the configured objective.

Test weakness: three fixtures in `tests/engine.test.ts:11` reference nonexistent supplier/restaurant IDs. Bounds and a generic recommendation still pass for no-op scenarios. Assert target existence, then exact scenario-specific effects and invalid-target rejection. Add the specification's hand-calculated golden cases, property/invariant tests, canonical-input mutation tests, and restart replay.

### C3 — Critical: the recommendation-to-action loop is not real

`src/flywayEngine.ts:149` chooses the first eligible active DC in array order without a complete feasibility check. The buffer recommendation always claims +2.1 service points and $11,800 although inventory has no modeled effect. The reallocation gain is capped at 4.8 points without simulating that candidate.

Live reproduction: run the Cartersville outage, select the Mebane response, then inspect the new draft. It remains the same outage, not a changed allocation. Evidence: `023-recommendation-branch-after.png` and the interaction ledger. The callback at `src/FlywayApp.tsx:799` passes a location rather than a structured proposal.

Repair: recommendations contain typed changes, constraints checked, candidate run ID, measured deltas, and rejection reasons. “Evaluate response” creates an editable draft with a visible change list; confirmation reruns it. Ranking uses persisted executive weights. Never show quantified improvement without an associated run.

Copilot is part of the same trust gap: two unrelated questions—product stockout dates versus official Mebane sources—returned the same answer. `src/FlywayApp.tsx:807` never reads the prompt. Either label the current feature “Run summary,” or implement bounded tools that read the active snapshot and source artifacts. Cite the exact fields, periods, and sources used; distinguish evidence from model assumptions; refuse missing facts; preview all proposed changes before user confirmation. AI must not generate the simulation's numbers.

### H1 — High: saved settings promise behavior they do not control

Changing the service target to 80% and default grain to daily persisted successfully, but executive cards retained 98% and a new scenario remained weekly. Distance, diesel, and routing settings are also disconnected from the relevant calculation path. See `src/FlywayApp.tsx:951`, scenario defaults at `:741`, and KPI posture at `:500`.

Repair: one typed, versioned workspace-default object, validated for range and units, consumed by draft creation and frozen into runs. Each control needs a contract test proving its intended effect. Display inherited versus scenario-overridden settings. A “Saved” toast must not imply that unrelated tabs or engine defaults have adopted the value.

### H2 — High: “automatic geocoding” overstates location precision

In the create-location flow, entering Dallas, Texas with a street address produced latitude 31.55 / longitude −99.41. Source at `src/FlywayApp.tsx:678` uses a state centroid plus a name-length offset, ignoring the city/street for actual resolution. Changing a facility name can therefore move its supposedly geocoded location.

Repair: use a provider adapter with ambiguity handling, normalized address, match type, source, and confirmation. In offline mode allow explicit coordinates or draggable approximate placement labeled as such. A city/state centroid is not an exact site. User edits create user-input evidence; the test record must not inherit a hard-coded August “last verified” date for an action performed in September.

### H3 — High: public evidence is a snapshot, not a governed data service

The bundled public registry is a worthwhile foundation: 16 named facilities, 13 exact-address and three city-level records, launch/stand-up distinctions, source links, and explicit unknown relationships. Preserve this separation.

The next gap is operations. `scripts/refresh-public-dc-registry.mjs` pins a verification date and candidate IDs and fetches one 100-record jobs page. Source status/counts are partly static in `src/flywayData.ts:305`. The review screen provides no record-level accept, reject, resolve, or reverify action. Navigation/map/review show 5, 4, and 38 with insufficient explanation of their different scopes. Thirty-four restaurants remain unplotted; do not silently treat them as mapped or closed.

Repair: preserve raw responses with retrieval time, checksum, parser version, and supported claims; enumerate all permitted pages; maintain immutable derived versions; quarantine conflicting changes; soft-retire removed records pending review; derive freshness from policy and last successful check. A queue item needs entity, disputed field, evidence, previous/new value, resolution, actor, and timestamp. Counts must explicitly say whether they mean records, sources, or facility exceptions.

Promote provenance to the field level. An evidenced facility identity does not make its throughput public. Editing an evidenced address/name must create a new user-supplied value rather than retain the old claim unchanged. “Verified” must always qualify what is verified, at what precision, and when—not assert completeness or current operating status.

### H4 — High: storage can silently lose changes or prevent startup

Live two-tab test: tab A saved target 90; tab B changed only grain to daily and wrote its stale target 98 back over 90. Tab A still displayed 90. Separately, syntactically valid but wrong-shaped `flyway-locations = {}` caused `u.find is not a function` and a blank page. A partially completed, unsaved location draft also disappeared after reload; that narrower draft-loss issue is Medium severity.

Root: `src/FlywayApp.tsx:122` parses JSON without schema validation, migration, write-error handling, or revision/conflict coordination. Settings disclose local storage, but disclosure does not prevent lost work.

Repair now: validate/migrate persisted schemas, retain last-known-good state, handle storage quota/denial, show a recoverable error boundary, synchronize tabs or reject stale writes, and protect/recover dirty drafts. Do not automatically erase user data as “recovery.” Before enterprise release: durable server-side revisions, optimistic concurrency, idempotency, audit events, and backup/restore proof. Single-user scope defers collaboration, not durability.

### M1 — Medium, executive-demo blocker: map provider, framing, and hierarchy

The real production screenshot contains repeated “API KEY REQUIRED” tiles. `src/FlywayMap.tsx:10` uses unkeyed CARTO raster URLs. CARTO's current notice requires keys and announces retirement of those raster endpoints. This is a concrete dependency issue, not a stylistic preference. [Official CARTO notice](https://carto.com/basemaps/apikey/).

There are also overlapping DC labels, 7–9 px annotation text, and a map-fit warning after navigation/resizing. `src/flyway.css:269` and map fit/resize handling at `src/FlywayMap.tsx:239` are starting points. Tablet layouts avoid page overflow but can retain poor geographic framing. An executive should not have to zoom the entire browser to read facility names.

Repair: choose an authorized supported basemap with documented terms and controlled key handling, or make the bundled atlas the intentional primary style. Keep the fallback; induced provider failure did not break the 12-row modeled-location workflow. Avoid promising street-level context in fallback. Refit on layout transitions with correct unobstructed padding unless the user deliberately moved the camera; provide an explicit reset. Use collision-aware label priorities and readable typography, not blanket persistent labels.

### M2 — Medium: dark appearance fails a settled contrast check

The CARTO attribution in dark mode renders approximately #a9b4c0 on white, 2.1:1 contrast at 9 px. Axe reports serious `color-contrast`; the issue persists with Copilot open. This is separate from the discarded animation-time false positive.

Repair: theme attribution and surrounding controls together, preserving required attribution; validate minimum contrast in both themes after transitions settle. Forced-colors mode kept scenario controls usable but the geographic context became very sparse, reinforcing the need for a genuinely equivalent searchable public-location list.

## The map should become a decision workspace

The current product feels composed and orderly, but holding it “in my hands” as a time-pressed executive creates a trust break: a national map sits beside confident operational numbers from a small hidden sample model. The interface answers “what locations do we know about?” and “what does this sample calculation say?” without making the boundary the dominant organizing principle. More shadows, animated arcs, or a 3D globe would not solve that. Strong context, readable geography, and a complete question → change → measured result loop would.

### 1. Make context impossible to miss

Use three explicit modes: **Public network**, **Planning model**, and **Compare scenarios**. Preserve public-only as the first-launch default. Each mode owns its map layers, counts, side panel, and available actions.

Public network shows coverage, freshness, precision, unplotted records, and source conflicts—not sample service/cost KPIs. Planning shows its actual modeled-node counts, baseline revision, assumptions, grain, and horizon; sample models carry a persistent “Sample” label. Compare identifies both frozen run versions and warns when their input universes differ. A fourth Operations mode should not appear until actual feeds and reconciliation exist.

### 2. Let geography occupy the working area

At 1440 px, use a compact 64 px navigation rail, a restrained top context bar, and a collapsible 320–360 px inspector. Reserve most remaining width for the map. Keep search/filter controls in a compact top strip and map navigation away from the inspector. At 1024/768 px, use one focus panel or bottom sheet at a time, with sticky primary actions and no loss of map context.

Retain an unobstructed map padding model for drawers, legends, and sheets. Provide national/selection/continental/Hawaii/Alaska extent controls with honest coverage counts. Save camera/filter state independently from the model. Do not interpret “0 records in this snapshot” as proof that a geography has no real facilities.

### 3. Define a cartographic hierarchy

National view: subdued land/water/state boundaries, restaurant density or small points, prioritized DC labels, and count summaries. Regional view: individual facilities, city labels, and selectable restaurant clusters. Local view: street context when available, exact points, address precision, and operational overlays only in the planning model.

Use restaurant circles, DC squares, and supplier triangles; shape plus text, never color alone. Exact and city-level evidence need distinct outlines and an uncertainty explanation. Use 12–14 px readable metadata, 14–16 px primary labels, and 44 px touch targets. Show full name/address in hover/focus/selection; collision priority favors selected, searched, and exception facilities. Public suppliers appear only when evidence qualifies them; modeled supplier sites must never masquerade as verified real suppliers.

### 4. Make selection answer the executive's next question

Selecting a public DC opens identity, lifecycle evidence, source citations, exact/city precision, last verification, conflicts, and “what remains unknown.” Its served restaurants are **unknown** unless supported—not inferred from proximity and colored as fact.

Selecting a modeled DC opens the binding product/period/capacity dimension, affected restaurants, inbound/outbound modeled links, and assumptions. Dim unrelated marks. Color lines by the selected metric, scale thickness with a clear volume legend, and show direction on demand. Never draw every lane at national zoom. Any generated service area is labeled “Modeled allocation,” includes its method, and stays outside the verified layer.

### 5. Put time and comparison on the map

Planning gets a daily/weekly period control and a modest bottom timeline after the engine supports them. Selecting a period updates map, KPI deltas, and affected-location table together. Compare offers synchronized side-by-side maps or one delta view with a stable color scale. Display new/closed nodes, reassigned lanes, stockout changes, and bottleneck periods—not only four aggregate numbers.

A linked, virtualized impact table should answer “which sites, which products, when, why?” Sorting or selecting rows highlights the same map objects. Explain any hidden filtered sites. Support keyboard selection and a list alternative to canvas interactions.

### 6. Turn authoring into a safe preview

Add facility: type → address/map placement → confirm precision → operating assumptions → proposed links → validation summary → save to a draft baseline/scenario. Keep published public evidence immutable. Mark assumptions per field and show unknowns directly. Drag correction updates coordinates as user input, with undo.

Evaluate response: show exact proposed changes, feasibility checks, estimated run scope, and warnings; run; compare; save a named decision. Preserve unsaved work and make all pending/saved/failed states explicit. Do not simulate a save with a toast before it is durable.

## Pragmatic enterprise architecture

Start with a modular monolith, not a fleet of microservices. Keep the existing React/TypeScript and MapLibre investment. Adopt the architecture already outlined in the product specification, with each component introduced when its acceptance gate is ready.

| Component | Responsibility and boundary |
|---|---|
| React application | Map, tables, authoring, comparisons, accessible lists, pending state; no authoritative durable state or secret-bearing integration calls. |
| Versioned API, e.g. FastAPI | Network revisions, evidence, scenarios, run validation, single-owner authorization, concurrency checks, audit events. FastAPI is consistent with the existing specification. [Official documentation](https://fastapi.tiangolo.com/). |
| PostgreSQL + PostGIS | Canonical locations, geometries, products/calendars/policies, scenario changes, workspace ownership, revisions, run metadata. Enforce workspace boundaries in application authorization and database policy; an app connection must not casually bypass row security. [PostgreSQL row security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html), [PostGIS documentation](https://postgis.net/documentation/). |
| Immutable object storage | Raw public responses, parser outputs, input bundles, output bundles, source/run checksums, retention/version history. |
| Durable queue + deterministic worker | Validation, snapshot freeze, queued/running/succeeded/failed/cancelled states, retries, cancellation, progress, duplicate-delivery protection, engine build versioning. |
| Evidence/provider adapters | Rate-limited permitted public collection, geocoding/routing, cache, freshness, quarantine, last-known-good fallbacks; no implied authority from a provider result. |
| Decision service | Feasible candidate generation plus repeated deterministic evaluation. Add a solver only for a defined optimization problem. OR-Tools supports capacity and time-window routing constructs, but does not replace inventory simulation or supply-chain data. [Capacity routing](https://developers.google.com/optimization/routing/cvrp), [time windows](https://developers.google.com/optimization/routing/vrptw). |
| Grounded assistant | Read-only access to permitted snapshot/evidence tools, typed proposed changes, no authoritative numeric calculation, explicit confirmation before mutation. |

Production controls are required even before collaboration: one real identity/owner, TLS, encrypted storage, server-side credential handling, schema validation, conditional writes, request/run correlation, backup/restore, and basic incident ownership. Add SSO/SCIM, richer roles, multiple organizations, and collaboration only when those features enter scope. Include `workspace_id` and actor/revision fields now to avoid a later data-model rewrite.

Use CI for type/build, meaningful unit/property tests, migrations, API contracts, end-to-end flows, accessibility, dependency/secret scans, and immutable release artifacts. Review headers on the actual deployed response; local `_headers` is not proof a host applies it. The dependency review reported five advisories, including four high, but some build dependencies are classified as production: triage reachable runtime versus toolchain exposure rather than declaring the static page exploitable from counts alone.

Instrument source freshness, validation failures, API/run latency, queue backlog, failed attempts, provider degradation, and costs. Link browser/API/worker logs and traces by request/run ID. OpenTelemetry provides the relevant metrics, logs, and traces model. [Official signals documentation](https://opentelemetry.io/docs/concepts/signals/).

## Delivery gates, not arbitrary dates

| Milestone | What ships | Proof required to advance |
|---|---|---|
| A — Trustworthy prototype | Full input identity, honest feature labels, settings wiring, confirmed placement, effective tests, readable functioning map, recoverable local state. | Every displayed control and quantified claim maps to actual behavior; all confirmed regression probes become passing tests; no critical correctness defects. |
| B — Credible planning twin | Product-period flow/inventory engine, forecasts as assumptions, effective-dated network changes, feasible candidate evaluation, field provenance and source history. | Hand-calculated golden cases, conservation/unit/cost invariants, daily/weekly reconciliation, known bottlenecks, mutation/replay tests, candidate deltas reproduced by applying the proposal. |
| C — Enterprise single-user platform | Durable API/database/object bundles, authenticated owner, audit, revisions, queue/worker, source-review operations, managed non-expiring deployment. | Save/reopen after browser loss; stale-write rejection; worker kill/retry without duplicate completion; backup restored in a clean environment; source/provider degradation preserves core workflows; actual release security and accessibility gates pass. |
| D — Scale and enterprise operations | Measured SLOs, operational runbooks, load capacity, release/rollback drills; organization roles/integrations only when authorized. | Benchmark the spec's 3,500 restaurants/25 DCs/100 suppliers/seven groups at p95 ≤60 s; test its larger network envelope and 25 queued runs. Establish and measure 99.9% API and 99.5% valid-run availability targets. These are targets, not current achievements. |
| Optional E — Live operational twin | Governed customer-authorized demand, inventory, orders/shipments, capacity, route/fleet/cost feeds. | Reconciliation against actuals, explicit latency/quality contracts, forecast backtesting, ownership, and measured decision benefit. Remain public-only planning if this scope is not wanted. |

Avoid introducing Kubernetes, microservices, elaborate multi-agent execution, probabilistic optimization, or a decorative 3D globe before these gates. The next release should prove **one trustworthy end-to-end executive decision**, such as a DC outage with product-specific stockouts, feasible recovery, exact rerun, saved evidence, and a readable map comparison.

## Evidence, independence, and remaining scope

The main agent performed the live interactions and screenshot inspection. Two independent reviews checked engine/modeling and platform architecture; a third challenged severity and duplication. Its initial candidate disposition was 8 KEEP, 2 DUPLICATE, 1 GENERIC. Duplicate test/Copilot observations were consolidated into modeling and decision-support findings. The generic “add enterprise infrastructure” finding was converted to explicit production acceptance gates. Its suggestion to treat durability solely as a future MVP concern was not adopted: the user's production-quality requirement still applies to a single-user platform. Subsequent recovery probes provided concrete failure evidence.

The frontend skill guided structured interaction, responsive, contrast, and visual hierarchy checks; it did not authorize or cause product changes. Pattern-detector output was treated as advisory, not counted as 101 real defects. No unsupported ratings, fabricated customer impact, or claims of security certification are made.

### Reproducible artifacts

- [Live interaction manifest, browser health, accessibility, layouts](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/evidence.json>)
- [Isolated model probes](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/engine-probes.ts>) and [actual outputs](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/engine-probes.json>)
- [Recovery, scale, access-preference, and lab-performance outputs](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/supplement.json>)
- [Model review](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/model-review.md>), [platform review](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/platform-review.md>), and [challenge review](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/critique.md>)
- Inspected screenshots: [default map](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/003-onboarding-after.png>), [dark map](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/077-dark-map-after.png>), [tablet](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/069-layout-768-default-after.png>), [scenario drawer](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/063-layout-1280-scenario-after.png>), [provider fallback](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/supplement-provider-failure.png>), [1,000 rows](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/supplement-locations-1000.png>), [forced colors](</Users/giovanni/Documents/Codex/Supply Chain Mastery/tasks/enterprise-audit-2026-09-04/supplement-access-preferences.png>).

Not performed: refreshing or reconciling the real facility registry as of September 4; testing every browser/assistive technology; a full penetration test; actual enterprise concurrency or regional disaster recovery; paid-provider configuration; backend/integration flows that do not exist; publication. No user workspace data was changed—the mutation probes ran in isolated browser contexts and copies of seed data.
