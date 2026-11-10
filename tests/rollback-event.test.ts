import { describe, expect, it } from 'vitest';
import {
  buildRollbackEvent,
  type RollbackEventInput,
} from '../services/api/src/release.js';

function rollback(factKey: string, qualificationId = 'qualification:takken') {
  const input: RollbackEventInput = {
    factId: 'fact:1',
    factKey,
    qualificationId,
    currentRevisionId: 'rev:new',
    previousRevisionId: 'rev:old',
  };
  return buildRollbackEvent(input);
}

describe('rollback change event', () => {
  it('takes the event type from the fact key instead of a fixed schedule_change', () => {
    // 回滚过去一律写成 schedule_change，非日程类事实会在 /updates/ 里挂错标签。
    expect(rollback('fee').eventType).toBe('fee_change');
    expect(rollback('application_deadline_online').eventType).toBe(
      'application_deadline',
    );
    expect(rollback('application_open_postal').eventType).toBe(
      'application_open',
    );
    expect(rollback('passed').eventType).toBe('statistics_update');
    expect(rollback('eligibility').eventType).toBe('eligibility_change');
    expect(rollback('exam_method').eventType).toBe('system_change');
  });

  it('keeps schedule_change for schedule facts', () => {
    expect(rollback('exam_schedule').eventType).toBe('schedule_change');
  });

  it('labels the affected page from the fact qualification instead of takken', () => {
    // 过去 affected_pages 是常量 ['qualification:takken']，FP／簿記回滚会标错页面。
    expect(rollback('fee', 'qualification:fp').affectedPages).toEqual([
      'qualification:fp',
    ]);
    expect(
      rollback('pass_rate', 'qualification:bookkeeping').affectedPages,
    ).toEqual(['qualification:bookkeeping']);
    expect(rollback('exam_date').affectedPages).toEqual([
      'qualification:takken',
    ]);
  });

  it('keeps the rollback id and points from the current revision to the previous one', () => {
    expect(rollback('exam_date')).toEqual({
      id: 'rollback:fact:1:rev:old',
      eventType: 'exam_date',
      previousRevisionId: 'rev:new',
      newRevisionId: 'rev:old',
      affectedPages: ['qualification:takken'],
    });
  });
});
