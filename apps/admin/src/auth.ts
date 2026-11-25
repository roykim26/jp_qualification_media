import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

export interface AdminUser {
  name: string;
  salt: Buffer;
  hash: Buffer;
}

/**
 * Parse `ADMIN_AUTH_USERS`: a comma-separated list of
 * `name:scrypt:<saltHex>:<hashHex>` entries produced by
 * `node scripts/admin-hash-password.mjs <name>`.
 *
 * The format is validated strictly. A malformed entry is a configuration error
 * and the process must refuse to start instead of silently dropping a reviewer,
 * because dropping a reviewer would silently shrink who can approve facts.
 */
export function parseAuthUsers(
  raw: string | undefined,
): Map<string, AdminUser> {
  const users = new Map<string, AdminUser>();
  if (!raw?.trim()) return users;
  for (const entry of raw.split(',')) {
    const value = entry.trim();
    if (!value) continue;
    const parts = value.split(':');
    if (parts.length !== 4 || parts[1] !== 'scrypt') {
      throw new Error(
        `invalid ADMIN_AUTH_USERS entry for "${parts[0] ?? '?'}": expected name:scrypt:<saltHex>:<hashHex>`,
      );
    }
    const [name, , saltHex, hashHex] = parts;
    if (!/^[A-Za-z0-9._-]{2,32}$/.test(name)) {
      throw new Error(`invalid ADMIN_AUTH_USERS reviewer name: ${name}`);
    }
    const salt = Buffer.from(saltHex, 'hex');
    const hash = Buffer.from(hashHex, 'hex');
    if (salt.length !== SALT_LENGTH || hash.length !== KEY_LENGTH) {
      throw new Error(`invalid ADMIN_AUTH_USERS hash for "${name}"`);
    }
    users.set(name, { name, salt, hash });
  }
  return users;
}

export function hashPassword(password: string): { salt: Buffer; hash: Buffer } {
  const salt = randomBytes(SALT_LENGTH);
  return { salt, hash: scryptSync(password, salt, KEY_LENGTH) };
}

/** Build one `ADMIN_AUTH_USERS` entry, used by the password hashing script. */
export function formatAuthUser(name: string, password: string): string {
  const { salt, hash } = hashPassword(password);
  return `${name}:scrypt:${salt.toString('hex')}:${hash.toString('hex')}`;
}

/**
 * Resolve the reviewer from an `Authorization: Basic` header. Returns the
 * configured user name when the password matches, otherwise null. Unknown users
 * and wrong passwords deliberately produce the same result so the response does
 * not reveal which reviewer names exist.
 */
export function verifyBasic(
  header: string | undefined,
  users: Map<string, AdminUser>,
): string | null {
  if (!header?.startsWith('Basic ')) return null;
  const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString(
    'utf8',
  );
  const separator = decoded.indexOf(':');
  if (separator <= 0) return null;
  const name = decoded.slice(0, separator);
  const password = decoded.slice(separator + 1);
  const user = users.get(name);
  if (!user) {
    // Still pay the scrypt cost so a missing reviewer is not distinguishable
    // from a wrong password by timing.
    scryptSync(password, Buffer.alloc(SALT_LENGTH), KEY_LENGTH);
    return null;
  }
  const candidate = scryptSync(password, user.salt, KEY_LENGTH);
  return timingSafeEqual(candidate, user.hash) ? name : null;
}
