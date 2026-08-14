import { createHash } from 'node:crypto';

export type TakkenSnapshot = {
  id: string;
  sourceId: string;
  contentHash: string;
  targetFields: Record<string, string>;
  synthetic: true;
};
export type Candidate = {
  id: string;
  snapshotId: string;
  sourceId: string;
  factKey: string;
  value: string;
  risk: 'low' | 'high';
  conflict: boolean;
  status: 'pending_review' | 'approved' | 'rejected' | 'deferred';
  reviewedBy?: string;
  reviewReason?: string;
};
export type Revision = {
  id: string;
  candidateId: string;
  value: string;
  sequence: number;
};

const highRiskKeys = new Set([
  'exam_date',
  'application_deadline',
  'fee',
  'eligibility',
  'exam_method',
  'passing_standard',
  'schedule_change',
]);

export function makeSyntheticSnapshot(
  id: string,
  targetFields: Record<string, string>,
  layout = '',
): TakkenSnapshot {
  const raw = JSON.stringify({ targetFields, layout });
  return {
    id,
    sourceId: 'source:takken:retio-exam',
    contentHash: createHash('sha256').update(raw).digest('hex'),
    targetFields,
    synthetic: true,
  };
}

export class TakkenPipeline {
  private snapshots = new Map<string, TakkenSnapshot>();
  private candidates = new Map<string, Candidate>();
  private revisions = new Map<string, Revision[]>();
  private published = new Map<string, Revision>();
  private pageVersion = 0;

  ingest(snapshot: TakkenSnapshot): Candidate[] {
    const previous = [...this.snapshots.values()].at(-1);
    this.snapshots.set(snapshot.id, snapshot);
    if (previous?.contentHash === snapshot.contentHash) return [];
    const changed = Object.keys(snapshot.targetFields).filter(
      (key) => previous?.targetFields[key] !== snapshot.targetFields[key],
    );
    return changed.map((factKey) => {
      const id = `${snapshot.id}:${factKey}`;
      const candidate: Candidate = {
        id,
        snapshotId: snapshot.id,
        sourceId: snapshot.sourceId,
        factKey,
        value: snapshot.targetFields[factKey],
        risk:
          highRiskKeys.has(factKey) ||
          Boolean(
            previous &&
            previous.sourceId !== snapshot.sourceId &&
            previous.targetFields[factKey] !== snapshot.targetFields[factKey],
          )
            ? 'high'
            : 'low',
        conflict: Boolean(
          previous &&
          previous.sourceId !== snapshot.sourceId &&
          previous.targetFields[factKey] !== snapshot.targetFields[factKey],
        ),
        status: 'pending_review',
      };
      this.candidates.set(id, candidate);
      return candidate;
    });
  }

  getCandidate(id: string): Candidate | undefined {
    return this.candidates.get(id);
  }
  approve(candidateId: string, reviewerId: string): Revision {
    this.review(candidateId, reviewerId, 'approve', 'approved by reviewer');
    const candidate = this.candidates.get(candidateId)!;
    const existing = this.revisions.get(candidate.factKey) ?? [];
    const same = existing.find(
      (revision) => revision.candidateId === candidateId,
    );
    if (same) return same;
    const revision = {
      id: `${candidate.id}:revision`,
      candidateId,
      value: candidate.value,
      sequence: existing.length + 1,
    };
    this.revisions.set(candidate.factKey, [...existing, revision]);
    return revision;
  }

  review(
    candidateId: string,
    reviewerId: string,
    decision: 'approve' | 'reject' | 'defer',
    reason: string,
  ): Candidate {
    if (!reviewerId) throw new Error('reviewer authentication required');
    if (!reason.trim()) throw new Error('review reason required');
    const candidate = this.candidates.get(candidateId);
    if (!candidate) throw new Error('candidate not found');
    candidate.status =
      decision === 'approve'
        ? 'approved'
        : decision === 'reject'
          ? 'rejected'
          : 'deferred';
    candidate.reviewedBy = reviewerId;
    candidate.reviewReason = reason;
    return candidate;
  }

  publishApproved(candidateId: string, build: () => boolean): boolean {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) throw new Error('candidate not found');
    if (candidate.status !== 'approved')
      throw new Error('candidate must be approved before publish');
    const existing = this.revisions.get(candidate.factKey) ?? [];
    const revision = existing.find(
      (item) => item.candidateId === candidateId,
    ) ?? {
      id: `${candidate.id}:revision`,
      candidateId,
      value: candidate.value,
      sequence: existing.length + 1,
    };
    if (!existing.includes(revision))
      this.revisions.set(candidate.factKey, [...existing, revision]);
    return this.publish(candidate.factKey, revision, build);
  }

  reject(
    candidateId: string,
    reviewerId = 'reviewer:test',
    reason = 'rejected by reviewer',
  ): void {
    this.review(candidateId, reviewerId, 'reject', reason);
  }
  defer(
    candidateId: string,
    reviewerId = 'reviewer:test',
    reason = 'deferred for review',
  ): void {
    this.review(candidateId, reviewerId, 'defer', reason);
  }
  publish(factKey: string, revision: Revision, build: () => boolean): boolean {
    const previous = this.published.get(factKey);
    if (!build()) return Boolean(previous);
    this.published.set(factKey, revision);
    this.pageVersion += 1;
    return true;
  }
  rollback(factKey: string): Revision | undefined {
    const revisions = this.revisions.get(factKey) ?? [];
    const current = this.published.get(factKey);
    const index = current
      ? revisions.findIndex((revision) => revision.id === current.id)
      : revisions.length;
    const previous = revisions[index - 1];
    if (previous) this.published.set(factKey, previous);
    return previous;
  }
  publicFacts(): Record<string, string> {
    return Object.fromEntries(
      [...this.published].map(([key, revision]) => [key, revision.value]),
    );
  }
  get publishedPageVersion(): number {
    return this.pageVersion;
  }
}
