import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { Client } from 'pg';
import baseline from '../config/release-gate-baseline.json' with { type: 'json' };
import sourceOps from '../config/source-ops.json' with { type: 'json' };
import { STALENESS_QUERY, computeStaleness } from './staleness-lib.mjs';
import {
  buildDailyReport,
  buildFactsVsBaseline,
  buildSourceHealth,
  computeCoverageGap,
  groupChecksBySource,
  renderMarkdown,
} from './ops-daily-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.log(
    JSON.stringify(
      {
        status: 'not_run',
        reason: 'DATABASE_URL is required for the read-only daily report',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const now = new Date();
const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});

await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const sources = await client.query(`
    SELECT s.id, s.canonical_url, q.slug AS qualification
    FROM sources s
    LEFT JOIN qualifications q ON q.id=s.qualification_id
    ORDER BY s.id
  `);
  const checks = await client.query(`
    SELECT source_id, checked_at, status, http_status
    FROM source_checks
    ORDER BY source_id, checked_at DESC, id DESC
  `);
  const stalenessRows = await client.query(STALENESS_QUERY);
  const pending = await client.query(`
    SELECT q.slug, count(*)::int AS pending
    FROM candidate_facts c
    JOIN qualifications q ON q.id=c.qualification_id
    WHERE c.status='pending_review' AND c.synthetic=false
    GROUP BY q.slug
    ORDER BY q.slug
  `);
  const approved = await client.query(`
    SELECT q.slug, count(*)::int AS approved
    FROM facts f
    JOIN fact_revisions fr ON fr.id=f.current_revision_id
    JOIN candidate_facts c ON c.id=fr.candidate_fact_id
    JOIN qualifications q ON q.id=f.qualification_id
    WHERE f.status='approved' AND fr.status='approved'
      AND c.status='approved' AND c.synthetic=false
    GROUP BY q.slug
    ORDER BY q.slug
  `);
  await client.query('COMMIT');

  const registryPath = path.resolve('var/patrol/registry.json');
  let coverageGap;
  if (existsSync(registryPath)) {
    const registry = JSON.parse(readFileSync(registryPath, 'utf8'));
    coverageGap = computeCoverageGap(
      sources.rows.map((row) => row.id),
      Object.keys(registry),
    );
  } else {
    coverageGap = {
      status: 'not_run',
      reason: 'var/patrol/registry.json missing; run patrol once first',
    };
  }

  const report = buildDailyReport({
    now,
    config: sourceOps,
    sourceHealth: buildSourceHealth(
      sources.rows,
      groupChecksBySource(checks.rows),
      now,
      sourceOps,
    ),
    staleness: computeStaleness(stalenessRows.rows, now),
    pendingReview: pending.rows,
    factsVsBaseline: buildFactsVsBaseline(approved.rows, baseline),
    coverageGap,
  });

  const jstDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const outputDir = path.resolve('var/ops-reports');
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, `${jstDate}.json`),
    JSON.stringify(report, null, 2) + '\n',
    'utf8',
  );
  writeFileSync(
    path.join(outputDir, `${jstDate}.md`),
    renderMarkdown(report),
    'utf8',
  );

  console.log(JSON.stringify(report, null, 2));
  if (report.hasCritical) process.exitCode = 1;
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
