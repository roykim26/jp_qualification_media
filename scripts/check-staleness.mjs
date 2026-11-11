import process from 'node:process';
import { Client } from 'pg';
import {
  STALENESS_QUERY,
  computeStaleness,
  windowsDays,
} from './staleness-lib.mjs';

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

  const { referenceYear, summary, dueFacts, dueSources } = computeStaleness(
    result.rows,
    now,
  );

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        checkedAt: now.toISOString(),
        referenceYear,
        windowsDays,
        summary,
        dueFacts,
        dueSources,
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
