import { mkdir, rename, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const confirmation = 'EXPORT_SANITIZED_CI_FIXTURE';
if (
  !process.argv.includes(`--confirm=${confirmation}`) ||
  process.env.CI_FIXTURE_EXPORT_CONFIRM !== confirmation
) {
  console.error(
    `Refusing export. Require both --confirm=${confirmation} and CI_FIXTURE_EXPORT_CONFIRM=${confirmation}.`,
  );
  process.exit(2);
}
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}
const parsedUrl = new URL(databaseUrl);
if (!['localhost', '127.0.0.1'].includes(parsedUrl.hostname)) {
  console.error('CI fixture export only permits a localhost database.');
  process.exit(2);
}

const sqlString = (value) =>
  value === null || value === undefined
    ? 'NULL'
    : `'${String(value).replaceAll("'", "''")}'`;
const sqlJson = (value) => `${sqlString(JSON.stringify(value))}::jsonb`;
const fixedTime = `'2026-01-01T00:00:00.000Z'::timestamptz`;
const slugs = [
  'takken',
  'gyoseishoshi',
  'it-passport',
  'fundamental-it-engineer',
  'bookkeeping',
  'fp',
];

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
await client.connect();
let candidates;
try {
  const pending = await client.query(
    `SELECT q.slug, count(1)::int count FROM candidate_facts c JOIN qualifications q ON q.id=c.qualification_id WHERE q.slug=ANY($1::text[]) AND c.status='pending_review' AND c.synthetic=false GROUP BY q.slug`,
    [slugs],
  );
  if (pending.rowCount)
    throw new Error(
      `official candidates pending review: ${JSON.stringify(pending.rows)}`,
    );
  const result = await client.query(
    `
    SELECT c.*, q.slug, s.content_hash, fr.id AS revision_id,
      fr.normalized_value AS revision_normalized_value, fr.display_value AS revision_display_value,
      f.id AS fact_id
    FROM facts f
    JOIN qualifications q ON q.id=f.qualification_id
    JOIN fact_revisions fr ON fr.id=f.current_revision_id
    JOIN candidate_facts c ON c.id=fr.candidate_fact_id
    JOIN snapshots s ON s.id=c.source_snapshot_id
    WHERE q.slug=ANY($1::text[]) AND f.status='approved' AND fr.status='approved'
      AND c.status='approved' AND c.synthetic=false
    ORDER BY q.slug,c.provider_id NULLS FIRST,c.exam_level_id NULLS FIRST,
      c.exam_component NULLS FIRST,c.delivery_mode NULLS FIRST,c.exam_year,c.fact_key,c.id`,
    [slugs],
  );
  candidates = result.rows;
} finally {
  await client.end();
}

const counts = new Map(slugs.map((slug) => [slug, 0]));
for (const row of candidates) counts.set(row.slug, counts.get(row.slug) + 1);
const snapshots = [
  ...new Map(candidates.map((row) => [row.source_snapshot_id, row])).values(),
].sort((a, b) => a.source_snapshot_id.localeCompare(b.source_snapshot_id));
const lines = [
  '-- Generated sanitized CI fixture. Do not edit by hand.',
  '-- Contains no reviewer identities, review reasons, local filesystem paths, or synthetic facts.',
  'BEGIN;',
];
for (const row of snapshots)
  lines.push(
    `INSERT INTO snapshots (id,source_id,content_hash,object_key,synthetic,retrieved_at) VALUES (${sqlString(row.source_snapshot_id)},${sqlString(row.source_id)},${sqlString(row.content_hash)},${sqlString(`ci://official-snapshot/${row.source_snapshot_id}`)},false,${fixedTime});`,
  );
for (const row of candidates)
  lines.push(
    `INSERT INTO candidate_facts (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,exam_year,fact_key,value_type,normalized_value,display_value,evidence_text,status,risk_level,source_id,source_snapshot_id,synthetic,created_at) VALUES (${sqlString(row.id)},${sqlString(row.qualification_id)},${sqlString(row.provider_id)},${sqlString(row.exam_level_id)},${sqlString(row.exam_component)},${sqlString(row.delivery_mode)},${row.exam_year},${sqlString(row.fact_key)},${sqlString(row.value_type)}::fact_value_type,${sqlJson(row.normalized_value)},${sqlString(row.display_value)},${sqlString(row.evidence_text)},'approved',${sqlString(row.risk_level)}::risk_level,${sqlString(row.source_id)},${sqlString(row.source_snapshot_id)},false,${fixedTime});`,
  );
for (const row of candidates)
  lines.push(
    `INSERT INTO fact_revisions (id,candidate_fact_id,status,normalized_value,display_value,valid_from,verified_at,idempotency_key) VALUES (${sqlString(row.revision_id)},${sqlString(row.id)},'approved',${sqlJson(row.revision_normalized_value)},${sqlString(row.revision_display_value)},${fixedTime},${fixedTime},${sqlString(`ci:${row.id}`)});`,
  );
for (const row of candidates)
  lines.push(
    `INSERT INTO facts (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,exam_year,fact_key,current_revision_id,status) VALUES (${sqlString(row.fact_id)},${sqlString(row.qualification_id)},${sqlString(row.provider_id)},${sqlString(row.exam_level_id)},${sqlString(row.exam_component)},${sqlString(row.delivery_mode)},${row.exam_year},${sqlString(row.fact_key)},${sqlString(row.revision_id)},'approved');`,
  );
lines.push('COMMIT;', '');

const targetUrl = new URL('../fixtures/ci/approved-facts.sql', import.meta.url);
const target = fileURLToPath(targetUrl);
await mkdir(fileURLToPath(new URL('../fixtures/ci/', import.meta.url)), {
  recursive: true,
});
const temporary = `${target}.tmp`;
await writeFile(temporary, lines.join('\n'), { encoding: 'utf8', flag: 'wx' });
await rename(temporary, target);
console.log(
  JSON.stringify(
    {
      status: 'exported',
      target,
      snapshots: snapshots.length,
      facts: candidates.length,
      counts: Object.fromEntries(counts),
    },
    null,
    2,
  ),
);
