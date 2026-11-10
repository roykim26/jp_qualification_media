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
