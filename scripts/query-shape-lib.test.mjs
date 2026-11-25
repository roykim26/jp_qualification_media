import assert from 'node:assert/strict';
import test from 'node:test';
import {
  countRowsMissingKeys,
  duplicatedTargets,
  missingColumns,
  shapeProblems,
} from './query-shape-lib.mjs';

const fields = (...names) => names.map((name) => ({ name }));

test('missingColumns names the columns the driver did not return', () => {
  assert.deepEqual(missingColumns(fields('a', 'c'), ['a', 'b', 'c', 'd']), [
    'b',
    'd',
  ]);
});

test('missingColumns keeps the order of the requested columns', () => {
  // The message is part of the contract: a caller pasting it into an issue should
  // see the columns in the order the query declares them, not alphabetically.
  // The names are deliberately out of alphabetical order, otherwise a sort() in
  // the implementation would produce the same output and this test would agree
  // with a bug.
  assert.deepEqual(missingColumns(fields(), ['provider_id', 'exam_level_id']), [
    'provider_id',
    'exam_level_id',
  ]);
});

test('missingColumns treats absent fields as everything missing', () => {
  // A driver that returns no field metadata at all is not a reason to pass.
  assert.deepEqual(missingColumns(undefined, ['a']), ['a']);
});

test('missingColumns is empty when the shape matches', () => {
  assert.deepEqual(missingColumns(fields('a', 'b'), ['a', 'b']), []);
});

test('countRowsMissingKeys ignores null values from a LEFT JOIN', () => {
  // This is the whole reason the check uses `in` rather than a truthiness test:
  // a fact with no snapshot legitimately yields null, and null is present.
  const rows = [{ snapshot_id: null, object_key: null }];
  assert.equal(countRowsMissingKeys(rows, ['snapshot_id', 'object_key']), 0);
});

test('countRowsMissingKeys counts rows whose key is absent', () => {
  const rows = [{ snapshot_id: 's1' }, { snapshot_id: undefined }, {}];
  // The second row has the key (value undefined), the third does not.
  assert.equal(countRowsMissingKeys(rows, ['snapshot_id']), 1);
});

test('countRowsMissingKeys treats an empty result as clean', () => {
  assert.equal(countRowsMissingKeys([], ['a']), 0);
});

test('shapeProblems reports a missing column', () => {
  // The rows already carry `b`, so the only complaint is the SELECT.
  const result = { fields: fields('a'), rows: [{ a: 1, b: 2 }] };
  assert.deepEqual(shapeProblems('STALENESS_QUERY', result, ['a', 'b']), [
    'STALENESS_QUERY does not return: b',
  ]);
});

test('shapeProblems reports rows without the key', () => {
  const result = { fields: fields('a', 'b'), rows: [{ a: 1, b: 2 }, { a: 3 }] };
  assert.deepEqual(shapeProblems('MVP audit query', result, ['a', 'b']), [
    '1 row(s) lack a column',
  ]);
});

test('shapeProblems lets each caller name its own kind of key', () => {
  // The noun only shows up in the row message; the column message names the
  // query instead. Both callers keep their own wording so an operator reading
  // the failure knows which report to look at.
  const provenance = { fields: fields('a', 'b'), rows: [{ a: 1 }] };
  assert.deepEqual(
    shapeProblems(
      'MVP audit query',
      provenance,
      ['a', 'b'],
      'provenance column',
    ),
    ['1 row(s) lack a provenance column'],
  );
  const rowsResult = { fields: fields('a', 'b'), rows: [{}] };
  assert.deepEqual(
    shapeProblems('STALENESS_QUERY', rowsResult, ['a', 'b'], 'dimension key'),
    ['1 row(s) lack a dimension key'],
  );
});

test('shapeProblems reports both problems at once', () => {
  // Reporting only the first would send the reader round the loop twice.
  const result = { fields: fields('a'), rows: [{ a: 1 }] };
  assert.deepEqual(shapeProblems('Q', result, ['a', 'b']), [
    'Q does not return: b',
    '1 row(s) lack a column',
  ]);
});

test('shapeProblems is empty for a clean result', () => {
  const result = { fields: fields('a', 'b'), rows: [{ a: 1, b: null }] };
  assert.deepEqual(shapeProblems('Q', result, ['a', 'b']), []);
});

test('duplicatedTargets is null when every target is distinct', () => {
  assert.equal(duplicatedTargets(['a', 'b', 'c']), null);
});

test('duplicatedTargets counts the extra copies and names the repeats', () => {
  const result = duplicatedTargets(['a', 'b', 'a', 'a', 'c']);
  assert.deepEqual(result, { extra: 2, repeated: ['a'] });
});

test('duplicatedTargets names each repeated target once', () => {
  const result = duplicatedTargets(['a', 'b', 'a', 'b']);
  assert.deepEqual(result, { extra: 2, repeated: ['a', 'b'] });
});

test('duplicatedTargets treats an empty list as distinct', () => {
  assert.equal(duplicatedTargets([]), null);
});
