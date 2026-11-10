import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { evaluateMvpCoverage } from './mvp-coverage.mjs';

function fact(overrides = {}) {
  return {
    qualificationSlug: 'bookkeeping',
    examYear: 2026,
    examLevelId: 'bookkeeping:2',
    deliveryMode: 'unified',
    factKey: 'fee',
    sourceUrl: 'https://example.test/official',
    provenanceStatus: 'verified',
    officialVerifiedAt: '2026-11-10T00:00:00Z',
    ...overrides,
  };
}

test('empty conditional scopes remain visible as MVP gaps', () => {
  const gaps = evaluateMvpCoverage([], 2026);
  for (const qualificationSlug of ['it-passport', 'fundamental-it-engineer']) {
    assert.ok(
      gaps.some(
        (gap) =>
          gap.qualificationSlug === qualificationSlug && gap.field === 'fee',
      ),
    );
  }
});

test('one bookkeeping level cannot satisfy a different level', () => {
  const gaps = evaluateMvpCoverage([fact()], 2026).filter(
    (gap) => gap.qualificationSlug === 'bookkeeping' && gap.field === 'fee',
  );
  assert.equal(
    gaps.some(
      (gap) =>
        gap.dimensions.examLevelId === 'bookkeeping:2' &&
        gap.dimensions.deliveryMode === 'unified',
    ),
    false,
  );
  assert.ok(gaps.some((gap) => gap.dimensions.examLevelId === 'bookkeeping:3'));
  assert.ok(gaps.some((gap) => gap.dimensions.deliveryMode === 'network'));
});

test('FP checks each launched provider, level and component without expanding the launch scope', () => {
  const gaps = evaluateMvpCoverage([], 2026).filter(
    (gap) => gap.qualificationSlug === 'fp',
  );
  assert.ok(
    gaps.some(
      (gap) =>
        gap.dimensions.providerId === 'jafp' &&
        gap.dimensions.examLevelId === 'fp:3' &&
        gap.dimensions.examComponent === 'practical:asset-design',
    ),
  );
  assert.equal(
    gaps.some(
      (gap) =>
        gap.dimensions.providerId === 'kinzai' &&
        gap.dimensions.examLevelId === 'fp:2',
    ),
    false,
  );
  assert.equal(
    gaps.some(
      (gap) =>
        gap.dimensions.providerId === 'jafp' &&
        gap.dimensions.examLevelId === 'fp:1',
    ),
    false,
  );
});

for (const component of ['a', 'b']) {
  test(`FE subject ${component} keys satisfy only their own explicitly scoped component`, () => {
    const other = component === 'a' ? 'b' : 'a';
    const gaps = evaluateMvpCoverage(
      ['time', 'question_count', 'format'].map((suffix) =>
        fact({
          qualificationSlug: 'fundamental-it-engineer',
          examLevelId: null,
          deliveryMode: 'cbt',
          examComponent: `subject-${component}`,
          factKey: `exam_subject_${component}_${suffix}`,
        }),
      ),
      2026,
    ).filter((gap) => gap.qualificationSlug === 'fundamental-it-engineer');
    for (const field of ['exam_time', 'question_count', 'question_format']) {
      assert.equal(
        gaps.some(
          (gap) =>
            gap.field === field &&
            gap.dimensions.examComponent === `subject-${component}`,
        ),
        false,
      );
      assert.ok(
        gaps.some(
          (gap) =>
            gap.field === field &&
            gap.dimensions.examComponent === `subject-${other}`,
        ),
      );
    }
  });
}

test('unscoped FE subject keys do not satisfy an explicitly scoped component', () => {
  const gaps = evaluateMvpCoverage(
    [
      fact({
        qualificationSlug: 'fundamental-it-engineer',
        examLevelId: null,
        deliveryMode: 'cbt',
        examComponent: null,
        factKey: 'exam_subject_a_format',
      }),
    ],
    2026,
  );
  assert.ok(
    gaps.some(
      (gap) =>
        gap.qualificationSlug === 'fundamental-it-engineer' &&
        gap.field === 'question_format' &&
        gap.dimensions.examComponent === 'subject-a',
    ),
  );
});

test('past-year facts cannot satisfy the release year', () => {
  const gaps = evaluateMvpCoverage([fact()], 2027);
  assert.ok(
    gaps.some(
      (gap) =>
        gap.qualificationSlug === 'bookkeeping' &&
        gap.field === 'fee' &&
        gap.dimensions.examLevelId === 'bookkeeping:2' &&
        gap.dimensions.deliveryMode === 'unified',
    ),
  );
});

test('fixture metadata never counts as official verification', () => {
  const gaps = evaluateMvpCoverage(
    [fact({ provenanceStatus: 'fixture' })],
    2026,
  ).filter(
    (gap) =>
      gap.qualificationSlug === 'bookkeeping' &&
      gap.dimensions.examLevelId === 'bookkeeping:2' &&
      gap.dimensions.deliveryMode === 'unified',
  );
  assert.ok(gaps.some((gap) => gap.field === 'source_url'));
  assert.ok(gaps.some((gap) => gap.field === 'official_verified_at'));
});

test('optional history and unpublished CBT dates do not block the core MVP', () => {
  const gaps = evaluateMvpCoverage([], 2026);
  assert.equal(
    gaps.some((gap) => gap.field === 'pass_rate'),
    false,
  );
  assert.equal(
    gaps.some(
      (gap) =>
        gap.qualificationSlug === 'it-passport' && gap.field === 'exam_date',
    ),
    false,
  );
  assert.ok(
    gaps.some(
      (gap) =>
        gap.qualificationSlug === 'takken' &&
        gap.field === 'payment_deadline' &&
        gap.dimensions.paymentMethod === 'pay_easy',
    ),
  );
});

test('MVP audit without a database reports not_run with a non-success exit code', () => {
  const result = spawnSync(process.execPath, ['scripts/audit-mvp.mjs'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: { ...process.env, DATABASE_URL: '' },
  });
  assert.equal(result.status, 2);
  assert.equal(JSON.parse(result.stdout).status, 'not_run');
});

test('MVP audit rejects malformed year arguments before connecting', () => {
  for (const argument of ['--year=NaN', '--year=1999', '--unknown']) {
    const result = spawnSync(
      process.execPath,
      ['scripts/audit-mvp.mjs', argument],
      {
        cwd: new URL('..', import.meta.url),
        encoding: 'utf8',
        env: { ...process.env, DATABASE_URL: '' },
      },
    );
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/);
  }
});
