import { formatUpdateDisplayValue, isDateFactKey } from './display.js';
import type { Qualification } from './index.js';

export type PublicUpdateEvent = {
  id: string;
  eventType: string;
  eventLabel: string;
  qualification: Qualification;
  factKey: string;
  factLabel: string;
  examYear: number;
  previousValue: string | null;
  newValue: string;
  affectedPages: string[];
  sourceUrl?: string;
  createdAt: string;
  verifiedAt: string;
};

const updateEventLabels: Record<string, string> = {
  application_open: '申込開始の変更',
  application_deadline: '締切の変更',
  exam_date: '試験日の変更',
  result_date: '合格発表日の変更',
  fee_change: '料金の変更',
  eligibility_change: '受験資格の変更',
  schedule_change: '日程の変更',
  system_change: '制度・方式の変更',
  statistics_update: '統計データの変更',
};

const updateFactLabelPrefixes: readonly [string, string][] = [
  ['application_change_deadline_rule', '申込み内容変更期限'],
  ['application_deadline', '申込締切'],
  ['application_open', '申込開始'],
  ['application_start', '申込開始'],
  ['application_method', '申込み方法'],
  ['application_rule', '申込みルール'],
  ['exam_schedule', '試験日程'],
  ['exam_date', '試験日'],
  ['result_date', '合格発表'],
  ['suspension_period', '実施休止期間'],
  ['fee', '受験料・手数料'],
  ['payment_deadline_rule', '支払期限'],
  ['payment_method', '支払い方法'],
  ['eligibility', '受験資格'],
  ['exam_method', '試験方式'],
  ['exam_content', '試験内容'],
  ['exam_time', '試験時間'],
  ['exam_subject', '試験科目'],
  ['question_format', '出題形式'],
  ['question_count', '問題数'],
  ['scoring_method', '採点方式'],
  ['interview_count', '面接回数'],
  ['practical_subject', '実技科目'],
  ['passing_standard', '合格基準'],
  ['pass_rate', '合格率'],
  ['applicants', '申込者数'],
  ['examinees', '受験者数'],
  ['passed', '合格者数'],
  ['statistics_methodology', '統計の集計口径'],
];

const statisticsFactKeys: readonly string[] = [
  'applicants',
  'examinees',
  'passed',
  'pass_rate',
  'statistics_methodology',
];

const examContentFactKeyPrefixes: readonly string[] = [
  'application_method',
  'application_rule',
  'exam_content',
  'exam_method',
  'exam_subject',
  'exam_time',
  'interview_count',
  'passing_standard',
  'practical_subject',
  'question_count',
  'question_format',
  'scoring_method',
];

function startsWithAny(value: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

/**
 * `change_events.event_type` is a closed enum, so fact keys that are neither a
 * date nor a fee or eligibility rule are recorded as a system change rather
 * than falling through to the schedule label.  The history statistics series
 * has its own member (`statistics_update`, added by migration 0019) because
 * since round 11 it is presented as per-year tables, not as a rule change.
 * The branch order here is the order the 0020 backfill CASE mirrors.
 */
export function updateEventTypeForFact(factKey: string): string {
  if (factKey.includes('deadline')) return 'application_deadline';
  if (
    factKey.includes('application_open') ||
    factKey.includes('application_start')
  )
    return 'application_open';
  if (factKey === 'exam_date') return 'exam_date';
  if (factKey === 'result_date') return 'result_date';
  if (startsWithAny(factKey, ['fee', 'payment_'])) return 'fee_change';
  if (factKey.startsWith('eligibility')) return 'eligibility_change';
  if (statisticsFactKeys.includes(factKey)) return 'statistics_update';
  if (startsWithAny(factKey, examContentFactKeyPrefixes))
    return 'system_change';
  return 'schedule_change';
}

export function updateEventLabel(eventType: string): string {
  return updateEventLabels[eventType] ?? '公式情報の変更';
}

export function updateFactLabel(factKey: string): string {
  return (
    updateFactLabelPrefixes.find(([prefix]) =>
      factKey.startsWith(prefix),
    )?.[1] ?? factKey
  );
}

// Comparison-only canonical form. NFKC folds full-width digits/punctuation,
// whitespace runs collapse, and a simple date is rewritten to ISO so that
// `2026/06/14`, `2026-06-14` and `2026年6月14日` compare equal. The rendered
// text itself is untouched.
const SIMPLE_DATE = /^(\d{4})[年/.\-](\d{1,2})[月/.\-](\d{1,2})日?$/;

function canonicalText(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s\u3000]+/g, ' ')
    .trim();
}

/**
 * The value a reader actually sees for an update-log cell. `null`/undefined
 * mean "no previous value" and normalise to the empty string.
 */
export function normalizedUpdateDisplayValue(
  factKey: string,
  value: string | null | undefined,
): string {
  if (value === null || value === undefined) return '';
  const source = canonicalText(String(value));
  if (!source) return '';
  const formatted = canonicalText(formatUpdateDisplayValue(factKey, source));
  if (isDateFactKey(factKey)) {
    const date = formatted.match(SIMPLE_DATE);
    if (date) {
      const month = date[2].padStart(2, '0');
      const day = date[3].padStart(2, '0');
      return `${date[1]}-${month}-${day}`;
    }
  }
  return formatted;
}

/**
 * True when publishing this revision would show an A -> A row (or an empty
 * after value). The comparison uses the rendered display values, so a
 * different raw/normalised JSON blob with identical visible text is a no-op.
 *
 * `previousValue === null` is a first publication: it is a real update only
 * when the new value has something visible to show.
 */
export function isNoOpUpdate(
  factKey: string,
  previousValue: string | null | undefined,
  newValue: string | null | undefined,
): boolean {
  const after = normalizedUpdateDisplayValue(factKey, newValue);
  if (!after) return true;
  return normalizedUpdateDisplayValue(factKey, previousValue) === after;
}
