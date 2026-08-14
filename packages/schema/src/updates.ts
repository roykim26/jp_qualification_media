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
  ['exam_schedule', '試験日程'],
  ['exam_date', '試験日'],
  ['result_date', '合格発表'],
  ['fee', '受験料・手数料'],
  ['eligibility', '受験資格'],
  ['exam_method', '試験方式'],
  ['passing_standard', '合格基準'],
  ['pass_rate', '合格率'],
];

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
