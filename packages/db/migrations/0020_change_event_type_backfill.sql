-- Work package G-2 full option, part 2: backfill change_events so the stored event_type
-- matches updateEventTypeForFact() in packages/schema/src/updates.ts.  The 983 rows that
-- exist today were written by the pre-round-11 mapping, which put every non-date fact into
-- schedule_change, so this is a reclassification rather than a rename: 921 rows change value
-- and 62 already agree.
--
-- The CASE mirrors updateEventTypeForFact() branch for branch, in the same order, so a row
-- can only land in one bucket.  Read-only precheck (var/r13-matrix.mjs, 2026-10-13) predicted
-- the post-backfill distribution as:
--   statistics_update 807 / system_change 88 / schedule_change 24 / application_deadline 17 /
--   fee_change 15 / eligibility_change 11 / application_open 11 / result_date 8 / exam_date 2
-- totalling 983, and services/api/src/release.ts keeps writing rollback rows as
-- schedule_change because that insert hardcodes the value.
--
-- LIKE uses backslash as its default escape character, so '\_' stays a literal underscore and
-- the prefix tests match the JavaScript startsWith() rules exactly.
UPDATE change_events ce
   SET event_type = (
       CASE
         WHEN f.fact_key LIKE '%deadline%' THEN 'application_deadline'
         WHEN f.fact_key LIKE '%application\_open%' OR f.fact_key LIKE '%application\_start%'
           THEN 'application_open'
         WHEN f.fact_key = 'exam_date' THEN 'exam_date'
         WHEN f.fact_key = 'result_date' THEN 'result_date'
         WHEN f.fact_key LIKE 'fee%' OR f.fact_key LIKE 'payment\_%' THEN 'fee_change'
         WHEN f.fact_key LIKE 'eligibility%' THEN 'eligibility_change'
         WHEN f.fact_key IN ('applicants', 'examinees', 'passed', 'pass_rate', 'statistics_methodology')
           THEN 'statistics_update'
         WHEN f.fact_key LIKE 'application\_method%'
           OR f.fact_key LIKE 'application\_rule%'
           OR f.fact_key LIKE 'exam\_content%'
           OR f.fact_key LIKE 'exam\_method%'
           OR f.fact_key LIKE 'exam\_subject%'
           OR f.fact_key LIKE 'exam\_time%'
           OR f.fact_key LIKE 'interview\_count%'
           OR f.fact_key LIKE 'passing\_standard%'
           OR f.fact_key LIKE 'practical\_subject%'
           OR f.fact_key LIKE 'question\_count%'
           OR f.fact_key LIKE 'question\_format%'
           OR f.fact_key LIKE 'scoring\_method%'
           THEN 'system_change'
         ELSE 'schedule_change'
       END
     )::event_type
  FROM facts f
 WHERE f.id = ce.fact_id;
