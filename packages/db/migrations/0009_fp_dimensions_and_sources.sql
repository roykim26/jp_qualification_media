ALTER TABLE candidate_facts ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE candidate_facts ADD COLUMN IF NOT EXISTS exam_component text;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS provider_id text;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS exam_component text;

DROP INDEX IF EXISTS candidate_idempotency_idx;
CREATE UNIQUE INDEX candidate_idempotency_idx ON candidate_facts
  (source_snapshot_id, qualification_id, provider_id, exam_level_id, exam_component, delivery_mode, exam_year, fact_key);

DROP INDEX IF EXISTS facts_current_key_idx;
CREATE UNIQUE INDEX facts_current_key_idx ON facts
  (qualification_id, provider_id, exam_level_id, exam_component, delivery_mode, exam_year, fact_key);

INSERT INTO institutions (id, name_ja, official)
VALUES
  ('institution:jafp', '特定非営利活動法人日本ファイナンシャル・プランナーズ協会', true),
  ('institution:kinzai', '一般社団法人金融財政事情研究会', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:fp:jafp-home', 'institution:jafp', 'https://www.jafp.or.jp/exam/', 'www.jafp.or.jp', 'official_exam_information', true),
  ('source:fp:jafp-2-3-outline', 'institution:jafp', 'https://www.jafp.or.jp/exam/outline/', 'www.jafp.or.jp', 'official_cbt_exam_outline', true),
  ('source:fp:jafp-1-outline', 'institution:jafp', 'https://www.jafp.or.jp/exam/outline/1fp/index.shtml', 'www.jafp.or.jp', 'official_level_exam_outline', true),
  ('source:fp:kinzai-home', 'institution:kinzai', 'https://www.kinzai.or.jp/ginou/fp/', 'www.kinzai.or.jp', 'official_exam_information', true),
  ('source:fp:kinzai-1-academic', 'institution:kinzai', 'https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html', 'www.kinzai.or.jp', 'official_academic_exam_outline', true),
  ('source:fp:kinzai-1-practical', 'institution:kinzai', 'https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html', 'www.kinzai.or.jp', 'official_practical_exam_outline', true),
  ('source:fp:kinzai-2', 'institution:kinzai', 'https://www.kinzai.or.jp/ginou/fp/2kyu/index.html', 'www.kinzai.or.jp', 'official_cbt_exam_outline', true),
  ('source:fp:kinzai-3', 'institution:kinzai', 'https://www.kinzai.or.jp/ginou/fp/3kyu/index.html', 'www.kinzai.or.jp', 'official_cbt_exam_outline', true),
  ('source:fp:kinzai-eligibility', 'institution:kinzai', 'https://www.kinzai.or.jp/ginou/fp/sikaku.html', 'www.kinzai.or.jp', 'official_eligibility', true)
ON CONFLICT (id) DO NOTHING;
