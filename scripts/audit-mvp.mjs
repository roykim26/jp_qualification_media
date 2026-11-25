import process from 'node:process';
import { readFile, writeFile } from 'node:fs/promises';
import { Client } from 'pg';
import {
  evaluateMvpCoverage,
  limitedLaunchScopes,
  mvpGapKey,
  splitGapsAgainstBaseline,
} from './mvp-coverage.mjs';
import {
  auditProvenanceRow,
  isSanitizedCiFixture,
  summarizeProvenanceAudit,
} from './provenance-audit-lib.mjs';
import { shapeProblems } from './query-shape-lib.mjs';

// Every column the two readers below touch. auditProvenanceRow needs the
// provenance half; the facts map needs the dimension half. A column dropped from
// the SELECT would arrive as `undefined`, which auditProvenanceRow reads as
// "missing" and reports as a provenance issue — turning a query bug into a fake
// data-quality verdict. So the shape is checked before either reader runs.
const auditColumns = [
  // provenance
  'source_id',
  'source_snapshot_id',
  'snapshot_id',
  'snapshot_source_id',
  'snapshot_synthetic',
  'content_hash',
  'object_key',
  'latest_review_decision',
  'latest_review_at',
  'canonical_url',
  'allowed_domain',
  // fact dimensions and identity
  'fact_id',
  'qualification_slug',
  'provider_id',
  'exam_level_id',
  'exam_component',
  'delivery_mode',
  'payment_method',
  'exam_year',
  'fact_key',
];

const args = process.argv.slice(2);
const updateBaseline = args.includes('--update-baseline');
const positional = args.filter((arg) => arg !== '--update-baseline');
const yearArgument = positional.find((arg) => arg.startsWith('--year='));
const examYear = yearArgument
  ? Number(yearArgument.slice('--year='.length))
  : Number(
      new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Tokyo',
        year: 'numeric',
      }).format(new Date()),
    );

if (
  positional.some((arg) => arg !== yearArgument) ||
  positional.length > 1 ||
  !Number.isInteger(examYear) ||
  examYear < 2000 ||
  examYear > 2100
) {
  console.error(
    'Usage: node scripts/audit-mvp.mjs [--year=YYYY] [--update-baseline]',
  );
  process.exit(2);
}
if (!process.env.DATABASE_URL) {
  console.log(
    JSON.stringify({ status: 'not_run', reason: 'DATABASE_URL is required' }),
  );
  process.exit(2);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
});
try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(`
    SELECT f.id AS fact_id, q.slug AS qualification_slug,
      c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode,
      c.payment_method, c.exam_year, c.fact_key,
      c.source_id, c.source_snapshot_id, s.id AS snapshot_id,
      src.canonical_url, src.allowed_domain,
      s.source_id AS snapshot_source_id, s.synthetic AS snapshot_synthetic,
      s.content_hash, s.object_key,
      latest_review.decision AS latest_review_decision,
      latest_review.created_at AS latest_review_at
    FROM facts f
    JOIN fact_revisions fr ON fr.id=f.current_revision_id
    JOIN candidate_facts c ON c.id=fr.candidate_fact_id
    JOIN qualifications q ON q.id=f.qualification_id
    LEFT JOIN snapshots s ON s.id=c.source_snapshot_id
    LEFT JOIN sources src ON src.id=c.source_id
    LEFT JOIN LATERAL (
      SELECT decision, created_at FROM reviews r
      WHERE r.candidate_fact_id=c.id
      ORDER BY r.created_at DESC, r.id DESC LIMIT 1
    ) latest_review ON true
    WHERE f.status='approved' AND fr.status='approved'
      AND c.status='approved' AND c.synthetic=false
    ORDER BY q.slug, c.exam_year, c.fact_key, f.id
  `);
  await client.query('COMMIT');

  const problems = shapeProblems(
    'MVP audit query',
    result,
    auditColumns,
    'provenance column',
  );
  if (problems.length > 0) {
    console.error(
      JSON.stringify({
        status: 'error',
        reason: 'the MVP audit query does not match the shape this audit needs',
        problems,
      }),
    );
    process.exitCode = 2;
  } else {
    const facts = result.rows.map((row) => {
      const verified = auditProvenanceRow(row).issues.length === 0;
      return {
        qualificationSlug: row.qualification_slug,
        providerId: row.provider_id,
        examLevelId: row.exam_level_id,
        examComponent: row.exam_component,
        deliveryMode: row.delivery_mode,
        paymentMethod: row.payment_method,
        examYear: row.exam_year,
        factKey: row.fact_key,
        sourceUrl: row.canonical_url,
        provenanceStatus: verified ? 'verified' : 'incomplete',
        officialVerifiedAt: verified ? row.latest_review_at : undefined,
      };
    });
    const coverageGaps = evaluateMvpCoverage(facts, examYear);
    const provenance = summarizeProvenanceAudit(result.rows);
    // Two different problems hide behind one gap count: a fact that exists but
    // was never tagged with the dimension the contract asks for (fix: tag it),
    // and a fact that does not exist at all (fix: create it). The totals add up
    // to coverageGaps.length so a reader can keep using that number.
    const dimensionMismatchGaps = coverageGaps.filter(
      (gap) => gap.dimensionMismatch,
    ).length;
    const baselineUrl = new URL(
      '../config/mvp-audit-baseline.json',
      import.meta.url,
    );
    if (updateBaseline) {
      // Soft-gate maintenance: snapshot the current gap set as the accepted
      // baseline. Only run this deliberately, after confirming every listed
      // gap is intended rather than a regression.
      await writeFile(
        baselineUrl,
        `${JSON.stringify(
          {
            version: 1,
            note: '既知の MVP カバレッジ欠落（監査 G-15 / 決定#6 のソフトゲート基線）。キーは slug|field|dimensions で examYear を含まない。意図的なデータ変更後に --update-baseline で再生成する。',
            gapKeys: coverageGaps.map(mvpGapKey).sort(),
          },
          null,
          2,
        )}\n`,
      );
      console.log(
        JSON.stringify({
          status: 'baseline_updated',
          examYear,
          gapKeys: coverageGaps.length,
        }),
      );
      process.exitCode = 0;
    } else {
      let baseline = null;
      try {
        baseline = JSON.parse(await readFile(baselineUrl, 'utf8'));
      } catch {
        baseline = null;
      }
      const { knownGaps, newGaps } = splitGapsAgainstBaseline(
        coverageGaps,
        baseline,
      );
      // Decision #6: known gaps downgrade the gate to `warning` (exit 0);
      // anything new, or any provenance failure, still blocks.  The single
      // exception is the sanitized CI fixture: its `ci://` object keys and
      // stripped review rows are artifacts of sanitization, not data
      // quality, so a provenance block there also downgrades to `warning`.
      const sanitizedCiFixture = isSanitizedCiFixture(result.rows);
      const provenanceBlocks =
        provenance.status !== 'passed' && !sanitizedCiFixture;
      const status =
        provenanceBlocks || newGaps.length > 0
          ? 'blocked'
          : knownGaps.length > 0 ||
              (sanitizedCiFixture && provenance.status !== 'passed')
            ? 'warning'
            : 'passed';
      console.log(
        JSON.stringify(
          {
            status,
            checkedAt: new Date().toISOString(),
            examYear,
            limitedLaunchScopes,
            summary: {
              approvedFacts: facts.length,
              coverageGaps: coverageGaps.length,
              knownGaps: knownGaps.length,
              newGaps: newGaps.length,
              dimensionMismatchGaps,
              missingDataGaps: coverageGaps.length - dimensionMismatchGaps,
              unverifiedFacts: provenance.blockedFacts,
              baselineLoaded: baseline !== null,
              sanitizedCiFixture,
            },
            coverageGaps,
            provenance,
          },
          null,
          2,
        ),
      );
      process.exitCode = status === 'blocked' ? 1 : 0;
    }
  }
} catch (error) {
  console.error(
    JSON.stringify({
      status: 'error',
      reason: 'MVP audit could not read the database',
      code: error?.code ?? 'UNKNOWN',
    }),
  );
  process.exitCode = 2;
} finally {
  await client.end();
}
