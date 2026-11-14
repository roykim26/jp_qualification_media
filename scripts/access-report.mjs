// Read-only access-log report for the Caddy JSON access log (A1 fallback
// analytics). No database access, no network, no writes: it only reads the
// log files given on the command line and prints an aggregate report.
//
// Usage (on the server, from the repository root):
//   node scripts/access-report.mjs deploy/caddy-logs/access.log
//   node scripts/access-report.mjs deploy/caddy-logs/access.log --since=2026-11-14 --top=20
//   node scripts/access-report.mjs deploy/caddy-logs/access.log --json
//
// The Caddy site block writes /var/log/caddy/access.log (JSON, rotated at
// 10mb x 5) and deploy/docker-compose.prod.yml bind-mounts it to
// deploy/caddy-logs/ on the host. Dates are aggregated in Asia/Tokyo (JST).

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const jstDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Conservative bot/script filter. Empty user agents are treated as bots so
// that "unique IP" stays a human-ish visitor count.
const BOT_PATTERN =
  /bot|crawler|spider|slurp|curl|wget|python-requests|headlesschrome|lighthouse|pingdom|uptimerobot|ahrefs|semrush|mj12|dotbot|petalbot|bytespider|yandex|baiduspider|facebookexternalhit|embedly|outbrain|pinterestbot/i;

const SEARCH_HOST_PATTERN =
  /(^|\.)(google\.[a-z]{2,3}(\.[a-z]{2})?|bing\.com|duckduckgo\.com|baidu\.com|yahoo\.co\.jp)$/i;

const SNS_HOST_PATTERN =
  /(^|\.)(t\.co|twitter\.com|x\.com|facebook\.com|instagram\.com|line\.me|youtube\.com|threads\.net|bsky\.app)$/i;

const ASSET_PATTERN =
  /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|woff2?|ttf|map)$/i;

export function parseAccessLine(line) {
  if (typeof line !== 'string' || !line.trim()) return null;
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return null;
  }
  const request = record?.request;
  if (!request || typeof request.uri !== 'string') return null;
  if (typeof record.ts !== 'number') return null;
  const time = new Date(record.ts * 1000);
  if (Number.isNaN(time.getTime())) return null;
  const headers = request.headers ?? {};
  const firstHeader = (name) => {
    const value = headers[name];
    return Array.isArray(value) && typeof value[0] === 'string' ? value[0] : '';
  };
  const queryIndex = request.uri.indexOf('?');
  const pathname =
    queryIndex >= 0 ? request.uri.slice(0, queryIndex) : request.uri;
  const query = queryIndex >= 0 ? request.uri.slice(queryIndex + 1) : '';
  const clientIp =
    typeof request.client_ip === 'string' && request.client_ip
      ? request.client_ip
      : typeof request.remote_ip === 'string'
        ? request.remote_ip
        : '';
  return {
    time,
    date: jstDateFormatter.format(time),
    method: typeof request.method === 'string' ? request.method : '',
    host: typeof request.host === 'string' ? request.host : '',
    pathname,
    query,
    status: typeof record.status === 'number' ? record.status : 0,
    clientIp,
    referer: firstHeader('Referer'),
    userAgent: firstHeader('User-Agent'),
  };
}

export function isBot(userAgent) {
  if (typeof userAgent !== 'string' || !userAgent.trim()) return true;
  if (/^node$/i.test(userAgent.trim())) return true;
  return BOT_PATTERN.test(userAgent);
}

export function classifyReferer(referer, siteHost = 'shikakucheck.com') {
  if (!referer) return 'direct';
  let host;
  try {
    host = new URL(referer).hostname;
  } catch {
    return 'other';
  }
  if (!host) return 'other';
  if (host === siteHost || host === `www.${siteHost}`) return 'internal';
  if (SEARCH_HOST_PATTERN.test(host)) return 'search';
  if (SNS_HOST_PATTERN.test(host)) return 'sns';
  return 'other';
}

function featureFor(entry) {
  const path = entry.pathname;
  if (path.startsWith('/ics/') || path.startsWith('/api/v1/ics')) return 'ics';
  if (
    (path === '/shikaku' || path === '/shikaku/') &&
    /(^|&)q=[^&]+/.test(entry.query)
  )
    return 'search';
  if (path === '/compare' || path.startsWith('/compare/')) return 'compare';
  return null;
}

export function summarize(entries, options = {}) {
  const {
    since = '',
    until = '',
    top = 15,
    siteHost = 'shikakucheck.com',
  } = options;
  const filtered = entries.filter(
    (entry) =>
      (!since || entry.date >= since) && (!until || entry.date <= until),
  );
  const human = filtered.filter((entry) => !isBot(entry.userAgent));
  const uniqueIps = new Set(
    human.map((entry) => entry.clientIp).filter(Boolean),
  ).size;

  const byStatus = {};
  for (const entry of filtered) {
    byStatus[entry.status] = (byStatus[entry.status] ?? 0) + 1;
  }

  const referrers = { direct: 0, search: 0, sns: 0, internal: 0, other: 0 };
  const pageCounts = new Map();
  const featureStats = {
    ics: { requests: 0, ips: new Set() },
    search: { requests: 0, ips: new Set() },
    compare: { requests: 0, ips: new Set() },
  };
  const dayStats = new Map();
  for (const entry of human) {
    referrers[classifyReferer(entry.referer, siteHost)] += 1;
    const isPageView =
      (entry.method === 'GET' || entry.method === 'HEAD') &&
      entry.status > 0 &&
      entry.status < 400 &&
      !ASSET_PATTERN.test(entry.pathname);
    if (isPageView) {
      pageCounts.set(entry.pathname, (pageCounts.get(entry.pathname) ?? 0) + 1);
    }
    const feature = featureFor(entry);
    if (feature) {
      featureStats[feature].requests += 1;
      if (entry.clientIp) featureStats[feature].ips.add(entry.clientIp);
    }
    const day = dayStats.get(entry.date) ?? { requests: 0, ips: new Set() };
    day.requests += 1;
    if (entry.clientIp) day.ips.add(entry.clientIp);
    dayStats.set(entry.date, day);
  }

  const topPages = [...pageCounts.entries()]
    .map(([path, count]) => ({ path, count }))
    .sort(
      (left, right) =>
        right.count - left.count || left.path.localeCompare(right.path),
    )
    .slice(0, top);

  const featureUsage = Object.fromEntries(
    Object.entries(featureStats).map(([feature, stats]) => [
      feature,
      { requests: stats.requests, uniqueIps: stats.ips.size },
    ]),
  );

  const days = [...dayStats.entries()]
    .map(([date, stats]) => ({
      date,
      requests: stats.requests,
      uniqueIps: stats.ips.size,
    }))
    .sort((left, right) => left.date.localeCompare(right.date));

  return {
    status: 'ok',
    window: { since: since || null, until: until || null },
    totals: {
      requests: filtered.length,
      human: human.length,
      bot: filtered.length - human.length,
      uniqueIps,
    },
    byStatus,
    referrers,
    featureUsage,
    topPages,
    days,
  };
}

export function renderTextReport(report, files) {
  const lines = [];
  lines.push('アクセスログ集計（読み取り専用・JST）');
  lines.push(`対象ファイル: ${files.join(', ')}`);
  const { since, until } = report.window;
  lines.push(`期間: ${since ?? '最古'} 〜 ${until ?? '最新'}`);
  const { totals } = report;
  lines.push(
    `総リクエスト: ${totals.requests}（人間 ${totals.human} / ボット ${totals.bot}）`,
  );
  lines.push(`ユニークIP（人間）: ${totals.uniqueIps}`);
  const statusText = Object.entries(report.byStatus)
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([status, count]) => `${status}=${count}`)
    .join(' ');
  lines.push(`ステータス: ${statusText || 'なし'}`);
  const ref = report.referrers;
  lines.push(
    `参照元: 直接=${ref.direct} 検索=${ref.search} SNS=${ref.sns} 内部=${ref.internal} その他=${ref.other}`,
  );
  const featureText = Object.entries(report.featureUsage)
    .map(
      ([feature, stats]) =>
        `${feature}=${stats.requests}件/${stats.uniqueIps}IP`,
    )
    .join(' ');
  lines.push(`機能利用: ${featureText}`);
  lines.push('上位ページ:');
  if (report.topPages.length === 0) lines.push('  （なし）');
  report.topPages.forEach((page, index) => {
    lines.push(`  ${index + 1}. ${page.path} (${page.count})`);
  });
  lines.push('日別:');
  if (report.days.length === 0) lines.push('  （なし）');
  for (const day of report.days) {
    lines.push(`  ${day.date}: ${day.requests}リクエスト / ${day.uniqueIps}IP`);
  }
  return lines.join('\n') + '\n';
}

function parseArgs(argv) {
  const files = [];
  const options = { since: '', until: '', top: 15, json: false };
  for (const arg of argv) {
    if (arg.startsWith('--since=')) options.since = arg.slice(8);
    else if (arg.startsWith('--until=')) options.until = arg.slice(8);
    else if (arg.startsWith('--top=')) options.top = Number(arg.slice(6)) || 15;
    else if (arg === '--json') options.json = true;
    else if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`);
    } else files.push(arg);
  }
  return { files, options };
}

function main() {
  let parsed;
  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(String(error instanceof Error ? error.message : error));
    process.exit(1);
  }
  const { files, options } = parsed;
  if (files.length === 0) {
    console.error(
      'usage: node scripts/access-report.mjs <access.log...> [--since=YYYY-MM-DD] [--until=YYYY-MM-DD] [--top=N] [--json]',
    );
    process.exit(1);
  }
  const entries = [];
  let skipped = 0;
  for (const file of files) {
    let content;
    try {
      content = readFileSync(file, 'utf8');
    } catch (error) {
      console.error(
        `cannot read ${file}: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(1);
    }
    for (const line of content.split('\n')) {
      const entry = parseAccessLine(line);
      if (entry) entries.push(entry);
      else if (line.trim()) skipped += 1;
    }
  }
  const report = summarize(entries, options);
  report.skippedLines = skipped;
  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    process.stdout.write(renderTextReport(report, files));
    if (skipped > 0) console.log(`（解析不能行: ${skipped}）`);
  }
}

// Only run the CLI when executed directly (not when imported by tests).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
