import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const caddyfile = readFileSync(
  new URL('../deploy/caddy/Caddyfile', import.meta.url),
  'utf8',
);
const mainSite = caddyfile
  .slice(caddyfile.indexOf('\nshikakucheck.com {'))
  .split('blog.waystoneai.online {')[0];

function directive(name) {
  const match = mainSite.match(new RegExp(`${name}\\s+"([^"]+)"`));
  return match?.[1];
}

test('the main site sends a report-only CSP and keeps the existing headers', () => {
  assert.match(mainSite, /Content-Security-Policy-Report-Only\s+"/);
  assert.doesNotMatch(mainSite, /^\s*Content-Security-Policy\s+"/m);
  for (const header of [
    'Strict-Transport-Security',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Referrer-Policy',
    'Permissions-Policy',
  ]) {
    assert.ok(directive(header), `${header} is still configured`);
  }
});

test('the CSP is minimal and has no wildcard source', () => {
  const policy = directive('Content-Security-Policy-Report-Only');
  assert.ok(policy, 'CSP is present');
  for (const required of [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "object-src 'none'",
  ]) {
    assert.ok(policy.includes(required), `policy includes ${required}`);
  }
  // A bare `*` source would defeat the purpose; allow it only inside 'none'.
  assert.doesNotMatch(policy, /(^|;\s*)\*(;|$)/);
  assert.doesNotMatch(policy, /default-src[^;]*\*/);
  assert.doesNotMatch(policy, /unsafe-eval/);
});

test('the CSP names the scripts, connections and assets the site actually uses', () => {
  const policy = directive('Content-Security-Policy-Report-Only');
  assert.match(policy, /script-src[^;]*'self'/);
  assert.match(policy, /script-src[^;]*https:\/\/www\.googletagmanager\.com/);
  assert.match(policy, /style-src[^;]*'self'/);
  assert.match(policy, /img-src[^;]*'self'/);
  assert.match(policy, /font-src[^;]*'self'/);
  assert.match(policy, /connect-src[^;]*'self'/);
  assert.match(policy, /connect-src[^;]*https:\/\/www\.google-analytics\.com/);
  assert.match(
    policy,
    /connect-src[^;]*https:\/\/region1\.google-analytics\.com/,
  );
});

test('the unrelated blog vhost is not given the site CSP', () => {
  const blog = caddyfile.slice(caddyfile.indexOf('blog.waystoneai.online {'));
  assert.doesNotMatch(blog, /Content-Security-Policy/);
});
