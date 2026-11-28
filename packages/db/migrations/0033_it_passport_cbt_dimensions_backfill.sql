-- IT Passport facts were approved before the CBT delivery_mode dimension was
-- decided. The coverage contract matches the CBT requirements on delivery_mode,
-- so the untagged rows read as missing even though the approved facts exist.
-- Backfill both the candidate identity and the current fact row; the NULL guard
-- keeps a re-run a no-op. IT Passport is delivered as CBT (see the registered
-- ipa-exam-detail source, fact exam_method = CBT).
UPDATE candidate_facts
SET delivery_mode = 'cbt'
WHERE qualification_id = 'qualification:it-passport'
  AND synthetic = false
  AND status = 'approved'
  AND exam_year = 2026
  AND delivery_mode IS NULL;

UPDATE facts f
SET delivery_mode = c.delivery_mode
FROM fact_revisions fr
JOIN candidate_facts c ON c.id = fr.candidate_fact_id
WHERE f.current_revision_id = fr.id
  AND f.qualification_id = 'qualification:it-passport'
  AND f.status = 'approved'
  AND c.exam_year = 2026
  AND f.delivery_mode IS NULL;
