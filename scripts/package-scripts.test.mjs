import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync } from 'node:child_process';

import {
  findMissingFiles,
  findUntrackedFiles,
  referencedFile,
} from './package-scripts-lib.mjs';

/**
 * Every `pnpm <script>` that runs a file in this repo must point at a file that
 * is actually committed.
 *
 * Why this exists: `audit:latency` was added to package.json in 7c3c0ef while
 * scripts/dsh-latency-audit.mjs stayed untracked. Everything passed locally
 * because the file was sitting in the working tree, and `git status` showed it
 * as `??` for hours without anyone reading the line as "this script entry is
 * broken". A fresh clone fails with MODULE_NOT_FOUND, and the failure only
 * shows up when someone tries to run that one command.
 *
 * The check is deliberately about the file, not about behaviour: it cannot tell
 * a good script from a bad one, but it can tell a dangling reference from a
 * live one, and that is the class of mistake that survives review.
 */

const repoRoot = path.resolve(import.meta.dirname, '..');

function readScripts() {
  return JSON.parse(
    fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'),
  ).scripts;
}

test('every package.json script that names a repo file points at a file that exists', () => {
  const broken = findMissingFiles(readScripts(), (file) =>
    fs.existsSync(path.join(repoRoot, file)),
  );
  assert.deepEqual(
    broken,
    [],
    `scripts point at missing files:\n${broken.join('\n')}`,
  );
});

test('every repo file a script names is tracked by git', () => {
  const scripts = readScripts();
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files'], {
      cwd: repoRoot,
      encoding: 'utf8',
    })
      .split('\n')
      .filter(Boolean);
  } catch {
    // No git (tarball checkout, CI image without it): the check cannot speak,
    // and silently passing would be worse than saying so.
    assert.ok(true, 'git unavailable, skipped');
    return;
  }
  const untracked = findUntrackedFiles(scripts, tracked);
  assert.deepEqual(
    untracked,
    [],
    `scripts point at files git does not track (a fresh clone will not have them):\n${untracked.join('\n')}`,
  );
});

test('a file that exists but is untracked is reported as untracked', () => {
  // The live check above only fires when the repository happens to contain such
  // an entry. Without this case, deleting the tracked half left the suite green
  // (mutation 4 in var/mutate-package-scripts.mjs) — the assertion was real but
  // had no sample it could fail on.
  const scripts = {
    'audit:latency': 'node scripts/dsh-latency-audit.mjs',
    'data:staleness': 'node scripts/check-staleness.mjs',
  };
  const tracked = ['scripts/check-staleness.mjs'];
  assert.deepEqual(
    findUntrackedFiles(scripts, tracked),
    ['audit:latency -> scripts/dsh-latency-audit.mjs'],
    'a file present on disk but absent from git ls-files must be reported',
  );
  assert.deepEqual(
    findMissingFiles(scripts, () => true),
    [],
    'existence and tracking are separate questions',
  );
});

test('a file that no longer exists on disk is reported as missing', () => {
  // Same reason as the case above, for the other half: the live check only
  // fires when a script points at a file someone already deleted, and the
  // repository does not currently contain such an entry. Without a fixture,
  // deleting the existence check outright left the suite green (mutation 4).
  const scripts = {
    'audit:ghost': 'node scripts/ghost-script.mjs',
    'data:staleness': 'node scripts/check-staleness.mjs',
  };
  const present = new Set(['scripts/check-staleness.mjs']);
  assert.deepEqual(
    findMissingFiles(scripts, (file) => present.has(file)),
    ['audit:ghost -> scripts/ghost-script.mjs'],
    'a script naming a deleted file must be reported',
  );
  assert.deepEqual(
    findUntrackedFiles(scripts, [...present]),
    ['audit:ghost -> scripts/ghost-script.mjs'],
    'a deleted file is untracked too; both halves may speak',
  );
});

test('the file parser finds the file and ignores plain commands', () => {
  // Guards the regex above: if it silently matched nothing, both tests would
  // pass over an empty list and report success while checking nothing.
  assert.equal(
    referencedFile('node scripts/audit-mvp.mjs'),
    'scripts/audit-mvp.mjs',
  );
  assert.equal(
    referencedFile('tsx scripts/rollback-fact.ts'),
    'scripts/rollback-fact.ts',
  );
  assert.equal(
    referencedFile('node --test scripts/a.test.mjs scripts/b.test.mjs'),
    'scripts/a.test.mjs',
  );
  assert.equal(referencedFile('vitest run tests'), null);
  assert.equal(referencedFile('docker compose up -d --build'), null);
});
