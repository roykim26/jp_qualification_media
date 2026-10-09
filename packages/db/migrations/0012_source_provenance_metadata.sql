-- Work package G: operational provenance.  These tables describe our capture
-- and review process; they never create or alter candidate/fact values.

ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS qualification_id text REFERENCES qualifications(id),
  ADD COLUMN IF NOT EXISTS content_scope text,
  ADD COLUMN IF NOT EXISTS update_cycle text,
  ADD COLUMN IF NOT EXISTS parser_adapter text,
  ADD COLUMN IF NOT EXISTS default_risk risk_level,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS source_scopes (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES sources(id),
  qualification_id text NOT NULL REFERENCES qualifications(id),
  provider_id text,
  exam_level_id text,
  exam_component text,
  delivery_mode text,
  content_scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS source_scopes_unique_dimensions_idx
  ON source_scopes (
    source_id,
    qualification_id,
    (COALESCE(provider_id, '')),
    (COALESCE(exam_level_id, '')),
    (COALESCE(exam_component, '')),
    (COALESCE(delivery_mode, ''))
  );

CREATE TABLE IF NOT EXISTS capture_runs (
  id text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  finished_at timestamptz,
  status text NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  error_type text,
  error_message text,
  collector_version text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  CHECK (request_count >= 0)
);

ALTER TABLE snapshots
  ADD COLUMN IF NOT EXISTS capture_run_id text REFERENCES capture_runs(id),
  ADD COLUMN IF NOT EXISTS original_url text,
  ADD COLUMN IF NOT EXISTS final_url text,
  ADD COLUMN IF NOT EXISTS http_status integer,
  ADD COLUMN IF NOT EXISTS retrieved_at_jst timestamptz,
  ADD COLUMN IF NOT EXISTS title text,
  ADD COLUMN IF NOT EXISTS etag text,
  ADD COLUMN IF NOT EXISTS last_modified text,
  ADD COLUMN IF NOT EXISTS response_headers jsonb,
  ADD COLUMN IF NOT EXISTS text_version text,
  ADD COLUMN IF NOT EXISTS collector_version text;

CREATE TABLE IF NOT EXISTS source_checks (
  id text PRIMARY KEY,
  source_id text NOT NULL REFERENCES sources(id),
  capture_run_id text REFERENCES capture_runs(id),
  snapshot_id text REFERENCES snapshots(id),
  checked_at timestamptz NOT NULL,
  status text NOT NULL,
  http_status integer,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('unchanged', 'changed', 'failed', 'blocked'))
);

CREATE INDEX IF NOT EXISTS source_checks_latest_idx
  ON source_checks (source_id, checked_at DESC);

-- Explicitly document the provenance boundary in the database itself.  A
-- source check may record a new observation, but it must not manufacture a
-- fact revision or a public change event.
COMMENT ON TABLE source_checks IS
  'Operational source checks only; rows must not be used to create fact revisions or change events.';
COMMENT ON COLUMN snapshots.retrieved_at IS
  'Capture timestamp, not an official publication time or human approval time.';
