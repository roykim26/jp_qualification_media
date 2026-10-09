INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:bookkeeping:class1', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/class1', 'www.kentei.ne.jp', 'official_level_information', true),
  ('source:bookkeeping:class2', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/class2', 'www.kentei.ne.jp', 'official_level_information', true),
  ('source:bookkeeping:class3', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/class3', 'www.kentei.ne.jp', 'official_level_information', true),
  ('source:bookkeeping:class3-exam', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/class3/exam', 'www.kentei.ne.jp', 'official_level_exam_information', true),
  ('source:bookkeeping:flow', 'institution:jcci', 'https://www.kentei.ne.jp/flow', 'www.kentei.ne.jp', 'official_application_flow', true),
  ('source:bookkeeping:flow-teller', 'institution:jcci', 'https://www.kentei.ne.jp/flow/teller', 'www.kentei.ne.jp', 'official_application_flow', true),
  ('source:bookkeeping:flow-net', 'institution:jcci', 'https://www.kentei.ne.jp/flow/net', 'www.kentei.ne.jp', 'official_application_flow', true),
  ('source:bookkeeping:report', 'institution:jcci', 'https://www.kentei.ne.jp/report', 'www.kentei.ne.jp', 'official_exam_notice', true),
  ('source:bookkeeping:qa', 'institution:jcci', 'https://www.kentei.ne.jp/qa', 'www.kentei.ne.jp', 'official_faq', true),
  ('source:bookkeeping:news-51504', 'institution:jcci', 'https://www.kentei.ne.jp/51504', 'www.kentei.ne.jp', 'official_announcement', true)
ON CONFLICT (id) DO NOTHING;
