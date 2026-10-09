import Fastify from 'fastify';
import {
  launchQualifications,
  searchQualifications,
} from '../../../packages/schema/src/qualifications.js';
import { buildPublicCalendarEvents } from '../../../packages/schema/src/calendar.js';
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
import { readApprovedFacts, readPendingFactCoverage } from './public-facts.js';
import { readPublicUpdates } from './public-updates.js';
import { buildPublicQualificationView } from './public-view.js';

export const app = Fastify({ logger: false });
export const takkenPipeline = new TakkenPipeline();
app.get('/health', async () => ({ status: 'ok', stage: 0 }));
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
  data: await readApprovedFacts(config.databaseUrl),
}));
app.get<{ Querystring: { year?: string; qualification?: string } }>(
  '/api/v1/calendar',
  async (request) => {
    const facts = await readApprovedFacts(config.databaseUrl);
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
  const facts = await readApprovedFacts(config.databaseUrl, qualification.slug);
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
app.get<{ Querystring: { qualifications?: string; q?: string } }>(
  '/api/v1/compare',
  async (request) => {
    const slugs = normalizeCompareSlugs(
      (request.query.qualifications ?? request.query.q ?? '')
        .split(',')
        .map((slug) => slug.trim()),
    );
    const facts = await readApprovedFacts(config.databaseUrl);
    const views = await Promise.all(
      slugs.map(async (slug) => {
        const qualification = launchQualifications.find(
          (item) => item.slug === slug,
        );
        if (!qualification) return undefined;
        return buildPublicQualificationView(
          qualification,
          facts.filter((fact) => fact.qualificationSlug === slug),
          await readPendingFactCoverage(config.databaseUrl, slug),
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
app.get<{ Querystring: { qualification?: string } }>(
  '/api/v1/updates',
  async (request) => ({
    data: await readPublicUpdates(
      config.databaseUrl,
      request.query.qualification,
    ),
    query: request.query,
  }),
);
app.get('/api/v1/qualifications/takken', async () => {
  const qualification = launchQualifications.find(
    (item) => item.slug === 'takken',
  );
  if (!qualification) return { error: 'not found' };
  if (config.databaseUrl) {
    const facts = await readApprovedFacts(config.databaseUrl, 'takken');
    return buildPublicQualificationView(
      qualification,
      facts,
      await readPendingFactCoverage(config.databaseUrl, 'takken'),
    );
  }
  return buildPublicQualificationView(qualification, []);
});
app.get<{ Params: { slug: string } }>(
  '/api/v1/qualifications/:slug',
  async (request, reply) => {
    const qualification = launchQualifications.find(
      (item) => item.slug === request.params.slug,
    );
    if (!qualification) return reply.code(404).send({ error: 'not found' });
    const facts = await readApprovedFacts(
      config.databaseUrl,
      qualification.slug,
    );
    return buildPublicQualificationView(
      qualification,
      facts,
      await readPendingFactCoverage(config.databaseUrl, qualification.slug),
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
