import { describe, expect, it } from 'vitest';
import {
  renderQualificationDirectory,
  renderQualificationPage,
  renderQualificationSectionPage,
} from '../apps/web/src/render.js';
import { launchQualifications } from '../packages/schema/src/qualifications.js';

const itPassport = launchQualifications.find(
  (qualification) => qualification.slug === 'it-passport',
)!;

describe('IT Passport public page rendering', () => {
  it('renders an explicit awaiting-official empty state', () => {
    const html = renderQualificationPage({
      qualification: itPassport,
      status: 'awaiting_official',
      facts: [],
      officialVerifiedAt: null,
    });
    expect(html).toContain('公式発表待ち');
    expect(html).toContain('未確認の日付や費用は表示しません');
    expect(html).toContain('公式ソースと更新について');
    expect(html).toContain('https://www.ipa.go.jp/shiken/');
    expect(html).toContain('情報ステータスの見方');
    expect(html).not.toContain('undefined');
  });

  it('renders source details for approved facts and escapes user-facing values', () => {
    const html = renderQualificationPage({
      qualification: itPassport,
      status: 'verified',
      officialVerifiedAt: '2026-08-11T00:00:00.000Z',
      facts: [
        {
          qualificationSlug: 'it-passport',
          examLevelId: null,
          examYear: 2026,
          factKey: 'exam_method',
          valueType: 'text',
          normalizedValue: 'CBT',
          displayValue: '<CBT>',
          status: 'approved',
          riskLevel: 'medium',
          sourceId: 'source:it-passport:jitec-home',
          sourceSnapshotId: 'snapshot:official',
          synthetic: false,
          verifiedAt: '2026-08-11T00:00:00.000Z',
          sourceUrl: 'https://www3.jitec.ipa.go.jp/JitesCbt/',
        },
      ],
    });
    expect(html).toContain('&lt;CBT&gt;');
    expect(html).toContain('公式ソースを確認');
    expect(html).toContain('https://www3.jitec.ipa.go.jp/JitesCbt/');
    expect(html).not.toContain('<CBT>');
  });

  it('scopes application and exam-content sections to their fact keys', () => {
    const view = {
      qualification: itPassport,
      status: 'verified' as const,
      officialVerifiedAt: '2026-08-11T00:00:00.000Z',
      facts: [
        {
          qualificationSlug: 'it-passport' as const,
          examLevelId: null,
          examYear: 2026,
          factKey: 'exam_method',
          valueType: 'text' as const,
          normalizedValue: 'CBT',
          displayValue: 'CBT方式',
          status: 'approved' as const,
          riskLevel: 'medium' as const,
          sourceId: 'source:it-passport:jitec-home',
          sourceSnapshotId: 'snapshot:official',
          synthetic: false,
          verifiedAt: '2026-08-11T00:00:00.000Z',
        },
      ],
    };
    const application = renderQualificationSectionPage(view, 'application');
    expect(application).toContain('申込み・受験資格の公式情報は未確認です');
    expect(application).not.toContain('CBT方式');
    const examContent = renderQualificationSectionPage(view, 'exam-content');
    expect(examContent).toContain('CBT方式');
    expect(examContent).toContain('試験内容');
    expect(examContent).toContain('更新・訂正について');
  });

  it('keeps annual facts isolated by year and exposes the five page types', () => {
    const view = {
      qualification: itPassport,
      status: 'verified' as const,
      officialVerifiedAt: '2026-08-11T00:00:00.000Z',
      facts: [
        {
          qualificationSlug: 'it-passport' as const,
          examLevelId: null,
          examYear: 2026,
          factKey: 'application_open_2026_may_sessions',
          valueType: 'datetime' as const,
          normalizedValue: '2026-03-24T21:30:00+09:00',
          displayValue: '2026年度の申込情報',
          status: 'approved' as const,
          riskLevel: 'high' as const,
          sourceId: 'source:it-passport:jitec-application',
          sourceSnapshotId: 'snapshot:official:2026',
          synthetic: false,
          verifiedAt: '2026-08-11T00:00:00.000Z',
        },
        {
          qualificationSlug: 'it-passport' as const,
          examLevelId: null,
          examYear: 2025,
          factKey: 'exam_date',
          valueType: 'date' as const,
          normalizedValue: '2025-12-01',
          displayValue: '2025年度の試験日',
          status: 'approved' as const,
          riskLevel: 'high' as const,
          sourceId: 'source:it-passport:jitec-home',
          sourceSnapshotId: 'snapshot:official:2025',
          synthetic: false,
          verifiedAt: '2025-12-01T00:00:00.000Z',
        },
        {
          qualificationSlug: 'it-passport' as const,
          examLevelId: null,
          examYear: 2026,
          factKey: 'passing_standard',
          valueType: 'text' as const,
          normalizedValue: 'official-standard',
          displayValue: '公式合格基準',
          status: 'approved' as const,
          riskLevel: 'high' as const,
          sourceId: 'source:it-passport:ipa',
          sourceSnapshotId: 'snapshot:official:standard',
          synthetic: false,
          verifiedAt: '2026-08-11T00:00:00.000Z',
        },
      ],
    };

    const annual = renderQualificationSectionPage(view, 'annual', 2026);
    expect(annual).toContain('2026年度の申込情報');
    expect(annual).not.toContain('2025年度の試験日');
    expect(annual).not.toContain('公式合格基準');
    expect(annual).toContain('2026年試験日程');

    const application = renderQualificationSectionPage(view, 'application');
    expect(application).toContain('2026年度の申込情報');

    const passRate = renderQualificationSectionPage(view, 'pass-rate');
    expect(passRate).toContain('公式合格基準');
    expect(passRate).not.toContain('2026年度の申込情報');

    expect(passRate).toContain('/shikaku/it-passport/2026/');
    expect(passRate).toContain('/shikaku/it-passport/application/');
    expect(passRate).toContain('/shikaku/it-passport/exam-content/');
    expect(passRate).toContain('/shikaku/it-passport/pass-rate/');
  });
});

describe('shared qualification page rendering', () => {
  it('renders FP provider, component, delivery mode, and both official institutions', () => {
    const fp = launchQualifications.find((item) => item.slug === 'fp')!;
    const html = renderQualificationPage({
      qualification: fp,
      status: 'verified',
      officialVerifiedAt: '2026-08-13T00:00:00.000Z',
      facts: [
        {
          qualificationSlug: 'fp',
          providerId: 'jafp',
          examLevelId: 'fp:2',
          examComponent: 'academic',
          deliveryMode: 'cbt',
          examYear: 2026,
          factKey: 'exam_time',
          valueType: 'integer',
          normalizedValue: '120',
          displayValue: '120分',
          status: 'approved',
          riskLevel: 'high',
          sourceId: 'source:fp:jafp-2-3-outline',
          sourceSnapshotId: 'snapshot:fp:official',
          synthetic: false,
          verifiedAt: '2026-08-13T00:00:00.000Z',
          sourceUrl: 'https://www.jafp.or.jp/exam/outline/',
        },
      ],
    });
    expect(html).toContain('jafp');
    expect(html).toContain('fp:2');
    expect(html).toContain('academic');
    expect(html).toContain('cbt');
    expect(html).toContain('日本FP協会');
    expect(html).toContain('金融財政事情研究会');
  });

  it('renders bookkeeping level, delivery mode, and official sources', () => {
    const bookkeeping = launchQualifications.find(
      (item) => item.slug === 'bookkeeping',
    )!;
    const html = renderQualificationPage({
      qualification: bookkeeping,
      status: 'verified',
      officialVerifiedAt: '2026-08-13T00:00:00.000Z',
      facts: [
        {
          qualificationSlug: 'bookkeeping',
          examLevelId: 'bookkeeping:2',
          deliveryMode: 'network',
          examYear: 2026,
          factKey: 'exam_method',
          valueType: 'text',
          normalizedValue: 'CBT',
          displayValue: '2級 ネット試験',
          status: 'approved',
          riskLevel: 'high',
          sourceId: 'source:bookkeeping:network',
          sourceSnapshotId: 'snapshot:bookkeeping:official',
          synthetic: false,
          verifiedAt: '2026-08-13T00:00:00.000Z',
          sourceUrl: 'https://www.kentei.ne.jp/33013',
        },
      ],
    });
    expect(html).toContain('日商簿記');
    expect(html).toContain('bookkeeping:2');
    expect(html).toContain('network');
    expect(html).toContain('https://www.kentei.ne.jp/calendar_2026');
  });

  it('uses the qualification slug in shared navigation for Takken', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const html = renderQualificationPage({
      qualification: takken,
      status: 'awaiting_official',
      facts: [],
      officialVerifiedAt: null,
    });
    expect(html).toContain('/shikaku/takken/application/');
    expect(html).toContain('https://www.retio.or.jp/exam/');
    expect(html).not.toContain('/shikaku/it-passport/application/');
  });

  it('renders the launch directory without exposing unimplemented qualifications', () => {
    const items = launchQualifications
      .filter((item) => ['takken', 'it-passport'].includes(item.slug))
      .map((qualification) => ({
        ...qualification,
        status: 'awaiting_official' as const,
      }));
    const html = renderQualificationDirectory(items);
    expect(html).toContain('宅地建物取引士');
    expect(html).toContain('ITパスポート');
    expect(html).not.toContain('行政書士');
    expect(html).toContain('/shikaku/takken/');
  });

  it('keeps the third qualification identity available', () => {
    const gyoseishoshi = launchQualifications.find(
      (item) => item.slug === 'gyoseishoshi',
    )!;
    expect(gyoseishoshi.officialNameJa).toBe('\u884c\u653f\u66f8\u58eb');
    expect(gyoseishoshi.field).toBe('law');
  });
});
