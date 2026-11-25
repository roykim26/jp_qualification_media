// Shape assertions for the scripts that run hand-written SQL against the
// database.
//
// Why this module exists: three scripts (verify-staleness-query, check-staleness,
// audit-mvp) each own a query string and then read the rows it returns by column
// name. Postgres never complains about a column the caller expected and the query
// did not select — the property is simply `undefined`. Every downstream check
// then reads that as "no dimension here" or "nothing to compare", so a dropped
// column fails *silently*. The tests cannot catch it either: they hand the
// library plain objects, so the SQL never executes.
//
// These helpers are the loud version. Each script declares the columns it needs,
// and the shape is checked against what the driver actually returned.

/**
 * Names of the columns that `fields` (pg's `result.fields`) does not include.
 * Order follows `columns` so the message stays stable between runs.
 */
export function missingColumns(fields, columns) {
  const returned = new Set((fields ?? []).map((field) => field.name));
  return columns.filter((column) => !returned.has(column));
}

/**
 * How many rows are missing at least one of `columns` as a key.
 *
 * Uses `in` rather than a truthiness test on purpose: a LEFT JOIN legitimately
 * yields `null`, and null is present. Only an absent key means the SELECT forgot
 * the column.
 */
export function countRowsMissingKeys(rows, columns) {
  return (rows ?? []).filter((row) =>
    columns.some((column) => !(column in row)),
  ).length;
}

/**
 * The two column assertions as a list of human-readable problems, empty when the
 * result matches the declared shape.
 *
 * `keyNoun` lets each caller keep its own vocabulary ("dimension key" for the
 * staleness query, "provenance column" for the MVP audit) without duplicating
 * the logic.
 */
export function shapeProblems(queryName, result, columns, keyNoun = 'column') {
  const problems = [];
  const missing = missingColumns(result.fields, columns);
  if (missing.length > 0) {
    problems.push(`${queryName} does not return: ${missing.join(', ')}`);
  }
  const rowsMissingKeys = countRowsMissingKeys(result.rows, columns);
  if (rowsMissingKeys > 0) {
    problems.push(`${rowsMissingKeys} row(s) lack a ${keyNoun}`);
  }
  return problems;
}

/**
 * Targets that more than one entry maps to, or null when every target is
 * distinct.
 *
 * This is the regression that DUE_FACT_DIMENSIONS fixed: twelve actions whose
 * targets collapsed to four identical strings. Comparing rendered targets rather
 * than row identities is deliberate — the duplicate only becomes visible after
 * formatting.
 */
export function duplicatedTargets(targets) {
  const distinct = new Set(targets);
  if (distinct.size === targets.length) return null;
  const seen = new Set();
  const repeated = [];
  for (const target of targets) {
    if (seen.has(target)) repeated.push(target);
    else seen.add(target);
  }
  return {
    extra: targets.length - distinct.size,
    repeated: [...new Set(repeated)],
  };
}
