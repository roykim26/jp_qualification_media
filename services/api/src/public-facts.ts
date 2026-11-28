import { Pool } from 'pg';
import type { PublicFact } from '../../../packages/schema/src/index.js';
import { resolveDatabaseUrl } from './database-config.js';

let pool: Pool | undefined;

export type PublicFactProvenance = {
  sourceUrl?: string;
  provenanceStatus: 'verified' | 'fixture' | 'incomplete';
  officialVerifiedAt?: string;
};

function allowedCanonicalHttpsUrl(
  url: unknown,
  allowedDomain: unknown,
): string | undefined {
  try {
    const parsed = new URL(String(url));
    return parsed.protocol === 'https:' &&
      parsed.hostname.toLowerCase() === String(allowedDomain).toLowerCase()
      ? parsed.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

/** Never treats a fixture timestamp or snapshot capture time as official verification. */
export function projectPublicFactProvenance(
  row: Record<string, unknown>,
): PublicFactProvenance {
  const sourceUrl = allowedCanonicalHttpsUrl(
    row.source_url,
    row.allowed_domain,
  );
  const fixture = String(row.object_key ?? '').startsWith('ci://');
  const verified =
    Boolean(sourceUrl) &&
    !fixture &&
    !row.snapshot_synthetic &&
    Boolean(row.content_hash) &&
    Boolean(row.object_key) &&
    row.snapshot_source_id === row.source_id &&
    row.latest_review_decision === 'approve' &&
    Boolean(row.latest_review_at);
  if (verified)
    return {
      sourceUrl,
      provenanceStatus: 'verified',
      officialVerifiedAt: new Date(String(row.latest_review_at)).toISOString(),
    };
  return {
    sourceUrl,
    provenanceStatus: fixture ? 'fixture' : 'incomplete',
  };
}

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
  const configuredUrl = resolveDatabaseUrl(databaseUrl, process.env.NODE_ENV);
  if (!configuredUrl) return [];
  const result = await databasePool(configuredUrl).query(
    `
    SELECT q.slug AS qualification_slug, c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode, c.payment_method, c.exam_session, c.exam_year, c.fact_key,
      c.value_type, fr.normalized_value, fr.display_value, fr.status,
      c.risk_level, c.source_id, c.source_snapshot_id, c.synthetic,
      fr.verified_at, src.canonical_url AS source_url, src.allowed_domain,
      s.source_id AS snapshot_source_id, s.synthetic AS snapshot_synthetic,
      s.content_hash, s.object_key,
      latest_review.decision AS latest_review_decision,
      latest_review.created_at AS latest_review_at,
      s.retrieved_at AS snapshot_retrieved_at,
      change_stats.first_published_at,
      GREATEST(change_stats.event_count - 1, 0)::int AS sequence
    FROM facts f
    JOIN fact_revisions fr ON fr.id = f.current_revision_id
    JOIN candidate_facts c ON c.id = fr.candidate_fact_id
      JOIN qualifications q ON q.id = f.qualification_id
    JOIN snapshots s ON s.id = c.source_snapshot_id
    JOIN sources src ON src.id = c.source_id
    LEFT JOIN LATERAL (
      SELECT decision, created_at FROM reviews r
      WHERE r.candidate_fact_id=c.id
      ORDER BY r.created_at DESC, r.id DESC LIMIT 1
    ) latest_review ON true
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS event_count, min(created_at) AS first_published_at
      FROM change_events ce WHERE ce.fact_id=f.id
    ) change_stats ON true
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
    paymentMethod: row.payment_method,
    examSession: row.exam_session,
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
    ...projectPublicFactProvenance(row),
    capturedAt: new Date(row.snapshot_retrieved_at).toISOString(),
    ...(row.first_published_at
      ? { publishedAt: new Date(String(row.first_published_at)).toISOString() }
      : {}),
    sequence: row.sequence,
  }));
}

/**
 * Fields needed by `directoryHighlights()` on the homepage.
 * This is a subset of PublicFact — only the fields that the homepage
 * actually reads when rendering qualification cards.
 */
export type SummaryFact = {
  factKey: string;
  examYear: number;
  displayValue: string;
  normalizedValue: unknown;
  providerId?: string | null;
  examLevelId?: string | null;
  examComponent?: string | null;
  deliveryMode?: string | null;
};

/**
 * Lightweight read for the homepage qualification summary cards.
 *
 * The homepage's `directoryHighlights()` only needs exam_date, fee, and
 * pass_rate facts — about 3-5 rows per qualification. This query skips
 * the correlated subquery for `sequence` and the LEFT JOIN LATERAL for
 * provenance, reducing the bookkeeping payload from 1.2MB/1646 rows to
 * ~5KB/5 rows.
 */
export async function readSummaryFacts(
  databaseUrl?: string,
  qualificationSlug?: string,
): Promise<SummaryFact[]> {
  const configuredUrl = resolveDatabaseUrl(databaseUrl, process.env.NODE_ENV);
  if (!configuredUrl) return [];
  const result = await databasePool(configuredUrl).query(
    `
    SELECT c.fact_key, c.exam_year, fr.display_value, fr.normalized_value,
      c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode
    FROM facts f
    JOIN fact_revisions fr ON fr.id = f.current_revision_id
    JOIN candidate_facts c ON c.id = fr.candidate_fact_id
    JOIN qualifications q ON q.id = f.qualification_id
    WHERE f.status = 'approved'
      AND fr.status = 'approved'
      AND c.status = 'approved'
      AND c.synthetic = false
      AND (
        c.fact_key IN ('exam_date', 'exam_schedule', 'exam_period', 'fee')
        OR c.fact_key LIKE '%\\_fee'
        OR c.fact_key LIKE 'pass\\_rate%'
      )
      ${qualificationSlug ? 'AND q.slug = $1' : ''}
    ORDER BY q.slug, c.exam_year, c.fact_key
  `,
    qualificationSlug ? [qualificationSlug] : [],
  );
  return result.rows.map((row) => ({
    factKey: row.fact_key,
    examYear: row.exam_year,
    displayValue: row.display_value,
    normalizedValue: row.normalized_value,
    providerId: row.provider_id,
    examLevelId: row.exam_level_id,
    examComponent: row.exam_component,
    deliveryMode: row.delivery_mode,
  }));
}

export type PendingFactCoverage = Pick<
  PublicFact,
  | 'qualificationSlug'
  | 'providerId'
  | 'examLevelId'
  | 'examComponent'
  | 'deliveryMode'
  | 'paymentMethod'
  | 'examYear'
  | 'factKey'
>;

/** Metadata-only read: candidates values and evidence never cross this boundary. */
export async function readPendingFactCoverage(
  databaseUrl?: string,
  qualificationSlug?: string,
): Promise<PendingFactCoverage[]> {
  const configuredUrl = resolveDatabaseUrl(databaseUrl, process.env.NODE_ENV);
  // A missing slug is a legitimate "nothing to report" input, not a config error.
  if (!configuredUrl || !qualificationSlug) return [];
  const result = await databasePool(configuredUrl).query(
    `SELECT q.slug AS qualification_slug, c.provider_id, c.exam_level_id,
      c.exam_component, c.delivery_mode, c.payment_method, c.exam_year, c.fact_key
     FROM candidate_facts c
     JOIN qualifications q ON q.id=c.qualification_id
     WHERE c.status='pending_review' AND c.synthetic=false AND q.slug=$1`,
    [qualificationSlug],
  );
  return result.rows.map((row) => ({
    qualificationSlug: row.qualification_slug,
    providerId: row.provider_id,
    examLevelId: row.exam_level_id,
    examComponent: row.exam_component,
    deliveryMode: row.delivery_mode,
    paymentMethod: row.payment_method,
    examYear: row.exam_year,
    factKey: row.fact_key,
  }));
}
