# Sprint 3C 执行报告 — web 进程的配置门禁

**日期**：2026-11-24
**项目**：ShikakuCheck（`jp_qualification_media`）
**执行工具**：DeepSeek Harness
**任务文档**：[DEEPSEEK_HARNESS_SPRINT_3C_TASK.md](DEEPSEEK_HARNESS_SPRINT_3C_TASK.md)
**上游依据**：Sprint 3B 报告 §10 第 5 条 / §12.1（P1）

---

## §1 执行摘要

Sprint 3B 把 api 进程的「配置缺失」从「伪装成合法空数据」改成了明确失败。本轮修的是**同一个毛病在 web 进程的版本**，位置更靠近公网。

改前：

```ts
const apiBaseUrl = process.env.API_BASE_URL ?? 'http://127.0.0.1:4100';
```

容器里这个缺省值指向 web **自己**。所有数据页因此连不上 API 而返回 503；`/` 因为走 `Promise.allSettled` 降级仍返回 200 —— 而 compose 的 web healthcheck 恰好探 `/`。**用户看到整站故障，运维看到服务健康。**

`SITE_ORIGIN` 另有两条互不一致的路径：`server.ts` 在 production 下会抛错，但只在请求 `/robots.txt` 或 `/sitemap.xml` 时才触发；`layout.ts` 则永远静默输出相对 canonical。

改后：

| 状态                          | 改前                                                                  | 改后                                    |
| ----------------------------- | --------------------------------------------------------------------- | --------------------------------------- |
| production 缺 `API_BASE_URL`  | 启动成功，数据页全 503，`/` 仍 200                                    | **拒绝启动**，退出码 1，stderr 明确报错 |
| production 缺 `SITE_ORIGIN`   | 启动成功，canonical 静默退化；SEO 文件 502                            | **拒绝启动**，退出码 1，stderr 明确报错 |
| 非法 URL（非 http(s)/非绝对） | `API_BASE_URL` 静默接受（拼出坏 URL）；`SITE_ORIGIN` 在渲染时静默退化 | **任何环境都抛错**，文案可 grep         |
| `API_BASE_URL` 带尾斜杠       | 拼出 `//api/v1/...`                                                   | 归一化后单斜杠                          |
| `NODE_ENV=test` / 未设        | 正常                                                                  | **完全不变**（已验证）                  |

四条启动门禁场景实测全部符合预期（§6）。

---

## §2 Git 状态

### 2.1 开工基线

```text
分支：chore/phase1-baseline
HEAD：f09e4388ed3bdc983cbe355896bee008c9fc4af6
工作树：干净（git status --short 无输出）
```

基线链：`a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438`

### 2.2 本轮改动清单

| 文件                                            | 类型 | 说明                                                  |
| ----------------------------------------------- | ---- | ----------------------------------------------------- |
| `apps/web/src/config.ts`                        | 新增 | 纯函数配置解析与校验，143 行                          |
| `apps/web/src/server.ts`                        | 修改 | 接线 `loadWebConfig()`；`siteOrigin()` 委托共享解析器 |
| `apps/web/src/layout.ts`                        | 修改 | `canonicalHref()` 改用同一解析器，保持软降级          |
| `tests/web-config.test.ts`                      | 新增 | 22 个用例                                             |
| `docs/runbook.md`                               | 修改 | 新增「web 进程的启动门禁」小节                        |
| `README.md`                                     | 修改 | 补 production 必填说明                                |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3C_TASK.md` | 新增 | 任务文档                                              |
| `docs/audit/SPRINT_3C_REPORT_2026-11-24.md`     | 新增 | 本报告                                                |

`git diff --stat`（不含新增文件）：`4 files changed, 43 insertions(+), 23 deletions(-)`

### 2.3 提交

| 项      | 值                                                                |
| ------- | ----------------------------------------------------------------- |
| commit  | **`9bc946fa8dc8008ab8afd9caeea76be5aeceeb81`**（short `9bc946f`） |
| parent  | `f09e438`                                                         |
| subject | `feat: gate the web process on required production configuration` |
| 文件    | 8 files changed, 1183 insertions(+), 23 deletions(-)              |

提交方式：逐路径 `git add --`（8 个文件全列出，未用 `-A`）；message 用 `[System.IO.File]::WriteAllText` + `new UTF8Encoding($false)` 写入，subject 首字节经 `Format-Hex` 校验为 `66 65 61 74 3A 20` = `feat: `，无 BOM。

提交后基线链：`a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438 → 9bc946f`

> 与 Sprint 3A/3B 同样的 hash 循环依赖：报告里引用 commit hash，写进去 hash 就会变。这里沿用既有做法——代码与报告先合成一个 commit，再由一个 `docs:` commit 只改报告里的 hash 字段收口，不反复 `--amend`。

---

## §3 配置矩阵

| 变量                  | 缺省值                  | 非法时                                                  | production 要求  |
| --------------------- | ----------------------- | ------------------------------------------------------- | ---------------- |
| `API_BASE_URL`        | `http://127.0.0.1:4100` | **抛错** `API_BASE_URL must be an absolute http(s) URL` | **必须显式设置** |
| `SITE_ORIGIN`         | `undefined`             | **抛错** `SITE_ORIGIN must be an absolute http(s) URL`  | **必须显式设置** |
| `WEB_PORT`            | `3000`                  | 非整数/越界 → 回落 3000                                 | 不要求           |
| `WEB_HOST`            | `127.0.0.1`             | —                                                       | 不要求（§4.4）   |
| `UPSTREAM_TIMEOUT_MS` | `5000`                  | <100 或 >60000 → 回落 5000                              | 不要求           |

**「必须显式设置」只在 `NODE_ENV=production` 检查；格式校验在任何环境都做。**

一处细节：`assertWebConfig` 判断 `API_BASE_URL` 是否缺失时读的是**原始环境变量**（`env.API_BASE_URL?.trim()`），不是解析后的值。因为解析后的值无法区分「运维显式写了 `http://127.0.0.1:4100`」与「运维什么都没写、用了缺省值」——前者是一个决定，后者才是错误。这条由测试 `accepts an explicitly configured loopback API base URL` 固定。

---

## §4 Task A — `apps/web/src/config.ts`

143 行，纯函数、无模块级副作用。这一点是必须的：`layout.ts` 在渲染路径上 import 它，不能因为 import 就触发启动校验。

导出面：

```ts
export type WebConfig = {
  nodeEnv: string;
  port: number;
  host: string;
  apiBaseUrl: string;
  siteOrigin: string | undefined;
  upstreamTimeoutMs: number;
};

export const defaultApiBaseUrl = 'http://127.0.0.1:4100';
export const defaultWebPort = 3000;
export const defaultWebHost = '127.0.0.1';
export const defaultUpstreamTimeoutMs = 5_000;

export function parseApiBaseUrl(raw: string | undefined): string;
export function parseSiteOrigin(raw: string | undefined): string | undefined;
export function parsePort(raw: string | undefined): number;
export function parseUpstreamTimeoutMs(raw: string | undefined): number;
export function resolveWebConfig(env?: NodeJS.ProcessEnv): WebConfig;
export function assertWebConfig(
  config: WebConfig,
  env?: NodeJS.ProcessEnv,
): void;
export function loadWebConfig(env?: NodeJS.ProcessEnv): WebConfig;
```

### 4.1 尾斜杠归一化

`parseApiBaseUrl` 返回 `parsed.origin + parsed.pathname.replace(/\/+$/, '')`。路由是 `` `${apiBaseUrl}/api/v1/...` `` 拼接的，配成 `http://api:4100/` 会拼出 `//api/v1/...`。这个缺陷在本轮之前就存在，只是没人配过带尾斜杠的值。

### 4.2 `parsePort` 的空串处理

`Number('')` 是 `0`，而端口 0 意味着「随便给个空闲端口」。若照抄 `Number(raw)` 的写法，一个空字符串会静默把监听端口变成随机的。现在先 `trim()`，空则回落 3000。**这个缺陷是被测试抓出来的**（见 §9 第 1 条）。

### 4.3 `parseSiteOrigin` 只返回 origin

与 `layout.ts` 原有行为一致：`SITE_ORIGIN` 里带了路径或尾斜杠，不得漏进 canonical / `og:url` / sitemap 的 URL。

### 4.4 为什么 `WEB_HOST` 不进硬门禁

`WEB_HOST` 缺失时 web 在容器内绑 `127.0.0.1`，Caddy 连不上 → web healthcheck 打 `/` 也连不上 → 容器 unhealthy → Caddy 不启动。这是**响亮的失败**，不是静默的错误成功，与本轮要消灭的那类问题不同。不改它，理由是不扩大范围。

---

## §5 Task B — 接线

### 5.1 `apps/web/src/server.ts`

```ts
const webConfig: WebConfig = loadWebConfig();

const port = webConfig.port;
const apiBaseUrl = webConfig.apiBaseUrl;
const upstreamTimeoutMs = webConfig.upstreamTimeoutMs;
```

原来的 `parseUpstreamTimeoutMs()` 局部函数已删除，逻辑移入 `config.ts`（行为不变：同样的 100–60000 边界、同样回落 5000）。

`siteOrigin()` 改为：

```ts
function siteOrigin(): string {
  const origin = parseSiteOrigin(process.env.SITE_ORIGIN);
  if (origin) return origin;
  if (process.env.NODE_ENV === 'production')
    throw new Error('SITE_ORIGIN is required in production');
  return `http://127.0.0.1:${port}`;
}
```

production 分支是第二道防线：`loadWebConfig()` 在模块加载时已经拒绝启动了。

### 5.2 `apps/web/src/layout.ts`

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

两条路径共用同一套校验规则，但失败姿态各自合理：**启动时硬失败，渲染时软降级**。渲染函数不该因为一个环境变量把整页打成 500；production 下软降级实际上不可达，因为启动校验已经先一步挡住了。

### 5.3 保持不变的行为（已验证）

- `NODE_ENV=test`：不抛任何配置错误。
- `NODE_ENV` 未设（`scripts/verify-lib.mjs` 起的 web）：行为与今天完全一致。
- `/`、`/robots.txt`、`/sitemap.xml` 的响应语义与状态码不变。
- 未设 `SITE_ORIGIN` 时 canonical 仍是**相对路径**（不是 `http://127.0.0.1:port`）—— 这是 `layout.ts` 一直以来的行为，本轮刻意保留。

---

## §6 进程级验证

### 6.1 启动门禁四场景

`var/tmp-3c-gate.mjs`，每个场景用 `dist` 产物起真实子进程：

| 场景                             | 退出码      | 是否监听 | stderr                                          |
| -------------------------------- | ----------- | -------- | ----------------------------------------------- |
| production + 两变量都不设        | **1**       | 否       | `Error: API_BASE_URL is required in production` |
| production + 只设 `API_BASE_URL` | **1**       | 否       | `Error: SITE_ORIGIN is required in production`  |
| production + 两者齐              | — (SIGTERM) | **是**   | —                                               |
| development + 都不设             | — (SIGTERM) | **是**   | —                                               |

四个场景全部 PASS。

### 6.2 SEO 输出验证

`var/tmp-3c-seo.mjs`，配一个桩 API 让 web 无需数据库即可出 robots/sitemap：

| 场景                                                | robots `Sitemap:` 行                            | sitemap                                | canonical                   |
| --------------------------------------------------- | ----------------------------------------------- | -------------------------------------- | --------------------------- |
| production + `SITE_ORIGIN=https://shikakucheck.com` | `Sitemap: https://shikakucheck.com/sitemap.xml` | 200，`<loc>` 用配置的 origin，无双斜杠 | `https://shikakucheck.com/` |
| development 无 `SITE_ORIGIN`                        | `Sitemap: http://127.0.0.1:3512/sitemap.xml`    | 200，同上                              | `/`（相对，改前行为）       |

两个场景全部 PASS。

---

## §7 文档同步

### 7.1 `docs/runbook.md`

在 `SITE_ORIGIN` 说明之后新增「web 进程的启动门禁（Sprint 3C）」小节：

- 说清 production 要求与失败形态（退出码非 0 + 可 grep 的 stderr 文案）；
- 解释**为什么**在启动期硬失败而不是运行期降级（`127.0.0.1:4100` 指向自己的那段推理）；
- 给出容器内自检命令（`docker compose exec -T web node -e ...` 检查 robots 里的 `Sitemap:` 行）；
- 说明 `WEB_HOST` 不在门禁范围内及原因。

### 7.2 `README.md`

`API_BASE_URL` 的描述补上 production 必填与 `SITE_ORIGIN` 同属必填，并指向 runbook 的新小节。

---

## §8 完整测试结果

全部真实执行。

| 命令                                              | 结果                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------- |
| `pnpm run typecheck`                              | **EXIT 0**                                                                    |
| `pnpm test`                                       | **EXIT 0**，21 files / **243** tests passed（3B 基线 221，+22）               |
| `pnpm run test:verify-gate`                       | **EXIT 0**，pass 40 / fail 0                                                  |
| `pnpm run build`                                  | **EXIT 0**                                                                    |
| `pnpm run format:check`                           | **EXIT 1** — 唯一失败 `docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md`（见下） |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | **EXIT 0**                                                                    |
| `pnpm run test:python`                            | **EXIT 0**，239 passed in 2.57s                                               |
| `pnpm run verify:all`                             | **EXIT 0**，六资格全通过                                                      |
| `pnpm run smoke:docker`                           | **EXIT 0**，11 项全 ok（见 §8.2）                                             |

### 8.1 `format:check` 的失败归因

唯一失败文件是 `docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` —— **Sprint 3A 的任务文档**，在 `013e680` 入库时就没有格式化。这是**既有问题，不是本轮引入**：本轮新建的 3C 任务文档、报告、`config.ts`、`web-config.test.ts`、`runbook.md`、`README.md` 全部通过。

用同一 glob 集加 `!docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 排除后复验：

```text
All matched files use Prettier code style!
```

未擅自格式化该文件：它是 Owner 下发的输入件，且不在本轮改动范围内。是否修由 Owner 定（见 §10）。

### 8.2 `smoke:docker`

**EXIT 0**，11 项全部 ok，末行 `docker smoke passed`：

```text
building the production image
running migrations inside the image
restoring the sanitized CI fixture
ok - the API role is provisioned and cannot write
ok - the image restores the 1007 approved facts
ok - the home page renders
ok - the qualification pages render
ok - the API serves approved facts
ok - the sitemap lists indexable qualification pages
ok - the year filter stays noindex
ok - the pass-rate sort variants stay noindex
ok - the ICS download works
ok - robots.txt points at the sitemap
ok - unknown qualifications 404
docker smoke passed
```

这是本轮**最关键的一条回归证据**：`Dockerfile:15` 是 `ENV NODE_ENV=production`，所以冒烟容器里的 web 就是 production 模式。「the home page renders」「the qualification pages render」「the sitemap lists indexable qualification pages」三项通过，直接证明新加的门禁没有误伤真实生产形态。

执行观察：首次运行时把 stdout 重定向到终端导致缓冲，30 分钟内只看到 `building the production image` 一行、无法判断进度，遂终止并以 `*> var/smoke-3c.log` 重跑。重跑耗时约 3 分钟（镜像构建命中缓存后）。**教训：长耗时脚本应一开始就落日志文件，不要依赖终端缓冲。**

---

## §9 回归护栏

新增 `tests/web-config.test.ts`，22 个用例，覆盖：

| 分组                     | 用例数 | 关键断言                                                                                             |
| ------------------------ | ------ | ---------------------------------------------------------------------------------------------------- |
| `parseApiBaseUrl`        | 4      | 缺省/空白回落；尾斜杠归一化（含 `///` 与带路径）；`api:4100`、`ftp://`、`not a url`、`/api` 全部抛错 |
| `parseSiteOrigin`        | 3      | 缺省返回 `undefined`；去路径与尾斜杠；非 http(s) 抛错                                                |
| `parsePort`              | 2      | 空串/非数字/越界回落 3000；`0`/`3100`/`65535` 正常                                                   |
| `parseUpstreamTimeoutMs` | 2      | 边界外回落 5000；100/250/5000/60000 正常                                                             |
| `resolveWebConfig`       | 2      | 全字段解析；空环境下的缺省值                                                                         |
| `assertWebConfig`        | 5      | production 缺两项分别抛错；全配通过；**显式写回环地址也通过**；development/test/未设不门禁           |
| `loadWebConfig`          | 4      | production 拒绝启动；非 production 仍校验 URL 形状；未设 `NODE_ENV` 与 `NODE_ENV=test` 保持改前行为  |

### 9.1 写测试过程中被测试抓出的两个缺陷

1. **`parsePort('')` 返回 0**：`Number('')` 是 0，而 0 是合法端口（临时端口）。若不先 `trim()` 判空，一个空字符串会静默把监听端口变成随机的。已修（§4.2）。
2. **`parseUpstreamTimeoutMs('')` 同理**：虽然 0 落在 `<100` 的回退区间内、结果仍是 5000，但显式判空更清楚，也避免将来边界改动时踩坑。

两条都是**先写测试、被测试推翻**，不是事后补的。

---

## §10 未处理问题

1. **`docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md` 未格式化** —— `format:check` 因它失败。它是 Owner 输入件，本轮不动。修它只需 `prettier --write`，但需要授权。
2. **`WEB_HOST` 不在硬门禁内** —— 理由见 §4.4（失败已是响亮的）。若 Owner 认为容器内绑回环也算「配置错误」，可加入。
3. **`GA_MEASUREMENT_ID` / `GOOGLE_SITE_VERIFICATION` 无格式门禁** —— `layout.ts:47-57` 对它们做正则校验，非法值静默丢弃（不渲染 meta/脚本）。这是**有意为之**：这两个是可选项，配错不应导致站点不可用。
4. **`/ready` 仍未接进任何可观测面** —— Sprint 3B 建了端点但没接 compose healthcheck（有意）也没接外部探针。属 P2。
5. **`/pass-rate/` 失败粒度** —— Owner 已定保留方案 A（整页 503），本轮未动。

---

## §11 风险

| 风险                                       | 影响                           | 缓解                                                                                                                 |
| ------------------------------------------ | ------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| 部署时漏配 `API_BASE_URL` 或 `SITE_ORIGIN` | web 拒绝启动，站点不可用       | **这是设计意图**：比「起来了但全站 503、健康检查还报好」更容易被发现和回滚。compose 里两者都已设置，正常部署不受影响 |
| `smoke:docker` 的 web 是 production        | 若门禁有误，冒烟会失败         | 冒烟容器设了 `API_BASE_URL` 与 `SITE_ORIGIN`，§8.2 已验证                                                            |
| `verify:all` 起的 web 无 `NODE_ENV`        | 若门禁误判，门禁脚本会挂       | 门禁只在 `production` 生效，§8 已验证通过                                                                            |
| 渲染路径 import 了 config.ts               | 若有模块级副作用，渲染会受影响 | config.ts 是纯函数、零副作用，`web-render.test.ts` 77 用例全过                                                       |
| 显式配回环地址被误判为「未配置」           | 运维故意指向本机 API 时被拦    | `assertWebConfig` 读原始环境变量而非解析值，§9 有专门用例                                                            |

---

## §12 下一步建议

按优先级：

### P1（建议下一轮做）：把 `/ready` 接进可观测面

Sprint 3B 建了 `GET /ready`，但没有任何东西在调用它。当前生产上「数据面挂了」的唯一信号仍然是用户报障。建议：

- 在 Caddy 里加一条**内网可达、不暴露公网**的路由，或
- 加一个定时探针脚本（`scripts/` 已有 28 个脚本的惯例），把 `/ready` 结果写进已有的 `ops-daily` 报告。

**不要**把 `/ready` 接进 compose healthcheck：那会让 DB 抖动导致 api unhealthy → web 起不来 → Caddy 不启动，整站下线（3B 报告已记录）。

### P2：修 3A 任务文档的格式

`prettier --write docs/audit/DEEPSEEK_HARNESS_SPRINT_3A_TASK.md`，让 `format:check` 回到全绿。需要 Owner 授权（改的是历史输入件）。

### P3：G-15 测试缺口

`apps/web/src/server.ts` 的 19 条路由仍无进程级测试（`renderErrorPage`、`renderSitemap`、`proxyIcs`、`siteOrigin`、`STATIC_IMAGES`、`robots.txt`、assets 均 0 命中）。本轮新增的启动门禁测试补了配置层，但路由层仍是空白。

---

## §13 停止声明

本轮（Sprint 3C）已完成任务文档 §10 的全部验收项，代码、测试、文档、报告均已落盘并提交。

**至此停止。** 未进入 Sprint 3D / 3E / 4，未做首页或 `/shikaku/` 改版、SEO 内链重构、薄页清理、年度页 301/404、新增资格、宅建数据入库、`/pass-rate/` 方案 B、GSC/Bing/GA4 变更、Caddy/Docker/CDN 变更。

后续方向由 Owner 根据本报告 §12 决定。
