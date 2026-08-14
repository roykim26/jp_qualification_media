INSERT INTO institutions (id, name_ja, official)
VALUES ('institution:gyosei-shiken', '一般財団法人行政書士試験研究センター', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:gyoseishoshi:home', 'institution:gyosei-shiken', 'https://www.gyosei-shiken.or.jp/', 'www.gyosei-shiken.or.jp', 'official_exam_information', true),
  ('source:gyoseishoshi:abstract', 'institution:gyosei-shiken', 'https://www.gyosei-shiken.or.jp/doc/abstract/abstract.html', 'www.gyosei-shiken.or.jp', 'official_exam_overview', true),
  ('source:gyoseishoshi:guide', 'institution:gyosei-shiken', 'https://www.gyosei-shiken.or.jp/doc/guide/guide.html', 'www.gyosei-shiken.or.jp', 'official_exam_guide', true)
ON CONFLICT (id) DO NOTHING;
