import { describe, expect, it } from 'vitest';
import {
  buildPublicCalendarEvents,
  formatExamTemporalValue,
} from '../packages/schema/src/calendar.js';
import type { PublicFact } from '../packages/schema/src/index.js';
import { buildCalendarIcs } from '../packages/schema/src/ics.js';
import { launchQualifications } from '../packages/schema/src/qualifications.js';

const fp = launchQualifications.find((item) => item.slug === 'fp')!;
const bookkeeping = launchQualifications.find(
  (item) => item.slug === 'bookkeeping',
)!;

function fact(
  overrides: Pick<PublicFact, 'factKey'> & Partial<PublicFact>,
): PublicFact {
  return {
    qualificationSlug: 'fp',
    providerId: 'jafp',
    examLevelId: 'fp:2',
    examComponent: 'academic',
    deliveryMode: 'cbt',
    paymentMethod: 'cbt',
    examYear: 2026,
    valueType: 'text',
    normalizedValue: '',
    displayValue: '',
    status: 'approved',
    riskLevel: 'medium',
    sourceId: 'source:fp:test',
    sourceSnapshotId: 'snapshot:fp:test',
    synthetic: false,
    verifiedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('public calendar semantics', () => {
  it('turns CBT windows into periods instead of month-start/month-end exams', () => {
    const events = buildPublicCalendarEvents(
      [fp],
      [
        fact({
          factKey: 'exam_dates',
          normalizedValue: '2026-04-01,2026-04-30,2026-05-01,2026-05-23',
          displayValue: '2026-04-01、2026-04-30、2026-05-01、2026-05-23',
        }),
      ],
    );
    expect(events).toHaveLength(2);
    expect(events.map((event) => event.type)).toEqual([
      'exam_period',
      'exam_period',
    ]);
    expect(events[0]).toMatchObject({
      startValue: '2026-04-01',
      endValue: '2026-04-30',
      label: 'CBT実施期間',
    });
    expect(events.some((event) => event.type === 'exam_date')).toBe(false);
  });

  it('renders window facts as periods on the annual page', () => {
    const value = formatExamTemporalValue(
      fact({
        factKey: 'exam_dates',
        normalizedValue: '2026-04-01,2026-04-30,2026-05-01,2026-05-23',
        displayValue: '2026-04-01、2026-04-30、2026-05-01、2026-05-23',
      }),
    );
    expect(value).toBe('2026年4月1日〜4月30日、2026年5月1日〜5月23日');
  });

  it('keeps single exam dates and application times unchanged', () => {
    expect(
      formatExamTemporalValue(
        fact({
          qualificationSlug: 'bookkeeping',
          deliveryMode: 'unified',
          factKey: 'exam_dates',
          normalizedValue: '2026-11-15,2027-02-14',
          displayValue: '2026-11-15、2027-02-14',
        }),
      ),
    ).toBe('2026年11月15日、2027年2月14日');
    expect(
      formatExamTemporalValue(
        fact({
          factKey: 'application_deadline',
          normalizedValue: '2026-12-01T17:30:00+09:00',
          displayValue: '2026年12月1日 17:30',
        }),
      ),
    ).toBeNull();
  });

  it('keeps application and result dates in their own event types', () => {
    const events = buildPublicCalendarEvents(
      [fp],
      [
        fact({
          factKey: 'application_open',
          normalizedValue: '2026-03-01',
          displayValue: '2026年3月1日',
        }),
        fact({
          factKey: 'application_deadline',
          normalizedValue: '2026-03-31',
          displayValue: '2026年3月31日',
        }),
        fact({
          factKey: 'result_date',
          normalizedValue: '2026-06-19',
          displayValue: '2026年6月19日',
        }),
      ],
    );
    expect(events.map((event) => event.type).sort()).toEqual([
      'application_deadline',
      'application_open',
      'result_date',
    ]);
  });

  it('does not duplicate a date fact that is repeated as schedule text', () => {
    const dates = '2026-04-01,2026-04-30,2026-05-01,2026-05-23';
    const events = buildPublicCalendarEvents(
      [fp],
      [
        fact({
          factKey: 'exam_dates',
          normalizedValue: dates,
          displayValue: dates,
        }),
        fact({
          factKey: 'exam_schedule',
          normalizedValue: dates,
          displayValue: dates,
        }),
      ],
    );
    expect(events).toHaveLength(2);
    expect(events.every((event) => event.factKey === 'exam_dates')).toBe(true);
  });

  it('keeps independent single exam dates for non-CBT qualifications', () => {
    const events = buildPublicCalendarEvents(
      [bookkeeping],
      [
        fact({
          qualificationSlug: 'bookkeeping',
          providerId: 'bookkeeping',
          examLevelId: 'bookkeeping:2',
          examComponent: 'unified',
          deliveryMode: 'unified',
          paymentMethod: 'unified',
          factKey: 'exam_dates',
          normalizedValue: '2026-11-15,2027-02-14,2027-02-28',
          displayValue: '2026-11-15、2027-02-14、2027-02-28',
        }),
      ],
    );
    expect(events).toHaveLength(3);
    expect(events.every((event) => event.type === 'exam_date')).toBe(true);
    expect(events.map((event) => event.startValue)).toEqual([
      '2026-11-15',
      '2027-02-14',
      '2027-02-28',
    ]);
  });

  it('does not pair interview dates even when the list length is even', () => {
    const events = buildPublicCalendarEvents(
      [fp],
      [
        fact({
          examLevelId: 'fp:1',
          examComponent: 'practical',
          deliveryMode: 'interview',
          paymentMethod: 'interview',
          factKey: 'exam_dates',
          normalizedValue: '2026-06-06,2026-06-13,2026-06-20,2026-06-27',
          displayValue: '2026-06-06、2026-06-13、2026-06-20、2026-06-27',
        }),
      ],
    );
    expect(events).toHaveLength(4);
    expect(events.every((event) => event.type === 'exam_date')).toBe(true);
  });

  it('refuses to guess when a CBT list cannot be paired', () => {
    const events = buildPublicCalendarEvents(
      [fp],
      [
        fact({
          factKey: 'exam_dates',
          normalizedValue: '2026-04-01,2026-04-30,2026-05-01',
          displayValue: '2026-04-01、2026-04-30、2026-05-01',
        }),
      ],
    );
    expect(events).toEqual([]);
  });

  it('renders a cross-year period as one VEVENT spanning both years', () => {
    const events = buildPublicCalendarEvents(
      [fp],
      [
        fact({
          factKey: 'exam_period',
          normalizedValue: {
            periods: [{ start: '2026-12-01', end: '2027-01-31' }],
          },
          displayValue: '2026年12月1日～2027年1月31日',
        }),
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'exam_period',
      startValue: '2026-12-01',
      endValue: '2027-01-31',
      examYear: 2026,
    });
    const ics = buildCalendarIcs(events, 'FP');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261201');
    // DTEND is exclusive: the day after the last day of the window.
    expect(ics).toContain('DTEND;VALUE=DATE:20270201');
  });

  it('lets a new explicit exam_period fact win over legacy exam_dates', () => {
    const events = buildPublicCalendarEvents(
      [fp],
      [
        fact({
          factKey: 'exam_dates',
          normalizedValue: '2026-04-01,2026-04-30',
          displayValue: '2026-04-01、2026-04-30',
        }),
        fact({
          factKey: 'exam_period',
          normalizedValue: {
            periods: [{ start: '2026-04-01', end: '2026-04-30' }],
          },
          displayValue: '2026年4月1日～4月30日',
        }),
      ],
    );
    expect(events).toHaveLength(1);
    expect(events[0].factKey).toBe('exam_period');
  });
});
