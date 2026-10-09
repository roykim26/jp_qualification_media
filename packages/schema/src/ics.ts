import type { PublicCalendarEvent } from './calendar.js';

const CRLF = '\r\n';

function escapeIcsText(value: string): string {
  return value
    .replaceAll('\\', '\\\\')
    .replaceAll('\n', '\\n')
    .replaceAll(';', '\\;')
    .replaceAll(',', '\\,');
}

function foldIcsLine(line: string): string {
  const chunks: string[] = [];
  let current = '';
  let bytes = 0;
  for (const character of line) {
    const size = Buffer.byteLength(character, 'utf8');
    if (bytes + size > 75 && current) {
      chunks.push(current);
      current = ` ${character}`;
      bytes = 1 + size;
    } else {
      current += character;
      bytes += size;
    }
  }
  chunks.push(current);
  return chunks.join(CRLF);
}

function compactUtcTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '19700101T000000Z';
  return compactUtcDate(date);
}

function compactUtcDate(date: Date): string {
  return date
    .toISOString()
    .replaceAll('-', '')
    .replaceAll(':', '')
    .replace(/\.\d{3}Z$/, 'Z');
}

function nextDateValue(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return next.toISOString().slice(0, 10).replaceAll('-', '');
}

function parseEventStart(value: string): Date | null {
  const local = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/,
  );
  const date = local
    ? new Date(
        Date.UTC(
          Number(local[1]),
          Number(local[2]) - 1,
          Number(local[3]),
          Number(local[4]) - 9,
          Number(local[5]),
          Number(local[6] ?? 0),
        ),
      )
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function eventTimingLines(event: PublicCalendarEvent): string[] {
  const value = event.startValue ?? event.dateValue;
  if (!value) return [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return [
      `DTSTART;VALUE=DATE:${value.replaceAll('-', '')}`,
      `DTEND;VALUE=DATE:${nextDateValue(value)}`,
    ];
  }
  const start = parseEventStart(value);
  if (!start) return [];
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  return [`DTSTART:${compactUtcDate(start)}`, `DTEND:${compactUtcDate(end)}`];
}

function dimensionSummary(event: PublicCalendarEvent): string {
  return [
    event.providerId,
    event.examLevelId,
    event.examComponent,
    event.deliveryMode,
    event.paymentMethod,
  ]
    .filter(Boolean)
    .join(' / ');
}

function serializeEvent(event: PublicCalendarEvent): string[] {
  const timingLines = eventTimingLines(event);
  if (!timingLines.length) return [];
  const dimensions = dimensionSummary(event);
  const summary = `${event.qualification.officialNameJa} ${event.label}${dimensions ? ` (${dimensions})` : ''}`;
  const description = [event.displayValue, event.sourceUrl]
    .filter(Boolean)
    .join('\n');
  return [
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(`${event.id}@qualification-media`)}`,
    `DTSTAMP:${compactUtcTimestamp(event.verifiedAt)}`,
    `LAST-MODIFIED:${compactUtcTimestamp(event.verifiedAt)}`,
    `SEQUENCE:${event.sequence}`,
    ...timingLines,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    ...(event.sourceUrl ? [`URL:${event.sourceUrl}`] : []),
    'STATUS:CONFIRMED',
    'END:VEVENT',
  ];
}

export function buildCalendarIcs(
  events: readonly PublicCalendarEvent[],
  calendarName: string,
): string {
  const eventLines = events.flatMap(serializeEvent);
  if (!eventLines.length) return '';
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Qualification Media//Exam Calendar//JA',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-TIMEZONE:Asia/Tokyo',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    ...eventLines,
    'END:VCALENDAR',
  ]
    .map(foldIcsLine)
    .join(CRLF)
    .concat(CRLF);
}
