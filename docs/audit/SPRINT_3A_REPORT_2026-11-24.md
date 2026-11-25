# Sprint 3A 报告 — 数据可靠性与错误边界收敛

- 日期：2026-11-24
- 执行工具：DeepSeek Harness
- 仓库：`jp_qualification_media`
- 分支：`chore/phase1-baseline`
- 任务文档：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md`
- 本 Sprint 状态：**完成，已 commit（`4796f8b`），已停止**（未进入 Sprint 3B / Sprint 4）

---

## 1. 执行摘要

Sprint 3A 处理四件事，其中两件落地为代码，两件落地为证据与决策材料：

| Task | 内容                                   | 结果                                                                        |
| ---- | -------------------------------------- | --------------------------------------------------------------------------- |
| A    | 上游请求增加明确 timeout               | **已实现**，5000 ms，`fetchUpstream()` 与 `proxyIcs()` 两处，5 个新断言覆盖 |
| B    | `/sitemap.xml` 故障响应形态            | **已修复**，503 + `application/xml`，错误体不含 `<urlset>`                  |
| C    | `/pass-rate/` 失败粒度分析             | **只读分析完成**，产出方案 A / B 与推荐，**未修改代码**                     |
| D    | `databaseUrl` 缺失是否伪装成合法空数据 | **验证完成**，结论为「是，但 production 不可达」，**未修改代码**            |

改动规模：2 个文件，210 行新增 / 16 行删除（`apps/web/src/server.ts`、`tests/web-server.test.ts`）。测试从 199 → 203 全通过，docker smoke 11 项全 ok。

三项需要 Owner 注意的结论：

1. **Task A 的核心价值不是「加个超时」，而是让「挂起」与「拒绝」落到同一条 503 路径。** 改动前，一个 accept 了连接但永不应答的上游会让请求无限期挂住——既不发 503，也不发 `Retry-After`，浏览者与爬虫都只能干等。负向对照实验证明这是真实存在的差异（见 §5.4）。
2. **Task B 修的是「状态码对、载荷不可读」。** Sprint 2B 的 503 是对的，但复用了 HTML 错误页，已经按 XML 解析响应的爬虫拿到的是 HTML。现在错误体是合法 XML 且刻意不含 `<urlset>`。
3. **Task D 的风险面比任务文档假设的窄，但没有消失。** `packages/config` 在 production 下是硬门禁，`if (!databaseUrl) return []` 在 production 不可达；但 development 与非 production 部署仍可复现「配置错误 → 200 + 空数据」。量化影响见 §8.4 的受控对照：资格页从 sitemap 中**全部消失**，而对外仍是一个成功的 200 sitemap。

---

## 2. Git 状态

### 2.1 开工前

工作树携带 Sprint 1 与 Sprint 2 的全部未提交改动：

- 14 个 modified（tracked）
- 7 个 untracked（其中 6 个是本轮 Sprint 1/2 产物，1 个是本轮任务文档）
- `stash@{0}: pre-phase1-wip`（Sprint 2 之前留底的 9 个 tracked 改动，**未动**）
- `Python/` 未被 track，也未删除

逐路径审完 21 个文件的完整 diff 后确认：全部属于 Sprint 1/2，无环境文件、无临时件、无无关改动。

### 2.2 为什么是一个合并 commit 而不是两个

`apps/web/src/server.ts` 同一个文件里同时承载了：

- Sprint 1 的 `parsePassRateIndexQuery` 接线（G-02）
- Sprint 2B 的 `UpstreamUnavailableError` / `fetchUpstream` / `handleRequest` 导出（G-10 前半）

两批改动在同一文件内交错，无法在不重写历史的前提下可靠拆分成两个可独立构建的 commit。按任务文档 §3.2「无法可靠区分时可合并为一个 baseline commit」执行。

### 2.3 commit 结果

```
9a42cb4  feat: close sprint 1 and sprint 2 baseline
parent:  a319d46
21 files changed, 2586 insertions(+), 86 deletions(-)
```

commit 前先跑基线确认可提交：`typecheck` EXIT 0、`pnpm test` 18 files / 199 tests 全过、`test:verify-gate` 40/40。

commit 后 `git status --short` 只剩：

```
?? docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md
```

即本轮任务文档本身——Owner 下发的输入，不作为本 Sprint 产物提交。

> 过程记录（供以后避坑）：首次 commit 用 `Out-File -Encoding utf8` 写 message，导致 subject 首字节被 BOM 污染（`git log --format=%s` 显示 `﻿feat: ...`）。改用 `New-Object System.Text.UTF8Encoding($false)` + `[System.IO.File]::WriteAllText` 重写 message 后 `git commit --amend` 修正，并用 `Format-Hex` 验证 subject 为纯 ASCII。**PowerShell 写 git commit message 必须显式指定无 BOM UTF-8。**

### 2.4 Commit Gate（Owner 授权后执行）

Sprint 3A 报告提交后，Owner 批准了独立的 Commit Gate，只做一件事：把本轮两个文件提交上去。执行清单与结果：

| 步骤 | 内容                | 结果                                                                                               |
| ---- | ------------------- | -------------------------------------------------------------------------------------------------- |
| 1    | 确认 Sprint 3A diff | `git diff --stat` = 2 files changed, 210 insertions(+), 16 deletions(-)，与报告 §4 一致            |
| 2    | 再跑一次关键测试    | `typecheck` EXIT 0、`pnpm test` 18 files / **203** passed、`test:verify-gate` **40 pass / 0 fail** |
| 3    | commit              | `git add -- apps/web/src/server.ts tests/web-server.test.ts`（逐路径，未用 `-A`）                  |
| 4    | 确认工作树          | 只剩 2 个 untracked 文档，无遗留 modified                                                          |
| 5    | 记录 commit hash    | **`4796f8b`**                                                                                      |
| 6    | 停止                | 未开始任何新工作                                                                                   |

**Sprint 3A commit：`4796f8b`**（parent `9a42cb4`），2 files changed, 210 insertions(+), 16 deletions(-)。subject 经字节校验（`66 65 61 74 3A 20` = `feat: `）确认无 BOM。

### 2.5 仓库基线链

```
a319d46  docs: Phase 0 只读审计三份产出＋Sprint 1 文档基线对齐
   ↓
9a42cb4  feat: close sprint 1 and sprint 2 baseline      (21 files, +2586/-86)
   ↓
4796f8b  feat: bound upstream requests with a deadline and answer sitemap failures as XML   (2 files, +210/-16)
   ↓
下一轮（未开始）
```

三轮改动各自独立成 commit，回滚粒度与「哪一轮导致问题」的判断粒度对齐。

### 2.6 本轮结束时的工作树

```
?? docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md
?? docs/audit/SPRINT_3A_REPORT_2026-11-24.md
```

两个文档**未提交**，这是有意的：`DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 是 Owner 下发的输入；报告本身是否入库由 Owner 决定（Sprint 1/2 的报告与任务文档都在 `9a42cb4` 里入库了，所以若沿用惯例，这两份可在下一轮一并提交）。工作树无任何 tracked 改动遗留，基线干净。

---

## 3. Sprint 1 / Sprint 2 commit hash

| 内容                                | commit        |
| ----------------------------------- | ------------- |
| Sprint 1 + Sprint 2 合并 baseline   | **`9a42cb4`** |
| 其父提交（Sprint 1 之前的干净基线） | `a319d46`     |

任务文档要求报告提供 Sprint 1 与 Sprint 2 各自的 hash。由于两者被合并为单个 baseline commit（原因见 §2.2），**只有一个 hash**：`9a42cb4`。这是一个真实偏差，不是遗漏。

---

## 4. 修改文件

| 文件                       | 新增 | 删除 | 内容                                                                                                                                                 |
| -------------------------- | ---- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/server.ts`   | 112  | 5    | timeout 常量与解析、`isAbortOrTimeout()`、`renderSitemapError()`、`fetchUpstream()` 加 signal、`proxyIcs()` 加 signal、`/sitemap.xml` 分支加故障出口 |
| `tests/web-server.test.ts` | 114  | 3    | `StubMode` 增 `hang`、stalled 连接清理、`startWeb` 支持注入 deadline、4 个新用例、1 个断言改写                                                       |

未触碰：`apps/web/src/render.ts`、`apps/web/src/layout.ts`、`apps/web/src/sitemap.ts`、`services/**`、`packages/**`、`deploy/**`、Caddyfile、任何 migration、任何 fixture、任何 schema。

---

## 5. Timeout 处理（Task A）

### 5.1 值的选择：5000 ms

任务文档建议 5–8 秒。选定 **5000 ms**，理由三条：

1. **与代码库已有的唯一超时对齐。** `services/api/src/public-facts.ts:60`、`public-updates.ts:13` 都是 `connectionTimeoutMillis: 5000`。一个数字描述同一件事——「来源没有应答」——比两个数字更容易推理和排查。
2. **上游健康时是毫秒级，5 秒是三个数量级的余量，不是紧预算。** 上游是同 Docker 网络的兄弟容器，跑单条带索引的 SQL。5 秒不是「刚好够」，而是「远超正常，仍远低于人类忍耐上限」。
3. **它让 fan-out 路由有界。** `/`、`/pass-rate/`、`/sitemap.xml` 都并行拉取全部 6 个资格，所以墙钟时间是一个 timeout 而不是 N 个（6 × 5 s = 30 s 的最坏情况不会发生）。最坏 5 秒仍在 `deploy/docker-compose.prod.yml` 的 web healthcheck 窗口内（timeout 5s / retries 12 / interval 15s），不会因为一次上游挂起就把容器判死。

### 5.2 改动点

`apps/web/src/server.ts` 只有两处 `fetch`，两处都加了 deadline：

```ts
// fetchUpstream() —— 被 readQualification / readCalendar / readComparison / readUpdates 共用
response = await fetch(input, {
  signal: AbortSignal.timeout(upstreamTimeoutMs),
});

// proxyIcs() —— 唯一不经过 fetchUpstream 的 fetch
response = await fetch(`${apiBaseUrl}${apiPath}`, {
  signal: AbortSignal.timeout(upstreamTimeoutMs),
});
```

没有逐 route 实现，没有引入依赖（`AbortSignal.timeout()` 是 Node 内置，`@types/node` 24.13.3 / Node v24.14.0 完全支持）。

**signal 同时覆盖 body 读取。** 上游发完 header 后卡在 payload 中间时，`response.json()` 会在同一 deadline 上拒绝，半个响应不可能被当作数据解析。

### 5.3 错误分类

```ts
function isAbortOrTimeout(error: unknown): boolean {
  const name = (error as { name?: unknown } | null | undefined)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}
```

`AbortSignal.timeout()` 抛 `TimeoutError`，被中断的 body 流抛 `AbortError`。两者都意味着「我们自己设的 deadline 到了」，不是「载荷格式错误」。两者都抛 `UpstreamUnavailableError`，因此落进既有的 503 + `Retry-After: 60` 路径，与连接失败完全同一条出口。

### 5.4 负向对照实验

为排除「测试之所以通过是因为 stub 主动结束了请求」这一可能，做了独立对照（`var/tmp-timeout-control.mjs`，对同一个只 accept 不应答的 server）：

```
plain fetch  : STILL HANGING after 1500ms
signal fetch : rejected:TimeoutError in 256 ms
```

裸 `fetch` 在 1500 ms 后仍未返回；带 `AbortSignal.timeout(250)` 的在 256 ms 抛 `TimeoutError`。差异来自 deadline，不来自 stub。

### 5.5 状态矩阵验证

| 场景                        | 期望                        | 实测                                   |
| --------------------------- | --------------------------- | -------------------------------------- |
| 上游正常有数据              | 200                         | 200                                    |
| 上游合法空数据              | 200                         | 200                                    |
| 上游 5xx                    | 503 + `Retry-After: 60`     | 503 + `Retry-After: 60`                |
| 连接失败（端口无人监听）    | 503                         | 503                                    |
| **挂起（accept 后不应答）** | **503 + `Retry-After: 60`** | **503 + `Retry-After: 60`，314 ms 内** |
| 挂起 + ICS 下载             | 503                         | 503 + `Retry-After: 60`                |
| 恢复                        | 200                         | 200                                    |

`/` 在所有故障场景下保持 200（`Promise.allSettled` 降级路径未受影响）——这是硬约束，因为 compose 的 web healthcheck 打的就是 `/`。

---

## 6. Sitemap 处理（Task B）

### 6.1 问题

Sprint 2B 让 `/sitemap.xml` 在故障时返回 503 —— 状态码是对的。但响应体复用了全局 catch 里的 `renderErrorPage()`，即 `text/html` 的日文错误页。已经按 XML 解析响应的爬虫拿到一个 HTML 文档。

### 6.2 修复

`/sitemap.xml` 分支现在有独立出口：

```ts
if (error instanceof UpstreamUnavailableError) {
  res.writeHead(503, {
    'content-type': 'application/xml; charset=utf-8',
    'retry-after': '60',
  });
  return res.end(renderSitemapError());
}
```

错误体：

```xml
<?xml version="1.0" encoding="UTF-8"?>
<error xmlns="http://shikakucheck.com/ns/sitemap-error"><message>temporarily unavailable</message><retryAfterSeconds>60</retryAfterSeconds></error>
```

### 6.3 为什么错误体刻意不带 `<urlset>`

一个空的 `<urlset>` 是一个**成功的** sitemap，声称「本站没有任何页面」。那正是 503 要防止的误读。所以错误体必须是合法 XML（解析器不会报语法错）、必须是 503（不会被视为成功）、且必须不带 `<urlset>`（不会被读成「全站空」）。三条同时成立才叫「以 sitemap 的形态失败」。

### 6.4 验证

| 场景     | 状态 | content-type      | 含 `<urlset>` | 含 `<loc>`  | `Retry-After` |
| -------- | ---- | ----------------- | ------------- | ----------- | ------------- |
| 健康     | 200  | `application/xml` | 是            | 是（52 条） | —             |
| 上游 5xx | 503  | `application/xml` | **否**        | **否**      | 60            |
| 上游挂起 | 503  | `application/xml` | **否**        | —           | 60            |

故障体同时断言不含日文报错文案，确认没有回退到 HTML 页。

---

## 7. `/pass-rate/` A/B 方案（Task C）

**本节只读分析，未修改任何生产代码。** 任务文档明确禁止在未获 Owner 同意前改动该行为。

### 7.1 当前行为（实证）

`apps/web/src/server.ts` 的 `/pass-rate/` 分支用 `Promise.all` 并行读取全部 6 个资格（`launchQualifications.length === 6`：宅建 / 行政書士 / IT パスポート / 基本情報 / 簿記 / FP）。

实验：让 stub 只对 `fp` 返回 500，其余 5 个正常，跑 `dist` 版本：

| 请求                                    | 结果                                               |
| --------------------------------------- | -------------------------------------------------- |
| `/pass-rate/`                           | **503**，`text/html`，`Retry-After: 60`，outage 页 |
| `/pass-rate/?sort=pass_rate&order=desc` | 503（同上）                                        |
| `/shikaku/fp/pass-rate/`                | 503（该资格确实失败，合理）                        |
| `/shikaku/takken/pass-rate/`            | **200**（正常资格不受影响）                        |
| `/`                                     | **200**（`Promise.allSettled` 降级）               |

结论：**1 个资格故障 → 整站合格率索引 503，另外 5 个正常资格的数据一并不可见。**

### 7.2 六个分析维度

**① 一次请求多少资格？** 6 个，硬编码来自 `launchQualifications`，不随 URL 参数变化。

**② 6 个读取是否相互独立？** 是。每个资格一次独立的 `GET /api/v1/qualifications/{slug}`，无共享状态、无依赖顺序、无事务语义。这正是 `Promise.allSettled` 的适用前提。

**③ 能否独立渲染？** 能。`renderPassRateIndex()` 的 `rows` 由 `buildHistoryGroups(view.facts)` 逐资格生成，一个资格的空 `facts` 只会让那一行消失或落到空态，不需要其它资格的数据。**渲染层没有跨资格耦合。**

**④ `Promise.allSettled` 是否适用？** 技术上完全适用，改动量小（一个 `all` → `allSettled`，一个 `rejected` 分支，一个「暂不可用」行状态）。**没有技术障碍。**

**⑤ SEO 影响。** 这是关键的一条，且比直觉更轻：

- 当前页面的 structured data 只有 `WebPage` + `BreadcrumbList`（实测 `@graph` 类型为 `WebPage, BreadcrumbList`），**不包含任何 `ItemList` / `Qualification` 节点，也不含任何资格名称**（实测 `ld+json` 正文不匹配任何资格名）。所以「部分数据缺失」**不会污染结构化数据**——没有结构化数据可污染。
- 风险在于另一种情况：如果上游是**长期**故障而页面持续 200，搜索引擎会重新抓取并可能把「只剩 1 行」的版本当作该 URL 的真实内容索引，覆盖掉完整版本。而 503 是搜索引擎明确定义的「暂时不可用，保留旧索引」信号。
- 但注意：这个风险在方案 B 下**只在长期故障时**成立；短期抖动下 503 反而会让索引保留旧快照，是更好的选择。

**⑥ 用户体验。** 方案 A 下，一个资格的上游抖动让整页变成错误页——用户失去另外 5 个正常资格的信息。方案 B 下，用户看到 5 行真数据 + 1 行「暫くご利用いただけません」。

**⑦ 实施成本。** 方案 B：`Promise.all` → `Promise.allSettled`（约 10 行）、渲染层加一个「暂不可用」行状态（约 10 行）、测试 2–3 条、ADR 0002 §4 需同步修订。约半天。方案 A：零成本。

### 7.3 方案 A —— 保持整页 503

**做法**：不改。

**优点**

- 语义干净：「这个页面现在不能诚实地回答，所以不回答」。
- 搜索引擎信号明确：503 保留旧索引，不会被部分数据覆盖。
- 零风险、零成本、零回归面。
- 与 ADR 0002 §4 现行条文一致。

**缺点**

- 5 个正常资格的数据被 1 个故障拖累，用户体验差。
- `/pass-rate/` 是全站少数几个「聚合视图」，单点故障放大成全页故障。
- 上游是兄弟容器，一次重启/迁移窗口内所有并发请求都会 503。

**适用条件**：上游故障是短时、低频事件；或者 Owner 认为「宁可整页不可用，也不要部分正确」。

### 7.4 方案 B —— 部分成功 + 200

**做法**：`Promise.all` → `Promise.allSettled`；成功资格正常渲染，失败资格渲染一行「暫くご利用いただけません」（不参与排序、不出现在任何比较结论里）；页面仍 200。

**优点**

- 单点故障不再放大：5 个资格照常可用。
- 与 `/` 的既有降级策略（`Promise.allSettled` + 空模块 + 恒 200）一致，全站错误处理哲学统一。
- 结构化数据无污染风险（见 7.2 ⑤：本页没有 per-qualification 结构化数据）。

**缺点**

- **200 意味着「这是该 URL 的当前真相」，长期故障下部分数据可能被索引。** 这是方案 B 的真实代价，不是理论风险。
- 需要新增「部分不可用」的视觉与文案状态，是新的设计面（虽然很小）。
- 需要同步修订 ADR 0002 §4 与相关断言，否则文档与实现漂移（G-13 那类问题会重现）。
- 排序语义变复杂：`?sort=pass_rate` 时缺失行排在哪里？必须定义。

### 7.5 推荐意见

**推荐方案 A（保持整页 503），并给方案 B 留一个明确的触发条件。**

理由：

1. **本轮 Sprint 的立身之本是「证据优先、最小修改」。** 方案 B 是一个产品决策，不是一个 bug 修复。它改变的是「这个页面承诺什么」，而不是「这个页面是否出错」。这种改动应该在 Owner 明确产品意图后做，而不是在可靠性收敛的 Sprint 里顺带做掉。
2. **`/pass-rate/` 是聚合视图，聚合视图的 503 是可辩护的。** 用户访问 `/pass-rate/` 的意图是「横向比较全部资格」。只有 5 行时，这个意图**已经无法满足**——给 200 反而是在用一个看似完整的表格回答一个它答不了的问题。逐资格页 `/shikaku/{slug}/pass-rate/` 在方案 A 下已经是 200 或 503 独立判定（实测 `takken` 200 / `fp` 503），所以「想看某个资格」的用户路径**没有被堵住**。
3. **503 的 SEO 语义在这里恰好是我们想要的。** 聚合页的部分数据长期缺失会污染索引，而 503 保留旧快照。在本页没有 per-qualification 结构化数据的前提下，503 的 SEO 代价接近于零，收益明确。
4. **方案 B 的成本不只是代码。** 它要定义排序语义、新增 UI 状态、修订 ADR、加断言。这些都不是「10 行改动」能覆盖的，而是一个小型的独立议题。

**给方案 B 的触发条件（建议 Owner 记下）**：如果生产观测到 `/pass-rate/` 的 503 中，**超过一半**由「单资格故障」而非「API 整体不可用」引起，那么方案 A 的成本（整页不可用）就开始超过方案 B 的成本（索引污染风险），届时应切到方案 B。

---

## 8. `databaseUrl` 问题（Task D）

**本节只读验证，未修改任何代码。**

### 8.1 代码事实

`services/api/src/public-facts.ts`：

```ts
// :69  readApprovedFacts(databaseUrl?, qualificationSlug?)
if (!databaseUrl) return [];

// :143 readPendingFactCoverage(databaseUrl?, qualificationSlug?)
if (!databaseUrl || !qualificationSlug) return [];
```

API 层（`services/api/src/server.ts`）没有任何 `!databaseUrl` 的 5xx 分支——所有路由把 `config.apiDatabaseUrl` 直接传进去。

### 8.2 实测：确实伪装成合法空数据

| 层                                            | 实测结果                                                                        |
| --------------------------------------------- | ------------------------------------------------------------------------------- |
| `readApprovedFacts(undefined, 'it-passport')` | `[]`，正常 resolve，不抛错                                                      |
| `readApprovedFacts(undefined)`                | `[]`，正常 resolve，不抛错                                                      |
| `readPendingFactCoverage(undefined, ...)`     | `[]`，正常 resolve，不抛错                                                      |
| `GET /api/v1/qualifications/it-passport`      | **200**，`status: "awaiting_official"`，`facts.length: 0`，`missingReasons: {}` |
| `/shikaku/it-passport/`                       | **200**，无 outage 页                                                           |
| `/pass-rate/`                                 | **200**，走空态「公開できる合格率データはまだありません」                       |
| `/sitemap.xml`                                | **200**，不报错                                                                 |

**「部署配错」与「确实还没有数据」在 API 层与 Web 层完全同形，无法从响应区分。**

### 8.3 关键缓解事实：production 下不可达

`packages/config/src/index.ts` 在 production 下是硬门禁。实测四种组合：

| 环境        | 配置                    | 结果                                            |
| ----------- | ----------------------- | ----------------------------------------------- |
| production  | 两者都不设              | 抛 `DATABASE_URL is required in production`     |
| production  | 只设 `DATABASE_URL`     | 抛 `API_DATABASE_URL is required in production` |
| production  | 只设 `API_DATABASE_URL` | 抛 `DATABASE_URL is required in production`     |
| production  | 两者都设                | 正常                                            |
| development | 都不设                  | 正常导入，`apiDatabaseUrl = undefined`          |

**因此 `if (!databaseUrl) return []` 在 production 不可达。** 任务文档假设的「生产配置缺失 → 静默空数据」这一路径，被配置层的硬门禁挡住了。

### 8.4 剩余风险面

风险没有消失，只是换了位置：

1. **development / 非 production 部署**（例如未设 `NODE_ENV=production` 的容器、预览环境）可以复现完整的「配置错误 → 200 + 空数据」链路。
2. **运行期 DB 连接失败**是另一个入口：配置存在但连不上时，`pool.query()` 会抛错并走 Fastify 的 5xx，这条路径**是安全的**（不是静默空）。所以真正的静默风险只限于「变量本身为空」。
3. **量化影响**（受控对照：同一 web，两种 API 形态。此处用 stub API 以隔离变量，故 `<loc>` 绝对数与真实库的 52 条不同）：有数据时 sitemap 29 条 `<loc>`（其中资格页 6 条），`/pass-rate/` 表格 6 行，无空态；`databaseUrl` 缺失时 sitemap 降至 23 条 `<loc>`，**资格页 0 条**，`/pass-rate/` 表格 0 行，出现空态文案。对外仍是一个**成功的 200 sitemap**。这是最隐蔽的一层：搜索引擎会认为这 6 个页面被作者主动移除了。

### 8.5 建议（未实施）

按任务文档「默认不修改」，本轮不动。若 Owner 决定处理，最小改动是让 `readApprovedFacts` / `readPendingFactCoverage` 在**显式传入 `undefined` 且非测试环境**时抛错而非返回 `[]`，把「没有配置」与「没有数据」在源头分开。这需要同步调整 API 层错误映射与若干测试，属于独立议题。

---

## 9. SEO 回归

用真实 Fastify API + 本地 docker DB（`jpqm-pg18`）+ `SITE_ORIGIN=https://shikakucheck.com` 跑全量探针。sitemap 共 **52** 条 `<loc>`。

| 路径                                        | 状态 | robots      | canonical                         | 在 sitemap | ld+json |
| ------------------------------------------- | ---- | ----------- | --------------------------------- | ---------- | ------- |
| `/`                                         | 200  | indexable   | 自指                              | 是         | 是      |
| `/shikaku/`                                 | 200  | indexable   | 自指                              | 是         | 是      |
| `/pass-rate/`                               | 200  | indexable   | `/pass-rate/`                     | 是         | 是      |
| `/pass-rate/?sort=pass_rate&order=desc`     | 200  | **noindex** | `/pass-rate/`                     | 是         | 否      |
| `/pass-rate/?order=asc`                     | 200  | **noindex** | `/pass-rate/`                     | 是         | 否      |
| `/pass-rate/?sort=drop_table`               | 200  | **noindex** | `/pass-rate/`                     | 是         | 否      |
| `/schedule/`                                | 200  | indexable   | 自指                              | 是         | 是      |
| `/schedule/?year=2026`                      | 200  | **noindex** | `/schedule/`                      | 是         | 否      |
| `/shikaku/takken/2025/`                     | 200  | **noindex** | 自指                              | 否         | 否      |
| `/shikaku/takken/2027/`                     | 200  | **noindex** | 自指                              | 否         | 否      |
| `/shikaku/takken/2030/`                     | 200  | **noindex** | 自指                              | 否         | 否      |
| `/shikaku/fp/pass-rate/`                    | 200  | indexable   | 自指                              | 是         | 是      |
| `/shikaku/gyoseishoshi/pass-rate/`          | 200  | indexable   | 自指                              | 是         | 是      |
| `/shikaku/it-passport/pass-rate/`           | 200  | indexable   | 自指                              | 是         | 是      |
| `/shikaku/it-passport/pass-rate/?year=2025` | 200  | **noindex** | `/shikaku/it-passport/pass-rate/` | 是         | 否      |

全部符合任务文档 §9 与 ADR 0002 的既定索引策略。**Task A / Task B 的改动没有改变任何一条索引状态**——这是预期的，因为两处改动都只影响故障路径，不影响成功路径的输出。

补充验证：`/pass-rate/` 页面 `@graph` 类型为 `WebPage, BreadcrumbList`，不含资格名，确认无 per-qualification 结构化数据（§7.2 ⑤ 的结论依据）。noindex 页一律无 `ld+json`，与 ADR 0002 §5 的实现约束一致（`apps/web/src/layout.ts:258-260`）。

---

## 10. 完整测试结果

全部真实执行，非推断。

| 命令                                              | 结果                                                                                                                    |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                              | **EXIT 0**                                                                                                              |
| `pnpm test`                                       | **18 files / 203 tests passed**（改前 199，本 Sprint +4）                                                               |
| `pnpm run test:verify-gate`                       | **40 / 40 passed**                                                                                                      |
| `pnpm run build`                                  | **EXIT 0**                                                                                                              |
| `pnpm run format:check`                           | **EXIT 1** — 见下方说明                                                                                                 |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | **EXIT 0**                                                                                                              |
| `pnpm run test:python`                            | **239 passed** in 6.66s                                                                                                 |
| `pnpm run verify:all`                             | **EXIT 0**，`{"status":"passed","qualifications":6,"passed":6,"failed":0}`，各资格 approved_official 16/15/10/28/863/75 |
| `pnpm run smoke:docker`                           | **EXIT 0**，11 项全 ok，末行 `docker smoke passed`                                                                      |

`verify:all` 与 `smoke:docker` 均显式设 `DATABASE_URL` 与 `API_DATABASE_URL` 为 `postgresql://postgres@127.0.0.1:55432/qualification_media`（`.env` 里的 `localhost:5432` 在本机不存在，必须覆盖）。

`smoke:docker` 关键项包括：「the image restores the 1007 approved facts」「the sitemap lists indexable qualification pages」「the pass-rate sort variants stay noindex」——即真实生产镜像内的事实数与索引策略均未回归。

### 关于 `format:check` 的 EXIT 1

唯一失败文件是 `docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md`——Owner 下发的、**git 未跟踪**的任务文档，不是本 Sprint 产物。验证方式：

```
prettier --check <与 format:check 完全相同的 glob 集，外加 !docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md>
→ All matched files use Prettier code style!  (EXIT 0)
```

本 Sprint 的两个文件（`apps/web/src/server.ts`、`tests/web-server.test.ts`）已 `prettier --write`，在排除任务文档后格式检查通过。

**没有为了让 `format:check` 变绿去格式化 Owner 的输入文件**——那会改动一份未跟踪的、属于 Owner 的文档。

### 新增测试清单（4 条）

1. `answers 503 when the upstream accepts the connection but never answers` — 挂起 → 503 + `Retry-After: 60` + noindex + outage 页，且耗时 < 5000 ms（证明是 deadline 结束了请求）
2. `serves the sitemap as XML with urlset when the upstream is healthy` — 200 + `application/xml` + 含 `<urlset>` / `<loc>`
3. `answers the sitemap with 503 + XML and no urlset when the upstream fails` — 5xx 场景，断言 content-type、无 `<urlset>`、无 `<loc>`、无日文报错、有 XML 声明（原 Sprint 2B 用例的断言由 `text/html` 改写为 `application/xml`）
4. `answers the sitemap with 503 + XML when the upstream never answers` + `answers 503 for an ICS download when the upstream never answers` — 挂起场景的 sitemap 与 ICS 两条路径

测试基建改造：`StubMode` 增 `hang`（accept 连接后永不应答），`stalledResponses` 集合在 teardown 时 `destroy()` + `closeAllConnections()`，避免 `stubServer.close()` 被挂起连接永久阻塞；`startWeb()` 支持注入 `upstreamTimeoutMs`，使超时用例无需 sleep 生产值。

---

## 11. 未处理问题

按任务文档要求，以下**有意未处理**：

1. **`/pass-rate/` 失败粒度**（Task C）——只分析，未改。等 Owner 决策（推荐方案 A，见 §7.5）。
2. **`if (!databaseUrl) return []`**（Task D）——只验证，未改。production 不可达，但 development / 非 production 部署仍有风险面（§8.4）。
3. **Sprint 3A 代码未 commit**——需单独授权（§2.4）。
4. **`docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 格式不符合 prettier**——Owner 的输入文件，不代改。
5. **V2_GAP_MATRIX 中 G-03 / G-04 / G-06 等待 Owner 拍板项**——本轮范围外。
6. **G-15 测试缺口**（`server.ts` 的 19 条路由无进程级测试）——本轮只补了 timeout 与 sitemap 两条故障路径，未系统性补齐。

---

## 12. 风险

| 风险                                                                        | 评估                                                                              | 缓解                                                                         |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 5000 ms 对极慢的上游偏紧                                                    | **低**。上游是同网络兄弟容器 + 单条索引 SQL，健康响应毫秒级；5 秒是三个数量级余量 | `UPSTREAM_TIMEOUT_MS` 可注入；若生产观测到超时误判，调高即可，无需改代码结构 |
| timeout 生效后，慢请求从「成功但很慢」变成「503」                           | **低但真实**。这是行为变更，不是纯增益                                            | 503 是诚实的信号；且 `Retry-After: 60` 让客户端知道何时重试                  |
| sitemap 错误体使用自定义命名空间 `http://shikakucheck.com/ns/sitemap-error` | **低**。非标准 sitemap schema，但 503 响应本来就不该被当作 sitemap 解析           | 错误体不带 `<urlset>`，任何合规解析器都不会把它读成页面列表                  |
| `/pass-rate/` 单点故障放大（未修）                                          | **中**。这是本轮确认但不处理的最大可用性缺口                                      | 已在 §7 给出 A/B 与触发条件，等 Owner 决策                                   |
| `databaseUrl` 静默空数据（未修）                                            | **低**（production 门禁挡住）/ **中**（非 production 部署）                       | 已在 §8 给出最小改法建议                                                     |
| Commit Gate 已闭合                                                          | **无**。`4796f8b` 已入库，工作树无 tracked 改动遗留                               | —                                                                            |

---

## 13. 下一步建议

按优先级，全部**等待 Owner 决策**，本轮不执行：

1. ~~**授权 commit Sprint 3A 的两个文件改动**~~ —— **已完成**，commit `4796f8b`（§2.4）。
2. **对 Task C 做出产品决策**：维持方案 A，或批准方案 B（需同时定义排序语义、UI 状态、ADR 修订）。§7.5 给出了方案 B 的触发条件，可作为观测指标。**Owner 已表态保留方案 A**（不改）。
3. **决定是否处理 `databaseUrl` 静默空数据**：最小改法是让「显式 undefined」在非测试环境抛错，把配置缺失与合法空数据在源头分开。**Owner 列为第二优先级，尚未决定是否开工。**
4. **考虑给 `/pass-rate/` 的 503 加监控**：当前没有指标区分「API 整体不可用」与「单资格故障」，而 §7.5 的触发条件依赖这个区分。
5. **G-15 测试缺口**：`server.ts` 的 19 条路由仍无进程级测试，是下一轮可靠性的合理候选。

---

## 14. 停止声明

**Sprint 3A 到此结束。**

本轮完成了任务文档规定的 Task A / B / C / D 全部内容：两处代码改动已实现并验证，两项分析已产出结论与建议，报告已归档。

**代码已入库：commit `4796f8b`（parent `9a42cb4`），2 files changed, +210/-16。** 仓库基线链现为 `a319d46 → 9a42cb4 → 4796f8b`，三轮改动各自独立成 commit，回滚粒度与归因粒度对齐。

未进入 Sprint 3B、未进入 Sprint 4、未做首页 / `/shikaku/` / 资格详情页改版、未做内链重构、未新增资格、未扩充到 30 个资格、未做宅建统计入库、未改数据 schema、未操作生产数据库、未改 Caddy / Docker 架构 / CDN、未做 URL 重构、未做无尾斜杠 301、未动年度页 301/404、未做薄 Pass Rate 页面清理、未改 GSC / Bing / GA4。

下一轮的范围由 Owner 根据本报告重新决定。
