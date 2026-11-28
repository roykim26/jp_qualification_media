import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDataQualityReport,
  FRESHNESS_WINDOW_DAYS,
} from './quality-score-lib.mjs';

const NOW = Date.parse('2026-11-28T00:00:00Z');

function row(overrides = {}) {
  return {
    fact_id: 'fact:1',
    qualification_slug: 'takken',
    provider_id: null,
    exam_level_id: null,
    exam_component: null,
    delivery_mode: null,
    payment_method: null,
    exam_year: 2026,
    exam_session: null,
    fact_key: 'fee',
    display_value: '8,200円',
    value_type: 'money',
    normalized_value: 8200,
    source_id: 'source:1',
    source_snapshot_id: 'snapshot:1',
    snapshot_id: 'snapshot:1',
    snapshot_source_id: 'source:1',
    snapshot_synthetic: false,
    content_hash: 'hash',
    object_key: 'evidence/1.json',
    canonical_url: 'https://example.test/official',
    allowed_domain: 'example.test',
    latest_review_decision: 'approve',
    latest_review_at: '2026-11-20T00:00:00Z',
    snapshot_retrieved_at: '2026-11-20T00:00:00Z',
    ...overrides,
  };
}

function report(rows, extra = {}) {
  return buildDataQualityReport({
    rows,
    coverage: { gaps: [], expected: 0, satisfied: 0, notApplicable: 0 },
    nowMs: NOW,
    ...extra,
  });
}

function dimension(result, key) {
  return result.dimensions.find((entry) => entry.key === key);
}

test('scores provenance as a ratio, not as a fact count', () => {
  const one = report([row()]);
  const many = report(
    Array.from({ length: 20 }, (_, index) => row({ fact_id: `fact:${index}` })),
  );
  assert.equal(dimension(one, 'source').score, 100);
  assert.equal(dimension(many, 'source').score, 100);
  assert.equal(one.overallScore, many.overallScore);

  const half = report([
    row({ fact_id: 'fact:ok' }),
    row({ fact_id: 'fact:bad', content_hash: null }),
  ]);
  const quarter = report([
    row({ fact_id: 'fact:ok' }),
    row({ fact_id: 'fact:bad', content_hash: null }),
    row({ fact_id: 'fact:ok2' }),
    row({ fact_id: 'fact:ok3' }),
  ]);
  assert.equal(dimension(half, 'source').score, 50);
  assert.equal(dimension(quarter, 'source').score, 75);
});

test('scope completeness only applies to multi-scope qualifications', () => {
  const takken = report([
    row({
      fact_key: 'exam_date',
      value_type: 'date',
      normalized_value: '2026-10-18',
    }),
  ]);
  assert.equal(dimension(takken, 'scope').denominator, 0);
  assert.equal(dimension(takken, 'scope').score, null);

  const fp = report([
    row({
      qualification_slug: 'fp',
      fact_key: 'exam_date',
      value_type: 'date',
      normalized_value: '2026-10-18',
    }),
  ]);
  assert.equal(dimension(fp, 'scope').denominator, 1);
  assert.equal(dimension(fp, 'scope').score, 0);
  assert.deepEqual(dimension(fp, 'scope').missing, [
    {
      reason: 'fp:provider_id+exam_level_id+exam_component+delivery_mode',
      count: 1,
    },
  ]);

  const scoped = report([
    row({
      qualification_slug: 'fp',
      provider_id: 'jafp',
      exam_level_id: 'fp:2',
      exam_component: 'academic',
      delivery_mode: 'cbt',
      fact_key: 'exam_date',
      value_type: 'date',
      normalized_value: '2026-10-18',
    }),
  ]);
  assert.equal(dimension(scoped, 'scope').score, 100);
});

test('freshness excludes unknown capture times and flags the rest', () => {
  const fresh = report([row()]);
  assert.equal(dimension(fresh, 'freshness').score, 100);
  assert.equal(dimension(fresh, 'freshness').unknown, 0);

  const stale = report([
    row({
      snapshot_retrieved_at: new Date(
        NOW - (FRESHNESS_WINDOW_DAYS + 1) * 86_400_000,
      ).toISOString(),
    }),
  ]);
  assert.equal(dimension(stale, 'freshness').score, 0);

  const unknown = report([row({ snapshot_retrieved_at: null })]);
  assert.equal(dimension(unknown, 'freshness').denominator, 0);
  assert.equal(dimension(unknown, 'freshness').unknown, 1);
});

test('consistency flags conflicting display values within one identity', () => {
  const consistent = report([
    row({ fact_id: 'fact:1' }),
    row({ fact_id: 'fact:2' }),
  ]);
  assert.equal(dimension(consistent, 'consistency').score, 100);

  const conflicting = report([
    row({ fact_id: 'fact:1', display_value: '8,200円' }),
    row({ fact_id: 'fact:2', display_value: '9,000円' }),
  ]);
  assert.equal(dimension(conflicting, 'consistency').score, 0);
  assert.equal(conflicting.status, 'blocked');
});

test('a duplicate without a session label is debt, not a proven conflict', () => {
  const result = report([
    row({
      qualification_slug: 'bookkeeping',
      exam_level_id: 'bookkeeping:2',
      delivery_mode: 'unified',
      fact_key: 'applicants',
      value_type: 'integer',
      normalized_value: 100,
      display_value: '100名（101回）',
    }),
    row({
      qualification_slug: 'bookkeeping',
      exam_level_id: 'bookkeeping:2',
      delivery_mode: 'unified',
      fact_key: 'applicants',
      value_type: 'integer',
      normalized_value: 120,
      display_value: '120名（102回）',
    }),
  ]);
  const consistency = dimension(result, 'consistency');
  assert.deepEqual(consistency.missing, [
    { reason: 'unlabelled_series', count: 1 },
  ]);
  assert.deepEqual(dimension(result, 'scope').missing, [
    { reason: 'bookkeeping:exam_session', count: 2 },
  ]);
  assert.equal(result.status, 'warning');
  assert.equal(result.gates.blocking.length, 0);
});

test('calendar correctness only inspects date-typed facts', () => {
  const nonDate = report([row({ value_type: 'text' })]);
  assert.equal(dimension(nonDate, 'calendar').denominator, 0);

  const good = report([
    row({
      fact_key: 'exam_date',
      value_type: 'date',
      normalized_value: '2026-10-18',
    }),
  ]);
  assert.equal(dimension(good, 'calendar').score, 100);

  const sentinel = report([
    row({
      fact_key: 'exam_schedule',
      value_type: 'date',
      normalized_value: 'year_round',
    }),
  ]);
  assert.equal(dimension(sentinel, 'calendar').score, 100);

  const bad = report([
    row({
      fact_key: 'exam_date',
      value_type: 'date',
      normalized_value: 'sometime in autumn',
    }),
  ]);
  assert.equal(dimension(bad, 'calendar').score, 0);
  assert.equal(bad.status, 'blocked');
});

test('coverage distinguishes missing cells from n/a and known debt', () => {
  const result = buildDataQualityReport({
    rows: [row()],
    coverage: {
      gaps: [{ reason: 'missing approved fact', dimensionMismatch: false }],
      expected: 4,
      satisfied: 3,
      notApplicable: 7,
    },
    knownGapCount: 2,
    newGapCount: 0,
    nowMs: NOW,
  });
  const coverage = dimension(result, 'coverage');
  assert.equal(coverage.denominator, 4);
  assert.equal(coverage.numerator, 3);
  assert.equal(coverage.score, 75);
  assert.equal(coverage.notApplicable, 7);
  assert.equal(result.gates.knownDebt[0].count, 2);
  assert.equal(result.status, 'warning');
});

test('a new unknown gap is blocking even when everything else passes', () => {
  const result = buildDataQualityReport({
    rows: [row()],
    coverage: { gaps: [], expected: 1, satisfied: 1, notApplicable: 0 },
    knownGapCount: 0,
    newGapCount: 1,
    nowMs: NOW,
  });
  assert.equal(result.status, 'blocked');
  assert.deepEqual(result.gates.blocking[0], {
    dimension: 'coverage',
    reason: 'gap keys not present in the accepted baseline',
    count: 1,
  });
});
