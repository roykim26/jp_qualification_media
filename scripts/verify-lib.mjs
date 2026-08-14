import { spawn } from 'node:child_process';
import process from 'node:process';
import { Client } from 'pg';
import baseline from '../config/release-gate-baseline.json' with { type: 'json' };

export const launchGate = baseline.qualifications;

export function createRuntime(databaseUrl) {
  const apiPort = Number(process.env.VERIFY_API_PORT ?? 4191);
  const webPort = Number(process.env.VERIFY_WEB_PORT ?? 3091);
  const children = [];
  const start = (args, env) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  };
  return {
    apiPort,
    webPort,
    start() {
      start(['dist/services/api/src/server.js'], {
        API_PORT: String(apiPort),
        DATABASE_URL: databaseUrl,
      });
      start(['dist/apps/web/src/server.js'], {
        WEB_PORT: String(webPort),
        API_BASE_URL: `http://127.0.0.1:${apiPort}`,
      });
    },
    stop() {
      for (const child of children) child.kill();
    },
  };
}

export async function waitFor(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`service did not become ready: ${url}`);
}

export async function verifyQualification(
  databaseUrl,
  runtime,
  gate,
  { requireNoOfficialPending = false } = {},
) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  const result = await client.query(
    `SELECT
      count(1) FILTER (WHERE c.status='approved' AND c.synthetic=false)::int AS approved_official,
      count(1) FILTER (WHERE c.status='pending_review' AND c.synthetic=false)::int AS pending_official,
      count(1) FILTER (WHERE c.status='pending_review' AND c.synthetic=true)::int AS pending_synthetic
     FROM candidate_facts c JOIN qualifications q ON q.id=c.qualification_id WHERE q.slug=$1`,
    [gate.slug],
  );
  await client.end();
  const database = result.rows[0];
  const errors = [];
  if (database.approved_official !== gate.expectedFacts)
    errors.push(
      `approved official ${database.approved_official} != ${gate.expectedFacts}`,
    );
  if (requireNoOfficialPending && database.pending_official !== 0)
    errors.push(`official pending ${database.pending_official} != 0`);

  const apiResponse = await waitFor(
    `http://127.0.0.1:${runtime.apiPort}/api/v1/qualifications/${gate.slug}`,
  );
  const api = await apiResponse.json();
  if (
    api.status !== 'verified' ||
    api.facts?.length !== gate.expectedFacts ||
    api.facts.some((fact) => fact.status !== 'approved' || fact.synthetic)
  )
    errors.push(`API status=${api.status}, facts=${api.facts?.length}`);
  const webResponse = await waitFor(
    `http://127.0.0.1:${runtime.webPort}/shikaku/${gate.slug}/`,
  );
  const html = await webResponse.text();
  if (!html.includes('公式確認済み'))
    errors.push('Web verified marker missing');
  if (!html.includes(gate.pageContains))
    errors.push(`Web missing ${gate.pageContains}`);
  return {
    slug: gate.slug,
    passed: errors.length === 0,
    database,
    api: { status: api.status, facts: api.facts?.length },
    web: { status: webResponse.status, pageContains: gate.pageContains },
    errors,
  };
}
