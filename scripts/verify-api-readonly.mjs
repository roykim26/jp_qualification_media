import process from 'node:process';
import { Client } from 'pg';

// Proves on a real database that the API account can read but cannot write.
// Every write attempt runs inside its own transaction and is rolled back, so a
// wrongly granted privilege fails the check without changing any row.
const databaseUrl = process.env.API_DATABASE_URL;

if (!databaseUrl) {
  console.error('API_DATABASE_URL (read-only account) is required.');
  process.exit(2);
}
const parsedDatabaseUrl = new URL(databaseUrl);
// Same opt-in as provisioning: default localhost, explicit flag inside compose.
const allowNonLocal = process.argv.includes('--allow-non-local');
if (
  !allowNonLocal &&
  !['localhost', '127.0.0.1'].includes(parsedDatabaseUrl.hostname)
) {
  console.error(
    'Read-only verification only permits a localhost database; pass --allow-non-local inside the deployment network.',
  );
  process.exit(2);
}

const writeAttempts = {
  insert: "INSERT INTO schema_migrations (name) VALUES ('api-readonly-probe')",
  update: 'UPDATE schema_migrations SET applied_at = now() WHERE false',
  delete: 'DELETE FROM schema_migrations WHERE false',
  create_table: 'CREATE TABLE api_readonly_probe (id integer)',
};

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
await client.connect();
const result = {
  status: 'unknown',
  currentUser: undefined,
  role: {},
  read: {},
  write: {},
};
let writesDenied = true;
try {
  const identity = await client.query(`
    SELECT current_user AS name, rolsuper, rolcreaterole, rolcreatedb
    FROM pg_roles WHERE rolname = current_user
  `);
  result.currentUser = identity.rows[0]?.name;
  result.role = {
    superuser: identity.rows[0]?.rolsuper,
    createRole: identity.rows[0]?.rolcreaterole,
    createDb: identity.rows[0]?.rolcreatedb,
  };

  const facts = await client.query('SELECT count(*)::int AS n FROM facts');
  const sources = await client.query('SELECT count(*)::int AS n FROM sources');
  result.read = { facts: facts.rows[0].n, sources: sources.rows[0].n };

  for (const [name, sql] of Object.entries(writeAttempts)) {
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('ROLLBACK');
      result.write[name] = 'allowed';
      writesDenied = false;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      result.write[name] =
        error.code === '42501' ? 'denied' : `error:${error.code ?? 'unknown'}`;
      if (error.code !== '42501') writesDenied = false;
    }
  }

  const roleIsLeastPrivilege =
    result.role.superuser === false &&
    result.role.createRole === false &&
    result.role.createDb === false;
  result.status = writesDenied && roleIsLeastPrivilege ? 'ok' : 'failed';
  if (result.status !== 'ok') process.exitCode = 1;
} catch (error) {
  result.status = 'error';
  result.error = error.message;
  process.exitCode = 1;
} finally {
  await client.end();
}
console.log(JSON.stringify(result, null, 2));
