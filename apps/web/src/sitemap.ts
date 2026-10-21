import type { QualificationSection } from './render.js';

const sitemapQualificationStatuses = new Set([
  'verified',
  'partially_announced',
]);

export type QualificationSitemapContent = {
  sections: readonly QualificationSection[];
  annualYears: readonly number[];
};

// A section without approved facts renders an empty state with noindex, so it
// must not be advertised in the sitemap either.
export function sitemapQualificationPaths(
  slug: string,
  status: string,
  content: QualificationSitemapContent,
): string[] {
  if (!sitemapQualificationStatuses.has(status)) return [];
  const has = (section: QualificationSection) =>
    content.sections.includes(section);
  return [
    ...(has('overview') ? [`/shikaku/${slug}/`] : []),
    ...content.annualYears.map((year) => `/shikaku/${slug}/${year}/`),
    ...(has('application') ? [`/shikaku/${slug}/application/`] : []),
    ...(has('exam-content') ? [`/shikaku/${slug}/exam-content/`] : []),
    ...(has('pass-rate') ? [`/shikaku/${slug}/pass-rate/`] : []),
  ];
}
