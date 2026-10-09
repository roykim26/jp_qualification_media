import { describe, expect, it } from 'vitest';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import { projectPublicFactProvenance } from '../services/api/src/public-facts.js';
import { buildPublicQualificationView } from '../services/api/src/public-view.js';
import { renderQualificationPage } from '../apps/web/src/render.js';

const realApproved = {
  source_url: 'https://www.jafp.or.jp/exam/schedule/',
  allowed_domain: 'www.jafp.or.jp',
  object_key: 'var/official-snapshots/fp/jafp-schedule.html',
  snapshot_synthetic: false,
  content_hash: 'a'.repeat(64),
  source_id: 'source:fp:jafp-schedule',
  snapshot_source_id: 'source:fp:jafp-schedule',
  latest_review_decision: 'approve',
  latest_review_at: '2026-09-11T01:00:00.000Z',
};

describe('public provenance projection', () => {
  it('projects an official verification only from a real final approval', () => {
    expect(projectPublicFactProvenance(realApproved)).toEqual({
      sourceUrl: 'https://www.jafp.or.jp/exam/schedule/',
      provenanceStatus: 'verified',
      officialVerifiedAt: '2026-09-11T01:00:00.000Z',
    });
  });

  it('keeps CI fixture timestamps out of the official verification projection', () => {
    expect(
      projectPublicFactProvenance({
        ...realApproved,
        object_key: 'ci://official-snapshot/snapshot:fp',
        latest_review_decision: null,
        latest_review_at: null,
      }),
    ).toEqual({
      sourceUrl: 'https://www.jafp.or.jp/exam/schedule/',
      provenanceStatus: 'fixture',
    });
  });

  it('does not report a fixture revision timestamp as qualification verification', () => {
    const view = buildPublicQualificationView(launchQualifications[0], [
      {
        qualificationSlug: 'takken',
        examLevelId: null,
        examYear: 2026,
        factKey: 'exam_date',
        valueType: 'date',
        normalizedValue: '2026-10-18',
        displayValue: '2026年10月18日',
        status: 'approved',
        riskLevel: 'high',
        sourceId: 'source:takken:retio-exam',
        sourceSnapshotId: 'snapshot:fixture',
        synthetic: false,
        verifiedAt: '2026-01-01T00:00:00.000Z',
        provenanceStatus: 'fixture',
      },
    ]);
    expect(view.officialVerifiedAt).toBeNull();
    expect(renderQualificationPage(view)).toContain(
      '回帰用 fixture（確認時刻なし）',
    );
    expect(renderQualificationPage(view)).not.toContain('2026年1月1日');
  });

  it('counts provenance fields from the verified projection instead of a fact key', () => {
    const view = buildPublicQualificationView(launchQualifications[0], [
      {
        qualificationSlug: 'takken',
        examLevelId: null,
        examYear: 2026,
        factKey: 'exam_date',
        valueType: 'date',
        normalizedValue: '2026-10-18',
        displayValue: '2026年10月18日',
        status: 'approved',
        riskLevel: 'high',
        sourceId: 'source:takken:retio-exam',
        sourceSnapshotId: 'snapshot:takken:retio-exam',
        synthetic: false,
        verifiedAt: '2026-09-01T00:00:00.000Z',
        sourceUrl: 'https://www.retio.or.jp/examination/examination.html',
        provenanceStatus: 'verified',
        officialVerifiedAt: '2026-09-01T00:00:00.000Z',
      },
    ]);
    expect(view.missingReasons).not.toHaveProperty('source_url');
    expect(view.missingReasons).not.toHaveProperty('official_verified_at');
    expect(view.missingReasons).toHaveProperty('result_date', 'not_collected');
  });
});
