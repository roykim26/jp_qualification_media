const sitemapQualificationStatuses = new Set([
  'verified',
  'partially_announced',
]);

// Partially announced qualifications still serve approved facts on indexable
// 200 pages without a noindex flag, so their canonical pages belong here.
export function sitemapQualificationPaths(
  slug: string,
  status: string,
): string[] {
  if (!sitemapQualificationStatuses.has(status)) return [];
  return [
    `/shikaku/${slug}/`,
    `/shikaku/${slug}/2026/`,
    `/shikaku/${slug}/application/`,
    `/shikaku/${slug}/exam-content/`,
    `/shikaku/${slug}/pass-rate/`,
  ];
}
