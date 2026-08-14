INSERT INTO institutions (id, name_ja, official)
VALUES ('institution:ipa', '独立行政法人情報処理推進機構', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:fundamental-it:exam', 'institution:ipa', 'https://www.ipa.go.jp/shiken/kubun/fe.html', 'www.ipa.go.jp', 'official_exam_information', true),
  ('source:fundamental-it:cbt', 'institution:ipa', 'https://www.ipa.go.jp/shiken/mousikomi/cbt_sg_fe.html', 'www.ipa.go.jp', 'official_cbt_application', true),
  ('source:fundamental-it:syllabus', 'institution:ipa', 'https://www.ipa.go.jp/shiken/syllabus/index.html', 'www.ipa.go.jp', 'official_syllabus', true)
ON CONFLICT (id) DO NOTHING;
