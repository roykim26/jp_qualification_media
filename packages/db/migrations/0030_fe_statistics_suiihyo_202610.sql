-- Sprint 2A (2026-11-24): the FE 推移表 attachment behind the statistics index
-- rolled from 202609 to 202610.  The registered 202609 file now returns 404
-- (verified live 2026-11-24: status "not_found", "source returned 404"), so this
-- is a real URL-drift event, not a scheduled rename.
--
-- The new attachment was captured and parsed before this migration was written:
--   url    https://www.ipa.go.jp/shiken/reports/ps6vr70000016ew6-att/202610_fe_01_suiihyo.xlsx
--   sha256 08add2120f62780993619a8b51a97bef8b2153c54a7af7308938609b8fc66082
--   bytes  18062
--   header …推移表(令和8年11月20日現在)   (was 令和8年10月21日現在)
--   rows   identical structure; the three complete fiscal years (令和5/6/7年度)
--          carry byte-identical values, so no approved fact changes.  Only the
--          in-progress 令和8年度 row (7/12 months, still incomplete → no facts)
--          and the 累計 row (skipped) moved.
-- The statistics index page (source:fundamental-it:statistics-fe) also changed
-- bytes: 最終更新日 2026年10月21日 → 2026年11月20日 and the attachment links
-- rolled.  Its two methodology sentences did not change, so the
-- statistics_methodology fact keeps its wording but gets a new snapshot hash.
--
-- Registration only: no fact, revision, snapshot or baseline rows are touched
-- by this migration.  The canonical_url guard keeps the statement idempotent.
UPDATE sources
SET canonical_url = 'https://www.ipa.go.jp/shiken/reports/ps6vr70000016ew6-att/202610_fe_01_suiihyo.xlsx'
WHERE id = 'source:fundamental-it:statistics-fe-suiihyo'
  AND canonical_url = 'https://www.ipa.go.jp/shiken/reports/ps6vr70000016ew6-att/202609_fe_01_suiihyo.xlsx';
