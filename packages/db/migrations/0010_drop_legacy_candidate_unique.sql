ALTER TABLE candidate_facts
  DROP CONSTRAINT IF EXISTS candidate_facts_source_snapshot_id_qualification_id_exam_le_key;

CREATE UNIQUE INDEX IF NOT EXISTS candidate_idempotency_idx ON candidate_facts
  (source_snapshot_id, qualification_id, provider_id, exam_level_id, exam_component, delivery_mode, exam_year, fact_key);
