import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  formatAuthUser,
  parseAuthUsers,
  verifyBasic,
} from '../apps/admin/src/auth.js';

const password = 'correct horse battery staple';

describe('admin Basic auth', () => {
  it('parses generated entries and verifies the password', () => {
    const users = parseAuthUsers(formatAuthUser('alice', password));
    const header = `Basic ${Buffer.from(`alice:${password}`).toString('base64')}`;
    expect(verifyBasic(header, users)).toBe('alice');
  });

  it('rejects a wrong password and an unknown reviewer', () => {
    const users = parseAuthUsers(
      `${formatAuthUser('alice', password)},${formatAuthUser('bob', 'another long password')}`,
    );
    const wrongPassword = `Basic ${Buffer.from(`alice:wrong password`).toString('base64')}`;
    const unknownUser = `Basic ${Buffer.from(`carol:${password}`).toString('base64')}`;
    expect(verifyBasic(wrongPassword, users)).toBeNull();
    expect(verifyBasic(unknownUser, users)).toBeNull();
    expect(verifyBasic(undefined, users)).toBeNull();
    expect(verifyBasic('Bearer token', users)).toBeNull();
  });

  it('refuses malformed configuration instead of silently dropping a user', () => {
    expect(() => parseAuthUsers('alice:plain:abc')).toThrow(
      /invalid ADMIN_AUTH_USERS entry/,
    );
    expect(() => parseAuthUsers('alice:scrypt:abcd:abcd')).toThrow(
      /invalid ADMIN_AUTH_USERS hash/,
    );
    expect(() => parseAuthUsers('a b:scrypt:0011:22')).toThrow(
      /invalid ADMIN_AUTH_USERS reviewer name/,
    );
  });

  it('treats an empty variable as "no users"', () => {
    expect(parseAuthUsers(undefined).size).toBe(0);
    expect(parseAuthUsers('').size).toBe(0);
    expect(parseAuthUsers(' , ').size).toBe(0);
  });

  it('produces entries the CLI script also accepts', () => {
    const entry = execFileSync(
      process.execPath,
      ['scripts/admin-hash-password.mjs', 'cli-user'],
      { env: { ...process.env, ADMIN_PASSWORD: password }, encoding: 'utf8' },
    ).trim();
    const users = parseAuthUsers(entry);
    const header = `Basic ${Buffer.from(`cli-user:${password}`).toString('base64')}`;
    expect(verifyBasic(header, users)).toBe('cli-user');
  });
});
