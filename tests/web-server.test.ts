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
 * Sprint 3A adds the two failure modes that used to have no bounded answer:
 * a stalled request (no response ever) and the sitemap's error format.
 *
 * These tests drive the real `handleRequest` against a stub official-information
 * API, so every assertion below is a reproducible request/response path rather
 * than a mock of our own error handling:
 *
 *   - upstream healthy with facts          -> 200, indexable page
 *   - upstream healthy with no facts       -> 200, a legitimately empty page
 *   - upstream 500                         -> 503, noindex, never in sitemap
 *   - upstream unreachable (connection)    -> 503
 *   - upstream accepts then never answers  -> 503 after the deadline
 *   - upstream down, static route          -> still 200 (not a global 503)
 *   - upstream down, home page             -> still 200 (healthcheck depends on it)
 *   - upstream recovers                    -> 200 again
 *   - sitemap healthy                      -> 200 + application/xml + urlset
 *   - sitemap while the upstream fails     -> 503 + application/xml, no urlset
 */

type StubMode = 'ok' | 'empty' | 'server-error' | 'hang';

const itPassport = launchQualifications.find(
  (qualification) => qualification.slug === 'it-passport',
)!;

let stubMode: StubMode = 'ok';
let stubServer: ReturnType<typeof createServer>;
let stubBaseUrl = '';

/**
 * Responses the stub accepted but deliberately never answered.  They are
 * destroyed on teardown so `stubServer.close()` cannot wait on them forever.
 */
const stalledResponses = new Set<ServerResponse>();

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
    if (stubMode === 'hang') {
      // Accept the connection, read the request, then answer nothing: the
      // exact shape of a hung upstream that the fetch deadline must cut off.
      stalledResponses.add(res);
      return;
    }
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
  for (const stalled of stalledResponses) stalled.destroy();
  stalledResponses.clear();
  stubServer.closeAllConnections?.();
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
});

/**
 * `apiBaseUrl` is read once at module load, so each scenario loads the server
 * module fresh against the base URL it needs.  `upstreamTimeoutMs` is read the
 * same way, which lets the timeout scenario use a deadline short enough to
 * observe without sleeping for the production value.
 */
async function startWeb(
  apiBaseUrl: string,
  options: { upstreamTimeoutMs?: number } = {},
) {
  process.env.NODE_ENV = 'test';
  process.env.API_BASE_URL = apiBaseUrl;
  if (options.upstreamTimeoutMs === undefined)
    delete process.env.UPSTREAM_TIMEOUT_MS;
  else process.env.UPSTREAM_TIMEOUT_MS = String(options.upstreamTimeoutMs);
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

  it('answers 503 when the upstream accepts the connection but never answers', async () => {
    // Sprint 3A / Task A: without a deadline this request never returns at all,
    // so neither 503 nor Retry-After can ever be sent.
    stubMode = 'hang';
    const web = await startWeb(stubBaseUrl, { upstreamTimeoutMs: 250 });
    try {
      const startedAt = Date.now();
      const response = await web.get('/shikaku/it-passport/');
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('情報を取得できませんでした');
      expect(html).toContain('<meta name="robots" content="noindex,follow">');
      // The deadline, not the stub, ended the request.
      expect(Date.now() - startedAt).toBeLessThan(5_000);
    } finally {
      stubMode = 'ok';
      await web.close();
    }
  });

  it('serves the sitemap as XML with urlset when the upstream is healthy', async () => {
    stubMode = 'ok';
    const web = await startWeb(stubBaseUrl);
    try {
      const response = await web.get('/sitemap.xml');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/xml');
      const xml = await response.text();
      expect(xml).toContain('<urlset');
      expect(xml).toContain('<loc>');
      expect(xml).not.toContain('retryAfterSeconds');
    } finally {
      await web.close();
    }
  });

  it('answers the sitemap with 503 + XML and no urlset when the upstream fails', async () => {
    // Sprint 3A / Task B: Sprint 2B sent the HTML outage page here, so a
    // crawler that had already parsed the response as XML got HTML.
    stubMode = 'server-error';
    const web = await startWeb(stubBaseUrl);
    try {
      const response = await web.get('/sitemap.xml');
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('application/xml');
      expect(response.headers.get('retry-after')).toBe('60');
      const xml = await response.text();
      expect(xml).not.toContain('<urlset');
      expect(xml).not.toContain('<loc>');
      expect(xml).not.toContain('情報を取得できませんでした');
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    } finally {
      await web.close();
    }
  });

  it('answers the sitemap with 503 + XML when the upstream never answers', async () => {
    stubMode = 'hang';
    const web = await startWeb(stubBaseUrl, { upstreamTimeoutMs: 250 });
    try {
      const response = await web.get('/sitemap.xml');
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('application/xml');
      expect(response.headers.get('retry-after')).toBe('60');
      expect(await response.text()).not.toContain('<urlset');
    } finally {
      stubMode = 'ok';
      await web.close();
    }
  });

  it('answers 503 for an ICS download when the upstream never answers', async () => {
    // The ICS proxy is the one fetch outside fetchUpstream(); it needs the same
    // deadline, or a hung calendar download holds the connection open forever.
    stubMode = 'hang';
    const web = await startWeb(stubBaseUrl, { upstreamTimeoutMs: 250 });
    try {
      const response = await web.get('/ics/it-passport/2025.ics');
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(response.headers.get('content-type')).toContain('text/html');
    } finally {
      stubMode = 'ok';
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
