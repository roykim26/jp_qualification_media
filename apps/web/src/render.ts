import type {
  PublicFact,
  Qualification,
} from '../../../packages/schema/src/index.js';

export type PublicQualificationView = {
  qualification: Qualification;
  status: 'verified' | 'awaiting_official';
  facts: PublicFact[];
  officialVerifiedAt: string | null;
};

export type QualificationSection = 'overview' | 'application' | 'exam-content';

export type QualificationDirectoryItem = Qualification & {
  status: PublicQualificationView['status'];
};

const statusLabels = {
  verified: '公式確認済み',
  awaiting_official: '公式発表待ち',
} as const;

const sectionConfig: Record<
  Exclude<QualificationSection, 'overview'>,
  { title: string; intro: string; factKeys: string[] }
> = {
  application: {
    title: '申込み・受験資格',
    intro:
      '公式の申込みルール、申請方法、受験資格を整理します。未確認の申込期限は推測・補完しません。',
    factKeys: ['application_rule', 'application_deadline', 'eligibility'],
  },
  'exam-content': {
    title: '試験内容',
    intro:
      '公式の試験方式、出題範囲、試験内容を整理します。公式確認のない情報は表示しません。',
    factKeys: [
      'exam_method',
      'exam_content',
      'exam_subjects',
      'passing_standard',
      'exam_time',
      'question_format',
      'question_count',
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

function renderFact(fact: PublicFact): string {
  const dimensions = [
    fact.providerId,
    fact.examLevelId,
    fact.examComponent,
    fact.deliveryMode,
  ]
    .filter(Boolean)
    .map(
      (value) => `<span class="dimension">${escapeHtml(String(value))}</span>`,
    )
    .join(' ');
  const source = fact.sourceUrl
    ? `<details><summary>公式ソースを確認</summary><p><a href="${escapeHtml(fact.sourceUrl)}" target="_blank" rel="noreferrer">${escapeHtml(fact.sourceUrl)}</a></p><p>スナップショット: ${escapeHtml(fact.sourceSnapshotId)}</p><p>確認日: ${escapeHtml(formatVerifiedAt(fact.verifiedAt))}</p></details>`
    : `<details><summary>出典情報</summary><p>ソース ID: ${escapeHtml(fact.sourceId)}</p><p>スナップショット: ${escapeHtml(fact.sourceSnapshotId)}</p><p>確認日: ${escapeHtml(formatVerifiedAt(fact.verifiedAt))}</p></details>`;
  return `<article class="fact"><h3>${escapeHtml(fact.factKey)}</h3>${dimensions ? `<p>${dimensions}</p>` : ''}<p class="fact-value">${escapeHtml(fact.displayValue)}</p>${source}</article>`;
}

function renderSourceModule(slug: string): string {
  const sources = (officialSourcesBySlug[slug] ?? [])
    .map(
      (source) =>
        `<li><a href="${source.url}" target="_blank" rel="noreferrer">${source.name}</a><span>${source.scope}</span></li>`,
    )
    .join('');
  return `<section class="source-module"><h2>公式ソースと更新について</h2><p>このページの動的事実は、登録済みの公式ソースを保存・解析し、必要な確認を終えたものだけを表示します。公式発表前の日付・料金・制度情報は掲載しません。</p><ul>${sources}</ul><details><summary>情報ステータスの見方</summary><p><b>公式確認済み</b>：公開可能な公式スナップショットに紐づく承認済み事実があります。</p><p><b>公式発表待ち</b>：現時点で公開可能な非 synthetic 事実がありません。前年度情報や推測値で補完していません。</p></details><details><summary>更新・訂正について</summary><p>公式ページの変更は、スナップショット比較と審査を経て反映します。誤りを見つけた場合は、対象ページ、該当項目、根拠となる公式 URL を添えて運営者へ連絡してください。</p></details></section>`;
}

export function renderQualificationPage(view: PublicQualificationView): string {
  return renderQualificationSectionPage(view, 'overview');
}

export function renderQualificationSectionPage(
  view: PublicQualificationView,
  section: QualificationSection,
): string {
  const { qualification } = view;
  const sectionMeta = section === 'overview' ? null : sectionConfig[section];
  const factsForPage = sectionMeta
    ? view.facts.filter((fact) => sectionMeta.factKeys.includes(fact.factKey))
    : view.facts;
  const facts = factsForPage.length
    ? `<section><h2>公式確認済み情報</h2><div class="facts">${factsForPage.map(renderFact).join('')}</div></section>`
    : `<section class="empty-state"><p class="status">公式発表待ち</p><h2>${sectionMeta ? `${sectionMeta.title}の公式情報は未確認です` : '現在、公開できる公式情報はありません'}</h2><p>${sectionMeta?.intro ?? 'ITパスポート試験の動的情報は、公式発表を確認し、必要な審査を完了した後に掲載します。未確認の日付や費用は表示しません。'}</p></section>`;
  const basePath = `/shikaku/${qualification.slug}`;
  const subnav = `<nav class="subnav"><a href="${basePath}/">概要</a><a href="${basePath}/application/">申込み・条件</a><a href="${basePath}/exam-content/">試験内容</a></nav>`;
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(qualification.officialNameJa)} | 公式情報</title>
<style>
:root{font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;color:#172033;background:#f6f8fb}body{margin:0}.wrap{max-width:960px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center}.brand{font-weight:700;color:#2457a6;text-decoration:none}.hero,.fact,.empty-state,.source-module{background:#fff;border:1px solid #dce3ed;border-radius:14px;padding:24px;box-shadow:0 4px 16px #1720330b}.hero{margin-top:24px}.eyebrow{color:#65738a;font-size:.9rem}.status{display:inline-block;border-radius:999px;background:#fff3cd;color:#805b00;padding:6px 12px;font-weight:700}.subnav{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}.facts{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:16px}.fact{padding:18px}.fact h3{font-size:1rem;color:#51627b}.fact-value{font-size:1.25rem;font-weight:700}.empty-state,.source-module{margin-top:20px}.empty-state{border-left:5px solid #d99a00}.source-module ul{padding-left:1.2rem}.source-module li{margin:.8rem 0}.source-module li span{display:block;color:#65738a;font-size:.9rem}details{margin-top:14px;color:#51627b}summary{cursor:pointer;font-weight:600}a{color:#2457a6}footer{margin-top:32px;color:#65738a;font-size:.9rem}@media(max-width:600px){.wrap{padding:16px}.hero,.fact,.empty-state,.source-module{padding:18px}}
</style></head><body><main class="wrap"><nav class="top"><a class="brand" href="/">資格試験の公式情報</a><a href="/shikaku/">資格を探す</a></nav><header class="hero"><p class="eyebrow">${escapeHtml(qualification.field)} / ${escapeHtml(qualification.category)}</p><h1>${escapeHtml(qualification.officialNameJa)}</h1>${sectionMeta ? `<p>${escapeHtml(sectionMeta.title)}</p>` : ''}<p>${qualification.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を整理して掲載します。'}</p><p class="status">${statusLabels[view.status]}</p><p>公式情報確認日: ${escapeHtml(formatVerifiedAt(view.officialVerifiedAt))}</p></header>${subnav}${facts}${renderSourceModule(qualification.slug)}<footer>動的事実は、承認済みで公式スナップショットに紐づく内容のみ表示します。日付、費用、制度情報は試験実施機関の最新発表をご確認ください。</footer></main></body></html>`;
}

export function renderQualificationDirectory(
  items: QualificationDirectoryItem[],
): string {
  const cards = items
    .map(
      (item) =>
        `<article class="directory-card"><p class="eyebrow">${escapeHtml(item.field)} / ${escapeHtml(item.category)}</p><h2><a href="/shikaku/${escapeHtml(item.slug)}/">${escapeHtml(item.officialNameJa)}</a></h2><p>${item.aliasesJa.map(escapeHtml).join(' / ') || '公式情報を整理して掲載します。'}</p><p class="status">${statusLabels[item.status]}</p><a href="/shikaku/${escapeHtml(item.slug)}/application/">申込み・条件</a> · <a href="/shikaku/${escapeHtml(item.slug)}/exam-content/">試験内容</a></article>`,
    )
    .join('');
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>資格を探す | 公式情報</title><style>:root{font-family:system-ui,-apple-system,"Hiragino Kaku Gothic ProN",sans-serif;color:#172033;background:#f6f8fb}body{margin:0}.wrap{max-width:960px;margin:auto;padding:24px}.top{display:flex;justify-content:space-between;gap:16px}.brand,a{color:#2457a6;text-decoration:none}.brand{font-weight:700}.hero,.directory-card{background:#fff;border:1px solid #dce3ed;border-radius:14px;padding:24px;box-shadow:0 4px 16px #1720330b}.hero{margin-top:24px}.directory{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px;margin-top:20px}.directory-card{padding:20px}.eyebrow{color:#65738a;font-size:.9rem}.status{display:inline-block;border-radius:999px;background:#fff3cd;color:#805b00;padding:6px 12px;font-weight:700}</style></head><body><main class="wrap"><nav class="top"><a class="brand" href="/">資格試験の公式情報</a><a href="/shikaku/">資格を探す</a></nav><header class="hero"><p class="eyebrow">公式情報を資格別に整理</p><h1>資格を探す</h1><p>試験の公式情報、申込み条件、試験内容を資格ごとに確認できます。未確認の動的事実は表示していません。</p></header><section class="directory">${cards}</section></main></body></html>`;
}

export function renderErrorPage(): string {
  return '<!doctype html><meta charset="utf-8"><title>一時的に表示できません</title><main style="max-width:640px;margin:4rem auto;font-family:system-ui;padding:1rem"><h1>情報を取得できませんでした</h1><p>公式情報 API に接続できないため、未確認の内容は表示していません。しばらくしてから再度お試しください。</p></main>';
}
