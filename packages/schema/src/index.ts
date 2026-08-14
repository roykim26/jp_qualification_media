import { z } from 'zod';

export const qualificationSlugs = [
  'takken',
  'gyoseishoshi',
  'it-passport',
  'fundamental-it-engineer',
  'bookkeeping',
  'fp',
] as const;
export type QualificationSlug = (typeof qualificationSlugs)[number];

export const factStatus = [
  'draft',
  'pending_review',
  'approved',
  'rejected',
  'superseded',
  'withdrawn',
] as const;
export const riskLevel = ['low', 'medium', 'high', 'critical'] as const;
export const valueType = [
  'date',
  'datetime',
  'money',
  'integer',
  'decimal',
  'text',
  'boolean',
  'json',
] as const;
export const eventType = [
  'application_open',
  'application_deadline',
  'exam_date',
  'result_date',
  'fee_change',
  'eligibility_change',
  'schedule_change',
  'system_change',
] as const;

export const qualificationSchema = z.object({
  slug: z.enum(qualificationSlugs),
  officialNameJa: z.string().min(1),
  aliasesJa: z.array(z.string()),
  field: z.enum(['law', 'accounting', 'finance', 'it', 'business']),
  category: z.enum(['national', 'public', 'private']),
});
export type Qualification = z.infer<typeof qualificationSchema>;

export const candidateFactSchema = z.object({
  qualificationSlug: z.enum(qualificationSlugs),
  examLevelId: z.string().nullable(),
  providerId: z.string().nullable().optional(),
  examComponent: z.string().nullable().optional(),
  deliveryMode: z.string().nullable().optional(),
  examYear: z.number().int().positive(),
  factKey: z.string().min(1),
  valueType: z.enum(valueType),
  normalizedValue: z.unknown(),
  displayValue: z.string(),
  status: z.enum(factStatus),
  riskLevel: z.enum(riskLevel),
  sourceId: z.string().min(1),
  sourceSnapshotId: z.string().min(1),
  synthetic: z.boolean().default(false),
});
export type CandidateFact = z.infer<typeof candidateFactSchema>;

export const publicFactSchema = candidateFactSchema.extend({
  status: z.literal('approved'),
  verifiedAt: z.string().datetime(),
  sourceUrl: z.string().url().optional(),
});
export type PublicFact = z.infer<typeof publicFactSchema>;

export const highRiskFactKeys = new Set([
  'exam_date',
  'application_deadline',
  'fee',
  'payment_requirement',
  'eligibility',
  'exam_subjects',
  'exam_method',
  'passing_standard',
  'postponement',
  'suspension',
  'disaster',
  'venue_change',
  'system_change',
]);

export function isHighRisk(
  fact: Pick<CandidateFact, 'factKey' | 'riskLevel'>,
): boolean {
  return (
    fact.riskLevel === 'high' ||
    fact.riskLevel === 'critical' ||
    highRiskFactKeys.has(fact.factKey)
  );
}

export function canAutoApprove(
  fact: Pick<CandidateFact, 'factKey' | 'riskLevel' | 'sourceSnapshotId'>,
): boolean {
  return Boolean(fact.sourceSnapshotId) && !isHighRisk(fact);
}

export function approvalIdempotencyKey(
  fact: Pick<
    CandidateFact,
    | 'qualificationSlug'
    | 'examLevelId'
    | 'examYear'
    | 'factKey'
    | 'sourceSnapshotId'
    | 'normalizedValue'
  >,
): string {
  return JSON.stringify([
    fact.qualificationSlug,
    fact.examLevelId,
    fact.examYear,
    fact.factKey,
    fact.sourceSnapshotId,
    fact.normalizedValue,
  ]);
}

export function isPubliclyReadable(
  fact: Pick<CandidateFact, 'status' | 'sourceSnapshotId'>,
): boolean {
  return fact.status === 'approved' && Boolean(fact.sourceSnapshotId);
}
