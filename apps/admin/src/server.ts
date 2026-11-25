import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http';
import { Pool } from 'pg';
import { updateEventTypeForFact } from '../../../packages/schema/src/updates.js';
import {
  escapeHtml as escapeHtmlText,
  uiStyles,
} from '../../../packages/ui/src/index.js';
import { parseAuthUsers, verifyBasic } from './auth.js';
import { adminStyles } from './styles.js';

const port = Number(process.env.ADMIN_PORT ?? 3001);
const host = process.env.ADMIN_HOST ?? '127.0.0.1';
// Prefix under which the deployment exposes this app (e.g. "/admin"). Requests
// arrive with the prefix stripped, but the HTML it renders must keep it so the
// browser's fetch() calls come back through the same edge route.
const basePath = (process.env.ADMIN_BASE_PATH ?? '').replace(/\/+$/, '');
const reviewerId = process.env.ADMIN_REVIEWER_ID;
const databaseUrl = process.env.DATABASE_URL;
const authUsers = parseAuthUsers(process.env.ADMIN_AUTH_USERS);
const basicAuthEnabled = authUsers.size > 0;

if (!basicAuthEnabled && process.env.NODE_ENV === 'production') {
  throw new Error(
    'ADMIN_AUTH_USERS must be set in production; refusing to start without authentication',
  );
}

function send(
  res: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/html; charset=utf-8',
) {
  res.writeHead(status, { 'content-type': contentType });
  res.end(body);
}

/**
 * Resolve the acting reviewer, or null when the request is not authenticated.
 *
 * Production uses HTTP Basic (`ADMIN_AUTH_USERS`): the browser prompts once and
 * re-sends the credentials on every same-origin request, so the identity written
 * to reviews / retractions / verified_by is the account that actually signed in.
 * The `x-reviewer-id` header and `?reviewer=` query exist only for local use
 * where ADMIN_AUTH_USERS is unset; the startup check rejects that mode in
 * production.
 */
function authenticate(req: IncomingMessage): string | null {
  if (basicAuthEnabled)
    return verifyBasic(req.headers.authorization, authUsers);
  if (!reviewerId) return null;
  const queryReviewer = req.url
    ? new URL(req.url, 'http://127.0.0.1').searchParams.get('reviewer')
    : null;
  return req.headers['x-reviewer-id'] === reviewerId ||
    queryReviewer === reviewerId
    ? reviewerId
    : null;
}

function unauthorized(res: ServerResponse, json: boolean) {
  return json
    ? send(
        res,
        401,
        JSON.stringify({ error: 'reviewer authentication required' }),
        'application/json',
      )
    : send(
        res,
        401,
        'reviewer authentication required',
        'text/plain; charset=utf-8',
      );
}

function escapeHtml(value: unknown): string {
  return escapeHtmlText(String(value ?? ''));
}

/** Embed a value inside an inline <script> without letting it close the tag. */
function jsLiteral(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

/**
 * Client-side auth plumbing shared by both queue pages. In Basic mode the
 * browser already holds the credentials, so the script never asks for an id and
 * never sends `x-reviewer-id`; the server decides the actor. The legacy mode is
 * the local-only header/query path.
 */
function authScript(): string {
  return `const basePath = ${jsLiteral(basePath)};
  const basicAuth = ${basicAuthEnabled ? 'true' : 'false'};
  function authHeaders() {
    const headers = { 'content-type': 'application/json' };
    if (basicAuth) return headers;
    const reviewer = prompt('审核人 ID');
    if (!reviewer) return null;
    headers['x-reviewer-id'] = reviewer;
    return headers;
  }`;
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
  ${authScript()}
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
    const headers = authHeaders();
    if (!headers) { output.textContent = '操作已取消。'; return; }
    const buttons = card.querySelectorAll('button');
    for (const item of buttons) item.disabled = true;
    button.dataset.originalLabel = button.textContent;
    button.textContent = '处理中…';
    output.textContent = '正在保存审核结果。';
    try {
      const response = await fetch(basePath + '/internal/reviews/' + encodeURIComponent(card.dataset.id), { method:'POST', headers, body:JSON.stringify({decision, reason}) });
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
  reviewer: string,
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
      [`review:${id}:${decision}`, id, decision, reviewer, reason],
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
           AND exam_session IS NOT DISTINCT FROM $7
           AND exam_year=$8 AND fact_key=$9 FOR UPDATE`,
        [
          row.qualification_id,
          row.provider_id,
          row.exam_level_id,
          row.exam_component,
          row.delivery_mode,
          row.payment_method,
          row.exam_session,
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
          `INSERT INTO facts (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,payment_method,exam_session,exam_year,fact_key,current_revision_id,status)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'approved')`,
          [
            factId,
            row.qualification_id,
            row.provider_id,
            row.exam_level_id,
            row.exam_component,
            row.delivery_mode,
            row.payment_method,
            row.exam_session,
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
          updateEventTypeForFact(row.fact_key),
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

// Mirrors scripts/staleness-lib.mjs.  The admin process does not import that
// file (it is an .mjs outside the app's TS project), so the window table is
// duplicated here and a unit test keeps the two in sync via the staleness lib's
// own tests.
const windowsDays = { fee: 90, eligibility: 180, annual: 365 } as const;
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

function factWindowDays(factKey: string): number {
  if (feeFactKeys.has(factKey) || factKey.startsWith('fee_'))
    return windowsDays.fee;
  if (eligibilityFactKeys.has(factKey) || factKey.startsWith('eligibility_'))
    return windowsDays.eligibility;
  // Statistics and annual facts both use the 365-day window in staleness-lib.
  return windowsDays.annual;
}

function ageInDays(timestamp: unknown): number | null {
  const time = new Date(String(timestamp ?? '')).getTime();
  if (!Number.isFinite(time)) return null;
  return Math.floor((Date.now() - time) / 86_400_000);
}

function jstYear(): number {
  return Number(
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
    }).format(new Date()),
  );
}

function jstDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function listDueFacts(
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
      `SELECT f.id AS fact_id, f.exam_year, f.fact_key, f.provider_id, f.exam_level_id,
        f.exam_component, f.delivery_mode, f.payment_method, f.exam_session,
        fr.display_value, fr.verified_at, fr.verified_by,
        s.content_hash AS snapshot_hash, src.canonical_url
       FROM facts f
       JOIN fact_revisions fr ON fr.id=f.current_revision_id
       JOIN candidate_facts c ON c.id=fr.candidate_fact_id
       JOIN snapshots s ON s.id=c.source_snapshot_id
       JOIN sources src ON src.id=c.source_id
       WHERE f.status='approved' AND fr.status='approved' AND c.status='approved'
         AND c.synthetic=false AND f.qualification_id=$1
       ORDER BY f.fact_key, f.exam_level_id`,
      [qualificationId],
    );
    const year = jstYear();
    return result.rows.filter((row) => {
      if (Number(row.exam_year) < year) return false;
      const age = ageInDays(row.verified_at);
      return age !== null && age > factWindowDays(String(row.fact_key));
    });
  } finally {
    await pool.end();
  }
}

function duePage(
  rows: Array<Record<string, unknown>>,
  qualificationTitle: string,
): string {
  const cards = rows
    .map(
      (row) => `
    <article class="card review-card" data-id="${escapeHtml(row.fact_id)}">
      <h2>${escapeHtml(row.fact_key)} · ${escapeHtml(row.exam_year)}</h2>
      <p class="review-meta"><span><b>级别：</b>${escapeHtml(row.exam_level_id || '共通')}</span><span><b>实施方式：</b>${escapeHtml(row.delivery_mode || '未指定')}</span><span><b>支付方式：</b>${escapeHtml(row.payment_method || '未指定')}</span><span><b>确认于：</b>${escapeHtml(row.verified_at)}</span></p>
      <p><b>已批准值：</b>${escapeHtml(row.display_value)}</p>
      <p class="review-source"><b>官方来源：</b><a href="${escapeHtml(row.canonical_url)}" target="_blank" rel="noreferrer">${escapeHtml(row.canonical_url)}</a></p>
      <div class="field"><label for="reason-${escapeHtml(row.fact_id)}">复核理由</label><textarea id="reason-${escapeHtml(row.fact_id)}" placeholder="例如：今日官网原文与批准值逐字一致，仅确认无变化" aria-describedby="help-${escapeHtml(row.fact_id)}" required></textarea><p id="help-${escapeHtml(row.fact_id)}" class="field__help">确认无变化会追加一条同值修订并记录复核人，不改变公开值。</p><p class="field__error" aria-live="polite"></p></div>
      <div class="review-actions">
        <button type="button" data-decision="reverify">确认无变化</button>
      </div>
      <output aria-live="polite" aria-atomic="true"></output>
    </article>`,
    )
    .join('');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${qualificationTitle}到期复核</title><style>${uiStyles}${adminStyles}</style></head><body><main class="admin-shell"><header class="admin-header"><div><p class="eyebrow">到期事实复核</p><h1>${qualificationTitle}待复核事实</h1><p>这些事实超过复核窗口但内容未变。确认无变化会追加一条同值修订（verified_at=now），公开值不变。</p></div><p class="badge badge--info">待复核：${rows.length} 条</p></header><section class="admin-list" aria-label="待复核事实">
   ${cards || '<div class="feedback feedback--empty"><div><h2>当前没有到期事实</h2><p>所有已批准事实都在复核窗口内。</p></div></div>'}</section></main>
  <script>
  ${authScript()}
  for (const card of document.querySelectorAll('.review-card')) for (const button of card.querySelectorAll('button')) button.onclick = async () => {
    const textarea = card.querySelector('textarea');
    const error = card.querySelector('.field__error');
    const output = card.querySelector('output');
    const reason = textarea.value.trim();
    error.textContent = '';
    if (!reason) { error.textContent = '请填写复核理由。'; textarea.focus(); return; }
    if (!confirm('将记录「确认无变化」，是否继续？')) return;
    const headers = authHeaders();
    if (!headers) { output.textContent = '操作已取消。'; return; }
    const buttons = card.querySelectorAll('button');
    for (const item of buttons) item.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = '处理中…';
    output.textContent = '正在记录复核结果。';
    try {
      const response = await fetch(basePath + '/internal/reverifications/' + encodeURIComponent(card.dataset.id), { method:'POST', headers, body:JSON.stringify({reason}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'request failed');
      output.textContent = '已记录：确认无变化';
      setTimeout(() => card.remove(), 500);
    } catch {
      output.textContent = '保存失败。输入内容已保留，请重试。';
      for (const item of buttons) item.disabled = false;
      button.textContent = originalLabel;
    }
  };
  </script></body></html>`;
}

/**
 * Append a same-value revision for a due fact.  The revision reuses the current
 * candidate so provenance (source, snapshot, evidence, approve review) stays
 * intact; only verified_at / verified_by / verification_note change.  A unique
 * idempotency key per fact per JST day makes double-clicks harmless.
 */
async function reverifyFact(
  factId: string,
  reason: string,
  reviewer: string,
): Promise<string> {
  if (!databaseUrl)
    throw new Error('DATABASE_URL is required for the local review queue');
  if (!reason.trim()) throw new Error('verification reason required');
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5000,
  });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const current = await client.query(
      `SELECT f.id, f.exam_year, f.fact_key, f.current_revision_id,
              fr.candidate_fact_id, fr.normalized_value, fr.display_value, fr.verified_at
       FROM facts f JOIN fact_revisions fr ON fr.id=f.current_revision_id
       WHERE f.id=$1 AND f.status='approved' FOR UPDATE`,
      [factId],
    );
    if (!current.rowCount) throw new Error('approved fact not found');
    const row = current.rows[0];
    const date = jstDate();
    const revisionId = `revision:reverify:${factId}:${date}`;
    const idempotencyKey = `reverify:${factId}:${date}`;
    // A second click (or a retry after a timeout) must not turn into an error:
    // if today's re-verification is already the current revision, return it.
    const existing = await client.query(
      'SELECT id FROM fact_revisions WHERE idempotency_key=$1',
      [idempotencyKey],
    );
    if (existing.rowCount && existing.rows[0].id === row.current_revision_id) {
      await client.query('COMMIT');
      return existing.rows[0].id as string;
    }
    const age = ageInDays(row.verified_at);
    if (age === null || age <= factWindowDays(String(row.fact_key)))
      throw new Error('fact is still inside its verification window');
    const inserted = await client.query(
      `INSERT INTO fact_revisions
        (id,candidate_fact_id,status,normalized_value,display_value,valid_from,verified_at,idempotency_key,verified_by,verification_note)
       VALUES ($1,$2,'approved',$3::jsonb,$4,now(),now(),$5,$6,$7)
       ON CONFLICT (idempotency_key) DO NOTHING`,
      [
        revisionId,
        row.candidate_fact_id,
        JSON.stringify(row.normalized_value),
        row.display_value,
        idempotencyKey,
        reviewer,
        reason,
      ],
    );
    let effectiveId = revisionId;
    if (!inserted.rowCount) {
      const raced = await client.query(
        'SELECT id FROM fact_revisions WHERE idempotency_key=$1',
        [idempotencyKey],
      );
      effectiveId = raced.rows[0].id as string;
    }
    await client.query(
      'UPDATE facts SET current_revision_id=$1,status=$2 WHERE id=$3',
      [effectiveId, 'approved', factId],
    );
    await client.query('COMMIT');
    return effectiveId;
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
  reviewer: string,
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
        reviewer,
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
    const reverifyRoutes = Object.fromEntries(
      Object.entries(reviewRoutes).map(([path, route]) => [
        path.replace('/review/', '/reverify/'),
        route,
      ]),
    );
    const reverifyRoute = req.url
      ? reverifyRoutes[req.url.split('?')[0]]
      : undefined;
    if (req.method === 'GET' && reverifyRoute) {
      if (!authenticate(req)) return unauthorized(res, false);
      return send(
        res,
        200,
        duePage(
          await listDueFacts(reverifyRoute.qualificationId),
          reverifyRoute.title,
        ),
      );
    }
    const route = req.url ? reviewRoutes[req.url.split('?')[0]] : undefined;
    if (req.method === 'GET' && route) {
      if (!authenticate(req)) return unauthorized(res, false);
      return send(
        res,
        200,
        page(await listCandidates(route.qualificationId), route.title),
      );
    }
    if (req.method === 'POST' && req.url?.startsWith('/internal/reviews/')) {
      const reviewer = authenticate(req);
      if (!reviewer) return unauthorized(res, true);
      const id = decodeURIComponent(req.url.slice('/internal/reviews/'.length));
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body) as { decision?: string; reason?: string };
      await reviewCandidate(
        id,
        input.decision ?? '',
        input.reason ?? '',
        reviewer,
      );
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
      const reviewer = authenticate(req);
      if (!reviewer) return unauthorized(res, true);
      const id = decodeURIComponent(
        req.url.slice('/internal/retractions/'.length),
      );
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body) as { reason?: string };
      await retractCiCurrentFact(id, input.reason ?? '', reviewer);
      return send(
        res,
        200,
        JSON.stringify({ id, status: 'superseded' }),
        'application/json',
      );
    }
    if (
      req.method === 'POST' &&
      req.url?.startsWith('/internal/reverifications/')
    ) {
      const reviewer = authenticate(req);
      if (!reviewer) return unauthorized(res, true);
      const id = decodeURIComponent(
        req.url.slice('/internal/reverifications/'.length),
      );
      let body = '';
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body) as { reason?: string };
      const revisionId = await reverifyFact(id, input.reason ?? '', reviewer);
      return send(
        res,
        200,
        JSON.stringify({ id, status: 'reverified', revisionId }),
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

server.listen(port, host, () =>
  console.log(
    `admin review on http://${host}:${port}${basePath}/review/takken`,
  ),
);
