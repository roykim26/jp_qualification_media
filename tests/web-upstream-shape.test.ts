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
  | 'fact-null-exam-year'
  | 'fact-null-source-id'
  | 'fact-null-snapshot-id'
  | 'fact-numeric-source-url'
  | 'fact-numeric-verified-at'
  | 'missing-status'
  | 'qualification-null-aliases'
  | 'qualification-string-aliases'
  | 'qualification-numeric-alias'
  | 'qualification-null-name'
  | 'qualification-null-field'
  | 'qualification-null-category'
  | 'calendar-null-type'
  | 'calendar-bogus-type'
  | 'calendar-null-label'
  | 'calendar-null-display-value'
  | 'calendar-null-fact-key'
  | 'calendar-numeric-source-url'
  | 'calendar-numeric-date'
  | 'calendar-null-name'
  | 'calendar-null-slug'
  | 'calendar-null-element'
  | 'updates-null-event-label'
  | 'updates-null-fact-key'
  | 'updates-null-new-value'
  | 'updates-numeric-previous-value'
  | 'updates-null-affected-pages'
  | 'updates-null-page'
  | 'updates-null-created-at'
  | 'updates-numeric-source-url'
  | 'updates-null-element'
  | 'updates-null-qualification'
  | 'updates-string-qualification'
  | 'updates-numeric-fact-label'
  | 'updates-object-fact-label'
  | 'updates-null-fact-label'
  | 'updates-empty-qualification'
  | 'updates-null-qualification-slug'
  | 'compare-null-row-label'
  | 'compare-null-cells'
  | 'compare-null-entries'
  | 'compare-null-entry'
  | 'compare-null-entry-value'
  | 'compare-null-entry-fact-key'
  | 'compare-null-row'
  | 'compare-null-qualification'
  | 'compare-null-name'
  | 'compare-null-slug'
  | 'compare-numeric-entry-source-url'
  | 'single-failure';

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
 * The real `/api/v1/calendar` body, shaped from `PublicCalendarEvent`
 * (`packages/schema/src/calendar.ts:6-24`). `dateValue` must sit inside the
 * default 90-day window -- `/schedule/` filters past events out silently, so a
 * stale date would make every corrupted variant look identical to the baseline.
 */
function calendarEvent() {
  return {
    id: 'event:it-passport:exam_date:2026',
    type: 'exam_date' as const,
    label: '試験日',
    qualification: itPassport,
    examYear: 2026,
    displayValue: '2026年12月15日',
    dateValue: '2026-12-15',
    startValue: null,
    factKey: 'exam_dates',
    verifiedAt: '2026-08-11T00:00:00.000Z',
    sourceUrl: 'https://www.ipa.go.jp/shiken/',
    sequence: 1,
  };
}

/** The real `/api/v1/updates` body, from `PublicUpdateEvent` (`packages/schema/src/updates.ts:3-17`). */
function updateEvent() {
  return {
    id: 'update:it-passport:fee:2026',
    eventType: 'fee_change',
    eventLabel: '料金の変更',
    qualification: itPassport,
    factKey: 'fee',
    factLabel: '受験手数料',
    examYear: 2026,
    previousValue: '7,000円',
    newValue: '7,500円',
    affectedPages: ['/shikaku/it-passport/'],
    sourceUrl: 'https://www.ipa.go.jp/shiken/',
    createdAt: '2026-08-11T00:00:00.000Z',
    verifiedAt: '2026-08-11T00:00:00.000Z',
  };
}

/** The real `/api/v1/compare` body, from `PublicQualificationComparison` (`packages/schema/src/compare.ts:41-44`). */
function comparison() {
  return {
    data: {
      qualifications: [itPassport],
      rows: [
        {
          key: 'fee' as const,
          label: '受験手数料',
          cells: {
            'it-passport': {
              entries: [
                {
                  factKey: 'fee',
                  examYear: 2026,
                  value: '7,500円',
                  verifiedAt: '2026-08-11T00:00:00.000Z',
                },
              ],
            },
          },
        },
      ],
    },
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
      // A fact that is not even an object. Caught by the per-fact check now, so
      // it answers 503 from the body check rather than from the guard -- kept
      // because it is the cheapest probe of "facts elements are validated".
      return JSON.stringify({
        qualification: itPassport,
        status: 'verified',
        facts: [null],
      });
    case 'fact-null-exam-year':
    case 'fact-null-source-id':
    case 'fact-null-snapshot-id':
    case 'fact-numeric-source-url':
    case 'fact-numeric-verified-at': {
      // Sprint 3K P2, measured: these five fields reach the renderer. Four of
      // them threw (`escapeHtml(null)`, `escapeHtml(123)`) *after* the 200
      // header was sent, so the reader got a blank page instead of a 503.
      // `examYear` is the quiet one: `null` renders as `null年度` -- no throw,
      // but a page that claims a fact belongs to the year "null". Both are
      // rejected here; the difference is only in how they used to fail.
      const fact: Record<string, unknown> = { ...qualificationView().facts[0] };
      if (bodyMode === 'fact-null-exam-year') fact.examYear = null;
      if (bodyMode === 'fact-null-source-id') fact.sourceId = null;
      if (bodyMode === 'fact-null-snapshot-id') fact.sourceSnapshotId = null;
      if (bodyMode === 'fact-numeric-source-url') fact.sourceUrl = 123;
      if (bodyMode === 'fact-numeric-verified-at') fact.officialVerifiedAt = 99;
      return JSON.stringify({
        qualification: itPassport,
        status: 'verified',
        facts: [fact],
      });
    }
    case 'missing-status':
      // No `status`. `sitemapQualificationPaths()` treats an unrecognised
      // status as "not indexable", so without the check this dropped the whole
      // qualification from `/sitemap.xml` while the sitemap still answered
      // `200 <urlset>` -- a sitemap that quietly under-reports the site.
      return JSON.stringify({
        qualification: itPassport,
        facts: [qualificationView().facts[0]],
      });
    case 'qualification-null-aliases':
    case 'qualification-string-aliases':
    case 'qualification-numeric-alias':
    case 'qualification-null-name':
    case 'qualification-null-field':
    case 'qualification-null-category': {
      // Sprint 3M, measured: the section page renders `aliasesJa.map(...)`,
      // `officialNameJa`, `field` and `category` directly. `aliasesJa: null`
      // throws `Cannot read properties of null (reading 'map')`,
      // `aliasesJa: 'IPA'` throws `aliasesJa.map is not a function`, and the
      // other three throw from `escapeHtml()`. All of them after the 200
      // header, so the reader got a blank page instead of a 503.
      const qualification: Record<string, unknown> = { ...itPassport };
      if (bodyMode === 'qualification-null-aliases')
        qualification.aliasesJa = null;
      if (bodyMode === 'qualification-string-aliases')
        qualification.aliasesJa = 'IPA';
      if (bodyMode === 'qualification-numeric-alias')
        qualification.aliasesJa = [123];
      if (bodyMode === 'qualification-null-name')
        qualification.officialNameJa = null;
      if (bodyMode === 'qualification-null-field') qualification.field = null;
      if (bodyMode === 'qualification-null-category')
        qualification.category = null;
      return JSON.stringify({
        qualification,
        status: 'verified',
        facts: [qualificationView().facts[0]],
      });
    }
    case 'calendar-null-type':
    case 'calendar-bogus-type':
    case 'calendar-null-label':
    case 'calendar-null-display-value':
    case 'calendar-null-fact-key':
    case 'calendar-numeric-source-url':
    case 'calendar-numeric-date':
    case 'calendar-null-name':
    case 'calendar-null-slug':
    case 'calendar-null-element': {
      // Sprint 3M, measured. `/schedule/` renders each event's own fields and
      // its qualification copy; `escapeHtml()` turns most of these into a
      // throw, and an unknown `type` throws from `eventTone[type]` being
      // `undefined`. `dateValue: 123` is the quiet one: no throw, but the
      // `dateValue < today` comparison compares a number to a string and the
      // event silently disappears from the schedule.
      const event: Record<string, unknown> = { ...calendarEvent() };
      const qualification: Record<string, unknown> = { ...itPassport };
      if (bodyMode === 'calendar-null-type') event.type = null;
      if (bodyMode === 'calendar-bogus-type') event.type = 'bogus';
      if (bodyMode === 'calendar-null-label') event.label = null;
      if (bodyMode === 'calendar-null-display-value') event.displayValue = null;
      if (bodyMode === 'calendar-null-fact-key') event.factKey = null;
      if (bodyMode === 'calendar-numeric-source-url') event.sourceUrl = 123;
      if (bodyMode === 'calendar-numeric-date') event.dateValue = 123;
      if (bodyMode === 'calendar-null-name')
        qualification.officialNameJa = null;
      if (bodyMode === 'calendar-null-slug') qualification.slug = null;
      event.qualification = qualification;
      return JSON.stringify({
        data: bodyMode === 'calendar-null-element' ? [null] : [event],
      });
    }
    case 'updates-null-event-label':
    case 'updates-null-fact-key':
    case 'updates-null-new-value':
    case 'updates-numeric-previous-value':
    case 'updates-null-affected-pages':
    case 'updates-null-page':
    case 'updates-null-created-at':
    case 'updates-numeric-source-url':
    case 'updates-null-element':
    case 'updates-null-qualification':
    case 'updates-string-qualification':
    case 'updates-numeric-fact-label':
    case 'updates-object-fact-label':
    case 'updates-null-fact-label':
    case 'updates-empty-qualification':
    case 'updates-null-qualification-slug': {
      // Sprint 3M, measured. `/updates/` reads `eventLabel`, `factKey`,
      // `newValue` through `escapeHtml()`, and `factKey` again through
      // `factLabel()` (`factKey.match(...)`); `affectedPages` is `.map`-ed and
      // `createdAt` goes to `formatSiteDay()`. All of them blank the page.
      //
      // The follow-up round added four more, all measured the same way:
      // a null/non-object `qualification` (read as `.slug` and
      // `.officialNameJa`), a non-string `factLabel` (handed to `escapeHtml()`
      // verbatim), and -- the two that must stay 200 -- a null `factLabel`
      // and a null `qualification.slug`, which render 公式情報 and a dead
      // link rather than throwing.
      const event: Record<string, unknown> = { ...updateEvent() };
      if (bodyMode === 'updates-null-event-label') event.eventLabel = null;
      if (bodyMode === 'updates-null-fact-key') event.factKey = null;
      if (bodyMode === 'updates-null-new-value') event.newValue = null;
      if (bodyMode === 'updates-numeric-previous-value')
        event.previousValue = 123;
      if (bodyMode === 'updates-null-affected-pages')
        event.affectedPages = null;
      if (bodyMode === 'updates-null-page') event.affectedPages = [null];
      if (bodyMode === 'updates-null-created-at') event.createdAt = null;
      if (bodyMode === 'updates-numeric-source-url') event.sourceUrl = 123;
      if (bodyMode === 'updates-null-qualification') event.qualification = null;
      if (bodyMode === 'updates-string-qualification')
        event.qualification = 'it-passport';
      if (bodyMode === 'updates-numeric-fact-label') event.factLabel = 123;
      if (bodyMode === 'updates-object-fact-label') event.factLabel = { a: 1 };
      if (bodyMode === 'updates-null-fact-label') event.factLabel = null;
      if (bodyMode === 'updates-empty-qualification') event.qualification = {};
      if (bodyMode === 'updates-null-qualification-slug')
        event.qualification = { ...itPassport, slug: null };
      return JSON.stringify({
        data: bodyMode === 'updates-null-element' ? [null] : [event],
        pagination: { hasMore: false },
      });
    }
    case 'compare-null-row-label':
    case 'compare-null-cells':
    case 'compare-null-entries':
    case 'compare-null-entry':
    case 'compare-null-entry-value':
    case 'compare-null-entry-fact-key':
    case 'compare-null-row':
    case 'compare-null-qualification':
    case 'compare-null-name':
    case 'compare-null-slug':
    case 'compare-numeric-entry-source-url': {
      // Sprint 3M, measured. `/compare/` prints the row label, each cell's
      // entries and each entry's value; the qualification header goes through
      // `escapeHtml()` too. `rows: null` was already caught by the pre-3M
      // envelope check -- these are the element-level holes underneath it.
      const payload = comparison();
      const qualification: Record<string, unknown> = { ...itPassport };
      if (bodyMode === 'compare-null-name') qualification.officialNameJa = null;
      if (bodyMode === 'compare-null-slug') qualification.slug = null;
      payload.data.qualifications = (
        bodyMode === 'compare-null-qualification' ? [null] : [qualification]
      ) as typeof payload.data.qualifications;

      const row = payload.data.rows[0] as Record<string, unknown>;
      if (bodyMode === 'compare-null-row-label') row.label = null;
      // `row.cells: null` is its own hole: without the `isRecord(row.cells)`
      // check, `Object.values(null)` throws inside the validator itself.
      if (bodyMode === 'compare-null-cells') row.cells = null;
      if (bodyMode === 'compare-null-entries') {
        (row.cells as Record<string, Record<string, unknown>>)['it-passport'] =
          {
            entries: null,
          };
      }
      if (
        bodyMode === 'compare-null-entry' ||
        bodyMode === 'compare-null-entry-value' ||
        bodyMode === 'compare-null-entry-fact-key' ||
        bodyMode === 'compare-numeric-entry-source-url'
      ) {
        const cell = (
          row.cells as Record<string, { entries: Record<string, unknown>[] }>
        )['it-passport'];
        const entry: Record<string, unknown> = { ...cell.entries[0] };
        if (bodyMode === 'compare-null-entry-value') entry.value = null;
        if (bodyMode === 'compare-null-entry-fact-key') entry.factKey = null;
        if (bodyMode === 'compare-numeric-entry-source-url')
          entry.sourceUrl = 42;
        cell.entries =
          bodyMode === 'compare-null-entry'
            ? ([null] as unknown as Record<string, unknown>[])
            : [entry];
      }
      if (bodyMode === 'compare-null-row') {
        payload.data.rows = [null] as unknown as typeof payload.data.rows;
      }
      return JSON.stringify(payload);
    }
    case 'single-failure':
      // One qualification unusable, every sibling healthy. This is the shape
      // the `/pass-rate/` observation line exists for: it must still answer
      // 503 (plan A), but the log has to say "1 of 6", not just "503".
      if (url.includes('/qualifications/it-passport')) return '{}';
      break;
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
      // The five fields measured in Sprint 3K P2: each one reached the
      // renderer. Four produced `200` with an empty body; `examYear` rendered
      // the literal string "null年度".
      mode: 'fact-null-exam-year',
      label: 'a fact with a null examYear',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'fact-null-source-id',
      label: 'a fact with a null sourceId',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'fact-null-snapshot-id',
      label: 'a fact with a null sourceSnapshotId',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'fact-numeric-source-url',
      label: 'a fact whose sourceUrl is a number',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'fact-numeric-verified-at',
      label: 'a fact whose officialVerifiedAt is a number',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'missing-status',
      label: 'a view with no status',
      path: '/shikaku/it-passport/',
    },
    {
      // The four qualification fields measured in Sprint 3M. `aliasesJa` is
      // the loudest: a string throws `.map is not a function`, null throws
      // "reading 'map'". The other three go through `escapeHtml()`.
      mode: 'qualification-null-aliases',
      label: 'a qualification whose aliasesJa is null',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'qualification-string-aliases',
      label: 'a qualification whose aliasesJa is a string',
      path: '/shikaku/it-passport/',
    },
    {
      // `escapeHtml(123)` throws "value.replaceAll is not a function", so an
      // array of non-strings is just as fatal as a non-array.
      mode: 'qualification-numeric-alias',
      label: 'a qualification whose aliasesJa holds a number',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'qualification-null-name',
      label: 'a qualification whose officialNameJa is null',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'qualification-null-field',
      label: 'a qualification whose field is null',
      path: '/shikaku/it-passport/',
    },
    {
      mode: 'qualification-null-category',
      label: 'a qualification whose category is null',
      path: '/shikaku/it-passport/',
    },
    // Sprint 3M: the same class of hole on the three sibling routes. Each of
    // these answered 200 with an empty body before the element checks went in.
    {
      mode: 'calendar-null-type',
      label: 'a calendar event with a null type',
      path: '/schedule/',
    },
    {
      // Unknown enum member: `eventTone[type]` is `undefined`, then
      // `escapeHtml(undefined)` throws. A non-empty string is not enough.
      mode: 'calendar-bogus-type',
      label: 'a calendar event with an unknown type',
      path: '/schedule/',
    },
    {
      mode: 'calendar-null-label',
      label: 'a calendar event with a null label',
      path: '/schedule/',
    },
    {
      mode: 'calendar-null-display-value',
      label: 'a calendar event with a null displayValue',
      path: '/schedule/',
    },
    {
      mode: 'calendar-null-fact-key',
      label: 'a calendar event with a null factKey',
      path: '/schedule/',
    },
    {
      mode: 'calendar-numeric-source-url',
      label: 'a calendar event whose sourceUrl is a number',
      path: '/schedule/',
    },
    {
      // The quiet one: no throw, but `dateValue < today` compares a number to a
      // string and the event silently leaves the schedule.
      mode: 'calendar-numeric-date',
      label: 'a calendar event whose dateValue is a number',
      path: '/schedule/',
    },
    {
      mode: 'calendar-null-name',
      label: 'a calendar event whose qualification name is null',
      path: '/schedule/',
    },
    {
      mode: 'calendar-null-slug',
      label: 'a calendar event whose qualification slug is null',
      path: '/schedule/',
    },
    {
      mode: 'calendar-null-element',
      label: 'a null calendar event',
      path: '/schedule/',
    },
    {
      mode: 'updates-null-event-label',
      label: 'an update with a null eventLabel',
      path: '/updates/',
    },
    {
      mode: 'updates-null-fact-key',
      label: 'an update with a null factKey',
      path: '/updates/',
    },
    {
      mode: 'updates-null-new-value',
      label: 'an update with a null newValue',
      path: '/updates/',
    },
    {
      mode: 'updates-numeric-previous-value',
      label: 'an update whose previousValue is a number',
      path: '/updates/',
    },
    {
      mode: 'updates-null-affected-pages',
      label: 'an update with null affectedPages',
      path: '/updates/',
    },
    {
      mode: 'updates-null-page',
      label: 'an update whose affectedPages holds a null',
      path: '/updates/',
    },
    {
      mode: 'updates-null-created-at',
      label: 'an update with a null createdAt',
      path: '/updates/',
    },
    {
      mode: 'updates-numeric-source-url',
      label: 'an update whose sourceUrl is a number',
      path: '/updates/',
    },
    {
      mode: 'updates-null-element',
      label: 'a null update',
      path: '/updates/',
    },
    {
      // The follow-up round: `renderUpdatesPage()` reads `.slug` and
      // `.officialNameJa` off this object, so a non-object blanks the page.
      mode: 'updates-null-qualification',
      label: 'an update with a null qualification',
      path: '/updates/',
    },
    {
      mode: 'updates-string-qualification',
      label: 'an update whose qualification is a string',
      path: '/updates/',
    },
    {
      // `updateRowLabel()` passes a factLabel that differs from factKey
      // straight to `escapeHtml()`, which calls `replaceAll`.
      mode: 'updates-numeric-fact-label',
      label: 'an update whose factLabel is a number',
      path: '/updates/',
    },
    {
      mode: 'updates-object-fact-label',
      label: 'an update whose factLabel is an object',
      path: '/updates/',
    },
    {
      mode: 'compare-null-row-label',
      label: 'a comparison row with a null label',
      path: '/compare/',
    },
    {
      // Distinct from `compare-null-entries`: the row itself loses its cell
      // map, so the validator's own `Object.values(row.cells)` would throw.
      mode: 'compare-null-cells',
      label: 'a comparison row with null cells',
      path: '/compare/',
    },
    {
      mode: 'compare-null-entries',
      label: 'a comparison cell with null entries',
      path: '/compare/',
    },
    {
      mode: 'compare-null-entry',
      label: 'a null comparison entry',
      path: '/compare/',
    },
    {
      mode: 'compare-null-entry-value',
      label: 'a comparison entry with a null value',
      path: '/compare/',
    },
    {
      mode: 'compare-null-entry-fact-key',
      label: 'a comparison entry with a null factKey',
      path: '/compare/',
    },
    {
      mode: 'compare-null-row',
      label: 'a null comparison row',
      path: '/compare/',
    },
    {
      mode: 'compare-null-qualification',
      label: 'a null qualification in the comparison',
      path: '/compare/',
    },
    {
      mode: 'compare-null-name',
      label: 'a comparison qualification with a null name',
      path: '/compare/',
    },
    {
      mode: 'compare-null-slug',
      label: 'a comparison qualification with a null slug',
      path: '/compare/',
    },
    {
      // `renderComparePage()` wraps an entry's source URL in an anchor after
      // `escapeHtml()`, so a number blanks the page.
      mode: 'compare-numeric-entry-source-url',
      label: 'a comparison entry whose sourceUrl is a number',
      path: '/compare/',
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

  it('keeps /updates/ 200 when only the factLabel is null', async () => {
    // The counterweight to `updates-numeric-fact-label`. `updateRowLabel()`
    // falls back to 公式情報 for a null or empty label, so rejecting null here
    // would turn a page that renders correctly into a 503. Both cases were
    // measured: null and '' return 200 with the full page, a number, object or
    // array return 200 with an empty body.
    bodyMode = 'updates-null-fact-label';
    const web = await startWeb();
    try {
      const response = await web.get('/updates/');
      expect(response.status).toBe(200);
      expect((await response.text()).length).toBeGreaterThan(1000);
    } finally {
      await web.close();
    }
  });

  it('keeps /updates/ 200 when the qualification carries no fields at all', async () => {
    // `{}` is a record, so the validator accepts it and the renderer draws a
    // dead `/shikaku/undefined/undefined/` link -- ugly, but 200 with the full
    // page, measured. This case is what separates "is an object" from a looser
    // check like `qualification?.slug !== undefined`: that one rejects `{}` and
    // would turn this page into a 503, and no other test here would notice.
    bodyMode = 'updates-empty-qualification';
    const web = await startWeb();
    try {
      const response = await web.get('/updates/');
      expect(response.status).toBe(200);
      expect((await response.text()).length).toBeGreaterThan(1000);
    } finally {
      await web.close();
    }
  });

  it('keeps /updates/ 200 when the qualification slug is null', async () => {
    // `renderUpdatesPage()` reads `qualification.slug` but only interpolates
    // it into a link, so a null slug produces a dead `/shikaku/null/2026/`
    // href rather than a throw. Checked as "is an object" rather than full
    // identity for exactly this reason -- see the validator's doc comment.
    bodyMode = 'updates-null-qualification-slug';
    const web = await startWeb();
    try {
      const response = await web.get('/updates/');
      expect(response.status).toBe(200);
      expect((await response.text()).length).toBeGreaterThan(1000);
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

  it('keeps plan A on /pass-rate/ but logs how many qualifications failed', async () => {
    // Sprint 3A chose plan A: one unusable qualification fails the whole page.
    // Revisiting that decision needs "how often is it one qualification, not
    // the whole upstream?" -- so the failure must still be a 503 *and* carry
    // both counts. This case pins both halves: changing either one is a
    // decision, not a refactor.
    bodyMode = 'single-failure';
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });
    const web = await startWeb();
    try {
      const response = await web.get('/pass-rate/');
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('60');

      const observation = errors.find((line) =>
        line.includes('/pass-rate/ unusable upstream'),
      );
      expect(observation).toBeDefined();
      expect(observation).toContain(
        `1 of ${launchQualifications.length} qualifications`,
      );
      expect(observation).toContain('failed: it-passport');
      expect(observation).toContain('served: ');
      expect(observation).toContain('answering 503');
    } finally {
      spy.mockRestore();
      await web.close();
    }
  });

  it('serves /pass-rate/ as 200 when every qualification is healthy', async () => {
    // The other half: the observation must not fire on the healthy path, and
    // the page must still render.
    bodyMode = 'ok';
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args) => {
      errors.push(args.map(String).join(' '));
    });
    const web = await startWeb();
    try {
      const response = await web.get('/pass-rate/');
      expect(response.status).toBe(200);
      expect(await response.text()).toContain('合格率');
      expect(
        errors.filter((line) => line.includes('/pass-rate/ unusable upstream')),
      ).toEqual([]);
    } finally {
      spy.mockRestore();
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
