# 兄弟路由的形状校验缺口 — 执行报告（2026-11-25）

## 0. Git 基线

| 项目            | 值                                                            |
| --------------- | ------------------------------------------------------------- |
| 分支            | `chore/phase1-baseline`                                       |
| 执行前 HEAD     | `794861a`                                                     |
| 本轮内容 commit | `<CONTENT_SHA>`                                               |
| 生产运行版本    | `9d793c9`（本轮改动**尚未部署**）                             |
| 上一轮          | `docs/audit/RENDER_VALIDATOR_SYNC_2026-11-25.md`（`e14c85f`） |

本轮把 Sprint 3K/3M 建立的「上游响应形状校验」思路从 `/shikaku/:slug/` 推广到三条兄弟路由，
并按同一标准**重新实测**了 3M 那批「不校验也没事」的结论。结论是：**3M 的结论里有两处是错的**，
其中一处会真的把页面变成空白。

## 1. 执行摘要

`/schedule/`、`/compare/`、`/updates/` 三个页面各自有一个 `isXxxEnvelope()` 校验器，把上游返回的
坏形状挡在渲染器之外。3M 建立这批校验器时，对「哪些字段不校验」做了实测，并把理由写进 doc comment。

本轮用同一套探针方法重新测了一遍，发现：

1. **`/updates/` 的 `event.qualification` 完全不校验，而 `renderUpdatesPage()` 直接读
   `event.qualification.slug`。`qualification: null` → `200` + **空响应体**（`len=0`）。**
   这是一个真实的用户可见故障：不是 503、不是报错页，是一张白页。
2. **`/updates/` 的 `event.factLabel` 完全不校验。`factLabel` 是数字/对象/数组 → `200` + 空响应体。**
3. **`/compare/` 的 `entry.sourceUrl` 完全不校验。`sourceUrl: 42` → `200` + 空响应体。**
4. `/schedule/` 的 8 个未校验字段**实测全部安全**（3M 的结论正确，本轮不改）。
5. 同时确认：`factLabel: null` 与 `qualification.slug: null` **必须保持 200**——它们渲染成
   `公式情報` 和一个死链，把这两种情况判成 503 是更差的交易。

修复方式是给三个字段各补一条校验，并把 3M 写错的 doc comment 订正为「按页面实际读取方式分别判定」。

## 2. 为什么 3M 会写错

3M 对 `isUpdatesEnvelope` 写的是：

> `qualification.*`（unlike `/schedule/` and `/compare/`, this page interpolates the
> qualification into a template string before escaping it, so a null name renders as text
> rather than throwing -- measured, not assumed）

这句话本身**测对了**：`qualification.officialNameJa: null` 确实降级成可见文本，实测 `200`。
错的是下一步——**从一个特例推广成了整类**：写的是 `qualification.*`，而实际只测了
`qualification.officialNameJa`。`qualification` 本身为 `null` 是另一个取值，实测 `200` + 空页。

这和 Sprint 3J 那条教训同源：**被 `??` 兜底的字段，测试数据必须让上游值与兜底值可区分。**
这里的版本是：**被豁免的字段，必须逐个取值测，不能用「某个子字段安全」推出「整个对象安全」。**

## 3. 实测数据

探针方式：stub 上游返回指定形状，打真实路由，记录 `status` 与响应体长度。健康基线是
`/updates/` `200` + `21087` 字节、`/schedule/` `200` + `21598` 字节、`/compare/` `200` + `22976` 字节。
**空响应体（`len=0`）就是渲染期抛错被 `closeAfterResponseStarted()` 吞掉的结果**——不是合法的空页面。

### 3.1 `/updates/`

| 注入的坏形状                         | status | 长度  | 判定                           |
| ------------------------------------ | ------ | ----- | ------------------------------ |
| `qualification: null`                | 200    | **0** | 崩（白页）→ 必须校验           |
| `qualification: 'it-passport'`       | 200    | 21085 | 安全                           |
| `qualification: 42`                  | 200    | 21085 | 安全                           |
| `qualification: []`                  | 200    | 21085 | 安全                           |
| `qualification: {}`                  | 200    | 21085 | 安全                           |
| `qualification.slug: null`           | 200    | 21080 | 安全（死链）→ 保持 200         |
| `qualification.officialNameJa: null` | 200    | 21077 | 安全（降级文本）→ 保持 200     |
| `factLabel: 123`                     | 200    | **0** | 崩 → 必须校验                  |
| `factLabel: {a:1}`                   | 200    | **0** | 崩 → 必须校验                  |
| `factLabel: ['a']`                   | 200    | **0** | 崩 → 必须校验                  |
| `factLabel: null`                    | 200    | 21084 | 安全（回退公式情報）→ 保持 200 |
| `factLabel: ''`                      | 200    | 21084 | 安全 → 保持 200                |
| `eventType: null` / bogus            | 200    | 21087 | 安全                           |
| `examYear: null` / 字符串            | 200    | 21087 | 安全                           |
| `verifiedAt: null`                   | 200    | 21071 | 安全                           |
| `id: null`                           | 200    | 21087 | 安全                           |
| `createdAt` 非日期                   | 200    | 21080 | 安全                           |
| `affectedPages: []`                  | 200    | 21074 | 安全                           |

**关键结论：`qualification` 只有 `null` 会崩，字符串/数字/数组/空对象都不崩。**
因为 `event.qualification.slug` 对非 null 的原始值只是取到 `undefined`（`[].slug`、`'x'.slug`
都返回 `undefined`，不抛），只有 `null.slug` 才抛 `TypeError`。
所以正确的检查是 `isRecord(event.qualification)`，**不是** `hasQualificationIdentity()`——
后者要求 `slug` 与 `officialNameJa` 都是字符串，会把实测安全的 `slug: null` 判成 503。

### 3.2 `/compare/`

| 注入的坏形状            | status | 长度  | 判定                 |
| ----------------------- | ------ | ----- | -------------------- |
| `entry.sourceUrl: 42`   | 200    | **0** | 崩（白页）→ 必须校验 |
| `entry.verifiedAt: 42`  | 200    | 22976 | 安全                 |
| `entry.examYear: {a:1}` | 200    | 22976 | 安全                 |
| `missingReason: {a:1}`  | 200    | 22976 | 安全                 |

`entry.sourceUrl` 被包进 `<a href="...">` 之前过 `escapeHtml()`，而 `escapeHtml()` 对非字符串调用
`replaceAll` 会抛。它是 optional 字段，所以检查写成「缺席或字符串」。

### 3.3 `/schedule/`

| 注入的坏形状               | status | 长度  | 判定 |
| -------------------------- | ------ | ----- | ---- |
| `startValue: {a:1}` / `42` | 200    | 21598 | 安全 |
| `verifiedAt: 42` / `{a:1}` | 200    | 21598 | 安全 |
| `examYear: {a:1}`          | 200    | 21598 | 安全 |
| `id: {a:1}`                | 200    | 21598 | 安全 |
| `sequence: {a:1}`          | 200    | 21598 | 安全 |

**3M 对 `/schedule/` 的结论准确，本轮一行未改。**

## 4. 修改内容

### 4.1 `apps/web/src/server.ts`

`isUpdatesEnvelope()` 加两条：

```ts
(event.factLabel === null || typeof event.factLabel === 'string') &&
isRecord(event.qualification) &&
```

`isComparisonEnvelope()` 的 entry 检查加一条：

```ts
(entry.sourceUrl === undefined || typeof entry.sourceUrl === 'string'),
```

三处 doc comment 同步订正：`isUpdatesEnvelope` 说明「Two more were measured in the follow-up round,
both `200` plus an empty body, and both now checked」，并把 3M 那句 `qualification.*` 的错误推广
明确写成「3M 测的是 `qualification.officialNameJa: null`，那个确实安全，但 `qualification: null` 是
另一个取值」；新增一段解释**为什么同一个上游字段在三个页面需要三种不同的检查**：

> `/schedule/` and `/compare/` do require the full identity because _their_ renderers throw on a
> null name; the same upstream field legitimately needs a different check on a page that reads it
> differently.

`isComparisonEnvelope` 补 `entry.sourceUrl` 的理由，并把 `entry.verifiedAt` 移进「不抛错」清单。

### 4.2 `tests/web-upstream-shape.test.ts`

- `BodyMode` 加 7 个模式。
- `bodyFor()` 补对应赋值分支。
- `malformed` 表加 5 条 503 用例。
- 新增 2 条 **200 反向用例**（`keeps /updates/ 200 when only the factLabel is null`、
  `keeps /updates/ 200 when the qualification slug is null`）。

**这 2 条反向用例是本轮的核心**：没有它们，把 `factLabel` 收紧成「只允许字符串」、
或把 `qualification` 换成 `hasQualificationIdentity()`，测试依然全绿——而线上会多出一批
本来渲染正常的 503。

## 5. 变异验证

`var/mutate-sibling-gaps.mjs`，5 个变异，每个都 `writeFileSync` 后 `readFileSync` 确认落盘，
跑完恢复原文：

| 变异                                              | 结果   | 抓住它的用例                                                     |
| ------------------------------------------------- | ------ | ---------------------------------------------------------------- |
| 删掉 `factLabel` 校验                             | CAUGHT | `answers 503 for an update whose factLabel is a number`          |
| `factLabel` 收紧成只允许字符串                    | CAUGHT | `keeps /updates/ 200 when only the factLabel is null`            |
| 删掉 `qualification` 的 record 校验               | CAUGHT | `answers 503 for an update with a null qualification`            |
| `qualification` 换成 `hasQualificationIdentity()` | CAUGHT | `keeps /updates/ 200 when the qualification slug is null`        |
| 删掉 `entry.sourceUrl` 校验                       | CAUGHT | `answers 503 for a comparison entry whose sourceUrl is a number` |

`RESTORED=true`、`CAUGHT=5/5`、`MUTATION_PROBLEMS=0`。

## 6. 全量矩阵

| 检查     | 命令                                                                 | 结果                                      |
| -------- | -------------------------------------------------------------------- | ----------------------------------------- |
| 类型     | `tsc -p tsconfig.json --noEmit`                                      | 0                                         |
| 单元测试 | `vitest run tests --pool=threads --poolOptions.threads.singleThread` | **30 files / 477 passed**（此前 470，+7） |
| 格式     | `prettier --check`                                                   | 0                                         |
| Lint     | `eslint . --ignore-pattern "Python/**"`                              | 0                                         |
| 验证门禁 | `node --test` 五个 `.mjs`                                            | 75 pass / 0 fail                          |

## 7. 未处理的问题

1. **`/updates/` 的 `examYear`、`eventType` 仍未校验。** 实测安全（`200` + 完整页面），
   但它们参与批次分组 key 与 href 拼接；若未来渲染逻辑改动，这两处的安全性会变。
2. **`/compare/` 的 `entry.verifiedAt`、`examYear`、`missingReason` 仍未校验。** 同样实测安全。
3. **豁免清单仍是手写的。** 本轮没有把「实测安全」这件事变成自动门禁——3M 的错误正是
   「手写理由 + 一次测量」造成的。把探针固化成回归测试是更大的工作，需要单开一轮。
4. **三条兄弟路由没有 `render-validator-sync` 那样的字段集门禁。** 上一轮（`e14c85f`）
   只覆盖了 `/shikaku/:slug/`。本轮的三个字段是**手工发现的**，不是门禁报出来的。

## 8. 风险

| 风险                                                 | 影响                                                | 缓解                                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上游把 `factLabel` 从 `null` 改成省略字段            | `undefined` 走 `typeof === 'string'` 分支失败 → 503 | `undefined` 与 `null` 都是「没有标签」，若上游真的改成省略，需要把检查放宽成 `== null`；目前 schema 是 `factLabel: string`（必填），省略不是合法形状 |
| 上游把 `qualification` 改成扁平 slug 字符串          | 503（本轮之前是 200 + 完整页面）                    | 实测字符串本来就不崩；这是**收紧**而非修复。若上游真的改成这种形状，需要放开成 `typeof === 'string' \|\| isRecord(...)`                              |
| 三个页面的同名字段需要不同校验，容易被后人「统一」掉 | 统一成最严的那种会制造 503，统一成最松的会放过白页  | doc comment 里写明了「the same upstream field legitimately needs a different check on a page that reads it differently」                             |

## 9. 下一步建议

1. **P1 — 把 `chore/phase1-baseline` 落到 `main`。** `origin/main` 仍是 `01b86dd`，已落后 60+ commit。
   需要 Owner 授权 merge。
2. **P2 — 把三条兄弟路由纳入字段集门禁。** 复用 `tests/render-validator-sync.test.ts` 的
   `functionBody()` / `unguardedReads()`，为 `renderSchedulePage`/`renderComparePage`/
   `renderUpdatesPage` 各建一条「渲染器读的字段 ⊇ 校验器查的字段（扣除实测豁免清单）」。
   这是把本轮「手工发现」变成「自动发现」的唯一办法。
3. **P2 — 生产跑一次 patrol**，消掉 `coverageGap: not_run`。
4. **P3 — `audit-mvp` 的 22 个覆盖缺口处置**；**P3 — 统一博客域名两层安全头**。
5. **P1 — 等 24–48h 收 `/pass-rate/` 观测**（部署时只有约 20 分钟是部署后流量）。

## 10. 停止声明

本轮只做了三件事：给 `isUpdatesEnvelope` 补两条校验、给 `isComparisonEnvelope` 补一条校验、
订正三处写错的 doc comment，外加 7 条测试。

**没有做**：首页改版、`/shikaku/` 改版、资格详情页改版、设计系统改版、移动端改版、内链重构、
新增资格、扩充资格数、宅建统计入库、数据 schema 修改、生产数据库操作、Caddy 修改、
Docker 架构修改、CDN 修改、URL 重构、无尾斜杠 301、年度页 301/404、薄 Pass Rate 页面清理、
GSC / Bing / GA4 修改。

**没有部署。** 本轮改动只进了仓库，生产仍是 `9d793c9`。
