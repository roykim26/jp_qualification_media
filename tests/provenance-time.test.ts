import { describe, expect, it } from 'vitest';
import type { PublicFact } from '../packages/schema/src/index.js';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import { renderQualificationPage } from '../apps/web/src/render.js';
import { buildPublicQualificationView } from '../services/api/src/public-view.js';

const takken = launchQualifications.find((item) => item.slug === 'takken')!;

function fact(overrides: Partial<PublicFact> = {}): PublicFact {
  return {
    qualificationSlug: 'takken',
    providerId: null,
    examLevelId: null,
    examComponent: null,
    deliveryMode: null,
    examYear: 2026,
    factKey: 'exam_date',
    valueType: 'date',
    normalizedValue: '2026-10-18',
    displayValue: '2026年10月18日',
    status: 'approved',
    riskLevel: 'medium',
    sourceId: 'source:takken:retio-exam',
    sourceSnapshotId: 'snapshot:takken:exam',
    synthetic: false,
    verifiedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('public provenance time labels', () => {
  it('never shows a placeholder/capture time as official confirmation', () => {
    const html = renderQualificationPage(
      buildPublicQualificationView(takken, [
        fact({
          provenanceStatus: 'fixture',
          capturedAt: '2026-01-01T09:00:00.000Z',
        }),
      ]),
    );
    expect(html).toContain('公式情報確認（審査）: 回帰用 fixture');
    expect(html).toContain('取得日時（チェック）: 回帰用 fixture');
    expect(html).toContain('公式発表日: 本サイトでは未記録');
    expect(html).not.toContain('2026-01-01T09:00');
  });

  it('shows review, capture and publication times as separate facts', () => {
    const html = renderQualificationPage(
      buildPublicQualificationView(takken, [
        fact({
          provenanceStatus: 'verified',
          officialVerifiedAt: '2026-08-11T00:00:00.000Z',
          capturedAt: '2026-08-10T03:00:00.000Z',
          publishedAt: '2026-08-11T02:00:00.000Z',
        }),
      ]),
    );
    expect(html).toContain('公式情報確認（審査）: 2026年8月11日');
    expect(html).toContain('09:00');
    expect(html).toContain('取得日時（チェック）: 2026年8月10日');
    expect(html).toContain('12:00');
    expect(html).toContain('掲載日時（本サイト）: 2026年8月11日');
    expect(html).toContain('11:00');
    expect(html).toContain('公式発表日: 本サイトでは未記録');
  });
});
