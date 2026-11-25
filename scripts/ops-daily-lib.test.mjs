import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildDailyReport,
  buildFactsVsBaseline,
  buildNotificationHealth,
  buildSourceHealth,
  classifySource,
  computeCoverageGap,
  computeFailedStreak,
  groupChecksBySource,
  parseDeliveryLog,
  renderMarkdown,
} from './ops-daily-lib.mjs';

const now = new Date('2026-11-11T00:00:00Z');
const daysAgo = (days) =>
  new Date(now.getTime() - days * 86_400_000).toISOString();
const config = {
  consecutiveFailureThreshold: 3,
  sourceBehindDays: 7,
  goneStatusCodes: [404, 410],
  notificationFailureThreshold: 3,
  notificationStaleDays: 14,
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

// `status` is what the cron wrapper parses to tell a broken run from a working
// one, so it stays `ok` even when the report is full of critical findings. That
// used to be the only status in the document and read as "everything is fine".
test('a report with critical findings still reports itself as produced', () => {
  const report = reportFixture();
  assert.equal(report.hasCritical, true);
  assert.equal(report.status, 'ok');
  assert.equal(report.reportStatus, 'ok');
  // The health verdict is the separate field, and it must not disagree.
  assert.equal(report.overallStatus, 'action_needed');
});

test('a quiet report is ok in both senses', () => {
  const report = buildDailyReport({
    now: new Date('2026-11-25T00:00:00Z'),
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
    coverageGap: {
      status: 'ok',
      missingFromRegistry: [],
      missingFromDatabase: [],
    },
  });
  assert.equal(report.hasCritical, false);
  assert.equal(report.overallStatus, 'ok');
  assert.ok(renderMarkdown(report).includes('- 整体状态：正常'));
});

// The report used to print `qualification/examYear/factKey` and nothing else, so
// the seven 日商簿記 2026 fee facts (one per exam level × delivery mode) came out
// as seven identical lines and a reviewer could not tell them apart. Each line
// must now name the axes that actually distinguish the facts.
test('due facts that differ only in dimensions render as distinct actions', () => {
  const fact = (examLevelId, deliveryMode, ageDays) => ({
    factId: `fact:${examLevelId}:${deliveryMode}`,
    qualification: 'bookkeeping',
    examYear: 2026,
    factKey: 'fee',
    dimensions: { examLevelId, deliveryMode },
    displayValue: '7,500円',
    ageDays,
    windowDays: 90,
  });
  const report = buildDailyReport({
    now,
    config,
    sourceHealth: [],
    staleness: {
      referenceYear: 2026,
      summary: {
        approvedFacts: 6,
        historicalSkipped: 0,
        checked: 6,
        dueFacts: 6,
        sourcesBehindOnSnapshot: 0,
      },
      dueFacts: [
        fact('bookkeeping:1', 'unified', 100),
        fact('bookkeeping:1', 'network', 100),
        fact('bookkeeping:2', 'unified', 100),
        fact('bookkeeping:2', 'network', 100),
        fact('bookkeeping:3', 'unified', 100),
        fact('bookkeeping:3', 'network', 100),
      ],
      dueSources: [],
    },
    pendingReview: [],
    factsVsBaseline: [],
    coverageGap: {
      status: 'ok',
      missingFromRegistry: [],
      missingFromDatabase: [],
    },
  });

  const targets = report.todayActions
    .filter((action) => action.kind === 'due_fact')
    .map((action) => action.target);
  assert.equal(targets.length, 6);
  assert.equal(new Set(targets).size, 6);
  assert.equal(
    targets[0],
    'bookkeeping/2026/fee (examLevel=bookkeeping:1, delivery=unified)',
  );

  const markdown = renderMarkdown(report);
  const factLines = markdown
    .split('\n')
    .filter((line) => line.startsWith('- bookkeeping/2026/fee'));
  assert.equal(factLines.length, 6);
  assert.equal(new Set(factLines).size, 6);
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

// ---------------------------------------------------------------------------
// Notification channel (Sprint 3G Task B)
//
// The alert channel is judged from the local delivery log rather than by
// probing the webhook, because the daily report must not make network requests.
// A dead channel is the one failure that hides all the others, so it is graded
// at the same level as a dead source.
// ---------------------------------------------------------------------------

function delivery(at, ok, extra = {}) {
  return { at, ok, http: ok ? 200 : 500, curl: 0, attempts: 1, ...extra };
}

test('notification health: no records is not_run and stays info', () => {
  const health = buildNotificationHealth({ records: [], now, config });
  assert.equal(health.status, 'not_run');
  assert.equal(health.level, 'info');
  assert.equal(health.consecutiveFailures, 0);
});

test('notification health: a recent success is healthy', () => {
  const health = buildNotificationHealth({
    records: [delivery(daysAgo(1), true)],
    now,
    config,
  });
  assert.equal(health.status, 'ok');
  assert.equal(health.level, 'info');
  assert.equal(health.reason, 'healthy');
  assert.equal(health.lastOk, true);
  assert.equal(health.ageDays, 1);
});

test('notification health: one failure is a warning, not critical', () => {
  const health = buildNotificationHealth({
    records: [delivery(daysAgo(2), true), delivery(daysAgo(1), false)],
    now,
    config,
  });
  assert.equal(health.level, 'warning');
  assert.equal(health.reason, 'recent_failure');
  assert.equal(health.consecutiveFailures, 1);
  // The fixture has no `reason` field, which is what a pre-3G log line looks
  // like; it must read as "unknown", not crash the report.
  assert.equal(health.lastFailureReason, null);
});

test('notification health: consecutive failures reach critical', () => {
  const health = buildNotificationHealth({
    records: [
      delivery(daysAgo(5), true),
      delivery(daysAgo(3), false, { reason: 'unreachable' }),
      delivery(daysAgo(2), false, { reason: 'unreachable' }),
      delivery(daysAgo(1), false, { reason: 'bad-token' }),
    ],
    now,
    config,
  });
  assert.equal(health.level, 'critical');
  assert.equal(health.reason, 'consecutive_failures');
  assert.equal(health.consecutiveFailures, 3);
  assert.equal(health.lastFailureReason, 'bad-token');
  assert.equal(health.lastSuccessAt, daysAgo(5));
});

test('notification health: a quiet channel past the window is stale', () => {
  const health = buildNotificationHealth({
    records: [delivery(daysAgo(30), true)],
    now,
    config,
  });
  assert.equal(health.level, 'warning');
  assert.equal(health.reason, 'channel_stale');
  assert.equal(health.ageDays, 30);
});

test('notification health: records are ordered by timestamp, not file order', () => {
  const health = buildNotificationHealth({
    records: [
      delivery(daysAgo(1), false, { reason: 'bad-token' }),
      delivery(daysAgo(9), true),
    ],
    now,
    config,
  });
  assert.equal(health.lastOk, false);
  assert.equal(health.consecutiveFailures, 1);
  assert.equal(health.lastFailureReason, 'bad-token');
});

test('parseDeliveryLog skips a truncated last line without throwing', () => {
  const text = [
    JSON.stringify(delivery(daysAgo(1), true)),
    '{"at":"2026-11-11T00:00:00Z","ok":tr',
    '',
  ].join('\n');
  const { records, skipped } = parseDeliveryLog(text);
  assert.equal(records.length, 1);
  assert.equal(skipped, 1);
});

test('parseDeliveryLog handles empty and missing text', () => {
  assert.deepEqual(parseDeliveryLog(''), { records: [], skipped: 0 });
  assert.deepEqual(parseDeliveryLog(undefined), { records: [], skipped: 0 });
});

function channelReport(records) {
  return buildDailyReport({
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
    coverageGap: {
      status: 'ok',
      missingFromRegistry: [],
      missingFromDatabase: [],
    },
    notificationChannel: buildNotificationHealth({ records, now, config }),
  });
}

test('a dead notification channel is critical on its own', () => {
  const report = channelReport([
    delivery(daysAgo(3), false, { reason: 'bad-token' }),
    delivery(daysAgo(2), false, { reason: 'bad-token' }),
    delivery(daysAgo(1), false, { reason: 'bad-token' }),
  ]);
  assert.equal(report.summary.notificationLevel, 'critical');
  // No source is broken, yet the report must not be green: every future alert
  // would be lost, so the exit code has to go non-zero.
  assert.equal(report.hasCritical, true);
  assert.equal(report.todayActions[0].kind, 'notification_channel');
});

test('a warning-level channel does not add an action or flip hasCritical', () => {
  const report = channelReport([delivery(daysAgo(1), true)]);
  assert.equal(report.summary.notificationLevel, 'info');
  assert.equal(report.hasCritical, false);
  assert.deepEqual(report.todayActions, []);
});

test('markdown renders the notification channel section', () => {
  const healthy = renderMarkdown(channelReport([delivery(daysAgo(1), true)]));
  assert.ok(healthy.includes('## 通知渠道'));
  assert.ok(healthy.includes('最近一次投递'));

  const stale = renderMarkdown(channelReport([delivery(daysAgo(30), true)]));
  assert.ok(stale.includes('没有成功投递'));

  const never = renderMarkdown(channelReport([]));
  assert.ok(never.includes('未检查'));
});
