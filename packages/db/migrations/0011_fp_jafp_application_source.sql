INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:fp:jafp-2-3-application', 'institution:jafp', 'https://www.jafp.or.jp/exam/app/3fp.shtml', 'www.jafp.or.jp', 'official_cbt_application', true)
ON CONFLICT (id) DO NOTHING;
