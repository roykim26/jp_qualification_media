INSERT INTO institutions (id, name_ja, official)
VALUES ('institution:ipa', '独立行政法人情報処理推進機構', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:it-passport:ipa-exam', 'institution:ipa', 'https://www.ipa.go.jp/shiken/', 'www.ipa.go.jp', 'official_exam_information', true),
  ('source:it-passport:jitec-home', 'institution:ipa', 'https://www3.jitec.ipa.go.jp/JitesCbt/', 'www3.jitec.ipa.go.jp', 'official_cbt_entry', true),
  ('source:it-passport:jitec-application', 'institution:ipa', 'https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html', 'www3.jitec.ipa.go.jp', 'official_cbt_application', true)
ON CONFLICT (id) DO NOTHING;
