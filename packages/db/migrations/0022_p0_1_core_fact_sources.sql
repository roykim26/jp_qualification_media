-- P0-1 core facts: IT Passport fee / exam structure / eligibility, and the
-- 基本情報技術者試験 fee.  These snapshots already exist on disk and in the
-- capture reports, but snapshots.source_id and candidate_facts.source_id are
-- foreign keys to sources, so ingesting them aborts until the ids exist.
--
-- The IPA 受験手数料 page is shared by every 情報処理技術者試験.  It is registered
-- once per qualification so each fee fact keeps the provenance of the exam it
-- belongs to.  That requires relaxing the stage-0 UNIQUE(canonical_url), which
-- predates qualification-scoped sources (source ids and sources.qualification_id
-- are both per qualification today).  Uniqueness is kept for the realistic
-- failure mode: the same URL registered twice for the same qualification.
ALTER TABLE sources DROP CONSTRAINT IF EXISTS sources_canonical_url_key;

CREATE UNIQUE INDEX IF NOT EXISTS sources_canonical_url_qualification_idx
  ON sources (canonical_url, qualification_id)
  WHERE qualification_id IS NOT NULL;

INSERT INTO sources (id, institution_id, canonical_url, allowed_domain, source_type, active)
VALUES
  ('source:it-passport:ipa-fee', 'institution:ipa', 'https://www.ipa.go.jp/shiken/mousikomi/schedule.html', 'www.ipa.go.jp', 'official_exam_calendar', true),
  ('source:it-passport:ipa-exam-detail', 'institution:ipa', 'https://www.ipa.go.jp/shiken/kubun/ip.html', 'www.ipa.go.jp', 'official_exam_overview', true),
  ('source:it-passport:jitec-faq', 'institution:ipa', 'https://www3.jitec.ipa.go.jp/JitesCbt/html/reference/faq.html', 'www3.jitec.ipa.go.jp', 'official_faq', true),
  ('source:fundamental-it:ipa-fee', 'institution:ipa', 'https://www.ipa.go.jp/shiken/mousikomi/schedule.html', 'www.ipa.go.jp', 'official_exam_calendar', true)
ON CONFLICT (id) DO NOTHING;
