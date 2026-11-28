import { describe, expect, it } from 'vitest';
import type { PublicFact } from '../packages/schema/src/index.js';
import { buildQualificationComparison } from '../packages/schema/src/compare.js';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import {
  renderComparePage,
  renderQualificationSectionPage,
} from '../apps/web/src/render.js';

function fact(overrides: Partial<PublicFact> = {}): PublicFact {
  return {
    qualificationSlug: 'fp',
    providerId: 'jafp',
    examLevelId: 'fp:2',
    examComponent: 'academic',
    deliveryMode: 'cbt',
    paymentMethod: null,
    examSession: null,
    examYear: 2026,
    factKey: 'fee',
    valueType: 'money',
    normalizedValue: 5700,
    displayValue: '5,700円',
    status: 'approved',
    riskLevel: 'high',
    sourceId: 'source:fp:jafp',
    sourceSnapshotId: 'snapshot:test',
    synthetic: false,
    verifiedAt: '2026-11-10T00:00:00.000Z',
    officialVerifiedAt: '2026-11-09T00:00:00.000Z',
    provenanceStatus: 'verified',
    sourceUrl: 'https://www.jafp.or.jp/exam/',
    ...overrides,
  };
}

const fp = launchQualifications.find((item) => item.slug === 'fp')!;

function comparison(facts: PublicFact[]) {
  return buildQualificationComparison(launchQualifications, facts, [
    'fp',
    'bookkeeping',
  ]);
}

describe('scoped qualification comparisons', () => {
  it('keeps each provider, level, component, delivery and payment scope', () => {
    const facts = [
      fact(),
      fact({ providerId: 'kinzai' }),
      fact({ examLevelId: 'fp:3' }),
      fact({ examComponent: 'practical:asset-design' }),
      fact({ deliveryMode: 'pbt' }),
      fact({ paymentMethod: 'pay_easy' }),
      fact({ factKey: 'fee_processing' }),
    ];
    const before = JSON.stringify(facts);
    const entries = comparison(facts).rows.find((row) => row.key === 'fee')!
      .cells.fp.entries;
    expect(entries).toHaveLength(7);
    expect(JSON.stringify(facts)).toBe(before);
    expect(comparison([...facts].reverse())).toEqual(comparison(facts));
  });

  it('uses the latest year within each scope without losing same-year sessions', () => {
    const entries = comparison([
      fact({
        examYear: 2025,
        displayValue: 'old same scope',
        examSession: '170',
      }),
      fact({ examSession: '172' }),
      fact({ examSession: '173' }),
      fact({
        examLevelId: 'fp:3',
        examYear: 2025,
        displayValue: 'previous year other scope',
      }),
    ]).rows.find((row) => row.key === 'fee')!.cells.fp.entries;
    expect(entries).toHaveLength(3);
    expect(entries.map((item) => item.value)).not.toContain('old same scope');
    expect(entries.map((item) => item.examSession)).toEqual([
      '173',
      '172',
      null,
    ]);
    expect(entries.find((item) => item.examLevelId === 'fp:3')?.examYear).toBe(
      2025,
    );
  });

  it('shows dimensions and the official review time rather than the revision time', () => {
    const html = renderComparePage(comparison([fact()]), launchQualifications);
    const entry =
      html.match(/<div class="compare-entry">[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(entry).toContain('日本FP協会・2級・学科・CBT');
    expect(entry).toContain('適用年度: 2026年');
    expect(entry).toContain('2026年11月9日');
    expect(entry).not.toContain('2026年11月10日');
    expect(entry).toContain('https://www.jafp.or.jp/exam/');
  });

  it('does not turn fixture timestamps into official verification and escapes values', () => {
    const html = renderComparePage(
      comparison([
        fact({
          provenanceStatus: 'fixture',
          displayValue: '<img src=x onerror=alert(1)>',
        }),
      ]),
      launchQualifications,
    );
    const entry =
      html.match(/<div class="compare-entry">[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(entry).toContain('回帰用 fixture（確認時刻なし）');
    expect(entry).not.toContain('2026年11月9日');
    expect(entry).toContain('&lt;img');
    expect(entry).not.toContain('<img');
  });

  it('flags scope variance only when provider/level/component/delivery differ', () => {
    const sameScope = comparison([
      fact({ examSession: '172', displayValue: '5,700円（172回）' }),
      fact({ examSession: '173', displayValue: '5,700円（173回）' }),
    ]).rows.find((row) => row.key === 'fee')!.cells.fp;
    expect(sameScope.entries).toHaveLength(2);
    expect(sameScope.scopeVaries).toBe(false);

    const providerScope = comparison([
      fact(),
      fact({ providerId: 'kinzai', displayValue: '6,000円' }),
    ]).rows.find((row) => row.key === 'fee')!.cells.fp;
    expect(providerScope.scopeVaries).toBe(true);

    const levelScope = comparison([
      fact(),
      fact({ examLevelId: 'fp:3' }),
    ]).rows.find((row) => row.key === 'fee')!.cells.fp;
    expect(levelScope.scopeVaries).toBe(true);
  });

  it('explains same-scope multiple values without claiming the scope differs', () => {
    const html = renderComparePage(
      comparison([
        fact({ examSession: '172', displayValue: '5,700円（172回）' }),
        fact({ examSession: '173', displayValue: '5,700円（173回）' }),
      ]),
      launchQualifications,
    );
    expect(html).toContain(
      '同じ適用範囲に複数の値（回・期間・項目）があります',
    );
    expect(html).not.toContain('適用範囲（級・実施機関・科目・方式）が異なる');
  });

  it('shows each provider and level instead of averaging or merging them', () => {
    const html = renderComparePage(
      comparison([
        fact({
          factKey: 'pass_rate',
          displayValue: '40%',
          providerId: 'jafp',
        }),
        fact({
          factKey: 'pass_rate',
          displayValue: '30%',
          providerId: 'kinzai',
        }),
        fact({ displayValue: '5,700円', examLevelId: 'fp:2' }),
        fact({ displayValue: '4,000円', examLevelId: 'fp:3' }),
      ]),
      launchQualifications,
    );
    expect(html).toContain('日本FP協会・2級・学科・CBT');
    expect(html).toContain('金融財政事情研究会・2級・学科・CBT');
    expect(html).toContain('40%');
    expect(html).toContain('30%');
    expect(html).toContain('5,700円');
    expect(html).toContain('4,000円');
    expect(html).toContain('適用範囲（級・実施機関・科目・方式）が異なる');
    // No derived average or merged fee is rendered.
    expect(html).not.toContain('平均');
    expect(html).not.toContain('5,150円');
    expect(html).not.toContain('4,850円');
  });
});

describe('scoped detail and historical evidence', () => {
  it('puts scoring and practical fields in exam-content and renders FE subjects once', () => {
    const fields = [
      'scoring_method',
      'passing_standard',
      'practical_subject',
      'interview_count',
      'exam_subject_a_time',
      'exam_subject_b_format',
      'exam_subject_a_question_count',
    ];
    const html = renderQualificationSectionPage(
      {
        qualification: fp,
        status: 'partially_announced',
        officialVerifiedAt: null,
        facts: fields.map((factKey) => fact({ factKey })),
      },
      'exam-content',
    );
    for (const key of fields)
      expect(html.split(`data-fact-key="${key}"`).length - 1).toBe(1);
  });

  it('keeps same-year FP statistics isolated by provider and component with per-cell sources', () => {
    const html = renderQualificationSectionPage(
      {
        qualification: fp,
        status: 'partially_announced',
        officialVerifiedAt: null,
        facts: [
          fact({ factKey: 'pass_rate', displayValue: '40% 合格率（2026年）' }),
          fact({
            factKey: 'pass_rate',
            providerId: 'kinzai',
            displayValue: '30% 合格率（2026年）',
          }),
          fact({
            factKey: 'pass_rate',
            examComponent: 'practical:asset-design',
            displayValue: '50% 合格率（2026年）',
          }),
        ],
      },
      'pass-rate',
    );
    expect(html.match(/class="compare-table history-table"/g)).toHaveLength(3);
    expect(html).toContain('日本FP協会・2級・学科・CBT');
    expect(html).toContain('金融財政事情研究会・2級・学科・CBT');
    expect(html).toContain('日本FP協会・2級・実技（資産設計提案業務）・CBT');
    const tableBodies = [...html.matchAll(/<tbody>([\s\S]*?)<\/tbody>/g)].map(
      (item) => item[1],
    );
    expect(tableBodies).toHaveLength(3);
    for (const table of tableBodies) {
      expect(table).toContain('<details>');
      expect(table).toContain('https://www.jafp.or.jp/exam/');
      expect(table).toContain('2026年11月9日');
    }
  });

  it('never overwrites conflicting values in a historical cell', () => {
    const html = renderQualificationSectionPage(
      {
        qualification: fp,
        status: 'partially_announced',
        officialVerifiedAt: null,
        facts: [
          fact({ factKey: 'pass_rate', displayValue: '40% 合格率（2026年）' }),
          fact({
            factKey: 'pass_rate',
            displayValue: '41% 合格率（2026年）',
            sourceId: 'source:other',
          }),
        ],
      },
      'pass-rate',
    );
    const table = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
    expect(table).toContain('<span>40%</span>');
    expect(table).toContain('<span>41%</span>');
    expect(table.match(/class="history-value"/g)).toHaveLength(2);
  });
});
