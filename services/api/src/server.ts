import Fastify from 'fastify';
import {
  launchQualifications,
  searchQualifications,
} from '../../../packages/schema/src/qualifications.js';
import {
  buildPublicCalendarEvents,
  type PublicCalendarEvent,
} from '../../../packages/schema/src/calendar.js';
import { buildCalendarIcs } from '../../../packages/schema/src/ics.js';
import {
  buildQualificationComparison,
  normalizeCompareSlugs,
} from '../../../packages/schema/src/compare.js';
import {
  isPubliclyReadable,
  type PublicFact,
} from '../../../packages/schema/src/index.js';
import { config } from '../../../packages/config/src/index.js';
import { TakkenPipeline } from './takken.js';
import { DatabaseNotConfiguredError } from './database-config.js';
import {
  readApprovedFacts,
  readPendingFactCoverage,
  readSummaryFacts,
} from './public-facts.js';
import { readPublicUpdates } from './public-updates.js';
import { buildPublicQualificationView } from './public-view.js';
import { checkDatabaseReadiness } from './database-ready.js';

export const app = Fastify({ logger: false });
export const takkenPipeline = new TakkenPipeline();

/**
 * Captured before the custom handler replaces it, so unknown errors keep
 * Fastify's exact default payload (verified against plain throws, errors with a
 * `code`, errors carrying `statusCode`, schema validation 400s and 404s).
 */
const defaultErrorHandler = app.errorHandler;

app.setErrorHandler((error, request, reply) => {
  // Configuration absence is a permanent fault: retrying cannot fix it, so it
  // must not borrow the 503 that is reserved for transient unavailability.
  if (error instanceof DatabaseNotConfiguredError) {
    return reply.code(500).send({
      statusCode: 500,
      code: 'database_not_configured',
      error: 'Internal Server Error',
      message: error.message,
    });
  }
  return defaultErrorHandler.call(app, error, request, reply);
});

const calendarEventTypes: readonly PublicCalendarEvent['type'][] = [
  'application_open',
  'application_deadline',
  'exam_date',
  'result_date',
];

function boundedQueryInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = value === undefined ? Number.NaN : Number(value);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(maximum, Math.max(minimum, parsed));
}
app.get('/health', async () => ({ status: 'ok', stage: 0 }));
/**
 * Readiness probe — liveness lives at `/health` and is intentionally unchanged.
 *
 * `/health` answers "is the process up", so it never touches the database and
 * compose keys `depends_on: api: service_healthy` off it. Turning it into a
 * data-plane check would let a brief database blip mark the API unhealthy, stop
 * the web container from starting, and take the whole site down through Caddy.
 * `/ready` is therefore a separate, additive signal that is NOT wired into any
 * healthcheck.
 */
app.get('/ready', async (_request, reply) => {
  const report = await checkDatabaseReadiness(config.apiDatabaseUrl);
  if (report.ready) return { status: 'ready', database: report.database };
  return reply.code(503).send({
    status: 'unavailable',
    database: report.database,
    ...(report.database === 'error' ? { message: report.message } : {}),
  });
});
app.get<{ Querystring: { q?: string } }>(
  '/api/v1/qualifications',
  async (request) => ({
    data: request.query.q
      ? searchQualifications(launchQualifications, request.query.q)
      : launchQualifications,
    query: request.query.q ?? '',
  }),
);
app.get<{ Querystring: { q?: string } }>(
  '/api/v1/search/qualifications',
  async (request) => ({
    data: searchQualifications(launchQualifications, request.query.q ?? ''),
    query: request.query.q ?? '',
  }),
);
app.get('/api/v1/facts', async () => ({
  data: await readApprovedFacts(config.apiDatabaseUrl),
}));
app.get<{ Querystring: { year?: string; qualification?: string } }>(
  '/api/v1/calendar',
  async (request) => {
    const facts = await readApprovedFacts(config.apiDatabaseUrl);
    const year = request.query.year ? Number(request.query.year) : undefined;
    const events = buildPublicCalendarEvents(
      launchQualifications,
      facts,
    ).filter(
      (event) =>
        (!year || event.examYear === year) &&
        (!request.query.qualification ||
          event.qualification.slug === request.query.qualification),
    );
    return { data: events, query: request.query };
  },
);
app.get<{
  Params: { qualification: string; year: string; eventId?: string };
}>('/api/v1/ics/:qualification/:year/:eventId?', async (request, reply) => {
  const qualification = launchQualifications.find(
    (item) => item.slug === request.params.qualification,
  );
  const year = Number(request.params.year);
  if (!qualification || !Number.isInteger(year))
    return reply.code(404).send({ error: 'not found' });
  const facts = await readApprovedFacts(
    config.apiDatabaseUrl,
    qualification.slug,
  );
  const events = buildPublicCalendarEvents([qualification], facts).filter(
    (event) =>
      event.examYear === year &&
      (!request.params.eventId || event.id === request.params.eventId),
  );
  const body = buildCalendarIcs(
    events,
    `${qualification.officialNameJa} ${year}年試験日程`,
  );
  if (!body) return reply.code(404).send({ error: 'calendar not available' });
  const suffix = request.params.eventId ? '-event' : '';
  return reply
    .header('content-type', 'text/calendar; charset=utf-8')
    .header(
      'content-disposition',
      `attachment; filename="${qualification.slug}-${year}${suffix}.ics"`,
    )
    .send(body);
});
app.get<{
  Params: { month: string };
  Querystring: { qualification?: string; type?: string };
}>('/api/v1/ics/month/:month', async (request, reply) => {
  const monthMatch = request.params.month.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!monthMatch) return reply.code(404).send({ error: 'not found' });
  const qualification = request.query.qualification
    ? launchQualifications.find(
        (item) => item.slug === request.query.qualification,
      )
    : undefined;
  if (request.query.qualification && !qualification)
    return reply.code(404).send({ error: 'not found' });
  const type = calendarEventTypes.find((value) => value === request.query.type);
  if (request.query.type && !type)
    return reply.code(404).send({ error: 'not found' });
  const facts = await readApprovedFacts(
    config.apiDatabaseUrl,
    qualification?.slug,
  );
  const events = buildPublicCalendarEvents(
    qualification ? [qualification] : launchQualifications,
    facts,
  ).filter(
    (event) =>
      event.dateValue?.startsWith(request.params.month) &&
      (!type || event.type === type),
  );
  const [year, month] = monthMatch.slice(1);
  const body = buildCalendarIcs(
    events,
    `${qualification ? `${qualification.officialNameJa} ` : ''}${year}年${Number(month)}月の試験日程`,
  );
  if (!body) return reply.code(404).send({ error: 'calendar not available' });
  const filename = `${qualification ? `${qualification.slug}-` : 'schedule-'}${request.params.month}.ics`;
  return reply
    .header('content-type', 'text/calendar; charset=utf-8')
    .header('content-disposition', `attachment; filename="${filename}"`)
    .send(body);
});
app.get<{ Querystring: { qualifications?: string; q?: string } }>(
  '/api/v1/compare',
  async (request) => {
    const slugs = normalizeCompareSlugs(
      (request.query.qualifications ?? request.query.q ?? '')
        .split(',')
        .map((slug) => slug.trim()),
    );
    const facts = await readApprovedFacts(config.apiDatabaseUrl);
    const views = await Promise.all(
      slugs.map(async (slug) => {
        const qualification = launchQualifications.find(
          (item) => item.slug === slug,
        );
        if (!qualification) return undefined;
        return buildPublicQualificationView(
          qualification,
          facts.filter((fact) => fact.qualificationSlug === slug),
          await readPendingFactCoverage(config.apiDatabaseUrl, slug),
        );
      }),
    );
    return {
      data: buildQualificationComparison(
        launchQualifications,
        facts,
        slugs,
        Object.fromEntries(
          views
            .filter(Boolean)
            .map((view) => [view!.qualification.slug, view!.missingReasons]),
        ),
      ),
      query: { qualifications: slugs },
    };
  },
);
app.get<{
  Querystring: { qualification?: string; limit?: string; offset?: string };
}>('/api/v1/updates', async (request) => {
  const limit = boundedQueryInteger(request.query.limit, 100, 1, 100);
  const offset = boundedQueryInteger(request.query.offset, 0, 0, 1_000_000);
  const updates = await readPublicUpdates(
    config.apiDatabaseUrl,
    request.query.qualification,
    { limit, offset },
  );
  return {
    data: updates.events,
    query: request.query,
    pagination: { limit, offset, hasMore: updates.hasMore },
  };
});
app.get('/api/v1/qualifications/takken', async () => {
  const qualification = launchQualifications.find(
    (item) => item.slug === 'takken',
  );
  if (!qualification) return { error: 'not found' };
  // No `if (config.apiDatabaseUrl)` branch: branching here made a missing
  // configuration indistinguishable from "no approved facts yet". The readers
  // now decide (and throw when the configuration is genuinely absent).
  const facts = await readApprovedFacts(config.apiDatabaseUrl, 'takken');
  return buildPublicQualificationView(
    qualification,
    facts,
    await readPendingFactCoverage(config.apiDatabaseUrl, 'takken'),
  );
});
app.get<{ Params: { slug: string }; Querystring: { summary?: string } }>(
  '/api/v1/qualifications/:slug',
  async (request, reply) => {
    const qualification = launchQualifications.find(
      (item) => item.slug === request.params.slug,
    );
    if (!qualification) return reply.code(404).send({ error: 'not found' });
    // ?summary=1 returns only the fields needed by the homepage's
    // directoryHighlights(). This reduces the bookkeeping payload from
    // 1.2MB (1646 facts) to ~5KB (5 facts), and eliminates the correlated
    // subquery for `sequence` and the LEFT JOIN LATERAL for provenance.
    if (request.query.summary === '1') {
      const facts = await readSummaryFacts(
        config.apiDatabaseUrl,
        qualification.slug,
      );
      return { qualification, facts, summary: true };
    }
    const facts = await readApprovedFacts(
      config.apiDatabaseUrl,
      qualification.slug,
    );
    return buildPublicQualificationView(
      qualification,
      facts,
      await readPendingFactCoverage(config.apiDatabaseUrl, qualification.slug),
    );
  },
);
export function publicFactsOnly(facts: PublicFact[]): PublicFact[] {
  return facts.filter(isPubliclyReadable);
}

if (process.env.NODE_ENV !== 'test')
  app
    .listen({ host: config.apiHost, port: config.apiPort })
    .then(() =>
      console.log(`API listening on ${config.apiHost}:${config.apiPort}`),
    );
