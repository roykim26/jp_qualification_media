import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ageInDays,
  computeStaleness,
  factWindowDays,
  referenceYear,
  windowsDays,
} from './staleness-lib.mjs';

const now = new Date('2026-11-11T00:00:00Z');
const daysAgo = (days) =>
  new Date(now.getTime() - days * 86_400_000).toISOString();

function row(overrides = {}) {
  return {
    fact_id: 'fact:1',
    exam_year: 2026,
    fact_key: 'fee',
    display_value: '7,500円',
    verified_at: daysAgo(1),
    qualification_slug: 'fundamental-it-engineer',
    source_id: 'source:fundamental-it:ipa-fee',
    canonical_url: 'https://www.ipa.go.jp/shiken/mousikomi/schedule.html',
    last_snapshot_at: daysAgo(1),
    ...overrides,
  };
}

test('fact windows follow the documented categories', () => {
  assert.deepEqual(factWindowDays('fee'), { windowDays: 90, reason: 'fee' });
  assert.deepEqual(factWindowDays('fee_1'), { windowDays: 90, reason: 'fee' });
  assert.deepEqual(factWindowDays('payment_method'), {
    windowDays: 90,
    reason: 'fee',
  });
  assert.deepEqual(factWindowDays('eligibility'), {
    windowDays: 180,
    reason: 'eligibility',
  });
  assert.deepEqual(factWindowDays('application_rule'), {
    windowDays: 180,
    reason: 'eligibility',
  });
  assert.deepEqual(factWindowDays('pass_rate'), {
    windowDays: 365,
    reason: 'statistics',
  });
  assert.deepEqual(factWindowDays('exam_date'), {
    windowDays: 365,
    reason: 'annual',
  });
});

test('ageInDays floors to whole days and tolerates missing values', () => {
  assert.equal(ageInDays(null, now), null);
  assert.equal(ageInDays('not-a-date', now), null);
  assert.equal(ageInDays(daysAgo(3), now), 3);
  assert.equal(
    ageInDays(new Date(now.getTime() - 3.9 * 86_400_000).toISOString(), now),
    3,
  );
});

test('referenceYear uses the JST calendar year', () => {
  assert.equal(referenceYear(now), 2026);
  assert.equal(referenceYear(new Date('2026-12-31T20:00:00Z')), 2027);
});

test('staleness is strictly greater than the window', () => {
  const due = computeStaleness([row({ verified_at: daysAgo(91) })], now);
  assert.equal(due.summary.dueFacts, 1);
  assert.equal(due.dueFacts[0].ageDays, 91);
  assert.equal(due.dueFacts[0].windowDays, 90);
  const fresh = computeStaleness([row({ verified_at: daysAgo(90) })], now);
  assert.equal(fresh.summary.dueFacts, 0);
});

test('historical exam years are skipped entirely', () => {
  const result = computeStaleness(
    [row({ exam_year: 2025, verified_at: daysAgo(900) })],
    now,
  );
  assert.equal(result.summary.historicalSkipped, 1);
  assert.equal(result.summary.checked, 0);
  assert.equal(result.summary.dueFacts, 0);
  assert.equal(result.summary.sourcesBehindOnSnapshot, 0);
});

test('sources are deduplicated and never-captured sources sort first', () => {
  const result = computeStaleness(
    [
      row({ fact_id: 'fact:1', last_snapshot_at: daysAgo(10) }),
      row({ fact_id: 'fact:2', last_snapshot_at: daysAgo(10) }),
      row({
        fact_id: 'fact:3',
        source_id: 'source:other',
        last_snapshot_at: null,
      }),
    ],
    now,
  );
  assert.equal(result.summary.sourcesBehindOnSnapshot, 2);
  assert.equal(result.dueSources[0].sourceId, 'source:other');
  assert.equal(result.dueSources[0].ageDays, null);
  assert.equal(result.dueSources[1].ageDays, 10);
});

test('due facts sort by overdue ratio and summary counts match', () => {
  const result = computeStaleness(
    [
      row({ fact_id: 'fact:fee', fact_key: 'fee', verified_at: daysAgo(100) }),
      row({
        fact_id: 'fact:annual',
        fact_key: 'exam_date',
        verified_at: daysAgo(400),
      }),
    ],
    now,
  );
  assert.equal(result.summary.approvedFacts, 2);
  assert.equal(result.summary.checked, 2);
  assert.equal(result.dueFacts[0].factId, 'fact:fee');
  assert.deepEqual(result.windowsDays ?? windowsDays, windowsDays);
});
