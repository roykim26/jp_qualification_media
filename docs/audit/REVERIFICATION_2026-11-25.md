# 到期事实复核落账与来源新鲜度口径修复（2026-11-25）

承接 `docs/audit/DUE_FACTS_RECHECK_2026-11-25.md` 的两处设计缺口，以及「class3-exam 单独入库」的决定。

## 1. 缺口一：值未变的复核无法落账

`fact_revisions.verified_at` 只在「批准新候选」时写入；候选值与已批准值相同时 `approved_value_keys()` 会跳过，产不出候选，于是复核过的事实永远到期。唯一绕法是伪造候选，但：

- synthetic 候选会被公开 API / 门禁 / 统计过滤（`services/api/src/public-facts.ts`、`scripts/verify-lib.mjs`），事实会从公开面消失；
- 写非 approve 的 review 会破坏 provenance 审计（`docs/data-gate-semantics.md:48` 要求最新一条 review 是 approve）。

**做法**：追加一条**复用当前 candidate** 的同值 revision。

| 项          | 值                                                                                                                               |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 迁移        | `packages/db/migrations/0031_fact_reverification.sql`（`verified_by`、`verification_note`）                                      |
| 入口        | `GET /reverify/<slug>?reviewer=`、`POST /internal/reverifications/<factId>`                                                      |
| 新 revision | `id=revision:reverify:<factId>:<JST 日期>`，`candidate_fact_id` 不变，`normalized_value`/`display_value` 原样，`verified_at=now` |
| 幂等        | `idempotency_key=reverify:<factId>:<JST 日期>`；同日重复提交且已是当前 revision 时返回 200                                       |
| 不写        | `change_events`（内容没变）、`reviews`（不产生新审核决策）、`candidate_facts` 的 status                                          |
| 校验        | 只对 `ageDays > 窗口` 的事实生效，否则 400；`facts.current_revision_id` 指到新 revision                                          |

窗口与 `scripts/staleness-lib.mjs` 一致（fee 90 / eligibility 180 / annual 365），admin 里重复了一份常量（admin 是 TS 应用，不能直接 import `.mjs`）。

## 2. 缺口二：`dueSources` 把「没变化」当成「没抓取」

巡检落库只给 `changed` 的来源写 `snapshots`，内容稳定的来源 `retrieved_at` 永远停在上次变化时；`staleness-lib.mjs` 的 `latest_snapshot` 又只看 `snapshots.retrieved_at`，于是 `dueSources` 会长期挂着 4 个其实每天在抓的来源。

**做法**：`STALENESS_QUERY` 新增 `latest_check`（`source_checks` 最近一条 `checked_at`），输出字段 `last_snapshot_at` 改为 `COALESCE(latest_check.checked_at, latest_snapshot.retrieved_at)`。字段名与 `dueSources` 键名保持不变，避免改报告消费方；语义在 `docs/runbook.md` 里改成「最近一次抓取」。

## 3. 顺手修掉的落库缺陷

`ingest_bookkeeping.ingest_snapshot` 先插入快照再写 `source_checks`，快照 id 被写死为 `snapshot:bookkeeping:<hash>`。若同一页面此前已被巡检记成 `snapshot:patrol:<source>:<hash>`，`ON CONFLICT (source_id,content_hash) DO UPDATE` 保留旧 id，后续 `source_checks.snapshot_id` 外键找不到行 → `ForeignKeyViolation`。改为 `RETURNING id` 后用库里的实际 id。

## 4. 执行结果（生产库，2026-11-25 15:0x–15:2x CST）

| 动作               | 结果                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 迁移 0031          | 已应用（新列可空，无需回填）                                                                                                                                                  |
| 复核落账           | 26 条：bookkeeping 13、fp 8、gyoseishoshi 3、takken 2（fee + eligibility 原文命中）                                                                                           |
| 保留人工           | 3 条：takken `payment_deadline_rule` ×2（今日全部快照无「申込入力完了日」/「4日目」文本）、it-passport `application_change_deadline_rule`（FAQ 原文语义未变，但无结构化字段） |
| class3-exam        | 入库 5 条候选 → 全部批准（exam_subjects / exam_time / passing_standard / question_count / result_date_rule）                                                                  |
| 783 条历史统计候选 | 未落库（只读预检 `would_stage=783`，按决定不落）                                                                                                                              |

复核前后（`data:staleness`）：

| 指标                      | 前   | 后                        |
| ------------------------- | ---- | ------------------------- |
| `dueFacts`                | 29   | 3                         |
| `sourcesBehindOnSnapshot` | 4    | 0                         |
| `facts`                   | 1007 | 1012                      |
| `fact_revisions`          | 1046 | 1077（+26 复核、+5 批准） |

复核后 `candidate_facts` 全部 `approved`（1051），无待审；`change_events` 1051，与候选数一致。

## 5. 验证

- `node --test scripts/verify-lib.test.mjs scripts/mvp-coverage.test.mjs scripts/staleness-lib.test.mjs scripts/ops-daily-lib.test.mjs scripts/query-shape-lib.test.mjs scripts/package-scripts.test.mjs` 全通过。
- `data:staleness`（经隧道连生产库）：`dueFacts=3`、`dueSources=[]`、`sourcesBehindOnSnapshot=0`。
- 幂等：同一事实同日第二次提交返回 200 且 revision id 不变。
- 窗口内事实调用返回 400（不写库）。

## 6. 回滚

- 代码：revert 本提交即可（新列可空，旧代码忽略它们）。
- 数据：26 条复核 revision 的 `facts.current_revision_id` 若需回退，指回原 revision；不建议重建历史。
- class3-exam 5 条：如判错，按 `scripts/rollback-fact.ts` 走撤回流程，不要直接删行。

## 7. 遗留

- takken 2 条、it-passport 1 条仍需人工确认（页面改版或抽取器缺失）。
- takken 的 2 条若要机验，需要给 takken 补支付时限的抽取字段。
