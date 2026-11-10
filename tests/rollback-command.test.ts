import { describe, expect, it } from 'vitest';
import { parseRollbackArgs } from '../scripts/rollback-fact.js';
import {
  buildRollbackEvent,
  normalizeRollbackAudit,
} from '../services/api/src/release.js';

const audit = ['--operator=jinlo', '--reason=approved wrong revision'];

describe('rollback command arguments', () => {
  it('accepts a confirmed rollback and trims the audit fields', () => {
    const parsed = parseRollbackArgs([
      '--fact-id=fact:1',
      '--operator= jinlo ',
      '--reason=  approved wrong revision  ',
      '--confirm=fact:1',
    ]);
    expect(parsed).toEqual({
      factId: 'fact:1',
      operatorId: 'jinlo',
      reason: 'approved wrong revision',
      toRevisionId: undefined,
      confirm: 'fact:1',
      dryRun: false,
    });
  });

  it('refuses to touch anything unless the fact id is repeated as --confirm', () => {
    expect(() => parseRollbackArgs(['--fact-id=fact:1', ...audit])).toThrow(
      '--confirm must repeat the exact --fact-id',
    );
    expect(() =>
      parseRollbackArgs(['--fact-id=fact:1', ...audit, '--confirm=fact:2']),
    ).toThrow('--confirm must repeat the exact --fact-id');
  });

  it('lets a dry run skip --confirm but still demands operator and reason', () => {
    expect(
      parseRollbackArgs(['--fact-id=fact:1', ...audit, '--dry-run']).dryRun,
    ).toBe(true);
    expect(() => parseRollbackArgs(['--fact-id=fact:1', '--dry-run'])).toThrow(
      'operator must be 2-64 characters',
    );
  });

  it('passes an explicit target revision through', () => {
    expect(
      parseRollbackArgs([
        '--fact-id=fact:1',
        ...audit,
        '--confirm=fact:1',
        '--to-revision=rev:old',
      ]).toRevisionId,
    ).toBe('rev:old');
  });

  it('rejects unknown, duplicated or valueless flags', () => {
    expect(() => parseRollbackArgs(['--fact-id=fact:1', '--force'])).toThrow(
      'unknown flag: --force',
    );
    expect(() =>
      parseRollbackArgs(['--fact-id=fact:1', '--operator=a', '--operator=b']),
    ).toThrow('duplicate flag: --operator');
    expect(() => parseRollbackArgs(['--fact-id='])).toThrow(
      '--fact-id needs a value',
    );
    expect(() => parseRollbackArgs(['fact:1'])).toThrow(
      'unexpected argument: fact:1',
    );
  });

  it('keeps the reason long enough to be useful', () => {
    expect(() =>
      normalizeRollbackAudit({ operatorId: 'jinlo', reason: '错' }),
    ).toThrow('reason must be 5-500 characters');
    expect(() =>
      normalizeRollbackAudit({
        operatorId: 'jin lo',
        reason: 'wrong revision',
      }),
    ).toThrow('operator must not contain whitespace');
  });
});

describe('rollback change event audit fields', () => {
  const base = {
    factId: 'fact:1',
    factKey: 'fee',
    qualificationId: 'qualification:fp',
    currentRevisionId: 'rev:new',
    previousRevisionId: 'rev:old',
  };

  it('carries the operator and reason into the change event', () => {
    expect(
      buildRollbackEvent({ ...base, operatorId: 'jinlo', reason: 'wrong fee' }),
    ).toMatchObject({ operatorId: 'jinlo', reason: 'wrong fee' });
  });

  it('keeps automatic events free of audit fields', () => {
    expect(buildRollbackEvent(base)).not.toHaveProperty('operatorId');
    expect(buildRollbackEvent(base)).not.toHaveProperty('reason');
  });
});
