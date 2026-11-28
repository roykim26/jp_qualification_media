import { auditProvenanceRow } from './provenance-audit-lib.mjs';

/**
 * Internal data-quality scoring for the MVP audit (P1-04).
 *
 * The point is to stop `approvedFacts` from reading as a quality number: 90% of
 * the rows are bookkeeping facts, and their count says nothing about coverage,
 * scope labels or freshness. Every dimension below reports its own denominator,
 * numerator and the concrete reasons behind the missing numerator. The overall
 * score is the unweighted mean of the dimensions that apply — never a function
 * of how many facts exist.
 *
 * Four states are kept apart on purpose:
 *   - applicable and satisfied     -> numerator
 *   - applicable and missing       -> missing (with a reason code)
 *   - not applicable               -> excluded from the denominator
 *   - unknown (no timestamp etc.)  -> reported separately, not counted as wrong
 */

export const QUALITY_DIMENSION_LABELS = {
  source: 'Source completeness',
  scope: 'Scope completeness',
  freshness: 'Freshness',
  consistency: 'Consistency',
  coverage: 'Coverage',
  review: 'Review status',
  calendar: 'Calendar semantic correctness',
};

/** Dimensions only; qualifications without a multi-scope contract are n/a. */
const SCOPE_DIMENSIONS = {
  bookkeeping: ['exam_level_id', 'delivery_mode'],
  fp: ['provider_id', 'exam_level_id', 'exam_component', 'delivery_mode'],
};

const STATISTICS_FACT_KEYS = new Set([
  'applicants',
  'examinees',
  'passed',
  'pass_rate',
  'statistics_methodology',
]);

/**
 * The history statistics series is per exam round, so a row without
 * `exam_session` cannot be told apart from the next round of the same year.
 * That is a scope gap even for qualifications that have no level/provider.
 */
function requiredScopeDimensions(row) {
  const dimensions = [...(SCOPE_DIMENSIONS[row.qualification_slug] ?? [])];
  if (
    STATISTICS_FACT_KEYS.has(factKey(row)) &&
    !dimensions.includes('exam_session')
  )
    dimensions.push('exam_session');
  return dimensions;
}

export const FRESHNESS_WINDOW_DAYS = 365;

const CALENDAR_SENTINELS = new Set([
  'venue_defined',
  'year_round',
  'not_announced',
  'not_applicable',
  'date_tbd',
  'undated',
]);

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/;

function pct(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function countBy(items) {
  const counts = {};
  for (const item of items) counts[item] = (counts[item] ?? 0) + 1;
  return Object.entries(counts)
    .map(([reason, count]) => ({ reason, count }))
    .sort((left, right) => right.count - left.count);
}

function dimension(key, denominator, numerator, missing, notes = []) {
  return {
    key,
    label: QUALITY_DIMENSION_LABELS[key],
    denominator,
    numerator,
    score: pct(numerator, denominator),
    missing,
    ...(notes.length ? { notes } : {}),
  };
}

function factKey(row) {
  return String(row.fact_key ?? '');
}

function isDateFact(row) {
  const key = factKey(row);
  return (
    ['exam_date', 'exam_dates', 'exam_schedule'].includes(key) ||
    key.endsWith('_date') ||
    key.startsWith('application_open') ||
    key.startsWith('application_start') ||
    key.startsWith('application_deadline') ||
    key.startsWith('result_date') ||
    key.startsWith('suspension_period') ||
    key.startsWith('payment_deadline')
  );
}

function validCalendarValue(value) {
  if (value === null || value === undefined || value === '') return false;
  const parts = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return false;
  return parts.every(
    (part) => ISO_DATE.test(part) || CALENDAR_SENTINELS.has(part),
  );
}

function identity(row) {
  return JSON.stringify([
    row.qualification_slug ?? null,
    row.exam_year ?? null,
    row.fact_key ?? null,
    row.provider_id ?? null,
    row.exam_level_id ?? null,
    row.exam_component ?? null,
    row.delivery_mode ?? null,
    row.payment_method ?? null,
    row.exam_session ?? null,
  ]);
}

function sourceDimension(rows) {
  const missing = [];
  let passed = 0;
  for (const row of rows) {
    const issues = auditProvenanceRow(row).issues;
    if (issues.length) missing.push(...issues);
    else passed += 1;
  }
  return dimension('source', rows.length, passed, countBy(missing), []);
}

function scopeDimension(rows) {
  const applicable = rows.filter(
    (row) => requiredScopeDimensions(row).length > 0,
  );
  const missing = [];
  let passed = 0;
  for (const row of applicable) {
    const absent = requiredScopeDimensions(row).filter(
      (name) =>
        row[name] === null || row[name] === undefined || row[name] === '',
    );
    if (absent.length)
      missing.push(`${row.qualification_slug}:${absent.join('+')}`);
    else passed += 1;
  }
  return dimension('scope', applicable.length, passed, countBy(missing), [
    'Multi-scope qualifications require their level/provider/component/mode; the history statistics series also requires exam_session.',
    'Qualifications and fact keys without an expected scope are n/a.',
  ]);
}

function parseTime(value) {
  if (!value) return undefined;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : undefined;
}

function freshnessDimension(rows, nowMs) {
  const windowMs = FRESHNESS_WINDOW_DAYS * 86_400_000;
  const missing = [];
  let known = 0;
  let fresh = 0;
  let unknown = 0;
  for (const row of rows) {
    const retrieved = parseTime(row.snapshot_retrieved_at);
    if (retrieved === undefined) {
      unknown += 1;
      missing.push('retrieved_at_missing');
      continue;
    }
    known += 1;
    if (nowMs - retrieved <= windowMs) fresh += 1;
    else missing.push('retrieved_over_window');
  }
  const dim = dimension('freshness', known, fresh, countBy(missing), [
    `Window: ${FRESHNESS_WINDOW_DAYS} days; unknown capture times are excluded from the denominator.`,
  ]);
  return { ...dim, unknown };
}

function fullyScoped(row) {
  return requiredScopeDimensions(row).every(
    (name) => row[name] !== null && row[name] !== undefined && row[name] !== '',
  );
}

function consistencyDimension(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = identity(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  let duplicated = 0;
  let consistent = 0;
  const missing = [];
  for (const entries of groups.values()) {
    if (entries.length < 2) continue;
    duplicated += 1;
    const values = new Set(entries.map((entry) => String(entry.display_value)));
    if (values.size === 1) {
      consistent += 1;
      continue;
    }
    // A row without its scope/session label cannot be compared with its
    // neighbour: that is a labelling debt (counted under scope), not proof
    // that the same page shows two values.
    if (entries.every(fullyScoped)) missing.push('conflicting_display_value');
    else missing.push('unlabelled_series');
  }
  return dimension('consistency', duplicated, consistent, countBy(missing), [
    'Compares stored display values per fact identity; a duplicate count of 0 is healthy.',
    'Duplicates without a complete scope/session are reported as unlabelled series, not as conflicting values.',
  ]);
}

function coverageDimension(coverage) {
  const missing = countBy([
    ...coverage.gaps.map((gap) => gap.reason),
    ...coverage.gaps
      .filter((gap) => gap.dimensionMismatch)
      .map(() => 'dimension_mismatch'),
  ]);
  const dim = dimension(
    'coverage',
    coverage.expected,
    coverage.satisfied,
    missing,
    [
      `${coverage.notApplicable} contract cells are n/a (optional, post-event, only-when-published, or outside the launch scope).`,
      'A missing fact is labelled as not collected; this audit cannot tell that apart from a source that has not published it yet.',
    ],
  );
  return { ...dim, notApplicable: coverage.notApplicable };
}

function reviewDimension(rows) {
  const missing = [];
  let passed = 0;
  for (const row of rows) {
    if (row.latest_review_decision !== 'approve') {
      missing.push('review_not_approved');
      continue;
    }
    if (!row.latest_review_at) {
      missing.push('review_timestamp_missing');
      continue;
    }
    passed += 1;
  }
  return dimension('review', rows.length, passed, countBy(missing));
}

function calendarDimension(rows) {
  const applicable = rows.filter(
    (row) =>
      isDateFact(row) &&
      ['date', 'datetime'].includes(String(row.value_type ?? '')),
  );
  const missing = [];
  let passed = 0;
  for (const row of applicable) {
    if (row.normalized_value === null || row.normalized_value === undefined) {
      missing.push('normalized_value_missing');
      continue;
    }
    if (validCalendarValue(row.normalized_value)) passed += 1;
    else missing.push('normalized_value_not_date');
  }
  return dimension('calendar', applicable.length, passed, missing, [
    'Date-typed facts must normalise to ISO dates or a known non-date sentinel.',
  ]);
}

function overallScore(dimensions) {
  const scored = dimensions.filter((entry) => entry.score !== null);
  if (!scored.length) return null;
  const total = scored.reduce((sum, entry) => sum + entry.score, 0);
  return Math.round((total / scored.length) * 10) / 10;
}

/**
 * @param {object} input
 * @param {object[]} input.rows approved-fact audit rows
 * @param {object} input.coverage result of evaluateMvpCoverageDetailed()
 * @param {number} [input.knownGapCount]
 * @param {number} [input.newGapCount]
 * @param {boolean} [input.sanitizedCiFixture]
 * @param {number} [input.nowMs]
 */
export function buildDataQualityReport(input) {
  const rows = input.rows ?? [];
  const coverage = input.coverage ?? {
    gaps: [],
    expected: 0,
    satisfied: 0,
    notApplicable: 0,
  };
  const nowMs = input.nowMs ?? Date.now();
  const dimensions = [
    sourceDimension(rows),
    scopeDimension(rows),
    freshnessDimension(rows, nowMs),
    consistencyDimension(rows),
    coverageDimension(coverage),
    reviewDimension(rows),
    calendarDimension(rows),
  ];
  const byKey = Object.fromEntries(
    dimensions.map((entry) => [entry.key, entry]),
  );

  const blocking = [];
  if (byKey.source.missing.length)
    blocking.push({
      dimension: 'source',
      reason: 'approved facts without verified provenance',
      count: byKey.source.denominator - byKey.source.numerator,
    });
  const conflicting = byKey.consistency.missing.find(
    (entry) => entry.reason === 'conflicting_display_value',
  );
  if (conflicting)
    blocking.push({
      dimension: 'consistency',
      reason: 'conflicting display values for one fully-scoped fact identity',
      count: conflicting.count,
    });
  if (byKey.calendar.missing.length)
    blocking.push({
      dimension: 'calendar',
      reason: 'date facts with a non-date normalized value',
      count: byKey.calendar.denominator - byKey.calendar.numerator,
    });
  if ((input.newGapCount ?? 0) > 0)
    blocking.push({
      dimension: 'coverage',
      reason: 'gap keys not present in the accepted baseline',
      count: input.newGapCount,
    });

  const warnings = [];
  if (byKey.scope.denominator - byKey.scope.numerator > 0)
    warnings.push({
      dimension: 'scope',
      reason: 'facts missing an expected level/provider/session label',
      count: byKey.scope.denominator - byKey.scope.numerator,
    });
  if (
    byKey.consistency.missing.some(
      (entry) => entry.reason === 'unlabelled_series',
    )
  )
    warnings.push({
      dimension: 'consistency',
      reason:
        'duplicate values that cannot be separated because the session is unlabelled',
      count: byKey.consistency.missing.find(
        (entry) => entry.reason === 'unlabelled_series',
      ).count,
    });
  if (byKey.freshness.denominator - byKey.freshness.numerator > 0)
    warnings.push({
      dimension: 'freshness',
      reason: `snapshots older than ${FRESHNESS_WINDOW_DAYS} days`,
      count: byKey.freshness.denominator - byKey.freshness.numerator,
    });
  if (byKey.review.denominator - byKey.review.numerator > 0)
    warnings.push({
      dimension: 'review',
      reason: 'facts without an approving review record',
      count: byKey.review.denominator - byKey.review.numerator,
    });
  if ((input.knownGapCount ?? 0) > 0)
    warnings.push({
      dimension: 'coverage',
      reason: 'known gap keys in the accepted baseline',
      count: input.knownGapCount,
    });

  const status = blocking.length
    ? 'blocked'
    : warnings.length
      ? 'warning'
      : 'passed';

  return {
    version: 1,
    status,
    overallScore: overallScore(dimensions),
    scoring: {
      method: 'unweighted mean of dimensions with a denominator',
      factsCountUsed: false,
    },
    flags: { sanitizedCiFixture: Boolean(input.sanitizedCiFixture) },
    dimensions,
    gates: {
      blocking,
      warnings,
      knownDebt:
        (input.knownGapCount ?? 0)
          ? [
              {
                dimension: 'coverage',
                reason: 'accepted baseline gap keys',
                count: input.knownGapCount,
              },
            ]
          : [],
    },
  };
}
