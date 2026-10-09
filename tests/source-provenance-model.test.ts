import { describe, expect, it } from 'vitest';
import {
  captureRuns,
  snapshots,
  sourceChecks,
  sourceScopes,
  factRetractions,
  sources,
} from '../packages/db/src/schema.js';

describe('source provenance operational model', () => {
  it('keeps source scope, capture run and source check separate from facts', () => {
    expect(sourceScopes.sourceId.name).toBe('source_id');
    expect(captureRuns.requestCount.name).toBe('request_count');
    expect(snapshots.originalUrl.name).toBe('original_url');
    expect(factRetractions.rejectedCandidateId.name).toBe(
      'rejected_candidate_id',
    );
    expect(snapshots.retrievedAtJst.name).toBe('retrieved_at_jst');
    expect(sourceChecks.checkedAt.name).toBe('checked_at');
    expect(sources.qualificationId.name).toBe('qualification_id');
  });

  it('does not model operational checks as fact values or review decisions', () => {
    expect(Object.keys(sourceChecks)).not.toContain('factKey');
    expect(Object.keys(sourceChecks)).not.toContain('candidateFactId');
    expect(Object.keys(captureRuns)).not.toContain('reviewerId');
  });
});
