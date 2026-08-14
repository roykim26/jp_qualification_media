INSERT INTO institutions (id, name_ja, official)
VALUES ('institution:jcci', '日本商工会議所', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:bookkeeping:home', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping', 'www.kentei.ne.jp', 'official_exam_information', true),
  ('source:bookkeeping:network', 'institution:jcci', 'https://www.kentei.ne.jp/33013', 'www.kentei.ne.jp', 'official_network_exam_information', true),
  ('source:bookkeeping:calendar-2026', 'institution:jcci', 'https://www.kentei.ne.jp/calendar_2026', 'www.kentei.ne.jp', 'official_exam_calendar', true),
  ('source:bookkeeping:class1-exam', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/class1/exam', 'www.kentei.ne.jp', 'official_level_exam_information', true),
  ('source:bookkeeping:class2-exam', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/class2/exam', 'www.kentei.ne.jp', 'official_level_exam_information', true)
ON CONFLICT (id) DO NOTHING;
