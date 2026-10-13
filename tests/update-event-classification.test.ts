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

  it('classifies statistics and exam-content facts without claiming a date change', () => {
    for (const factKey of [
      'applicants',
      'examinees',
      'passed',
      'pass_rate',
      'statistics_methodology',
      'question_format',
      'exam_time',
      'passing_standard',
    ])
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
});
