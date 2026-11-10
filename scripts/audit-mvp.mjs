import process from 'node:process';
import { Client } from 'pg';
import { evaluateMvpCoverage, limitedLaunchScopes } from './mvp-coverage.mjs';
import {
  auditProvenanceRow,
  summarizeProvenanceAudit,
} from './provenance-audit-lib.mjs';

const args = process.argv.slice(2);
const yearArgument = args.find((arg) => arg.startsWith('--year='));
const examYear = yearArgument
  ? Number(yearArgument.slice('--year='.length))
  : Number(
      new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
      }).format(new Date()),
    );

if (
  args.some((arg) => arg !== yearArgument) ||
  args.length > 1 ||
  !Number.isInteger(examYear) ||
  examYear < 2000 ||
  examYear > 2100
) {
  console.error('Usage: node scripts/audit-mvp.mjs [--year=YYYY]');
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.log(
    JSON.stringify({ status: 'not_run', reason: 'DATABASE_URL is required' }),
  );
  process.exit(2);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`
    SELECT f.id AS fact_id, q.slug AS qualification_slug,
      c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode,
      c.payment_method, c.exam_year, c.fact_key,
      c.source_id, c.source_snapshot_id, s.id AS snapshot_id,
      src.canonical_url, src.allowed_domain,
      s.source_id AS snapshot_source_id, s.synthetic AS snapshot_synthetic,
      s.content_hash, s.object_key,
      latest_review.decision AS latest_review_decision,
      latest_review.created_at AS latest_review_at
    FROM facts f
    JOIN fact_revisions fr ON fr.id=f.current_revision_id
    JOIN candidate_facts c ON c.id=fr.candidate_fact_id
    JOIN qualifications q ON q.id=f.qualification_id
    LEFT JOIN snapshots s ON s.id=c.source_snapshot_id
    LEFT JOIN sources src ON src.id=c.source_id
    LEFT JOIN LATERAL (
      SELECT decision, created_at FROM reviews r
      WHERE r.candidate_fact_id=c.id
      ORDER BY r.created_at DESC, r.id DESC LIMIT 1
    ) latest_review ON true
    WHERE f.status='approved' AND fr.status='approved'
      AND c.status='approved' AND c.synthetic=false
    ORDER BY q.slug, c.exam_year, c.fact_key, f.id
  `);
  await client.query('COMMIT');
  const facts = result.rows.map((row) => {
    const verified = auditProvenanceRow(row).issues.length === 0;
    return {
      qualificationSlug: row.qualification_slug,
      providerId: row.provider_id,
      examLevelId: row.exam_level_id,
      examComponent: row.exam_component,
      deliveryMode: row.delivery_mode,
      paymentMethod: row.payment_method,
      examYear: row.exam_year,
      factKey: row.fact_key,
      sourceUrl: row.canonical_url,
      provenanceStatus: verified ? 'verified' : 'incomplete',
      officialVerifiedAt: verified ? row.latest_review_at : undefined,
    };
  });
  const coverageGaps = evaluateMvpCoverage(facts, examYear);
  const provenance = summarizeProvenanceAudit(result.rows);
  const status =
    coverageGaps.length === 0 && provenance.status === 'passed'
      ? 'passed'
      : 'blocked';
  console.log(
    JSON.stringify(
      {
        status,
        checkedAt: new Date().toISOString(),
        examYear,
        limitedLaunchScopes,
        summary: {
          approvedFacts: facts.length,
          coverageGaps: coverageGaps.length,
          unverifiedFacts: provenance.blockedFacts,
        },
        coverageGaps,
        provenance,
      },
      null,
      2,
    ),
  );
  process.exitCode = status === 'passed' ? 0 : 1;
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'error',
      reason: 'MVP audit could not read the database',
      code: error?.code ?? 'UNKNOWN',
    }),
  );
  process.exitCode = 2;
} finally {
  await client.end();
}
