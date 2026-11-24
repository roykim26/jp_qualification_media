import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchQualifications } from '../packages/schema/src/qualifications.js';

/**
 * Sprint 3K: an upstream that answers `200` with a body the web app cannot
 * render used to take the process down.
 *
 * Every route writes its status *before* rendering, so a renderer that throws
 * on a malformed view lands in `handleRequest`'s catch with `headersSent`
 * already true. Writing the 502 status there throws `ERR_HTTP_HEADERS_SENT`,
 * that rejection is unhandled, and Node exits. Under `restart: unless-stopped`
 * one bad upstream response becomes a restart loop.
 *
 * The two assertions that matter, and that the 3J suite did not make:
 *
 *   1. a malformed body yields 503 (an unusable upstream), not 200-then-crash;
 *   2. the web server is still answering afterwards.
 */

type BodyMode =
  | 'ok'
  | 'empty-object'
  | 'null'
  | 'array'
  | 'no-facts'
  | 'not-json'
  | 'html-200'
  | 'compare-flat'
  | 'calendar-no-data'
  | 'fact-missing-fields'
  | 'missing-status';

let bodyMode: BodyMode = 'ok';
let stubServer: ReturnType<typeof createServer>;
let stubBaseUrl = '';

const itPassport = launchQualifications.find(
  (qualification) => qualification.slug === 'it-passport',
)!;

/** The real `/api/v1/qualifications/:slug` body, from `buildPublicQualificationView`. */
function qualificationView() {
  return {
    qualification: itPassport,
    status: 'verified',
    facts: [
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
    ],
    officialVerifiedAt: '2026-08-11T00:00:00.000Z',
    missingReasons: {},
  };
}

/**
 * `bodyMode` corrupts the endpoint under test; every other endpoint keeps its
 * healthy shape, so the "still up afterwards" re-check is meaningful.
 */
function bodyFor(url: string): string {
  const corrupt = bodyMode !== 'ok';
  switch (bodyMode) {
    case 'empty-object':
      return '{}';
    case 'null':
      return 'null';
    case 'array':
      return '[]';
    case 'not-json':
      return '{"qualification": {"slug": "it-passport"';
    case 'html-200':
      return '<html><body>502 Bad Gateway</body></html>';
    case 'no-facts':
      // Valid JSON, valid qualification, but `facts` is missing entirely.
      return JSON.stringify({ qualification: itPassport, status: 'verified' });
    case 'compare-flat':
      // The pre-3K shape: rows at the top level instead of under `data`.
      return JSON.stringify({ qualifications: [], rows: [] });
    case 'calendar-no-data':
      return JSON.stringify({ events: [] });
    case 'fact-missing-fields':
      // Passes `isQualificationView` (an object, a string slug, an array of
      // facts) yet is not renderable: the renderer reads fields off each fact.
      // This is the shape that proves the `headersSent` guard still matters
      // after the body checks -- the body check cannot catch everything.
      return JSON.stringify({
        qualification: itPassport,
        status: 'verified',
        facts: [null],
      });
    case 'missing-status':
      // No `status`. `sitemapQualificationPaths()` treats an unrecognised
      // status as "not indexable", so without the check this dropped the whole
      // qualification from `/sitemap.xml` while the sitemap still answered
      // `200 <urlset>` -- a sitemap that quietly under-reports the site.
      return JSON.stringify({
        qualification: itPassport,
        facts: [qualificationView().facts[0]],
      });
    default:
      break;
  }
  if (url.startsWith('/api/v1/compare'))
    return JSON.stringify({ data: { qualifications: [], rows: [] } });
  if (url.startsWith('/api/v1/calendar')) return JSON.stringify({ data: [] });
  if (url.startsWith('/api/v1/updates'))
    return JSON.stringify({ data: [], pagination: { hasMore: false } });
  void corrupt;
  return JSON.stringify(qualificationView());
}

beforeAll(async () => {
  stubServer = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(bodyFor(req.url ?? '/'));
  });
  await new Promise<void>((resolve) =>
    stubServer.listen(0, '127.0.0.1', resolve),
  );
  stubBaseUrl = `http://127.0.0.1:${(stubServer.address() as AddressInfo).port}`;
});

afterAll(async () => {
  stubServer.closeAllConnections?.();
  await new Promise<void>((resolve) => stubServer.close(() => resolve()));
});

async function startWeb() {
  process.env.NODE_ENV = 'test';
  process.env.API_BASE_URL = stubBaseUrl;
  delete process.env.UPSTREAM_TIMEOUT_MS;
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
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      }),
  };
}

describe('web server rejects unusable upstream bodies', () => {
  /**
   * Every one of these used to be a process-killing path: the route wrote 200,
   * the renderer threw, the catch tried to write 502 over sent headers.
   */
  const malformed: { mode: BodyMode; label: string; path: string }[] = [
    {
      mode: 'empty-object',
      label: 'empty object',
      path: '/shikaku/it-passport/',
    },
    { mode: 'null', label: 'null body', path: '/shikaku/it-passport/' },
    { mode: 'array', label: 'array body', path: '/shikaku/it-passport/' },
    { mode: 'no-facts', label: 'missing facts', path: '/shikaku/it-passport/' },
    {
      mode: 'not-json',
      label: 'truncated JSON',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'html-200',
      label: 'HTML with status 200',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'compare-flat',
      label: 'compare without data envelope',
      path: '/compare/',
    },
    {
      mode: 'calendar-no-data',
      label: 'calendar without data',
      path: '/schedule/',
    },
    {
      // Deliberately *passes* the 3K body check so the renderer still throws.
      // Without the `headersSent` guard this one kills the process.
      mode: 'fact-missing-fields',
      label: 'a view whose facts are not renderable',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'missing-status',
      label: 'a view with no status',
      path: '/shikaku/it-passport/',
    },
  ];

  for (const { mode, label, path } of malformed) {
    it(`answers 503 for ${label} and stays up`, async () => {
      bodyMode = mode;
      const web = await startWeb();
      try {
        const response = await web.get(path);
        expect(response.status).toBe(503);
        expect(response.headers.get('retry-after')).toBe('60');
        expect(await response.text()).toContain('一時的に');

        // The server must still answer: this is the regression that matters.
        bodyMode = 'ok';
        const healthy = await web.get(path);
        expect(healthy.status).toBe(200);
      } finally {
        await web.close();
      }
    });
  }

  it('drops nothing from the sitemap when a status is missing', async () => {
    // The regression this case exists for: an unvalidated `status` made
    // `sitemapQualificationPaths()` return `[]` for that qualification, so the
    // sitemap answered 200 with a *shorter* `<urlset>` -- quietly claiming
    // those pages do not exist. Now it is an unusable upstream instead.
    bodyMode = 'missing-status';
    const web = await startWeb();
    try {
      const response = await web.get('/sitemap.xml');
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('application/xml');
      expect(await response.text()).not.toContain('<urlset');
    } finally {
      await web.close();
    }
  });

  it('still serves the healthy shape as 200', async () => {
    bodyMode = 'ok';
    const web = await startWeb();
    try {
      const response = await web.get('/shikaku/it-passport/');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('ITパスポート');
    } finally {
      await web.close();
    }
  });

  it('keeps the home page 200 even when the upstream body is unusable', async () => {
    // The home page already degrades with `Promise.allSettled`; the new body
    // checks must not turn that degradation into a 503 (healthcheck uses `/`).
    bodyMode = 'empty-object';
    const web = await startWeb();
    try {
      const response = await web.get('/');
      expect(response.status).toBe(200);
    } finally {
      await web.close();
    }
  });

  it('answers sitemap XML (not HTML) when the body is unusable', async () => {
    bodyMode = 'empty-object';
    const web = await startWeb();
    try {
      const response = await web.get('/sitemap.xml');
      expect(response.status).toBe(503);
      expect(response.headers.get('content-type')).toContain('application/xml');
      const xml = await response.text();
      expect(xml).not.toContain('<urlset');
    } finally {
      await web.close();
    }
  });
});

describe('closeAfterResponseStarted', () => {
  /**
   * The guard itself, driven directly. Reaching it through HTTP needs an
   * upstream body that passes every shape check and *still* breaks a renderer;
   * that is a moving target (3K's `fact-missing-fields` case was one until the
   * fact element check caught it), so the behaviour worth pinning is the guard:
   * it must never write a status, and it must leave the response ended.
   */
  it('ends the response without writing a status', async () => {
    const { closeAfterResponseStarted } =
      (await import('../apps/web/src/server.js')) as {
        closeAfterResponseStarted: (
          req: { method?: string; url?: string },
          res: ServerResponse,
          error: unknown,
        ) => void;
      };

    const server = createServer((req, res) => {
      // Mimic every route: status first, then a renderer that throws.
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      closeAfterResponseStarted(req, res, new TypeError('renderer blew up'));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${baseUrl}/shikaku/it-passport/`);
      // The 200 that was already written stands; no second status is attempted.
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('');
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('is idempotent when the response already ended', async () => {
    const { closeAfterResponseStarted } =
      (await import('../apps/web/src/server.js')) as {
        closeAfterResponseStarted: (
          req: { method?: string; url?: string },
          res: ServerResponse,
          error: unknown,
        ) => void;
      };

    const server = createServer((req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('partial body');
      // Called again by a second throw in the same request: must not throw.
      closeAfterResponseStarted(req, res, new TypeError('late failure'));
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    try {
      const response = await fetch(`${baseUrl}/shikaku/it-passport/`);
      expect(response.status).toBe(200);
      expect(await response.text()).toBe('partial body');
    } finally {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
