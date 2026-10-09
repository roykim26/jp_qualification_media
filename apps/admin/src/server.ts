import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Pool } from 'pg';
import { uiStyles } from '../../../packages/ui/src/index.js';
import { adminStyles } from './styles.js';

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
    <article class="card review-card" data-id="${escapeHtml(row.id)}">
      <h2>${escapeHtml(row.fact_key)} · ${escapeHtml(row.exam_year)}</h2>
      <p class="review-meta"><span><b>机构：</b>${escapeHtml(row.provider_id || '未指定')}</span><span><b>级别：</b>${escapeHtml(row.exam_level_id || '共通')}</span><span><b>科目：</b>${escapeHtml(row.exam_component || '共通')}</span><span><b>实施方式：</b>${escapeHtml(row.delivery_mode || '未指定')}</span><span><b>支付方式：</b>${escapeHtml(row.payment_method || '未指定')}</span></p>
      <p><b>候选值：</b>${escapeHtml(row.display_value)}</p>
      ${row.evidence_text ? `<blockquote class="review-evidence"><b>官方原文：</b>${escapeHtml(row.evidence_text)}</blockquote>` : ''}
      <p><b>风险：</b>${escapeHtml(row.risk_level)}　<b>状态：</b>${escapeHtml(row.status)}</p>
      <p class="review-source"><b>官方来源：</b><a href="${escapeHtml(row.canonical_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.canonical_url)}</a></p>
      <p><b>快照：</b>${escapeHtml(row.snapshot_hash)}</p>
      <div class="field"><label for="reason-${escapeHtml(row.id)}">人工复核理由</label><textarea id="reason-${escapeHtml(row.id)}" placeholder="例如：已逐项核对官方原文和适用年度" aria-describedby="help-${escapeHtml(row.id)} error-${escapeHtml(row.id)}" required></textarea><p id="help-${escapeHtml(row.id)}" class="field__help">批准、拒绝或延期前必须填写。</p><p id="error-${escapeHtml(row.id)}" class="field__error" aria-live="polite"></p></div>
      <div class="review-actions">
        <button type="button" data-decision="approve">批准候选</button>
        <button type="button" data-decision="reject">拒绝候选</button>
        <button type="button" data-decision="defer">延期审核</button>
      </div>
      <output aria-live="polite" aria-atomic="true"></output>
    </article>`,
    )
    .join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${qualificationTitle}审核队列</title><style>${uiStyles}${adminStyles}</style></head><body><main class="admin-shell"><header class="admin-header"><div><p class="eyebrow">人工审核</p><h1>${qualificationTitle}审核队列</h1><p>高风险事实必须逐项核对官方原文后决定。批准会创建事实修订，不会绕过审核链。</p></div><p class="badge badge--info">待审核：${rows.length} 条</p></header><section class="admin-list" aria-label="待审核事实">
  ${cards || '<div class="feedback feedback--empty"><div><h2>当前没有待审核候选</h2><p>新的候选事实进入人工审核后会显示在这里。</p></div></div>'}</section></main>
  <script>
  const decisionLabels = { approve: '批准候选', reject: '拒绝候选', defer: '延期审核' };
  for (const card of document.querySelectorAll('.review-card')) for (const button of card.querySelectorAll('button')) button.onclick = async () => {
    const textarea = card.querySelector('textarea');
    const error = card.querySelector('.field__error');
    const output = card.querySelector('output');
    const reason = textarea.value.trim();
    error.textContent = '';
    if (!reason) { error.textContent = '请填写审核理由。'; textarea.focus(); return; }
    const decision = button.dataset.decision;
    if (!confirm('将记录为“' + decisionLabels[decision] + '”，是否继续？')) return;
    const reviewer = prompt('审核人 ID');
    if (!reviewer) { output.textContent = '操作已取消。'; return; }
    const buttons = card.querySelectorAll('button');
    for (const item of buttons) item.disabled = true;
    button.dataset.originalLabel = button.textContent;
    button.textContent = '处理中…';
    output.textContent = '正在保存审核结果。';
    try {
      const response = await fetch('/internal/reviews/' + encodeURIComponent(card.dataset.id), { method:'POST', headers:{'content-type':'application/json','x-reviewer-id':reviewer}, body:JSON.stringify({decision, reason}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'request failed');
      output.textContent = '已记录：' + decisionLabels[result.decision];
      card.dataset.completed = 'true';
      setTimeout(() => card.remove(), 500);
    } catch {
      output.textContent = '保存失败。输入内容已保留，请重试。';
      for (const item of buttons) item.disabled = false;
      button.textContent = button.dataset.originalLabel;
    }
  };
  </script></body></html>`;
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
      `SELECT c.id, c.provider_id, c.exam_level_id, c.exam_component, c.delivery_mode, c.payment_method, c.fact_key, c.exam_year, c.display_value, c.evidence_text, c.status, c.risk_level,
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
  if (!['approve', 'reject', 'defer', 'requeue'].includes(decision))
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
    if (decision === 'requeue' && row.status !== 'rejected')
      throw new Error('only rejected candidates can be requeued');
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
           AND delivery_mode IS NOT DISTINCT FROM $5 AND payment_method IS NOT DISTINCT FROM $6
           AND exam_year=$7 AND fact_key=$8 FOR UPDATE`,
        [
          row.qualification_id,
          row.provider_id,
          row.exam_level_id,
          row.exam_component,
          row.delivery_mode,
          row.payment_method,
          row.exam_year,
          row.fact_key,
        ],
      );
      const revisionId = `revision:${id}`;
      await client.query(
        `INSERT INTO fact_revisions (id,candidate_fact_id,status,normalized_value,display_value,valid_from,verified_at,idempotency_key)
        VALUES ($1,$2,'approved',$3::jsonb,$4,now(),now(),$5) ON CONFLICT DO NOTHING`,
        [
          revisionId,
          id,
          JSON.stringify(row.normalized_value),
          row.display_value,
          `approve:${id}`,
        ],
      );
      const factId = previous.rowCount
        ? previous.rows[0].fact_id
        : `fact:${id}`;
      if (previous.rowCount) {
        // Nullable dimensions are compared above with IS NOT DISTINCT FROM.
        // A unique-index upsert cannot reliably use that same null semantics.
        await client.query(
          "UPDATE facts SET current_revision_id=$1,status='approved' WHERE id=$2",
          [revisionId, factId],
        );
      } else {
        await client.query(
          `INSERT INTO facts (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,payment_method,exam_year,fact_key,current_revision_id,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'approved')`,
          [
            factId,
            row.qualification_id,
            row.provider_id,
            row.exam_level_id,
            row.exam_component,
            row.delivery_mode,
            row.payment_method,
            row.exam_year,
            row.fact_key,
            revisionId,
          ],
        );
      }
      await client.query(
        `INSERT INTO change_events
          (id,fact_id,event_type,previous_revision_id,new_revision_id,affected_pages)
         VALUES ($1,$2,$3::event_type,$4,$5,$6::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [
          `change:${id}`,
          factId,
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

async function retractCiCurrentFact(
  rejectedCandidateId: string,
  reason: string,
): Promise<void> {
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for the local review queue');
  if (!reason.trim()) throw new Error('retraction reason required');
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rejected = await client.query(
      'SELECT * FROM candidate_facts WHERE id=$1 FOR UPDATE',
      [rejectedCandidateId],
    );
    if (!rejected.rowCount || rejected.rows[0].status !== 'rejected')
      throw new Error(
        'candidate must be rejected before a current fact can be retracted',
      );
    const row = rejected.rows[0];
    const current = await client.query(
      `SELECT f.id
       FROM facts f
       JOIN fact_revisions fr ON fr.id=f.current_revision_id
       JOIN candidate_facts c ON c.id=fr.candidate_fact_id
       JOIN snapshots s ON s.id=c.source_snapshot_id
       WHERE f.status='approved' AND f.qualification_id=$1
         AND f.provider_id IS NOT DISTINCT FROM $2
         AND f.exam_level_id IS NOT DISTINCT FROM $3
         AND f.exam_component IS NOT DISTINCT FROM $4
         AND f.delivery_mode IS NOT DISTINCT FROM $5
         AND f.payment_method IS NOT DISTINCT FROM $6
         AND f.exam_year=$7 AND f.fact_key=$8
         AND s.object_key LIKE 'ci://%'
       FOR UPDATE`,
      [
        row.qualification_id,
        row.provider_id,
        row.exam_level_id,
        row.exam_component,
        row.delivery_mode,
        row.payment_method,
        row.exam_year,
        row.fact_key,
      ],
    );
    if (current.rowCount !== 1)
      throw new Error('expected exactly one CI-backed current fact to retract');
    const factId = current.rows[0].id as string;
    await client.query("UPDATE facts SET status='superseded' WHERE id=$1", [
      factId,
    ]);
    await client.query(
      `INSERT INTO fact_retractions (id,fact_id,rejected_candidate_id,reviewer_id,reason)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (rejected_candidate_id) DO NOTHING`,
      [
        `retraction:${rejectedCandidateId}`,
        factId,
        rejectedCandidateId,
        reviewerId,
        reason,
      ],
    );
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
    if (
      req.method === 'POST' &&
      req.url?.startsWith('/internal/retractions/')
    ) {
      if (!authorized(req))
        return send(
          res,
          401,
          JSON.stringify({ error: 'reviewer authentication required' }),
          'application/json',
        );
      const id = decodeURIComponent(
        req.url.slice('/internal/retractions/'.length),
      );
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body) as { reason?: string };
      await retractCiCurrentFact(id, input.reason ?? '');
      return send(
        res,
        200,
        JSON.stringify({ id, status: 'superseded' }),
        'application/json',
      );
    }
    return send(res, 404, 'not found', 'text/plain; charset=utf-8');
  } catch (error) {
    return send(
      res,
      400,
      JSON.stringify({
        error: 'request failed',
      }),
      'application/json',
    );
  }
});

server.listen(port, '127.0.0.1', () =>
  console.log(`admin review on http://127.0.0.1:${port}/review/takken`),
);
