import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { spawn } from 'node:child_process';
import path from 'node:path';
import {
  classifyReadiness,
  formatReport,
  parseProbeArgs,
  probeReadiness,
  resolveReadyUrl,
  type ReadinessClassification,
  type ReadinessReport,
} from '../scripts/check-readiness.mjs';

/**
 * Sprint 3D: `/ready` existed but nothing called it, so the only signal that
 * the data plane was down was a user complaint. These tests cover the probe
 * that consumes it.
 *
 * The four contract states come straight from
 * `services/api/src/database-ready.ts`:
 *
 *   200 { status: "ready",        database: "ok" }           -> ready
 *   503 { status: "unavailable",  database: "error", message } -> error
 *   503 { status: "unavailable",  database: "unconfigured" }   -> unconfigured
 *   anything else                                             -> unexpected
 *
 * Two of the tests drive a real child process against a real socket, because
 * the properties that matter (a deadline that actually fires, and an exit code
 * an alert can read) cannot be proven by calling a function in-process.
 */

const scriptPath = path.resolve('scripts/check-readiness.mjs');

/**
 * Narrow a classification to its `unexpected` arm. The declaration file models
 * the result as a discriminated union, so the extra fields (`rawBody`, `reason`)
 * only exist on the matching arm — assert once here rather than scattering
 * `as any` through the assertions.
 */
function expectUnexpected(
  result: ReadinessClassification,
): Extract<ReadinessClassification, { status: 'unexpected' }> {
  expect(result.status).toBe('unexpected');
  return result as Extract<ReadinessClassification, { status: 'unexpected' }>;
}

function expectUnreachable(
  report: ReadinessReport,
): Extract<ReadinessReport, { status: 'unreachable' }> {
  expect(report.status).toBe('unreachable');
  return report as Extract<ReadinessReport, { status: 'unreachable' }>;
}

type StubMode =
  'ready' | 'error' | 'unconfigured' | 'html-500' | 'contradictory' | 'hang';

let stubMode: StubMode = 'ready';
let stubServer: ReturnType<typeof createServer>;
let stubBaseUrl = '';
const stalledResponses = new Set<ServerResponse>();
let closedPort = 0;

beforeAll(async () => {
  stubServer = createServer((req, res) => {
    if (stubMode === 'hang') {
      // Accept, read the request, answer nothing: the shape of a stalled
      // upstream that only a real deadline can cut off.
      stalledResponses.add(res);
      return;
    }
    if (stubMode === 'error') {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({
          status: 'unavailable',
          database: 'error',
          message: 'connect ECONNREFUSED 127.0.0.1:5432',
        }),
      );
      return;
    }
    if (stubMode === 'unconfigured') {
      res.writeHead(503, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify({ status: 'unavailable', database: 'unconfigured' }),
      );
      return;
    }
    if (stubMode === 'html-500') {
      res.writeHead(500, { 'content-type': 'text/html' });
      res.end('<html><body>Internal Server Error</body></html>');
      return;
    }
    if (stubMode === 'contradictory') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'unavailable', database: 'ok' }));
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ready', database: 'ok' }));
  });
  await new Promise<void>((resolve) =>
    stubServer.listen(0, '127.0.0.1', resolve),
  );
  stubBaseUrl = `http://127.0.0.1:${(stubServer.address() as AddressInfo).port}`;

  const throwaway = createServer();
  await new Promise<void>((resolve) =>
    throwaway.listen(0, '127.0.0.1', resolve),
  );
  closedPort = (throwaway.address() as AddressInfo).port;
  await new Promise<void>((resolve) => throwaway.close(() => resolve()));
});

afterAll(async () => {
  for (const stalled of stalledResponses) stalled.destroy();
  stalledResponses.clear();
  stubServer.closeAllConnections?.();
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
});

/**
 * Run the CLI as a real child process and wait for it to finish.
 *
 * This must be asynchronous: the stub server lives in *this* process, so a
 * synchronous spawn would block the event loop and the stub could never answer.
 * The probe would then report "connection refused" for reasons that have
 * nothing to do with the code under test.
 */
function runProbe(args: string[]): Promise<{
  code: number | null;
  stdout: string;
  stderr: string;
  elapsedMs: number;
}> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const child = spawn(process.execPath, [scriptPath, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => (stdout += chunk));
    child.stderr.on('data', (chunk: string) => (stderr += chunk));
    const killTimer = setTimeout(() => child.kill('SIGKILL'), 15_000);
    child.on('close', (code) => {
      clearTimeout(killTimer);
      resolve({ code, stdout, stderr, elapsedMs: Date.now() - startedAt });
    });
  });
}

describe('resolveReadyUrl', () => {
  it('prefers an explicit override over everything else', () => {
    expect(
      resolveReadyUrl(
        {
          READY_URL: 'http://ready.internal/ready',
          API_BASE_URL: 'http://api:4100',
        },
        'http://override:9000/ready',
      ),
    ).toBe('http://override:9000/ready');
  });

  it('falls back to READY_URL, then API_BASE_URL, then the local default', () => {
    expect(
      resolveReadyUrl({
        READY_URL: 'http://ready.internal/ready',
        API_BASE_URL: 'http://api:4100',
      }),
    ).toBe('http://ready.internal/ready');
    expect(resolveReadyUrl({ API_BASE_URL: 'http://api:4100' })).toBe(
      'http://api:4100/ready',
    );
    expect(resolveReadyUrl({})).toBe('http://127.0.0.1:4100/ready');
  });

  it('normalises trailing slashes instead of producing a double slash', () => {
    // The probe composes `${base}/ready`; an unnormalised base would emit
    // `http://api:4100//ready`, which some proxies treat as a different path.
    expect(resolveReadyUrl({ API_BASE_URL: 'http://api:4100/' })).toBe(
      'http://api:4100/ready',
    );
    expect(resolveReadyUrl({ API_BASE_URL: 'http://api:4100///' })).toBe(
      'http://api:4100/ready',
    );
    expect(resolveReadyUrl({ READY_URL: 'http://api:4100/ready/' })).toBe(
      'http://api:4100/ready',
    );
  });

  it('rejects values that are not absolute http(s) URLs', () => {
    expect(() => resolveReadyUrl({ API_BASE_URL: '/api' })).toThrow(
      /absolute http\(s\) URL/,
    );
    expect(() => resolveReadyUrl({ API_BASE_URL: 'ftp://api' })).toThrow(
      /absolute http\(s\) URL/,
    );
    expect(() => resolveReadyUrl({}, 'not-a-url')).toThrow(
      /absolute http\(s\) URL/,
    );
  });
});

describe('parseProbeArgs', () => {
  it('defaults to the standard deadline and human output', () => {
    expect(parseProbeArgs([])).toEqual({
      url: undefined,
      timeoutMs: 5000,
      json: false,
    });
  });

  it('accepts url, timeout and json flags', () => {
    expect(
      parseProbeArgs(['--url=http://x:1/ready', '--timeout=250', '--json']),
    ).toEqual({ url: 'http://x:1/ready', timeoutMs: 250, json: true });
  });

  it('rejects non-positive and non-numeric deadlines', () => {
    for (const bad of ['0', '-1', 'abc', '', '1.5']) {
      expect(() => parseProbeArgs([`--timeout=${bad}`])).toThrow(
        /--timeout must be a positive integer/,
      );
    }
  });

  it('rejects unknown options rather than ignoring them', () => {
    expect(() => parseProbeArgs(['--nope'])).toThrow(/unknown option/);
    expect(() => parseProbeArgs(['--url='])).toThrow(/--url requires a value/);
  });
});

describe('classifyReadiness', () => {
  it('reads the three contract states', () => {
    expect(
      classifyReadiness(
        200,
        JSON.stringify({ status: 'ready', database: 'ok' }),
      ),
    ).toEqual({ status: 'ready', database: 'ok', message: null });
    expect(
      classifyReadiness(
        503,
        JSON.stringify({
          status: 'unavailable',
          database: 'error',
          message: 'connect ECONNREFUSED',
        }),
      ),
    ).toEqual({
      status: 'error',
      database: 'error',
      message: 'connect ECONNREFUSED',
    });
    expect(
      classifyReadiness(
        503,
        JSON.stringify({ status: 'unavailable', database: 'unconfigured' }),
      ),
    ).toEqual({
      status: 'unconfigured',
      database: 'unconfigured',
      message: null,
    });
  });

  it('never reports ready without database "ok"', () => {
    expect(classifyReadiness(200, '{}').status).toBe('unexpected');
    expect(classifyReadiness(200, 'not json at all').status).toBe('unexpected');
    expect(classifyReadiness(200, '').status).toBe('unexpected');
    expect(
      classifyReadiness(200, JSON.stringify({ status: 'ready' })).status,
    ).toBe('unexpected');
  });

  it('treats a contradictory status field as unexpected, not as trusted', () => {
    const mismatch = classifyReadiness(
      200,
      JSON.stringify({ status: 'unavailable', database: 'ok' }),
    );
    expect(mismatch.status).toBe('unexpected');
    expect(mismatch.message).toMatch(/contradicts/);
  });

  it('reports an unrecognised status or body as unexpected with a body excerpt', () => {
    const html = expectUnexpected(
      classifyReadiness(500, '<html><body>boom</body></html>'),
    );
    expect(html.rawBody).toContain('boom');
    expect(classifyReadiness(503, '{}').status).toBe('unexpected');
    expect(classifyReadiness(418, '{}').status).toBe('unexpected');
  });

  it('caps the retained body excerpt', () => {
    // An unexpected state carries a body excerpt for diagnosis; it must not be
    // able to grow to the size of a stray HTML error page.
    const huge = `<html>${'x'.repeat(5000)}</html>`;
    const result = expectUnexpected(classifyReadiness(500, huge));
    expect(result.rawBody.length).toBeLessThanOrEqual(201);
  });
});

describe('formatReport', () => {
  it('prints one readable line per state', () => {
    const ready = formatReport({
      status: 'ready',
      database: 'ok',
      message: null,
      url: 'http://api:4100/ready',
      httpStatus: 200,
      durationMs: 7,
      checkedAt: '2026-11-24T00:00:00.000Z',
    });
    expect(ready).toContain('ready');
    expect(ready).toContain('HTTP 200');
    expect(ready).toContain('7ms');

    const unreachable = formatReport({
      status: 'unreachable',
      reason: 'timeout',
      database: null,
      message: 'no answer within 300ms',
      code: null,
      url: 'http://api:4100/ready',
      httpStatus: null,
      durationMs: 310,
      checkedAt: '2026-11-24T00:00:00.000Z',
    });
    expect(unreachable).toContain('reason=timeout');
    expect(unreachable).toContain('no answer within 300ms');
  });
});

describe('probeReadiness against a real socket', () => {
  it('returns ready for a healthy endpoint', async () => {
    stubMode = 'ready';
    const report = await probeReadiness({ url: `${stubBaseUrl}/ready` });
    expect(report.status).toBe('ready');
    expect(report.httpStatus).toBe(200);
  });

  it('separates a configuration failure from a connection failure', async () => {
    stubMode = 'error';
    const failed = await probeReadiness({ url: `${stubBaseUrl}/ready` });
    expect(failed.status).toBe('error');
    expect(failed.message).toContain('ECONNREFUSED');

    stubMode = 'unconfigured';
    const unconfigured = await probeReadiness({ url: `${stubBaseUrl}/ready` });
    expect(unconfigured.status).toBe('unconfigured');

    const refused = expectUnreachable(
      await probeReadiness({
        url: `http://127.0.0.1:${closedPort}/ready`,
        timeoutMs: 2000,
      }),
    );
    expect(refused.reason).toBe('connect');
  });

  it('cuts off a stalled endpoint at the deadline instead of hanging', async () => {
    stubMode = 'hang';
    const startedAt = Date.now();
    const report = expectUnreachable(
      await probeReadiness({
        url: `${stubBaseUrl}/ready`,
        timeoutMs: 250,
      }),
    );
    const elapsed = Date.now() - startedAt;
    expect(report.reason).toBe('timeout');
    // Generous ceiling: the point is that it returned at all, and that the
    // deadline — not a stub-side disconnect — is what ended the wait.
    expect(elapsed).toBeLessThan(3000);
    expect(report.durationMs).toBeLessThan(3000);
    stubMode = 'ready';
  });
});

describe('CLI exit codes', () => {
  it('exits 0 when the data plane is ready', async () => {
    stubMode = 'ready';
    const { code, stdout } = await runProbe([
      `--url=${stubBaseUrl}/ready`,
      '--json',
    ]);
    expect(code).toBe(0);
    expect(JSON.parse(stdout).status).toBe('ready');
  });

  it('exits 1 for every non-ready state, with the reason in the JSON', async () => {
    stubMode = 'unconfigured';
    const unconfigured = await runProbe([
      `--url=${stubBaseUrl}/ready`,
      '--json',
    ]);
    expect(unconfigured.code).toBe(1);
    expect(JSON.parse(unconfigured.stdout).status).toBe('unconfigured');

    stubMode = 'html-500';
    const broken = await runProbe([`--url=${stubBaseUrl}/ready`, '--json']);
    expect(broken.code).toBe(1);
    expect(JSON.parse(broken.stdout).status).toBe('unexpected');

    const refused = await runProbe([
      `--url=http://127.0.0.1:${closedPort}/ready`,
      '--timeout=2000',
      '--json',
    ]);
    expect(refused.code).toBe(1);
    expect(JSON.parse(refused.stdout).status).toBe('unreachable');
  });

  it('exits 1 within the deadline against a hung endpoint', async () => {
    stubMode = 'hang';
    const { code, stdout, elapsedMs } = await runProbe([
      `--url=${stubBaseUrl}/ready`,
      '--timeout=300',
      '--json',
    ]);
    expect(code).toBe(1);
    const report = JSON.parse(stdout);
    expect(report.status).toBe('unreachable');
    expect(report.reason).toBe('timeout');
    // Includes node startup; the deadline alone is 300ms.
    expect(elapsedMs).toBeLessThan(5000);
    stubMode = 'ready';
  });

  it('exits 1 with usage text on a bad option', async () => {
    const { code, stderr } = await runProbe(['--timeout=0']);
    expect(code).toBe(1);
    expect(stderr).toContain('--timeout must be a positive integer');
    expect(stderr).toContain('usage:');
  });
});
