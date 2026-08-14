import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Pool } from 'pg';

const port = Number(process.env.ADMIN_PORT ?? 3001);
const reviewerId = process.env.ADMIN_REVIEWER_ID;
const databaseUrl = process.env.DATABASE_URL;

function send(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/html; charset=utf-8',
) {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

function authorized(req: IncomingMessage): boolean {
  const queryReviewer = req.url
    ? new URL(req.url, 'http://127.0.0.1').searchParams.get('reviewer')
    : null;
  return Boolean(
    reviewerId &&
    (req.headers['x-reviewer-id'] === reviewerId ||
      queryReviewer === reviewerId),
  );
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function page(
  rows: Array<Record<string, unknown>>,
  qualificationTitle: string,
): string {
  const cards = rows
    .map(
      (row) => `
    <article class="card" data-id="${escapeHtml(row.id)}">
      <h2>${escapeHtml(row.fact_key)} · ${escapeHtml(row.exam_year)}</h2>
      <p><b>机构：</b>${escapeHtml(row.provider_id || '未指定')}　<b>级别：</b>${escapeHtml(row.exam_level_id || '共通')}　<b>科目：</b>${escapeHtml(row.exam_component || '共通')}　<b>实施方式：</b>${escapeHtml(row.delivery_mode || '未指定')}</p>
      <p><b>候选值：</b>${escapeHtml(row.display_value)}</p>
      ${row.evidence_text ? `<blockquote><b>官方原文：</b>${escapeHtml(row.evidence_text)}</blockquote>` : ''}
      <p><b>风险：</b>${escapeHtml(row.risk_level)}　<b>状态：</b>${escapeHtml(row.status)}</p>
      <p><b>官方来源：</b><a href="${escapeHtml(row.canonical_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.canonical_url)}</a></p>
      <p><b>快照：</b>${escapeHtml(row.snapshot_hash)}</p>
      <textarea placeholder="必须填写人工复核理由" aria-label="review reason"></textarea>
      <div class="actions">
        <button data-decision="approve">批准</button>
        <button data-decision="reject">拒绝</button>
        <button data-decision="defer">延期</button>
      </div>
      <output></output>
    </article>`,
    )
    .join('');
  return `<!doctype html><meta charset="utf-8"><title>${qualificationTitle}审核队列</title>
  <style>body{font:16px system-ui;max-width:1000px;margin:2rem auto;padding:0 1rem;background:#f6f7f9}.card{background:white;border:1px solid #ddd;border-radius:8px;padding:1rem;margin:1rem 0}.actions{display:flex;gap:.5rem;margin-top:.7rem}button{padding:.5rem .9rem;cursor:pointer}textarea{width:100%;min-height:4rem;margin-top:.5rem}output{display:block;margin-top:.7rem}</style>
  <h1>${qualificationTitle}人工审核队列</h1><p>高风险事实必须逐项核对官方原文后决定。批准会创建事实修订，不会绕过审核链。</p>
  <p>待审核：${rows.length} 条</p>${cards || '<p>当前没有待审核候选。</p>'}
  <script>
  for (const card of document.querySelectorAll('.card')) for (const button of card.querySelectorAll('button')) button.onclick = async () => {
    const reason = card.querySelector('textarea').value.trim();
    if (!reason) return alert('请填写审核理由');
    const response = await fetch('/internal/reviews/' + card.dataset.id, { method:'POST', headers:{'content-type':'application/json','x-reviewer-id':prompt('审核人 ID') || ''}, body:JSON.stringify({decision:button.dataset.decision, reason}) });
    const result = await response.json(); card.querySelector('output').textContent = response.ok ? '已记录：' + result.decision : '失败：' + (result.error || 'unknown'); if(response.ok) card.remove();
  };
  </script>`;
}

async function listCandidates(
  qualificationId: string,
): Promise<Array<Record<string, unknown>>> {
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for the local review queue');
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  try {
    const result = await pool.query(
      `SELECT c.id, c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode, c.fact_key, c.exam_year, c.display_value, c.evidence_text, c.status, c.risk_level,
      s.content_hash AS snapshot_hash, src.canonical_url
      FROM candidate_facts c JOIN snapshots s ON s.id=c.source_snapshot_id JOIN sources src ON src.id=c.source_id
      WHERE c.qualification_id=$1 AND c.status='pending_review' ORDER BY c.created_at, c.fact_key`,
      [qualificationId],
    );
    return result.rows;
  } finally {
    await pool.end();
  }
}

async function reviewCandidate(
  id: string,
  decision: string,
  reason: string,
): Promise<void> {
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for the local review queue');
  if (!['approve', 'reject', 'defer'].includes(decision))
    throw new Error('invalid decision');
  if (!reason.trim()) throw new Error('review reason required');
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const candidate = await client.query(
      'SELECT * FROM candidate_facts WHERE id=$1 FOR UPDATE',
      [id],
    );
    if (!candidate.rowCount) throw new Error('candidate not found');
    const row = candidate.rows[0];
    const status =
      decision === 'approve'
        ? 'approved'
        : decision === 'reject'
          ? 'rejected'
          : 'pending_review';
    await client.query(
      'INSERT INTO reviews (id,candidate_fact_id,decision,reviewer_id,reason) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING',
      [`review:${id}:${decision}`, id, decision, reviewerId, reason],
    );
    await client.query('UPDATE candidate_facts SET status=$1 WHERE id=$2', [
      status,
      id,
    ]);
    if (decision === 'approve') {
      const previous = await client.query(
        `SELECT id AS fact_id, current_revision_id FROM facts
         WHERE qualification_id=$1 AND provider_id IS NOT DISTINCT FROM $2
           AND exam_level_id IS NOT DISTINCT FROM $3 AND exam_component IS NOT DISTINCT FROM $4
           AND delivery_mode IS NOT DISTINCT FROM $5 AND exam_year=$6 AND fact_key=$7 FOR UPDATE`,
        [
          row.qualification_id,
          row.provider_id,
          row.exam_level_id,
          row.exam_component,
          row.delivery_mode,
          row.exam_year,
          row.fact_key,
        ],
      );
      const revisionId = `revision:${id}`;
      await client.query(
        `INSERT INTO fact_revisions (id,candidate_fact_id,status,normalized_value,display_value,valid_from,verified_at,idempotency_key)
        VALUES ($1,$2,'approved',$3::jsonb,$4,now(),now(),$5) ON CONFLICT (idempotency_key) DO NOTHING`,
        [
          revisionId,
          id,
          JSON.stringify(row.normalized_value),
          row.display_value,
          `approve:${id}`,
        ],
      );
      await client.query(
        `INSERT INTO facts (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,exam_year,fact_key,current_revision_id,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'approved') ON CONFLICT (qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,exam_year,fact_key)
        DO UPDATE SET current_revision_id=EXCLUDED.current_revision_id,status='approved'`,
        [
          previous.rowCount ? previous.rows[0].fact_id : `fact:${id}`,
          row.qualification_id,
          row.provider_id,
          row.exam_level_id,
          row.exam_component,
          row.delivery_mode,
          row.exam_year,
          row.fact_key,
          revisionId,
        ],
      );
      await client.query(
        `INSERT INTO change_events
          (id,fact_id,event_type,previous_revision_id,new_revision_id,affected_pages)
         VALUES ($1,$2,$3::event_type,$4,$5,$6::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          `change:${id}`,
          previous.rowCount ? previous.rows[0].fact_id : `fact:${id}`,
          eventTypeForFact(row.fact_key),
          previous.rowCount ? previous.rows[0].current_revision_id : null,
          revisionId,
          JSON.stringify([row.qualification_id]),
        ],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function eventTypeForFact(factKey: string): string {
  if (factKey.includes('deadline')) return 'application_deadline';
  if (factKey.includes('application_open')) return 'application_open';
  if (factKey === 'exam_date') return 'exam_date';
  if (factKey === 'result_date') return 'result_date';
  return 'schedule_change';
}

const server = createServer(async (req, res) => {
  try {
    const reviewRoutes: Record<
      string,
      { qualificationId: string; title: string }
    > = {
      '/review/takken': {
        qualificationId: 'qualification:takken',
        title: '宅建',
      },
      '/review/it-passport': {
        qualificationId: 'qualification:it-passport',
        title: 'IT Passport',
      },
      '/review/gyoseishoshi': {
        qualificationId: 'qualification:gyoseishoshi',
        title: '行政書士',
      },
      '/review/fundamental-it-engineer': {
        qualificationId: 'qualification:fundamental-it-engineer',
        title: '基本情報技術者',
      },
      '/review/bookkeeping': {
        qualificationId: 'qualification:bookkeeping',
        title: '日商簿記',
      },
      '/review/fp': {
        qualificationId: 'qualification:fp',
        title: 'FP技能検定',
      },
    };
    const route = req.url ? reviewRoutes[req.url.split('?')[0]] : undefined;
    if (req.method === 'GET' && route) {
      if (!authorized(req))
        return send(
          res,
          401,
          'reviewer authentication required',
          'text/plain; charset=utf-8',
        );
      return send(
        res,
        200,
        page(await listCandidates(route.qualificationId), route.title),
      );
    }
    if (req.method === 'POST' && req.url?.startsWith('/internal/reviews/')) {
      if (!authorized(req))
        return send(
          res,
          401,
          JSON.stringify({ error: 'reviewer authentication required' }),
          'application/json',
        );
      const id = decodeURIComponent(req.url.slice('/internal/reviews/'.length));
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body) as { decision?: string; reason?: string };
      await reviewCandidate(id, input.decision ?? '', input.reason ?? '');
      return send(
        res,
        200,
        JSON.stringify({ id, decision: input.decision }),
        'application/json',
      );
    }
    return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  } catch (error) {
    return send(
      res,
      400,
      JSON.stringify({
        error: error instanceof Error ? error.message : 'request failed',
      }),
      'application/json',
    );
  }
});

server.listen(port, '127.0.0.1', () =>
  console.log(`admin review on http://127.0.0.1:${port}/review/takken`),
);
