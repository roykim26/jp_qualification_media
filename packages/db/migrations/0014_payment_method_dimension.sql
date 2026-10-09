-- A payment deadline can differ by payment channel while every exam dimension
-- remains identical. Keep that channel in candidate and public-fact identity.
ALTER TABLE candidate_facts ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS payment_method text;
ALTER TABLE source_scopes ADD COLUMN IF NOT EXISTS payment_method text;

DROP INDEX IF EXISTS candidate_idempotency_idx;
CREATE UNIQUE INDEX candidate_idempotency_idx ON candidate_facts
  (source_snapshot_id, qualification_id, provider_id, exam_level_id,
   exam_component, delivery_mode, payment_method, exam_year, fact_key);

DROP INDEX IF EXISTS facts_current_key_idx;
CREATE UNIQUE INDEX facts_current_key_idx ON facts
  (qualification_id, provider_id, exam_level_id, exam_component, delivery_mode,
   payment_method, exam_year, fact_key);

DROP INDEX IF EXISTS source_scopes_unique_dimensions_idx;
CREATE UNIQUE INDEX source_scopes_unique_dimensions_idx ON source_scopes
  (source_id, qualification_id, (COALESCE(provider_id, '')),
   (COALESCE(exam_level_id, '')), (COALESCE(exam_component, '')),
   (COALESCE(delivery_mode, '')), (COALESCE(payment_method, '')));
