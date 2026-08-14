import Fastify from 'fastify';
import { launchQualifications } from '../../../packages/schema/src/qualifications.js';
import {
  isPubliclyReadable,
  type PublicFact,
} from '../../../packages/schema/src/index.js';
import { config } from '../../../packages/config/src/index.js';
import { TakkenPipeline } from './takken.js';
import { readApprovedFacts } from './public-facts.js';
import { buildPublicQualificationView } from './public-view.js';

export const app = Fastify({ logger: false });
export const takkenPipeline = new TakkenPipeline();
app.get('/health', async () => ({ status: 'ok', stage: 0 }));
app.get('/api/v1/qualifications', async () => ({ data: launchQualifications }));
app.get('/api/v1/facts', async () => ({
  data: await readApprovedFacts(config.databaseUrl),
}));
app.get('/api/v1/qualifications/takken', async () => {
  const qualification = launchQualifications.find(
    (item) => item.slug === 'takken',
  );
  if (!qualification) return { error: 'not found' };
  if (config.databaseUrl) {
    const facts = await readApprovedFacts(config.databaseUrl, 'takken');
    return buildPublicQualificationView(qualification, facts);
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
    return buildPublicQualificationView(qualification, facts);
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
