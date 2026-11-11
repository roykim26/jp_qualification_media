-- FE facts were approved before delivery_mode/exam_component were decided.
-- Backfill both the candidate identity and the current fact row; the coverage
-- gate matches CBT requirements on delivery_mode, and subject requirements on
-- exam_component.  Only FE 2026 non-synthetic approved rows are touched, and
-- the NULL guards keep a re-run a no-op.
UPDATE candidate_facts
SET delivery_mode = 'cbt',
    exam_component = CASE
      WHEN fact_key LIKE 'exam_subject_a_%' THEN 'subject-a'
      WHEN fact_key LIKE 'exam_subject_b_%' THEN 'subject-b'
      ELSE NULL
    END
WHERE qualification_id = 'qualification:fundamental-it-engineer'
  AND synthetic = false
  AND status = 'approved'
  AND exam_year = 2026
  AND delivery_mode IS NULL
  AND exam_component IS NULL;

UPDATE facts f
SET delivery_mode = c.delivery_mode,
    exam_component = c.exam_component
FROM fact_revisions fr
JOIN candidate_facts c ON c.id = fr.candidate_fact_id
WHERE f.current_revision_id = fr.id
  AND f.qualification_id = 'qualification:fundamental-it-engineer'
  AND f.status = 'approved'
  AND c.exam_year = 2026
  AND f.delivery_mode IS NULL
  AND f.exam_component IS NULL;
