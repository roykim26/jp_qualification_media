import { readFile, rename, writeFile } from 'node:fs/promises';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const confirmation = 'UPDATE_RELEASE_GATE_BASELINE';
const confirmedByArgument = process.argv.includes(`--confirm=${confirmation}`);
const confirmedByEnvironment =
  process.env.RELEASE_BASELINE_CONFIRM === confirmation;
const databaseUrl = process.env.DATABASE_URL;
const baselineUrl = new URL(
  '../config/release-gate-baseline.json',
  import.meta.url,
);

if (!confirmedByArgument || !confirmedByEnvironment) {
  console.error(
    `Refusing baseline update. Require both --confirm=${confirmation} and RELEASE_BASELINE_CONFIRM=${confirmation}.`,
  );
  process.exit(2);
}
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}
const parsedDatabaseUrl = new URL(databaseUrl);
if (!['localhost', '127.0.0.1'].includes(parsedDatabaseUrl.hostname)) {
  console.error('Baseline update only permits a localhost database.');
  process.exit(2);
}

const baseline = JSON.parse(await readFile(baselineUrl, 'utf8'));
const slugs = baseline.qualifications.map((item) => item.slug);
const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
await client.connect();
let rows;
try {
  // Must match verify-lib's approved_official definition: facts keeps one current
  // revision per dimension while candidate_facts accumulates every approved generation.
  const result = await client.query(
    `SELECT q.slug,
      (
        SELECT count(1)::int
        FROM facts f
        JOIN fact_revisions fr ON fr.id = f.current_revision_id
        JOIN candidate_facts c ON c.id = fr.candidate_fact_id
        JOIN snapshots s ON s.id = c.source_snapshot_id
        JOIN sources src ON src.id = c.source_id
        WHERE f.qualification_id = q.id
          AND f.status = 'approved' AND fr.status = 'approved'
          AND c.status = 'approved' AND c.synthetic = false
      ) AS approved_official,
      (
        SELECT count(1)::int
        FROM candidate_facts c
        WHERE c.qualification_id = q.id
          AND c.status = 'pending_review' AND c.synthetic = false
      ) AS pending_official
     FROM qualifications q
     WHERE q.slug = ANY($1::text[])
     ORDER BY q.slug`,
    [slugs],
  );
  rows = result.rows;
} finally {
  await client.end();
}
const bySlug = new Map(rows.map((row) => [row.slug, row]));
for (const slug of slugs) {
  const row = bySlug.get(slug);
  if (!row || row.approved_official < 1)
    throw new Error(`cannot baseline ${slug}: no approved official facts`);
  if (row.pending_official !== 0)
    throw new Error(
      `cannot baseline ${slug}: ${row.pending_official} official candidates pending review`,
    );
}
const updated = {
  ...baseline,
  qualifications: baseline.qualifications.map((item) => ({
    ...item,
    expectedFacts: bySlug.get(item.slug).approved_official,
  })),
};
const targetPath = fileURLToPath(baselineUrl);
const temporaryPath = `${targetPath}.tmp`;
await writeFile(temporaryPath, `${JSON.stringify(updated, null, 2)}\n`, {
  encoding: 'utf8',
  flag: 'wx',
});
await rename(temporaryPath, targetPath);
console.log(
  JSON.stringify(
    {
      status: 'updated',
      baseline: targetPath,
      qualifications: updated.qualifications.map(({ slug, expectedFacts }) => ({
        slug,
        expectedFacts,
      })),
    },
    null,
    2,
  ),
);
