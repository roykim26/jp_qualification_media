# P1-1 来源巡检、失败记录、告警、人工日检与数据更新流程方案

状态：2026-11-11 所有者拍板（巡检写库＝抓取不连库＋运营表落库；定时/通知＝全手动不安装），一期已实现并通过离线测试；真实库演练已完成（patrol→record→ops:daily 全链，facts 994／pending 0／`verify:all` 6/6 不变，运营表新增巡检记录保留；详见 checklist 同日演练条目）。待所有者验收与 commit/push/PR 授权。对应 `docs/mvp-execution-checklist.md` P1 第 1 项。

## 0. 已拍板口径（2026-11-11）

- **巡检写库**：抓取不连库＋运营表落库。巡检抓取沿用「采集不连库」总则；另设落库步骤，只写 `capture_runs`／`snapshots`／`source_checks` 三张运营表，localhost-only＋独立开关，绝不碰候选与事实。
- **定时与通知**：全手动，不装定时任务、不装外部通知。告警只体现在日报文件与退出码。将来如需 Windows 任务计划或外部通知，另行确认后实施。

## 1. 目标与边界

补上五个子项：统一来源巡检、连续失败记录、过期/失效告警、人工日检、生产数据更新 SOP。

硬边界（沿用现行总则，不突破）：

- 采集、候选入库、审核批准仍是三次独立授权，逐段明示；巡检抓取与巡检落库也各算一次授权。
- 不动 release baseline 与 CI 夹具（982）；不推断 `eligibility`／`passing_standard`／`scoring_method`；`venue_rule`／`booking_window`／`application_rule` 保持 `not_applicable`。
- `data:staleness` 保持只读；admin 写只认 `x-reviewer-id` 头。
- 巡检与日报不创建 revision、change event、页面更新时间，不产候选、不批准。
- 失效来源不自动改 `canonical_url`；新 URL 须所有者拍板后「代码＋迁移＋文档」同批改（FE cbt-s 先例）。
- 部署暂缓：本方案只到「数据就绪＋数据包导出备用」，不含任何上线执行。

## 2. 现状与缺口

已有地基：

- 迁移 0012 的 `source_checks`（四态 `unchanged/changed/failed/blocked`）与 `capture_runs`；`snapshots` 全溯源列。
- `SafeFetcher`（`http_policy.py`）：域名白名单、重定向逐跳校验（最多 3 跳）、超时、404 不重试、5xx/网络错误最多重试 2 次、ETag/Last-Modified 条件请求、5 MiB 上限。缓存是实例内存级，不跨运行。
- 六条采集链各有来源登记（`FUNDAMENTAL_IT_SOURCES` 等，形态统一为 `{source_id: {canonical_url, allowed_domain}}`；宅建为单条 `TAKKEN_SOURCE`）。
- `scripts/check-staleness.mjs`：只读列出到期事实（fee 90／eligibility 180／annual 365 天）与快照滞后来源（7 天）。

缺口：

1. `source_checks` 只有入库链写 `changed`；失败、未变化、失效从不落库 ⇒ 连续失败无数据可查。
2. 无统一巡检入口；六链分散，且没有「只检查、不产候选」的动作。
3. 失效无检测：404/410、重定向路径漂移（FE cbt-s 301 到公司首页的实例）不会留下任何记录。
4. 无告警分级与聚合报告；`data:staleness` 只出清单，不回答「今天先处理什么」。
5. 数据更新步骤散在 runbook 与各来源契约，无端到端 SOP。

## 3. 设计

### 3.1 来源注册表聚合（零新增 URL）

新增 `services/collector/src/collector/source_registry.py`：import 六链现有登记（含 `DIRECTLY_CITED_CAPTURE_SOURCES`、簿记 `STATISTICS_UNIFIED_SOURCES`），按 `source_id` 去重，标注资格与类型（html/pdf）。不新增、不改写任何 URL。

日报额外做只读差集：库 `sources` 有登记但注册表没有的来源列为「巡检覆盖缺口」，防止迁移登记的来源漏检。

### 3.2 巡检抓取 `patrol_sources.py`（不连库）

- 开关 `PATROL_LIVE_AUTHORIZED=1`，`NODE_ENV=production` 拒绝；每次运行需所有者明示（沿用采集授权口径）。
- 逐来源顺序抓取，默认间隔 1 秒（配置可调）；复用 `SafeFetcher`，不绕过策略。
- 持久缓存 `var/patrol/cache.json`：`source_id → {etag, last_modified, content_hash, checked_at}`。抓取前从缓存＋磁盘快照重建 `CacheEntry` 注入 `fetcher.cache`，使 304 跨运行生效、零正文下载；快照文件缺失则不发条件头直接 GET。不改 `SafeFetcher` 本体。
- 判定（每来源一条结果）：

| 抓取结果                                             | 巡检状态    | 说明                                                                                      |
| ---------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------- |
| 200 且 hash 与上次相同                               | `unchanged` | 不写快照文件                                                                              |
| 200 且 hash 不同                                     | `changed`   | 写快照到 `var/official-snapshots/<qual>/`（与现有采集链同目录，供后续入库复用），不产候选 |
| 304                                                  | `unchanged` | 复用磁盘正文                                                                              |
| 404／410                                             | `failed`    | 失效，单次即高级告警                                                                      |
| 网络错误／超时／5xx 重试耗尽／超限／跨域重定向被拒   | `failed`    | 记录 error 与 http_status                                                                 |
| 200 但最终 URL 路径 ≠ 登记路径（忽略尾斜杠与 query） | `blocked`   | 疑似改版/迁移，人工定新 URL，不自动改登记                                                 |

- 输出 `var/patrol/patrol-report.json`：按 `source_id` 合并（沿用 `capture_report` 模式），失败不擦除上次成功证据；每条含 `status/http_status/final_url/content_hash/error/checked_at/attempts`。
- 全程不连数据库。

### 3.3 巡检落库 `patrol_record.py`（只写运营表）

- 开关 `PATROL_LOCAL_WRITE=1`＋localhost/127.0.0.1 库＋`NODE_ENV≠production`；独立于抓取授权。
- 读 `patrol-report.json`，单事务写：
  - `capture_runs`：一次巡检一条（`capture-run:patrol:<run_id>`），全成功 `succeeded`、有失败但有成功 `partial`、全失败 `failed`，记 `request_count` 与错误汇总。
  - `snapshots`：仅 `changed` 来源的新快照，全溯源列，`(source_id,content_hash)` 幂等。
  - `source_checks`：每来源一条（`source-check:patrol:<source_id>:<run_id>`），四态＋`http_status`＋`message`；`changed` 必填 `snapshot_id`，其余可空；`ON CONFLICT DO NOTHING` 幂等。
- 绝不写 `candidate_facts`／`facts`／`fact_revisions`／`change_events`／`reviews`。

### 3.4 连续失败与告警分级（零新表）

从 `source_checks` 按来源倒序推导连续 `failed` streak（遇首个非 failed 截断），纯函数实现便于测试。阈值放 `config/source-ops.json`：

| 级别     | 触发                                                              |
| -------- | ----------------------------------------------------------------- |
| critical | 连续 failed ≥ 3；最近一次 `blocked`；最近一次 404/410（单次即报） |
| warning  | 连续 failed 1–2；来源 > 7 天无成功检查或从未检查；存在到期事实    |
| info     | 其余                                                              |

### 3.5 人工日检 `npm run ops:daily`（只读）

新增 `scripts/ops-daily-report.mjs`，`BEGIN READ ONLY` 单事务聚合：

1. 来源健康：每来源最近检查时间/状态、连续失败数、告警级。
2. 过期清单：把 `check-staleness.mjs` 的逻辑抽成 `scripts/staleness-lib.mjs` 共享（原命令输出 JSON 不变），日报复用。
3. 待审队列：各资格非合成 `pending_review` 计数。
4. facts 计数对 release baseline 的只读比对（只报告，不判失败）。
5. 巡检覆盖缺口（3.1 的差集）。

输出 `var/ops-reports/YYYY-MM-DD.json`＋`.md`；markdown 置顶「今日需处理」：critical → blocked → 待审 > 0 → 到期事实（按超期比例排序）。退出码：有 critical 为 1，否则 0；无库 `not_run` 为 0。不写库、不触发采集、不发外部请求。

日检 SOP（runbook 新节，每日约 5 分钟）：跑 `ops:daily` → 读「今日需处理」→ 决定是否发起巡检或进入数据更新流程。巡检建议每日一次手动跑（49 来源，304 居多，顺序限速）。

### 3.6 生产数据更新 SOP（runbook 新章节）

触发（日报 changed/blocked/critical、staleness 到期、官方公告）后的端到端流程，每步带命令与判据：

1. 采集授权（明示）→ 对应资格 capture 或 patrol。
2. 离线分析（analyze/precheck，不写库）。
3. 入库授权（明示）→ ingest，候选 `pending_review`。
4. 批准授权（明示）→ admin 以 `x-reviewer-id` 逐条对照官方原文批准。
5. `npm run build`＋`verify:all` 6/6。
6. 仅当 facts 计数变化：`baseline:update`＋`ci:fixture:export` 同批，同步 `verify-ci-fixture.mjs` 四处计数断言与 `docker-smoke.mjs` 冒烟断言，`ci:fixture:verify` 通过；同一 PR 进 main。
7. 全量回归绿 → commit → push（明示）→ PR（明示）→ 合并（「合并」明示）。
8. `pg_dump` 数据包导出备用；部署暂缓，不执行上线。

失效分支：`blocked`/404 来源不自动改 URL；所有者拍板新 URL 后代码＋迁移＋文档同批改，再回到第 1 步。

## 4. 改动清单

新增：`source_registry.py`、`patrol_sources.py`、`patrol_record.py`、`scripts/staleness-lib.mjs`、`scripts/ops-daily-report.mjs`、`config/source-ops.json`、pytest 与 node 测试、runbook 两节。

修改：`scripts/check-staleness.mjs`（改调共享库，输出不变）、`package.json`（加 `patrol:sources`／`patrol:record`／`ops:daily`）。

**零迁移、零 baseline/夹具改动。**

## 5. 测试与验收

离线（MockTransport／纯函数，不联网、不依赖库）：

- 四态判定：同 hash→unchanged、新 hash→changed＋快照文件、304→unchanged 零正文下载、404 不重试、410/5xx 耗尽→failed、同域路径漂移→blocked、跨域→failed。
- 报告合并：失败不擦除上次成功证据。
- record 守卫：缺开关/非 localhost/production 均拒绝；只写三张运营表（候选/事实计数不变断言）；幂等重跑零新增。
- streak 推导与分级：3 连败→critical、blocked→critical、404 单次→critical、2 连败→warning、遇 unchanged 截断。
- 日报聚合排序与「今日需处理」；`check-staleness` 重构后输出不变。

真实库演练（另行请示：启动容器＋抓取授权＋落库授权）：patrol→record→ops:daily 全链，核对四态落库与 streak 读数；facts 994、pending 0、`verify:all` 6/6 不变；运营表新增行属正常巡检记录，保留。

CI：新测试进现有 pytest／vitest 套件；不加 schedule job；夹具与 baseline 不动。

验收判据：注入连续 3 次失败的来源在日报列 critical；blocked 来源立即 critical；一次 unchanged 巡检不产生任何 revision/change event/页面更新时间变化。

## 6. 分期与不做

一期＝本方案全部。二期可选（另行确认）：admin 只读来源健康页、内容标记校验（期望关键词缺失→warning）、定时任务配置稿。

不做：不装定时/外部通知；不动 baseline/夹具；不推断三字段；不自动改来源 URL；不产候选、不批准；不含部署执行。

## 7. 拍板后执行顺序

1. 注册表＋patrol＋离线 pytest。
2. record＋守卫/幂等测试。
3. staleness-lib 抽取＋ops:daily＋node 测试。
4. config＋runbook 两节。
5. 全量回归（format/lint/typecheck/vitest/pytest/verify-gate）。
6. 真实库演练（单独请示）。
7. commit → push → PR（各需明示）。
