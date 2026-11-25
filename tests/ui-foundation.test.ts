import { describe, expect, it } from 'vitest';
import { statSync } from 'node:fs';
import {
  renderBadge,
  renderButtonLink,
  renderFeedbackState,
  uiStyles,
} from '../packages/ui/src/index.js';
import { renderHomePage, renderNotFoundPage } from '../apps/web/src/render.js';
import { criticalCss, siteCss, siteCssPath } from '../apps/web/src/assets.js';
import { webStyles } from '../apps/web/src/styles.js';

describe('shared UI foundation', () => {
  it('publishes the confirmed design tokens and responsive grid', () => {
    expect(uiStyles).toContain('--color-primary: #1D4ED8');
    expect(uiStyles).toContain('--container: 1200px');
    expect(uiStyles).toContain('repeat(12, minmax(0, 1fr))');
    expect(uiStyles).toContain('@media (max-width: 767px)');
    expect(uiStyles).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('uses one Japanese type scale across pages', () => {
    expect(uiStyles).toContain('--font-size-caption: 12px');
    expect(uiStyles).toContain('--font-size-2xl: 32px');
    expect(uiStyles).toContain(
      'h1 { font-size: var(--font-size-2xl); line-height: 1.4; letter-spacing: 0; }',
    );
    expect(uiStyles).not.toContain('font-size: 11px');
    expect(uiStyles).toContain(
      '.footer-brand__text small { color: var(--color-muted); font-size: var(--font-size-caption)',
    );
    expect(webStyles).toContain(
      '.home-hero h1 { font-size: var(--font-size-display); line-height: 1.4; }',
    );
    expect(webStyles).toContain(
      '.unofficial-notice { margin-top: var(--space-6); padding-top: var(--space-4); border-top: 1px solid var(--color-border); color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.7; }',
    );
    expect(webStyles).not.toContain('letter-spacing: -.025em');
  });

  it('inlines critical CSS only and serves the full stylesheet from a versioned asset', () => {
    expect(siteCssPath).toMatch(/^\/assets\/site\.[a-f0-9]{12}\.css$/);
    expect(siteCss).toContain('.directory-card');
    expect(criticalCss).toContain(':root');
    expect(criticalCss).toContain('.home-hero');
    expect(criticalCss).not.toContain('.directory-card');
    expect(criticalCss.length).toBeLessThan(siteCss.length / 3);

    const home = renderHomePage();
    expect(home).toContain(`<link rel="stylesheet" href="${siteCssPath}"`);
    expect(home).toContain('<noscript><link rel="stylesheet"');
    expect(home).not.toContain(siteCss);
    expect(home.length).toBeLessThan(33_000);
  });

  it('serves the hero image as AVIF/WebP with a preload hint', () => {
    const home = renderHomePage();
    expect(home).toContain(
      '<picture><source type="image/avif" srcset="/images/hero-800.avif 800w, /images/hero-1200.avif 1200w, /images/hero-1983.avif 1983w"',
    );
    expect(home).toContain(
      'srcset="/images/hero-800.webp 800w, /images/hero-1200.webp 1200w, /images/hero-1983.webp 1983w"',
    );
    expect(home).toContain(
      '<img class="home-hero__image" src="/images/exam-information-workspace-hero.png" alt="" width="1983" height="793" decoding="async" fetchpriority="high">',
    );
    expect(home).toContain(
      '<link rel="preload" as="image" type="image/avif" media="(min-width: 768px)"',
    );
    expect(renderNotFoundPage()).not.toContain('rel="preload" as="image"');
    expect(criticalCss).toContain('.home-hero__image');
    expect(criticalCss).not.toContain(
      "url('/images/exam-information-workspace-hero.png')",
    );

    for (const [file, maxBytes] of [
      ['hero-800.avif', 30_000],
      ['hero-1200.avif', 40_000],
      ['hero-1983.avif', 60_000],
      ['hero-800.webp', 30_000],
      ['hero-1200.webp', 40_000],
      ['hero-1983.webp', 80_000],
    ] as const) {
      const stats = statSync(
        new URL(`../apps/web/public/images/${file}`, import.meta.url),
      );
      expect(stats.size).toBeGreaterThan(0);
      expect(stats.size).toBeLessThan(maxBytes);
    }
  });

  it('renders semantic component states without exposing unsafe text', () => {
    expect(renderBadge('公式確認済み', 'verified')).toContain(
      'badge--verified',
    );
    expect(
      renderButtonLink({
        href: '/unsafe?value=<x>',
        label: '<確認>',
        disabled: true,
      }),
    ).toContain('aria-disabled="true"');
    expect(
      renderFeedbackState({
        kind: 'error',
        title: '<error>',
        body: 'failed',
      }),
    ).toContain('&lt;error&gt;');
  });

  it('uses the shared public shell for home and not-found states', () => {
    const home = renderHomePage();
    expect(home).toContain('lang="ja"');
    expect(home).toContain('本文へ移動');
    expect(home).toContain('site-header');
    expect(home).toContain('site-footer');
    expect(home).toContain('footer-brand');
    expect(home).toContain('class="footer-group footer-group--collapsible"');
    expect(home).toContain('<summary><span>運営・法務</span></summary>');
    expect(home).toContain('<h2>運営・方針</h2>');
    expect(home).toContain('<h2>法務・連絡</h2>');
    expect(home).toContain('/about/privacy/');
    expect(home).toContain(
      '<span class="brand__name">シカクチェック<span class="brand__badge">非公式</span></span>',
    );
    expect(home).toContain(
      '<title>日本の資格試験の日程・受験料・合格率をまとめて確認｜シカクチェック</title>',
    );
    expect(home).toContain(
      '<h1>資格試験の日程・受験料を、<br>合格率までまとめて確認。</h1>',
    );
    expect(home).toContain('mobile-bottom-nav');
    expect(home).toContain('data-mobile-menu-button');
    expect(home).toContain('aria-expanded="false"');
    expect(home).toContain('aria-controls="mobile-menu-panel"');
    expect(home).toContain("event.key!=='Tab'");
    expect(home).toContain('<span>ガイド</span></a>');
    expect(home).toContain('id="mobile-menu-panel"');
    expect(home).not.toContain('nav-link--search');
    expect(home).not.toContain('class="mobile-menu"');
    expect(home).toContain('試験日程を見る');
    expect(home).toContain('aria-label="資格を検索"');
    expect(home).toContain('name="q" type="search"');
    expect(home).toContain('href="/shikaku/" aria-current="page"');
    expect(home).toContain('home-hero__visual');
    expect(home).toContain('home-qualification__field');

    const notFound = renderNotFoundPage();
    expect(notFound).toContain('ページが見つかりません');
    expect(notFound).toContain('/shikaku/');
    expect(notFound).not.toContain('undefined');
  });

  it('prints without navigation and keeps sources and tables readable', () => {
    expect(webStyles).toContain('@media print');
    expect(webStyles).toContain(
      '.site-header, .subnav, .site-footer, .mobile-bottom-nav',
    );
    expect(webStyles).toContain(
      '.detail-kpi__ics, .scroll-hint, .button { display: none !important; }',
    );
    expect(webStyles).toContain('details[open] > summary');
    expect(webStyles).toContain(
      '.history-table { min-width: 0; font-size: 9pt; }',
    );
    expect(webStyles).toContain('table thead { display: table-header-group; }');
    expect(webStyles).toContain('@page { margin: 16mm 14mm; }');
  });

  it('offers popular page exits on the 404 page', () => {
    const notFound = renderNotFoundPage();
    expect(notFound).toContain('<span class="not-found__code">404</span>');
    expect(notFound).not.toContain('<p class="eyebrow">404</p>');
    expect(notFound).toContain(
      '<nav class="popular-pages" aria-label="よく見られるページ">',
    );
    for (const label of [
      '試験日程',
      '資格比較',
      '合格率データ',
      '更新情報',
      '資格試験ガイド',
    ]) {
      expect(notFound).toContain(`<span>${label}</span>`);
    }
  });
});
