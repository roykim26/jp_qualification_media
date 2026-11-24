// Read-only readiness probe for the public API's `/ready` endpoint.
//
// The API already answers "can I serve queries right now" at `/ready`
// (see services/api/src/database-ready.ts). Until this script existed nothing
// consumed that answer, so the only signal that the data plane was down was a
// user complaint. This probe gives the endpoint a caller that a human or a
// scheduler can run.
//
// It is deliberately NOT wired into the compose healthcheck and NOT exposed
// through Caddy. The dependency chain is
//   db -> api (/health) -> web (depends_on api healthy) -> caddy,
// so turning a readiness failure into an orchestrator signal would let a brief
// database blip take the whole site offline. `/ready` also reveals internal
// state, so it stays on the private network.
//
// Usage (from the repository root):
//   node scripts/check-readiness.mjs
//   node scripts/check-readiness.mjs --url=http://api:4100/ready
//   node scripts/check-readiness.mjs --timeout=3000 --json
//
// Exit code: 0 when ready, 1 for everything else. The JSON `status` carries the
// reason; the exit code only carries "is it usable", because that is the single
// bit an alert needs.

import process from 'node:process';
import { pathToFileURL } from 'node:url';

const DEFAULT_API_BASE_URL = 'http://127.0.0.1:4100';
const DEFAULT_TIMEOUT_MS = 5000;

// How much of an unexpected body to keep. Enough to recognise the shape,
// short enough that a stray HTML error page cannot flood the report.
const RAW_BODY_LIMIT = 200;

function stripTrailingSlashes(value) {
  return value.replace(/\/+$/, '');
}

function parseHttpUrl(value, label) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${label} must be an absolute http(s) URL: ${value}`);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error(`${label} must be an absolute http(s) URL: ${value}`);
  }
  return parsed;
}

/**
 * Which URL to probe, in priority order:
 *   1. an explicit `--url` override
 *   2. `READY_URL`
 *   3. `API_BASE_URL` + `/ready` (the same variable the web process uses)
 *   4. the local development default
 *
 * Trailing slashes are normalised so `API_BASE_URL=http://api:4100/` cannot
 * produce `http://api:4100//ready`.
 */
export function resolveReadyUrl(env = process.env, overrideUrl) {
  const explicit = overrideUrl?.trim() || env.READY_URL?.trim();
  if (explicit) {
    const parsed = parseHttpUrl(explicit, 'READY_URL');
    const path = stripTrailingSlashes(parsed.pathname) || '';
    return `${parsed.origin}${path}${parsed.search}`;
  }
  const base = env.API_BASE_URL?.trim() || DEFAULT_API_BASE_URL;
  const parsed = parseHttpUrl(base, 'API_BASE_URL');
  const path = stripTrailingSlashes(parsed.pathname);
  return `${parsed.origin}${path}/ready`;
}

/** Parse `--url`, `--timeout`, `--json`. Unknown options and bad numbers throw. */
export function parseProbeArgs(argv = []) {
  const options = {
    url: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) {
      const value = arg.slice('--url='.length).trim();
      if (!value) throw new Error('--url requires a value');
      options.url = value;
    } else if (arg.startsWith('--timeout=')) {
      const raw = arg.slice('--timeout='.length).trim();
      const value = Number(raw);
      if (
        !raw ||
        !Number.isFinite(value) ||
        !Number.isInteger(value) ||
        value <= 0
      ) {
        throw new Error(`--timeout must be a positive integer: ${raw}`);
      }
      options.timeoutMs = value;
    } else if (arg === '--json') {
      options.json = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}

function parseBody(rawBody) {
  if (typeof rawBody !== 'string' || !rawBody.trim()) return undefined;
  try {
    const parsed = JSON.parse(rawBody);
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function truncate(rawBody) {
  if (typeof rawBody !== 'string') return '';
  const collapsed = rawBody.replace(/\s+/g, ' ').trim();
  return collapsed.length > RAW_BODY_LIMIT
    ? `${collapsed.slice(0, RAW_BODY_LIMIT)}…`
    : collapsed;
}

/**
 * Map an HTTP response onto the API's readiness contract.
 *
 * The contract (docs/api-contract.md, services/api/src/database-ready.ts):
 *   200 { status: "ready", database: "ok" }
 *   503 { status: "unavailable", database: "error", message }
 *   503 { status: "unavailable", database: "unconfigured" }
 *
 * `database` is authoritative because it is the API's own judgement; a body
 * whose `status` field contradicts it is reported as `unexpected` rather than
 * silently trusted. Anything that does not match the contract is `unexpected`
 * too: a probe that guesses is worse than a probe that reports a mismatch.
 */
export function classifyReadiness(httpStatus, rawBody) {
  const body = parseBody(rawBody);
  const database = typeof body?.database === 'string' ? body.database : null;
  const declaredStatus = typeof body?.status === 'string' ? body.status : null;

  const unexpected = (message) => ({
    status: 'unexpected',
    database,
    message,
    rawBody: truncate(rawBody),
  });

  if (httpStatus === 200) {
    if (database !== 'ok') {
      return unexpected('200 response without database "ok"');
    }
    if (declaredStatus !== null && declaredStatus !== 'ready') {
      return unexpected(
        `status "${declaredStatus}" contradicts database "ok" on 200`,
      );
    }
    return { status: 'ready', database: 'ok', message: null };
  }

  if (httpStatus === 503) {
    if (database === 'error') {
      if (declaredStatus !== null && declaredStatus !== 'unavailable') {
        return unexpected(
          `status "${declaredStatus}" contradicts database "error" on 503`,
        );
      }
      const message =
        typeof body?.message === 'string' && body.message
          ? body.message
          : 'database unreachable (no message supplied)';
      return { status: 'error', database: 'error', message };
    }
    if (database === 'unconfigured') {
      if (declaredStatus !== null && declaredStatus !== 'unavailable') {
        return unexpected(
          `status "${declaredStatus}" contradicts database "unconfigured" on 503`,
        );
      }
      return {
        status: 'unconfigured',
        database: 'unconfigured',
        message: null,
      };
    }
    return unexpected('503 response without a known database state');
  }

  return unexpected(`unexpected HTTP status ${httpStatus}`);
}

/** One line a human can read without parsing JSON. */
export function formatReport(report) {
  const parts = [`${report.status}`, report.url];
  if (report.httpStatus !== null && report.httpStatus !== undefined) {
    parts.push(`HTTP ${report.httpStatus}`);
  }
  if (report.reason) parts.push(`reason=${report.reason}`);
  if (report.message) parts.push(`message=${report.message}`);
  parts.push(`${report.durationMs}ms`);
  return parts.join(' | ');
}

/**
 * Probe once. The only side effect in this module is this single HTTP GET.
 *
 * `AbortSignal.timeout` covers the body read as well as the headers, so an
 * upstream that sends headers and then stalls is cut off at the same deadline.
 */
export async function probeReadiness({ url, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const startedAt = performance.now();
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    const rawBody = await response.text();
    const classification = classifyReadiness(response.status, rawBody);
    return {
      ...classification,
      url,
      httpStatus: response.status,
      durationMs: Math.round(performance.now() - startedAt),
      checkedAt,
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    const code =
      error && typeof error === 'object' && 'cause' in error
        ? (error.cause?.code ?? null)
        : null;
    return {
      status: 'unreachable',
      reason: timedOut ? 'timeout' : 'connect',
      url,
      httpStatus: null,
      database: null,
      message: timedOut
        ? `no answer within ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error),
      code,
      durationMs: Math.round(performance.now() - startedAt),
      checkedAt,
    };
  }
}

function usage() {
  return [
    'usage: node scripts/check-readiness.mjs [--url=URL] [--timeout=MS] [--json]',
    '',
    '  --url      probe this URL (default: $READY_URL, else $API_BASE_URL/ready,',
    `             else ${DEFAULT_API_BASE_URL}/ready)`,
    `  --timeout  deadline in milliseconds (default ${DEFAULT_TIMEOUT_MS})`,
    '  --json     print the machine-readable report',
  ].join('\n');
}

async function main() {
  let options;
  try {
    options = parseProbeArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exit(1);
  }

  let url;
  try {
    url = resolveReadyUrl(process.env, options.url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const report = await probeReadiness({
    url,
    timeoutMs: options.timeoutMs,
  });

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatReport(report));
  }
  process.exit(report.status === 'ready' ? 0 : 1);
}

// Only run the CLI when executed directly (not when imported by tests).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
