# 兄弟路由纳入字段集门禁（2026-11-25）

## 0. Git 基线

| 项              | 值                              |
| --------------- | ------------------------------- |
| 分支            | `chore/phase1-baseline`         |
| 执行前 HEAD     | `ba472dc`                       |
| 本轮内容 commit | `<CONTENT_SHA>`                 |
| 生产运行版本    | `9d793c9`（本轮改动**未部署**） |

两段式：第一段提交内容，第二段把上面那行的 `<CONTENT_SHA>` 换成真实 hash。

## 1. 摘要

上一轮（`SIBLING_ROUTE_SHAPE_GAPS_2026-11-25.md`）修掉了 `/updates/` 与 `/compare/` 上三个真实漏洞，并在 §7 留下一条未处理项：**三条兄弟路由没有字段集门禁**——`/shikaku/:slug/` 有 `tests/render-validator-sync.test.ts` 守着，`/schedule/`、`/compare/`、`/updates/` 仍然靠人工扫。

本轮把门禁扩到三条兄弟路由。7 个门禁、28 条新用例，全部从源码文本推导，不维护第二份字段清单。

结论：

- 7 个门禁全部落地，`tests/render-validator-sync.test.ts` 从 5 条用例涨到 33 条，全仓从 477 涨到 506 条。
- 8 个变异全部被抓（首轮 7/8，漏掉的那个靠新增一条 200 反向用例补上）。
- **豁免清单必须按路由分别维护**：同一个 `examYear` 在 `/schedule/` 必须校验，在 `/compare/` 和 `/updates/` 必须不校验。一份全局清单在三个页面里会错两个。
- 一个已知盲区记在 §7：`/compare/` 的 `qualification` 那条门禁分不清「读本地资格列表」与「读上游副本」。

## 2. 门禁怎么工作

沿用上一轮的三个构件：

- `functionBody(source, name)`：从 `function <name>(` 开始截取函数体。
- `unguardedReads(source, entity)`：正则 `(?<!\?\.)\b<entity>\.(\w+)`，返回所有**没有走可选链**的字段读取。
- 比对：渲染器读的字段集必须被校验器读的字段集覆盖，差集只允许出现在 allow-list 里。

本轮加了两件东西：

1. **`functionBody()` 先跳过参数列表**。原来它从 `function <name>(` 之后的第一个 `{` 开始截，但 `renderSchedulePage(events, query: SchedulePageQuery = {})` 和 `renderUpdatesPage(events, options: UpdatesPageOptions = {})` 的**参数列表里就有 `{}`**，于是截出来的「函数体」其实是签名的后半截。修法是先配平圆括号找到参数列表的结尾，再从那里找函数体的 `{`。这个 bug 由变异 `functionBody forgets to skip the parameter list` 抓住。
2. **`RouteGate` 描述一条门禁**：`{ renderer, validator, entity, validated, allow, pinned }`。`validated` 是校验器里那个参数的**名字**——`isCalendarEnvelope` 叫 `event`，`hasQualificationIdentity` 叫 `value`。不做这层映射就没法把「校验器读了什么」和「渲染器读了什么」对齐。

`routeProblems(gate)` 返回四组：

- `rendered`：渲染器读了但校验器没读的字段（**必须为空，除非在 allow-list 里**）。
- `checked`：两边都读的字段。
- `unchecked`：allow-list 里但校验器确实没读的（**这是 allow-list 的正确用法**）。
- `stale` / `redundant`：allow-list 里已经没人读、或已经被校验了的条目（**说明清单过期了**）。

## 3. 七个门禁

| #   | 渲染器               | 校验器                     | 实体            | 豁免                        | 钉住                                                               |
| --- | -------------------- | -------------------------- | --------------- | --------------------------- | ------------------------------------------------------------------ |
| 1   | `renderSchedulePage` | `isCalendarEnvelope`       | `event`         | 8                           | `type` `label` `factKey` `dateValue` `qualification`               |
| 2   | `renderSchedulePage` | `hasQualificationIdentity` | `qualification` | 0                           | `slug` `officialNameJa`                                            |
| 3   | `renderComparePage`  | `isComparisonEnvelope`     | `entry`         | 7                           | `factKey` `value` `sourceUrl`                                      |
| 4   | `renderComparePage`  | `isComparisonEnvelope`     | `row`           | 0                           | `label` `cells`                                                    |
| 5   | `renderComparePage`  | `isComparisonEnvelope`     | `cell`          | 1（`missingReason`）        | `entries`                                                          |
| 6   | `renderComparePage`  | `hasQualificationIdentity` | `qualification` | 2（`aliasesJa` `category`） | `slug` `officialNameJa`                                            |
| 7   | `renderUpdatesPage`  | `isUpdatesEnvelope`        | `event`         | 2（`eventType` `examYear`） | `eventLabel` `factKey` `factLabel` `qualification` `affectedPages` |

每条门禁生成 4 条用例：

1. `checks every field <label> dereferences`
2. `every allow-listed field for <label> is still read`
3. `every allow-listed field for <label> is unchecked, not merely excused`
4. `reads <validator> rather than an empty body`

第 4 条是**防「两个空集合永远相等」**。上一轮已经吃过一次：正则写错时四组字段集全是空的，前三条断言全部通过。这里用 `pinned` 钉住几个已知被校验的字段，正则有 bug 就立刻红。

## 4. 为什么豁免清单必须按路由分

`examYear` 在三个页面的命运完全不同：

| 页面         | 值坏了会怎样                                                 | 该不该校验   |
| ------------ | ------------------------------------------------------------ | ------------ |
| `/schedule/` | 被 90 天日期窗口静默过滤掉——**事件直接消失**，页面上看不出来 | **必须校验** |
| `/compare/`  | 表格单元印成 `適用年度: null年`，可见                        | 不必         |
| `/updates/`  | 只进批次分组 key，不落进 HTML                                | 不必         |

一份全局 allow-list 只能选一个答案，然后在另外两个页面上是错的。所以 `RouteGate.allow` 是**每条门禁自己的**，注释里逐条写了理由。

同理 `/compare/` 的 `qualification`：`renderComparePage` 读 `slug`、`officialNameJa`、`aliasesJa`、`category`，但前两个来自**上游**（必须校验），后两个来自**本地** `allQualifications`（不该校验）。文本门禁分不清这两者，只能把 `aliasesJa`、`category` 放进豁免并写明「read from the local allQualifications list, not from the comparison copy」。**这是本轮的已知盲区，见 §7。**

## 5. 变异

脚本 `var/mutate-sibling-gate.mjs`，8 个变异，**8/8 全抓**，`RESTORED=true`，`MUTATION_PROBLEMS=[]`。

| #   | 变异                                                | 抓它的用例                                                                     |
| --- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| 1   | 删掉 `/updates/` 的 `isRecord(event.qualification)` | `answers 503 for an update with a null qualification`                          |
| 2   | 删掉 `/updates/` 的 `factLabel` 校验                | `answers 503 for an update whose factLabel is a number`                        |
| 3   | 删掉 `/compare/` 的 `entry.sourceUrl` 校验          | `answers 503 for a comparison entry whose sourceUrl is a number`               |
| 4   | `/schedule/` 开始校验 `examYear`（豁免条目变过期）  | `every allow-listed field for schedule event is unchecked, not merely excused` |
| 5   | 渲染器开始读一个没人校验的字段                      | `checks every field schedule event dereferences`                               |
| 6   | 校验器只用可选链碰 `qualification`                  | `keeps /updates/ 200 when the qualification carries no fields at all`          |
| 7   | `functionBody` 不跳过参数列表                       | `reads isCalendarEnvelope rather than an empty body`                           |
| 8   | 某条门禁钉住一个校验器其实不查的字段                | 对应门禁的第 4 条用例                                                          |

### 5.1 首轮漏掉的那个变异

第 6 个：把 `isRecord(event.qualification) &&` 换成 `event.qualification?.slug !== undefined &&`。

**文本门禁抓不住它，而且这不是门禁的缺陷。** 两种写法都「读了 `qualification`」，字段覆盖完全一样；变的不是**覆盖**，是**严格度**——`{}` 在第一种写法下通过，在第二种下被拒。

抓它的是行为测试：新增 `BodyMode` 成员 `updates-empty-qualification`（`event.qualification = {}`）与用例 `keeps /updates/ 200 when the qualification carries no fields at all`。`{}` 是合法的上游值，渲染出一个 `/shikaku/undefined/undefined/` 的死链，页面完整返回 200（实测）。

这条用例的价值在于**它是唯一能把「is an object」和「looser check」区分开的用例**。写它之前，`qualification: null` → 503、`qualification: 'it-passport'` → 503 都能过，但 `{}` → 503 没人发现。

**教训（与 3J、3M、上一轮同源，第三、四次了）**：静态门禁看得见「读了没有」，看不见「读得多严」；**每一条豁免/校验决定都要有一个取值能把它和相邻的错误写法区分开**。

## 6. 全量矩阵

| 项       | 命令                                                                 | 结果                                  |
| -------- | -------------------------------------------------------------------- | ------------------------------------- |
| 类型     | `tsc -p tsconfig.json --noEmit`                                      | 0                                     |
| 单元     | `vitest run tests --pool=threads --poolOptions.threads.singleThread` | **30 files / 506 passed**（此前 477） |
| 门禁单测 | `node --test` 五个 `.mjs`                                            | **75 pass / 0 fail**                  |
| 格式     | `prettier --check "apps/**/*.ts" "tests/**/*.ts"`                    | 0（首轮 1，`--write` 后 0）           |
| 静态     | `eslint . --ignore-pattern "Python/**"`                              | 0                                     |

本轮只动两个测试文件：`tests/render-validator-sync.test.ts` +237、`tests/web-upstream-shape.test.ts` +20。**运行时源码零改动**——门禁和反向用例都是对已有行为的确认，不是新约束。

## 7. 未处理

1. **`/compare/` 的 `qualification` 门禁分不清本地与上游。** `renderComparePage` 里 `aliasesJa`、`category` 只从本地 `allQualifications` 读，但文本门禁看到的是「`qualification.aliasesJa` 被读了」。若将来有人从**上游副本**读 `aliasesJa`，门禁不会响。根治需要把两个来源用不同变量名（如 `localQualification`），那是渲染器重构，不在本轮。
2. **`renderSchedulePage` 的 `entry`、`renderUpdatesPage` 的 `row` 是局部变量。** 实测里它们出现在字段集里，但它们不是上游数据，所以没有为它们建门禁。若将来这些局部变量改名或消失，字段集会变，但没人会注意到——影响很小。
3. **豁免清单仍手写。** `allow` 里每条理由都是人写的。理由过期（字段改了用法但注释没改）没有任何机制能发现。第 3 条用例只能保证「还在被读」，不能保证「理由还对」。
4. **`/schedule/` 的 `deliveryMode` 等 8 个字段仍不校验。** 上一轮实测确认它们不崩（`200` + 完整页面），本轮把这一事实固化进门禁，但**没有改变行为**。若上游开始发别的形状，仍要重新实测。

## 8. 风险

| 风险                                         | 影响                              | 缓解                                                                                            |
| -------------------------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------- |
| 有人为了「修红」把字段塞进 `allow`           | 门禁变成形式主义                  | 每条 allow 必须写理由；第 3 条用例要求它「确实没被校验」，塞进去但校验器其实查了会被 `stale` 抓 |
| 渲染器重构改名（如 `event` → `row`）         | 字段集变空，门禁假绿              | 第 4 条用例的 `pinned` 会立刻红                                                                 |
| 同名字段在三个页面需要不同校验，被后人统一掉 | 某个页面开始 503 或开始静默丢数据 | 门禁按路由分（§4），统一会同时打破 4 个门禁                                                     |

## 9. 下一步

1. **P1 — 把 `chore/phase1-baseline` 落到 `main`。** `origin/main` 仍停在 `01b86dd`，落后 60+ commit。需要 Owner 授权 merge。
2. **P2 — 生产跑一次 patrol**，消掉 `coverageGap: not_run`。
3. **P2 — `/compare/` 的 `qualification` 来源区分**（§7 第 1 条）：把本地列表改名成 `localQualification`，让门禁能分辨。这是渲染器重构，需单开一轮。
4. **P3 — `audit-mvp` 的 22 个覆盖缺口处置**（长期挂账）。
5. **P3 — 统一博客域名两层安全头**（Caddy site block + blog 容器 nginx 叠加，`4ac4afd` 记录）。

## 10. 停止声明

本轮到此为止。只做了「把三条兄弟路由纳入字段集门禁」一件事：两个测试文件、零运行时改动。**没有**部署、**没有**改渲染器、**没有**改校验器、**没有**碰 schema / URL / Caddy / Docker。

下一步由 Owner 决定。
