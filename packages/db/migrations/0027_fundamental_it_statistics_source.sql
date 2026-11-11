-- P1-1 ops findings (2026-11-11, owner-approved): statistics-fe has been in
-- FUNDAMENTAL_IT_SOURCES and patrolled since work package F, but was never
-- registered here, so every patrol record skipped it (skipped_unregistered).
-- The page is IPA's FE statistics index: an attachment directory (PDF/Excel,
-- latest 202609_fe_toukei.pdf) with zero in-page tables.  No extractor reads
-- it; registration only lets patrol checks and snapshots associate with a
-- source row, mirroring the evidence-only statistics registrations in 0018.
-- FE pass_rate facts remain future work (attachment parsing, checklist item
-- 五资格最小合格率内容).  qualification_id is bound by seed.ts, not here.
INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:fundamental-it:statistics-fe', 'institution:ipa', 'https://www.ipa.go.jp/shiken/reports/toukei_fe.html', 'www.ipa.go.jp', 'official_statistics', true)
ON CONFLICT (id) DO NOTHING;