/**
 * Display-layer formatting for public fact values.
 *
 * The site promises that `display_value` keeps the official cell text verbatim.
 * This formatter therefore ONLY rewrites values that are clearly machine-shaped
 * (raw ISO datetimes, bare numbers without units, raw lowercase enums), a
 * truncated date that can be recovered from the normalized value, or a date
 * display polluted with non-date text (e.g. a scraped navigation blob) when the
 * normalized value is a valid ISO date. Human-readable official Japanese text
 * (e.g. "7月31日(金)23時59分", "4,800円", "CBT方式") is returned unchanged so the
 * verbatim/provenance promise is preserved.
 */

const ISO_DATETIME =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;

const methodLabels: Record<string, string> = {
  paper: '紙筆方式',
  cbt: 'CBT方式',
  net: 'ネット方式',
};

const dateKeyPrefixes = [
  'exam_date',
  'exam_dates',
  'exam_schedule',
  'application_open',
  'application_start',
  'application_deadline',
  'result_date',
];

/** Date-family fact keys; also used by the render layer's ended-schedule detection. */
export function isDateFactKey(factKey: string): boolean {
  return (
    dateKeyPrefixes.some((prefix) => factKey.startsWith(prefix)) ||
    factKey.endsWith('_date')
  );
}

// A date display is "readable" when it is a plain date-only list
// (2026-06-14、2026-11-15 or 2026-04-01 / 2026-04-30) or short official text
// carrying date markers (年月日時分 / 令和・平成・昭和). Anything else — e.g. a
// whole navigation blob scraped into display_value — is treated as pollution
// and recovered from the normalized value when that is a valid ISO date.
const DATE_TEXT_MARKER = /[年月日時分]|令和|平成|昭和/;
const DATE_ONLY_LIST = /^\d{4}-\d{2}-\d{2}(?:[、,，/／\s]+\d{4}-\d{2}-\d{2})*$/;
const MAX_READABLE_DATE_LENGTH = 80;

function looksLikeReadableDate(value: string): boolean {
  const trimmed = value.trim();
  if (DATE_ONLY_LIST.test(trimmed)) return true;
  return (
    DATE_TEXT_MARKER.test(trimmed) && trimmed.length <= MAX_READABLE_DATE_LENGTH
  );
}

function formatSingleIso(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const timeZone = 'Asia/Tokyo';
  const day = new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone,
  }).format(date);
  const weekday = new Intl.DateTimeFormat('ja-JP', {
    weekday: 'short',
    timeZone,
  }).format(date);
  const time = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
  return time === '00:00' ? `${day}(${weekday})` : `${day}(${weekday}) ${time}`;
}

function formatIsoList(source: string): string | null {
  const parts = source.split(',').map((part) => part.trim());
  const formatted = parts.map(formatSingleIso);
  if (formatted.some((part) => part === null)) return null;
  return formatted.join('／');
}

function looksRawIso(value: string): boolean {
  return ISO_DATETIME.test(value);
}

function looksTruncated(value: string): boolean {
  return /[^0-9]\d$/.test(value);
}

export type FactDisplayInput = {
  factKey: string;
  displayValue: string;
  normalizedValue?: unknown;
};

/**
 * Update-log values come straight from `display_value`, so a date cell can be a
 * raw ISO datetime even when the fact key is not a date key. Those, and any
 * internal `qualification:<slug>` reference, must never reach the page.
 */
export function formatUpdateDisplayValue(
  factKey: string,
  displayValue: string,
): string {
  const sanitized = displayValue
    .replace(/(?:qualification|fact)[:.][a-z0-9_.:-]+/gi, '公式情報')
    .trim();
  const formatted = formatFactDisplayValue({
    factKey,
    displayValue: sanitized,
  });
  if (formatted !== sanitized) return formatted;
  if (looksRawIso(sanitized)) {
    return sanitized
      .split(',')
      .map((part) => formatSingleIso(part.trim()) ?? part.trim())
      .join('／');
  }
  return sanitized;
}

export function formatFactDisplayValue(input: FactDisplayInput): string {
  const { factKey, displayValue, normalizedValue } = input;
  const value = displayValue;

  // Raw lowercase delivery/method enums -> Japanese label.
  if (/(^|_)(method|format)$/.test(factKey)) {
    const mapped = methodLabels[value.trim()];
    if (mapped) return mapped;
  }

  // Bare numbers -> attach the proper unit / thousands separator.
  if (/^\d+$/.test(value.trim())) {
    const numeric = value.trim();
    if (factKey === 'fee' || factKey.endsWith('_fee'))
      return `${Number(numeric).toLocaleString('ja-JP')}円`;
    if (/(^|_)time$/.test(factKey)) return `${numeric}分`;
    if (/question_count$/.test(factKey)) return `${numeric}問`;
    if (/answer_count$/.test(factKey)) return `${numeric}解答`;
  }

  // Date facts: rewrite raw ISO lists, recover a truncated date from the
  // normalized value, or replace polluted display text (e.g. a navigation
  // blob) when the normalized value is a valid ISO date. Human-readable
  // official dates stay verbatim.
  if (isDateFactKey(factKey)) {
    if (looksRawIso(value)) {
      const formatted = formatIsoList(value);
      if (formatted) return formatted;
    } else if (looksTruncated(value) && typeof normalizedValue === 'string') {
      const formatted = formatIsoList(normalizedValue);
      if (formatted) return formatted;
    } else if (
      !looksLikeReadableDate(value) &&
      typeof normalizedValue === 'string'
    ) {
      const formatted = formatIsoList(normalizedValue);
      if (formatted) return formatted;
    }
  }

  return value;
}
