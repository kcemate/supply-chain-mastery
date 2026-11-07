# Decision Intelligence and connected copilot — prototype receipt

Local work dated November 6, 2026 (final test timestamps cross into November 7 UTC). This is an implementation and verification receipt, not an enterprise production-readiness pass.

## Delivered scope

- Decision Intelligence navigation and a functioning Human queue, Decision history and Autonomy policy workspace. Real calculated decisions replace fabricated sample history.
- Deterministic 5% capacity candidates and larger human-reviewed alternatives. Automatic application requires every conservative rule: explicit synthetic/user-input capacity, at most 5% capacity, 2% modeled landed-cost increase, one location, nonnegative service change and no additional shortages. Rules can tighten, not loosen, these ceilings. Previously automatically changed locations require human review for subsequent changes.
- Reasoned approve, reject and defer; atomic model/application history; duplicate/replay protection; supersession when the network or calculation-engine version has changed. Facility identity evidence and workspace preferences are preserved. Structural/public-identity proposals cannot bypass human/evidence controls.
- One analysis can record an automatic application and freshly evaluate the subsequent human option against the post-application model. Repeating unchanged service analysis preserves the existing decision records and original run references.
- Measured before/after service, shortages, cost and utilization; proposal, routing reasons, source/candidate hashes and checksums; full wrapping identifiers; candidate result navigation; actor/reason/time history. Approvals affect the planning model, never an external operating system. Capacity investment and implementation costs are excluded from landed cost.
- Persistent copilot conversations, explicit Model tools versus AI + model tools, tool traces, run/decision navigation, public source links, scenario calculation/save and saved-scenario comparison. Unsupported requests do not silently become DC outages, and capacity increases do not become decreases.
- Authenticated service endpoints and a server-side OpenAI Responses adapter with bounded rounds/calls, output tokens/size, timeouts and a validated tool gateway. Tools can read modeled locations, official facility sources, saved metrics, saved scenarios and decisions, run scenarios, compare results and evaluate decisions. They cannot approve a high-impact decision or execute arbitrary code.
- Honest setup/failure states. Provider failure after a successful tool action refreshes the actual workspace, retains the question and warns that tool actions may already have saved. It does not manufacture a successful assistant response. Static/browser builds contain no provider credential.

## Calculation correction

The final consistency test found that an aggregate capacity increase could be canceled by unchanged per-product DC ceilings when a DC had explicit daily capacities. Its reported utilization denominator also remained at the old capacity. Engine `flyway-deterministic-2.0.1` applies the effective capacity consistently to aggregate/product constraints and utilization. The engine source digest was regenerated, not bypassed.

New regressions require the fully applied network to reproduce **all candidate metrics exactly** for both automatic and human-approved capacity changes, in addition to measuring a genuine service improvement in the constrained fixture. Older-engine decisions remain readable as history but cannot authorize a new application under the current engine.

## Implementation boundaries

Shared state and authority: `src/intelligenceTypes.ts`, `src/decisionIntelligence.ts`.

Local integration and persistence: `src/useDecisionIntelligence.ts`, `src/useWorkspace.ts`, `src/schemaDecoders.ts`, `src/simulationClient.ts`, `src/simulation.worker.ts`.

Interface: `src/DecisionIntelligencePage.tsx`, `src/decision-intelligence.css`, `src/FlywayCopilot.tsx`, `src/intelligent-copilot.css`, `src/WorkspaceSettings.tsx`, `src/FlywayApp.tsx`.

Service: `server/platformService.ts`, `server/openAiCopilot.ts`, `server/httpServer.ts`, `server/types.ts`, `server/cli.ts`, `src/platformClient.ts`.

Public facility identity is unchanged. Three initial sample DC capacities now have explicit synthetic field provenance instead of accidentally inheriting a public identity label. Ambiguous existing saved capacities are not silently relabeled; they stay human-only until provenance is established. The national reference snapshot remains the accepted August evidence snapshot, not a complete current private operating network.

The product amendment is section 26 of `docs/chick-fil-a-digital-twin-build-spec.md`. Original production requirements and E1–E8 remain in force.

## Verification

| Check | Result |
|---|---|
| Production build / TypeScript | Pass; Vite retains its large-chunk advisory rather than increasing the threshold |
| Deterministic engine | Pass: product-period physics, seven scenario classes, inventory/lead time, conservation, grain equivalence, source lineage and proposals |
| Decision domain | Pass: conservative routing, exact measured/applied metrics, provenance, duplicates, stale/old-engine approvals, deep validation and unsupported proposals |
| Decision service | Pass: actual HTTP/client routes, one-click automatic plus fresh human analysis, immutable source/candidate run reopening, preferences, idempotency, restart, prompt-sensitive model tools, saved comparisons, capacity increase direction and frozen source network |
| Responses protocol | Pass with fake upstream HTTP: actual function-call/output loop, failure labeling, call/output bounds, saved public-source URLs/dates and restart replay without another provider request |
| Decision component browser | Pass: reason enforcement, history, policy save, search empty state, desktop/tablet dark and serious/critical axe 0 |
| Full local prototype journey | All recorded functional steps pass, including automatic/human routing, approval/policy/conversation reload persistence, copilot scenario save/open and tablet dark; strict browser health fails |
| Full connected prototype journey | Pass through actual UI → authenticated service → Responses adapter → engine/policy → approval → induced provider failure → reload/reauthentication recovery; fake upstream only |
| Existing data/evidence/storage/result/model-editor/map-overlap/workspace-context/scenario-draft regressions | Pass in the full verification run |
| Platform and national-size checks | Pass after engine 2.0.1: auth/security/persistence/restore, isolated-worker responsiveness/cancellation/requeue, and 3,625-location national save/restart/reopen |
| `npm run verify` | **Fail** at the local-prototype strict browser-health assertion; later suites are run separately, not silently skipped |
| Design lint / whitespace | Pass, no design errors or warnings |

Latest local-prototype receipt: `tasks/browser-evidence/intelligence-prototype-receipt.json`. It records 20 real interactions, three axe scans with zero violations, LCP 56ms, CLS 0.072 and maximum observed event duration 48ms in an unthrottled local run. Its strict health is red: two Chromium OpenGL `GPU stall due to ReadPixels` warnings and one aborted state-atlas request. No console errors, page exceptions or first-party HTTP failures were recorded in that journey.

Latest connected receipt: `tasks/browser-evidence/intelligence-connected-receipt.json`. Its actual authenticated UI journey passes with zero unexpected console warnings/errors, page errors, failed requests or HTTP errors. The deliberately induced upstream 503 becomes one expected API 502, recorded separately and asserted explicitly, not filtered out as an unexplained failure. Four fake upstream calls prove both successful tool completion and final-response failure after an independently saved action. No live provider credentials or charges were used.

The broader immutable-preview smoke is `tasks/browser-evidence/browser-smoke-receipt.json`. Its strict warnings/requests remain release gates, even when the UI steps and accessibility/performance checks succeed. No warnings or canceled requests were excluded to make tests green.

Its final immutable-build run matches the index identity below and records four OpenGL ReadPixels warnings plus one aborted result-scope request. Console errors, page exceptions, server 5xx, client 4xx and accessibility failures are zero. Seven axe scans are clear. Desktop LCP/CLS/max observed event duration were 2,108ms / 0.0217 / 120ms; tablet LCP/CLS were 3,160ms / 0.000329, within the smoke's unthrottled budgets. Onboarding, public evidence, settings, location/lane editing, planning trace, saved scenario recovery, frozen comparison, two question-sensitive copilot answers, evidence history and service reconnect completed. No feasible recommendation was available in that fixture, so the recommendation-draft branch was not exercised in this smoke; engine proposal tests do not substitute for that missing full-UI path.

The post-patch national run covered 3,625 locations, 3,600 lanes, seven products and four weeks. It completed in 91,128ms, saved 369 artifacts / 540,487,181 bytes, and reopened after restart. Default compact result response was 4,236 bytes, saved-scenario list 3,912 bytes, scope page 4,009 bytes and bounded metric page 1,888,537 bytes. Reported process peak RSS was 1,589,856KiB; this is still substantial memory, not a scaling/SLO pass. Separate worker checks measured concurrent health at 1ms and status at 102ms, cancellation with zero output artifacts, and interrupted shutdown requeued for recovery.

Final production index SHA-256: `145c9e0d1db5301f12bc33863e2fdf68aa1c52b92530f79f1afb9efa1c7aa1a8`. Main application script is approximately 520kB and the lazy MapLibre chunk approximately 1,046kB before gzip. No chunk-warning threshold was relaxed.

## Visual review and evidence

Root inspected the actual desktop decision queue, desktop copilot, 768px dark decision history and copilot, plus the connected AI-mode test screenshot. Relevant files are in `tasks/browser-evidence/`:

- `intelligence-prototype-after-analysis.png`
- `intelligence-prototype-copilot-scenario.png`
- `intelligence-prototype-tablet-dark.png`
- `intelligence-prototype-tablet-dark-copilot.png`
- `intelligence-connected-ai.png` — explicitly a fake-upstream protocol test, not proof of a live AI account

Root also inspected the final immutable-build `public-desktop.png`, `planning-dark-desktop.png` and `public-tablet.png`. This is scoped visual/functional evidence, not a new exhaustive all-buttons UX audit.

The fresh finish reviewer requested wrapping full hashes and replacing the raw approval event token. Both were fixed in one batch and scored resolved. Final disposition was **ship at fix-list scope only**, not a release-readiness approval. The documenter confirmed that `DESIGN.md` matches the built behavior without unrelated drift repair. Impeccable influenced readable audit evidence, truthful authority labels, tablet stacking and existing-system controls; it did not replace the product's visual identity.

## Remaining gates / next action

1. Configure a live provider securely on an approved workspace service, then separately authorize and verify a live request. The actual UI currently remains in browser-only Model tools mode unless the user connects a configured service. Real provider quality, grounding evaluations, rate limits and hosted security are not proved by fake-upstream tests.
2. Resolve the strict map-driver warning and canceled-request gates without filtering them. The entire app is not certified warning-free.
3. Complete the broader enterprise backlog: national workspace transport/history bounds, memory pressure, missing modeling contracts, multi-user governance where later required, deployed security, managed restore and operating controls. A finite capacity/scenario tool library is not a general-purpose global optimizer.
4. Existing legacy saved inputs remain inspectable. Exact execution requires the matching engine build; new planning analyses use 2.0.1. Derived copilot scenarios use the frozen baseline network/defaults, not automatic stacking of every earlier disruption change.

Local UI: `http://127.0.0.1:5173/`, served by this workspace's owned Vite process. HTTP root was verified; browser-panel opening was queued, not confirmed. The dedicated Browse utility could not find Chrome and the in-app browser control was unavailable; bundled Chromium test workflows provide the actual browser verification. No browser installation was changed.

No new here.now publication, production change, secret inspection, paid provider call, external send, destructive cleanup, commit or merge was performed. Existing unrelated dirty-worktree changes were preserved.

Routing: otto-os-rails for bounded parallel work and approval gates; impeccable for incumbent-interface extension and finish review; openai-docs with the official [function-calling guide](https://developers.openai.com/api/docs/guides/function-calling); browse for an attempted local opening check with the explicit fallback above.
