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
// The probe covers only the data plane: it asks the API whether it can reach the
// database. It cannot see web or caddy, so a web container stuck in a restart
// loop still reports "ready". `--public-url` closes that gap by also requesting
// the public entry and requiring a complete HTML document back. It is optional
// and off by default: without it this script behaves exactly as it did before.
//
// Usage (from the repository root):
//   node scripts/check-readiness.mjs
//   node scripts/check-readiness.mjs --url=http://api:4100/ready
//   node scripts/check-readiness.mjs --timeout=3000 --json
//   node scripts/check-readiness.mjs --public-url=https://shikakucheck.com/
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

/**
 * Which public URL to check, or `undefined` when the check is off.
 *
 * There is deliberately no default: the public check needs an origin only the
 * operator knows, and a wrong guess would alert on somebody else's site. Off by
 * default also means `node scripts/check-readiness.mjs` keeps its old meaning.
 */
export function resolvePublicUrl(env = process.env, overrideUrl) {
  const explicit = overrideUrl?.trim() || env.PUBLIC_READY_URL?.trim();
  if (!explicit) return undefined;
  parseHttpUrl(explicit, 'PUBLIC_READY_URL');
  return explicit;
}

/** Parse `--url`, `--public-url`, `--timeout`, `--json`. Bad input throws. */
export function parseProbeArgs(argv = []) {
  const options = {
    url: undefined,
    publicUrl: undefined,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    json: false,
  };
  for (const arg of argv) {
    if (arg.startsWith('--url=')) {
      const value = arg.slice('--url='.length).trim();
      if (!value) throw new Error('--url requires a value');
      options.url = value;
    } else if (arg.startsWith('--public-url=')) {
      const value = arg.slice('--public-url='.length).trim();
      if (!value) throw new Error('--public-url requires a value');
      options.publicUrl = value;
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
  if (report.public) {
    const detail = [`public=${report.public.state}`];
    if (report.public.httpStatus != null) {
      detail.push(`HTTP ${report.public.httpStatus}`);
    }
    if (report.public.reason) detail.push(`reason=${report.public.reason}`);
    if (report.public.message) detail.push(`message=${report.public.message}`);
    parts.push(detail.join(' '));
  }
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

/**
 * Classify the public entry check.
 *
 * This is a *separate* vocabulary from `classifyReadiness` on purpose. The API's
 * five states describe the data plane; the public entry only needs to answer
 * "did a real page come back". Merging them would make `readiness-cron.sh`'s
 * state machine report a data-plane word for a web/caddy failure.
 *
 * A 200 alone is not enough. caddy serves a directory of static files and a
 * reverse proxy; a misrouted request, an empty body or a truncated response all
 * produce 200s that no user can read. So the body must look like a finished
 * document: it must close its `</html>` tag. That is the cheapest signal that
 * separates "the whole chain rendered a page" from "something answered".
 */
export function classifyPublicEntry(httpStatus, rawBody) {
  const body = typeof rawBody === 'string' ? rawBody : '';
  if (httpStatus >= 200 && httpStatus < 300) {
    if (!/<html[\s>]/i.test(body)) {
      return {
        state: 'not-html',
        httpStatus,
        message: '2xx response without an <html> element',
        rawBody: truncate(body),
      };
    }
    if (!/<\/html\s*>/i.test(body)) {
      return {
        state: 'truncated',
        httpStatus,
        message: '2xx response with an <html> element that never closed',
        rawBody: truncate(body),
      };
    }
    return { state: 'ok', httpStatus, message: null };
  }
  if (httpStatus >= 300 && httpStatus < 400) {
    // A redirect here means the operator pointed at the wrong origin (the www
    // host 301s to the apex) or a proxy rule changed. Following it silently
    // would hide exactly the misconfiguration we are trying to catch.
    return {
      state: 'redirect',
      httpStatus,
      message: `public entry redirected with HTTP ${httpStatus}`,
      rawBody: truncate(body),
    };
  }
  if (httpStatus >= 500) {
    return {
      state: 'server-error',
      httpStatus,
      message: `public entry answered HTTP ${httpStatus}`,
      rawBody: truncate(body),
    };
  }
  return {
    state: 'client-error',
    httpStatus,
    message: `public entry answered HTTP ${httpStatus}`,
    rawBody: truncate(body),
  };
}

/**
 * Check the public entry once.
 *
 * `redirect: 'manual'` is deliberate: a redirect is a finding, not a detour.
 *
 * Failure reasons are split because they route to different people:
 *   connect -> DNS or the host is down
 *   tls     -> certificate expired, wrong hostname, or the chain broke
 *   timeout -> the process is up but not answering (web hung, caddy waiting)
 */
export async function probePublicEntry({
  url,
  timeoutMs = DEFAULT_TIMEOUT_MS,
}) {
  const startedAt = performance.now();
  try {
    const response = await fetch(url, {
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'text/html,application/xhtml+xml' },
    });
    const rawBody = await response.text();
    const classification = classifyPublicEntry(response.status, rawBody);
    return {
      ...classification,
      url,
      durationMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    const code =
      error && typeof error === 'object' && 'cause' in error
        ? (error.cause?.code ?? null)
        : null;
    const timedOut = name === 'TimeoutError' || name === 'AbortError';
    const tls =
      typeof code === 'string' &&
      (code.startsWith('CERT_') ||
        code.startsWith('ERR_TLS') ||
        code === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' ||
        code === 'DEPTH_ZERO_SELF_SIGNED_CERT' ||
        code === 'ERR_TLS_CERT_ALTNAME_INVALID');
    return {
      state: 'unreachable',
      reason: timedOut ? 'timeout' : tls ? 'tls' : 'connect',
      url,
      httpStatus: null,
      code,
      message: timedOut
        ? `no answer within ${timeoutMs}ms`
        : error instanceof Error
          ? error.message
          : String(error),
      durationMs: Math.round(performance.now() - startedAt),
    };
  }
}

function usage() {
  return [
    'usage: node scripts/check-readiness.mjs [--url=URL] [--public-url=URL] [--timeout=MS] [--json]',
    '',
    '  --url         probe this readiness URL (default: $READY_URL, else',
    '                $API_BASE_URL/ready, else ' +
      DEFAULT_API_BASE_URL +
      '/ready)',
    '  --public-url  also require this public URL to return a complete page',
    '                (default: $PUBLIC_READY_URL; off when neither is set)',
    `  --timeout     deadline in milliseconds (default ${DEFAULT_TIMEOUT_MS})`,
    '  --json        print the machine-readable report',
  ].join('\n');
}

/**
 * Fold the public entry result into the data-plane report.
 *
 * The vocabulary is the existing one on purpose. `readiness-cron.sh` reads
 * `"status"` out of this JSON and feeds it to a state machine that only knows
 * "ready" versus "not ready"; inventing `web-down` here would make that machine
 * treat a broken site as healthy. So a public failure is reported with the two
 * words that already mean "we could not get an answer" (`unreachable`) and "we
 * got an answer we cannot use" (`unexpected`).
 *
 * The data-plane verdict is preserved under `dataPlane` when it is overridden,
 * because "the API is fine but nobody can reach the site" is the single most
 * useful thing an operator can learn from this report.
 */
export function mergePublicEntry(dataPlane, publicEntry) {
  if (!publicEntry || publicEntry.state === 'ok') {
    return publicEntry ? { ...dataPlane, public: publicEntry } : dataPlane;
  }
  const unreachable = publicEntry.state === 'unreachable';
  return {
    ...dataPlane,
    status: unreachable ? 'unreachable' : 'unexpected',
    reason: unreachable ? publicEntry.reason : 'public-entry',
    message: `public entry ${publicEntry.url} ${publicEntry.message ?? publicEntry.state}`,
    dataPlane: {
      status: dataPlane.status,
      database: dataPlane.database ?? null,
      message: dataPlane.message ?? null,
    },
    public: publicEntry,
  };
}

async function main() {
  let options;
  try {
    options = parseProbeArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(usage());
    process.exitCode = 1;
    return;
  }

  let url;
  try {
    url = resolveReadyUrl(process.env, options.url);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const report = await probeReadiness({
    url,
    timeoutMs: options.timeoutMs,
  });

  let publicUrl;
  try {
    publicUrl = resolvePublicUrl(process.env, options.publicUrl);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  const finalReport = publicUrl
    ? mergePublicEntry(
        report,
        await probePublicEntry({
          url: publicUrl,
          timeoutMs: options.timeoutMs,
        }),
      )
    : report;

  if (options.json) {
    console.log(JSON.stringify(finalReport, null, 2));
  } else {
    console.log(formatReport(finalReport));
  }
  // Set the code and let the process end on its own.
  //
  // `process.exit()` here aborts on Windows whenever two or more `fetch` calls
  // have completed: libuv trips `Assertion failed: !(handle->flags &
  // UV_HANDLE_CLOSING), file src\win\async.c, line 76` and the process dies
  // with 0xC0000409 instead of the code we asked for. That was invisible while
  // the probe made a single request; the public-entry check makes it two. The
  // exit code is what the cron wrapper reads, so a crash here would look like a
  // probe that never ran.
  process.exitCode = finalReport.status === 'ready' ? 0 : 1;
}

// Only run the CLI when executed directly (not when imported by tests).
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  await main();
}
