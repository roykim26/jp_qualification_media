# DeepSeek Harness — Sprint 3K 任务文档

**上游故障形状收敛：502 兜底与响应体形状校验**

日期：2026-11-25
分支：`chore/phase1-baseline`
上游：Sprint 3J 报告 §10 的 P1

---

## 0. 一句话目标

3J 留下的问题是「`server.ts:592` 的 502 兜底是否可达」。**实测结论：可达，而且它会让 web 进程崩溃。**

本轮把这条路径变成「返回一个明确的错误响应，进程继续服务」。

---

## 1. 实测到的现状（先记录证据，再谈方案）

### 1.1 502 分支可达，且只在一种形状下到达

`fetchUpstream()`（`server.ts:156-178`）把所有 fetch 失败都包成 `UpstreamUnavailableError`，所以 503 分支覆盖了：连接失败、超时、上游 4xx/5xx。

剩下能到达 592 的只有一条路：**上游返回 200，但 `response.json()` 抛异常**。

| 上游响应                           | 走到哪                             | 结果     |
| ---------------------------------- | ---------------------------------- | -------- |
| 连接失败 / 超时 / 4xx / 5xx        | `fetchUpstream` 抛                 | 503 ✅   |
| 200 + 非法 JSON（`{"a":`）         | `response.json()` 抛 `SyntaxError` | **502**  |
| 200 + HTML（中间代理回的错误页）   | 同上                               | **502**  |
| 200 + 合法 JSON 但形状不对（`{}`） | 见 §1.2                            | **崩溃** |

### 1.2 崩溃的机制

`readQualification()` 返回 `response.json()` 的结果，路由直接用它渲染：

```ts
const view = await readQualification(slug);
res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); // :544
return res.end(renderQualificationSectionPage(view, section, year)); // :545
```

`writeHead(200)` 在渲染**之前**执行。当 `view` 形状不对（`{}`、`null`、`[]`），`renderQualificationSectionPage` 抛 `TypeError`。此时：

1. 响应头已经发出去了（`res.headersSent === true`）
2. 异常冒泡到 `catch`（`:578`）
3. 不是 `UpstreamUnavailableError` → 走 `:592` 的 `res.writeHead(502)`
4. **`writeHead` 在头已发送时抛 `ERR_HTTP_HEADERS_SENT`**
5. 这个新异常从 `handleRequest` 逃逸 → async handler 的 rejection 无人接管
6. Node 默认 `--unhandled-rejections=throw` → **进程退出**

用真实生产代码路径复现（`NODE_ENV=production`，`dist/apps/web/src/server.js`）：

```
web listening on 41999
GET / -> 200
GET /shikaku/takken/ -> ERR TypeError
web process alive after bad request: false exitCode: 3221226505
```

`3221226505` = `0xC0000409`，Windows 的 abort。Linux 上对应 `SIGABRT`/退出码 134。

### 1.3 为什么这不只是「一个错误响应不好看」

`deploy/docker-compose.prod.yml:23` 是 `restart: unless-stopped`。所以：

**一个形状不对的上游响应 → web 容器崩溃 → 重启 → 该上游响应还在 → 再次崩溃**

变成重启循环。而 `caddy` 是 `depends_on: web: service_healthy`，web 反复不健康时整站不可用。这和 3B 刻意保护 `/health` 是同一类问题：**局部故障不该升级成全站故障**。

`server.ts` 全文没有 `res.headersSent` 检查（`grep headersSent` 零命中），所以这条路径没有任何拦截。

### 1.4 触发条件的现实性

需要「上游 200 但响应体不是可渲染的 view」。可能的来源：

- API 与 web 版本错配（web 期待 `facts`，API 返回了新形状）
- 中间代理/CDN 对错误页返回 200
- API 自身在序列化时出错但已 flush 了 200
- 数据库返回了 web 不认识的行形状

不是每天发生，但**一旦发生就是整站重启循环**，而不是一个页面的 502。

---

## 2. 本轮范围

### Task A（必做）：让 502 兜底不再崩溃

`catch` 里写响应前先判 `res.headersSent`：

- 头未发送 → 按现状写 502（语义不变）
- 头已发送 → 不能再写任何头，只能 `res.end()` 收尾，并记录一行 stderr（带路径，便于定位是哪个路由）

**不改 503/502 的状态码语义**，只消除崩溃。

### Task B（必做）：把「形状不对」提前到 fetch 层拦下

Task A 只是止血。真正的修法是：**在 `readQualification()` / `readCalendar()` / `readComparison()` / `readUpdates()` 里校验 `response.json()` 的形状，形状不对就抛 `UpstreamUnavailableError`**，于是它落到 503 而不是「200 之后崩」。

这是「上游返回了不可用的东西」的正确归类，与 3A 定下的语义一致：**不可用的上游 = 临时故障 = 503 + Retry-After**。

校验要克制：只判「是不是对象」「关键字段是不是数组」，不做完整 schema 验证（那是 API 层的事）。

### Task C（必做）：回归测试

1. 进程级：真实起 listener，发一个会触发形状错误的上游响应，断言 **进程仍存活**且客户端收到 503。
2. 单元级：`headersSent` 为真时 `handleRequest` 不抛异常。

---

## 3. 硬约束

1. **不得改变正常路径的任何响应。** 200 页面、canonical、noindex、sitemap 全部不变。
2. **不得让 `/` 与 `/health` 在数据面故障时返 5xx。** 首页已经用 `Promise.allSettled` 兜底，本轮不动。
3. **不得修改 `deploy/`。** 重启策略、healthcheck 都不在本轮。
4. **不引入新依赖。** 形状校验手写。
5. **`/sitemap.xml` 的 XML 错误体（3A Task B）必须保持。** 它有自己的 catch，不受本轮影响。

---

## 4. 必读文件

| 文件                                        | 看什么                                                         |
| ------------------------------------------- | -------------------------------------------------------------- |
| `apps/web/src/server.ts`                    | `fetchUpstream` `:156`、`read*` `:180-220`、`catch` `:578-594` |
| `tests/web-server.test.ts`                  | 既有 12 用例的手法（stub + 真实 listener）                     |
| `tests/web-routes.test.ts`                  | 3J 新增的 23 用例，不要重复覆盖                                |
| `docs/audit/SPRINT_3J_REPORT_2026-11-25.md` | §8 未处理问题第 1 条                                           |

---

## 5. 禁止项

- 不改 `deploy/docker-compose.prod.yml`、不改 Dockerfile
- 不重构 `handleRequest` 的路由分发（本轮只动错误边界）
- 不给 API 层加 schema 校验（那是另一件事）
- 不动 `packages/schema`
- 不进入 3J 报告 §10 的 P2–P5
- 不做任何上线动作

---

## 6. 报告要求

`docs/audit/SPRINT_3K_REPORT_2026-11-25.md`，至少包含：

1. 执行摘要
2. Git 状态与基线
3. 修改文件
4. 崩溃复现（原始输出）
5. 崩溃机制分解（六步链）
6. Task A 修法
7. Task B 修法
8. 测试结果
9. 未处理问题
10. 风险
11. 下一步建议
12. 停止声明

---

## 7. 停止纪律

本轮只处理 502 兜底与响应形状校验。做完停止，不进入下一轮。
