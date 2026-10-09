import { describe, expect, it } from 'vitest';
import {
  renderHomePage,
  renderQualificationDirectory,
  renderQualificationPage,
  renderQualificationSectionPage,
} from '../apps/web/src/render.js';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import { fpUiStressView } from './fixtures/fp-ui-stress.js';

describe('stage 4 representative UI samples', () => {
  it('renders the complete home sample without inventing active tools', () => {
    const html = renderHomePage();
    expect(html).toContain('home-hero');
    expect(html).toContain('申込みから合格発表まで');
    expect(html).toContain('資格から情報を探す');
    expect(html).toContain('目的から探す');
    expect(html).toContain('推測値で空欄を埋めません');
    expect(html).toContain('name="q" type="search"');
    expect(html).toContain('href="/schedule/"');
    expect(html).toContain('href="/compare/"');
    expect(html).toContain('href="/updates/"');
  });

  it('renders the directory sample with all current page destinations', () => {
    const items = launchQualifications.map((qualification, index) => ({
      ...qualification,
      status:
        index === 0 ? ('verified' as const) : ('awaiting_official' as const),
    }));
    const html = renderQualificationDirectory(items);
    expect(html).toContain('directory-overview');
    expect(html).toContain('公式確認済み');
    expect(html).toContain('/shikaku/takken/2026/');
    expect(html).toContain('/shikaku/takken/application/');
    expect(html).toContain('/shikaku/takken/exam-content/');
    expect(html).toContain('/shikaku/takken/pass-rate/');
  });

  it('renders the FP multidimensional stress sample through production UI', () => {
    const html = renderQualificationPage(fpUiStressView);
    expect(html.match(/class="card fact"/g)).toHaveLength(8);
    expect(html).toContain('日本FP協会');
    expect(html).toContain('金融財政事情研究会');
    expect(html).toContain('実技');
    expect(html).toContain('CBT');
    expect(html).toContain('detail-sidebar');
    expect(html).toContain('適用年度: 2026年');
    expect(html).not.toContain('undefined');
  });

  it('groups migrated section pages without mixing unrelated facts', () => {
    const annualView = {
      ...fpUiStressView,
      facts: [
        {
          ...fpUiStressView.facts[0],
          factKey: 'application_open_fp2_cbt',
        },
      ],
    };
    const annual = renderQualificationSectionPage(annualView, 'annual', 2026);
    const examContent = renderQualificationSectionPage(
      fpUiStressView,
      'exam-content',
    );
    const passRate = renderQualificationSectionPage(
      fpUiStressView,
      'pass-rate',
    );

    expect(annual).toContain('年度別の公式日程');
    expect(annual).toContain('申込み日程');
    expect(examContent).toContain('試験方式と時間');
    expect(examContent).toContain('科目・出題内容');
    expect(passRate).toContain('数値の見方');
    expect(passRate).toContain('個人の合格可能性を示すものではありません');
  });

  it('shows verification history separately from page update time', () => {
    const html = renderQualificationPage(fpUiStressView);
    expect(html).toContain('公式情報の確認履歴');
    expect(html).toContain('ページ内容の更新日時とは異なります');
    expect(html).toContain('id="official-sources"');
    expect(html).toContain('公式サイトで確認（新しいタブ）');
  });

  it('keeps sources in the main column so a tall sidebar cannot create an empty window', () => {
    const emptyView = {
      ...fpUiStressView,
      status: 'awaiting_official' as const,
      officialVerifiedAt: null,
      facts: [],
    };
    const html = renderQualificationPage(emptyView);
    const mainStart = html.indexOf('<div class="detail-main">');
    const sourceStart = html.indexOf('id="official-sources"');
    const sidebarStart = html.indexOf('<aside class="detail-sidebar"');

    expect(mainStart).toBeGreaterThan(-1);
    expect(sourceStart).toBeGreaterThan(mainStart);
    expect(sidebarStart).toBeGreaterThan(sourceStart);
  });
});
