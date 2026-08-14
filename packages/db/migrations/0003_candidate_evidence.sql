ALTER TABLE candidate_facts
ADD COLUMN IF NOT EXISTS evidence_text text;
