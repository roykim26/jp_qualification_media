#!/usr/bin/env node
// DSH task-latency audit.
//
// Reads DSH's own session projection cache (no external services, no network)
// and reports, per session: steps, model/tool wall time, prefill per step,
// decode throughput and prompt-cache hit rate. Flags the patterns that make a
// task feel slow: a relay without prefix caching, too many steps per turn,
// oversized tool schemas and blocking waits.
//
// Usage:
//   node scripts/dsh-latency-audit.mjs                 # last 7 days
//   node scripts/dsh-latency-audit.mjs --since 30 --md # markdown table
//   node scripts/dsh-latency-audit.mjs --json > out.json
//   node scripts/dsh-latency-audit.mjs --strict        # exit 1 on FAIL
//   node scripts/dsh-latency-audit.mjs --session d2176aff
//
// Data locations (override with DSH_HOME):
//   ~/.dsh/storages/session_projcache/sessions/*.json
//   ~/.dsh/sessions/<workspace>/<session-id>/session.v4.jsonl.zstd
//
// Drill-down decompresses concatenated zstd frames manually because
// node:zlib.zstdDecompressSync only decodes the first frame.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import zlib from 'node:zlib';

const DSH_HOME = process.env.DSH_HOME || path.join(os.homedir(), '.dsh');
const PROJCACHE_DIR = path.join(
  DSH_HOME,
  'storages',
  'session_projcache',
  'sessions',
);
const SESSIONS_DIR = path.join(DSH_HOME, 'sessions');

const MS = 1000;
const DAY_MS = 86_400 * MS;

// Baseline thresholds. A task is "healthy" when it runs on a channel with
// working prefix caching, pays little prefill per step and does not need
// dozens of seconds per step. These are deliberately loose: they catch the
// regressions seen in practice (relay without cache, oversized tool schema),
// not normal variance.
const T = {
  hitFail: 0.5, // <50% cache hit: channel is not caching the prompt
  hitPass: 0.9, // >=90%: healthy
  ttftWarn: 2.0, // seconds of prefill per step
  ttftFail: 3.0,
  stepWarn: 15, // wall seconds per step
  stepFail: 20,
  minSteps: 20, // ignore micro sessions when judging
  longSteps: 300, // one session with >300 steps is a long-running dog
  toolsWarn: 26_000, // tool schema tokens per request
};

const opts = {
  since: 7,
  limit: 50,
  all: false,
  md: false,
  json: false,
  strict: false,
  session: null,
};

for (let i = 0; i < process.argv.length - 2; i += 1) {
  const arg = process.argv[i + 2];
  const next = () => {
    if (i + 2 + 1 >= process.argv.length) {
      fail(`missing value for ${arg}`);
    }
    i += 1;
    return process.argv[i + 2];
  };
  switch (arg) {
    case '--since':
      opts.since = Number(next());
      break;
    case '--limit':
      opts.limit = Number(next());
      break;
    case '--all':
      opts.all = true;
      break;
    case '--md':
      opts.md = true;
      break;
    case '--json':
      opts.json = true;
      break;
    case '--strict':
      opts.strict = true;
      break;
    case '--session':
      opts.session = next();
      break;
    case '-h':
    case '--help':
      usage();
      process.exit(0);
      break;
    default:
      fail(`unknown option: ${arg}`);
  }
}

function usage() {
  console.log(
    [
      'usage: node scripts/dsh-latency-audit.mjs [options]',
      '',
      '  --since <days>     window, default 7 (filters by last write time)',
      '  --limit <n>        max sessions in the table, default 50',
      '  --all              include sessions without steps',
      '  --md               markdown table (for reports)',
      '  --json             machine-readable output',
      '  --strict           exit 1 when a session FAILs',
      '  --session <id>     drill into one session: per turn / per tool timing',
      '',
      `thresholds: hit<${T.hitFail * 100}% FAIL, hit>=${T.hitPass * 100}% PASS,`,
      `            prefill/step >${T.ttftFail}s FAIL, >${T.ttftWarn}s WARN,`,
      `            wall/step >${T.stepFail}s FAIL, >${T.stepWarn}s WARN`,
    ].join('\n'),
  );
}

if (!Number.isFinite(opts.since) || opts.since <= 0) {
  fail('--since must be a positive number of days');
}
if (!Number.isFinite(opts.limit) || opts.limit <= 0) {
  fail('--limit must be a positive number');
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(2);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function collectSessions() {
  if (!fs.existsSync(PROJCACHE_DIR)) {
    fail(`projection cache not found: ${PROJCACHE_DIR}`);
  }
  const cutoff = Date.now() - opts.since * DAY_MS;
  const rows = [];
  for (const file of fs.readdirSync(PROJCACHE_DIR)) {
    if (!file.endsWith('.json')) continue;
    const full = path.join(PROJCACHE_DIR, file);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (stat.mtimeMs < cutoff) continue;
    const data = readJson(full);
    if (!data || !data.record) continue;
    const rowsObj = data.record.rows || {};
    const val = (key) => rowsObj[key] && rowsObj[key].val;
    const stats = val('sessionStats');
    if (!stats) continue;
    const cost = val('costUsage') || {};
    const totals = cost.totals || {};
    const breakdown = (val('contextBreakdown') || {}).breakdown || {};
    const prompt = ((val('titleInput') || {}).first || {}).text || '(untitled)';
    const id = file.replace(/\.json$/, '');
    const steps = stats.steps || 0;
    if (!opts.all && steps === 0) continue;
    const input = totals.input || 0;
    const cacheRead = totals.cacheRead || 0;
    const hit = cacheRead + input > 0 ? cacheRead / (cacheRead + input) : null;
    rows.push({
      id,
      short: shortId(file),
      provider: cost.provider || '?',
      model: cost.model || '?',
      turns: stats.turns || 0,
      steps,
      llm: (stats.llmMs || 0) / MS,
      tool: (stats.toolMs || 0) / MS,
      ttftPerStep: steps ? (stats.ttftMs || 0) / MS / steps : null,
      tokPerSec: stats.decodeMs
        ? stats.decodeTokens / (stats.decodeMs / MS)
        : null,
      cacheHit: hit,
      toolsTokens: breakdown.toolsTokens || 0,
      cost: totals.cost,
      mtime: stat.mtimeMs,
      prompt: String(prompt).replace(/\s+/g, ' ').slice(0, 46),
    });
  }
  rows.sort((a, b) => b.mtime - a.mtime);
  return rows.slice(0, opts.limit);
}

function judge(row) {
  const flags = [];
  if (row.steps >= T.minSteps) {
    if (row.cacheHit !== null && row.cacheHit < T.hitFail) {
      flags.push(['FAIL', 'no prefix cache on this channel']);
    } else if (row.cacheHit !== null && row.cacheHit < T.hitPass) {
      flags.push(['WARN', 'prefix cache below 90%']);
    }
    if (row.ttftPerStep !== null && row.ttftPerStep > T.ttftFail) {
      flags.push(['FAIL', `prefill ${row.ttftPerStep.toFixed(1)}s per step`]);
    } else if (row.ttftPerStep !== null && row.ttftPerStep > T.ttftWarn) {
      flags.push(['WARN', `prefill ${row.ttftPerStep.toFixed(1)}s per step`]);
    }
    const wallPerStep = (row.llm + row.tool) / row.steps;
    if (wallPerStep > T.stepFail) {
      flags.push(['FAIL', `wall ${wallPerStep.toFixed(1)}s per step`]);
    } else if (wallPerStep > T.stepWarn) {
      flags.push(['WARN', `wall ${wallPerStep.toFixed(1)}s per step`]);
    }
  }
  if (row.steps > T.longSteps) {
    flags.push(['WARN', `${row.steps} steps in one session`]);
  }
  if (row.toolsTokens > T.toolsWarn) {
    flags.push(['WARN', `tool schema ${row.toolsTokens} tokens`]);
  }
  const worst = flags.some((f) => f[0] === 'FAIL')
    ? 'FAIL'
    : flags.some((f) => f[0] === 'WARN')
      ? 'WARN'
      : 'PASS';
  return { verdict: worst, flags };
}

function shortId(file) {
  const uuid = String(file).match(
    /([0-9a-f]{8})-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  if (uuid) return uuid[1];
  return String(file)
    .replace(/\.json$/, '')
    .slice(0, 8);
}

function fmtDur(seconds) {
  if (seconds >= 3600) return `${(seconds / 3600).toFixed(1)}h`;
  if (seconds >= 60)
    return `${(seconds / 60).toFixed(0)}m${(seconds % 60).toFixed(0).padStart(2, '0')}s`;
  return `${seconds.toFixed(1)}s`;
}

function fmtPct(value) {
  return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`;
}

function displayWidth(text) {
  let width = 0;
  for (const ch of String(text)) {
    width +=
      /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
        ch,
      )
        ? 2
        : 1;
  }
  return width;
}

function renderTable(header, body, md) {
  if (md) {
    const lines = [`| ${header.join(' | ')} |`];
    lines.push(`| ${header.map(() => '---').join(' | ')} |`);
    for (const row of body) lines.push(`| ${row.join(' | ')} |`);
    return lines.join('\n');
  }
  const widths = header.map((cell, col) =>
    Math.max(displayWidth(cell), ...body.map((row) => displayWidth(row[col]))),
  );
  const pad = (cell, col) => {
    const missing = widths[col] - displayWidth(cell);
    return cell + ' '.repeat(Math.max(0, missing));
  };
  const lines = [header.map(pad).join('  ')];
  lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of body) lines.push(row.map(pad).join('  '));
  return lines.join('\n');
}

if (opts.session) {
  inspectSession(opts.session);
  process.exit(0);
}

const rows = collectSessions().map((row) => ({ ...row, ...judge(row) }));

if (opts.json) {
  const out = rows.map(({ flags, ...rest }) => rest);
  console.log(JSON.stringify({ thresholds: T, sessions: out }, null, 2));
} else {
  const header = [
    'when',
    'session',
    'provider/model',
    'turns',
    'steps',
    'llm',
    'tool',
    'prefill/step',
    'tok/s',
    'cache',
    'tools',
    'verdict',
    'prompt',
  ];
  const body = rows.map((row) => [
    new Date(row.mtime).toISOString().slice(0, 16).replace('T', ' '),
    row.short,
    `${row.provider}/${row.model}`,
    String(row.turns),
    String(row.steps),
    fmtDur(row.llm),
    fmtDur(row.tool),
    row.ttftPerStep === null ? 'n/a' : `${row.ttftPerStep.toFixed(2)}s`,
    row.tokPerSec === null ? 'n/a' : row.tokPerSec.toFixed(0),
    fmtPct(row.cacheHit),
    String(row.toolsTokens),
    row.verdict,
    row.prompt,
  ]);
  console.log(renderTable(header, body, opts.md));

  const judged = rows.filter((row) => row.steps >= T.minSteps);
  const medians = (key) => {
    const values = judged
      .map((row) => row[key])
      .filter((v) => v !== null && Number.isFinite(v))
      .sort((a, b) => a - b);
    return values.length ? values[Math.floor(values.length / 2)] : null;
  };
  const counts = { PASS: 0, WARN: 0, FAIL: 0 };
  for (const row of rows) counts[row.verdict] += 1;
  console.log('');
  console.log(
    `window=${opts.since}d sessions=${rows.length} pass=${counts.PASS} warn=${counts.WARN} fail=${counts.FAIL}` +
      ` | median cache=${fmtPct(medians('cacheHit'))}` +
      ` prefill/step=${medians('ttftPerStep') === null ? 'n/a' : `${medians('ttftPerStep').toFixed(2)}s`}` +
      ` wall/step=${judged.length ? `${(judged.reduce((s, r) => s + r.llm + r.tool, 0) / judged.reduce((s, r) => s + r.steps, 0)).toFixed(1)}s` : 'n/a'}`,
  );
  const bad = rows.filter((row) => row.verdict !== 'PASS');
  for (const row of bad) {
    console.log(
      `  ${row.verdict} ${row.short} ${row.provider}/${row.model}: ${row.flags
        .map(([level, text]) => `${level}: ${text}`)
        .join('; ')}`,
    );
  }
  if (opts.strict && counts.FAIL > 0) process.exit(1);
}

// ---------------------------------------------------------------------------
// Drill-down: decompress one session's event log and time it per turn/tool.
// ---------------------------------------------------------------------------

function inspectSession(sessionArg) {
  const file = resolveSessionFile(sessionArg);
  const events = readEvents(file);
  const lines = events.sort(
    (a, b) => (a.time || 0) - (b.time || 0) || (a.seq || 0) - (b.seq || 0),
  );

  const turns = [];
  const calls = new Map();
  const toolAgg = new Map();
  const slow = [];
  let humanWait = 0;
  let humanWaits = 0;
  let errors = 0;
  let turn = null;

  for (const event of lines) {
    if (event.type === 'turn/start') {
      turn = {
        n: event.data && event.data.turn,
        start: event.time,
        end: null,
        steps: 0,
        tools: 0,
        toolMs: 0,
        byName: {},
      };
      turns.push(turn);
    } else if (event.type === 'step/start' && turn) {
      turn.steps += 1;
    } else if (event.type === 'tool/call') {
      calls.set(event.data.callId, {
        start: event.time,
        name: event.data.name,
        args: event.data.arguments,
        turn: turn ? turn.n : null,
      });
    } else if (event.type === 'tool/result') {
      const id =
        (event.data && event.data.message && event.data.message.toolCallId) ||
        (event.data && event.data.toolCallId);
      const call = calls.get(id);
      if (!call) continue;
      const duration = event.time - call.start;
      const isError = Boolean(
        (event.data && event.data.message && event.data.message.isError) ||
        (event.data && event.data.error),
      );
      const agg = toolAgg.get(call.name) || {
        n: 0,
        total: 0,
        max: 0,
        durs: [],
        errors: 0,
      };
      agg.n += 1;
      agg.total += duration;
      agg.max = Math.max(agg.max, duration);
      agg.durs.push(duration);
      if (isError) {
        agg.errors += 1;
        errors += 1;
      }
      toolAgg.set(call.name, agg);
      if (call.name === 'ask_user_question') {
        humanWait += duration;
        humanWaits += 1;
      }
      if (turn) {
        turn.tools += 1;
        turn.toolMs += duration;
        turn.byName[call.name] = (turn.byName[call.name] || 0) + duration;
      }
      if (duration > 60_000) {
        slow.push({ duration, name: call.name, args: call.args, isError });
      }
    } else if (event.type === 'turn/end' && turn) {
      turn.end = event.time;
    }
  }

  const lastTime = lines.length ? lines[lines.length - 1].time : 0;
  const totalWall = turns.reduce(
    (sum, t) => sum + ((t.end || lastTime) - t.start),
    0,
  );
  const totalSteps = turns.reduce((sum, t) => sum + t.steps, 0);
  const totalTool = turns.reduce((sum, t) => sum + t.toolMs, 0);

  const summary = {
    file,
    events: lines.length,
    turns: turns.length,
    steps: totalSteps,
    wallSeconds: totalWall / MS,
    toolSeconds: totalTool / MS,
    modelSeconds: (totalWall - totalTool) / MS,
    humanWaitSeconds: humanWait / MS,
    humanWaits,
    errors,
  };

  const turnRows = turns.map((t) => {
    const duration = ((t.end || lastTime) - t.start) / MS;
    const top = Object.entries(t.byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([name, ms]) => `${name} ${fmtDur(ms / MS)}`)
      .join(', ');
    return [
      String(t.n),
      fmtDur(duration),
      String(t.steps),
      String(t.tools),
      fmtDur(t.toolMs / MS),
      fmtDur(duration - t.toolMs / MS),
      top || '-',
    ];
  });

  const toolRows = [...toolAgg.entries()]
    .map(([name, agg]) => {
      agg.durs.sort((a, b) => a - b);
      const p = (q) =>
        agg.durs[
          Math.min(agg.durs.length - 1, Math.floor(q * agg.durs.length))
        ];
      return {
        total: agg.total,
        cells: [
          name,
          String(agg.n),
          fmtDur(agg.total / MS),
          fmtDur(p(0.5) / MS),
          fmtDur(p(0.9) / MS),
          fmtDur(agg.max / MS),
          String(agg.errors),
        ],
      };
    })
    .sort((a, b) => b.total - a.total)
    .map((row) => row.cells);

  const slowRows = slow
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 12)
    .map((item) => [
      fmtDur(item.duration / MS),
      item.name,
      item.isError ? 'error' : '',
      String(item.args || '')
        .replace(/\s+/g, ' ')
        .slice(0, 80),
    ]);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          summary,
          turns: turnRows,
          tools: toolRows,
          slow: slowRows,
        },
        null,
        2,
      ),
    );
    return;
  }

  console.log('');
  console.log(`session ${path.relative(DSH_HOME, file)}`);
  console.log(
    `turns=${summary.turns} steps=${summary.steps} wall=${fmtDur(summary.wallSeconds)}` +
      ` model=${fmtDur(summary.modelSeconds)} tool=${fmtDur(summary.toolSeconds)}` +
      ` humanWait=${fmtDur(summary.humanWaitSeconds)} errors=${summary.errors}`,
  );
  if (summary.steps) {
    console.log(
      `avg per step: wall ${(summary.wallSeconds / summary.steps).toFixed(1)}s,` +
        ` model ${(summary.modelSeconds / summary.steps).toFixed(1)}s,` +
        ` tool ${(summary.toolSeconds / summary.steps).toFixed(1)}s`,
    );
  }
  console.log('');
  console.log(
    renderTable(
      [
        'turn',
        'duration',
        'steps',
        'tools',
        'toolTime',
        'modelEst',
        'top tools',
      ],
      turnRows,
      opts.md,
    ),
  );
  console.log('');
  console.log(
    renderTable(
      ['tool', 'calls', 'total', 'p50', 'p90', 'max', 'errors'],
      toolRows,
      opts.md,
    ),
  );
  if (slowRows.length) {
    console.log('');
    console.log(
      renderTable(['duration', 'tool', 'flag', 'args'], slowRows, opts.md),
    );
  }
}

function resolveSessionFile(sessionArg) {
  if (fs.existsSync(sessionArg)) {
    const stat = fs.statSync(sessionArg);
    return stat.isDirectory()
      ? path.join(sessionArg, 'session.v4.jsonl.zstd')
      : sessionArg;
  }
  const wanted = sessionArg.replace(/^session-/, '');
  for (const workspace of fs.readdirSync(SESSIONS_DIR)) {
    const dir = path.join(SESSIONS_DIR, workspace);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.startsWith(`session-${wanted}`)) continue;
      const file = path.join(dir, name, 'session.v4.jsonl.zstd');
      if (fs.existsSync(file)) return file;
    }
  }
  fail(
    `session not found: ${sessionArg} (looked under ${SESSIONS_DIR}; pass a path or the id shown by this script)`,
  );
}

function readEvents(file) {
  const buffer = fs.readFileSync(file);
  const text = file.endsWith('.zstd')
    ? decompressFrames(buffer)
    : buffer.toString('utf8');
  return text
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function decompressFrames(buffer) {
  if (typeof zlib.zstdDecompressSync !== 'function') {
    fail('node:zlib.zstdDecompressSync is unavailable; Node >= 22 is required');
  }
  const chunks = [];
  let pos = 0;
  while (pos < buffer.length) {
    if (buffer.length - pos < 4) break;
    const magic = buffer.readUInt32LE(pos);
    if (magic >= 0x184d2a50 && magic <= 0x184d2a5f) {
      // skippable frame
      const size = buffer.readUInt32LE(pos + 4);
      pos += 8 + size;
      continue;
    }
    if (magic !== 0xfd2fb528) {
      fail(`bad zstd magic at ${pos} of ${buffer.length}`);
    }
    const end = frameEnd(buffer, pos);
    chunks.push(zlib.zstdDecompressSync(buffer.subarray(pos, end)));
    pos = end;
  }
  return Buffer.concat(chunks).toString('utf8');
}

function frameEnd(buffer, pos) {
  let p = pos + 4;
  const descriptor = buffer[p];
  p += 1;
  const fcsFlag = descriptor >> 6;
  const single = (descriptor >> 5) & 1;
  const checksum = (descriptor >> 2) & 1;
  const dictFlag = descriptor & 3;
  if (!single) p += 1;
  p += [0, 1, 2, 4][dictFlag];
  p += single ? [1, 2, 4, 8][fcsFlag] : [0, 2, 4, 8][fcsFlag];
  for (;;) {
    const header = buffer[p] | (buffer[p + 1] << 8) | (buffer[p + 2] << 16);
    p += 3;
    const last = header & 1;
    const type = (header >> 1) & 3;
    const size = header >>> 3;
    p += type === 1 ? 1 : size;
    if (last) break;
  }
  if (checksum) p += 4;
  return p;
}
