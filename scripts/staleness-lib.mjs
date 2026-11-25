export const windowsDays = {
  fee: 90,
  eligibility: 180,
  annual: 365,
  sourceLink: 7,
};

const feeFactKeys = new Set(['fee', 'payment_method', 'payment_deadline_rule']);

const eligibilityFactKeys = new Set([
  'eligibility',
  'application_rule',
  'application_change_deadline_rule',
]);

const statisticsFactKeys = new Set([
  'pass_rate',
  'applicants',
  'examinees',
  'passed',
  'statistics_methodology',
]);

export function factWindowDays(factKey) {
  if (feeFactKeys.has(factKey) || factKey.startsWith('fee_'))
    return { windowDays: windowsDays.fee, reason: 'fee' };
  if (eligibilityFactKeys.has(factKey) || factKey.startsWith('eligibility_'))
    return { windowDays: windowsDays.eligibility, reason: 'eligibility' };
  if (statisticsFactKeys.has(factKey) || factKey.startsWith('pass_rate_'))
    return { windowDays: windowsDays.annual, reason: 'statistics' };
  return { windowDays: windowsDays.annual, reason: 'annual' };
}

export function ageInDays(timestamp, now) {
  if (!timestamp) return null;
  const time = new Date(timestamp).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((now.getTime() - time) / 86_400_000);
}

export function referenceYear(now) {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
    }).format(now),
  );
}

export const STALENESS_QUERY = `
    SELECT
      f.id AS fact_id,
      f.exam_year,
      f.fact_key,
      f.provider_id,
      f.exam_level_id,
      f.exam_component,
      f.delivery_mode,
      f.payment_method,
      f.exam_session,
      fr.display_value,
      fr.verified_at,
      q.slug AS qualification_slug,
      src.id AS source_id,
      src.canonical_url,
      latest_snapshot.retrieved_at AS last_snapshot_at
    FROM facts f
    JOIN fact_revisions fr ON fr.id=f.current_revision_id
    JOIN candidate_facts c ON c.id=fr.candidate_fact_id
    JOIN qualifications q ON q.id=f.qualification_id
    JOIN sources src ON src.id=c.source_id
    LEFT JOIN LATERAL (
      SELECT retrieved_at
      FROM snapshots s
      WHERE s.source_id=src.id
      ORDER BY retrieved_at DESC, id DESC
      LIMIT 1
    ) latest_snapshot ON true
    WHERE f.status='approved'
      AND fr.status='approved'
      AND c.status='approved'
      AND c.synthetic=false
    ORDER BY q.slug, f.exam_year DESC, f.fact_key
  `;

// A fact is identified by nine columns, not three (see facts_current_key_idx in
// migrations/0017_exam_session_dimension.sql). Two approved facts can share
// qualification/examYear/factKey and differ only in, say, exam level and
// delivery mode — 日商簿記 2026 has seven distinct fee facts doing exactly that.
// Carrying the dimensions through means a "needs review" line names one fact
// instead of seven identical-looking ones.
export const factDimensionFields = [
  { field: 'providerId', column: 'provider_id', label: 'provider' },
  { field: 'examLevelId', column: 'exam_level_id', label: 'examLevel' },
  { field: 'examComponent', column: 'exam_component', label: 'component' },
  { field: 'deliveryMode', column: 'delivery_mode', label: 'delivery' },
  { field: 'paymentMethod', column: 'payment_method', label: 'payment' },
  { field: 'examSession', column: 'exam_session', label: 'session' },
];

// Every dimension is nullable, and a null means "this fact does not distinguish
// that axis" rather than "unknown". Dropping nulls keeps the label short and
// keeps the common case (no dimensions at all) identical to the old output.
export function factDimensions(row) {
  const dimensions = {};
  for (const { field, column } of factDimensionFields) {
    const value = row[column];
    if (typeof value === 'string' && value.length > 0) {
      dimensions[field] = value;
    }
  }
  return dimensions;
}

export function formatFactTarget(fact) {
  const base = `${fact.qualification}/${fact.examYear}/${fact.factKey}`;
  const dimensions = fact.dimensions ?? {};
  const parts = [];
  for (const { field, label } of factDimensionFields) {
    const value = dimensions[field];
    if (typeof value === 'string' && value.length > 0) {
      parts.push(`${label}=${value}`);
    }
  }
  return parts.length === 0 ? base : `${base} (${parts.join(', ')})`;
}

export function computeStaleness(rows, now) {
  const year = referenceYear(now);
  const dueFacts = [];
  const sources = new Map();
  let historicalSkipped = 0;

  for (const row of rows) {
    if (row.exam_year < year) {
      historicalSkipped += 1;
      continue;
    }
    const { windowDays, reason } = factWindowDays(row.fact_key);
    const ageDays = ageInDays(row.verified_at, now);
    if (ageDays !== null && ageDays > windowDays) {
      dueFacts.push({
        factId: row.fact_id,
        qualification: row.qualification_slug,
        examYear: row.exam_year,
        factKey: row.fact_key,
        dimensions: factDimensions(row),
        displayValue: row.display_value,
        verifiedAt: row.verified_at,
        ageDays,
        windowDays,
        reason,
      });
    }
    const snapshotAge = ageInDays(row.last_snapshot_at, now);
    if (
      !sources.has(row.source_id) &&
      (snapshotAge === null || snapshotAge > windowsDays.sourceLink)
    ) {
      sources.set(row.source_id, {
        sourceId: row.source_id,
        canonicalUrl: row.canonical_url,
        lastSnapshotAt: row.last_snapshot_at,
        ageDays: snapshotAge,
      });
    }
  }

  // Ratio decides the order; factId breaks ties so a report that runs twice on
  // the same data lists the same facts in the same order (the SQL order stops at
  // factKey, which is no longer unique once dimensions are in play).
  dueFacts.sort(
    (a, b) =>
      b.ageDays / b.windowDays - a.ageDays / a.windowDays ||
      a.factId.localeCompare(b.factId),
  );

  return {
    referenceYear: year,
    summary: {
      approvedFacts: rows.length,
      historicalSkipped,
      checked: rows.length - historicalSkipped,
      dueFacts: dueFacts.length,
      sourcesBehindOnSnapshot: sources.size,
    },
    dueFacts,
    dueSources: [...sources.values()].sort(
      (a, b) => (b.ageDays ?? Infinity) - (a.ageDays ?? Infinity),
    ),
  };
}
