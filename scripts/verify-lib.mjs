import { spawn } from 'node:child_process';
import process from 'node:process';
import { Client } from 'pg';
import baseline from '../config/release-gate-baseline.json' with { type: 'json' };
import dataCoverageContract from '../config/data-coverage-contract.json' with { type: 'json' };

export const launchGate = baseline.qualifications;
// Work package A freezes this input for the coverage gate introduced in work package C.
// Keep it separate from the legacy count baseline until the gate semantics migrate.
export const coverageGateContract = dataCoverageContract;
export const qualificationWebRoutes = [
  { suffix: '', marker: '概要' },
  { suffix: '2026/', marker: '2026年試験日程' },
  { suffix: 'application/', marker: '申込み・受験資格' },
  { suffix: 'exam-content/', marker: '試験内容' },
  { suffix: 'pass-rate/', marker: '合格率・合格基準' },
];

function matchesCoverageDimensions(fact, dimensions) {
  return Object.entries(dimensions).every(([key, expected]) => {
    const values = Array.isArray(expected) ? expected : [expected];
    return values.includes(fact[key]);
  });
}

function validCanonicalHttpsUrl(url, allowedDomain) {
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

function satisfiesCoverageField(fact, field, provenanceMode) {
  if (field === 'source_url')
    return (
      Boolean(fact.sourceUrl) &&
      (fact.provenanceStatus === 'verified' ||
        (provenanceMode === 'fixture' && fact.provenanceStatus === 'fixture'))
    );
  if (field === 'official_verified_at')
    return (
      Boolean(fact.officialVerifiedAt) ||
      (provenanceMode === 'fixture' && fact.provenanceStatus === 'fixture')
    );
  const factKey = fact.factKey;
  return (
    factKey === field ||
    factKey.startsWith(`${field}_`) ||
    (field === 'exam_date' && factKey === 'exam_dates')
  );
}

/** Returns business coverage gaps; fact counts are intentionally not an input. */
export function evaluateCoverage(
  slug,
  facts,
  examYear,
  { provenanceMode = 'production' } = {},
) {
  const qualification = coverageGateContract.qualifications.find(
    (item) => item.slug === slug,
  );
  if (!qualification)
    return [{ field: '*', dimensions: {}, reason: 'unknown qualification' }];
  const gaps = [];
  for (const requirement of qualification.requirements) {
    if (
      ['post_event', 'optional', 'not_applicable'].includes(
        requirement.requiredLevel,
      )
    )
      continue;
    const scoped = facts.filter(
      (fact) =>
        fact.examYear === examYear &&
        matchesCoverageDimensions(fact, requirement.dimensions),
    );
    if (requirement.requiredLevel === 'conditional' && scoped.length === 0)
      continue;
    for (const field of requirement.fields) {
      if (
        !scoped.some((fact) =>
          satisfiesCoverageField(fact, field, provenanceMode),
        )
      )
        gaps.push({
          field,
          dimensions: requirement.dimensions,
          reason:
            field === 'source_url' || field === 'official_verified_at'
              ? 'missing approved provenance'
              : 'missing approved fact',
        });
    }
  }
  return gaps;
}

export function expectedCoverageStatus(coverageGaps) {
  return coverageGaps.length ? 'partially_announced' : 'verified';
}

export function createRuntime(databaseUrl) {
  const apiPort = Number(process.env.VERIFY_API_PORT ?? 4191);
  const webPort = Number(process.env.VERIFY_WEB_PORT ?? 3091);
  const children = [];
  const start = (args, env) => {
    const child = spawn(process.execPath, args, {
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stdout.on('data', () => {});
    child.stderr.on('data', (chunk) => process.stderr.write(chunk));
  };
  return {
    apiPort,
    webPort,
    start() {
      start(['dist/services/api/src/server.js'], {
        API_PORT: String(apiPort),
        DATABASE_URL: databaseUrl,
      });
      start(['dist/apps/web/src/server.js'], {
        WEB_PORT: String(webPort),
        API_BASE_URL: `http://127.0.0.1:${apiPort}`,
      });
    },
    stop() {
      for (const child of children) child.kill();
    },
  };
}

export async function waitFor(url, attempts = 40) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`service did not become ready: ${url}`);
}

export async function verifyQualification(
  databaseUrl,
  runtime,
  gate,
  { requireNoOfficialPending = false } = {},
) {
  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  await client.connect();
  const result = await client.query(
    `SELECT
      count(1) FILTER (WHERE c.status='pending_review' AND c.synthetic=false)::int AS pending_official,
      count(1) FILTER (WHERE c.status='pending_review' AND c.synthetic=true)::int AS pending_synthetic
     FROM candidate_facts c JOIN qualifications q ON q.id=c.qualification_id WHERE q.slug=$1`,
    [gate.slug],
  );
  const approvedFacts = await client.query(
    `SELECT c.provider_id AS "providerId", c.exam_level_id AS "examLevelId",
      c.exam_component AS "examComponent", c.delivery_mode AS "deliveryMode",
      c.payment_method AS "paymentMethod",
      c.exam_year AS "examYear", c.fact_key AS "factKey",
      c.source_id AS "sourceId",
      src.canonical_url AS "sourceUrl", src.allowed_domain AS "allowedDomain",
      s.source_id AS "snapshotSourceId", s.synthetic AS "snapshotSynthetic",
      s.content_hash AS "contentHash", s.object_key AS "objectKey",
      latest_review.decision AS "latestReviewDecision",
      latest_review.created_at AS "latestReviewAt"
     FROM facts f
     JOIN fact_revisions fr ON fr.id=f.current_revision_id
     JOIN candidate_facts c ON c.id=fr.candidate_fact_id
     JOIN snapshots s ON s.id=c.source_snapshot_id
     JOIN sources src ON src.id=c.source_id
     JOIN qualifications q ON q.id=f.qualification_id
     LEFT JOIN LATERAL (
       SELECT decision, created_at FROM reviews r
       WHERE r.candidate_fact_id=c.id
       ORDER BY r.created_at DESC, r.id DESC LIMIT 1
     ) latest_review ON true
     WHERE q.slug=$1 AND f.status='approved' AND fr.status='approved'
       AND c.status='approved' AND c.synthetic=false`,
    [gate.slug],
  );
  await client.end();
  const withProvenance = approvedFacts.rows.map((fact) => {
    const sourceUrl = validCanonicalHttpsUrl(
      fact.sourceUrl,
      fact.allowedDomain,
    );
    const fixture = String(fact.objectKey ?? '').startsWith('ci://');
    const verified =
      Boolean(sourceUrl) &&
      !fixture &&
      !fact.snapshotSynthetic &&
      fact.snapshotSourceId === fact.sourceId &&
      Boolean(fact.contentHash) &&
      fact.latestReviewDecision === 'approve' &&
      Boolean(fact.latestReviewAt);
    return {
      ...fact,
      sourceUrl,
      provenanceStatus: verified
        ? 'verified'
        : fixture
          ? 'fixture'
          : 'incomplete',
      officialVerifiedAt: verified
        ? new Date(fact.latestReviewAt).toISOString()
        : undefined,
    };
  });
  const database = {
    ...result.rows[0],
    // A fact may have several approved candidate revisions.  The release
    // baseline is a count of current public facts, not of review history.
    approved_official: approvedFacts.rowCount,
  };
  const errors = [];
  if (database.approved_official < gate.expectedFacts)
    errors.push(
      `approved official ${database.approved_official} below regression floor ${gate.expectedFacts}`,
    );
  if (requireNoOfficialPending && database.pending_official !== 0)
    errors.push(`official pending ${database.pending_official} != 0`);
  const coverageYear = withProvenance.reduce(
    (latest, fact) => Math.max(latest, fact.examYear),
    new Date().getFullYear(),
  );
  const coverageGaps = evaluateCoverage(
    gate.slug,
    withProvenance,
    coverageYear,
    {
      provenanceMode:
        withProvenance.length > 0 &&
        withProvenance.every((fact) => fact.provenanceStatus === 'fixture')
          ? 'fixture'
          : 'production',
    },
  );
  for (const gap of coverageGaps)
    errors.push(
      `coverage gap field=${gap.field} year=${coverageYear} dimensions=${JSON.stringify(gap.dimensions)}`,
    );
  const expectedStatus = expectedCoverageStatus(coverageGaps);

  const apiResponse = await waitFor(
    `http://127.0.0.1:${runtime.apiPort}/api/v1/qualifications/${gate.slug}`,
  );
  const api = await apiResponse.json();
  if (
    api.status !== expectedStatus ||
    api.facts?.length < gate.expectedFacts ||
    api.facts.some((fact) => fact.status !== 'approved' || fact.synthetic)
  )
    errors.push(
      `API status=${api.status} expected=${expectedStatus}, facts=${api.facts?.length}, regression floor=${gate.expectedFacts}`,
    );
  const webPages = [];
  for (const route of qualificationWebRoutes) {
    const webResponse = await waitFor(
      `http://127.0.0.1:${runtime.webPort}/shikaku/${gate.slug}/${route.suffix}`,
    );
    const html = await webResponse.text();
    const statusLabel =
      expectedStatus === 'verified' ? '公式確認済み' : '一部発表済み';
    if (!html.includes(statusLabel))
      errors.push(
        `Web ${route.suffix || 'overview'} status ${statusLabel} missing`,
      );
    if (!html.includes(gate.pageContains))
      errors.push(
        `Web ${route.suffix || 'overview'} missing ${gate.pageContains}`,
      );
    if (route.suffix && !html.includes(route.marker))
      errors.push(`Web ${route.suffix} missing ${route.marker}`);
    webPages.push({
      path: `/shikaku/${gate.slug}/${route.suffix}`,
      status: webResponse.status,
    });
  }
  return {
    slug: gate.slug,
    passed: errors.length === 0,
    database: { ...database, coverageYear, coverageGaps },
    api: { status: api.status, expectedStatus, facts: api.facts?.length },
    web: { status: expectedStatus, pages: webPages },
    errors,
  };
}
