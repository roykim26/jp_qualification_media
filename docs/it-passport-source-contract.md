# IT Passport 来源与字段契约

更新时间：2026-11-10

## 目标

验证 CBT/动态公告场景的来源边界和字段映射，不在本阶段生成或写入动态事实。

## 官方来源登记计划

| source id                              | URL                                                                   | 允许域名               | 用途                                   |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------- | -------------------------------------- |
| `source:it-passport:ipa-exam`          | `https://www.ipa.go.jp/shiken/`                                       | `www.ipa.go.jp`        | 制度公告、考试要纲、特别措施和统计入口 |
| `source:it-passport:jitec-home`        | `https://www3.jitec.ipa.go.jp/JitesCbt/`                              | `www3.jitec.ipa.go.jp` | CBT 考试说明、报名流程和官方 FAQ       |
| `source:it-passport:jitec-application` | `https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html` | `www3.jitec.ipa.go.jp` | 报名规则和可选考试日期说明             |
| `source:it-passport:ipa-fee`           | `https://www.ipa.go.jp/shiken/mousikomi/schedule.html`                | `www.ipa.go.jp`        | 試験日程・受験手数料（区分共通金额）   |
| `source:it-passport:ipa-exam-detail`   | `https://www.ipa.go.jp/shiken/kubun/ip.html`                          | `www.ipa.go.jp`        | 实施方式、考试时间、出题形式与题数     |
| `source:it-passport:jitec-faq`         | `https://www3.jitec.ipa.go.jp/JitesCbt/html/reference/faq.html`       | `www3.jitec.ipa.go.jp` | 报考资格、考试领域和合格标准原文       |

页面是登记入口，不代表页面上的所有文本都能直接转成事实。所有实际字段仍必须绑定快照、解析规则和审核记录。

`ipa-fee` 是全「情報処理技術者試験」共用的受験手数料页。IT Passport 与 基本情報技術者試験 各登记一条 source，各自保存快照与事实来源；因此 `sources.canonical_url` 不再全局唯一，改为「同一资格下同一 URL 唯一」（见迁移 `0022_p0_1_core_fact_sources.sql`）。

## 字段映射边界

| 事实键                 | 允许来源                  | 风险   | 处理规则                                          |
| ---------------------- | ------------------------- | ------ | ------------------------------------------------- |
| `fee`                  | `ipa-fee`（区分共通金额） | high   | 只读取「受験手数料 7,500円」原文，保留括注条件    |
| `exam_method`          | `ipa-exam-detail`         | medium | 只读取「実施方式・実施時期」标注的 CBT 表述       |
| `exam_time`            | `ipa-exam-detail`         | medium | 只读取「試験時間 N分」中的数字，值类型 `integer`  |
| `question_format`      | `ipa-exam-detail`         | medium | 只读取「出題形式」原文，保留全角括号              |
| `question_count`       | `ipa-exam-detail`         | medium | 只读取「出題数 N問」中的数字，值类型 `integer`    |
| `eligibility`          | `jitec-faq`               | high   | 只接受「受験資格は特段ありません」明确表述        |
| `exam_subjects`        | `jitec-faq`               | medium | 只读取三领域名称，不推导各领域配分                |
| `passing_standard`     | `jitec-faq`               | high   | 保存「综合 600 分以上且各分野 300 分以上」原文    |
| `application_rule`     | `jitec-application`       | high   | 保存官方原文片段，禁止推导统一报名窗口            |
| `booking_window`       | `jitec-faq`               | high   | 保存「最短で翌日、最長で3ヵ月先」原文，不推导日期 |
| `venue_rule`           | `jitec-faq`               | high   | 保存「試験開催状況一覧」按会场查日程/空席原文     |
| `scoring_method`       | `youkou-pdf`              | medium | 只解析「ITパスポート試験…IRT…」原文，值固定 `IRT` |
| `exam_date`            | 具体报名/公告页面         | high   | 仅提取明确日期；不得从当前日期或示例文本推算      |
| `application_deadline` | 具体报名/公告页面         | high   | CBT 可能按场次变化，必须按页面声明的适用范围保存  |
| `exam_content`         | JITEC 考试内容页          | medium | 保存版本号和原文范围，制度变化进入审核            |

评分方式（IRT 等）不在上述页面正文中，只出现在 `試験要綱 Ver.5.6` PDF。2026-11-28 起适配器按 PDF 后缀分派到 `youkou_pdf.extract_it_passport_candidates()`，只读取该 PDF 第 4(1) 条「ITパスポート試験…においてはIRT…に基づいて…評価点を算出する。」原文并登记为 `scoring_method`，不得用推断值补齐。

本资格没有固定的全年统一考试日历；未发现明确日期时必须保持 `awaiting_official`，不能生成伪日期。

## 入口页只登记、不产事实

`source:it-passport:ipa-exam`（試験情報）与 `source:it-passport:jitec-home`（JITEC 首页）只作来源登记入口：首页新闻列表的轮换（公告标题、更新日期、合格発表、休業告知等）不产生任何事实候选，`extract_real_page_candidates()` 对这两个来源固定返回空候选、空异常，属预期行为，不是解析故障。

任何新事实必须来自具体公告页或报名页；首页上的标题、链接文字、新闻表日期一律不得转成 `exam_date`／`application_deadline`／`exam_method` 等字段。要事实化公告页，先按「受控抓取计划」登记该 URL、抓取快照并留下审核记录，再扩适配器。

## 受控抓取计划

1. 只允许 HTTPS 和登记域名；重定向仍必须通过 `SafeFetcher` 校验。
2. 先抓入口页并保存快照，再按登记链接抓取具体页面。
3. 仅提取明确标题、表格或结构化标记下的字段；解析失败不得产生候选。
4. 日期、费用、制度和报名条件默认 `high + pending_review`。
5. 页面结构变化、来源冲突或适用范围不明时只生成异常记录，不更新正式事实。
6. 首次真实读取前先用离线快照夹具覆盖 CBT 页面、公告变化、404 和结构失效。

## 本轮实现与验收

- 已完成离线快照适配器：显式字段提取、内容哈希和来源绑定。
- 已覆盖 CBT 页面字段、公告字段变化、结构失效和 404。
- 日期、费用、报名规则等高风险字段固定生成 `high + pending_review` 候选；考试结构与领域信息为 `medium`。
- 页面结构失效只生成解析异常，不生成候选事实。
- 测试夹具位于 `fixtures/official-snapshots/it-passport-*.html`，均为 synthetic 数据。
- 2026-11-09 复抓：`ipa-exam`（`76cf0e64…`，55,225 B）与 `jitec-home`（`03af14f0…`，31,295 B）相对 2026-08-12 旧快照只有首页新闻列表轮换（无新增稳定字段），故适配器 0 候选；`jitec-application` 快照未变、仍产既有 2 条候选。该边界由 `test_real_parser_does_not_infer_it_passport_facts_from_ipa_cards` 与 `test_real_parser_treats_jitec_home_news_as_entry_page_only` 两条用例固化。

### 2026-11-10 P0-1 真实抓取与本机审核队列

六个来源全部 HTTP 200，快照与 `analysis-report.json` 位于 `var/official-snapshots/it-passport/`（本地证据，未提交）：

| 来源                | content_hash（前 12 位） | 候选 | 事实键                                                                             |
| ------------------- | ------------------------ | ---- | ---------------------------------------------------------------------------------- |
| `ipa-exam`          | `d8e3c7812930`           | 0    | —                                                                                  |
| `jitec-home`        | `359c3f4a260b`           | 0    | —                                                                                  |
| `jitec-application` | `30b9a8bcf036`           | 2    | `application_change_deadline_rule`、`application_open_2026_may_sessions`           |
| `ipa-fee`           | `371df8121666`           | 1    | `fee` = 7,500 円（`integer`，high）                                                |
| `ipa-exam-detail`   | `dd00822a92b5`           | 4    | `exam_method`=CBT、`exam_time`=120 分、`question_format`、`question_count`=100 問  |
| `jitec-faq`         | `d8d6f4bbefd8`           | 5    | `eligibility`、`exam_subjects`、`passing_standard`、`booking_window`、`venue_rule` |

合计 10 条候选，全部 `pending_review`、`synthetic=false`；报告明确记录 `database_write: not_run`、`automatic_approval: not_run`。随后经单独授权写入本机审核队列：`jitec-application` 的 2 条此前已批准（本次 `ON CONFLICT` 未新增），其余 **8 条新候选已入库并于同日经所有者授权审核批准**，`pending_review` 归零。

据此补上的 P0-1 缺口：费用、报考资格、考试结构（方式/时间/形式/题数/领域）与合格标准。评分方式当时仍未覆盖（仅 PDF 试验要纲）。

### 2026-11-28 维度回填与 PDF 补采

- 迁移 `0033_it_passport_cbt_dimensions_backfill.sql` 把既有 10 条事实的 `delivery_mode` 回填为 `cbt`，关闭 10 个 `dimensionMismatch` 缺口（含 `source_url`／`official_verified_at`）。
- 适配器新增 `application_rule`（`jitec-application` 原文「受験申込内容（試験会場、受験日時）の変更は、試験日の3日前まで行うことができます。」）。
- 迁移 `0034_it_passport_youkou_pdf_source.sql` 登记 `source:it-passport:youkou-pdf`；抓取同一官方 `試験要綱 Ver.5.6` PDF（`e191898aadf4…`），解析第 4(1) 条 IRT 原文生成 `scoring_method`。
- 适配器新增 `booking_window`（FAQ「申込み可能な試験日は、最短で翌日、最長で3ヵ月先…」）与 `venue_rule`（FAQ「試験開催状況一覧…都道府県ごとの試験会場の試験日…」），均按原文片段登记。
- 四条新候选经 `x-reviewer-id` 批准，本机 IT Passport 已批准事实 10 → 13；CI 夹具同步为 1815 facts／47 snapshots，`release-gate-baseline` 的 `it-passport.expectedFacts` 由 9 调整为 13。
- it-passport 14 个契约字段已全部覆盖，不再有未采集项。

## 当前结论

离线解析边界、真实快照分析、显式授权的本地候选入库、审核队列和公开读取/展示链路均已完成本地验收。当前仍不等同于生产事实：真实候选必须人工审核，公开 API 继续过滤 synthetic 事实；实时定时采集、生产发布、正式认证和外部通知不在本阶段范围。

2026-11-10 新增的 10 条候选中，8 条已完成「抓取 + 解析 + 报告 + 写入本机审核队列 + 人工批准」，2 条报名类候选此前已批准。审核使用 `x-reviewer-id` 头逐条写入 `reviews`，理由绑定对应官方快照；当时本机 IT Passport 新增 9 条已批准事实（本机库 `facts` 982→991）；2026-11-28 已增至 13 条，并同步 CI 夹具（1815 facts）与 `release-gate-baseline`（`it-passport.expectedFacts=13`）。`ingest_it_passport_analysis.py` 按候选自带的 `value_type`／`risk_level` 写入，并只接受 high／medium 风险；首次写入曾把风险压平成 high，纠正后已删除错误行并重跑，结构类 5 条现为 `medium`，费用/资格/合格标准 3 条为 `high`。审核页 `/review/it-passport` 待审核 0 条，`verify:all` 恢复 6/6。

本地 fixture 候选入库命令要求同时设置 `STAGE2_LOCAL_WRITE=1`、`DATABASE_URL`、`IT_PASSPORT_FIXTURE` 和明确的 `IT_PASSPORT_EXAM_YEAR`，入口为 `services/collector/src/collector/ingest_it_passport.py`。审核队列地址为 `/review/it-passport`。fixture 候选保留 `synthetic=true`，不会进入公开 API。
