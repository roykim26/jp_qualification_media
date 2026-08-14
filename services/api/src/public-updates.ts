import { Pool } from 'pg';
import type { PublicUpdateEvent } from '../../../packages/schema/src/updates.js';
import {
  updateEventLabel,
  updateFactLabel,
} from '../../../packages/schema/src/updates.js';

let pool: Pool | undefined;

function databasePool(databaseUrl: string): Pool {
  pool ??= new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  return pool;
}

export async function readPublicUpdates(
  databaseUrl?: string,
  qualificationSlug?: string,
): Promise<PublicUpdateEvent[]> {
  if (!databaseUrl) return [];
  const result = await databasePool(databaseUrl).query(
    `
    SELECT e.id, e.event_type, e.affected_pages, e.created_at,
      q.slug, q.official_name_ja, q.aliases_ja, q.field, q.category,
      f.fact_key, f.exam_year,
      previous.display_value AS previous_value,
      newer.display_value AS new_value,
      newer.verified_at,
      src.canonical_url AS source_url
    FROM change_events e
    JOIN facts f ON f.id = e.fact_id
    JOIN qualifications q ON q.id = f.qualification_id
    JOIN fact_revisions newer ON newer.id = e.new_revision_id
    JOIN candidate_facts new_candidate ON new_candidate.id = newer.candidate_fact_id
    JOIN sources src ON src.id = new_candidate.source_id
    LEFT JOIN fact_revisions previous ON previous.id = e.previous_revision_id
    WHERE newer.status = 'approved'
      ${qualificationSlug ? 'AND q.slug = $1' : ''}
    ORDER BY e.created_at DESC, q.slug, f.fact_key
    LIMIT 100
  `,
    qualificationSlug ? [qualificationSlug] : [],
  );
  return result.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    eventLabel: updateEventLabel(row.event_type),
    qualification: {
      slug: row.slug,
      officialNameJa: row.official_name_ja,
      aliasesJa: row.aliases_ja,
      field: row.field,
      category: row.category,
    },
    factKey: row.fact_key,
    factLabel: updateFactLabel(row.fact_key),
    examYear: row.exam_year,
    previousValue: row.previous_value,
    newValue: row.new_value,
    affectedPages: row.affected_pages,
    sourceUrl: row.source_url,
    createdAt: new Date(row.created_at).toISOString(),
    verifiedAt: new Date(row.verified_at).toISOString(),
  }));
}
