#!/usr/bin/env node
// Produce one `ADMIN_AUTH_USERS` entry: node scripts/admin-hash-password.mjs <name>
// The password is read from the ADMIN_PASSWORD environment variable (or stdin
// when a terminal is attached) so it never lands in the shell history.
import { randomBytes, scryptSync } from 'node:crypto';
import { readFileSync } from 'node:fs';

const name = process.argv[2];
if (!name || !/^[A-Za-z0-9._-]{2,32}$/.test(name)) {
  console.error('usage: node scripts/admin-hash-password.mjs <name>');
  process.exit(1);
}

function readPassword() {
  const fromEnv = process.env.ADMIN_PASSWORD;
  if (fromEnv) return fromEnv.replace(/\r?\n$/, '');
  if (process.stdin.isTTY) {
    // Prompt without echoing: keep it simple and read one line.
    process.stderr.write('password: ');
  }
  const input = readFileSync(0, 'utf8').replace(/\r?\n$/, '');
  if (!input) {
    console.error('password is empty');
    process.exit(1);
  }
  return input;
}

const password = readPassword();
if (password.length < 12) {
  console.error('password must be at least 12 characters');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 32);
console.log(`${name}:scrypt:${salt.toString('hex')}:${hash.toString('hex')}`);
