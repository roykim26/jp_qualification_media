-- A due fact can be re-checked against the current official page without any
-- value change.  The old chain only recorded value changes via new candidates,
-- so "still correct, verified today" had nowhere to land and the staleness
-- report could never clear.  A re-verification appends an approved revision that
-- reuses the current candidate (same value, same evidence) and records who
-- confirmed it and why.
ALTER TABLE fact_revisions ADD COLUMN IF NOT EXISTS verified_by text;
ALTER TABLE fact_revisions ADD COLUMN IF NOT EXISTS verification_note text;

COMMENT ON COLUMN fact_revisions.verified_by IS
  'Reviewer who confirmed this revision during a no-change re-verification; NULL for ordinary approvals, whose provenance is the candidate review trail.';
COMMENT ON COLUMN fact_revisions.verification_note IS
  'Why the reviewer re-confirmed the unchanged value; only set on re-verification revisions.';
