import { createServer } from 'node:http';
import {
  renderErrorPage,
  renderHomePage,
  renderNotFoundPage,
  renderQualificationDirectory,
  renderQualificationSectionPage,
  type QualificationSection,
} from './render.js';
import { launchQualifications } from '../../../packages/schema/src/qualifications.js';

const port = Number(process.env.WEB_PORT ?? 3000);
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4100';

async function readQualification(slug: string) {
  const response = await fetch(`${apiBaseUrl}/api/v1/qualifications/${slug}`);
  if (!response.ok) throw new Error(`API returned ${response.status}`);
  return response.json();
}

const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
    const routeMatch = pathname.match(
      /^\/shikaku\/([^/]+)(?:\/(application|exam-content|pass-rate|\d{4}))?\/?$/,
    );
    if (pathname === '/shikaku' || pathname === '/shikaku/') {
      const directoryItems = await Promise.all(
        launchQualifications
          .filter((qualification) =>
            [
              'takken',
              'gyoseishoshi',
              'it-passport',
              'fundamental-it-engineer',
              'bookkeeping',
              'fp',
            ].includes(qualification.slug),
          )
          .map(async (qualification) => {
            const view = await readQualification(qualification.slug);
            return { ...qualification, status: view.status };
          }),
      );
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      return res.end(renderQualificationDirectory(directoryItems));
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
