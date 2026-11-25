import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import type { AddressInfo } from 'node:net';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import {
  editorialAboutSlugs,
  editorialComparisonSlugs,
  editorialGuideSlugs,
} from '../apps/web/src/editorial.js';
import { siteCssPath } from '../apps/web/src/assets.js';

/**
 * Sprint 3J / G-15: the route layer of `apps/web/src/server.ts` had no
 * process-level test for its *normal* paths.
 *
 * `tests/web-server.test.ts` already pins the failure semantics (200/503,
 * timeout, sitemap error body, static routes surviving an outage).  What was
 * untested is everything a healthy deployment does on every request: which
 * status and content-type each route answers, whether the rendered document
 * carries the canonical/noindex pair the SEO contract depends on, and whether
 * the 404s stay 404s.
 *
 * These assertions deliberately check *markers* — the status, the content
 * type, the canonical link, the noindex meta, one heading — not whole pages.
 * Whole-page snapshots belong to `web-render.test.ts`; asserting them here
 * would make every styling change fail a routing test and teach people to
 * update the snapshot without reading it.
 *
 * The stub API serves in-memory JSON, so no database is involved.
 */

type StubMode = 'ok' | 'empty';

let stubMode: StubMode = 'ok';
let stubServer: ReturnType<typeof createServer>;
let stubBaseUrl = '';

const itPassport = launchQualifications.find(
  (qualification) => qualification.slug === 'it-passport',
)!;

function stubFact(slug: string) {
  return {
    qualificationSlug: slug,
    examLevelId: null,
    examYear: 2025,
    factKey: 'fee',
    valueType: 'text',
    normalizedValue: '7,500円',
    displayValue: '7,500円（税込）',
    status: 'approved',
    riskLevel: 'medium',
    sourceId: `source:${slug}:ipa-fee`,
    sourceSnapshotId: 'snapshot:official',
    synthetic: false,
    verifiedAt: '2026-08-11T00:00:00.000Z',
    officialVerifiedAt: '2026-08-11T00:00:00.000Z',
  };
}

/**
 * A statistics fact, i.e. one of `historyNumericKeys`.
 *
 * The year-filter tests cannot reuse `stubFact()` above: with only a `fee`
 * fact the view carries no history statistics, so `renderHistoryTables()`
 * returns an empty string, `sectionEmpty` becomes true and *the base page*
 * is marked `noindex` — for a reason that has nothing to do with `?year=`.
 * Those tests would then "pass" the `?year=` assertion while proving nothing
 * about the parameter.
 */
function historyFact(
  slug: string,
  examYear: number,
  factKey: string,
  displayValue: string,
) {
  return {
    qualificationSlug: slug,
    examLevelId: null,
    examYear,
    factKey,
    valueType: 'text',
    normalizedValue: displayValue,
    displayValue,
    status: 'approved',
    riskLevel: 'medium',
    sourceId: `source:${slug}:statistics`,
    sourceSnapshotId: 'snapshot:official',
    synthetic: false,
    verifiedAt: '2026-08-11T00:00:00.000Z',
    officialVerifiedAt: '2026-08-11T00:00:00.000Z',
  };
}

/**
 * Extra facts appended to every stubbed view.  The stub answers at request
 * time, so a test sets this before calling `web.get()` and resets it in a
 * `finally` — the same shape as `stubMode` above.
 */
let stubExtraFacts: ReturnType<typeof historyFact>[] = [];
let stubIcsStatus = 0;

function stubView(slug: string) {
  const qualification =
    launchQualifications.find((entry) => entry.slug === slug) ?? itPassport;
  const facts = stubMode === 'empty' ? [] : [stubFact(slug), ...stubExtraFacts];
  return {
    qualification,
    status: facts.length === 0 ? 'awaiting_official' : 'verified',
    facts,
    officialVerifiedAt: '2026-08-11T00:00:00.000Z',
    missingReasons: {},
  };
}

beforeAll(async () => {
  stubServer = createServer((req, res) => {
    const url = req.url ?? '/';
    const qualificationMatch = url.match(
      /^\/api\/v1\/qualifications\/([^/?]+)/,
    );
    if (qualificationMatch) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(stubView(qualificationMatch[1])));
      return;
    }
    if (url.startsWith('/api/v1/calendar')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [] }));
      return;
    }
    if (url.startsWith('/api/v1/compare')) {
      // `renderComparePage` walks `rows` directly, so the stub has to answer
      // with the real envelope shape (`{ data: { qualifications, rows } }`).
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: { qualifications: [], rows: [] } }));
      return;
    }
    if (url.startsWith('/api/v1/updates')) {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [], pagination: { hasMore: false } }));
      return;
    }
    // The ICS proxy is the one route that forwards a body verbatim.
    if (url.startsWith('/api/v1/ics/')) {
      if (stubIcsStatus) {
        res.writeHead(stubIcsStatus, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'ics failure' }));
        return;
      }
      // The content type carries a marker that the route's own fallback
      // (`text/calendar; charset=utf-8`) does not, so "forwarded upstream"
      // and "fell back to the default" cannot be confused for each other.
      res.writeHead(200, {
        'content-type': 'text/calendar; charset=utf-8; method=PUBLISH',
        'content-disposition': 'attachment; filename="exam.ics"',
      });
      res.end(
        'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//ShikakuCheck//test//EN\r\nEND:VCALENDAR\r\n',
      );
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
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

/**
 * `apiBaseUrl` is read once at module load, but `siteOrigin()` and
 * `layout.ts` both re-read `SITE_ORIGIN` on every render, so the environment
 * has to stay in place for the whole scenario — and has to be put back on
 * `close()`.  Without the restore, whichever file vitest runs next inherits
 * `SITE_ORIGIN=https://example.test` and starts asserting absolute canonicals
 * it never asked for.
 */
async function startWeb(options: { siteOrigin?: string } = {}) {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    API_BASE_URL: process.env.API_BASE_URL,
    SITE_ORIGIN: process.env.SITE_ORIGIN,
  };
  process.env.NODE_ENV = 'test';
  process.env.API_BASE_URL = stubBaseUrl;
  if (options.siteOrigin === undefined) delete process.env.SITE_ORIGIN;
  else process.env.SITE_ORIGIN = options.siteOrigin;
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
      new Promise<void>((resolve) =>
        server.close(() => {
          for (const [key, value] of Object.entries(previous)) {
            if (value === undefined) delete process.env[key];
            else process.env[key] = value;
          }
          resolve();
        }),
      ),
  };
}

describe('static assets', () => {
  it('serves a whitelisted image with its declared type and a long cache', async () => {
    const web = await startWeb();
    try {
      const response = await web.get('/images/favicon-32.png');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('image/png');
      expect(response.headers.get('cache-control')).toContain('max-age=');
      expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0);
    } finally {
      await web.close();
    }
  });

  it('answers 404 for an image name outside the whitelist', async () => {
    // The whitelist is the only thing standing between a URL segment and
    // `readFile('../public/images/<segment>')`.  Two distinct rejections:
    // a name that does not even match the pattern, and a name that matches
    // the pattern but is not on the list — the second is the one the
    // whitelist itself is responsible for.
    const web = await startWeb();
    try {
      expect((await web.get('/images/../../package.json')).status).toBe(404);
      const unlisted = await web.get('/images/not-in-the-whitelist.png');
      expect(unlisted.status).toBe(404);
    } finally {
      await web.close();
    }
  });

  it('serves the built stylesheet only at its hashed path', async () => {
    const web = await startWeb();
    try {
      const ok = await web.get(siteCssPath);
      expect(ok.status).toBe(200);
      expect(ok.headers.get('content-type')).toContain('text/css');
      expect(ok.headers.get('cache-control')).toContain('immutable');

      const stale = await web.get('/assets/site.deadbeef0000.css');
      expect(stale.status).toBe(404);
      expect(stale.headers.get('content-type')).toContain('text/plain');
    } finally {
      await web.close();
    }
  });
});

describe('crawler routes', () => {
  it('points robots.txt at the configured origin', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/robots.txt');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/plain');
      const body = await response.text();
      expect(body).toContain('Sitemap: https://example.test/sitemap.xml');
      expect(body).toContain('Allow: /');
    } finally {
      await web.close();
    }
  });

  it('lists the stable routes and every launched qualification in the sitemap', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/sitemap.xml');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/xml');
      const xml = await response.text();
      for (const path of [
        '/shikaku/',
        '/schedule/',
        '/compare/',
        '/pass-rate/',
        '/updates/',
        '/guide/',
      ])
        expect(xml).toContain(`<loc>https://example.test${path}</loc>`);
      // Every launched qualification contributes at least its overview page.
      for (const qualification of launchQualifications)
        expect(xml).toContain(
          `<loc>https://example.test/shikaku/${qualification.slug}/</loc>`,
        );
    } finally {
      await web.close();
    }
  });
});

describe('qualification routes', () => {
  it('serves the directory with a canonical and without noindex', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/shikaku/');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('資格を探す');
      expect(html).toContain('rel="canonical"');
      expect(html).not.toContain('<meta name="robots" content="noindex');
    } finally {
      await web.close();
    }
  });

  it('marks a search result noindex but keeps the directory canonical', async () => {
    // A `?q=` variant is a duplicate view of the same set, so it must stay out
    // of the index while still canonicalising to /shikaku/.
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/shikaku/?q=%E7%B0%BF%E8%A8%98');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('検索結果');
      expect(html).toContain('<meta name="robots" content="noindex,follow">');
    } finally {
      await web.close();
    }
  });

  it('serves every qualification section at 200', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      for (const path of [
        '/shikaku/it-passport/',
        '/shikaku/it-passport/application/',
        '/shikaku/it-passport/exam-content/',
        '/shikaku/it-passport/pass-rate/',
        '/shikaku/it-passport/2025/',
      ]) {
        const response = await web.get(path);
        expect(response.status, path).toBe(200);
        expect(response.headers.get('content-type'), path).toContain(
          'text/html',
        );
        expect(await response.text(), path).toContain('ITパスポート');
      }
    } finally {
      await web.close();
    }
  });

  it('answers 404 for a slug outside the launch list', async () => {
    // The slug whitelist is a hand-written array inside the route branch; a
    // regression there would publish an empty page for any URL segment.
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/shikaku/not-a-qualification/');
      expect(response.status).toBe(404);
      expect(await response.text()).toContain('ページが見つかりません');
    } finally {
      await web.close();
    }
  });
});

describe('index routes', () => {
  it('serves the schedule page with a canonical', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/schedule/');
      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('text/html');
      const html = await response.text();
      expect(html).toContain('rel="canonical"');
      expect(html).toContain('https://example.test/schedule/');
    } finally {
      await web.close();
    }
  });

  it('serves the comparison page', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/compare/');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('https://example.test/compare/');
    } finally {
      await web.close();
    }
  });

  it('serves the guide index', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/guide/');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('https://example.test/guide/');
    } finally {
      await web.close();
    }
  });

  it('serves the updates page', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/updates/');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('https://example.test/updates/');
    } finally {
      await web.close();
    }
  });

  it('serves the home page with a canonical', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('rel="canonical"');
      expect(html).toContain('https://example.test/');
    } finally {
      await web.close();
    }
  });
});

describe('/pass-rate/ index policy (G-02 / ADR 0002)', () => {
  it('keeps the base table indexable', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/pass-rate/');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('https://example.test/pass-rate/');
      expect(html).not.toContain('<meta name="robots" content="noindex');
    } finally {
      await web.close();
    }
  });

  it('marks every sort/order variant noindex but canonical to the base', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      for (const path of [
        '/pass-rate/?sort=rate',
        '/pass-rate/?order=desc',
        '/pass-rate/?sort=rate&order=desc',
      ]) {
        const response = await web.get(path);
        expect(response.status, path).toBe(200);
        const html = await response.text();
        expect(html, path).toContain(
          '<meta name="robots" content="noindex,follow">',
        );
        expect(html, path).toContain(
          '<link rel="canonical" href="https://example.test/pass-rate/"',
        );
      }
    } finally {
      await web.close();
    }
  });
});

/**
 * ADR 0002 §2: the `?year=` filter on `/shikaku/:slug/pass-rate/` is a
 * parameter view of the same page, so it must stay `noindex` and canonicalise
 * to the bare section URL — while the bare section URL itself stays indexable.
 *
 * `renderQualificationSectionPage` decides `noindex` from two independent
 * inputs (`sectionEmpty` and `section === 'pass-rate' && year !== undefined`),
 * which means a regression in either one can hide behind the other.  These
 * cases pin both: the base page must have *neither* reason to be noindex, and
 * each `?year=` variant must be noindex for the parameter alone — proven by
 * `?year=9999`, which renders no cards at all yet still shows the history
 * tables, so its noindex cannot be explained by an empty page.
 */
describe('/shikaku/:slug/pass-rate/ year filter (ADR 0002 §2)', () => {
  // Statistics facts make `renderHistoryTables()` non-empty, which is what
  // keeps the base page out of `sectionEmpty`.  The 2024 `passing_standard`
  // is not a history key but *is* in `sectionConfig['pass-rate']
  // .factKeyPrefixes`, so it is the one fact that appears as a card on the base
  // page and disappears under `?year=2025` — that difference is the proof that
  // the parameter reaches `sectionPageFacts()`.
  const yearFilterFacts = () => [
    historyFact('it-passport', 2024, 'pass_rate', '50.0%'),
    historyFact('it-passport', 2025, 'pass_rate', '55.0%'),
    historyFact('it-passport', 2024, 'passing_standard', '600点（2024年度）'),
  ];

  async function withYearFacts<T>(run: () => Promise<T>): Promise<T> {
    stubExtraFacts = yearFilterFacts();
    try {
      return await run();
    } finally {
      stubExtraFacts = [];
    }
  }

  it('keeps the bare section indexable and canonical to itself', async () => {
    await withYearFacts(async () => {
      const web = await startWeb({ siteOrigin: 'https://example.test' });
      try {
        const response = await web.get('/shikaku/it-passport/pass-rate/');
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).not.toContain('<meta name="robots" content="noindex');
        expect(html).toContain(
          '<link rel="canonical" href="https://example.test/shikaku/it-passport/pass-rate/"',
        );
        // The 2024 card proves the base page is the unscoped view.
        expect(html).toContain('600点（2024年度）');
      } finally {
        await web.close();
      }
    });
  });

  it('marks ?year= noindex and canonical to the bare section', async () => {
    await withYearFacts(async () => {
      const web = await startWeb({ siteOrigin: 'https://example.test' });
      try {
        const response = await web.get(
          '/shikaku/it-passport/pass-rate/?year=2025',
        );
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain('<meta name="robots" content="noindex,follow">');
        expect(html).toContain(
          '<link rel="canonical" href="https://example.test/shikaku/it-passport/pass-rate/"',
        );
        // Scoped to 2025, so the 2024 card is gone.
        expect(html).not.toContain('600点（2024年度）');
      } finally {
        await web.close();
      }
    });
  });

  it('marks ?history=all noindex and keeps the canonical on the bare section', async () => {
    await withYearFacts(async () => {
      const web = await startWeb({ siteOrigin: 'https://example.test' });
      try {
        const response = await web.get(
          '/shikaku/it-passport/pass-rate/?history=all',
        );
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain('<meta name="robots" content="noindex,follow">');
        expect(html).toContain(
          '<link rel="canonical" href="https://example.test/shikaku/it-passport/pass-rate/"',
        );
      } finally {
        await web.close();
      }
    });
  });

  it('renders the bare page for a year that is not four digits, but keeps it out of the index', async () => {
    // `server.ts` only honours `^\d{4}$`. Anything else renders exactly the
    // bare page, which is what makes it a parameter variant of the bare page:
    // same bytes, second URL. ADR 0002 §1 criterion 2 says the parameter
    // version of identical content is always noindex,follow, so the fact that
    // the value is ignored is the reason to mark it, not a reason to skip it.
    await withYearFacts(async () => {
      const web = await startWeb({ siteOrigin: 'https://example.test' });
      try {
        const response = await web.get(
          '/shikaku/it-passport/pass-rate/?year=abc',
        );
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain('<meta name="robots" content="noindex,follow">');
        expect(html).toContain(
          '<link rel="canonical" href="https://example.test/shikaku/it-passport/pass-rate/"',
        );
        // Ignored, not honoured: the 2024 card is still on the page.
        expect(html).toContain('600点（2024年度）');
      } finally {
        await web.close();
      }
    });
  });

  it('marks the bare section noindex when it has nothing to show', async () => {
    // The other reason `renderQualificationSectionPage` sets noindex is
    // `sectionEmpty`.  Without this case, that half of the condition could
    // decay to `false` and every other case here would still pass.
    stubMode = 'empty';
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/shikaku/it-passport/pass-rate/');
      expect(response.status).toBe(200);
      const html = await response.text();
      expect(html).toContain('<meta name="robots" content="noindex,follow">');
    } finally {
      stubMode = 'ok';
      await web.close();
    }
  });

  it('marks an empty year noindex while still rendering the history tables', async () => {
    await withYearFacts(async () => {
      const web = await startWeb({ siteOrigin: 'https://example.test' });
      try {
        const response = await web.get(
          '/shikaku/it-passport/pass-rate/?year=9999',
        );
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain('<meta name="robots" content="noindex,follow">');
        expect(html).not.toContain('600点（2024年度）');
        // Not an empty page: the history tables are rendered from every fact,
        // not from the year-scoped card set.
        expect(html).toContain('受験者数・合格者数・合格率の年次推移');
      } finally {
        await web.close();
      }
    });
  });
});

describe('section parameter variants stay out of the index (ADR 0002 §2)', () => {
  // The route honours exactly one parameter: ?year= with four digits on the
  // pass-rate section. Everything else renders byte-for-byte the same page as
  // the clean URL, so those URLs are parameter variants of it and ADR 0002 §1
  // criterion 2 requires noindex,follow. Canonical already pointed at the clean
  // URL; these cases pin the meta tag that actually instructs the crawler.
  const variantFacts = () => [
    historyFact('it-passport', 2024, 'pass_rate', '50.0%'),
    historyFact('it-passport', 2025, 'pass_rate', '55.0%'),
    historyFact('it-passport', 2024, 'passing_standard', '600点（2024年度）'),
  ];

  async function withVariantFacts<T>(run: () => Promise<T>): Promise<T> {
    stubExtraFacts = variantFacts();
    try {
      return await run();
    } finally {
      stubExtraFacts = [];
    }
  }

  const variantQueries = [
    '?sort=fee',
    '?order=desc',
    '?sort=fee&order=asc',
    '?foo=bar',
  ];

  for (const query of variantQueries) {
    it(`marks ${query} noindex while rendering the bare page`, async () => {
      await withVariantFacts(async () => {
        const web = await startWeb({ siteOrigin: 'https://example.test' });
        try {
          const bare = await web.get('/shikaku/it-passport/pass-rate/');
          const bareHtml = await bare.text();
          const response = await web.get(
            `/shikaku/it-passport/pass-rate/${query}`,
          );
          expect(response.status).toBe(200);
          const html = await response.text();
          expect(html).toContain(
            '<meta name="robots" content="noindex,follow">',
          );
          expect(html).toContain(
            '<link rel="canonical" href="https://example.test/shikaku/it-passport/pass-rate/"',
          );
          // Nothing here is a filter: the 2024 card the bare page shows is
          // still on the page. This is the difference from ?year=2025, which
          // drops it.
          expect(html).toContain('600点（2024年度）');
          // `layout.ts` blanks the structured data whenever a page is noindex,
          // so the variant is the bare page plus the robots meta minus its
          // JSON-LD block. Those two differences are the design; everything
          // else has to be identical, which is what makes this a parameter
          // variant rather than a filter.
          expect(bareHtml).toContain('application/ld+json');
          expect(html).not.toContain('application/ld+json');
          const withoutSeoHead = (page: string) =>
            page
              .replace(/<meta name="robots" content="[^"]*">/g, '')
              .replace(
                /<script type="application\/ld\+json">.*?<\/script>/s,
                '',
              );
          expect(withoutSeoHead(html)).toBe(withoutSeoHead(bareHtml));
        } finally {
          await web.close();
        }
      });
    });
  }

  it('marks a repeated year key noindex even though one of the values is honoured', async () => {
    // `get()` returns the first value, so the page *is* scoped — but the URL is
    // still a duplicate of the single-parameter one, and only one canonical
    // form may be indexable.
    await withVariantFacts(async () => {
      const web = await startWeb({ siteOrigin: 'https://example.test' });
      try {
        const response = await web.get(
          '/shikaku/it-passport/pass-rate/?year=2025&year=2026',
        );
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain('<meta name="robots" content="noindex,follow">');
        expect(html).toContain(
          '<link rel="canonical" href="https://example.test/shikaku/it-passport/pass-rate/"',
        );
      } finally {
        await web.close();
      }
    });
  });

  it('marks ?year= noindex on a section that ignores the year', async () => {
    await withVariantFacts(async () => {
      const web = await startWeb({ siteOrigin: 'https://example.test' });
      try {
        const bare = await web.get('/shikaku/it-passport/application/');
        expect(bare.status).toBe(200);
        expect(await bare.text()).not.toContain(
          '<meta name="robots" content="noindex',
        );
        const response = await web.get(
          '/shikaku/it-passport/application/?year=2025',
        );
        expect(response.status).toBe(200);
        const html = await response.text();
        expect(html).toContain('<meta name="robots" content="noindex,follow">');
      } finally {
        await web.close();
      }
    });
  });
});

describe('editorial routes', () => {
  it('serves every about page', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      for (const slug of editorialAboutSlugs) {
        const response = await web.get(`/about/${slug}/`);
        expect(response.status, slug).toBe(200);
        expect(await response.text(), slug).toContain(
          `https://example.test/about/${slug}/`,
        );
      }
    } finally {
      await web.close();
    }
  });

  it('serves every comparison guide', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      for (const slug of editorialComparisonSlugs) {
        const response = await web.get(`/compare/${slug}/`);
        expect(response.status, slug).toBe(200);
        expect(await response.text(), slug).toContain(
          `https://example.test/compare/${slug}/`,
        );
      }
    } finally {
      await web.close();
    }
  });

  it('serves every editorial guide', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      for (const slug of editorialGuideSlugs) {
        const response = await web.get(`/guide/${slug}/`);
        expect(response.status, slug).toBe(200);
        expect(await response.text(), slug).toContain(
          `https://example.test/guide/${slug}/`,
        );
      }
    } finally {
      await web.close();
    }
  });

  it('answers 404 for an editorial slug that does not exist', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      for (const path of [
        '/about/no-such-page/',
        '/compare/no-such-page/',
        '/guide/no-such-page/',
      ]) {
        const response = await web.get(path);
        expect(response.status, path).toBe(404);
        expect(await response.text(), path).toContain('ページが見つかりません');
      }
    } finally {
      await web.close();
    }
  });
});

describe('ICS proxy', () => {
  it('forwards a successful calendar download with its content type', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/ics/it-passport/2025.ics');
      expect(response.status).toBe(200);
      // The upstream's own content type must survive the proxy: falling back
      // to the local default would hide a changed or dropped header.
      expect(response.headers.get('content-type')).toContain('method=PUBLISH');
      expect(response.headers.get('content-disposition')).toContain(
        'attachment',
      );
      expect(await response.text()).toContain('BEGIN:VCALENDAR');
    } finally {
      await web.close();
    }
  });

  it('forwards a month feed too', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/ics/month/2026-11.ics');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('BEGIN:VCALENDAR');
    } finally {
      await web.close();
    }
  });

  it('maps an upstream ICS 404 to the site not-found page', async () => {
    stubIcsStatus = 404;
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/ics/it-passport/2025.ics');
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('ページが見つかりません');
    } finally {
      stubIcsStatus = 0;
      await web.close();
    }
  });

  it('maps an upstream ICS failure to 503 with Retry-After', async () => {
    stubIcsStatus = 500;
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/ics/it-passport/2025.ics');
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('60');
      expect(await response.text()).toContain('一時的に');
    } finally {
      stubIcsStatus = 0;
      await web.close();
    }
  });
});

describe('fallthrough', () => {
  it('answers 404 with the not-found page for an unknown path', async () => {
    const web = await startWeb({ siteOrigin: 'https://example.test' });
    try {
      const response = await web.get('/definitely-not-a-route/');
      expect(response.status).toBe(404);
      expect(response.headers.get('content-type')).toContain('text/html');
      expect(await response.text()).toContain('ページが見つかりません');
    } finally {
      await web.close();
    }
  });
});
