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

## 2. 生产仍缺的 19 个 gap keys（本轮已解决 16 键，待发布生效）

### bookkeeping（1）

| key                                                                            | 状态   | 说明                                      |
| ------------------------------------------------------------------------------ | ------ | ----------------------------------------- |
| `bookkeeping\|question_count\|deliveryMode=unified\|examLevelId=bookkeeping:1` | 未采集 | 生产 1 级统一试验没有 question_count 事实 |

### fp（2）

| key                                                                                                  | 状态           | 说明                                      |
| ---------------------------------------------------------------------------------------------------- | -------------- | ----------------------------------------- |
| `fp\|question_count\|deliveryMode=pbt\|examComponent=academic\|examLevelId=fp:1\|providerId=kinzai`  | 契约拆分后闭合 | 官方只公开基礎編/応用編，已改按子维度判定 |
| `fp\|question_format\|deliveryMode=pbt\|examComponent=academic\|examLevelId=fp:1\|providerId=kinzai` | 契约拆分后闭合 | 同上                                      |

### it-passport（14）

| key                                                   | 状态             | 说明                                                         |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------ |
| `it-passport\|application_rule\|deliveryMode=cbt`     | 已补采           | 2026-11-28 按官方申込页原文建事实并批准                      |
| `it-passport\|booking_window\|deliveryMode=cbt`       | 已补采           | 2026-11-28 按 FAQ「最短で翌日、最長で3ヵ月先…」原文批准      |
| `it-passport\|eligibility\|deliveryMode=cbt`          | 维度回填后已满足 | 事实存在但 `delivery_mode` 为 NULL                           |
| `it-passport\|exam_method\|deliveryMode=cbt`          | 维度回填后已满足 | 同上                                                         |
| `it-passport\|exam_subjects\|deliveryMode=cbt`        | 维度回填后已满足 | 同上                                                         |
| `it-passport\|exam_time\|deliveryMode=cbt`            | 维度回填后已满足 | 同上                                                         |
| `it-passport\|fee\|deliveryMode=cbt`                  | 维度回填后已满足 | 同上                                                         |
| `it-passport\|official_verified_at\|deliveryMode=cbt` | 维度回填后已满足 | 溯源已 verified，回填后命中                                  |
| `it-passport\|passing_standard\|deliveryMode=cbt`     | 维度回填后已满足 | 同上                                                         |
| `it-passport\|question_count\|deliveryMode=cbt`       | 维度回填后已满足 | 同上                                                         |
| `it-passport\|question_format\|deliveryMode=cbt`      | 维度回填后已满足 | 同上                                                         |
| `it-passport\|scoring_method\|deliveryMode=cbt`       | 已补采           | 2026-11-28 解析官方 `試験要綱 Ver.5.6` PDF 的 IRT 原文并批准 |
| `it-passport\|source_url\|deliveryMode=cbt`           | 维度回填后已满足 | 官方来源 URL 已 verified，回填后命中                         |
| `it-passport\|venue_rule\|deliveryMode=cbt`           | 已补采           | 2026-11-28 按 FAQ「試験開催状況一覧…」原文批准               |

### takken（2）

| key                                                         | 状态   | 说明              |
| ----------------------------------------------------------- | ------ | ----------------- |
| `takken\|payment_deadline\|paymentMethod=convenience_store` | 未采集 | 便利店支付期限    |
| `takken\|payment_deadline\|paymentMethod=pay_easy`          | 未采集 | Pay-easy 支付期限 |

### 人工确认项

it-passport 的 14 键里，10 键**不是**官方未公开，而是已批准事实缺少 `delivery_mode` 维度（审计原先把它们标为 `dimensionMismatch`）。2026-11-28 已用迁移 `0033_it_passport_cbt_dimensions_backfill.sql` 回填为 `cbt`，本地审计 14 → 4 键。

随后按官方原文补采并批准 4 键（本地事实 9 → 13，迁移 `0034_it_passport_youkou_pdf_source.sql` 新增 PDF 来源）：

- `application_rule`：官方申込页「受験申込内容（試験会場、受験日時）の変更は、試験日の3日前まで行うことができます。」
- `scoring_method`：官方 `試験要綱 Ver.5.6` 第 4(1)「ITパスポート試験…においてはIRT（ItemResponseTheory：項目応答理論）に基づいて解答結果から評価点を算出する。」
- `booking_window`：官方 FAQ「申込み可能な試験日は、最短で翌日、最長で3ヵ月先…までとなります。」
- `venue_rule`：官方 FAQ「『受験申込み』の『試験開催状況一覧』から、都道府県ごとの試験会場の試験日、試験開始時間、座席数、空席数等が確認できます。」

至此 it-passport 的 14 个键全部闭合；以上均按官方原文片段登记，未推导数值。发布后生产剩余已知缺口为 3 键（bookkeeping:1 question_count、takken 2 条到期下架）。

### fp 契约粒度（2026-11-28 所有者确认）

kinzai `fp:1` PBT 学科官方只公开「基礎編 50問／応用編 5題」，不公开 academic 合计。已把 `question_count`／`question_format` 拆成 `academic:basic`／`academic:applied` 两条维度要求，其余字段保留在 `academic`；`limitedLaunchScopes` 同步增加两个子维度。不生成 55 的推导值，原本的 2 条 fp 缺口在本地与 CI 夹具均闭合。

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
