import { spawn, type ChildProcess } from 'node:child_process';
import { createHmac } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from 'vitest';

/**
 * scripts/notify-feishu.sh is a POSIX shell script, so these tests execute it for
 * real against a local HTTP server that impersonates the Feishu webhook.
 *
 * Both the script and the fake webhook run in a shell:
 *  - `sh` does not exist on Windows, so on Windows everything goes through WSL's
 *    bash (same approach as tests/readiness-cron.test.ts).
 *  - The server is a child process rather than an in-process listener because
 *    WSL2 has its own network namespace: a server started by the Windows vitest
 *    process is unreachable from inside WSL. Keeping both in the shell puts them
 *    on the same localhost, and works unchanged on Linux CI.
 *
 * The server writes the port it bound and every request body it saw into files,
 * so the assertions stay plain file reads.
 */

const repoRoot = process.cwd();
const scriptPath = join(repoRoot, 'scripts', 'notify-feishu.sh');
const isWindows = process.platform === 'win32';
const shell = isWindows ? 'bash' : 'sh';
const workRoot = join(repoRoot, 'var', 'test-notify-feishu');

const SERVER_SOURCE = `
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const [portFile, requestLog, modeFile] = process.argv.slice(2);

function currentMode() {
  try {
    return readFileSync(modeFile, 'utf8').trim() || 'ok';
  } catch {
    return 'ok';
  }
}

const server = createServer((request, response) => {
  let body = '';
  request.on('data', (chunk) => (body += chunk));
  request.on('end', () => {
    appendFileSync(requestLog, JSON.stringify({ body }) + '\\n');
    const mode = currentMode();
    if (mode === 'rate-limit') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 9499, msg: 'too many request' }));
      return;
    }
    if (mode === 'bad-sign') {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ code: 19021, msg: 'sign match fail' }));
      return;
    }
    if (mode === 'http-500') {
      response.writeHead(500, { 'content-type': 'text/plain' });
      response.end('boom');
      return;
    }
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ code: 0, msg: 'success', data: {} }));
  });
});

server.listen(0, '127.0.0.1', () => {
  writeFileSync(portFile, String(server.address().port));
});
`;

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

let serverProcess: ChildProcess | undefined;
let hookUrl = '';
let workDir = '';
let portFile = '';
let requestLog = '';
let modeFile = '';

function toPosixPath(value: string): string {
  if (!isWindows) return value;
  const match = /^([A-Za-z]):\\(.*)$/.exec(value);
  if (!match) return value.replace(/\\/g, '/');
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function quote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForPort(file: string, timeoutMs: number): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (existsSync(file)) {
      const value = readFileSync(file, 'utf8').trim();
      if (value.length > 0) return value;
    }
    await sleep(50);
  }
  throw new Error(`fake webhook did not report a port within ${timeoutMs}ms`);
}

function run(
  env: Record<string, string>,
  args: string,
  stdin?: string,
): Promise<RunResult> {
  const assignments = Object.entries(env)
    .map(([key, value]) => {
      // FEISHU_ENV_FILE is a filesystem path; everything else is a URL or literal.
      const resolved = key === 'FEISHU_ENV_FILE' ? toPosixPath(value) : value;
      return `${key}=${quote(resolved)}`;
    })
    .join(' ');
  let command = `${assignments} sh ${quote(toPosixPath(scriptPath))} ${args}`;
  if (stdin !== undefined) {
    const stdinFile = join(workDir, 'stdin.txt');
    writeFileSync(stdinFile, stdin, 'utf8');
    command = `${assignments} sh ${quote(toPosixPath(scriptPath))} ${args} < ${quote(toPosixPath(stdinFile))}`;
  }

  return new Promise((resolve) => {
    const child = spawn(shell, ['-c', command], { cwd: repoRoot });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function sign(timestamp: string, secret: string): string {
  return createHmac('sha256', `${timestamp}\n${secret}`)
    .update('')
    .digest('base64');
}

/** Request bodies the fake webhook received during the current test. */
function received(): Array<{ body: string }> {
  if (!existsSync(requestLog)) return [];
  return readFileSync(requestLog, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as { body: string });
}

function setMode(mode: 'ok' | 'rate-limit' | 'bad-sign' | 'http-500'): void {
  writeFileSync(modeFile, mode, 'utf8');
}

beforeAll(async () => {
  mkdirSync(workRoot, { recursive: true });
  workDir = mkdtempSync(join(workRoot, 'server-'));
  portFile = join(workDir, 'port.txt');
  requestLog = join(workDir, 'requests.log');
  modeFile = join(workDir, 'mode.txt');
  writeFileSync(modeFile, 'ok', 'utf8');

  const serverSource = join(workDir, 'fake-feishu-server.mjs');
  writeFileSync(serverSource, SERVER_SOURCE, 'utf8');

  const command = `node ${quote(toPosixPath(serverSource))} ${quote(toPosixPath(portFile))} ${quote(toPosixPath(requestLog))} ${quote(toPosixPath(modeFile))}`;
  serverProcess = spawn(shell, ['-c', command], {
    cwd: repoRoot,
    stdio: 'ignore',
  });

  const port = await waitForPort(portFile, 60_000);
  hookUrl = `http://127.0.0.1:${port}/open-apis/bot/v2/hook/test-token`;
}, 120_000);

beforeEach(() => {
  setMode('ok');
  // Start every test from an empty request log.
  writeFileSync(requestLog, '', 'utf8');
});

afterEach(() => {
  // Nothing to undo beyond the log reset in beforeEach.
});

afterAll(async () => {
  serverProcess?.kill();
  await sleep(100);
  rmSync(workRoot, { recursive: true, force: true });
});

function baseEnv(extra: Record<string, string> = {}): Record<string, string> {
  return {
    FEISHU_WEBHOOK: hookUrl,
    FEISHU_TIMEOUT: '5',
    FEISHU_RETRY_DELAY: '0',
    ...extra,
  };
}

describe('notify-feishu payload', () => {
  it('delivers a text message', async () => {
    const result = await run(baseEnv(), "--text 'plain hello'");

    expect(result.code).toBe(0);
    const requests = received();
    expect(requests).toHaveLength(1);
    const payload = JSON.parse(requests[0].body) as {
      msg_type: string;
      content: { text: string };
    };
    expect(payload.msg_type).toBe('text');
    expect(payload.content.text).toBe('plain hello');
  });

  it('reads the message from stdin', async () => {
    const result = await run(baseEnv(), '--stdin', 'from stdin\n');

    expect(result.code).toBe(0);
    const payload = JSON.parse(received()[0].body) as {
      content: { text: string };
    };
    expect(payload.content.text).toBe('from stdin');
  });

  it('sends a self-check message with --test', async () => {
    const result = await run(baseEnv(), '--test');

    expect(result.code).toBe(0);
    const payload = JSON.parse(received()[0].body) as {
      content: { text: string };
    };
    expect(payload.content.text).toContain('self-check');
  });

  it('keeps quotes, backslashes and newlines valid', async () => {
    const message = 'he said "hi" \\ and\ntwo lines';
    const result = await run(baseEnv(), '--stdin', `${message}\n`);

    expect(result.code).toBe(0);
    // Parsing is the assertion: invalid escaping would throw here.
    const payload = JSON.parse(received()[0].body) as {
      content: { text: string };
    };
    expect(payload.content.text).toBe(message);
  });

  it('keeps non-ASCII text intact', async () => {
    const message = 'データベースに接続できません — データ面が利用不可';
    const result = await run(baseEnv(), '--stdin', `${message}\n`);

    expect(result.code).toBe(0);
    const payload = JSON.parse(received()[0].body) as {
      content: { text: string };
    };
    expect(payload.content.text).toBe(message);
  });
});

describe('notify-feishu signing', () => {
  it('signs with timestamp and HMAC when a secret is set', async () => {
    const secret = 'test-secret-value';
    const result = await run(
      baseEnv({ FEISHU_SIGN_SECRET: secret }),
      "--text 'signed'",
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(received()[0].body) as {
      timestamp: string;
      sign: string;
    };
    expect(payload.timestamp).toMatch(/^\d+$/);
    // Independent implementation of the documented algorithm.
    expect(payload.sign).toBe(sign(payload.timestamp, secret));
  });

  it('omits signing fields when no secret is set', async () => {
    const result = await run(baseEnv(), "--text 'unsigned'");

    expect(result.code).toBe(0);
    const payload = JSON.parse(received()[0].body) as Record<string, unknown>;
    expect(payload).not.toHaveProperty('sign');
    expect(payload).not.toHaveProperty('timestamp');
  });
});

describe('notify-feishu credentials', () => {
  it('fails with a clear message when the webhook is missing', async () => {
    const result = await run(
      baseEnv({
        FEISHU_WEBHOOK: '',
        FEISHU_ENV_FILE: join(workDir, 'absent.env'),
      }),
      '--text x',
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('FEISHU_WEBHOOK is not configured');
    expect(received()).toHaveLength(0);
  });

  it('falls back to the env file and keeps "=" padding in the secret', async () => {
    // base64 secrets end in "="; `cut -d= -f2` would truncate it, `-f2-` does not.
    const secret = 'c2VjcmV0LXdpdGgtcGFkZGluZy0=';
    const envFile = join(workDir, 'creds.env');
    writeFileSync(
      envFile,
      `FEISHU_WEBHOOK=${hookUrl}?pad=\nFEISHU_SIGN_SECRET=${secret}\n`,
      'utf8',
    );

    const result = await run(
      baseEnv({
        FEISHU_WEBHOOK: '',
        FEISHU_SIGN_SECRET: '',
        FEISHU_ENV_FILE: envFile,
      }),
      "--text 'from env file'",
    );

    expect(result.code).toBe(0);
    const payload = JSON.parse(received()[0].body) as {
      timestamp: string;
      sign: string;
    };
    expect(payload.sign).toBe(sign(payload.timestamp, secret));
  });

  it('never prints the webhook or the secret', async () => {
    setMode('http-500');
    const result = await run(
      baseEnv({ FEISHU_SIGN_SECRET: 'super-secret-value' }),
      "--text 'leak'",
    );

    expect(result.code).toBe(1);
    for (const output of [result.stdout, result.stderr]) {
      expect(output).not.toContain('test-token');
      expect(output).not.toContain('super-secret-value');
    }
  });
});

describe('notify-feishu retry policy', () => {
  it('retries HTTP 5xx three times and reports the attempt count', async () => {
    setMode('http-500');
    const result = await run(baseEnv(), "--text 'retry me'");

    expect(result.code).toBe(1);
    expect(received()).toHaveLength(3);
    expect(result.stderr).toContain('after 3 attempt(s)');
  });

  it('retries the rate-limit code 9499', async () => {
    setMode('rate-limit');
    const result = await run(baseEnv(), "--text 'rate limited'");

    expect(result.code).toBe(1);
    expect(received()).toHaveLength(3);
  });

  it('does not retry a bad signature', async () => {
    setMode('bad-sign');
    const result = await run(baseEnv(), "--text 'bad sign'");

    expect(result.code).toBe(1);
    expect(received()).toHaveLength(1);
  });

  it('reports a failure without the credentials when the host is unreachable', async () => {
    const result = await run(
      baseEnv({
        FEISHU_WEBHOOK: 'http://127.0.0.1:1/open-apis/bot/v2/hook/dead',
      }),
      "--text 'nobody home'",
    );

    expect(result.code).toBe(1);
    expect(result.stderr).toContain('delivery failed');
    expect(result.stderr).not.toContain('dead');
  });
});
