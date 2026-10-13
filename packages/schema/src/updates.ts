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
  application_deadline: '申込締切の変更',
  exam_date: '試験日の変更',
  result_date: '合格発表日の変更',
  fee_change: '料金の変更',
  eligibility_change: '受験資格の変更',
  schedule_change: '日程の変更',
  system_change: '制度・方式の変更',
};

const updateFactLabelPrefixes: readonly [string, string][] = [
  ['application_deadline', '申込締切'],
  ['application_open', '申込開始'],
  ['application_start', '申込開始'],
  ['application_method', '申込み方法'],
  ['application_rule', '申込みルール'],
  ['exam_schedule', '試験日程'],
  ['exam_date', '試験日'],
  ['result_date', '合格発表'],
  ['fee', '受験料・手数料'],
  ['payment_', '受験料・手数料'],
  ['eligibility', '受験資格'],
  ['exam_method', '試験方式'],
  ['exam_time', '試験時間'],
  ['exam_subject', '試験科目'],
  ['question_format', '出題形式'],
  ['question_count', '問題数'],
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
 * than falling through to the schedule label.
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
  if (
    statisticsFactKeys.includes(factKey) ||
    startsWithAny(factKey, examContentFactKeyPrefixes)
  )
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
