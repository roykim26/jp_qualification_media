// Runs the real STALENESS_QUERY against a migrated, seeded database and checks
// the two things a text assertion cannot: that the query actually returns the
// dimension columns it selects, and that the targets it feeds into ops:daily are
// distinct.
//
// Why this exists (DUE_FACT_DIMENSIONS §8.1): the unit tests hand `computeStaleness`
// plain row objects, so they never execute SQL. A change that dropped
// `f.exam_level_id` from the SELECT would keep every unit test green while making
// seven distinct 日商簿記 fee facts render as one identical line again.
//
// With no DATABASE_URL it reports `not_run` and exits 0, so a developer without a
// database can still run it. CI always has one (release-gate.yml).
import process from 'node:process';
import { Client } from 'pg';
import {
  STALENESS_QUERY,
  computeStaleness,
  factDimensionFields,
  formatFactTarget,
} from './staleness-lib.mjs';
import { duplicatedTargets, shapeProblems } from './query-shape-lib.mjs';

function emit(payload, exitCode) {
  console.log(JSON.stringify(payload, null, 2));
  process.exitCode = exitCode;
}

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  emit(
    {
      status: 'not_run',
      reason: 'DATABASE_URL is required to run the staleness query',
    },
    0,
  );
} else {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    await client.query('BEGIN READ ONLY');
    const result = await client.query(STALENESS_QUERY);
    await client.query('COMMIT');

    const problems = shapeProblems(
      'STALENESS_QUERY',
      result,
      factDimensionFields.map(({ column }) => column),
      'dimension key',
    );

    // The targets that ops:daily prints must be distinct. This is the actual
    // regression: 12 actions with only 4 distinct targets was the bug.
    const staleness = computeStaleness(result.rows, new Date());
    const targets = staleness.dueFacts.map((fact) => formatFactTarget(fact));
    const distinct = new Set(targets);
    const duplicates = duplicatedTargets(targets);
    if (duplicates) {
      problems.push(
        `${duplicates.extra} due fact(s) share a target: ${duplicates.repeated.join('; ')}`,
      );
    }

    emit(
      {
        status: problems.length === 0 ? 'ok' : 'error',
        rows: result.rows.length,
        dueFacts: staleness.dueFacts.length,
        distinctTargets: distinct.size,
        dimensionColumns: factDimensionFields.map(({ column }) => column),
        sampleTargets: [...distinct].slice(0, 5),
        problems,
      },
      problems.length === 0 ? 0 : 1,
    );
  } catch (error) {
    emit(
      {
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      },
      1,
    );
  } finally {
    await client.end();
  }
}
