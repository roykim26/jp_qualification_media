import { describe, expect, it } from 'vitest';
import {
  assertWebConfig,
  defaultApiBaseUrl,
  defaultUpstreamTimeoutMs,
  defaultWebHost,
  defaultWebPort,
  loadWebConfig,
  parseApiBaseUrl,
  parsePort,
  parseSiteOrigin,
  parseUpstreamTimeoutMs,
  resolveWebConfig,
} from '../apps/web/src/config.js';

describe('parseApiBaseUrl', () => {
  it('falls back to the local API when unset or blank', () => {
    expect(parseApiBaseUrl(undefined)).toBe('http://127.0.0.1:4100');
    expect(parseApiBaseUrl('')).toBe('http://127.0.0.1:4100');
    expect(parseApiBaseUrl('   ')).toBe('http://127.0.0.1:4100');
  });

  it('keeps a configured value', () => {
    expect(parseApiBaseUrl('http://api:4100')).toBe('http://api:4100');
    expect(parseApiBaseUrl('  http://api:4100  ')).toBe('http://api:4100');
  });

  // Sprint 3C: routes concatenate `${apiBaseUrl}/api/v1/...`, so a trailing
  // slash in the configured value used to produce `//api/v1/...`.
  it('strips trailing slashes so route concatenation stays single-slashed', () => {
    expect(parseApiBaseUrl('http://api:4100/')).toBe('http://api:4100');
    expect(parseApiBaseUrl('http://api:4100///')).toBe('http://api:4100');
    expect(parseApiBaseUrl('https://api.example.com/base/')).toBe(
      'https://api.example.com/base',
    );
  });

  it('rejects values that are not absolute http(s) URLs', () => {
    expect(() => parseApiBaseUrl('api:4100')).toThrow(
      'API_BASE_URL must be an absolute http(s) URL',
    );
    expect(() => parseApiBaseUrl('ftp://api:4100')).toThrow(
      'API_BASE_URL must be an absolute http(s) URL',
    );
    expect(() => parseApiBaseUrl('not a url')).toThrow(
      'API_BASE_URL must be an absolute http(s) URL',
    );
    expect(() => parseApiBaseUrl('/api')).toThrow(
      'API_BASE_URL must be an absolute http(s) URL',
    );
  });
});

describe('parseSiteOrigin', () => {
  it('is undefined when unset so callers can decide the fallback', () => {
    expect(parseSiteOrigin(undefined)).toBeUndefined();
    expect(parseSiteOrigin('')).toBeUndefined();
    expect(parseSiteOrigin('  ')).toBeUndefined();
  });

  it('returns the origin without path or trailing slash', () => {
    expect(parseSiteOrigin('https://shikakucheck.com')).toBe(
      'https://shikakucheck.com',
    );
    expect(parseSiteOrigin('https://shikakucheck.com/')).toBe(
      'https://shikakucheck.com',
    );
    expect(parseSiteOrigin('https://shikakucheck.com/some/path/')).toBe(
      'https://shikakucheck.com',
    );
    expect(parseSiteOrigin('http://127.0.0.1:3000')).toBe(
      'http://127.0.0.1:3000',
    );
  });

  it('rejects non-http(s) and malformed values', () => {
    expect(() => parseSiteOrigin('ftp://shikakucheck.com')).toThrow(
      'SITE_ORIGIN must be an absolute http(s) URL',
    );
    expect(() => parseSiteOrigin('shikakucheck.com')).toThrow(
      'SITE_ORIGIN must be an absolute http(s) URL',
    );
    expect(() => parseSiteOrigin('not a url')).toThrow(
      'SITE_ORIGIN must be an absolute http(s) URL',
    );
  });
});

describe('parsePort', () => {
  it('defaults to 3000 when unset or unusable', () => {
    expect(parsePort(undefined)).toBe(defaultWebPort);
    expect(parsePort('')).toBe(defaultWebPort);
    expect(parsePort('abc')).toBe(defaultWebPort);
    expect(parsePort('70000')).toBe(defaultWebPort);
    expect(parsePort('-1')).toBe(defaultWebPort);
    expect(parsePort('3000.5')).toBe(defaultWebPort);
  });

  it('accepts explicit ports including 0 (ephemeral)', () => {
    expect(parsePort('0')).toBe(0);
    expect(parsePort('3100')).toBe(3100);
    expect(parsePort('65535')).toBe(65535);
  });
});

describe('parseUpstreamTimeoutMs', () => {
  it('defaults to 5000 outside the documented bounds', () => {
    expect(parseUpstreamTimeoutMs(undefined)).toBe(defaultUpstreamTimeoutMs);
    expect(parseUpstreamTimeoutMs('')).toBe(defaultUpstreamTimeoutMs);
    expect(parseUpstreamTimeoutMs('50')).toBe(defaultUpstreamTimeoutMs);
    expect(parseUpstreamTimeoutMs('999999')).toBe(defaultUpstreamTimeoutMs);
    expect(parseUpstreamTimeoutMs('abc')).toBe(defaultUpstreamTimeoutMs);
  });

  it('accepts a value inside the bounds', () => {
    expect(parseUpstreamTimeoutMs('100')).toBe(100);
    expect(parseUpstreamTimeoutMs('250')).toBe(250);
    expect(parseUpstreamTimeoutMs('5000')).toBe(5000);
    expect(parseUpstreamTimeoutMs('60000')).toBe(60000);
  });
});

describe('resolveWebConfig', () => {
  it('fills every field from the environment', () => {
    const config = resolveWebConfig({
      NODE_ENV: 'production',
      WEB_PORT: '3100',
      WEB_HOST: '0.0.0.0',
      API_BASE_URL: 'http://api:4100',
      SITE_ORIGIN: 'https://shikakucheck.com',
      UPSTREAM_TIMEOUT_MS: '250',
    });
    expect(config).toEqual({
      nodeEnv: 'production',
      port: 3100,
      host: '0.0.0.0',
      apiBaseUrl: 'http://api:4100',
      siteOrigin: 'https://shikakucheck.com',
      upstreamTimeoutMs: 250,
    });
  });

  it('uses documented defaults when the environment is empty', () => {
    const config = resolveWebConfig({});
    expect(config).toEqual({
      nodeEnv: 'development',
      port: defaultWebPort,
      host: defaultWebHost,
      apiBaseUrl: defaultApiBaseUrl,
      siteOrigin: undefined,
      upstreamTimeoutMs: defaultUpstreamTimeoutMs,
    });
  });
});

describe('assertWebConfig', () => {
  const production = {
    nodeEnv: 'production',
    port: 3000,
    host: '0.0.0.0',
    apiBaseUrl: 'http://api:4100',
    siteOrigin: 'https://shikakucheck.com' as string | undefined,
    upstreamTimeoutMs: 5000,
  };

  it('requires API_BASE_URL in production', () => {
    expect(() =>
      assertWebConfig({ ...production, apiBaseUrl: defaultApiBaseUrl }, {}),
    ).toThrow('API_BASE_URL is required in production');
  });

  it('requires SITE_ORIGIN in production', () => {
    expect(() =>
      assertWebConfig(
        { ...production, siteOrigin: undefined },
        { API_BASE_URL: 'http://api:4100' },
      ),
    ).toThrow('SITE_ORIGIN is required in production');
  });

  it('accepts a fully configured production deployment', () => {
    expect(() =>
      assertWebConfig(production, {
        API_BASE_URL: 'http://api:4100',
        SITE_ORIGIN: 'https://shikakucheck.com',
      }),
    ).not.toThrow();
  });

  // Sprint 3C: an operator may deliberately point at the loopback API; only
  // an absent variable is an error.  Otherwise the resolved default would be
  // indistinguishable from an explicit choice.
  it('accepts an explicitly configured loopback API base URL', () => {
    expect(() =>
      assertWebConfig(
        { ...production, apiBaseUrl: defaultApiBaseUrl },
        {
          API_BASE_URL: defaultApiBaseUrl,
          SITE_ORIGIN: 'https://shikakucheck.com',
        },
      ),
    ).not.toThrow();
  });

  it('does not gate development or test', () => {
    for (const nodeEnv of ['development', 'test', undefined]) {
      expect(() =>
        assertWebConfig(
          {
            ...production,
            nodeEnv: nodeEnv ?? 'development',
            apiBaseUrl: defaultApiBaseUrl,
            siteOrigin: undefined,
          },
          {},
        ),
      ).not.toThrow();
    }
  });
});

describe('loadWebConfig', () => {
  it('refuses to start a production process without the required variables', () => {
    expect(() => loadWebConfig({ NODE_ENV: 'production' })).toThrow(
      'API_BASE_URL is required in production',
    );
    expect(() =>
      loadWebConfig({
        NODE_ENV: 'production',
        API_BASE_URL: 'http://api:4100',
      }),
    ).toThrow('SITE_ORIGIN is required in production');
  });

  it('still validates URL shape outside production', () => {
    expect(() =>
      loadWebConfig({ NODE_ENV: 'development', API_BASE_URL: 'api:4100' }),
    ).toThrow('API_BASE_URL must be an absolute http(s) URL');
    expect(() =>
      loadWebConfig({ NODE_ENV: 'test', SITE_ORIGIN: 'ftp://x' }),
    ).toThrow('SITE_ORIGIN must be an absolute http(s) URL');
  });

  it('keeps the pre-3C behaviour when NODE_ENV is absent', () => {
    // scripts/verify-lib.mjs starts the web process without NODE_ENV; this
    // must keep working exactly as before.
    expect(loadWebConfig({})).toEqual(resolveWebConfig({}));
  });

  it('keeps the pre-3C behaviour for NODE_ENV=test', () => {
    // tests/web-server.test.ts sets NODE_ENV=test and only API_BASE_URL.
    const config = loadWebConfig({
      NODE_ENV: 'test',
      API_BASE_URL: 'http://127.0.0.1:12345',
    });
    expect(config.apiBaseUrl).toBe('http://127.0.0.1:12345');
    expect(config.siteOrigin).toBeUndefined();
  });
});
