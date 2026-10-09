import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  coverageRequiredLevels,
  validateDataCoverageContract,
} from '../packages/schema/src/data-coverage-contract.js';

async function loadContract() {
  return validateDataCoverageContract(
    JSON.parse(
      await readFile(
        resolve(process.cwd(), 'config/data-coverage-contract.json'),
        'utf8',
      ),
    ),
  );
}

describe('data coverage contract', () => {
  it('freezes field-level coverage for all six launch qualifications', async () => {
    const contract = await loadContract();
    expect(contract.qualifications.map((item) => item.slug)).toEqual([
      'takken',
      'gyoseishoshi',
      'it-passport',
      'fundamental-it-engineer',
      'bookkeeping',
      'fp',
    ]);
    expect(Object.keys(contract.fieldCatalog)).toEqual(
      expect.arrayContaining([
        'application_open',
        'exam_date',
        'eligibility',
        'fee',
        'exam_method',
        'passing_standard',
        'pass_rate',
        'source_url',
        'official_verified_at',
      ]),
    );
    expect(coverageRequiredLevels).toEqual([
      'required',
      'conditional',
      'not_applicable',
      'post_event',
      'optional',
    ]);
    expect(contract.dimensions).toContain('paymentMethod');
  });

  it('requires distinct Takken payment deadlines for each published payment method', async () => {
    const contract = await loadContract();
    const requirements = contract.qualifications.find(
      (item) => item.slug === 'takken',
    )?.requirements;
    expect(requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fields: ['payment_deadline'],
          dimensions: { paymentMethod: 'convenience_store' },
        }),
        expect.objectContaining({
          fields: ['payment_deadline'],
          dimensions: { paymentMethod: 'pay_easy' },
        }),
      ]),
    );
  });

  it('keeps bookkeeping and FP combinations separate instead of qualification-wide', async () => {
    const contract = await loadContract();
    const bookkeeping = contract.qualifications.find(
      (item) => item.slug === 'bookkeeping',
    );
    const fp = contract.qualifications.find((item) => item.slug === 'fp');

    expect(bookkeeping?.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimensions: expect.objectContaining({ deliveryMode: 'unified' }),
        }),
        expect.objectContaining({
          dimensions: expect.objectContaining({ deliveryMode: 'network' }),
        }),
        expect.objectContaining({
          dimensions: expect.objectContaining({ deliveryMode: 'group' }),
        }),
      ]),
    );
    expect(fp?.requirements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          dimensions: expect.objectContaining({ providerId: 'jafp' }),
        }),
        expect.objectContaining({
          dimensions: expect.objectContaining({ providerId: 'kinzai' }),
        }),
        expect.objectContaining({
          dimensions: expect.objectContaining({ deliveryMode: 'interview' }),
        }),
      ]),
    );
  });

  it('requires CBT-scoped rules for both CBT qualifications', async () => {
    const contract = await loadContract();
    for (const slug of ['it-passport', 'fundamental-it-engineer']) {
      const requirements = contract.qualifications.find(
        (item) => item.slug === slug,
      )?.requirements;
      expect(requirements).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            requiredLevel: 'conditional',
            dimensions: expect.objectContaining({ deliveryMode: 'cbt' }),
          }),
        ]),
      );
    }
  });

  it('rejects unknown fields and missing dimensional launch coverage', async () => {
    const contract = await loadContract();
    const broken = structuredClone(contract);
    broken.qualifications[0].requirements[0].fields.push('invented_field');
    expect(() => validateDataCoverageContract(broken)).toThrow(
      'references unknown coverage field',
    );
  });
});
