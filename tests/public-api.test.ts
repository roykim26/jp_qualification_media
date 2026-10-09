import { describe, expect, it } from 'vitest';
import { buildPublicCalendarEvents } from '../packages/schema/src/calendar.js';
import { buildQualificationComparison } from '../packages/schema/src/compare.js';
import { buildCalendarIcs } from '../packages/schema/src/ics.js';
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

  it('reports review status without exposing a pending candidate value', () => {
    const qualification = launchQualifications[0];
    const view = buildPublicQualificationView(
      qualification,
      [],
      [
        {
          qualificationSlug: 'takken',
          providerId: null,
          examLevelId: null,
          examComponent: null,
          deliveryMode: null,
          examYear: new Date().getFullYear(),
          factKey: 'fee',
        },
      ],
    );
    expect(view.status).toBe('under_review');
    expect(view.missingReasons.fee).toBe('pending_review');
    expect(JSON.stringify(view)).not.toContain('displayValue');
  });

  it('distinguishes an unmapped component field from uncollected data', () => {
    const qualification = launchQualifications.find(
      (item) => item.slug === 'fundamental-it-engineer',
    )!;
    const view = buildPublicQualificationView(qualification, [
      {
        qualificationSlug: 'fundamental-it-engineer',
        examLevelId: null,
        examComponent: 'subject-a',
        deliveryMode: 'cbt',
        examYear: new Date().getFullYear(),
        factKey: 'exam_subject_a_time',
        valueType: 'integer',
        normalizedValue: 90,
        displayValue: '90分',
        status: 'approved',
        riskLevel: 'medium',
        sourceId: 'source:fundamental-it:exam',
        sourceSnapshotId: 'snapshot:official',
        synthetic: false,
        verifiedAt: '2026-08-11T00:00:00.000Z',
      },
    ]);
    expect(view.missingReasons.exam_time).toBe('mapping_error');
  });

  it('passes field-specific missing reasons into comparison cells', () => {
    const comparison = buildQualificationComparison(
      launchQualifications,
      [],
      ['it-passport', 'takken'],
      { 'it-passport': { fee: 'pending_review' } },
    );
    expect(
      comparison.rows.find((row) => row.key === 'fee')?.cells['it-passport']
        .missingReason,
    ).toBe('pending_review');
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
        officialVerifiedAt: '2026-08-11T00:00:00.000Z',
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
        officialVerifiedAt: '2026-08-12T00:00:00.000Z',
      },
    ];
    const view = buildPublicQualificationView(qualification, facts);
    expect(view.status).toBe('partially_announced');
    expect(view.missingReasons).toMatchObject({
      eligibility: 'not_collected',
      fee: 'not_collected',
    });
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
        startValue: '2026-07-15',
        sequence: 0,
      },
    ]);
  });

  it('expands a multi-date fact into stable calendar occurrences', () => {
    const events = buildPublicCalendarEvents(launchQualifications, [
      {
        qualificationSlug: 'bookkeeping',
        examLevelId: 'bookkeeping:2',
        deliveryMode: 'unified',
        examYear: 2026,
        factKey: 'exam_dates',
        valueType: 'json',
        normalizedValue: '2026-06-14,2026-11-15,2027-02-28',
        displayValue: '2026-06-14、2026-11-15、2027-02-28',
        status: 'approved',
        riskLevel: 'high',
        sourceId: 'source:bookkeeping:calendar-2026',
        sourceSnapshotId: 'snapshot:official',
        synthetic: false,
        verifiedAt: '2026-08-12T00:00:00.000Z',
        sequence: 0,
      },
    ]);
    expect(events.map((event) => event.dateValue)).toEqual([
      '2026-06-14',
      '2026-11-15',
      '2027-02-28',
    ]);
    expect(events.map((event) => event.id)).toEqual([
      'bookkeeping:2026:exam_dates::bookkeeping:2::unified:occurrence:1',
      'bookkeeping:2026:exam_dates::bookkeeping:2::unified:occurrence:2',
      'bookkeeping:2026:exam_dates::bookkeeping:2::unified:occurrence:3',
    ]);
  });

  it('does not turn an undated schedule description into a calendar event', () => {
    expect(
      buildPublicCalendarEvents(launchQualifications, [
        {
          qualificationSlug: 'it-passport',
          examLevelId: null,
          examYear: 2026,
          factKey: 'exam_schedule',
          valueType: 'text',
          normalizedValue: 'year_round',
          displayValue: '通年実施',
          status: 'approved',
          riskLevel: 'high',
          sourceId: 'source:it-passport:jitec-home',
          sourceSnapshotId: 'snapshot:official',
          synthetic: false,
          verifiedAt: '2026-08-12T00:00:00.000Z',
        },
      ]),
    ).toEqual([]);
  });

  it('generates stable UTC ICS events and increments sequence on changes', () => {
    const qualification = launchQualifications.find(
      (item) => item.slug === 'takken',
    )!;
    const event = {
      id: 'takken:2026:exam_date::::',
      type: 'exam_date' as const,
      label: '試験日',
      qualification,
      examYear: 2026,
      displayValue: '2026年10月18日 13時',
      dateValue: '2026-10-18',
      startValue: '2026-10-18T13:00:00+09:00',
      factKey: 'exam_date',
      verifiedAt: '2026-08-12T00:00:00.000Z',
      sourceUrl: 'https://www.retio.or.jp/exam/',
      sequence: 2,
    };
    const first = buildCalendarIcs([event], '宅建 2026年試験日程');
    const changed = buildCalendarIcs(
      [
        {
          ...event,
          startValue: '2026-10-25T13:00:00+09:00',
          dateValue: '2026-10-25',
          sequence: 3,
        },
      ],
      '宅建 2026年試験日程',
    );
    expect(first).toContain('BEGIN:VCALENDAR\r\n');
    expect(first).toContain(
      'UID:takken:2026:exam_date::::@qualification-media',
    );
    expect(first).toContain('DTSTART:20261018T040000Z');
    expect(first).toContain('DTEND:20261018T050000Z');
    expect(first).toContain('SEQUENCE:2');
    expect(changed).toContain(
      'UID:takken:2026:exam_date::::@qualification-media',
    );
    expect(changed).toContain('DTSTART:20261025T040000Z');
    expect(changed).toContain('DTEND:20261025T050000Z');
    expect(changed).toContain('SEQUENCE:3');
  });

  it('gives all-day events an exclusive next-day end', () => {
    const qualification = launchQualifications.find(
      (item) => item.slug === 'bookkeeping',
    )!;
    const ics = buildCalendarIcs(
      [
        {
          id: 'bookkeeping:2026:exam_date::::',
          type: 'exam_date',
          label: '試験日',
          qualification,
          examYear: 2026,
          displayValue: '2026年6月14日',
          dateValue: '2026-06-14',
          startValue: '2026-06-14',
          factKey: 'exam_date',
          verifiedAt: '2026-08-12T00:00:00.000Z',
          sequence: 0,
        },
      ],
      '日商簿記 2026年試験日程',
    );
    expect(ics).toContain('DTSTART;VALUE=DATE:20260614');
    expect(ics).toContain('DTEND;VALUE=DATE:20260615');
  });

  it('does not create an ICS file for events without an exact date', () => {
    const qualification = launchQualifications.find(
      (item) => item.slug === 'it-passport',
    )!;
    expect(
      buildCalendarIcs(
        [
          {
            id: 'it-passport:2026:exam_schedule::::',
            type: 'exam_date',
            label: '試験日',
            qualification,
            examYear: 2026,
            displayValue: '随時実施',
            dateValue: null,
            startValue: null,
            factKey: 'exam_schedule',
            verifiedAt: '2026-08-12T00:00:00.000Z',
            sequence: 0,
          },
        ],
        'ITパスポート 2026年試験日程',
      ),
    ).toBe('');
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

  it('returns 404 instead of an empty ICS download', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/ics/takken/2026',
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'calendar not available' });
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

  it('serves an empty updates feed when no database is configured', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/updates?qualification=takken',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: [],
      query: { qualification: 'takken' },
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
