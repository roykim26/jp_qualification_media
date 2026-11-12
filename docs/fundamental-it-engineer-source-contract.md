# 基本情報技術者（FE）：来源登记与字段契约

资格 slug：`fundamental-it-engineer`。主管机关：独立行政法人情報処理推進機構（`institution:ipa`）。允许域名：IPA 官方页 `www.ipa.go.jp`，以及 CBT 运营方 `www.cbt-s.com`（2026-11-11 所有者批准，仅用于报考资格与合格标准）。

FE 自令和 5 年度起全年以 CBT 随时实施，没有「统一考试日 + 统一报名窗口」这种年度单值结构，因此契约里三条 requirement 全部是 `conditional` 且带 `deliveryMode`/`examComponent` 维度。**本资格的门禁通过含义与行政書士不同，务必先读「门禁告警」一节。**

## 已登记官方来源

来源由 `packages/db/migrations/0005_fundamental_it_sources.sql`、`0022_p0_1_core_fact_sources.sql`、`0023_fe_operator_and_outline_sources.sql`、`0027_fundamental_it_statistics_source.sql` 与 `0029_fe_statistics_suiihyo_source.sql` 登记，常量表在 `services/collector/src/collector/fundamental_it.py` 的 `FUNDAMENTAL_IT_SOURCES`。

| source_id                                     | URL                                                                                   | source_type                 | 是否产出候选                                     |
| --------------------------------------------- | ------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------ |
| `source:fundamental-it:exam`                  | `https://www.ipa.go.jp/shiken/kubun/fe.html`                                          | `official_exam_information` | 是（科目结构）                                   |
| `source:fundamental-it:cbt`                   | `https://www.ipa.go.jp/shiken/mousikomi/cbt_sg_fe.html`                               | `official_cbt_application`  | 是（仅两句共用陈述）                             |
| `source:fundamental-it:syllabus`              | `https://www.ipa.go.jp/shiken/syllabus/index.html`                                    | `official_syllabus`         | 否，只作大纲证据                                 |
| `source:fundamental-it:statistics-fe`         | `https://www.ipa.go.jp/shiken/reports/toukei_fe.html`                                 | `official_statistics`       | 是（仅 `statistics_methodology` 一条，工作包 J） |
| `source:fundamental-it:statistics-fe-suiihyo` | `https://www.ipa.go.jp/shiken/reports/ps6vr70000016ew6-att/202609_fe_01_suiihyo.xlsx` | `official_statistics`       | 是（年度人数三项＋官方印刷合格率，工作包 J）     |
| `source:fundamental-it:ipa-fee`               | `https://www.ipa.go.jp/shiken/mousikomi/schedule.html`                                | `official_exam_calendar`    | 是（区分共通受験手数料）                         |
| `source:fundamental-it:cbt-s`                 | `https://www.cbt-s.com/examinee/examination/fe`                                       | `official_cbt_operator`     | 是（受験資格・合格基準）                         |
| `source:fundamental-it:youkou-pdf`            | `https://www.ipa.go.jp/shiken/syllabus/rcu1hd00000141gq-att/youkou_ver5_6.pdf`        | `official_exam_outline_pdf` | 是（仅 IRT 评分方式一句）                        |

`source:fundamental-it:statistics-fe` 是工作包 F（历史统计）第一批的采集登记，2026-10-11 只进了采集侧常量表；2026-11-11 所有者拍板补登记进 `sources`（迁移 `0027_fundamental_it_statistics_source.sql`；P1-1 运营发现：巡检抓得到、落账却因未登记被跳过 `skipped_unregistered`）。该页是 IPA 的 FE 统计**附件目录页**（PDF/Excel 附件清单），页内零表格；工作包 J（2026-11-12）起适配器从页内两句成文口径产出 **1 条 `statistics_methodology`**（见下节），不再整页 `structure_changed`。授权口径见 `docs/work-package-f-live-capture-authorization.md` 与 `docs/work-package-j-fe-pass-rate-proposal.md`。

`source:fundamental-it:statistics-fe-suiihyo` 由迁移 `0029_fe_statistics_suiihyo_source.sql` 登记（2026-11-12，工作包 J），指向目录页所列的**推移表 xlsx 附件**（`official_statistics`）。⚠ **附件文件名按月滚动**（`202608_…`→`202609_…`→…），登记的是拍板时点的当前 URL（0026 簿记 URL 漂移先例）；下月刷新＝改 `FUNDAMENTAL_IT_SOURCES` 的 `canonical_url`＋新迁移＋重走采集/入库/批准三次授权，**不得自动抓新附件**。同目录的 `202609_fe_toukei.pdf`（統計資料报告）未登记：AES 加密（空口令）且文本扁平，路线拍板（D1=A）弃 PDF 取 xlsx。

`ipa-fee` 与 IT Passport 的 `source:it-passport:ipa-fee` 指向同一官方页。两者各登记一条 source、各自保存快照，使 FE 的费用事实拥有自己的来源；因此 `sources.canonical_url` 从全局唯一改为「同一资格下同一 URL 唯一」（迁移 `0022_p0_1_core_fact_sources.sql`）。

`cbt-s` 与 `youkou-pdf` 由迁移 `0023_fe_operator_and_outline_sources.sql` 登记。`cbt-s` 是 IPA 指定的 CBT 运营方门户，域名 `www.cbt-s.com` 超出原先「仅 `www.ipa.go.jp`」的 FE 允许域；这是一次性所有者决策（2026-11-11），不是适配器自行放宽。`youkou-pdf` 仍属 `www.ipa.go.jp`，快照保存 PDF 原始字节。

`sources.qualification_id` 由 `packages/db/src/seed.ts` 统一绑定（2026-10-11 本机与 CI 空库均为 100% 已绑定；`source:fundamental-it:*` 映射到 slug `fundamental-it-engineer`），不在迁移里写。

## 适配器产出规则

- `exam` 页只接受 `div.def-list.--side` 的 `dt`/`dd` 成对结构：
  - 「実施方式・実施時期」且文本含「CBT方式」⇒ `exam_method=CBT` + `exam_schedule=year_round`；
  - `h4` 标题必须是「科目A」或「科目B」，在该科目块内读「試験時間／出題形式／出題数・解答数」⇒ 产出 `exam_subject_a_*` 与 `exam_subject_b_*` 八条事实（`_time`、`_format`、`_question_count`、`_answer_count`）。
- `cbt` 页与情報セキュリティマネジメント考试共用，页内是**逐月场次表**：没有「场次」这一维度就无法把某一行归属到单一年度事实，因此适配器只产出两句无歧义的共用陈述（`exam_method`、`exam_schedule`），**刻意不产出** `application_rule`、`booking_window`、`venue_rule`、`exam_date`、`result_date`。
- `cbt` 页若同时出现「システムリプレースのため、{YYYY}年M月D日から試験実施を一時休止」与「試験再開は、{YYYY}年M月(上旬|中旬|下旬)を予定」⇒ 产出 `suspension_period`（`value_type=json`，`risk=high`，`exam_year=2026`，`{"startsOn":…,"resumesFrom":…}`；下旬保留为 `late`，**不折算成具体日**）。任一句缺失、或恢复句没有「予定」⇒ 不产。方案与拍板见 `docs/work-package-h-suspension-fact-proposal.md`。
- `ipa-fee` 页标题必须含「スケジュール」，只匹配「受験手数料 7,500円(…消費税込み…)」原文 ⇒ 产出 `fee`（`value_type=integer`，`risk=high`，`normalized_value=7500`），证据保留完整括注。该金额是「情報処理技術者試験」区分共通值，不是 FE 专属报价；页面没有明确金额 ⇒ 不产候选、报 `structure_changed`。
- `cbt-s` 页标题必须含「基本情報技術者試験」，只读表格行「受験資格」=「どなたでも受験可能」⇒ `eligibility`（high），以及「合格基準」匹配「各科目の評価点が基準点（600点）以上の場合に合格です。」⇒ `passing_standard`（high，normalized 为「各科目の評価点が基準点（600点）以上」）。其他考试页或缺少对应行 ⇒ 不产该字段；整页无候选 ⇒ `structure_changed`。
- `youkou-pdf` 用 `pypdf` 抽取全文，去掉空白后只匹配「基本情報技術者試験においてはIRT（ItemResponseTheory：項目応答理論）に基づいて解答結果から評価点を算出する。」⇒ `scoring_method`（`normalized_value=IRT`，`display_value=IRT（項目応答理論）`，medium）。找不到该句 ⇒ `structure_changed`，不做推断。
- `statistics-fe` 目录页（工作包 J）：去空白后必须同时含「令和5年度以降の基本情報技術者試験の統計情報を掲載しています。」与「応募者の方々に受験申込時に記入していただいたアンケートに基づいた情報です。」两句 ⇒ 产出 1 条 `statistics_methodology`（text，high，`exam_year=None` 由入库参数兜底）。任一句缺失 ⇒ 不产候选（整页 `structure_changed`），不推断。
- `statistics-fe-suiihyo` 推移表 xlsx（工作包 J，`fe_statistics_xlsx.py`，依赖 `openpyxl>=3.1`）：sheet 必须名「ＦＥ」；表头含「(令和N年M月D日現在)」截止注记；oddFooter 必须含成文分母公式「合格率（合格者数／受験者数：％）」；4月–3月成对列＋Z/AA 年度合計布局锚定。每个**完整年度**块（A 列「令和N年度」标签起 3 行：応募者数／受験者数／合格者数）产出 4 条：`applicants`/`examinees`/`passed`（integer，年度合計列 Z）＋`pass_rate`（decimal，**官方印刷值** AA 列，`round(x,1)` 去浮点尾差，不自行计算）。`exam_year=2018+令和数`（**年度起始年**，D2 拍板：令和7→2025）；进行中年度（月份不全）与「累計」块整块跳过；重复年度标签/缺年度合計/脚注或表头或月份布局漂移 ⇒ 0 候选＋`structure_changed`。evidence 带单元格地址（如 `ＦＥ!AA12 令和７年度 年度合計 合格率: 38.3%`）＋脚注原文＋截止注记。真实字节夹具 `tests/fixtures/fe/202609_fe_01_suiihyo.xlsx`（sha256 `2063cd07…`）＋13 条用例（含 8 条结构篡改）锁定。
- 所有 FE 候选默认 `delivery_mode='cbt'`；`exam_subject_{a|b}_*` 自动带 `exam_component='subject-a'|'subject-b'`，其余 FE 事实的 `exam_component` 为 `NULL`。入库写入这两列，与迁移 `0024_fe_cbt_dimensions_backfill.sql` 的回填口径一致。统计五字段（工作包 J）同样 `delivery_mode='cbt'`、`exam_component=NULL`，但 `exam_year=2025`（统计覆盖年度，与其余 FE 事实的 2026 不同）；入库可用 `FUNDAMENTAL_IT_ONLY_EXAM_YEAR` 环境变量把候选过滤到单一年度（D3 拍板：首批仅令和7完整年度）。
- 风险分级：走 `[data-fact-key]` 路径时，`application_rule`/`application_deadline`/`exam_date`/`fee`/`eligibility` 固定 `high`，其余 `medium`；`_extract_exam_page()` 与 `_extract_cbt_page()` 产出的字段固定 `medium`（`suspension_period` 例外，固定 `high`）。`_extract_fee_page()` 固定 `high`；`_extract_cbt_s_page()` 的资格与合格标准固定 `high`；PDF 的 `scoring_method` 固定 `medium`；统计五字段（目录页 methodology 与推移表四项）固定 `high`。

## 已批准事实基表（2026 年度，12 条，2026-11-10 时点）

> 时点注记：本表是 2026-11-10 的 12 条基表。其后 2026-11-11 批准资格/评分 3 条（FE 12→15）、2026-11-12 工作包 J 批准统计 5 条（FE 15→**20**，`exam_year=2025`），见下面两节；全库现值以只读查询现取为准。

全部绑定真实官方快照（`snapshots.synthetic=false`，HTTP 200）：10 条科目字段来自 `exam` 页快照 `7e349607`，`exam_method`／`exam_schedule`／`suspension_period` 来自 `cbt` 页快照 `7bf47930`（两次采集的 `retrieved_at_jst` 均为 2026-11-09，`cbt` 页更新日为 2026-11-05），`fee` 来自 `ipa-fee` 页快照 `371df812`（2026-11-10 采集；`ipa-fee` 页面本身不标注更新日）。

| fact_key                        | normalized_value                                         | value_type | 来源      |
| ------------------------------- | -------------------------------------------------------- | ---------- | --------- |
| `exam_method`                   | `CBT`                                                    | text       | `cbt`     |
| `exam_schedule`                 | `year_round`                                             | text       | `cbt`     |
| `exam_subject_a_time`           | `90`                                                     | integer    | `exam`    |
| `exam_subject_a_format`         | `多肢選択式（四肢択一）`                                 | text       | `exam`    |
| `exam_subject_a_question_count` | `60`                                                     | integer    | `exam`    |
| `exam_subject_a_answer_count`   | `60`                                                     | integer    | `exam`    |
| `exam_subject_b_time`           | `100`                                                    | integer    | `exam`    |
| `exam_subject_b_format`         | `多肢選択式`                                             | text       | `exam`    |
| `exam_subject_b_question_count` | `20`                                                     | integer    | `exam`    |
| `exam_subject_b_answer_count`   | `20`                                                     | integer    | `exam`    |
| `suspension_period`             | `{"startsOn":"2026-12-28","resumesFrom":"2027-01-late"}` | json       | `cbt`     |
| `fee`                           | `7500`                                                   | integer    | `ipa-fee` |

基表 12 条写入时 `provider_id`、`exam_level_id`、`exam_component`、`delivery_mode`、`payment_method` 均为 `NULL`。**2026-11-11 迁移 `0024_fe_cbt_dimensions_backfill.sql` 已应用**：`delivery_mode='cbt'` 与科目维度（`exam_component='subject-a'|'subject-b'`）已回填，门禁 `conditional` 维度不再整条跳过（复算缺口见「门禁告警」节结论 2）。

## 2026-11-10 P0-1 费用事实（已批准）

`ipa-fee`（`https://www.ipa.go.jp/shiken/mousikomi/schedule.html`）HTTP 200，快照哈希 `371df8121666…`，产出 1 条候选：

| fact_key | normalized_value | value_type | risk | evidence（节选）                                        |
| -------- | ---------------- | ---------- | ---- | ------------------------------------------------------- |
| `fee`    | `7500`           | integer    | high | `受験手数料 7,500円(情報処理技術者試験は消費税込み。…)` |

候选经单独授权写入本机审核队列后，已于同日经项目所有者授权批准（审阅人 `p0-1-owner-review`，理由绑定上述快照证据）。`/review/fundamental-it-engineer` 回到 0 条待审，`verify:all` 恢复 6/6。该金额是「情報処理技術者試験」区分共通值，不是 FE 专属报价，页面文案已按此口径展示。

审核为**本机库**操作：本机 `facts` 由 982 增至 991（同批共批准 9 条：IT Passport 8 条 + FE 费用 1 条），CI 夹具与 release baseline 的公开计数仍为 982，两者不能混称。P0-1 的 FE 费用缺口至此已有官方证据并显示为已批准事实。

## 2026-11-11 P0-1 资格与评分三条（已批准）

`cbt-s` 与 `youkou-pdf` 两来源实抓后入库、批准（审阅人 `local-data-reviewer`，2026-11-11），FE 12→**15**：

| fact_key           | normalized_value                      | value_type | 来源         | 快照哈希（前 8 位） |
| ------------------ | ------------------------------------- | ---------- | ------------ | ------------------- |
| `eligibility`      | `どなたでも受験可能`                  | text       | `cbt-s`      | `d6e7312d`          |
| `passing_standard` | `各科目の評価点が基準点（600点）以上` | text       | `cbt-s`      | `d6e7312d`          |
| `scoring_method`   | `IRT`                                 | text       | `youkou-pdf` | `e191898a`          |

三条均 `exam_year=2026`、`delivery_mode='cbt'`、risk high（scoring_method 为 medium）。至此「已知剩余项」旧第 2 条的三项缺口全部闭合，不得再用推断值补全的约束继续适用于未来变更。

## 2026-11-12 工作包 J：统计五字段（已批准，exam_year 2025）

号主授权阶段 1-4 连走（采集/入库/批准三次独立授权，最后一句「同意授权阶段 3＋4 连走」）。路线 D1=A（xlsx 推移表），`exam_year` D2=年度起始年（令和7→2025），首批 D3=仅令和7完整年度，D5=methodology 同批。执行提交 `f46c943`（直推 main，push CI run `43160584486` 双 job success）。

| fact_key                 | normalized_value                                                                                                                          | value_type | 来源                    |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------- |
| `applicants`             | `172217`                                                                                                                                  | integer    | `statistics-fe-suiihyo` |
| `examinees`              | `147186`                                                                                                                                  | integer    | `statistics-fe-suiihyo` |
| `passed`                 | `56370`                                                                                                                                   | integer    | `statistics-fe-suiihyo` |
| `pass_rate`              | `38.3`                                                                                                                                    | decimal    | `statistics-fe-suiihyo` |
| `statistics_methodology` | `令和5年度以降の基本情報技術者試験の統計情報を掲載しています。応募者の方々に受験申込時に記入していただいたアンケートに基づいた情報です。` | text       | `statistics-fe`         |

- 证据：xlsx 快照 `2063cd07`（18040 字节，`ＦＥ!Z10/Z11/Z12/AA12`，脚注「合格率（合格者数／受験者数：％）」，表头「(令和8年10月21日現在)」）；目录页快照 `d2178a93`（80686 字节）。两哈希与阶段 1 探针抓取逐字节一致。`pass_rate` 是**官方印刷值**（分母公式在附件脚注成文，D4 不再需要）。
- 五条均 `exam_year=2025`、`delivery_mode='cbt'`、risk high；审阅人 `work-package-j-owner-review`（2026-11-12），批准脚本 `var/approve-fe-statistics.mjs`（gitignored）。FE 15→**20**、全库 994→**999**、pending 归 0、`verify:all` 6/6。
- 推移表内的令和5/6 完整年度数据**未入库**（授权范围只令和7）；令和8 进行中年度被提取器整块跳过。月度附件刷新与历史年度入库各需新授权。
- baseline/CI 夹具已于 2026-11-12 同批刷为 **999 facts／37 snapshots** 并合并（squash PR #73＝`ef8ce97`）：J 轮时点的本机领先差 17（FE 旧 4＋ITP 8＋本轮 5）与 kinzai **7 条值差**（4 条実技第三场次＋3 条 display 全角空格）全部进夹具。方案与执行记录见 `docs/work-package-j-fe-pass-rate-proposal.md`。

## 门禁告警：6/6 通过 ≠ FE 字段完整

`scripts/verify-lib.mjs` 的 `evaluateCoverage()` 对 `conditional` 的处理是：**先用维度筛出该年度该维度的事实，若一条都没筛到就整条 requirement 跳过**。FE 基表 12 条事实写入时 `delivery_mode` 全是 `NULL`（含当时新批准的 `fee`），而契约三条 requirement 的维度都是 `{deliveryMode: "cbt"}`，因此三条全部被跳过（**历史机制说明；2026-11-11 迁移 0024 应用后维度已回填，不再整条跳过**）。

本机复算判据（2026-10-09，直接调用 `scripts/verify-lib.mjs` 导出的 `evaluateCoverage('fundamental-it-engineer', facts, 2026)`，事实数组用当时已有的 10 个 fact_key，其余字段同现状 —— 这是历史读数，早于 `fee` 批准）：

- 现状（`deliveryMode=null`）：`gaps = 0`，门禁 `passed 6/6`、`coverageGaps=[]`、API `verified`。
- 假如给这批事实补上 `delivery_mode='cbt'`（不新增任何事实）：`gaps = 10`，缺的字段是 `application_rule`、`booking_window`、`venue_rule`、`eligibility`、`fee`、`scoring_method`、`passing_standard`、`exam_time`、`question_count`、`question_format`。

由此得出两条必须记住的结论：

1. FE 目前**没有**真正满足契约要求的 `eligibility`/`passing_standard`/`scoring_method` 字段，是通过「维度不匹配 ⇒ 跳过」拿到 0 缺口的。汇报覆盖率时不得把 FE 说成字段齐备。
2. 即便按科目维度重打事实，`exam_subject_a_time` 这类 fact_key 也**不满足**前缀匹配规则（`satisfiesCoverageField` 要求 `factKey === field` 或 `factKey.startsWith(field + '_')`）。2026-11-11 所有者拍板：保留键名，改由 `verify-lib.mjs` 的科目映射闭合；回填维度后复算 `gaps = 3`（eligibility、passing_standard、scoring_method），三项关闭后为 0。`application_rule`／`booking_window`／`venue_rule` 已拆为 `not_applicable`，不再参与缺口计算。

## 采集、入库、批准是三次独立授权

| 阶段 | 入口                        | 授权开关                                                        | 写什么                                                                                                                                                                                                        |
| ---- | --------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 采集 | `capture_fundamental_it.py` | `FUNDAMENTAL_IT_LIVE_AUTHORIZED=1`                              | 只写 `var/official-snapshots/fundamental-it/<sha256>.html`（PDF 来源写 `.pdf`、xlsx 附件写 `.xlsx`）与 `capture-report.json`（按 `source_id` 合并，共用 `collector/capture_report.py`，不再整份覆盖）         |
| 入库 | `ingest_fundamental_it.py`  | `FUNDAMENTAL_IT_LOCAL_WRITE=1` + localhost 库 + 非 `production` | `capture_runs`、`snapshots`（含 `original_url`/`http_status`/`retrieved_at_jst`）、`source_checks`、`candidate_facts`（`pending_review`）；`FUNDAMENTAL_IT_ONLY_EXAM_YEAR` 可把候选过滤到单一年度（工作包 J） |
| 批准 | `apps/admin/src/server.ts`  | 请求头 `x-reviewer-id`                                          | `reviews`、`fact_revisions`、`facts`、`change_events`                                                                                                                                                         |

入库前有 `capture_record()` 四重校验：报告里该来源必须 `status=ok` 且 `status_code=200`；报告中的 `snapshot_path` 必须与入库路径解析后一致；报告必须同时带 `content_hash` 与 `captured_at`；文件原始字节的 sha256 必须等于报告的 `content_hash`（适配器解析出的哈希还会再与报告比对一次）。任一条不符即抛错、零写入。快照文件名用内容哈希，天然保留历史版本。

## 已知剩余项

1. `venue_rule`/`booking_window`/`application_rule` 没有年度统一值。2026-11-11 所有者拍板：**维持 `not_applicable`**（契约中单独一行，维度 `deliveryMode=cbt`），不扩 `exam_session` 维度、不逐场次取证；如以后要做，需重新走判级决策。
2. ~~`eligibility`、`scoring_method`、`passing_standard` 仍为零已批准事实~~ **已闭合**：三条于 2026-11-11 经三次授权流程实抓→入库→批准（见上节），不得用推断值补全的约束继续适用于未来变更。
3. `syllabus` 来源只作证据，未接入适配器。
4. 统计类字段（`post_event`）：FE 五字段已由工作包 J 闭合（2026-11-12，见上节）；其余资格的合格率等仍零覆盖，归工作包 F。
5. **月度附件刷新**：推移表 URL 按月滚动（当前登记 `202609_fe_01_suiihyo.xlsx`），刷新须改常量表＋新迁移＋重走三次授权；令和5/6 历史年度数据在表内但未入库，入库属新授权。

相关文档：`docs/data-gate-semantics.md`（`conditional` 跳过机制与前缀匹配规则的完整口径）、`docs/it-passport-source-contract.md`（同为 CBT 资格的 ITパスポート口径）。
