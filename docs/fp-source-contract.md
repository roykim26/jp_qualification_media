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

`snapshots` 行用 `ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写全溯源列，`retrieved_at`/`retrieved_at_jst` 取报告里的真实抓取时刻而非 `now()`，`collector_version` 记为 `collector.capture_fp`；`capture_runs.id` 为 `capture-run:fp:<content_hash>`、`source_checks.id` 为 `source-check:fp:<content_hash>`。候选 id 带四维（`provider`／`exam_level`／`exam_component`／`delivery_mode`），入库语句是 `ON CONFLICT (id) DO UPDATE … WHERE candidate_facts.status='pending_review'`，即**已批准的候选不会被重跑覆盖**（2026-10-11 用临时表实测：已批准 id 的 rowcount＝0、`normalized_value` 原值不动）。

要注意一条不对称：候选是带条件更新，快照行是**无条件** `DO UPDATE`。所以即使哈希没变，重跑也会把那 6 条真实快照行的 `retrieved_at` 从 2026-09-07／09-11 改成新的抓取时刻，同时补全目前为 NULL 的 `original_url`／`final_url`／`http_status`／`collector_version`（本机读数：11 个 FP 快照行里 9 个缺这些列，其中 3 个是 `ci://` 夹具行、按设计留空）。门禁不受影响（§5 的 `official_verified_at` 取 `reviews` 时间），但「这批证据何时取得」的语义会变，属需要项目所有者定性的副作用。

`capture-report.json` 自 2026-10-10 起按 `source_id` 合并写入，实现落在共享模块 `services/collector/src/collector/capture_report.py`（`write_capture_report()`），行政書士／簿记／IT Passport／基本情報／宅建五条采集链与之共用，即六条采集链全部使用同一实现。报告里 `source_count` 是**本次运行**条数，`retained_source_count` 是文件里累计保留的来源记录数，`results` 是合并后的全集；某来源本次抓取失败时保留上一次成功记录（那才对应磁盘上的字节），失败记录只在该来源从未成功落盘时才会写入。此前整份覆盖的行为曾让 2026-09-08 的 9／9 成功报告消失。

## 已知剩余项

1. **6 个取证快照在 `capture-report.json` 里没有记录，新链当下会拒绝它们**（2026-10-11 只读预演更正，此前记为「那 4 个」）：`var/official-snapshots/fp/capture-report.json` 现在只剩 2026-09-22 那次 capture-only 运行的 1 条记录，而 `var/` 在 `.gitignore` 里，旧报告无从恢复。磁盘上能解析出候选的来源实为 **6 个、共 75 条候选 id**，按页分布 `jafp-2-3-outline` 36／`jafp-schedule` 12／`kinzai-schedule-2026` 10／`kinzai-1-academic` 8／`kinzai-1-practical` 7／`kinzai-eligibility` 2；这 75 条与库里 6 条真实快照行逐条相符且**全部已是 `approved`**，其余 7 个注册来源解析 0 条并报 `structure_changed`（库里也没有它们的快照行）。
   - **入库入口 `INGEST_SOURCES`（`ingest_fp.py`）现覆盖全部 6 个来源＝75 条**（2026-10-11 从 4 个扩到 6 个；此前 `jafp-schedule` 12 ＋ `kinzai-schedule-2026` 10 这 22 条有事实、有 `approved` 候选，却没有已提交的入库入口，`git log -S` 显示旧 mapping 从未含它们，0016 迁移只登记来源、不写候选）。⇒ 「若报告补齐后重跑，候选新增 0 条、`pending_official` 仍为 0」这句现在对 6 个来源全部成立；代价是重抓暴露面从 53 抬到 **75**，那 22 条也进了暴露面。
   - 解析不出任何契约字段的 7 个来源（`jafp-home`／`jafp-1-outline`／`jafp-2-3-application`／`kinzai-home`／`kinzai-2`／`kinzai-3`／`kinzai-schedule`，磁盘快照实测全部报 `structure_changed`）**刻意留在 mapping 之外**：`ingest_snapshot()` 对任何解析问题都是整体抛错、零写入，把它们加进来只会让入口一跑就红。这层划分由 `services/collector/tests/test_fp_ingest.py` 的两条用例锁住（覆盖面相等 ＋ 无字段页面必须在连库之前就抛错）。
   - **官方页改版是唯一能让门禁变红的变量**：候选 id 内嵌 `content_hash`，某页哈希一变，该页候选全部变成新的 `pending_review` ⇒ `pending_official != 0` 硬失败，届时需逐条审核并重算 baseline 计数（另需授权）。暴露量仍集中在单页：`jafp-2-3-outline` 一页 36 条＝映射内 75 条的 48%。
   - **授权面**：`capture_registered_sources(source_ids=None)` 默认抓全部 13 个 `FP_SOURCES`，而 `docs/work-package-e-live-capture-authorization.md` 只登记 FP 的 9 个来源且注明**已于 2026-09-08 执行完毕** ⇒ 重抓要开一张新授权单，并建议用 `source_ids` 收紧到 `INGEST_SOURCES` 那 6 个来源（另外 7 个来源解析不出契约字段，抓回来也进不了入库链，只增大报告与快照的噪音）。这一轮按决定只读预演，未抓取、未写库。
2. **本机开发库有夹具残留**：3 条 `object_key=ci://official-snapshot/…`、`retrieved_at=2026-01-01` 的快照行分别挂着 24／8／7 ＝ 39 条 `approved` 候选。按口径它们不得伪装成官方溯源，元数据保持为空即可。本机读数（2026-10-11）：FP 候选 114 ＝ 75（磁盘真实快照）＋ 39（夹具），**75 条现行事实 0 条挂在 `ci://` 快照上**，这 39 条也不是任何事实的当前 revision；`npm run audit:provenance` 对 FP 报 blocked 0（全库 blocked 4 全在 takken）⇒ 夹具残留不承重，别把它当成 FP 的真实溯源缺口。
3. **`scripts/backfill-fp-provenance.mjs` 仍在负责无报告的旧真实快照**：它把 capture-only 文档登记成来源、写 `capture_runs`（`capture-run:fp:<name>:<timestamp>`）与 `source_checks`，并对无法证实的旧行写 `status='blocked'` 的检查记录、明确声明未推断任何值（本机读回 6 条 `blocked`、2 条 `changed`，8 条**全部由该脚本写入**，新链一条 `changed` 都还没落过）。两套 id 要分清：给 capture-only 那 2 条用的 id 与新链同形（`source-check:fp:<content_hash>`），所以新链将来对那两个快照写检查是幂等；而那 6 条 `blocked` 用的是另一套 id（`source-check:legacy-metadata:snapshot:fp:<content_hash>`），**新链将来重跑这 6 个快照会新增一条 `changed`，不会取代那条 `blocked`**——读账时两条并排属正常，不是重复登记。
4. **快照按固定文件名覆盖**：与行政書士同问题——重抓会改写同名文件，库里旧快照行 `object_key` 指向的字节随之丢失，历史证据只剩数据库里的 `content_hash`。基本情報采用 `<sha256>.html` 内容寻址命名，没有该问题。更要紧的是**这种丢失测不出来**：`object_key` 仍指向同名路径，门禁与 `audit:approved-provenance` 都不重算文件字节，快照与 `content_hash` 不符也不会报。2026-10-11 已把承载那 75 条已批准事实的 6 个 HTML 按 `<sha256>.html` 复制到 `var/official-snapshots/fp-preserved/`（附 `manifest.json` 记录哈希↔来源↔候选数；`var/` 不入库，属本机专有），此后任何一次授权抓取都不再会永久毁掉原始字节。
5. **年度滚动**：JAFP／金财的募集页随年度更新，覆盖年度推进到 2027 需要重新走采集→入库→批准三次授权，已批准事实的年度归属也要复核。
