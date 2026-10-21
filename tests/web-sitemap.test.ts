import { describe, expect, it } from 'vitest';
import { sitemapQualificationPaths } from '../apps/web/src/sitemap.js';

const canonicalPaths = [
  '/shikaku/bookkeeping/',
  '/shikaku/bookkeeping/2026/',
  '/shikaku/bookkeeping/application/',
  '/shikaku/bookkeeping/exam-content/',
  '/shikaku/bookkeeping/pass-rate/',
];

describe('sitemap qualification paths', () => {
  it('lists canonical pages for verified and partially announced qualifications', () => {
    expect(sitemapQualificationPaths('bookkeeping', 'verified')).toEqual(
      canonicalPaths,
    );
    expect(
      sitemapQualificationPaths('bookkeeping', 'partially_announced'),
    ).toEqual(canonicalPaths);
  });

  it('omits qualifications without approved facts', () => {
    expect(
      sitemapQualificationPaths('bookkeeping', 'awaiting_official'),
    ).toEqual([]);
    expect(sitemapQualificationPaths('bookkeeping', 'under_review')).toEqual(
      [],
    );
  });
});
