# Flyway — latest-build audit and enterprise roadmap

Date: 2026-09-04. Persona: national supply-chain executive, high domain knowledge, time-pressed, desktop and tablet, frequently interrupted.

## Verdict and scope

**Enterprise release gate: FAIL. Exhaustive UX certification: INCOMPLETE.**

Flyway has a useful public-evidence atlas and an executive planning interface, but the runnable artifact is still a prototype. The current source additionally contains an unfinished integration and cannot compile. A passing smoke test against an older bundle is not evidence that the new source works.

This is a read-only product assessment, with local test/evidence generation. No release, credential configuration, remote data refresh, or production change was performed. The earlier detailed diagnostic remains available in [enterprise-readiness-2026-09-04.md](enterprise-readiness-2026-09-04.md). This report supersedes its build-status statement and distinguishes later draft work from verified runtime behavior.

Two targets were inspected:

- Last compiled preview: `dist/index.html`, built September 4 at 15:36 local; assets `index-C9furUqW.js` and `FlywayMap-CWIrd_-I.js`. Rechecked through a fresh loopback preview and the existing isolated browser suite.
- Current source: contains new decision-workspace, evidence, storage, and platform modules. Root component integration and engine contracts remain incomplete. No new production bundle was generated successfully.

Public scope: the bundled August snapshot contains 3,458 official restaurant-page records, 3,424 plotted points, and 16 publicly evidenced distribution facilities (13 exact-address, three city-level). These are evidence-snapshot counts, not proof of the complete current operating network. Public records do not establish actual supplier assignments, DC service territories, demand, inventory, capacity, or private freight costs.

## Top five priorities

1. **R1 — Restore one buildable, traceable release.** This precedes every other release claim: unfinished source and an older passing preview currently describe different products.
2. **R2 — Make calculations and run lineage trustworthy.** Incorrect fulfillment and indistinguishable inputs can mislead facility and inventory decisions even when the UI appears polished.
3. **R3 — Close the recommendation-to-result loop.** An executive must be able to inspect a proposed change and reproduce its measured improvement, not receive a plausible suggestion with fixed gains.
4. **R4 — Separate public evidence from planning outcomes.** Explicit context prevents a national footprint from lending false authority to a small sample simulation.
5. **R5 — Connect durable workspace and job infrastructure.** Saved work, recoverable runs, and revision history are enterprise requirements even for one user.

R6 map craft and R7 verification/security can proceed alongside those priorities; neither substitutes for the decision-integrity work.

## What was actually verified

| Check | Observed result | Limit |
|---|---|---|
| `npm run verify` | Failed during TypeScript compilation | No current-source release certification |
| Final `npx tsc --noEmit` | Still failed | Missing moved component references, missing engine default export, incompatible call contracts, ES2020 string API usage, and storage promise typing |
| `npm run design:lint` | Passed, zero errors/warnings | Token-document consistency, not UI accessibility or visual quality |
| `npm run test:engine` | Passed legacy suite | Invalid fixture targets and weak assertions allow behavior gaps |
| `npm run test:data` | Passed bundled evidence/atlas checks | Does not reverify live sources or prove present operating status |
| `npm run test:browser` | Passed against existing dist; desktop/tablet and browser-health assertions | Old compiled artifact, not current source; assertions do not prove realistic geocoding or grounded reasoning |
| `npm run test:platform` | Rerun by lead: passed isolated local API/storage/job/backup tests | PostgreSQL, deployed environment, and frontend integration not verified |
| Evidence domain/refresh/workbench-contract tests | Rerun by lead: passed | Workbench test is source-text contract inspection, not mounted browser interaction |
| `npm audit --omit=dev --json` | Four high and one moderate affected dependency entries | Includes tooling dependency paths; reachability/exploitability not established |
| `git diff --check` | Passed | Formatting only |

Fresh engine probes reproduced:

- Removing every lane still yields **100% service**.
- Setting every supplier's capacity to zero leaves baseline service unchanged.
- Setting inventory to zero versus 100 days leaves baseline metrics unchanged.
- A 90-day scenario yields the same aggregate result as a four-week scenario.
- Increasing Atlanta demand by 9,000 changes outage service from **52.3% to 35.2%**, but both runs retain **input hash 04eb06db**.
- Recommendations still contain a fixed inventory-buffer cost of **$11,800** and a capped **2.1-point** service gain without evaluating an inventory response.

Probe evidence: `tasks/enterprise-audit-2026-09-04/engine-probes.json`, freshly rerun at 20:47 UTC.

Fresh interaction observations: completed onboarding; typed Mebane search; selected its public-evidence record; inspected exact address and citations; returned; submitted two different assistant questions; inspected the same generic answer; reset map framing; inspected desktop/tablet views. Browser console reads during these interactions returned no warnings/errors. The separate browser suite reported no first-party request/response/page/console failures.

Inspected regenerated screenshots:

- `tasks/flyway-dashboard-smoke.png`
- `tasks/flyway-tablet-smoke.png`

Both visibly show CARTO “API KEY REQUIRED” watermarks and overlapping small facility labels. The in-app assistant interaction also reproduced the watermark at local zoom.

This pass is not an exhaustive route/element/scenario/a11y/performance certification. Its interaction manifest is partial; no fresh full axe matrix, field INP, cold-load benchmark, assistive-technology test, or national simulation load test was completed. The earlier audit contains broader dated interaction/axe/layout evidence; those observations are not silently promoted to current-source results. There is no defensible aggregate UI quality score for the unfinished source.

## Findings and concrete repair contracts

### R1 — Blocking / Architecture: source and runnable release diverge

**Surface:** current application entry/integration. **Reproduce:** run `npm run verify`. **Observed:** compilation fails; `FlywayApp.tsx` still references removed `ControlTower`, `AddLocationDrawer`, and `CopilotDrawer`; newly required props/engine exports are not connected. **Expected:** the exact source under review builds and is the artifact tested.

**Suspected locations:** `src/FlywayApp.tsx:698`, `src/workspacePreferences.ts:1`, `src/DecisionWorkspace.tsx:90`, `src/workspaceStorage.ts:120`.

**Smallest possible patch:** finish the component and engine interface integration, resolve type failures without weakening validation, then build once and run every check against that artifact. Add a release manifest containing source revision, dirty-worktree digest if applicable, engine version, build timestamp, and evidence versions. Display a concise build identity in support information.

### R2 — Critical / Architecture: engine does not yet model the promised decisions

**Surface:** all scenario results. **Reproduce:** rerun the isolated engine probes above. **Observed:** topology, supplier capacity, inventory, and elapsed horizon do not constrain fulfillment as the specification requires; changes to effective numeric input do not change input identity. **Expected:** product-period conservation and complete reproducible lineage.

**Suspected locations:** `src/flywayEngine.ts:53` and `:181`; new `src/engine/simulator.ts` is an unexported scaffold, not a replacement runtime.

**Smallest possible patch:** replace aggregate fulfillment with a daily product-by-location flow ledger; derive weekly results by aggregation. Enforce compatible directed paths, supplier production, receipts/lead times, DC storage/inbound/outbound capacity, vehicle/lane capacity, calendars/windows, demand, inventory policies, and stockouts. Use explicit units and fixed-point cost components. Freeze all effective values, defaults, source/route versions, scenario changes, and engine build identity. Canonical SHA-256 input hash and a separate numerical output checksum must support fresh-process replay.

Add hand-calculated golden networks, conservation/property tests, invalid-target rejection, and tests mutating every effective input. Closing a restaurant must not count its intentionally removed demand as a supply failure. Lower spend caused by unserved demand must not be presented as unqualified improvement.

### R3 — Critical / Interaction: advice is not yet executable or grounded

**Surface:** results recommendations and compiled Ask Flyway. **Reproduce:** run a DC outage and choose “Model this response”; separately ask for Mebane sources, then product stockout dates. **Observed:** response drafting changes a target rather than applying a structured allocation proposal; the compiled assistant gives the same baseline summary for both questions. **Expected:** inspectable candidate changes, evaluated deltas, and question-specific evidence.

**Suspected locations:** `src/flywayEngine.ts:142`, `src/FlywayApp.tsx:487` and `:710`; compiled assistant in `dist/assets/index-C9furUqW.js`.

**Smallest possible patch:** recommendations carry typed changes, feasibility checks, candidate input/output hashes, and actual rerun deltas. Preview changes, require confirmation, evaluate with the same engine, compare, then save. Connect the new prompt-sensitive assistant only after its tools cite the active frozen run, entity, product, period, assumptions, and sources. Unknown questions must produce an honest limitation. No model-generated simulation numbers.

The new `FlywayCopilot.tsx` and `modelAssistant.ts` contain a better direction, but they are not integrated into a buildable app. Do not call the replacement complete.

### R4 — High / Interaction: evidence and operating context compete

**Surface:** compiled Control Tower, desktop/tablet. **Reproduce:** open the default public map and read the adjacent “Service is protected” and 100% KPI. **Observed:** national evidence and 12-node sample outcomes share one dominant workspace; a caveat exists but does not control the visual hierarchy. **Expected:** scope is obvious before any metric is interpreted.

**Suspected locations:** last compiled Control Tower; replacement `src/DecisionWorkspace.tsx` is draft integration work.

**Smallest possible patch:** mount three mode-owned contexts: Public Network, Planning Model, Compare. Public mode shows record coverage, precision, source age, conflicts, and unknown relationships—not sample operational KPIs. Planning shows modeled-node counts, baseline revision, assumptions, time grain, and horizon. Compare names both frozen inputs and warns when universes differ.

Make evidence operational: retain raw artifacts/checksums/parser versions, exhaust source pagination, review changed/removed/conflicting claims, and derive freshness from successful retrieval. Acceptance must publish a reviewed version; preserve the source versions behind saved runs. A verified identity must not confer verification on an edited address or assumed throughput. The 34 unplotted restaurants stay visible as unresolved records.

New evidence-domain tests pass, but the workbench is unmounted, remote ingestion has not been rerun, legacy snapshot checksums remain incomplete, and review-to-publication linkage remains unfinished.

### R5 — High / Architecture: durable foundation is not connected end-to-end

**Surface:** saved locations, defaults, scenarios, jobs, and evidence decisions. **Reproduce:** trace the root save/run callbacks: they still use browser persistence and local legacy calculations, not the new API. **Observed:** useful server capabilities exist but do not protect the actual UI workflow yet. **Expected:** one authoritative revisioned workspace, explicit pending/saved/failed states, and recoverable immutable runs.

**Suspected locations:** `src/FlywayApp.tsx:600` and `:657`; `server/platformService.ts:41` still falls back to the legacy engine.

**Smallest possible patch:** connect the browser through one typed service client with owner authentication, optimistic concurrency, idempotency, durable revisions, and append-only audit events. Keep validated local recovery/drafts as cache/offline mode, never a silent substitute for confirmed server saves. Connect run submission/progress/cancel/retry and freeze authoritative server inputs. Test interrupted runs, browser reconnect, two-tab conflict, quota/denial, malformed persistence, and restore without deleting user data.

The local platform suite passed auth, revision conflicts, artifacts, jobs, recovery, and backup restore. PostgreSQL/PostGIS adapter execution, isolated database-role behavior, CI, container deployment, and realistic restore drills are unverified. Merely enabling RLS is insufficient if the application connects as a table owner/superuser; use a least-privilege runtime role and test isolation. [PostgreSQL row-security documentation](https://www.postgresql.org/docs/current/ddl-rowsecurity.html).

### R6 — Medium / Visual: map presentation falls below the executive bar

**Surface:** last compiled atlas at 1600×1000 and 900×1100. **Reproduce:** open the map, select Mebane, zoom/return to national view, inspect labels. **Observed:** watermarked tiles, overlapped labels, overly small metadata, excess northern geography, and legends obscuring useful space. Tablet avoids document overflow but still has label collisions. Earlier settled dark-mode axe evidence identifies attribution contrast; not freshly retested here.

**Suspected locations:** `dist/assets/FlywayMap-CWIrd_-I.js`, `src/flyway.css`; current `src/FlywayMap.tsx` has an unverified bundled-atlas replacement.

**Smallest possible patch:** ship the bundled atlas as the intentional base or use an authorized supported provider; retain attribution and offline operation. CARTO currently requires a key and is retiring the older raster service. [Official CARTO notice](https://carto.com/basemaps/apikey/). Apply the workspace/layout contract below and verify both themes after transitions settle.

### R7 — High / Architecture: green checks overstate release assurance

**Surface:** validation/release pipeline. **Reproduce:** run the legacy engine suite, then the independent probes. **Observed:** both pass bounded-metric smoke assertions despite missing physics; three scenario fixtures target nonexistent nodes. Evidence-workbench “responsive” test checks CSS text, not actual layout. Dependency scan reports unresolved advisories. **Expected:** tests prove semantic outcomes and release gates cover the connected product.

**Suspected locations:** `tests/engine.test.ts:11`, `tests/evidence-workbench.test.tsx:1`, `package.json`, `.github/workflows/flyway-platform-ci.yml`.

**Smallest possible patch:** require target existence and exact scenario effects; add the golden/replay/flow tests in R2; mount the evidence UI for interaction tests; include platform, evidence, source refresh, browser, a11y, and database integration checks in a unified gate. Triage each advisory against deployment exposure and upgrade with compatibility tests—do not blindly force major upgrades or label every advisory a proven exploit.

## The premium map workspace

Preserve the restrained blue/neutral identity. Enterprise quality comes from clear information and useful actions, not extra decoration or speculative territories.

| Layer | Recommended behavior |
|---|---|
| Frame | Compact ~64 px navigation rail; short context bar; map takes remaining area; collapsible 320–360 px inspector |
| National view | Muted land/state lines; small restaurant points or density; only prioritized DC labels; clear record/precision counts |
| Regional/local view | Reveal individual facilities progressively; selected label always readable; street context only when supported |
| Markers | Restaurants circles, DCs squares, suppliers triangles; shape and text accompany color; precision has a distinct outline |
| Labels | Primary labels 14–16 px; metadata 12–14 px; collision rules prioritize selection/search/exceptions; full details on focus |
| Selection | Dim unrelated marks; public DC shows evidence and unknowns; modeled DC shows bottleneck products/periods and affected sites |
| Flows | Planning-only; show selected facility/product paths, direction and meaningful volume scale; avoid a nationwide line tangle |
| Time | Daily/weekly period selector synchronized across map, KPIs, and impact table; add only after actual period simulation exists |
| Compare | Synchronized views or a delta map with stable legend; show changed nodes, allocations, stockouts, and constraints |
| Impact table | Linked searchable/sortable list: location, product, period, unmet demand, cost delta, cause, evidence/assumption |
| Tablet | One focused inspector or bottom sheet at a time; persistent primary action; map padding accounts for overlays |
| Authoring | Address/map placement → candidate/precision confirmation → assumptions → links → validation → draft save; recovery and undo |

No public layer should invent “who serves whom.” A generated catchment is a modeled allocation and belongs exclusively to Planning/Compare. A user-proposed facility must never become a verified public facility merely because it was saved.

## Enterprise architecture and delivery gates

Keep a modular monolith rather than adding microservices or Kubernetes. Retain React/TypeScript and MapLibre; use one deterministic engine implementation shared by worker execution and tests. PostgreSQL/PostGIS stores authoritative workspaces, geometry, revisions, jobs, and audit records; immutable artifact storage retains raw sources and frozen inputs/outputs. Use a durable worker queue, cached provider adapters, and a bounded assistant tool layer.

The spec's gated delivery approach is appropriate; no fixed timeline is imposed:

1. **Trusted foundation:** buildable release, public/model separation, honest geocoding/manual confirmation, field evidence, protected drafts, authenticated durable saves.
2. **Deterministic twin:** actual demand/inventory/transport/capacity behavior; full lineage; complete scenario lifecycle; executable measured recommendations.
3. **Executive decision workspace:** linked map/time/product/impact table, reliable Compare, context-grounded assistant, interruption recovery.
4. **Production pilot:** source publication/review, dependency/threat-model closure, database role and restore proof, observability, failure drills, national-scale benchmarks, accessibility and user acceptance.

Retain specification targets and prove them on named test hardware/data:

- 100% replay agreement for identical frozen inputs and engine build.
- 100% saved-run recovery after a service restart.
- 3,500 restaurants, 25 DCs, 100 suppliers, seven product groups: weekly run p95 ≤60 seconds.
- Capacity baseline: 5,000 restaurants, 100 DCs, 500 suppliers, 50,000 lanes, 26 weeks or 90 days, 25 queued runs.
- Search p95 ≤400 ms; warm viewport query p95 ≤500 ms.
- VoiceOver/Safari and NVDA/Chrome task completion; no critical/serious axe findings on primary workflows.
- Correlation IDs from action to worker; queue age/run failure/source staleness/backup alerts; tested recovery and rollback runbooks.

Do not make multi-user collaboration, SSO/SCIM, ERP/WMS/TMS integrations, stochastic modeling, or dispatch execution prerequisites for the current single-user public-only scope. Those need separate product decisions. Conversely, single-user scope does not waive authentication, persistence, auditability, recovery, or numerical correctness.

Public information can support an enterprise-grade **planning platform**. It cannot alone establish a live operational twin of Chick-fil-A's private network. Keep unknowns unknown; any future customer-authorized operating feeds are a separate scope.

## Independent challenge and audit discipline

Seven draft finding groups were reviewed by a separate worker who did not draft this list: seven retained, zero generic groups retained, zero duplicate groups retained. Its corrections are incorporated: compiled-map/copilot defects are not asserted as behavior of the unbuildable replacements; platform test success is explicitly local; broader database/CI integration remains unverified.

The prior audit has a larger interaction manifest and full finding reproductions. This revalidation intentionally carries an **Incomplete** exhaustive-UX verdict, not a fabricated full certification. Product/source files were not fixed as part of this assessment; the next step is the prioritized integration and verification work, with publication still requiring authorization.

## Overall product judgment

Flyway already has the outline of a useful executive instrument: geographic context, evidence inspection, and a compact path toward scenario decisions. But using it today feels like handling a well-presented prototype whose gauges are more confident than their underlying model. I would use it to discuss the product and inspect public evidence, not to choose an actual DC, inventory policy, or supplier allocation. The biggest improvement is to make each visible promise complete: a facility fact traces to evidence, an assumption is visibly editable, a scenario runs a credible model, a recommendation can be measured, and a saved decision can be recovered. With that foundation, calmer labels, tighter map framing, and focused comparison views will feel genuinely premium rather than merely styled.
