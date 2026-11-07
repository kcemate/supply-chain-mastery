BEGIN;

DO $flyway$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'postgis') THEN
    CREATE EXTENSION IF NOT EXISTS postgis;
  ELSE
    RAISE NOTICE 'PostGIS is not installed on this server; core persistence remains available but geospatial database features are disabled.';
  END IF;
END
$flyway$;

CREATE TABLE IF NOT EXISTS flyway_workspace (
  id uuid PRIMARY KEY,
  owner_id text NOT NULL,
  revision bigint NOT NULL CHECK (revision > 0),
  state jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS flyway_run (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES flyway_workspace(id),
  status text NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'cancelled')),
  input_hash char(64) NOT NULL,
  output_checksum char(64),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS flyway_run_workspace_created_idx ON flyway_run (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS flyway_run_queue_idx ON flyway_run (status, created_at) WHERE status IN ('queued', 'running');

CREATE TABLE IF NOT EXISTS flyway_idempotency (
  storage_key char(64) NOT NULL,
  workspace_id uuid NOT NULL REFERENCES flyway_workspace(id),
  record jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, storage_key)
);

CREATE TABLE IF NOT EXISTS flyway_audit (
  seq bigint NOT NULL,
  event_id uuid NOT NULL,
  workspace_id uuid NOT NULL REFERENCES flyway_workspace(id),
  event jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY (workspace_id, seq),
  UNIQUE (event_id)
);

CREATE TABLE IF NOT EXISTS flyway_artifact (
  checksum char(64) NOT NULL,
  workspace_id uuid NOT NULL REFERENCES flyway_workspace(id),
  kind text NOT NULL CHECK (kind IN ('inputs', 'outputs', 'evidence')),
  content jsonb NOT NULL,
  byte_length bigint NOT NULL CHECK (byte_length >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, checksum)
);

CREATE TABLE IF NOT EXISTS flyway_platform_metrics (
  workspace_id uuid PRIMARY KEY REFERENCES flyway_workspace(id),
  metrics jsonb NOT NULL
);

ALTER TABLE flyway_workspace ENABLE ROW LEVEL SECURITY;
ALTER TABLE flyway_run ENABLE ROW LEVEL SECURITY;
ALTER TABLE flyway_idempotency ENABLE ROW LEVEL SECURITY;
ALTER TABLE flyway_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE flyway_artifact ENABLE ROW LEVEL SECURITY;
ALTER TABLE flyway_platform_metrics ENABLE ROW LEVEL SECURITY;

ALTER TABLE flyway_workspace FORCE ROW LEVEL SECURITY;
ALTER TABLE flyway_run FORCE ROW LEVEL SECURITY;
ALTER TABLE flyway_idempotency FORCE ROW LEVEL SECURITY;
ALTER TABLE flyway_audit FORCE ROW LEVEL SECURITY;
ALTER TABLE flyway_artifact FORCE ROW LEVEL SECURITY;
ALTER TABLE flyway_platform_metrics FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS flyway_workspace_isolation ON flyway_workspace;
CREATE POLICY flyway_workspace_isolation ON flyway_workspace
  USING (id::text = current_setting('flyway.workspace_id', true))
  WITH CHECK (id::text = current_setting('flyway.workspace_id', true));

DROP POLICY IF EXISTS flyway_run_isolation ON flyway_run;
CREATE POLICY flyway_run_isolation ON flyway_run
  USING (workspace_id::text = current_setting('flyway.workspace_id', true))
  WITH CHECK (workspace_id::text = current_setting('flyway.workspace_id', true));

DROP POLICY IF EXISTS flyway_idempotency_isolation ON flyway_idempotency;
CREATE POLICY flyway_idempotency_isolation ON flyway_idempotency
  USING (workspace_id::text = current_setting('flyway.workspace_id', true))
  WITH CHECK (workspace_id::text = current_setting('flyway.workspace_id', true));

DROP POLICY IF EXISTS flyway_audit_isolation ON flyway_audit;
CREATE POLICY flyway_audit_isolation ON flyway_audit
  USING (workspace_id::text = current_setting('flyway.workspace_id', true))
  WITH CHECK (workspace_id::text = current_setting('flyway.workspace_id', true));

DROP POLICY IF EXISTS flyway_artifact_isolation ON flyway_artifact;
CREATE POLICY flyway_artifact_isolation ON flyway_artifact
  USING (workspace_id::text = current_setting('flyway.workspace_id', true))
  WITH CHECK (workspace_id::text = current_setting('flyway.workspace_id', true));

DROP POLICY IF EXISTS flyway_metrics_isolation ON flyway_platform_metrics;
CREATE POLICY flyway_metrics_isolation ON flyway_platform_metrics
  USING (workspace_id::text = current_setting('flyway.workspace_id', true))
  WITH CHECK (workspace_id::text = current_setting('flyway.workspace_id', true));

COMMIT;
