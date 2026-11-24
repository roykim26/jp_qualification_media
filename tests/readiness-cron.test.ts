import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Behaviour tests for scripts/readiness-cron.sh.
 *
 * The wrapper is POSIX sh, so the tests run it for real rather than
 * re-implementing its logic: a fake `docker` on PATH decides what the probe
 * "reported", and a fake `logger` records what would have reached syslog.
 *
 * On Windows the script is executed through WSL's bash, which ships the same
 * dash and util-linux `logger` as the Ubuntu VPS the cron entry targets.
 */

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, 'scripts', 'readiness-cron.sh');

let workDir: string;
let binDir: string;
let stateFile: string;
let loggerLog: string;

function toPosixPath(value: string): string {
  if (process.platform !== 'win32') return value;
  const match = /^([A-Za-z]):\\(.*)$/.exec(value);
  if (!match) return value.replace(/\\/g, '/');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function writeFakeDocker(body: string): void {
  writeFileSync(join(binDir, 'docker'), `#!/bin/sh\n${body}\n`, 'utf8');
}

function writeFakeLogger(): void {
  // Records one line per invocation: the syslog tag, priority and message.
  writeFileSync(
    join(binDir, 'logger'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$LOGGER_LOG"\n`,
    'utf8',
  );
}

function runScript(env: Record<string, string> = {}): {
  status: number | null;
  logs: string[];
  state: string;
} {
  const assignments = {
    PATH: `${toPosixPath(binDir)}:$PATH`,
    READINESS_STATE_FILE: toPosixPath(stateFile),
    LOGGER_LOG: toPosixPath(loggerLog),
    ...env,
  };
  const prefix = Object.entries(assignments)
    .map(([key, value]) => `${key}=${quote(value)}`)
    .join(' ');

  const command = `chmod +x ${quote(toPosixPath(join(binDir, 'docker')))} ${quote(
    toPosixPath(join(binDir, 'logger')),
  )} && ${prefix} sh ${quote(toPosixPath(scriptPath))}`;

  const result =
    process.platform === 'win32'
      ? spawnSync('bash', ['-c', command], { cwd: repoRoot, encoding: 'utf8' })
      : spawnSync('sh', ['-c', command], { cwd: repoRoot, encoding: 'utf8' });

  const logs = existsSync(loggerLog)
    ? readFileSync(loggerLog, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
    : [];
  const state = existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : '';

  return { status: result.status, logs, state };
}

function seedState(status: string, count: number): void {
  writeFileSync(stateFile, `${status}\n${count}\n`, 'utf8');
}

function readyJson(): string {
  return JSON.stringify({ status: 'ready', database: 'ok', durationMs: 34 });
}

function errorJson(message = 'connect ECONNREFUSED 127.0.0.1:5432'): string {
  return JSON.stringify({
    status: 'error',
    database: 'error',
    message,
    durationMs: 41,
  });
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
    'test-readiness-cron',
    String(Date.now()) + '-' + Math.random().toString(16).slice(2),
  );
  binDir = join(workDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  stateFile = join(workDir, 'last-status');
  loggerLog = join(workDir, 'logger.log');
  writeFakeLogger();
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('readiness cron wrapper', () => {
  it('stays silent on a healthy first run and records the state', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toEqual([]);
    expect(state).toBe('ready\n0\n');
  });

  it('reports a failing first run as an error', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('status=error');
    expect(logs[0]).toContain('ECONNREFUSED');
    // The message must be the message, not the tail of the JSON document:
    // a greedy sed capture would drag `durationMs` in with it.
    expect(logs[0]).not.toContain('durationMs');
    expect(logs[0]).toContain('message=connect ECONNREFUSED 127.0.0.1:5432');
    expect(state).toBe('error\n1\n');
  });

  it('announces the transition from ready to failing', () => {
    seedState('ready', 0);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('status=error');
    expect(state).toBe('error\n1\n');
  });

  it('does not repeat itself while a failure persists between heartbeats', () => {
    seedState('error', 1);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toEqual([]);
    expect(state).toBe('error\n2\n');
  });

  it('emits a heartbeat once the failure has lasted a full interval', () => {
    seedState('error', 11);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.warning');
    expect(logs[0]).toContain('for 12 checks');
    expect(state).toBe('error\n12\n');
  });

  it('honours a custom heartbeat interval', () => {
    seedState('error', 1);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { status, logs } = runScript({ HEARTBEAT_EVERY: '2' });

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.warning');
    expect(logs[0]).toContain('for 2 checks');
  });

  it('announces recovery and says how long the failure lasted', () => {
    seedState('error', 37);
    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.notice');
    expect(logs[0]).toContain('recovered');
    expect(logs[0]).toContain('after 37 checks');
    expect(state).toBe('ready\n0\n');
  });

  it('stays silent while healthy', () => {
    seedState('ready', 0);
    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toEqual([]);
    expect(state).toBe('ready\n0\n');
  });

  it('separates "the probe could not run" from "the data plane is down"', () => {
    writeFakeDocker(
      `printf '%s\\n' 'Cannot connect to the Docker daemon'; exit 1`,
    );

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('status=unreachable');
    expect(logs[0]).toContain('probe did not run');
    expect(state).toBe('unreachable\n1\n');
  });

  it('treats output without a status field as an unrunnable probe', () => {
    writeFakeDocker(`printf '%s\\n' 'not json at all'; exit 1`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('status=unreachable');
    expect(state).toBe('unreachable\n1\n');
  });

  it('recovers from an unrunnable probe without losing the failure count', () => {
    seedState('unreachable', 5);
    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('recovered');
    expect(logs[0]).toContain('after 5 checks');
    expect(state).toBe('ready\n0\n');
  });

  it('creates the state directory when it does not exist yet', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);
    stateFile = join(workDir, 'nested', 'deeper', 'last-status');

    const { status, state } = runScript();

    expect(status).toBe(0);
    expect(state).toBe('ready\n0\n');
  });
});
