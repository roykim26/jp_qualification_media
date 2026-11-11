-- Work package I (2026-11-12, owner-approved D1/D2/D4 + revised D3): the kinzai
-- FP site moved from www.kinzai.or.jp/ginou/fp/ to products.kinzai.or.jp/exam-fp/.
-- Every old URL 301s to the new domain, which the per-source allowlist correctly
-- refused (patrol run patrol-20261111T105619Z: 9 kinzai sources failed).  The new
-- paths were verified live and their content re-read offline; the four fact-bearing
-- adapters were rewritten in the same batch so the URL change cannot silently
-- misparse (the migrated 1級学科 page moved row labels td->th).
--
-- D3 revision: the official site merged the annual schedule page (48581.html) and
-- the schedule index (nittei-fp) into ONE new URL /exam-fp/schedule/.  The stage-0022
-- guard UNIQUE(canonical_url, qualification_id) forbids two FP sources sharing that
-- URL (the ipa-fee dual registration is cross-qualification, so it does not apply).
-- source:fp:kinzai-schedule carries 0 facts / 0 snapshots / 0 candidate_facts (only
-- one patrol source_checks row); all 10 approved schedule facts hang on
-- source:fp:kinzai-schedule-2026.  Owner chose to retire the empty registration:
-- delete its source_checks row then its sources row, and migrate schedule-2026 to
-- the new URL so the provenance chain is preserved.  sources count 52 -> 51.
--
-- Registration only: no fact, snapshot, candidate or baseline row is touched.
-- canonical_url guards keep the UPDATEs idempotent; the DELETEs match zero rows on
-- re-run.  allowed_domain follows the new host for all seven surviving sources.
UPDATE sources
SET canonical_url = 'https://products.kinzai.or.jp/exam-fp/', allowed_domain = 'products.kinzai.or.jp'
WHERE id = 'source:fp:kinzai-home'
  AND canonical_url = 'https://www.kinzai.or.jp/ginou/fp/';

UPDATE sources
SET canonical_url = 'https://products.kinzai.or.jp/exam-fp/1kyu-gakka/', allowed_domain = 'products.kinzai.or.jp'
WHERE id = 'source:fp:kinzai-1-academic'
  AND canonical_url = 'https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html';

UPDATE sources
SET canonical_url = 'https://products.kinzai.or.jp/exam-fp/1kyu-jitsugi/', allowed_domain = 'products.kinzai.or.jp'
WHERE id = 'source:fp:kinzai-1-practical'
  AND canonical_url = 'https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html';

UPDATE sources
SET canonical_url = 'https://products.kinzai.or.jp/exam-fp/2kyu/', allowed_domain = 'products.kinzai.or.jp'
WHERE id = 'source:fp:kinzai-2'
  AND canonical_url = 'https://www.kinzai.or.jp/ginou/fp/2kyu/index.html';

UPDATE sources
SET canonical_url = 'https://products.kinzai.or.jp/exam-fp/3kyu/', allowed_domain = 'products.kinzai.or.jp'
WHERE id = 'source:fp:kinzai-3'
  AND canonical_url = 'https://www.kinzai.or.jp/ginou/fp/3kyu/index.html';

UPDATE sources
SET canonical_url = 'https://products.kinzai.or.jp/exam-fp/eligibility/', allowed_domain = 'products.kinzai.or.jp'
WHERE id = 'source:fp:kinzai-eligibility'
  AND canonical_url = 'https://www.kinzai.or.jp/ginou/fp/sikaku.html';

UPDATE sources
SET canonical_url = 'https://products.kinzai.or.jp/exam-fp/schedule/', allowed_domain = 'products.kinzai.or.jp'
WHERE id = 'source:fp:kinzai-schedule-2026'
  AND canonical_url = 'https://www.kinzai.or.jp/fp/nittei-fp/48581.html';

-- Retire the redundant evidence-only schedule index (FK-safe: source_checks first).
DELETE FROM source_checks
WHERE source_id = 'source:fp:kinzai-schedule';

DELETE FROM sources
WHERE id = 'source:fp:kinzai-schedule'
  AND canonical_url = 'https://www.kinzai.or.jp/ginou/fp/nittei-fp';