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
  renderBadge,
  renderButtonLink,
  renderFeedbackState,
  renderIcon,
} from '../../../packages/ui/src/index.js';
import { editorialComparisonSlugs, type EditorialPage } from './editorial.js';
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
};

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
  ['application_deadline', '申込締切'],
  ['application_open', '申込開始'],
  ['application_start', '申込開始'],
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
  ['passing_standard', '合格基準'],
  ['pass_mark', '合格点'],
  ['pass_rate', '合格率'],
  ['applicants', '申込者数'],
  ['examinees', '受験者数・受検者数'],
  ['passed', '合格者数'],
  ['application_rule', '申込みルール'],
  ['application_change_deadline_rule', '申込み内容変更ルール'],
];

const dimensionLabels: Record<string, string> = {
  academic: '学科',
  cbt: 'CBT',
  'fp:1': '1級',
  'fp:2': '2級',
  'fp:3': '3級',
  jafp: '日本FP協会',
  kinzai: '金融財政事情研究会',
  network: 'ネット試験',
  paper: '筆記試験',
  practical: '実技',
};

const eventTone: Record<PublicCalendarEvent['type'], string> = {
  application_open: '受付開始',
  application_deadline: '締切',
  exam_date: '試験',
  result_date: '発表',
};

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
        description: '級、科目、実施方式ごとの公式料金情報です。',
        factKeyPrefixes: ['fee'],
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
    ],
    groups: [
      {
        title: '試験方式と時間',
        description: '試験方式、実施形態、試験時間を表示します。',
        factKeyPrefixes: [
          'exam_method',
          'exam_time',
          'question_format',
          'exam_subject_',
        ],
      },
      {
        title: '科目・出題内容',
        description: '公式要綱で確認できた科目、範囲、問題数です。',
        factKeyPrefixes: [
          'exam_content',
          'exam_subjects',
          'question_count',
          'exam_subject_',
        ],
      },
      {
        title: '合格基準',
        description: '公式に示された評価・合格基準です。',
        factKeyPrefixes: ['passing_standard'],
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
      url: 'https://www.kinzai.or.jp/ginou/fp/',
      scope: '金融財政事情研究会が実施するFP技能検定の公式入口',
    },
    {
      name: '金財 1級学科試験要綱',
      url: 'https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html',
      scope: '1級学科の時間、出題形式、問題数、合格基準、手数料',
    },
    {
      name: '金財 1級実技試験要綱',
      url: 'https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html',
      scope: '1級資産相談業務の面接方式、合格基準、手数料',
    },
    {
      name: '金財 2級試験要綱',
      url: 'https://www.kinzai.or.jp/ginou/fp/2kyu/index.html',
      scope: '2級学科・実技CBTの公式要綱',
    },
    {
      name: '金財 3級試験要綱',
      url: 'https://www.kinzai.or.jp/ginou/fp/3kyu/index.html',
      scope: '3級学科・実技CBTの公式要綱',
    },
    {
      name: '金財 受検資格',
      url: 'https://www.kinzai.or.jp/ginou/fp/sikaku.html',
      scope: '各級・科目の受検資格',
    },
  ],
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatVerifiedAt(value: string | null): string {
  if (!value) return '未確認';
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(value));
}

function formatCalendarDate(value: string | null): string {
  if (!value) return '日付形式未確定';
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeZone: 'Asia/Tokyo',
  }).format(new Date(`${value}T00:00:00+09:00`));
}

function renderFact(fact: PublicFact): string {
  const dimensions = [
    fact.providerId,
    fact.examLevelId,
    fact.examComponent,
    fact.deliveryMode,
  ]
    .filter(Boolean)
    .map(
      (value) =>
        `<span class="dimension" data-dimension-value="${escapeHtml(String(value))}">${escapeHtml(dimensionLabel(String(value)))}</span>`,
    )
    .join('');
  const verification = fact.officialVerifiedAt
    ? `公式情報確認: ${escapeHtml(formatVerifiedAt(fact.officialVerifiedAt))}`
    : fact.provenanceStatus === 'fixture'
      ? '公式情報確認: 回帰用 fixture（確認時刻なし）'
      : '公式情報確認: 確認記録未移行';
  const source = fact.sourceUrl
    ? `<details><summary>公式ソースを確認</summary><div><p><a href="${escapeHtml(fact.sourceUrl)}" target="_blank" rel="noreferrer">公式サイトで確認（新しいタブ）</a></p><p class="source-url">${escapeHtml(fact.sourceUrl)}</p><p>保存記録: ${escapeHtml(fact.sourceSnapshotId)}</p><p>${verification}</p></div></details>`
    : `<details><summary>出典情報</summary><div><p>ソース ID: ${escapeHtml(fact.sourceId)}</p><p>スナップショット: ${escapeHtml(fact.sourceSnapshotId)}</p><p>${verification}</p></div></details>`;
  return `<article class="card fact" data-fact-key="${escapeHtml(fact.factKey)}"><div class="card__body"><div class="fact__heading"><h3>${escapeHtml(factLabel(fact.factKey))}</h3>${renderBadge('公式確認済み', 'verified')}</div>${dimensions ? `<div class="dimensions">${dimensions}</div>` : ''}<p class="fact-value">${escapeHtml(fact.displayValue)}</p><p class="meta">適用年度: ${escapeHtml(String(fact.examYear))}年</p>${source}</div></article>`;
}

function matchesPrefixes(fact: PublicFact, prefixes: readonly string[]) {
  return prefixes.some((prefix) => fact.factKey.startsWith(prefix));
}

function renderFactGroups(
  facts: PublicFact[],
  section: QualificationSection,
): string {
  if (section === 'overview') {
    return `<section aria-labelledby="facts-heading"><div class="section-heading"><div><p class="eyebrow">主要な公式情報</p><h2 id="facts-heading">公式確認済み情報</h2></div><p class="meta">${facts.length}件</p></div><div class="facts">${facts.map(renderFact).join('')}</div></section>`;
  }
  const config = sectionConfig[section];
  return config.groups
    .map((group, index) => {
      const groupFacts = facts.filter((fact) =>
        matchesPrefixes(fact, group.factKeyPrefixes),
      );
      if (!groupFacts.length) return '';
      const headingId = `fact-group-${section}-${index}`;
      return `<section class="fact-group" aria-labelledby="${headingId}"><div class="section-heading"><div><p class="eyebrow">${escapeHtml(config.eyebrow)}</p><h2 id="${headingId}">${escapeHtml(group.title)}</h2><p>${escapeHtml(group.description)}</p></div><p class="meta">${groupFacts.length}件</p></div><div class="facts">${groupFacts.map(renderFact).join('')}</div></section>`;
    })
    .join('');
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
  return `<section id="official-sources" class="source-module page-section"><h2>公式ソースと更新について</h2><p class="source-module__intro">このページの動的事実は、登録済みの公式ソースを保存・解析し、必要な確認を終えたものだけを表示します。公式発表前の日付・料金・制度情報は掲載しません。</p><ul class="source-list">${sources}</ul><details class="disclosure"><summary>情報ステータスの見方</summary><div><p><b>公式確認済み</b>：公開可能な公式スナップショットに紐づく承認済み事実があります。</p><p><b>公式発表待ち</b>：現時点で公開可能な非 synthetic 事実がありません。前年度情報や推測値で補完していません。</p></div></details><details class="disclosure"><summary>更新・訂正について</summary><div><p>公式ページの変更は、スナップショット比較と審査を経て反映します。誤りを見つけた場合は、対象ページ、該当項目、根拠となる公式 URL を添えて運営者へ連絡してください。</p></div></details></section>`;
}

export function renderQualificationPage(view: PublicQualificationView): string {
  return renderQualificationSectionPage(view, 'overview');
}

export function renderQualificationSectionPage(
  view: PublicQualificationView,
  section: QualificationSection,
  year?: number,
): string {
  const { qualification } = view;
  const sectionMeta = section === 'overview' ? null : sectionConfig[section];
  const factsForPage = sectionMeta
    ? view.facts.filter(
        (fact) =>
          (section !== 'annual' || fact.examYear === year) &&
          sectionMeta.factKeyPrefixes.some((prefix) =>
            fact.factKey.startsWith(prefix),
          ),
      )
    : view.facts;
  const sortedFacts = [...factsForPage].sort(
    (left, right) =>
      factPriority(left.factKey) - factPriority(right.factKey) ||
      left.factKey.localeCompare(right.factKey),
  );
  const facts = sortedFacts.length
    ? renderFactGroups(sortedFacts, section)
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
  const availableYears = [
    ...new Set(
      view.facts
        .map((fact) => fact.examYear)
        .filter((value): value is number => Number.isInteger(value)),
    ),
  ].sort((left, right) => right - left);
  const navigationYear = year ?? Math.max(...availableYears, 2026);
  const pageTitle =
    section === 'annual' && year ? `${year}年試験日程` : sectionMeta?.title;
  const status = renderBadge(
    statusLabels[view.status],
    view.status === 'verified' ? 'verified' : 'warning',
  );
  const yearLinks = (availableYears.length ? availableYears : [navigationYear])
    .map(
      (availableYear) =>
        `<a class="year-link" href="/shikaku/${escapeHtml(qualification.slug)}/${availableYear}/"${section === 'annual' && availableYear === year ? ' aria-current="page"' : ''}>${availableYear}年</a>`,
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
  const sidebar = `<aside class="detail-sidebar" aria-label="ページ情報"><section class="sidebar-panel"><h2>情報ステータス</h2>${status}<dl class="status-list"><div><dt>公式情報確認</dt><dd>${escapeHtml(formatVerifiedAt(view.officialVerifiedAt))}</dd></div><div><dt>このページの事実</dt><dd>${sortedFacts.length}件</dd></div></dl></section><section class="sidebar-panel"><h2>年度を選ぶ</h2><div class="year-links">${yearLinks}</div></section><section class="sidebar-panel"><h2>関連ページ</h2><nav class="sidebar-links" aria-label="関連ページ">${relatedLinks}</nav></section></aside>`;
  const interpretationNote =
    section === 'pass-rate'
      ? `<aside class="alert alert--info interpretation-note"><div><h2 class="alert__title">数値の見方</h2><p>過去の合格率は集団の実績であり、個人の合格可能性を示すものではありません。年度、級、実施区分と統計の母数をあわせて確認してください。</p></div></aside>`
      : '';
  const annualIcs =
    section === 'annual' &&
    year &&
    buildPublicCalendarEvents([qualification], sortedFacts).some(
      (event) => event.dateValue,
    )
      ? `<div class="page-hero__actions">${renderButtonLink({ href: `/ics/${qualification.slug}/${year}.ics`, label: `${year}年のICSをダウンロード`, variant: 'secondary', icon: 'calendar' })}</div>`
      : '';
  const body = `<div class="container"><header class="page-hero detail-hero"><div class="tag-row"><span class="tag">${escapeHtml(fieldLabel(qualification.field))}</span><span class="tag">${escapeHtml(categoryLabel(qualification.category))}</span></div><h1>${escapeHtml(qualification.officialNameJa)}</h1>${pageTitle ? `<p class="detail-hero__section">${escapeHtml(pageTitle)}</p>` : ''}<p>${qualification.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を整理して掲載します。'}</p>${sectionMeta ? `<p class="detail-hero__intro">${escapeHtml(sectionMeta.intro)}</p>` : ''}<div class="page-hero__meta">${status}<span class="meta">公式情報確認日: ${escapeHtml(formatVerifiedAt(view.officialVerifiedAt))}</span></div><nav class="detail-hero__years" aria-label="年度を選ぶ">${yearLinks}</nav>${annualIcs}</header><div class="detail-layout"><div class="detail-main">${interpretationNote}${facts}${renderVerificationHistory(sortedFacts)}${renderSourceModule(qualification.slug)}</div>${sidebar}</div></div>`;
  const canonicalPath =
    section === 'overview'
      ? `/shikaku/${qualification.slug}/`
      : section === 'annual'
        ? `/shikaku/${qualification.slug}/${year}/`
        : `/shikaku/${qualification.slug}/${section}/`;
  return renderPublicDocument({
    title: `${qualification.officialNameJa} | 公式情報`,
    description: `${qualification.officialNameJa}の公式確認済み試験情報を整理して掲載します。`,
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
            { label: pageTitle ?? sectionConfig[section].title },
          ],
    subnav: renderQualificationSubnav(
      qualification.slug,
      section,
      navigationYear,
    ),
    canonicalPath,
    body,
  });
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
    .map(
      (item) =>
        `<article class="card directory-card"><div class="card__body"><div class="tag-row"><span class="tag">${escapeHtml(fieldLabel(item.field))}</span><span class="tag">${escapeHtml(categoryLabel(item.category))}</span></div><h2><a href="/shikaku/${escapeHtml(item.slug)}/">${escapeHtml(item.officialNameJa)}</a></h2><p class="directory-card__aliases">${item.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を整理して掲載します。'}</p>${renderBadge(statusLabels[item.status], item.status === 'verified' ? 'verified' : 'warning')}<nav class="directory-card__links" aria-label="${escapeHtml(item.officialNameJa)}のページ"><a href="/shikaku/${escapeHtml(item.slug)}/2026/">日程</a><a href="/shikaku/${escapeHtml(item.slug)}/application/">申込み・条件</a><a href="/shikaku/${escapeHtml(item.slug)}/exam-content/">試験内容</a><a href="/shikaku/${escapeHtml(item.slug)}/pass-rate/">合格率</a></nav><div class="card-actions">${renderButtonLink({ href: `/shikaku/${escapeHtml(item.slug)}/`, label: '概要を見る', variant: 'secondary' })}</div></div></article>`,
    )
    .join('');
  const searchHeading = trimmedQuery ? '検索結果' : '資格一覧';
  const searchDescription = trimmedQuery
    ? `「${escapeHtml(trimmedQuery)}」に一致する資格`
    : '全資格';
  const searchForm = `<form class="qualification-search" role="search" action="/shikaku/" method="get"><div class="field"><label for="qualification-search">資格名・略称・別名で検索</label><div class="search-control">${renderIcon('search')}<input id="qualification-search" name="q" type="search" value="${escapeHtml(query)}" placeholder="例: 宅建、ITパス、FE、簿記、FP" autocomplete="off"></div><p class="field__help">正式名称、略称、別名、英字略称で探せます。</p></div><div class="qualification-search__actions"><button class="button button--primary" type="submit">${renderIcon('search')}<span>検索</span></button>${trimmedQuery ? renderButtonLink({ href: '/shikaku/', label: 'クリア', variant: 'secondary', icon: 'close' }) : ''}</div></form>`;
  const results = items.length
    ? `<div class="directory">${cards}</div>`
    : renderFeedbackState({
        kind: 'empty',
        title: '一致する資格が見つかりません',
        body: '正式名称、略称、英字略称、または別名で検索してください。未掲載の資格は今後追加予定です。',
        actions: renderButtonLink({
          href: '/shikaku/',
          label: 'すべての資格を見る',
          variant: 'secondary',
        }),
      });
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">公式情報を資格別に整理</p><h1>資格を探す</h1><p>試験の公式情報、申込み条件、試験内容を資格ごとに確認できます。未確認の動的事実は表示していません。</p></header>${searchForm}<section class="directory-overview" aria-label="掲載状況"><div><p class="directory-overview__value">${items.length}</p><p>${trimmedQuery ? '検索結果' : '掲載資格'}</p></div><div><p class="directory-overview__value">${verifiedCount}</p><p>公式確認済み</p></div><div class="directory-overview__fields"><p class="meta">分野</p><div class="tag-row">${fieldTags || '<span class="tag">該当なし</span>'}</div></div></section><section class="page-section" aria-labelledby="directory-heading"><div class="section-heading"><div><p class="eyebrow">${searchDescription}</p><h2 id="directory-heading">${searchHeading}</h2></div><p class="meta">${items.length}件</p></div>${results}</section></div>`;
  return renderPublicDocument({
    title: '資格を探す | 公式情報',
    description: '日本の資格試験情報を資格別に確認できます。',
    currentNav: 'qualifications',
    canonicalPath: '/shikaku/',
    noindex: Boolean(trimmedQuery),
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '資格を探す' }],
    body,
  });
}

export function renderSchedulePage(
  events: PublicCalendarEvent[],
  query: { year?: string; qualification?: string } = {},
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
  const options = {
    year: query.year ?? '',
    qualification: query.qualification ?? '',
  };
  const filters = `<form class="schedule-filter" action="/schedule/" method="get"><div class="field"><label for="schedule-year">年度</label><select id="schedule-year" name="year"><option value="">すべて</option>${years.map((year) => `<option value="${year}"${String(year) === options.year ? ' selected' : ''}>${year}年</option>`).join('')}</select></div><div class="field"><label for="schedule-qualification">資格</label><select id="schedule-qualification" name="qualification"><option value="">すべて</option>${qualifications.map((qualification) => `<option value="${escapeHtml(qualification.slug)}"${qualification.slug === options.qualification ? ' selected' : ''}>${escapeHtml(qualification.officialNameJa)}</option>`).join('')}</select></div><div class="schedule-filter__actions"><button class="button button--primary" type="submit">${renderIcon('calendar')}<span>絞り込む</span></button>${options.year || options.qualification ? renderButtonLink({ href: '/schedule/', label: 'クリア', variant: 'secondary', icon: 'close' }) : ''}</div></form>`;
  const eventCards = events
    .map((event) => {
      const dimensions = [
        event.providerId,
        event.examLevelId,
        event.examComponent,
        event.deliveryMode,
      ]
        .filter(Boolean)
        .map(
          (value) =>
            `<span class="dimension">${escapeHtml(dimensionLabel(String(value)))}</span>`,
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
      return `<article class="schedule-event"><time datetime="${escapeHtml(event.dateValue ?? '')}">${escapeHtml(formatCalendarDate(event.dateValue))}</time><div><div class="schedule-event__heading"><span class="schedule-event__type">${escapeHtml(eventTone[event.type])}</span><h2><a href="/shikaku/${escapeHtml(event.qualification.slug)}/${event.examYear}/">${escapeHtml(event.qualification.officialNameJa)}</a></h2></div><p class="schedule-event__value">${escapeHtml(event.displayValue)}</p>${dimensions ? `<div class="dimensions">${dimensions}</div>` : ''}<p class="meta">${event.examYear}年 / ${escapeHtml(event.label)} / 公式確認: ${escapeHtml(formatVerifiedAt(event.verifiedAt))} / ${source}</p>${eventIcs ? `<div class="schedule-event__actions">${eventIcs}</div>` : ''}</div></article>`;
    })
    .join('');
  const annualIcs =
    options.year &&
    options.qualification &&
    events.some((event) => event.dateValue)
      ? `<div class="schedule-download">${renderButtonLink({ href: `/ics/${options.qualification}/${options.year}.ics`, label: `${options.year}年のICSをまとめてダウンロード`, variant: 'secondary', icon: 'calendar' })}</div>`
      : '';
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">承認済み公式事実から集約</p><h1>試験日程</h1><p>申込開始、申込締切、試験日、合格発表を資格横断で確認できます。公式確認済みの事実だけを表示し、未確認日程は補完しません。</p></header>${filters}${annualIcs}<section class="page-section" aria-labelledby="schedule-heading"><div class="section-heading"><div><p class="eyebrow">重要日程</p><h2 id="schedule-heading">日程一覧</h2></div><p class="meta">${events.length}件</p></div>${events.length ? `<div class="schedule-list">${eventCards}</div>` : renderFeedbackState({ kind: 'empty', title: '表示できる公式日程はまだありません', body: '承認済みの申込日、試験日、合格発表日が登録されるとここに表示します。未確認の日付は掲載しません。', actions: renderButtonLink({ href: '/shikaku/', label: '資格一覧を見る', variant: 'secondary' }) })}</section></div>`;
  return renderPublicDocument({
    title: '試験日程 | 公式情報',
    description: '公式確認済みの資格試験日程を一覧できます。',
    currentNav: 'schedule',
    canonicalPath: '/schedule/',
    noindex: Boolean(options.year || options.qualification),
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '試験日程' }],
    body,
  });
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
  const form = `<form class="compare-selector" action="/compare/" method="get"><fieldset><legend>比較する資格を選択</legend><div class="compare-choices">${choices}</div><p class="field__help">2〜3件を選択してください。4件以上選んだ場合は先頭3件で比較します。</p></fieldset><button class="button button--primary" type="submit">${renderIcon('compare')}<span>比較する</span></button></form><script>document.currentScript.previousElementSibling.addEventListener('submit',function(event){var selected=[...this.querySelectorAll('input[name=qualification]:checked')].map(function(input){return input.value});this.querySelectorAll('input[name=qualification]').forEach(function(input){input.disabled=true});var hidden=document.createElement('input');hidden.type='hidden';hidden.name='qualifications';hidden.value=selected.join(',');this.appendChild(hidden);});</script>`;
  const headerCells = comparison.qualifications
    .map(
      (qualification) =>
        `<th scope="col"><a href="/shikaku/${escapeHtml(qualification.slug)}/">${escapeHtml(qualification.officialNameJa)}</a></th>`,
    )
    .join('');
  const rows = comparison.rows
    .map((row) => {
      const cells = comparison.qualifications
        .map((qualification) => {
          const cell = row.cells[qualification.slug];
          if (!cell?.value)
            return `<td><span class="compare-empty">${escapeHtml(cell?.missingReason ? (missingReasonLabels[cell.missingReason] ?? '掲載情報なし') : '掲載情報なし')}</span></td>`;
          const source = cell.sourceUrl
            ? `<a href="${escapeHtml(cell.sourceUrl)}" target="_blank" rel="noreferrer">出典</a>`
            : '';
          return `<td><p>${escapeHtml(cell.value)}</p><span class="meta">${cell.examYear}年${source ? ` / ${source}` : ''}</span></td>`;
        })
        .join('');
      return `<tr><th scope="row">${escapeHtml(row.label)}</th>${cells}</tr>`;
    })
    .join('');
  const table =
    selectedCount >= 2
      ? `<div class="compare-table-wrap"><table class="compare-table"><thead><tr><th scope="col">比較項目</th>${headerCells}</tr></thead><tbody>${rows}</tbody></table></div>`
      : renderFeedbackState({
          kind: 'empty',
          title: '比較する資格を2件以上選択してください',
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
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">承認済み公式事実を横断比較</p><h1>資格比較</h1><p>複数の資格を同じ項目で比較できます。表示する値は公式確認済みの事実に限定し、未確認の項目は空欄として扱います。</p></header>${form}<section class="page-section" aria-labelledby="compare-heading"><div class="section-heading"><div><p class="eyebrow">${selectedCount}件選択中</p><h2 id="compare-heading">比較表</h2></div></div>${table}</section><section class="page-section editorial-related" aria-labelledby="comparison-guides-heading"><h2 id="comparison-guides-heading">比較ガイド</h2><div>${guides}</div></section></div>`;
  return renderPublicDocument({
    title: '資格比較 | 公式情報',
    description: '公式確認済みの資格試験情報を横並びで比較できます。',
    currentNav: 'compare',
    canonicalPath: '/compare/',
    noindex: selectedCount > 0,
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: '資格比較' }],
    body,
  });
}

export function renderEditorialPage(
  page: EditorialPage,
  kind: 'guide' | 'comparison',
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
  const label = kind === 'comparison' ? '資格比較' : 'ガイド';
  return renderPublicDocument({
    title: `${page.title} | 公式情報`,
    description: page.description,
    currentNav: kind === 'comparison' ? 'compare' : 'qualifications',
    breadcrumbs: [
      { label: 'ホーム', href: '/' },
      { label, href: kind === 'comparison' ? '/compare/' : '/guide/' },
      { label: page.title },
    ],
    canonicalPath,
    body,
  });
}

export function renderGuideIndex(
  entries: readonly { slug: string; page: EditorialPage }[],
): string {
  const cards = entries
    .map(
      ({ slug, page }) =>
        `<article class="card editorial-card"><div class="card__body"><p class="eyebrow">${escapeHtml(page.eyebrow)}</p><h2><a href="/guide/${escapeHtml(slug)}/">${escapeHtml(page.title)}</a></h2><p>${escapeHtml(page.description)}</p><div class="card-actions">${renderButtonLink({ href: `/guide/${slug}/`, label: 'ガイドを読む', variant: 'secondary' })}</div></div></article>`,
    )
    .join('');
  const body = `<div class="container editorial-container"><header class="page-heading editorial-heading"><p class="eyebrow">受験準備とデータの見方</p><h1>資格試験ガイド</h1><p>資格試験の情報を確認し、申込みや学習の計画を立てるための基本的な考え方を整理します。日付・費用・制度は、各資格の公式情報ページで確認してください。</p></header><section class="page-section" aria-labelledby="guide-list-heading"><div class="section-heading"><div><p class="eyebrow">ガイド一覧</p><h2 id="guide-list-heading">確認のための基礎知識</h2></div></div><div class="editorial-grid">${cards}</div></section></div>`;
  return renderPublicDocument({
    title: '資格試験ガイド | 公式情報',
    description:
      '資格試験の情報確認、年間計画、申込み、合格率データの見方を整理します。',
    currentNav: 'qualifications',
    canonicalPath: '/guide/',
    breadcrumbs: [{ label: 'ホーム', href: '/' }, { label: 'ガイド' }],
    body,
  });
}

export function renderUpdatesPage(
  events: PublicUpdateEvent[],
  filtered = false,
): string {
  const cards = events
    .map((event) => {
      const diff = event.previousValue
        ? `<div class="update-diff"><p><span>変更前</span>${escapeHtml(event.previousValue)}</p><p><span>変更後</span>${escapeHtml(event.newValue)}</p></div>`
        : `<div class="update-diff"><p><span>公開値</span>${escapeHtml(event.newValue)}</p></div>`;
      const affectedPages = event.affectedPages.length
        ? event.affectedPages
            .map((page) => `<span class="tag">${escapeHtml(page)}</span>`)
            .join('')
        : '<span class="tag">該当ページ未指定</span>';
      const source = event.sourceUrl
        ? `<a href="${escapeHtml(event.sourceUrl)}" target="_blank" rel="noreferrer">公式ソース</a>`
        : '<span>公式ソース未指定</span>';
      return `<article class="update-card"><div class="update-card__header"><div><p class="eyebrow">${escapeHtml(event.eventLabel)}</p><h2><a href="/shikaku/${escapeHtml(event.qualification.slug)}/${event.examYear}/">${escapeHtml(event.qualification.officialNameJa)} · ${escapeHtml(event.factLabel)}</a></h2></div><time datetime="${escapeHtml(event.createdAt)}">${escapeHtml(formatVerifiedAt(event.createdAt))}</time></div>${diff}<div class="tag-row">${affectedPages}</div><p class="meta">${event.examYear}年 / 公式確認: ${escapeHtml(formatVerifiedAt(event.verifiedAt))} / ${source}</p></article>`;
    })
    .join('');
  const body = `<div class="container"><header class="page-heading"><p class="eyebrow">公式事実の変更・訂正</p><h1>更新情報</h1><p>承認済みの公式事実に変更や訂正があった場合に、変更前後の値、対象資格、影響ページ、公式ソースを記録します。単なるページ確認やデザイン変更は掲載しません。</p></header><section class="page-section" aria-labelledby="updates-heading"><div class="section-heading"><div><p class="eyebrow">変更ログ</p><h2 id="updates-heading">公式情報の変更・訂正</h2></div><p class="meta">${events.length}件</p></div>${events.length ? `<div class="updates-list">${cards}</div>` : renderFeedbackState({ kind: 'empty', title: '公開できる更新情報はまだありません', body: '公式事実の変更・訂正が承認されるとここに表示します。ページ確認だけでは更新情報を作成しません。', actions: renderButtonLink({ href: '/shikaku/', label: '資格一覧を見る', variant: 'secondary' }) })}</section></div>`;
  return renderPublicDocument({
    title: '更新情報 | 公式情報',
    description: '公式確認済み資格情報の変更と訂正記録を確認できます。',
    currentNav: 'updates',
    canonicalPath: '/updates/',
    noindex: filtered,
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

export function renderHomePage(): string {
  const launchSlugs = new Set([
    'takken',
    'gyoseishoshi',
    'it-passport',
    'fundamental-it-engineer',
    'bookkeeping',
    'fp',
  ]);
  const qualificationCards = launchQualifications
    .filter((qualification) => launchSlugs.has(qualification.slug))
    .map(
      (qualification) =>
        `<article class="home-qualification"><div class="home-qualification__top"><span class="tag home-qualification__field">${renderIcon('document')}${escapeHtml(fieldLabel(qualification.field))}</span><span class="home-qualification__arrow" aria-hidden="true">${renderIcon('external')}</span></div><h3><a href="/shikaku/${escapeHtml(qualification.slug)}/">${escapeHtml(qualification.officialNameJa)}</a></h3><p>${qualification.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を資格別に整理します。'}</p><a class="text-link" href="/shikaku/${escapeHtml(qualification.slug)}/">資格の情報を見る<span aria-hidden="true"> →</span></a></article>`,
    )
    .join('');
  const scheduleState = `<div class="home-schedule-entry"><div class="home-schedule-entry__icon">${renderIcon('calendar')}</div><div><h3>公式確認済みの日程を一覧で確認</h3><p>申込開始・締切、試験日、合格発表を資格横断で探せます。日付が未確認の予定は掲載しません。</p></div>${renderButtonLink({ href: '/schedule/', label: '試験日程を見る', variant: 'secondary', icon: 'calendar' })}</div>`;
  const body = `<div class="container"><section class="home-hero"><div class="home-hero__visual" aria-hidden="true"></div><div class="home-hero__main"><p class="eyebrow home-hero__eyebrow">${renderIcon('document')}資格試験を、公式情報から考える</p><h1>資格試験の公式情報を、<br>わかりやすく整理。</h1><p class="home-hero__lead">試験日、申込み条件、試験内容を、確認済みの公式情報に基づいて掲載します。</p><form class="home-search" role="search" action="/shikaku/" method="get"><label for="home-search-input">資格名から探す</label><div class="home-search__row"><div class="search-control">${renderIcon('search')}<input id="home-search-input" name="q" type="search" placeholder="例：宅建、ITパス、簿記" autocomplete="off"></div><button class="button button--primary" type="submit">検索する<span aria-hidden="true"> →</span></button></div></form><div class="home-intro__actions">${renderButtonLink({ href: '/schedule/', label: '試験日程を見る', variant: 'secondary', icon: 'calendar' })}<a class="home-all-link" href="/shikaku/">資格一覧を見る<span aria-hidden="true"> →</span></a></div><div class="popular-links" aria-label="主な資格"><span>主な資格</span><a href="/shikaku/takken/">宅建</a><a href="/shikaku/it-passport/">ITパスポート</a><a href="/shikaku/bookkeeping/">日商簿記</a><a href="/shikaku/fp/">FP技能検定</a></div></div><aside class="trust-panel" aria-label="情報の信頼性"><p class="eyebrow">このサイトの読み方</p><h2>確認できた事実を、<br>確かめながら読む。</h2><ol class="trust-steps"><li><span>01</span><div><strong>公式情報を確認</strong><p>試験実施機関の発表をもとに整理します。</p></div></li><li><span>02</span><div><strong>年度と確認日を表示</strong><p>いつの情報かを事実ごとに明示します。</p></div></li><li><span>03</span><div><strong>出典までたどれる</strong><p>公式ソースと変更履歴を確認できます。</p></div></li></ol></aside></section><section class="page-section home-section" aria-labelledby="schedule-heading"><div class="section-heading"><div><p class="eyebrow">試験日程</p><h2 id="schedule-heading">申込みから合格発表まで</h2></div><a href="/schedule/">日程一覧へ<span aria-hidden="true"> →</span></a></div>${scheduleState}</section><section class="page-section home-section" aria-labelledby="qualifications-heading"><div class="section-heading"><div><p class="eyebrow">掲載資格</p><h2 id="qualifications-heading">資格から情報を探す</h2></div><a href="/shikaku/">すべての資格を見る<span aria-hidden="true"> →</span></a></div><div class="home-qualifications">${qualificationCards}</div></section><section class="page-section home-section" aria-labelledby="tools-heading"><div class="section-heading"><div><p class="eyebrow">便利な入口</p><h2 id="tools-heading">目的から探す</h2></div></div><div class="tool-grid"><article class="tool-card">${renderIcon('calendar')}<h3><a href="/schedule/">試験日程</a></h3><p>資格ごとの申込・試験・合格発表を確認。</p><span class="tool-card__link">日程を調べる →</span></article><article class="tool-card">${renderIcon('compare')}<h3><a href="/compare/">資格比較</a></h3><p>条件や試験方式を同じ項目で比較。</p><span class="tool-card__link">資格を比較する →</span></article><article class="tool-card">${renderIcon('update')}<h3><a href="/updates/">更新情報</a></h3><p>公式発表による変更と訂正を確認。</p><span class="tool-card__link">変更を見る →</span></article></div></section><section class="page-section trust-summary"><div><p class="eyebrow">データの信頼性</p><h2>推測値で空欄を埋めません</h2><p>公式発表前の日付、料金、制度情報は掲載せず、確認できた情報だけを出典とともに表示します。</p></div><div class="trust-summary__points"><p>${renderIcon('document')}<span>登録済みの公式情報源</span></p><p>${renderIcon('clock')}<span>公式情報確認日を明記</span></p><p>${renderIcon('update')}<span>変更・訂正を履歴化</span></p></div></section></div>`;
  return renderPublicDocument({
    title: '資格試験の公式情報',
    description:
      '日本の資格試験に関する公式確認済み情報を、わかりやすく整理して掲載します。',
    currentNav: 'home',
    canonicalPath: '/',
    body,
  });
}

export function renderNotFoundPage(): string {
  return renderPublicDocument({
    title: 'ページが見つかりません',
    noindex: true,
    body: `<div class="container reading-width"><header class="page-heading"><p class="eyebrow">404</p><h1>ページが見つかりません</h1></header>${renderFeedbackState(
      {
        kind: 'empty',
        title: '指定されたページを確認できませんでした',
        body: 'URLが変更されたか、ページがまだ公開されていない可能性があります。',
        actions: renderButtonLink({
          href: '/shikaku/',
          label: '資格一覧を見る',
          variant: 'secondary',
        }),
      },
    )}</div>`,
  });
}
