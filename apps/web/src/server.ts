import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  launchSlugs,
  renderComparePage,
  renderEditorialPage,
  renderErrorPage,
  renderGuideIndex,
  renderHomePage,
  renderNotFoundPage,
  parsePassRateIndexQuery,
  renderPassRateIndex,
  renderQualificationDirectory,
  renderQualificationSectionPage,
  renderSchedulePage,
  renderUpdatesPage,
  qualificationSectionHasContent,
  qualificationSitemapContent,
  type PublicQualificationView,
  type QualificationSection,
} from './render.js';
import { siteCss, siteCssPath } from './assets.js';
import {
  editorialAboutPage,
  editorialAboutSlugs,
  editorialComparisonPage,
  editorialComparisonSlugs,
  editorialGuideEntries,
  editorialGuidePage,
  editorialGuideSlugs,
} from './editorial.js';
import {
  launchQualifications,
  searchQualifications,
} from '../../../packages/schema/src/qualifications.js';
import { sitemapQualificationPaths } from './sitemap.js';
import { loadWebConfig, parseSiteOrigin, type WebConfig } from './config.js';
import type { PublicFact } from '../../../packages/schema/src/index.js';
import type { PublicCalendarEvent } from '../../../packages/schema/src/calendar.js';
import type { PublicQualificationComparison } from '../../../packages/schema/src/compare.js';
import type { PublicUpdateEvent } from '../../../packages/schema/src/updates.js';

const launchSlugSet = new Set<string>(launchSlugs);

/**
 * Sprint 3C: resolve and validate the web process configuration once, at
 * module load, so a wrong deployment fails at startup instead of degrading
 * into "users see 503 while `/` still answers 200 for the healthcheck".
 * `NODE_ENV=test` and an unset `NODE_ENV` keep today's behaviour.
 */
const webConfig: WebConfig = loadWebConfig();

const port = webConfig.port;
const apiBaseUrl = webConfig.apiBaseUrl;
const updatesPageSize = 20;

/**
 * Hard ceiling for one upstream API request (Sprint 3A / G-10).
 *
 * Before this constant existed, `fetch()` had no deadline: a TCP connection
 * that was accepted but never answered held the request (and the browser, and
 * the crawler) open indefinitely, so neither the 503 outage path nor
 * `Retry-After` ever fired.  A hanging upstream is the same fact as a refused
 * one — "we do not know the truth right now" — so it must fail on the same
 * clock and land on the same 503 path.
 *
 * 5000 ms is chosen because:
 *   - it matches the only other timeout already in this codebase
 *     (`connectionTimeoutMillis: 5000` in services/api/src/public-facts.ts and
 *     public-updates.ts), so one number describes "the source did not answer";
 *   - the upstream is a sibling container on the same Docker network running a
 *     single indexed SQL query, so a healthy answer is milliseconds, not
 *     seconds; 5 s is ~3 orders of magnitude of headroom, not a tight budget;
 *   - it keeps the fan-out routes bounded: `/`, `/pass-rate/` and
 *     `/sitemap.xml` fetch their qualifications in parallel, so the wall time
 *     is one timeout rather than N, and the worst case stays inside the
 *     deploy/docker-compose.prod.yml web healthcheck window.
 *
 * `UPSTREAM_TIMEOUT_MS` exists so the timeout can be exercised by a test
 * without sleeping for the production value; it is not a tuning knob for
 * production, which keeps the default.
 */
const upstreamTimeoutMs = webConfig.upstreamTimeoutMs;

/**
 * `AbortSignal.timeout()` rejects with a `TimeoutError` DOMException; an
 * aborted body stream rejects with `AbortError`.  Both mean the deadline we
 * set was reached, not that the payload was malformed.
 */
function isAbortOrTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

function siteOrigin(): string {
  // Sprint 3C: shared parser with layout.ts so both paths agree on what a
  // valid SITE_ORIGIN is.  The production throw is a second line of defence:
  // loadWebConfig() above already refuses to start without the variable.
  const origin = parseSiteOrigin(process.env.SITE_ORIGIN);
  if (origin) return origin;
  if (process.env.NODE_ENV === 'production')
    throw new Error('SITE_ORIGIN is required in production');
  return `http://127.0.0.1:${port}`;
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function renderSitemap(urls: readonly string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((url) => `<url><loc>${escapeXml(url)}</loc></url>`).join('')}</urlset>`;
}

/**
 * Sprint 3A / Task B: a failed sitemap must fail *as a sitemap*.
 *
 * Sprint 2B answered 503 correctly but reused the HTML outage page, so a
 * crawler that had already parsed the response as XML got an HTML document
 * with a `text/html` content type.  The status was right and the payload was
 * unreadable.  This keeps the status and the `Retry-After` contract and makes
 * the body valid XML that deliberately carries no `<urlset>`: an empty
 * `<urlset>` would be a *successful* sitemap claiming the site has no pages,
 * which is exactly the misreading the 503 exists to prevent.
 */
function renderSitemapError(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<error xmlns="http://shikakucheck.com/ns/sitemap-error"><message>temporarily unavailable</message><retryAfterSeconds>60</retryAfterSeconds></error>`;
}

/**
 * Raised when the upstream official-information API cannot be used: either the
 * request itself failed (connection refused, DNS, reset) or it answered with a
 * non-2xx status.  Both mean "we do not know the truth right now", which is
 * different from a successful response that legitimately carries no data.
 *
 * The distinction matters for HTTP status: a 2xx with `facts: []` is a real
 * page (200, indexable, listed in sitemap.xml); an unusable upstream is a
 * temporary outage (503, noindex, never listed).  Rendering an empty page with
 * 200 for the latter would publish a page that claims a qualification has no
 * official data when in fact we simply could not reach the source.
 */
export class UpstreamUnavailableError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpstreamUnavailableError';
  }
}

async function fetchUpstream(input: string): Promise<Response> {
  let response: Response;
  try {
    // The signal also covers reading the body: if the upstream sends headers
    // and then stalls mid-payload, `response.json()` rejects once the same
    // deadline expires, so a half-sent answer can never be parsed as data.
    response = await fetch(input, {
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
  } catch (error) {
    throw new UpstreamUnavailableError(
      isAbortOrTimeout(error)
        ? `API request timed out after ${upstreamTimeoutMs}ms`
        : `API request failed: ${(error as Error).message}`,
    );
  }
  if (!response.ok)
    throw new UpstreamUnavailableError(
      `API returned ${response.status}`,
      response.status,
    );
  return response;
}

/**
 * Sprint 3K: an upstream that answers 200 with something we cannot render is
 * an unusable upstream, not data. Classifying it here keeps the failure in the
 * 503 lane; letting it through means the route writes `200` and *then* the
 * renderer throws, which used to take the whole process down (see the catch at
 * the bottom of `handleRequest`).
 *
 * The checks stay deliberately shallow -- "is it an object, is the field I am
 * about to iterate an array". Anything deeper belongs to the API's own schema
 * tests, and a stricter web would just break whenever the API grows a field.
 */
async function readJson<T>(
  response: Response,
  label: string,
  isUsable: (value: unknown) => boolean,
): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new UpstreamUnavailableError(
      `${label}: response body was not JSON (${(error as Error).message})`,
    );
  }
  if (!isUsable(parsed))
    throw new UpstreamUnavailableError(
      `${label}: response body did not have the expected shape`,
    );
  return parsed as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * `{ qualification: {...}, status: '...', facts: [...] }` -- the section pages.
 *
 * Four field checks that look cosmetic but are not:
 *
 * - the qualification's display fields: `renderQualificationSectionPage()`
 *   renders `qualification.aliasesJa.map(escapeHtml)`, `officialNameJa`,
 *   `field` and `category`. Measured in Sprint 3M: `aliasesJa: null` throws
 *   `Cannot read properties of null (reading 'map')`, `aliasesJa: 'IPA'`
 *   throws `aliasesJa.map is not a function`, and a null `officialNameJa`,
 *   `field` or `category` throws from `escapeHtml()`. All four land after the
 *   200 header, so the reader gets a blank page instead of a 503.
 * - `facts` elements: the renderer sorts by `fact.factKey` and prints
 *   `fact.displayValue`, so a single `null` throws mid-render. By then the
 *   route has already written `200` and the response is lost (see the
 *   `headersSent` guard at the bottom of `handleRequest`).
 * - `status`: `sitemapQualificationPaths()` treats an unrecognised status as
 *   "not indexable" and returns no paths, so a missing status drops a whole
 *   qualification out of `/sitemap.xml` while the sitemap still answers
 *   `200 <urlset>` -- the same "an empty urlset claims the site has no pages"
 *   failure 3A fixed at the error level, one level down. Requiring a non-empty
 *   string catches the broken shape without pinning the enum, so a status the
 *   API adds later degrades to "not in the sitemap" rather than to a 503.
 * - the fact's provenance fields: `renderFactSource()` passes `sourceId`,
 *   `sourceSnapshotId` and `sourceUrl` straight into `escapeHtml()`, which
 *   calls `value.replaceAll`. A `null` there throws *after* the 200 header is
 *   sent, so the reader gets a blank page -- measured, not assumed (see
 *   Sprint 3K report §11 P2). `sourceUrl` and `officialVerifiedAt` are
 *   optional in the schema, so they are only checked when present.
 *
 * Deliberately *not* checked: `valueType`, `riskLevel`, `provenanceStatus`.
 * The renderer treats an unknown value as "not verified yet" and still
 * renders; rejecting the whole page would be a downgrade.
 */
function isQualificationView(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { qualification, facts, status } = value;
  return (
    isRecord(qualification) &&
    typeof qualification.slug === 'string' &&
    typeof qualification.officialNameJa === 'string' &&
    Array.isArray(qualification.aliasesJa) &&
    qualification.aliasesJa.every((alias) => typeof alias === 'string') &&
    typeof qualification.field === 'string' &&
    typeof qualification.category === 'string' &&
    typeof status === 'string' &&
    status.length > 0 &&
    Array.isArray(facts) &&
    facts.every(
      (fact) =>
        isRecord(fact) &&
        typeof fact.factKey === 'string' &&
        typeof fact.displayValue === 'string' &&
        typeof fact.examYear === 'number' &&
        typeof fact.sourceId === 'string' &&
        typeof fact.sourceSnapshotId === 'string' &&
        (fact.sourceUrl === undefined || typeof fact.sourceUrl === 'string') &&
        (fact.officialVerifiedAt === undefined ||
          typeof fact.officialVerifiedAt === 'string'),
    )
  );
}

/** The qualification fields `/schedule/` and `/compare/` put in markup. */
function hasQualificationIdentity(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.slug === 'string' &&
    typeof value.officialNameJa === 'string'
  );
}

/**
 * Calendar event types the renderer has a label for.
 *
 * `renderSchedulePage()` does `escapeHtml(eventTone[event.type])`; an unknown
 * type makes that lookup `undefined` and `escapeHtml()` throws on
 * `undefined.replaceAll`. Measured in Sprint 3M: `type: 'bogus'` returns
 * `200` with an empty body. Pinning the four types turns that blank page into
 * a 503. A type the API adds later must be added here *and* to `eventTone` --
 * the renderer cannot draw it before then anyway.
 */
const calendarEventTypes = new Set([
  'application_open',
  'application_deadline',
  'booking_open',
  'booking_deadline',
  'exam_date',
  'exam_period',
  'result_date',
  'effective_from',
  'effective_until',
]);

/**
 * `{ data: PublicCalendarEvent[] }` -- the `/schedule/` page.
 *
 * Element-level checks, each measured in Sprint 3M against a real stub. All of
 * these returned `200` with an empty body before the check, because the route
 * writes the status before rendering:
 *
 * - `type`: unknown or null -> `escapeHtml(undefined)` throws.
 * - `label`, `displayValue`, `factKey`: null -> `escapeHtml(null)` throws.
 * - `sourceUrl`: a number -> `escapeHtml(123)` throws (it is optional, so only
 *   checked when present).
 * - `qualification.officialNameJa`, `qualification.slug`: null -> throws.
 * - `dateValue`: a number -> no throw, but the event is silently dropped by
 *   the `dateValue < today` filter, so the schedule quietly loses an entry --
 *   the page looks fine and is missing a row, which is why it is checked too.
 *
 * The remaining fields are unchecked because a bad value degrades visibly
 * without lying: `examYear` renders a literal `null年`, `startValue` is fed
 * to `formatFactDisplayValue()` which stringifies it, `verifiedAt` renders
 * as 未確認, `id` only affects the ICS link, `sequence` is not read.
 */
function isCalendarEnvelope(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.data)) return false;
  return value.data.every(
    (event) =>
      isRecord(event) &&
      typeof event.type === 'string' &&
      calendarEventTypes.has(event.type) &&
      typeof event.label === 'string' &&
      typeof event.displayValue === 'string' &&
      typeof event.factKey === 'string' &&
      (event.dateValue === null || typeof event.dateValue === 'string') &&
      (event.endValue === undefined ||
        event.endValue === null ||
        typeof event.endValue === 'string') &&
      (event.sourceUrl === undefined || typeof event.sourceUrl === 'string') &&
      hasQualificationIdentity(event.qualification),
  );
}

/**
 * Calendar summary envelope: the homepage timeline only needs the 4 most
 * recent upcoming events with dateValue, type, label, examYear, sequence,
 * and qualification identity.
 */
function isCalendarSummaryEnvelope(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.data)) return false;
  return value.data.every(
    (event) =>
      isRecord(event) &&
      typeof event.type === 'string' &&
      calendarEventTypes.has(event.type) &&
      typeof event.label === 'string' &&
      typeof event.examYear === 'number' &&
      typeof event.sequence === 'number' &&
      (event.dateValue === null || typeof event.dateValue === 'string') &&
      hasQualificationIdentity(event.qualification),
  );
}

/**
 * `{ data: { qualifications: [...], rows: [...] } }` -- the `/compare/` page.
 *
 * `renderComparePage()` walks `comparison.qualifications` for the table header
 * and `comparison.rows[].cells[slug].entries[]` for the body. Sprint 3M
 * measured every one of these as `200` plus an empty body:
 *
 * - a `null` qualification, a `null` `officialNameJa` or `slug`;
 * - a `null` row, a `null` `row.label`;
 * - `row.cells` set to null;
 * - a `null` cell `entries` array, a `null` entry;
 * - a `null` entry `factKey` or `value`.
 *
 * `entry.sourceUrl` is checked for the same reason: it is optional, so only
 * checked when present, and a number reaches `escapeHtml()` inside the source
 * anchor. Measured: `200` with an empty body.
 *
 * Not checked because they do not throw: `row.key`, `qualification.aliasesJa`
 * and `qualification.field` (the selector renders the local qualification
 * list, not the comparison's copy), `entry.examYear`, `entry.verifiedAt`,
 * `missingReason` (all three measured: `200` with the full page).
 *
 * `entry.examYear` is deliberately left alone even though `/schedule/` checks
 * its own: the compare cell prints it as `適用年度: ${entry.examYear}年`, which
 * degrades to a visible `null年` rather than a blank page, and rejecting the
 * whole comparison table over one year label is the worse trade.
 */
function isComparisonEnvelope(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value.data)) return false;
  const { qualifications, rows } = value.data;
  if (!Array.isArray(qualifications) || !Array.isArray(rows)) return false;
  if (!qualifications.every(hasQualificationIdentity)) return false;
  return rows.every((row) => {
    if (!isRecord(row)) return false;
    if (typeof row.label !== 'string') return false;
    if (!isRecord(row.cells)) return false;
    return Object.values(row.cells).every(
      (cell) =>
        isRecord(cell) &&
        Array.isArray(cell.entries) &&
        cell.entries.every(
          (entry) =>
            isRecord(entry) &&
            typeof entry.factKey === 'string' &&
            typeof entry.value === 'string' &&
            (entry.sourceUrl === undefined ||
              typeof entry.sourceUrl === 'string'),
        ),
    );
  });
}

/**
 * `{ data: PublicUpdateEvent[], pagination?: {...} }` -- the `/updates/` page.
 *
 * `renderUpdatesPage()` builds a card per batch: it slices `createdAt`, runs
 * `formatUpdateDisplayValue()` over the before/after values, spreads
 * `affectedPages`, and passes `eventLabel` and `factKey` through
 * `escapeHtml()`. Sprint 3M measured all of these as `200` plus an empty body:
 * `eventLabel: null`, `factKey: null`, `newValue: null`,
 * `previousValue: 123`, `affectedPages: null`, `affectedPages: [null]`,
 * `createdAt: null`, `sourceUrl: 123`, and a `null` element in `data`.
 *
 * Two more were measured in the follow-up round, both `200` plus an empty
 * body, and both now checked:
 *
 * - `qualification` itself: `renderUpdatesPage()` reads
 *   `event.qualification.slug` while building the batch key and
 *   `event.qualification.officialNameJa` in the card title, so a `null`
 *   qualification throws. Sprint 3M recorded this field as safe because it
 *   measured `qualification.officialNameJa: null` -- which does degrade to
 *   visible text -- and generalised from there. A `null` qualification is a
 *   different value and is not safe.
 * - `factLabel`: `updateRowLabel()` returns it unchanged when it differs from
 *   `factKey`, so a number, object or array reaches `escapeHtml()` and throws.
 *   A `null` or empty `factLabel` is fine (it renders 公式情報), which is why
 *   the check allows `null` and rejects every other non-string -- measured:
 *   `null` and `''` both return `200` with the full page, `123`, `{a: 1}` and
 *   `['a']` all return `200` with an empty body.
 *
 * `qualification` is checked as "is an object", not with
 * `hasQualificationIdentity()`. That is the whole of what throws here:
 * `event.qualification.slug` and `.officialNameJa` are read off the object, so
 * `null`, a string, a number or an array all throw, while an object with a
 * `null` slug or name renders a visible `/shikaku/null/2026/` link and a
 * `nullの...` title -- ugly, but not blank, and measured as such. `/schedule/`
 * and `/compare/` do require the full identity because *their* renderers throw
 * on a null name; the same upstream field legitimately needs a different check
 * on a page that reads it differently.
 *
 * Not checked because they do not throw: `verifiedAt`, `eventType`, `id`,
 * `examYear` (all measured: `200` with the full page; `eventType` and
 * `examYear` only ever become part of the batch key, never markup).
 */
function isUpdatesEnvelope(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value.data)) return false;
  return value.data.every(
    (event) =>
      isRecord(event) &&
      typeof event.eventLabel === 'string' &&
      typeof event.factKey === 'string' &&
      (event.factLabel === null || typeof event.factLabel === 'string') &&
      isRecord(event.qualification) &&
      typeof event.newValue === 'string' &&
      (event.previousValue === null ||
        typeof event.previousValue === 'string') &&
      typeof event.createdAt === 'string' &&
      Array.isArray(event.affectedPages) &&
      event.affectedPages.every((page) => typeof page === 'string') &&
      (event.sourceUrl === undefined || typeof event.sourceUrl === 'string'),
  );
}

async function readQualification(slug: string) {
  const response = await fetchUpstream(
    `${apiBaseUrl}/api/v1/qualifications/${slug}`,
  );
  return readJson<PublicQualificationView>(
    response,
    `qualifications/${slug}`,
    isQualificationView,
  );
}

/**
 * Summary response shape: `{ qualification, facts, summary: true }`.
 * The homepage only needs exam_date, fee, and pass_rate facts — this
 * validator checks the minimal fields that `directoryHighlights()` reads.
 */
function isQualificationSummaryView(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { qualification, facts, summary } = value;
  return (
    summary === true &&
    isRecord(qualification) &&
    typeof qualification.slug === 'string' &&
    typeof qualification.officialNameJa === 'string' &&
    Array.isArray(qualification.aliasesJa) &&
    qualification.aliasesJa.every((alias) => typeof alias === 'string') &&
    typeof qualification.field === 'string' &&
    typeof qualification.category === 'string' &&
    Array.isArray(facts) &&
    facts.every(
      (fact) =>
        isRecord(fact) &&
        typeof fact.factKey === 'string' &&
        typeof fact.examYear === 'number' &&
        typeof fact.displayValue === 'string',
    )
  );
}

type QualificationSummaryView = {
  qualification: PublicQualificationView['qualification'];
  facts: Array<{
    factKey: string;
    examYear: number;
    displayValue: string;
    normalizedValue?: unknown;
    providerId?: string | null;
    examLevelId?: string | null;
    examComponent?: string | null;
    deliveryMode?: string | null;
  }>;
  summary: true;
};

/**
 * Fetch the lightweight summary view for the homepage.
 * Returns only exam_date, fee, and pass_rate facts (~5KB vs 1.2MB).
 */
async function readQualificationSummary(slug: string) {
  const response = await fetchUpstream(
    `${apiBaseUrl}/api/v1/qualifications/${slug}?summary=1`,
  );
  return readJson<QualificationSummaryView>(
    response,
    `qualifications/${slug}?summary=1`,
    isQualificationSummaryView,
  );
}

async function readCalendar(query: URLSearchParams) {
  const params = new URLSearchParams();
  const year = query.get('year');
  const qualification = query.get('qualification');
  if (year) params.set('year', year);
  if (qualification) params.set('qualification', qualification);
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await fetchUpstream(
    `${apiBaseUrl}/api/v1/calendar${suffix}`,
  );
  return readJson<{ data: PublicCalendarEvent[] }>(
    response,
    'calendar',
    isCalendarEnvelope,
  );
}

/**
 * Lightweight calendar read for the homepage timeline.
 * Returns only the 4 most recent upcoming events with the fields
 * `renderHomePage()` needs: dateValue, type, label, examYear, sequence,
 * and qualification (slug, officialNameJa). ~1KB vs 431KB.
 */
async function readCalendarSummary() {
  const response = await fetchUpstream(
    `${apiBaseUrl}/api/v1/calendar?summary=1`,
  );
  return readJson<{
    data: Array<{
      dateValue: string | null;
      type: PublicCalendarEvent['type'];
      label: string;
      examYear: number;
      sequence: number;
      qualification: { slug: string; officialNameJa: string };
    }>;
  }>(response, 'calendar?summary=1', isCalendarSummaryEnvelope);
}

async function readComparison(query: URLSearchParams) {
  const params = new URLSearchParams();
  const qualifications =
    query.get('qualifications') ?? query.getAll('qualification').join(',');
  if (qualifications) params.set('qualifications', qualifications);
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await fetchUpstream(`${apiBaseUrl}/api/v1/compare${suffix}`);
  return readJson<{ data: PublicQualificationComparison }>(
    response,
    'compare',
    isComparisonEnvelope,
  );
}

async function readUpdates(query: URLSearchParams, page: number) {
  const params = new URLSearchParams();
  const qualification = query.get('qualification');
  if (qualification) params.set('qualification', qualification);
  params.set('limit', String(updatesPageSize));
  params.set('offset', String((page - 1) * updatesPageSize));
  const response = await fetchUpstream(
    `${apiBaseUrl}/api/v1/updates?${params}`,
  );
  return readJson<{
    data: PublicUpdateEvent[];
    pagination?: { hasMore?: boolean };
  }>(response, 'updates', isUpdatesEnvelope);
}

function parseUpdatesPage(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 10_000
    ? parsed
    : 1;
}

async function proxyIcs(apiPath: string, res: ServerResponse) {
  let response: Response;
  try {
    // Same deadline as fetchUpstream(): the ICS proxy is the one fetch that
    // does not go through that helper, and a hung calendar download would
    // otherwise hold the connection open with no 503 and no Retry-After.
    response = await fetch(`${apiBaseUrl}${apiPath}`, {
      signal: AbortSignal.timeout(upstreamTimeoutMs),
    });
  } catch {
    // Same rule as the HTML routes: an unreachable or stalled upstream is a
    // temporary outage (503), not a missing calendar.
    res.writeHead(503, {
      'content-type': 'text/html; charset=utf-8',
      'retry-after': '60',
    });
    res.end(renderErrorPage());
    return;
  }
  if (!response.ok) {
    const notFound = response.status === 404;
    res.writeHead(notFound ? 404 : 503, {
      'content-type': 'text/html; charset=utf-8',
      ...(notFound ? {} : { 'retry-after': '60' }),
    });
    res.end(notFound ? renderNotFoundPage() : renderErrorPage());
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  res.writeHead(response.status, {
    'content-type':
      response.headers.get('content-type') ?? 'text/calendar; charset=utf-8',
    ...(response.headers.get('content-disposition')
      ? {
          'content-disposition': response.headers.get('content-disposition')!,
        }
      : {}),
  });
  res.end(body);
}

const STATIC_IMAGES: Record<string, string> = {
  'exam-information-workspace-hero.png': 'image/png',
  'hero-800.avif': 'image/avif',
  'hero-1200.avif': 'image/avif',
  'hero-1983.avif': 'image/avif',
  'hero-800.webp': 'image/webp',
  'hero-1200.webp': 'image/webp',
  'hero-1983.webp': 'image/webp',
  'brand-mark.png': 'image/png',
  'favicon-32.png': 'image/png',
  'apple-touch-icon.png': 'image/png',
  'og-brand.png': 'image/png',
  'twelve-tools-badge0-white.svg': 'image/svg+xml',
};

/**
 * The response is already underway, so no status can be written any more:
 * writing one throws `ERR_HTTP_HEADERS_SENT`, that rejection is unhandled, and
 * Node exits the process. End the response and let the (truncated) body stand;
 * the alternative is a container restart loop.
 *
 * Exported so a test can drive it directly: reaching it through HTTP needs an
 * upstream body that passes every shape check and *still* breaks a renderer,
 * which is a moving target as the checks tighten.
 */
export function closeAfterResponseStarted(
  req: { method?: string; url?: string },
  res: ServerResponse,
  error: unknown,
): void {
  console.error(
    `web: ${req.method} ${req.url} failed after the response started: ${(error as Error).message}`,
  );
  if (!res.writableEnded) res.end();
}

/**
 * G-11: every HTML document gets a weak ETag over its body plus
 * `max-age=0, must-revalidate`. Freshness is never assumed — the client must
 * revalidate — but a revalidation that matches costs 0 bytes (304). The body
 * is rendered before the status line is written, so a renderer that throws
 * still reaches the catch below with a clean 502/503 instead of a truncated
 * 200 (the `headersSent` guard remains for streams that fail mid-write).
 */
const HTML_CACHE_CONTROL = 'public, max-age=0, must-revalidate';

function sendHtml(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  html: string,
  extraHeaders: Record<string, string> = {},
): ServerResponse {
  const etag = `W/"${createHash('sha256').update(html).digest('base64url').slice(0, 32)}"`;
  if (status === 200 && req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': HTML_CACHE_CONTROL });
    return res.end();
  }
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    etag,
    'cache-control': HTML_CACHE_CONTROL,
    ...extraHeaders,
  });
  return res.end(html);
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void | ServerResponse> {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname;
    const imageMatch = pathname.match(
      /^\/images\/([a-z0-9-]+\.(?:png|webp|avif|svg))$/,
    );
    const imageType = imageMatch ? STATIC_IMAGES[imageMatch[1]] : undefined;
    if (imageMatch && imageType) {
      const image = await readFile(
        new URL(`../public/images/${imageMatch[1]}`, import.meta.url),
      );
      res.writeHead(200, {
        'content-type': imageType,
        'cache-control': 'public, max-age=604800',
      });
      return res.end(image);
    }
    if (pathname.startsWith('/assets/') && pathname.endsWith('.css')) {
      if (pathname !== siteCssPath) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        return res.end('Not Found');
      }
      res.writeHead(200, {
        'content-type': 'text/css; charset=utf-8',
        'cache-control': 'public, max-age=31536000, immutable',
      });
      return res.end(siteCss);
    }
    const icsMatch = pathname.match(
      /^\/ics\/([^/]+)\/(\d{4})(?:\/([^/]+))?\.ics$/,
    );
    const monthIcsMatch = pathname.match(/^\/ics\/month\/(\d{4}-\d{2})\.ics$/);
    const routeMatch = pathname.match(
      /^\/shikaku\/([^/]+)(?:\/(application|exam-content|pass-rate|\d{4}))?\/?$/,
    );
    if (pathname === '/robots.txt') {
      const origin = siteOrigin();
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end(
        `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`,
      );
    }
    if (pathname === '/sitemap.xml') {
      const origin = siteOrigin();
      const stablePaths = [
        '/',
        '/shikaku/',
        '/schedule/',
        '/compare/',
        '/pass-rate/',
        '/updates/',
        '/guide/',
        ...editorialComparisonSlugs.map((slug) => `/compare/${slug}/`),
        ...editorialGuideSlugs.map((slug) => `/guide/${slug}/`),
        ...editorialAboutSlugs.map((slug) => `/about/${slug}/`),
      ];
      let views: {
        qualification: (typeof launchQualifications)[number];
        view: Awaited<ReturnType<typeof readQualification>>;
      }[];
      try {
        views = await Promise.all(
          launchQualifications.map(async (qualification) => ({
            qualification,
            view: await readQualification(qualification.slug),
          })),
        );
      } catch (error) {
        // Answer in the format the caller asked for (Task B): 503 keeps the
        // outage semantics and Retry-After, but the body is XML without a
        // <urlset>, never the HTML error page.
        if (error instanceof UpstreamUnavailableError) {
          res.writeHead(503, {
            'content-type': 'application/xml; charset=utf-8',
            'retry-after': '60',
          });
          return res.end(renderSitemapError());
        }
        throw error;
      }
      const qualificationPaths = views.flatMap(({ qualification, view }) =>
        sitemapQualificationPaths(
          qualification.slug,
          view.status,
          qualificationSitemapContent(view),
        ),
      );
      res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
      return res.end(
        renderSitemap(
          [...stablePaths, ...qualificationPaths].map(
            (path) => `${origin}${path}`,
          ),
        ),
      );
    }
    if (monthIcsMatch) {
      return proxyIcs(
        `/api/v1/ics/month/${monthIcsMatch[1]}${url.search}`,
        res,
      );
    }
    if (icsMatch) {
      const [, qualification, year, eventId] = icsMatch;
      const apiPath = `/api/v1/ics/${qualification}/${year}${eventId ? `/${eventId}` : ''}`;
      return proxyIcs(apiPath, res);
    }
    if (pathname === '/shikaku' || pathname === '/shikaku/') {
      const query = url.searchParams.get('q') ?? '';
      const searchableQualifications = searchQualifications(
        launchQualifications.filter((qualification) =>
          launchSlugSet.has(qualification.slug),
        ),
        query,
      );
      const directoryItems = await Promise.all(
        searchableQualifications.map(async (qualification) => {
          const view = await readQualification(qualification.slug);
          return { ...qualification, status: view.status, facts: view.facts };
        }),
      );
      return sendHtml(
        req,
        res,
        200,
        renderQualificationDirectory(directoryItems, query),
      );
    }
    if (pathname === '/schedule' || pathname === '/schedule/') {
      const calendar = await readCalendar(url.searchParams);
      return sendHtml(
        req,
        res,
        200,
        renderSchedulePage(calendar.data, {
          year: url.searchParams.get('year') ?? undefined,
          qualification: url.searchParams.get('qualification') ?? undefined,
          type: url.searchParams.get('type') ?? undefined,
          range: url.searchParams.get('range') ?? undefined,
        }),
      );
    }
    if (pathname === '/compare' || pathname === '/compare/') {
      const comparison = await readComparison(url.searchParams);
      return sendHtml(
        req,
        res,
        200,
        renderComparePage(comparison.data, launchQualifications),
      );
    }
    if (pathname === '/guide' || pathname === '/guide/') {
      return sendHtml(req, res, 200, renderGuideIndex(editorialGuideEntries()));
    }
    if (pathname === '/pass-rate' || pathname === '/pass-rate/') {
      // Sprint 3A settled on plan A: one unusable qualification takes the whole
      // page down (503), because a pass-rate table that silently drops a row
      // looks complete while it is not. The trigger for revisiting that is
      // "over half of the production 503s come from a single qualification
      // failing" -- and that needs a measurement nobody was making.
      //
      // `allSettled` is the measurement, not a behaviour change: every
      // rejection is still re-thrown, so the response is byte-for-byte what
      // `Promise.all` produced. The difference is that we now know how many
      // siblings were fine, which is the number that decides plan A vs plan B.
      // Cost: a failure now waits for the slowest sibling instead of failing
      // fast. Bounded by the upstream timeout (5s, Sprint 3A).
      const settled = await Promise.allSettled(
        launchQualifications.map(async (qualification) => ({
          qualification,
          view: await readQualification(qualification.slug),
        })),
      );
      const failedSlugs: string[] = [];
      const servedSlugs: string[] = [];
      let firstFailure: unknown;
      settled.forEach((result, index) => {
        const slug = launchQualifications[index].slug;
        if (result.status === 'fulfilled') {
          servedSlugs.push(slug);
        } else {
          failedSlugs.push(slug);
          if (failedSlugs.length === 1) firstFailure = result.reason;
        }
      });
      if (failedSlugs.length > 0) {
        // One line, greppable, with both counts: `grep 'pass-rate/ unusable'`
        // over the container log answers "single qualification or whole
        // upstream?" without a second deploy. The status is read off the first
        // failure so the log and the response never disagree.
        //
        // This block is also where plan A is enforced: the `throw` below is
        // the only thing that keeps a partial fetch from rendering as a
        // complete-looking table. Deleting the log means deleting the
        // throw (mutation: `if (false && ...)` -> 200, not 503).
        const status =
          firstFailure instanceof UpstreamUnavailableError ? 503 : 502;
        console.error(
          `web: /pass-rate/ unusable upstream for ${failedSlugs.length} of ${launchQualifications.length} qualifications ` +
            `(failed: ${failedSlugs.join(', ')}; served: ${servedSlugs.join(', ') || 'none'}); ` +
            `answering ${status} (plan A: one failure fails the page)`,
        );
        throw firstFailure;
      }
      const views = settled.flatMap((result) =>
        result.status === 'fulfilled' ? [result.value] : [],
      );
      // G-02 / ADR 0002 §2: whitelist the sort parameters and mark every
      // parameter variant noindex; the canonical stays on /pass-rate/.
      const query = parsePassRateIndexQuery(url.searchParams);
      return sendHtml(
        req,
        res,
        200,
        renderPassRateIndex(
          views.filter(({ view }) =>
            qualificationSectionHasContent(view, 'pass-rate'),
          ),
          { sort: query.sort, order: query.order, noindex: query.noindex },
        ),
      );
    }
    const aboutMatch = pathname.match(/^\/about\/([^/]+)\/?$/);
    if (aboutMatch) {
      const page = editorialAboutPage(aboutMatch[1]);
      if (!page) {
        return sendHtml(req, res, 404, renderNotFoundPage());
      }
      return sendHtml(
        req,
        res,
        200,
        renderEditorialPage(page, 'about', `/about/${aboutMatch[1]}/`),
      );
    }
    const comparisonGuideMatch = pathname.match(/^\/compare\/([^/]+)\/?$/);
    if (comparisonGuideMatch) {
      const page = editorialComparisonPage(comparisonGuideMatch[1]);
      if (!page) {
        return sendHtml(req, res, 404, renderNotFoundPage());
      }
      return sendHtml(
        req,
        res,
        200,
        renderEditorialPage(
          page,
          'comparison',
          `/compare/${comparisonGuideMatch[1]}/`,
        ),
      );
    }
    const guideMatch = pathname.match(/^\/guide\/([^/]+)\/?$/);
    if (guideMatch) {
      const page = editorialGuidePage(guideMatch[1]);
      if (!page) {
        return sendHtml(req, res, 404, renderNotFoundPage());
      }
      return sendHtml(
        req,
        res,
        200,
        renderEditorialPage(page, 'guide', `/guide/${guideMatch[1]}/`),
      );
    }
    if (pathname === '/updates' || pathname === '/updates/') {
      const qualification = url.searchParams.get('qualification') ?? undefined;
      const page = parseUpdatesPage(url.searchParams.get('page'));
      const updates = await readUpdates(url.searchParams, page);
      return sendHtml(
        req,
        res,
        200,
        renderUpdatesPage(updates.data, {
          filtered: Boolean(qualification),
          page,
          hasMore: Boolean(updates.pagination?.hasMore),
          qualification,
        }),
      );
    }
    if (routeMatch) {
      const slug = routeMatch[1];
      const routePart = routeMatch[2];
      const annualYear = /^\d{4}$/.test(routePart ?? '')
        ? Number(routePart)
        : undefined;
      const requestedYear =
        routePart === 'pass-rate' ? url.searchParams.get('year') : null;
      // ADR 0002 §2: "?year= 与 ?sort=／?order= 一律不收". The route honours
      // exactly one parameter — ?year= with four digits on the pass-rate
      // section — so a variant is "any query parameter this route does not
      // honour". That is exactly two ways to be a variant, and both are needed:
      // an unknown key (?sort=, ?order=, ?foo=), and a year that is not four
      // digits. `requestedYear` is null on every other section, so a ?year=
      // there fails the second test on its own — spelling that out as a third
      // clause would be unreachable code, which is what the mutation run said.
      // A repeated year key needs no clause either: `get()` honours the first
      // value, so the page is scoped and already noindex through `year`.
      // Canonical already points at the clean URL, but canonical is a hint and
      // the meta tag is the instruction.
      const parameterVariant =
        url.searchParams.size > 0 && !/^\d{4}$/.test(requestedYear ?? '');
      const year =
        annualYear ??
        (/^\d{4}$/.test(requestedYear ?? '')
          ? Number(requestedYear)
          : undefined);
      const section: QualificationSection = annualYear
        ? 'annual'
        : routePart === 'application'
          ? 'application'
          : routePart === 'exam-content'
            ? 'exam-content'
            : routePart === 'pass-rate'
              ? 'pass-rate'
              : 'overview';
      if (
        ![
          'takken',
          'gyoseishoshi',
          'it-passport',
          'fundamental-it-engineer',
          'bookkeeping',
          'fp',
        ].includes(slug)
      ) {
        return sendHtml(req, res, 404, renderNotFoundPage());
      }
      const view = await readQualification(slug);
      return sendHtml(
        req,
        res,
        200,
        renderQualificationSectionPage(
          view,
          section,
          year,
          {
            historyAllYears:
              section === 'pass-rate' &&
              url.searchParams.get('history') === 'all',
          },
          parameterVariant,
        ),
      );
    }
    if (pathname === '/') {
      // The home page keeps its static entry points even when the API is
      // unavailable, so a data outage degrades to empty modules instead of 502.
      const [calendarResult, updatesResult, ...factsResults] =
        await Promise.allSettled([
          readCalendarSummary(),
          readUpdates(new URLSearchParams(), 1),
          ...launchSlugs.map(async (slug) => {
            const view = await readQualificationSummary(slug);
            return { slug, facts: (view.facts ?? []) as PublicFact[] };
          }),
        ]);
      const calendarEvents =
        calendarResult.status === 'fulfilled'
          ? ((calendarResult.value.data ?? []) as PublicCalendarEvent[])
          : [];
      const updateEvents =
        updatesResult.status === 'fulfilled'
          ? (updatesResult.value.data ?? [])
          : [];
      const factsBySlug: Record<string, PublicFact[]> = {};
      for (const result of factsResults) {
        if (result.status === 'fulfilled') {
          factsBySlug[result.value.slug] = result.value.facts;
        }
      }
      return sendHtml(
        req,
        res,
        200,
        renderHomePage(calendarEvents, updateEvents, factsBySlug),
      );
    }
    return sendHtml(req, res, 404, renderNotFoundPage());
  } catch (error) {
    // The response may already be underway: every route writes its status
    // *before* rendering, so a render that throws (an upstream 200 whose body
    // is not a renderable view) lands here with the headers already sent.
    // Writing a second status throws ERR_HTTP_HEADERS_SENT, that rejection is
    // unhandled, and Node exits the process -- one malformed upstream response
    // would turn into a container restart loop. Close the response instead.
    if (res.headersSent) {
      closeAfterResponseStarted(req, res, error);
      return;
    }
    // An unusable upstream is a temporary outage, not "this qualification has
    // no official data": answer 503 so crawlers and clients retry instead of
    // indexing a page that understates what the source actually publishes.
    // Every route that reaches this catch has already tried to fetch; the
    // static routes (images, CSS, robots.txt, editorial pages, 404) never
    // fetch and therefore never land here.
    if (error instanceof UpstreamUnavailableError) {
      return sendHtml(req, res, 503, renderErrorPage(), {
        'retry-after': '60',
      });
    }
    return sendHtml(req, res, 502, renderErrorPage());
  }
}

const server = createServer(handleRequest);

const webHost = process.env.WEB_HOST ?? '127.0.0.1';

// Tests import handleRequest directly; only a real process binds the port.
if (process.env.NODE_ENV !== 'test') {
  server.listen(port, webHost, () =>
    console.log(`web server on http://${webHost}:${port}`),
  );
}
