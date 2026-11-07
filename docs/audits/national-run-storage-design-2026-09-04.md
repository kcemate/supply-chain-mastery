# National saved-run storage design — 2026-09-04

## Decision

The current service isolates a national calculation while keeping status and health responsive; tests prove mid-run cancellation and shutdown requeue. They do not yet prove completed national save/reopen/restart through the `SavedScenario` workflow. A saved scenario embeds the entire `ScenarioResult`, including the frozen national network and both daily traces, inside the workspace document, which exceeds the protected request/storage limits at national scale. The release-blocking change is to make the workspace contain small scenario/run references, keep immutable run material outside the workspace, and make normal result reads compact and paginated.

This follows the authoritative specification: scenario, scenario revision, simulation run, and simulation metric are separate records (`docs/chick-fil-a-digital-twin-build-spec.md:1017-1021`); large run bundles belong in object storage (`:1285-1286`); and results already have separate summary, metrics, impacts, and recommendation endpoints (`:1323-1336`).

## Current path and release blockers

1. `ScenarioResult` carries `input`, `baselinePeriodMetrics`, and `periodMetrics` (`src/flywayTypes.ts:413-430`). At the accepted national shape, two traces contain `3,625 × 7 × 28 × 2 = 1,421,000` rows. A representative current row serializes to about 388 bytes, so traces alone are roughly 526 MiB before the frozen input, recommendations, diagnostics, parser overhead, and duplicate in-memory copies.
2. Clicking **Save scenario** constructs `{...scenario, result: pendingResult}` and mutates `workspace.scenarios` (`src/FlywayApp.tsx:699-703`). Connected mode JSON-stringifies that full array into `PUT /workspace` (`src/useWorkspace.ts:38-49`), but the API rejects bodies above 2 MiB (`server/httpServer.ts:10, 162-170`). A national save therefore cannot succeed. Browser-only mode targets local storage and will exceed ordinary origin quota much earlier.
3. Every workspace read returns every embedded saved result (`src/useWorkspace.ts:20-27`), and `ScenariosPage` dereferences embedded metrics directly (`src/FlywayApp.tsx:532-538`). As saved runs accumulate, connect/reload, validation, JSON parsing, and every workspace write scale with historical trace volume.
4. The service already writes a full immutable output artifact (`server/platformService.ts:435-449`), but `GET /runs/{id}?includeOutput=true` reads and serializes the entire object (`server/platformService.ts:288-293`; `server/httpServer.ts:201-205`). `PlatformClient.getRun` defaults to `includeOutput=true`, and polling uses that default (`src/platformClient.ts:174-190`). Completion therefore moves the full national bundle through artifact parsing, HTTP serialization, browser JSON parsing, React state, and later workspace duplication.
5. `GET /runs` is unpaginated (`server/platformService.ts:296-299`; `server/httpServer.ts:183-185`). `useServiceRuns.submit` downloads the whole run list merely to resolve an `inputHash` to a source run (`src/useServiceRuns.tsx:29-37`). This becomes a second independent growth limit.
6. File storage parses and clones the entire platform database for reads and rewrites it for transactions (`server/fileStore.ts:118-132`). Embedding results in `workspace.scenarios` makes even request-metric updates proportional to all saved traces. PostgreSQL similarly keeps workspace state as one JSON document while also storing full output JSONB artifacts (`server/postgresStore.ts:137-171, 180-185`).

## Exact v2 contracts

### Workspace and scenario references

Replace `SavedScenario.result` with a reference and a compact latest-run summary. The workspace remains useful offline for navigation but never owns a trace or frozen run input.

```ts
interface SavedScenarioReferenceV2 extends ScenarioDefinition {
  schemaVersion: 2;
  savedAt: string;
  latestRunId: string;
  latestRun: RunSummaryV2;
  completedRunCount: number;
}

interface RunSummaryV2 {
  runId: string;
  scenarioId: string;
  status: PlatformRunStatus;
  engineVersion: string;
  engineBuildDigest: string;
  inputHash: string;
  outputChecksum: string;
  completedAt: string;
  baseline: TwinMetrics;
  scenario: TwinMetrics;
  baselineCostBreakdown: CostBreakdown;
  costBreakdown: CostBreakdown;
  productMetrics: ProductMetric[];
  impactCount: number;
  recommendationCount: number;
  diagnosticWarningCount: number;
}
```

`WorkspaceDocumentV2.scenarios` and `PlatformWorkspace.scenarios` become `SavedScenarioReferenceV2[]`. `ScenarioResult` remains the engine-internal logical result, not the workspace or default HTTP representation. The save action becomes `POST /api/v1/scenarios` with `{runId, expectedWorkspaceRevision}` plus `Idempotency-Key`; the server verifies the run is successful and belongs to the workspace, records the reference, and returns the new workspace revision. Rename/duplicate/delete use the specification's scenario endpoints and never copy run artifacts.

Browser-only mode uses the same reference type. Store the immutable run manifest/chunks in IndexedDB under `runId`; local storage contains only the workspace and references. A save is successful only after the IndexedDB transaction commits and the reference write succeeds. If either fails, retain the completed result in memory and display an actionable unsaved state.

### Immutable run manifest and chunks

Do not store the national `ScenarioResult` as one JSON value. Persist this content-addressed manifest:

```ts
interface RunResultManifestV2 {
  schemaVersion: 2;
  runId: string;
  inputArtifact: ArtifactReference;
  summary: RunSummaryV2;
  impactsArtifact: ArtifactReference;
  recommendationsArtifact: ArtifactReference;
  diagnosticsArtifact: ArtifactReference;
  traces: Array<{
    kind: 'baseline' | 'scenario';
    periodFrom: number;
    periodToExclusive: number;
    rowCount: number;
    artifact: ArtifactReference;
  }>;
  logicalOutputChecksum: string;
  manifestChecksum: string;
}
```

Trace chunks are ordered by `(periodIndex, locationId, product)` and should initially contain one modeled week or at most 5,000 rows, whichever is smaller. Each artifact retains its SHA-256 checksum; the manifest checksum covers the ordered artifact references and summary. `logicalOutputChecksum` remains the engine's existing full logical-output checksum, so deterministic replay semantics do not change. A replay verifies every chunk checksum, reconstitutes the logical result only in the verification worker, and compares that checksum. Referenced input, source, route, and forecast artifacts remain immutable.

The worker protocol should emit summary and bounded chunks to an artifact sink instead of structured-cloning one 500+ MiB result back to the API thread. Completion is published only after all chunks and the manifest are durable. A cancelled or failed run has no manifest reference; unreferenced content-addressed chunks are reclaimed by a mark-and-sweep maintenance job after a safety window.

### Read APIs

Normal reads must be bounded:

```text
GET /api/v1/scenarios?cursor=&limit=50
GET /api/v1/scenarios/{id}
GET /api/v1/scenarios/{id}/runs?cursor=&limit=50
GET /api/v1/runs?cursor=&limit=50&scenarioId=&status=
GET /api/v1/runs/{id}                         # metadata + RunSummaryV2 only
GET /api/v1/runs/{id}/input                   # frozen input, explicit on-demand read
GET /api/v1/runs/{id}/metrics?kind=scenario&product=&locationType=&locationId=&periodFrom=&periodTo=&cursor=&limit=
GET /api/v1/runs/{id}/impacts?product=&periodFrom=&periodTo=&cursor=&limit=
GET /api/v1/runs/{id}/recommendations?cursor=&limit=
```

List limits are 1-100; metric limits are 1-5,000. Responses return `{items, nextCursor, scope, totals}`. `totals` contains weighted demand/fulfillment/service, stockouts, affected restaurants, and peak utilization for the exact filters so the UI never calculates a partial-page KPI. Cursors are opaque, signed, and bind `runId`, manifest checksum, filters, and the last sort key; a changed filter or manifest rejects the cursor with `invalid_cursor`.

Deprecate `includeOutput=true`. During one compatibility release, allow it only when the manifest's declared uncompressed size is below a conservative cap; otherwise return `413 full_result_too_large` with links to summary and paginated endpoints. An explicit streamed audit bundle may remain available for recovery tooling, but the UI must not use it.

`POST /runs` accepts `sourceRunId` directly. Add `GET /runs/by-input-hash/{hash}` or, preferably, persist the originating service `runId` with each scenario reference so `useServiceRuns` never scans `listRuns` to find frozen lineage.

### UI state

`useServiceRuns.wait` polls compact run metadata with `includeOutput=false`; on success it fetches `RunSummaryV2`, not a full result. `ScenariosPage` reads `SavedScenarioReferenceV2.latestRun`. Opening Compare creates a `RunResultViewModel` containing summary plus query functions for metrics, impacts, recommendations, and frozen input. Product/period changes issue cancellable scoped requests; stale responses are discarded by request generation. The impact table uses server pagination. Map risk requests only restaurant IDs with positive scenario-minus-baseline shortage for the active scope. Results, Copilot, and audit details fetch only the data they actually display; exact frozen input is fetched on demand.

## Migration

1. Introduce platform schema v2 and a decoder that accepts both embedded `SavedScenario` v1 and reference v2. All new writes use v2.
2. For each service v1 saved scenario, verify its existing `inputHash` and `outputChecksum`, find an existing successful run with the same hashes or create a migrated successful `RunRecord`, write/deduplicate v2 manifest artifacts, then replace the embedded result with `SavedScenarioReferenceV2`. Commit the reference replacement and migration receipt atomically. Never discard the v1 value until checksum verification and reference commit succeed.
3. Existing monolithic output artifacts remain readable as `resultFormat: 'monolith-v1'`. Convert lazily under a per-run migration lock or with a resumable background job; publish `manifest-v2` only after all chunks verify. Reads route through a repository adapter supporting both formats during migration.
4. For local state, copy each embedded result to IndexedDB, verify read-back checksums, write v2 references, then retain the original versioned local-storage envelope as a recovery backup. On quota failure, leave v1 untouched and prompt the user to connect a service or free storage; never report “Saved.”
5. After telemetry shows no v1 reads for the retention window and backups have been restore-tested, remove v1 write support. Physical artifact deletion remains a separate retention-policy action.

## Acceptance tests and release gates

- A real 3,500-restaurant, 25-DC, 100-supplier, seven-product, four-week run saves and reopens after service restart without a workspace request or response exceeding 2 MiB.
- `GET /workspace` and a one-field workspace update remain bounded when 1,000 historical runs exist; neither response contains `periodMetrics`, `baselinePeriodMetrics`, or frozen `input`.
- Paginating both traces returns every row exactly once in canonical order. Concatenated chunks reproduce the engine `outputChecksum`; filtered `totals` match hand-calculated weighted metrics and are independent of page size.
- Scenario list/open/compare works after restart using only references. Selecting product/period cancels an older request, rejects its late response, and keeps map, KPI, and table scope synchronized.
- Cursor tampering, cursor/filter mismatch, excessive limits, unknown run IDs, cross-workspace IDs, and missing chunks return typed problem details without data leakage.
- Saving the same run twice with the same idempotency key creates one scenario reference; a different payload with that key returns a conflict.
- V1 service and browser migrations are checksum-preserving, resumable after interruption at every step, and leave the original recoverable on quota or artifact failure.
- Cancellation before manifest publication produces no run manifest/reference. Garbage collection removes abandoned chunks only after proving they are unreachable from runs, scenarios, backups, and migration receipts.
- Browser performance gate: scenario list and summary response each stay below 250 KiB; metric pages stay below 2 MiB; no routine interaction parses a monolithic national result.

## Worker lifecycle review and disposition

Verified repairs on 2026-09-04:

1. **Resolved — shutdown termination acknowledgment.** Abort now suppresses late worker messages and settles only after `worker.terminate()` resolves. `PlatformService.shutdown()` consequently waits for physical termination before the caller closes its store/pool. Deterministic fake-worker and service-level tests hold termination open, prove shutdown remains pending, then verify the interrupted run returns durably to `queued`.
2. **Resolved — supervised queue/store failures.** Queue work now runs under a supervisor. A failure outside deterministic execution sets `/health` to `503` with a typed degraded queue state and attempts to mark the affected running or oldest queued job `failed` with retryable code `queue_processing_failed`. If that recovery write also fails, the in-memory degraded state retains both errors rather than creating an unhandled rejection. Fault-injection verifies the durable job record and health response. The unauthenticated health representation exposes only status, stable code, and timestamp; internal exception text remains out of the public response.
3. **Resolved for current stores — cancellation during output publication.** When cancellation wins after the output file/blob is written but before its run reference commits, the run remains cancelled and the store removes that output only if no run references it. File deletion is serialized with store transactions; PostgreSQL performs a workspace-scoped conditional delete, preserves both input and output run references, rejects non-output kinds, and requires `DELETE` only on `flyway_artifact`. Gated file and disposable-PostgreSQL tests prove the abandoned output is physically removed while referenced and evidence artifacts remain immutable. The manifest design should still retain delayed reachability garbage collection for future multi-process chunk publication.

Open release gaps:

1. **The large result still crosses the worker boundary as one structured clone.** `engineExecution.worker.mjs` posts the full output, and `engineWorkerClient.ts` receives it as one message. At national scale this can duplicate hundreds of MiB and pause the API thread during deserialization. The chunked artifact-sink protocol above remains a release gate, not an optional optimization.
2. **Resource and build controls remain incomplete.** The worker uses runtime TypeScript registration from `tsx` rather than a versioned built JavaScript artifact; it has no `resourceLimits`, execution deadline, or output-size guard; and one platform instance executes one job at a time. Bundle and fingerprint the worker in production, set memory/time ceilings with typed retryability, and expose queue/run-stage metrics before making a concurrency or enterprise-scale claim.
