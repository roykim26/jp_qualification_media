ALTER TABLE candidate_facts ADD COLUMN IF NOT EXISTS delivery_mode text;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS delivery_mode text;

DROP INDEX IF EXISTS candidate_idempotency_idx;
CREATE UNIQUE INDEX candidate_idempotency_idx ON candidate_facts
  (source_snapshot_id, qualification_id, exam_level_id, delivery_mode, exam_year, fact_key);

DROP INDEX IF EXISTS facts_current_key_idx;
CREATE UNIQUE INDEX facts_current_key_idx ON facts
  (qualification_id, exam_level_id, delivery_mode, exam_year, fact_key);
