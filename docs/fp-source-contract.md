# FP技能検定：官方来源与字段契约

资格 slug：`fp`。这是国家检定，但由两个指定试验机构实施，公开事实必须同时记录实施机构、等级、考试组成和实施方式。

## 实施机构

- `jafp`：日本FP協会。实施2级、3级学科和“資産設計提案業務”实技；1级仅实施“資産設計提案業務”实技。
- `kinzai`：金融財政事情研究会。实施1级学科和“資産相談業務”实技，以及2级、3级学科与多种实技业务。

## 必需维度

- `provider_id`：`jafp` / `kinzai`
- `exam_level_id`：`fp:1` / `fp:2` / `fp:3`
- `exam_component`：`academic`，或带业务类型的 `practical:*`
- `delivery_mode`：`cbt` / `pbt` / `interview`
- `exam_year`、`fact_key`、官方来源、快照和证据原文

2级、3级学科与实技原则上按 CBT 建模。1级不得套用该规则，必须按机构与具体科目从官方页面提取。

首批字段：`exam_method`、`exam_schedule`、`exam_date`、`exam_time`、`question_count`、`question_format`、`passing_standard`、`fee`、`eligibility`、`practical_subject`。所有字段进入人工审核；同一数值不得跨机构、等级或科目复用。

## 采集、入库、批准是三次独立授权

| 阶段 | 入口                                             | 授权开关                                                                                                | 写什么                                                                                                                        |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 采集 | `services/collector/src/collector/capture_fp.py` | `FP_LIVE_AUTHORIZED=1`                                                                                  | 只写 `var/official-snapshots/fp/` 与 `capture-report.json`（按 `source_id` 合并），不连数据库                                 |
| 入库 | `services/collector/src/collector/ingest_fp.py`  | `FP_LOCAL_WRITE=1`，且 `DATABASE_URL` 主机必须是 localhost/127.0.0.1，且 `NODE_ENV` 不得为 `production` | `capture_runs` + `snapshots`（含全溯源列）+ `source_checks` + `candidate_facts`（`pending_review`），返回 `approval: not_run` |
| 批准 | `apps/admin/src/server.ts` 审核队列              | 请求头 `x-reviewer-id`                                                                                  | `reviews`、`fact_revisions`、`facts`、`change_events`                                                                         |

入库前必须确认快照路径在 `var/official-snapshots/fp` 之下且后缀为 `.html`；解析出问题（`structure_changed`／`invalid_contract_dimensions`）时以 `snapshot parse failed` 报错退出，不写半条数据。

`capture_record()` 在打开数据库连接之前做四重校验，任一不符即抛错、零写入：

1. `capture-report.json` 里该 `source_id` 的记录必须 `status='ok'` 且 `status_code=200`；
2. 报告里的 `snapshot_path` 解析后必须与入库路径完全一致；
3. 报告必须带 `content_hash` 与 `captured_at`；
4. 对磁盘原始字节重新算 sha256 必须等于报告的 `content_hash`，且适配器解析出的 `snapshot.content_hash` 也须相等。

`snapshots` 行用 `ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写全溯源列，`retrieved_at`/`retrieved_at_jst` 取报告里的真实抓取时刻而非 `now()`，`collector_version` 记为 `collector.capture_fp`；`capture_runs.id` 为 `capture-run:fp:<content_hash>`、`source_checks.id` 为 `source-check:fp:<content_hash>`。候选 id 带四维（`provider`／`exam_level`／`exam_component`／`delivery_mode`），入库语句是 `ON CONFLICT (id) DO UPDATE … WHERE candidate_facts.status='pending_review'`，即**已批准的候选不会被重跑覆盖**。

`capture-report.json` 自 2026-10-10 起按 `source_id` 合并写入，实现落在共享模块 `services/collector/src/collector/capture_report.py`（`write_capture_report()`），行政書士／簿记／IT Passport 三条采集链共用。报告里 `source_count` 是**本次运行**条数，`retained_source_count` 是文件里累计保留的来源记录数，`results` 是合并后的全集；某来源本次抓取失败时保留上一次成功记录（那才对应磁盘上的字节），失败记录只在该来源从未成功落盘时才会写入。此前整份覆盖的行为曾让 2026-09-08 的 9／9 成功报告消失。

## 已知剩余项

1. **2026-09-08／09-11 入库的那 4 个快照没有报告记录，新链当下会拒绝它们**：`var/official-snapshots/fp/capture-report.json` 现在只剩 2026-09-22 那次 capture-only 运行的 1 条记录，而 `var/` 在 `.gitignore` 里，旧报告无从恢复。只读核对结论：磁盘 4 个 HTML 的 sha256 与库里 4 条真实快照行逐条相符，离线解析出 53 条候选 id，53 条全部已是 `approved` ⇒ 若报告补齐后重跑，候选新增 0 条、`pending_official` 仍为 0；但**要拿到新报告必须先做一次 `FP_LIVE_AUTHORIZED=1` 抓取**，而官方页改版会让哈希变化、候选 id 全变成新的 pending，触发门禁 `pending_official != 0` 硬失败，届时需逐条审核并重算 baseline 计数。这一轮按决定只对齐代码，未抓取、未写库。
2. **本机开发库有夹具残留**：3 条 `object_key=ci://official-snapshot/…`、`retrieved_at=2026-01-01` 的快照行分别挂着 24／8／7 ＝ 39 条 `approved` 候选。按口径它们不得伪装成官方溯源，元数据保持为空即可。
3. **`scripts/backfill-fp-provenance.mjs` 仍在负责无报告的旧真实快照**：它把 capture-only 文档登记成来源、写 `capture_runs`（`capture-run:fp:<name>:<timestamp>`）与 `source_checks`，并对无法证实的旧行写 `status='blocked'` 的检查记录、明确声明未推断任何值（本机读回 6 条 `blocked`、2 条 `changed`）。新链写入的 `changed` 行与之一致且幂等。
4. **快照按固定文件名覆盖**：与行政書士同问题——重抓会改写同名文件，库里旧快照行 `object_key` 指向的字节随之丢失，历史证据只剩数据库里的 `content_hash`。基本情報采用 `<sha256>.html` 内容寻址命名，没有该问题。
5. **年度滚动**：JAFP／金财的募集页随年度更新，覆盖年度推进到 2027 需要重新走采集→入库→批准三次授权，已批准事实的年度归属也要复核。
