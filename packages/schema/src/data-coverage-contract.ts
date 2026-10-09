import { z } from 'zod';

const coverageQualificationSlugs = [
  'takken',
  'gyoseishoshi',
  'it-passport',
  'fundamental-it-engineer',
  'bookkeeping',
  'fp',
] as const;
const coverageValueTypes = [
  'date',
  'datetime',
  'money',
  'integer',
  'decimal',
  'text',
  'boolean',
  'json',
] as const;

export const coverageRequiredLevels = [
  'required',
  'conditional',
  'not_applicable',
  'post_event',
  'optional',
] as const;

const dimensionValueSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);
const dimensionsSchema = z
  .object({
    qualification: dimensionValueSchema.optional(),
    examYear: dimensionValueSchema.optional(),
    providerId: dimensionValueSchema.optional(),
    examLevelId: dimensionValueSchema.optional(),
    examComponent: dimensionValueSchema.optional(),
    deliveryMode: dimensionValueSchema.optional(),
    paymentMethod: dimensionValueSchema.optional(),
  })
  .strict();

export const coverageFieldSchema = z.object({
  valueType: z.enum(coverageValueTypes),
  riskLevel: z.enum(['low', 'medium', 'high', 'critical']),
  allowedSourceTypes: z.array(z.string().min(1)).min(1),
  pages: z.array(z.string().min(1)).min(1),
});

export const coverageRequirementSchema = z.object({
  fields: z.array(z.string().min(1)).min(1),
  requiredLevel: z.enum(coverageRequiredLevels),
  dimensions: dimensionsSchema,
  conditions: z.array(z.string().min(1)).min(1).optional(),
});

export const dataCoverageContractSchema = z.object({
  version: z.literal(1),
  examYearPolicy: z.literal('current_year_or_explicitly_scoped'),
  dimensions: z.array(z.string().min(1)).superRefine((dimensions, context) => {
    for (const required of [
      'qualification',
      'examYear',
      'providerId',
      'examLevelId',
      'examComponent',
      'deliveryMode',
      'paymentMethod',
    ]) {
      if (!dimensions.includes(required)) {
        context.addIssue({
          code: 'custom',
          message: `coverage contract is missing dimension: ${required}`,
        });
      }
    }
  }),
  fieldCatalog: z.record(z.string().min(1), coverageFieldSchema),
  qualifications: z
    .array(
      z.object({
        slug: z.enum(coverageQualificationSlugs),
        requirements: z.array(coverageRequirementSchema).min(1),
      }),
    )
    .length(coverageQualificationSlugs.length),
});

export type DataCoverageContract = z.infer<typeof dataCoverageContractSchema>;

export function validateDataCoverageContract(
  value: unknown,
): DataCoverageContract {
  const contract = dataCoverageContractSchema.parse(value);
  const slugs = contract.qualifications.map(({ slug }) => slug);
  if (new Set(slugs).size !== coverageQualificationSlugs.length) {
    throw new Error(
      'data coverage contract must define each launch qualification once',
    );
  }
  for (const qualification of contract.qualifications) {
    for (const requirement of qualification.requirements) {
      for (const field of requirement.fields) {
        if (!contract.fieldCatalog[field]) {
          throw new Error(
            `${qualification.slug} references unknown coverage field: ${field}`,
          );
        }
      }
    }
  }
  validateSpecialDimensions(contract);
  return contract;
}

function validateSpecialDimensions(contract: DataCoverageContract): void {
  const bySlug = new Map(
    contract.qualifications.map((item) => [item.slug, item]),
  );
  for (const slug of ['bookkeeping', 'fp'] as const) {
    const requirements = bySlug.get(slug)?.requirements ?? [];
    if (
      !requirements.some((item) => Object.keys(item.dimensions).length >= 2)
    ) {
      throw new Error(
        `${slug} must retain multi-dimensional coverage requirements`,
      );
    }
  }
  for (const slug of ['it-passport', 'fundamental-it-engineer'] as const) {
    const requirements = bySlug.get(slug)?.requirements ?? [];
    if (!requirements.some((item) => item.dimensions.deliveryMode === 'cbt')) {
      throw new Error(`${slug} must define CBT conditional coverage`);
    }
  }
}
