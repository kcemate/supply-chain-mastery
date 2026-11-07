# Flyway platform service

This service is the durable, single-owner boundary for the Flyway planning prototype. The browser can still run locally without it; connecting is explicit and never overwrites the local workspace until the user chooses to load the server copy.

## Local file mode

Set a unique owner token (at least 32 characters), choose a data directory, and run `npm run platform:start`. The service binds to `127.0.0.1` by default. Set `FLYWAY_ALLOWED_ORIGIN` to the exact UI origin (for example `http://127.0.0.1:5173`) when the browser and API use different ports.

The file store uses atomic workspace replacement and content-addressed immutable run artifacts. `npm run platform:backup -- /absolute/path/backup.json` creates a checksummed logical backup. Restore is deliberately non-destructive: `npm run platform:restore -- /absolute/path/backup.json /absolute/empty-target-directory` refuses a non-empty target. The platform test restores a backup into a clean directory and verifies workspace revision, runs, audit events, and artifact checksums.

File mode supports one service process. Use PostgreSQL before running multiple application processes; do not mount the file directory into multiple replicas.

## PostgreSQL / PostGIS mode

Use two database roles:

- A migration role owns the schema and can install extensions.
- A runtime role has only `CONNECT`, schema `USAGE`, and `SELECT, INSERT, UPDATE` on the six `flyway_*` tables, plus `DELETE` on `flyway_artifact` only. Artifact deletion is required to discard an output that was physically written while cancellation won the run-commit race; the store deletes only workspace-scoped `outputs` rows that no run references as either an input or output. Do not grant `DELETE` on workspaces, runs, idempotency records, audit history, or platform metrics. The runtime role must be `NOSUPERUSER NOBYPASSRLS` and must not own, or be a member of the owner role for, those tables.

Apply the runtime grants with the migration/owner role, substituting the deployment role name:

```sql
GRANT CONNECT ON DATABASE flyway TO flyway_runtime;
GRANT USAGE ON SCHEMA public TO flyway_runtime;
GRANT SELECT, INSERT, UPDATE
  ON flyway_workspace, flyway_run, flyway_idempotency, flyway_audit,
     flyway_artifact, flyway_platform_metrics
  TO flyway_runtime;
GRANT DELETE ON flyway_artifact TO flyway_runtime;
```

Set `FLYWAY_DATABASE_URL` to the runtime role. To apply migrations at startup, also set `FLYWAY_RUN_MIGRATIONS=true` and `FLYWAY_MIGRATION_DATABASE_URL` to the migration role. Set `FLYWAY_REQUIRE_POSTGIS=true` in deployed environments. Startup fails closed if the runtime role can bypass row-level security or owns the tables. Every transaction sets the workspace scope locally, and every table has forced row-level-security policies.

The migration can run on plain PostgreSQL for low-cost local development and reports PostGIS as unavailable. It installs PostGIS when the extension is available. The opt-in database integration test creates a new least-privilege role in a disposable database, proves a privileged runtime connection is rejected, proves another workspace is hidden by RLS, round-trips an immutable artifact, and exercises cancellation cleanup while preserving referenced artifacts. `FLYWAY_TEST_REQUIRE_POSTGIS=true` makes PostGIS an integration-test gate.

PostgreSQL backup remains an infrastructure operation: enable managed automated backups and point-in-time recovery, and schedule logical `pg_dump` backups using the migration/backup role. A release restore drill must restore into a new isolated database, run this integration suite against the restored runtime role, compare workspace revisions and run checksums, and record recovery point and recovery time. Do not claim database recovery readiness from a successful backup alone.

The current queue is deliberately single-worker/single-replica. Production calculations execute in an isolated worker thread, so long simulations do not block the API event loop. Cancellation terminates the active calculation without an output artifact; graceful shutdown interrupts and requeues the active run for restart recovery. `npm run test:platform-worker` exercises those paths with a real national-size model. Full trace allocation still creates significant memory pressure; worker isolation is not a memory-capacity guarantee.

Horizontal workers require database leases with heartbeats and fencing tokens before they are safe; starting a second replica today can treat another process's running job as interrupted. Keep one replica until that lease protocol is implemented and load-tested.

## API safety contract

- All `/api/v1/*` routes except health require the bearer owner token.
- Browser URLs must be HTTPS, except loopback HTTP for local use; redirects are rejected by the client so the bearer token is never forwarded across a redirect.
- Cross-origin browser access is disabled unless one exact `FLYWAY_ALLOWED_ORIGIN` is configured.
- Workspace replacement requires `If-Match` and `Idempotency-Key`; mutation retries with a different body are rejected.
- Run inputs and outputs are immutable, checksummed artifacts. Successful runs can be named as `sourceRunId` to derive a new scenario from their frozen baseline.
- Errors use `application/problem+json` and every response includes a correlation ID and defensive browser headers.

## Decision Intelligence and AI copilot

The workspace stores optional versioned `intelligence` state alongside the network: autonomy rules, evaluated decisions, append-only decision events, and saved conversations. Existing workspaces initialize with an empty state, not fabricated decisions. Dedicated routes use the intelligence revision, while applied network changes also increment the workspace revision atomically. Generic workspace replacement cannot inject or overwrite trusted decision authority.

- `GET /api/v1/intelligence` and `GET /api/v1/copilot/status` read state and provider configuration.
- `PUT /api/v1/intelligence/policy` tightens the autonomy policy.
- `POST /api/v1/intelligence/analyze` evaluates engine-owned candidates.
- `POST /api/v1/intelligence/decisions/:id/resolve` records reasoned human approval, rejection or deferral.
- `POST /api/v1/copilot/responses` saves a conversation response in explicit `ai` or `model-tools` mode.

Mutation routes require authentication, idempotency keys and the expected intelligence revision. A stale decision cannot change the current network. Public identity changes belong to the evidence workflow, not AI authority. Automatic application is restricted to small, immediate, evaluated capacity edits on explicitly synthetic or user-input capacity values. Legacy values with ambiguous provenance stay human-only. Approvals affect the planning model only, with no external purchasing, routing, or supplier execution integration.

For real AI, the service administrator configures `OPENAI_API_KEY` and `OPENAI_MODEL` in the server environment before launch. The key is never returned to the browser. Optional provider-compatible endpoint/model configuration is server-side only. Live requests are billable and require separately authorized configuration. Without a key, `ai` mode returns a setup-required error; `model-tools` mode remains usable and is never labeled an AI response. The provider uses the [OpenAI Responses function-calling protocol](https://developers.openai.com/api/docs/guides/function-calling), bounded tool rounds, timeouts and server-owned tool dispatch. It cannot execute arbitrary code, accept language-model impact numbers as engine results, or bypass policy to approve a high-impact action.

`npm run test:decision-backend` exercises the real HTTP routes, tool protocol using fake upstream HTTP responses, policy/application, idempotency, conversation persistence and file-store restart. These checks do not prove a live provider account, hosted security controls, multi-user approval separation or production AI quality. The prototype's one human role is the single workspace owner; it is not a four-eyes approval system.

## Release gates still outside this module

Before an enterprise deployment, verify TLS termination, encrypted managed storage, owner-token rotation, central log/metric export and alerts, load and soak behavior, managed backup/PITR restore, container image scanning/signing, and an end-to-end browser test against the deployed topology. Multi-user identity, SSO, roles, and organization isolation remain deferred by the product scope; the current bearer token is appropriate only for a single-owner deployment.
