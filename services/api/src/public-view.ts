import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type {
  PublicFact,
  Qualification,
} from '../../../packages/schema/src/index.js';
import {
  validateDataCoverageContract,
  type DataCoverageContract,
} from '../../../packages/schema/src/data-coverage-contract.js';
import type { PendingFactCoverage } from './public-facts.js';

export type PublicQualificationStatus =
  | 'verified'
  | 'partially_announced'
  | 'awaiting_official'
  | 'previous_year_reference'
  | 'changed_or_corrected'
  | 'application_open'
  | 'application_closed'
  | 'completed'
  | 'suspended'
  | 'under_review';

export type MissingReason =
  | 'not_announced'
  | 'not_collected'
  | 'pending_review'
  | 'not_applicable'
  | 'mapping_error'
  | 'stale_source';

export type PublicQualificationView = {
  qualification: Qualification;
  status: PublicQualificationStatus;
  facts: PublicFact[];
  officialVerifiedAt: string | null;
  missingReasons: Record<string, MissingReason>;
};

let coverageContract: DataCoverageContract | undefined;

function contract(): DataCoverageContract {
  coverageContract ??= validateDataCoverageContract(
    JSON.parse(
      readFileSync(
        resolve(process.cwd(), 'config/data-coverage-contract.json'),
        'utf8',
      ),
    ),
  );
  return coverageContract;
}

function matchesRequirement(
  fact: Pick<
    PublicFact,
    | 'providerId'
    | 'examLevelId'
    | 'examComponent'
    | 'deliveryMode'
    | 'paymentMethod'
  >,
  dimensions: Record<string, string | string[] | undefined>,
) {
  return Object.entries(dimensions).every(([key, value]) => {
    const factValue =
      fact[
        key as
          | 'providerId'
          | 'examLevelId'
          | 'examComponent'
          | 'deliveryMode'
          | 'paymentMethod'
      ];
    const allowed = Array.isArray(value) ? value : [value];
    return allowed.includes(factValue as string | undefined);
  });
}

const componentFieldSuffixes: Record<string, string> = {
  exam_time: 'time',
  question_count: 'question_count',
  question_format: 'format',
};

// Stable fields do not change by exam year: an approved fact at any year covers
// the coverage year. Only genuinely per-year fields (exam dates, schedule,
// result/application windows) must be dated to the coverage year. Keep in step
// with scripts/verify-lib.mjs.
const yearAgnosticFactKeys = new Set([
  'eligibility',
  'exam_method',
  'exam_subjects',
  'exam_time',
  'question_count',
  'question_format',
  'passing_standard',
  'scoring_method',
  'application_method',
  'practical_subject',
  'interview_count',
  'fee',
  'statistics_methodology',
]);

function isYearAgnosticFact(factKey: string): boolean {
  return (
    factKey.endsWith('_rule') ||
    factKey.startsWith('exam_subject_') ||
    yearAgnosticFactKeys.has(factKey)
  );
}

function satisfiesRequirementField(factKey: string, field: string) {
  // FE names subject facts exam_subject_{a|b}_time rather than
  // exam_time_subject_a; keep this in step with scripts/verify-lib.mjs.
  const suffix = componentFieldSuffixes[field];
  if (suffix && new RegExp(`^exam_subject_[ab]_${suffix}$`).test(factKey))
    return true;
  return (
    factKey === field ||
    factKey.startsWith(`${field}_`) ||
    (field === 'exam_date' && factKey === 'exam_dates')
  );
}

/**
 * `source_url` and `official_verified_at` are provenance requirements rather
 * than fact keys, so they are satisfied by any scoped fact whose provenance
 * projection resolved them.
 */
function satisfiesApprovedFact(fact: PublicFact, field: string) {
  if (field === 'source_url')
    return Boolean(fact.sourceUrl) && fact.provenanceStatus === 'verified';
  if (field === 'official_verified_at') return Boolean(fact.officialVerifiedAt);
  return satisfiesRequirementField(fact.factKey, field);
}

export function buildPublicQualificationView(
  qualification: Qualification,
  facts: PublicFact[],
  pendingFacts: PendingFactCoverage[] = [],
): PublicQualificationView {
  const officialVerifiedAt = facts.reduce<string | null>((latest, fact) => {
    const verifiedAt = fact.officialVerifiedAt;
    return verifiedAt && (!latest || latest < verifiedAt) ? verifiedAt : latest;
  }, null);
  const year = facts.reduce(
    (latest, fact) => Math.max(latest, fact.examYear),
    new Date().getFullYear(),
  );
  const requirements =
    contract().qualifications.find((item) => item.slug === qualification.slug)
      ?.requirements ?? [];
  const missingReasons: Record<string, MissingReason> = {};
  const blockingMissing = new Set<string>();
  for (const requirement of requirements) {
    if (
      requirement.requiredLevel === 'post_event' ||
      requirement.requiredLevel === 'optional' ||
      requirement.requiredLevel === 'not_applicable'
    )
      continue;
    const inDimensions = (fact: PublicFact) =>
      matchesRequirement(fact, requirement.dimensions);
    // A conditional scope is assessed only once it has a fact dated to the
    // coverage year; year-agnostic facts alone must not drag an unpublished
    // future year into the gate.
    const presentThisYear = facts.some(
      (fact) => fact.examYear === year && inDimensions(fact),
    );
    if (requirement.requiredLevel === 'conditional' && !presentThisYear)
      continue;
    const scoped = facts.filter(
      (fact) =>
        (fact.examYear === year || isYearAgnosticFact(fact.factKey)) &&
        inDimensions(fact),
    );
    for (const field of requirement.fields) {
      const available = scoped.some((fact) =>
        satisfiesApprovedFact(fact, field),
      );
      if (!available) {
        const pending = pendingFacts.some(
          (fact) =>
            fact.examYear === year &&
            matchesRequirement(fact, requirement.dimensions) &&
            satisfiesRequirementField(fact.factKey, field),
        );
        const mappingError = scoped.some((fact) =>
          field === 'exam_time'
            ? fact.factKey.endsWith('_time')
            : field === 'question_count'
              ? fact.factKey.endsWith('_question_count')
              : field === 'question_format'
                ? fact.factKey.endsWith('_format')
                : false,
        );
        const announcedOnly = requirement.conditions?.includes(
          'only_when_officially_published',
        );
        missingReasons[field] = pending
          ? 'pending_review'
          : mappingError
            ? 'mapping_error'
            : announcedOnly
              ? 'not_announced'
              : 'not_collected';
        if (!announcedOnly) blockingMissing.add(field);
      }
    }
  }
  const status =
    facts.length === 0
      ? pendingFacts.length > 0
        ? 'under_review'
        : 'awaiting_official'
      : blockingMissing.size > 0
        ? 'partially_announced'
        : 'verified';
  return {
    qualification,
    status,
    facts,
    officialVerifiedAt,
    missingReasons,
  };
}
