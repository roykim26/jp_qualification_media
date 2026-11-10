# 基本情報技術者（FE）：来源登记与字段契约

资格 slug：`fundamental-it-engineer`。主管机关：独立行政法人情報処理推進機構（`institution:ipa`）。允许域名仅 `www.ipa.go.jp`。

FE 自令和 5 年度起全年以 CBT 随时实施，没有「统一考试日 + 统一报名窗口」这种年度单值结构，因此契约里三条 requirement 全部是 `conditional` 且带 `deliveryMode`/`examComponent` 维度。**本资格的门禁通过含义与行政書士不同，务必先读「门禁告警」一节。**

## 已登记官方来源

来源由 `packages/db/migrations/0005_fundamental_it_sources.sql` 与 `0022_p0_1_core_fact_sources.sql` 登记，常量表在 `services/collector/src/collector/fundamental_it.py` 的 `FUNDAMENTAL_IT_SOURCES`。

| source_id                             | URL                                                     | source_type                 | 是否产出候选             |
| ------------------------------------- | ------------------------------------------------------- | --------------------------- | ------------------------ |
| `source:fundamental-it:exam`          | `https://www.ipa.go.jp/shiken/kubun/fe.html`            | `official_exam_information` | 是（科目结构）           |
| `source:fundamental-it:cbt`           | `https://www.ipa.go.jp/shiken/mousikomi/cbt_sg_fe.html` | `official_cbt_application`  | 是（仅两句共用陈述）     |
| `source:fundamental-it:syllabus`      | `https://www.ipa.go.jp/shiken/syllabus/index.html`      | `official_syllabus`         | 否，只作大纲证据         |
| `source:fundamental-it:statistics-fe` | `https://www.ipa.go.jp/shiken/reports/toukei_fe.html`   | `official_statistics`       | 否，尚未抓取得到内容     |
| `source:fundamental-it:ipa-fee`       | `https://www.ipa.go.jp/shiken/mousikomi/schedule.html`  | `official_exam_calendar`    | 是（区分共通受験手数料） |

`source:fundamental-it:statistics-fe` 是工作包 F（历史统计）第一批的采集登记，2026-10-11 **只进了采集侧常量表**：没有对应的 `sources` 迁移、没有快照、没有事实。`extract_candidates()` 对它只会报 `structure_changed`（有用例锁定），授权口径见 `docs/work-package-f-live-capture-authorization.md`。

`ipa-fee` 与 IT Passport 的 `source:it-passport:ipa-fee` 指向同一官方页。两者各登记一条 source、各自保存快照，使 FE 的费用事实拥有自己的来源；因此 `sources.canonical_url` 从全局唯一改为「同一资格下同一 URL 唯一」（迁移 `0022_p0_1_core_fact_sources.sql`）。

`sources.qualification_id` 由 `packages/db/src/seed.ts` 统一绑定（2026-10-11 本机与 CI 空库均为 100% 已绑定；`source:fundamental-it:*` 映射到 slug `fundamental-it-engineer`），不在迁移里写。

## 适配器产出规则

- `exam` 页只接受 `div.def-list.--side` 的 `dt`/`dd` 成对结构：
  - 「実施方式・実施時期」且文本含「CBT方式」⇒ `exam_method=CBT` + `exam_schedule=year_round`；
  - `h4` 标题必须是「科目A」或「科目B」，在该科目块内读「試験時間／出題形式／出題数・解答数」⇒ 产出 `exam_subject_a_*` 与 `exam_subject_b_*` 八条事实（`_time`、`_format`、`_question_count`、`_answer_count`）。
- `cbt` 页与情報セキュリティマネジメント考试共用，页内是**逐月场次表**：没有「场次」这一维度就无法把某一行归属到单一年度事实，因此适配器只产出两句无歧义的共用陈述（`exam_method`、`exam_schedule`），**刻意不产出** `application_rule`、`booking_window`、`venue_rule`、`exam_date`、`result_date`。
- `cbt` 页若同时出现「システムリプレースのため、{YYYY}年M月D日から試験実施を一時休止」与「試験再開は、{YYYY}年M月(上旬|中旬|下旬)を予定」⇒ 产出 `suspension_period`（`value_type=json`，`risk=high`，`exam_year=2026`，`{"startsOn":…,"resumesFrom":…}`；下旬保留为 `late`，**不折算成具体日**）。任一句缺失、或恢复句没有「予定」⇒ 不产。方案与拍板见 `docs/work-package-h-suspension-fact-proposal.md`。
- `ipa-fee` 页标题必须含「スケジュール」，只匹配「受験手数料 7,500円(…消費税込み…)」原文 ⇒ 产出 `fee`（`value_type=integer`，`risk=high`，`normalized_value=7500`），证据保留完整括注。该金额是「情報処理技術者試験」区分共通值，不是 FE 专属报价；页面没有明确金额 ⇒ 不产候选、报 `structure_changed`。
- 风险分级：走 `[data-fact-key]` 路径时，`application_rule`/`application_deadline`/`exam_date`/`fee`/`eligibility` 固定 `high`，其余 `medium`；`_extract_exam_page()` 与 `_extract_cbt_page()` 产出的字段固定 `medium`（`suspension_period` 例外，固定 `high`）。`_extract_fee_page()` 固定 `high`。

## 当前已批准事实（2026 年度，11 条）

全部绑定真实官方快照（`snapshots.synthetic=false`，HTTP 200）：10 条科目字段来自 `exam` 页快照 `7e349607`，`exam_method`／`exam_schedule`／`suspension_period` 来自 `cbt` 页快照 `7bf47930`；两次采集的 `retrieved_at_jst` 均为 2026-11-09（`cbt` 页更新日为 2026-11-05）。

| fact_key                        | normalized_value                                         | value_type | 来源   |
| ------------------------------- | -------------------------------------------------------- | ---------- | ------ |
| `exam_method`                   | `CBT`                                                    | text       | `cbt`  |
| `exam_schedule`                 | `year_round`                                             | text       | `cbt`  |
| `exam_subject_a_time`           | `90`                                                     | integer    | `exam` |
| `exam_subject_a_format`         | `多肢選択式（四肢択一）`                                 | text       | `exam` |
| `exam_subject_a_question_count` | `60`                                                     | integer    | `exam` |
| `exam_subject_a_answer_count`   | `60`                                                     | integer    | `exam` |
| `exam_subject_b_time`           | `100`                                                    | integer    | `exam` |
| `exam_subject_b_format`         | `多肢選択式`                                             | text       | `exam` |
| `exam_subject_b_question_count` | `20`                                                     | integer    | `exam` |
| `exam_subject_b_answer_count`   | `20`                                                     | integer    | `exam` |
| `suspension_period`             | `{"startsOn":"2026-12-28","resumesFrom":"2027-01-late"}` | json       | `cbt`  |

所有 11 条的 `provider_id`、`exam_level_id`、`exam_component`、`delivery_mode`、`payment_method` 均为 `NULL` —— 这一点直接决定门禁行为，见下节。

## 2026-11-10 P0-1 费用候选（只分析、未入库）

`ipa-fee`（`https://www.ipa.go.jp/shiken/mousikomi/schedule.html`）HTTP 200，快照哈希 `371df8121666…`，产出 1 条候选：

| fact_key | normalized_value | value_type | risk | evidence（节选）                                        |
| -------- | ---------------- | ---------- | ---- | ------------------------------------------------------- |
| `fee`    | `7500`           | integer    | high | `受験手数料 7,500円(情報処理技術者試験は消費税込み。…)` |

候选为 `pending_review`、`synthetic=false`；`var/official-snapshots/fundamental-it/analysis-report.json` 记录 `database_write: not_run`、`automatic_approval: not_run`。与 IT Passport 的费用候选共享同一官方网站页和内容哈希，但分属不同 source／快照记录。

因此 P0-1 的 FE 费用缺口已有可用官方证据，但尚未写入数据库、未审核、未展示，不能算作已上线事实。

## 门禁告警：6/6 通过 ≠ FE 字段完整

`scripts/verify-lib.mjs` 的 `evaluateCoverage()` 对 `conditional` 的处理是：**先用维度筛出该年度该维度的事实，若一条都没筛到就整条 requirement 跳过**。FE 现有 11 条事实的 `delivery_mode` 是 `NULL`，而契约三条 requirement 的维度都是 `{deliveryMode: "cbt"}`，因此三条全部被跳过。

本机复算判据（2026-10-09，直接调用 `scripts/verify-lib.mjs` 导出的 `evaluateCoverage('fundamental-it-engineer', facts, 2026)`，事实数组用当时已有的 10 个 fact_key，其余字段同现状）：

- 现状（`deliveryMode=null`）：`gaps = 0`，门禁 `passed 6/6`、`coverageGaps=[]`、API `verified`。
- 假如给这批事实补上 `delivery_mode='cbt'`（不新增任何事实）：`gaps = 10`，缺的字段是 `application_rule`、`booking_window`、`venue_rule`、`eligibility`、`fee`、`scoring_method`、`passing_standard`、`exam_time`、`question_count`、`question_format`。

由此得出两条必须记住的结论：

1. FE 目前**没有**真正满足契约要求的 `fee`/`eligibility`/`passing_standard` 等字段，是通过「维度不匹配 ⇒ 跳过」拿到 0 缺口的。汇报覆盖率时不得把 FE 说成字段齐备。
2. 即便按科目维度重打事实，`exam_subject_a_time` 这类 fact_key 也**不满足**前缀匹配规则（`satisfiesCoverageField` 要求 `factKey === field` 或 `factKey.startsWith(field + '_')`，即需要 `exam_time_subject_a` 这种命名才能闭合 `exam_time`）。所以「补 `delivery_mode`」这件事必须与「fact_key 命名口径 + `exam_component` 维度填法」一起决策，属于判级/契约改动 ⇒ **需项目所有者确认后再动**，不得由实现侧自行翻转。

## 采集、入库、批准是三次独立授权

| 阶段 | 入口                        | 授权开关                                                        | 写什么                                                                                                                                                       |
| ---- | --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 采集 | `capture_fundamental_it.py` | `FUNDAMENTAL_IT_LIVE_AUTHORIZED=1`                              | 只写 `var/official-snapshots/fundamental-it/<sha256>.html` 与 `capture-report.json`（按 `source_id` 合并，共用 `collector/capture_report.py`，不再整份覆盖） |
| 入库 | `ingest_fundamental_it.py`  | `FUNDAMENTAL_IT_LOCAL_WRITE=1` + localhost 库 + 非 `production` | `capture_runs`、`snapshots`（含 `original_url`/`http_status`/`retrieved_at_jst`）、`source_checks`、`candidate_facts`（`pending_review`）                    |
| 批准 | `apps/admin/src/server.ts`  | 请求头 `x-reviewer-id`                                          | `reviews`、`fact_revisions`、`facts`、`change_events`                                                                                                        |

入库前有 `capture_record()` 四重校验：报告里该来源必须 `status=ok` 且 `status_code=200`；报告中的 `snapshot_path` 必须与入库路径解析后一致；报告必须同时带 `content_hash` 与 `captured_at`；文件原始字节的 sha256 必须等于报告的 `content_hash`（适配器解析出的哈希还会再与报告比对一次）。任一条不符即抛错、零写入。快照文件名用内容哈希，天然保留历史版本。

## 已知剩余项

1. `venue_rule`/`booking_window`/`application_rule` 需要一个「场次/月份」维度才能安全归属，现有契约维度（`deliveryMode`、`examComponent`）表达不了；要么扩维度，要么维持规则型说明并显式判为不适用 —— 属产品决策。
2. `fee`、`eligibility`、`scoring_method`、`passing_standard` 仍为零已批准事实。2026-11-10 的取证结论：
   - `fee`：已在 `ipa-fee` 页找到明确金额并生成候选（见上节），待单独授权入库与审核。
   - `eligibility`（「どなたでも受験可能」）与 `passing_standard`（「各科目 600 点以上」）只在 CBT 运营方 CBT-Solutions 的 `https://www.cbt-s.com/` 页面出现，不在当前 FE 允许域名 `www.ipa.go.jp` 内。要事实化必须先决定是否把运营方域名登记为来源；IPA 自身页面未发现同义稳定表述。
   - `scoring_method`（IRT）只在 `試験要綱 Ver.5.6` PDF 中公布，当前适配器不解析 PDF。新增 PDF 解析属于新能力，不能用推断值替代。
   - 这三项都要按三次授权流程处理，不得用推断值补全。
3. `syllabus` 来源只作证据，未接入适配器。
4. 统计类字段（`post_event`）零覆盖，归工作包 F。

相关文档：`docs/data-gate-semantics.md`（`conditional` 跳过机制与前缀匹配规则的完整口径）、`docs/it-passport-source-contract.md`（同为 CBT 资格的 ITパスポート口径）。
