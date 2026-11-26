import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const sql = await readFile(
  new URL('../fixtures/ci/approved-facts.sql', import.meta.url),
  'utf8',
);
assert.match(sql, /^-- Generated sanitized CI fixture\./);
assert.equal((sql.match(/INSERT INTO facts /g) ?? []).length, 1811);
assert.equal((sql.match(/INSERT INTO candidate_facts /g) ?? []).length, 1811);
assert.equal((sql.match(/INSERT INTO fact_revisions /g) ?? []).length, 1811);
assert.equal((sql.match(/INSERT INTO snapshots /g) ?? []).length, 46);
// The export must keep the payment_method dimension column. The concrete
// values (convenience_store / pay_easy) were only carried by the two takken
// payment_deadline_rule facts, superseded by owner decision 2026-11-26
// (到期下架), so asserting the values would pin the fixture to those rows.
const candidateColumns = sql
  .match(/INSERT INTO candidate_facts \(([^)]*)\) VALUES/)?.[1]
  ?.split(',');
assert.ok(
  candidateColumns?.includes('payment_method'),
  'fixture lost the payment_method dimension column',
);
for (const forbidden of [
  'local-reviewer',
  'AppData',
  'var/official-snapshots',
  'E:\\',
  'C:\\',
  'INSERT INTO reviews',
]) {
  assert.equal(
    sql.includes(forbidden),
    false,
    `fixture contains forbidden value: ${forbidden}`,
  );
}
assert.equal(
  /,true,'2026-01-01T00:00:00\.000Z'::timestamptz\)/.test(sql),
  false,
  'fixture contains synthetic=true rows',
);
console.log('Sanitized CI fixture structure verified.');
