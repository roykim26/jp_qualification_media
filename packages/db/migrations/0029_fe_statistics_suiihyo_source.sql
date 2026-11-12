-- Work package J stage 2 (2026-11-12, owner decisions D1=A / D2=fiscal start
-- year / D3=令和7年度 / D5=methodology same batch): register the FE 推移表 xlsx
-- attachment behind the statistics index as an official_statistics source.
-- Stage 1 captured the real bytes (202609_fe_01_suiihyo.xlsx, sha256
-- 2063cd07c857678b…) and verified the printed 年度合計 pass-rate column plus
-- the footer denominator formula 合格率（合格者数／受験者数：％）.
-- The attachment file name rolls monthly; a rolled name is a URL-drift event
-- handled like 0026 for bookkeeping.  The 統計資料 PDF stays unregistered
-- (route B rejected: AES-encrypted, flattened text).  qualification_id is
-- bound by seed.ts, not here.  No facts are written by this migration.
INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:fundamental-it:statistics-fe-suiihyo', 'institution:ipa', 'https://www.ipa.go.jp/shiken/reports/ps6vr70000016ew6-att/202609_fe_01_suiihyo.xlsx', 'www.ipa.go.jp', 'official_statistics', true)
ON CONFLICT (id) DO NOTHING;