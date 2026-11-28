import { Pool } from 'pg';
import type { PublicUpdateEvent } from '../../../packages/schema/src/updates.js';
import {
  isNoOpUpdate,
  updateEventLabel,
  updateFactLabel,
} from '../../../packages/schema/src/updates.js';
import { resolveDatabaseUrl } from './database-config.js';

let pool: Pool | undefined;

function databasePool(databaseUrl: string): Pool {
  pool ??= new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  return pool;
}

export type PublicUpdatePage = {
  events: PublicUpdateEvent[];
  hasMore: boolean;
};

/**
 * P1-01: a revision whose rendered after value equals the rendered before
 * value is not an update a reader can act on, so it is filtered here rather
 * than hidden in the page. The filter runs in JS because "rendered equal"
 * (e.g. `8200` vs `8,200円`) cannot be expressed in SQL.
 *
 * Filtering changes what a page of results contains, so `limit`/`offset` apply
 * to visible events, not raw rows: read raw rows in windows and keep scanning
 * until enough visible events are collected. The change log is small; the
 * exact-display-value SQL prefilter below keeps the usual case cheap.
 */
const RAW_SCAN_WINDOW = 200;

type PublicUpdateQualification = PublicUpdateEvent['qualification'];

type PublicUpdateRow = {
  id: string;
  event_type: string;
  affected_pages: string[];
  created_at: Date;
  slug: PublicUpdateQualification['slug'];
  official_name_ja: string;
  aliases_ja: string[];
  field: PublicUpdateQualification['field'];
  category: PublicUpdateQualification['category'];
  fact_key: string;
  exam_year: number;
  previous_value: string | null;
  new_value: string;
  reviewed_at: Date | null;
  source_url: string | null;
};

async function readUpdateRows(
  databaseUrl: string,
  qualificationSlug: string | undefined,
  limit: number,
  offset: number,
): Promise<PublicUpdateRow[]> {
  const values: (string | number)[] = [];
  if (qualificationSlug) values.push(qualificationSlug);
  values.push(limit, offset);
  const limitPlaceholder = `$${values.length - 1}`;
  const offsetPlaceholder = `$${values.length}`;
  const result = await databasePool(databaseUrl).query(
    `
    SELECT e.id, e.event_type, e.affected_pages, e.created_at,
      q.slug, q.official_name_ja, q.aliases_ja, q.field, q.category,
      f.fact_key, f.exam_year,
      previous.display_value AS previous_value,
      newer.display_value AS new_value,
      latest_review.created_at AS reviewed_at,
      src.canonical_url AS source_url
    FROM change_events e
    JOIN facts f ON f.id = e.fact_id
    JOIN qualifications q ON q.id = f.qualification_id
    JOIN fact_revisions newer ON newer.id = e.new_revision_id
    JOIN candidate_facts new_candidate ON new_candidate.id = newer.candidate_fact_id
    JOIN sources src ON src.id = new_candidate.source_id
    LEFT JOIN fact_revisions previous ON previous.id = e.previous_revision_id
    LEFT JOIN LATERAL (
      SELECT created_at FROM reviews r
      WHERE r.candidate_fact_id = new_candidate.id
      ORDER BY created_at DESC, r.id DESC LIMIT 1
    ) latest_review ON true
    WHERE newer.status = 'approved'
      AND (previous.id IS NULL OR previous.display_value IS DISTINCT FROM newer.display_value)
      ${qualificationSlug ? 'AND q.slug = $1' : ''}
    ORDER BY e.created_at DESC, q.slug, f.fact_key, e.id
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `,
    values,
  );
  return result.rows as PublicUpdateRow[];
}

function toPublicUpdate(row: PublicUpdateRow): PublicUpdateEvent {
  return {
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
    sourceUrl: row.source_url ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    // Same provenance-gated confirmation timestamp as detail/schedule; the
    // raw revision verified_at carries placeholder dates.
    verifiedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : '',
  };
}

export async function readPublicUpdates(
  databaseUrl?: string,
  qualificationSlug?: string,
  page: { limit?: number; offset?: number } = {},
): Promise<PublicUpdatePage> {
  const limit = page.limit ?? 100;
  const offset = page.offset ?? 0;
  const configuredUrl = resolveDatabaseUrl(databaseUrl, process.env.NODE_ENV);
  if (!configuredUrl) return { events: [], hasMore: false };

  const target = offset + limit + 1;
  const visible: PublicUpdateEvent[] = [];
  let rawOffset = 0;
  for (;;) {
    const rows = await readUpdateRows(
      configuredUrl,
      qualificationSlug,
      RAW_SCAN_WINDOW,
      rawOffset,
    );
    for (const row of rows) {
      const event = toPublicUpdate(row);
      if (isNoOpUpdate(event.factKey, event.previousValue, event.newValue))
        continue;
      visible.push(event);
      if (visible.length >= target) break;
    }
    if (visible.length >= target || rows.length < RAW_SCAN_WINDOW) break;
    rawOffset += RAW_SCAN_WINDOW;
  }

  return {
    events: visible.slice(offset, offset + limit),
    hasMore: visible.length > offset + limit,
  };
}
