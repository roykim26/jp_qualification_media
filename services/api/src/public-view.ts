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

function satisfiesRequirementField(factKey: string, field: string) {
  return (
    factKey === field ||
    factKey.startsWith(`${field}_`) ||
    (field === 'exam_date' && factKey === 'exam_dates')
  );
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
    const scoped = facts.filter(
      (fact) =>
        fact.examYear === year &&
        matchesRequirement(fact, requirement.dimensions),
    );
    if (requirement.requiredLevel === 'conditional' && scoped.length === 0)
      continue;
    for (const field of requirement.fields) {
      const available = scoped.some((fact) =>
        satisfiesRequirementField(fact.factKey, field),
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
