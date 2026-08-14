import { describe, expect, it } from 'vitest';
import { buildPublicCalendarEvents } from '../packages/schema/src/calendar.js';
import { buildQualificationComparison } from '../packages/schema/src/compare.js';
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

  it('builds calendar events from approved public schedule facts', () => {
    const events = buildPublicCalendarEvents(launchQualifications, [
      {
        qualificationSlug: 'takken',
        examLevelId: null,
        examYear: 2026,
        factKey: 'application_deadline_online',
        valueType: 'date',
        normalizedValue: '2026-07-15',
        displayValue: '2026年7月15日',
        status: 'approved',
        riskLevel: 'high',
        sourceId: 'source:takken:retio-exam',
        sourceSnapshotId: 'snapshot:real',
        synthetic: false,
        verifiedAt: '2026-08-12T00:00:00.000Z',
        sourceUrl: 'https://www.retio.or.jp/exam/',
      },
    ]);
    expect(events).toMatchObject([
      {
        type: 'application_deadline',
        label: '申込締切',
        dateValue: '2026-07-15',
        qualification: { slug: 'takken' },
      },
    ]);
  });

  it('serves an empty official calendar when no approved facts are configured', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/calendar?year=2026&qualification=takken',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [],
      query: { year: '2026', qualification: 'takken' },
    });
  });

  it('builds a qualification comparison from the newest approved facts', () => {
    const comparison = buildQualificationComparison(
      launchQualifications,
      [
        {
          qualificationSlug: 'it-passport',
          examLevelId: null,
          examYear: 2026,
          factKey: 'exam_method',
          valueType: 'text',
          normalizedValue: 'CBT',
          displayValue: 'CBT方式',
          status: 'approved',
          riskLevel: 'medium',
          sourceId: 'source:it-passport:jitec-home',
          sourceSnapshotId: 'snapshot:official',
          synthetic: false,
          verifiedAt: '2026-08-11T00:00:00.000Z',
          sourceUrl: 'https://www3.jitec.ipa.go.jp/JitesCbt/',
        },
        {
          qualificationSlug: 'it-passport',
          examLevelId: null,
          examYear: 2025,
          factKey: 'exam_method',
          valueType: 'text',
          normalizedValue: 'legacy',
          displayValue: '古い方式',
          status: 'approved',
          riskLevel: 'medium',
          sourceId: 'source:it-passport:jitec-home',
          sourceSnapshotId: 'snapshot:official:old',
          synthetic: false,
          verifiedAt: '2025-08-11T00:00:00.000Z',
        },
      ],
      ['it-passport', 'takken', 'fp', 'bookkeeping'],
    );
    expect(comparison.qualifications.map((item) => item.slug)).toEqual([
      'it-passport',
      'takken',
      'fp',
    ]);
    const methodRow = comparison.rows.find((row) => row.key === 'exam_method');
    expect(methodRow?.cells['it-passport']).toMatchObject({
      value: 'CBT方式',
      examYear: 2026,
    });
    expect(methodRow?.cells.takken).toMatchObject({ value: null });
  });

  it('serves an empty comparison shell when no qualifications are selected', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/compare',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { qualifications: [] },
      query: { qualifications: [] },
    });
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

  it('searches qualifications by official name, alias, and slug text', async () => {
    const aliasResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/search/qualifications?q=IT%E3%83%91%E3%82%B9',
    });
    expect(aliasResponse.statusCode).toBe(200);
    expect(aliasResponse.json().data).toMatchObject([
      { slug: 'it-passport', matchedFields: ['ITパスポート', 'ITパス'] },
    ]);

    const slugResponse = await app.inject({
      method: 'GET',
      url: '/api/v1/qualifications?q=FE',
    });
    expect(slugResponse.statusCode).toBe(200);
    expect(slugResponse.json().data).toMatchObject([
      { slug: 'fundamental-it-engineer' },
    ]);
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
