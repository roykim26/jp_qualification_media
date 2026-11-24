import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Behaviour tests for scripts/prune-var.sh.
 *
 * The script is POSIX sh and its whole job is destructive, so it is run for
 * real against a throwaway tree instead of being re-implemented here. Every
 * case builds its own root under var/test-prune-var/<unique>/root and points
 * VAR_DIR at it, so a bug in the script cannot reach the real var/.
 *
 * Ages are set with utimesSync rather than by naming files: the script decides
 * by mtime, and faking the mtime is the only way to test a 90-day window
 * without waiting 90 days.
 *
 * On Windows the script runs through WSL's bash, which is the same dash the
 * Ubuntu VPS ships.
 */

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, 'scripts', 'prune-var.sh');

let workDir: string;
let varDir: string;

function toPosixPath(value: string): string {
  if (process.platform !== 'win32') return value;
  const match = /^([A-Za-z]):\\(.*)$/.exec(value);
  if (!match) return value.replace(/\\/g, '/');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

/** Backdate a path so the script's -mtime test sees it as old. */
function ageDays(target: string, days: number): void {
  const when = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  utimesSync(target, when, when);
}

function writeReport(name: string, ageInDays: number): string {
  const dir = join(varDir, 'ops-reports');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, name);
  writeFileSync(file, '{"status":"ok"}\n', 'utf8');
  ageDays(file, ageInDays);
  return file;
}

interface RunResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

function runScript(
  args: string[] = [],
  env: Record<string, string> = {},
): RunResult {
  const assignments = {
    VAR_DIR: toPosixPath(varDir),
    ...env,
  };
  const prefix = Object.entries(assignments)
    .map(([key, value]) => `${key}=${quote(value)}`)
    .join(' ');
  const argList = args.map((arg) => ` ${quote(arg)}`).join('');

  const command = `${prefix} sh ${quote(toPosixPath(scriptPath))}${argList}`;

  const result =
    process.platform === 'win32'
      ? spawnSync('bash', ['-c', command], { cwd: repoRoot, encoding: 'utf8' })
      : spawnSync('sh', ['-c', command], { cwd: repoRoot, encoding: 'utf8' });

  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

// WSL's first process launch on Windows takes several seconds (VM boot); every
// later call is ~300ms. Warm it up once so individual cases stay fast.
beforeAll(() => {
  if (process.platform === 'win32') {
    spawnSync('bash', ['-c', 'true'], { encoding: 'utf8' });
  }
}, 120_000);

beforeEach(() => {
  workDir = join(
    repoRoot,
    'var',
    'test-prune-var',
    String(Date.now()) + '-' + Math.random().toString(16).slice(2),
  );
  varDir = join(workDir, 'root');
  mkdirSync(varDir, { recursive: true });
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('prune-var report files', () => {
  it('removes date-named reports past the retention window', () => {
    const old = writeReport('2026-01-01.json', 200);
    const oldMd = writeReport('2026-01-01.md', 200);

    const result = runScript(['--apply']);

    expect(result.status).toBe(0);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(oldMd)).toBe(false);
    expect(result.stdout).toContain('removed');
  });

  it('keeps reports inside the retention window', () => {
    const recent = writeReport('2026-11-24.json', 1);
    const recentMd = writeReport('2026-11-24.md', 1);

    const result = runScript(['--apply']);

    expect(existsSync(recent)).toBe(true);
    expect(existsSync(recentMd)).toBe(true);
    expect(result.stdout).toContain('nothing to do');
  });

  it('is a dry run by default and deletes nothing', () => {
    const old = writeReport('2026-01-01.json', 200);

    const result = runScript();

    expect(result.status).toBe(0);
    expect(existsSync(old)).toBe(true);
    expect(result.stdout).toContain('would remove');
    expect(result.stdout).toContain('dry-run');
  });

  it('leaves files a person put there by hand', () => {
    const cronErr = join(varDir, 'ops-reports', 'cron.err');
    const notes = join(varDir, 'ops-reports', 'notes.md');
    const saved = join(varDir, 'ops-reports', 'keep-me.json');
    mkdirSync(join(varDir, 'ops-reports'), { recursive: true });
    for (const file of [cronErr, notes, saved]) {
      writeFileSync(file, 'x\n', 'utf8');
      ageDays(file, 200);
    }
    writeReport('2026-01-01.json', 200);

    runScript(['--apply']);

    expect(existsSync(cronErr)).toBe(true);
    expect(existsSync(notes)).toBe(true);
    expect(existsSync(saved)).toBe(true);
  });

  it('honours a custom retention window', () => {
    const tenDays = writeReport('2026-11-15.json', 10);

    runScript(['--apply'], { OPS_REPORT_RETENTION_DAYS: '5' });

    expect(existsSync(tenDays)).toBe(false);
  });
});

describe('prune-var delivery log', () => {
  function writeLog(lineCount: number): string {
    const dir = join(varDir, 'notifications');
    mkdirSync(dir, { recursive: true });
    const file = join(dir, 'feishu.log');
    const lines = Array.from({ length: lineCount }, (_, i) => `{"n":${i}}`);
    writeFileSync(file, `${lines.join('\n')}\n`, 'utf8');
    return file;
  }

  it('truncates the log to the last N lines', () => {
    const log = writeLog(20);

    const result = runScript(['--apply'], { NOTIFICATION_LOG_MAX_LINES: '5' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('truncated');
    const kept = readFileSync(log, 'utf8').trim().split('\n');
    expect(kept).toHaveLength(5);
    // The tail survives, not the head: the newest deliveries are the useful ones.
    expect(kept[4]).toBe('{"n":19}');
    expect(kept[0]).toBe('{"n":15}');
  });

  it('leaves a log under the limit alone', () => {
    const log = writeLog(3);
    const before = readFileSync(log, 'utf8');

    const result = runScript(['--apply'], { NOTIFICATION_LOG_MAX_LINES: '5' });

    expect(readFileSync(log, 'utf8')).toBe(before);
    expect(result.stdout).not.toContain('truncated');
  });

  it('does not truncate on a dry run', () => {
    const log = writeLog(20);

    const result = runScript([], { NOTIFICATION_LOG_MAX_LINES: '5' });

    expect(result.stdout).toContain('would truncate');
    expect(readFileSync(log, 'utf8').trim().split('\n')).toHaveLength(20);
  });

  it('keeps the log when its mtime is old but it is short', () => {
    // The mtime is the time of the last delivery, not the age of the content:
    // a quiet channel must not lose its history.
    const log = writeLog(2);
    ageDays(log, 400);

    runScript(['--apply'], { NOTIFICATION_LOG_MAX_LINES: '500' });

    expect(existsSync(log)).toBe(true);
  });
});

describe('prune-var test leftovers', () => {
  function makeTestDir(name: string, ageInDays: number): string {
    const dir = join(varDir, name);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'leftover.txt'), 'x\n', 'utf8');
    ageDays(dir, ageInDays);
    return dir;
  }

  it('removes stale test-* directories', () => {
    const stale = makeTestDir('test-something', 30);

    const result = runScript(['--apply']);

    expect(existsSync(stale)).toBe(false);
    expect(result.stdout).toContain('removed');
  });

  it('keeps fresh test-* directories', () => {
    const fresh = makeTestDir('test-something', 1);

    runScript(['--apply']);

    expect(existsSync(fresh)).toBe(true);
  });

  it('never removes a directory that does not start with test-', () => {
    const other = join(varDir, 'qa');
    mkdirSync(other, { recursive: true });
    writeFileSync(join(other, 'evidence.json'), 'x\n', 'utf8');
    ageDays(other, 400);

    runScript(['--apply']);

    expect(existsSync(other)).toBe(true);
  });

  it('does not follow a symlinked test-* directory', () => {
    const target = join(workDir, 'outside');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'precious.txt'), 'x\n', 'utf8');
    ageDays(target, 400);
    try {
      symlinkSync(target, join(varDir, 'test-link'), 'dir');
    } catch {
      return; // symlinks need privileges on Windows; nothing to assert there.
    }

    runScript(['--apply']);

    expect(existsSync(join(target, 'precious.txt'))).toBe(true);
  });
});

describe('prune-var safety', () => {
  it('exits 0 when var/ does not exist', () => {
    rmSync(varDir, { recursive: true, force: true });

    const result = runScript(['--apply']);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('nothing to do');
  });

  it('refuses to touch a var/ that is a file', () => {
    rmSync(varDir, { recursive: true, force: true });
    writeFileSync(varDir, 'not a directory\n', 'utf8');

    const result = runScript(['--apply']);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain('not a plain directory');
    expect(readFileSync(varDir, 'utf8')).toBe('not a directory\n');
  });

  it('rejects an unknown argument', () => {
    const result = runScript(['--force']);

    expect(result.status).toBe(2);
    expect(result.stderr).toContain('unknown argument');
  });

  it('touches nothing outside the whitelist', () => {
    const bystanders = [
      join(varDir, 'pg-run', 'PG_VERSION'),
      join(varDir, 'official-snapshots', '202610.xlsx'),
      join(varDir, 'patrol', 'registry.json'),
      join(varDir, 'audit-2026-11-24', 'notes.md'),
    ];
    for (const file of bystanders) {
      mkdirSync(join(file, '..'), { recursive: true });
      writeFileSync(file, 'x\n', 'utf8');
      ageDays(file, 500);
    }

    runScript(['--apply']);

    for (const file of bystanders) {
      expect(existsSync(file)).toBe(true);
    }
  });

  it('reports the mode in the summary line', () => {
    writeReport('2026-01-01.json', 200);

    expect(runScript().stdout).toContain('dry-run');
    expect(runScript(['--apply']).stdout).toContain('apply');
  });
});
