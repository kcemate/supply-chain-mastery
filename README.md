# Flyway

Flyway is an independent educational digital twin for a Chick-fil-A-inspired U.S. restaurant supply network. It gives supply-chain executives a map-led workspace for testing facility, supplier, demand, inventory, route, cost, and disruption decisions.

Flyway is not affiliated with, endorsed by, or sponsored by Chick-fil-A, Inc. It does not use Chick-fil-A logos or confidential information. Public facts carry source, confidence, and verification metadata; unsupported operational values are labeled as editable sample estimates.

## Current implementation and evidence boundary

- Separate Public network, Planning model, and frozen Compare workspaces. The bundled August 2026 evidence snapshot contains 3,458 official location-page records, 3,424 official-page-validated restaurant points, and 16 directly named U.S. distribution facilities. It is not a complete current operating registry.
- Distribution-facility markers preserve evidence precision: 13 exact official addresses, three city-level records with visible source conflicts, and one launch/stand-up record. They never imply capacity, routes, inventory, territories, restaurant assignments, or current operating status.
- A visibly separate 12-node operating model drives routes, inventory, capacity, costs, and scenarios; the national public footprint is never presented as modeled operational truth.
- Optional fictional expansion: choose **Control Tower → Planning model → Add synthetic network**, or use the same action in **Locations**. It adds a deterministic eight-region sample with 88 restaurants, eight distribution centers, 24 suppliers, and 112 lanes. All seven products have modeled flows. Demand, inventory, capacity, freight, and assignments are editable assumptions, never public records. The addition preserves existing data and saved runs. Choose **Inspect sample hub** to review the inputs or create an outage scenario.
- Restaurant, distribution-center, and supplier records with public, corroborated, sample-estimate, and user-input provenance.
- Address matching against accepted bundled records, optional service-backed Census geocoding, or explicit manual placement with coordinate confirmation. The UI does not invent successful geocoding.
- MapLibre pan/zoom, USA/Hawaii/Alaska framing, selected modeled lanes, keyboard-operable facilities, and a bundled state atlas without raster-tile dependencies.
- Daily internal product-flow, inventory, replenishment, capacity, calendar, transport, and cost calculations; daily or weekly reporting for all selected disruption classes.
- Baseline/scenario results, product/period impact tables, reconciled costs, complete frozen inputs, executable candidate proposals, SHA-256 replay identity, and saved runs.
- Saved results now use compact references and immutable, checksummed chunks. Connected runs publish through a backpressured worker; browser-only runs use IndexedDB. Comparison, impacts, diagnostics, and assistant queries read bounded pages rather than downloading both full traces. Frozen map inputs remain an explicit separate read.
- Locations, Scenarios, Data & Sources, Settings, guided onboarding, light/dark themes, Decision Intelligence, and a model-grounded Flyway copilot.
- An explicit browser-only persistence mode and an optional authenticated single-owner service with revision checks, immutable run artifacts, recoverable jobs, audit events, file backup/restore, and a PostgreSQL/PostGIS adapter. See [the service guide](server/README.md).

Decision Intelligence evaluates the editable planning model, not the public restaurant footprint. An automatic change must measurably beat doing nothing: reduce shortage units, raise service, or lower modeled landed cost. It must also meet the existing limits (at most 5% capacity, 2% modeled landed-cost increase, one location, no service degradation or increased shortages, and synthetic/user-input capacity fields only). A location already changed automatically requires human review for subsequent changes. No-benefit, larger, or structural proposals wait for a reasoned human approval, rejection, or deferral. Changed inputs supersede stale approvals. Every decision retains calculated before/after metrics, frozen-run identities, policy reasons, and event history. These actions change a simulation only; they do not purchase capacity or execute operating changes. Landed cost excludes capacity investment and implementation costs.

When no in-radius alternate improves a DC outage, the engine can evaluate an out-of-radius contingency under explicitly modeled transport assumptions. Results label these options **Human approval required**; **Model this response** runs a separate what-if draft without approving it or changing the planning baseline. Restaurant impacts report the shortage-unit change separately from the change in modeled shortage-penalty dollars. Older saved runs remain readable and do not relabel their legacy impact field as dollars.

The copilot has two explicit modes: saved, question-sensitive **Model tools**, and **AI + model tools** through a configured workspace service. Model tools query public evidence and frozen results, run supported scenarios, compare saved scenarios, explain decisions, and populate the decision queue. The AI mode uses server-side OpenAI Responses function calling; the engine, not the language model, calculates numbers and enforces decision authority. Conversations and decisions persist with the workspace. An unconfigured provider is shown as setup required, never a fabricated AI response.

Operating assumptions remain editable estimates. Mixed quantity units are rejected until explicit conversions exist. Perishability, cold-chain storage classes, local-time/DST scheduling, national trace-memory optimization, managed recovery, and deployed security/operations proof remain open enterprise gates. This is a single-owner planning prototype, not an enterprise production-readiness claim.

## Run locally

```bash
npm install
npm run dev
```

Open the local address shown by Vite.

### AI connection

Browser-only mode works without an API key and saves conversations, model decisions, and scenarios on this device. For real AI, run the authenticated workspace service described in [server/README.md](server/README.md), with `OPENAI_API_KEY` and `OPENAI_MODEL` provided by its administrator. Configure these only in the server environment; never put the key in client code, browser storage, or a published static bundle. Connect through Settings → Workspace service, then check Settings → AI copilot. Live AI requests incur provider charges. The prototype does not provision a provider account or expose a browser key-entry form.

Example workflow: open Decision Intelligence → Analyze network → inspect the automatic history and human queue → enter a reason and approve/defer/reject → reload to confirm history. In Ask Flyway, choose Model tools to test a 20% demand surge, open its result, compare saved scenarios, or inspect official Mebane sources. Explicit assistant mode and tool traces distinguish calculated tools from language-model responses.

## Verify

```bash
npm run verify
npm run design:lint
```

Focused decision checks: `npm run test:decisions`, `npm run test:decision-backend`, `npm run test:intelligence-prototype`, and `npm run test:intelligence-connected`. Provider tests use fake HTTP responses through the real tool gateway; they do not validate a paid live provider connection. Engine 2.0.2 adds outage contingencies and separate shortage-unit and shortage-cost impacts. Decisions evaluated by older engine versions must be re-evaluated before approval.

Synthetic expansion checks: `npm run test:synthetic-network` verifies the versioned graph, evidence, merge semantics, and calculated baseline/disruption behavior; `npm run test:synthetic-browser` exercises actual install, scenario, reload, and public-layer separation with strict browser health checks.

Current full-application browser artifacts are saved in `tasks/browser-evidence/`. Historical `tasks/flyway-*-smoke.png` files are dated evidence, not proof of the current build. The worker-isolation gate also executes a real national-size model while checking health, cancellation, and graceful restart recovery.

The September 7 saved-results implementation is **not a release pass**. Current browser workflows save compact references and reopen frozen results, but strict browser health still fails. Large-history bounds, national engine memory, complete model/evidence acceptance, and deployed operating controls remain open. See the [saved-results implementation receipt](docs/audits/national-results-implementation-2026-09-07.md) for current verification and the [September 4 audit receipt](docs/audits/enterprise-implementation-status-2026-09-04.md) for the preceding milestone.

`npm run test:run-artifacts` verifies chunk limits, checksums, replay, local persistence, and failure preservation. `npm run test:run-reader` verifies stale-response rejection and pagination. `npm run test:platform-national` performs a real 3,625-location, seven-product, four-week calculation, save, and restart/reopen using disposable local storage; it is resource-intensive and included in `npm run verify`.

The restaurant evidence ingestion can be run with `npm run data:refresh-verified-locations`. It preserves versioned source artifacts and quarantines candidates for review instead of overwriting the accepted public bundle. The official location index defines the record universe; each plotted point requires a matching structured address and valid coordinate in the page's own directions link. Blocked, malformed, or ambiguous pages remain review records, not fabricated points. Live upstream ingestion was not rerun as part of the local implementation checks.

Refresh the separate distribution-facility registry with `npm run data:refresh-public-dcs`. That audit scans every current official Supply and Supply Services career record, accepts only directly named facilities, preserves official announcement evidence, and automatically holds conflicting addresses at city level. A 2024 official article's nine-DC aggregate and the current 16-name careers snapshot remain visibly unreconciled rather than being treated as one current operating count. Build the bundled Census-derived state geometry with `npm run data:build-state-atlas`.

## Product contract

The implementation specification is in `docs/chick-fil-a-digital-twin-build-spec.md`. The active enterprise checklist and verification receipts are in `tasks/todo.md`; unchecked requirements are not waived by a passing unit suite. Production deployment, external provider configuration, managed recovery, and operations require separate approval and environment-specific verification. Public information supports a planning platform, not a live replica of Chick-fil-A's private operating network.
