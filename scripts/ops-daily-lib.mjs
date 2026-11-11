import { ageInDays } from './staleness-lib.mjs';

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

export function computeCoverageGap(dbSourceIds, registrySourceIds) {
  const registry = new Set(registrySourceIds);
  const database = new Set(dbSourceIds);
  return {
    status: 'ok',
    missingFromRegistry: dbSourceIds.filter((id) => !registry.has(id)),
    missingFromDatabase: registrySourceIds.filter((id) => !database.has(id)),
  };
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
}) {
  const critical = sourceHealth.filter((item) => item.level === 'critical');
  const warning = sourceHealth.filter((item) => item.level === 'warning');
  const pendingTotal = pendingReview.reduce(
    (sum, item) => sum + item.pending,
    0,
  );
  const todayActions = [];
  for (const item of critical) {
    todayActions.push({
      kind: 'source_critical',
      target: item.sourceId,
      detail: `${item.reasons.join(', ')}（连续失败 ${item.failedStreak}，最近状态 ${item.lastStatus ?? '从未检查'}）`,
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
      target: `${fact.qualification}/${fact.examYear}/${fact.factKey}`,
      detail: `已 ${fact.ageDays} 天未复核（窗口 ${fact.windowDays} 天）`,
    });
  }
  return {
    status: 'ok',
    checkedAt: now.toISOString(),
    referenceYear: staleness.referenceYear,
    config: {
      consecutiveFailureThreshold: config.consecutiveFailureThreshold,
      sourceBehindDays: config.sourceBehindDays,
      goneStatusCodes: config.goneStatusCodes,
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
    },
    hasCritical: critical.length > 0,
    todayActions,
    sourceHealth,
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
        `- ${fact.qualification}/${fact.examYear}/${fact.factKey}：${fact.ageDays} 天（窗口 ${fact.windowDays}）`,
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
  }
  lines.push('');
  return lines.join('\n');
}
