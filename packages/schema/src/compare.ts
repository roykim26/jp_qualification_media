import type { PublicFact, Qualification } from './index.js';

export type CompareDimensionKey =
  | 'application_rule'
  | 'application_deadline'
  | 'exam_date'
  | 'exam_method'
  | 'exam_time'
  | 'fee'
  | 'eligibility'
  | 'passing_standard'
  | 'pass_rate';

export type PublicCompareEntry = Pick<
  PublicFact,
  | 'factKey'
  | 'examYear'
  | 'providerId'
  | 'examLevelId'
  | 'examComponent'
  | 'deliveryMode'
  | 'paymentMethod'
  | 'examSession'
  | 'verifiedAt'
  | 'officialVerifiedAt'
  | 'provenanceStatus'
  | 'sourceUrl'
> & { value: string };

export type PublicCompareCell = {
  entries: PublicCompareEntry[];
  missingReason?: string;
};

export type PublicCompareRow = {
  key: CompareDimensionKey;
  label: string;
  cells: Record<string, PublicCompareCell>;
};

export type PublicQualificationComparison = {
  qualifications: Qualification[];
  rows: PublicCompareRow[];
};

export const compareDimensions: readonly {
  key: CompareDimensionKey;
  label: string;
  prefixes: readonly string[];
}[] = [
  {
    key: 'application_rule',
    label: '申込みルール',
    prefixes: ['application_rule', 'application_change_'],
  },
  {
    key: 'application_deadline',
    label: '申込締切',
    prefixes: ['application_deadline'],
  },
  {
    key: 'exam_date',
    label: '試験日程',
    prefixes: ['exam_date', 'exam_schedule'],
  },
  { key: 'exam_method', label: '試験方式', prefixes: ['exam_method'] },
  { key: 'exam_time', label: '試験時間', prefixes: ['exam_time'] },
  { key: 'fee', label: '受験料・手数料', prefixes: ['fee'] },
  { key: 'eligibility', label: '受験資格', prefixes: ['eligibility'] },
  {
    key: 'passing_standard',
    label: '合格基準',
    prefixes: ['passing_standard', 'pass_mark'],
  },
  { key: 'pass_rate', label: '合格率', prefixes: ['pass_rate'] },
];

function matchesDimension(fact: PublicFact, prefixes: readonly string[]) {
  if (
    prefixes.includes('exam_time') &&
    /^exam_subject_[ab]_time$/.test(fact.factKey)
  )
    return true;
  return prefixes.some((prefix) => fact.factKey.startsWith(prefix));
}

function newestFirst(left: PublicFact, right: PublicFact): number {
  return (
    right.examYear - left.examYear ||
    right.verifiedAt.localeCompare(left.verifiedAt) ||
    left.factKey.localeCompare(right.factKey)
  );
}

function comparisonScope(fact: PublicFact): string {
  return JSON.stringify([
    fact.providerId ?? null,
    fact.examLevelId,
    fact.examComponent ?? null,
    fact.deliveryMode ?? null,
    fact.paymentMethod ?? null,
    fact.factKey,
  ]);
}

function cellFromFacts(
  facts: PublicFact[],
  missingReason?: string,
): PublicCompareCell {
  const latestYears = new Map<string, number>();
  const selected = new Map<string, PublicFact>();
  for (const fact of facts.sort(newestFirst)) {
    const scope = comparisonScope(fact);
    const latestYear = latestYears.get(scope);
    if (latestYear !== undefined && latestYear !== fact.examYear) continue;
    latestYears.set(scope, fact.examYear);
    const sessionKey = JSON.stringify([scope, fact.examSession ?? null]);
    if (!selected.has(sessionKey)) selected.set(sessionKey, fact);
  }
  const entries = [...selected.values()]
    .sort(
      (left, right) =>
        comparisonScope(left).localeCompare(comparisonScope(right)) ||
        (right.examSession ?? '').localeCompare(
          left.examSession ?? '',
          undefined,
          { numeric: true },
        ),
    )
    .map((fact): PublicCompareEntry => ({
      value: fact.displayValue,
      factKey: fact.factKey,
      providerId: fact.providerId,
      examLevelId: fact.examLevelId,
      examComponent: fact.examComponent,
      deliveryMode: fact.deliveryMode,
      paymentMethod: fact.paymentMethod,
      examSession: fact.examSession,
      examYear: fact.examYear,
      verifiedAt: fact.verifiedAt,
      officialVerifiedAt: fact.officialVerifiedAt,
      provenanceStatus: fact.provenanceStatus,
      sourceUrl: fact.sourceUrl,
    }));
  return { entries, ...(entries.length ? {} : { missingReason }) };
}

export function normalizeCompareSlugs(slugs: readonly string[]): string[] {
  return [...new Set(slugs.map((slug) => slug.trim()).filter(Boolean))].slice(
    0,
    3,
  );
}

export function buildQualificationComparison(
  qualifications: readonly Qualification[],
  facts: readonly PublicFact[],
  slugs: readonly string[],
  missingReasonsBySlug: Readonly<Record<string, Record<string, string>>> = {},
): PublicQualificationComparison {
  const selectedSlugs = normalizeCompareSlugs(slugs);
  const selectedQualifications = selectedSlugs
    .map((slug) =>
      qualifications.find((qualification) => qualification.slug === slug),
    )
    .filter((qualification): qualification is Qualification =>
      Boolean(qualification),
    );

  const rows = compareDimensions.map((dimension) => {
    const cells = Object.fromEntries(
      selectedQualifications.map((qualification) => {
        const scopedFacts = facts.filter(
          (candidate) =>
            candidate.qualificationSlug === qualification.slug &&
            matchesDimension(candidate, dimension.prefixes),
        );
        return [
          qualification.slug,
          cellFromFacts(
            scopedFacts,
            missingReasonsBySlug[qualification.slug]?.[dimension.key],
          ),
        ];
      }),
    );
    return {
      key: dimension.key,
      label: dimension.label,
      cells,
    };
  });

  return {
    qualifications: selectedQualifications,
    rows,
  };
}
