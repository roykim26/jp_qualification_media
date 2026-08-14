import type { PublicFact, Qualification } from './index.js';

export type CompareDimensionKey =
  | 'application_deadline'
  | 'exam_date'
  | 'exam_method'
  | 'exam_time'
  | 'fee'
  | 'eligibility'
  | 'passing_standard'
  | 'pass_rate';

export type PublicCompareCell = {
  value: string | null;
  factKey: string | null;
  examYear: number | null;
  verifiedAt: string | null;
  sourceUrl?: string;
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
  return prefixes.some((prefix) => fact.factKey.startsWith(prefix));
}

function newestFirst(left: PublicFact, right: PublicFact): number {
  return (
    right.examYear - left.examYear ||
    right.verifiedAt.localeCompare(left.verifiedAt) ||
    left.factKey.localeCompare(right.factKey)
  );
}

function cellFromFact(fact: PublicFact | undefined): PublicCompareCell {
  if (!fact)
    return {
      value: null,
      factKey: null,
      examYear: null,
      verifiedAt: null,
    };
  return {
    value: fact.displayValue,
    factKey: fact.factKey,
    examYear: fact.examYear,
    verifiedAt: fact.verifiedAt,
    sourceUrl: fact.sourceUrl,
  };
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
        const fact = facts
          .filter(
            (candidate) =>
              candidate.qualificationSlug === qualification.slug &&
              matchesDimension(candidate, dimension.prefixes),
          )
          .sort(newestFirst)[0];
        return [qualification.slug, cellFromFact(fact)];
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
