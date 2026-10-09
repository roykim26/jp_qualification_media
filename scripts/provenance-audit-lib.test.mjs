import assert from 'node:assert/strict';
import test from 'node:test';
import {
  auditProvenanceRow,
  summarizeProvenanceAudit,
} from './provenance-audit-lib.mjs';

const approvedRow = {
  fact_id: 'fact:1',
  qualification_slug: 'fp',
  source_id: 'source:fp:jafp-schedule',
  source_snapshot_id: 'snapshot:1',
  snapshot_id: 'snapshot:1',
  snapshot_source_id: 'source:fp:jafp-schedule',
  snapshot_synthetic: false,
  content_hash: 'a'.repeat(64),
  object_key: 'var/official-snapshots/fp/jafp-schedule.html',
  canonical_url: 'https://www.jafp.or.jp/exam/schedule/',
  allowed_domain: 'www.jafp.or.jp',
  latest_review_decision: 'approve',
  latest_review_at: '2026-09-11T01:00:00.000Z',
};

test('accepts a real approved provenance chain', () => {
  assert.deepEqual(auditProvenanceRow(approvedRow).issues, []);
  assert.equal(summarizeProvenanceAudit([approvedRow]).status, 'passed');
});

test('rejects CI snapshots and missing final approval without exposing values', () => {
  const report = auditProvenanceRow({
    ...approvedRow,
    object_key: 'ci://official-snapshot/snapshot:1',
    latest_review_decision: null,
    latest_review_at: null,
  });
  assert.deepEqual(report.issues, [
    'snapshot_not_real',
    'final_review_not_approved',
    'review_timestamp_missing',
  ]);
  assert.equal(JSON.stringify(report).includes('normalized_value'), false);
  assert.equal(JSON.stringify(report).includes('evidence_text'), false);
});

test('rejects non-HTTPS and source/snapshot inconsistencies', () => {
  const report = auditProvenanceRow({
    ...approvedRow,
    canonical_url: 'http://www.jafp.or.jp/exam/schedule/',
    snapshot_source_id: 'source:fp:kinzai-schedule',
    snapshot_synthetic: true,
    content_hash: '',
  });
  assert.deepEqual(report.issues, [
    'canonical_url_not_allowed_https',
    'snapshot_source_mismatch',
    'synthetic_snapshot',
    'snapshot_hash_missing',
  ]);
});
