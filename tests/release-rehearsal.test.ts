import { describe, expect, it } from 'vitest';
import {
  makeSyntheticSnapshot,
  TakkenPipeline,
} from '../services/api/src/takken.js';

describe('local Takken release rehearsal', () => {
  it('keeps the previous published version on build failure and rolls back', () => {
    const pipeline = new TakkenPipeline();
    const first = pipeline.ingest(
      makeSyntheticSnapshot('release-v1', { exam_date: '2099-10-01' }),
    )[0];
    const firstRevision = pipeline.approve(first.id, 'rehearsal-reviewer');
    expect(pipeline.publish('exam_date', firstRevision, () => true)).toBe(true);
    expect(pipeline.publicFacts().exam_date).toBe('2099-10-01');

    const second = pipeline.ingest(
      makeSyntheticSnapshot('release-v2', { exam_date: '2099-10-15' }),
    )[0];
    const secondRevision = pipeline.approve(second.id, 'rehearsal-reviewer');
    expect(pipeline.publish('exam_date', secondRevision, () => false)).toBe(
      true,
    );
    expect(pipeline.publicFacts().exam_date).toBe('2099-10-01');

    expect(pipeline.publish('exam_date', secondRevision, () => true)).toBe(
      true,
    );
    expect(pipeline.publicFacts().exam_date).toBe('2099-10-15');
    expect(pipeline.rollback('exam_date')?.value).toBe('2099-10-01');
    expect(pipeline.publicFacts().exam_date).toBe('2099-10-01');
  });
});
