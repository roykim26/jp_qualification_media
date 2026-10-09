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

2026-10-09 为补齐统一试验的 `eligibility`、`question_format`、`payment_deadline` 三项缺口，另登记以下来源（URL 全部取自已捕获快照正文中的真实链接）；本轮只做了 capture-only 采集与离线审计，解析适配器已在 `services/collector/src/collector/bookkeeping.py` 离线落地并配 pytest 契约测试（未联网、未写库），候选入库与审核批准仍须单独授权，见 `docs/data-local-snapshot-audit-2026-09-07.md` 的 2026-10-09 小节：

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

## 事实维度

日商簿記不得只用 `qualification + year + fact_key` 表达事实。每条候选必须同时携带：

- `exam_level_id`：`bookkeeping:1`、`bookkeeping:2`、`bookkeeping:3`、`bookkeeping:basic`、`bookkeeping:cost-accounting-basic`
- `delivery_mode`：`unified`、`network`、`group`
- `exam_year`、`fact_key`、值类型、原文证据、官方快照

首批允许字段：`exam_method`、`exam_schedule`、`exam_date`、`fee`、`exam_subjects`、`exam_time`、`question_format`、`question_count`、`passing_standard`、`suspension_period`。

日期、费用、合格标准和休止期间均为高风险字段，必须进入人工审核；不同级别或实施方式不得合并。当前阶段只登记来源和冻结字段契约，不写入候选事实。
