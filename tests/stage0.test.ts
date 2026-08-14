import { describe, expect, it } from 'vitest';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import {
  approvalIdempotencyKey,
  canAutoApprove,
  isHighRisk,
  isPubliclyReadable,
} from '../packages/schema/src/index.js';
import {
  canWrite,
  changedTargetFields,
  requiresReview,
} from '../packages/content-rules/src/index.js';

describe('stage 0 contracts', () => {
  it('contains exactly the six launch qualifications and stable aliases only', () => {
    expect(launchQualifications).toHaveLength(6);
    expect(launchQualifications.map((x) => x.slug)).toEqual([
      'takken',
      'gyoseishoshi',
      'it-passport',
      'fundamental-it-engineer',
      'bookkeeping',
      'fp',
    ]);
    expect(launchQualifications.every((x) => !('examYear' in x))).toBe(true);
  });
  it('blocks high-risk facts from automatic approval', () => {
    expect(isHighRisk({ factKey: 'exam_date', riskLevel: 'low' })).toBe(true);
    expect(
      canAutoApprove({
        factKey: 'exam_date',
        riskLevel: 'low',
        sourceSnapshotId: 'snapshot:1',
      }),
    ).toBe(false);
    expect(
      canAutoApprove({
        factKey: 'description',
        riskLevel: 'low',
        sourceSnapshotId: 'snapshot:1',
      }),
    ).toBe(true);
  });
  it('requires source snapshot and approved status for public reads', () => {
    expect(
      isPubliclyReadable({ status: 'pending_review', sourceSnapshotId: 's' }),
    ).toBe(false);
    expect(
      isPubliclyReadable({ status: 'approved', sourceSnapshotId: '' }),
    ).toBe(false);
    expect(
      isPubliclyReadable({ status: 'approved', sourceSnapshotId: 's' }),
    ).toBe(true);
  });
  it('provides stable approval idempotency keys', () => {
    const fact = {
      qualificationSlug: 'takken' as const,
      examLevelId: null,
      examYear: 2099,
      factKey: 'test_only',
      sourceSnapshotId: 'synthetic:snapshot',
      normalizedValue: 'synthetic',
    };
    expect(approvalIdempotencyKey(fact)).toBe(
      approvalIdempotencyKey({ ...fact }),
    );
  });
  it('separates presentation changes from target fact changes', () => {
    expect(changedTargetFields(['footer', 'css', 'exam_date'])).toEqual([
      'exam_date',
    ]);
    expect(requiresReview('fee', 'low', true)).toBe(true);
    expect(requiresReview('description', 'low', false)).toBe(true);
  });
  it('enforces module write boundaries', () => {
    expect(canWrite('collector', 'snapshot')).toBe(true);
    expect(canWrite('collector', 'fact')).toBe(false);
    expect(canWrite('public', 'fact')).toBe(false);
    expect(canWrite('reviewer', 'fact')).toBe(true);
    expect(canWrite('ai', 'candidate_fact')).toBe(false);
  });
});
