import { describe, expect, it } from 'vitest';
import {
  makeSyntheticSnapshot,
  TakkenPipeline,
} from '../services/api/src/takken.js';

describe('stage 1 takken closure', () => {
  it('does not create a candidate when page hash changes but target facts do not', () => {
    const pipeline = new TakkenPipeline();
    expect(
      pipeline.ingest(
        makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }, 'layout-a'),
      ),
    ).toHaveLength(1);
    expect(
      pipeline.ingest(
        makeSyntheticSnapshot('v2', { exam_date: '2099-10-01' }, 'layout-b'),
      ),
    ).toHaveLength(0);
  });
  it('routes an exam-date change to high-risk review', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [candidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    expect(candidate.risk).toBe('high');
    expect(candidate.status).toBe('pending_review');
  });
  it('prevents unauthenticated approval and supports idempotent approval', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [candidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    expect(() => pipeline.approve(candidate.id, '')).toThrow(
      'reviewer authentication required',
    );
    const first = pipeline.approve(candidate.id, 'reviewer:test');
    expect(pipeline.approve(candidate.id, 'reviewer:test')).toEqual(first);
  });
  it('requires a reason and reviewer decision before publishing', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [candidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    expect(() => pipeline.publishApproved(candidate.id, () => true)).toThrow(
      'candidate must be approved before publish',
    );
    expect(() =>
      pipeline.review(candidate.id, 'reviewer:test', 'approve', ''),
    ).toThrow('review reason required');
    pipeline.review(
      candidate.id,
      'reviewer:test',
      'approve',
      '官方日程变更已核对',
    );
    expect(pipeline.publishApproved(candidate.id, () => true)).toBe(true);
    expect(pipeline.publicFacts()).toEqual({ exam_date: '2099-10-15' });
  });
  it('supports reject and defer without creating public revisions', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [candidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    pipeline.defer(candidate.id, 'reviewer:test', '等待第二官方来源');
    expect(pipeline.publicFacts()).toEqual({});
    pipeline.reject(candidate.id, 'reviewer:test', '来源冲突未解决');
    expect(pipeline.publicFacts()).toEqual({});
  });
  it('publishes all approved facts through one read path', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [candidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    const revision = pipeline.approve(candidate.id, 'reviewer:test');
    expect(pipeline.publish('exam_date', revision, () => true)).toBe(true);
    expect(pipeline.publicFacts()).toEqual({ exam_date: '2099-10-15' });
  });
  it('detects source conflict as a review concern via separate candidates', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [candidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    const second = {
      ...makeSyntheticSnapshot('v3', { exam_date: '2099-10-20' }),
      sourceId: 'source:takken:other-official',
    };
    const [conflicting] = pipeline.ingest(second);
    expect(candidate.value).not.toBe(conflicting.value);
    expect(conflicting.conflict).toBe(true);
    expect(conflicting.risk).toBe('high');
    expect(conflicting.status).toBe('pending_review');
  });
  it('keeps the previous published page after build failure', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [candidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    const revision = pipeline.approve(candidate.id, 'reviewer:test');
    expect(pipeline.publish('exam_date', revision, () => true)).toBe(true);
    const [nextCandidate] = pipeline.ingest(
      makeSyntheticSnapshot('v3', { exam_date: '2099-10-20' }),
    );
    const nextRevision = pipeline.approve(nextCandidate.id, 'reviewer:test');
    expect(pipeline.publish('exam_date', nextRevision, () => false)).toBe(true);
    expect(pipeline.publicFacts()).toEqual({ exam_date: '2099-10-15' });
  });
  it('rolls back to the previous approved revision', () => {
    const pipeline = new TakkenPipeline();
    pipeline.ingest(makeSyntheticSnapshot('v1', { exam_date: '2099-10-01' }));
    const [firstCandidate] = pipeline.ingest(
      makeSyntheticSnapshot('v2', { exam_date: '2099-10-15' }),
    );
    const first = pipeline.approve(firstCandidate.id, 'reviewer:test');
    pipeline.publish('exam_date', first, () => true);
    const [secondCandidate] = pipeline.ingest(
      makeSyntheticSnapshot('v3', { exam_date: '2099-10-20' }),
    );
    const second = pipeline.approve(secondCandidate.id, 'reviewer:test');
    pipeline.publish('exam_date', second, () => true);
    expect(pipeline.rollback('exam_date')?.value).toBe('2099-10-15');
    expect(pipeline.publicFacts()).toEqual({ exam_date: '2099-10-15' });
  });
});
