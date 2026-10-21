import { describe, expect, it } from 'vitest';
import {
  updateEventLabel,
  updateEventTypeForFact,
  updateFactLabel,
} from '../packages/schema/src/updates.js';

describe('change event classification', () => {
  it('keeps schedule facts on the schedule label', () => {
    expect(updateEventTypeForFact('exam_date')).toBe('exam_date');
    expect(updateEventTypeForFact('result_date')).toBe('result_date');
    expect(updateEventTypeForFact('exam_schedule')).toBe('schedule_change');
    expect(updateEventTypeForFact('result_date_rule')).toBe('schedule_change');
  });

  it('gives the history statistics series its own event type', () => {
    for (const factKey of [
      'applicants',
      'examinees',
      'passed',
      'pass_rate',
      'statistics_methodology',
    ])
      expect(updateEventTypeForFact(factKey)).toBe('statistics_update');
    expect(updateEventLabel('statistics_update')).toBe('統計データの変更');
  });

  it('classifies exam-content facts without claiming a date change', () => {
    for (const factKey of ['question_format', 'exam_time', 'passing_standard'])
      expect(updateEventTypeForFact(factKey)).toBe('system_change');
    expect(updateEventLabel('system_change')).toBe('制度・方式の変更');
  });

  it('routes fees and eligibility to their own event types', () => {
    expect(updateEventTypeForFact('fee')).toBe('fee_change');
    expect(updateEventTypeForFact('eligibility')).toBe('eligibility_change');
  });

  it('labels statistics fact keys instead of echoing the raw key', () => {
    expect(updateFactLabel('applicants')).toBe('申込者数');
    expect(updateFactLabel('examinees')).toBe('受験者数');
    expect(updateFactLabel('passed')).toBe('合格者数');
    expect(updateFactLabel('statistics_methodology')).toBe('統計の集計口径');
  });

  it('labels deadline and newly public fact keys without raw prefixes', () => {
    expect(updateFactLabel('payment_deadline_rule')).toBe('支払期限');
    expect(updateFactLabel('application_change_deadline_rule')).toBe(
      '申込み内容変更期限',
    );
    expect(updateFactLabel('scoring_method')).toBe('採点方式');
    expect(updateFactLabel('interview_count')).toBe('面接回数');
    expect(updateFactLabel('practical_subject')).toBe('実技科目');
    expect(updateEventLabel('application_deadline')).toBe('締切の変更');
    expect(updateEventTypeForFact('payment_deadline_rule')).toBe(
      'application_deadline',
    );
  });
});
