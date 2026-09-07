import { createServer } from 'node:http';
import {
  renderComparePage,
  renderEditorialPage,
  renderErrorPage,
  renderGuideIndex,
  renderHomePage,
  renderNotFoundPage,
  renderQualificationDirectory,
  renderQualificationSectionPage,
  renderSchedulePage,
  renderUpdatesPage,
  type QualificationSection,
} from './render.js';
import {
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

const port = Number(process.env.WEB_PORT ?? 3000);
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4100';

function siteOrigin(): string {
  const fallback = `http://127.0.0.1:${port}`;
  const configured = process.env.SITE_ORIGIN?.trim() || fallback;
  const origin = new URL(configured);
  if (!['http:', 'https:'].includes(origin.protocol))
    throw new Error('SITE_ORIGIN must use http or https');
  if (process.env.NODE_ENV === 'production' && !process.env.SITE_ORIGIN)
    throw new Error('SITE_ORIGIN is required in production');
  return origin.origin;
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

async function readQualification(slug: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/qualifications/${slug}`);
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

async function readCalendar(query: URLSearchParams) {
  const params = new URLSearchParams();
  const year = query.get('year');
  const qualification = query.get('qualification');
  if (year) params.set('year', year);
  if (qualification) params.set('qualification', qualification);
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await fetch(`${apiBaseUrl}/api/v1/calendar${suffix}`);
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

async function readComparison(query: URLSearchParams) {
  const params = new URLSearchParams();
  const qualifications =
    query.get('qualifications') ?? query.getAll('qualification').join(',');
  if (qualifications) params.set('qualifications', qualifications);
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await fetch(`${apiBaseUrl}/api/v1/compare${suffix}`);
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

async function readUpdates(query: URLSearchParams) {
  const params = new URLSearchParams();
  const qualification = query.get('qualification');
  if (qualification) params.set('qualification', qualification);
  const suffix = params.size ? `?${params.toString()}` : '';
  const response = await fetch(`${apiBaseUrl}/api/v1/updates${suffix}`);
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const pathname = url.pathname;
    const icsMatch = pathname.match(
      /^\/ics\/([^/]+)\/(\d{4})(?:\/([^/]+))?\.ics$/,
    );
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
        '/updates/',
        '/guide/',
        ...editorialComparisonSlugs.map((slug) => `/compare/${slug}/`),
        ...editorialGuideSlugs.map((slug) => `/guide/${slug}/`),
      ];
      const views = await Promise.all(
        launchQualifications.map(async (qualification) => ({
          qualification,
          view: await readQualification(qualification.slug),
        })),
      );
      const qualificationPaths = views.flatMap(({ qualification, view }) =>
        view.status === 'verified'
          ? [
              `/shikaku/${qualification.slug}/`,
              `/shikaku/${qualification.slug}/2026/`,
              `/shikaku/${qualification.slug}/application/`,
              `/shikaku/${qualification.slug}/exam-content/`,
              `/shikaku/${qualification.slug}/pass-rate/`,
            ]
          : [],
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
    if (icsMatch) {
      const [, qualification, year, eventId] = icsMatch;
      const apiPath = `/api/v1/ics/${qualification}/${year}${eventId ? `/${eventId}` : ''}`;
      const response = await fetch(`${apiBaseUrl}${apiPath}`);
      const body = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, {
        'content-type':
          response.headers.get('content-type') ??
          'text/calendar; charset=utf-8',
        ...(response.headers.get('content-disposition')
          ? {
              'content-disposition': response.headers.get(
                'content-disposition',
              )!,
            }
          : {}),
      });
      return res.end(body);
    }
    if (pathname === '/shikaku' || pathname === '/shikaku/') {
      const query = url.searchParams.get('q') ?? '';
      const searchableQualifications = searchQualifications(
        launchQualifications.filter((qualification) =>
          [
            'takken',
            'gyoseishoshi',
            'it-passport',
            'fundamental-it-engineer',
            'bookkeeping',
            'fp',
          ].includes(qualification.slug),
        ),
        query,
      );
      const directoryItems = await Promise.all(
        searchableQualifications.map(async (qualification) => {
          const view = await readQualification(qualification.slug);
          return { ...qualification, status: view.status };
        }),
      );
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(renderQualificationDirectory(directoryItems, query));
    }
    if (pathname === '/schedule' || pathname === '/schedule/') {
      const calendar = await readCalendar(url.searchParams);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        renderSchedulePage(calendar.data, {
          year: url.searchParams.get('year') ?? undefined,
          qualification: url.searchParams.get('qualification') ?? undefined,
        }),
      );
    }
    if (pathname === '/compare' || pathname === '/compare/') {
      const comparison = await readComparison(url.searchParams);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(renderComparePage(comparison.data, launchQualifications));
    }
    if (pathname === '/guide' || pathname === '/guide/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(renderGuideIndex(editorialGuideEntries()));
    }
    const comparisonGuideMatch = pathname.match(/^\/compare\/([^/]+)\/?$/);
    if (comparisonGuideMatch) {
      const page = editorialComparisonPage(comparisonGuideMatch[1]);
      if (!page) {
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(renderNotFoundPage());
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
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
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(renderNotFoundPage());
      }
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        renderEditorialPage(page, 'guide', `/guide/${guideMatch[1]}/`),
      );
    }
    if (pathname === '/updates' || pathname === '/updates/') {
      const updates = await readUpdates(url.searchParams);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(
        renderUpdatesPage(
          updates.data,
          Boolean(url.searchParams.get('qualification')),
        ),
      );
    }
    if (routeMatch) {
      const slug = routeMatch[1];
      const routePart = routeMatch[2];
      const year = /^\d{4}$/.test(routePart ?? '')
        ? Number(routePart)
        : undefined;
      const section: QualificationSection = year
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
        res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(renderNotFoundPage());
      }
      const view = await readQualification(slug);
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(renderQualificationSectionPage(view, section, year));
    }
    if (pathname === '/') {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(renderHomePage());
    }
    res.writeHead(404, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(renderNotFoundPage());
  } catch {
    res.writeHead(502, { 'content-type': 'text/html; charset=utf-8' });
    return res.end(renderErrorPage());
  }
});

server.listen(port, '127.0.0.1', () =>
  console.log(`web server on http://127.0.0.1:${port}`),
);
