import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateCoverage,
  evaluatePublicPage,
  evaluateSitemapRoutes,
  expectedCoverageStatus,
  launchGate,
  qualificationWebRoutes,
} from './verify-lib.mjs';
import baseline from '../config/release-gate-baseline.json' with { type: 'json' };
import coverageContract from '../config/data-coverage-contract.json' with { type: 'json' };

test('launch gate contains six unique qualifications with positive fact baselines', () => {
  assert.equal(launchGate.length, 6);
  assert.equal(new Set(launchGate.map((item) => item.slug)).size, 6);
  assert.deepEqual(
    launchGate.map((item) => item.slug),
    [
      'takken',
      'gyoseishoshi',
      'it-passport',
      'fundamental-it-engineer',
      'bookkeeping',
      'fp',
    ],
  );
  assert.ok(
    launchGate.every(
      (item) => Number.isInteger(item.expectedFacts) && item.expectedFacts > 0,
    ),
  );
  assert.ok(launchGate.every((item) => item.pageContains.length > 0));
  assert.equal(qualificationWebRoutes.length, 5);
  assert.equal(launchGate.length * qualificationWebRoutes.length, 30);
  assert.equal(baseline.version, 1);
  assert.deepEqual(launchGate, baseline.qualifications);
});

test('coverage gate reports field and dimension gaps even when fact counts are high', () => {
  const gaps = evaluateCoverage(
    'bookkeeping',
    [
      {
        examYear: 2026,
        factKey: 'exam_method',
        examLevelId: 'bookkeeping:2',
        deliveryMode: 'network',
      },
      {
        examYear: 2026,
        factKey: 'fee',
        examLevelId: 'bookkeeping:2',
        deliveryMode: 'network',
      },
    ],
    2026,
  );
  assert.ok(
    gaps.some(
      (gap) =>
        gap.field === 'exam_time' && gap.dimensions.deliveryMode === 'network',
    ),
  );
  assert.ok(gaps.some((gap) => gap.dimensions.deliveryMode === 'unified'));
});

test('coverage gaps require the partial public status', () => {
  assert.equal(expectedCoverageStatus([]), 'verified');
  assert.equal(
    expectedCoverageStatus([{ field: 'fee' }]),
    'partially_announced',
  );
});

test('empty section pages are accepted only as noindex empty states', () => {
  const page = evaluatePublicPage({
    suffix: 'pass-rate/',
    html: '<meta name="robots" content="noindex,follow"><h2>合格率・合格基準：公開できる公式情報はありません</h2><p>宅地建物取引士</p><p>合格率・合格基準</p>',
    statusLabel: '一部発表済み',
    pageContains: '宅地建物取引士',
    marker: '合格率・合格基準',
  });
  assert.deepEqual(page, { indexable: false, errors: [] });

  const missingMessage = evaluatePublicPage({
    suffix: 'pass-rate/',
    html: '<meta name="robots" content="noindex,follow">宅地建物取引士 合格率・合格基準',
    statusLabel: '一部発表済み',
    pageContains: '宅地建物取引士',
    marker: '合格率・合格基準',
  });
  assert.equal(missingMessage.indexable, false);
  assert.ok(
    missingMessage.errors.some((error) => error.includes('empty-section')),
  );
});

test('overview pages stay indexable and keep the publication status', () => {
  const page = evaluatePublicPage({
    suffix: '',
    html: '<meta name="robots" content="noindex,follow">宅地建物取引士',
    statusLabel: '公式確認済み',
    pageContains: '宅地建物取引士',
  });
  assert.equal(page.indexable, false);
  assert.ok(page.errors.includes('Web overview must stay indexable'));
  assert.ok(page.errors.some((error) => error.includes('公式確認済み')));
});

test('sitemap lists section pages if and only if they are indexable', () => {
  const sitemapXml =
    '<urlset><url><loc>https://example.test/shikaku/takken/</loc></url><url><loc>https://example.test/shikaku/takken/application/</loc></url></urlset>';
  assert.deepEqual(
    evaluateSitemapRoutes({
      routes: [
        { path: '/shikaku/takken/', indexable: true },
        { path: '/shikaku/takken/application/', indexable: true },
        { path: '/shikaku/takken/pass-rate/', indexable: false },
      ],
      sitemapXml,
    }),
    [],
  );
  assert.deepEqual(
    evaluateSitemapRoutes({
      routes: [
        { path: '/shikaku/takken/', indexable: false },
        { path: '/shikaku/takken/pass-rate/', indexable: true },
      ],
      sitemapXml,
    }),
    [
      'Sitemap lists the noindex /shikaku/takken/ page',
      'Sitemap missing the indexable /shikaku/takken/pass-rate/ page',
    ],
  );
  assert.deepEqual(
    evaluateSitemapRoutes({
      routes: [{ path: '/shikaku/takken/', indexable: true }],
      sitemapXml:
        '<urlset><url><loc>https://example.test/shikaku/takken/application/</loc></url></urlset>',
    }),
    ['Sitemap missing the indexable /shikaku/takken/ page'],
  );
  assert.deepEqual(
    evaluateSitemapRoutes({
      routes: [],
      sitemapXml: `${sitemapXml}?year=2026`,
    }),
    ['Sitemap lists a parameter-filtered page'],
  );
});

test('coverage gate fails after a required fact is removed and ignores duplicate noise', () => {
  const facts = [
    { examYear: 2026, factKey: 'exam_method' },
    { examYear: 2026, factKey: 'eligibility' },
    { examYear: 2026, factKey: 'fee' },
    { examYear: 2026, factKey: 'passing_standard' },
  ];
  assert.equal(evaluateCoverage('takken', facts, 2026).length > 0, true);
  const withoutFee = facts.filter((fact) => fact.factKey !== 'fee');
  withoutFee.push(
    ...Array.from({ length: 20 }, () => ({
      examYear: 2026,
      factKey: 'description',
    })),
  );
  const gaps = evaluateCoverage('takken', withoutFee, 2026);
  assert.ok(gaps.some((gap) => gap.field === 'fee'));
});

test('payment deadlines remain isolated by payment method', () => {
  const gaps = evaluateCoverage(
    'takken',
    [
      {
        examYear: 2026,
        factKey: 'payment_deadline',
        paymentMethod: 'convenience_store',
      },
    ],
    2026,
  );
  assert.equal(
    gaps.some(
      (gap) =>
        gap.field === 'payment_deadline' &&
        gap.dimensions.paymentMethod === 'convenience_store',
    ),
    false,
  );
  assert.equal(
    gaps.some(
      (gap) =>
        gap.field === 'payment_deadline' &&
        gap.dimensions.paymentMethod === 'pay_easy',
    ),
    true,
  );
});

test('exam_dates satisfies the frozen exam_date coverage requirement', () => {
  const qualification = coverageContract.qualifications.find(
    (item) => item.slug === 'fp',
  );
  const requirement = qualification.requirements.find(
    (item) =>
      item.dimensions.providerId === 'kinzai' &&
      item.dimensions.examComponent === 'practical:asset-consulting',
  );
  const facts = requirement.fields.map((factKey) => ({
    examYear: 2026,
    factKey: factKey === 'exam_date' ? 'exam_dates' : factKey,
    sourceUrl: 'https://www.kinzai.or.jp/fp/nittei-fp/48581.html',
    provenanceStatus: 'fixture',
    ...requirement.dimensions,
  }));
  const gaps = evaluateCoverage('fp', facts, 2026).filter(
    (gap) => gap.dimensions.examComponent === 'practical:asset-consulting',
  );
  assert.equal(
    gaps.some((gap) => gap.field === 'exam_date'),
    false,
  );
});

test('fixture provenance blocks the verified status without hiding business coverage', () => {
  const qualification = coverageContract.qualifications.find(
    (item) => item.slug === 'takken',
  );
  const facts = qualification.requirements
    .filter((requirement) => requirement.requiredLevel === 'required')
    .flatMap((requirement) =>
      requirement.fields
        .filter(
          (field) => field !== 'source_url' && field !== 'official_verified_at',
        )
        .map((factKey) => ({
          examYear: 2026,
          factKey,
          sourceUrl: 'https://www.retio.or.jp/exam/',
          provenanceStatus: 'fixture',
          ...requirement.dimensions,
        })),
    );
  const gaps = evaluateCoverage('takken', facts, 2026);
  assert.equal(
    gaps.some(
      (gap) =>
        gap.field === 'official_verified_at' &&
        gap.reason === 'missing approved provenance',
    ),
    true,
  );
  assert.equal(
    gaps.filter(
      (gap) =>
        gap.field !== 'source_url' && gap.field !== 'official_verified_at',
    ).length,
    0,
  );
  assert.equal(expectedCoverageStatus(gaps), 'partially_announced');
});
