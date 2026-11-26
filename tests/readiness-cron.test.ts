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
let notifyLog: string;
let notifyScript: string;

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
  notifications: string[];
  state: string;
} {
  const assignments = {
    READINESS_STATE_FILE: toPosixPath(stateFile),
    LOGGER_LOG: toPosixPath(loggerLog),
    NOTIFY_SCRIPT: toPosixPath(notifyScript),
    NOTIFY_LOG: toPosixPath(notifyLog),
    ...env,
  };
  // $PATH must be expanded by the outer shell, not frozen by quote(): a quoted
  // '$PATH' would hand the script PATH='<bin>:$PATH', so even `sh` itself would
  // be unresolvable and the run would exit 127 (this is what failed on Linux CI
  // while Windows' bash silently rebuilt PATH from its login profile).
  const pathAssignment = `PATH=${quote(toPosixPath(binDir))}:"$PATH"`;
  const prefix = [pathAssignment]
    .concat(
      Object.entries(assignments).map(
        ([key, value]) => `${key}=${quote(value)}`,
      ),
    )
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
  const notifications = existsSync(notifyLog)
    ? readFileSync(notifyLog, 'utf8')
        .split('\n')
        .filter((line) => line.length > 0)
    : [];
  const state = existsSync(stateFile) ? readFileSync(stateFile, 'utf8') : '';

  return { status: result.status, logs, notifications, state };
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
  notifyLog = join(workDir, 'notify.log');
  notifyScript = join(workDir, 'notify-stub.sh');
  writeFakeLogger();
  // The real notifier would post to Feishu. Tests only care that the wrapper
  // called it, and with what, so a stub that records its arguments stands in.
  writeFileSync(
    notifyScript,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$NOTIFY_LOG"\n`,
    'utf8',
  );
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

  it('holds back a lone failing run and reports it once the failure repeats', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const first = runScript();

    expect(first.status).toBe(0);
    expect(first.logs).toEqual([]);
    expect(first.state).toBe('error\n1\n');

    // Same verdict, second consecutive check: the debounce is complete and
    // the failure is announced exactly once, with the probe's own detail.
    const second = runScript();

    expect(second.status).toBe(0);
    expect(second.logs).toHaveLength(1);
    expect(second.logs[0]).toContain('daemon.err');
    expect(second.logs[0]).toContain('status=error');
    expect(second.logs[0]).toContain('ECONNREFUSED');
    // The message must be the message, not the tail of the JSON document:
    // a greedy sed capture would drag `durationMs` in with it.
    expect(second.logs[0]).not.toContain('durationMs');
    expect(second.logs[0]).toContain(
      'message=connect ECONNREFUSED 127.0.0.1:5432',
    );
    expect(second.state).toBe('error\n2\n');
  });

  it('announces the transition from ready to failing', () => {
    seedState('ready', 0);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    runScript();
    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('status=error');
    expect(state).toBe('error\n2\n');
  });

  it('does not repeat itself while a failure persists between heartbeats', () => {
    seedState('error', 2);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toEqual([]);
    expect(state).toBe('error\n3\n');
  });

  it('keeps a one-check blip entirely silent, in both directions', () => {
    // The 2026-11-26 flap: the homepage answered over 5s on exactly one check
    // and was fine on the next. Neither the failure nor the "recovery" may
    // produce a message, because no user ever saw the outage.
    seedState('ready', 0);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);
    const blip = runScript();
    expect(blip.logs).toEqual([]);
    expect(blip.notifications).toEqual([]);
    expect(blip.state).toBe('error\n1\n');

    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);
    const back = runScript();
    expect(back.logs).toEqual([]);
    expect(back.notifications).toEqual([]);
    expect(back.state).toBe('ready\n0\n');
  });

  it('announces immediately when ALERT_AFTER is 1', () => {
    seedState('ready', 0);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { logs, state } = runScript({ ALERT_AFTER: '1' });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(state).toBe('error\n1\n');
  });

  it('reports a change of failure shape while already paging', () => {
    // The outage was announced at count 2; on the third check the db error
    // became "the probe itself is not running". That is new, actionable
    // detail and must page again rather than wait for the next heartbeat.
    seedState('error', 2);
    writeFakeDocker(
      `printf '%s\\n' 'Cannot connect to the Docker daemon'; exit 1`,
    );

    const { logs, state } = runScript();

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('status=unreachable');
    expect(logs[0]).toContain('probe did not run');
    expect(state).toBe('unreachable\n3\n');
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

    // ALERT_AFTER=1 so count 2 is past the debounce and the heartbeat branch
    // is what answers; with the default debounce this check would be the
    // first err instead.
    const { status, logs } = runScript({
      HEARTBEAT_EVERY: '2',
      ALERT_AFTER: '1',
    });

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

    runScript();
    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('status=unreachable');
    expect(logs[0]).toContain('probe did not run');
    expect(state).toBe('unreachable\n2\n');
  });

  it('treats output without a status field as an unrunnable probe', () => {
    writeFakeDocker(`printf '%s\\n' 'not json at all'; exit 1`);

    runScript();
    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('status=unreachable');
    expect(state).toBe('unreachable\n2\n');
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

describe('readiness cron notification wiring', () => {
  it('sends one message when a failure starts', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    // The debounce holds the first check back; the message goes out with the
    // second, and only once for the whole episode.
    const pending = runScript();
    expect(pending.notifications).toEqual([]);

    const { status, logs, notifications } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain('--text');
    expect(notifications[0]).toContain('jpqm-readiness');
    expect(notifications[0]).toContain('status=error');
  });

  it('sends one message when the failure recovers', () => {
    seedState('error', 9);
    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);

    const { status, notifications } = runScript();

    expect(status).toBe(0);
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain('recovered');
    expect(notifications[0]).toContain('after 9 checks');
  });

  it('sends nothing on a healthy steady state', () => {
    seedState('ready', 0);
    writeFakeDocker(`printf '%s\\n' ${quote(readyJson())}; exit 0`);

    const { notifications } = runScript();

    expect(notifications).toEqual([]);
  });

  it('sends nothing between heartbeats while a failure persists', () => {
    seedState('error', 2);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { notifications } = runScript();

    expect(notifications).toEqual([]);
  });

  it('sends the heartbeat too, not just the transitions', () => {
    seedState('error', 11);
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    const { notifications } = runScript();

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain('still');
  });

  it('keeps syslog but stops notifying when READINESS_NOTIFY is 0', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);

    runScript({ READINESS_NOTIFY: '0' });
    const { status, logs, notifications, state } = runScript({
      READINESS_NOTIFY: '0',
    });

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(notifications).toEqual([]);
    expect(state).toBe('error\n2\n');
  });

  it('survives a notifier that always fails', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);
    // A notifier that exits non-zero and writes noise to both streams.
    writeFileSync(
      notifyScript,
      `#!/bin/sh\necho 'boom' >&2\necho 'noise'\nexit 1\n`,
      'utf8',
    );

    runScript();
    const { status, logs, state } = runScript();

    // The wrapper's contract is that a delivery problem never becomes the
    // probe's problem: exit stays 0, syslog still gets its line, state is written.
    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('status=error');
    expect(state).toBe('error\n2\n');
  });

  it('survives a notifier that does not exist', () => {
    writeFakeDocker(`printf '%s\\n' ${quote(errorJson())}; exit 1`);
    notifyScript = join(workDir, 'missing-notifier.sh');

    runScript();
    const { status, logs, state } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(state).toBe('error\n2\n');
  });
});

/**
 * Sprint 3L: the probe could only see db and api. These cases pin the wiring
 * that lets an operator extend it to web and caddy, and — just as important —
 * pin that leaving it unset changes nothing.
 */
describe('readiness cron public entry passthrough', () => {
  let dockerArgs: string;

  function writeRecordingDocker(report: string, exitCode: number): void {
    // Record argv verbatim, then answer like the probe would. `"$@"` inside the
    // single-quoted printf format is expanded by the fake script at run time.
    writeFakeDocker(
      `printf '%s\\n' "$*" >> "$DOCKER_ARGS"\nprintf '%s\\n' ${quote(report)}\nexit ${exitCode}`,
    );
    dockerArgs = join(workDir, 'docker-args.log');
  }

  function args(): string {
    return existsSync(dockerArgs)
      ? readFileSync(dockerArgs, 'utf8').trim()
      : '';
  }

  it('passes nothing extra when PUBLIC_READY_URL is unset', () => {
    // The default has to be byte-for-byte the pre-3L invocation: an operator
    // who never sets the variable must see no change at all.
    writeRecordingDocker(readyJson(), 0);

    const { status } = runScript({ DOCKER_ARGS: toPosixPath(dockerArgs) });

    expect(status).toBe(0);
    expect(args()).toContain('exec -T api node scripts/check-readiness.mjs');
    expect(args()).not.toContain('PUBLIC_READY_URL');
    expect(args()).not.toContain('-e ');
  });

  it('always names the compose file so the cwd cannot pick the wrong stack', () => {
    // The VPS has two compose files: deploy/docker-compose.prod.yml (project
    // "deploy", services api/db/web/caddy) and a stale /opt/jpqm/
    // docker-compose.yml (project "jpqm", services minio/...). With no -f,
    // compose walks up from the cwd, finds the stale one, and `exec api`
    // answers `service "api" is not running` -- so the probe reported
    // "unreachable" on a perfectly healthy box, forever. The documented
    // install line passes no COMPOSE_FILE, so the default has to carry it.
    writeRecordingDocker(readyJson(), 0);

    runScript({ DOCKER_ARGS: toPosixPath(dockerArgs) });

    expect(args()).toContain('-f deploy/docker-compose.prod.yml');
  });

  it('lets COMPOSE_FILE be overridden for a differently laid out host', () => {
    writeRecordingDocker(readyJson(), 0);

    runScript({
      DOCKER_ARGS: toPosixPath(dockerArgs),
      COMPOSE_FILE: '/srv/other/docker-compose.yml',
    });

    expect(args()).toContain('-f /srv/other/docker-compose.yml');
    expect(args()).not.toContain('deploy/docker-compose.prod.yml');
  });

  it('forwards the URL to the probe as an environment variable', () => {
    writeRecordingDocker(readyJson(), 0);

    runScript({
      DOCKER_ARGS: toPosixPath(dockerArgs),
      PUBLIC_READY_URL: 'https://shikakucheck.com/',
    });

    const recorded = args();
    expect(recorded).toContain('-e PUBLIC_READY_URL=https://shikakucheck.com/');
    // The URL travels as an env var, not as an argument: `ps` on a shared host
    // shows argv to every local user, and the public hostname is not a secret
    // worth broadcasting that way.
    expect(recorded).not.toContain('--public-url');
  });

  it('keeps -T and the timeout when the URL is set', () => {
    writeRecordingDocker(readyJson(), 0);

    runScript({
      DOCKER_ARGS: toPosixPath(dockerArgs),
      PUBLIC_READY_URL: 'https://shikakucheck.com/',
      READINESS_TIMEOUT_MS: '7000',
    });

    const recorded = args();
    // `-T` matters: cron has no TTY, and without it compose allocates one and
    // the probe hangs until the wrapper is killed.
    expect(recorded).toContain('exec -T');
    expect(recorded).toContain('--timeout=7000');
    expect(recorded).toContain('--json');
  });

  it('reports a public-entry failure through the same syslog path', () => {
    // The probe folds a bad public entry into its own status, so the wrapper
    // needs no special case — but the message must survive into syslog intact.
    writeRecordingDocker(
      JSON.stringify({
        status: 'unexpected',
        reason: 'public-entry',
        message: 'public entry https://shikakucheck.com/ returned 502',
        dataPlane: { status: 'ready', database: 'ok', message: null },
        public: { state: 'server-error', httpStatus: 502 },
        durationMs: 40,
      }),
      1,
    );

    const env = {
      DOCKER_ARGS: toPosixPath(dockerArgs),
      PUBLIC_READY_URL: 'https://shikakucheck.com/',
    };
    runScript(env);
    const { status, logs, state } = runScript(env);

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('status=unexpected');
    expect(logs[0]).toContain(
      'public entry https://shikakucheck.com/ returned 502',
    );
    expect(state).toBe('unexpected\n2\n');
  });

  it('treats the public entry going down as a transition, not a new state word', () => {
    // `unexpected` is an existing word in this state machine. If Sprint 3L had
    // introduced `web-down`, the machine would still have worked by accident
    // (anything not "ready" is failing) — which is exactly the kind of luck
    // that breaks silently later.
    seedState('ready', 0);
    writeRecordingDocker(
      JSON.stringify({
        status: 'unreachable',
        reason: 'tls',
        message:
          'public entry https://shikakucheck.com/ certificate has expired',
        dataPlane: { status: 'ready', database: 'ok', message: null },
        durationMs: 40,
      }),
      1,
    );

    const env = {
      DOCKER_ARGS: toPosixPath(dockerArgs),
      PUBLIC_READY_URL: 'https://shikakucheck.com/',
    };
    runScript(env);
    const { status, logs, notifications, state } = runScript(env);

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('reason=tls');
    expect(notifications).toHaveLength(1);
    expect(state).toBe('unreachable\n2\n');
  });
});
