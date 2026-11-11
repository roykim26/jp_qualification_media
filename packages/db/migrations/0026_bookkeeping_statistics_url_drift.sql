-- P1-1 ops findings (2026-11-11, owner-approved): the two per-level history
-- pages drifted.  The F-2 registration kept the legacy bookkeeping_contents
-- segment verbatim from the candidate-data snapshot; the site now 301s that
-- segment away, so patrol blocked both sources on final-URL path drift.
-- The drifted targets were verified live (HTTP 200, same allowlisted domain)
-- and their statistics tables are byte-identical to the approved F-2
-- snapshots (only the WordPress emoji script version differs), so this
-- changes registration only -- no fact, snapshot or baseline rows are touched.
-- The canonical_url guards keep the statements idempotent.
UPDATE sources
SET canonical_url = 'https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class2'
WHERE id = 'source:bookkeeping:candidate-data-class2'
  AND canonical_url = 'https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class2';

UPDATE sources
SET canonical_url = 'https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class3'
WHERE id = 'source:bookkeeping:candidate-data-class3'
  AND canonical_url = 'https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class3';