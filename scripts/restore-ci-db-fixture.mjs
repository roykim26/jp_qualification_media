import { readFile } from 'node:fs/promises';
import process from 'node:process';
import { Client } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL is required.');
  process.exit(2);
}
const fixture = await readFile(
  new URL('../fixtures/ci/approved-facts.sql', import.meta.url),
  'utf8',
);
const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  await client.query(fixture);
} finally {
  await client.end();
}
console.log('Restored sanitized approved-facts CI fixture.');
