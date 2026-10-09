import process from 'node:process';
import { Client } from 'pg';
import { summarizeProvenanceAudit } from './provenance-audit-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    JSON.stringify(
      {
        status: 'not_run',
        reason: 'DATABASE_URL is required for read-only audit',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`
    SELECT
      f.id AS fact_id,
      q.slug AS qualification_slug,
      c.source_id,
      c.source_snapshot_id,
      s.id AS snapshot_id,
      s.source_id AS snapshot_source_id,
      s.synthetic AS snapshot_synthetic,
      s.content_hash,
      s.object_key,
      src.canonical_url,
      src.allowed_domain,
      latest_review.decision AS latest_review_decision,
      latest_review.created_at AS latest_review_at
    FROM facts f
    JOIN fact_revisions fr ON fr.id=f.current_revision_id
    JOIN candidate_facts c ON c.id=fr.candidate_fact_id
    JOIN qualifications q ON q.id=f.qualification_id
    LEFT JOIN snapshots s ON s.id=c.source_snapshot_id
    JOIN sources src ON src.id=c.source_id
    LEFT JOIN LATERAL (
      SELECT decision, created_at
      FROM reviews r
      WHERE r.candidate_fact_id=c.id
      ORDER BY r.created_at DESC, r.id DESC
      LIMIT 1
    ) latest_review ON true
    WHERE f.status='approved'
      AND fr.status='approved'
      AND c.status='approved'
      AND c.synthetic=false
    ORDER BY q.slug, f.id
  `);
  await client.query('COMMIT');
  const report = summarizeProvenanceAudit(result.rows);
  const blockedByQualification = {};
  for (const fact of report.facts) {
    if (!fact.issues.length) continue;
    blockedByQualification[fact.qualificationSlug] =
      (blockedByQualification[fact.qualificationSlug] ?? 0) + 1;
  }
  const { facts, ...summary } = report;
  console.log(
    JSON.stringify(
      {
        ...summary,
        blockedByQualification,
        ...(process.argv.includes('--verbose') ? { facts } : {}),
      },
      null,
      2,
    ),
  );
} finally {
  await client.end();
}
