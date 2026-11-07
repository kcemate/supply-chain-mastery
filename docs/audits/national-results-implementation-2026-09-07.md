# Saved-results implementation — September 7, 2026

Status: verified implementation milestone, not enterprise completion or a release pass. Route: local coordinated implementation under otto-os-rails; impeccable hardening informed loading/failure/retry, scoped-result, and unsaved-data protections. No publication, external provider configuration, credentials, paid services, or shared-service changes.

## Implemented

- Shared summary, manifest, artifact-reference, saved-scenario-reference, and bounded-reader contracts. Logical engine run identity is distinct from service job identity.
- Checksummed immutable artifacts; traces partitioned by at most seven modeled days, 5,000 rows, and 1,500,000 serialized bytes. Exact byte-boundary tests include brackets, commas, oversized single rows, and ordinal digit growth.
- Backpressured production worker publication: each artifact is acknowledged durably before the next; a discoverable completed result is published only after its manifest. Cancellation and publication failure retain lifecycle protections.
- Compact default service run reads, signed query-bound cursors, paginated history, direct input-hash lookup, and revision/idempotency-protected reference-only scenario saves. Oversized compatibility reads are rejected from manifest metadata before loading trace chunks.
- Browser IndexedDB storage and safe legacy migration. Artifact and reference failures preserve prior accepted state. In-memory results are not labeled saved; retry can persist them without rerunning calculations.
- Comparison, results, diagnostics, and assistant use bounded readers. Exact frozen map input is separately validated against its input hash. Weekly selection includes seven internal days; already-allocated product rows are not weighted a second time.
- Late replies cannot cross readers, filters, periods, or pages. Workspace transitions cannot discard an in-memory result. Shorter runs cannot retain an out-of-range reporting period. Empty scopes do not inherit the full-run bottleneck.

## Final lead verification

Focused lead checks passed: TypeScript; artifact repository, decoders, result view, IndexedDB browser persistence/failure; real hook stale-response/pagination/retry; workspace-context browser; scenario draft/frozen-proposal recovery and full-app storage-failure save/reopen. Design lint reports zero errors/warnings; dependency audit reports zero vulnerabilities; whitespace check passes.

Current full-app smoke completes compact service save/open/reconnect, public/planning/frozen boundaries, authoring, assistant questions, evidence review, responsive layouts, and seven axe scans with zero violations. The strict gate fails on four headless Chromium WebGL driver warnings; an aborted scoped request is also recorded. No warnings or failures are excluded. The optional recommendation branch was not exercised by this fixture because no response button was present after loading; exact proposal recovery is covered separately, not claimed as full evaluated-recommendation UI coverage.

Lead inspected current public desktop, dark planning desktop, and public tablet screenshots in `tasks/browser-evidence/`. The public atlas still has marker/label collisions; modeled supplier shape differs from its legend. These remain open visual requirements. This is a release smoke, not exhaustive UX certification.

Final `npm run verify` built current source and passed engine, public data, five evidence suites, storage (17/17), artifact/decoder/view/IndexedDB suites, result-reader browser, model editor, map overlap, workspace context, scenario draft and storage-failure browser, platform, worker lifecycle, and the new national completion suite. It exited **1** in the final browser suite on the strict warning assertion. No tests were skipped or warnings excluded. The browser receipt also records one `net::ERR_ABORTED` scope request; therefore request health is not claimed clean. Seven axe scans have zero violations; desktop/tablet unthrottled performance budgets passed. These are smoke measurements, not deployed SLOs.

The final browser run completed at `2026-09-07T18:22:15.884Z`; immutable build index SHA-256: `0ebab13ec04d7c3055483ea3908b747e5582638092f3007390cba373de2e36b8`. Lead inspected the final three screenshots together. Authoritative execution details: `tasks/browser-evidence/browser-smoke-receipt.json`. The production build also emits the existing large MapLibre bundle advisory; that advisory is not hidden by raising its warning threshold.

### National completion evidence

The real fixture contains 3,500 restaurants, 25 distribution centers, 100 suppliers, 3,600 lanes, seven product groups, and four weekly reporting periods (28 internal days). It is synthetic test data, not the public facility registry. A production worker and local file store executed it; a fresh service/store then reopened its saved reference and queried its details.

| Measured property | Result |
| --- | ---: |
| Calculation and publication | 88,542 ms |
| Output artifacts | 369 |
| Stored output | 540,487,181 bytes |
| Default run response | 4,236 bytes |
| Saved-scenario list response | 3,912 bytes |
| Scoped restaurant page | 4,009 bytes |
| 5,000-row metric page | 1,888,537 bytes |
| Reported process peak RSS | 1,828,448 KiB |
| Save and restart/reopen | Passed |

The compatibility endpoint returned 413 after reading manifest metadata only; instrumented artifact reads prove it did not materialize the national traces. Worker cancellation/requeue tests also passed independently (health 1 ms, status 88 ms in the final chain). National replay is not separately recomputed twice in this heavy fixture; exact replay and complete row pagination are independently checked in the focused artifact fixture.

### Separate national workspace boundary — failed

Lead read the resulting durable workspace and serialized the exact `{workspace: ...}` response shape used by the HTTP handler. It measures **4,875,492 bytes**, versus the required **2,097,152-byte** boundary. A direct assertion of that requirement exited 1. The evidence file is `/var/folders/4p/6xqg0cm146v1nsq6hl5jk64h0000gn/T/flyway-national-persistence-9ktff2/platform-database.json` (disposable local test evidence, not production data). This was a separate size probe, not an HTTP network measurement or a passing national authoring test.

The new national suite proves result persistence/reopen; it does not prove the national workspace-size contract. Whole-workspace replacement still includes the full editable network and cannot meet the 2 MiB write limit for this fixture. No model fields, product policies, or locations were removed to pass the boundary; the request cap was not raised. The next architecture change must separate paginated network/history reads from revision-protected entity/field updates. Large-history and national edit acceptance remain open.

## Remaining gates

- National engine execution still constructs full traces inside the worker; chunked persistence is not proof of bounded simulation memory, 90-day/26-week capacity, or concurrency/SLOs.
- A thousand saved scenarios still require workspace/history-size and UI-list bounds; compact references alone do not guarantee these limits. Query responses are bounded but may scan many chunks and have not met a national latency SLO.
- Legacy migration interruption coverage is not exhaustive. Browser origin quotas, IndexedDB reopen/version-change recovery, retention, orphan cleanup, and backup-aware artifact reachability need further work.
- Strict browser warnings/request health, WebGL fallback, map label collisions, symbol consistency, and the complete UX/stress matrix remain open.
- Cold-chain/storage classes, perishability, explicit unit conversion, backlog policies, local-time/DST calendars, forecast validation, active evidence publication, complete field provenance, and deployment/security/managed recovery proofs remain open as recorded in the full audit/specification.
- No public information is represented as actual inventory, routing, allocation, private suppliers, service territories, or a complete current operating network.
