-- FP＋簿記 2027 官方日程入库 (2026-11-25): register the 2027 annual exam
-- calendar as its own source.  The 2026 page stays registered because the
-- approved 2026 facts keep their provenance.  qualification_id is bound by
-- seed.ts, not here.  No facts are written by this migration.
INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:bookkeeping:calendar-2027', 'institution:jcci', 'https://www.kentei.ne.jp/calendar_2027', 'www.kentei.ne.jp', 'official_exam_calendar', true)
ON CONFLICT (id) DO NOTHING;