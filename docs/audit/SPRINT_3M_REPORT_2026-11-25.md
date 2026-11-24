# Sprint 3M 执行报告 — 兄弟路由的上游形状校验

日期：2026-11-25
分支：`chore/phase1-baseline`
任务文档：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3M_TASK.md`

---

## 1. 执行摘要

Sprint 3K 给 `/shikaku/:slug/` 系列加了逐字段的上游形状校验，`/schedule/`、`/compare/`、`/updates/` 三条兄弟路由却只判「`data` 是不是数组」。本 Sprint 实测确认这三条路由存在同一类缺陷：**上游返回 200 + 坏形状时，路由返回 200 + 空 body**。

与 3K 的区别在于后果的严重程度：3K 那条链会**让进程退出**（重启循环 + 整站不可用），本 Sprint 这三条只会**返回一个空白的 200**。后者不死，但更隐蔽——503 会被 `retry-after` 和告警接住，空 200 不会，用户看到白页而监控全绿。

修法：三个元素级校验器（`isCalendarEnvelope`/`isComparisonEnvelope` 重写/`isUpdatesEnvelope`），接进对应的 `read*`，让坏形状在写响应头之前变成 503。**校验范围严格限定在「会抛错或会静默丢数据」的字段**——实测不抛的字段一律不校验，避免把「渲染得难看」升级成「整页不可用」。

运行时源码改动：`apps/web/src/server.ts`（+150 行，其中约 90 行是解释「为什么校验这个、不校验那个」的注释）。测试新增 35 条用例。**未改动 `render.ts`、`deploy/`、`package.json`。**

## 2. Git 状态与基线

执行前：

```text
HEAD：c8d631c  docs: 落账 Sprint 3L 执行报告
分支：chore/phase1-baseline
工作树：干净
```

本轮内容 commit：`90564c1`（`fix(web): 兄弟路由的上游形状校验（Sprint 3M）`）

报告无法在自己那个 commit 里引用自己的 hash（写了 hash 就会改变 hash），所以固定拆两个 commit：本文件先随内容一起提交，再由一个 `docs: 落账…` 的收口 commit 回填这一行。基线链只列到内容 commit，HEAD 以 `git log` 为准。

## 3. 修改文件

| 文件                                            | 变更           |
| ----------------------------------------------- | -------------- |
| `apps/web/src/server.ts`                        | +150 / −9      |
| `tests/web-upstream-shape.test.ts`              | +437 / −0      |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3M_TASK.md` | 新增           |
| `docs/audit/SPRINT_3M_REPORT_2026-11-25.md`     | 新增（本文件） |

`render.ts`、`deploy/`、`package.json`、CI 配置**零改动**。

## 4. 实测：三条路由的崩溃面

探测手法：临时 vitest 文件起 stub API（形状照抄 `packages/schema/src/*.ts` 的导出类型）+ 真实 `handleRequest`，逐字段污染后请求对应路由，打印 `status` 与 body 长度。探测脚本用完即删。

### 4.1 `/schedule/`（基线 `200 len=22501`）

| 污染                                  | 结果                              | 处理                       |
| ------------------------------------- | --------------------------------- | -------------------------- |
| `qualification.officialNameJa = null` | `200 len=0`                       | 校验                       |
| `qualification.slug = null`           | `200 len=0`                       | 校验                       |
| `label = null`                        | `200 len=0`                       | 校验                       |
| `factKey = null`                      | `200 len=0`                       | 校验                       |
| `displayValue = null`                 | `200 len=0`                       | 校验                       |
| `type = null`                         | `200 len=0`                       | 校验                       |
| `type = 'bogus'`                      | `200 len=0`                       | 校验（钉枚举）             |
| `sourceUrl = 123`                     | `200 len=0`                       | 校验                       |
| `data[0] = null`                      | `200 len=0`                       | 校验                       |
| `dateValue = 123`                     | `200 len=21677`（事件被静默丢弃） | **校验**（不抛错但丢数据） |
| `verifiedAt = null`                   | `200 len=22485`（「未確認」）     | 不校验                     |
| `examYear = null`                     | `200 len=22501`（`null年`）       | 不校验                     |
| `startValue = 123`                    | `200 len=22501`                   | 不校验                     |
| `id = null`                           | `200 len=22498`                   | 不校验                     |
| `qualification.aliasesJa = null`      | `200 len=22501`（日程页不读别名） | 不校验                     |

**探测坑（值得记下）**：`/schedule/` 默认只显示未来 90 天，`dateValue` 用 `2026-04-19`（过去）或 `2027-04-19`（超窗）都会被静默过滤，基线长度会和绝大多数坏值相同。第一版因此差点得出「`/schedule/` 不崩」的错误结论。改成窗口内的 `2026-12-15` 后基线变 `22501`，崩溃才暴露。

### 4.2 `/updates/`（基线 `200 len=21047`）

崩（`200 len=0`）：`eventLabel`/`factKey`/`newValue` = null、`previousValue = 123`、`affectedPages = null`、`affectedPages = [null]`、`createdAt = null`、`sourceUrl = 123`、`data[0] = null`。

不崩：`factLabel = null`（`21050`）、`verifiedAt = null`（`21031`）、`eventType`/`id`/`examYear` = null（均 `21047`）、`qualification.officialNameJa = null`（`21041`）、`qualification.slug = null`（`21040`）。

**与 `/compare/` 相反的因果**：`/updates/` 把 qualification 拼进模板字符串再整体 `escapeHtml()`，`null` 变成字符串 `"null"` 照常渲染；`/compare/` 是直接 `escapeHtml(qualification.officialNameJa)`，`null` 进 `replaceAll` 就抛。同一份数据、同一个渲染工具，因为调用位置不同，崩溃面完全不同——这也是为什么校验清单只能实测，不能靠读代码推。

### 4.3 `/compare/`（基线 `200 len=22972`）

崩：`qualification.officialNameJa`/`slug` = null、`row.label = null`、`cell.entries = null`、`entry.value`/`factKey` = null、`row.cells = null`、`entry = null`、`row = null`、`qualifications[0] = null`。

不崩：`qualification.aliasesJa = null`、`qualification.field = null`（选择器渲染的是本地资格列表，不是比较结果里的副本）、`row.key = null`。

## 5. 校验范围与取舍

三个校验器加在 `apps/web/src/server.ts`，`readJson` 之前：

- **`hasQualificationIdentity(value)`** — `slug` 与 `officialNameJa` 都是 string，被 `/schedule/` 与 `/compare/` 共用。
- **`calendarEventTypes`** — `application_open`/`application_deadline`/`exam_date`/`result_date`。**必须钉枚举**：`renderSchedulePage()` 做 `escapeHtml(eventTone[event.type])`，未知 type 让查表得到 `undefined`，`undefined.replaceAll` 抛错。非空字符串不够。
- **`isCalendarEnvelope(value)`** — `{data:[...]}`，每个 event 校验 `type`（枚举内）/`label`/`displayValue`/`factKey`/`dateValue`（null 或 string）/`sourceUrl?`/qualification 身份。
- **`isComparisonEnvelope(value)`**（重写）— `qualifications` 每项过身份校验；`rows` 每项 `isRecord` + `label` string + `cells` 是 record + 每 cell 的 `entries` 是数组且每个 entry 的 `factKey`/`value` 是 string。
- **`isUpdatesEnvelope(value)`** — `eventLabel`/`factKey`/`newValue`/`createdAt` string、`previousValue`（null 或 string）、`affectedPages`（数组且元素全 string）、`sourceUrl?`。

接线：`readCalendar`/`readComparison`/`readUpdates` 全部改走新校验器。原来的 `hasArrayData` 改完后零引用，**已删除**，不留死代码。

### 5.1 刻意不校验的字段，以及理由

| 字段                                          | 实测表现           | 为什么不校验                |
| --------------------------------------------- | ------------------ | --------------------------- |
| `/schedule/` `examYear`                       | `null年`           | 降级可见，不撒谎            |
| `/schedule/` `startValue`                     | 被 `String()` 化   | 不抛错                      |
| `/schedule/` `verifiedAt`                     | 「未確認」         | `formatVerifiedAt()` 已兜底 |
| `/schedule/` `id`                             | 只影响 ICS 链接    | 不影响页面主体              |
| `/updates/` `factLabel`                       | 渲染成 `null`      | 不抛错                      |
| `/updates/` `qualification.*`                 | 模板字符串拼接     | 不抛错                      |
| `/compare/` `row.key`                         | 不读               | —                           |
| `/compare/` `entry.examYear`                  | `適用年度: null年` | 见下                        |
| `/compare/` `qualification.aliasesJa`/`field` | 选择器用本地数据   | 不读上游副本                |

`entry.examYear` 需要单独说明：`/schedule/` 检查了它自己的 `examYear` 吗？没有——`/schedule/` 的 `examYear` 也不校验。两边口径一致：**`examYear` 坏值只让一个年份标签变成 `null年`，为一个标签把整页判 503 是更差的交易**。这条理由写进了 doc comment，因为下一个人看到「这里没校验」时应该能读到为什么。

### 5.2 `dateValue` 是个例外

`dateValue = 123` 不抛错，但 `renderSchedulePage()` 的 `dateValue < today` 会把数字和字符串比较，事件被静默过滤——页面看起来正常，只是少了一行。**「看起来正常但内容错了」比 503 更危险**，所以它进校验范围。这条也是实测出来的，不是推的：长度从 `22501` 掉回 `21677` 才暴露。

## 6. 变异测试

用 `var/mutate-3m-sib2.mjs`（Node 读写 UTF-8，规避 PowerShell 的 ANSI 往返事故）对 `apps/web/src/server.ts` 施加 21 个单点变异，每个跑一次 `tests/web-upstream-shape.test.ts`，跑完还原并读回确认。

| #   | 变异                                   | 结果                |
| --- | -------------------------------------- | ------------------- |
| 1   | calendar: `type` 枚举 → 任意 string    | ✅ 1 条失败         |
| 2   | calendar: 去掉 `label` 校验            | ✅ 1 条             |
| 3   | calendar: 去掉 `displayValue` 校验     | ✅ 1 条             |
| 4   | calendar: 去掉 `factKey` 校验          | ✅ 1 条             |
| 5   | calendar: 去掉 `dateValue` 校验        | ✅ 1 条             |
| 6   | calendar: 去掉 `sourceUrl` 校验        | ✅ 1 条             |
| 7   | calendar: 去掉 qualification 身份校验  | ✅ 2 条             |
| 8   | updates: 去掉 `eventLabel` 校验        | ✅ 1 条             |
| 9   | updates: 去掉 `factKey` 校验           | ✅ 1 条             |
| 10  | updates: 去掉 `newValue` 校验          | ✅ 1 条             |
| 11  | updates: 去掉 `previousValue` 校验     | ✅ 1 条             |
| 12  | updates: 去掉 `createdAt` 校验         | ✅ 1 条             |
| 13  | updates: 去掉 `affectedPages` 数组校验 | ✅ 1 条             |
| 14  | updates: 去掉 `affectedPages` 元素校验 | ✅ 1 条             |
| 15  | updates: 去掉 `sourceUrl` 校验         | ✅ 1 条             |
| 16  | compare: 去掉 qualification 身份校验   | ✅ 3 条             |
| 17  | compare: 去掉 `row.label` 校验         | ✅ 1 条             |
| 18  | compare: 去掉 `row.cells` record 校验  | ✅ 1 条（补用例后） |
| 19  | compare: 去掉 `cell.entries` 数组校验  | ✅ 1 条             |
| 20  | compare: 去掉 `entry.factKey` 校验     | ✅ 1 条             |
| 21  | compare: 去掉 `entry.value` 校验       | ✅ 1 条             |

**首轮 21 个变异中 1 个漏网**：`compare: drop row.cells record check`。实测时验证过 `row.cells = null → 503`，但没有把它写成用例。补上 `compare-null-cells` 后抓住。

### 6.1 变异脚本自身的两个坑

**坑一：模式串没匹配上，变异根本没落盘。** 第一版变异脚本的 `from` 字符串是我手写的（以为源码是某种格式），10 个里 7 个 `pattern not found`。如果只看「测试没失败」就下结论，会得出「这些校验没被覆盖」的错误判断——实际是变异压根没发生。修法：模式串从源码逐字复制，并且**每次写盘后读回确认文件确实变了**（`readFileSync(TARGET) !== original`）才跑测试。

**坑二：`String.replace` 只替换第一处。** 变异 9 的 `from` 是 `typeof event.factKey === 'string' &&`，这段在 `isCalendarEnvelope` 和 `isUpdatesEnvelope` 里各有一份。`replace` 换了 calendar 那份，测试报的却是「calendar event with a null factKey」失败——名字标着 updates，实际验的是 calendar。这次恰好也是被覆盖的，但**这个静默错配本身是个陷阱**：如果 calendar 那份没被覆盖，就会出现「变异标 updates、测试因 calendar 失败而通过」的假阳性。变异脚本必须让模式串唯一。

## 7. 完整测试结果

| 检查                                    | 结果                                        |
| --------------------------------------- | ------------------------------------------- |
| `pnpm typecheck`                        | ✅ EXIT 0                                   |
| `pnpm test`                             | ✅ **28 files 456 tests**（3L 时 421，+35） |
| `pnpm test:verify-gate`                 | ✅ **51 pass 0 fail**                       |
| `pnpm build`                            | ✅ EXIT 0                                   |
| `pnpm format:check`                     | ✅ EXIT 0                                   |
| `eslint . --ignore-pattern "Python/**"` | ✅ EXIT 0                                   |
| `pnpm test:python`                      | ✅ **239 passed**                           |
| `pnpm verify:all`                       | ✅ EXIT 0，6 资格全过，`"errors": []`       |
| `pnpm smoke:docker`                     | ✅ **11 项 ok**                             |
| `tests/web-upstream-shape.test.ts`      | ✅ **58 tests**（3K 收尾时 23，+35）        |

`smoke:docker` 的 11 项：API 角色不可写 / 1007 条 approved facts 还原 / 首页渲染 / 资格页渲染 / API 供数 / sitemap 列出可索引页 / 年份筛选 noindex / pass-rate 排序参数 noindex / ICS 下载 / robots.txt 指向 sitemap / 未知资格 404。

### 7.1 中途修掉的两个自身问题

**typecheck 报 `TS2698: Spread types may only be created from object types`**：`{ ...cell.entries[0] }` 里 `entries` 被声明成 `unknown[]`，展开 `unknown` 不合法。改成 `Record<string, unknown>[]` 并给 `[null]` 显式 cast。

**doc comment 重复了一段**：`dateValue` 先写在「会抛错」的列表里，又在「不抛错但会误渲染」的段落里写了一遍，两处说法还不一致。合并成一条，并补上「为什么不校验」的统一段落。

## 8. 未处理问题

1. **`/ics` 与 `?page=` 的边界仍未测**（3J 报告 §8 的遗留）。本次校验器只覆盖三条列表页的主路径。
2. **`render.ts` 的解引用与校验器之间仍无同步机制**。本次是手工做差集：读渲染器、找解引用、实测、补校验。下次有人往 `render.ts` 加一个新字段的解引用，不会有任何东西提醒他补校验器。3K 报告 §11 P6 提的根治办法（共享字段常量 / 静态检查 / 类型收窄）本次**没有做**——那是架构改动，需要单开一轮。
3. **`calendarEventTypes` 是手工维护的枚举**。API 新增一个事件类型时，这里必须同步加，否则该类型的日程会被判 503。已在 doc comment 写明「渲染器本来也画不出这个类型」，但这是个真实的耦合点。
4. **`/pass-rate/` 的单资格故障观测仍无生产数据**（3K P3 加了日志，但代码没上线）。
5. **`docker compose run` 的生产行为仍未实测**（3H 报告 §7）。

## 9. 风险

| 风险                            | 影响             | 缓解                                                                        |
| ------------------------------- | ---------------- | --------------------------------------------------------------------------- |
| 校验过严，把合法数据判 503      | 整页不可用       | 只校验实测会崩/会丢数据的字段；不崩的一律放行                               |
| `calendarEventTypes` 漏掉新类型 | 该类型日程不显示 | doc comment 写明耦合；渲染器本来也画不出                                    |
| 上游真的新增了可选字段的坏值    | 未知             | 形状校验只做「已知会崩」的，新增字段默认放行                                |
| 校验器自身抛错                  | 500              | 全部用 `isRecord`/`Array.isArray` 守卫，`compare-null-cells` 用例专门守这条 |

## 10. 下一步建议

- **P1（需 Owner 凭据）**：上线 3A–3M 并装 crontab。永久阻塞于缺 SSH 私钥（本机 `~/.ssh` 只有 `known_hosts`）。
- **P2**：3K 报告 §11 P6 —— `render.ts` 解引用与校验器的同步机制。本次已证明「手工差集」能抓到真问题，但每次都要重新读一遍渲染器；根治需要架构改动，建议单开一轮。
- **P3**：`/ics` 404 与 `?page=` 边界（3J 遗留）。
- **P4**：`/pass-rate/` 观测收数（需先上线）。
- **P5**：`docker compose run` 生产行为实测（需先上线）。

## 11. 停止声明

Sprint 3M 到此为止。未进入 Sprint 3N，未上线任何代码，未改动 `deploy/`、`package.json`、CI 配置，未顺手修报告里提到的其它问题。

下一步由 Owner 根据本报告决定。
