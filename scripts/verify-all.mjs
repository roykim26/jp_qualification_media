import process from 'node:process';
import {
  createRuntime,
  launchGate,
  verifyQualification,
  waitFor,
} from './verify-lib.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required');
  process.exit(2);
}
const runtime = createRuntime(databaseUrl);
const results = [];
try {
  runtime.start();
  await waitFor(`http://127.0.0.1:${runtime.apiPort}/health`);
  for (const gate of launchGate)
    results.push(
      await verifyQualification(databaseUrl, runtime, gate, {
        requireNoOfficialPending: true,
      }),
    );
  const failed = results.filter((result) => !result.passed);
  console.log(
    JSON.stringify(
      {
        status: failed.length ? 'blocked' : 'passed',
        qualifications: results.length,
        passed: results.length - failed.length,
        failed: failed.length,
        results,
      },
      null,
      2,
    ),
  );
  if (failed.length) process.exitCode = 1;
} finally {
  runtime.stop();
}
