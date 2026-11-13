import {
  escapeHtml,
  renderIcon,
  uiStyles,
} from '../../../packages/ui/src/index.js';
import { unofficialNotice } from './editorial.js';
import { webStyles } from './styles.js';

export type PublicNavKey =
  | 'home'
  | 'qualifications'
  | 'schedule'
  | 'compare'
  | 'guide'
  | 'data'
  | 'about'
  | 'updates';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

export type DocumentInput = {
  title: string;
  body: string;
  currentNav?: PublicNavKey;
  breadcrumbs?: BreadcrumbItem[];
  subnav?: string;
  description?: string;
  canonicalPath?: string;
  noindex?: boolean;
};

function canonicalHref(path: string): string {
  const configured = process.env.SITE_ORIGIN?.trim();
  if (!configured) return path;
  try {
    const origin = new URL(configured);
    if (!['http:', 'https:'].includes(origin.protocol)) return path;
    return `${origin.origin}${path}`;
  } catch {
    return path;
  }
}

const siteName = '資格試験の公式情報';

function searchConsoleVerification(): string {
  const token = process.env.GOOGLE_SITE_VERIFICATION?.trim();
  if (!token || !/^[A-Za-z0-9_-]{10,100}$/.test(token)) return '';
  return `<meta name="google-site-verification" content="${escapeHtml(token)}">`;
}

function analyticsSnippet(): string {
  const measurementId = process.env.GA_MEASUREMENT_ID?.trim();
  if (!measurementId || !/^G-[A-Z0-9]{4,20}$/i.test(measurementId)) return '';
  const id = escapeHtml(measurementId);
  return `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${id}');</script>`;
}

function renderOpenGraph(input: DocumentInput, pageUrl?: string): string {
  const tags = [
    `<meta property="og:type" content="${input.currentNav === 'home' ? 'website' : 'article'}">`,
    `<meta property="og:site_name" content="${escapeHtml(siteName)}">`,
    `<meta property="og:title" content="${escapeHtml(input.title)}">`,
    `<meta property="og:locale" content="ja_JP">`,
    input.description
      ? `<meta property="og:description" content="${escapeHtml(input.description)}">`
      : '',
    pageUrl ? `<meta property="og:url" content="${escapeHtml(pageUrl)}">` : '',
    `<meta property="og:image" content="${escapeHtml(canonicalHref('/images/og-brand.png'))}">`,
    '<meta property="og:image:width" content="1200">',
    '<meta property="og:image:height" content="630">',
    '<meta name="twitter:card" content="summary_large_image">',
    `<meta name="twitter:image" content="${escapeHtml(canonicalHref('/images/og-brand.png'))}">`,
    `<meta name="twitter:title" content="${escapeHtml(input.title)}">`,
    input.description
      ? `<meta name="twitter:description" content="${escapeHtml(input.description)}">`
      : '',
  ];
  return tags.filter(Boolean).join('');
}

function renderStructuredData(input: DocumentInput, pageUrl?: string): string {
  const siteUrl = canonicalHref('/');
  const website = {
    '@type': 'WebSite',
    name: siteName,
    url: siteUrl,
    inLanguage: 'ja',
  };
  const graph: Record<string, unknown>[] = [];
  if (input.currentNav === 'home') graph.push(website);
  if (pageUrl) {
    graph.push({
      '@type': 'WebPage',
      name: input.title,
      ...(input.description ? { description: input.description } : {}),
      url: pageUrl,
      inLanguage: 'ja',
      isPartOf: website,
    });
  }
  if (input.breadcrumbs?.length) {
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: input.breadcrumbs.map((item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.label,
        ...(item.href ? { item: canonicalHref(item.href) } : {}),
      })),
    });
  }
  if (!graph.length) return '';
  const json = JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': graph,
  }).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

const publicNav = [
  { key: 'qualifications' as const, label: '資格を探す', href: '/shikaku/' },
  { key: 'schedule' as const, label: '試験日程', href: '/schedule/' },
  { key: 'compare' as const, label: '比較する', href: '/compare/' },
  { key: 'guide' as const, label: 'ガイド', href: '/guide/' },
  { key: 'updates' as const, label: '更新情報', href: '/updates/' },
];

function renderNavItem(
  item: (typeof publicNav)[number],
  currentNav: PublicNavKey,
): string {
  const current = item.key === currentNav ? ' aria-current="page"' : '';
  return `<a class="nav-link" href="${item.href}"${current}>${escapeHtml(item.label)}</a>`;
}

function renderHeader(currentNav: PublicNavKey): string {
  const links = publicNav
    .map((item) => renderNavItem(item, currentNav))
    .join('');
  return `<header class="site-header"><div class="container site-header__inner"><a class="brand" href="/"${currentNav === 'home' ? ' aria-current="page"' : ''}><img class="brand__mark" src="/images/brand-mark.png" alt="" width="40" height="40"><span class="brand__text">資格試験の公式情報<small>公式発表を、探しやすく。</small></span></a><nav class="desktop-nav" aria-label="メインナビゲーション">${links}<a class="nav-link nav-link--search" href="/shikaku/" aria-label="資格を検索">${renderIcon('search')}<span>検索</span></a></nav><a class="mobile-search" href="/shikaku/" aria-label="資格を検索">${renderIcon('search')}</a><details class="mobile-menu"><summary aria-label="メニューを開く">${renderIcon('menu')}</summary><nav class="mobile-menu__panel" aria-label="モバイルメニュー">${links}</nav></details></div></header>`;
}

function renderBreadcrumbs(items: BreadcrumbItem[]): string {
  if (!items.length) return '';
  const content = items
    .map((item, index) => {
      const last = index === items.length - 1;
      if (item.href && !last)
        return `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a></li>`;
      return `<li aria-current="page">${escapeHtml(item.label)}</li>`;
    })
    .join('');
  return `<nav class="breadcrumbs" aria-label="パンくずリスト"><ol>${content}</ol></nav>`;
}

function renderFooter(): string {
  return `<footer class="site-footer"><div class="container"><div class="footer-brand"><img src="/images/brand-mark.png" alt="" width="40" height="40"><span class="footer-brand__text">${escapeHtml(siteName)}<small>公式発表を、探しやすく。</small></span></div><div class="footer-grid"><section class="footer-group"><h2>資格情報</h2><ul><li><a href="/shikaku/">資格を探す</a></li><li><a href="/schedule/">試験日程</a></li><li><a href="/guide/">資格試験ガイド</a></li></ul></section><section class="footer-group"><h2>データツール</h2><ul><li><a href="/compare/">資格比較</a></li><li><a href="/pass-rate/">合格率データ</a></li></ul></section><section class="footer-group"><h2>運営・方針</h2><ul><li><a href="/about/operator/">運営者情報</a></li><li><a href="/about/sources/">情報源について</a></li><li><a href="/about/editorial-policy/">編集方針・AI方針</a></li><li><a href="/about/ai-policy/">AI利用方針</a></li></ul></section><section class="footer-group"><h2>法務・連絡</h2><ul><li><a href="/about/privacy/">プライバシーポリシー</a></li><li><a href="/about/terms/">利用規約</a></li><li><a href="/about/advertising-policy/">広告・PR方針</a></li><li><a href="/about/contact/">お問い合わせ</a></li><li><a href="/about/corrections/">訂正のご連絡</a></li><li><a href="/updates/">更新情報</a></li></ul></section></div><p class="footer-note">動的事実は、承認済みで公式スナップショットに紐づく内容のみ表示します。日付、費用、制度情報は試験実施機関の最新発表をご確認ください。</p><p class="footer-note footer-note--unofficial">${escapeHtml(unofficialNotice)}</p></div></footer>`;
}

function renderMobileBottomNav(currentNav: PublicNavKey): string {
  const items = [
    {
      key: 'qualifications' as const,
      label: '探す',
      href: '/shikaku/',
      icon: 'search' as const,
    },
    {
      key: 'schedule' as const,
      label: '日程',
      href: '/schedule/',
      icon: 'calendar' as const,
    },
    {
      key: 'compare' as const,
      label: '比較',
      href: '/compare/',
      icon: 'compare' as const,
    },
    {
      key: 'updates' as const,
      label: '更新',
      href: '/updates/',
      icon: 'update' as const,
    },
  ];
  const links = items
    .map((item) => {
      const content = `${renderIcon(item.icon)}<span>${item.label}</span>`;
      if (!('href' in item))
        return `<span class="is-disabled" aria-disabled="true">${content}</span>`;
      // The home page's primary task is qualification discovery, so its
      // mobile navigation state belongs to the discovery destination.
      const isCurrent =
        item.key === currentNav ||
        (currentNav === 'home' && item.key === 'qualifications');
      return `<a href="${item.href}"${isCurrent ? ' aria-current="page"' : ''}>${content}</a>`;
    })
    .join('');
  return `<nav class="mobile-bottom-nav" aria-label="モバイル主要ナビゲーション">${links}</nav>`;
}

export function renderPublicDocument(input: DocumentInput): string {
  const currentNav = input.currentNav ?? 'home';
  const description = input.description
    ? `<meta name="description" content="${escapeHtml(input.description)}">`
    : '';
  const canonical = input.canonicalPath
    ? `<link rel="canonical" href="${escapeHtml(canonicalHref(input.canonicalPath))}">`
    : '';
  const robots = input.noindex
    ? '<meta name="robots" content="noindex,follow">'
    : '';
  const pageUrl = input.canonicalPath
    ? canonicalHref(input.canonicalPath)
    : undefined;
  const openGraph = renderOpenGraph(input, pageUrl);
  const structuredData = input.noindex
    ? ''
    : renderStructuredData(input, pageUrl);
  const verification = searchConsoleVerification();
  const analytics = analyticsSnippet();
  const breadcrumbs = input.breadcrumbs?.length
    ? `<div class="container">${renderBreadcrumbs(input.breadcrumbs)}</div>`
    : '';
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png"><link rel="apple-touch-icon" href="/images/apple-touch-icon.png">${description}${canonical}${robots}${openGraph}${structuredData}${verification}<title>${escapeHtml(input.title)}</title><style>${uiStyles}${webStyles}</style>${analytics}</head><body><a class="skip-link" href="#main-content">本文へ移動</a>${renderHeader(currentNav)}${input.subnav ?? ''}<main id="main-content" class="page-main">${breadcrumbs}${input.body}</main>${renderFooter()}${renderMobileBottomNav(currentNav)}</body></html>`;
}

export function renderQualificationSubnav(
  slug: string,
  current: 'overview' | 'annual' | 'application' | 'exam-content' | 'pass-rate',
  year = 2026,
): string {
  const basePath = `/shikaku/${escapeHtml(slug)}`;
  const items = [
    { key: 'overview', label: '概要', href: `${basePath}/` },
    { key: 'annual', label: '日程', href: `${basePath}/${year}/` },
    {
      key: 'application',
      label: '申込み・条件',
      href: `${basePath}/application/`,
    },
    {
      key: 'exam-content',
      label: '試験内容',
      href: `${basePath}/exam-content/`,
    },
    { key: 'pass-rate', label: '合格率', href: `${basePath}/pass-rate/` },
  ];
  const links = items
    .map(
      (item) =>
        `<a href="${item.href}"${item.key === current ? ' aria-current="page"' : ''}>${item.label}</a>`,
    )
    .join('');
  return `<nav class="subnav" aria-label="資格内ナビゲーション"><div class="container subnav__inner">${links}</div></nav>`;
}
