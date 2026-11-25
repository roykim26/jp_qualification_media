import process from 'node:process';
import { Client } from 'pg';
import {
  STALENESS_QUERY,
  computeStaleness,
  factDimensionFields,
  formatFactTarget,
  windowsDays,
} from './staleness-lib.mjs';
import { duplicatedTargets, shapeProblems } from './query-shape-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;

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
const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});

await client.connect();
try {
  await client.query('BEGIN READ ONLY');
  const result = await client.query(STALENESS_QUERY);
  await client.query('COMMIT');

  // Postgres answers a SELECT that forgot a column with `undefined`, not an
  // error, and computeStaleness would then read every fact as dimensionless —
  // the exact failure DUE_FACT_DIMENSIONS fixed. Check the shape before the
  // numbers, so a drifted query cannot masquerade as a quiet report.
  const problems = shapeProblems(
    'STALENESS_QUERY',
    result,
    factDimensionFields.map(({ column }) => column),
    'dimension key',
  );

  const { referenceYear, summary, dueFacts, dueSources } = computeStaleness(
    result.rows,
    now,
  );

  const duplicates = duplicatedTargets(dueFacts.map(formatFactTarget));
  if (duplicates) {
    problems.push(
      `${duplicates.extra} due fact(s) share a target: ${duplicates.repeated.join(' | ')}`,
    );
  }

  if (problems.length > 0) {
    // One JSON document on stdout either way, so a caller that pipes this into
    // jq never sees two payloads. The non-zero exit code is the machine signal.
    process.exitCode = 1;
  }

  console.log(
    JSON.stringify(
      {
        status: problems.length > 0 ? 'error' : 'ok',
        checkedAt: now.toISOString(),
        referenceYear,
        windowsDays,
        summary,
        dueFacts,
        dueSources,
        problems,
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
