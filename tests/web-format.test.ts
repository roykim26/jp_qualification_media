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

  it('recovers a polluted date display from the normalized value (A3)', () => {
    // Real gyoseishoshi application_open pollution: a scraped navigation blob
    // landed in display_value while normalized_value stayed a clean ISO date.
    const blob =
      'インターネットによる受験申込み 郵送による申込み よくある質問FAQ 試験結果 令和７年度試験結果 結果概要 合格者受験番号 都道府県別試験結果一覧 合否判定基準 試験問題 試験問題の正解 試験結果分析 受験者・合格者の属性 試験結果の推移 試験結果分析資料 受験者の方 氏名・住所等変更届 合格証明書・合否通知書の再発行 行政書士の登録について 令和８年度行政書士試験のご案内 受験資格 年齢、学歴、国籍等に関係なく、どなたでも受験できます。 申込期間 【インターネット】 ＜推奨＞ 令和８年７月２１日（火）午前９時 ～';
    const out = formatFactDisplayValue({
      factKey: 'application_open',
      displayValue: blob,
      normalizedValue: '2026-07-21T09:00:00+09:00',
    });
    expect(out).toBe('2026年7月21日(火) 09:00');
  });

  it('keeps short official date text even when a normalized value exists', () => {
    const verbatim: Array<[string, string, string]> = [
      [
        'application_deadline',
        '【インターネット】 ＜推奨＞ 令和８年８月２４日（月）午後５時',
        '2026-08-24T17:00:00+09:00',
      ],
      ['exam_date', '令和８年１１月８日（日）', '2026-11-08'],
      [
        'result_date',
        '合格発表は、令和９年１月２７日（水）午前９時から',
        '2027-01-27',
      ],
      [
        'application_open',
        '2026年3月24日21:30以降',
        '2026-03-24T21:30:00+09:00',
      ],
    ];
    for (const [factKey, displayValue, normalizedValue] of verbatim) {
      expect(
        formatFactDisplayValue({ factKey, displayValue, normalizedValue }),
      ).toBe(displayValue);
    }
  });

  it('keeps date-only lists verbatim even when a normalized value exists', () => {
    const lists = [
      '2026-06-14、2026-11-15',
      '2026-05-24 / 2026-09-13 / 2027-01-24',
    ];
    for (const displayValue of lists) {
      expect(
        formatFactDisplayValue({
          factKey: 'exam_dates',
          displayValue,
          normalizedValue: displayValue
            .replace(/、/g, ',')
            .replace(/ \/ /g, ','),
        }),
      ).toBe(displayValue);
    }
  });

  it('does not rewrite long official rule text whose normalized value is not a date', () => {
    const rule =
      '申込受付日時、申込受付方法は、商工会議所によって異なります。試験日の約２か月前になりましたら、受験希望地の商工会議所までお問い合わせください。';
    expect(
      formatFactDisplayValue({
        factKey: 'application_deadline_rule',
        displayValue: rule,
        normalizedValue: 'venue_defined',
      }),
    ).toBe(rule);
  });

  it('only applies the pollution fallback to date-family fact keys', () => {
    const blob = 'x'.repeat(120);
    expect(
      formatFactDisplayValue({
        factKey: 'eligibility',
        displayValue: blob,
        normalizedValue: '2026-07-21T09:00:00+09:00',
      }),
    ).toBe(blob);
  });
});
