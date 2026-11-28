import { describe, expect, it } from 'vitest';
import { renderUpdatesPage } from '../apps/web/src/render.js';
import {
  formatDateOnlyJa,
  formatSiteDateAttribute,
  formatSiteDateTime,
  formatSiteDay,
  timeLabels,
} from '../apps/web/src/time.js';
import { launchQualifications } from '../packages/schema/src/qualifications.js';

const takken = launchQualifications.find((item) => item.slug === 'takken')!;

describe('unified public time labels (P1-02)', () => {
  it('renders stored instants in JST, not UTC', () => {
    // 02:00 UTC is 11:00 JST on the same day.
    expect(formatSiteDateTime('2026-11-21T02:00:00.000Z')).toBe(
      '2026年11月21日(土) 11:00',
    );
    expect(formatSiteDay('2026-11-21T02:00:00.000Z')).toBe('2026年11月21日');
  });

  it('crosses the date boundary with JST', () => {
    // 23:30 UTC is 08:30 JST the next day.
    expect(formatSiteDay('2026-11-28T23:30:00.000Z')).toBe('2026年11月29日');
    expect(formatSiteDateAttribute('2026-11-28T23:30:00.000Z')).toBe(
      '2026-11-29',
    );
  });

  it('degrades a missing or invalid instant to 未確認', () => {
    expect(formatSiteDateTime(null)).toBe('未確認');
    expect(formatSiteDay('not-a-date')).toBe('未確認');
    expect(formatSiteDateAttribute(null)).toBe('');
  });

  it('renders date-only calendar values without a timezone shift', () => {
    expect(formatDateOnlyJa('2026-06-14')).toBe('2026年6月14日');
    expect(formatDateOnlyJa('unknown')).toBe('unknown');
  });

  it('keeps one distinct label per stored timestamp', () => {
    const labels = Object.values(timeLabels);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels).not.toContain('更新日');
    expect(timeLabels.officialPublished).toBe('公式発表日');
    expect(timeLabels.captured).toBe('取得日時（チェック）');
    expect(timeLabels.sitePublished).toBe('掲載日時（本サイト）');
  });

  it('labels the update card date as the site publication time', () => {
    const html = renderUpdatesPage([
      {
        id: 'change:takken:exam_date',
        eventType: 'exam_date',
        eventLabel: '試験日の変更',
        qualification: takken,
        factKey: 'exam_date',
        factLabel: '試験日',
        examYear: 2026,
        previousValue: '2026年10月11日',
        newValue: '2026年10月18日',
        affectedPages: [],
        sourceUrl: 'https://www.retio.or.jp/exam/',
        createdAt: '2026-08-14T00:00:00.000Z',
        verifiedAt: '2026-08-13T00:00:00.000Z',
      },
    ]);
    expect(html).toContain('掲載日時（本サイト）: 2026年8月14日');
    expect(html).toContain('公式情報確認（審査）: 2026年8月13日(木) 09:00');
    expect(html).toContain('<time datetime="2026-08-14">');
    // No vague "更新日" label and no raw UTC time in the markup.
    expect(html).not.toContain('更新日');
    expect(html).not.toContain('T00:00');
  });
});
