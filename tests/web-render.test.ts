import { describe, expect, it } from 'vitest';
import {
  qualificationSectionHasContent,
  qualificationSitemapContent,
  renderQualificationDirectory,
  renderQualificationPage,
  renderQualificationSectionPage,
  renderComparePage,
  renderEditorialPage,
  renderGuideIndex,
  renderHomePage,
  renderPassRateIndex,
  renderSchedulePage,
  renderUpdatesPage,
  renderNotFoundPage,
} from '../apps/web/src/render.js';
import {
  correctionsIssueUrl,
  editorialAboutPage,
  editorialAboutSlugs,
  editorialComparisonPage,
  editorialGuidePage,
  unofficialNotice,
  verifiedBadgeClarification,
} from '../apps/web/src/editorial.js';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import type { PublicFact } from '../packages/schema/src/index.js';
import type { PublicCalendarEvent } from '../packages/schema/src/calendar.js';
import type { PublicUpdateEvent } from '../packages/schema/src/updates.js';

const itPassport = launchQualifications.find(
  (qualification) => qualification.slug === 'it-passport',
)!;

describe('IT Passport public page rendering', () => {
  it('renders Fundamental IT subject A/B specifications as distinct facts', () => {
    const qualification = launchQualifications.find(
      (item) => item.slug === 'fundamental-it-engineer',
    )!;
    const html = renderQualificationSectionPage(
      {
        qualification,
        status: 'partially_announced',
        officialVerifiedAt: '2026-08-11T00:00:00.000Z',
        facts: [
          {
            qualificationSlug: qualification.slug,
            examLevelId: null,
            examYear: 2026,
            factKey: 'exam_subject_a_time',
            valueType: 'integer',
            normalizedValue: 90,
            displayValue: '90分',
            status: 'approved',
            riskLevel: 'medium',
            sourceId: 'source:fundamental-it:exam',
            sourceSnapshotId: 'snapshot:official',
            synthetic: false,
            verifiedAt: '2026-08-11T00:00:00.000Z',
          },
          {
            qualificationSlug: qualification.slug,
            examLevelId: null,
            examYear: 2026,
            factKey: 'exam_subject_b_question_count',
            valueType: 'integer',
            normalizedValue: 20,
            displayValue: '20問',
            status: 'approved',
            riskLevel: 'medium',
            sourceId: 'source:fundamental-it:exam',
            sourceSnapshotId: 'snapshot:official',
            synthetic: false,
            verifiedAt: '2026-08-11T00:00:00.000Z',
          },
        ],
      },
      'exam-content',
    );
    expect(html).toContain('科目A 試験時間');
    expect(html).toContain('科目B 出題数');
  });
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

  it('renders the safe field-level missing reason instead of a generic claim', () => {
    const html = renderQualificationSectionPage(
      {
        qualification: itPassport,
        status: 'under_review',
        facts: [],
        officialVerifiedAt: null,
        missingReasons: { eligibility: 'pending_review' },
      },
      'application',
    );
    expect(html).toContain('公式情報確認中');
    expect(html).not.toContain('公式情報は未確認です');
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
    expect(application).toContain(
      '申込み・受験資格：公開できる公式情報はありません',
    );
    expect(application).toContain(
      '<meta name="robots" content="noindex,follow">',
    );
    expect(application).not.toContain('CBT方式');
    const examContent = renderQualificationSectionPage(view, 'exam-content');
    expect(examContent).toContain('CBT方式');
    expect(examContent).toContain('試験内容');
    expect(examContent).toContain('更新・訂正について');
    expect(examContent).not.toContain('<meta name="robots"');
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

  it('filters schedule events by type and marks the page noindex', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
    }).format(new Date());
    const shift = (days: number): string => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const event = (
      id: string,
      type: 'exam_date' | 'application_deadline',
      dateValue: string,
    ) => ({
      id,
      type,
      label: type === 'exam_date' ? '試験日' : '申込締切',
      qualification: takken,
      examYear: 2026,
      displayValue: dateValue,
      dateValue,
      startValue: null,
      factKey: type,
      verifiedAt: '2026-01-01T00:00:00.000Z',
      sequence: 0,
    });
    const examDate = shift(45);
    const deadline = shift(20);
    const html = renderSchedulePage(
      [
        event('takken:2026:exam_date', 'exam_date', examDate),
        event(
          'takken:2026:application_deadline',
          'application_deadline',
          deadline,
        ),
      ],
      { type: 'application_deadline' },
    );
    expect(html).toContain(deadline);
    expect(html).not.toContain(examDate);
    expect(html).toContain('selected>申込締切');
    expect(html).toContain('絞り込み後 1件');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
  });

  it('limits schedule events to the next 30 days', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
    }).format(new Date());
    const shift = (days: number): string => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const event = (id: string, dateValue: string) => ({
      id,
      type: 'exam_date' as const,
      label: '試験日',
      qualification: takken,
      examYear: 2026,
      displayValue: dateValue,
      dateValue,
      startValue: null,
      factKey: 'exam_date',
      verifiedAt: '2026-01-01T00:00:00.000Z',
      sequence: 0,
    });
    const near = shift(10);
    const far = shift(200);
    const html = renderSchedulePage(
      [event('event:near', near), event('event:far', far)],
      { range: '30' },
    );
    expect(html).toContain(near);
    expect(html).not.toContain(far);
    expect(html).toContain('selected>今後30日');
  });

  it('groups schedule events by month in date order', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
    }).format(new Date());
    const shift = (days: number): string => {
      const date = new Date(`${today}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() + days);
      return date.toISOString().slice(0, 10);
    };
    const event = (id: string, dateValue: string) => ({
      id,
      type: 'exam_date' as const,
      label: '試験日',
      qualification: takken,
      examYear: 2026,
      displayValue: dateValue,
      dateValue,
      startValue: null,
      factKey: 'exam_date',
      verifiedAt: '2026-01-01T00:00:00.000Z',
      sequence: 0,
    });
    const first = shift(5);
    const second = shift(40);
    const label = (dateValue: string) =>
      `${Number(dateValue.slice(0, 4))}年${Number(dateValue.slice(5, 7))}月`;
    const html = renderSchedulePage([
      event('event:second', second),
      event('event:first', first),
    ]);
    expect(html).toContain('class="schedule-month"');
    expect(html).toContain(label(first));
    expect(html).toContain(label(second));
    expect(html.indexOf(label(first))).toBeLessThan(
      html.indexOf(label(second)),
    );
    expect(html).toContain(`href="/ics/month/${first.slice(0, 7)}.ics"`);
    expect(html).toContain(`${label(first)}のICSを追加`);
  });

  it('carries schedule filters into the month ICS link', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
    }).format(new Date());
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 10);
    const dateValue = date.toISOString().slice(0, 10);
    const html = renderSchedulePage(
      [
        {
          id: 'takken:2026:exam_date',
          type: 'exam_date',
          label: '試験日',
          qualification: takken,
          examYear: 2026,
          displayValue: dateValue,
          dateValue,
          startValue: null,
          factKey: 'exam_date',
          verifiedAt: '2026-01-01T00:00:00.000Z',
          sequence: 0,
        },
      ],
      { qualification: 'takken', type: 'exam_date' },
    );
    expect(html).toContain(
      `/ics/month/${dateValue.slice(0, 7)}.ics?qualification=takken&amp;type=exam_date`,
    );
  });

  it('omits the month ICS link for undated schedule events', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const html = renderSchedulePage([
      {
        id: 'takken:2026:exam_schedule',
        type: 'exam_date',
        label: '試験日',
        qualification: takken,
        examYear: 2026,
        displayValue: '随時実施',
        dateValue: null,
        startValue: null,
        factKey: 'exam_schedule',
        verifiedAt: '2026-01-01T00:00:00.000Z',
        sequence: 0,
      },
    ]);
    expect(html).toContain('日付未定');
    expect(html).not.toContain('/ics/month/');
  });

  it('shows the filtered empty state when no schedule event matches', () => {
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
          startValue: null,
          factKey: 'exam_date',
          verifiedAt: '2026-01-01T00:00:00.000Z',
          sequence: 0,
        },
      ],
      { type: 'result_date' },
    );
    expect(html).toContain('条件に一致する日程はありません');
    expect(html).toContain('絞り込み後 0件');
    expect(html).toContain('href="/schedule/"');
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
                entries: [
                  {
                    value: '筆記試験',
                    factKey: 'exam_method',
                    examLevelId: null,
                    examYear: 2026,
                    verifiedAt: '2026-08-12T00:00:00.000Z',
                  },
                ],
              },
              'it-passport': { entries: [] },
            },
          },
        ],
      },
      launchQualifications,
    );
    expect(html).toContain('資格比較');
    expect(html).toContain('checked');
    expect(html).toContain('筆記試験');
    expect(html).toContain('掲載情報なし');
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

  it('paginates the updates feed and keeps the qualification filter', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const html = renderUpdatesPage(
      [
        {
          id: 'change:takken:exam_date',
          eventType: 'exam_date',
          eventLabel: '試験日の変更',
          qualification: takken,
          factKey: 'exam_date',
          factLabel: '試験日',
          examYear: 2026,
          previousValue: null,
          newValue: '2026年10月18日',
          affectedPages: [],
          sourceUrl: 'https://www.retio.or.jp/exam/',
          createdAt: '2026-08-14T00:00:00.000Z',
          verifiedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      { page: 2, hasMore: true, filtered: true, qualification: 'takken' },
    );
    expect(html).toContain('<nav class="pagination"');
    expect(html).toContain('href="/updates/?qualification=takken"');
    expect(html).toContain(
      'href="/updates/?qualification=takken&amp;page=3" rel="next"',
    );
    expect(html).toContain('2ページ目');
    expect(html).toContain('更新情報（2ページ目）');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
  });

  it('offers the next page on the first updates page without noindex', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const html = renderUpdatesPage(
      [
        {
          id: 'change:takken:exam_date',
          eventType: 'exam_date',
          eventLabel: '試験日の変更',
          qualification: takken,
          factKey: 'exam_date',
          factLabel: '試験日',
          examYear: 2026,
          previousValue: null,
          newValue: '2026年10月18日',
          affectedPages: [],
          sourceUrl: 'https://www.retio.or.jp/exam/',
          createdAt: '2026-08-14T00:00:00.000Z',
          verifiedAt: '2026-08-13T00:00:00.000Z',
        },
      ],
      { page: 1, hasMore: true },
    );
    expect(html).toContain('href="/updates/?page=2" rel="next"');
    expect(html).toContain('1ページ目');
    expect(html).not.toContain('<meta name="robots" content="noindex,follow">');
  });

  it('shows a range empty state for an out-of-range updates page', () => {
    const html = renderUpdatesPage([], { page: 99 });
    expect(html).toContain('このページに更新情報はありません');
    expect(html).toContain('最新の更新情報へ');
    expect(html).not.toContain('公開できる更新情報はまだありません');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
  });

  it('renders a 404 page with home, search, and qualification entry points', () => {
    const html = renderNotFoundPage();
    expect(html).toContain('ページが見つかりません');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/shikaku/"');
    expect(html).toContain(
      '<form class="qualification-search not-found-search" role="search" action="/shikaku/" method="get">',
    );
    expect(html).toContain('name="q"');
    expect(html).toContain('/shikaku/takken/');
    expect(html).toContain('/shikaku/it-passport/');
    expect(html).toContain('<meta name="robots" content="noindex,follow">');
  });

  it('folds repeated update categories into collapsible groups', () => {
    const takken = launchQualifications.find((item) => item.slug === 'takken')!;
    const event = (
      id: string,
      eventType: string,
      eventLabel: string,
      factKey: string,
    ): PublicUpdateEvent => ({
      id,
      eventType,
      eventLabel,
      qualification: takken,
      factKey,
      factLabel: '合格率',
      examYear: 2025,
      previousValue: null,
      newValue: '69.4%',
      affectedPages: [],
      sourceUrl: 'https://www.example.go.jp/stat',
      createdAt: '2026-08-14T00:00:00.000Z',
      verifiedAt: '2026-08-13T00:00:00.000Z',
    });
    const html = renderUpdatesPage([
      event('u1', 'statistics_update', '統計データの変更', 'pass_rate'),
      event('u2', 'statistics_update', '統計データの変更', 'applicants'),
      event('u3', 'statistics_update', '統計データの変更', 'passed'),
      event('u4', 'exam_date', '試験日の変更', 'exam_date'),
    ]);
    expect(html).toContain('<details class="updates-group"');
    expect(html).toContain('<summary>');
    expect(html).toContain('統計データの変更');
    expect(html).toContain('<span class="meta">3件</span>');
    expect(html).toContain('試験日の変更');
    // Multi-card categories collapse; a lone card stays expanded.
    expect(html).toContain('<details class="updates-group" open>');
    expect(html).toContain('更新情報');
    expect(html).not.toContain('undefined');
  });

  it('renders a static comparison guide without inventing dynamic facts', () => {
    const page = editorialComparisonPage('takken-vs-gyoseishoshi')!;
    const html = renderEditorialPage(
      page,
      'comparison',
      '/compare/takken-vs-gyoseishoshi/',
    );
    expect(html).toContain('宅建と行政書士の違い');
    expect(html).toContain('公式情報で比較する');
    expect(html).toContain('/compare/?qualifications=takken%2Cgyoseishoshi');
    expect(html).toContain('関連ページ');
    expect(html).not.toContain('undefined');
  });

  it('renders a guide with a readable checklist and related links', () => {
    const page = editorialGuidePage('application-checklist')!;
    const html = renderEditorialPage(
      page,
      'guide',
      '/guide/application-checklist/',
    );
    expect(html).toContain('受験申込み前の確認チェックリスト');
    expect(html).toContain('対象の試験を特定する');
    expect(html).toContain('関連ページ');
    expect(html).not.toContain('公式確認済み');
    expect(html).toContain(
      '<link rel="canonical" href="/guide/application-checklist/">',
    );
  });

  it('renders the guide index with all required guide entries', () => {
    const html = renderGuideIndex([
      {
        slug: 'official-information-check',
        page: editorialGuidePage('official-information-check')!,
      },
      {
        slug: 'how-to-read-pass-rates',
        page: editorialGuidePage('how-to-read-pass-rates')!,
      },
    ]);
    expect(html).toContain('資格試験ガイド');
    expect(html).toContain('/guide/official-information-check/');
    expect(html).toContain('/guide/how-to-read-pass-rates/');
    expect(html).not.toContain('undefined');
  });

  it('marks parameterized discovery pages as noindex while retaining their canonical URL', () => {
    const directory = renderQualificationDirectory([], 'IT');
    const schedule = renderSchedulePage([], { year: '2026' });
    const comparison = renderComparePage(
      { qualifications: [itPassport], rows: [] },
      launchQualifications,
    );

    for (const html of [directory, schedule, comparison]) {
      expect(html).toContain('<meta name="robots" content="noindex,follow">');
      expect(html).not.toContain('application/ld+json');
    }
    expect(directory).toContain('<link rel="canonical" href="/shikaku/">');
    expect(schedule).toContain('<link rel="canonical" href="/schedule/">');
    expect(comparison).toContain('<link rel="canonical" href="/compare/">');
  });

  it('uses the configured public origin for canonical URLs', () => {
    const previousOrigin = process.env.SITE_ORIGIN;
    process.env.SITE_ORIGIN = 'https://shikakucheck.com/';
    try {
      const html = renderGuideIndex([]);
      expect(html).toContain(
        '<link rel="canonical" href="https://shikakucheck.com/guide/">',
      );
    } finally {
      if (previousOrigin === undefined) delete process.env.SITE_ORIGIN;
      else process.env.SITE_ORIGIN = previousOrigin;
    }
  });

  it('emits Open Graph, structured data and optional verification tags', () => {
    const previousOrigin = process.env.SITE_ORIGIN;
    const previousVerification = process.env.GOOGLE_SITE_VERIFICATION;
    const previousAnalytics = process.env.GA_MEASUREMENT_ID;
    process.env.SITE_ORIGIN = 'https://shikakucheck.com';
    delete process.env.GOOGLE_SITE_VERIFICATION;
    delete process.env.GA_MEASUREMENT_ID;
    try {
      const html = renderGuideIndex([]);
      expect(html).toContain(
        '<meta property="og:title" content="資格試験ガイド | 公式情報">',
      );
      expect(html).toContain(
        '<meta property="og:site_name" content="資格試験の公式情報">',
      );
      expect(html).toContain(
        '<meta property="og:url" content="https://shikakucheck.com/guide/">',
      );
      expect(html).toContain(
        '<meta name="twitter:card" content="summary_large_image">',
      );
      expect(html).toContain(
        '<meta property="og:image" content="https://shikakucheck.com/images/og-brand.png">',
      );
      expect(html).toContain('"@type":"WebPage"');
      expect(html).toContain('"@type":"BreadcrumbList"');
      expect(html).toContain('"name":"ホーム"');
      expect(html).toContain('"item":"https://shikakucheck.com/"');
      expect(html).not.toContain('google-site-verification');
      expect(html).not.toContain('googletagmanager');
      expect(renderHomePage()).toContain('"@type":"WebSite"');

      process.env.GOOGLE_SITE_VERIFICATION = 'verification_token_123456';
      process.env.GA_MEASUREMENT_ID = 'G-ABC12345';
      const enabled = renderGuideIndex([]);
      expect(enabled).toContain(
        '<meta name="google-site-verification" content="verification_token_123456">',
      );
      expect(enabled).toContain(
        'https://www.googletagmanager.com/gtag/js?id=G-ABC12345',
      );

      process.env.GA_MEASUREMENT_ID = 'G-"><script>alert(1)</script>';
      expect(renderGuideIndex([])).not.toContain('googletagmanager');
    } finally {
      if (previousOrigin === undefined) delete process.env.SITE_ORIGIN;
      else process.env.SITE_ORIGIN = previousOrigin;
      if (previousVerification === undefined)
        delete process.env.GOOGLE_SITE_VERIFICATION;
      else process.env.GOOGLE_SITE_VERIFICATION = previousVerification;
      if (previousAnalytics === undefined) delete process.env.GA_MEASUREMENT_ID;
      else process.env.GA_MEASUREMENT_ID = previousAnalytics;
    }
  });

  it('keeps the third qualification identity available', () => {
    const gyoseishoshi = launchQualifications.find(
      (item) => item.slug === 'gyoseishoshi',
    )!;
    expect(gyoseishoshi.officialNameJa).toBe('\u884c\u653f\u66f8\u58eb');
    expect(gyoseishoshi.field).toBe('law');
  });
});

describe('bookkeeping history statistics tables', () => {
  const bookkeeping = launchQualifications.find(
    (item) => item.slug === 'bookkeeping',
  )!;
  const statistics = {
    qualificationSlug: 'bookkeeping' as const,
    providerId: null,
    examComponent: null,
    paymentMethod: null,
    status: 'approved' as const,
    riskLevel: 'low' as const,
    sourceId: 'source:bookkeeping:statistics',
    sourceSnapshotId: 'snapshot:bookkeeping:statistics',
    synthetic: false,
    verifiedAt: '2026-10-13T00:00:00.000Z',
    officialVerifiedAt: '2026-10-13T00:00:00.000Z',
  };
  const unifiedCells = (
    examYear: number,
    examSession: string,
    values: [string, string, string, string],
  ) =>
    ['applicants', 'examinees', 'passed', 'pass_rate'].map(
      (factKey, index) => ({
        ...statistics,
        examLevelId: 'bookkeeping:1',
        deliveryMode: 'unified',
        examSession,
        examYear,
        factKey,
        valueType: 'text' as const,
        normalizedValue: values[index],
        displayValue: `${values[index]} ${factKey}（${examSession}（${examYear}.6.14））`,
      }),
    );
  const view = {
    qualification: bookkeeping,
    status: 'verified' as const,
    officialVerifiedAt: '2026-10-13T00:00:00.000Z',
    facts: [
      ...unifiedCells(2026, '173', [
        '11,959名',
        '10,195名',
        '3,864名',
        '37.9%',
      ]),
      ...unifiedCells(2025, '172', [
        '12,446名',
        '10,470名',
        '3,215名',
        '30.7%',
      ]),
      {
        ...statistics,
        examLevelId: 'bookkeeping:2',
        deliveryMode: 'network',
        examSession: null,
        examYear: 2026,
        factKey: 'passed',
        valueType: 'text' as const,
        normalizedValue: '1,234名',
        displayValue: '1,234名 合格者数（2026年4月～2026年6月）',
      },
      {
        ...statistics,
        examLevelId: 'bookkeeping:2',
        deliveryMode: 'network',
        examSession: null,
        examYear: 2026,
        factKey: 'pass_rate',
        valueType: 'text' as const,
        normalizedValue: '31.9%',
        displayValue: '31.9% 合格率（2026年4月～2026年6月）',
      },
      {
        ...statistics,
        examLevelId: 'bookkeeping:1',
        deliveryMode: 'unified',
        examSession: null,
        examYear: 2026,
        factKey: 'statistics_methodology',
        valueType: 'text' as const,
        normalizedValue: '回ごとの公表値',
        displayValue: '回ごとの公表値',
      },
      {
        ...statistics,
        examLevelId: 'bookkeeping:1',
        deliveryMode: 'unified',
        examSession: null,
        examYear: 2026,
        factKey: 'passing_standard',
        valueType: 'text' as const,
        normalizedValue: '70点以上',
        displayValue: '70点以上',
      },
      {
        ...statistics,
        examLevelId: 'bookkeeping:1',
        deliveryMode: 'unified',
        examSession: null,
        examYear: 2026,
        factKey: 'fee',
        valueType: 'text' as const,
        normalizedValue: '4,800円',
        displayValue: '4,800円',
      },
    ],
  };

  it('carries every past year in the table and excludes past years from cards', () => {
    const html = renderQualificationSectionPage(view, 'pass-rate');
    expect(html).toContain('1級・統一試験');
    expect(html).toContain('2級・ネット試験');
    expect(html).toContain('<td>173回</td>');
    expect(html).toContain('<td>2026年4月～2026年6月</td>');
    expect(html).toContain(
      '<tr class="history-row--current" aria-current="true"><th scope="row">2026年</th>',
    );
    expect(html).toContain('<span>11,959名</span>');
    expect(html).toContain(
      '<div class="history-value"><span>11,959名</span><details>',
    );
    expect(html).not.toContain('<td>11,959名 applicants');
    expect(html).toContain('<td class="history-cell--empty">—</td>');
    expect(html).toContain('<th scope="col">受験者数</th>');
    expect(html).toContain('集計口径：回ごとの公表値');
    expect(html).toContain('>2025年</th>');
    expect(
      (html.match(/class="compare-table history-table"/g) ?? []).length,
    ).toBe(2);
    expect((html.match(/<article class="card fact"/g) ?? []).length).toBe(7);
  });

  it('points the year navigation at the statistics table of that year', () => {
    const html = renderQualificationSectionPage(view, 'pass-rate');
    expect(html).toContain('/shikaku/bookkeeping/pass-rate/?year=2025');
    expect(html).not.toContain('/shikaku/bookkeeping/2025/');

    const previous = renderQualificationSectionPage(view, 'pass-rate', 2025);
    expect(previous).toContain(
      '<tr class="history-row--current" aria-current="true"><th scope="row">2025年</th>',
    );
    expect(previous).toContain(
      'href="/shikaku/bookkeeping/pass-rate/?year=2025" aria-current="page"',
    );
    expect((previous.match(/<article class="card fact"/g) ?? []).length).toBe(
      4,
    );
    expect(previous).not.toContain('data-fact-key="passing_standard"');
    expect(previous).toContain('data-fact-key="applicants"');
    expect(previous).toContain('適用年度: 2025年');
    expect(previous).not.toContain('適用年度: 2026年');
  });

  it('marks the year-filtered pass-rate page noindex but keeps the base page indexable', () => {
    const filtered = renderQualificationSectionPage(view, 'pass-rate', 2025);
    expect(filtered).toContain('<meta name="robots" content="noindex,follow">');
    expect(filtered).toContain(
      '<link rel="canonical" href="/shikaku/bookkeeping/pass-rate/">',
    );

    const base = renderQualificationSectionPage(view, 'pass-rate');
    expect(base).not.toContain('<meta name="robots"');
    expect(base).toContain(
      '<link rel="canonical" href="/shikaku/bookkeeping/pass-rate/">',
    );

    const annual = renderQualificationSectionPage(view, 'annual', 2025);
    expect(annual).toContain('<meta name="robots" content="noindex,follow">');
    expect(annual).toContain(
      '<link rel="canonical" href="/shikaku/bookkeeping/2025/">',
    );
  });

  it('keeps methodology out of the card list and links it from the overview', () => {
    const overview = renderQualificationSectionPage(view, 'overview');
    expect(overview).toContain('/shikaku/bookkeeping/pass-rate/');
    expect(overview).toContain('4,800円');
    expect(overview).toContain('11,959名');
    expect(overview).not.toContain('data-fact-key="statistics_methodology"');
    expect((overview.match(/<article class="card fact"/g) ?? []).length).toBe(
      8,
    );
    expect(overview).not.toContain('30.7%');
  });

  it('links a statistics update to the year table instead of the schedule page', () => {
    const html = renderUpdatesPage([
      {
        id: 'change:bookkeeping:pass-rate:172',
        eventType: 'statistics_update',
        eventLabel: '統計データの変更',
        qualification: bookkeeping,
        factKey: 'pass_rate',
        factLabel: '合格率',
        examYear: 2025,
        previousValue: null,
        newValue: '30.7% 合格率',
        affectedPages: ['qualification:bookkeeping'],
        createdAt: '2026-10-13T00:00:00.000Z',
        verifiedAt: '2026-10-13T00:00:00.000Z',
      },
    ]);
    expect(html).toContain('/shikaku/bookkeeping/pass-rate/?year=2025');
    expect(html).not.toContain('/shikaku/bookkeeping/2025/');
  });
});

describe('section content gating and discovery', () => {
  const fact = (factKey: string, examYear: number, displayValue: string) => ({
    qualificationSlug: 'it-passport' as const,
    examLevelId: null,
    examYear,
    factKey,
    valueType: 'text' as const,
    normalizedValue: displayValue,
    displayValue,
    status: 'approved' as const,
    riskLevel: 'medium' as const,
    sourceId: 'source:it-passport:jitec-home',
    sourceSnapshotId: 'snapshot:official',
    synthetic: false,
    verifiedAt: '2026-08-11T00:00:00.000Z',
  });
  const view = (facts: ReturnType<typeof fact>[]) => ({
    qualification: itPassport,
    status: 'verified' as const,
    officialVerifiedAt: '2026-08-11T00:00:00.000Z',
    facts,
  });

  it('detects sections without approved facts', () => {
    const examOnly = view([fact('exam_method', 2026, 'CBT方式')]);
    expect(qualificationSectionHasContent(examOnly, 'exam-content')).toBe(true);
    expect(qualificationSectionHasContent(examOnly, 'application')).toBe(false);
    expect(qualificationSectionHasContent(examOnly, 'pass-rate')).toBe(false);
    expect(qualificationSectionHasContent(examOnly, 'annual', 2026)).toBe(
      false,
    );
    expect(qualificationSitemapContent(examOnly)).toEqual({
      sections: ['overview', 'exam-content'],
      annualYears: [],
    });
  });

  it('counts pass-rate history and annual schedule facts as content', () => {
    const withHistory = view([
      fact('pass_rate', 2025, '30.7%'),
      fact('exam_date', 2026, '2026年10月18日'),
    ]);
    expect(qualificationSectionHasContent(withHistory, 'pass-rate')).toBe(true);
    expect(qualificationSitemapContent(withHistory)).toEqual({
      sections: ['overview', 'pass-rate'],
      annualYears: [2026],
    });

    const annual = renderQualificationSectionPage(withHistory, 'annual', 2026);
    expect(annual).toContain(
      '<title>ITパスポートの2026年試験日程 | 公式情報</title>',
    );
    expect(annual).toContain('/shikaku/it-passport/2026/');
    expect(annual).not.toContain('/shikaku/it-passport/2025/');
    expect(annual).not.toContain('<meta name="robots"');
  });

  it('gives every section a distinct title and description', () => {
    const html = (
      ['overview', 'application', 'exam-content', 'pass-rate'] as const
    ).map((section) =>
      renderQualificationSectionPage(
        view([fact('exam_method', 2026, 'CBT方式')]),
        section,
      ),
    );
    const titles = html.map(
      (document) => document.match(/<title>([^<]+)<\/title>/)?.[1],
    );
    const descriptions = html.map(
      (document) =>
        document.match(/<meta name="description" content="([^"]+)">/)?.[1],
    );
    expect(new Set(titles).size).toBe(4);
    expect(new Set(descriptions).size).toBe(4);
  });

  it('links the guide, pass-rate and policy pages from the global chrome', () => {
    const html = renderGuideIndex([]);
    expect(html).toContain('href="/guide/" aria-current="page">ガイド</a>');
    for (const href of [
      '/guide/',
      '/pass-rate/',
      '/about/operator/',
      '/about/sources/',
      '/about/editorial-policy/',
      '/about/ai-policy/',
      '/about/privacy/',
      '/about/terms/',
      '/about/advertising-policy/',
      '/about/contact/',
      '/about/corrections/',
    ])
      expect(html).toContain(`href="${href}"`);
    expect(html).not.toContain('class="is-disabled"');
  });

  it('renders the corrections page with a working issue link', () => {
    expect(editorialAboutPage('sources')).toBeDefined();
    expect(editorialAboutPage('editorial-policy')).toBeDefined();
    const page = editorialAboutPage('corrections');
    expect(page).toBeDefined();
    const html = renderEditorialPage(page!, 'about', '/about/corrections/');
    expect(html).toContain('<title>訂正のご連絡 | 公式情報</title>');
    expect(html).toContain(`href="${correctionsIssueUrl}"`);
    expect(html).toContain('<link rel="canonical" href="/about/corrections/">');
    expect(html).not.toContain('<meta name="robots"');
  });

  it('publishes the legal and trust pages with unique titles', () => {
    const legalSlugs = [
      'operator',
      'privacy',
      'terms',
      'advertising-policy',
      'ai-policy',
      'contact',
    ];
    const titles = legalSlugs.map((slug) => {
      expect(editorialAboutSlugs).toContain(slug);
      const page = editorialAboutPage(slug);
      expect(page).toBeDefined();
      const html = renderEditorialPage(page!, 'about', `/about/${slug}/`);
      expect(html).toContain(`<link rel="canonical" href="/about/${slug}/">`);
      expect(html).not.toContain('<meta name="robots"');
      return page!.title;
    });
    expect(new Set(titles).size).toBe(legalSlugs.length);
    expect(
      renderEditorialPage(
        editorialAboutPage('contact')!,
        'about',
        '/about/contact/',
      ),
    ).toContain(`href="${correctionsIssueUrl}"`);
  });

  it('renders the pass-rate index only for qualifications with data', () => {
    const html = renderPassRateIndex([
      {
        qualification: itPassport,
        view: view([fact('pass_rate', 2025, '30.7%')]),
      },
    ]);
    expect(html).toContain('/shikaku/it-passport/pass-rate/');
    expect(html).toContain('2025年の合格率');
    expect(html).not.toContain('/shikaku/bookkeeping/pass-rate/');
    expect(renderPassRateIndex([])).toContain(
      '公開できる合格率データはまだありません',
    );
  });
});

describe('home page data modules', () => {
  const examEvent = (
    id: string,
    dateValue: string,
    label: string,
    sequence: number,
  ) => ({
    id,
    type: 'exam_date' as const,
    label,
    qualification: itPassport,
    examYear: 2999,
    displayValue: dateValue,
    dateValue,
    startValue: null,
    factKey: 'exam_date',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    sequence,
  });

  it('lists upcoming schedule entries in date order', () => {
    const html = renderHomePage([
      examEvent('event:later', '2999-04-01', '申込締切', 1),
      examEvent('event:past', '2000-01-01', '試験日', 1),
      examEvent('event:sooner', '2999-03-01', '試験日', 1),
    ]);
    expect(html).toContain('href="/shikaku/it-passport/2999/"');
    expect(html).toContain('2999年3月1日');
    expect(html).not.toContain('2000年1月1日');
    expect(html.indexOf('2999年3月1日')).toBeLessThan(
      html.indexOf('2999年4月1日'),
    );
    expect(html).toContain('あと');
    expect(html).not.toContain('公式確認済みの日程を一覧で確認');
  });

  it('lists recent updates and falls back to empty states', () => {
    const html = renderHomePage(
      [],
      [
        {
          id: 'update:1',
          eventType: 'schedule_change',
          eventLabel: '日程の変更',
          qualification: itPassport,
          factKey: 'exam_date',
          factLabel: '試験日',
          examYear: 2999,
          previousValue: '2999-03-01',
          newValue: '2999-03-02',
          affectedPages: ['/shikaku/it-passport/'],
          createdAt: '2026-10-01T00:00:00.000Z',
          verifiedAt: '2026-10-01T00:00:00.000Z',
        },
      ],
    );
    expect(html).toContain('日程の変更');
    expect(html).toContain('href="/updates/?qualification=it-passport"');
    expect(html).toContain('公式確認済みの日程を一覧で確認');

    const empty = renderHomePage();
    expect(empty).toContain('更新情報はまだありません');
    expect(empty).toContain('href="/schedule/"');
  });
});

describe('H1 non-official disclaimer and H2 display integration', () => {
  const takken = launchQualifications.find((item) => item.slug === 'takken')!;
  const baseFact = {
    qualificationSlug: 'takken' as const,
    examLevelId: null,
    examYear: 2026,
    status: 'approved' as const,
    riskLevel: 'high' as const,
    sourceId: 'source:takken:retio',
    sourceSnapshotId: 'snapshot:takken:official',
    synthetic: false,
    verifiedAt: '2026-10-13T00:00:00.000Z',
    officialVerifiedAt: '2026-10-13T00:00:00.000Z',
  };
  const view = (
    facts: Array<
      Pick<
        PublicFact,
        'factKey' | 'valueType' | 'normalizedValue' | 'displayValue'
      >
    >,
  ) => ({
    qualification: takken,
    status: 'verified' as const,
    officialVerifiedAt: '2026-10-13T00:00:00.000Z',
    facts: facts.map((fact) => ({ ...baseFact, ...fact }) as PublicFact),
  });

  it('shows the non-official notice on the home page and in the global footer', () => {
    expect(renderHomePage()).toContain(unofficialNotice);
    expect(renderGuideIndex([])).toContain(unofficialNotice);
  });

  it('clarifies that the verified badge is not official endorsement', () => {
    const html = renderQualificationSectionPage(view([]), 'overview');
    expect(html).toContain(verifiedBadgeClarification);
  });

  it('renders a recovered truncated date, a fee with unit, and a Japanese method label', () => {
    const facts = [
      {
        factKey: 'result_date',
        valueType: 'datetime' as const,
        normalizedValue: '2026-11-25T09:00:00+09:00',
        displayValue: '令和8年11月25日(水)9',
      },
      {
        factKey: 'fee',
        valueType: 'money' as const,
        normalizedValue: '8200',
        displayValue: '8200',
      },
      {
        factKey: 'exam_method',
        valueType: 'text' as const,
        normalizedValue: 'paper',
        displayValue: 'paper',
      },
    ];
    const annual = renderQualificationSectionPage(view(facts), 'annual', 2026);
    expect(annual).toContain('2026年11月25日');
    expect(annual).not.toContain('(水)9');

    const overview = renderQualificationSectionPage(view(facts), 'overview');
    expect(overview).toContain('8,200円');
    expect(overview).not.toContain('>8200<');

    const examContent = renderQualificationSectionPage(
      view(facts),
      'exam-content',
    );
    expect(examContent).toContain('紙筆方式');
  });
});

describe('B4 ended-schedule state and B5 home timeline dedup', () => {
  const bookkeeping = launchQualifications.find(
    (item) => item.slug === 'bookkeeping',
  )!;
  const fp = launchQualifications.find((item) => item.slug === 'fp')!;
  const takken = launchQualifications.find((item) => item.slug === 'takken')!;

  const calendarEvent = (
    overrides: Partial<PublicCalendarEvent> = {},
  ): PublicCalendarEvent => ({
    id: 'event:default',
    type: 'exam_date' as const,
    label: '試験日',
    qualification: bookkeeping,
    examYear: 2999,
    displayValue: '2999-11-15',
    dateValue: '2999-11-15',
    startValue: null,
    factKey: 'exam_dates',
    verifiedAt: '2026-01-01T00:00:00.000Z',
    sequence: 0,
    ...overrides,
  });

  it('collapses same-day same-type duplicates on the home timeline (B5)', () => {
    const html = renderHomePage([
      calendarEvent({
        id: 'bookkeeping:1',
        examLevelId: 'bookkeeping:1',
        sequence: 1,
      }),
      calendarEvent({
        id: 'bookkeeping:2',
        examLevelId: 'bookkeeping:2',
        sequence: 2,
      }),
      calendarEvent({
        id: 'bookkeeping:3',
        examLevelId: 'bookkeeping:3',
        sequence: 3,
      }),
      calendarEvent({
        id: 'fp:open',
        type: 'application_open',
        label: '申込開始',
        qualification: fp,
        dateValue: '2999-11-16',
        displayValue: '2999-11-16',
        factKey: 'application_open',
        sequence: 1,
      }),
    ]);
    expect(html.split('class="home-timeline__item"').length - 1).toBe(2);
    expect(html.split('2999年11月15日').length - 1).toBe(1);
    expect(html).toContain('2999年11月16日');
    expect(html).toContain('href="/shikaku/fp/2999/"');
  });

  it('keeps distinct event types on the same date (B5)', () => {
    const html = renderHomePage([
      calendarEvent({ id: 'exam', sequence: 1 }),
      calendarEvent({
        id: 'result',
        type: 'result_date',
        label: '合格発表',
        factKey: 'result_date',
        sequence: 2,
      }),
    ]);
    expect(html.split('class="home-timeline__item"').length - 1).toBe(2);
  });

  it('marks past schedule events as ended with guidance, keeps future ones clean (B4)', () => {
    const html = renderSchedulePage([
      calendarEvent({
        id: 'takken:past',
        qualification: takken,
        examYear: 2000,
        dateValue: '2000-10-18',
        displayValue: '2000年10月18日',
        factKey: 'exam_date',
      }),
      calendarEvent({
        id: 'takken:future',
        qualification: takken,
        examYear: 2999,
        dateValue: '2999-10-18',
        displayValue: '2999年10月18日',
        factKey: 'exam_date',
      }),
    ]);
    expect(
      html.split('class="schedule-event schedule-event--ended"').length - 1,
    ).toBe(1);
    expect(html).toContain('<span class="badge badge--info">');
    expect(html).toContain('終了');
    expect(html.split('この試験は終了しました').length - 1).toBe(1);
    expect(html).toContain(
      '合格発表日と次回日程は公式サイトでご確認ください。',
    );
  });

  it('uses type-specific guidance for past application deadlines (B4)', () => {
    const html = renderSchedulePage([
      calendarEvent({
        id: 'takken:deadline',
        qualification: takken,
        type: 'application_deadline',
        label: '申込締切',
        examYear: 2000,
        dateValue: '2000-07-31',
        displayValue: '2000年7月31日',
        factKey: 'application_deadline',
      }),
    ]);
    expect(html).toContain(
      'この申込締切は過ぎました。次回の申込日程は公式サイトでご確認ください。',
    );
  });

  const baseFact = {
    qualificationSlug: 'takken' as const,
    examLevelId: null,
    examYear: 2026,
    status: 'approved' as const,
    riskLevel: 'high' as const,
    sourceId: 'source:takken:retio',
    sourceSnapshotId: 'snapshot:takken:official',
    synthetic: false,
    verifiedAt: '2026-10-13T00:00:00.000Z',
    officialVerifiedAt: '2026-10-13T00:00:00.000Z',
  };
  const detailView = (facts: Array<Record<string, unknown>>) => ({
    qualification: takken,
    status: 'verified' as const,
    officialVerifiedAt: '2026-10-13T00:00:00.000Z',
    facts: facts.map((fact) => ({ ...baseFact, ...fact }) as PublicFact),
  });

  it('marks fully-past date facts as ended on the detail page (B4)', () => {
    const html = renderQualificationSectionPage(
      detailView([
        {
          factKey: 'exam_date',
          valueType: 'date',
          normalizedValue: '2000-10-18',
          displayValue: '2000年10月18日',
        },
      ]),
      'overview',
    );
    expect(html).toContain('<span class="badge badge--info">');
    expect(html).toContain('終了');
    expect(html).toContain(
      'この日程は終了しています。最新の日程・情報は公式サイトでご確認ください。',
    );
  });

  it('does not mark future or partially-future date facts as ended (B4)', () => {
    const html = renderQualificationSectionPage(
      detailView([
        {
          factKey: 'exam_date',
          valueType: 'date',
          normalizedValue: '2999-10-18',
          displayValue: '2999年10月18日',
        },
        {
          factKey: 'exam_dates',
          valueType: 'date',
          normalizedValue: '2000-06-14,2999-11-15',
          displayValue: '2000-06-14、2999-11-15',
        },
        {
          factKey: 'exam_schedule',
          valueType: 'text',
          normalizedValue: 'venue_defined',
          displayValue: '各試験会場が設定する任意の日',
        },
      ]),
      'overview',
    );
    expect(html).not.toContain('この日程は終了しています');
    expect(html).not.toContain('<span class="badge badge--info">');
  });
});
