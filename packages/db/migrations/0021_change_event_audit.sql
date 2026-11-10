-- P0-3: audit fields for manual rollbacks.
--
-- Rolling back an approved fact is an operational act, so the change event it
-- writes has to name who did it and why.  Both stay NULL for the automatic
-- events written by the approval path, and `scripts/rollback-fact.mjs` refuses
-- to run without them.
ALTER TABLE change_events ADD COLUMN IF NOT EXISTS operator_id text;
ALTER TABLE change_events ADD COLUMN IF NOT EXISTS reason text;
