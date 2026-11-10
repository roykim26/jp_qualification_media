import { describe, expect, it } from 'vitest';
import { buildRollbackEvent } from '../services/api/src/release.js';

describe('rollback change event', () => {
  it('takes the event type from the fact key instead of a fixed schedule_change', () => {
    // 回滚过去一律写成 schedule_change，非日程类事实会在 /updates/ 里挂错标签。
    expect(
      buildRollbackEvent('fact:1', 'fee', 'rev:2', 'rev:1').eventType,
    ).toBe('fee_change');
    expect(
      buildRollbackEvent('fact:1', 'application_deadline_online', 'r2', 'r1')
        .eventType,
    ).toBe('application_deadline');
    expect(
      buildRollbackEvent('fact:1', 'application_open_postal', 'r2', 'r1')
        .eventType,
    ).toBe('application_open');
    expect(buildRollbackEvent('fact:1', 'passed', 'r2', 'r1').eventType).toBe(
      'statistics_update',
    );
    expect(
      buildRollbackEvent('fact:1', 'eligibility', 'r2', 'r1').eventType,
    ).toBe('eligibility_change');
    expect(
      buildRollbackEvent('fact:1', 'exam_method', 'r2', 'r1').eventType,
    ).toBe('system_change');
  });

  it('keeps schedule_change for schedule facts', () => {
    expect(
      buildRollbackEvent('fact:1', 'exam_schedule', 'r2', 'r1').eventType,
    ).toBe('schedule_change');
  });

  it('keeps the rollback id and points from the current revision to the previous one', () => {
    expect(
      buildRollbackEvent('fact:9', 'exam_date', 'rev:new', 'rev:old'),
    ).toEqual({
      id: 'rollback:fact:9:rev:old',
      eventType: 'exam_date',
      previousRevisionId: 'rev:new',
      newRevisionId: 'rev:old',
    });
  });
});
