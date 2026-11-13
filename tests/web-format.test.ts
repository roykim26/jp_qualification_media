import { describe, expect, it } from 'vitest';
import { formatFactDisplayValue } from '../apps/web/src/format.js';

describe('formatFactDisplayValue (H2 display fix)', () => {
  it('attaches units and thousands separators to bare numbers', () => {
    expect(
      formatFactDisplayValue({ factKey: 'fee', displayValue: '8200' }),
    ).toBe('8,200円');
    expect(
      formatFactDisplayValue({ factKey: 'exam_time', displayValue: '120' }),
    ).toBe('120分');
    expect(
      formatFactDisplayValue({ factKey: 'question_count', displayValue: '50' }),
    ).toBe('50問');
    expect(
      formatFactDisplayValue({
        factKey: 'exam_subject_b_question_count',
        displayValue: '20',
      }),
    ).toBe('20問');
  });

  it('maps raw lowercase method enums to Japanese labels', () => {
    expect(
      formatFactDisplayValue({ factKey: 'exam_method', displayValue: 'paper' }),
    ).toBe('紙筆方式');
    expect(
      formatFactDisplayValue({ factKey: 'exam_method', displayValue: 'cbt' }),
    ).toBe('CBT方式');
  });

  it('formats raw ISO datetimes into readable Japanese', () => {
    const out = formatFactDisplayValue({
      factKey: 'exam_date',
      displayValue: '2026-10-18T13:00:00+09:00',
    });
    expect(out).toContain('2026年10月18日');
    expect(out).toContain('13:00');
    expect(out).not.toContain('T13:00');
  });

  it('formats comma-separated ISO lists', () => {
    const out = formatFactDisplayValue({
      factKey: 'application_deadline',
      displayValue: '2026-04-02T17:30:00+09:00,2026-07-28T17:30:00+09:00',
    });
    expect(out).toContain('2026年4月2日');
    expect(out).toContain('2026年7月28日');
    expect(out).toContain('／');
  });

  it('recovers a truncated date from the normalized value', () => {
    const out = formatFactDisplayValue({
      factKey: 'result_date',
      displayValue: '令和8年11月25日(水)9',
      normalizedValue: '2026-11-25T09:00:00+09:00',
    });
    expect(out).toContain('2026年11月25日');
    expect(out).toContain('09:00');
    expect(out).not.toContain('(水)9');
  });

  it('keeps human-readable official text verbatim', () => {
    const verbatim: Array<[string, string]> = [
      ['application_deadline', '7月31日(金)23時59分'],
      ['fee', '4,800円'],
      ['exam_method', 'CBT方式'],
      ['exam_method', '<CBT>'],
      ['exam_subject_a_time', '90分'],
      ['exam_date', '2026年10月18日'],
      ['exam_date', '2999-03-01'],
      ['eligibility', '日本国内に居住する方であれば、誰でも受験できます。'],
    ];
    for (const [factKey, displayValue] of verbatim) {
      expect(formatFactDisplayValue({ factKey, displayValue })).toBe(
        displayValue,
      );
    }
  });
});
