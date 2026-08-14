import { describe, expect, it } from 'vitest';
import {
  renderBadge,
  renderButtonLink,
  renderFeedbackState,
  uiStyles,
} from '../packages/ui/src/index.js';
import { renderHomePage, renderNotFoundPage } from '../apps/web/src/render.js';

describe('shared UI foundation', () => {
  it('publishes the confirmed design tokens and responsive grid', () => {
    expect(uiStyles).toContain('--color-primary: #1D4ED8');
    expect(uiStyles).toContain('--container: 1200px');
    expect(uiStyles).toContain('repeat(12, minmax(0, 1fr))');
    expect(uiStyles).toContain('@media (max-width: 767px)');
    expect(uiStyles).toContain('@media (prefers-reduced-motion: reduce)');
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
    expect(home).toContain('mobile-bottom-nav');
    expect(home).toContain('試験日程を見る');
    expect(home).toContain('aria-disabled="true"');

    const notFound = renderNotFoundPage();
    expect(notFound).toContain('ページが見つかりません');
    expect(notFound).toContain('/shikaku/');
    expect(notFound).not.toContain('undefined');
  });
});
