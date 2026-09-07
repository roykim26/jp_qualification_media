import { renderIcon, uiStyles } from '../../../packages/ui/src/index.js';
import { webStyles } from './styles.js';

export type PublicNavKey =
  'home' | 'qualifications' | 'schedule' | 'compare' | 'data' | 'updates';

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

const publicNav = [
  { key: 'qualifications' as const, label: '資格を探す', href: '/shikaku/' },
  { key: 'schedule' as const, label: '試験日程', href: '/schedule/' },
  { key: 'compare' as const, label: '比較する', href: '/compare/' },
  { key: 'data' as const, label: 'データを見る' },
  { key: 'updates' as const, label: '更新情報', href: '/updates/' },
];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderNavItem(
  item: (typeof publicNav)[number],
  currentNav: PublicNavKey,
): string {
  if (!('href' in item))
    return `<span class="nav-link is-disabled" aria-disabled="true">${escapeHtml(item.label)}</span>`;
  const current = item.key === currentNav ? ' aria-current="page"' : '';
  return `<a class="nav-link" href="${item.href}"${current}>${escapeHtml(item.label)}</a>`;
}

function renderHeader(currentNav: PublicNavKey): string {
  const links = publicNav
    .map((item) => renderNavItem(item, currentNav))
    .join('');
  return `<header class="site-header"><div class="container site-header__inner"><a class="brand" href="/"${currentNav === 'home' ? ' aria-current="page"' : ''}>資格試験の公式情報</a><nav class="desktop-nav" aria-label="メインナビゲーション">${links}<span class="nav-link is-disabled" aria-disabled="true">${renderIcon('search')}<span class="visually-hidden">検索</span></span></nav><details class="mobile-menu"><summary aria-label="メニューを開く">${renderIcon('menu')}</summary><nav class="mobile-menu__panel" aria-label="モバイルメニュー">${links}</nav></details></div></header>`;
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
  return `<footer class="site-footer"><div class="container"><div class="footer-grid"><section class="footer-group"><h2>資格情報</h2><ul><li><a href="/shikaku/">資格を探す</a></li><li><a href="/schedule/">試験日程</a></li></ul></section><section class="footer-group"><h2>データツール</h2><ul><li><a href="/compare/">資格比較</a></li><li><span class="is-disabled">合格率データ</span></li></ul></section><section class="footer-group"><h2>運営・方針</h2><ul><li><span class="is-disabled">情報源について</span></li><li><span class="is-disabled">編集方針・AI方針</span></li></ul></section><section class="footer-group"><h2>連絡・訂正</h2><ul><li><a href="/updates/">更新情報</a></li><li><span class="is-disabled">訂正のご連絡</span></li></ul></section></div><p class="footer-note">動的事実は、承認済みで公式スナップショットに紐づく内容のみ表示します。日付、費用、制度情報は試験実施機関の最新発表をご確認ください。</p></div></footer>`;
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
      return `<a href="${item.href}"${item.key === currentNav ? ' aria-current="page"' : ''}>${content}</a>`;
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
  const breadcrumbs = input.breadcrumbs?.length
    ? `<div class="container">${renderBreadcrumbs(input.breadcrumbs)}</div>`
    : '';
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">${description}${canonical}${robots}<title>${escapeHtml(input.title)}</title><style>${uiStyles}${webStyles}</style></head><body><a class="skip-link" href="#main-content">本文へ移動</a>${renderHeader(currentNav)}${input.subnav ?? ''}<main id="main-content" class="page-main">${breadcrumbs}${input.body}</main>${renderFooter()}${renderMobileBottomNav(currentNav)}</body></html>`;
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
