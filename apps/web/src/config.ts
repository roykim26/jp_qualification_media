/**
 * Sprint 3C: the web process needs its own configuration gate.
 *
 * Sprint 3B taught the api process to fail loudly when `DATABASE_URL` is
 * missing instead of pretending it had zero facts.  The web process had the
 * same defect, one layer closer to the public:
 *
 *     const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4100';
 *
 * In a container that fallback points the web process at *itself*.  Every
 * data route then fails to reach an API, so visitors get 503 — while `/`
 * degrades to a 200 through `Promise.allSettled`, and `/` is exactly what the
 * compose healthcheck polls.  The result is "users see an outage, operators
 * see a healthy service", which is the failure mode this module removes.
 *
 * `SITE_ORIGIN` had two inconsistent paths: `server.ts` threw in production
 * but only when `/robots.txt` or `/sitemap.xml` was requested, while
 * `layout.ts` silently emitted relative canonicals forever.  Both now share
 * the parsers below, with failure postures that suit their callers: hard at
 * startup, soft while rendering.
 *
 * This module is deliberately pure: no module-level reads of `process.env`
 * and no side effects, because `layout.ts` imports it from the render path
 * and must never trigger startup validation.
 */

export type WebConfig = {
  nodeEnv: string;
  port: number;
  host: string;
  apiBaseUrl: string;
  siteOrigin: string | undefined;
  upstreamTimeoutMs: number;
};

export const defaultApiBaseUrl = 'http://127.0.0.1:4100';
export const defaultWebPort = 3000;
export const defaultWebHost = '127.0.0.1';
export const defaultUpstreamTimeoutMs = 5_000;

/**
 * `API_BASE_URL` is concatenated as `` `${apiBaseUrl}/api/v1/...` ``, so a
 * configured trailing slash would produce `//api/v1/...`.  Normalising here
 * keeps that from depending on how the operator typed the value.
 */
export function parseApiBaseUrl(raw: string | undefined): string {
  const trimmed = raw?.trim();
  if (!trimmed) return defaultApiBaseUrl;
  const parsed = parseAbsoluteHttpUrl(trimmed, 'API_BASE_URL');
  return parsed.origin + parsed.pathname.replace(/\/+$/, '');
}

/**
 * Returns the origin only (`https://shikakucheck.com`), matching what
 * `layout.ts` already did: a path or trailing slash in `SITE_ORIGIN` must not
 * leak into canonical/og:url/sitemap URLs.
 */
export function parseSiteOrigin(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim();
  if (!trimmed) return undefined;
  return parseAbsoluteHttpUrl(trimmed, 'SITE_ORIGIN').origin;
}

export function parsePort(raw: string | undefined): number {
  // `Number('')` is 0, and port 0 means "any free port" — a blank value must
  // not silently turn into an ephemeral listener.
  const trimmed = raw?.trim();
  if (!trimmed) return defaultWebPort;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 65_535)
    return defaultWebPort;
  return parsed;
}

/**
 * Bounds mirror the upstream deadline contract from Sprint 3A: anything below
 * 100 ms cannot survive a healthy sibling container, anything above 60 s is
 * longer than the deploy web healthcheck window and would look like a hang.
 */
export function parseUpstreamTimeoutMs(raw: string | undefined): number {
  const trimmed = raw?.trim();
  if (!trimmed) return defaultUpstreamTimeoutMs;
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 100 || parsed > 60_000)
    return defaultUpstreamTimeoutMs;
  return parsed;
}

export function resolveWebConfig(
  env: NodeJS.ProcessEnv = process.env,
): WebConfig {
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    port: parsePort(env.WEB_PORT),
    host: env.WEB_HOST?.trim() || defaultWebHost,
    apiBaseUrl: parseApiBaseUrl(env.API_BASE_URL),
    siteOrigin: parseSiteOrigin(env.SITE_ORIGIN),
    upstreamTimeoutMs: parseUpstreamTimeoutMs(env.UPSTREAM_TIMEOUT_MS),
  };
}

/**
 * Production must name these explicitly.
 *
 * A default that happens to work on a laptop is not a default that works in a
 * container, and "it silently pointed at the wrong host" is indistinguishable
 * from "the API is down" at the edge.  `WEB_HOST` is deliberately *not* gated:
 * leaving it at `127.0.0.1` inside a container makes Caddy unable to connect,
 * which fails the web healthcheck and keeps Caddy from starting — a loud
 * failure, not a silent wrong answer.
 */
export function assertWebConfig(
  config: WebConfig,
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (config.nodeEnv !== 'production') return;
  // Presence is read from the raw environment, not from the resolved value:
  // an operator who explicitly sets `API_BASE_URL=http://127.0.0.1:4100` has
  // made a decision, and the resolved value cannot tell that apart from the
  // default.  Only "the variable is absent" is the error we want to raise.
  if (!env.API_BASE_URL?.trim())
    throw new Error('API_BASE_URL is required in production');
  if (!config.siteOrigin)
    throw new Error('SITE_ORIGIN is required in production');
}

export function loadWebConfig(env: NodeJS.ProcessEnv = process.env): WebConfig {
  const config = resolveWebConfig(env);
  assertWebConfig(config, env);
  return config;
}

function parseAbsoluteHttpUrl(value: string, name: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute http(s) URL`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol))
    throw new Error(`${name} must be an absolute http(s) URL`);
  return parsed;
}
