/**
 * Display-layer formatting for public fact values.
 *
 * The site promises that `display_value` keeps the official cell text verbatim.
 * This formatter therefore ONLY rewrites values that are clearly machine-shaped
 * (raw ISO datetimes, bare numbers without units, raw lowercase enums) or a
 * truncated date that can be recovered from the normalized value. Human-readable
 * official Japanese text (e.g. "7月31日(金)23時59分", "4,800円", "CBT方式") is
 * returned unchanged so the verbatim/provenance promise is preserved.
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

function isDateKey(factKey: string): boolean {
  return (
    dateKeyPrefixes.some((prefix) => factKey.startsWith(prefix)) ||
    factKey.endsWith('_date')
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

  // Date facts: rewrite raw ISO lists, or recover a truncated date from the
  // normalized value. Human-readable official dates stay verbatim.
  if (isDateKey(factKey)) {
    if (looksRawIso(value)) {
      const formatted = formatIsoList(value);
      if (formatted) return formatted;
    } else if (looksTruncated(value) && typeof normalizedValue === 'string') {
      const formatted = formatIsoList(normalizedValue);
      if (formatted) return formatted;
    }
  }

  return value;
}
