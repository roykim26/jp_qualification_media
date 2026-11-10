import { Pool } from 'pg';
import { updateEventTypeForFact } from '../../../packages/schema/src/updates.js';

export type ReleaseGate = {
  pending: number;
  approvedFacts: number;
  approvedRevisions: number;
  changeEvents: number;
  valid: boolean;
};

export async function checkTakkenRelease(
  databaseUrl: string,
): Promise<ReleaseGate> {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await pool.query(`
      SELECT
        (SELECT count(*) FROM candidate_facts c JOIN qualifications q ON q.id=c.qualification_id
          WHERE q.slug='takken' AND c.status='pending_review')::int AS pending,
        (SELECT count(*) FROM facts f JOIN qualifications q ON q.id=f.qualification_id
          WHERE q.slug='takken' AND f.status='approved')::int AS approved_facts,
        (SELECT count(*) FROM fact_revisions r JOIN candidate_facts c ON c.id=r.candidate_fact_id
          JOIN qualifications q ON q.id=c.qualification_id WHERE q.slug='takken' AND r.status='approved')::int AS approved_revisions,
        (SELECT count(*) FROM change_events e JOIN facts f ON f.id=e.fact_id
          JOIN qualifications q ON q.id=f.qualification_id WHERE q.slug='takken')::int AS change_events`);
    const row = result.rows[0] as {
      pending: number;
      approved_facts: number;
      approved_revisions: number;
      change_events: number;
    };
    const gate = {
      pending: row.pending,
      approvedFacts: row.approved_facts,
      approvedRevisions: row.approved_revisions,
      changeEvents: row.change_events,
    };
    return {
      ...gate,
      valid:
        gate.pending === 0 &&
        gate.approvedFacts === gate.approvedRevisions &&
        gate.approvedFacts === gate.changeEvents,
    };
  } finally {
    await pool.end();
  }
}

export type RollbackEvent = {
  id: string;
  eventType: string;
  previousRevisionId: string;
  newRevisionId: string;
  affectedPages: string[];
  operatorId?: string;
  reason?: string;
};

export type RollbackAudit = {
  operatorId: string;
  reason: string;
};

export type RollbackEventInput = {
  factId: string;
  factKey: string;
  qualificationId: string;
  currentRevisionId: string;
  previousRevisionId: string;
} & Partial<RollbackAudit>;

/**
 * The rollback event used to be pinned to `schedule_change` and to the takken
 * page.  Both now come from the fact itself (same classifier as the approval
 * path, same `[qualification_id]` page list), so rolling back a fee or an FP
 * fact no longer shows up under the wrong label or on the takken page.
 */
export function buildRollbackEvent(input: RollbackEventInput): RollbackEvent {
  return {
    id: `rollback:${input.factId}:${input.previousRevisionId}`,
    eventType: updateEventTypeForFact(input.factKey),
    previousRevisionId: input.currentRevisionId,
    newRevisionId: input.previousRevisionId,
    affectedPages: [input.qualificationId],
    ...(input.operatorId && input.reason
      ? { operatorId: input.operatorId, reason: input.reason }
      : {}),
  };
}

/**
 * A manual rollback is only acceptable when it is attributable: the operator
 * has to be named and the reason has to say what went wrong.  Kept pure so the
 * command-line guard can be tested without a database.
 */
export function normalizeRollbackAudit(input: {
  operatorId?: string;
  reason?: string;
}): RollbackAudit {
  const operatorId = input.operatorId?.trim() ?? '';
  const reason = input.reason?.trim() ?? '';
  if (operatorId.length < 2 || operatorId.length > 64)
    throw new Error('operator must be 2-64 characters');
  if (/\s/.test(operatorId))
    throw new Error('operator must not contain whitespace');
  if (reason.length < 5 || reason.length > 500)
    throw new Error('reason must be 5-500 characters');
  return { operatorId, reason };
}

export type RollbackOptions = Partial<RollbackAudit> & {
  toRevisionId?: string;
  dryRun?: boolean;
};

export type RollbackResult = {
  factId: string;
  fromRevisionId: string;
  toRevisionId: string;
  eventId: string;
  eventCreated: boolean;
  dryRun: boolean;
  operatorId: string;
  reason: string;
};

export async function rollbackApprovedFact(
  databaseUrl: string,
  factId: string,
  options: RollbackOptions,
): Promise<RollbackResult> {
  const audit = normalizeRollbackAudit(options);
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT f.id, f.current_revision_id, f.fact_key, f.qualification_id FROM facts f WHERE f.id=$1 AND f.status='approved' FOR UPDATE`,
      [factId],
    );
    if (!current.rowCount) throw new Error('approved fact not found');
    const fromRevisionId = current.rows[0].current_revision_id as string;
    let toRevisionId: string;
    if (options.toRevisionId) {
      if (options.toRevisionId === fromRevisionId)
        throw new Error('target revision is already the current revision');
      const target = await client.query(
        `
        SELECT r.id FROM fact_revisions r JOIN candidate_facts c ON c.id=r.candidate_fact_id
        JOIN facts f ON f.qualification_id=c.qualification_id
          AND f.provider_id IS NOT DISTINCT FROM c.provider_id
          AND f.exam_level_id IS NOT DISTINCT FROM c.exam_level_id
          AND f.exam_component IS NOT DISTINCT FROM c.exam_component
          AND f.delivery_mode IS NOT DISTINCT FROM c.delivery_mode
          AND f.payment_method IS NOT DISTINCT FROM c.payment_method
          AND f.exam_session IS NOT DISTINCT FROM c.exam_session
          AND f.exam_year=c.exam_year AND f.fact_key=c.fact_key
        WHERE f.id=$1 AND r.id=$2 AND r.status='approved'`,
        [factId, options.toRevisionId],
      );
      if (!target.rowCount)
        throw new Error(
          'target revision is not an approved revision of this fact',
        );
      toRevisionId = options.toRevisionId;
    } else {
      const previous = await client.query(
        `
        SELECT r.id FROM fact_revisions r JOIN candidate_facts c ON c.id=r.candidate_fact_id
        JOIN facts f ON f.qualification_id=c.qualification_id
          AND f.provider_id IS NOT DISTINCT FROM c.provider_id
          AND f.exam_level_id IS NOT DISTINCT FROM c.exam_level_id
          AND f.exam_component IS NOT DISTINCT FROM c.exam_component
          AND f.delivery_mode IS NOT DISTINCT FROM c.delivery_mode
          AND f.payment_method IS NOT DISTINCT FROM c.payment_method
          AND f.exam_session IS NOT DISTINCT FROM c.exam_session
          AND f.exam_year=c.exam_year AND f.fact_key=c.fact_key
        WHERE f.id=$1 AND r.status='approved' AND r.id <> $2
        ORDER BY r.verified_at DESC LIMIT 1`,
        [factId, fromRevisionId],
      );
      if (!previous.rowCount)
        throw new Error('no previous approved revision available');
      toRevisionId = previous.rows[0].id as string;
    }
    await client.query('UPDATE facts SET current_revision_id=$1 WHERE id=$2', [
      toRevisionId,
      factId,
    ]);
    const event = buildRollbackEvent({
      factId,
      factKey: current.rows[0].fact_key as string,
      qualificationId: current.rows[0].qualification_id as string,
      currentRevisionId: fromRevisionId,
      previousRevisionId: toRevisionId,
      ...audit,
    });
    const inserted = await client.query(
      `INSERT INTO change_events (id,fact_id,event_type,previous_revision_id,new_revision_id,affected_pages,operator_id,reason)
      VALUES ($1,$2,$3::event_type,$4,$5,$6::jsonb,$7,$8) ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        factId,
        event.eventType,
        event.previousRevisionId,
        event.newRevisionId,
        JSON.stringify(event.affectedPages),
        event.operatorId,
        event.reason,
      ],
    );
    if (options.dryRun) {
      await client.query('ROLLBACK');
      return {
        factId,
        fromRevisionId,
        toRevisionId,
        eventId: event.id,
        eventCreated: false,
        dryRun: true,
        ...audit,
      };
    }
    await client.query('COMMIT');
    return {
      factId,
      fromRevisionId,
      toRevisionId,
      eventId: event.id,
      eventCreated: Boolean(inserted.rowCount),
      dryRun: false,
      ...audit,
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
