# 日商簿記：来源登记与字段契约

资格：`bookkeeping`（日商簿記）；实施机构：日本商工会議所（JCCI）；允许域名仅为 `www.kentei.ne.jp`。

## 已登记官方来源

| source_id                          | 用途                                           |
| ---------------------------------- | ---------------------------------------------- |
| `source:bookkeeping:home`          | 资格入口与公告                                 |
| `source:bookkeeping:network`       | 2级、3级、簿記初級、原価計算初級网络试验       |
| `source:bookkeeping:calendar-2026` | 2026年度统一试验、团体试验、网络试验日程与费用 |
| `source:bookkeeping:class1-exam`   | 1级科目、时间与合格标准                        |
| `source:bookkeeping:class2-exam`   | 2级、3级试验注意事项入口                       |

2026-10-09 为补齐统一试验的 `eligibility`、`question_format`、`payment_deadline` 三项缺口，另登记以下来源（URL 全部取自已捕获快照正文中的真实链接）；采集与离线审计完成后，同日经项目所有者另行授权，已建 `0015_bookkeeping_gap_sources.sql` 迁移、入候选并逐条审核批准，见 `docs/data-local-snapshot-audit-2026-09-07.md` 的 2026-10-09 小节：

| source_id                        | 用途                                     |
| -------------------------------- | ---------------------------------------- |
| `source:bookkeeping:class1`      | 1 级等级页（级别说明与公告）             |
| `source:bookkeeping:class2`      | 2 级等级页                               |
| `source:bookkeeping:class3`      | 3 级等级页                               |
| `source:bookkeeping:class3-exam` | 3 级科目、时间与合格标准                 |
| `source:bookkeeping:flow`        | 受験の申し込みの流れ（入口与分流）       |
| `source:bookkeeping:flow-teller` | 统一试验各商工会議所窗口的报名与缴费流程 |
| `source:bookkeeping:flow-net`    | 网络试验报名与缴费流程                   |
| `source:bookkeeping:report`      | 受験者への連絡・注意事項（受験料返還等） |
| `source:bookkeeping:qa`          | 検定試験 Q&A（受験条件・級順・得点開示） |
| `source:bookkeeping:news-51504`  | 2027 年度以降 3 级配点变更公告           |

当前适配器只会从这些来源产出候选：`class1-exam`／`class2-exam`／`class3-exam` 产出按等级分流的 `question_format`，`qa` 产出统一试验 1／2／3 级的 `eligibility`，`flow-teller` 产出 `payment_deadline_rule`。其余新登记来源（`class1`／`class2`／`class3`／`flow`／`flow-net`／`report`／`news-51504`）只作证据留存，不产出候选。

## 工作包 F／F-2 新增的采集登记（2026-10-11，共 7 条，只进采集侧）

| source_id                                       | URL                                                                                    | `source_type`         | 用途                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `source:bookkeeping:candidate-data`             | `https://www.kentei.ne.jp/bookkeeping/candidate-data`                                  | `official_statistics` | 受験者データ（近年的各級×実施方式序列）                                 |
| `source:bookkeeping:candidate-data-class1`      | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class1`                      | `official_statistics` | 1 級統一の過去のデータ                                                  |
| `source:bookkeeping:candidate-data-class2`      | `https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class2` | `official_statistics` | 2 級統一の過去のデータ（老路径带 `bookkeeping_contents`，官方自身如此） |
| `source:bookkeeping:candidate-data-class3`      | `https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class3` | `official_statistics` | 3 級統一の過去のデータ（同上）                                          |
| `source:bookkeeping:candidate-data-class23-net` | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class2-3`                    | `official_statistics` | 2 級与 3 級ネットの過去のデータ（主页两个入口指向同一条 URL）           |
| `source:bookkeeping:candidate-data-class4`      | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class4`                      | `official_statistics` | 簿記初級（2016 年度まで 4 級）の過去のデータ                            |
| `source:bookkeeping:candidate-data-costing`     | `https://www.kentei.ne.jp/bookkeeping/candidate-data/ca-date`                          | `official_statistics` | 原価計算初級の過去のデータ（路径字面是官方的 `ca-date` 拼写）           |

这 7 条 2026-10-11 只进了**采集侧**：`BOOKKEEPING_SOURCES` 从 15 涨到 **22**（`capture_bookkeeping.capture_registered_sources()` 接受 `source_ids`／`BOOKKEEPING_CAPTURE_SOURCE_IDS` 收紧到当批），但**没有建 `sources` 迁移、没有入库、没有任何事实**。URL 逐字取自已抓快照正文（`docs/work-package-f-statistics-sources.md` §2、`docs/work-package-f2-bookkeeping-history-capture-authorization.md` §2）。`extract_candidates()` 对它们一律只报 `structure_changed`（7 条各有用例锁定，另有一条用例锁「22 个 slug 互不相同」——簿记落盘是固定文件名无条件覆盖，slug 撞车会静默毁掉另一页的字节），所以即使误传去入库也不会造出推断值。授权口径见 `docs/work-package-f-live-capture-authorization.md` 与 `docs/work-package-f2-bookkeeping-history-capture-authorization.md`。

`candidate-data` 一条的实抓读数（2026-10-11，HTTP 200、58027 字节、`46fcf61f…`）已确认：页内 7 张 `<table>`，級×実施方式在 H2 段标题里，`applicants`／`examinees`／`passed`／`pass_rate` 是页内印刷官方值；**但页面对合格率没有任何成文说明**，`statistics_methodology` 只能记列头原样或留缺。统一表按「回＋西历日期」、ネット与初級表按「年度（4 月〜次年 3 月）」，两种粒度的 `exam_year` 归属是**入库前必须确认的产品决策**。

## 事实维度

日商簿記不得只用 `qualification + year + fact_key` 表达事实。每条候选必须同时携带：

- `exam_level_id`：`bookkeeping:1`、`bookkeeping:2`、`bookkeeping:3`、`bookkeeping:basic`、`bookkeeping:cost-accounting-basic`
- `delivery_mode`：`unified`、`network`、`group`
- `exam_year`、`fact_key`、值类型、原文证据、官方快照

首批允许字段：`exam_method`、`exam_schedule`、`exam_date`、`fee`、`exam_subjects`、`exam_time`、`question_format`、`question_count`、`passing_standard`、`suspension_period`。

日期、费用、合格标准和休止期间均为高风险字段，必须进入人工审核；不同级别或实施方式不得合并。候选入库只在项目所有者单独授权后执行（`BOOKKEEPING_LOCAL_WRITE=1` + 仅 localhost 库 + `capture-report.json` 的 200 与哈希复核），采集授权本身不包含该权限。
