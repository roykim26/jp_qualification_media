INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:fp:jafp-schedule', 'institution:jafp', 'https://www.jafp.or.jp/exam/schedule/', 'www.jafp.or.jp', 'official_annual_schedule', true),
  ('source:fp:kinzai-schedule', 'institution:kinzai', 'https://www.kinzai.or.jp/ginou/fp/nittei-fp', 'www.kinzai.or.jp', 'official_annual_schedule_index', true),
  ('source:fp:kinzai-schedule-2026', 'institution:kinzai', 'https://www.kinzai.or.jp/fp/nittei-fp/48581.html', 'www.kinzai.or.jp', 'official_annual_schedule', true)
ON CONFLICT (id) DO NOTHING;
