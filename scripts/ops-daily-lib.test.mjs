import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDailyReport,
  buildFactsVsBaseline,
  buildSourceHealth,
  classifySource,
  computeCoverageGap,
  computeFailedStreak,
  groupChecksBySource,
  renderMarkdown,
} from './ops-daily-lib.mjs';

const now = new Date('2026-11-11T00:00:00Z');
const daysAgo = (days) =>
  new Date(now.getTime() - days * 86_400_000).toISOString();
const config = {
  consecutiveFailureThreshold: 3,
  sourceBehindDays: 7,
  goneStatusCodes: [404, 410],
};

function check(status, days, httpStatus = 200) {
  return { checked_at: daysAgo(days), status, http_status: httpStatus };
}

test('failed streak counts leading failures only', () => {
  assert.equal(computeFailedStreak([]), 0);
  assert.equal(
    computeFailedStreak([
      check('failed', 0),
      check('failed', 1),
      check('unchanged', 2),
      check('failed', 3),
    ]),
    2,
  );
  assert.equal(
    computeFailedStreak([check('blocked', 0), check('failed', 1)]),
    0,
  );
});

test('three consecutive failures are critical', () => {
  const result = classifySource(
    {
      lastCheck: check('failed', 0),
      failedStreak: 3,
      lastSuccessAt: daysAgo(4),
      now,
    },
    config,
  );
  assert.equal(result.level, 'critical');
  assert.ok(result.reasons.includes('consecutive_failures'));
});

test('blocked and gone statuses are critical on a single check', () => {
  const blocked = classifySource(
    {
      lastCheck: check('blocked', 0),
      failedStreak: 0,
      lastSuccessAt: daysAgo(1),
      now,
    },
    config,
  );
  assert.equal(blocked.level, 'critical');
  assert.ok(blocked.reasons.includes('blocked'));
  const gone = classifySource(
    {
      lastCheck: check('failed', 0, 404),
      failedStreak: 1,
      lastSuccessAt: daysAgo(1),
      now,
    },
    config,
  );
  assert.equal(gone.level, 'critical');
  assert.ok(gone.reasons.includes('gone_status'));
});

test('one or two failures and stale sources are warnings', () => {
  const recent = classifySource(
    {
      lastCheck: check('failed', 0),
      failedStreak: 2,
      lastSuccessAt: daysAgo(3),
      now,
    },
    config,
  );
  assert.equal(recent.level, 'warning');
  const behind = classifySource(
    {
      lastCheck: check('unchanged', 8),
      failedStreak: 0,
      lastSuccessAt: daysAgo(8),
      now,
    },
    config,
  );
  assert.equal(behind.level, 'warning');
  assert.ok(behind.reasons.includes('source_behind'));
  const never = classifySource(
    { lastCheck: null, failedStreak: 0, lastSuccessAt: null, now },
    config,
  );
  assert.equal(never.level, 'warning');
});

test('a fresh unchanged source is info', () => {
  const result = classifySource(
    {
      lastCheck: check('unchanged', 1),
      failedStreak: 0,
      lastSuccessAt: daysAgo(1),
      now,
    },
    config,
  );
  assert.equal(result.level, 'info');
  assert.deepEqual(result.reasons, []);
});

test('source health sorts critical first and carries streaks', () => {
  const sources = [
    {
      id: 'source:ok',
      canonical_url: 'https://a.example/',
      qualification: 'fp',
    },
    {
      id: 'source:bad',
      canonical_url: 'https://b.example/',
      qualification: 'takken',
    },
  ];
  const checks = groupChecksBySource([
    { source_id: 'source:bad', ...check('failed', 0) },
    { source_id: 'source:bad', ...check('failed', 1) },
    { source_id: 'source:bad', ...check('failed', 2) },
    { source_id: 'source:ok', ...check('unchanged', 0) },
  ]);
  const health = buildSourceHealth(sources, checks, now, config);
  assert.equal(health[0].sourceId, 'source:bad');
  assert.equal(health[0].level, 'critical');
  assert.equal(health[0].failedStreak, 3);
  assert.equal(health[1].level, 'info');
});

test('coverage gap reports both directions', () => {
  const gap = computeCoverageGap(['a', 'b', 'c'], ['b', 'c', 'd']);
  assert.deepEqual(gap.missingFromRegistry, ['a']);
  assert.deepEqual(gap.missingFromDatabase, ['d']);
});

test('facts versus baseline computes deltas and defaults missing to zero', () => {
  const baseline = {
    qualifications: [
      { slug: 'fp', expectedFacts: 75 },
      { slug: 'takken', expectedFacts: 16 },
    ],
  };
  const rows = buildFactsVsBaseline([{ slug: 'fp', approved: 80 }], baseline);
  assert.deepEqual(rows[0], {
    slug: 'fp',
    approved: 80,
    expected: 75,
    delta: 5,
  });
  assert.deepEqual(rows[1], {
    slug: 'takken',
    approved: 0,
    expected: 16,
    delta: -16,
  });
});

function reportFixture() {
  const sourceHealth = buildSourceHealth(
    [
      {
        id: 'source:bad',
        canonical_url: 'https://b.example/',
        qualification: 'takken',
      },
    ],
    groupChecksBySource([
      { source_id: 'source:bad', ...check('failed', 0, 404) },
    ]),
    now,
    config,
  );
  return buildDailyReport({
    now,
    config,
    sourceHealth,
    staleness: {
      referenceYear: 2026,
      summary: {
        approvedFacts: 1,
        historicalSkipped: 0,
        checked: 1,
        dueFacts: 1,
        sourcesBehindOnSnapshot: 0,
      },
      dueFacts: [
        {
          factId: 'fact:1',
          qualification: 'fp',
          examYear: 2026,
          factKey: 'fee',
          ageDays: 100,
          windowDays: 90,
        },
      ],
      dueSources: [],
    },
    pendingReview: [{ slug: 'it-passport', pending: 2 }],
    factsVsBaseline: [{ slug: 'fp', approved: 75, expected: 75, delta: 0 }],
    coverageGap: {
      status: 'ok',
      missingFromRegistry: [],
      missingFromDatabase: [],
    },
  });
}

test('daily report orders actions critical then pending then due', () => {
  const report = reportFixture();
  assert.equal(report.hasCritical, true);
  assert.equal(report.summary.critical, 1);
  assert.equal(report.summary.pendingReview, 2);
  assert.deepEqual(
    report.todayActions.map((action) => action.kind),
    ['source_critical', 'pending_review', 'due_fact'],
  );
});

test('markdown renders the action list and source table', () => {
  const markdown = renderMarkdown(reportFixture());
  assert.ok(markdown.includes('今日需处理'));
  assert.ok(markdown.includes('source:bad'));
  assert.ok(markdown.includes('source_critical'));
  assert.ok(markdown.includes('facts 对基线'));
});

test('empty report says there is nothing to handle', () => {
  const report = buildDailyReport({
    now,
    config,
    sourceHealth: [],
    staleness: {
      referenceYear: 2026,
      summary: {
        approvedFacts: 0,
        historicalSkipped: 0,
        checked: 0,
        dueFacts: 0,
        sourcesBehindOnSnapshot: 0,
      },
      dueFacts: [],
      dueSources: [],
    },
    pendingReview: [],
    factsVsBaseline: [],
    coverageGap: { status: 'not_run', reason: 'missing registry' },
  });
  assert.equal(report.hasCritical, false);
  assert.equal(report.summary.coverageGap, null);
  assert.ok(renderMarkdown(report).includes('无。所有来源健康'));
});
