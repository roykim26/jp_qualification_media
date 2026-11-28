# MVP 监査 basline 47 gap keys 复核（P1-05）

- 复核日期：2026-11-28
- 对象：`config/mvp-audit-baseline.json` 的 `gapKeys`
- 证据：生产审计（commit `5e709df`、1811 approved facts、`audit:mvp` 输出，2026-11-28）＋仓库 schema/migration/测试
- 结论：**47 是 gap keys（字段/维度缺口键），不是 47 条错误事实。** 其中生产环境仍缺 19 键；28 键已在生产数据中满足，但仍保留在基线里，因为 CI/local 的缩小导出夹具（1007/1037 facts）没有这些事实。

## 1. 分类口径

| 分类                     | 含义                                           | 本表用法                |
| ------------------------ | ---------------------------------------------- | ----------------------- |
| 已修复（生产数据已满足） | 生产审计不再产出该 key                         | 28 键                   |
| 仍未实现 / 未采集        | 生产审计仍产出该 key；数据层没有 approved fact | 19 键                   |
| 不适用                   | 契约判定该维度不适用                           | 无（本清单不含 n/a 键） |
| 需要人工确认             | 官方是否公开该字段需人工判断                   | 标注在“未采集”说明中    |

> 本表不把“官方未公开”和“尚未采集”强行区分：审计只能证明“没有 approved fact”，无法证明官方页面是否存在该字段。因此 19 个未满足键统一标为“未采集（官方是否公开待确认）”，而不是记为错误事实。

## 2. 生产仍缺的 19 个 gap keys

### bookkeeping（1）

| key                                                                            | 状态   | 说明                                      |
| ------------------------------------------------------------------------------ | ------ | ----------------------------------------- |
| `bookkeeping\|question_count\|deliveryMode=unified\|examLevelId=bookkeeping:1` | 未采集 | 生产 1 级统一试验没有 question_count 事实 |

### fp（2）

| key                                                                                                  | 状态   | 说明                  |
| ---------------------------------------------------------------------------------------------------- | ------ | --------------------- |
| `fp\|question_count\|deliveryMode=pbt\|examComponent=academic\|examLevelId=fp:1\|providerId=kinzai`  | 未采集 | 1 级 PBT 学科问题数   |
| `fp\|question_format\|deliveryMode=pbt\|examComponent=academic\|examLevelId=fp:1\|providerId=kinzai` | 未采集 | 1 级 PBT 学科出题形式 |

### it-passport（14）

| key                                                   | 状态   | 说明                     |
| ----------------------------------------------------- | ------ | ------------------------ |
| `it-passport\|application_rule\|deliveryMode=cbt`     | 未采集 | CBT 申込规则             |
| `it-passport\|booking_window\|deliveryMode=cbt`       | 未采集 | 预约期间                 |
| `it-passport\|eligibility\|deliveryMode=cbt`          | 未采集 | 受检资格                 |
| `it-passport\|exam_method\|deliveryMode=cbt`          | 未采集 | 试验方式                 |
| `it-passport\|exam_subjects\|deliveryMode=cbt`        | 未采集 | 试验科目                 |
| `it-passport\|exam_time\|deliveryMode=cbt`            | 未采集 | 试验时间                 |
| `it-passport\|fee\|deliveryMode=cbt`                  | 未采集 | 受检料                   |
| `it-passport\|official_verified_at\|deliveryMode=cbt` | 未采集 | 缺少可展示的公式确认时刻 |
| `it-passport\|passing_standard\|deliveryMode=cbt`     | 未采集 | 合格基准                 |
| `it-passport\|question_count\|deliveryMode=cbt`       | 未采集 | 问题数                   |
| `it-passport\|question_format\|deliveryMode=cbt`      | 未采集 | 出题形式                 |
| `it-passport\|scoring_method\|deliveryMode=cbt`       | 未采集 | 采点方式                 |
| `it-passport\|source_url\|deliveryMode=cbt`           | 未采集 | 缺少可展示的官方来源     |
| `it-passport\|venue_rule\|deliveryMode=cbt`           | 未采集 | 会场规则                 |

### takken（2）

| key                                                         | 状态   | 说明              |
| ----------------------------------------------------------- | ------ | ----------------- |
| `takken\|payment_deadline\|paymentMethod=convenience_store` | 未采集 | 便利店支付期限    |
| `takken\|payment_deadline\|paymentMethod=pay_easy`          | 未采集 | Pay-easy 支付期限 |

### 人工确认项

it-passport 的 14 键最可能属于“官方未公开/页面结构不提供”，而非采集遗漏；在确认官方页面之前，不应把它们移出基線，也不应伪造数据。

## 3. 生产已满足、但保留在基线的 28 个 gap keys

这些键在生产审计中不再出现。保留原因：CI 夹具（1007 facts）与 local dev 导出（1037 facts）是裁剪数据，仍可能缺这些事实；若从基線删除，CI/local 会把它们报成新缺口。

### bookkeeping（10）

```text
bookkeeping|official_verified_at|deliveryMode=network|examLevelId=bookkeeping:2
bookkeeping|official_verified_at|deliveryMode=network|examLevelId=bookkeeping:3
bookkeeping|official_verified_at|deliveryMode=unified|examLevelId=bookkeeping:1
bookkeeping|official_verified_at|deliveryMode=unified|examLevelId=bookkeeping:2
bookkeeping|official_verified_at|deliveryMode=unified|examLevelId=bookkeeping:3
bookkeeping|source_url|deliveryMode=network|examLevelId=bookkeeping:2
bookkeeping|source_url|deliveryMode=network|examLevelId=bookkeeping:3
bookkeeping|source_url|deliveryMode=unified|examLevelId=bookkeeping:1
bookkeeping|source_url|deliveryMode=unified|examLevelId=bookkeeping:2
bookkeeping|source_url|deliveryMode=unified|examLevelId=bookkeeping:3
```

### fp（12）

```text
fp|official_verified_at|deliveryMode=cbt|examComponent=academic|examLevelId=fp:2|providerId=jafp
fp|official_verified_at|deliveryMode=cbt|examComponent=academic|examLevelId=fp:3|providerId=jafp
fp|official_verified_at|deliveryMode=cbt|examComponent=practical:asset-design|examLevelId=fp:2|providerId=jafp
fp|official_verified_at|deliveryMode=cbt|examComponent=practical:asset-design|examLevelId=fp:3|providerId=jafp
fp|official_verified_at|deliveryMode=interview|examComponent=practical:asset-consulting|examLevelId=fp:1|providerId=kinzai
fp|official_verified_at|deliveryMode=pbt|examComponent=academic|examLevelId=fp:1|providerId=kinzai
fp|source_url|deliveryMode=cbt|examComponent=academic|examLevelId=fp:2|providerId=jafp
fp|source_url|deliveryMode=cbt|examComponent=academic|examLevelId=fp:3|providerId=jafp
fp|source_url|deliveryMode=cbt|examComponent=practical:asset-design|examLevelId=fp:2|providerId=jafp
fp|source_url|deliveryMode=cbt|examComponent=practical:asset-design|examLevelId=fp:3|providerId=jafp
fp|source_url|deliveryMode=interview|examComponent=practical:asset-consulting|examLevelId=fp:1|providerId=kinzai
fp|source_url|deliveryMode=pbt|examComponent=academic|examLevelId=fp:1|providerId=kinzai
```

### fundamental-it-engineer（2）

```text
fundamental-it-engineer|official_verified_at|deliveryMode=cbt
fundamental-it-engineer|source_url|deliveryMode=cbt
```

### gyoseishoshi（2）

```text
gyoseishoshi|official_verified_at
gyoseishoshi|source_url
```

### takken（2）

```text
takken|official_verified_at
takken|source_url
```

## 4. 代码级 gap（G-16）复核

| 项目                                   | 旧状态                  | 复核证据                                                                                                                                                                                     | 新状态 |
| -------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `change_events.operator_id` / `reason` | 矩阵记为“schema 未声明” | `packages/db/migrations/0021_change_event_audit.sql:7-8` 有列；`packages/db/src/schema.ts:333-334` 已声明 `operatorId` / `reason`；`services/api/src/release.ts:208` 已 INSERT；回滚脚本使用 | 已修复 |

## 5. local dev 的环境漂移（不属于基线）

local dev（1037 facts）单独多出 5 个缺口键，均属 bookkeeping 3 级统一试验：

- `bookkeeping|exam_subjects|deliveryMode=unified|examLevelId=bookkeeping:3`
- `bookkeeping|exam_time|deliveryMode=unified|examLevelId=bookkeeping:3`
- `bookkeeping|passing_standard|deliveryMode=unified|examLevelId=bookkeeping:3`
- `bookkeeping|question_count|deliveryMode=unified|examLevelId=bookkeeping:3`
- `bookkeeping|result_date|deliveryMode=unified|examLevelId=bookkeeping:3`

生产审计没有这 5 键；它们是本地夹具裁剪造成的差异。按 P1-05 要求，**没有自动加入 baseline**，继续由审计以“new gaps”检出（本地 `audit:mvp` exit 1）。

## 6. 复核方法与可重复性

```text
# 生产（只读，在 /opt/jpqm 运行）
docker compose -f deploy/docker-compose.prod.yml run --rm --no-deps -T api node scripts/audit-mvp.mjs

# 本地
node --env-file-if-exists=.env scripts/audit-mvp.mjs
```

- 基線匹配逻辑：`scripts/mvp-coverage.mjs` 的 `splitGapsAgainstBaseline()`（按 `slug|field|dimensions`，不含年度）。
- 质量评分：`scripts/quality-score-lib.mjs`（P1-04），不改变审计 exit code。
