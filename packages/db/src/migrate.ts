import { readFile, readdir } from 'node:fs/promises';
import { Client } from 'pg';
import { config } from '../../config/src/index.js';

if (!config.databaseUrl) {
  console.log(
    'DATABASE_URL not set; migration not run (local skeleton check only).',
  );
  process.exit(0);
}
const client = new Client({ connectionString: config.databaseUrl });
await client.connect();
try {
  await client.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())',
  );
  const files = (await readdir(new URL('../migrations/', import.meta.url)))
    .filter((file) => file.endsWith('.sql'))
    .sort();
  for (const file of files) {
    const applied = await client.query(
      'SELECT 1 FROM schema_migrations WHERE name = $1',
      [file],
    );
    if (applied.rowCount) continue;
    const sql = await readFile(
      new URL(`../migrations/${file}`, import.meta.url),
      'utf8',
    );
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [
        file,
      ]);
      await client.query('COMMIT');
      console.log(`Applied ${file}.`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  }
} finally {
  await client.end();
}
