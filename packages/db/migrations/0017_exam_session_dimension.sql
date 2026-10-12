-- The unified 日商簿記 exam runs several 回 within one calendar year (173回 on
-- 2026.06.14 and 172回 on 2026.02.22 both belong to 2026). The current identity
-- stops at exam_year, so per-session history candidates collide on that key and
-- are silently dropped. Keep the session in candidate and public-fact identity.
--
-- exam_session stays nullable and is added to the indexes as a plain column:
-- both indexes already rely on PostgreSQL NULLS DISTINCT semantics for the other
-- nullable dimensions, and candidate re-runs are deduplicated by the
-- deterministic candidate_facts.id, not by these indexes.
ALTER TABLE candidate_facts ADD COLUMN IF NOT EXISTS exam_session text;
ALTER TABLE facts ADD COLUMN IF NOT EXISTS exam_session text;

DROP INDEX IF EXISTS candidate_idempotency_idx;
CREATE UNIQUE INDEX candidate_idempotency_idx ON candidate_facts
  (source_snapshot_id, qualification_id, provider_id, exam_level_id,
   exam_component, delivery_mode, payment_method, exam_session, exam_year, fact_key);

DROP INDEX IF EXISTS facts_current_key_idx;
CREATE UNIQUE INDEX facts_current_key_idx ON facts
  (qualification_id, provider_id, exam_level_id, exam_component, delivery_mode,
   payment_method, exam_session, exam_year, fact_key);
