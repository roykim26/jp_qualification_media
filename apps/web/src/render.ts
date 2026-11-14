import {
  buildPublicCalendarEvents,
  type PublicCalendarEvent,
} from '../../../packages/schema/src/calendar.js';
import type { PublicQualificationComparison } from '../../../packages/schema/src/compare.js';
import type { PublicUpdateEvent } from '../../../packages/schema/src/updates.js';
import type {
  PublicFact,
  Qualification,
} from '../../../packages/schema/src/index.js';
import { launchQualifications } from '../../../packages/schema/src/qualifications.js';
import {
  escapeHtml,
  renderBadge,
  renderButtonLink,
  renderFeedbackState,
  renderIcon,
} from '../../../packages/ui/src/index.js';
import {
  editorialComparisonSlugs,
  unofficialNotice,
  verifiedBadgeClarification,
  type EditorialPage,
} from './editorial.js';
import {
  formatFactDisplayValue,
  formatUpdateDisplayValue,
  isDateFactKey,
} from './format.js';
import { heroImageMarkup } from './hero-image.js';
import { renderPublicDocument, renderQualificationSubnav } from './layout.js';

export type PublicQualificationView = {
  qualification: Qualification;
  status:
    | 'verified'
    | 'partially_announced'
    | 'awaiting_official'
    | 'previous_year_reference'
    | 'changed_or_corrected'
    | 'application_open'
    | 'application_closed'
    | 'completed'
    | 'suspended'
    | 'under_review';
  facts: PublicFact[];
  officialVerifiedAt: string | null;
  missingReasons?: Record<string, string>;
};

export type QualificationSection =
  'overview' | 'annual' | 'application' | 'exam-content' | 'pass-rate';

export type QualificationDirectoryItem = Qualification & {
  status: PublicQualificationView['status'];
  facts?: PublicFact[];
};

/** 首页资格卡片与 /shikaku/ 目录共同展示的上线资格。 */
export const launchSlugs = [
  'takken',
  'gyoseishoshi',
  'it-passport',
  'fundamental-it-engineer',
  'bookkeeping',
  'fp',
] as const;

const statusLabels = {
  verified: '公式確認済み',
  partially_announced: '一部発表済み',
  awaiting_official: '公式発表待ち',
  previous_year_reference: '前年度情報',
  changed_or_corrected: '変更・訂正あり',
  application_open: '申込受付中',
  application_closed: '受付終了',
  completed: '実施済み',
  suspended: '実施休止',
  under_review: '公式情報確認中',
} as const;

const missingReasonLabels: Record<string, string> = {
  not_announced: '公式発表待ち',
  not_collected: '公式情報を収集中',
  pending_review: '公式情報確認中',
  not_applicable: '対象外',
  mapping_error: '表示処理を確認中',
  stale_source: '情報の再確認中',
};

function missingMessage(
  view: PublicQualificationView,
  prefixes: readonly string[],
) {
  const reason = Object.entries(view.missingReasons ?? {}).find(([key]) =>
    prefixes.some((prefix) => key.startsWith(prefix)),
  )?.[1];
  return reason
    ? missingReasonLabels[reason]
    : '公開できる公式情報はありません';
}

const fieldLabels: Record<string, string> = {
  accounting: '会計',
  finance: '金融',
  it: 'IT',
  law: '法律',
};

const categoryLabels: Record<string, string> = {
  national: '国家資格',
  private: '民間資格',
  public: '公的資格',
};

const factLabelPrefixes: readonly [string, string][] = [
  ['application_open_rule', '申込開始ルール'],
  ['application_deadline_rule', '申込締切ルール'],
  ['application_method_rule', '申込方法ルール'],
  ['payment_deadline_rule', '支払期限ルール'],
  ['result_date_rule', '合格発表ルール'],
  ['application_change_deadline_rule', '申込み内容変更期限ルール'],
  ['application_deadline', '申込締切'],
  ['application_open', '申込開始'],
  ['application_start', '申込開始'],
  ['application_method', '申込方法'],
  ['exam_schedule', '試験日程'],
  ['exam_date', '試験日'],
  ['result_date', '合格発表'],
  ['suspension_period', '実施休止期間'],
  ['eligibility', '受験資格・受検資格'],
  ['fee', '受験料・受検手数料'],
  ['exam_method', '試験方式'],
  ['exam_content', '試験内容'],
  ['exam_subjects', '試験科目'],
  ['exam_time', '試験時間'],
  ['question_format', '出題形式'],
  ['question_count', '問題数'],
  ['scoring_method', '採点方式'],
  ['interview_count', '面接回数'],
  ['practical_subject', '実技科目'],
  ['passing_standard', '合格基準'],
  ['pass_mark', '合格点'],
  ['pass_rate', '合格率'],
  ['applicants', '申込者数'],
  ['examinees', '受験者数・受検者数'],
  ['passed', '合格者数'],
  ['statistics_methodology', '統計の集計口径'],
  ['application_rule', '申込みルール'],
];

const dimensionLabels: Record<string, string> = {
  academic: '学科',
  cbt: 'CBT',
  'bookkeeping:1': '1級',
  'bookkeeping:2': '2級',
  'bookkeeping:3': '3級',
  'bookkeeping:basic': '簿記・基礎',
  'bookkeeping:cost-accounting-basic': '簿記・原価計算 基礎',
  'fp:1': '1級',
  'fp:2': '2級',
  'fp:3': '3級',
  'academic:basic': '学科（基礎）',
  'academic:applied': '学科（応用）',
  'practical:asset-design': '実技（資産設計提案業務）',
  'practical:asset-consulting': '実技（資産相談業務）',
  group: '団体試験',
  jafp: '日本FP協会',
  kinzai: '金融財政事情研究会',
  network: 'ネット試験',
  paper: '筆記試験',
  pbt: '筆記試験（PBT）',
  interview: '面接',
  practical: '実技',
  unified: '統一試験',
  'subject-a': '科目A',
  'subject-b': '科目B',
  convenience_store: 'コンビニ支払い',
  pay_easy: 'ペイジー',
};

const eventTone: Record<PublicCalendarEvent['type'], string> = {
  application_open: '受付開始',
  application_deadline: '締切',
  exam_date: '試験',
  result_date: '発表',
};

// B4: past schedule entries keep their verified facts but get an ended badge
// and one line of guidance. We never invent the next year's dates.
const endedGuidance: Record<PublicCalendarEvent['type'], string> = {
  application_open:
    'この申込開始日は過ぎました。次回の申込日程は公式サイトでご確認ください。',
  application_deadline:
    'この申込締切は過ぎました。次回の申込日程は公式サイトでご確認ください。',
  exam_date:
    'この試験は終了しました。合格発表日と次回日程は公式サイトでご確認ください。',
  result_date:
    'この合格発表日は過ぎました。最新の情報は公式サイトでご確認ください。',
};

const scheduleTypeLabels: Record<PublicCalendarEvent['type'], string> = {
  application_open: '申込開始',
  application_deadline: '申込締切',
  exam_date: '試験日',
  result_date: '合格発表',
};

function addDays(dateValue: string, days: number): string {
  const date = new Date(`${dateValue}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function fieldLabel(value: string): string {
  return fieldLabels[value] ?? value;
}

function categoryLabel(value: string): string {
  return categoryLabels[value] ?? value;
}

function factLabel(factKey: string): string {
  const subject = factKey.match(
    /^exam_subject_([ab])_(time|question_count|answer_count|format)$/,
  );
  if (subject) {
    const labels: Record<string, string> = {
      time: '試験時間',
      question_count: '出題数',
      answer_count: '解答数',
      format: '出題形式',
    };
    return `科目${subject[1].toUpperCase()} ${labels[subject[2]]}`;
  }
  return (
    factLabelPrefixes.find(([prefix]) => factKey.startsWith(prefix))?.[1] ??
    factKey
  );
}

function factPriority(factKey: string): number {
  const index = factLabelPrefixes.findIndex(([prefix]) =>
    factKey.startsWith(prefix),
  );
  return index === -1 ? 99 : index;
}

function dimensionLabel(value: string): string {
  return dimensionLabels[value] ?? value;
}

function qualificationScopeNotice(slug: string): string {
  return slug === 'fp'
    ? '<p class="history-scope-note">収集対象：日本FP協会2・3級（学科・資産設計提案業務）、金融財政事情研究会1級（学科・資産相談業務）。全実施機関・全級の情報を網羅するものではありません。</p>'
    : '';
}

const sectionConfig: Record<
  Exclude<QualificationSection, 'overview'>,
  {
    title: string;
    eyebrow: string;
    intro: string;
    factKeyPrefixes: string[];
    groups: readonly {
      title: string;
      description: string;
      factKeyPrefixes: readonly string[];
    }[];
  }
> = {
  annual: {
    title: '年度試験日程',
    eyebrow: '年度別の公式日程',
    intro:
      '選択した年度の申込開始、締切、試験日、合格発表などを公式情報から整理します。別年度の情報は混在させません。',
    factKeyPrefixes: [
      'application_open',
      'application_start',
      'application_deadline',
      'exam_schedule',
      'exam_date',
      'result_date',
      'suspension_period',
    ],
    groups: [
      {
        title: '申込み日程',
        description: '申込開始と締切を、実施区分ごとに確認できます。',
        factKeyPrefixes: [
          'application_open',
          'application_start',
          'application_deadline',
        ],
      },
      {
        title: '試験・実施日程',
        description: '試験日と実施期間に関する公式情報です。',
        factKeyPrefixes: ['exam_schedule', 'exam_date'],
      },
      {
        title: '結果発表・実施変更',
        description: '合格発表と休止期間に関する公式情報です。',
        factKeyPrefixes: ['result_date', 'suspension_period'],
      },
    ],
  },
  application: {
    title: '申込み・受験資格',
    eyebrow: '申込み前に確認する情報',
    intro:
      '公式の申込みルール、申請方法、受験資格を整理します。未確認の申込期限は推測・補完しません。',
    factKeyPrefixes: [
      'application_',
      'application_rule',
      'application_open',
      'application_start',
      'application_deadline',
      'payment_',
      'eligibility',
      'fee',
    ],
    groups: [
      {
        title: '受験資格',
        description: '受験・受検に必要な条件を実施区分ごとに表示します。',
        factKeyPrefixes: ['eligibility'],
      },
      {
        title: '申込み方法と期間',
        description: '公式に確認できた申込みルールと受付期間です。',
        factKeyPrefixes: [
          'application_',
          'application_rule',
          'application_open',
          'application_start',
          'application_deadline',
        ],
      },
      {
        title: '受験料・手数料',
        description: '級、科目、実施方式ごとの公式料金と支払期限の情報です。',
        factKeyPrefixes: ['fee', 'payment_'],
      },
    ],
  },
  'exam-content': {
    title: '試験内容',
    eyebrow: '公式要綱に基づく試験情報',
    intro:
      '公式の試験方式、出題範囲、試験内容を整理します。公式確認のない情報は表示しません。',
    factKeyPrefixes: [
      'exam_method',
      'exam_subject_',
      'exam_content',
      'exam_subjects',
      'passing_standard',
      'exam_time',
      'question_format',
      'question_count',
      'scoring_method',
      'pass_mark',
      'practical_subject',
      'interview_count',
    ],
    groups: [
      {
        title: '試験方式と時間',
        description: '試験方式、実施形態、試験時間を表示します。',
        factKeyPrefixes: [
          'exam_method',
          'exam_time',
          'question_format',
          'exam_subject_a_time',
          'exam_subject_b_time',
          'exam_subject_a_format',
          'exam_subject_b_format',
        ],
      },
      {
        title: '科目・出題内容',
        description: '公式要綱で確認できた科目、範囲、問題数です。',
        factKeyPrefixes: [
          'exam_content',
          'exam_subjects',
          'question_count',
          'exam_subject_a_question_count',
          'exam_subject_b_question_count',
          'exam_subject_a_answer_count',
          'exam_subject_b_answer_count',
          'practical_subject',
          'interview_count',
        ],
      },
      {
        title: '合格基準',
        description: '公式に示された評価・合格基準です。',
        factKeyPrefixes: ['passing_standard', 'pass_mark', 'scoring_method'],
      },
    ],
  },
  'pass-rate': {
    title: '合格率・合格基準',
    eyebrow: '年度別の公式統計',
    intro:
      '公式発表された合格率、受験者数、合格者数、合格基準を年度と実施区分ごとに表示します。未確認値は推定しません。',
    factKeyPrefixes: [
      'pass_rate',
      'passing_standard',
      'pass_mark',
      'applicants',
      'examinees',
      'passed',
    ],
    groups: [
      {
        title: '最新の合格指標',
        description: '年度と実施区分が確認できる公式指標です。',
        factKeyPrefixes: ['pass_rate'],
      },
      {
        title: '申込者・受験者・合格者',
        description: '統計の母数となる公式発表人数です。',
        factKeyPrefixes: ['applicants', 'examinees', 'passed'],
      },
      {
        title: '合格基準',
        description: '合格率とは別に公表された合格基準・合格点です。',
        factKeyPrefixes: ['passing_standard', 'pass_mark'],
      },
    ],
  },
};

const overviewGroups: readonly {
  title: string;
  description: string;
  factKeyPrefixes: readonly string[];
}[] = [
  {
    title: '申込み',
    description: '申込期間・締切・申込み方法の公式情報です。',
    factKeyPrefixes: ['application_'],
  },
  {
    title: '試験内容',
    description: '試験日・試験方式・科目・合格基準の公式情報です。',
    factKeyPrefixes: [
      'exam_',
      'question_',
      'practical_subject',
      'interview_count',
      'passing_standard',
      'pass_mark',
      'scoring_method',
      'result_date',
      'suspension_period',
    ],
  },
  {
    title: '受験資格',
    description: '受験・受検に必要な条件です。',
    factKeyPrefixes: ['eligibility'],
  },
  {
    title: '費用',
    description: '受験料・手数料と支払い方法です。',
    factKeyPrefixes: ['fee', 'payment_'],
  },
  {
    title: '統計',
    description: '合格率と申込者数・受験者数・合格者数の公式統計です。',
    factKeyPrefixes: ['pass_rate', 'applicants', 'examinees', 'passed'],
  },
];

const officialSourcesBySlug: Record<
  string,
  readonly { name: string; url: string; scope: string }[]
> = {
  'it-passport': [
    {
      name: 'IPA 試験情報',
      url: 'https://www.ipa.go.jp/shiken/',
      scope: '制度公告、試験要綱、特別措置、統計入口',
    },
    {
      name: 'JITEC CBT',
      url: 'https://www3.jitec.ipa.go.jp/JitesCbt/',
      scope: 'CBT 試験説明、受験手順、FAQ',
    },
    {
      name: 'JITEC 受験申込み',
      url: 'https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html',
      scope: '申込みルールと試験日選択に関する公式説明',
    },
  ],
  takken: [
    {
      name: 'RETIO 宅建試験情報',
      url: 'https://www.retio.or.jp/exam/',
      scope: '宅建試験の公式案内、日程、申込み入口',
    },
  ],
  gyoseishoshi: [
    {
      name: '行政書士試験研究センター',
      url: 'https://www.gyosei-shiken.or.jp/',
      scope: '行政書士試験の公式案内、申込み入口、試験結果',
    },
    {
      name: '試験概要',
      url: 'https://www.gyosei-shiken.or.jp/doc/abstract/abstract.html',
      scope: '試験制度と実施機関の公式説明',
    },
    {
      name: '令和8年度試験のご案内',
      url: 'https://www.gyosei-shiken.or.jp/doc/guide/guide.html',
      scope: '年度別の受験案内、試験科目、申込み情報',
    },
  ],
  'fundamental-it-engineer': [
    {
      name: 'IPA 基本情報技術者試験',
      url: 'https://www.ipa.go.jp/shiken/kubun/fe.html',
      scope: 'FEの試験概要、CBT方式、試験科目・出題形式',
    },
    {
      name: 'IPA CBT試験情報',
      url: 'https://www.ipa.go.jp/shiken/mousikomi/cbt_sg_fe.html',
      scope: 'CBTの実施時期、受験申込み、試験日時・会場選択',
    },
    {
      name: 'IPA 試験要綱・シラバス',
      url: 'https://www.ipa.go.jp/shiken/syllabus/index.html',
      scope: '試験要綱、シラバス、出題範囲',
    },
  ],
  bookkeeping: [
    {
      name: '日本商工会議所 日商簿記',
      url: 'https://www.kentei.ne.jp/bookkeeping',
      scope: '日商簿記の級別案内、公式公告、試験情報',
    },
    {
      name: '日商簿記ネット試験',
      url: 'https://www.kentei.ne.jp/33013',
      scope: '2級・3級・簿記初級・原価計算初級のネット試験方式、時間、出題形式',
    },
    {
      name: '2026年度試験日程',
      url: 'https://www.kentei.ne.jp/calendar_2026',
      scope: '統一試験・ネット試験の日程、受験料、施行休止期間',
    },
    {
      name: '日商簿記1級 試験科目',
      url: 'https://www.kentei.ne.jp/bookkeeping/class1/exam',
      scope: '1級の試験科目、試験時間、合格基準',
    },
    {
      name: '日商簿記2級 試験科目',
      url: 'https://www.kentei.ne.jp/bookkeeping/class2/exam',
      scope: '2級の試験科目、試験時間、問題数、合格基準',
    },
  ],
  fp: [
    {
      name: '日本FP協会 FP技能検定',
      url: 'https://www.jafp.or.jp/exam/',
      scope: '日本FP協会が実施するFP技能検定の公式入口',
    },
    {
      name: '日本FP協会 2級・3級試験要綱',
      url: 'https://www.jafp.or.jp/exam/outline/',
      scope: '2級・3級CBTの試験時間、問題数、形式、合格基準、手数料',
    },
    {
      name: '日本FP協会 1級試験要綱',
      url: 'https://www.jafp.or.jp/exam/outline/1fp/index.shtml',
      scope: '1級資産設計提案業務の公式要綱',
    },
    {
      name: '金融財政事情研究会 FP技能検定',
      url: 'https://products.kinzai.or.jp/exam-fp/',
      scope: '金融財政事情研究会が実施するFP技能検定の公式入口',
    },
    {
      name: '金財 1級学科試験要綱',
      url: 'https://products.kinzai.or.jp/exam-fp/1kyu-gakka/',
      scope: '1級学科の時間、出題形式、問題数、合格基準、手数料',
    },
    {
      name: '金財 1級実技試験要綱',
      url: 'https://products.kinzai.or.jp/exam-fp/1kyu-jitsugi/',
      scope: '1級資産相談業務の面接方式、合格基準、手数料',
    },
    {
      name: '金財 2級試験要綱',
      url: 'https://products.kinzai.or.jp/exam-fp/2kyu/',
      scope: '2級学科・実技CBTの公式要綱',
    },
    {
      name: '金財 3級試験要綱',
      url: 'https://products.kinzai.or.jp/exam-fp/3kyu/',
      scope: '3級学科・実技CBTの公式要綱',
    },
    {
      name: '金財 受検資格',
      url: 'https://products.kinzai.or.jp/exam-fp/eligibility/',
      scope: '各級・科目の受検資格',
    },
  ],
};

function formatVerifiedAt(value: string | null): string {
  if (!value) return '未確認';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未確認';
  const day = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
  const time = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Tokyo',
  }).format(date);
  return `${day} ${time}`;
}

function formatVerifiedDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '未確認';
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

function formatCalendarDate(value: string | null): string {
  if (!value) return '日付形式未確定';
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(date);
}

function verificationLabel(
  fact: Pick<PublicFact, 'officialVerifiedAt' | 'provenanceStatus'>,
): string {
  if (fact.provenanceStatus === 'verified' && fact.officialVerifiedAt)
    return `公式情報確認: ${formatVerifiedAt(fact.officialVerifiedAt)}`;
  return fact.provenanceStatus === 'fixture'
    ? '公式情報確認: 回帰用 fixture（確認時刻なし）'
    : '公式情報確認: 確認記録未移行';
}

function renderFactSource(fact: PublicFact): string {
  const verification = escapeHtml(verificationLabel(fact));
  return fact.sourceUrl
    ? `<details><summary>公式ソースを確認</summary><div><p><a href="${escapeHtml(fact.sourceUrl)}" target="_blank" rel="noreferrer">公式サイトで確認（新しいタブ）</a></p><p class="source-url">${escapeHtml(fact.sourceUrl)}</p><p>保存記録: ${escapeHtml(fact.sourceSnapshotId)}</p><p>${verification}</p></div></details>`
    : `<details><summary>出典情報</summary><div><p>ソース ID: ${escapeHtml(fact.sourceId)}</p><p>スナップショット: ${escapeHtml(fact.sourceSnapshotId)}</p><p>${verification}</p></div></details>`;
}

// B4: a date-family fact is "ended" only when EVERY date in its normalized
// value lies before today (JST). Multi-date facts with any future occurrence
// stay unmarked; non-date normalized values (venue_defined, year_round, …)
// never qualify.
function factScheduleEnded(fact: PublicFact, today: string): boolean {
  if (!isDateFactKey(fact.factKey)) return false;
  const normalized = fact.normalizedValue;
  if (typeof normalized !== 'string') return false;
  const parts = normalized
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return false;
  return parts.every((part) => {
    const date = part.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    return date !== undefined && date < today;
  });
}

function factVerificationNote(fact: PublicFact): string {
  if (fact.provenanceStatus === 'verified' && fact.officialVerifiedAt) {
    return `${formatVerifiedDay(fact.officialVerifiedAt)}確認`;
  }
  return fact.provenanceStatus === 'fixture' ? '確認記録なし' : '確認待ち';
}

function renderFact(fact: PublicFact): string {
  const dimensions = [
    fact.providerId,
    fact.examLevelId,
    fact.examComponent,
    fact.deliveryMode,
    fact.paymentMethod,
    fact.examSession,
  ]
    .filter(Boolean)
    .map(
      (value) =>
        `<span class="dimension" data-dimension-value="${escapeHtml(String(value))}">${escapeHtml(dimensionLabel(String(value)))}</span>`,
    )
    .join('');
  const verified =
    fact.provenanceStatus === 'verified' && Boolean(fact.officialVerifiedAt);
  const ended = factScheduleEnded(fact, tokyoToday());
  const formattedValue = formatFactDisplayValue({
    factKey: fact.factKey,
    displayValue: fact.displayValue,
    normalizedValue: fact.normalizedValue,
  });
  const longValue = formattedValue.length > 24 || formattedValue.includes('\n');
  return `<article class="card fact" data-fact-key="${escapeHtml(fact.factKey)}"><div class="card__body"><div class="fact__heading"><h3>${escapeHtml(factLabel(fact.factKey))}</h3>${renderBadge(verified ? '公式確認済み' : '出典確認待ち', verified ? 'verified' : 'review')}${ended ? renderBadge('終了', 'info') : ''}</div>${dimensions ? `<div class="dimensions">${dimensions}</div>` : ''}<p class="fact-value ${longValue ? 'fact-value--long' : 'fact-value--numeric'}">${escapeHtml(formattedValue)}</p>${ended ? '<p class="meta">この日程は終了しています。最新の日程・情報は公式サイトでご確認ください。</p>' : ''}<p class="meta fact__meta">${escapeHtml(`${fact.examYear}年度・${factVerificationNote(fact)}`)}</p>${renderFactSource(fact)}</div></article>`;
}

function matchesPrefixes(fact: PublicFact, prefixes: readonly string[]) {
  return prefixes.some((prefix) => fact.factKey.startsWith(prefix));
}

/**
 * A fact can be approved twice (same key, same value, same dimensions) when two
 * snapshots confirm it. Cards are deduplicated on the full display identity so
 * genuinely different dimensions stay visible.
 */
function dedupeFacts(facts: PublicFact[]): PublicFact[] {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const identity = JSON.stringify([
      fact.factKey,
      fact.examYear,
      fact.displayValue,
      fact.providerId ?? null,
      fact.examLevelId ?? null,
      fact.examComponent ?? null,
      fact.deliveryMode ?? null,
      fact.paymentMethod ?? null,
      fact.examSession ?? null,
    ]);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

type ResolvedFactGroup = {
  id: string;
  title: string;
  description: string;
  eyebrow: string | null;
  facts: PublicFact[];
};

/**
 * Overview facts are grouped by the task a reader is trying to finish
 * (apply, understand the exam, check eligibility, pay, compare statistics).
 * Each fact lands in the first matching group so nothing is shown twice.
 */
function resolveFactGroups(
  uniqueFacts: PublicFact[],
  section: QualificationSection,
): ResolvedFactGroup[] {
  const sectionMeta = section === 'overview' ? null : sectionConfig[section];
  const groups = sectionMeta?.groups ?? overviewGroups;
  const claimed = new Set<PublicFact>();
  const resolved: ResolvedFactGroup[] = [];
  groups.forEach((group, index) => {
    const groupFacts = uniqueFacts.filter(
      (fact) =>
        !claimed.has(fact) && matchesPrefixes(fact, group.factKeyPrefixes),
    );
    groupFacts.forEach((fact) => claimed.add(fact));
    if (!groupFacts.length) return;
    resolved.push({
      id: `fact-group-${section}-${index}`,
      title: group.title,
      description: group.description,
      eyebrow: sectionMeta?.eyebrow ?? null,
      facts: groupFacts,
    });
  });
  if (section === 'overview') {
    const leftovers = uniqueFacts.filter((fact) => !claimed.has(fact));
    if (leftovers.length) {
      resolved.push({
        id: `fact-group-${section}-other`,
        title: 'その他の情報',
        description: '上記の分類に含まれない公式確認済み情報です。',
        eyebrow: null,
        facts: leftovers,
      });
    }
  }
  return resolved;
}

function renderFactGroups(groups: ResolvedFactGroup[]): string {
  return groups
    .map((group) => {
      const headingId = `${group.id}-heading`;
      const eyebrow = group.eyebrow
        ? `<p class="eyebrow">${escapeHtml(group.eyebrow)}</p>`
        : '';
      return `<section class="fact-group" id="${group.id}" aria-labelledby="${headingId}"><div class="section-heading"><div>${eyebrow}<h2 id="${headingId}">${escapeHtml(group.title)}</h2><p>${escapeHtml(group.description)}</p></div><p class="meta">${group.facts.length}件</p></div><div class="facts">${group.facts.map(renderFact).join('')}</div></section>`;
    })
    .join('');
}

type DetailSummaryItem = {
  label: string;
  value: string;
  note: string;
  href: string;
  icsHref?: string;
};

function factDateValues(fact: PublicFact): string[] {
  if (typeof fact.normalizedValue !== 'string') return [];
  return [...fact.normalizedValue.matchAll(/\d{4}-\d{2}-\d{2}/g)].map(
    (match) => match[0],
  );
}

function factDimensionNote(fact: PublicFact): string {
  return [
    fact.providerId,
    fact.examLevelId,
    fact.examComponent,
    fact.deliveryMode,
    fact.paymentMethod,
    fact.examSession,
  ]
    .filter(Boolean)
    .map((value) => dimensionLabel(String(value)))
    .join('・');
}

function calendarEventKey(event: {
  factKey: string;
  dateValue: string | null;
  providerId?: string | null;
  examLevelId?: string | null;
  examComponent?: string | null;
  deliveryMode?: string | null;
  paymentMethod?: string | null;
}): string {
  return [
    event.factKey,
    event.dateValue,
    event.providerId ?? '',
    event.examLevelId ?? '',
    event.examComponent ?? '',
    event.deliveryMode ?? '',
    event.paymentMethod ?? '',
  ].join('|');
}

/**
 * Detail KPIs reuse the schedule page's event identity so the existing
 * /ics/<slug>/<year>/<eventId>.ics route keeps its single-event behaviour.
 */
function calendarEventLookup(
  qualification: Qualification,
  facts: PublicFact[],
): Map<string, PublicCalendarEvent> {
  const lookup = new Map<string, PublicCalendarEvent>();
  for (const event of buildPublicCalendarEvents([qualification], facts)) {
    if (event.dateValue) lookup.set(calendarEventKey(event), event);
  }
  return lookup;
}

function detailIcsHref(
  qualification: Qualification,
  events: Map<string, PublicCalendarEvent>,
  fact: PublicFact,
  date: string,
): string | undefined {
  const event = events.get(
    calendarEventKey({
      factKey: fact.factKey,
      dateValue: date,
      providerId: fact.providerId,
      examLevelId: fact.examLevelId,
      examComponent: fact.examComponent,
      deliveryMode: fact.deliveryMode,
      paymentMethod: fact.paymentMethod,
    }),
  );
  return event
    ? `/ics/${qualification.slug}/${event.examYear}/${encodeURIComponent(event.id)}.ics`
    : undefined;
}

function dateSummaryItem(
  facts: PublicFact[],
  groupIds: Map<PublicFact, string>,
  prefixes: readonly string[],
  label: string,
  qualification: Qualification,
  events: Map<string, PublicCalendarEvent>,
): DetailSummaryItem | null {
  const candidates = facts.flatMap((fact) =>
    matchesPrefixes(fact, prefixes)
      ? factDateValues(fact).map((date) => ({ fact, date }))
      : [],
  );
  if (!candidates.length) return null;
  const latestYear = Math.max(...candidates.map(({ fact }) => fact.examYear));
  const sorted = candidates
    .filter(({ fact }) => fact.examYear === latestYear)
    .sort((left, right) => left.date.localeCompare(right.date));
  const today = tokyoToday();
  const chosen =
    sorted.find(({ date }) => date >= today) ?? sorted[sorted.length - 1];
  if (!chosen) return null;
  const groupId = groupIds.get(chosen.fact);
  if (!groupId) return null;
  const noteParts = [`${latestYear}年度`];
  const dimension = factDimensionNote(chosen.fact);
  if (dimension) noteParts.push(dimension);
  const remaining = factDateValues(chosen.fact).length - 1;
  if (remaining > 0) noteParts.push(`ほか${remaining}日程`);
  return {
    label,
    value: formatCalendarDate(chosen.date),
    note: noteParts.join('・'),
    href: `#${groupId}`,
    icsHref: detailIcsHref(qualification, events, chosen.fact, chosen.date),
  };
}

function valueSummaryItem(
  facts: PublicFact[],
  groupIds: Map<PublicFact, string>,
  matches: (fact: PublicFact) => boolean,
  label: string,
  valuePattern?: RegExp,
): DetailSummaryItem | null {
  const candidates = facts.filter(matches);
  if (!candidates.length) return null;
  const latestYear = Math.max(...candidates.map((fact) => fact.examYear));
  const sameYear = candidates.filter((fact) => fact.examYear === latestYear);
  const chosen = sameYear[0];
  const groupId = groupIds.get(chosen);
  if (!groupId) return null;
  const formatted = formatFactDisplayValue({
    factKey: chosen.factKey,
    displayValue: chosen.displayValue,
    normalizedValue: chosen.normalizedValue,
  });
  const matched = valuePattern?.exec(formatted)?.[0];
  const primary = matched ?? formatted.split('／')[0];
  const noteParts = [`${latestYear}年度`];
  const dimension = factDimensionNote(chosen);
  if (dimension) noteParts.push(dimension);
  if (sameYear.length > 1) noteParts.push('ほか詳細あり');
  return {
    label,
    value: primary.length > 24 ? `${primary.slice(0, 23)}…` : primary,
    note: noteParts.join('・'),
    href: `#${groupId}`,
  };
}

/**
 * The four facts most readers come for, lifted above the grouped cards. Values
 * come only from approved facts already rendered on the page.
 */
function renderDetailSummary(
  groups: ResolvedFactGroup[],
  qualification: Qualification,
): string {
  const facts = groups.flatMap((group) => group.facts);
  const groupIds = new Map<PublicFact, string>();
  groups.forEach((group) =>
    group.facts.forEach((fact) => groupIds.set(fact, group.id)),
  );
  const events = calendarEventLookup(qualification, facts);
  const items = [
    dateSummaryItem(
      facts,
      groupIds,
      ['exam_date', 'exam_schedule'],
      '試験日',
      qualification,
      events,
    ),
    dateSummaryItem(
      facts,
      groupIds,
      ['application_deadline'],
      '申込締切',
      qualification,
      events,
    ),
    valueSummaryItem(
      facts,
      groupIds,
      (fact) => fact.factKey === 'fee' || fact.factKey.endsWith('_fee'),
      '受験料',
      /[0-9,]+円/,
    ),
    valueSummaryItem(
      facts,
      groupIds,
      (fact) => fact.factKey.startsWith('pass_rate'),
      '合格率',
      /\d+(?:\.\d+)?%/,
    ),
  ].filter((item): item is DetailSummaryItem => item !== null);
  if (!items.length) return '';
  const cards = items
    .map((item) => {
      const calendar = item.icsHref
        ? `<a class="detail-kpi__ics" href="${escapeHtml(item.icsHref)}" aria-label="${escapeHtml(`${item.label}をカレンダーに追加`)}">${renderIcon('calendar')}<span>カレンダーに追加</span></a>`
        : '';
      return `<div class="detail-kpi"><a class="detail-kpi__link" href="${escapeHtml(item.href)}"><span class="detail-kpi__label">${escapeHtml(item.label)}</span><span class="detail-kpi__value">${escapeHtml(item.value)}</span><span class="detail-kpi__note">${escapeHtml(item.note)}</span></a>${calendar}</div>`;
    })
    .join('');
  return `<section class="detail-summary" aria-labelledby="detail-summary-heading"><h2 id="detail-summary-heading" class="detail-summary__heading">要点サマリー</h2><div class="detail-kpis">${cards}</div></section>`;
}

const historyNumericKeys: readonly string[] = [
  'applicants',
  'examinees',
  'passed',
  'pass_rate',
];

const deliveryRank: Record<string, number> = {
  unified: 0,
  group: 1,
  network: 2,
};

function isHistoryFactKey(factKey: string): boolean {
  return (
    historyNumericKeys.includes(factKey) || factKey === 'statistics_methodology'
  );
}

function historyGroupKey(fact: PublicFact): string {
  return JSON.stringify([
    fact.providerId ?? null,
    fact.examLevelId,
    fact.examComponent ?? null,
    fact.deliveryMode ?? null,
    fact.paymentMethod ?? null,
  ]);
}

function levelRank(groupId: string): number {
  const match = groupId.match(/(\d+)$/);
  return match ? Number(match[1]) : 99;
}

const historyColumnLabels: Record<string, string> = {
  applicants: '申込者数',
  examinees: '受験者数',
  passed: '合格者数',
  pass_rate: '合格率',
};

function compareHistoryGroup(left: string, right: string): number {
  const [leftProvider, leftLevel, leftComponent, leftMode] = JSON.parse(left);
  const [rightProvider, rightLevel, rightComponent, rightMode] =
    JSON.parse(right);
  return (
    String(leftProvider ?? '').localeCompare(String(rightProvider ?? '')) ||
    levelRank(leftLevel ?? '') - levelRank(rightLevel ?? '') ||
    String(leftComponent ?? '').localeCompare(String(rightComponent ?? '')) ||
    (deliveryRank[leftMode] ?? 9) - (deliveryRank[rightMode] ?? 9) ||
    left.localeCompare(right)
  );
}

/**
 * `display_value` keeps the official cell text verbatim (value, then the printed
 * column header, then the session or period in parentheses), so the table takes
 * the leading value token instead of recomputing anything.
 */
function officialValueToken(displayValue: string): string {
  const token = displayValue.split(' ')[0];
  return token && token !== displayValue ? token : displayValue;
}

function officialScopeText(displayValue: string): string {
  const match = displayValue.match(/[（(]([^（）()]*)[)）]\s*$/);
  return match?.[1] ?? '';
}

function sessionLabel(fact: PublicFact): string {
  if (fact.examSession)
    return fact.examSession.includes('回')
      ? fact.examSession
      : `${fact.examSession}回`;
  return officialScopeText(fact.displayValue) || '—';
}

type HistoryRow = {
  year: number;
  session: string;
  cells: Map<string, PublicFact[]>;
};

function compareHistoryRows(left: HistoryRow, right: HistoryRow): number {
  return (
    right.year - left.year ||
    right.session.localeCompare(left.session, undefined, { numeric: true })
  );
}

function renderHistoryRow(row: HistoryRow, currentYear: number): string {
  const cells = historyNumericKeys.map((key) => {
    const facts = row.cells.get(key);
    if (!facts?.length) return '<td class="history-cell--empty">—</td>';
    return `<td>${facts.map((fact) => `<div class="history-value"><span>${escapeHtml(officialValueToken(fact.displayValue))}</span>${renderFactSource(fact)}</div>`).join('')}</td>`;
  });
  const attrs =
    row.year === currentYear
      ? ' class="history-row--current" aria-current="true"'
      : '';
  return `<tr${attrs}><th scope="row">${row.year}年</th><td>${escapeHtml(row.session)}</td>${cells.join('')}</tr>`;
}

function renderHistoryTable(
  groupKey: string,
  rows: Map<string, HistoryRow>,
  notes: PublicFact[],
  groupIndex: number,
  currentYear: number,
): string {
  const dimensions: (string | null)[] = JSON.parse(groupKey);
  const title = dimensions
    .filter((value): value is string => Boolean(value))
    .map(dimensionLabel)
    .join('・');
  const headingId = `history-table-${groupIndex}`;
  const head = [
    '年度',
    '回・期間',
    ...historyNumericKeys.map(
      (key) => historyColumnLabels[key] ?? factLabel(key),
    ),
  ]
    .map((label) => `<th scope="col">${escapeHtml(label)}</th>`)
    .join('');
  const body = [...rows.values()]
    .sort(compareHistoryRows)
    .map((row) => renderHistoryRow(row, currentYear))
    .join('');
  const noteHtml = notes
    .map(
      (note) =>
        `<div class="history-table__note"><p>集計口径：${escapeHtml(note.displayValue)}</p><p class="meta">口径の公表年: ${note.examYear}年</p>${renderFactSource(note)}</div>`,
    )
    .join('');
  return `<div class="history-table-block"><h3 id="${headingId}">${escapeHtml(title || '公式統計')}</h3>${noteHtml}<p class="scroll-hint">横にスクロールできます</p><div class="compare-table-wrap" tabindex="0" role="region" aria-label="比較・統計表（横スクロールできます）"><table class="compare-table history-table" aria-labelledby="${headingId}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div></div>`;
}

function buildHistoryGroups(
  facts: PublicFact[],
): Map<string, Map<string, HistoryRow>> {
  const groups = new Map<string, Map<string, HistoryRow>>();
  for (const fact of facts) {
    if (!historyNumericKeys.includes(fact.factKey)) continue;
    const groupKey = historyGroupKey(fact);
    const rows = groups.get(groupKey) ?? new Map<string, HistoryRow>();
    const rowKey = JSON.stringify([
      fact.examYear,
      fact.examSession ?? officialScopeText(fact.displayValue),
    ]);
    const row = rows.get(rowKey) ?? {
      year: fact.examYear,
      session: sessionLabel(fact),
      cells: new Map<string, PublicFact[]>(),
    };
    row.cells.set(fact.factKey, [...(row.cells.get(fact.factKey) ?? []), fact]);
    rows.set(rowKey, row);
    groups.set(groupKey, rows);
  }
  return groups;
}

function latestHistoryRow(
  rows: Map<string, HistoryRow>,
): HistoryRow | undefined {
  return [...rows.values()].sort(compareHistoryRows)[0];
}

function historyCellValue(row: HistoryRow, factKey: string): string | null {
  const facts = row.cells.get(factKey);
  if (!facts?.length) return null;
  return officialValueToken(facts[0].displayValue);
}

function historyGroupDimensionLabel(groupKey: string): string {
  const dimensions: (string | null)[] = JSON.parse(groupKey);
  return dimensions
    .filter((value): value is string => Boolean(value))
    .map(dimensionLabel)
    .join('・');
}

function renderHistoryTables(facts: PublicFact[], currentYear: number): string {
  const groups = buildHistoryGroups(facts);
  if (!groups.size) return '';
  const notes = new Map<string, PublicFact[]>();
  for (const fact of facts) {
    if (fact.factKey !== 'statistics_methodology') continue;
    const key = historyGroupKey(fact);
    notes.set(key, [...(notes.get(key) ?? []), fact]);
  }

  const tables = [...groups.entries()]
    .sort(([left], [right]) => compareHistoryGroup(left, right))
    .map(([groupKey, rows], groupIndex) =>
      renderHistoryTable(
        groupKey,
        rows,
        notes.get(groupKey) ?? [],
        groupIndex,
        currentYear,
      ),
    )
    .join('');
  const rowCount = [...groups.values()].reduce(
    (total, rows) => total + rows.size,
    0,
  );
  return `<section class="history-tables page-section" aria-labelledby="history-tables-heading"><div class="section-heading"><div><p class="eyebrow">年度別の公式統計</p><h2 id="history-tables-heading">受験者数・合格者数・合格率の年次推移</h2><p>公式が公表した表の値を、回（実施回）ごとに並べたものです。空欄「—」は公式表にその列がない期間で、値の補完はしていません。</p></div><p class="meta">${rowCount} 回・${groups.size} 表</p></div>${tables}</section>`;
}

function renderVerificationHistory(facts: PublicFact[]): string {
  const entries = [
    ...new Set(
      facts
        .map((fact) => fact.officialVerifiedAt)
        .filter((value): value is string => Boolean(value)),
    ),
  ]
    .sort((left, right) => right.localeCompare(left))
    .slice(0, 5);
  if (!entries.length) return '';
  return `<section class="verification-history page-section" aria-labelledby="verification-history-heading"><div class="section-heading"><div><p class="eyebrow">確認記録</p><h2 id="verification-history-heading">公式情報の確認履歴</h2></div></div><ol>${entries.map((entry) => `<li><time datetime="${escapeHtml(entry)}">${escapeHtml(formatVerifiedAt(entry))}</time><span>掲載中の公式事実を確認</span></li>`).join('')}</ol><p class="meta">これは公式情報の確認日時です。ページ内容の更新日時とは異なります。</p></section>`;
}

function renderSourceModule(slug: string): string {
  const sources = (officialSourcesBySlug[slug] ?? [])
    .map(
      (source) =>
        `<li><a href="${source.url}" target="_blank" rel="noreferrer">${source.name}<span class="visually-hidden">（新しいタブで開く）</span></a><span>${source.scope}</span></li>`,
    )
    .join('');
  return `<section id="official-sources" class="source-module page-section"><h2>公式ソースと更新について</h2><p class="source-module__intro">このページの動的事実は、登録済みの公式ソースを保存・解析し、必要な確認を終えたものだけを表示します。公式発表前の日付・料金・制度情報は掲載しません。</p><ul class="source-list">${sources}</ul><details class="disclosure"><summary>情報ステータスの見方</summary><div><p><b>公式確認済み</b>：公開可能な公式スナップショットに紐づく承認済み事実があります。</p><p class="meta">${escapeHtml(verifiedBadgeClarification)}</p><p><b>公式発表待ち</b>：現時点で公開可能な非 synthetic 事実がありません。前年度情報や推測値で補完していません。</p></div></details><details class="disclosure"><summary>更新・訂正について</summary><div><p>公式ページの変更は、スナップショット比較と審査を経て反映します。誤りを見つけた場合は、対象ページ、該当項目、根拠となる公式 URL を添えて運営者へ連絡してください。</p></div></details></section>`;
}

export function renderQualificationPage(view: PublicQualificationView): string {
  return renderQualificationSectionPage(view, 'overview');
}

/**
 * Year tables carry every past year, so the card lists on the overview and
 * pass-rate pages stay limited to the selected year's official facts.
 */
function isListedCardFact(
  fact: PublicFact,
  section: QualificationSection,
  year: number,
): boolean {
  if (section !== 'overview' && section !== 'pass-rate') return true;
  if (fact.factKey === 'statistics_methodology') return false;
  return !historyNumericKeys.includes(fact.factKey) || fact.examYear === year;
}

function qualificationAvailableYears(view: PublicQualificationView): number[] {
  return [
    ...new Set(
      view.facts
        .map((fact) => fact.examYear)
        .filter((value): value is number => Number.isInteger(value)),
    ),
  ].sort((left, right) => right - left);
}

function sectionPageFacts(
  view: PublicQualificationView,
  section: QualificationSection,
  year: number | undefined,
): PublicFact[] {
  const sectionMeta = section === 'overview' ? null : sectionConfig[section];
  const navigationYear =
    year ?? Math.max(...qualificationAvailableYears(view), 2026);
  const cardYearScoped =
    section === 'annual' || (section === 'pass-rate' && year !== undefined);
  return view.facts.filter(
    (fact) =>
      (!cardYearScoped || fact.examYear === year) &&
      isListedCardFact(fact, section, navigationYear) &&
      (!sectionMeta ||
        sectionMeta.factKeyPrefixes.some((prefix) =>
          fact.factKey.startsWith(prefix),
        )),
  );
}

export function qualificationSectionHasContent(
  view: PublicQualificationView,
  section: QualificationSection,
  year?: number,
): boolean {
  if (
    section === 'pass-rate' &&
    year === undefined &&
    view.facts.some((fact) => historyNumericKeys.includes(fact.factKey))
  )
    return true;
  return sectionPageFacts(view, section, year).length > 0;
}

export function qualificationSitemapContent(view: PublicQualificationView): {
  sections: QualificationSection[];
  annualYears: number[];
} {
  const sections = (
    ['overview', 'application', 'exam-content', 'pass-rate'] as const
  ).filter((section) => qualificationSectionHasContent(view, section));
  const annualYears = qualificationAvailableYears(view).filter((year) =>
    qualificationSectionHasContent(view, 'annual', year),
  );
  return { sections: [...sections], annualYears };
}

function yearLinkHref(
  slug: string,
  section: QualificationSection,
  year: number,
  hasHistoryStats: boolean,
): string {
  return section !== 'annual' && hasHistoryStats
    ? `/shikaku/${slug}/pass-rate/?year=${year}`
    : `/shikaku/${slug}/${year}/`;
}

function isCurrentYearLink(
  section: QualificationSection,
  availableYear: number,
  year: number | undefined,
  navigationYear: number,
  hasHistoryStats: boolean,
): boolean {
  if (section === 'annual') return availableYear === year;
  return (
    section === 'pass-rate' &&
    hasHistoryStats &&
    availableYear === navigationYear
  );
}

export function renderQualificationSectionPage(
  view: PublicQualificationView,
  section: QualificationSection,
  year?: number,
): string {
  const { qualification } = view;
  const sectionMeta = section === 'overview' ? null : sectionConfig[section];
  const availableYears = qualificationAvailableYears(view);
  const navigationYear = year ?? Math.max(...availableYears, 2026);
  const historyTables =
    section === 'pass-rate'
      ? renderHistoryTables(view.facts, navigationYear)
      : '';
  const factsForPage = sectionPageFacts(view, section, year);
  const sortedFacts = [...factsForPage].sort(
    (left, right) =>
      factPriority(left.factKey) - factPriority(right.factKey) ||
      left.factKey.localeCompare(right.factKey),
  );
  const factGroups = resolveFactGroups(dedupeFacts(sortedFacts), section);
  const detailSummary = renderDetailSummary(factGroups, qualification);
  const facts = sortedFacts.length
    ? renderFactGroups(factGroups)
    : historyTables
      ? ''
      : renderFeedbackState({
          kind: 'empty',
          title: sectionMeta
            ? `${sectionMeta.title}：${missingMessage(view, sectionMeta.factKeyPrefixes)}`
            : missingMessage(view, []),
          body:
            sectionMeta?.intro ??
            `${qualification.officialNameJa}の動的情報は、公式発表を確認し、必要な審査を完了した後に掲載します。未確認の日付や費用は表示しません。`,
          actions: renderButtonLink({
            href: '#official-sources',
            label: '公式ソースを確認',
            variant: 'secondary',
          }),
        });
  const hasHistoryStats = view.facts.some((fact) =>
    historyNumericKeys.includes(fact.factKey),
  );
  const heroSectionTitle =
    section === 'annual' && year ? `${year}年試験日程` : sectionMeta?.title;
  const documentSectionTitle =
    section === 'overview' ? '試験情報' : (heroSectionTitle ?? '試験情報');
  const documentDescription =
    section === 'overview'
      ? `${qualification.officialNameJa}の試験日程、申込み条件、試験内容、合格率を、公式確認済み情報で整理しています。`
      : section === 'annual'
        ? year
          ? `${qualification.officialNameJa}の${year}年試験日程。申込開始、申込締切、試験日、合格発表を公式情報から確認できます。`
          : `${qualification.officialNameJa}の年度別試験日程を公式情報から確認できます。`
        : section === 'application'
          ? `${qualification.officialNameJa}の申込み方法、受験資格、受験料、支払期限を公式確認済み情報で整理しています。`
          : section === 'exam-content'
            ? `${qualification.officialNameJa}の試験方式、試験科目、出題形式、合格基準を公式要綱に基づいて整理しています。`
            : `${qualification.officialNameJa}の合格率、申込者数、受験者数、合格者数、合格基準を年度別に確認できます。`;
  const sectionEmpty = sortedFacts.length === 0 && !historyTables;
  const sectionMissingLabel = missingMessage(
    view,
    sectionMeta?.factKeyPrefixes ?? [],
  );
  const showSectionMissing =
    sectionEmpty &&
    (view.status === 'verified' || view.status === 'partially_announced');
  const status = renderBadge(
    showSectionMissing ? sectionMissingLabel : statusLabels[view.status],
    showSectionMissing || view.status !== 'verified' ? 'warning' : 'verified',
  );
  const yearOptions =
    section === 'annual'
      ? availableYears.filter((availableYear) =>
          qualificationSectionHasContent(view, 'annual', availableYear),
        )
      : availableYears;
  const yearLinks = (yearOptions.length ? yearOptions : [navigationYear])
    .map(
      (availableYear) =>
        `<a class="year-link" href="${escapeHtml(
          yearLinkHref(
            qualification.slug,
            section,
            availableYear,
            hasHistoryStats,
          ),
        )}"${isCurrentYearLink(section, availableYear, year, navigationYear, hasHistoryStats) ? ' aria-current="page"' : ''}>${availableYear}年</a>`,
    )
    .join('');
  const relatedLinks = [
    {
      section: 'overview',
      href: `/shikaku/${qualification.slug}/`,
      label: '概要',
    },
    {
      section: 'annual',
      href: `/shikaku/${qualification.slug}/${navigationYear}/`,
      label: '日程',
    },
    {
      section: 'application',
      href: `/shikaku/${qualification.slug}/application/`,
      label: '申込み・条件',
    },
    {
      section: 'exam-content',
      href: `/shikaku/${qualification.slug}/exam-content/`,
      label: '試験内容',
    },
    {
      section: 'pass-rate',
      href: `/shikaku/${qualification.slug}/pass-rate/`,
      label: '合格率',
    },
  ]
    .map(
      (item) =>
        `<a href="${escapeHtml(item.href)}"${item.section === section ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`,
    )
    .join('');
  const officialSite = officialSourcesBySlug[qualification.slug]?.[0];
  const officialSiteCta = officialSite
    ? `<section class="sidebar-panel sidebar-panel--cta"><h2>公式サイト</h2><p class="meta">最新の日程・手数料・申込み方法は公式サイトでご確認ください。</p>${renderButtonLink({ href: officialSite.url, label: '公式サイトで確認', variant: 'official' })}</section>`
    : '';
  const sidebar = `<aside class="detail-sidebar" aria-label="ページ情報"><section class="sidebar-panel"><h2>情報ステータス</h2>${status}<dl class="status-list"><div><dt>公式情報確認</dt><dd>${escapeHtml(formatVerifiedAt(view.officialVerifiedAt))}</dd></div><div><dt>このページの事実</dt><dd>${sortedFacts.length}件</dd></div></dl></section><section class="sidebar-panel"><h2>年度を選ぶ</h2><div class="year-links">${yearLinks}</div></section><section class="sidebar-panel"><h2>関連ページ</h2><nav class="sidebar-links" aria-label="関連ページ">${relatedLinks}</nav></section>${officialSiteCta}</aside>`;
  const interpretationNote =
    section === 'pass-rate'
      ? `<aside class="alert alert--info interpretation-note"><div><h2 class="alert__title">数値の見方</h2><p>過去の合格率は集団の実績であり、個人の合格可能性を示すものではありません。年度、級、実施区分と統計の母数をあわせて確認してください。</p></div></aside>`
      : '';
  const scopeNote =
    section === 'pass-rate' && historyTables
      ? `<p class="history-scope-note">上の表が級・実施区分ごとの歴年（公式公表の回合別）、下のカードは ${navigationYear} 年に公式確認した情報です。表の空欄「—」は公式表にその列がない期間で、値の補完はしていません。</p>`
      : section === 'overview' && hasHistoryStats
        ? `<p class="history-scope-note">このページのカードは ${navigationYear} 年の公式確認済み情報です。歴年の受験者数・合格者数・合格率は <a href="/shikaku/${escapeHtml(qualification.slug)}/pass-rate/">合格率ページの表</a> に掲載しています。</p>`
        : '';
  const annualIcs =
    section === 'annual' &&
    year &&
    buildPublicCalendarEvents([qualification], sortedFacts).some(
      (event) => event.dateValue,
    )
      ? `<div class="page-hero__actions">${renderButtonLink({ href: `/ics/${qualification.slug}/${year}.ics`, label: `${year}年のICSをダウンロード`, variant: 'secondary', icon: 'calendar' })}</div>`
      : '';
  const body = `<div class="container"><header class="page-hero detail-hero"><div class="tag-row"><span class="tag">${escapeHtml(fieldLabel(qualification.field))}</span><span class="tag">${escapeHtml(categoryLabel(qualification.category))}</span></div><h1>${escapeHtml(qualification.officialNameJa)}</h1>${heroSectionTitle ? `<p class="detail-hero__section">${escapeHtml(heroSectionTitle)}</p>` : ''}<p>${qualification.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を整理して掲載します。'}</p>${sectionMeta ? `<p class="detail-hero__intro">${escapeHtml(sectionMeta.intro)}</p>` : ''}<div class="page-hero__meta">${status}<span class="meta">公式情報確認日: ${escapeHtml(formatVerifiedAt(view.officialVerifiedAt))}</span></div><nav class="detail-hero__years" aria-label="年度を選ぶ">${yearLinks}</nav>${annualIcs}</header><div class="detail-layout"><div class="detail-main">${detailSummary}${qualificationScopeNotice(qualification.slug)}${interpretationNote}${historyTables}${scopeNote}${facts}${renderVerificationHistory(sortedFacts)}${renderSourceModule(qualification.slug)}</div>${sidebar}</div></div>`;
  const canonicalPath =
    section === 'overview'
      ? `/shikaku/${qualification.slug}/`
      : section === 'annual'
        ? `/shikaku/${qualification.slug}/${year}/`
        : `/shikaku/${qualification.slug}/${section}/`;
  return renderPublicDocument({
    title:
      section === 'annual' && year
        ? `${qualification.officialNameJa}の${year}年試験日程｜申込・試験日・合格発表｜シカクチェック`
        : section === 'overview'
          ? `${qualification.officialNameJa}の試験情報｜日程・受験料・合格率｜シカクチェック`
          : `${qualification.officialNameJa}の${documentSectionTitle}｜公式確認済み｜シカクチェック`,
    description: documentDescription,
    currentNav: 'qualifications',
    breadcrumbs:
      section === 'overview'
        ? [
            { label: 'ホーム', href: '/' },
            { label: '資格を探す', href: '/shikaku/' },
            { label: qualification.officialNameJa },
          ]
        : [
            { label: 'ホーム', href: '/' },
            { label: '資格を探す', href: '/shikaku/' },
            {
              label: qualification.officialNameJa,
              href: `/shikaku/${qualification.slug}/`,
            },
            {
              label: heroSectionTitle ?? sectionConfig[section].title,
            },
          ],
    subnav: renderQualificationSubnav(
      qualification.slug,
      section,
      navigationYear,
    ),
    canonicalPath,
    // The ?year= variant renders the same history tables as /pass-rate/ and only
    // swaps the card set, so it is a parameter filter per product-design 18.2.
    // Empty sections stay reachable from the subnav but must not be indexed.
    noindex: sectionEmpty || (section === 'pass-rate' && year !== undefined),
    body,
  });
}

function directoryHighlights(facts: PublicFact[]) {
  const highlights: Array<{ label: string; value: string }> = [];
  const dateCandidates = facts.flatMap((fact) =>
    matchesPrefixes(fact, ['exam_date', 'exam_schedule'])
      ? factDateValues(fact).map((date) => ({ fact, date }))
      : [],
  );
  if (dateCandidates.length) {
    const latestYear = Math.max(
      ...dateCandidates.map(({ fact }) => fact.examYear),
    );
    const sorted = dateCandidates
      .filter(({ fact }) => fact.examYear === latestYear)
      .sort((left, right) => left.date.localeCompare(right.date));
    const today = tokyoToday();
    const chosen =
      sorted.find(({ date }) => date >= today) ?? sorted[sorted.length - 1];
    if (chosen) {
      highlights.push({
        label: '次回試験日',
        value: formatCalendarDate(chosen.date),
      });
    }
  }
  const valueFor = (
    matches: (fact: PublicFact) => boolean,
    pattern: RegExp,
  ): string | null => {
    const candidates = facts
      .filter(matches)
      .sort((left, right) => right.examYear - left.examYear);
    const chosen = candidates[0];
    if (!chosen) return null;
    const formatted = formatFactDisplayValue({
      factKey: chosen.factKey,
      displayValue: chosen.displayValue,
      normalizedValue: chosen.normalizedValue,
    });
    return pattern.exec(formatted)?.[0] ?? formatted.split('／')[0].trim();
  };
  const fee = valueFor(
    (fact) => fact.factKey === 'fee' || fact.factKey.endsWith('_fee'),
    /[0-9,]+円/,
  );
  if (fee) highlights.push({ label: '受験料', value: fee });
  const passRate = valueFor(
    (fact) => fact.factKey.startsWith('pass_rate'),
    /\d+(?:\.\d+)?%/,
  );
  if (passRate) highlights.push({ label: '合格率', value: passRate });
  return highlights;
}

export function renderQualificationDirectory(
  items: QualificationDirectoryItem[],
  query = '',
): string {
  const fieldTags = [...new Set(items.map((item) => fieldLabel(item.field)))]
    .map((label) => `<span class="tag">${escapeHtml(label)}</span>`)
    .join('');
  const verifiedCount = items.filter(
    (item) => item.status === 'verified',
  ).length;
  const trimmedQuery = query.trim();
  const cards = items
    .map((item) => {
      const highlights = item.facts ? directoryHighlights(item.facts) : [];
      const highlightList = highlights.length
        ? `<dl class="directory-card__facts">${highlights
            .map(
              (highlight) =>
                `<div><dt>${escapeHtml(highlight.label)}</dt><dd>${escapeHtml(highlight.value)}</dd></div>`,
            )
            .join('')}</dl>`
        : '';
      return `<article class="card directory-card"><div class="card__body"><div class="tag-row"><span class="tag">${escapeHtml(fieldLabel(item.field))}</span><span class="tag">${escapeHtml(categoryLabel(item.category))}</span></div><h2><a href="/shikaku/${escapeHtml(item.slug)}/">${escapeHtml(item.officialNameJa)}</a></h2><p class="directory-card__aliases">${item.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を整理して掲載します。'}</p>${highlightList}<div class="directory-card__footer">${renderBadge(statusLabels[item.status], item.status === 'verified' ? 'verified' : 'warning')}<span class="directory-card__cta" aria-hidden="true">詳細を見る →</span></div></div></article>`;
    })
    .join('');
  const searchHeading = trimmedQuery ? '検索結果' : '資格一覧';
  const searchDescription = trimmedQuery
    ? `「${escapeHtml(trimmedQuery)}」に一致する資格`
    : '全資格';
  const searchForm = `<form class="qualification-search" role="search" action="/shikaku/" method="get"><div class="field"><label for="qualification-search">資格名・略称・別名で検索</label><div class="search-control">${renderIcon('search')}<input id="qualification-search" name="q" type="search" value="${escapeHtml(query)}" placeholder="例: 宅建、ITパス、FE、簿記、FP" autocomplete="off"></div><p class="field__help">正式名称、略称、別名、英字略称で探せます。</p></div><div class="qualification-search__actions"><button class="button button--primary" type="submit">${renderIcon('search')}<span>検索</span></button>${trimmedQuery ? renderButtonLink({ href: '/shikaku/', label: 'クリア', variant: 'secondary', icon: 'close' }) : ''}</div></form>`;
  const queryChips = trimmedQuery
    ? `<div class="filter-chips" aria-label="適用中の検索条件"><span class="filter-chips__label">検索条件:</span><a class="filter-chip" href="/shikaku/" aria-label="キーワード「${escapeHtml(trimmedQuery)}」を解除">キーワード: 「${escapeHtml(trimmedQuery)}」<span aria-hidden="true">×</span></a></div>`
    : '';
  const overview = items.length
    ? `<section class="directory-overview" aria-label="掲載状況"><div><p class="directory-overview__value">${items.length}</p><p>${trimmedQuery ? '検索結果' : '掲載資格'}</p></div><div><p class="directory-overview__value">${verifiedCount}</p><p>公式確認済み</p></div><div class="directory-overview__fields"><p class="meta">分野</p><div class="tag-row">${fieldTags}</div></div></section>`
    : '';
  const results = items.length
    ? `<div class="directory">${cards}</div>`
    : renderFeedbackState({
        kind: 'empty',
        title: '一致する資格が見つかりません',
        body: '正式名称・略称・英字略称・別名のいずれかで検索してください。',
        actions: renderButtonLink({
          href: '/shikaku/',
          label: 'すべての資格を見る',
          variant: 'secondary',
        }),
      });
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">公式情報を資格別に整理</p><h1>資格を探す</h1><p>試験の公式情報、申込み条件、試験内容を資格ごとに確認できます。未確認の動的事実は表示していません。</p></header>${searchForm}${queryChips}${overview}<section class="page-section" aria-labelledby="directory-heading"><div class="section-heading"><div><p class="eyebrow">${searchDescription}</p><h2 id="directory-heading">${searchHeading}</h2></div>${items.length ? `<p class="meta" aria-live="polite">${items.length}件</p>` : ''}</div>${results}</section></div>`;
  return renderPublicDocument({
    title: '資格を探す｜試験日程・受験料・合格率・申込条件｜シカクチェック',
    description:
      '試験日程、受験料、合格率、申込条件を資格別に比較できます。公式確認済みの情報だけを掲載しています。',
    currentNav: 'qualifications',
    canonicalPath: '/shikaku/',
    noindex: Boolean(trimmedQuery),
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '資格を探す' }],
    body,
  });
}

export type SchedulePageQuery = {
  year?: string;
  qualification?: string;
  type?: string;
  range?: string;
};

const scheduleRangeLabels: Record<string, string> = {
  '30': '今後30日',
  '90': '今後90日',
  '180': '今後180日',
  all: 'すべての期間',
};

const scheduleTypeOrder: Record<PublicCalendarEvent['type'], number> = {
  application_open: 0,
  application_deadline: 1,
  exam_date: 2,
  result_date: 3,
};

type MergedScheduleEvent = {
  event: PublicCalendarEvent;
  dimensions: string[];
};

const scheduleMonthEventLimit = 10;

function scheduleValueParts(value: string): string[] {
  return value
    .split(/[／,、]\s*|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function renderSchedulePage(
  events: PublicCalendarEvent[],
  query: SchedulePageQuery = {},
): string {
  const years = [...new Set(events.map((event) => event.examYear))].sort(
    (left, right) => right - left,
  );
  const qualifications = [
    ...new Map(
      events.map((event) => [event.qualification.slug, event.qualification]),
    ).values(),
  ].sort((left, right) =>
    left.officialNameJa.localeCompare(right.officialNameJa, 'ja-JP'),
  );
  const activeType =
    query.type && Object.hasOwn(scheduleTypeLabels, query.type)
      ? (query.type as PublicCalendarEvent['type'])
      : '';
  const requestedRange = query.range ?? '';
  const activeRange = Object.hasOwn(scheduleRangeLabels, requestedRange)
    ? requestedRange
    : '90';
  const rangeDays = activeRange === 'all' ? undefined : Number(activeRange);
  const today = tokyoToday();
  const windowEnd = rangeDays ? addDays(today, rangeDays) : undefined;
  const visibleEvents = events.filter((event) => {
    if (activeType && event.type !== activeType) return false;
    if (!event.dateValue || rangeDays === undefined) return true;
    if (event.dateValue < today) return false;
    return event.dateValue <= windowEnd!;
  });
  const mergedEvents = new Map<string, MergedScheduleEvent>();
  for (const event of visibleEvents) {
    const key = `${event.qualification.slug}|${event.examYear}|${event.type}|${event.dateValue ?? 'undated'}`;
    const dimensions = [
      event.providerId,
      event.examLevelId,
      event.examComponent,
      event.deliveryMode,
    ]
      .filter(Boolean)
      .map((value) => dimensionLabel(String(value)));
    const existing = mergedEvents.get(key);
    if (!existing) {
      mergedEvents.set(key, { event, dimensions });
      continue;
    }
    for (const dimension of dimensions) {
      if (!existing.dimensions.includes(dimension)) {
        existing.dimensions.push(dimension);
      }
    }
  }
  const orderedEvents = [...mergedEvents.values()].sort((left, right) => {
    const dateOrder = (left.event.dateValue ?? '9999-12-31').localeCompare(
      right.event.dateValue ?? '9999-12-31',
    );
    if (dateOrder !== 0) return dateOrder;
    const typeOrder =
      scheduleTypeOrder[left.event.type] - scheduleTypeOrder[right.event.type];
    if (typeOrder !== 0) return typeOrder;
    return left.event.qualification.officialNameJa.localeCompare(
      right.event.qualification.officialNameJa,
      'ja-JP',
    );
  });
  const options: {
    year: string;
    qualification: string;
    type: PublicCalendarEvent['type'] | '';
    range: string;
  } = {
    year: query.year ?? '',
    qualification: query.qualification ?? '',
    type: activeType,
    range: activeRange,
  };
  const filtered = Boolean(
    options.year ||
    options.qualification ||
    options.type ||
    (requestedRange && activeRange !== '90'),
  );
  const filters = `<form class="schedule-filter" action="/schedule/" method="get"><div class="field"><label for="schedule-year">年度</label><select id="schedule-year" name="year"><option value="">すべて</option>${years.map((year) => `<option value="${year}"${String(year) === options.year ? ' selected' : ''}>${year}年</option>`).join('')}</select></div><div class="field"><label for="schedule-qualification">資格</label><select id="schedule-qualification" name="qualification"><option value="">すべて</option>${qualifications.map((qualification) => `<option value="${escapeHtml(qualification.slug)}"${qualification.slug === options.qualification ? ' selected' : ''}>${escapeHtml(qualification.officialNameJa)}</option>`).join('')}</select></div><div class="field"><label for="schedule-type">日程の種類</label><select id="schedule-type" name="type"><option value="">すべて</option>${Object.entries(
    scheduleTypeLabels,
  )
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === options.type ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join(
      '',
    )}</select></div><div class="field"><label for="schedule-range">期間</label><select id="schedule-range" name="range">${Object.entries(
    scheduleRangeLabels,
  )
    .map(
      ([value, label]) =>
        `<option value="${value}"${value === options.range ? ' selected' : ''}>${escapeHtml(label)}</option>`,
    )
    .join(
      '',
    )}</select></div><div class="schedule-filter__actions"><button class="button button--primary" type="submit">${renderIcon('calendar')}<span>絞り込む</span></button>${filtered ? renderButtonLink({ href: '/schedule/', label: 'クリア', variant: 'secondary', icon: 'close' }) : ''}</div></form>`;
  const renderEvent = (entry: MergedScheduleEvent): string => {
    const { event } = entry;
    const dimensionChips = entry.dimensions
      .map(
        (dimension) =>
          `<span class="dimension">${escapeHtml(dimension)}</span>`,
      )
      .join('');
    const source = event.sourceUrl
      ? `<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noreferrer">公式ソース</a>`
      : `<span>出典: ${escapeHtml(event.factKey)}</span>`;
    const eventIcs = event.dateValue
      ? renderButtonLink({
          href: `/ics/${event.qualification.slug}/${event.examYear}/${encodeURIComponent(event.id)}.ics`,
          label: 'この予定をICSで追加',
          variant: 'tertiary',
          icon: 'calendar',
        })
      : '';
    const ended = Boolean(event.dateValue && event.dateValue < today);
    const value = formatFactDisplayValue({
      factKey: event.factKey,
      displayValue: event.displayValue,
      normalizedValue: event.startValue,
    });
    const valueParts = scheduleValueParts(value);
    const valueBlock =
      valueParts.length >= 3
        ? `<p class="schedule-event__value">${escapeHtml(valueParts[0])}<span class="schedule-event__count">ほか${valueParts.length - 1}件</span></p><details class="schedule-event__dates"><summary>すべての日付を見る</summary><ul>${valueParts
            .map((part) => `<li>${escapeHtml(part)}</li>`)
            .join('')}</ul></details>`
        : `<p class="schedule-event__value">${escapeHtml(value)}</p>`;
    return `<article class="schedule-event schedule-event--${event.type}${ended ? ' schedule-event--ended' : ''}"><time datetime="${escapeHtml(event.dateValue ?? '')}">${escapeHtml(formatCalendarDate(event.dateValue))}</time><div><div class="schedule-event__heading"><span class="schedule-event__type">${escapeHtml(eventTone[event.type])}</span>${ended ? renderBadge('終了', 'info') : ''}<h2><a href="/shikaku/${escapeHtml(event.qualification.slug)}/${event.examYear}/">${escapeHtml(event.qualification.officialNameJa)}</a></h2></div>${valueBlock}${ended ? `<p class="meta">${escapeHtml(endedGuidance[event.type])}</p>` : ''}${dimensionChips ? `<div class="dimensions">${dimensionChips}</div>` : ''}<p class="meta">${event.examYear}年 / ${escapeHtml(event.label)} / 公式確認: ${escapeHtml(formatVerifiedAt(event.verifiedAt))} / ${source}</p>${eventIcs ? `<div class="schedule-event__actions">${eventIcs}</div>` : ''}</div></article>`;
  };
  const renderCompactEvent = (entry: MergedScheduleEvent): string => {
    const { event } = entry;
    return `<li><time datetime="${escapeHtml(event.dateValue ?? '')}">${escapeHtml(formatCalendarDate(event.dateValue))}</time><span class="schedule-more__type">${escapeHtml(eventTone[event.type])}</span><a href="/shikaku/${escapeHtml(event.qualification.slug)}/${event.examYear}/">${escapeHtml(event.qualification.officialNameJa)}</a></li>`;
  };
  const monthGroups: {
    key: string;
    label: string;
    items: MergedScheduleEvent[];
  }[] = [];
  for (const entry of orderedEvents) {
    const { event } = entry;
    const key = event.dateValue ? event.dateValue.slice(0, 7) : 'undated';
    const label = event.dateValue
      ? `${Number(key.slice(0, 4))}年${Number(key.slice(5, 7))}月`
      : '日付未定';
    const last = monthGroups.at(-1);
    if (last?.key === key) last.items.push(entry);
    else monthGroups.push({ key, label, items: [entry] });
  }
  const monthIcsQuery = new URLSearchParams();
  if (options.qualification)
    monthIcsQuery.set('qualification', options.qualification);
  if (options.type) monthIcsQuery.set('type', options.type);
  const monthIcsSuffix = monthIcsQuery.size ? `?${monthIcsQuery}` : '';
  const groupedEvents = monthGroups
    .map((group) => {
      const monthIcs =
        group.key === 'undated'
          ? ''
          : renderButtonLink({
              href: `/ics/month/${group.key}.ics${monthIcsSuffix}`,
              label: `${group.label}のICSを追加`,
              variant: 'tertiary',
              icon: 'calendar',
            });
      const visibleItems = group.items.slice(0, scheduleMonthEventLimit);
      const hiddenItems = group.items.slice(scheduleMonthEventLimit);
      const more = hiddenItems.length
        ? `<details class="schedule-more"><summary>${escapeHtml(group.label)}の残り${hiddenItems.length}件を表示</summary><ul class="schedule-more__list">${hiddenItems.map(renderCompactEvent).join('')}</ul></details>`
        : '';
      return `<section class="schedule-month" aria-label="${escapeHtml(group.label)}"><div class="schedule-month__heading"><h3>${escapeHtml(group.label)}<span class="schedule-month__count">${group.items.length}件</span></h3>${monthIcs}</div><div class="schedule-list">${visibleItems.map(renderEvent).join('')}</div>${more}</section>`;
    })
    .join('');
  const annualIcs =
    options.year &&
    options.qualification &&
    events.some((event) => event.dateValue)
      ? `<div class="schedule-download">${renderButtonLink({ href: `/ics/${options.qualification}/${options.year}.ics`, label: `${options.year}年のICSをまとめてダウンロード`, variant: 'secondary', icon: 'calendar' })}</div>`
      : '';
  const emptyState = filtered
    ? renderFeedbackState({
        kind: 'empty',
        title: '条件に一致する日程はありません',
        body: '絞り込み条件を変えるか、すべての日程を表示してください。未確認の日付は掲載しません。',
        actions: renderButtonLink({
          href: '/schedule/',
          label: 'すべての日程を見る',
          variant: 'secondary',
        }),
      })
    : renderFeedbackState({
        kind: 'empty',
        title: '表示できる公式日程はまだありません',
        body: '承認済みの申込日、試験日、合格発表日が登録されるとここに表示します。未確認の日付は掲載しません。',
        actions: renderButtonLink({
          href: '/shikaku/',
          label: '資格一覧を見る',
          variant: 'secondary',
        }),
      });
  const countLabel = filtered
    ? `絞り込み後 ${orderedEvents.length}件`
    : `${orderedEvents.length}件`;
  const activeFilters = [
    options.year
      ? { key: 'year', label: '年度', value: `${options.year}年` }
      : null,
    options.qualification
      ? {
          key: 'qualification',
          label: '資格',
          value:
            qualifications.find(
              (qualification) => qualification.slug === options.qualification,
            )?.officialNameJa ?? options.qualification,
        }
      : null,
    options.type
      ? {
          key: 'type',
          label: '種類',
          value: scheduleTypeLabels[options.type] ?? options.type,
        }
      : null,
    requestedRange && activeRange !== '90'
      ? {
          key: 'range',
          label: '期間',
          value: scheduleRangeLabels[activeRange] ?? activeRange,
        }
      : null,
  ].filter(
    (entry): entry is { key: string; label: string; value: string } =>
      entry !== null,
  );
  const filterHref = (omit: string) => {
    const params = new URLSearchParams();
    if (options.year && omit !== 'year') params.set('year', options.year);
    if (options.qualification && omit !== 'qualification')
      params.set('qualification', options.qualification);
    if (options.type && omit !== 'type') params.set('type', options.type);
    if (requestedRange && activeRange !== '90' && omit !== 'range')
      params.set('range', activeRange);
    const search = params.toString();
    return search ? `/schedule/?${search}` : '/schedule/';
  };
  const filterChips = activeFilters.length
    ? `<div class="filter-chips" aria-label="適用中の絞り込み条件"><span class="filter-chips__label">絞り込み:</span>${activeFilters
        .map(
          (filter) =>
            `<a class="filter-chip" href="${escapeHtml(filterHref(filter.key))}" aria-label="${escapeHtml(filter.label)}の条件「${escapeHtml(filter.value)}」を解除">${escapeHtml(filter.label)}: ${escapeHtml(filter.value)}<span aria-hidden="true">×</span></a>`,
        )
        .join(
          '',
        )}<a class="filter-chips__clear" href="/schedule/">すべてクリア</a></div>`
    : '';
  const windowNote =
    activeRange === '90' && !requestedRange
      ? `<p class="schedule-window">直近90日の公式日程を表示しています。それ以前・以降は<a href="/schedule/?range=all">すべての日程</a>から確認できます。</p>`
      : '';
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">承認済み公式事実から集約</p><h1>試験日程</h1><p>申込開始、申込締切、試験日、合格発表を資格横断で確認できます。公式確認済みの事実だけを表示し、未確認日程は補完しません。</p></header>${filters}${filterChips}${windowNote}${annualIcs}<section class="page-section" aria-labelledby="schedule-heading"><div class="section-heading"><div><p class="eyebrow">重要日程</p><h2 id="schedule-heading">日程一覧</h2></div><p class="meta" aria-live="polite">${countLabel}</p></div>${orderedEvents.length ? groupedEvents : emptyState}</section></div>`;
  return renderPublicDocument({
    title:
      '資格試験の日程一覧｜申込開始・締切・試験日・合格発表｜シカクチェック',
    description:
      '資格試験の申込開始日、申込締切、試験日、合格発表日を資格横断で確認できます。公式確認済みの日程のみ掲載しています。',
    currentNav: 'schedule',
    canonicalPath: '/schedule/',
    noindex: filtered,
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '試験日程' }],
    body,
  });
}

const compareStatusMessages = {
  needOne: 'あと1件選ぶと比較できます（2〜3件）。',
  needTwo: 'あと2件選ぶと比較できます（2〜3件）。',
  two: '2件を選択中です。もう1件追加できます。',
  three: '3件を選択中です。4件目を選ぶには、いずれかを外してください。',
  help: '2〜3件を選択してください（最大3件）。',
};

function compareStatusText(count: number): string {
  if (count < 1) return compareStatusMessages.needTwo;
  if (count < 2) return compareStatusMessages.needOne;
  if (count === 3) return compareStatusMessages.three;
  return compareStatusMessages.two;
}

export function renderComparePage(
  comparison: PublicQualificationComparison,
  allQualifications: Qualification[],
): string {
  const selected = new Set(
    comparison.qualifications.map((qualification) => qualification.slug),
  );
  const selectedCount = comparison.qualifications.length;
  const choices = allQualifications
    .map(
      (qualification) =>
        `<label class="compare-choice"><input type="checkbox" name="qualification" value="${escapeHtml(qualification.slug)}"${selected.has(qualification.slug) ? ' checked' : ''}><span>${escapeHtml(qualification.officialNameJa)}</span><small>${escapeHtml(qualification.aliasesJa.join(' / ') || categoryLabel(qualification.category))}</small></label>`,
    )
    .join('');
  const form = `<form class="compare-selector" action="/compare/" method="get"><fieldset><legend>比較する資格を選択</legend><div class="compare-choices">${choices}</div><p class="field__help">${compareStatusMessages.help}</p></fieldset><button class="button button--primary" type="submit"${selectedCount >= 2 ? '' : ' disabled'}>${renderIcon('compare')}<span>比較する</span></button><p class="compare-status" role="status" aria-live="polite">${compareStatusText(selectedCount)}</p></form><script>(function(){var form=document.currentScript.previousElementSibling;if(!form)return;var messages=${JSON.stringify(compareStatusMessages)};var inputs=Array.prototype.slice.call(form.querySelectorAll('input[name="qualification"]'));var submit=form.querySelector('button[type="submit"]');var status=form.querySelector('.compare-status');var countLabel=document.querySelector('[data-compare-count]');function selected(){return inputs.filter(function(input){return input.checked;});}function sync(){var count=selected().length;if(countLabel)countLabel.textContent=String(count);submit.disabled=count<2;inputs.forEach(function(input){input.disabled=!input.checked&&count>=3;});status.textContent=count<1?messages.needTwo:count<2?messages.needOne:count===3?messages.three:messages.two;}inputs.forEach(function(input){input.addEventListener('change',sync);});sync();form.addEventListener('submit',function(){var values=selected().map(function(input){return input.value;});inputs.forEach(function(input){input.disabled=false;});var hidden=document.createElement('input');hidden.type='hidden';hidden.name='qualifications';hidden.value=values.join(',');form.appendChild(hidden);inputs.forEach(function(input){input.disabled=true;});});})();</script>`;
  const headerCells = comparison.qualifications
    .map(
      (qualification) =>
        `<th scope="col"><a href="/shikaku/${escapeHtml(qualification.slug)}/">${escapeHtml(qualification.officialNameJa)}</a>${qualificationScopeNotice(qualification.slug)}</th>`,
    )
    .join('');
  const rows = comparison.rows
    .map((row) => {
      const cells = comparison.qualifications
        .map((qualification) => {
          const cell = row.cells[qualification.slug];
          if (!cell?.entries.length)
            return `<td><span class="compare-empty">${escapeHtml(cell?.missingReason ? (missingReasonLabels[cell.missingReason] ?? '掲載情報なし') : '掲載情報なし')}</span></td>`;
          const seenEntries = new Set<string>();
          const entries = cell.entries.filter((entry) => {
            const identity = JSON.stringify([
              entry.factKey,
              entry.value,
              entry.examYear,
              entry.providerId ?? null,
              entry.examLevelId ?? null,
              entry.examComponent ?? null,
              entry.deliveryMode ?? null,
              entry.paymentMethod ?? null,
              entry.examSession ?? null,
            ]);
            if (seenEntries.has(identity)) return false;
            seenEntries.add(identity);
            return true;
          });
          return `<td>${entries
            .map((entry) => {
              const scope = [
                entry.providerId,
                entry.examLevelId,
                entry.examComponent,
                entry.deliveryMode,
                entry.paymentMethod,
              ]
                .filter(Boolean)
                .map((value) => dimensionLabel(String(value)))
                .join('・');
              const source = entry.sourceUrl
                ? `<a href="${escapeHtml(entry.sourceUrl)}" target="_blank" rel="noreferrer">出典</a>`
                : '';
              return `<div class="compare-entry"><p class="meta">${escapeHtml(scope || '区分指定なし')} / ${escapeHtml(factLabel(entry.factKey))}</p><p>${escapeHtml(formatFactDisplayValue({ factKey: entry.factKey, displayValue: entry.value }))}</p><p class="meta">適用年度: ${entry.examYear}年${entry.examSession ? ` / 回・期間: ${escapeHtml(entry.examSession)}` : ''}</p><p class="meta">${escapeHtml(verificationLabel(entry))}${source ? ` / ${source}` : ''}</p></div>`;
            })
            .join('')}</td>`;
        })
        .join('');
      return `<tr><th scope="row">${escapeHtml(row.label)}</th>${cells}</tr>`;
    })
    .join('');
  const selectedChips = comparison.qualifications
    .map((qualification) => {
      const remaining = comparison.qualifications
        .filter((item) => item.slug !== qualification.slug)
        .map((item) => item.slug);
      const href = remaining.length
        ? `/compare/?qualifications=${encodeURIComponent(remaining.join(','))}`
        : '/compare/';
      return `<a class="compare-chip" href="${escapeHtml(href)}" aria-label="${escapeHtml(qualification.officialNameJa)}を比較から外す">${escapeHtml(qualification.officialNameJa)}<span aria-hidden="true">×</span></a>`;
    })
    .join('');
  const chips = selectedCount
    ? `<div class="compare-chips"><span class="compare-chips__label">選択中:</span>${selectedChips}</div>`
    : '';
  const table =
    selectedCount >= 2
      ? `<p class="scroll-hint">横にスクロールできます</p><div class="compare-table-wrap" tabindex="0" role="region" aria-label="比較・統計表（横スクロールできます）"><table class="compare-table"><caption class="visually-hidden">選択した資格の比較表</caption><thead><tr><th scope="col">比較項目</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`
      : renderFeedbackState({
          kind: 'empty',
          title: '比較する資格を2〜3件選択してください',
          body: '資格を2〜3件選ぶと、申込締切、試験日程、試験方式、費用、受験資格、合格基準などを横並びで確認できます。',
        });
  const guideLabels: Record<string, string> = {
    'takken-vs-gyoseishoshi': '宅建と行政書士の違い',
    'it-passport-vs-fundamental-it-engineer':
      'ITパスポートと基本情報技術者の違い',
    'bookkeeping-vs-fp': '日商簿記とFP技能検定の違い',
  };
  const guides = editorialComparisonSlugs
    .map(
      (slug) =>
        `<a href="/compare/${escapeHtml(slug)}/">${escapeHtml(guideLabels[slug])}</a>`,
    )
    .join('');
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">承認済み公式事実を横断比較</p><h1>資格比較</h1><p>複数の資格を同じ項目で比較できます。表示する値は公式確認済みの事実に限定し、未確認の項目は空欄として扱います。</p></header>${form}<section class="page-section" aria-labelledby="compare-heading"><div class="section-heading"><div><p class="eyebrow"><span data-compare-count>${selectedCount}</span>件選択中</p><h2 id="compare-heading">比較表</h2></div></div>${chips}${table}</section><section class="page-section editorial-related" aria-labelledby="comparison-guides-heading"><h2 id="comparison-guides-heading">比較ガイド</h2><div>${guides}</div></section></div>`;
  return renderPublicDocument({
    title: '資格の比較｜試験方式・受験料・合格率を同じ項目で｜シカクチェック',
    description:
      '複数の資格を試験方式、受験料、合格率などの同じ項目で比較できます。公式確認済みの事実のみを表示します。',
    currentNav: 'compare',
    canonicalPath: '/compare/',
    noindex: selectedCount > 0,
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '資格比較' }],
    body,
  });
}

export function renderEditorialPage(
  page: EditorialPage,
  kind: 'guide' | 'comparison' | 'about',
  canonicalPath: string,
): string {
  const sections = page.sections
    .map(
      (section) =>
        `<section class="editorial-section"><h2>${escapeHtml(section.heading)}</h2>${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}${section.items?.length ? `<ul>${section.items.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>` : ''}</section>`,
    )
    .join('');
  const related = page.related
    .map(
      (item) =>
        `<a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`,
    )
    .join('');
  const comparisonAction =
    kind === 'comparison' && page.compareQuery
      ? `<div class="editorial-actions">${renderButtonLink({ href: `/compare/?qualifications=${encodeURIComponent(page.compareQuery)}`, label: '公式情報で比較する', icon: 'compare' })}</div>`
      : '';
  const body = `<div class="container editorial-container"><header class="page-heading editorial-heading"><p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h1>${escapeHtml(page.title)}</h1><p>${escapeHtml(page.description)}</p>${comparisonAction}</header><article class="editorial-body">${sections}</article><nav class="editorial-related" aria-label="関連ページ"><h2>関連ページ</h2><div>${related}</div></nav></div>`;
  const breadcrumbs =
    kind === 'about'
      ? [{ label: 'ホーム', href: '/' }, { label: page.title }]
      : [
          { label: 'ホーム', href: '/' },
          {
            label: kind === 'comparison' ? '資格比較' : 'ガイド',
            href: kind === 'comparison' ? '/compare/' : '/guide/',
          },
          { label: page.title },
        ];
  return renderPublicDocument({
    title: `${page.title}｜資格試験の調べ方と確認手順｜シカクチェック`,
    description: page.description,
    currentNav:
      kind === 'comparison' ? 'compare' : kind === 'about' ? 'about' : 'guide',
    breadcrumbs,
    canonicalPath,
    body,
  });
}

export function renderGuideIndex(
  entries: readonly { slug: string; page: EditorialPage }[],
): string {
  const cardMetadata = (page: EditorialPage): string => {
    const characters = page.sections
      .flatMap((section) => [
        section.heading,
        ...section.paragraphs,
        ...(section.items ?? []),
      ])
      .join('');
    const minutes = Math.max(1, Math.ceil(characters.length / 500));
    const items = page.sections.reduce(
      (total, section) => total + (section.items?.length ?? 0),
      0,
    );
    const audience = page.audience
      ? `<li>${renderIcon('document')}対象：${escapeHtml(page.audience)}</li>`
      : '';
    return `<ul class="guide-card__meta"><li>${renderIcon('clock')}読了目安 ${minutes}分</li>${audience}<li>${items ? `確認項目 ${items}件` : `観点 ${page.sections.length}つ`}</li></ul>`;
  };
  const cards = entries
    .map(
      ({ slug, page }) =>
        `<article class="card editorial-card guide-card"><div class="card__body"><p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h2><a href="/guide/${escapeHtml(slug)}/">${escapeHtml(page.title)}</a></h2><p>${escapeHtml(page.description)}</p>${cardMetadata(page)}<div class="card-actions">${renderButtonLink({ href: `/guide/${slug}/`, label: 'ガイドを読む', variant: 'secondary' })}</div></div></article>`,
    )
    .join('');
  const guideSlugSet = new Set<string>(launchSlugs);
  const qualificationLinks = launchQualifications
    .filter((qualification) => guideSlugSet.has(qualification.slug))
    .map(
      (qualification) =>
        `<a href="/shikaku/${escapeHtml(qualification.slug)}/">${escapeHtml(qualification.officialNameJa)}</a>`,
    )
    .join('');
  const related = `<nav class="editorial-related guide-related" aria-label="関連する資格とページ"><h2>関連する資格</h2><div>${qualificationLinks}</div><h2 class="guide-related__heading">関連ページ</h2><div><a href="/compare/">資格比較</a><a href="/pass-rate/">合格率データ</a><a href="/schedule/">試験日程</a><a href="/updates/">更新情報</a></div></nav>`;
  const body = `<div class="container editorial-container"><header class="page-heading editorial-heading"><p class="eyebrow">受験準備とデータの見方</p><h1>資格試験ガイド</h1><p>資格試験の情報を確認し、申込みや学習の計画を立てるための基本的な考え方を整理します。日付・費用・制度は、各資格の公式情報ページで確認してください。</p></header><section class="page-section" aria-labelledby="guide-list-heading"><div class="section-heading"><div><p class="eyebrow">ガイド一覧</p><h2 id="guide-list-heading">確認のための基礎知識</h2></div></div><div class="editorial-grid">${cards}</div></section>${related}</div>`;
  return renderPublicDocument({
    title: '資格試験ガイド｜情報の調べ方と申込みの確認手順｜シカクチェック',
    description:
      '資格試験の公式情報の確認方法、年間計画、申込み前のチェック、合格率データの見方を整理したガイドです。',
    currentNav: 'guide',
    canonicalPath: '/guide/',
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: 'ガイド' }],
    body,
  });
}

const affectedPageLabels: Record<string, string> = {
  overview: '概要',
  annual: '年度日程',
  application: '申込み・条件',
  'exam-content': '試験内容',
  'pass-rate': '合格率',
  statistics: '統計',
  compare: '資格比較',
  calendar: '日程カレンダー',
};

function affectedPageLabel(page: string, ownSlug?: string): string {
  if (page.startsWith('qualification:')) {
    const slug = page.slice('qualification:'.length);
    return ownSlug && slug === ownSlug ? 'この資格の概要' : '資格の概要';
  }
  return affectedPageLabels[page] ?? page;
}

export type PassRateSortKey =
  'qualification' | 'year' | 'examinees' | 'passed' | 'pass_rate';

const passRateSortKeys: readonly PassRateSortKey[] = [
  'qualification',
  'year',
  'examinees',
  'passed',
  'pass_rate',
];

export type PassRateIndexOptions = {
  sort?: string | null;
  order?: string | null;
};

type PassRateIndexRow = {
  href: string;
  name: string;
  dimension: string;
  year: number;
  examinees: string | null;
  passed: string | null;
  passRate: string | null;
};

function passRateColumnValue(
  row: PassRateIndexRow,
  key: PassRateSortKey,
): number | null {
  if (key === 'year') return row.year;
  if (key === 'qualification') return null;
  const raw =
    key === 'pass_rate'
      ? row.passRate
      : key === 'examinees'
        ? row.examinees
        : row.passed;
  if (!raw) return null;
  const parsed = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function renderPassRateTableRow(row: PassRateIndexRow): string {
  return `<tr><th scope="row"><a href="${escapeHtml(row.href)}">${escapeHtml(row.name)}</a>${row.dimension ? `<span class="pass-rate-table__dimension">${escapeHtml(row.dimension)}</span>` : ''}</th><td data-label="年度">${row.year}</td><td data-label="受験者数">${escapeHtml(row.examinees ?? '—')}</td><td data-label="合格者数">${escapeHtml(row.passed ?? '—')}</td><td data-label="合格率">${escapeHtml(row.passRate ?? '—')}</td></tr>`;
}

export function renderPassRateIndex(
  entries: readonly {
    qualification: Qualification;
    view: PublicQualificationView;
  }[],
  options: PassRateIndexOptions = {},
): string {
  const sortKey: PassRateSortKey = passRateSortKeys.includes(
    options.sort as PassRateSortKey,
  )
    ? (options.sort as PassRateSortKey)
    : 'qualification';
  const order = options.order === 'desc' ? 'desc' : 'asc';
  const rows: PassRateIndexRow[] = [];
  for (const { qualification, view } of entries) {
    for (const [groupKey, groupRows] of buildHistoryGroups(view.facts)) {
      const latest = latestHistoryRow(groupRows);
      if (!latest) continue;
      rows.push({
        href: `/shikaku/${qualification.slug}/pass-rate/?year=${latest.year}`,
        name: qualification.officialNameJa,
        dimension: historyGroupDimensionLabel(groupKey),
        year: latest.year,
        examinees: historyCellValue(latest, 'examinees'),
        passed: historyCellValue(latest, 'passed'),
        passRate: historyCellValue(latest, 'pass_rate'),
      });
    }
  }
  rows.sort((left, right) => {
    if (sortKey === 'qualification') {
      return order === 'asc'
        ? left.name.localeCompare(right.name, 'ja')
        : right.name.localeCompare(left.name, 'ja');
    }
    const leftValue = passRateColumnValue(left, sortKey);
    const rightValue = passRateColumnValue(right, sortKey);
    if (leftValue === null && rightValue === null) return 0;
    if (leftValue === null) return 1;
    if (rightValue === null) return -1;
    return order === 'asc' ? leftValue - rightValue : rightValue - leftValue;
  });
  const sortHeader = (key: PassRateSortKey, label: string): string => {
    const active = sortKey === key;
    const nextOrder = active && order === 'asc' ? 'desc' : 'asc';
    const indicator = active ? (order === 'asc' ? '↑' : '↓') : '↕';
    return `<th scope="col"${active ? ` aria-sort="${order === 'asc' ? 'ascending' : 'descending'}"` : ''}><a class="pass-rate-table__sort" href="/pass-rate/?sort=${key}&order=${nextOrder}">${escapeHtml(label)}<span aria-hidden="true">${indicator}</span></a></th>`;
  };
  const content = rows.length
    ? `<div class="pass-rate-table-wrap"><table class="pass-rate-table"><caption class="visually-hidden">資格別の受験者数・合格者数・合格率の比較表</caption><thead><tr>${sortHeader('qualification', '資格')}${sortHeader('year', '年度')}${sortHeader('examinees', '受験者数')}${sortHeader('passed', '合格者数')}${sortHeader('pass_rate', '合格率')}</tr></thead><tbody>${rows.map(renderPassRateTableRow).join('')}</tbody></table></div><p class="pass-rate-table__note">各資格の最新年度・最新回の公式確認済み数値を表示しています。年度内のすべての回や過去年度は、資格名のリンク先で確認できます。</p>`
    : renderFeedbackState({
        kind: 'empty',
        title: '公開できる合格率データはまだありません',
        body: '公式統計を確認し、必要な審査を終えた資格から掲載します。未確認の数値は表示しません。',
        actions: renderButtonLink({
          href: '/shikaku/',
          label: '資格一覧を見る',
          variant: 'secondary',
        }),
      });
  const body = `<div class="container editorial-container"><header class="page-heading editorial-heading"><p class="eyebrow">データツール</p><h1>合格率データ</h1><p>資格ごとに、公式発表された合格率、申込者数、受験者数、合格者数の年度別統計を確認できます。過去の実績は個人の合格可能性を示すものではありません。</p></header><section class="page-section" aria-labelledby="pass-rate-list-heading"><div class="section-heading"><div><p class="eyebrow">資格別の統計</p><h2 id="pass-rate-list-heading">合格率を確認する</h2></div><p class="meta">${entries.length}資格</p></div>${content}</section><nav class="editorial-related" aria-label="関連ページ"><h2>関連ページ</h2><div><a href="/guide/how-to-read-pass-rates/">合格率データを見るときの注意点</a><a href="/compare/">資格比較</a><a href="/updates/">更新情報</a></div></nav></div>`;
  return renderPublicDocument({
    title: '合格率データ｜資格別・年度別の受験者数と合格率｜シカクチェック',
    description:
      '資格ごとの合格率、申込者数、受験者数、合格者数を年度別に比較できます。過去の実績であり、個人の合格可能性を示すものではありません。',
    currentNav: 'data',
    canonicalPath: '/pass-rate/',
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '合格率データ' }],
    body,
  });
}

export type UpdatesPageOptions = {
  filtered?: boolean;
  page?: number;
  hasMore?: boolean;
  qualification?: string;
};

export function renderUpdatesPage(
  events: PublicUpdateEvent[],
  options: UpdatesPageOptions = {},
): string {
  const page = Math.max(1, options.page ?? 1);
  const hasMore = options.hasMore ?? false;
  const filtered = options.filtered ?? false;
  const pageHref = (target: number): string => {
    const params = new URLSearchParams();
    if (options.qualification)
      params.set('qualification', options.qualification);
    if (target > 1) params.set('page', String(target));
    const suffix = params.toString();
    return suffix ? `/updates/?${suffix}` : '/updates/';
  };
  const updateRowLabel = (event: PublicUpdateEvent): string => {
    const label =
      event.factLabel === event.factKey
        ? factLabel(event.factKey)
        : event.factLabel;
    return !label || label === event.factKey || /[:._]/.test(label)
      ? '公式情報'
      : label;
  };
  const compactValue = (value: string): string =>
    value.length > 20 ? `${value.slice(0, 19)}…` : value;
  const renderCard = (batch: PublicUpdateEvent[]): string => {
    const first = batch[0];
    const rows = batch
      .map((event) => ({
        event,
        label: updateRowLabel(event),
        before: event.previousValue
          ? formatUpdateDisplayValue(event.factKey, event.previousValue)
          : null,
        after: formatUpdateDisplayValue(event.factKey, event.newValue),
      }))
      .filter(
        (row, index, all) =>
          all.findIndex(
            (other) =>
              other.event.factKey === row.event.factKey &&
              other.before === row.before &&
              other.after === row.after,
          ) === index,
      );
    const single = rows.length === 1 ? rows[0] : null;
    const title = single
      ? single.before
        ? `${first.qualification.officialNameJa}の${single.label}を ${compactValue(single.before)} → ${compactValue(single.after)} に更新`
        : `${first.qualification.officialNameJa}の${single.label}を更新`
      : `${first.qualification.officialNameJa}の${first.eventLabel.replace(/の変更$/, '') || '公式情報'}を更新（${rows.length}項目）`;
    const targetHref = isHistoryFactKey(first.factKey)
      ? `/shikaku/${first.qualification.slug}/pass-rate/?year=${first.examYear}`
      : `/shikaku/${first.qualification.slug}/${first.examYear}/`;
    const affectedPageKeys = [
      ...new Set(batch.flatMap((event) => event.affectedPages)),
    ];
    const affectedPages = affectedPageKeys.length
      ? affectedPageKeys
          .map(
            (page) =>
              `<span class="tag">${escapeHtml(affectedPageLabel(page, first.qualification.slug))}</span>`,
          )
          .join('')
      : '<span class="tag">該当ページ未指定</span>';
    const sourceEvent = batch.find((event) => event.sourceUrl) ?? first;
    const source = sourceEvent.sourceUrl
      ? `<a href="${escapeHtml(sourceEvent.sourceUrl)}" target="_blank" rel="noreferrer">公式ソース</a>`
      : '<span>公式ソース未指定</span>';
    const rowsHtml = rows
      .map(
        (row) =>
          `<tr><th scope="row">${escapeHtml(row.label)}</th><td>${row.before ? escapeHtml(row.before) : '<span class="update-changes__empty">未登録</span>'}</td><td>${escapeHtml(row.after)}</td></tr>`,
      )
      .join('');
    return `<article class="update-card"><div class="update-card__header"><div><p class="eyebrow">${escapeHtml(first.eventLabel)}</p><h2><a href="${escapeHtml(targetHref)}">${escapeHtml(title)}</a></h2></div><time datetime="${escapeHtml(first.createdAt.slice(0, 10))}">${escapeHtml(formatVerifiedDay(first.createdAt))}</time></div><table class="update-changes"><caption class="visually-hidden">${escapeHtml(title)}の変更前後</caption><thead><tr><th scope="col">項目</th><th scope="col">変更前</th><th scope="col">変更後</th></tr></thead><tbody>${rowsHtml}</tbody></table><div class="tag-row">${affectedPages}</div><p class="meta">${first.examYear}年度 / 公式確認: ${escapeHtml(formatVerifiedAt(first.verifiedAt))} / ${source}</p></article>`;
  };
  const groups: { label: string; items: PublicUpdateEvent[] }[] = [];
  const indexByLabel = new Map<string, number>();
  for (const event of events) {
    let groupIndex = indexByLabel.get(event.eventLabel);
    if (groupIndex === undefined) {
      groupIndex = groups.length;
      indexByLabel.set(event.eventLabel, groupIndex);
      groups.push({ label: event.eventLabel, items: [] });
    }
    groups[groupIndex].items.push(event);
  }
  const groupsHtml = groups
    .map((group) => {
      const batches: PublicUpdateEvent[][] = [];
      const batchIndex = new Map<string, number>();
      for (const event of group.items) {
        const key = [
          event.qualification.slug,
          event.examYear,
          event.eventType,
          event.createdAt.slice(0, 10),
        ].join('|');
        const existing = batchIndex.get(key);
        if (existing === undefined) {
          batchIndex.set(key, batches.length);
          batches.push([event]);
        } else {
          batches[existing].push(event);
        }
      }
      const open = group.items.length <= 1 ? ' open' : '';
      const cards = batches.map(renderCard).join('');
      return `<details class="updates-group"${open}><summary><span class="updates-group__label">${escapeHtml(group.label)}</span><span class="meta">${group.items.length}件</span></summary><div class="updates-list">${cards}</div></details>`;
    })
    .join('');
  const pagination =
    page > 1 || hasMore
      ? `<nav class="pagination" aria-label="更新情報のページ送り">${
          page > 1
            ? `<a class="button button--secondary" href="${escapeHtml(pageHref(page - 1))}" rel="prev">前のページ</a>`
            : '<span class="button button--secondary is-disabled" aria-disabled="true">前のページ</span>'
        }<span class="pagination__status">${page}ページ目</span>${
          hasMore
            ? `<a class="button button--secondary" href="${escapeHtml(pageHref(page + 1))}" rel="next">次のページ</a>`
            : '<span class="button button--secondary is-disabled" aria-disabled="true">次のページ</span>'
        }</nav>`
      : '';
  const emptyState =
    page > 1
      ? renderFeedbackState({
          kind: 'empty',
          title: 'このページに更新情報はありません',
          body: '指定したページは公開中の更新情報の範囲外です。最新のページから確認してください。',
          actions: renderButtonLink({
            href: '/updates/',
            label: '最新の更新情報へ',
            variant: 'secondary',
          }),
        })
      : renderFeedbackState({
          kind: 'empty',
          title: '公開できる更新情報はまだありません',
          body: '公式事実の変更・訂正が承認されるとここに表示します。ページ確認だけでは更新情報を作成しません。',
          actions: renderButtonLink({
            href: '/shikaku/',
            label: '資格一覧を見る',
            variant: 'secondary',
          }),
        });
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">公式事実の変更・訂正</p><h1>更新情報</h1><p>承認済みの公式事実に変更や訂正があった場合に、変更前後の値、対象資格、影響ページ、公式ソースを記録します。単なるページ確認やデザイン変更は掲載しません。</p></header><section class="page-section" aria-labelledby="updates-heading"><div class="section-heading"><div><p class="eyebrow">変更ログ</p><h2 id="updates-heading">公式情報の変更・訂正</h2></div><p class="meta">このページ ${events.length}件</p></div>${events.length ? `<div class="updates-groups">${groupsHtml}</div>${pagination}` : emptyState}</section></div>`;
  return renderPublicDocument({
    title:
      page > 1
        ? `更新情報（${page}ページ目）｜公式発表による変更・訂正の記録｜シカクチェック`
        : '更新情報｜公式発表による試験日程・受験料の変更記録｜シカクチェック',
    description:
      '公式発表で変更・訂正された試験日程、受験料、合格率などの変更前後の値を資格別に確認できます。',
    currentNav: 'updates',
    canonicalPath: '/updates/',
    noindex: filtered || page > 1,
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '更新情報' }],
    body,
  });
}

export function renderErrorPage(): string {
  return renderPublicDocument({
    title: '一時的に表示できません',
    noindex: true,
    body: `<div class="container reading-width"><header class="page-heading"><p class="eyebrow">一時的なエラー</p><h1>ページを表示できません</h1></header>${renderFeedbackState(
      {
        kind: 'error',
        title: '情報を取得できませんでした',
        body: '公式情報 API に接続できないため、未確認の内容は表示していません。しばらくしてから再度お試しください。',
        actions: renderButtonLink({
          href: '/shikaku/',
          label: '資格一覧を見る',
          variant: 'secondary',
        }),
      },
    )}</div>`,
  });
}

function tokyoToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function formatDateJa(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}

function remainingDaysLabel(dateValue: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${dateValue.slice(0, 10)}T00:00:00Z`) -
      Date.parse(`${today}T00:00:00Z`)) /
      86_400_000,
  );
  if (!Number.isFinite(days)) return '';
  if (days === 0) return '今日';
  if (days === 1) return '明日';
  return `あと${days}日`;
}

export function renderHomePage(
  calendarEvents: readonly PublicCalendarEvent[] = [],
  updates: readonly PublicUpdateEvent[] = [],
  factsBySlug: Readonly<Record<string, PublicFact[]>> = {},
): string {
  const launchSlugSet = new Set<string>(launchSlugs);
  const qualificationCards = launchQualifications
    .filter((qualification) => launchSlugSet.has(qualification.slug))
    .map((qualification) => {
      const highlights = directoryHighlights(
        factsBySlug[qualification.slug] ?? [],
      ).slice(0, 2);
      const factsList = highlights.length
        ? `<dl class="home-qualification__facts">${highlights
            .map(
              (highlight) =>
                `<div><dt>${escapeHtml(highlight.label)}</dt><dd>${escapeHtml(highlight.value)}</dd></div>`,
            )
            .join('')}</dl>`
        : '';
      return `<article class="home-qualification"><div class="home-qualification__top"><span class="tag home-qualification__field">${renderIcon('document')}${escapeHtml(fieldLabel(qualification.field))}</span><span class="home-qualification__arrow" aria-hidden="true">${renderIcon('external')}</span></div><h3><a href="/shikaku/${escapeHtml(qualification.slug)}/">${escapeHtml(qualification.officialNameJa)}</a></h3><p>${qualification.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を資格別に整理します。'}</p>${factsList}<a class="text-link" href="/shikaku/${escapeHtml(qualification.slug)}/">資格の情報を見る<span aria-hidden="true"> →</span></a></article>`;
    })
    .join('');
  const today = tokyoToday();
  // B5: the same (date, type, qualification) can appear once per level or
  // session (e.g. bookkeeping 1/2/3級 on one exam day). The timeline does not
  // render levels, so collapse duplicates before taking the first four.
  const seenTimeline = new Set<string>();
  const upcoming = [...calendarEvents]
    .filter((event) => event.dateValue && event.dateValue >= today)
    .sort(
      (a, b) =>
        a.dateValue!.localeCompare(b.dateValue!) || a.sequence - b.sequence,
    )
    .filter((event) => {
      const key = `${event.dateValue}|${event.type}|${event.qualification.slug}`;
      if (seenTimeline.has(key)) return false;
      seenTimeline.add(key);
      return true;
    })
    .slice(0, 4);
  const scheduleState = upcoming.length
    ? `<ul class="home-timeline" aria-label="直近の試験日程">${upcoming
        .map(
          (event) =>
            `<li class="home-timeline__item"><span class="home-timeline__date">${escapeHtml(formatDateJa(event.dateValue!))}</span><span class="home-timeline__badge">${escapeHtml(event.label)}</span><a class="home-timeline__link" href="/shikaku/${escapeHtml(event.qualification.slug)}/${event.examYear}/">${escapeHtml(event.qualification.officialNameJa)}</a><span class="home-timeline__count">${escapeHtml(remainingDaysLabel(event.dateValue!, today))}</span></li>`,
        )
        .join(
          '',
        )}</ul><div class="home-section__footer">${renderButtonLink({ href: '/schedule/', label: 'すべての日程を見る', variant: 'secondary', icon: 'calendar' })}</div>`
    : `<div class="home-schedule-entry"><div class="home-schedule-entry__icon">${renderIcon('calendar')}</div><div><h3>公式確認済みの日程を一覧で確認</h3><p>申込開始・締切、試験日、合格発表を資格横断で探せます。日付が未確認の予定は掲載しません。</p></div>${renderButtonLink({ href: '/schedule/', label: '試験日程を見る', variant: 'secondary', icon: 'calendar' })}</div>`;
  // One batch of statistics updates arrives as several rows (applicants /
  // examinees / pass rate). Merge them into a single card per qualification,
  // event type, and day so the home feed never repeats itself.
  const updateGroups = new Map<
    string,
    { event: PublicUpdateEvent; labels: string[] }
  >();
  for (const event of updates) {
    const key = `${event.qualification.slug}|${event.eventLabel}|${event.examYear}|${event.createdAt.slice(0, 10)}`;
    const existing = updateGroups.get(key);
    if (existing) {
      if (!existing.labels.includes(event.factLabel))
        existing.labels.push(event.factLabel);
    } else {
      updateGroups.set(key, { event, labels: [event.factLabel] });
    }
  }
  const recentUpdates = [...updateGroups.values()].slice(0, 3);
  const updatesState = recentUpdates.length
    ? `<ul class="home-updates">${recentUpdates
        .map(
          ({ event, labels }) =>
            `<li><span class="home-updates__date">${escapeHtml(formatDateJa(event.createdAt))}</span><div><a href="/updates/?qualification=${encodeURIComponent(event.qualification.slug)}">${escapeHtml(event.qualification.officialNameJa)}：${escapeHtml(event.eventLabel)}</a><span class="home-updates__meta">${escapeHtml(labels.join('・'))}</span></div></li>`,
        )
        .join(
          '',
        )}</ul><div class="home-section__footer"><a class="text-link" href="/updates/">更新情報をすべて見る<span aria-hidden="true"> →</span></a></div>`
    : `<div class="home-schedule-entry"><div class="home-schedule-entry__icon">${renderIcon('update')}</div><div><h3>更新情報はまだありません</h3><p>公式発表を確認した変更や訂正を、ここでお知らせします。</p></div>${renderButtonLink({ href: '/updates/', label: '更新情報を見る', variant: 'secondary', icon: 'update' })}</div>`;
  const body = `<div class="container"><section class="home-hero"><div class="home-hero__visual" aria-hidden="true">${heroImageMarkup}</div><div class="home-hero__main"><p class="eyebrow home-hero__eyebrow">${renderIcon('document')}資格試験を、公式情報から考える</p><h1>資格試験の日程・受験料を、<br>合格率までまとめて確認。</h1><p class="home-hero__lead">試験日、申込み条件、試験内容を、確認済みの公式情報に基づいて掲載します。</p><form class="home-search" role="search" action="/shikaku/" method="get"><label for="home-search-input">資格名から探す</label><div class="home-search__row"><div class="search-control">${renderIcon('search')}<input id="home-search-input" name="q" type="search" placeholder="例：宅建、ITパス、簿記" autocomplete="off"></div><button class="button button--primary" type="submit">検索する<span aria-hidden="true"> →</span></button></div></form><div class="home-intro__actions">${renderButtonLink({ href: '/schedule/', label: '試験日程を見る', variant: 'secondary', icon: 'calendar' })}<a class="home-all-link" href="/shikaku/">資格一覧を見る<span aria-hidden="true"> →</span></a></div><div class="popular-links" aria-label="主な資格"><span>主な資格</span><a href="/shikaku/takken/">宅建</a><a href="/shikaku/gyoseishoshi/">行政書士</a><a href="/shikaku/it-passport/">ITパスポート</a><a href="/shikaku/fundamental-it-engineer/">基本情報</a><a href="/shikaku/bookkeeping/">日商簿記</a><a href="/shikaku/fp/">FP</a></div></div><aside class="trust-panel" aria-label="情報の信頼性"><p class="eyebrow">このサイトの読み方</p><h2>確認できた事実を、<br>確かめながら読む。</h2><ol class="trust-steps"><li><span>01</span><div><strong>公式情報を確認</strong><p>試験実施機関の発表をもとに整理します。</p></div></li><li><span>02</span><div><strong>年度と確認日を表示</strong><p>いつの情報かを事実ごとに明示します。</p></div></li><li><span>03</span><div><strong>出典までたどれる</strong><p>公式ソースと変更履歴を確認できます。</p></div></li></ol><p class="unofficial-notice">${escapeHtml(unofficialNotice)}</p></aside></section><section class="page-section home-section" aria-labelledby="schedule-heading"><div class="section-heading"><div><p class="eyebrow">試験日程</p><h2 id="schedule-heading">申込みから合格発表まで</h2></div><a href="/schedule/">日程一覧へ<span aria-hidden="true"> →</span></a></div>${scheduleState}</section><section class="page-section home-section" aria-labelledby="recent-updates-heading"><div class="section-heading"><div><p class="eyebrow">更新情報</p><h2 id="recent-updates-heading">最近の公式更新</h2></div><a href="/updates/">更新一覧へ<span aria-hidden="true"> →</span></a></div>${updatesState}</section><section class="page-section home-section" aria-labelledby="qualifications-heading"><div class="section-heading"><div><p class="eyebrow">掲載資格</p><h2 id="qualifications-heading">資格から情報を探す</h2></div><a href="/shikaku/">すべての資格を見る<span aria-hidden="true"> →</span></a></div><div class="home-qualifications">${qualificationCards}</div></section><section class="page-section home-section" aria-labelledby="tools-heading"><div class="section-heading"><div><p class="eyebrow">便利な入口</p><h2 id="tools-heading">目的から探す</h2></div></div><div class="tool-grid"><article class="tool-card">${renderIcon('calendar')}<h3><a href="/schedule/">試験日程</a></h3><p>資格ごとの申込・試験・合格発表を確認。</p><a class="tool-card__link" href="/schedule/">日程を調べる<span aria-hidden="true"> →</span></a></article><article class="tool-card">${renderIcon('compare')}<h3><a href="/compare/">資格比較</a></h3><p>条件や試験方式を同じ項目で比較。</p><a class="tool-card__link" href="/compare/">資格を比較する<span aria-hidden="true"> →</span></a></article><article class="tool-card">${renderIcon('update')}<h3><a href="/updates/">更新情報</a></h3><p>公式発表による変更と訂正を確認。</p><a class="tool-card__link" href="/updates/">変更を見る<span aria-hidden="true"> →</span></a></article></div></section><section class="page-section trust-summary"><div><p class="eyebrow">データの信頼性</p><h2>推測値で空欄を埋めません</h2><p>公式発表前の日付、料金、制度情報は掲載せず、確認できた情報だけを出典とともに表示します。</p></div><div class="trust-summary__points"><p>${renderIcon('document')}<span>登録済みの公式情報源</span></p><p>${renderIcon('clock')}<span>公式情報確認日を明記</span></p><p>${renderIcon('update')}<span>変更・訂正を履歴化</span></p></div></section></div>`;
  return renderPublicDocument({
    title: '日本の資格試験の日程・受験料・合格率をまとめて確認｜シカクチェック',
    description:
      '日本の資格試験について、試験日程・受験料・合格率・申込条件を公式発表をもとに整理した非公式サイトです。',
    currentNav: 'home',
    canonicalPath: '/',
    heroPreload: true,
    body,
  });
}

export function renderNotFoundPage(): string {
  const searchForm = `<form class="qualification-search not-found-search" role="search" action="/shikaku/" method="get"><div class="field"><label for="not-found-search">資格名・略称で検索</label><div class="search-control">${renderIcon('search')}<input id="not-found-search" name="q" type="search" placeholder="例：宅建、ITパスポート、簿記" autocomplete="off"></div><p class="field__help">正式名称、略称、別名で探せます。</p></div><div class="qualification-search__actions"><button class="button button--primary" type="submit">${renderIcon('search')}<span>検索</span></button></div></form>`;
  const popularPages = [
    { href: '/schedule/', label: '試験日程' },
    { href: '/compare/', label: '資格比較' },
    { href: '/pass-rate/', label: '合格率データ' },
    { href: '/updates/', label: '更新情報' },
    { href: '/guide/', label: '資格試験ガイド' },
  ];
  const popularPageLinks = `<nav class="popular-pages" aria-label="よく見られるページ"><h2>よく見られるページ</h2><ul>${popularPages.map((page) => `<li><a href="${escapeHtml(page.href)}"><span>${escapeHtml(page.label)}</span><span aria-hidden="true">→</span></a></li>`).join('')}</ul></nav>`;
  return renderPublicDocument({
    title: 'ページが見つかりません',
    noindex: true,
    body: `<div class="container reading-width"><header class="page-heading not-found-heading"><h1><span class="not-found__code">404</span>ページが見つかりません</h1></header>${renderFeedbackState(
      {
        kind: 'empty',
        title: '指定されたページを確認できませんでした',
        body: 'URLが変更されたか、ページがまだ公開されていない可能性があります。ホームまたは資格一覧から目的のページを探してください。',
        actions: `${renderButtonLink({ href: '/', label: 'ホームへ戻る' })}${renderButtonLink({ href: '/shikaku/', label: '資格一覧を見る', variant: 'secondary' })}`,
      },
    )}${searchForm}${popularPageLinks}<div class="popular-links" aria-label="主な資格"><span>主な資格</span><a href="/shikaku/takken/">宅建</a><a href="/shikaku/it-passport/">ITパスポート</a><a href="/shikaku/bookkeeping/">日商簿記</a><a href="/shikaku/fp/">FP</a></div></div>`,
  });
}
