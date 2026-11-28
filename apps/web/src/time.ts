/**
 * One place for public timestamp labels and formatting (P1-02).
 *
 * Five different timestamps must never collapse into one "更新日":
 * official publication date, official page last-modified time (neither is
 * modelled), capture/check time, review time and this site's publication time.
 * Only the last three are stored, and each has its own label below.
 *
 * Every stored timestamp is an instant (UTC ISO string). It is always rendered
 * in Asia/Tokyo, the timezone of every source site.
 */
const TIME_ZONE = 'Asia/Tokyo';

/** The public labels; each maps to exactly one stored field. */
export const timeLabels = {
  /** `reviews.created_at` for the newest review of the approved candidate. */
  officialVerified: '公式情報確認（審査）',
  /** Source snapshot capture/check time. */
  captured: '取得日時（チェック）',
  /** This site's publication time (`change_events.created_at`). */
  sitePublished: '掲載日時（本サイト）',
  /** Official announcement date. Not modelled; always stated as unrecorded. */
  officialPublished: '公式発表日',
} as const;

export const unconfirmedTime = '未確認';

function parseInstant(value: string | null | undefined): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

/** `2026年11月21日(土)` in JST for a stored instant. */
export function formatSiteDate(value: string | null | undefined): string {
  const date = parseInstant(value);
  if (!date) return unconfirmedTime;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    timeZone: TIME_ZONE,
  }).format(date);
}

/** `2026年11月21日` in JST (no weekday) for a stored instant. */
export function formatSiteDay(value: string | null | undefined): string {
  const date = parseInstant(value);
  if (!date) return unconfirmedTime;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TIME_ZONE,
  }).format(date);
}

/** `2026年11月21日(土) 11:00` in JST for a stored instant. */
export function formatSiteDateTime(value: string | null | undefined): string {
  const date = parseInstant(value);
  if (!date) return unconfirmedTime;
  const time = new Intl.DateTimeFormat('ja-JP', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: TIME_ZONE,
  }).format(date);
  return `${formatSiteDate(value)} ${time}`;
}

/** `YYYY-MM-DD` in JST, for a `<time datetime>` attribute. */
export function formatSiteDateAttribute(
  value: string | null | undefined,
): string {
  const date = parseInstant(value);
  if (!date) return '';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone: TIME_ZONE,
  }).format(date);
}

/**
 * Calendar fact values are already date-only (`YYYY-MM-DD`) and carry no
 * instant, so they are rendered without a timezone conversion.
 */
export function formatDateOnlyJa(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return value;
  return `${Number(match[1])}年${Number(match[2])}月${Number(match[3])}日`;
}
