import type { PublicFact, Qualification } from './index.js';

/**
 * Public calendar semantics are explicit. A date range is never promoted to a
 * one-day exam, and application/booking/result/effective dates never become
 * `exam_date`.
 */
export type CalendarEventType =
  | 'application_open'
  | 'application_deadline'
  | 'booking_open'
  | 'booking_deadline'
  | 'exam_date'
  | 'exam_period'
  | 'result_date'
  | 'effective_from'
  | 'effective_until';

export type PublicCalendarEvent = {
  id: string;
  type: CalendarEventType;
  label: string;
  qualification: Qualification;
  examYear: number;
  displayValue: string;
  dateValue: string | null;
  startValue: string | null;
  endValue?: string | null;
  providerId?: string | null;
  examLevelId?: string | null;
  examComponent?: string | null;
  deliveryMode?: string | null;
  paymentMethod?: string | null;
  factKey: string;
  verifiedAt: string;
  sourceUrl?: string;
  sequence: number;
  /** How many occurrences the source fact produced, so detail pages can say ほかN日程. */
  occurrenceCount?: number;
};

const calendarEventLabels: Record<CalendarEventType, string> = {
  application_open: '申込開始',
  application_deadline: '申込締切',
  booking_open: '予約開始',
  booking_deadline: '予約締切',
  exam_date: '試験日',
  exam_period: '試験実施期間',
  result_date: '合格発表',
  effective_from: '適用開始',
  effective_until: '適用終了',
};

/**
 * Fact-key prefixes carry the business semantics. Longer, more specific
 * prefixes come first because matching is `startsWith` (exam_dates before
 * exam_date).
 */
const calendarFactPrefixes: readonly [CalendarEventType, string][] = [
  ['booking_deadline', 'booking_deadline'],
  ['booking_open', 'booking_open'],
  ['application_deadline', 'application_deadline'],
  ['application_open', 'application_open'],
  ['application_open', 'application_start'],
  ['effective_from', 'effective_from'],
  ['effective_until', 'effective_until'],
  ['exam_period', 'exam_period'],
  ['exam_date', 'exam_dates'],
  ['exam_date', 'exam_schedule'],
  ['exam_date', 'exam_date'],
  ['result_date', 'result_date'],
];

function eventTypeForFactKey(factKey: string): CalendarEventType | null {
  return (
    calendarFactPrefixes.find(([, prefix]) =>
      factKey.startsWith(prefix),
    )?.[0] ?? null
  );
}

type Occurrence = { start: string; end: string | null };

const ISO_DATE_TIME =
  /\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)?/g;

function datePart(value: string): string | null {
  return value.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null;
}

function structuredOccurrences(value: unknown): Occurrence[] | null {
  if (Array.isArray(value)) {
    const occurrences: Occurrence[] = [];
    for (const item of value) {
      const nested = structuredOccurrences(item);
      if (!nested) return null;
      occurrences.push(...nested);
    }
    return occurrences;
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.periods)) {
      return structuredOccurrences(record.periods);
    }
    if (typeof record.start === 'string') {
      const start = datePart(record.start);
      const endText = typeof record.end === 'string' ? record.end : null;
      const end = endText ? datePart(endText) : null;
      if (!start || (record.end !== undefined && !end)) return null;
      return [{ start: record.start, end: endText }];
    }
    if (typeof record.date === 'string') {
      const start = datePart(record.date);
      return start ? [{ start: record.date, end: null }] : null;
    }
    return null;
  }
  return null;
}

/** Ordered, de-duplicated temporal tokens from a free-form normalized value. */
function temporalValuesFromText(value: string): string[] {
  const seen = new Set<string>();
  const values: string[] = [];
  for (const match of value.matchAll(ISO_DATE_TIME)) {
    if (seen.has(match[0])) continue;
    seen.add(match[0]);
    values.push(match[0]);
  }
  return values;
}

function occurrencesFromText(value: string): Occurrence[] {
  return temporalValuesFromText(value).map((start) => ({
    start,
    end: null,
  }));
}

/**
 * Ordered flat date lists that encode start/end pairs are turned into periods.
 * The pairing only succeeds for a strictly increasing, non-overlapping list;
 * anything else is treated as unparseable rather than guessed.
 */
function pairedPeriods(values: readonly string[]): Occurrence[] | null {
  if (values.length < 2 || values.length % 2 !== 0) return null;
  const periods: Occurrence[] = [];
  let previousEnd: string | null = null;
  for (let index = 0; index < values.length; index += 2) {
    const start = values[index];
    const end = values[index + 1];
    const startDate = datePart(start);
    const endDate = datePart(end);
    if (!startDate || !endDate || startDate > endDate) return null;
    if (previousEnd !== null && startDate <= previousEnd) return null;
    periods.push({ start, end });
    previousEnd = endDate;
  }
  return periods;
}

/**
 * FP 2/3級 CBT schedules are published as implementation windows and the
 * collector stores the official rows as ordered start/end pairs under
 * `exam_dates`. This is a documented legacy data contract, not text guessing:
 * the same collector wrote the list. New captures also emit `exam_period`
 * with explicit start/end objects.
 */
function isLegacyCbtPeriodFact(fact: PublicFact): boolean {
  return (
    fact.qualificationSlug === 'fp' &&
    fact.factKey === 'exam_dates' &&
    fact.deliveryMode === 'cbt'
  );
}

function scopeKey(fact: PublicFact): string {
  return [
    fact.qualificationSlug,
    fact.examYear,
    fact.providerId ?? '',
    fact.examLevelId ?? '',
    fact.examComponent ?? '',
    fact.deliveryMode ?? '',
    fact.paymentMethod ?? '',
  ].join('|');
}

type PlannedEvent = {
  type: CalendarEventType;
  occurrences: Occurrence[];
};

function planEvents(fact: PublicFact): PlannedEvent | null {
  const baseType = eventTypeForFactKey(fact.factKey);
  if (!baseType) return null;

  const structured = structuredOccurrences(fact.normalizedValue);
  if (structured && structured.length) {
    const hasRange = structured.some((occurrence) => occurrence.end !== null);
    return {
      type: hasRange && baseType === 'exam_date' ? 'exam_period' : baseType,
      occurrences: structured,
    };
  }

  if (typeof fact.normalizedValue !== 'string') return null;

  if (baseType === 'exam_period') {
    const periods = pairedPeriods(temporalValuesFromText(fact.normalizedValue));
    return periods ? { type: 'exam_period', occurrences: periods } : null;
  }

  if (baseType === 'exam_date' && isLegacyCbtPeriodFact(fact)) {
    const periods = pairedPeriods(temporalValuesFromText(fact.normalizedValue));
    return periods ? { type: 'exam_period', occurrences: periods } : null;
  }

  return {
    type: baseType,
    occurrences: occurrencesFromText(fact.normalizedValue),
  };
}

function formatJapaneseDate(value: string, withYear = true): string {
  const [year, month, day] = value.split('-').map(Number);
  return withYear ? `${year}年${month}月${day}日` : `${month}月${day}日`;
}

/**
 * Human-readable fact value for the annual page. It uses the same period
 * planning as the calendar, so a CBT window reads `2026年4月1日〜4月30日`
 * instead of a flat list of month-start/month-end dates. Application and
 * result facts keep their official text (they can carry times).
 */
export function formatExamTemporalValue(fact: PublicFact): string | null {
  if (!/^exam_(date|dates|period|schedule)/.test(fact.factKey)) return null;
  const planned = planEvents(fact);
  if (!planned || !planned.occurrences.length) return null;
  const parts = planned.occurrences.map((occurrence) => {
    const start = datePart(occurrence.start);
    const end = occurrence.end ? datePart(occurrence.end) : null;
    if (!start) return null;
    const startText = formatJapaneseDate(start);
    if (!end || end === start) return startText;
    return start.slice(0, 4) === end.slice(0, 4)
      ? `${startText}〜${formatJapaneseDate(end, false)}`
      : `${startText}〜${formatJapaneseDate(end)}`;
  });
  return parts.every((part): part is string => part !== null)
    ? parts.join('、')
    : null;
}

function eventLabelFor(
  type: CalendarEventType,
  fact: Pick<PublicFact, 'deliveryMode'>,
): string {
  if (type === 'exam_period')
    return fact.deliveryMode === 'cbt' ? 'CBT実施期間' : '試験実施期間';
  return calendarEventLabels[type];
}

function stableEventId(fact: PublicFact): string {
  const dimensions = [
    fact.qualificationSlug,
    fact.examYear,
    fact.factKey,
    fact.providerId ?? '',
    fact.examLevelId ?? '',
    fact.examComponent ?? '',
    fact.deliveryMode ?? '',
  ];
  if (fact.paymentMethod) dimensions.push(fact.paymentMethod);
  return dimensions.join(':');
}

const factKeyPriority: Record<string, number> = {
  exam_period: 0,
  exam_dates: 1,
  exam_date: 2,
  exam_schedule: 3,
};

function canonicalEventKey(event: PublicCalendarEvent): string {
  return [
    event.qualification.slug,
    event.examYear,
    event.type,
    event.providerId ?? '',
    event.examLevelId ?? '',
    event.examComponent ?? '',
    event.deliveryMode ?? '',
    event.paymentMethod ?? '',
    datePart(event.startValue ?? '') ?? '',
    datePart(event.endValue ?? '') ?? '',
  ].join('|');
}

export function buildPublicCalendarEvents(
  qualifications: readonly Qualification[],
  facts: readonly PublicFact[],
): PublicCalendarEvent[] {
  // A schedule text that mirrors a structured date fact is not a second event
  // source; one fact per real-world event keeps the API and ICS duplicate-free.
  const structuredScopes = new Set(
    facts
      .filter(
        (fact) =>
          fact.factKey === 'exam_date' ||
          fact.factKey === 'exam_dates' ||
          fact.factKey === 'exam_period',
      )
      .map(scopeKey),
  );

  const canonical = new Map<
    string,
    { event: PublicCalendarEvent; priority: number }
  >();

  for (const fact of facts) {
    const qualification = qualifications.find(
      (item) => item.slug === fact.qualificationSlug,
    );
    if (!qualification) continue;
    if (
      fact.factKey.startsWith('exam_schedule') &&
      structuredScopes.has(scopeKey(fact))
    )
      continue;
    const planned = planEvents(fact);
    if (!planned || !planned.occurrences.length) continue;
    // A schedule description without a concrete date is useful on the page,
    // but must not become a calendar/ICS event.
    const occurrences = planned.occurrences.filter(
      (occurrence) => datePart(occurrence.start) !== null,
    );
    if (!occurrences.length) continue;

    occurrences.forEach((occurrence, index) => {
      const id = `${stableEventId(fact)}${
        occurrences.length > 1 ? `:occurrence:${index + 1}` : ''
      }`;
      const event: PublicCalendarEvent = {
        id,
        type: planned.type,
        label: eventLabelFor(planned.type, fact),
        qualification,
        examYear: fact.examYear,
        displayValue: fact.displayValue,
        dateValue: datePart(occurrence.start),
        startValue: occurrence.start,
        endValue: occurrence.end,
        providerId: fact.providerId,
        examLevelId: fact.examLevelId,
        examComponent: fact.examComponent,
        deliveryMode: fact.deliveryMode,
        paymentMethod: fact.paymentMethod,
        factKey: fact.factKey,
        // Same provenance-gated confirmation timestamp as detail pages; the raw
        // revision verified_at carries placeholder dates and must not surface.
        verifiedAt: fact.officialVerifiedAt ?? '',
        sourceUrl: fact.sourceUrl,
        sequence: fact.sequence ?? 0,
        occurrenceCount: occurrences.length,
      };
      const key = canonicalEventKey(event);
      const priority = factKeyPriority[fact.factKey] ?? 9;
      const existing = canonical.get(key);
      if (!existing || priority < existing.priority) {
        canonical.set(key, { event, priority });
      }
    });
  }

  return [...canonical.values()]
    .map(({ event }) => event)
    .sort(
      (left, right) =>
        (left.dateValue ?? '9999-12-31').localeCompare(
          right.dateValue ?? '9999-12-31',
        ) ||
        (datePart(left.endValue ?? '') ?? left.dateValue ?? '').localeCompare(
          datePart(right.endValue ?? '') ?? right.dateValue ?? '',
        ) ||
        left.examYear - right.examYear ||
        left.qualification.officialNameJa.localeCompare(
          right.qualification.officialNameJa,
          'ja-JP',
        ) ||
        left.type.localeCompare(right.type),
    );
}
