import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyAllowlist,
  canonicalPath,
  describeProblems,
  homePathPattern,
  isClean,
  looksLikeSessionDump,
  scanText,
  windowsPathPattern,
} from './repo-hygiene-lib.mjs';

// The gate exists because a commit published a session dump carrying three
// absolute Windows paths, a user name, and the titles of 24 sessions belonging to
// other projects. Each test below pins one way that could happen again.
//
// Sample paths are assembled at runtime instead of written out. A literal here
// would be found by the gate itself, and the gate's own fixtures would then need
// allowlist entries — an allowlist that grows with the tests is one nobody reads.

const SEP = '\\';

/** Build a Windows path from parts, so the source carries no complete path. */
function winPath(...parts) {
  return parts.join(SEP);
}

/** Build a POSIX home path from parts, for the same reason. */
function homePath(root, user) {
  return `/${root}/${user}`;
}

test('a drive path is reported with its first segment', () => {
  const result = scanText(
    `see ${winPath('E:', 'work', 'project')} for details`,
  );
  assert.deepEqual(result.windowsPaths, [winPath('E:', 'work')]);
});

test('the same path twice is reported once', () => {
  const result = scanText(
    `${winPath('E:', 'work', 'a')} and again ${winPath('E:', 'work', 'b')}`,
  );
  assert.deepEqual(result.windowsPaths, [winPath('E:', 'work')]);
});

test('a home directory is reported', () => {
  const linux = homePath('home', 'alice');
  const mac = homePath('Users', 'alice');
  assert.deepEqual(scanText(`cd ${linux}/project`).homePaths, [linux]);
  assert.deepEqual(scanText(`cd ${mac}/project`).homePaths, [mac]);
});

test('a drive path in a regular expression is not reported as a path', () => {
  // This is the shape that made the gate's first run report three "paths" that
  // were source code: a JS string holding a regex escape, and template literals.
  assert.deepEqual(scanText('const re = /[A-Za-z]:\\\\/g;').windowsPaths, []);
  assert.deepEqual(scanText('if (/g:\\s*$/m) {}').windowsPaths, []);
  assert.deepEqual(scanText('`s:\\n${broken.join(').windowsPaths, []);
});

test('a session dump is recognised by the pair of keys it carries', () => {
  assert.equal(looksLikeSessionDump('{"sessions": [{"prompt": "hi"}]}'), true);
  // One key alone is not enough: a document may mention sessions without being
  // a dump, and a false positive here blocks every future commit.
  assert.equal(looksLikeSessionDump('{"sessions": []}'), false);
  assert.equal(looksLikeSessionDump('{"prompt": "hi"}'), false);
});

test('a clean document is clean', () => {
  assert.equal(isClean(scanText('nothing to see here')), true);
  assert.equal(isClean(scanText(winPath('E:', 'work'))), false);
  assert.equal(isClean(scanText('{"sessions": [{"prompt": "x"}]}')), false);
});

test('an allowlist entry suppresses exactly one triple', () => {
  const work = winPath('E:', 'work');
  const allowlist = {
    entries: [
      {
        path: 'docs/a.md',
        kind: 'windowsPath',
        value: work,
        reason: 'predates the gate',
      },
    ],
  };
  const result = scanText(`${work} and ${winPath('E:', 'other')}`);
  const filtered = applyAllowlist('docs/a.md', result, allowlist);
  assert.deepEqual(filtered.windowsPaths, [winPath('E:', 'other')]);
  assert.deepEqual(filtered.suppressed, [
    { kind: 'windowsPath', value: work, reason: 'predates the gate' },
  ]);
});

test('an allowlist entry does not leak into another file', () => {
  const work = winPath('E:', 'work');
  const allowlist = {
    entries: [
      {
        path: 'docs/a.md',
        kind: 'windowsPath',
        value: work,
        reason: 'predates the gate',
      },
    ],
  };
  const filtered = applyAllowlist('docs/b.md', scanText(work), allowlist);
  assert.deepEqual(filtered.windowsPaths, [work]);
  assert.deepEqual(filtered.suppressed, []);
});

test('an allowlist entry does not suppress a different kind in the same file', () => {
  const work = winPath('E:', 'work');
  const home = homePath('Users', 'alice');
  const allowlist = {
    entries: [
      {
        path: 'docs/a.md',
        kind: 'windowsPath',
        value: work,
        reason: 'predates the gate',
      },
    ],
  };
  const filtered = applyAllowlist(
    'docs/a.md',
    scanText(`${work} ${home}`),
    allowlist,
  );
  assert.deepEqual(filtered.windowsPaths, []);
  assert.deepEqual(filtered.homePaths, [home]);
});

test('a session dump can be allowlisted only by its own kind', () => {
  const allowlist = {
    entries: [
      {
        path: 'docs/a.md',
        kind: 'sessionDump',
        value: true,
        reason: 'quotes a dump on purpose',
      },
    ],
  };
  const filtered = applyAllowlist(
    'docs/a.md',
    scanText('{"sessions": [{"prompt": "x"}]}'),
    allowlist,
  );
  assert.equal(filtered.sessionDump, false);
  assert.equal(filtered.suppressed[0].kind, 'sessionDump');
});

test('an entry whose value collides across kinds does not suppress', () => {
  // Someone can write the wrong kind into an entry. Matching on the value alone
  // would then silence a real finding of a different kind, so the kind has to be
  // part of the key even when the value is identical.
  const home = homePath('Users', 'alice');
  const allowlist = {
    entries: [
      {
        path: 'docs/a.md',
        kind: 'windowsPath',
        value: canonicalPath(home),
        reason: 'wrong kind on purpose',
      },
    ],
  };
  const filtered = applyAllowlist('docs/a.md', scanText(home), allowlist);
  assert.deepEqual(filtered.homePaths, [home]);
  assert.deepEqual(filtered.suppressed, []);
});

test('an empty allowlist suppresses nothing', () => {
  const work = winPath('E:', 'work');
  const filtered = applyAllowlist('docs/a.md', scanText(work), { entries: [] });
  assert.deepEqual(filtered.windowsPaths, [work]);
});

test('an allowlist entry is written in canonical form and still matches', () => {
  // The allowlist file uses forward slashes so that it does not contain a string
  // the scanner would match — otherwise the allowlist would have to allowlist
  // itself. The comparison must normalise both sides for that to work.
  const allowlist = {
    entries: [
      {
        path: 'docs/a.md',
        kind: 'windowsPath',
        value: 'E:/work',
        reason: 'predates the gate',
      },
    ],
  };
  const filtered = applyAllowlist(
    'docs/a.md',
    scanText(winPath('E:', 'work')),
    allowlist,
  );
  assert.deepEqual(filtered.windowsPaths, []);
  assert.equal(filtered.suppressed.length, 1);
});

test('canonicalPath drops the drive-relative form the scanner reports', () => {
  assert.equal(canonicalPath(winPath('E:', 'work')), 'E:/work');
  assert.equal(canonicalPath(homePath('Users', 'alice')), 'Users/alice');
  assert.equal(canonicalPath('E:/work'), 'E:/work');
});

test('problems are described one per line with the file and the value', () => {
  const work = winPath('E:', 'work');
  const home = homePath('Users', 'alice');
  const lines = describeProblems('docs/a.md', scanText(`${work} ${home}`));
  assert.deepEqual(lines, [
    `docs/a.md: machine path ${work}`,
    `docs/a.md: home directory ${home}`,
  ]);
});

test('a session dump is described without quoting its contents', () => {
  const lines = describeProblems(
    'docs/a.md',
    scanText('{"sessions": [{"prompt": "secret title"}]}'),
  );
  assert.deepEqual(lines, [
    'docs/a.md: looks like a dump of the local session store',
  ]);
  assert.equal(lines.join('\n').includes('secret title'), false);
});

test('the patterns are exported so a caller can explain what it matched', () => {
  assert.ok(windowsPathPattern instanceof RegExp);
  assert.ok(homePathPattern instanceof RegExp);
});
