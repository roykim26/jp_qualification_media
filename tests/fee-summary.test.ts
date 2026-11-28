import { describe, expect, it } from 'vitest';
import {
  feeAmountOf,
  summarizeQualificationFee,
  type FeeFact,
} from '../packages/schema/src/fee.js';

function fee(overrides: Partial<FeeFact>): FeeFact {
  return {
    factKey: 'fee',
    examYear: 2026,
    displayValue: '',
    normalizedValue: '',
    providerId: null,
    examLevelId: null,
    examComponent: null,
    deliveryMode: null,
    ...overrides,
  };
}

describe('qualification fee summary', () => {
  it('shows a range instead of one arbitrary level/provider amount', () => {
    const summary = summarizeQualificationFee([
      fee({
        providerId: 'jafp',
        examLevelId: 'fp:1',
        examComponent: 'practical',
        deliveryMode: 'pbt',
        normalizedValue: '20000',
        displayValue: '20,000円（非課税）',
      }),
      fee({
        providerId: 'jafp',
        examLevelId: 'fp:2',
        examComponent: 'academic',
        deliveryMode: 'cbt',
        normalizedValue: '5700',
        displayValue: '5,700円（非課税）',
      }),
      fee({
        providerId: 'kinzai',
        examLevelId: 'fp:1',
        examComponent: 'practical',
        deliveryMode: 'interview',
        normalizedValue: '28000',
        displayValue: '28,000円',
      }),
      fee({
        providerId: 'kinzai',
        examLevelId: 'fp:1',
        examComponent: 'academic',
        deliveryMode: 'pbt',
        normalizedValue: '8900',
        displayValue: '8,900円',
      }),
    ]);
    expect(summary).toMatchObject({
      min: 5700,
      max: 28000,
      isRange: true,
      hasScope: true,
      scopeCount: 4,
      examYear: 2026,
    });
    expect(summary?.display).toBe('5,700円～28,000円');
  });

  it('uses a single global fee without a scope qualifier', () => {
    const summary = summarizeQualificationFee([
      fee({ normalizedValue: '8200', displayValue: '8200円' }),
    ]);
    expect(summary).toMatchObject({
      min: 8200,
      max: 8200,
      isRange: false,
      hasScope: false,
      scopeCount: 1,
      display: '8,200円',
    });
  });

  it('does not merge different years into one range', () => {
    const summary = summarizeQualificationFee([
      fee({ examYear: 2026, normalizedValue: '8200', displayValue: '8,200円' }),
      fee({ examYear: 2027, normalizedValue: '9000', displayValue: '9,000円' }),
    ]);
    expect(summary).toMatchObject({ min: 9000, max: 9000, examYear: 2027 });
  });

  it('keeps the same amount scoped when the fact is level-specific', () => {
    const summary = summarizeQualificationFee([
      fee({
        examLevelId: 'bookkeeping:1',
        normalizedValue: '8800',
        displayValue: '8,800円（税込）',
      }),
    ]);
    expect(summary).toMatchObject({
      isRange: false,
      hasScope: true,
      scopeCount: 1,
    });
    expect(summary?.display).toBe('8,800円');
  });

  it('reads full-width official amounts and returns null when unparseable', () => {
    expect(
      feeAmountOf(
        fee({
          normalizedValue: '４，８００',
          displayValue: '４，８００円（税込）',
        }),
      ),
    ).toBe(4800);
    expect(feeAmountOf(fee({ displayValue: '要確認' }))).toBeNull();
    expect(summarizeQualificationFee([])).toBeNull();
  });
});
