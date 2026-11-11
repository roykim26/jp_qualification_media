-- P0-1 FE: eligibility, passing standard and IRT scoring live outside the
-- pages registered so far.  The CBT operator publishes the first two on its
-- own portal; IPA publishes the scoring rule only inside the 試験要綱 PDF.
INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:fundamental-it:cbt-s', 'institution:ipa', 'https://www.cbt-s.com/examinee/examination/fe', 'www.cbt-s.com', 'official_cbt_operator', true),
  ('source:fundamental-it:youkou-pdf', 'institution:ipa', 'https://www.ipa.go.jp/shiken/syllabus/rcu1hd00000141gq-att/youkou_ver5_6.pdf', 'www.ipa.go.jp', 'official_exam_outline_pdf', true)
ON CONFLICT (id) DO NOTHING;
