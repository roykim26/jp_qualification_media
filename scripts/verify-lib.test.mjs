import assert from 'node:assert/strict';
import test from 'node:test';
import { launchGate } from './verify-lib.mjs';
import baseline from '../config/release-gate-baseline.json' with { type: 'json' };

test('launch gate contains six unique qualifications with positive fact baselines', () => {
  assert.equal(launchGate.length, 6);
  assert.equal(new Set(launchGate.map((item) => item.slug)).size, 6);
  assert.deepEqual(
    launchGate.map((item) => item.slug),
    [
      'takken',
      'gyoseishoshi',
      'it-passport',
      'fundamental-it-engineer',
      'bookkeeping',
      'fp',
    ],
  );
  assert.ok(
    launchGate.every(
      (item) => Number.isInteger(item.expectedFacts) && item.expectedFacts > 0,
    ),
  );
  assert.ok(launchGate.every((item) => item.pageContains.length > 0));
  assert.equal(baseline.version, 1);
  assert.deepEqual(launchGate, baseline.qualifications);
});
