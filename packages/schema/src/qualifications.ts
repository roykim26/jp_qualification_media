import type { Qualification } from './index.js';

// Stable identity and aliases only. No dynamic dates, fees, rates, or exam facts.
export const launchQualifications: Qualification[] = [
  {
    slug: 'takken',
    officialNameJa: '宅地建物取引士',
    aliasesJa: ['宅建'],
    field: 'law',
    category: 'national',
  },
  {
    slug: 'gyoseishoshi',
    officialNameJa: '行政書士',
    aliasesJa: [],
    field: 'law',
    category: 'national',
  },
  {
    slug: 'it-passport',
    officialNameJa: 'ITパスポート',
    aliasesJa: ['ITパス'],
    field: 'it',
    category: 'national',
  },
  {
    slug: 'fundamental-it-engineer',
    officialNameJa: '基本情報技術者',
    aliasesJa: ['FE'],
    field: 'it',
    category: 'national',
  },
  {
    slug: 'bookkeeping',
    officialNameJa: '日商簿記',
    aliasesJa: ['簿記'],
    field: 'accounting',
    category: 'private',
  },
  {
    slug: 'fp',
    officialNameJa: 'FP技能検定',
    aliasesJa: ['FP', 'ファイナンシャル・プランニング技能検定'],
    field: 'finance',
    category: 'national',
  },
];

export type QualificationSearchResult = Qualification & {
  matchedFields: string[];
};

export function normalizeQualificationSearchText(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('ja-JP')
    .replaceAll(/\s+/g, '');
}

export function qualificationSearchTokens(
  qualification: Qualification,
): string[] {
  return [
    qualification.officialNameJa,
    ...qualification.aliasesJa,
    qualification.slug,
  ];
}

export function searchQualifications(
  qualifications: readonly Qualification[],
  query: string,
): QualificationSearchResult[] {
  const normalizedQuery = normalizeQualificationSearchText(query);
  if (!normalizedQuery)
    return qualifications.map((qualification) => ({
      ...qualification,
      matchedFields: [],
    }));

  return qualifications
    .map((qualification) => {
      const matchedFields = qualificationSearchTokens(qualification).filter(
        (token) =>
          normalizeQualificationSearchText(token).includes(normalizedQuery),
      );
      return { ...qualification, matchedFields };
    })
    .filter((qualification) => qualification.matchedFields.length > 0);
}
