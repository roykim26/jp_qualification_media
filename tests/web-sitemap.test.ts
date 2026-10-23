import { describe, expect, it } from 'vitest';
import { sitemapQualificationPaths } from '../apps/web/src/sitemap.js';

const canonicalPaths = [
  '/shikaku/bookkeeping/',
  '/shikaku/bookkeeping/2026/',
  '/shikaku/bookkeeping/application/',
  '/shikaku/bookkeeping/exam-content/',
  '/shikaku/bookkeeping/pass-rate/',
];

const fullContent = {
  sections: ['overview', 'application', 'exam-content', 'pass-rate'],
  annualYears: [2026],
} as const;

describe('sitemap qualification paths', () => {
  it('lists canonical pages for verified and partially announced qualifications', () => {
    expect(
      sitemapQualificationPaths('bookkeeping', 'verified', fullContent),
    ).toEqual(canonicalPaths);
    expect(
      sitemapQualificationPaths(
        'bookkeeping',
        'partially_announced',
        fullContent,
      ),
    ).toEqual(canonicalPaths);
  });

  it('omits sections without approved facts', () => {
    expect(
      sitemapQualificationPaths('it-passport', 'verified', {
        sections: ['overview', 'application'],
        annualYears: [2026],
      }),
    ).toEqual([
      '/shikaku/it-passport/',
      '/shikaku/it-passport/2026/',
      '/shikaku/it-passport/application/',
    ]);
  });

  it('omits annual year pages when no year carries schedule facts', () => {
    expect(
      sitemapQualificationPaths('takken', 'verified', {
        sections: ['overview', 'application', 'exam-content'],
        annualYears: [],
      }),
    ).toEqual([
      '/shikaku/takken/',
      '/shikaku/takken/application/',
      '/shikaku/takken/exam-content/',
    ]);
  });

  it('omits qualifications without approved facts', () => {
    expect(
      sitemapQualificationPaths(
        'bookkeeping',
        'awaiting_official',
        fullContent,
      ),
    ).toEqual([]);
    expect(
      sitemapQualificationPaths('bookkeeping', 'under_review', fullContent),
    ).toEqual([]);
  });
});
