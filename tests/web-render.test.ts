import { describe, expect, it } from 'vitest';
import {
  renderQualificationDirectory,
  renderQualificationPage,
  renderQualificationSectionPage,
  renderComparePage,
  renderSchedulePage,
  renderUpdatesPage,
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

  it('renders the qualification search form, query state, and empty state', () => {
    const html = renderQualificationDirectory([], 'not-found');
    expect(html).toContain('name="q"');
    expect(html).toContain('value="not-found"');
    expect(html).toContain('一致する資格が見つかりません');
    expect(html).toContain('/shikaku/');
  });

  it('renders filtered directory search results', () => {
    const bookkeeping = launchQualifications.find(
      (item) => item.slug === 'bookkeeping',
    )!;
    const html = renderQualificationDirectory(
      [{ ...bookkeeping, status: 'awaiting_official' }],
      '簿記',
    );
    expect(html).toContain('「簿記」に一致する資格');
    expect(html).toContain('日商簿記');
    expect(html).not.toContain('ITパスポート');
  });

  it('renders the public schedule page with filters and official events', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const html = renderSchedulePage(
      [
        {
          id: 'takken:2026:exam_date',
          type: 'exam_date',
          label: '試験日',
          qualification: takken,
          examYear: 2026,
          displayValue: '2026年10月18日',
          dateValue: '2026-10-18',
          startValue: '2026-10-18',
          factKey: 'exam_date',
          verifiedAt: '2026-08-12T00:00:00.000Z',
          sourceUrl: 'https://www.retio.or.jp/exam/',
          sequence: 0,
        },
      ],
      { year: '2026', qualification: 'takken' },
    );
    expect(html).toContain('試験日程');
    expect(html).toContain('selected>2026年');
    expect(html).toContain('selected>宅地建物取引士');
    expect(html).toContain('2026年10月18日');
    expect(html).toContain('公式ソース');
    expect(html).toContain('/ics/takken/2026.ics');
    expect(html).toContain('/ics/takken/2026/takken%3A2026%3Aexam_date.ics');
  });

  it('renders the schedule empty state without invented dates', () => {
    const html = renderSchedulePage([]);
    expect(html).toContain('表示できる公式日程はまだありません');
    expect(html).toContain('未確認の日付は掲載しません');
    expect(html).not.toContain('undefined');
  });

  it('renders the compare selector and selected qualification table', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const itPassport = launchQualifications.find(
      (item) => item.slug === 'it-passport',
    )!;
    const html = renderComparePage(
      {
        qualifications: [takken, itPassport],
        rows: [
          {
            key: 'exam_method',
            label: '試験方式',
            cells: {
              takken: {
                value: '筆記試験',
                factKey: 'exam_method',
                examYear: 2026,
                verifiedAt: '2026-08-12T00:00:00.000Z',
              },
              'it-passport': {
                value: null,
                factKey: null,
                examYear: null,
                verifiedAt: null,
              },
            },
          },
        ],
      },
      launchQualifications,
    );
    expect(html).toContain('資格比較');
    expect(html).toContain('checked');
    expect(html).toContain('筆記試験');
    expect(html).toContain('公式未確認');
    expect(html).toContain('/shikaku/takken/');
  });

  it('renders the compare empty state until two qualifications are selected', () => {
    const html = renderComparePage(
      { qualifications: [], rows: [] },
      launchQualifications,
    );
    expect(html).toContain('比較する資格を2件以上選択してください');
    expect(html).not.toContain('undefined');
  });

  it('renders public update events with before and after values', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
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
        affectedPages: ['qualification:takken', 'schedule'],
        sourceUrl: 'https://www.retio.or.jp/exam/',
        createdAt: '2026-08-14T00:00:00.000Z',
        verifiedAt: '2026-08-13T00:00:00.000Z',
      },
    ]);
    expect(html).toContain('更新情報');
    expect(html).toContain('変更前');
    expect(html).toContain('2026年10月11日');
    expect(html).toContain('変更後');
    expect(html).toContain('2026年10月18日');
    expect(html).toContain('公式ソース');
  });

  it('renders the updates empty state without pretending a page changed', () => {
    const html = renderUpdatesPage([]);
    expect(html).toContain('公開できる更新情報はまだありません');
    expect(html).toContain('ページ確認だけでは更新情報を作成しません');
    expect(html).not.toContain('undefined');
  });

  it('keeps the third qualification identity available', () => {
    const gyoseishoshi = launchQualifications.find(
      (item) => item.slug === 'gyoseishoshi',
    )!;
    expect(gyoseishoshi.officialNameJa).toBe('\u884c\u653f\u66f8\u58eb');
    expect(gyoseishoshi.field).toBe('law');
  });
});
