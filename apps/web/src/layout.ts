import { escapeHtml, renderIcon } from '../../../packages/ui/src/index.js';
import { criticalCss, siteCssPath } from './assets.js';
import { unofficialNotice } from './editorial.js';
import { heroImagePreload } from './hero-image.js';

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
  heroPreload?: boolean;
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

const siteName = 'シカクチェック';

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

const secondaryNav = [
  { label: '更新情報', href: '/updates/' },
  { label: '運営者情報', href: '/about/operator/' },
  { label: '情報源について', href: '/about/sources/' },
  { label: '編集方針・AI方針', href: '/about/editorial-policy/' },
  { label: 'お問い合わせ', href: '/about/contact/' },
  { label: 'プライバシーポリシー', href: '/about/privacy/' },
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
  return `<header class="site-header"><div class="container site-header__inner"><a class="brand" href="/"${currentNav === 'home' ? ' aria-current="page"' : ''}><img class="brand__mark" src="/images/brand-mark.png" alt="" width="40" height="40"><span class="brand__text"><span class="brand__name">${escapeHtml(siteName)}<span class="brand__badge">非公式</span></span><small>公式情報を整理した個人運営サイト</small></span></a><nav class="desktop-nav" aria-label="メインナビゲーション">${links}</nav><a class="mobile-search" href="/shikaku/" aria-label="資格を検索">${renderIcon('search')}</a></div></header>`;
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
  return `<footer class="site-footer"><div class="container"><div class="footer-brand"><img src="/images/brand-mark.png" alt="" width="40" height="40"><span class="footer-brand__text"><span class="brand__name">${escapeHtml(siteName)}<span class="brand__badge">非公式・個人運営</span></span><small>公式情報を整理した非公式サイト</small></span></div><div class="footer-grid"><section class="footer-group"><h2>資格情報</h2><ul><li><a href="/shikaku/">資格を探す</a></li><li><a href="/schedule/">試験日程</a></li><li><a href="/guide/">資格試験ガイド</a></li></ul></section><section class="footer-group"><h2>データツール</h2><ul><li><a href="/compare/">資格比較</a></li><li><a href="/pass-rate/">合格率データ</a></li></ul></section><details class="footer-group footer-group--collapsible" open><summary><span>運営・法務</span></summary><div class="footer-group__columns"><section><h2>運営・方針</h2><ul><li><a href="/about/operator/">運営者情報</a></li><li><a href="/about/sources/">情報源について</a></li><li><a href="/about/editorial-policy/">編集方針・AI方針</a></li><li><a href="/about/ai-policy/">AI利用方針</a></li></ul></section><section><h2>法務・連絡</h2><ul><li><a href="/about/privacy/">プライバシーポリシー</a></li><li><a href="/about/terms/">利用規約</a></li><li><a href="/about/advertising-policy/">広告・PR方針</a></li><li><a href="/about/contact/">お問い合わせ</a></li><li><a href="/about/corrections/">訂正のご連絡</a></li><li><a href="/updates/">更新情報</a></li></ul></section></div></details></div><p class="footer-note">動的事実は、承認済みで公式スナップショットに紐づく内容のみ表示します。日付、費用、制度情報は試験実施機関の最新発表をご確認ください。</p><p class="footer-note footer-note--unofficial">${escapeHtml(unofficialNotice)}</p></div></footer>`;
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
      key: 'guide' as const,
      label: 'ガイド',
      href: '/guide/',
      icon: 'document' as const,
    },
  ];
  const links = items
    .map((item) => {
      // The home page's primary task is qualification discovery, so its
      // mobile navigation state belongs to the discovery destination.
      const isCurrent =
        item.key === currentNav ||
        (currentNav === 'home' && item.key === 'qualifications');
      return `<a href="${item.href}"${isCurrent ? ' aria-current="page"' : ''}>${renderIcon(item.icon)}<span>${item.label}</span></a>`;
    })
    .join('');
  const menuButton = `<button type="button" data-mobile-menu-button aria-expanded="false" aria-controls="mobile-menu-panel" aria-label="メニューを開く">${renderIcon('menu')}<span>メニュー</span></button>`;
  return `<nav class="mobile-bottom-nav" aria-label="モバイル主要ナビゲーション">${links}${menuButton}</nav>`;
}

function renderMobileMenu(): string {
  const links = secondaryNav
    .map(
      (item) => `<li><a href="${item.href}">${escapeHtml(item.label)}</a></li>`,
    )
    .join('');
  return `<div class="mobile-menu-backdrop" data-mobile-menu-backdrop hidden></div><div class="mobile-menu-panel" id="mobile-menu-panel" role="dialog" aria-modal="true" aria-labelledby="mobile-menu-title" hidden><div class="mobile-menu-panel__head"><h2 id="mobile-menu-title">メニュー</h2><button type="button" class="mobile-menu-panel__close" data-mobile-menu-close aria-label="メニューを閉じる">${renderIcon('close')}</button></div><nav aria-label="補助メニュー"><ul>${links}</ul></nav></div><script>(function(){var button=document.querySelector('[data-mobile-menu-button]');if(!button)return;var panel=document.getElementById('mobile-menu-panel');var backdrop=document.querySelector('[data-mobile-menu-backdrop]');if(!panel||!backdrop)return;var close=panel.querySelector('[data-mobile-menu-close]');var lastFocus=null;function setOpen(open){if(open){lastFocus=document.activeElement;panel.hidden=false;backdrop.hidden=false;button.setAttribute('aria-expanded','true');button.setAttribute('aria-label','メニューを閉じる');document.body.classList.add('has-menu-open');var first=panel.querySelector('a');if(first)first.focus();}else{panel.hidden=true;backdrop.hidden=true;button.setAttribute('aria-expanded','false');button.setAttribute('aria-label','メニューを開く');document.body.classList.remove('has-menu-open');if(lastFocus&&lastFocus!==document.body)lastFocus.focus();else button.focus();}}button.addEventListener('click',function(){setOpen(panel.hidden);});backdrop.addEventListener('click',function(){setOpen(false);});if(close)close.addEventListener('click',function(){setOpen(false);});document.addEventListener('keydown',function(event){if(panel.hidden)return;if(event.key==='Escape'){setOpen(false);return;}if(event.key!=='Tab')return;var focusables=panel.querySelectorAll('a[href],button:not([disabled])');if(!focusables.length)return;var first=focusables[0],last=focusables[focusables.length-1];if(!panel.contains(document.activeElement)){event.preventDefault();first.focus();return;}if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}});})();</script>`;
}

/**
 * Printing cannot reveal a closed <details> element through CSS alone, so the
 * collapsed source and status blocks are opened for the print preview and
 * closed again afterwards.
 */
function printDetailsScript(): string {
  return `<script>(function(){var opened=[];function expand(){var list=document.querySelectorAll('details:not([open])');for(var i=0;i<list.length;i++){list[i].open=true;opened.push(list[i]);}}function restore(){for(var i=0;i<opened.length;i++)opened[i].open=false;opened=[];}window.addEventListener('beforeprint',expand);window.addEventListener('afterprint',restore);if(window.matchMedia){var media=window.matchMedia('print');var onChange=function(event){if(event.matches)expand();else restore();};if(media.addEventListener)media.addEventListener('change',onChange);}})();</script>`;
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
  const heroPreload = input.heroPreload ? heroImagePreload : '';
  const breadcrumbs = input.breadcrumbs?.length
    ? `<div class="container">${renderBreadcrumbs(input.breadcrumbs)}</div>`
    : '';
  const printDetails = input.body.includes('<details')
    ? printDetailsScript()
    : '';
  return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" type="image/png" sizes="32x32" href="/images/favicon-32.png"><link rel="apple-touch-icon" href="/images/apple-touch-icon.png">${description}${canonical}${robots}${openGraph}${structuredData}${verification}<title>${escapeHtml(input.title)}</title><style>${criticalCss}</style>${heroPreload}<link rel="stylesheet" href="${siteCssPath}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${siteCssPath}"></noscript>${analytics}</head><body><a class="skip-link" href="#main-content">本文へ移動</a>${renderHeader(currentNav)}${input.subnav ?? ''}<main id="main-content" class="page-main">${breadcrumbs}${input.body}</main>${renderFooter()}${renderMobileBottomNav(currentNav)}${renderMobileMenu()}${printDetails}</body></html>`;
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
