-- A rejected, evidence-backed replacement may require an unsafe CI-backed
-- current fact to be withdrawn. Preserve both sides of that decision.
CREATE TABLE IF NOT EXISTS fact_retractions (
  id text PRIMARY KEY,
  fact_id text NOT NULL REFERENCES facts(id),
  rejected_candidate_id text NOT NULL REFERENCES candidate_facts(id),
  reviewer_id text NOT NULL,
  reason text NOT NULL,
  retracted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fact_id),
  UNIQUE (rejected_candidate_id)
);

COMMENT ON TABLE fact_retractions IS
  'Audited withdrawal of an approved current fact following a rejected replacement candidate; does not delete historical revisions.';
