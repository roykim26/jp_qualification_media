import { Pool } from 'pg';

/**
 * Probe pools keyed by connection string.
 *
 * A single module-level singleton would be a bug here: the first probe's URL
 * would be reused for every later call, so a probe against a dead host would
 * happily report the health of a previously-seen live one. Keying by URL keeps
 * the pool reuse (no connection storm) without letting a stale target answer for
 * the wrong database.
 */
const probePools = new Map<string, Pool>();

export type ReadinessReport =
  | { ready: true; database: 'ok' }
  | { ready: false; database: 'error'; message: string }
  | { ready: false; database: 'unconfigured' };

function probeDatabasePool(databaseUrl: string): Pool {
  let pool = probePools.get(databaseUrl);
  if (!pool) {
    pool = new Pool({
      connectionString: databaseUrl,
      connectionTimeoutMillis: 5000,
      // A probe must not sit in a queue behind app traffic.
      max: 1,
    });
    probePools.set(databaseUrl, pool);
  }
  return pool;
}

/**
 * Readiness probe: proves the data plane can actually serve a query.
 *
 * Deliberately does NOT reuse `resolveDatabaseUrl()` from `database-config.js`.
 * That helper honours a `NODE_ENV=test` escape hatch so the unit suite can keep
 * exercising the documented "no database configured" behaviour. A probe must
 * never inherit that hatch: `/ready` is an operational tool and reporting
 * "ready" for a process with no database URL would be exactly the kind of lie
 * this sprint exists to remove.
 *
 * Only `SELECT 1` is issued — no business table is touched, nothing is written,
 * and no result is cached: every call performs a real round trip.
 */
export async function checkDatabaseReadiness(
  databaseUrl: string | undefined,
): Promise<ReadinessReport> {
  if (!databaseUrl) return { ready: false, database: 'unconfigured' };
  try {
    await probeDatabasePool(databaseUrl).query('SELECT 1');
    return { ready: true, database: 'ok' };
  } catch (error) {
    return {
      ready: false,
      database: 'error',
      message: (error as Error).message,
    };
  }
}
