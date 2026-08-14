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

## 事实维度

日商簿記不得只用 `qualification + year + fact_key` 表达事实。每条候选必须同时携带：

- `exam_level_id`：`bookkeeping:1`、`bookkeeping:2`、`bookkeeping:3`、`bookkeeping:basic`、`bookkeeping:cost-accounting-basic`
- `delivery_mode`：`unified`、`network`、`group`
- `exam_year`、`fact_key`、值类型、原文证据、官方快照

首批允许字段：`exam_method`、`exam_schedule`、`exam_date`、`fee`、`exam_subjects`、`exam_time`、`question_format`、`question_count`、`passing_standard`、`suspension_period`。

日期、费用、合格标准和休止期间均为高风险字段，必须进入人工审核；不同级别或实施方式不得合并。当前阶段只登记来源和冻结字段契约，不写入候选事实。
