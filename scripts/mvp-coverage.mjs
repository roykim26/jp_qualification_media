import contract from '../config/data-coverage-contract.json' with { type: 'json' };

export const limitedLaunchScopes = {
  bookkeeping: [
    { examLevelId: 'bookkeeping:1', deliveryMode: 'unified' },
    { examLevelId: 'bookkeeping:2', deliveryMode: 'unified' },
    { examLevelId: 'bookkeeping:3', deliveryMode: 'unified' },
    { examLevelId: 'bookkeeping:2', deliveryMode: 'network' },
    { examLevelId: 'bookkeeping:3', deliveryMode: 'network' },
  ],
  fp: [
    ...['fp:2', 'fp:3'].flatMap((examLevelId) =>
      ['academic', 'practical:asset-design'].map((examComponent) => ({
        providerId: 'jafp',
        examLevelId,
        examComponent,
        deliveryMode: 'cbt',
      })),
    ),
    {
      providerId: 'kinzai',
      examLevelId: 'fp:1',
      examComponent: 'academic',
      deliveryMode: 'pbt',
    },
    {
      providerId: 'kinzai',
      examLevelId: 'fp:1',
      examComponent: 'practical:asset-consulting',
      deliveryMode: 'interview',
    },
  ],
};

function expandDimensions(dimensions) {
  return Object.entries(dimensions).reduce(
    (groups, [key, value]) =>
      groups.flatMap((group) =>
        (Array.isArray(value) ? value : [value]).map((item) => ({
          ...group,
          [key]: item,
        })),
      ),
    [{}],
  );
}

function matchesDimensions(fact, dimensions) {
  return Object.entries(dimensions).every(
    ([key, value]) => fact[key] === value,
  );
}

/**
 * True when `fact` sits in the requested scope except that one or more required
 * dimensions are unlabelled (null/undefined) rather than different.
 *
 * The distinction is load-bearing. Ignoring dimensions outright would call a
 * `bookkeeping:1` fact evidence for a `bookkeeping:3` gap, and a
 * `fp academic:basic` fact evidence for an `fp academic` gap — both are real,
 * separately scoped facts, not mislabelled ones. Only a null dimension means
 * "this fact belongs to the requested scope but was never tagged".
 */
function isUnlabelled(fact, dimensions) {
  return Object.entries(dimensions).every(
    ([key, value]) => fact[key] === value || fact[key] == null,
  );
}

function matchesField(fact, field, dimensions) {
  if (field === 'source_url')
    return Boolean(fact.sourceUrl) && fact.provenanceStatus === 'verified';
  if (field === 'official_verified_at')
    return (
      fact.provenanceStatus === 'verified' && Boolean(fact.officialVerifiedAt)
    );
  const component = dimensions.examComponent?.match(/^subject-([ab])$/)?.[1];
  if (
    component &&
    ['exam_time', 'question_count', 'question_format'].includes(field)
  ) {
    const suffix = {
      exam_time: 'time',
      question_count: 'question_count',
      question_format: 'format',
    }[field];
    if (fact.factKey === `exam_subject_${component}_${suffix}`) return true;
  }
  return (
    fact.factKey === field ||
    fact.factKey.startsWith(`${field}_`) ||
    (field === 'exam_date' && fact.factKey === 'exam_dates')
  );
}

export function evaluateMvpCoverage(facts, examYear) {
  const gaps = [];
  for (const qualification of contract.qualifications) {
    const launchScopes = limitedLaunchScopes[qualification.slug];
    // Same qualification and year, dimensions ignored. This is used only to tell
    // a labelling problem from a missing fact: see isUnlabelled() below.
    const sameScope = facts.filter(
      (fact) =>
        fact.qualificationSlug === qualification.slug &&
        fact.examYear === examYear,
    );
    for (const requirement of qualification.requirements) {
      if (
        !['required', 'conditional'].includes(requirement.requiredLevel) ||
        requirement.conditions?.includes('only_when_officially_published')
      )
        continue;
      for (const dimensions of expandDimensions(requirement.dimensions)) {
        if (
          launchScopes &&
          !launchScopes.some((scope) => matchesDimensions(scope, dimensions))
        )
          continue;
        const scoped = facts.filter(
          (fact) =>
            fact.qualificationSlug === qualification.slug &&
            fact.examYear === examYear &&
            matchesDimensions(fact, dimensions),
        );
        for (const field of requirement.fields) {
          if (scoped.some((fact) => matchesField(fact, field, dimensions)))
            continue;
          gaps.push({
            qualificationSlug: qualification.slug,
            examYear,
            dimensions,
            field,
            dimensionMismatch: sameScope.some(
              (fact) =>
                isUnlabelled(fact, dimensions) &&
                matchesField(fact, field, dimensions),
            ),
            reason: ['source_url', 'official_verified_at'].includes(field)
              ? 'missing approved provenance'
              : 'missing approved fact',
          });
        }
      }
    }
  }
  return gaps;
}

/**
 * Decision #6 (audit V2 G-15/T17): the MVP audit runs as a *soft* gate. A gap
 * is identified by slug + field + its dimension set, deliberately excluding
 * examYear so the baseline survives a year rollover.
 */
export function mvpGapKey(gap) {
  const dimensions = Object.entries(gap.dimensions ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${name}=${value}`)
    .join('|');
  return `${gap.qualificationSlug}|${gap.field}${dimensions ? `|${dimensions}` : ''}`;
}

export function splitGapsAgainstBaseline(gaps, baseline) {
  const known = new Set(baseline?.gapKeys ?? []);
  const knownGaps = [];
  const newGaps = [];
  for (const gap of gaps) {
    (known.has(mvpGapKey(gap)) ? knownGaps : newGaps).push(gap);
  }
  return { knownGaps, newGaps };
}
