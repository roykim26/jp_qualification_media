import { Pool } from 'pg';

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

export async function rollbackApprovedFact(
  databaseUrl: string,
  factId: string,
): Promise<string> {
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT f.id, f.current_revision_id FROM facts f WHERE f.id=$1 AND f.status='approved' FOR UPDATE`,
      [factId],
    );
    if (!current.rowCount) throw new Error('approved fact not found');
    const previous = await client.query(
      `
      SELECT r.id FROM fact_revisions r JOIN candidate_facts c ON c.id=r.candidate_fact_id
      JOIN facts f ON f.qualification_id=c.qualification_id
        AND f.provider_id IS NOT DISTINCT FROM c.provider_id
        AND f.exam_level_id IS NOT DISTINCT FROM c.exam_level_id
        AND f.exam_component IS NOT DISTINCT FROM c.exam_component
        AND f.delivery_mode IS NOT DISTINCT FROM c.delivery_mode
        AND f.exam_year=c.exam_year AND f.fact_key=c.fact_key
      WHERE f.id=$1 AND r.status='approved' AND r.id <> $2
      ORDER BY r.verified_at DESC LIMIT 1`,
      [factId, current.rows[0].current_revision_id],
    );
    if (!previous.rowCount)
      throw new Error('no previous approved revision available');
    const revisionId = previous.rows[0].id as string;
    await client.query('UPDATE facts SET current_revision_id=$1 WHERE id=$2', [
      revisionId,
      factId,
    ]);
    await client.query(
      `INSERT INTO change_events (id,fact_id,event_type,previous_revision_id,new_revision_id,affected_pages)
      VALUES ($1,$2,'schedule_change',$3,$4,$5::jsonb) ON CONFLICT (id) DO NOTHING`,
      [
        `rollback:${factId}:${revisionId}`,
        factId,
        current.rows[0].current_revision_id,
        revisionId,
        JSON.stringify(['qualification:takken']),
      ],
    );
    await client.query('COMMIT');
    return revisionId;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
