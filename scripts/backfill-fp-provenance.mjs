import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import pg from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const apply = process.argv.includes('--apply');

if (!databaseUrl) throw new Error('DATABASE_URL is required');
const databaseHost = new URL(databaseUrl).hostname;
if (!['localhost', '127.0.0.1'].includes(databaseHost)) {
  throw new Error('provenance backfill only permits a localhost database');
}

const captured = [
  {
    sourceId: 'source:fp:jafp-2-3-application-outline-pdf',
    institutionId: 'institution:jafp',
    canonicalUrl:
      'https://www.jafp.or.jp/exam/app/howto/files/outline.pdf?v=202607010900',
    sourceType: 'official_cbt_application_outline',
    file: 'var/official-snapshots/fp/jafp-2-3-application-outline-pdf.pdf',
    capturedAt: '2026-09-22T06:34:59.663144Z',
    captureRunId:
      'capture-run:fp:jafp-2-3-application-outline-pdf:20260922T063459Z',
  },
  {
    sourceId: 'source:fp:kinzai-fp-faq',
    institutionId: 'institution:kinzai',
    canonicalUrl: 'https://www.kinzai.or.jp/ginou/fp/faq',
    sourceType: 'official_faq',
    file: 'var/official-snapshots/fp/kinzai-fp-faq.html',
    capturedAt: '2026-09-22T13:23:59.182453Z',
    captureRunId: 'capture-run:fp:kinzai-fp-faq:20260922T132359Z',
  },
];

const entries = await Promise.all(
  captured.map(async (entry) => {
    const objectKey = resolve(entry.file);
    const body = await readFile(objectKey);
    const contentHash = createHash('sha256').update(body).digest('hex');
    return {
      ...entry,
      objectKey,
      contentHash,
      snapshotId: `snapshot:fp:${contentHash}`,
      sourceCheckId: `source-check:fp:${contentHash}`,
    };
  }),
);

if (!apply) {
  console.log(
    JSON.stringify(
      {
        mode: 'dry-run',
        entries: entries.map(({ body, ...entry }) => entry),
        note: 'Pass --apply to write only provenance metadata.',
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
try {
  await client.query('BEGIN');
  for (const entry of entries) {
    const host = new URL(entry.canonicalUrl).hostname;
    await client.query(
      `INSERT INTO sources (
        id, institution_id, canonical_url, allowed_domain, source_type, active,
        qualification_id, content_scope, update_cycle, parser_adapter, default_risk
      ) VALUES ($1, $2, $3, $4, $5, true, 'qualification:fp',
        'capture_only_evidence', 'manual', 'collector.capture_fp', 'medium')
      ON CONFLICT (id) DO UPDATE SET
        canonical_url = EXCLUDED.canonical_url,
        allowed_domain = EXCLUDED.allowed_domain,
        qualification_id = EXCLUDED.qualification_id,
        content_scope = EXCLUDED.content_scope,
        update_cycle = EXCLUDED.update_cycle,
        parser_adapter = EXCLUDED.parser_adapter,
        default_risk = EXCLUDED.default_risk`,
      [
        entry.sourceId,
        entry.institutionId,
        entry.canonicalUrl,
        host,
        entry.sourceType,
      ],
    );
    await client.query(
      `INSERT INTO capture_runs (
        id, started_at, finished_at, status, request_count, collector_version
      ) VALUES ($1, $2, $2, 'succeeded', 1, 'collector.capture_fp')
      ON CONFLICT (id) DO NOTHING`,
      [entry.captureRunId, entry.capturedAt],
    );
    await client.query(
      `INSERT INTO snapshots (
        id, source_id, content_hash, object_key, synthetic, retrieved_at,
        capture_run_id, original_url, final_url, http_status, retrieved_at_jst,
        collector_version
      ) VALUES ($1, $2, $3, $4, false, $5, $6, $7, $7, 200, $5,
        'collector.capture_fp')
      ON CONFLICT (source_id, content_hash) DO UPDATE SET
        capture_run_id = EXCLUDED.capture_run_id,
        original_url = EXCLUDED.original_url,
        final_url = EXCLUDED.final_url,
        http_status = EXCLUDED.http_status,
        retrieved_at_jst = EXCLUDED.retrieved_at_jst,
        collector_version = EXCLUDED.collector_version`,
      [
        entry.snapshotId,
        entry.sourceId,
        entry.contentHash,
        entry.objectKey,
        entry.capturedAt,
        entry.captureRunId,
        entry.canonicalUrl,
      ],
    );
    await client.query(
      `INSERT INTO source_checks (
        id, source_id, capture_run_id, snapshot_id, checked_at, status,
        http_status, message
      ) VALUES ($1, $2, $3, $4, $5, 'changed', 200,
        'Initial capture-only observation; no candidate, fact, revision, or review was created.')
      ON CONFLICT (id) DO NOTHING`,
      [
        entry.sourceCheckId,
        entry.sourceId,
        entry.captureRunId,
        entry.snapshotId,
        entry.capturedAt,
      ],
    );
  }

  const legacy = await client.query(
    `SELECT s.id, s.source_id
     FROM snapshots s
     JOIN sources src ON src.id = s.source_id
     WHERE src.id LIKE 'source:fp:%'
       AND src.qualification_id IS NULL
       AND s.synthetic = false
       AND s.object_key NOT LIKE 'ci://%'
       AND s.capture_run_id IS NULL`,
  );
  for (const row of legacy.rows) {
    await client.query(
      `UPDATE sources
       SET qualification_id = 'qualification:fp',
           content_scope = COALESCE(content_scope, 'official_evidence'),
           update_cycle = COALESCE(update_cycle, 'unknown'),
           parser_adapter = COALESCE(parser_adapter, 'legacy_capture'),
           default_risk = COALESCE(default_risk, 'medium')
       WHERE id = $1 AND id LIKE 'source:fp:%'`,
      [row.source_id],
    );
    await client.query(
      `INSERT INTO source_checks (id, source_id, snapshot_id, checked_at, status, message)
       VALUES ($1, $2, $3, now(), 'blocked',
         'Legacy local snapshot has no retained capture-run, final-URL, or HTTP-status metadata; no values were inferred.')
       ON CONFLICT (id) DO NOTHING`,
      [`source-check:legacy-metadata:${row.id}`, row.source_id, row.id],
    );
  }
  await client.query('COMMIT');
  console.log(
    JSON.stringify({
      mode: 'applied',
      captured: entries.length,
      legacyBlocked: legacy.rowCount,
    }),
  );
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
