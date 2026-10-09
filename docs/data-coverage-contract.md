# 数据覆盖契约（工作包 A）

机器可读契约位于 `config/data-coverage-contract.json`。它冻结了发布完整性判断的输入，而不是声明当前数据库已经完整。每一条 requirement 将资格、字段组、必需级别和适用维度关联；`fieldCatalog` 则定义每个字段的值类型、风险、允许来源类型和消费页面。

## 维度与必需级别

所有覆盖判断都以 `qualification` 和 `examYear` 为基础，并可按 `providerId`、`examLevelId`、`examComponent`、`deliveryMode`、`paymentMethod` 收窄。维度为空只表示该资格没有额外的实施维度，绝不允许跨年度匹配。

- `required`：官方已公布后必须存在的核心字段。
- `conditional`：只在契约列明的机构、等级、科目或实施方式适用；CBT 的预约/会场/场次字段也属于此类。
- `not_applicable`：明确不适用；本版本保留枚举，尚未把它伪装为缺失数据。
- `post_event`：考试或结果公布后产生，如人数、合格率和统计口径。
- `optional`：增强信息，不会成为完整性阻断项。

`source_url` 和 `official_verified_at` 是覆盖项，但不是将 CI fixture 的固定 `verified_at` 当作生产新鲜度的授权。生产新鲜度阈值、来源检查记录和最终发布阻断将由工作包 C 接入。

## 组合规则

日商簿记分别列出统一试验（1–3 级）、网络试验（2、3、初级、原价计算初级）和团体试验（1–3 级）。FP 分别列出 JAFP 2/3 级 CBT、JAFP 1 级实技、金财 1 级学科、金财 1 级面试实技，以及金财 2/3 级 CBT 的机构、等级、科目和方式组合。它们不能被资格级别的单一事实满足。

IT Passport 和基本信息技术者均以 `deliveryMode: cbt` 定义条件字段。IT Passport 的具体开考/截止/日期仅在官方明确公布相应场次时适用；不从“全年实施”或当前日期推导。

宅建的网络报名指南对便利店与 Pay-easy 给出不同的支付截止时刻。因此 `payment_deadline` 必须按 `paymentMethod: convenience_store` 或 `paymentMethod: pay_easy` 分别满足；不得降格为一个跨支付渠道的日期时间事实。

## 使用方式

`packages/schema/src/data-coverage-contract.ts` 使用 Zod 校验结构、六资格唯一性、字段引用和多维/CBT 最低约束。`scripts/verify-lib.mjs` 已直接读取此 JSON 并导出 `coverageGateContract`，使后续发布门禁可消费同一份冻结输入；本工作包刻意不改动旧的数量 baseline 或其通过语义。

当前契约覆盖年度日程、报名资格与方式、费用、考试规格、合格标准、统计、来源和更新确认时间。它只描述应有/条件适用/考试后产生的字段，不创建事实、不写数据库，也不批准候选。
