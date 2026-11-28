import { describe, expect, it } from 'vitest';
import {
  isNoOpUpdate,
  normalizedUpdateDisplayValue,
} from '../packages/schema/src/updates.js';

describe('public update no-op filtering (P1-01)', () => {
  it('hides an A -> A revision', () => {
    expect(
      isNoOpUpdate(
        'application_change_deadline_rule',
        '試験日の3日前まで変更可能',
        '試験日の3日前まで変更可能',
      ),
    ).toBe(true);
  });

  it('keeps a real A -> B change', () => {
    expect(isNoOpUpdate('fee', '8,200円', '9,000円')).toBe(false);
  });

  it('treats equal rendered values as a no-op even if the source rows differ', () => {
    // The API compares display_value, so an extra normalized/JSON field that
    // is not rendered cannot turn the same visible text into an update.
    expect(isNoOpUpdate('fee', '8,200円', '8,200円')).toBe(true);
  });

  it('normalises bare numbers and pre-formatted currency', () => {
    expect(isNoOpUpdate('fee', '8200', '8,200円')).toBe(true);
    expect(isNoOpUpdate('fee', '８２００', '8,200円')).toBe(true);
    expect(isNoOpUpdate('fee', '8200', '9,000円')).toBe(false);
  });

  it('normalises ISO datetimes against the rendered Japanese date', () => {
    expect(
      isNoOpUpdate(
        'exam_date',
        '2026-06-14T13:00:00+09:00',
        '2026年6月14日(日) 13:00',
      ),
    ).toBe(true);
  });

  it('normalises simple date separators for comparison', () => {
    expect(isNoOpUpdate('exam_date', '2026/06/14', '2026-06-14')).toBe(true);
    expect(isNoOpUpdate('exam_date', '2026年6月14日', '2026-06-14')).toBe(true);
  });

  it('ignores surrounding and repeated whitespace', () => {
    expect(
      isNoOpUpdate(
        'eligibility',
        ' 誰でも受験できます。 ',
        '誰でも受験できます。',
      ),
    ).toBe(true);
    expect(
      isNoOpUpdate(
        'eligibility',
        '誰でも  受験できます。',
        '誰でも 受験できます。',
      ),
    ).toBe(true);
  });

  it('normalises raw method enums against their labels', () => {
    expect(isNoOpUpdate('exam_method', 'cbt', 'CBT方式')).toBe(true);
  });

  it('publishes a first value but hides an empty one', () => {
    expect(isNoOpUpdate('fee', null, '8,200円')).toBe(false);
    expect(isNoOpUpdate('fee', null, '')).toBe(true);
    expect(isNoOpUpdate('fee', null, '   ')).toBe(true);
  });

  it('hides a revision whose after value renders empty', () => {
    expect(isNoOpUpdate('fee', '8,200円', '')).toBe(true);
  });

  it('exposes the canonical rendered value used for comparison', () => {
    expect(normalizedUpdateDisplayValue('fee', '8200')).toBe('8,200円');
    expect(normalizedUpdateDisplayValue('fee', null)).toBe('');
  });
});
