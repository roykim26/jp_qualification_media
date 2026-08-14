import process from 'node:process';
import { createRuntime, verifyQualification, waitFor } from './verify-lib.mjs';

function argument(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}
const databaseUrl = process.env.DATABASE_URL;
const gate = {
  slug: argument('slug'),
  expectedFacts: Number(argument('expected-facts', '0')),
  pageContains: argument('page-contains', ''),
};
if (
  !databaseUrl ||
  !gate.slug ||
  !Number.isInteger(gate.expectedFacts) ||
  gate.expectedFacts < 1
) {
  console.error(
    'Usage: DATABASE_URL=... pnpm verify:e2e -- --slug <slug> --expected-facts <n> [--page-contains <text>]',
  );
  process.exit(2);
}
const runtime = createRuntime(databaseUrl);
try {
  runtime.start();
  await waitFor(`http://127.0.0.1:${runtime.apiPort}/health`);
  const result = await verifyQualification(databaseUrl, runtime, gate);
  console.log(JSON.stringify(result, null, 2));
  if (!result.passed) process.exitCode = 1;
} finally {
  runtime.stop();
}
