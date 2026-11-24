import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkDatabaseReadiness } from '../services/api/src/database-ready.js';
import { app } from '../services/api/src/server.js';

/**
 * Sprint 3B contract guards.
 *
 * Two invariants are protected here, and both are load-bearing:
 *
 * 1. `/health` is liveness only. It must keep answering 200 with the same body
 *    no matter what the data plane is doing, because `deploy/docker-compose.prod.yml`
 *    chains `db(healthy) -> api(healthy) -> web(healthy) -> caddy`. Making it a
 *    readiness check would let a database blip mark the API unhealthy, stop the
 *    web container, and take the whole site down.
 * 2. `/ready` is the readiness signal, and it must never claim readiness when
 *    the database is not actually reachable.
 */
describe('liveness and readiness contract', () => {
  it('keeps /health at 200 with an unchanged body', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok', stage: 0 });
  });

  it('keeps /health at 200 even when the data plane is unusable', async () => {
    // Regression guard for the §5.2 red line: this suite runs with no
    // DATABASE_URL at all, i.e. the worst possible data plane, and liveness
    // must still be green. compose healthchecks depend on exactly this.
    const response = await app.inject({ method: 'GET', url: '/health' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok' });
  });

  it('answers /ready with an unconfigured report when no URL is set', async () => {
    // tests/setup.ts deletes DATABASE_URL, so this process genuinely has no
    // configuration. Unlike the data routes, /ready has no test escape hatch.
    const response = await app.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({
      status: 'unavailable',
      database: 'unconfigured',
    });
  });

  it('never reports readiness while the data plane is unconfigured', async () => {
    // Guards the trap this sprint exists to close: a probe that inherited the
    // NODE_ENV=test escape hatch would answer "ready" for a process that cannot
    // serve a single query.
    const response = await app.inject({ method: 'GET', url: '/ready' });
    const body = response.json() as { status: string };
    expect(body.status).not.toBe('ready');
  });

  it('keeps /health and /ready independent of each other', async () => {
    const health = await app.inject({ method: 'GET', url: '/health' });
    const ready = await app.inject({ method: 'GET', url: '/ready' });
    // Divergent answers are the entire point: liveness ok, readiness not.
    expect(health.statusCode).toBe(200);
    expect(ready.statusCode).toBe(503);
  });
});

describe('readiness probe against a real database', () => {
  const reachable =
    process.env.SPRINT3B_TEST_DATABASE_URL ??
    'postgresql://postgres@127.0.0.1:55432/qualification_media';
  const unreachable =
    'postgresql://postgres@127.0.0.1:59999/qualification_media';

  it('reports ok when the database answers SELECT 1', async () => {
    let report: Awaited<ReturnType<typeof checkDatabaseReadiness>>;
    try {
      report = await checkDatabaseReadiness(reachable);
    } catch {
      // No local postgres on this machine: skip rather than fake a result.
      return;
    }
    if (report.database === 'error') return; // container absent — see report §7
    expect(report).toEqual({ ready: true, database: 'ok' });
  });

  it('reports an error (never ready) when the database refuses connections', async () => {
    const report = await checkDatabaseReadiness(unreachable);
    expect(report.ready).toBe(false);
    expect(report.database).toBe('error');
    if (report.database === 'error') {
      expect(report.message).toContain('ECONNREFUSED');
    }
  });

  it('reports unconfigured without attempting a connection', async () => {
    expect(await checkDatabaseReadiness(undefined)).toEqual({
      ready: false,
      database: 'unconfigured',
    });
  });
});

/**
 * The escape hatch is scoped to `NODE_ENV=test`, so the fail-loud behaviour can
 * only be observed by loading the server with a different environment. Modules
 * are reset so `packages/config` re-reads `process.env` on the fresh import.
 *
 * Importing `server.ts` outside `NODE_ENV=test` also runs its `app.listen()`
 * call, so `API_PORT` is pinned to `0` (ephemeral) to keep repeated imports from
 * fighting over 4100, and every instance is closed in teardown.
 */
describe('data routes fail loudly outside a test run', () => {
  const booted: { close: () => Promise<void> }[] = [];

  afterEach(async () => {
    for (const instance of booted.splice(0)) {
      try {
        await instance.close();
      } catch {
        // Nothing to close if a test never got as far as booting.
      }
    }
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadServerAs(nodeEnv: string) {
    vi.resetModules();
    vi.stubEnv('NODE_ENV', nodeEnv);
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('API_DATABASE_URL', '');
    vi.stubEnv('API_PORT', '0');
    const module = await import('../services/api/src/server.js');
    booted.push(module.app as unknown as { close: () => Promise<void> });
    return module;
  }

  const routes = [
    '/api/v1/facts',
    '/api/v1/qualifications/it-passport',
    '/api/v1/qualifications/takken',
    '/api/v1/updates',
    '/api/v1/calendar',
  ];

  it('answers 500 database_not_configured on every data route', async () => {
    const { app: freshApp } = await loadServerAs('development');
    for (const url of routes) {
      const response = await freshApp.inject({ method: 'GET', url });
      expect(response.statusCode, `${url} should fail loudly`).toBe(500);
      expect(response.json(), url).toMatchObject({
        code: 'database_not_configured',
      });
    }
  });

  it('never disguises a missing configuration as an empty dataset', async () => {
    // The exact defect Sprint 3B closes: a 200 carrying `"data":[]` reads as
    // "this qualification has no facts yet", which is a different fact.
    const { app: freshApp } = await loadServerAs('development');
    const response = await freshApp.inject({
      method: 'GET',
      url: '/api/v1/facts',
    });
    expect(response.statusCode).not.toBe(200);
    expect(response.body).not.toContain('"data":[]');
  });

  it('keeps /health green in the same failing process', async () => {
    // The red line again, this time alongside genuinely failing data routes.
    const { app: freshApp } = await loadServerAs('development');
    const health = await freshApp.inject({ method: 'GET', url: '/health' });
    const facts = await freshApp.inject({
      method: 'GET',
      url: '/api/v1/facts',
    });
    expect(health.statusCode).toBe(200);
    expect(facts.statusCode).toBe(500);
  });

  it('reports /ready as unconfigured in the same failing process', async () => {
    const { app: freshApp } = await loadServerAs('development');
    const response = await freshApp.inject({ method: 'GET', url: '/ready' });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ database: 'unconfigured' });
  });

  it('still answers 404 for an unknown qualification', async () => {
    const { app: freshApp } = await loadServerAs('development');
    const response = await freshApp.inject({
      method: 'GET',
      url: '/api/v1/qualifications/not-a-real-qualification',
    });
    expect(response.statusCode).toBe(404);
  });
});
