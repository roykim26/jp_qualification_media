import type { PublicFact, Qualification } from './index.js';

export type CalendarEventType =
  'application_open' | 'application_deadline' | 'exam_date' | 'result_date';

export type PublicCalendarEvent = {
  id: string;
  type: CalendarEventType;
  label: string;
  qualification: Qualification;
  examYear: number;
  displayValue: string;
  dateValue: string | null;
  providerId?: string | null;
  examLevelId?: string | null;
  examComponent?: string | null;
  deliveryMode?: string | null;
  factKey: string;
  verifiedAt: string;
  sourceUrl?: string;
};

const calendarEventLabels: Record<CalendarEventType, string> = {
  application_open: '申込開始',
  application_deadline: '申込締切',
  exam_date: '試験日',
  result_date: '合格発表',
};

const calendarFactPrefixes: readonly [CalendarEventType, string][] = [
  ['application_open', 'application_open'],
  ['application_open', 'application_start'],
  ['application_deadline', 'application_deadline'],
  ['exam_date', 'exam_date'],
  ['exam_date', 'exam_schedule'],
  ['result_date', 'result_date'],
];

function eventTypeForFactKey(factKey: string): CalendarEventType | null {
  return (
    calendarFactPrefixes.find(([, prefix]) =>
      factKey.startsWith(prefix),
    )?.[0] ?? null
  );
}

function dateValueFromFact(fact: PublicFact): string | null {
  if (typeof fact.normalizedValue === 'string') {
    const match = fact.normalizedValue.match(/\d{4}-\d{2}-\d{2}/);
    return match?.[0] ?? null;
  }
  if (
    fact.normalizedValue &&
    typeof fact.normalizedValue === 'object' &&
    'date' in fact.normalizedValue
  ) {
    const value = (fact.normalizedValue as { date?: unknown }).date;
    return typeof value === 'string' ? value : null;
  }
  return null;
}

function stableEventId(fact: PublicFact): string {
  return [
    fact.qualificationSlug,
    fact.examYear,
    fact.factKey,
    fact.providerId ?? '',
    fact.examLevelId ?? '',
    fact.examComponent ?? '',
    fact.deliveryMode ?? '',
  ].join(':');
}

export function buildPublicCalendarEvents(
  qualifications: readonly Qualification[],
  facts: readonly PublicFact[],
): PublicCalendarEvent[] {
  const events: PublicCalendarEvent[] = [];
  for (const fact of facts) {
    const type = eventTypeForFactKey(fact.factKey);
    const qualification = qualifications.find(
      (item) => item.slug === fact.qualificationSlug,
    );
    if (!type || !qualification) continue;
    events.push({
      id: stableEventId(fact),
      type,
      label: calendarEventLabels[type],
      qualification,
      examYear: fact.examYear,
      displayValue: fact.displayValue,
      dateValue: dateValueFromFact(fact),
      providerId: fact.providerId,
      examLevelId: fact.examLevelId,
      examComponent: fact.examComponent,
      deliveryMode: fact.deliveryMode,
      factKey: fact.factKey,
      verifiedAt: fact.verifiedAt,
      sourceUrl: fact.sourceUrl,
    });
  }
  return events.sort(
    (left, right) =>
      (left.dateValue ?? '9999-12-31').localeCompare(
        right.dateValue ?? '9999-12-31',
      ) ||
      left.examYear - right.examYear ||
      left.qualification.officialNameJa.localeCompare(
        right.qualification.officialNameJa,
        'ja-JP',
      ) ||
      left.type.localeCompare(right.type),
  );
}
