# 字段消费映射（工作包 D）

本文件记录已批准事实如何进入页面、比较器、日历和 ICS，防止适配器字段键与消费端前缀不一致而造成“数据存在但不可见”。

## 基本信息技术者

`exam_subject_a_time`、`exam_subject_b_time`、`exam_subject_a_question_count`、`exam_subject_b_question_count`、`exam_subject_a_answer_count`、`exam_subject_b_answer_count`、`exam_subject_a_format`、`exam_subject_b_format` 均为独立科目事实。

- 考试内容页逐科显示，不合并、求和或推测统一值。
- 比较器“试验时间”可识别科目 A/B 的时间事实；多科目时只展示一个具备明确维度的公开值，不建立虚构的总时间。

## 日程字段

- `exam_date`：单个明确日期。
- `exam_dates`：多个明确日期；日历和 ICS 展开为稳定的独立 occurrence。
- `exam_schedule`：仅在原值包含明确日期时生成日历/ICS 事件。全年实施、会场决定等描述仅在页面显示。

## 报名字段

报名页消费 `application_*`：通用 `application_rule`、日期型报名开始/截止，以及资格特有规则（例如 `application_change_deadline_rule`）。比较器的“申込みルール”只消费规则字段，不将其误作为截止日期。

所有消费路径只读取已批准、非 synthetic 的公开事实；缺失原因沿用工作包 B 的状态模型。
