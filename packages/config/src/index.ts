export const config = {
  timezone: 'Asia/Tokyo',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiHost: process.env.API_HOST ?? '127.0.0.1',
  apiPort: Number(process.env.API_PORT ?? 4100),
  databaseUrl: process.env.DATABASE_URL,
  // Migrations, seeds and ingest keep the admin account; the public API reads
  // through a separate read-only login. Local dev may fall back to DATABASE_URL.
  apiDatabaseUrl: process.env.API_DATABASE_URL ?? process.env.DATABASE_URL,
};

if (config.nodeEnv === 'production' && !config.databaseUrl)
  throw new Error('DATABASE_URL is required in production');
if (config.nodeEnv === 'production' && !process.env.API_DATABASE_URL)
  throw new Error('API_DATABASE_URL is required in production');
