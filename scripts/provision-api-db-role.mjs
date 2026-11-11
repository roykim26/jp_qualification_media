import process from 'node:process';
import { Client } from 'pg';

// Idempotent provisioning for the read-only API account. Migrations create the
// role and grants; this script only enables LOGIN with a password from the
// environment, so credentials never land in git or in migration history.
const role = 'qualification_api_ro';
const confirmation = 'PROVISION_API_DB_ROLE';
const databaseUrl = process.env.DATABASE_URL;
const password = process.env.API_DB_PASSWORD;

if (!process.argv.includes(`--confirm=${confirmation}`)) {
  console.error(
    `Refusing to provision ${role}. Require --confirm=${confirmation}.`,
  );
  process.exit(2);
}
if (!databaseUrl) {
  console.error('DATABASE_URL (migration/admin account) is required.');
  process.exit(2);
}
if (!password) {
  console.error('API_DB_PASSWORD is required.');
  process.exit(2);
}
const parsedDatabaseUrl = new URL(databaseUrl);
if (!['localhost', '127.0.0.1'].includes(parsedDatabaseUrl.hostname)) {
  console.error('Role provisioning only permits a localhost database.');
  process.exit(2);
}

const client = new Client({
  connectionString: databaseUrl,
  connectionTimeoutMillis: 5000,
});
await client.connect();
try {
  const existing = await client.query(
    'SELECT 1 FROM pg_roles WHERE rolname = $1',
    [role],
  );
  if (!existing.rowCount) {
    console.error(`${role} is missing; run npm run db:migrate first.`);
    process.exitCode = 1;
  } else {
    // ALTER ROLE is a utility statement, so it rejects bind parameters; escape
    // the password as a SQL literal instead. The role name is a fixed constant.
    await client.query(
      `ALTER ROLE ${role} WITH LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOBYPASSRLS PASSWORD ${client.escapeLiteral(password)}`,
    );
    // Re-assert the grants so a second run converges instead of drifting.
    await client.query(`
      DO $$
      BEGIN
        EXECUTE format(
          'GRANT CONNECT ON DATABASE %I TO qualification_api_ro',
          current_database()
        );
      END
      $$;
      GRANT USAGE ON SCHEMA public TO qualification_api_ro;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO qualification_api_ro;
      REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
        ON ALL TABLES IN SCHEMA public FROM qualification_api_ro;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public
        GRANT SELECT ON TABLES TO qualification_api_ro;
    `);
    const database = await client.query('SELECT current_database() AS name');
    console.log(
      JSON.stringify(
        {
          status: 'ok',
          role,
          login: true,
          database: database.rows[0].name,
        },
        null,
        2,
      ),
    );
  }
} finally {
  await client.end();
}
