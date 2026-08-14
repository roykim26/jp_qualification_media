# 数据契约（阶段 0 冻结草案）

事实链为：`source -> snapshot -> candidate_fact -> validation/conflict -> review -> fact_revision -> published fact -> change_event`。

时间：数据库时间戳统一 UTC；业务日期按 `Asia/Tokyo` 解释；日期型字段不伪造时区。动态事实必须带资格、年度、事实键、值类型、规范值、展示值、来源、快照、状态、风险和修订指针。

枚举：

- 状态：`draft`、`pending_review`、`approved`、`rejected`、`superseded`、`withdrawn`
- 风险：`low`、`medium`、`high`、`critical`
- 事件：`application_open`、`application_deadline`、`exam_date`、`result_date`、`fee_change`、`eligibility_change`、`schedule_change`、`system_change`
- 值类型：`date`、`datetime`、`money`、`integer`、`decimal`、`text`、`boolean`、`json`

公开查询只读 `approved` 且有来源快照的当前修订；候选、审核、冲突和未验证事实禁止进入公开响应。
