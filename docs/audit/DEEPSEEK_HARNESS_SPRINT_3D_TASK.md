# DeepSeek Harness — Sprint 3D 任务文档

**项目**：ShikakuCheck（`jp_qualification_media`）
**执行工具**：DeepSeek Harness
**轮次**：Sprint 3D — 把 `/ready` 接进可观测面
**上游依据**：`docs/audit/SPRINT_3C_REPORT_2026-11-24.md` §12（P1）、`docs/audit/SPRINT_3B_REPORT_2026-11-24.md` §10 第 2 条
**仓库基线**：`9fc9c72`（`a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438 → 9bc946f → 9fc9c72`）

---

## §0 核心目标

Sprint 3B 建了 `GET /ready`，它能真实回答「现在能不能服务查询」。但从建好那天起，**没有任何东西调用它**。

已核实的事实：

| 检查项                                           | 结果                                                                           |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `services/api/src/server.ts` 是否有 `/ready`     | 有（:79），三态 `200 ready` / `503 error` / `503 unconfigured`                 |
| 是否有测试                                       | 有（`tests/api-readiness.test.ts`，13 例）                                     |
| 是否有文档                                       | 有（`docs/api-contract.md:6`、`docs/runbook.md:375-390`）                      |
| **是否有任何调用方**                             | **没有**                                                                       |
| `scripts/ops-daily-report.mjs` 是否探 `/ready`   | 不探。它是纯数据库只读巡检，`BEGIN READ ONLY` 后直接查表，**不发任何外部请求** |
| `deploy/docker-compose.prod.yml` 是否探 `/ready` | 不探。api healthcheck 打 `/health`（liveness），这是有意为之                   |
| `deploy/caddy/Caddyfile` 是否暴露 `/ready`       | 不暴露。`reverse_proxy web:3000`，`/ready` 在 api 容器内                       |

于是生产上「数据面挂了」的唯一信号仍然是**用户报障**。运维手上有一个准确的探针，却只能手工敲命令（`docs/runbook.md:382` 那条 `docker compose exec`）。

本轮目标：**给 `/ready` 一个真正的消费方** —— 一个可手工跑、可被脚本调度、输出机器可读结论的只读探针。

> 本轮**不**解决 `/pass-rate/` 单资格故障的观测（3A §7.5 遗留）。那需要逐资格探测，是另一件事，见 §12。

---

## §1 执行前必读文件

按顺序读完再动手：

1. `docs/audit/SPRINT_3C_REPORT_2026-11-24.md` —— §12 下一步建议
2. `services/api/src/server.ts` —— :60-95 `/health` 与 `/ready` 的实现与注释（**`/health` 一行都不许改**）
3. `services/api/src/database-ready.ts` —— 60 行全文，`ReadinessReport` 三态的类型定义
4. `tests/api-readiness.test.ts` —— 13 个既有用例，**新探针必须与它描述的三态一致**
5. `scripts/ops-daily-report.mjs` —— 136 行全文，本轮的**风格与退出码先例**
6. `scripts/access-report.mjs` —— 只读脚本的写法先例（无副作用、纯函数可测、`--json` 开关）
7. `scripts/access-report.d.mts` —— 上一行为 `.mjs` 脚本配类型声明的先例
8. `tests/access-report.test.ts` —— 脚本测试的写法先例
9. `docs/runbook.md` —— :256-266 人工日检节、:268-279 访问日志统计节（新增节要贴着它们写）、:375-390 liveness/readiness 节
10. `docs/api-contract.md` —— :6 `/ready` 的契约描述
11. `package.json` —— scripts 段，现有命名风格

---

## §2 Git 安全检查

动手前：

```bash
git status --short          # 必须为空
git log --oneline -3        # HEAD 必须是 9fc9c72
git rev-parse --abbrev-ref HEAD   # chore/phase1-baseline
```

**禁止**：`git reset --hard`、`git clean -fd`、`git checkout -- .`、`git restore .`。

提交方式（沿用 3A/3B/3C 已验证的做法）：

- 逐路径 `git add -- <path>`，**绝不用 `git add -A`**
- commit message 用无 BOM UTF-8 写文件再 `-F` 传入：

```powershell
$msg = @'
feat: ...
'@
[System.IO.File]::WriteAllText(
  (Join-Path (Get-Location) 'var/commit-msg-3d.txt'),
  $msg,
  (New-Object System.Text.UTF8Encoding($false))
)
git commit -F var/commit-msg-3d.txt
```

提交后校验 subject 首字节无 BOM（`Format-Hex` 应看到 `66 65 61 74 3A 20` = `feat: `）。

---

## §3 硬边界

### §3.1 允许修改的文件

| 文件                                            | 动作                                             |
| ----------------------------------------------- | ------------------------------------------------ |
| `scripts/check-readiness.mjs`                   | **新建**                                         |
| `scripts/check-readiness.d.mts`                 | **新建**（类型声明，对齐 `access-report.d.mts`） |
| `tests/check-readiness.test.ts`                 | **新建**                                         |
| `package.json`                                  | 只加一条 `ready:check` script                    |
| `docs/runbook.md`                               | 新增一节 + 在 liveness/readiness 节补一行指引    |
| `docs/api-contract.md`                          | `/ready` 行补「已有运维探针消费」                |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3D_TASK.md` | 本文档（新建）                                   |
| `docs/audit/SPRINT_3D_REPORT_2026-11-24.md`     | 执行报告（新建）                                 |

### §3.2 明确禁止

- **不得修改 `services/api/src/**`** —— `/ready` 已经是对的，本轮只加消费方
- **不得修改 `/health`** —— 红线，3B 已固化为测试
- **不得修改 `deploy/**`、`Dockerfile`** —— 不接 compose healthcheck，不加 Caddy 路由
- **不得修改 `apps/web/**`**
- **不得给 `scripts/ops-daily-report.mjs` 加网络请求** —— 它在 runbook 里的契约是「不发外部请求」，破坏它会污染已有的只读语义
- **不得安装任何新依赖** —— 用内置 `fetch`（node 24 已有）与 `AbortSignal.timeout`
- 不得改 `/pass-rate/` 任何行为、不得改 schema、不得碰生产库
- 不得自行进入 Sprint 3E / 4

### §3.3 为什么不接进 compose healthcheck（必须写进报告）

compose 依赖链是 `db(pg_isready) → api(/health) → web(depends_on api healthy) → caddy`。把 `/ready` 接上去意味着：数据库抖动 → api unhealthy → web 不启动 → Caddy 下线 → **整站不可用**。这比它要解决的问题严重得多。

同理**不**在 Caddy 暴露 `/ready` 到公网：那是一个会对外泄露「数据库连不上」内部信息的端点。

所以本轮交付的是**主动探针**（人/脚本按需调用），不是**被动 healthcheck**（编排器轮询）。

---

## §4 Task A — 新建 `scripts/check-readiness.mjs`

### §4.1 接口

```bash
node scripts/check-readiness.mjs                          # 默认探 http://127.0.0.1:4100/ready
node scripts/check-readiness.mjs --url=http://api:4100/ready
node scripts/check-readiness.mjs --timeout=3000 --json
```

解析优先级：`--url` > 环境变量 `READY_URL` > `API_BASE_URL` + `/ready` > `http://127.0.0.1:4100/ready`。

### §4.2 导出的纯函数（必须可单测，不产生副作用）

```js
export function resolveReadyUrl(env, overrideUrl) // 返回规范化后的 URL 字符串，尾部斜杠归一
export function parseProbeArgs(argv)              // { url, timeoutMs, json }，非法值抛错
export function classifyReadiness(httpStatus, body) // 见 §4.3
export function formatReport(report)              // 人类可读单行结论
```

**模块加载时不得发起请求、不得读文件、不得 exit** —— 只有 `import.meta.url === pathToFileURL(process.argv[1]).href` 成立时才执行主流程（对齐 `access-report.mjs` 的写法）。

### §4.3 状态分类（`classifyReadiness`）

必须与 `services/api/src/database-ready.ts` 的 `ReadinessReport` 三态**严格对齐**：

| HTTP | body                             | 归类           | 含义                       |
| ---- | -------------------------------- | -------------- | -------------------------- |
| 200  | `{status:'ready',database:'ok'}` | `ready`        | 数据面可用                 |
| 503  | `{database:'error', message}`    | `error`        | 数据库不可达（瞬态）       |
| 503  | `{database:'unconfigured'}`      | `unconfigured` | 进程没拿到 DB 变量（永久） |
| 其它 | 任意                             | `unexpected`   | 端点行为与契约不符         |

`classifyReadiness` 必须容忍：非 JSON body、空 body、`database` 字段缺失、`status` 字段与 `database` 矛盾（以 `database` 为准，因为它是 API 的真实判断）。矛盾情况归 `unexpected` 并在报告里记下原始 body 片段。

### §4.4 网络失败与超时

- 用 `AbortSignal.timeout(timeoutMs)`，默认 **5000ms**（与 `services/api/src/public-facts.ts:60`、`database-ready.ts` 的 `connectionTimeoutMillis: 5000` 对齐；探针本身不该比它探测的对象更有耐心）
- 连接被拒 / DNS 失败 / 超时 → 归类 `unreachable`，报告里保留原始 `code`（`ECONNREFUSED`、`TimeoutError` 等）
- **超时与拒绝必须能区分**：报告里 `status: 'unreachable'` + `reason: 'timeout' | 'connect'`

### §4.5 输出与退出码

`--json` 时向 stdout 打单个 JSON 对象：

```json
{
  "status": "ready | error | unconfigured | unreachable | unexpected",
  "url": "http://127.0.0.1:4100/ready",
  "httpStatus": 200,
  "database": "ok",
  "message": null,
  "durationMs": 12,
  "checkedAt": "2026-11-24T13:00:00.000Z"
}
```

非 `--json` 时打一行人类可读结论（`formatReport`）。

退出码：**`ready` → 0；其余一律 1**。理由：告警只需要「是否可用」这一个比特；具体原因由 JSON 的 `status` 承担，写进退出码只会让调用方多一层分支而无信息增益。

### §4.6 只读性

不发任何写请求、不读数据库、不写文件、不改环境。**唯一副作用是发起一次 HTTP GET。**

---

## §5 Task B — 新建 `tests/check-readiness.test.ts`

必须覆盖：

1. `resolveReadyUrl` 四档优先级；`API_BASE_URL` 带尾斜杠时不拼出 `//ready`
2. `parseProbeArgs`：默认值、`--url=`、`--timeout=`、`--json`、非法 `--timeout`（负数/非数字/0）抛错
3. `classifyReadiness` 覆盖 §4.3 四类 + 非 JSON body + 空 body + `database` 缺失 + `status`/`database` 矛盾
4. `formatReport` 对四类各出一条，含 URL 与耗时
5. **进程级**（起真实 HTTP stub，对齐 `tests/web-server.test.ts` 的 `stubServer` 写法）：
   - stub 返 200 `{status:'ready',database:'ok'}` → 退出码 0
   - stub 返 503 `{database:'error',message:'connect ECONNREFUSED'}` → 退出码 1，JSON `status: 'error'`
   - stub 返 503 `{database:'unconfigured'}` → 退出码 1，JSON `status: 'unconfigured'`
   - stub **接受连接但永不应答** → 在 `--timeout=300` 下 **500ms 内**退出，`status: 'unreachable'`、`reason: 'timeout'`
   - 端口无人监听 → `status: 'unreachable'`、`reason: 'connect'`
6. 断言**不修改**任何环境变量、不写文件

**超时用例必须真的证明是 deadline 生效**，不是 stub 主动断开（参考 3A 的负向对照做法：stub 只 accept 不回包）。

---

## §6 Task C — 文档

### §6.1 `docs/runbook.md`

在「访问日志统计（access-report，只读）」节**之后**新增「数据面就绪探针（ready:check，只读）」节，内容：

- 用途：一条命令回答「数据面现在能不能服务查询」，输出机器可读结论
- 三种调用形态：宿主机（`pnpm ready:check`）、容器内（`docker compose exec -T api node scripts/check-readiness.mjs --url=http://127.0.0.1:4100/ready`）、远程（`--url`）
- 退出码语义（0/1）与 JSON `status` 四值含义
- 与 `ops:daily` 的分工：日检看**数据内容**（来源健康、到期、待审），探针看**数据面可用性**；两者互不替代
- 明确「未接 healthcheck、未在 Caddy 暴露」及原因（引用 §3.3）

### §6.2 `docs/api-contract.md`

`/ready` 行补一句：已有运维探针 `scripts/check-readiness.mjs`（`pnpm ready:check`）消费此端点；仍未接入编排器 healthcheck。

### §6.3 `docs/runbook.md` 的 liveness/readiness 节

在 `:382` 那条 `docker compose exec` 命令旁补一行：现在可以直接用 `pnpm ready:check`（或容器内 `node scripts/check-readiness.mjs`），不必手写 `node -e`。

---

## §7 Task D — `package.json`

只加一条，位置紧跟 `ops:daily`：

```json
"ready:check": "node scripts/check-readiness.mjs",
```

---

## §8 完整测试要求

全部真实执行，逐条记录 EXIT 码：

| 命令                                                                       | 期望                      |
| -------------------------------------------------------------------------- | ------------------------- |
| `pnpm run typecheck`                                                       | 0                         |
| `pnpm test`                                                                | 全过，用例数 ≥ 243 + 新增 |
| `pnpm run test:verify-gate`                                                | 40 pass / 0 fail          |
| `pnpm run build`                                                           | 0                         |
| `pnpm run format:check`                                                    | 见 §8.1                   |
| `pnpm exec eslint . --ignore-pattern "Python/**"`                          | 0                         |
| `pnpm run test:python`                                                     | 239 passed                |
| `pnpm run verify:all`（`DATABASE_URL` 与 `API_DATABASE_URL` 均设为本地库） | 6/6 PASS                  |
| `pnpm run smoke:docker`                                                    | 11 项全 ok                |
| `pnpm run ready:check`（对着真实 API）                                     | 0，`status: ready`        |

### §8.1 `format:check` 的已知既有失败

`docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 自 3A 入库起就没格式化过，`format:check` 因此 EXIT 1。**这是既有问题，不是本轮引入**。

本轮处理方式：用同一 glob 集加 `!docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 复验，证明其余全绿；**本轮的 `prettier --write` 只作用于本轮新增/修改的文件**。该历史文件是否格式化留给 P3 单独决策。

---

## §9 回归护栏（必须成立）

1. `/health` 仍返回 `{status:'ok',stage:0}` 且不访问数据库 —— `tests/api-readiness.test.ts` 全过
2. `ops:daily` 仍不发外部请求 —— 本轮不改它
3. `deploy/**` 与 `Dockerfile` 零改动 —— `git status` 证明
4. `services/api/src/**` 零改动 —— `git status` 证明
5. 新探针在**无人监听端口**下不挂起，5s 内退出
6. 新探针在真实 API + 真实库下 `status: ready`
7. 新探针在 API 未配置 DB 时 `status: unconfigured`（**用真实子进程验证，不能只靠单测**）

第 7 条是本轮最重要的实证：它证明探针能区分「配置错」与「连不上」，这是 3B 三态设计的价值兑现。

---

## §10 不允许伪造测试结果

- 没跑的命令写 `NOT RUN` + 原因
- 超时用例必须真的让 stub 挂住，不许用「stub 直接断开连接」冒充超时
- 三态验证必须用真实子进程 + 真实 HTTP，不许 mock 掉网络层后声称「已验证」
- 长耗时脚本（`smoke:docker`）一开始就重定向到 `var/` 下的日志文件，不要依赖终端缓冲（3C 教训）

---

## §11 完成报告

必须生成 `docs/audit/SPRINT_3D_REPORT_2026-11-24.md`，13 节：

1. 执行摘要
2. Git 状态（基线 / 改动清单 / 提交 hash）
3. Task A：探针实现（接口、四态分类、超时策略）
4. Task B：测试覆盖（含超时负向对照）
5. Task C：文档同步
6. Task D：`package.json`
7. 三态实证（真实子进程矩阵）
8. 完整测试结果（逐条 EXIT）
9. 回归护栏 7 条逐条结论
10. 未处理问题
11. 风险
12. 下一步建议（分优先级）
13. 停止声明

---

## §12 验收标准

- [ ] `scripts/check-readiness.mjs` 存在，模块导入无副作用
- [ ] 四态分类与 `ReadinessReport` 严格对齐
- [ ] 超时有 `AbortSignal.timeout` 且默认 5000ms
- [ ] 退出码 `ready`→0、其余→1
- [ ] 超时与连接拒绝可区分
- [ ] `tests/check-readiness.test.ts` 覆盖 §5 全部 6 类，含真实超时
- [ ] 三态实证：真实子进程下 `ready` / `unconfigured` / `error` 各验一次
- [ ] `package.json` 只有一条新增 script
- [ ] runbook 新增节 + api-contract 补充
- [ ] `services/api/**`、`deploy/**`、`Dockerfile`、`apps/web/**` 零改动
- [ ] `/health` 行为未变
- [ ] 完整测试矩阵全部真实执行并记录 EXIT
- [ ] 工作树干净，commit hash 已记录
- [ ] 报告 13 节齐全

---

## §13 停止条件

本 Sprint 完成后**必须停止**。不得自行进入：

- Sprint 3E / 4
- `/pass-rate/` 逐资格探测
- Caddy 路由改动
- 把 `/ready` 接进 compose
- 任何 SEO / 首页 / 资格页工作

下一步由 Owner 根据报告决定。

---

## §14 与 Sprint 3B / 3C 的关系

| 轮次 | 解决的问题                                                | 本轮关系                                       |
| ---- | --------------------------------------------------------- | ---------------------------------------------- |
| 3B   | api 配置缺失从「伪装成空数据」改为明确 500；新增 `/ready` | 本轮给 `/ready` 第一个消费方，兑现 3B 设计价值 |
| 3C   | web 配置缺失从「静默连自己」改为启动期硬失败              | 同一思路（失败要响亮）在观测层的延伸           |
| 3D   | `/ready` 无人调用                                         | 本轮                                           |

三轮共同主题：**让「看起来正常」的错误变成「明确失败」，并且让失败可被发现。**
