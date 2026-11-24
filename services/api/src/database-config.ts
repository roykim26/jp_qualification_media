/**
 * Configuration tri-state for the public API data plane.
 *
 * Before this module existed, a missing `DATABASE_URL` was indistinguishable
 * from "this qualification legitimately has no approved facts yet": every
 * reader returned `[]` and every route answered 200. Sprint 3A measured the
 * consequence — with no configuration the sitemap silently dropped all six
 * qualification pages while still advertising itself as a successful 200.
 *
 * The fix is to fail loudly at the source instead of degrading quietly.
 * Note that "database unreachable" is a different condition and is *not*
 * handled here: that path already throws out of `pool.query()` and surfaces
 * as a 5xx, which is correct.
 */

/** Thrown when no database URL is configured outside of a test run. */
export class DatabaseNotConfiguredError extends Error {
  readonly missing: string;

  constructor(missing = 'DATABASE_URL / API_DATABASE_URL') {
    super(`${missing} is not configured`);
    this.name = 'DatabaseNotConfiguredError';
    this.missing = missing;
  }
}

/**
 * Resolve a possibly-missing database URL into a definite value.
 *
 * - configured: returned unchanged
 * - missing under `NODE_ENV=test`: returns `undefined` so the unit-test suite
 *   keeps exercising the documented "no database" behaviour. `tests/setup.ts`
 *   deliberately deletes `DATABASE_URL`, and vitest sets `NODE_ENV=test`;
 *   without this escape hatch every `app.inject` assertion would throw.
 * - missing anywhere else: throws, because a deployment without configuration
 *   must not answer as though it were healthy and empty.
 */
export function resolveDatabaseUrl(
  databaseUrl: string | undefined,
  env: string | undefined,
): string | undefined {
  if (databaseUrl) return databaseUrl;
  if (env === 'test') return undefined;
  throw new DatabaseNotConfiguredError();
}
