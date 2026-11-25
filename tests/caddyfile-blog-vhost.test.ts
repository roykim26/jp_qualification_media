import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

/**
 * The live Caddy configuration used to drift from the repository: the
 * `blog.waystoneai.online` vhost was added by hand on the VPS in November 2026
 * and only existed in `/opt/jpqm/deploy/caddy/Caddyfile`.  Rebuilding the stack
 * from git would have silently dropped the blog's routing.  The block now lives
 * here, so these tests exist to keep it from drifting back out.
 *
 * They read the two deployment files as text on purpose: there is no Caddy
 * parser in this repo, and the failure we are guarding against (a block that
 * quietly disappears) is visible in the text.
 */

const caddyfile = readFileSync('deploy/caddy/Caddyfile', 'utf8');
const compose = readFileSync('deploy/docker-compose.prod.yml', 'utf8');

/** Returns the body of a top-level site block, from its `{` to its matching `}`. */
function siteBlock(host: string): string {
  const start = caddyfile.indexOf(`\n${host} {`);
  expect(start, `Caddyfile has no ${host} block`).toBeGreaterThanOrEqual(0);
  const open = caddyfile.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < caddyfile.length; i += 1) {
    if (caddyfile[i] === '{') depth += 1;
    else if (caddyfile[i] === '}') {
      depth -= 1;
      if (depth === 0) return caddyfile.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces in the ${host} block`);
}

describe('caddyfile blog vhost', () => {
  it('routes the blog host to the nginx container', () => {
    expect(siteBlock('blog.waystoneai.online')).toContain(
      'reverse_proxy blog:8080',
    );
  });

  it('keeps the blog access log out of the main site log', () => {
    const blog = siteBlock('blog.waystoneai.online');
    expect(blog).toContain('/var/log/caddy/blog-access.log');
    expect(blog).not.toContain('/var/log/caddy/access.log');
  });

  it('bounds both access logs by size', () => {
    // The roll settings are what keeps the volume bounded; a log block without
    // them grows until the disk fills.  Both site blocks need them, so check
    // each one separately rather than looking for the strings anywhere in the
    // file: a `contains` on the whole document passes when only one block kept
    // them.
    for (const host of ['shikakucheck.com', 'blog.waystoneai.online']) {
      const block = siteBlock(host);
      expect(block, `${host} lost roll_size`).toContain('roll_size 10mb');
      expect(block, `${host} lost roll_keep`).toContain('roll_keep 5');
    }
  });

  it('applies the same security headers as the main site', () => {
    const main = siteBlock('shikakucheck.com');
    const blog = siteBlock('blog.waystoneai.online');
    for (const header of [
      'Strict-Transport-Security "max-age=31536000; includeSubDomains"',
      'X-Content-Type-Options "nosniff"',
      'X-Frame-Options "DENY"',
      'Referrer-Policy "strict-origin-when-cross-origin"',
      'Permissions-Policy "camera=(), microphone=(), geolocation=()"',
    ]) {
      expect(blog, `blog block lost: ${header}`).toContain(header);
      expect(main, `main block lost: ${header}`).toContain(header);
    }
  });

  it('still answers the search-engine verification files itself', () => {
    // These four paths are answered inline by Caddy so they survive a web
    // container restart.  They are the only routing that does not go through
    // `reverse_proxy web:3000`.
    const main = siteBlock('shikakucheck.com');
    expect(main).toContain('handle /googlea01c41ed599c5311.html');
    expect(main).toContain('handle /BingSiteAuth.xml');
    expect(main).toContain('handle /dd3d6c883de8475fb7f2d7639208d313.txt');
    expect(main).toContain('handle /b416920e453b400196646cfea16e885b.txt');
    expect(main).toContain('reverse_proxy web:3000');
  });

  it('documents that the blog container is not started by this compose file', () => {
    // The vhost resolves `blog` by name, but nothing in the prod compose file
    // creates that container: it is a hand-made nginx container joined to the
    // `deploy_default` network.  If someone adds it to compose, this test fails
    // and the comment above the block should be rewritten rather than ignored.
    expect(compose).not.toMatch(/^\s{2}blog:\s*$/m);
    const comment = caddyfile.slice(
      caddyfile.indexOf('# Blog host.'),
      caddyfile.indexOf('blog.waystoneai.online {'),
    );
    expect(comment).toContain('NOT part of deploy/docker-compose.prod.yml');
    expect(comment).toContain('/opt/blog/dist');
    expect(comment).toContain('502');
  });
});
