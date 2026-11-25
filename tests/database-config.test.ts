import { describe, expect, it } from 'vitest';
import {
  DatabaseNotConfiguredError,
  resolveDatabaseUrl,
} from '../services/api/src/database-config.js';

const url = 'postgresql://user@host:5432/db';

describe('database configuration tri-state', () => {
  it('passes a configured URL through untouched', () => {
    expect(resolveDatabaseUrl(url, 'production')).toBe(url);
    expect(resolveDatabaseUrl(url, 'development')).toBe(url);
    expect(resolveDatabaseUrl(url, 'test')).toBe(url);
  });

  it('keeps the test escape hatch so the unit suite can exercise empty data', () => {
    // tests/setup.ts deletes DATABASE_URL and vitest sets NODE_ENV=test; the
    // "no database configured" behaviour is still documented and asserted.
    expect(resolveDatabaseUrl(undefined, 'test')).toBeUndefined();
  });

  it('throws when configuration is missing outside a test run', () => {
    for (const env of ['production', 'development', 'staging', undefined]) {
      expect(() => resolveDatabaseUrl(undefined, env)).toThrow(
        DatabaseNotConfiguredError,
      );
    }
  });

  it('carries a stable machine-readable identity', () => {
    const error = new DatabaseNotConfiguredError();
    expect(error.name).toBe('DatabaseNotConfiguredError');
    expect(error.message).toBe(
      'DATABASE_URL / API_DATABASE_URL is not configured',
    );
    expect(error.missing).toBe('DATABASE_URL / API_DATABASE_URL');
    expect(error).toBeInstanceOf(Error);
  });

  it('treats an empty string as missing, not as a usable URL', () => {
    // `process.env.X = ''` yields '' rather than undefined; both must fail loudly.
    expect(() => resolveDatabaseUrl('', 'development')).toThrow(
      DatabaseNotConfiguredError,
    );
  });
});
