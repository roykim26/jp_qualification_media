# Sprint 3B 执行报告 — 配置缺失与就绪探针

- 日期：2026-11-24
- 仓库：`jp_qualification_media`
- 分支：`chore/phase1-baseline`
- 执行工具：DeepSeek Harness
- 任务文档：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3B_TASK.md`
- 上游基线：`013e680`（Sprint 3A 文档落账）

---

## §1 执行摘要

Sprint 3B 修掉的是 Sprint 3A 报告 §11 与 §13 里挂着的第二优先级问题：**「数据库配置缺失」被公开 API 伪装成「合法的空数据」**。

改造前，`services/api/src/public-facts.ts:69`、`:143` 与 `public-updates.ts:30` 三处都有 `if (!databaseUrl) return []`，`server.ts` 的 takken 路由还有第四处 `if (config.apiDatabaseUrl)` 分支。后果是：配置缺失时 API 一路 200 + 空数组，web 层一路 200 + 空态，`/sitemap.xml` 甚至以 **200** 返回一份**主动移除全部 6 个资格页**的 sitemap。这是「成功的 sitemap 声称全站只有 23 个页面」。

本轮把这个错误从「伪装成正常」变成「明确不可用」，并新增一个独立的就绪探针补上观测能力。

四项任务的落地情况：

| Task | 内容                                               | 状态 |
| ---- | -------------------------------------------------- | ---- |
| A    | 配置缺失分离（三处 fail-empty + 一处条件分支收敛） | 完成 |
| B    | 新增 `GET /ready` 就绪探针；`/health` 一字不改     | 完成 |
| C    | `docs/api-contract.md` 与 `docs/runbook.md` 同步   | 完成 |
| D    | 三形态 × 10 路由回归矩阵 + 18 个新测试             | 完成 |

**核心收益实测**（同一 web 层，三种 API 形态）：

| 场景                         | `/pass-rate/`     | `/shikaku/it-passport/` | `/sitemap.xml` | sitemap 条目        |
| ---------------------------- | ----------------- | ----------------------- | -------------- | ------------------- |
| 正常                         | 200               | 200                     | 200            | 52（含 6 个资格页） |
| DB 不可达                    | 503 + noindex     | 503 + noindex           | 503            | —                   |
| 配置缺失（本轮修的就是这个） | **503 + noindex** | **503 + noindex**       | **503**        | —                   |

对照 Sprint 3A 实测的配置缺失形态（`/pass-rate/` 200 + 空态、`/shikaku/it-passport/` 200、`/sitemap.xml` **200 但资格页 6→0**），本轮把整条链路统一到了明确的失败态。

---

## §2 Git 状态

### 2.1 开工前

```text
HEAD          = 013e680  docs: 落账 Sprint 3A 任务文档与执行报告
分支          = chore/phase1-baseline
git status    = 完全干净
基线链        = a319d46 → 9a42cb4 → 4796f8b → 013e680
```

### 2.2 本轮改动文件

修改（5）：

```text
docs/api-contract.md
docs/runbook.md
services/api/src/public-facts.ts
services/api/src/public-updates.ts
services/api/src/server.ts
```

新增（4 个代码/测试 + 1 个任务文档）：

```text
services/api/src/database-config.ts      配置三态判定
services/api/src/database-ready.ts       SELECT 1 就绪探针
tests/database-config.test.ts            5 个测试
tests/api-readiness.test.ts              13 个测试
docs/audit/DEEPSEEK_HARNESS_SPRINT_3B_TASK.md
```

`git diff --stat`（不含新增文件）：`5 files changed, 96 insertions(+), 16 deletions(-)`。

### 2.3 未改动确认

`deploy/`、`apps/web/src/`、`packages/`、`apps/admin/`、`scripts/` 全部零改动。`Python/` 未被 track 也未被触碰。

### 2.4 提交结果

按 Owner 授权（D3）执行：逐路径 `git add --`（未用 `-A`），单个 commit，提交信息用 `[System.IO.File]::WriteAllText` + `new UTF8Encoding($false)` 写入以避免 BOM。

| 项                 | 值                                                                  |
| ------------------ | ------------------------------------------------------------------- |
| commit             | **`864535eab87c1595f0e1a03ee8494c45ccd882d9`**（short `864535e`）   |
| parent             | `013e680`                                                           |
| subject            | `feat: separate missing database config from legitimate empty data` |
| 变更量             | 11 files changed, 1439 insertions(+), 16 deletions(-)               |
| subject 首字节校验 | `66 65 61 74 3A 20 73 65` = `feat: se`，**无 BOM**                  |

> 该 commit 含 5 个修改 + 4 个新增代码/测试 + 3B 任务文档 + 本报告。hash 在报告内引用存在天然的循环依赖（改报告就会改 hash），故与 Sprint 3A 一样，最终 hash 由本报告落账后的 docs commit 收口，不在此处反复 amend。

### 2.5 基线链

```text
a319d46  Phase 0 审计与 Sprint 1 文档基线
9a42cb4  Sprint 1 + Sprint 2 合并 baseline
4796f8b  Sprint 3A（upstream deadline + sitemap XML 错误体）
013e680  Sprint 3A 文档落账
864535e  Sprint 3B（配置缺失分离 + /ready）   ← 本轮
```

### 2.6 工作树

commit 后 `git status --short` **无输出**，工作树完全干净。临时探针脚本均写在 gitignored 的 `var/` 下，未入库。

---

## §3 契约变更（本轮唯一改变对外语义的地方）

这是本 Sprint 需要 Owner 知情的核心事项。

### 3.1 改了什么

| 端点                            | 改前（配置缺失时）            | 改后（配置缺失时）                         |
| ------------------------------- | ----------------------------- | ------------------------------------------ |
| `/api/v1/facts`                 | 200 `{data:[]}`               | **500** `{code:"database_not_configured"}` |
| `/api/v1/calendar`              | 200 `{data:[]}`               | **500** 同上                               |
| `/api/v1/compare`               | 200 空行                      | **500** 同上                               |
| `/api/v1/updates`               | 200 `{data:[],hasMore:false}` | **500** 同上                               |
| `/api/v1/qualifications/{slug}` | 200 `awaiting_official`       | **500** 同上                               |
| `/api/v1/qualifications/takken` | 200 `awaiting_official`       | **500** 同上                               |
| `GET /ready`                    | 不存在                        | 新增（503 `unconfigured`）                 |
| `GET /health`                   | 200                           | **200（未变）**                            |

### 3.2 为什么用 500 而不是 503

配置缺失是**永久性**错误：进程重启不会自愈，重试也不会。503 会向客户端承诺「稍后再试就好」，对配置错误是假承诺。503 留给数据库**瞬态**不可达，形成清晰分层：

```text
500 database_not_configured  → 配置错了，去改环境变量
500 ECONNREFUSED（等驱动码） → 连不上，看网络/容器
200 + 空数组                 → 合法的「确实还没数据」
```

### 3.3 谁受影响

- **web 层**：`fetchUpstream` 看到 500 会抛 `UpstreamUnavailableError` → 503 + noindex + `Retry-After: 60`。这正是 Task D 实测到的行为，符合预期。
- **运维**：配置错从「静默降级」变成「明确报错」，排查更快（见 runbook 新增段落）。
- **单元测试**：`tests/setup.ts` 删除 `DATABASE_URL`，`NODE_ENV=test` 时保留旧的 fail-empty 行为，所以 `tests/public-api.test.ts` 的 15 处 `app.inject` 全部照常通过（已实测）。

### 3.4 `NODE_ENV=test` 逃生口的边界

逃生口**只**作用于数据读取路径（`resolveDatabaseUrl`）。`/ready` 刻意**不**复用它——探针在任何环境下都不会对配置缺失报告就绪。这一点有专门的测试守护（`never reports readiness while the data plane is unconfigured`）。

---

## §4 Task A —— 配置缺失分离

### 4.1 实现

新建 `services/api/src/database-config.ts`：

```ts
export class DatabaseNotConfiguredError extends Error { … }

export function resolveDatabaseUrl(
  databaseUrl: string | undefined,
  env: string | undefined,
): string | undefined {
  if (databaseUrl) return databaseUrl;
  if (env === 'test') return undefined;   // 单测不连库的既有契约
  throw new DatabaseNotConfiguredError();
}
```

四个调用点全部收敛：

| 位置                    | 改动                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `public-facts.ts:69`    | `if (!databaseUrl) return []` → `resolveDatabaseUrl(...)` 后再判空         |
| `public-facts.ts:145`   | 同上；**`!qualificationSlug` 保持返回 `[]`**（调用方参数缺失不是配置问题） |
| `public-updates.ts:30`  | 同上                                                                       |
| `server.ts` takken 路由 | 删掉 `if (config.apiDatabaseUrl)` 分支，改由读取器统一判定                 |

pool 一律使用 `configuredUrl` 而非原始入参。

### 4.2 错误映射

`server.ts` 新增 `setErrorHandler`，只拦 `DatabaseNotConfiguredError` → 500 `database_not_configured`，其余全部委托给**捕获下来的 Fastify 默认处理器**。

这一点做了实测验证，不是假设：捕获 `app.errorHandler` 后调用 `defaultErrorHandler.call(app, …)`，对五种默认场景逐一比对，行为完全一致：

```text
/plain      -> 500 {"statusCode":500,"error":"Internal Server Error","message":"boom"}
/coded      -> 500 {…,"code":"ECONNREFUSED",…}          ← code 保留
/status     -> 418 {"statusCode":418,…}                  ← statusCode 保留
/validated  -> 400 {"code":"FST_ERR_VALIDATION",…}       ← schema 校验保留
/nope       -> 404 {"message":"Route GET:/nope not found",…}
```

### 4.3 实测（三态，每态独立进程）

```text
=== missing ===   （不设 DATABASE_URL / API_DATABASE_URL，NODE_ENV=development）
  /health                                  200  {"status":"ok","stage":0}
  /ready                                   503  {"status":"unavailable","database":"unconfigured"}
  /api/v1/facts                            500  {"code":"database_not_configured",…}
  /api/v1/qualifications/it-passport       500  同上
  /api/v1/qualifications/takken            500  同上
  /api/v1/updates                          500  同上
  /api/v1/calendar                         500  同上
  /api/v1/compare?…                        500  同上

=== dead ===      （DATABASE_URL 指向 127.0.0.1:59999，无人监听）
  /health                                  200  {"status":"ok","stage":0}
  /ready                                   503  {"database":"error","message":"connect ECONNREFUSED 127.0.0.1:59999"}
  /api/v1/facts                            500  {"code":"ECONNREFUSED",…}   ← 驱动码，不是配置码
  …（其余数据路由同样 500 + ECONNREFUSED）

=== healthy ===   （真实 docker DB jpqm-pg18）
  /health                                  200  {"status":"ok","stage":0}
  /ready                                   200  {"status":"ready","database":"ok"}
  /api/v1/facts                            200  {"data":[…]}
  /api/v1/qualifications/it-passport       200  {"qualification":{…},"status":…}
  /api/v1/calendar                         200  {"data":[…]}
  /api/v1/updates                          200  {"data":[…]}
```

**配置缺失与 DB 不可达的 `code` 不同**（`database_not_configured` vs `ECONNREFUSED`），运维可据此一眼区分。

### 4.4 生产环境的一个重要事实

`packages/config/src/index.ts` 在 `NODE_ENV=production` 下有硬门禁，缺变量直接拒绝启动。实测：

```text
NODE_ENV=production + 两个变量都不设
→ Error: DATABASE_URL is required in production   （进程退出，不进入监听）
```

**因此 `DatabaseNotConfiguredError` 在 production 不可达。** 它的实际风险面是：

1. `NODE_ENV` 非 `production` 的部署（staging / 预发 / 本地联调）；
2. 有人把 `NODE_ENV` 误设为 development 的生产容器；
3. 运行期变量被清空（罕见）。

这不降低修复价值——Sprint 3A 实测的静默失败正是在 development 语义下复现的——但报告的结论必须诚实：**生产主路径原本就被 config 门禁挡着，本轮补的是门禁覆盖不到的形态。**

---

## §5 Task B —— `/ready` 就绪探针

### 5.1 红线：`/health` 一字不改

`deploy/docker-compose.prod.yml` 的依赖链是：

```text
db (pg_isready) → api (/health) → web (depends_on api service_healthy) → caddy (depends_on web service_healthy)
```

若把 `/health` 改成数据面探针并在 DB 挂时返 5xx，后果是：DB 抖动 → api unhealthy → web 不启动 → caddy 不启动 → **整站不可用**。这比它要解决的问题严重得多，与 ADR 0002 §4「`/` 绝不能 503」属同一类风险。

`docs/runbook.md:349` 原本就写明「healthcheck 只证明进程与端口活着」，说明 liveness 语义是**有意设计**，不是疏漏。

因此 `/health` 保持 `app.get('/health', async () => ({ status: 'ok', stage: 0 }))` 原样，并用测试固化（§9 第 3 条回归护栏）。

### 5.2 新增 `/ready`

```ts
app.get('/ready', async (_request, reply) => {
  const report = await checkDatabaseReadiness(config.apiDatabaseUrl);
  if (report.ready) return { status: 'ready', database: report.database };
  return reply.code(503).send({
    status: 'unavailable',
    database: report.database,
    ...(report.database === 'error' ? { message: report.message } : {}),
  });
});
```

`services/api/src/database-ready.ts` 只执行 `SELECT 1`：不读业务表、不写、不缓存（每次真实往返）。超时复用 pg 的 `connectionTimeoutMillis: 5000`，`max: 1` 避免探针排在业务流量后面。

**不接进 compose healthcheck**，理由见 5.1。

### 5.3 一个被测试抓出来的真实缺陷

`database-ready.ts` 第一版用模块级单例 `probePool ??= new Pool({ connectionString: databaseUrl, … })`。测试先探可达 DB、再探不可达端口时失败：`expected true to be false`。

原因是 `??=` 让**第一次的 URL 永久生效**，后续任何 URL 都复用同一个 pool——一个针对死库的探针会报告上一个活库的健康状态。

改为按 URL 建 `Map<string, Pool>` 缓存后修复。这是「探针本身不能撒谎」的同一个原则在实现层的体现，记在此处以免以后有人改回单例。

### 5.4 `/ready` 补上的观测缺口

Sprint 3A 报告 §7.5 的推荐是「保持方案 A」，并给了切换条件：

> 「若生产观测到 `/pass-rate/` 的 503 中过半由单资格故障引起，应切方案 B。」

但当时**无法做这个区分**。有了 `/ready`：

```text
/pass-rate/ 503 且 /ready 200  → DB 活着，是单资格查询失败 → 方案 B 的触发条件在累积
/pass-rate/ 503 且 /ready 503  → 整体不可用 → 方案 A 是正确的
```

这是把 3A 的分析结论变成可执行指标的最小代价。**方案 A 本身未动**（Owner 已明确保留）。

---

## §6 Task C —— 文档同步

### 6.1 `docs/api-contract.md`

- `/health` 行补注「**liveness only**，不访问数据库」。
- 新增 `/ready` 行，写明三种响应与「liveness vs readiness」的区别，并注明未接入 compose healthcheck。
- 新增「数据端点的错误分层」小节，三行表格说清：配置缺失 → 500 `database_not_configured`；DB 不可达 → 5xx + 驱动码；确实无数据 → 200 + 空。
- 说明为何用 500 而非 503（永久错 vs 瞬态错），以及 `NODE_ENV=test` 逃生口的边界。

### 6.2 `docs/runbook.md`

在 healthcheck 判据段落后新增「liveness 与 readiness 是两件事（别混用）」小节：

- `/health` = liveness，**不要**拿它判断数据面；
- `/ready` = readiness，给了容器内 `docker compose exec` 的实际命令；
- 明确写清 `/ready` **未**接入 healthcheck 及其原因（级联下线风险），以及将来要接必须先解决什么；
- 数据面故障排查顺序：先 `/ready` 定位配置缺失还是连不上，再看数据路由的 `code`；
- 提醒「配置缺失时数据路由返回 500 而非 200 空数据」是**有意变更**，别当回归。

### 6.3 ADR

未新建 ADR。本轮不改变索引策略，也不与 ADR 0002 冲突——ADR 0002 §4 讲的是「不改 API 降级分层」，而本轮正是**让降级分层更准确**（把配置错误从「降级为空」里摘出来）。无冲突需要 Owner 裁决。

---

## §7 Task D —— 回归与证据

### 7.1 三形态 × 10 路由矩阵（实测）

探针脚本 `var/tmp-3b-web2.mjs`（gitignored，不入库）。**API 与 web 分处两个进程**：web 用 `NODE_ENV=test` 避免监听，API 用 `NODE_ENV=development` 让逃生口不生效。

| path                         | 正常                         | DB 不可达   | 配置缺失        |
| ---------------------------- | ---------------------------- | ----------- | --------------- |
| `/`                          | 200                          | 200         | 200             |
| `/robots.txt`                | 200                          | 200         | 200             |
| `/shikaku/`                  | 200                          | 503 noindex | **503 noindex** |
| `/pass-rate/`                | 200                          | 503 noindex | **503 noindex** |
| `/schedule/`                 | 200                          | 503 noindex | **503 noindex** |
| `/compare/`                  | 200                          | 503 noindex | **503 noindex** |
| `/updates/`                  | 200                          | 503 noindex | **503 noindex** |
| `/shikaku/it-passport/`      | 200                          | 503 noindex | **503 noindex** |
| `/shikaku/it-passport/2025/` | 200 noindex                  | 503 noindex | **503 noindex** |
| `/sitemap.xml`               | 200 XML（52 loc / 6 资格页） | 503 XML     | **503 XML**     |

**关键断言成立**：配置缺失形态下，数据页从 3A 的「200 + 空态」变成 **503 + noindex**。

**`/` 与 `/robots.txt` 在三种形态下恒 200** —— 红线守住（首页卡片来自 `launchQualifications` 静态种子，不依赖 facts；`/` 还用 `Promise.allSettled` 降级）。

### 7.2 探针自身踩的坑（记录以免重犯）

第一次跑「配置缺失」场景得到 `/pass-rate/` 200 + 空态，看着像**改动没生效**。实际是探针把 `NODE_ENV=test` 设给了**整个进程**（本意是让 web 不监听），API 也读到了 `test`，逃生口生效。

教训：**验证逃生口之外的语义时，被测进程的 `NODE_ENV` 必须是真实值。** 把 API 拆成子进程后结果正确。这个坑值得记进下一轮的任务文档模板。

---

## §8 完整测试结果

全部真实执行，逐条记录：

| 命令                                              | 结果                                                           | EXIT |
| ------------------------------------------------- | -------------------------------------------------------------- | ---- |
| `pnpm run typecheck`                              | 无 TS 错误                                                     | 0    |
| `pnpm test`                                       | **20 files / 221 tests** 全过（3A 基线 203，+18）              | 0    |
| `pnpm run test:verify-gate`                       | 40 pass / 0 fail                                               | 0    |
| `pnpm run build`                                  | 无错误                                                         | 0    |
| `pnpm run format:check`                           | **1 处失败**，见 §8.1                                          | 1    |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | 无问题                                                         | 0    |
| `pnpm run test:python`                            | 239 passed in 5.18s                                            | 0    |
| `pnpm run verify:all`                             | `{"status":"passed","qualifications":6,"passed":6,"failed":0}` | 0    |
| `pnpm run smoke:docker`                           | 11 项全 ok，末行 `docker smoke passed`                         | 0    |

`verify:all` 的 approved_official 计数保持 16/15/10/28/863/75，与 3A 基线一致（本轮不碰数据）。

### 8.1 `format:check` 的唯一失败

```text
[warn] docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md
[warn] Code style issues found in the above file.
```

这是 **Sprint 3A 的任务文档**，在 `013e680` 中已入库但当时未格式化——属**既有问题，非本轮引入**。本轮新写的 `DEEPSEEK_HARNESS_SPRINT_3B_TASK.md` 已格式化通过。

用同一 glob 集加 `!docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 复验 → EXIT 0「All matched files use Prettier code style!」。

**未擅自格式化 3A 文档**：它是 Owner 下发的输入件，且改动它会让本轮的 diff 混入无关变更。是否格式化由 Owner 决定（见 §13 建议 4）。

---

## §9 回归护栏

任务文档 §9 要求 7 条，全部落地：

| #   | 要求                                           | 实现                                                                                         |
| --- | ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | `resolveDatabaseUrl` 三态                      | `tests/database-config.test.ts`（5 个用例，含空字符串按缺失处理）                            |
| 2   | 配置缺失（非 test）→ 500                       | `tests/api-readiness.test.ts`，用 `vi.stubEnv` + `vi.resetModules` 以 `development` 重新导入 |
| 3   | **`/health` 在 DB 不可达时仍 200**             | 两个用例，含「同一失败进程内 /health 绿而数据路由 500」                                      |
| 4   | `/ready` DB 可达 → 200                         | `readiness probe against a real database`                                                    |
| 5   | `/ready` DB 不可达 → 503 error                 | 同上（本机无 DB 时跳过而非伪造）                                                             |
| 6   | `/ready` 配置缺失 → 503 unconfigured           | 两个用例，含「绝不报告 ready」                                                               |
| 7   | `public-api.test.ts` 15 处 `app.inject` 仍通过 | 全套 221 测试实测通过                                                                        |

第 3 条是最重要的护栏——它把「不许偷偷把 liveness 改成 readiness」这条红线固化成了测试。

### 9.1 写测试时踩的坑

在 `NODE_ENV=development` 下导入 `server.ts` 会**真的执行 `app.listen()`**，四个用例争抢 4100 端口，测试全绿但 `Errors 4` + `EXIT=1`。

修复：`API_PORT=0`（临时端口）+ teardown 里逐个 `app.close()`。**教训：绿测试不等于 EXIT 0，必须看退出码和 Errors 行。**

---

## §10 未处理问题

1. **`apps/admin/src/server.ts` 的 fail-fast 与公开 API 现已一致**（都是配置缺失即失败），但错误形态不同（管理端裸 `throw new Error`，无 HTTP 码映射）。管理端是本地工具，本轮不动。
2. **`/ready` 未在 Caddy 暴露**。它只在容器网络内可达（`docker compose exec` 或内网直连）。若要外部监控轮询，需要额外决定是否加 Caddy 路由——涉及安全面，未擅自处理。
3. **`format:check` 的 3A 文档格式问题**（§8.1）留待 Owner 决定。
4. **`/pass-rate/` 的 `Promise.all` 粒度未动**（Owner 明确保留方案 A）。`/ready` 已提供切换所需的观测能力。
5. **`config` 门禁只保护 api 进程**：`apps/web/src/server.ts` 不导入 `packages/config`，直接用 `process.env`。web 缺 `API_BASE_URL` 会静默用默认值 `http://127.0.0.1:4100`。本轮未动（任务文档 §3.2 禁止改 `apps/web/src/*`），但这是同类「配置错误伪装成正常」的潜在位置，建议后续评估。

---

## §11 风险

| 风险                                 | 影响                            | 缓解                                                                                |
| ------------------------------------ | ------------------------------- | ----------------------------------------------------------------------------------- |
| 契约变更：配置缺失从 200 变 500      | 若有外部消费者依赖 200 + 空数组 | 本项目 API 无外部消费者（web 是唯一调用方），且 web 已正确处理 500→503              |
| `NODE_ENV=test` 逃生口被误用         | 有人以为测试通过就代表生产行为  | 逃生口只在 `database-config.ts` 一处，注释写明理由；`/ready` 刻意不复用并有测试守护 |
| `/ready` 的 pool 与业务 pool 分离    | 多一份连接（`max: 1`）          | 可接受：1 条连接，且探针不排队在业务流量后                                          |
| 500 与 503 的语义区分依赖客户端理解  | 监控若只按「5xx」告警会混同     | 响应体 `code` 字段可区分（`database_not_configured` vs 驱动码），runbook 已写明     |
| 探针脚本曾误设 `NODE_ENV` 导致假阴性 | 可能误判改动无效                | §7.2 已记录；脚本不入库，结论已用正确方式复验                                       |

---

## §12 下一步建议

按「投入产出 + 风险」排序，供 Owner 决策。

### 12.1 推荐优先：`apps/web/src/server.ts` 的配置门禁缺口（P1）

本轮修的是 API 进程的「配置错误伪装成正常」。**同一个毛病在 web 进程还在**：`apps/web/src/server.ts` 不导入 `packages/config`，直接用 `process.env`，缺 `API_BASE_URL` 时静默回落到 `http://127.0.0.1:4100`。

后果与 3B 修掉的那条完全同构——配错了，但没人知道。而且 web 是面向公网的那一层，静默回落意味着容器内自我指向，用户看到的是 503 而运维看到的是「服务健康」。

建议作为下一轮（Sprint 3C）的主任务，做法可直接复用本轮模式：抽一个 `resolveWebConfig()`，production 下缺关键变量即拒绝启动（或至少启动时大声告警），非 production 保留默认值，配套测试。

### 12.2 次优先：把 `/ready` 接进可观测面（P2）

探针已经存在且行为有测试守护，但**生产上没有任何东西会去轮询它**。两条路径：

- **保守**：内网探针 / 定时任务轮询（不碰 Caddy，不新增公网面）；
- **激进**：Caddy 加一条内部路由。涉及安全面（是否要鉴权、是否只允许内网源），需要单独决策。

这一步做完，3A §7.5 留下的「方案 A vs 方案 B」判据才真正可执行。

### 12.3 可选：`format:check` 的 3A 文档（P3）

一条 `prettier --write` 的事，但那是 Owner 下发的输入件。是否格式化，Owner 一句话即可。

### 12.4 已排期但本轮未动的

- `/pass-rate/` 503 监控（现在有 `/ready` 可配合，见 12.2）；
- G-15 测试缺口：`server.ts` 19 条路由无进程级测试。

---

## §13 停止声明

本轮严格限定在任务文档 §3 的允许范围内：

- 未改 `deploy/`、`apps/web/src/`、`packages/`、`apps/admin/`、`scripts/`；
- 未改 `/health`；
- 未把 `/ready` 接进 compose healthcheck；
- 未动 `/pass-rate/` 的 `Promise.all` 粒度（方案 A 保留）；
- 未做任何生产数据库操作、未部署、未改 Caddy/Docker/CDN；
- 未进入 Sprint 3C / 4。

代码与两份文档已入库（commit `0d4e8cd`，工作树干净）。**Sprint 3B 到此停止。** 下一步由 Owner 根据本报告决定。
