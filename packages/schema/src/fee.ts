import type { PublicFact } from './index.js';

export type FeeFact = Pick<
  PublicFact,
  | 'factKey'
  | 'examYear'
  | 'displayValue'
  | 'normalizedValue'
  | 'providerId'
  | 'examLevelId'
  | 'examComponent'
  | 'deliveryMode'
>;

export type QualificationFeeSummary = {
  /** Numeric range shown to readers; both equal when every scope agrees. */
  min: number;
  max: number;
  isRange: boolean;
  display: string;
  /** True when at least one approved fact carries a provider/level/component/mode. */
  hasScope: boolean;
  /** Number of distinct amount+scope combinations behind the summary. */
  scopeCount: number;
  examYear: number;
};

const fullwidthDigits = '０１２３４５６７８９，';
const asciiDigits = '0123456789,';

function normalizeNumericText(value: string): string {
  return [...value]
    .map((character) => {
      const index = fullwidthDigits.indexOf(character);
      if (index >= 0) return asciiDigits[index];
      return character;
    })
    .join('');
}

function isFeeFactKey(factKey: string): boolean {
  return factKey === 'fee' || factKey.endsWith('_fee');
}

/** Amount from the machine value first, then from an official `N円` cell. */
export function feeAmountOf(fact: FeeFact): number | null {
  const normalized = fact.normalizedValue;
  if (typeof normalized === 'number' && Number.isFinite(normalized))
    return normalized;
  if (typeof normalized === 'string') {
    const trimmed = normalizeNumericText(normalized).trim();
    if (/^\d+(?:\.\d+)?$/.test(trimmed)) return Number(trimmed);
  }
  const match = normalizeNumericText(fact.displayValue).match(
    /([0-9][0-9,]*)\s*円/,
  );
  if (!match) return null;
  const amount = Number(match[1].replaceAll(',', ''));
  return Number.isFinite(amount) ? amount : null;
}

function scopeDimensions(fact: FeeFact): string[] {
  return [
    fact.providerId ?? '',
    fact.examLevelId ?? '',
    fact.examComponent ?? '',
    fact.deliveryMode ?? '',
  ];
}

/**
 * One fee rule for the homepage card, the directory card, the detail summary
 * and the comparison page. Data with several scopes is never collapsed into a
 * single amount: the smallest and largest approved amounts are shown as a
 * range, and the caller labels the applicable scope. No amount is invented for
 * a scope the project has not approved.
 */
export function summarizeQualificationFee(
  facts: readonly FeeFact[],
): QualificationFeeSummary | null {
  const feeFacts = facts.filter((fact) => isFeeFactKey(fact.factKey));
  if (!feeFacts.length) return null;
  const examYear = Math.max(...feeFacts.map((fact) => fact.examYear));
  const sameYear = feeFacts.filter((fact) => fact.examYear === examYear);

  const byScope = new Map<
    string,
    { amount: number; scope: string[]; display: string }
  >();
  for (const fact of sameYear) {
    const amount = feeAmountOf(fact);
    if (amount === null) continue;
    const scope = scopeDimensions(fact);
    const key = JSON.stringify([amount, scope]);
    if (!byScope.has(key))
      byScope.set(key, { amount, scope, display: fact.displayValue });
  }
  const entries = [...byScope.values()];
  if (!entries.length) return null;

  const amounts = entries.map((entry) => entry.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  const isRange = min !== max;
  const display = isRange
    ? `${min.toLocaleString('ja-JP')}円～${max.toLocaleString('ja-JP')}円`
    : `${min.toLocaleString('ja-JP')}円`;
  return {
    min,
    max,
    isRange,
    display,
    hasScope: entries.some((entry) =>
      entry.scope.some((value) => value !== ''),
    ),
    scopeCount: entries.length,
    examYear,
  };
}
