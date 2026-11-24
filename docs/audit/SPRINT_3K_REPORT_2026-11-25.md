# Sprint 3K 执行报告 — 上游故障形状收敛

**日期**：2026-11-25
**分支**：`chore/phase1-baseline`
**任务文档**：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3K_TASK.md`
**上游**：Sprint 3J 报告 §10 的 P1

---

## 1. 执行摘要

3J 留下的问题是「`server.ts:592` 的 502 兜底是否可达」。本轮实测给出了一个比预期严重得多的答案：

> **可达，而且它会让 web 进程崩溃。**

上游返回 `200` 但响应体不是可渲染的 view 时，路由先写 `200` 头、渲染器再抛错、catch 试图写 `502`、`ERR_HTTP_HEADERS_SENT` 逃逸、Node 默认 `--unhandled-rejections=throw` 让**进程退出**。在 `restart: unless-stopped` 下，一个形状不对的上游响应会变成 **web 容器重启循环 → 整站不可用**。

本轮做了两件事：

1. **Task A（止血）**：catch 里先判 `res.headersSent`，头已发送时只 `end()` 收尾，绝不写第二个状态码。守卫抽成导出的 `closeAfterResponseStarted()`，可被测试直接驱动。
2. **Task B（正解）**：四个 `read*` 全部改走新的 `readJson()` helper，对响应体做**浅层形状校验**；不可渲染的响应体统一抛 `UpstreamUnavailableError` → 落到既有的 **503 + `Retry-After: 60`** 车道，与 3A 定下的「不可用的上游 = 临时故障」语义一致。

顺带修正了 3K 过程中自己写出的两个 bug（见 §7），并用**变异测试**证明新测试真的能抓住回归（见 §6）。

---

## 2. Git 状态与基线

- 执行前 HEAD：`9a11807`（`docs: 落账 Sprint 3J 执行报告`）
- 本轮内容 commit：`66fcf7d`（`fix(web): 上游故障形状收敛（Sprint 3K）`）
- 工作树在 commit 前：

| 状态 | 文件                                            |
| ---- | ----------------------------------------------- |
| `M`  | `apps/web/src/server.ts`（+128 / −4）           |
| `??` | `docs/audit/DEEPSEEK_HARNESS_SPRINT_3K_TASK.md` |
| `??` | `tests/web-upstream-shape.test.ts`（333 行）    |

运行时源码只有 `apps/web/src/server.ts` 一个文件改动，`deploy/`、`Dockerfile`、`packages/schema`、API 层全部零改动。

---

## 3. 修改文件

### 3.1 `apps/web/src/server.ts`

| 位置       | 改动                                                                                                             |
| ---------- | ---------------------------------------------------------------------------------------------------------------- |
| `:184-213` | 新增 `readJson<T>(response, label, isUsable)`：`response.json()` 抛错或形状不合格都转 `UpstreamUnavailableError` |
| `:215-217` | 新增 `isRecord(value)`                                                                                           |
| `:219-244` | `isQualificationView()` 加固：`facts` 的**每个元素**也必须是对象且带 string `factKey`/`displayValue`             |
| `:246-249` | 新增 `hasArrayData(value)`                                                                                       |
| `:251-258` | 新增 `isComparisonEnvelope(value)`：`data` 是**对象**，其下 `qualifications`/`rows` 都是数组                     |
| `:260-320` | 四个 `read*` 全部改走 `readJson`，返回类型显式标注                                                               |
| `:378-401` | 新增并导出 `closeAfterResponseStarted(req, res, error)`                                                          |
| `:696-703` | `catch` 开头插入 `if (res.headersSent) { closeAfterResponseStarted(...); return; }`                              |

`UpstreamUnavailableError`、503/502 的状态码语义、`/sitemap.xml` 的独立 catch、`/` 的 `Promise.allSettled` 兜底**全部未改**。

### 3.2 `tests/web-upstream-shape.test.ts`（新增，333 行，14 用例）

见 §5。

---

## 4. 崩溃复现（原始输出）

### 4.1 修复前的进程级复现

`NODE_ENV=production` 下跑构建产物 `dist/apps/web/src/server.js`，stub API 返回 `200` + `{}`：

```
web listening on 41999
GET / -> 200
GET /shikaku/takken/ -> ERR TypeError
web process alive after bad request: false exitCode: 3221226505
```

`3221226505` = `0xC0000409`（Windows abort）。Linux 上对应 `SIGABRT`，容器退出码 134。

客户端侧：`HUNG/aborted (AbortError)` —— 连接被进程死亡直接切断，连 502 都没收到。

### 4.2 对照：截断 JSON 走的是 502

上游 `200` + `{"qualification": {"slug": "it-passport"`（截断）：

```
status=502 content-type=text/html; charset=utf-8 len=18804
```

这说明 502 分支**确实可达**（3J §8 的怀疑得到确认），只是它不是唯一后果——形状「合法 JSON 但不可渲染」那条路才是致命的。

---

## 5. 崩溃机制分解（六步链）

```
① 路由 fetch 到 200，readQualification() 原样返回 response.json()
② res.writeHead(200, ...)                    ← 状态已发出
③ renderQualificationSectionPage(view, ...)  ← 对坏 view 抛 TypeError
④ 冒泡到 handleRequest 的 catch（:696）
⑤ 非 UpstreamUnavailableError → res.writeHead(502)  ← 头已发送
⑥ ERR_HTTP_HEADERS_SENT 抛出，async handler 的 rejection 无人接管
   → Node 默认 --unhandled-rejections=throw → 进程退出
```

放大因素（`deploy/docker-compose.prod.yml`，本轮未改）：

- `:23` api、`:4`/`:50`/`:78` 各服务 `restart: unless-stopped`
- `caddy` 是 `depends_on: web: service_healthy`

→ 崩溃 → 重启 → 同一个上游响应还在 → 再崩。**局部故障升级成全站故障**，与 3B 刻意保护 `/health` 是同一类问题。

`grep headersSent apps/web/src/server.ts` 在修复前**零命中**：这条路径没有任何拦截。`server.ts` 里 27 处 `writeHead` 全部在渲染之前，所以任何渲染期异常都会走这条崩溃路径，不止资格页。

---

## 6. 修法

### 6.1 Task A：`closeAfterResponseStarted`

```ts
export function closeAfterResponseStarted(
  req: { method?: string; url?: string },
  res: ServerResponse,
  error: unknown,
): void {
  console.error(
    `web: ${req.method} ${req.url} failed after the response started: ${(error as Error).message}`,
  );
  if (!res.writableEnded) res.end();
}
```

两个设计选择：

- **不写任何状态码**。头已发出时写第二个状态码必然抛 `ERR_HTTP_HEADERS_SENT`，这正是崩溃的成因。
- **导出而非内联**。要通过 HTTP 触发这条路径，需要一个「通过所有形状校验、但仍能让渲染器抛错」的上游响应——随着校验变严这是移动靶（见 §6.3）。导出后测试可以直接驱动守卫本身，断言它不写状态、且幂等。

### 6.2 Task B：`readJson` + 四个形状判定

```ts
async function readJson<T>(
  response: Response,
  label: string,
  isUsable: (value: unknown) => boolean,
): Promise<T> {
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch (error) {
    throw new UpstreamUnavailableError(
      `${label}: response body was not JSON (${(error as Error).message})`,
    );
  }
  if (!isUsable(parsed))
    throw new UpstreamUnavailableError(
      `${label}: response body did not have the expected shape`,
    );
  return parsed as T;
}
```

校验刻意保持浅层（「是不是对象」「我要遍历的字段是不是数组」），不做完整 schema 验证——那是 API 层的事，web 做深校验只会在 API 加字段时误伤。

**`isQualificationView` 的加固是本节唯一非显然的决定**：

```ts
facts.every(
  (fact) =>
    isRecord(fact) &&
    typeof fact.factKey === 'string' &&
    typeof fact.displayValue === 'string',
);
```

只判 `Array.isArray(facts)` 不够。渲染器会 `sort((l, r) => factPriority(l.factKey) - ...)` 并打印 `fact.displayValue`，所以 `facts: [null]` 能通过「是数组」的检查，然后在渲染时抛错——又回到「200 已发出、响应丢失」。校验渲染器**无条件解引用**的这两个字段，是让这类故障落进 503 车道的最小代价。

### 6.3 为什么还要保留 Task A

Task B 覆盖的是「形状明显不对」。但形状校验永远不可能穷尽：`itPassport` 的某个嵌套字段缺失、`sectionConfig` 里没有的新 section、模板里新增的 `fact.someNewField` —— 这些都能通过浅层校验并在渲染时抛错。Task A 是**兜底**：即使 Task B 漏了，进程也不死。

两者是纵深防御，不是二选一。

---

## 7. 本轮自己引入并修掉的 bug

### 7.1 `isComparisonEnvelope` 一开始复用了 `hasArrayData`

`hasArrayData` 要求 `data` 是**数组**，但 compare 接口（`services/api/src/server.ts:218-230`）返回的是 `{ data: { qualifications, rows }, query }` —— `data` 是**对象**。

后果：`/compare/` 从 200 变成 503，被 `tests/web-routes.test.ts` 当场抓住（`expected 503 to be 200`）。

修法：直接判 `isRecord(value.data)` + 两个数组字段。

值得记一笔的是：3J 的 compare stub 本来就返回正确形状 `{data:{qualifications:[],rows:[]}}`，所以 3J 没暴露这个隐患——**是 3J 的测试数据救了本轮**。

### 7.2 新测试的 stub 只返回一种 body

第一版 `bodyFor()` 不区分端点，健康模式下 `/compare/` 和 `/schedule/` 也收到资格 view 形状 → 2 条用例失败。

修法：`bodyFor(url)` 按 `url.startsWith('/api/v1/compare' | '/calendar' | '/updates')` 分流；`bodyMode` 只污染被测端点。

---

## 8. 测试结果

### 8.1 新增用例（`tests/web-upstream-shape.test.ts`，14 条）

| 分组                        | 用例                                                                                                                         |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| 坏形状 → 503                | `{}`、`null`、`[]`、缺 `facts`、截断 JSON、`200` + HTML、compare 缺 data 封装、calendar 缺 data、**`facts: [null]`**（9 条） |
| 健康路径不变                | 正常 view 仍 200（1 条）                                                                                                     |
| `/` 不返 5xx                | 坏形状下首页仍 200（1 条，守 healthcheck 语义）                                                                              |
| sitemap XML 错误体          | 坏形状下 503 + `application/xml` + 无 `<urlset`（1 条，守 3A Task B）                                                        |
| `closeAfterResponseStarted` | 不写状态、响应仍以已发出的 200 结束（1 条）；已 `end()` 时幂等（1 条）                                                       |

每条坏形状用例都断言三件事：**503**、**`retry-after: 60`**、**之后同一实例仍能 200**。第三件是关键——它证明进程没死。

### 8.2 变异测试（证明测试有效）

| 变异                                               | 结果                                          |
| -------------------------------------------------- | --------------------------------------------- |
| `isQualificationView` 去掉 `facts.every(...)`      | ✅ 抓住（`facts: [null]` → 200 而非 503）     |
| `closeAfterResponseStarted` 里加 `writeHead(502)`  | ✅ 抓住（用例 5s 超时：头已发，响应永不结束） |
| `isComparisonEnvelope` 改回复用 `hasArrayData`     | ✅ 抓住（`/compare/` 503）                    |
| 禁用整个 `headersSent` 守卫（`if (false && ...)`） | ⚠️ **未抓住**，原因见下                       |

**关于第 4 条**：禁用守卫时 12 条测试仍全绿。原因是 Task B 把「明显不对的形状」都拦在了写头之前，能通过 HTTP 到达守卫的只剩「通过校验但渲染仍抛错」的移动靶。这正是把守卫抽成导出函数、直接驱动它的原因（§6.1）——守卫的行为由 2 条直接用例守着，不再依赖能否构造出完美触发场景。

### 8.3 全量矩阵

| 检查项                                  | 结果                                          |
| --------------------------------------- | --------------------------------------------- |
| `pnpm typecheck`                        | EXIT 0                                        |
| `pnpm test`                             | **28 files / 382 tests** 全过                 |
| `pnpm test:verify-gate`                 | **51 pass / 0 fail**                          |
| `pnpm build`                            | EXIT 0                                        |
| `pnpm format:check`                     | EXIT 0                                        |
| `eslint . --ignore-pattern "Python/**"` | EXIT 0                                        |
| `pnpm test:python`                      | **239 passed**                                |
| `pnpm verify:all`                       | EXIT 0，6 资格全过，`errors: []`              |
| `pnpm smoke:docker`                     | **11 项 ok**（含 noindex、sitemap、ICS、404） |

对照 3J：`pnpm test` 从 27 files / 368 tests 增至 **28 files / 382 tests**（+1 file / +14 tests）。

---

## 9. 未处理问题

1. **`headersSent` 分支没有 HTTP 层回归**。如 §8.2 所述，Task B 生效后无法从外部稳定触发该分支。当前靠直接驱动 `closeAfterResponseStarted` 守住行为；如果将来需要一个端到端用例，得引入可控的渲染器注入点——那是架构改动，不在本轮。
2. **形状校验是浅层的**。`facts` 元素只校验 `factKey`/`displayValue` 两个字段。`render.ts` 若开始解引用新字段，需同步加固，否则退回「200 后响应丢失」。
3. **502 分支现在仍保留**，但正常路径已基本无法到达（所有 `response.json()` 失败都在 `readJson` 里转成了 503）。它是最后一道兜底，故意留着。
4. **`/sitemap.xml` 的形状校验未做**。它的 catch 独立处理且已返回 XML 错误体，本轮未动；若上游给 sitemap 返回坏形状，行为与修复前一致。
5. **客户端看到的是截断响应**。走到守卫时，客户端收到的是「已写头 + 空 body」的 200，而不是 503。这在语义上不理想，但比进程崩溃好，且 Task B 让这种情况极难出现。

---

## 10. 风险

| 风险                                            | 影响 | 缓解                                                  |
| ----------------------------------------------- | ---- | ----------------------------------------------------- |
| 形状校验过严 → API 正常演进时 web 误判 503      | 中   | 只校验渲染器无条件解引用的字段；不校验可选字段        |
| `facts.every(...)` 让合法但字段不全的旧数据被拒 | 低   | 现有 6 资格 1007 facts 全部通过 `verify:all` 与 smoke |
| 守卫吞掉错误细节 → 线上排查困难                 | 低   | stderr 带 method + url + message                      |
| 客户端拿到截断 200 而非 503                     | 低   | Task B 使该路径极难触发；监控侧看 stderr 关键字       |
| 本轮未上生产，风险暂未在生产暴露                | —    | 见 §11                                                |

---

## 11. 下一步建议

**P1（建议立刻做）：给 `/sitemap.xml` 补同样的形状校验。** 它现在是唯一还走「独立 catch」的抓取路径，本轮没碰是为了不扩大范围。做法与 §6.2 相同，成本很低。

**P2：确认 `facts` 元素校验的字段集是否够。** 扫一遍 `render.ts` 里所有 `fact.xxx` 的解引用，把「无条件解引用」的字段补进 `isQualificationView`。这是防 §9.2 那条风险的直接手段。

**P3：`/pass-rate/` 单资格故障观测。** 3A 定为方案 A（整页 503），切换触发条件是「生产观测到 503 中过半由单资格故障引起」——需要先有观测数据。

**P4：`/ready` 外部可观测性。** 3D 的 `check-readiness.mjs` 已就绪但未在 Caddy 暴露。

**P5：上线。** Sprint 3A–3K 的全部代码仍在 `chore/phase1-baseline`，VPS 是 `main@01b86dd`。属正式发布，需 Owner 单独授权。

另注：**3I 报告 §10 的 P1（VPS 装 crontab）因本机无 SSH 私钥无法执行**——不是授权问题，是缺凭据。

---

## 12. 停止声明

本轮只处理 502 兜底的崩溃与响应形状校验。**到此停止。**

不进入 3J §10 的 P2–P5，不改 `deploy/`，不做上线动作，不进入 Sprint 3L。

下一步由 Owner 根据本报告决定。
