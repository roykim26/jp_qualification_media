import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const repoRoot = fileURLToPath(new URL('..', import.meta.url));
const runId = `${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
const image = `jpqm-smoke:${runId}`;
const network = `jpqm-smoke-net-${runId}`;
const dbContainer = `jpqm-smoke-db-${runId}`;
const apiContainer = `jpqm-smoke-api-${runId}`;
const webContainer = `jpqm-smoke-web-${runId}`;
const dbName = 'jpqm_smoke';
const dbUser = 'jpqm_smoke';
const dbPassword = 'jpqm_smoke_password';
const databaseUrl = `postgresql://${dbUser}:${dbPassword}@${dbContainer}:5432/${dbName}`;
const containers = [dbContainer, apiContainer, webContainer];

function docker(args, { input, allowFailure = false } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, {
      cwd: repoRoot,
      stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      if (args[0] === 'build') process.stdout.write(chunk);
      else stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    if (input !== undefined) {
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0 || allowFailure)
        resolve({ code, stdout: stdout.trim(), stderr: stderr.trim() });
      else
        reject(
          new Error(
            `docker ${args.join(' ')} exited with ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
    });
  });
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

function envFlags(values) {
  return Object.entries(values).flatMap(([key, value]) => [
    '-e',
    `${key}=${value}`,
  ]);
}

async function freePorts(count) {
  const servers = Array.from({ length: count }, () => createServer());
  await Promise.all(
    servers.map(
      (server) =>
        new Promise((resolve, reject) => {
          server.once('error', reject);
          server.listen(0, '127.0.0.1', resolve);
        }),
    ),
  );
  const ports = servers.map((server) => server.address().port);
  await Promise.all(
    servers.map((server) => new Promise((resolve) => server.close(resolve))),
  );
  return ports;
}

async function waitForUrl(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${url} responded ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(1000);
  }
  throw new Error(`service did not become ready: ${url} (${lastError})`);
}

async function get(url) {
  const response = await fetch(url);
  return {
    status: response.status,
    contentType: response.headers.get('content-type') ?? '',
    body: await response.text(),
  };
}

async function psql(sql) {
  const { stdout } = await docker([
    'run',
    '--rm',
    '--network',
    network,
    '-e',
    `PGPASSWORD=${dbPassword}`,
    'postgres:16-alpine',
    'psql',
    '-h',
    dbContainer,
    '-U',
    dbUser,
    '-d',
    dbName,
    '-v',
    'ON_ERROR_STOP=1',
    '-t',
    '-A',
    '-c',
    sql,
  ]);
  return stdout;
}

async function runChecked(name, fn) {
  await fn();
  console.log(`ok - ${name}`);
}

async function main() {
  console.log('building the production image');
  await docker(['build', '--file', 'Dockerfile', '--tag', image, '.']);

  await docker(['network', 'create', network]);
  await docker([
    'run',
    '--detach',
    '--name',
    dbContainer,
    '--network',
    network,
    ...envFlags({
      POSTGRES_DB: dbName,
      POSTGRES_USER: dbUser,
      POSTGRES_PASSWORD: dbPassword,
    }),
    'postgres:16-alpine',
  ]);
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const ready = await docker(
      ['exec', dbContainer, 'pg_isready', '-U', dbUser, '-d', dbName],
      { allowFailure: true },
    );
    if (ready.code === 0) break;
    await delay(1000);
    if (attempt === 59) throw new Error('postgres did not become ready');
  }

  console.log('running migrations inside the image');
  const migrationCount = await docker([
    'run',
    '--rm',
    image,
    'sh',
    '-c',
    'ls dist/packages/db/migrations/*.sql | wc -l',
  ]);
  expect(
    Number(migrationCount.stdout) > 0,
    'the image did not ship the SQL migrations under dist/packages/db/migrations',
  );
  const migrate = await docker([
    'run',
    '--rm',
    '--network',
    network,
    ...envFlags({ DATABASE_URL: databaseUrl, NODE_ENV: 'development' }),
    image,
    'node',
    'dist/packages/db/src/migrate.js',
  ]);
  expect(
    migrate.stdout.includes('Applied '),
    `migrations did not run: ${migrate.stdout || migrate.stderr}`,
  );
  const applied = await psql('SELECT count(*) FROM schema_migrations');
  expect(
    applied === String(Number(migrationCount.stdout)),
    `applied ${applied} of ${migrationCount.stdout} shipped migrations`,
  );
  const rerun = await docker([
    'run',
    '--rm',
    '--network',
    network,
    ...envFlags({ DATABASE_URL: databaseUrl, NODE_ENV: 'development' }),
    image,
    'node',
    'dist/packages/db/src/migrate.js',
  ]);
  expect(
    !rerun.stdout.includes('Applied '),
    `migrations are not idempotent: ${rerun.stdout}`,
  );

  await docker([
    'run',
    '--rm',
    '--network',
    network,
    ...envFlags({ DATABASE_URL: databaseUrl, NODE_ENV: 'development' }),
    image,
    'node',
    'dist/packages/db/src/seed.js',
  ]);

  console.log('restoring the sanitized CI fixture');
  const fixture = await readFile(
    new URL('../fixtures/ci/approved-facts.sql', import.meta.url),
    'utf8',
  );
  await docker(
    [
      'run',
      '--rm',
      '-i',
      '--network',
      network,
      ...envFlags({ PGPASSWORD: dbPassword }),
      'postgres:16-alpine',
      'psql',
      '-h',
      dbContainer,
      '-U',
      dbUser,
      '-d',
      dbName,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      '-',
    ],
    { input: fixture },
  );

  const [apiPort, webPort] = await freePorts(2);
  await docker([
    'run',
    '--detach',
    '--name',
    apiContainer,
    '--network',
    network,
    '-p',
    `127.0.0.1:${apiPort}:4100`,
    ...envFlags({ DATABASE_URL: databaseUrl, API_HOST: '0.0.0.0' }),
    image,
    'node',
    'dist/services/api/src/server.js',
  ]);
  await docker([
    'run',
    '--detach',
    '--name',
    webContainer,
    '--network',
    network,
    '-p',
    `127.0.0.1:${webPort}:3000`,
    ...envFlags({
      WEB_HOST: '0.0.0.0',
      API_BASE_URL: `http://${apiContainer}:4100`,
      SITE_ORIGIN: 'https://smoke.invalid',
    }),
    image,
    'node',
    'dist/apps/web/src/server.js',
  ]);

  const apiBase = `http://127.0.0.1:${apiPort}`;
  const webBase = `http://127.0.0.1:${webPort}`;
  await waitForUrl(`${apiBase}/api/v1/qualifications/bookkeeping`);
  await waitForUrl(`${webBase}/shikaku/bookkeeping/`);

  await runChecked('the image restores the 981 approved facts', async () => {
    const facts = await psql(
      `SELECT count(*) FROM facts f
         JOIN fact_revisions fr ON fr.id=f.current_revision_id
         JOIN candidate_facts c ON c.id=fr.candidate_fact_id
         JOIN snapshots s ON s.id=c.source_snapshot_id
         JOIN sources src ON src.id=c.source_id
        WHERE f.status='approved' AND fr.status='approved'
          AND c.status='approved' AND c.synthetic=false`,
    );
    expect(facts === '981', `expected 981 approved facts, got ${facts}`);
    const snapshots = await psql('SELECT count(*) FROM snapshots');
    expect(
      snapshots === '29',
      `expected 29 fixture snapshots, got ${snapshots}`,
    );
  });

  await runChecked('the home page renders', async () => {
    const page = await get(`${webBase}/`);
    expect(page.status === 200, `expected 200, got ${page.status}`);
    expect(
      page.contentType.includes('text/html'),
      `expected text/html, got ${page.contentType}`,
    );
    expect(
      page.body.includes('資格試験の公式情報'),
      'home page lost its brand',
    );
  });

  await runChecked('the qualification pages render', async () => {
    const page = await get(`${webBase}/shikaku/bookkeeping/`);
    expect(page.status === 200, `expected 200, got ${page.status}`);
    expect(page.body.includes('日商簿記'), 'bookkeeping page lost its name');
    const schedule = await get(`${webBase}/schedule/`);
    expect(schedule.status === 200, `expected 200, got ${schedule.status}`);
    const updates = await get(`${webBase}/updates/`);
    expect(updates.status === 200, `expected 200, got ${updates.status}`);
  });

  await runChecked('the API serves approved facts', async () => {
    const response = await get(`${apiBase}/api/v1/qualifications/bookkeeping`);
    expect(response.status === 200, `expected 200, got ${response.status}`);
    const view = JSON.parse(response.body);
    expect(
      ['verified', 'partially_announced'].includes(view.status),
      `unexpected status ${view.status}`,
    );
    expect(
      Array.isArray(view.facts) && view.facts.length >= 500,
      `expected at least 500 facts, got ${view.facts?.length}`,
    );
  });

  await runChecked(
    'the sitemap lists indexable qualification pages',
    async () => {
      const sitemap = await get(`${webBase}/sitemap.xml`);
      expect(sitemap.status === 200, `expected 200, got ${sitemap.status}`);
      expect(
        sitemap.body.includes('/shikaku/bookkeeping/pass-rate/'),
        'sitemap is missing the bookkeeping pass-rate page',
      );
      expect(
        !sitemap.body.includes('?year='),
        'sitemap must not list ?year= filter pages',
      );
    },
  );

  await runChecked('the year filter stays noindex', async () => {
    const page = await get(
      `${webBase}/shikaku/bookkeeping/pass-rate/?year=2010`,
    );
    expect(page.status === 200, `expected 200, got ${page.status}`);
    expect(
      page.body.includes('content="noindex,follow"'),
      'year filter page is missing noindex,follow',
    );
  });

  await runChecked('the ICS download works', async () => {
    const response = await get(`${webBase}/ics/takken/2026.ics`);
    expect(response.status === 200, `expected 200, got ${response.status}`);
    expect(
      response.contentType.includes('text/calendar'),
      `expected text/calendar, got ${response.contentType}`,
    );
    expect(
      response.body.includes('BEGIN:VCALENDAR'),
      'ICS body is not a calendar',
    );
  });

  await runChecked('robots.txt points at the sitemap', async () => {
    const page = await get(`${webBase}/robots.txt`);
    expect(page.status === 200, `expected 200, got ${page.status}`);
    expect(
      page.body.includes('Sitemap: https://smoke.invalid/sitemap.xml'),
      'robots.txt lost its sitemap line',
    );
  });

  await runChecked('unknown qualifications 404', async () => {
    const page = await get(`${webBase}/shikaku/unknown-qualification/`);
    expect(page.status === 404, `expected 404, got ${page.status}`);
  });

  console.log('docker smoke passed');
}

async function diagnostics() {
  for (const name of containers) {
    const { stdout, stderr } = await docker(['logs', '--tail', '80', name], {
      allowFailure: true,
    });
    console.error(`--- docker logs ${name} ---`);
    console.error(`${stdout}\n${stderr}`.trim());
  }
}

try {
  await main();
} catch (error) {
  console.error(error);
  await diagnostics().catch((failure) => console.error(failure));
  process.exitCode = 1;
} finally {
  for (const name of containers)
    await docker(['rm', '--force', name], { allowFailure: true }).catch(
      () => {},
    );
  await docker(['network', 'rm', network], { allowFailure: true }).catch(
    () => {},
  );
  if (process.env.SMOKE_KEEP_IMAGE !== '1')
    await docker(['image', 'rm', '--force', image], {
      allowFailure: true,
    }).catch(() => {});
}
