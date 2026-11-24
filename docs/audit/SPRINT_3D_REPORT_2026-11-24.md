# Sprint 3D 执行报告（2026-11-24）

> 范围：把 Sprint 3B 建好的 `/ready` 端点接进可观测面 —— 给它一个真正的调用方。
> 任务文档：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3D_TASK.md`
> 执行工具：DeepSeek Harness

---

## §1 执行摘要

### 1.1 本轮修的是什么

Sprint 3B 建了 `GET /ready`，能区分「数据面可用／数据库不可达／没配数据库」三态，也写进了 runbook 和 api-contract。但**没有任何东西调用它**。生产上数据面挂掉时，唯一的信号仍然是用户报障——运维手里有仪表盘，却没有指针。

本轮补上指针：`scripts/check-readiness.mjs`，一条只读命令，把 `/ready` 的三态翻译成一个人能读的结论 + 一个机器能用的退出码。

### 1.2 改前 / 改后

| 场景                        | 改前                     | 改后                                             |
| --------------------------- | ------------------------ | ------------------------------------------------ |
| 数据面正常                  | 无人知晓（只能假设正常） | `ready:check` → exit 0，`status: ready`          |
| 数据库连不上                | **靠用户报障**           | exit 1，`status: error` + 驱动码 `ECONNREFUSED`  |
| 数据库没配置                | **靠用户报障**           | exit 1，`status: unconfigured`（与上者可区分）   |
| API 进程挂了                | 靠用户报障               | exit 1，`status: unreachable`，`reason: connect` |
| API 进程卡住不响应          | 靠用户报障               | exit 1，`status: unreachable`，`reason: timeout` |
| `/ready` 被改坏（契约漂移） | 无从发现                 | exit 1，`status: unexpected` + `rawBody` 片段    |

关键点：**五种失败形态给出五种不同的 `status`/`reason`**，不是笼统的「失败」。排查时不用二次猜。

### 1.3 三态实证（真实子进程 + 真实 API）

不是 mock，是真的起三个 API 进程（`dist/services/api/src/server.js`），各喂一套环境变量，再用 `spawnSync` 跑探针：

| 场景             | API 原始响应                                                                                       | 探针 `status`  | 探针 exit |
| ---------------- | -------------------------------------------------------------------------------------------------- | -------------- | --------- |
| 真实 docker DB   | `200 {"status":"ready","database":"ok"}`                                                           | `ready`        | **0**     |
| 不设任何 DB 变量 | `503 {"status":"unavailable","database":"unconfigured"}`                                           | `unconfigured` | **1**     |
| DB 端口无人监听  | `503 {"status":"unavailable","database":"error","message":"connect ECONNREFUSED 127.0.0.1:59999"}` | `error`        | **1**     |

探针的判定与 API 的原始响应逐字一致，`durationMs` 分别 47 / 34 / 38 ms。

---

## §2 Git 状态

### 2.1 本轮起点

| 项     | 值                                  |
| ------ | ----------------------------------- |
| 分支   | `chore/phase1-baseline`             |
| HEAD   | `9fc9c72`（Sprint 3C 报告落账）     |
| 工作树 | 干净（`git status --short` 无输出） |

### 2.2 基线链

```text
a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438 → 9bc946f → 9fc9c72
  基线      S1+S2       S3A代码     S3A文档     S3B代码     S3B文档     S3C代码     S3C文档
```

### 2.3 本轮改动清单

| 文件                                            | 类型 | 说明                                     |
| ----------------------------------------------- | ---- | ---------------------------------------- |
| `scripts/check-readiness.mjs`                   | 新增 | 探针本体（302 行，纯函数可测）           |
| `scripts/check-readiness.d.mts`                 | 新增 | 类型声明（供 TS 测试导入）               |
| `tests/check-readiness.test.ts`                 | 新增 | 21 个用例                                |
| `package.json`                                  | 改   | 加一条 script `ready:check`              |
| `docs/runbook.md`                               | 改   | 新增探针使用节；readiness 小节补交叉引用 |
| `docs/api-contract.md`                          | 改   | `/ready` 行补消费方                      |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3D_TASK.md` | 新增 | 本轮任务文档                             |
| `docs/audit/SPRINT_3D_REPORT_2026-11-24.md`     | 新增 | 本报告                                   |

**没有改动**：`services/api/**`（`/ready` 实现一行未动）、`/health`、`deploy/**`、`Dockerfile`、`apps/web/**`、`scripts/ops-daily-report.mjs`。无新增依赖。

### 2.4 提交结果

| 项      | 值                                                                                                                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| commit  | `f99e4750e97f81d3d8a98fe9e7cb65b03e473405`（short `f99e475`）                                                                                                   |
| parent  | `9fc9c72`                                                                                                                                                       |
| subject | `feat: give the readiness endpoint a caller`                                                                                                                    |
| 变更    | 8 files changed, 1532 insertions(+), 2 deletions(-)                                                                                                             |
| 方式    | 逐路径 `git add --`（8 个文件全列出，未用 `-A`）；message 用 `[System.IO.File]::WriteAllText` + `new UTF8Encoding($false)` 写入 `var/commit-msg-3d.txt`，无 BOM |

### 2.5 基线链（含本轮）

```text
a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438 → 9bc946f → 9fc9c72 → f99e475
  基线      S1+S2       S3A代码     S3A文档     S3B代码     S3B文档     S3C代码     S3C文档     S3D
```

报告内引用自身 commit hash 存在天然的循环依赖（写 hash → 改报告 → hash 变）。沿用 3A/3B/3C 的做法：代码与报告同一个 commit 入库，随后用 `docs: 落账 Sprint 3D 执行报告` 一个 commit 把 hash 与基线链改成最终值，不反复 `--amend`。

### 2.6 工作树

commit 后 `git status --short` 无输出（完全干净）。

---

## §3 Task A：探针实现

### 3.1 导出面

纯函数全部导出，CLI 只在直接执行时跑（`import.meta.url === pathToFileURL(process.argv[1]).href` 守卫，与 `scripts/access-report.mjs` 同一手法）：

| 导出                               | 职责                                                |
| ---------------------------------- | --------------------------------------------------- |
| `resolveReadyUrl(env, override)`   | 目标地址优先级解析 + 尾斜杠归一化                   |
| `parseProbeArgs(argv)`             | `--url` / `--timeout` / `--json`，未知选项抛错      |
| `classifyReadiness(status, body)`  | 把 HTTP 响应映射到契约三态；不符契约 → `unexpected` |
| `probeReadiness({url, timeoutMs})` | 唯一有副作用的函数：一次 HTTP GET                   |
| `formatReport(report)`             | 单行人类可读                                        |

### 3.2 目标地址优先级

```text
--url  >  READY_URL  >  API_BASE_URL + /ready  >  http://127.0.0.1:4100/ready
```

第三级刻意复用 `API_BASE_URL`——那是 web 进程已经在用的变量，运维只需要配一次。尾斜杠归一化，`API_BASE_URL=http://api:4100/` 不会拼出 `http://api:4100//ready`（这是 Sprint 3C 在 `parseApiBaseUrl` 里踩过的同一个坑）。

### 3.3 超时默认 5000ms

与 API 侧 `connectionTimeoutMillis: 5000` 对齐。**探针不该比它探测的对象更有耐心**——如果探针等 30 秒，它会把「API 已经放弃 DB 并返回 503」这件事也拖成「探针超时」，两种状态就混了。

`AbortSignal.timeout` 覆盖 body 读取，所以「发完 header 后卡住」也会在同一个 deadline 被切断（Sprint 3A 在 web 层验证过的同一机制）。

### 3.4 为什么 `database` 字段是权威

契约里 `status` 和 `database` 两个字段有冗余。探针以 `database` 为准，若 `status` 与之矛盾则报 `unexpected`：

```js
// 200 但 database 不是 ok
unexpected('200 response without database "ok"');
// 200 + database:ok 但 status 说别的
unexpected(`status "${declaredStatus}" contradicts database "ok" on 200`);
```

**不猜。** 一个猜的探针比一个报错的探针更危险——它会让运维相信一个不存在的正常状态。

### 3.5 退出码只有两值

`ready` → 0，其余全部 → 1。原因由 JSON 的 `status` 承担。

这是刻意的：告警只需要「是否可用」这一个比特，细分状态是给人排查用的。如果退出码也细分（0/1/2/3/4），任何监控系统接进来都得先写一张映射表。

---

## §4 Task B：测试

`tests/check-readiness.test.ts`，**21 个用例**，分 6 组：

| 分组                | 覆盖                                                                           |
| ------------------- | ------------------------------------------------------------------------------ |
| `resolveReadyUrl`   | 四级优先级、尾斜杠归一化、非法 URL 抛错                                        |
| `parseProbeArgs`    | 三个选项、未知选项抛错、非法超时抛错                                           |
| `classifyReadiness` | 契约三态、status/database 矛盾、非 JSON body、未识别状态码、**body 截断上限**  |
| `probeReadiness`    | 真实 stub server 四态（ready/error/unconfigured/hang）、连接拒绝、**超时切断** |
| CLI 退出码          | ready→0、每种失败→1、挂起时也在 deadline 内返回 1                              |
| 契约漂移            | 端点返回 HTML / 空对象 / 418 → `unexpected`                                    |

### 4.1 类型收窄的一个细节

`ReadinessClassification` 是判别联合（`status` 为判别式），`rawBody` 只存在于 `unexpected` 分支、`reason` 只存在于 `unreachable` 分支。测试里最初到处写 `expect(result.rawBody)` 导致 tsc 报错（strict 模式下属性不存在）。

修法是加两个收窄辅助函数而不是撒 `as any`：

```ts
function expectUnexpected(
  result: ReadinessClassification,
): Extract<ReadinessClassification, { status: 'unexpected' }> {
  expect(result.status).toBe('unexpected');
  return result as Extract<ReadinessClassification, { status: 'unexpected' }>;
}
```

这样断言本身也变成了契约的一部分——如果将来 `unexpected` 分支改名，编译会立刻失败。

### 4.2 超时用例的判据

```ts
expect(report.reason).toBe('timeout');
expect(elapsed).toBeLessThan(3000); // 宽松上限
```

上限给 3000ms 而 deadline 是 250ms，是因为**这个用例要证明的不是「快」，而是「会返回」**。如果哪天 stub 自己断开了连接，`reason` 会变成 `connect` 而不是 `timeout`，断言仍然会抓住。这是 Sprint 3A 负向对照实验的同一个思路。

---

## §5 Task C：文档同步

### 5.1 `docs/runbook.md`

新增独立小节「数据面就绪探针（ready:check，只读）」，位置在「访问日志统计」之后、「官方数据更新流程」之前——运维手册里的顺序就是排查时的手顺。

内容要点：

- **与日检的分工**：`ops:daily` 看数据**内容**（来源健康、到期事实、待审队列），`ready:check` 看数据面**可用性**。两者互不替代，且日检完全不发网络请求、探针只发一次 GET。
- 三种调用方式：宿主机 `pnpm ready:check`、容器内 `docker compose exec -T api node scripts/check-readiness.mjs`、带参数 `--url` / `--timeout` / `--json`。
- 五态对照表：`status` / 含义 / 下一步该查什么。
- **为什么刻意不接 compose healthcheck、不在 Caddy 暴露**：依赖链 `db → api(/health) → web(depends_on api healthy) → caddy`，接进去意味着 DB 一抖动就让 api unhealthy → web 不启动 → 整站下线。而且 `/ready` 会泄露内部状态。所以它是**主动探针**（人/脚本按需调用），不是**被动 healthcheck**（编排器轮询）。

同时在既有的「liveness 与 readiness 是两件事」小节里，把原来手写 `docker compose exec ... node -e "fetch(...)"` 的命令指向新探针——手工 `node -e` 能拿到原始响应但没有结论、没有退出码，探针是它的上位替代。原始响应那条保留，因为调试端点本身时仍然需要。

### 5.2 `docs/api-contract.md`

`/ready` 契约行补一句消费方指向，让读契约的人知道谁在用它：

> 消费方是运维探针 `scripts/check-readiness.mjs`（`pnpm ready:check`，只读、退出码 0/1、`--json` 输出机器可读结论）。

契约本身（三态、`SELECT 1`、不缓存）一字未改。

### 5.3 没有新建 ADR

这是给已有端点接调用方，不改变任何架构决策或对外语义。ADR 0002 §4 讲的降级分层不受影响。

---

## §6 Task D：`package.json`

```json
"ready:check": "node scripts/check-readiness.mjs"
```

放在 `ops:daily` 附近（数据面运维命令聚在一起）。没有加进 `release:check`——那是发布门禁，不该在发布时因为生产 DB 抖动而拦住发布。

---

## §7 完整测试结果

全部真实执行：

| 命令                                              | 结果                                                           | EXIT  |
| ------------------------------------------------- | -------------------------------------------------------------- | ----- |
| `pnpm run typecheck`                              | 无错误                                                         | **0** |
| `pnpm test`                                       | **22 files / 264 tests** 全过（3C 基线 243，+21）              | **0** |
| `pnpm run test:verify-gate`                       | 40 pass / 0 fail                                               | **0** |
| `pnpm run build`                                  | 无错误                                                         | **0** |
| `pnpm run format:check`                           | 见 §7.1                                                        | **1** |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | 无告警                                                         | **0** |
| `pnpm run test:python`                            | 239 passed in 2.68s                                            | **0** |
| `pnpm run verify:all`                             | `{"status":"passed","qualifications":6,"passed":6,"failed":0}` | **0** |
| `pnpm run smoke:docker`                           | **11 项全 ok**，末行 `docker smoke passed`                     | **0** |

`verify:all` 的环境：`DATABASE_URL` 与 `API_DATABASE_URL` 均设为 `postgresql://postgres@127.0.0.1:55432/qualification_media`。

`smoke:docker` 11 项（日志 `var/smoke-3d.log`）：镜像构建、facts 1007 恢复、首页渲染、资格页渲染、sitemap 列出可索引页、年度筛选 noindex、pass-rate 排序变体 noindex、ICS 下载、robots.txt 指向 sitemap、未知资格 404。

### 7.1 `format:check` 的失败归因

**EXIT 1，唯一失败文件：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md`。**

这是 Sprint 3A 的**任务输入文档**，由 Owner 下发，在 `013e680` 入库时就没有格式化。属**既有问题，非本轮引入**（3B、3C 两轮报告均已记录同一失败）。

用同一 glob 集加 `!docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 排除后复验：

```text
All matched files use Prettier code style!
EXIT 0
```

本轮自己写的所有文件（`scripts/check-readiness.mjs`、`.d.mts`、`tests/check-readiness.test.ts`、`docs/runbook.md`、`docs/api-contract.md`、`package.json`、两份 3D 文档）均已 `prettier --write` 通过。

**没有擅自格式化 Owner 的输入件**——那会让历史文档的 diff 混进本轮 commit，破坏归因。列为待授权项（§9 第 1 条）。

### 7.2 `smoke:docker` 执行观察

沿用 3C 的教训：一开始就把输出重定向到 `var/smoke-3d.log`，不依赖终端缓冲。约 3 分钟完成（镜像缓存命中）。

---

## §8 回归护栏

本轮新增 21 个用例，关键护栏：

| #   | 护栏                                           | 防的是什么                              |
| --- | ---------------------------------------------- | --------------------------------------- |
| 1   | `ready` → exit 0                               | 正常时误报告警（最伤信任的失败）        |
| 2   | 每种非 ready 态 → exit 1                       | 失败被吞成成功                          |
| 3   | `unconfigured` 与 `error` 可区分               | 配置错和连接错混为一谈，排查走错方向    |
| 4   | `unreachable` 的 `timeout` 与 `connect` 可区分 | 进程卡死和进程没起来混为一谈            |
| 5   | 挂起端点在 deadline 内返回                     | 探针自己变成新的挂起源                  |
| 6   | 非契约响应 → `unexpected` 而非猜测             | 端点被改坏后探针继续报「正常」          |
| 7   | `rawBody` 截断到 200 字符                      | 一个 HTML 错误页把报告刷爆              |
| 8   | 尾斜杠归一化                                   | `API_BASE_URL` 带尾斜杠时拼出 `//ready` |

### 8.1 被测试抓出的问题

本轮测试是**先写、被测试推翻**的，不是事后补的。过程中修正了两处：

1. **判别联合收窄缺失** —— 最初测试直接访问 `result.rawBody`，tsc strict 模式报属性不存在。改用 `Extract<...>` 辅助函数收窄（§4.1）。这是类型系统在强制测试尊重契约分支，不是噪音。
2. **`expectUnexpected` 首次实现漏了 `rawBody` 上限断言** —— 补了 `caps the retained body excerpt` 用例（5000 字符输入 → 输出 ≤ 201 字符），否则截断逻辑没有任何护栏。

---

## §9 未处理问题

1. **`format:check` 仍 EXIT 1**（`DEEPSEEK_HARNESS_SPRINT_3A_TASK.md`）。修它要改 Owner 下发的历史输入件，需授权。修法一行：`prettier --write` 该文件。
2. **探针尚未接定时调度**。本轮只交付「可调用的探针」，没装 cron / systemd timer / CI 定时任务——runbook 的既定口径是「不装定时任务、不装通知，全手动」。要自动化需 Owner 决定调度位置（VPS cron？外部监控？）。
3. **探针未接告警**。exit 1 之后谁收到通知，本轮没有答案。这与第 2 条是同一个决策。
4. **`/ready` 未在 Caddy 暴露**（有意）。如果将来要从公网监控，需要单独评估——它泄露内部状态。
5. **G-15 测试缺口仍在**：`apps/web/src/server.ts` 的 19 条路由仍无进程级测试。本轮没有触碰该文件。

---

## §10 风险

| 风险                             | 影响                                            | 缓解                                                         |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| 探针被误接进 compose healthcheck | DB 抖动 → api unhealthy → web 不启动 → 整站下线 | runbook 与代码注释两处写明「刻意不接」及原因；依赖链写进文档 |
| `/ready` 被暴露到公网            | 泄露「数据库连不上」等内部状态                  | 未加 Caddy 路由；契约注明                                    |
| 探针超时值被调得过大             | 「API 已放弃 DB」与「探针超时」两种状态混淆     | 默认 5000ms 与 `connectionTimeoutMillis` 对齐；注释说明理由  |
| 探针误报 `ready`                 | 运维相信一个不存在的正常状态                    | 以 `database` 字段为权威；矛盾即 `unexpected`；8 条护栏      |
| 有人手工 `node -e` 绕过探针      | 拿到原始响应但没有结论、没有退出码              | runbook 把探针列为上位替代，同时保留原始响应命令供调试       |

---

## §11 下一步建议

按优先级：

**P1 — 决定探针的调度与告警归属。** 本轮交付了「能调用的探针」，但没人调用它仍然是同一个洞。三个选项：(a) VPS cron 每 5 分钟跑一次，失败写 syslog；(b) 接入外部监控（UptimeRobot 等）直接打 `/ready`——但这要把端点暴露出去，与当前设计冲突；(c) 只在发布流程里手工跑。**推荐 (a)**：不暴露端点、不需要新依赖、失败日志与现有 runbook 的排查路径一致。需 Owner 拍板。

**P2 — 修 `format:check` 的 3A 文档格式**，让门禁回到全绿。一行命令，但改的是历史输入件，需授权。

**P3 — G-15 测试缺口**：`apps/web/src/server.ts` 的 19 条路由无进程级测试。这是三轮报告反复出现的遗留项，也是当前测试覆盖最薄的地方。

---

## §12 验收对照

| #   | 验收项                   | 状态                                                         |
| --- | ------------------------ | ------------------------------------------------------------ |
| 1   | 探针脚本存在且只读       | ✅ 单次 GET，无写操作                                        |
| 2   | 三态分类正确             | ✅ 真实子进程实证（§1.3）                                    |
| 3   | 五态可区分               | ✅ `ready`/`error`/`unconfigured`/`unreachable`/`unexpected` |
| 4   | 退出码 0/1               | ✅ CLI 用例覆盖                                              |
| 5   | 超时生效                 | ✅ 250ms deadline 用例                                       |
| 6   | 测试 21 个全过           | ✅                                                           |
| 7   | 文档同步                 | ✅ runbook + api-contract                                    |
| 8   | 未改 `/health`           | ✅ 一行未动                                                  |
| 9   | 未改 `services/api/**`   | ✅                                                           |
| 10  | 未改 `deploy/**`         | ✅                                                           |
| 11  | 未接 compose healthcheck | ✅ 且文档写明理由                                            |
| 12  | 无新增依赖               | ✅                                                           |
| 13  | 全量测试绿               | ✅ 9 项（`format:check` 见 §7.1）                            |
| 14  | 工作树干净               | ✅ commit 后 `git status --short` 无输出                     |
| 15  | 未进入 Sprint 3E / 4     | ✅                                                           |

---

## §13 停止声明

Sprint 3D 到此结束。

本轮**只做** `/ready` 的可观测化。**没有**：接定时调度、接告警、暴露 `/ready` 到公网、改 `/health` 语义、改 compose、改 Caddy、改 Dockerfile、改 `services/api/**`、动 `/pass-rate/` 的 `Promise.all`、进 Sprint 3E / Sprint 4。

代码已入库（`f99e475`）。下一步（探针调度归属、`format:check`、G-15）由 Owner 根据本报告决定。
