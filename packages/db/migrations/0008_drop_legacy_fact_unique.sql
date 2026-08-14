ALTER TABLE facts
  DROP CONSTRAINT IF EXISTS facts_qualification_id_exam_level_id_exam_year_fact_key_key;

CREATE UNIQUE INDEX IF NOT EXISTS facts_current_key_idx ON facts
  (qualification_id, exam_level_id, delivery_mode, exam_year, fact_key);
