export const config = {
  timezone: 'Asia/Tokyo',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  apiHost: process.env.API_HOST ?? '127.0.0.1',
  apiPort: Number(process.env.API_PORT ?? 4100),
  databaseUrl: process.env.DATABASE_URL,
};

if (config.nodeEnv === 'production' && !config.databaseUrl)
  throw new Error('DATABASE_URL is required in production');
