import process from 'node:process';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

const windowsDays = {
  fee: 90,
  eligibility: 180,
  annual: 365,
  sourceLink: 7,
};

const feeFactKeys = new Set(['fee', 'payment_method', 'payment_deadline_rule']);

const eligibilityFactKeys = new Set([
  'eligibility',
  'application_rule',
  'application_change_deadline_rule',
]);

const statisticsFactKeys = new Set([
  'pass_rate',
  'applicants',
  'examinees',
  'passed',
  'statistics_methodology',
]);

function factWindowDays(factKey) {
  if (feeFactKeys.has(factKey) || factKey.startsWith('fee_'))
    return { windowDays: windowsDays.fee, reason: 'fee' };
  if (eligibilityFactKeys.has(factKey) || factKey.startsWith('eligibility_'))
    return { windowDays: windowsDays.eligibility, reason: 'eligibility' };
  if (statisticsFactKeys.has(factKey) || factKey.startsWith('pass_rate_'))
    return { windowDays: windowsDays.annual, reason: 'statistics' };
  return { windowDays: windowsDays.annual, reason: 'annual' };
}

function ageInDays(timestamp, now) {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((now.getTime() - time) / 86_400_000);
}

function referenceYear(now) {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
    }).format(now),
  );
}

if (!databaseUrl) {
  console.log(
    JSON.stringify(
      {
        status: 'not_run',
        reason: 'DATABASE_URL is required for read-only staleness check',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const now = new Date();
const year = referenceYear(now);
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
      f.exam_year,
      f.fact_key,
      fr.display_value,
      fr.verified_at,
      q.slug AS qualification_slug,
      src.id AS source_id,
      src.canonical_url,
      latest_snapshot.retrieved_at AS last_snapshot_at
    FROM facts f
    JOIN fact_revisions fr ON fr.id=f.current_revision_id
    JOIN candidate_facts c ON c.id=fr.candidate_fact_id
    JOIN qualifications q ON q.id=f.qualification_id
    JOIN sources src ON src.id=c.source_id
    LEFT JOIN LATERAL (
      SELECT retrieved_at
      FROM snapshots s
      WHERE s.source_id=src.id
      ORDER BY retrieved_at DESC, id DESC
      LIMIT 1
    ) latest_snapshot ON true
    WHERE f.status='approved'
      AND fr.status='approved'
      AND c.status='approved'
      AND c.synthetic=false
    ORDER BY q.slug, f.exam_year DESC, f.fact_key
  `);
  await client.query('COMMIT');

  const dueFacts = [];
  const sources = new Map();
  let historicalSkipped = 0;

  for (const row of result.rows) {
    if (row.exam_year < year) {
      historicalSkipped += 1;
      continue;
    }
    const { windowDays, reason } = factWindowDays(row.fact_key);
    const ageDays = ageInDays(row.verified_at, now);
    if (ageDays !== null && ageDays > windowDays) {
      dueFacts.push({
        factId: row.fact_id,
        qualification: row.qualification_slug,
        examYear: row.exam_year,
        factKey: row.fact_key,
        displayValue: row.display_value,
        verifiedAt: row.verified_at,
        ageDays,
        windowDays,
        reason,
      });
    }
    const snapshotAge = ageInDays(row.last_snapshot_at, now);
    if (
      !sources.has(row.source_id) &&
      (snapshotAge === null || snapshotAge > windowsDays.sourceLink)
    ) {
      sources.set(row.source_id, {
        sourceId: row.source_id,
        canonicalUrl: row.canonical_url,
        lastSnapshotAt: row.last_snapshot_at,
        ageDays: snapshotAge,
      });
    }
  }

  dueFacts.sort((a, b) => b.ageDays / b.windowDays - a.ageDays / a.windowDays);

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        checkedAt: now.toISOString(),
        referenceYear: year,
        windowsDays,
        summary: {
          approvedFacts: result.rows.length,
          historicalSkipped,
          checked: result.rows.length - historicalSkipped,
          dueFacts: dueFacts.length,
          sourcesBehindOnSnapshot: sources.size,
        },
        dueFacts,
        dueSources: [...sources.values()].sort(
          (a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity),
        ),
      },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end();
}
