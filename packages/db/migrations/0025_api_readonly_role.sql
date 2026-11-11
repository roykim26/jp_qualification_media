-- Runtime API account: read-only and separate from the migration/ingest admin.
-- The role stays NOLOGIN here; scripts/provision-api-db-role.mjs enables LOGIN
-- and sets the password so no credential is committed.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'qualification_api_ro') THEN
    CREATE ROLE qualification_api_ro NOLOGIN;
  END IF;
END
$$;

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
