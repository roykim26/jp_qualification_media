import type {
  PublicFact,
  Qualification,
} from '../../../packages/schema/src/index.js';

export type PublicQualificationStatus = 'verified' | 'awaiting_official';

export type PublicQualificationView = {
  qualification: Qualification;
  status: PublicQualificationStatus;
  facts: PublicFact[];
  officialVerifiedAt: string | null;
};

export function buildPublicQualificationView(
  qualification: Qualification,
  facts: PublicFact[],
): PublicQualificationView {
  const officialVerifiedAt = facts.reduce<string | null>(
    (latest, fact) =>
      latest && latest > fact.verifiedAt ? latest : fact.verifiedAt,
    null,
  );
  return {
    qualification,
    status: facts.length > 0 ? 'verified' : 'awaiting_official',
    facts,
    officialVerifiedAt,
  };
}
