# 行政書士：来源登记与字段契约

资格 slug：`gyoseishoshi`（行政書士試験）。实施机构：一般財団法人行政書士試験研究センター（`institution:gyosei-shiken`）。允许域名仅 `www.gyosei-shiken.or.jp`。

行政書士是单一国家级考试，没有等级、科目、实施机构或实施方式的分流，因此本资格的事实维度（`provider_id`、`exam_level_id`、`exam_component`、`delivery_mode`、`payment_method`）全部为 `NULL`，只用 `qualification + exam_year + fact_key` 表达。这与其他五个资格的建模范式不同，新增字段时不要照抄簿记或 FP 的维度组合。

## 已登记官方来源

来源由 `packages/db/migrations/0004_gyoseishoshi_sources.sql` 登记，常量表在 `services/collector/src/collector/gyoseishoshi.py` 的 `GYoseishoshi_SOURCES`。

| source_id                      | URL                                                          | source_type                 | 是否产出候选               |
| ------------------------------ | ------------------------------------------------------------ | --------------------------- | -------------------------- |
| `source:gyoseishoshi:home`     | `https://www.gyosei-shiken.or.jp/`                           | `official_exam_information` | 否，只作入口证据           |
| `source:gyoseishoshi:abstract` | `https://www.gyosei-shiken.or.jp/doc/abstract/abstract.html` | `official_exam_overview`    | 否，只作制度说明证据       |
| `source:gyoseishoshi:guide`    | `https://www.gyosei-shiken.or.jp/doc/guide/guide.html`       | `official_exam_guide`       | 是，当前唯一产出候选的来源 |

`sources.qualification_id` 在这三条登记里是 `NULL`（全库 40 条来源里有 32 条同样未挂钩），来源与资格的实际归属由 `candidate_facts.qualification_id` 表达。补齐该列属于工作包 G 的收尾项，不要在门禁里依赖 `sources.qualification_id`。

## 适配器产出规则

解析入口是 `extract_candidates()`，只接受两类结构，匹配不到就不产出候选，绝不推断：

- 显式标注节点 `[data-fact-key]`（离线夹具用）；
- `guide` 页的 `table.info-table` 中 `th`/`td` 成对标签，以及正文里逐字匹配到的原文片段。

口径要点：

- 和历换算：`西历 = 2018 + 令和年`；`display_value` 与 `evidence_text` 始终保留官方原文。
- `exam_time`：官方只写「試験時間 午後１時から午後４時まで」，适配器换算成分钟数 `180`（`value_type=integer`），原文进 `display_value`。
- `question_count`：必须同时命中「法令等（出題数４６題）」与「基礎知識（出題数１４題）」两条，才产出 `60`；缺任意一条则 `exam_subjects` 与 `question_count` 整组不产出，不做单边求和。
- `payment_deadline`：官方原文只说「受験手数料は、受験願書の受付期間内に払い込んでください」并给出邮送消印截止，**没有公布独立的払込期限日期**。因此适配器产出的是规则型事实 `payment_deadline_rule`（`申込受付期間内`），由覆盖门禁的前缀匹配闭合 `payment_deadline` 字段。禁止为了凑日期写「試験日の2ヶ月前」这类推断值。
- `eligibility`：官方明载「年齢、学歴、国籍等に関係なく、どなたでも受験できます。」，规范化为规则 token `open_to_all`，原文留在 `display_value`/`evidence_text`。
- 全部候选固定 `status=pending_review`，`risk_level` 取适配器给出的值（适配器默认即 `high`），必须逐条人工批准。

## 当前已批准事实（2026 年度，15 条）

全部绑定真实官方快照（`snapshots.synthetic=false`），来源均为 `source:gyoseishoshi:guide`。

| fact_key                | normalized_value                                                       | value_type |
| ----------------------- | ---------------------------------------------------------------------- | ---------- |
| `application_open`      | `2026-07-21T09:00:00+09:00`                                            | datetime   |
| `application_deadline`  | `2026-08-24T17:00:00+09:00`                                            | datetime   |
| `payment_deadline_rule` | `申込受付期間内`                                                       | text       |
| `exam_date`             | `2026-11-08`（令和８年１１月８日（日））                               | date       |
| `result_date`           | `2027-01-27`（令和９年１月２７日，仍属 2026 年度試験）                 | date       |
| `fee`                   | `10400`（１０，４００円）                                              | money      |
| `eligibility`           | `open_to_all`                                                          | text       |
| `application_method`    | `インターネットによる受験申込み・郵送による受験申込み`                 | text       |
| `exam_method`           | `筆記試験によって行います。`                                           | text       |
| `exam_subjects`         | `行政書士の業務に関し必要な法令等・行政書士の業務に関し必要な基礎知識` | text       |
| `exam_time`             | `180`                                                                  | integer    |
| `question_count`        | `60`                                                                   | integer    |
| `question_format`       | `択一式・記述式`                                                       | text       |
| `scoring_method`        | `択一式が合格基準未達の場合は記述式を採点しないことがある`             | text       |
| `passing_standard`      | `法令等50%以上・基礎知識40%以上・全体60%以上`                          | text       |

本机门禁读数（2026-10-09 实跑）：`approved_official=15`、`pending_official=0`、`coverageYear=2026`、`coverageGaps=[]`、公开 API `status=verified`、5 个 Web 页面 HTTP 200。契约的 `required` 级字段清单见 `config/data-coverage-contract.json` 中 `slug=gyoseishoshi` 的第一条 requirement；统计类字段是 `post_event`，不参与门禁。

## 采集、入库、批准是三次独立授权

| 阶段 | 入口                                                       | 授权开关                                                                                                          | 写什么                                                                                                                        |
| ---- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 采集 | `services/collector/src/collector/capture_gyoseishoshi.py` | `GYOSEISHOSHI_LIVE_AUTHORIZED=1`                                                                                  | 只写 `var/official-snapshots/gyoseishoshi/` 与 `capture-report.json`，不连数据库                                              |
| 入库 | `services/collector/src/collector/ingest_gyoseishoshi.py`  | `GYOSEISHOSHI_LOCAL_WRITE=1`，且 `DATABASE_URL` 主机必须是 localhost/127.0.0.1，且 `NODE_ENV` 不得为 `production` | `capture_runs` + `snapshots`（含全溯源列）+ `source_checks` + `candidate_facts`（`pending_review`），返回 `approval: not_run` |
| 批准 | `apps/admin/src/server.ts` 审核队列                        | 请求头 `x-reviewer-id`                                                                                            | `reviews`、`fact_revisions`、`facts`、`change_events`                                                                         |

入库前必须确认快照路径在 `var/official-snapshots/gyoseishoshi` 之下且后缀为 `.html`，否则 `ingest_snapshot()` 直接拒绝；解析出问题（`structure_changed`）时以 `snapshot parse failed` 报错退出，不写半条数据。

`capture_record()` 在打开数据库连接之前做四重校验，任一不符即抛错、零写入：

1. `capture-report.json` 里该 `source_id` 的记录必须 `status='ok'` 且 `status_code=200`；
2. 报告里的 `snapshot_path` 解析后必须与入库路径完全一致；
3. 报告必须带 `content_hash` 与 `captured_at`；
4. 对磁盘原始字节重新算 sha256 必须等于报告的 `content_hash`，且适配器解析出的 `snapshot.content_hash` 也须相等。

`snapshots` 行改用 `ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写，`retrieved_at`/`retrieved_at_jst` 取报告里的真实抓取时刻，不再用 `now()`；`collector_version` 记为 `collector.capture_gyoseishoshi`。候选的 `risk_level` 取适配器给出的值（当前全部为 `high`），不再在 SQL 里硬编码。

## 已知剩余项

1. **新链已就地跑通，剩余是夹具行**：本机开发库的 `source:gyoseishoshi:guide` 快照共 3 行。真实抓取那行（`content_hash=e634d029…`，其 15 条候选全部 `approved`）已于 2026-10-10 用新链重跑一次入库，读回结果：`capture_run_id`/`original_url=https://www.gyosei-shiken.or.jp/doc/guide/guide.html`/`http_status=200`/`retrieved_at`＝报告里的真实抓取时刻 `2026-09-08 02:10:08.722939+00`（不再是写库时刻），并新增 `capture_runs` 1 行（`succeeded`）与 `source_checks` 1 行（`changed`）；候选新增 0 条（15 条全部 `ON CONFLICT DO NOTHING` 命中既有 approved 行），`pending_official` 仍为 0，门禁 `6/6` 不变。另外 2 行的 `object_key` 是 `ci://official-snapshot/…`、`retrieved_at` 固定 `2026-01-01`，属 CI 夹具复刻写入，按口径**不得**伪装成官方溯源，保持元数据为空即可。
2. **快照按固定文件名覆盖**：采集写 `guide.html`（与基本情報/hash 命名不同），年度页改版后旧快照会被覆盖，历史证据只存在于数据库里已有的 `content_hash`。
3. **`application_open` 的 `display_value` 含页面导航整段文本**：值是官方公告的受付開始時刻且正确，但正则回退分支抓的是整页纯文本，证据可读性差，待收紧匹配范围后重采。
4. **统计类字段零覆盖**：`applicants`/`examinees`/`passed`/`pass_rate`/`statistics_methodology` 属 `post_event`，目前没有稳定官方来源，归工作包 F。
5. **年度滚动**：`guide` 页随年度更新，覆盖年度一旦推进到 2027，需要重新走采集→入库→批准三次授权，15 条事实的年度归属也要复核。

相关文档：`docs/data-gate-semantics.md`（门禁与判级口径）、`docs/data-remediation-handoff.md`（工作包拆分）、`docs/work-package-e-live-capture-authorization.md`（采集授权单）。
