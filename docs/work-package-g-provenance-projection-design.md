# 工作包 G：公开溯源元数据投影设计

## 目标与边界

本设计把已经审核批准的事实所依赖的官方来源、不可变快照和审核决定，投影为公开读取模型中的溯源元数据。它不创建 `source_url` 或 `official_verified_at` 候选事实，也不修改任何候选、修订、正式事实、release baseline 或 CI fixture。

`source_url` 表示支撑该公开事实的登记来源 canonical URL；`official_verified_at` 表示该事实的人工审核确认时间。两者都是本站溯源元数据：它们绝不声称是官网页面的发布时间、更新时间或事实发生时间。快照的本地落盘时间也绝不能充当这两个字段中的任一个。

## 当前问题

`readApprovedFacts` 已能从 `sources.canonical_url` 和 `fact_revisions.verified_at` 返回 `sourceUrl`、`verifiedAt`，但：

- 覆盖门禁仍把 `source_url` 和 `official_verified_at` 当作需要候选事实键的字段；
- `fact_revisions.verified_at` 由批准写入时的 `now()` 产生，语义没有被显式标注为人工审核确认时间；
- `snapshots` 无法保存原始/最终 URL、响应状态、抓取头、页面标题、文本版本或采集器版本；
- 没有独立的来源巡检记录，因此不能判断来源是否过期，也不能把一次巡检误报为事实变化。

## 目标模型

### 1. 来源配置与适用范围

保留 `sources` 的 URL 与允许域名约束，并以新增字段补齐 `qualification_id`、`content_scope`、`update_cycle`、`parser_adapter`、`default_risk` 与 `created_at`。其中 `qualification_id` 是显式外键，不再依赖 `source_id` 前缀推断资格。

一项来源如覆盖多个资格或维度，使用单独的 `source_scopes` 表保存资格、可选的 provider/level/component/delivery mode 与 scope 描述；来源本身不得借此跨越允许域名。

### 2. 不可变快照与采集运行

保留 `snapshots.content_hash` 与 `(source_id, content_hash)` 幂等约束。新增元数据包括 `original_url`、`final_url`、`http_status`、`retrieved_at_utc`、`retrieved_at_jst`、`title`、`etag`、`last_modified`、经筛选的 `response_headers`、`text_version`、`collector_version` 与 `capture_run_id`。

新增 `capture_runs` 记录一次采集的开始/结束时间、状态、耗时、请求数、错误分类与来源检查结果。无论页面是否变更，巡检都可以新增一条 `source_checks`；它只引用来源及可选快照，绝不创建 revision、change event 或页面更新时间。

### 3. 审核和公开事实的溯源投影

公开事实继续只由当前 `facts → fact_revisions → candidate_facts` 的批准链产生。读取层额外连接：

```text
事实 → 当前修订 → 已批准候选 → 登记来源 → 不可变快照
                         └────→ approve 审核记录
```

投影规则如下：

| 公开字段                        | 值来源                                       | 允许条件                                                                                    |
| ------------------------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sourceUrl`                     | `sources.canonical_url`                      | 候选、修订、事实均为 approved；候选非 synthetic；快照存在；URL 为登记 HTTPS canonical URL。 |
| `officialVerifiedAt`            | 该候选的最终 `approve` 审核记录 `created_at` | 存在审核理由和审核人；无审核记录的历史数据应返回 `null`，不能回退为 CI 固定时间。           |
| `snapshotRetrievedAt`（管理端） | `snapshots.retrieved_at_utc`                 | 仅作为“本站捕获时间”；不得用于 `officialVerifiedAt`、官网发布时间或事实日期。               |
| `sourceLastCheckedAt`（管理端） | 最近成功 `source_checks.checked_at`          | 仅用于新鲜度门禁；不能改变公开事实、revision 或页面 `updated_at`。                          |

为兼容现有公开 API，`verifiedAt` 在迁移期继续返回，但其值改为上述 `officialVerifiedAt`。无法证明审核链的历史 fixture/事实应以 `null` 或明确的 `provenanceIncomplete` 标志暴露给管理端，绝不以 `2026-01-01` 填充。公开页面在值为 `null` 时显示“审核确认时间未迁移”，而不是“官方确认”。

## 门禁调整

覆盖契约中 `source_url` 与 `official_verified_at` 保留为必需字段，但它们走 `evaluateCoverage` 的 provenance resolver，不走 `fact_key` 匹配：

- `source_url`：同一年度与完整适用维度下，至少有一条批准的、非 synthetic 的事实，其登记 canonical URL 合法且快照存在。
- `official_verified_at`：同一范围内至少有一条上述事实，并有最终 `approve` 审核记录；以后可叠加来源巡检的新鲜度阈值。
- 业务字段仍只能由同维度批准事实（`fact_key` 或明确定义的别名，如 `exam_dates → exam_date`）满足。

因此 provenance 缺口应被报告为 `missing approved provenance`，不能诱导采集器生成伪造候选。CI fixture 可在“回归模式”豁免生产新鲜度，但不得豁免来源/快照/审核链结构校验；生产模式不得接受 `ci://` 对象地址。

## 迁移顺序

1. 已新增 `0012_source_provenance_metadata.sql` 与对应 Drizzle schema；它不改写历史事实，且尚未应用至任何数据库。
2. 用管理端只读审计列出每条已批准事实是否具备 source、snapshot、approve review、canonical HTTPS URL 和非 CI 对象地址。
3. 为历史真实审核记录建立可复核的 backfill 计划；没有可复核记录的项保持 incomplete，不能合成 review。
4. 增加公开读取的 provenance 投影与管理端来源健康视图。
5. 将覆盖门禁切换到 provenance resolver，并先以本地数据库验证；不更新 baseline/fixture。

公开读取与覆盖 resolver 已按双模式接入：`verified` 仅在 canonical HTTPS URL、非 CI/非 synthetic 快照、来源匹配、快照哈希、最终 `approve` 审核记录和审核时间全部存在时产生 `officialVerifiedAt`。`fixture` 只在快照对象地址为 `ci://` 时标注，且不产生 `officialVerifiedAt`。覆盖门禁只有在本次读取的所有公开事实都是 `fixture` 时才豁免 provenance；混合或真实读取均按生产规则阻断缺少的来源/快照/审核链。

## 验收测试

- 仅有 `source_url`/`official_verified_at` 伪候选时，门禁仍失败。
- 已批准业务事实有来源和快照、但没有 `approve` 审核记录时，`official_verified_at` 缺口明确出现。
- 本地快照写入时间、CI 的固定 `verified_at` 与 `ci://` 地址都不能满足生产 provenance 门禁。
- 新增一次“未变化”来源巡检只更新 `source_checks`，不创建 revision/change event，也不改变页面更新时间。
- 公开 API 不返回审核人、审核理由、响应头、对象路径或待审核候选内容；管理端可在授权下查看完整审计元数据。

## 首次只读审计结果（2026-09-11）

通过 `pnpm audit:provenance` 在 localhost PostgreSQL 的 `BEGIN READ ONLY` 事务中完成首次逐条审计。137 条当前公开事实中，83 条通过；54 条被阻断。阻断项全部来自既有 CI fixture 链：快照对象地址为 `ci://`，且没有最终 `approve` 审核记录或审核时间。按资格分布为日商簿记 38 条、基本信息技术者 8 条、IT Passport 2 条、宅建 6 条。

没有发现 canonical HTTPS URL、来源与快照不一致、synthetic snapshot 或快照哈希缺失的问题。该结果不能通过补写候选或伪造审核记录修复；CI fixture 与真实本地审核链必须继续隔离。

## 非目标

- 不补齐 JAFP/金财评分办法、报名期或其他业务字段。
- 不把 capture-only 内容写入候选或批准链。
- 不把网站页面发布日期、Last-Modified 或本地采集时间推断为事实日期。
- 不访问外部官网，不写 localhost 或生产数据库。
