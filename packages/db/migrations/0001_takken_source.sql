INSERT INTO institutions (id, name_ja, official)
VALUES ('institution:retio', '不動産適正取引推進機構', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES ('source:takken:retio-exam', 'institution:retio', 'https://www.retio.or.jp/exam/', 'www.retio.or.jp', 'official_exam_entry', true)
ON CONFLICT (id) DO NOTHING;
