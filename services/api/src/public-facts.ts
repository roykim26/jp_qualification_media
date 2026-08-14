import { Pool } from 'pg';
import type { PublicFact } from '../../../packages/schema/src/index.js';

let pool: Pool | undefined;

function databasePool(databaseUrl: string): Pool {
  pool ??= new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  return pool;
}

export async function readApprovedFacts(
  databaseUrl?: string,
  qualificationSlug?: string,
): Promise<PublicFact[]> {
  if (!databaseUrl) return [];
  const result = await databasePool(databaseUrl).query(
    `
    SELECT q.slug AS qualification_slug, c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode, c.exam_year, c.fact_key,
      c.value_type, fr.normalized_value, fr.display_value, fr.status,
      c.risk_level, c.source_id, c.source_snapshot_id, c.synthetic,
      fr.verified_at, src.canonical_url AS source_url
    FROM facts f
    JOIN fact_revisions fr ON fr.id = f.current_revision_id
    JOIN candidate_facts c ON c.id = fr.candidate_fact_id
      JOIN qualifications q ON q.id = f.qualification_id
      JOIN snapshots s ON s.id = c.source_snapshot_id
    JOIN sources src ON src.id = c.source_id
    WHERE f.status = 'approved'
      AND fr.status = 'approved'
      AND c.status = 'approved'
      AND c.synthetic = false
      AND c.source_snapshot_id IS NOT NULL
      ${qualificationSlug ? 'AND q.slug = $1' : ''}
    ORDER BY q.slug, c.exam_year, c.fact_key
  `,
    qualificationSlug ? [qualificationSlug] : [],
  );
  return result.rows.map((row) => ({
    qualificationSlug: row.qualification_slug,
    providerId: row.provider_id,
    examLevelId: row.exam_level_id,
    examComponent: row.exam_component,
    deliveryMode: row.delivery_mode,
    examYear: row.exam_year,
    factKey: row.fact_key,
    valueType: row.value_type,
    normalizedValue: row.normalized_value,
    displayValue: row.display_value,
    status: 'approved',
    riskLevel: row.risk_level,
    sourceId: row.source_id,
    sourceSnapshotId: row.source_snapshot_id,
    synthetic: row.synthetic,
    verifiedAt: new Date(row.verified_at).toISOString(),
    sourceUrl: row.source_url,
  }));
}
