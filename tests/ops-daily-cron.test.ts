import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

/**
 * Behaviour tests for scripts/ops-daily-cron.sh.
 *
 * The wrapper is POSIX sh, so the tests run it for real rather than
 * re-implementing its logic: a fake `docker` on PATH decides what the daily
 * report "printed" and records the arguments it was called with, a fake
 * `logger` records what would have reached syslog, and a stub notifier records
 * what would have been posted to Feishu.
 *
 * The real `docker compose run` needs a built production image, which a dev
 * machine does not have, so no case here touches Docker.
 *
 * On Windows the script is executed through WSL's bash, which ships the same
 * dash and util-linux `logger` as the Ubuntu VPS the cron entry targets.
 */

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, 'scripts', 'ops-daily-cron.sh');
const today = '2026-11-25';

let workDir: string;
let binDir: string;
let reportDir: string;
let loggerLog: string;
let notifyLog: string;
let notifyScript: string;
let dockerArgs: string;
let payloadFile: string;
let exitFile: string;

function toPosixPath(value: string): string {
  if (process.platform !== 'win32') return value;
  const match = /^([A-Za-z]):\\(.*)$/.exec(value);
  if (!match) return value.replace(/\\/g, '/');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function writeFakeDocker(): void {
  // Records its argv, then replays whatever the case staged as the report.
  writeFileSync(
    join(binDir, 'docker'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$DOCKER_ARGS"\n` +
      `[ -f "$FAKE_PAYLOAD" ] && cat "$FAKE_PAYLOAD"\n` +
      `[ -n "\${FAKE_STDERR:-}" ] && printf '%s\\n' "$FAKE_STDERR" >&2\n` +
      `exit "$(cat "$FAKE_EXIT_FILE" 2>/dev/null || echo 0)"\n`,
    'utf8',
  );
}

function writeFakeLogger(): void {
  writeFileSync(
    join(binDir, 'logger'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$LOGGER_LOG"\n`,
    'utf8',
  );
}

interface RunResult {
  status: number | null;
  logs: string[];
  notifications: string[];
  docker: string[];
  stderrFile: string;
}

function runScript(env: Record<string, string> = {}): RunResult {
  const assignments = {
    LOGGER_LOG: toPosixPath(loggerLog),
    NOTIFY_SCRIPT: toPosixPath(notifyScript),
    NOTIFY_LOG: toPosixPath(notifyLog),
    DOCKER_ARGS: toPosixPath(dockerArgs),
    FAKE_PAYLOAD: toPosixPath(payloadFile),
    FAKE_EXIT_FILE: toPosixPath(exitFile),
    OPS_VAR_DIR: toPosixPath(workDir),
    OPS_REPORT_DIR: toPosixPath(reportDir),
    OPS_TODAY: today,
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

  // The chmod is best-effort so a case can delete the fake docker to prove the
  // wrapper survives a missing binary.
  const command =
    `chmod +x ${quote(toPosixPath(join(binDir, 'docker')))} ` +
    `${quote(toPosixPath(join(binDir, 'logger')))} 2>/dev/null || true; ` +
    `${prefix} sh ${quote(toPosixPath(scriptPath))}`;

  const result =
    process.platform === 'win32'
      ? spawnSync('bash', ['-c', command], { cwd: repoRoot, encoding: 'utf8' })
      : spawnSync('sh', ['-c', command], { cwd: repoRoot, encoding: 'utf8' });

  const readLines = (file: string): string[] =>
    existsSync(file)
      ? readFileSync(file, 'utf8')
          .split('\n')
          .filter((line) => line.length > 0)
      : [];

  const errFile = join(reportDir, 'cron.err');

  return {
    status: result.status,
    logs: readLines(loggerLog),
    notifications: readLines(notifyLog),
    docker: readLines(dockerArgs),
    stderrFile: existsSync(errFile) ? readFileSync(errFile, 'utf8') : '',
  };
}

/** Stage the JSON the report would print on stdout. */
function stageReport(
  overrides: Record<string, unknown> = {},
  exitCode = 0,
): void {
  const report = {
    status: 'ok',
    hasCritical: false,
    notificationLevel: 'info',
    ...overrides,
  };
  writeFileSync(payloadFile, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  writeFileSync(exitFile, `${exitCode}\n`, 'utf8');
}

/** Stage the markdown archive the wrapper reads its action lines from. */
function stageMarkdown(body: string): void {
  mkdirSync(reportDir, { recursive: true });
  writeFileSync(join(reportDir, `${today}.md`), body, 'utf8');
}

function markdownWith(actions: string[]): string {
  const bullets = actions.map((action) => `- ${action}`).join('\n');
  return [
    '# 日检报告',
    '',
    '## 今日需处理',
    '',
    bullets || '无。',
    '',
    '## 摘要',
    '',
    '- 来源健康 ok',
    '',
  ].join('\n');
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
    'test-ops-daily-cron',
    String(Date.now()) + '-' + Math.random().toString(16).slice(2),
  );
  binDir = join(workDir, 'bin');
  reportDir = join(workDir, 'ops-reports');
  mkdirSync(binDir, { recursive: true });
  loggerLog = join(workDir, 'logger.log');
  notifyLog = join(workDir, 'notify.log');
  notifyScript = join(workDir, 'notify-stub.sh');
  dockerArgs = join(workDir, 'docker-args.log');
  payloadFile = join(workDir, 'report.json');
  exitFile = join(workDir, 'exit-code');
  writeFileSync(exitFile, '0\n', 'utf8');
  writeFakeDocker();
  writeFakeLogger();
  writeFileSync(
    notifyScript,
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "$NOTIFY_LOG"\n`,
    'utf8',
  );
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

describe('ops daily cron wrapper', () => {
  it('stays silent when the report is healthy', () => {
    stageReport();
    stageMarkdown(markdownWith([]));

    const { status, logs, notifications } = runScript();

    expect(status).toBe(0);
    expect(logs).toEqual([]);
    expect(notifications).toEqual([]);
  });

  it('announces critical findings with the action lines from the report', () => {
    stageReport({ hasCritical: true }, 1);
    stageMarkdown(markdownWith(['来源 fp 连续失败 3 次', '有 2 条事实到期']));

    const { status, logs, notifications } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('来源 fp 连续失败 3 次;有 2 条事实到期');
    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain('来源 fp 连续失败 3 次');
  });

  // The report gained `overallStatus` so a human reading the JSON stops mistaking
  // "the run worked" for "the site is fine". The wrapper must keep deciding on
  // `status` and `hasCritical` alone; otherwise a field added for readers would
  // silently start paging people.
  it('ignores overallStatus when deciding whether to speak', () => {
    // Deliberately contradictory: a health verdict the wrapper must not read.
    // If this ever starts paging, someone wired the new field into the wrapper.
    stageReport(
      { status: 'ok', hasCritical: false, overallStatus: 'action_needed' },
      0,
    );

    const { status, logs, notifications } = runScript();

    expect(status).toBe(0);
    expect(logs).toEqual([]);
    expect(notifications).toEqual([]);
  });

  it('reports a run that produced no report at all', () => {
    // The container never started: no stdout, and docker itself failed.
    writeFileSync(payloadFile, '', 'utf8');
    writeFileSync(exitFile, '1\n', 'utf8');
    const { status, logs } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('daemon.err');
    expect(logs[0]).toContain('report did not run');
  });

  it('reports not_run (no DATABASE_URL) instead of staying silent', () => {
    stageReport({ status: 'not_run', hasCritical: false });

    const { status, logs } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('report status=not_run');
  });

  it('carries the stderr tail when the report itself failed', () => {
    stageReport({ status: 'error' }, 1);

    const { status, logs, stderrFile } = runScript({
      FAKE_STDERR: 'Error: connect ECONNREFUSED 127.0.0.1:5432',
    });

    expect(status).toBe(0);
    expect(stderrFile).toContain('ECONNREFUSED');
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('report status=error');
    expect(logs[0]).toContain('stderr=Error: connect ECONNREFUSED');
  });

  it('keeps syslog only when OPS_NOTIFY is 0', () => {
    stageReport({ hasCritical: true }, 1);
    stageMarkdown(markdownWith(['有 1 条事实到期']));

    const { status, logs, notifications } = runScript({ OPS_NOTIFY: '0' });

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(notifications).toEqual([]);
  });

  it('still exits 0 when the notifier itself fails', () => {
    // The notifier is allowed to fail: the report already reached syslog.
    writeFileSync(notifyScript, '#!/bin/sh\nexit 1\n', 'utf8');
    stageReport({ hasCritical: true }, 1);
    stageMarkdown(markdownWith(['有 1 条事实到期']));

    const { status, logs } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
  });

  it('says the report lists no actions when the markdown is missing', () => {
    stageReport({ hasCritical: true }, 1);
    // No markdown staged, though the JSON says there is something to do.
    const { status, logs } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('lists no actions');
    expect(logs[0]).toContain(`${today}.md`);
  });

  it('never exits non-zero when docker is not installed', () => {
    rmSync(join(binDir, 'docker'));

    const { status, logs } = runScript();

    expect(status).toBe(0);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('report did not run');
  });

  it('runs the report in a throwaway container with var bind-mounted', () => {
    stageReport();

    const { docker } = runScript();

    expect(docker).toHaveLength(1);
    expect(docker[0]).toContain('compose');
    expect(docker[0]).toContain('-f deploy/docker-compose.prod.yml');
    expect(docker[0]).toContain('run');
    expect(docker[0]).toContain('--rm');
    expect(docker[0]).toContain('-T');
    expect(docker[0]).toContain(`-v ${toPosixPath(workDir)}:/app/var`);
    expect(docker[0]).toContain('api node scripts/ops-daily-report.mjs');
  });

  it('strips markdown emphasis before the message reaches syslog', () => {
    // The report is markdown; syslog and Feishu text are not. Leaving `**` and
    // backticks in makes the alert look like escaped garbage in both.
    stageReport({ hasCritical: true }, 1);
    stageMarkdown(
      markdownWith([
        '**source_critical** `source:bookkeeping:calendar-2026`：blocked',
      ]),
    );

    const { logs } = runScript();

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain(
      'source_critical source:bookkeeping:calendar-2026：blocked',
    );
    expect(logs[0]).not.toContain('**');
    expect(logs[0]).not.toContain('`');
  });

  it('caps the message at OPS_MAX_ACTIONS lines', () => {
    stageReport({ hasCritical: true }, 1);
    stageMarkdown(markdownWith(['第一条', '第二条', '第三条', '第四条']));

    const { logs } = runScript({ OPS_MAX_ACTIONS: '2' });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('第一条;第二条');
    expect(logs[0]).not.toContain('第三条');
  });

  it('honours COMPOSE_PROJECT', () => {
    stageReport();

    const { docker } = runScript({ COMPOSE_PROJECT: 'jpqm' });

    expect(docker[0]).toContain('-p jpqm');
  });

  it('honours OPS_TODAY when reading the markdown archive', () => {
    stageReport({ hasCritical: true }, 1);
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(
      join(reportDir, '2020-01-02.md'),
      markdownWith(['来自旧日期的动作']),
      'utf8',
    );

    const { logs } = runScript({ OPS_TODAY: '2020-01-02' });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('来自旧日期的动作');
  });

  it('makes a relative OPS_VAR_DIR absolute so docker does not create a volume', () => {
    // A relative -v source is a *named volume* to docker: the report would land
    // in a volume nobody looks at, and nothing would look wrong.
    const relativeVarDir = relative(repoRoot, workDir).replace(/\\/g, '/');
    stageReport();

    const { docker } = runScript({
      OPS_VAR_DIR: relativeVarDir,
      OPS_REPORT_DIR: `${relativeVarDir}/ops-reports`,
    });

    expect(docker).toHaveLength(1);
    expect(docker[0]).toContain(
      `-v ${toPosixPath(repoRoot)}/${relativeVarDir}:/app/var`,
    );
  });
});
