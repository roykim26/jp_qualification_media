-- IT Passport scoring method is not stated on any registered HTML page; the
-- shared 情報処理技術者試験 試験要綱 Ver.5.6 PDF explicitly names the exam in
-- its IRT clause.  Register the per-qualification source so the PDF fact keeps
-- its own provenance (the same URL is already registered for 基本情報技術者).
-- No qualification_id here: migrations run before the seed creates
-- qualifications.  The seed binds every `source:<slug>:*` id to its slug, and
-- `source:it-passport:*` maps to `qualification:it-passport`.
INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES (
  'source:it-passport:youkou-pdf',
  'institution:ipa',
  'https://www.ipa.go.jp/shiken/syllabus/rcu1hd00000141gq-att/youkou_ver5_6.pdf',
  'www.ipa.go.jp',
  'official_exam_outline_pdf',
  true
)
ON CONFLICT (id) DO NOTHING;
