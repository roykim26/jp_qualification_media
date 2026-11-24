# DeepSeek Harness — Sprint 3C 任务文档

**项目**：ShikakuCheck（`jp_qualification_media`）
**执行工具**：DeepSeek Harness
**轮次**：Sprint 3C — web 进程的配置门禁
**上游依据**：`docs/audit/SPRINT_3B_REPORT_2026-11-24.md` §10 第 5 条 / §12.1（P1）
**仓库基线**：`f09e438`（`a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438`）

---

## §0 核心目标

Sprint 3B 把 **api 进程**的「配置缺失」从「伪装成合法空数据」改成了明确失败。但**同一个毛病在 web 进程还在**，而且位置更危险：web 是面向公网的那一层。

现状（已核实的代码事实）：

```ts
// apps/web/src/server.ts:45
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4100';
```

缺 `API_BASE_URL` 时静默回落到本机地址。在容器里这意味着 web 去连**自己**的 4100 端口（那里没有 API）→ 连接失败 → 所有数据页 503。而 `/` 走 `Promise.allSettled` 降级，**仍然是 200**；compose 的 web healthcheck 正好打 `/`（`deploy/docker-compose.prod.yml:69`）。

结果就是本轮要消除的那种状态：

> **用户看到整站 503，运维看到「服务健康」。**

同理，`SITE_ORIGIN` 在 web 里有**两条互不一致的代码路径**：

| 位置                                             | 缺 `SITE_ORIGIN` 时                                                            |
| ------------------------------------------------ | ------------------------------------------------------------------------------ |
| `apps/web/src/server.ts:93-102` `siteOrigin()`   | production 下 `throw`，但**只在请求 `/robots.txt` 或 `/sitemap.xml` 时才触发** |
| `apps/web/src/layout.ts:33-43` `canonicalHref()` | **静默**回落到相对路径，canonical / `og:url` 全部退化成相对 URL                |

即：`/` 永远 200，SEO 文件要么 502、要么悄悄错。这是「失败得太晚、太局部」。

本轮目标：**让 web 进程在配置错误时，在启动阶段就明确失败**，而不是把错误摊到运行期的每一个请求上。

---

## §1 执行前必读文件

按顺序读完再动手：

1. `docs/audit/SPRINT_3B_REPORT_2026-11-24.md` —— §10 第 5 条、§12.1
2. `apps/web/src/server.ts` —— 全文 604 行，重点 :44-45、:74-102、:154-176、:597-604
3. `apps/web/src/layout.ts` —— :33-43 `canonicalHref()`、:251-260 noindex 与 structured data
4. `packages/config/src/index.ts` —— 15 行，api 侧硬门禁的既有写法（**注意：web 不能直接 import 它**，见 §3.3）
5. `deploy/docker-compose.prod.yml` —— :47-74 web 服务的 env 与 healthcheck
6. `Dockerfile` —— :15 `ENV NODE_ENV=production`（冒烟容器里的 web 就是 production）
7. `tests/web-server.test.ts` —— `startWeb()` :138-163（`NODE_ENV='test'` + `API_BASE_URL`）
8. `scripts/verify-lib.mjs` —— :188-197 `createRuntime()` 起 web 时**不设 NODE_ENV**
9. `scripts/docker-smoke.mjs` —— :322-339 web 容器 env（有 `API_BASE_URL` 与 `SITE_ORIGIN`）
10. `docs/runbook.md` —— :7 SITE_ORIGIN 说明、:285 拓扑与 `WEB_HOST` 说明
11. `README.md` —— :23 `API_BASE_URL` 的现有描述

---

## §2 Git 安全检查

### 2.1 开工前必须确认

```bash
git status --short              # 必须无输出
git log --oneline -3            # HEAD 必须是 f09e438
git rev-parse --abbrev-ref HEAD # 必须是 chore/phase1-baseline
```

### 2.2 禁止操作

```bash
git reset --hard
git clean -fd
git checkout -- .
git restore .
```

工作树若不干净，先查清来源再决定，不得直接丢弃。

### 2.3 提交方式

逐路径 `git add --`，**绝不** `git add -A`。提交信息用无 BOM UTF-8 写入：

```powershell
[System.IO.File]::WriteAllText($path, $msg, (New-Object System.Text.UTF8Encoding($false)))
```

（Sprint 1/2 曾因 `Out-File -Encoding utf8` 让 subject 首字节变成 BOM。）

---

## §3 硬边界

### 3.1 允许修改

```text
apps/web/src/config.ts          新建：web 配置解析与校验
apps/web/src/server.ts          接线：模块加载时校验、siteOrigin() 改为共用解析器
apps/web/src/layout.ts          canonicalHref() 改用同一解析器（行为不变）
tests/web-config.test.ts        新建
tests/web-server.test.ts        仅在需要时补：production 门禁不得影响 test 环境
docs/runbook.md                 补 web 配置门禁说明
README.md                       补 API_BASE_URL / SITE_ORIGIN 的 production 要求
docs/audit/DEEPSEEK_HARNESS_SPRINT_3C_TASK.md    本文档
docs/audit/SPRINT_3C_REPORT_2026-11-24.md        执行报告
```

### 3.2 明确禁止

- **不得**修改 `deploy/`（Caddyfile、docker-compose.prod.yml 均不动）
- **不得**修改 `Dockerfile`
- **不得**修改 `packages/config/src/index.ts`（api 侧门禁已工作，不碰）
- **不得**让 web import `packages/config`（理由见 §3.3）
- **不得**修改 `services/api/**`（Sprint 3B 已收口）
- **不得**修改 `/pass-rate/` 的 `Promise.all` 粒度（Owner 已定保留方案 A）
- **不得**修改任何路由的响应语义、状态码、索引策略
- **不得**改 `scripts/verify-lib.mjs` / `scripts/verify-all.mjs` / `scripts/docker-smoke.mjs` 的行为
- **不得**改 `.env`、不得写入任何真实凭据
- **不得**做生产数据库操作、部署、Caddy/Docker/CDN 变更

### 3.3 为什么 web 不能 import `packages/config`

`packages/config/src/index.ts:12-15` 在 production 下要求 `DATABASE_URL` 与 `API_DATABASE_URL`。web 进程**不需要也不应该**持有数据库凭据（它在 compose 里没有这两个变量）。若让 web import 它，web 会在 production 下因缺 `DATABASE_URL` 直接拒绝启动 —— 那是**用一个错误换另一个错误**。

所以 web 需要自己的、只覆盖自己所需变量的门禁。

---

## §4 Task A — 抽出 web 配置模块

新建 `apps/web/src/config.ts`，**纯函数、无模块级副作用**（layout.ts 也会 import 它，不能因此触发启动校验）。

### 4.1 导出面

```ts
export type WebConfig = {
  nodeEnv: string;
  port: number;
  host: string;
  apiBaseUrl: string;
  siteOrigin: string | undefined;
  upstreamTimeoutMs: number;
};

export function parseApiBaseUrl(raw: string | undefined): string;
export function parseSiteOrigin(raw: string | undefined): string | undefined;
export function parsePort(raw: string | undefined): number;
export function parseUpstreamTimeoutMs(raw: string | undefined): number;
export function resolveWebConfig(env?: NodeJS.ProcessEnv): WebConfig;
export function assertWebConfig(config: WebConfig): void;
export function loadWebConfig(env?: NodeJS.ProcessEnv): WebConfig; // resolve + assert
```

### 4.2 各字段规则

| 变量                  | 缺省                    | 非法时                              | production 要求   |
| --------------------- | ----------------------- | ----------------------------------- | ----------------- |
| `API_BASE_URL`        | `http://127.0.0.1:4100` | **抛错**（非绝对 URL / 非 http(s)） | **必须显式设置**  |
| `SITE_ORIGIN`         | `undefined`             | **抛错**（非 http(s)）              | **必须显式设置**  |
| `WEB_PORT`            | `3000`                  | 非整数或越界 → 回落 3000            | 不要求            |
| `WEB_HOST`            | `127.0.0.1`             | —                                   | 不要求（见 §4.4） |
| `UPSTREAM_TIMEOUT_MS` | `5000`                  | 非整数或 <100 / >60000 → 回落 5000  | 不要求            |

`parseApiBaseUrl` 必须**归一化尾部斜杠**：现有代码是 `` `${apiBaseUrl}/api/v1/...` ``，若配置成 `http://api:4100/` 就会拼出 `//api/v1/...`。

`parseSiteOrigin` 返回 `new URL(raw).origin`（去掉路径与尾部斜杠），与 `layout.ts` 现有行为一致。

### 4.3 `assertWebConfig` 的抛错文案

必须可被 grep，且与 `packages/config` 的风格一致：

```text
API_BASE_URL is required in production
SITE_ORIGIN is required in production
API_BASE_URL must be an absolute http(s) URL
SITE_ORIGIN must be an absolute http(s) URL
```

**只在 `nodeEnv === 'production'` 时检查"必须显式设置"**；格式校验在任何环境都做（配错了就该早失败）。

### 4.4 为什么 `WEB_HOST` 不进硬门禁

`WEB_HOST` 缺失时 web 在容器内绑 `127.0.0.1`，caddy 连不上 → web healthcheck 打 `/` 也连不上 → 容器 unhealthy → caddy 不启动。**这是响亮的失败，不是静默的错误成功**，与本轮要消灭的那类问题不同。

不改它，理由是不扩大范围；在报告 §未处理问题 里记录。

---

## §5 Task B — 接线

### 5.1 `apps/web/src/server.ts`

模块加载时（替换现有 :44-45 与 :74-81）：

```ts
const webConfig = loadWebConfig();
const port = webConfig.port;
const apiBaseUrl = webConfig.apiBaseUrl;
const upstreamTimeoutMs = webConfig.upstreamTimeoutMs;
```

`siteOrigin()`（:93-102）改为委托 `parseSiteOrigin`，保留 production 兜底抛错（此时启动校验已先一步触发，属于双保险）：

```ts
function siteOrigin(): string {
  const origin = parseSiteOrigin(process.env.SITE_ORIGIN);
  if (origin) return origin;
  if (process.env.NODE_ENV === 'production')
    throw new Error('SITE_ORIGIN is required in production');
  return `http://127.0.0.1:${port}`;
}
```

### 5.2 `apps/web/src/layout.ts`

`canonicalHref()`（:33-43）改为调用 `parseSiteOrigin`，**保持"非法时回落到相对路径"的现有行为**（渲染函数不该因为一个环境变量把整页打成 500）：

```ts
function canonicalHref(path: string): string {
  try {
    const origin = parseSiteOrigin(process.env.SITE_ORIGIN);
    return origin ? `${origin}${path}` : path;
  } catch {
    return path;
  }
}
```

这样两条路径共用**同一套校验规则**，但失败姿态各自合理：启动时硬失败，渲染时软降级。production 下软降级不可达（启动校验已挡住）。

### 5.3 必须保持不变的

- `NODE_ENV === 'test'` 时**不得**抛任何配置错误（`tests/web-server.test.ts` 与 `tests/web-render.test.ts` 都依赖这一点）。
- `NODE_ENV` 未设（`scripts/verify-lib.mjs` 起的 web）时**不得**抛错，行为与今天完全一致。
- `/`、`/robots.txt` 的任何响应语义不变。

---

## §6 Task C — 文档同步

### 6.1 `docs/runbook.md`

在 SITE_ORIGIN 说明（:7）与拓扑段（:285）附近补一节「web 进程的启动门禁」：

- production 下 `API_BASE_URL` 与 `SITE_ORIGIN` 必须显式设置，否则 web **拒绝启动**；
- 说清为什么（缺 `API_BASE_URL` 会静默连自己 → 用户 503 / 健康检查 200）；
- 给出容器内自检命令；
- 说明 `WEB_HOST` 不在此列及原因。

### 6.2 `README.md`

:23 的 `API_BASE_URL` 描述补一句 production 必填，并提 `SITE_ORIGIN` 同属必填。

---

## §7 Task D — 验证与回归

### 7.1 新增测试 `tests/web-config.test.ts`

至少覆盖：

1. `parseApiBaseUrl`：缺省 → `http://127.0.0.1:4100`；合法值原样；**尾部斜杠被去掉**；`api:4100`（无 scheme）→ 抛错；`ftp://x` → 抛错；`not a url` → 抛错。
2. `parseSiteOrigin`：缺省 → `undefined`；`https://shikakucheck.com/` → `https://shikakucheck.com`；`ftp://x` → 抛错；垃圾串 → 抛错。
3. `parsePort`：缺省 → 3000；`'0'` → 0；`'abc'` → 3000；`'70000'` → 3000。
4. `parseUpstreamTimeoutMs`：缺省 → 5000；`'250'` → 250；`'50'` → 5000；`'999999'` → 5000。
5. `assertWebConfig`：production 缺 `API_BASE_URL` → 抛 `API_BASE_URL is required in production`；production 缺 `SITE_ORIGIN` → 抛 `SITE_ORIGIN is required in production`；production 两者齐 → 不抛；development 两者缺 → 不抛；test 两者缺 → 不抛。
6. `loadWebConfig`：production 缺变量 → 抛；development 缺变量 → 返回默认值。

### 7.2 进程级验证（手工探针，写入 `var/`，不入库）

用 `dist` 产物验证真实启动行为：

| 场景                                        | 期望                                                                 |
| ------------------------------------------- | -------------------------------------------------------------------- |
| `NODE_ENV=production` + 两变量都不设        | 进程**退出非 0**，stderr 含 `API_BASE_URL is required in production` |
| `NODE_ENV=production` + 只设 `API_BASE_URL` | 退出非 0，stderr 含 `SITE_ORIGIN is required in production`          |
| `NODE_ENV=production` + 两者齐              | 正常监听，`/` 200，`/robots.txt` 含配置的 origin                     |
| `NODE_ENV=development` + 都不设             | 正常监听（行为与今天一致）                                           |

### 7.3 完整测试矩阵

```bash
pnpm run typecheck
pnpm test
pnpm run test:verify-gate
pnpm run build
pnpm run format:check
pnpm exec eslint . --ignore-pattern "Python/**"
pnpm run test:python
pnpm run verify:all        # DATABASE_URL / API_DATABASE_URL 均指向本机 docker DB
pnpm run smoke:docker
```

跑不了的必须写 **NOT RUN** + 原因 + 替代验证 + 是否影响验收。

### 7.4 必须确认没有回归的三件事

1. `smoke:docker` 的 web 容器是 **production**（Dockerfile `ENV NODE_ENV=production`），它设了 `API_BASE_URL` 与 `SITE_ORIGIN` → 必须仍然起来。
2. `verify:all` 起的 web **没有** `NODE_ENV` → 不得因门禁失败。
3. `pnpm test` 里所有 render 测试不设 `SITE_ORIGIN` → 不得因门禁失败。

---

## §8 不允许伪造结果

- 不得为了让测试变绿而放宽断言。
- 不得声称跑过没跑的命令。
- 若实际代码与本文档假设冲突（例如某处行为与描述不符），**以实际代码和真实测试结果为准**，并在报告里写明冲突点，不得为"完成任务"而扭曲事实。

---

## §9 完成报告

必须产出 `docs/audit/SPRINT_3C_REPORT_2026-11-24.md`，至少包含：

1. 执行摘要（改前/改后的对照）
2. Git 状态（开工基线、commit hash、工作树）
3. 配置矩阵（变量 × 缺省 × 非法 × production 要求）
4. Task A 实现（config.ts 的导出面与规则）
5. Task B 接线（server.ts / layout.ts 的具体改动与不变项）
6. 进程级验证结果（§7.2 四场景实测输出）
7. 文档同步
8. 完整测试结果（含 `format:check` 的既有失败归因）
9. 回归确认（§7.4 三件事逐一核实）
10. 未处理问题
11. 风险
12. 下一步建议
13. 停止声明

---

## §10 验收标准

- [ ] 新建 `apps/web/src/config.ts`，纯函数、无模块级副作用
- [ ] `API_BASE_URL` 与 `SITE_ORIGIN` 在 production 下缺失即拒绝启动
- [ ] 非法 URL（非 http(s)、非绝对）在任何环境都抛错
- [ ] 尾部斜杠被归一化
- [ ] `server.ts` 与 `layout.ts` 共用同一套 `SITE_ORIGIN` 校验规则
- [ ] `NODE_ENV=test` 与未设 NODE_ENV 时行为完全不变
- [ ] `tests/web-config.test.ts` 覆盖 §7.1 六类
- [ ] 进程级四场景实测完成并记录
- [ ] `runbook.md` 与 `README.md` 已同步
- [ ] 全部测试命令 EXIT 0（`format:check` 的既有失败需归因说明）
- [ ] `smoke:docker` 通过（证明 production web 仍能起来）
- [ ] 未修改 `deploy/`、`Dockerfile`、`packages/`、`services/api/**`
- [ ] 未部署、未动生产库
- [ ] 报告 13 节齐全
- [ ] 工作树干净、commit hash 已记录

---

## §11 严格停止条件

本 Sprint 完成后**必须停止**。不得自行进入：

- Sprint 3D / 3E / 4
- 首页或 `/shikaku/` 改版
- SEO 内链重构、薄页清理、年度页 301/404
- 新增资格、宅建数据入库
- `/pass-rate/` 方案 B 实施
- GSC / Bing / GA4 变更
- Caddy / Docker / CDN 变更

---

## §12 Owner 决策点

| 编号 | 问题                                                                      | 本轮的默认做法                                         | 若 Owner 另有决定                    |
| ---- | ------------------------------------------------------------------------- | ------------------------------------------------------ | ------------------------------------ |
| D1   | production 缺 `API_BASE_URL` / `SITE_ORIGIN` 时，拒绝启动还是启动后告警？ | **拒绝启动**（与 `packages/config` 对 api 的做法一致） | 改为告警需重做 Task A 的 assert 部分 |
| D2   | `WEB_HOST` 是否也纳入硬门禁？                                             | **不纳入**（失败已是响亮的，见 §4.4）                  | 可加入                               |
| D3   | 是否允许改 `deploy/docker-compose.prod.yml` 以显式声明必填？              | **不改**（compose 已设这两个变量，无需变更）           | —                                    |
