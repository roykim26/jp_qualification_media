import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchQualifications } from '../packages/schema/src/qualifications.js';

/**
 * Sprint 2B: an unusable upstream must not be rendered as an empty 200 page.
 *
 * These tests drive the real `handleRequest` against a stub official-information
 * API, so every assertion below is a reproducible request/response path rather
 * than a mock of our own error handling:
 *
 *   - upstream healthy with facts          -> 200, indexable page
 *   - upstream healthy with no facts       -> 200, a legitimately empty page
 *   - upstream 500                         -> 503, noindex, never in sitemap
 *   - upstream unreachable (connection)    -> 503
 *   - upstream down, static route          -> still 200 (not a global 503)
 *   - upstream down, home page             -> still 200 (healthcheck depends on it)
 *   - upstream recovers                    -> 200 again
 */

type StubMode = 'ok' | 'empty' | 'server-error';

const itPassport = launchQualifications.find(
  (qualification) => qualification.slug === 'it-passport',
)!;

let stubMode: StubMode = 'ok';
let stubServer: ReturnType<typeof createServer>;
let stubBaseUrl = '';

/** A port that nothing listens on, to exercise a connection-level failure. */
let closedPort = 0;

function stubView() {
  const facts =
    stubMode === 'empty'
      ? []
      : [
          {
            qualificationSlug: 'it-passport',
            examLevelId: null,
            examYear: 2025,
            factKey: 'fee',
            valueType: 'text',
            normalizedValue: '7,500円',
            displayValue: '7,500円（税込）',
            status: 'approved',
            riskLevel: 'medium',
            sourceId: 'source:it-passport:ipa-fee',
            sourceSnapshotId: 'snapshot:official',
            synthetic: false,
            verifiedAt: '2026-08-11T00:00:00.000Z',
            officialVerifiedAt: '2026-08-11T00:00:00.000Z',
          },
        ];
  return {
    qualification: itPassport,
    status: facts.length === 0 ? 'awaiting_official' : 'verified',
    facts,
    officialVerifiedAt: '2026-08-11T00:00:00.000Z',
    missingReasons: {},
  };
}

beforeAll(async () => {
  stubServer = createServer((req, res) => {
    if (stubMode === 'server-error') {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'upstream exploded' }));
      return;
    }
    if (req.url?.startsWith('/api/v1/qualifications/')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(stubView()));
      return;
    }
    if (req.url?.startsWith('/api/v1/calendar')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [] }));
      return;
    }
    if (req.url?.startsWith('/api/v1/updates')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [], pagination: { hasMore: false } }));
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
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
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
});

/**
 * `apiBaseUrl` is read once at module load, so each scenario loads the server
 * module fresh against the base URL it needs.
 */
async function startWeb(apiBaseUrl: string) {
  process.env.NODE_ENV = 'test';
  process.env.API_BASE_URL = apiBaseUrl;
  vi.resetModules();
  const { handleRequest } = (await import('../apps/web/src/server.js')) as {
    handleRequest: (
      req: IncomingMessage,
      res: ServerResponse,
    ) => Promise<unknown>;
  };
  const server = createServer((req, res) => {
    void handleRequest(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    get: (path: string) => fetch(`${baseUrl}${path}`),
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe('web server upstream failure handling', () => {
  it('serves a real page with 200 when the upstream has approved facts', async () => {
    stubMode = 'ok';
    const web = await startWeb(stubBaseUrl);
    try {
      const response = await web.get('/shikaku/it-passport/');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('ITパスポート');
      expect(html).not.toContain(
        '<meta name="robots" content="noindex,follow">',
      );
    } finally {
      await web.close();
    }
  });

  it('keeps a legitimately empty upstream result at 200', async () => {
    stubMode = 'empty';
    const web = await startWeb(stubBaseUrl);
    try {
      const response = await web.get('/shikaku/it-passport/');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('ITパスポート');
      // An empty section is a real answer about the data ("nothing approved
      // yet"), so it renders the qualification page — never the outage page.
      expect(html).not.toContain('情報を取得できませんでした');
    } finally {
      await web.close();
    }
  });

  it('answers 503 with a noindex page when the upstream returns 5xx', async () => {
    stubMode = 'server-error';
    const web = await startWeb(stubBaseUrl);
    try {
      const response = await web.get('/shikaku/it-passport/');
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('<meta name="robots" content="noindex,follow">');
      expect(html).not.toContain('rel="canonical"');
      expect(html).toContain('情報を取得できませんでした');
    } finally {
      await web.close();
    }
  });

  it('answers 503 when the upstream cannot be reached at all', async () => {
    const web = await startWeb(`http://127.0.0.1:${closedPort}`);
    try {
      const response = await web.get('/shikaku/it-passport/');
      expect(response.status).toBe(503);
      expect(await response.text()).toContain(
        '<meta name="robots" content="noindex,follow">',
      );
    } finally {
      await web.close();
    }
  });

  it('answers 503 for the sitemap so a failed build is never indexed', async () => {
    stubMode = 'server-error';
    const web = await startWeb(stubBaseUrl);
    try {
      const response = await web.get('/sitemap.xml');
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).not.toContain('<urlset');
    } finally {
      await web.close();
    }
  });

  it('leaves static routes at 200 while the upstream is down', async () => {
    const web = await startWeb(`http://127.0.0.1:${closedPort}`);
    try {
      const response = await web.get('/robots.txt');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('Sitemap:');
    } finally {
      await web.close();
    }
  });

  it('keeps the home page at 200 while the upstream is down', async () => {
    // deploy/docker-compose.prod.yml healthchecks `/`, so this route must never
    // turn into a 503: an unhealthy web container stops Caddy from starting.
    const web = await startWeb(`http://127.0.0.1:${closedPort}`);
    try {
      const response = await web.get('/');
      expect(response.status).toBe(200);
    } finally {
      await web.close();
    }
  });

  it('returns to 200 once the upstream recovers', async () => {
    stubMode = 'server-error';
    const web = await startWeb(stubBaseUrl);
    try {
      expect((await web.get('/shikaku/it-passport/')).status).toBe(503);
      stubMode = 'ok';
      const recovered = await web.get('/shikaku/it-passport/');
      expect(recovered.status).toBe(200);
      expect(await recovered.text()).toContain('ITパスポート');
    } finally {
      stubMode = 'ok';
      await web.close();
    }
  });
});
