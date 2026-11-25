import { ageInDays, formatFactTarget } from './staleness-lib.mjs';

export function groupChecksBySource(checks) {
  const grouped = new Map();
  for (const check of checks) {
    if (!grouped.has(check.source_id)) grouped.set(check.source_id, []);
    grouped.get(check.source_id).push(check);
  }
  return grouped;
}

export function computeFailedStreak(checksDesc) {
  let streak = 0;
  for (const check of checksDesc) {
    if (check.status === 'failed') streak += 1;
    else break;
  }
  return streak;
}

export function classifySource(
  { lastCheck, failedStreak, lastSuccessAt, now },
  config,
) {
  const reasons = [];
  let level = 'info';
  if (lastCheck && config.goneStatusCodes.includes(lastCheck.http_status)) {
    level = 'critical';
    reasons.push('gone_status');
  }
  if (lastCheck && lastCheck.status === 'blocked') {
    level = 'critical';
    reasons.push('blocked');
  }
  if (failedStreak >= config.consecutiveFailureThreshold) {
    level = 'critical';
    reasons.push('consecutive_failures');
  }
  if (level !== 'critical') {
    if (failedStreak > 0) {
      level = 'warning';
      reasons.push('recent_failures');
    }
    const age = ageInDays(lastSuccessAt, now);
    if (age === null || age > config.sourceBehindDays) {
      level = 'warning';
      reasons.push('source_behind');
    }
  }
  return { level, reasons };
}

const levelRank = { critical: 0, warning: 1, info: 2 };

export function buildSourceHealth(sources, checksBySource, now, config) {
  const health = sources.map((source) => {
    const checks = checksBySource.get(source.id) ?? [];
    const lastCheck = checks[0] ?? null;
    const failedStreak = computeFailedStreak(checks);
    const lastSuccess = checks.find(
      (check) => check.status === 'unchanged' || check.status === 'changed',
    );
    const lastSuccessAt = lastSuccess ? lastSuccess.checked_at : null;
    const { level, reasons } = classifySource(
      { lastCheck, failedStreak, lastSuccessAt, now },
      config,
    );
    return {
      sourceId: source.id,
      canonicalUrl: source.canonical_url,
      qualification: source.qualification,
      lastCheckedAt: lastCheck ? lastCheck.checked_at : null,
      lastStatus: lastCheck ? lastCheck.status : null,
      lastHttpStatus: lastCheck ? lastCheck.http_status : null,
      failedStreak,
      lastSuccessAt,
      level,
      reasons,
    };
  });
  health.sort(
    (a, b) =>
      levelRank[a.level] - levelRank[b.level] ||
      b.failedStreak - a.failedStreak ||
      a.sourceId.localeCompare(b.sourceId),
  );
  return health;
}

/**
 * Compare the sources registered in the database with the ones the patrol
 * registry knows about.
 *
 * The registry argument is the parsed registry *object*, not a list of ids,
 * because `capture_only` lives in it. Capture-only sources are fetched for
 * provenance but deliberately never written to the candidate or approval chain
 * (docs/work-package-g-provenance-projection-design.md), so "not in the
 * database" is their design rather than a gap. Reporting them as gaps put the
 * same nine lines into every daily report, which is how a section teaches its
 * readers to skip it. They are counted separately instead.
 *
 * An entry that predates the `capture_only` flag is treated as "should be in
 * the database", so an old registry keeps reporting real gaps.
 */
export function computeCoverageGap(dbSourceIds, registry) {
  if (Array.isArray(registry)) {
    throw new TypeError(
      'computeCoverageGap expects the parsed registry object (capture_only lives in it), not a list of ids',
    );
  }
  const database = new Set(dbSourceIds);
  const registeredIds = Object.keys(registry ?? {});
  const inRegistry = new Set(registeredIds);
  const captureOnlyIds = new Set(
    registeredIds.filter((id) => registry[id]?.capture_only === true),
  );
  return {
    status: 'ok',
    missingFromRegistry: dbSourceIds.filter((id) => !inRegistry.has(id)),
    missingFromDatabase: registeredIds.filter(
      (id) => !database.has(id) && !captureOnlyIds.has(id),
    ),
    captureOnly: captureOnlyIds.size,
  };
}

/**
 * Health of the alert channel itself, judged from the append-only delivery log
 * that scripts/notify-feishu.sh writes.
 *
 * This exists because a broken alert channel is worse than a broken source: the
 * source failure is loud, while a revoked webhook makes every future alert
 * disappear without a trace. It is judged from a local file on purpose — the
 * daily report is a read-only database inspection and must not start making
 * network requests (see docs/runbook.md, "人工日检").
 *
 * The `channel_stale` verdict is deliberately a warning, not a conclusion:
 * fourteen quiet days can mean "nothing broke" or "the webhook died", and only
 * a human can tell which.
 */
export function buildNotificationHealth({ records, now, config, reason }) {
  const failureThreshold = config.notificationFailureThreshold ?? 3;
  const staleDays = config.notificationStaleDays ?? 14;

  if (!Array.isArray(records) || records.length === 0) {
    return {
      status: 'not_run',
      level: 'info',
      reason: reason ?? 'no delivery records yet',
      lastAt: null,
      lastOk: null,
      consecutiveFailures: 0,
      lastSuccessAt: null,
      lastFailureReason: null,
    };
  }

  const ordered = [...records].sort((a, b) => {
    const left = Date.parse(a?.at ?? '') || 0;
    const right = Date.parse(b?.at ?? '') || 0;
    return left - right;
  });

  const last = ordered[ordered.length - 1];
  let consecutiveFailures = 0;
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    if (ordered[index]?.ok === true) break;
    consecutiveFailures += 1;
  }
  const lastSuccess = [...ordered].reverse().find((item) => item?.ok === true);
  const lastFailure = [...ordered].reverse().find((item) => item?.ok !== true);

  let level = 'info';
  let verdict = 'healthy';
  if (last?.ok !== true) {
    if (consecutiveFailures >= failureThreshold) {
      level = 'critical';
      verdict = 'consecutive_failures';
    } else {
      level = 'warning';
      verdict = 'recent_failure';
    }
  } else {
    const age = ageInDays(last.at, now);
    if (age === null || age > staleDays) {
      level = 'warning';
      verdict = 'channel_stale';
    }
  }

  return {
    status: 'ok',
    level,
    reason: verdict,
    lastAt: last?.at ?? null,
    lastOk: last?.ok === true,
    consecutiveFailures,
    lastSuccessAt: lastSuccess?.at ?? null,
    lastFailureReason: lastFailure?.reason ?? null,
    ageDays: last?.ok === true ? ageInDays(last.at, now) : null,
    failureThreshold,
    staleDays,
  };
}

/**
 * Parse the newline-delimited JSON that notify-feishu.sh appends.
 *
 * A truncated last line is normal (the writer is a shell `printf`, not an atomic
 * rename), so unparseable lines are counted and skipped rather than thrown.
 */
export function parseDeliveryLog(text) {
  const records = [];
  let skipped = 0;
  for (const line of String(text ?? '').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') records.push(parsed);
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }
  return { records, skipped };
}

export function buildFactsVsBaseline(approvedCounts, baseline) {
  const approved = new Map(
    approvedCounts.map((row) => [row.slug, row.approved]),
  );
  return baseline.qualifications.map((item) => {
    const actual = approved.get(item.slug) ?? 0;
    return {
      slug: item.slug,
      approved: actual,
      expected: item.expectedFacts,
      delta: actual - item.expectedFacts,
    };
  });
}

export function buildDailyReport({
  now,
  config,
  sourceHealth,
  staleness,
  pendingReview,
  factsVsBaseline,
  coverageGap,
  notificationChannel,
}) {
  const critical = sourceHealth.filter((item) => item.level === 'critical');
  const warning = sourceHealth.filter((item) => item.level === 'warning');
  const pendingTotal = pendingReview.reduce(
    (sum, item) => sum + item.pending,
    0,
  );
  const channel = notificationChannel ?? {
    status: 'not_run',
    level: 'info',
    reason: 'notification channel was not checked',
  };
  const todayActions = [];
  for (const item of critical) {
    todayActions.push({
      kind: 'source_critical',
      target: item.sourceId,
      detail: `${item.reasons.join(', ')}（连续失败 ${item.failedStreak}，最近状态 ${item.lastStatus ?? '从未检查'}）`,
    });
  }
  // A dead alert channel belongs at the same level as a dead source: it is what
  // stops every other finding on this page from ever reaching a person.
  if (channel.level === 'critical') {
    todayActions.push({
      kind: 'notification_channel',
      target: channel.lastFailureReason ?? 'feishu',
      detail: `告警通道连续失败 ${channel.consecutiveFailures} 次（最近 ${channel.lastAt ?? '未知'}）；修好之前所有告警都发不出去`,
    });
  }
  for (const item of pendingReview) {
    if (item.pending > 0) {
      todayActions.push({
        kind: 'pending_review',
        target: item.slug,
        detail: `待审核候选 ${item.pending} 条`,
      });
    }
  }
  for (const fact of staleness.dueFacts.slice(0, 10)) {
    todayActions.push({
      kind: 'due_fact',
      target: formatFactTarget(fact),
      detail: `已 ${fact.ageDays} 天未复核（窗口 ${fact.windowDays} 天）`,
    });
  }
  const hasCritical = critical.length > 0 || channel.level === 'critical';
  return {
    // `status` answers one question only: did the report get produced? The cron
    // wrapper parses this field to tell a broken run from a working one, so a
    // run that found critical problems still says `ok` here. That is easy to
    // misread as "everything is fine", so the health verdict lives in
    // `overallStatus` and the boolean lives in `hasCritical`.
    status: 'ok',
    reportStatus: 'ok',
    overallStatus: hasCritical ? 'action_needed' : 'ok',
    checkedAt: now.toISOString(),
    referenceYear: staleness.referenceYear,
    config: {
      consecutiveFailureThreshold: config.consecutiveFailureThreshold,
      sourceBehindDays: config.sourceBehindDays,
      goneStatusCodes: config.goneStatusCodes,
      notificationFailureThreshold: config.notificationFailureThreshold,
      notificationStaleDays: config.notificationStaleDays,
    },
    summary: {
      sources: sourceHealth.length,
      critical: critical.length,
      warning: warning.length,
      dueFacts: staleness.summary.dueFacts,
      dueSources: staleness.summary.sourcesBehindOnSnapshot,
      pendingReview: pendingTotal,
      factsBelowBaseline: factsVsBaseline.filter((item) => item.delta < 0)
        .length,
      coverageGap:
        coverageGap.status === 'ok'
          ? coverageGap.missingFromRegistry.length
          : null,
      notificationLevel: channel.level ?? 'info',
    },
    hasCritical,
    todayActions,
    sourceHealth,
    notificationChannel: channel,
    staleness: {
      summary: staleness.summary,
      dueFacts: staleness.dueFacts,
      dueSources: staleness.dueSources,
    },
    pendingReview,
    factsVsBaseline,
    coverageGap,
  };
}

export function renderMarkdown(report) {
  const lines = [];
  lines.push(`# 运营日检 ${report.checkedAt}`);
  lines.push('');
  lines.push('## 今日需处理');
  lines.push('');
  if (report.todayActions.length === 0) {
    lines.push('无。所有来源健康，无到期事实，无待审候选。');
  } else {
    for (const action of report.todayActions) {
      lines.push(`- **${action.kind}** \`${action.target}\`：${action.detail}`);
    }
  }
  lines.push('');
  lines.push('## 摘要');
  lines.push('');
  const summary = report.summary;
  // First line on purpose: a reader who stops after the 摘要 block must not
  // come away thinking a report full of critical findings is a healthy one.
  lines.push(
    `- 整体状态：${report.overallStatus === 'action_needed' ? '需要处理（见上）' : '正常'}`,
  );
  lines.push(
    `- 来源 ${summary.sources}：critical ${summary.critical}／warning ${summary.warning}`,
  );
  lines.push(
    `- 到期事实 ${summary.dueFacts}；快照滞后来源 ${summary.dueSources}`,
  );
  lines.push(`- 待审候选 ${summary.pendingReview}`);
  lines.push(`- 低于基线的资格 ${summary.factsBelowBaseline}`);
  lines.push(
    `- 巡检覆盖缺口 ${summary.coverageGap === null ? '未检查（先跑一次巡检）' : summary.coverageGap}`,
  );
  lines.push(`- 告警通道 ${summary.notificationLevel ?? 'info'}`);
  lines.push('');
  lines.push('## 通知渠道');
  lines.push('');
  const channel = report.notificationChannel ?? { status: 'not_run' };
  if (channel.status !== 'ok') {
    lines.push(
      `未检查：${channel.reason ?? 'no delivery records'}（跑一次 \`sh scripts/notify-feishu.sh --test\` 即可产生记录）`,
    );
  } else {
    lines.push(`- 级别：${channel.level}（${channel.reason}）`);
    lines.push(
      `- 最近一次投递：${channel.lastAt ?? '未知'}（${channel.lastOk ? '成功' : `失败：${channel.lastFailureReason ?? '未知原因'}`}）`,
    );
    lines.push(`- 连续失败：${channel.consecutiveFailures}`);
    lines.push(`- 最近一次成功：${channel.lastSuccessAt ?? '从未'}`);
    if (channel.reason === 'channel_stale') {
      lines.push(
        `- ⚠ 通道已 ${channel.ageDays} 天没有成功投递（阈值 ${channel.staleDays} 天）。可能是长期无故障，也可能是 webhook 已失效——手动跑一次 \`--test\` 可区分。`,
      );
    }
  }
  lines.push('');
  lines.push('## 来源健康');
  lines.push('');
  lines.push('| 来源 | 级别 | 最近检查 | 状态 | 连续失败 | 原因 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const item of report.sourceHealth) {
    lines.push(
      `| ${item.sourceId} | ${item.level} | ${item.lastCheckedAt ?? '从未'} | ${item.lastStatus ?? '-'} | ${item.failedStreak} | ${item.reasons.join(', ') || '-'} |`,
    );
  }
  lines.push('');
  lines.push('## facts 对基线（只读比对）');
  lines.push('');
  lines.push('| 资格 | 已批准 | 基线 | 差值 |');
  lines.push('| --- | --- | --- | --- |');
  for (const item of report.factsVsBaseline) {
    lines.push(
      `| ${item.slug} | ${item.approved} | ${item.expected} | ${item.delta} |`,
    );
  }
  lines.push('');
  lines.push('## 待审队列');
  lines.push('');
  if (report.pendingReview.length === 0) {
    lines.push('无待审候选。');
  } else {
    for (const item of report.pendingReview) {
      lines.push(`- ${item.slug}：${item.pending}`);
    }
  }
  lines.push('');
  lines.push('## 到期事实（前 20）');
  lines.push('');
  if (report.staleness.dueFacts.length === 0) {
    lines.push('无。');
  } else {
    for (const fact of report.staleness.dueFacts.slice(0, 20)) {
      lines.push(
        `- ${formatFactTarget(fact)}：${fact.ageDays} 天（窗口 ${fact.windowDays}）`,
      );
    }
  }
  lines.push('');
  lines.push('## 巡检覆盖缺口');
  lines.push('');
  if (report.coverageGap.status !== 'ok') {
    lines.push(`未检查：${report.coverageGap.reason}`);
  } else {
    lines.push(
      `库有登记但巡检清单缺失：${report.coverageGap.missingFromRegistry.length ? report.coverageGap.missingFromRegistry.join(', ') : '无'}`,
    );
    lines.push(
      `巡检清单有但库未登记：${report.coverageGap.missingFromDatabase.length ? report.coverageGap.missingFromDatabase.join(', ') : '无'}`,
    );
    if (report.coverageGap.captureOnly > 0) {
      lines.push(
        `另有 ${report.coverageGap.captureOnly} 个 capture-only 来源按设计不入库（只抓取存档，不写候选链）`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}
