import { describe, expect, it } from 'vitest';
import { launchQualifications } from '../packages/schema/src/qualifications.js';
import { buildPublicQualificationView } from '../services/api/src/public-view.js';
import { app } from '../services/api/src/server.js';

describe('public qualification read path', () => {
  it('returns awaiting_official when no non-synthetic approved facts exist', () => {
    const qualification = launchQualifications.find(
      (item) => item.slug === 'it-passport',
    );
    if (!qualification) throw new Error('IT Passport seed missing');
    const view = buildPublicQualificationView(qualification, []);
    expect(view.status).toBe('awaiting_official');
    expect(view.facts).toEqual([]);
    expect(view.officialVerifiedAt).toBeNull();
  });

  it('uses the latest official verification timestamp', () => {
    const qualification = launchQualifications[0];
    const facts = [
      {
        qualificationSlug: 'takken' as const,
        examLevelId: null,
        examYear: 2026,
        factKey: 'exam_date',
        valueType: 'date' as const,
        normalizedValue: '2026-10-18',
        displayValue: '2026年10月18日',
        status: 'approved' as const,
        riskLevel: 'high' as const,
        sourceId: 'source:takken:retio-exam',
        sourceSnapshotId: 'snapshot:real',
        synthetic: false,
        verifiedAt: '2026-08-11T00:00:00.000Z',
      },
      {
        qualificationSlug: 'takken' as const,
        examLevelId: null,
        examYear: 2026,
        factKey: 'result_date',
        valueType: 'date' as const,
        normalizedValue: '2026-12-02',
        displayValue: '2026年12月2日',
        status: 'approved' as const,
        riskLevel: 'high' as const,
        sourceId: 'source:takken:retio-exam',
        sourceSnapshotId: 'snapshot:real',
        synthetic: false,
        verifiedAt: '2026-08-12T00:00:00.000Z',
      },
    ];
    const view = buildPublicQualificationView(qualification, facts);
    expect(view.status).toBe('verified');
    expect(view.officialVerifiedAt).toBe('2026-08-12T00:00:00.000Z');
  });

  it('serves the IT Passport route with an explicit empty official state', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/qualifications/it-passport',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      qualification: { slug: 'it-passport' },
      status: 'awaiting_official',
      facts: [],
      officialVerifiedAt: null,
    });
  });

  it('serves the legacy Takken route with the shared qualification view shape', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/qualifications/takken',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      qualification: { slug: 'takken' },
      status: 'awaiting_official',
      facts: [],
      officialVerifiedAt: null,
    });
  });

  it('returns 404 for an unknown qualification route', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/qualifications/not-a-qualification',
    });
    expect(response.statusCode).toBe(404);
  });
});
