import { createHash } from 'node:crypto';
import { uiStyles, uiTokens } from '../../../packages/ui/src/index.js';
import { webStyles } from './styles.js';

export const siteCss = `${uiStyles}${webStyles}`;

const siteCssHash = createHash('sha256')
  .update(siteCss)
  .digest('hex')
  .slice(0, 12);

export const siteCssPath = `/assets/site.${siteCssHash}.css`;

/**
 * 首屏渲染所需的最小样式快照。完整样式由 /assets/site.{hash}.css 异步加载，
 * 修改 uiStyles / webStyles 中的基础规则时需要同步这里的对应声明。
 */
export const criticalCss = `${uiTokens}${String.raw`
*, *::before, *::after { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body { margin: 0; background: var(--color-bg); color: var(--color-ink); font-size: var(--font-size-base); line-height: 1.8; }
body, button, input, select, textarea { font: inherit; }
img, svg { display: block; max-width: 100%; }
button, input, select, textarea { color: inherit; }
a { color: var(--color-primary); text-decoration-thickness: .08em; text-underline-offset: .18em; }
:focus-visible { outline: 2px solid var(--color-focus); outline-offset: 2px; }
h1, h2, h3 { margin-block: 0 var(--space-4); color: var(--color-ink); font-weight: 700; overflow-wrap: anywhere; }
h1 { font-size: var(--font-size-2xl); line-height: 1.4; letter-spacing: 0; }
h2 { font-size: var(--font-size-xl); line-height: 1.4; }
h3 { font-size: var(--font-size-lg); line-height: 1.6; }
p { margin-block: 0 var(--space-4); }
ul, ol { margin-block: 0 var(--space-4); }
.icon { width: 20px; height: 20px; flex: 0 0 auto; }
.visually-hidden { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
.skip-link { position: fixed; z-index: 70; inset: var(--space-2) auto auto var(--space-2); padding: var(--space-2) var(--space-4); border-radius: var(--radius-control); background: var(--color-surface); transform: translateY(-160%); }
.skip-link:focus { transform: translateY(0); }
.container { width: min(100% - 64px, var(--container)); margin-inline: auto; }
.page-main { min-height: 60vh; padding-block: var(--space-8) var(--space-16); }
.page-heading { max-width: var(--reading-width); margin-bottom: var(--space-8); }
.eyebrow { margin-bottom: var(--space-2); color: var(--color-muted); font-size: 14px; line-height: 1.65; }
.meta { color: var(--color-muted); font-size: 14px; line-height: 1.65; }
.site-header { position: sticky; z-index: 30; top: 0; height: var(--header-height); border-bottom: 1px solid var(--color-border); background: var(--color-surface); }
.site-header__inner { display: flex; height: 100%; align-items: center; gap: var(--space-6); }
.brand { display: inline-flex; flex: 0 0 auto; align-items: center; gap: var(--space-3); color: var(--color-ink); font-size: 15px; font-weight: 700; line-height: 1.3; text-decoration: none; }
.brand__mark { width: 40px; height: 40px; flex: none; }
.brand__text { display: grid; gap: 2px; }
.brand__name { display: inline-flex; align-items: center; gap: var(--space-2); }
.brand__badge { display: inline-flex; align-items: center; padding: 1px 6px; border: 1px solid var(--color-primary); border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary); font-size: 12px; font-weight: 700; line-height: 1.5; letter-spacing: .02em; white-space: nowrap; }
.desktop-nav { display: flex; min-width: 0; align-items: center; gap: var(--space-1); margin-left: auto; }
.nav-link { display: inline-flex; min-height: 44px; align-items: center; gap: var(--space-2); padding-inline: var(--space-3); border-radius: var(--radius-control); color: var(--color-text-secondary); font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.nav-link:hover, .nav-link[aria-current="page"] { color: var(--color-primary); background: var(--color-primary-soft); }
.mobile-search { display: none; }
.mobile-menu-backdrop, .mobile-menu-panel { display: none; }
body.has-menu-open { overflow: hidden; }
.breadcrumbs { margin-bottom: var(--space-6); color: var(--color-muted); font-size: 14px; }
.subnav { position: sticky; z-index: 20; top: var(--header-height); height: var(--subnav-height); overflow-x: auto; border-block: 1px solid var(--color-border); background: var(--color-surface); }
.subnav a, .subnav span { display: inline-flex; height: 40px; align-items: center; padding-inline: var(--space-3); border-radius: var(--radius-control); color: var(--color-text-secondary); font-size: 14px; font-weight: 600; text-decoration: none; white-space: nowrap; }
.subnav a[aria-current="page"] { color: var(--color-primary); background: var(--color-primary-soft); }
.button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: var(--space-2); padding: var(--space-2) var(--space-5); border: 1px solid transparent; border-radius: var(--radius-control); font-weight: 600; line-height: 1.4; text-align: center; text-decoration: none; }
.button--primary { color: var(--color-surface); background: var(--color-primary); }
.button--secondary { color: var(--color-primary); border-color: var(--color-border-strong); background: var(--color-surface); }
.page-hero { padding: var(--space-8); margin-bottom: var(--space-8); border: 1px solid var(--color-border); border-radius: var(--radius-feature); background: var(--color-surface); }
.page-hero > p { max-width: var(--reading-width); }
.detail-hero h1 { margin-bottom: var(--space-3); }
.home-hero { position: relative; isolation: isolate; display: grid; grid-template-columns: minmax(0, 7fr) minmax(280px, 5fr); gap: var(--space-8); min-height: 520px; overflow: hidden; padding: var(--space-12); border: 1px solid var(--color-border); border-radius: var(--radius-feature); background: var(--color-surface); }
.home-hero__main { position: relative; align-self: center; max-width: none; }
.home-hero__visual { position: absolute; z-index: -1; inset: 0; background: var(--color-surface); }
.home-hero__image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center right; }
.home-hero__visual::after { content: ''; position: absolute; inset: 0; background: linear-gradient(90deg, var(--color-surface) 0%, rgb(255 255 255 / .94) 46%, rgb(255 255 255 / .62) 74%, rgb(255 255 255 / .34) 100%); }
.home-hero h1 { max-width: 650px; margin-top: var(--space-5); font-size: var(--font-size-display); line-height: 1.4; }
.home-hero__lead { max-width: 590px; margin-bottom: var(--space-6); color: var(--color-text-secondary); font-size: 18px; line-height: 1.8; }
.home-search { max-width: 630px; }
.home-search__row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: var(--space-2); }
.home-search .search-control input { width: 100%; height: 52px; border: 1px solid var(--color-border-control); border-radius: var(--radius-control); background: var(--color-surface); }
.mobile-bottom-nav { display: none; }
@media (max-width: 767px) {
  :root { --header-height: 56px; }
  body { padding-bottom: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom)); }
  h1 { font-size: 26px; }
  h2 { font-size: 24px; }
  h3 { font-size: 18px; }
  .container { width: calc(100% - 32px); }
  .page-main { padding-block: var(--space-6) var(--space-10); }
  .desktop-nav { display: none; }
  .mobile-search { display: inline-grid; width: 44px; height: 44px; align-items: center; justify-items: center; margin-left: auto; border-radius: var(--radius-control); color: var(--color-text-secondary); }
  .brand__text small { display: none; }
  .mobile-bottom-nav { position: fixed; z-index: 30; right: 0; bottom: 0; left: 0; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); min-height: calc(var(--mobile-nav-height) + env(safe-area-inset-bottom)); padding-bottom: env(safe-area-inset-bottom); border-top: 1px solid var(--color-border); background: var(--color-surface); }
  .mobile-bottom-nav a, .mobile-bottom-nav button { display: flex; min-width: 0; align-items: center; justify-content: center; flex-direction: column; gap: 2px; padding: var(--space-1); border: 0; background: transparent; color: var(--color-muted); font-family: inherit; font-size: 13px; font-weight: 600; text-decoration: none; cursor: pointer; }
  .mobile-bottom-nav a[aria-current="page"], .mobile-bottom-nav button[aria-expanded="true"] { color: var(--color-primary); background: var(--color-primary-soft); }
  .home-hero { gap: var(--space-5); padding: var(--space-5); }
  .home-hero__visual { display: none; }
  .home-hero h1 { font-size: 28px; }
  .home-search__row { grid-template-columns: minmax(0, 1fr); }
  .home-search .button { width: 100%; }
}
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; transition-duration: .01ms !important; }
}
`}`;
