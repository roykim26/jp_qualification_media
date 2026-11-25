#!/usr/bin/env node
// Fail when a tracked file carries something that belongs to one machine rather
// than to the repository: an absolute drive path, a home directory, or a dump of
// the local session store.
//
// Reads what is in the index (via `git ls-files` + `git show HEAD:<file>`) rather
// than what is on disk, so a file that is staged but not yet committed is checked
// the same way CI will see it. Prints one line per problem and exits 1; a clean
// tree prints a single summary line and exits 0.
//
// Run: node scripts/check-repo-hygiene.mjs [--json]

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

import {
  applyAllowlist,
  describeProblems,
  isClean,
  scanText,
} from './repo-hygiene-lib.mjs';

const BINARY_EXTENSIONS =
  /\.(png|jpg|jpeg|gif|webp|ico|pdf|xlsx|zip|gz|woff2?|ttf|otf|dump|bundle|zstd|mp4|mov)$/i;

const allowlistPath = path.resolve('scripts/repo-hygiene-allowlist.json');
const allowlist = JSON.parse(readFileSync(allowlistPath, 'utf8'));

const asJson = process.argv.includes('--json');

function trackedFiles() {
  return execSync('git ls-files', { encoding: 'utf8', maxBuffer: 1e8 })
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

// Read the staged blob (`git show :<file>`), not the working copy. The index is
// what a fresh clone would receive after the commit, so the gate sees exactly
// what would be published 鈥?and it still works before the commit exists, which
// reading HEAD would not.
function readStaged(file) {
  return execSync(`git show :${JSON.stringify(file)}`, {
    encoding: 'utf8',
    maxBuffer: 1e8,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

const problems = [];
const suppressed = [];
let scanned = 0;
let skipped = 0;

for (const file of trackedFiles()) {
  if (BINARY_EXTENSIONS.test(file)) {
    skipped += 1;
    continue;
  }

  let text;
  try {
    text = readStaged(file);
  } catch {
    // Not in HEAD yet (staged for the first commit) or unreadable as UTF-8.
    skipped += 1;
    continue;
  }

  scanned += 1;
  const result = applyAllowlist(file, scanText(text), allowlist);
  suppressed.push(...result.suppressed.map((entry) => ({ file, ...entry })));
  problems.push(...describeProblems(file, result));
}

if (asJson) {
  console.log(
    JSON.stringify(
      {
        status: problems.length === 0 ? 'ok' : 'blocked',
        scanned,
        skipped,
        problems,
      },
      null,
      2,
    ),
  );
} else if (problems.length === 0) {
  console.log(
    `repo hygiene: ${scanned} tracked text file(s) clean, ${skipped} skipped, ${suppressed.length} allowlisted hit(s)`,
  );
} else {
  console.error(
    `repo hygiene: ${problems.length} problem(s) in ${scanned} tracked text file(s)`,
  );
  for (const line of problems) console.error(`  ${line}`);
  console.error(
    'Remove the path, or add an allowlist entry in scripts/repo-hygiene-allowlist.json with a reason.',
  );
}

if (problems.length > 0) process.exitCode = 1;
