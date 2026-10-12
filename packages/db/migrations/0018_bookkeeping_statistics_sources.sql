-- Work package F-2 authorized capture only, so the seven statistics pages exist on
-- disk and in the collector constants but were never registered here.  snapshots.source_id
-- is a foreign key to sources, so ingesting the history series aborts on the first
-- snapshot row until these ids exist.
--
-- candidate-data (the recent-slice index page), -class4 (簿記初級／ retired 4級) and
-- -costing (原価計算初級) carry no ingestable mapping today: they are captured as
-- byte-stable evidence only.  Registering them keeps sources in sync with the
-- collector constants so a later evidence-only snapshot cannot hit the same foreign key.
INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:bookkeeping:candidate-data', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/candidate-data', 'www.kentei.ne.jp', 'official_statistics', true),
  ('source:bookkeeping:candidate-data-class1', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class1', 'www.kentei.ne.jp', 'official_statistics', true),
  ('source:bookkeeping:candidate-data-class2', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class2', 'www.kentei.ne.jp', 'official_statistics', true),
  ('source:bookkeeping:candidate-data-class3', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class3', 'www.kentei.ne.jp', 'official_statistics', true),
  ('source:bookkeeping:candidate-data-class23-net', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class2-3', 'www.kentei.ne.jp', 'official_statistics', true),
  ('source:bookkeeping:candidate-data-class4', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class4', 'www.kentei.ne.jp', 'official_statistics', true),
  ('source:bookkeeping:candidate-data-costing', 'institution:jcci', 'https://www.kentei.ne.jp/bookkeeping/candidate-data/ca-date', 'www.kentei.ne.jp', 'official_statistics', true)
ON CONFLICT (id) DO NOTHING;
