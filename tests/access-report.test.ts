import { describe, expect, it } from 'vitest';
import {
  classifyReferer,
  isBot,
  parseAccessLine,
  summarize,
} from '../scripts/access-report.mjs';

const chrome =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

function logLine(overrides: Record<string, unknown> = {}): string {
  const { request: requestOverrides, ...rest } = overrides;
  const request = {
    remote_ip: '203.0.113.10',
    client_ip: '203.0.113.10',
    method: 'GET',
    host: 'shikakucheck.com',
    uri: '/',
    headers: { 'User-Agent': [chrome] },
    ...(requestOverrides as Record<string, unknown> | undefined),
  };
  return JSON.stringify({
    level: 'info',
    ts: 1794646800, // 2026-11-14T09:00:00Z = 2026-11-14 18:00 JST
    logger: 'http.log.access',
    msg: 'handled request',
    status: 200,
    size: 1234,
    duration: 0.02,
    ...rest,
    request,
  });
}

describe('parseAccessLine', () => {
  it('parses a Caddy JSON access line into an entry', () => {
    const entry = parseAccessLine(logLine())!;
    expect(entry).not.toBeNull();
    expect(entry.date).toBe('2026-11-14');
    expect(entry.method).toBe('GET');
    expect(entry.pathname).toBe('/');
    expect(entry.status).toBe(200);
    expect(entry.clientIp).toBe('203.0.113.10');
    expect(entry.userAgent).toBe(chrome);
  });

  it('splits query strings and reads the referer header', () => {
    const entry = parseAccessLine(
      logLine({
        request: {
          uri: '/shikaku/?q=%E5%AE%85%E5%BB%BA',
          headers: {
            'User-Agent': [chrome],
            Referer: ['https://www.google.co.jp/'],
          },
        },
      }),
    )!;
    expect(entry.pathname).toBe('/shikaku/');
    expect(entry.query).toBe('q=%E5%AE%85%E5%BB%BA');
    expect(entry.referer).toBe('https://www.google.co.jp/');
  });

  it('falls back to remote_ip when client_ip is missing', () => {
    const entry = parseAccessLine(
      logLine({ request: { client_ip: '', remote_ip: '198.51.100.7' } }),
    )!;
    expect(entry.clientIp).toBe('198.51.100.7');
  });

  it('rejects malformed or non-request lines', () => {
    expect(parseAccessLine('')).toBeNull();
    expect(parseAccessLine('not json')).toBeNull();
    expect(parseAccessLine('{"level":"info","ts":1794646800}')).toBeNull();
    expect(
      parseAccessLine('{"ts":"yesterday","request":{"uri":"/"}}'),
    ).toBeNull();
  });
});

describe('isBot', () => {
  it('flags known crawlers and scripts, keeps real browsers', () => {
    expect(isBot('Mozilla/5.0 (compatible; Googlebot/2.1)')).toBe(true);
    expect(isBot('Mozilla/5.0 (compatible; bingbot/2.0)')).toBe(true);
    expect(isBot('curl/8.5.0')).toBe(true);
    expect(isBot('node')).toBe(true);
    expect(isBot('')).toBe(true);
    expect(isBot(chrome)).toBe(false);
    expect(
      isBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'),
    ).toBe(false);
  });
});

describe('classifyReferer', () => {
  it('classifies direct, search, sns, internal and other', () => {
    expect(classifyReferer('')).toBe('direct');
    expect(classifyReferer('https://www.google.co.jp/search?q=takken')).toBe(
      'search',
    );
    expect(classifyReferer('https://www.bing.com/search?q=fp')).toBe('search');
    expect(classifyReferer('https://search.yahoo.co.jp/search?p=fp')).toBe(
      'search',
    );
    expect(classifyReferer('https://t.co/abc')).toBe('sns');
    expect(classifyReferer('https://x.com/post')).toBe('sns');
    expect(classifyReferer('https://shikakucheck.com/schedule/')).toBe(
      'internal',
    );
    expect(classifyReferer('https://www.shikakucheck.com/')).toBe('internal');
    expect(classifyReferer('https://example.com/blog')).toBe('other');
    expect(classifyReferer('not a url')).toBe('other');
  });
});

describe('summarize', () => {
  const entries = [
    parseAccessLine(logLine())!,
    parseAccessLine(
      logLine({
        request: {
          uri: '/schedule/',
          client_ip: '203.0.113.11',
          headers: {
            'User-Agent': [chrome],
            Referer: ['https://www.google.com/'],
          },
        },
      }),
    )!,
    parseAccessLine(
      logLine({
        request: {
          uri: '/ics/month/2026-11.ics',
          client_ip: '203.0.113.11',
          headers: { 'User-Agent': [chrome] },
        },
      }),
    )!,
    parseAccessLine(
      logLine({
        request: {
          uri: '/shikaku/?q=takken',
          headers: { 'User-Agent': [chrome] },
        },
      }),
    )!,
    parseAccessLine(
      logLine({
        request: {
          uri: '/compare/takken-vs-gyoseishoshi/',
          headers: { 'User-Agent': [chrome] },
        },
      }),
    )!,
    // Bot traffic must not count toward humans, pages, or features.
    parseAccessLine(
      logLine({
        request: {
          uri: '/',
          client_ip: '192.0.2.99',
          headers: { 'User-Agent': ['Googlebot/2.1'] },
        },
      }),
    )!,
    // Asset requests must not count as page views.
    parseAccessLine(
      logLine({
        request: {
          uri: '/images/brand-mark.png',
          headers: { 'User-Agent': [chrome] },
        },
      }),
    )!,
    // A 404 must not count as a page view but must appear in byStatus.
    parseAccessLine(
      logLine({
        status: 404,
        request: { uri: '/missing', headers: { 'User-Agent': [chrome] } },
      }),
    )!,
  ];

  it('aggregates totals, statuses, referrers, features and pages', () => {
    const report = summarize(entries);
    expect(report.totals.requests).toBe(8);
    expect(report.totals.human).toBe(7);
    expect(report.totals.bot).toBe(1);
    expect(report.totals.uniqueIps).toBe(2);
    expect(report.byStatus[200]).toBe(7);
    expect(report.byStatus[404]).toBe(1);
    expect(report.referrers.search).toBe(1);
    expect(report.referrers.direct).toBe(6);
    expect(report.featureUsage.ics).toEqual({ requests: 1, uniqueIps: 1 });
    expect(report.featureUsage.search).toEqual({ requests: 1, uniqueIps: 1 });
    expect(report.featureUsage.compare).toEqual({ requests: 1, uniqueIps: 1 });
    expect(report.topPages[0]).toEqual({ path: '/', count: 1 });
    expect(report.topPages.map((page) => page.path)).not.toContain(
      '/images/brand-mark.png',
    );
    expect(report.topPages.map((page) => page.path)).not.toContain('/missing');
    expect(report.days).toEqual([
      { date: '2026-11-14', requests: 7, uniqueIps: 2 },
    ]);
  });

  it('filters by JST date window', () => {
    const report = summarize(entries, {
      since: '2026-11-15',
      until: '2026-11-20',
    });
    expect(report.totals.requests).toBe(0);
    expect(report.topPages).toEqual([]);
    expect(report.days).toEqual([]);
  });

  it('keeps empty input safe', () => {
    const report = summarize([]);
    expect(report.totals).toEqual({
      requests: 0,
      human: 0,
      bot: 0,
      uniqueIps: 0,
    });
    expect(report.topPages).toEqual([]);
  });
});
