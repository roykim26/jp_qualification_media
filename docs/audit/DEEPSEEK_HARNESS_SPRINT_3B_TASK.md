# DeepSeek Harness — Sprint 3B 任务文档

**项目**：ShikakuCheck（`jp_qualification_media`）
**执行工具**：DeepSeek Harness
**轮次**：Sprint 3B — 配置缺失与数据为空的分离
**上游依据**：`docs/audit/SPRINT_3A_REPORT_2026-11-24.md` §8 / §13
**仓库基线**：`013e680`（`a319d46 → 9a42cb4 → 4796f8b → 013e680`）

---

## §0 核心目标

Sprint 3A 确认了一个**语义混淆**问题，但按任务文档要求只做验证、未做修改：

> `if (!databaseUrl) return []` 让「配置缺失」与「合法空数据」在 API 层完全同形。

本轮的唯一目标是**把这两件事在响应上分开**，并让它**可被观测**。

三态必须可区分：

```text
配置缺失（永久性错误）  → 500  database_not_configured
DB 不可达（瞬态错误）   → 503  database_unavailable
正常但确实没有数据      → 200  [] / awaiting_official
```

**本轮不做「让网站更好看」，只做「让错误不再伪装成正常」。**

---

## §1 执行前必读文件

按顺序读完再动手，不要跳读：

1. `docs/audit/SPRINT_3A_REPORT_2026-11-24.md` —— 尤其 §8（databaseUrl 三层实测）、§7.5（方案 B 触发条件）、§13（下一步建议）
2. `services/api/src/public-facts.ts` —— 全文 162 行
3. `services/api/src/public-updates.ts` —— 全文 84 行
4. `services/api/src/server.ts` —— 全文 249 行，重点 :45、:62-64、:207-239、:244-249
5. `packages/config/src/index.ts` —— 两条 production 硬门禁
6. `apps/admin/src/server.ts` —— :112 / :137 / :261 的 fail-fast 先例
7. `deploy/docker-compose.prod.yml` —— api healthcheck 打 `/health`，web `depends_on: api: service_healthy`
8. `docs/runbook.md` —— :349「healthcheck 只证明进程与端口活着」
9. `docs/api-contract.md` —— :5 `/health` 契约
10. `tests/public-api.test.ts` —— :329 / :433 / :446 / :458 / :470 / :504
11. `tests/setup.ts` —— `delete process.env.DATABASE_URL`
12. `scripts/verify-lib.mjs` —— `createRuntime()`，:189 起 spawn api
13. `scripts/verify-all.mjs` / `scripts/verify-e2e.mjs` —— `waitFor('/health')`

---

## §2 Git 安全检查

### 2.1 开工前必须确认

```bash
git status --short          # 必须无输出
git log --oneline -4        # HEAD 必须是 013e680
git rev-parse --abbrev-ref HEAD   # 必须是 chore/phase1-baseline
```

若工作树不干净，先查清每个文件的来源再决定，**不得直接丢弃**。

### 2.2 禁止操作

```bash
git reset --hard
git clean -fd
git checkout -- .
git restore .
```

### 2.3 提交方式

- 一律 `git add -- <逐路径>`，**禁止 `git add -A` / `git add .`**
- commit message 必须用**无 BOM UTF-8** 写入：

```powershell
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$PWD\.git\COMMIT_MSG_TMP", $msg, $utf8)
git commit -F .git/COMMIT_MSG_TMP
Remove-Item .git/COMMIT_MSG_TMP
```

> Sprint 3A 踩过：`Out-File -Encoding utf8` 会让 subject 首字节变成 BOM（`﻿feat: ...`）。

- **commit 需要 Owner 单独授权**（见 §16）。未获授权时停在工作树，写清 `git status`。

---

## §3 硬边界

### 3.1 允许修改

| 文件                                            | 允许的改动                   |
| ----------------------------------------------- | ---------------------------- |
| `services/api/src/database-config.ts`           | **新建**，配置判定与错误类型 |
| `services/api/src/public-facts.ts`              | 两处 fail-empty 改为经由判定 |
| `services/api/src/public-updates.ts`            | 一处 fail-empty 改为经由判定 |
| `services/api/src/server.ts`                    | 新增 `/ready`；错误映射      |
| `tests/public-api.test.ts`                      | 新增用例；必要时调整既有断言 |
| `tests/ready-probe.test.ts`                     | **新建**                     |
| `docs/api-contract.md`                          | 补 `/ready` 与三态契约       |
| `docs/runbook.md`                               | 补 `/ready` 用法             |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3B_TASK.md` | 本文件                       |
| `docs/audit/SPRINT_3B_REPORT_2026-11-24.md`     | 执行报告                     |

**其它文件一律不改。** 确有必要时，必须在报告里单独说明理由与影响面。

### 3.2 明确禁止

- **不得修改 `/health` 的行为与响应体。** 理由见 §5.2，这是本轮最重要的一条红线。
- 不得把 `/ready` 接入 `deploy/docker-compose.prod.yml` 的 healthcheck。
- 不得修改 `deploy/` 下任何文件（compose / Caddyfile）。
- 不得修改 `packages/config/src/index.ts` 的两条 production 门禁。
- 不得修改 `packages/schema`、数据库 schema、migrations、fixtures。
- **不得改动 `/pass-rate/` 的失败粒度**（`Promise.all` 保持原样）。Owner 已决定保留方案 A。
- 不得修改 `apps/web/src/*`（Sprint 3A 的 503 分层已覆盖下游表现，本轮无需改）。
- 不得新增资格、不得扩到 30 个资格、不得宅建统计入库。
- 不得做首页 / `/shikaku/` / 资格详情页改版、设计系统改版、移动端改版、内链重构。
- 不得做 URL 重构、无尾斜杠 301、年度页 301/404、薄页清理。
- 不得改 GSC / Bing / GA4。
- 不得操作生产数据库、不得部署、不得 `docker compose up`。
- 不得自行进入 Sprint 3C / Sprint 4。

---

## §4 Task A —— 配置缺失的单一判定点

### 4.1 问题陈述（已验证事实）

三个 fail-empty 点：

```ts
// services/api/src/public-facts.ts:69
if (!databaseUrl) return [];

// services/api/src/public-facts.ts:143
if (!databaseUrl || !qualificationSlug) return [];

// services/api/src/public-updates.ts:30
if (!databaseUrl) return { events: [], hasMore: false };
```

同一仓库里，管理端是 **fail-fast**：

```ts
// apps/admin/src/server.ts:112 / :137 / :261
if (!databaseUrl)
  throw new Error('DATABASE_URL is required for the local review queue');
```

**公开 API 是 fail-empty，管理端是 fail-fast —— 这是明确的不一致。**

Sprint 3A 实测后果：配置缺失时 `/shikaku/it-passport/` 200、`/pass-rate/` 200 走空态、`/sitemap.xml` 200 但资格页从 6 条掉到 0 条。对外是一个「成功的 sitemap 主动移除了 6 个页面」。

### 4.2 要求

**新建 `services/api/src/database-config.ts`**，导出：

```ts
export class DatabaseNotConfiguredError extends Error {
  // name = 'DatabaseNotConfiguredError'
  // 消息必须包含缺失的环境变量名，例如：
  // 'DATABASE_URL / API_DATABASE_URL is not configured'
}

/**
 * 把一个可能缺失的 databaseUrl 收敛为确定值。
 * - 有值：原样返回
 * - 无值且 NODE_ENV === 'test'：返回 undefined，调用方沿用旧的 [] 行为
 * - 无值且其它环境：抛 DatabaseNotConfiguredError
 */
export function resolveDatabaseUrl(
  databaseUrl: string | undefined,
  env: string | undefined,
): string | undefined;
```

**为什么保留 `NODE_ENV === 'test'` 的逃生口**：`tests/setup.ts` 会 `delete process.env.DATABASE_URL`，vitest 下 `NODE_ENV` 实测为 `"test"`（已探针确认）。若不保留，`tests/public-api.test.ts` 的 15 处 `app.inject` 会全部抛错，等于用一次语义修复炸掉整个 API 测试面。这不是妥协，而是把「单测不连库」这个既有契约显式写进代码。

### 4.3 三处调用点改造

```ts
// public-facts.ts:69 附近
const resolved = resolveDatabaseUrl(databaseUrl, process.env.NODE_ENV);
if (!resolved) return [];

// public-facts.ts:143 附近：注意这里的第二个条件不是配置问题
const resolved = resolveDatabaseUrl(databaseUrl, process.env.NODE_ENV);
if (!resolved || !qualificationSlug) return [];

// public-updates.ts:30 附近
const resolved = resolveDatabaseUrl(databaseUrl, process.env.NODE_ENV);
if (!resolved) return { events: [], hasMore: false };
```

> `!qualificationSlug` 是**调用方参数缺失**，不是配置问题，必须保持返回 `[]`，不要一起抛错。

改造后，pool 必须使用 `resolved` 而不是原始 `databaseUrl`。

### 4.4 错误映射（`services/api/src/server.ts`）

新增错误处理器，把配置缺失映射为 **500**（不是 503）：

```ts
app.setErrorHandler((error, _request, reply) => {
  if (error instanceof DatabaseNotConfiguredError) {
    return reply.code(500).send({
      error: 'database_not_configured',
      message: error.message,
    });
  }
  throw error; // 其它错误保持 Fastify 默认行为
});
```

**为什么是 500 而不是 503**：配置缺失是**永久性错误**，重试不会自愈。用 503 会向客户端承诺「稍后再试就好了」，这是假承诺。503 留给「DB 不可达」这种瞬态故障。这正是本轮要建立的语义分层。

### 4.5 验收

- `NODE_ENV=test` + 无 `DATABASE_URL` → 三处仍返回 `[]`，既有测试全过。
- `NODE_ENV=development` + 无 `DATABASE_URL` → 三处抛 `DatabaseNotConfiguredError`。
- 经 API 路由访问 → **500** + `error: 'database_not_configured'`。
- `NODE_ENV=production` + 无配置 → 仍在 `packages/config` 启动时抛错（**行为不变**，本轮不碰门禁）。

---

## §5 Task B —— `/ready` 就绪探针

### 5.1 问题陈述（已验证事实）

```ts
// services/api/src/server.ts:45
app.get('/health', async () => ({ status: 'ok', stage: 0 }));
```

实测：**DB 完全不可达时 `/health` 仍返回 200 `{"status":"ok","stage":0}`**。

这不是 bug，是**有意的 liveness 语义**，且已写入文档：

- `docs/runbook.md:349`：「healthcheck 只证明进程与端口活着（api 探 `/health`、web 探 `/`），数据面继续在开发机检查」
- `docs/api-contract.md:5`：`GET /health` → `{ status: "ok", stage: 0 }`

**但它导致一个真实缺口：全系统没有任何就绪信号。** DB 挂掉时，api healthy、web healthy、caddy 正常代理，对外一片 503，而平台层没有任何东西会报警。

### 5.2 为什么绝对不能改 `/health`（红线）

`deploy/docker-compose.prod.yml` 的依赖链：

```text
db (pg_isready) → api (healthcheck 打 /health) → web (depends_on: api service_healthy) → caddy (depends_on: web service_healthy)
```

若把 `/health` 改成「DB 不通就 5xx」：

```text
DB 抖动 → api unhealthy → web 不启动 → caddy 不启动 → 整站不可用（连静态页都没了）
```

这是一次「为了可观测性而制造更大的不可用」。它与 ADR 0002 §4「`/` 绝不能 503」属于同一类风险，Sprint 3A 已明确规避。

**因此：`/health` 一字不改，新增独立的 `/ready`。**

### 5.3 要求

```ts
// services/api/src/server.ts
app.get('/ready', async (_request, reply) => {
  // 1. 配置判定
  //    resolveDatabaseUrl(config.apiDatabaseUrl, process.env.NODE_ENV)
  //    → 抛 DatabaseNotConfiguredError 时：503 + { status:'unavailable', database:'unconfigured' }
  // 2. 真实探活：对 DB 执行 SELECT 1
  //    → 成功：200 + { status:'ready', database:'ok' }
  //    → 失败：503 + { status:'unavailable', database:'error', message:<原因> }
});
```

**硬性约束**：

- `/ready` **只读**，只允许 `SELECT 1`，不得查询业务表。
- 必须有超时，不得让探针本身挂起。复用 pg pool 的 `connectionTimeoutMillis: 5000` 即可；若需要独立超时，自行实现但必须说明取值理由。
- `/ready` **不得**修改 `config`、不得触发任何写操作、不得缓存状态（每次真实探测）。
- **不得**把 `/ready` 接进 compose healthcheck（§3.2）。
- `/health` 的响应体、状态码、路径**全部不变**。

### 5.4 为什么 `/ready` 值得做

它直接回填 Sprint 3A 报告 §7.5 留下的观测缺口：

> 「若生产观测到 `/pass-rate/` 的 503 中超过一半由单资格故障而非 API 整体不可用引起，应切方案 B。」

当前**无法做这个区分**。有了 `/ready`：

```text
/pass-rate/ 503 且 /ready 200  → DB 活着，是单资格查询失败 → 方案 B 的触发条件在累积
/pass-rate/ 503 且 /ready 503  → 整体不可用 → 方案 A 是正确的
```

这是把 3A 的分析结论变成可执行指标的最小代价。

### 5.5 验收

| 场景                      | `/health`            | `/ready`                                           |
| ------------------------- | -------------------- | -------------------------------------------------- |
| 配置正常 + DB 可达        | 200 `{status:'ok'…}` | **200** `{status:'ready', database:'ok'}`          |
| 配置正常 + DB 不可达      | 200 `{status:'ok'…}` | **503** `{status:'unavailable', database:'error'}` |
| 配置缺失（非 test）       | 200 `{status:'ok'…}` | **503** `{database:'unconfigured'}`                |
| 配置缺失（NODE_ENV=test） | 200                  | 503（test 只对数据路由开逃生口，探针不撒谎）       |

> 最后一行是刻意的：`/ready` 是运维工具，**任何环境下都不应该对配置缺失撒谎**。

---

## §6 Task C —— 文档与契约同步

### 6.1 `docs/api-contract.md`

在 Public 段补两条：

- `GET /ready` → 就绪探针，`{ status: "ready", database: "ok" }` / 503 `{ status: "unavailable", database: "error" | "unconfigured" }`；**与 `/health` 的区别**（liveness vs readiness）必须写清。
- 数据类端点（`/api/v1/facts`、`/api/v1/calendar`、`/api/v1/compare`、`/api/v1/updates`、`/api/v1/ics/*`、`/api/v1/qualifications/{slug}`）在**配置缺失**时返回 `500 { error: "database_not_configured" }`，在 **DB 不可达**时返回 5xx。

### 6.2 `docs/runbook.md`

在 healthcheck 判据附近补一段：

- `/health` = liveness，**不要**拿它判断数据面。
- `/ready` = readiness，手工排查数据面时用它。
- 明确写：`/ready` **未**接入 compose healthcheck，这是有意的（避免 DB 抖动导致全站下线）。若将来要接，必须先解决依赖链级联问题。

### 6.3 ADR / audit

若本轮改变了任何对外契约语义，需在报告 §3 明确列出「改了什么契约、为什么、谁受影响」。**不新建 ADR**，除非发现现有 ADR 与新语义直接冲突（届时在报告说明，由 Owner 决定是否补 ADR）。

---

## §7 Task D —— 回归与证据

### 7.1 必须实测的矩阵

用「API 三种形态」驱动，逐一记录**状态码 + robots + canonical + 是否在 sitemap**：

| API 形态  | 构造方式                                                         |
| --------- | ---------------------------------------------------------------- |
| 正常      | 真实 API + 本地 docker DB `jpqm-pg18`                            |
| DB 不可达 | `DATABASE_URL` 指向 `127.0.0.1:59999`（无人监听）                |
| 配置缺失  | 不设 `DATABASE_URL` / `API_DATABASE_URL`，`NODE_ENV=development` |

对每个形态跑：

```text
/
/robots.txt
/shikaku/
/pass-rate/
/schedule/
/compare/
/updates/
/shikaku/it-passport/
/shikaku/it-passport/2025/
/sitemap.xml
```

**关键断言**：配置缺失形态下，数据页必须从 3A 的「200 + 空态」变成 **503 + noindex**（因为 API 现在返 500，web 的 `fetchUpstream` 会抛 `UpstreamUnavailableError` → 503）。

> 这正是本轮的核心收益：**同一个错误，从「伪装成正常」变成「明确不可用」。**

### 7.2 探针脚本纪律

- 脚本放 `var/`（gitignored），**不得入库**。
- 收尾必须 `process.exit(0)` 强制退出。Sprint 3A 踩过：`await app.close()` 会被 pg pool 挂住，后台作业跑 6 分钟无输出。
- 需要 `dist/` 时先 `pnpm run build`，不要用 `node --experimental-strip-types`（`UpstreamUnavailableError` 的参数属性在 strip-only 模式不被支持）。

---

## §8 完整测试要求

全部真实执行，逐条记录 EXIT 码与关键输出：

```powershell
$pnpm = "C:\Users\jinlo\AppData\Local\node\corepack\v1\pnpm\11.16.0\bin\pnpm.cjs"
node $pnpm run typecheck
node $pnpm test
node $pnpm run test:verify-gate
node $pnpm run build
node $pnpm run format:check
node $pnpm exec eslint . --ignore-pattern "Python/**"
node $pnpm run test:python
$env:DATABASE_URL="postgresql://postgres@127.0.0.1:55432/qualification_media"
$env:API_DATABASE_URL="postgresql://postgres@127.0.0.1:55432/qualification_media"
node $pnpm run verify:all
node $pnpm run smoke:docker
```

注意事项：

- `.env` 里的 `localhost:5432` 在本机不存在，`DATABASE_URL` 必须显式覆盖为 `127.0.0.1:55432`。
- `eslint` 必须带 `--ignore-pattern "Python/**"`。
- `format:check` 若仅因**未跟踪的** Owner 输入文件失败，用同一 glob 集加排除项复验并在报告说明；**不得为了让检查变绿去格式化 Owner 的文件**。
- `verify:all` / `smoke:docker` 会真实启动进程与容器，注意 4100 / 4191 / 3091 端口占用。

---

## §9 回归测试

必须新增的测试（数量不限，但每条都要能证明一件事）：

1. `resolveDatabaseUrl` 纯函数三态：有值 / 无值 + `NODE_ENV=test` / 无值 + `NODE_ENV=development` 抛错。
2. API 路由在配置缺失（非 test）时 → **500** + `error: 'database_not_configured'`。
3. `/health` 在 DB 不可达时仍 → **200 `{status:'ok',stage:0}`**（**回归护栏**：证明本轮没有偷偷改 liveness）。
4. `/ready` 在 DB 可达时 → 200 `{status:'ready',database:'ok'}`。
5. `/ready` 在 DB 不可达时 → 503 `{status:'unavailable',database:'error'}`。
6. `/ready` 在配置缺失时 → 503 `{database:'unconfigured'}`。
7. 既有 `tests/public-api.test.ts` 的 15 处 `app.inject` **全部仍然通过**（证明 test 逃生口有效）。

第 3 条是**最重要的回归护栏**——它把 §5.2 的红线固化成测试。

---

## §10 不允许伪造测试结果

- 跑不通的命令写 **NOT RUN**，并说明：为什么跑不了、替代验证是什么、是否影响验收。
- 不得因为「预期是 200」就假设它是 200。**每条断言都要有真实输出支撑。**
- 若实测结果与本文档的预期不符，**以实测为准**，在报告里写清差异与原因，不得为了符合文档而修改事实描述。
- 探针脚本的输出要原样贴进报告（截取关键行即可，但要保留真实数值）。

---

## §11 完成报告

必须产出 `docs/audit/SPRINT_3B_REPORT_2026-11-24.md`，至少包含：

1. 执行摘要
2. Git 状态（开工前 / 结束后 / commit hash）
3. 契约变更（改了什么语义、为什么、谁受影响）
4. 修改文件清单（逐文件 + 行数）
5. Task A —— 配置缺失分离（代码事实 + 三态实测）
6. Task B —— `/ready` 探针（含 `/health` 未改的证明）
7. Task D —— 三形态 × 10 路由回归矩阵
8. SEO 回归（robots / canonical / sitemap 计数）
9. 完整测试结果（逐条 EXIT + 关键输出）
10. 未处理问题
11. 风险
12. 下一步建议
13. 停止声明

---

## §12 验收标准

全部满足才算完成：

- [ ] 开工前 `git status --short` 无输出，HEAD = `013e680`
- [ ] `services/api/src/database-config.ts` 已建，含 `DatabaseNotConfiguredError` 与 `resolveDatabaseUrl`
- [ ] 三处 fail-empty 均改为经由 `resolveDatabaseUrl`
- [ ] `NODE_ENV=test` 下既有 15 处 `app.inject` 全过
- [ ] `NODE_ENV=development` 下配置缺失 → API 500 `database_not_configured`
- [ ] `GET /ready` 已实现，三态（ok / error / unconfigured）实测正确
- [ ] **`GET /health` 响应体与状态码零变化**，且有回归测试固化
- [ ] `deploy/` 下无任何改动
- [ ] `/pass-rate/` 的 `Promise.all` 未被改动
- [ ] 三形态 × 10 路由回归矩阵已实测，配置缺失时数据页为 503 + noindex
- [ ] SEO 回归通过，索引状态与 Sprint 3A 基线一致（正常形态下）
- [ ] 全部测试命令 EXIT 0（例外须在报告说明）
- [ ] 未操作生产数据库、未部署
- [ ] 未进入 Sprint 3C / 4
- [ ] 报告已产出，13 节齐全

---

## §13 严格停止条件

报告写完后 **立即停止**。

即使报告里发现其它问题，也**只写进「未处理问题」**，不得顺手修：

- 不得进入 Sprint 3C / 4
- 不得做首页优化、内链优化、新资格建设、宅建数据建设
- 不得因为「反正都改了」去动 `/pass-rate/` 粒度
- 不得自行部署或操作生产库

下一步由 Owner 根据报告重新决定。

---

## §14 Owner 决策点

执行前需要 Owner 确认以下三项：

### D1. 是否批准本轮范围

本轮范围 = Task A（配置缺失分离）+ Task B（`/ready` 探针）+ Task C（文档同步）+ Task D（回归）。

**不含** `/pass-rate/` 粒度改动（Owner 已定方案 A）。

### D2. 配置缺失的 HTTP 状态码：500 还是 503

- **推荐 500**：配置缺失是永久性错误，重试无意义；503 会向客户端承诺「稍后就好」，是假承诺。503 留给 DB 瞬态故障，形成清晰分层。
- 备选 503：与下游 web 的 503 表现一致，客户端无需区分。

### D3. 是否授权 commit

- 若授权：执行完按 §2.3 逐路径 `git add`，单个 commit，记录 hash。
- 若未授权：停在工作树，报告写清 `git status`，由 Owner 另起 Commit Gate。

### D4.（可选）`/ready` 是否保留 `NODE_ENV=test` 逃生口

**推荐不保留**：`/ready` 是运维工具，任何环境下都不应对配置缺失撒谎。与 Task A 数据路由的逃生口是两件不同的事。

---

## §15 与 Sprint 3A 的关系

| Sprint 3A                | Sprint 3B                       |
| ------------------------ | ------------------------------- |
| 发现问题（§8 只读验证）  | 修复问题（配置缺失不再伪装）    |
| 上游超时 → 503           | 配置缺失 → 500，DB 不可达 → 503 |
| sitemap 故障载荷改为 XML | `/ready` 提供就绪信号           |
| 推荐方案 A，等 Owner     | 方案 A 保持不动，提供观测指标   |

**两轮的分工是「先看清，再修一个」**，不叠加范围。
