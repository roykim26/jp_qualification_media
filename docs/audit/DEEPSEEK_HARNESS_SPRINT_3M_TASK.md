# Sprint 3M 任务文档 — 兄弟路由的上游形状校验

日期：2026-11-25
分支：`chore/phase1-baseline`
上游任务：Sprint 3K 报告 §11 P6（`render.ts` 解引用与 `isQualificationView` 的同步机制）

---

## 0. 一句话

`/shikaku/:slug/` 系列在 Sprint 3K 里有了逐字段校验，`/schedule/`、`/compare/`、`/updates/` 三条兄弟路由却只有「是不是数组」这一层检查。本 Sprint 给它们各补一个元素级校验器，让坏形状落 503，而不是 `200` + 空 body。

## 1. 为什么这件事必须先做

Sprint 3K 修的是这样一条链：

```text
上游 200 + 坏形状
  → 路由先 writeHead(200)
  → 渲染器对坏值抛 TypeError
  → catch 想 writeHead(502)，头已发出 → ERR_HTTP_HEADERS_SENT
  → 未处理的 rejection → 进程退出
  → restart: unless-stopped + caddy depends_on web: service_healthy
  → 重启循环 + 整站不可用
```

3K 的修法有两件：`closeAfterResponseStarted()` 守卫（防止进程死），和 `readJson()` 里的形状判定（让坏形状在写头之前变成 503）。但形状判定只做在 `/shikaku/:slug/` 上——`isQualificationView` 逐字段校验 fact 与 qualification。

`/schedule/`、`/compare/`、`/updates/` 用的是 `hasArrayData`（只判 `data` 是数组）和早期的 `isComparisonEnvelope`（只判 `qualifications`/`rows` 是数组）。**守卫挡住了进程崩溃，所以这些路由不会死；但它们会返回 `200` 和一个空 body**——用户看到一个空白页，监控看到 200。这比 503 更糟：503 会被 `retry-after` 和告警接住，空 200 不会。

## 2. 实测（探测脚本已删除，结论保留）

探测手法：临时 vitest 文件起 stub API + 真实 `handleRequest`，逐字段污染后请求对应路由，打印 `status` 与 body 长度。

### 2.1 `/schedule/`（基线 `200 len=22501`）

| 污染                                  | 结果                                                   |
| ------------------------------------- | ------------------------------------------------------ |
| `qualification.officialNameJa = null` | `200 len=0`                                            |
| `qualification.slug = null`           | `200 len=0`                                            |
| `label = null`                        | `200 len=0`                                            |
| `factKey = null`                      | `200 len=0`                                            |
| `displayValue = null`                 | `200 len=0`                                            |
| `type = null`                         | `200 len=0`                                            |
| `type = 'bogus'`                      | `200 len=0`                                            |
| `sourceUrl = 123`                     | `200 len=0`                                            |
| `data[0] = null`                      | `200 len=0`                                            |
| `dateValue = 123`                     | `200 len=21677`（事件被 `dateValue < today` 静默丢掉） |
| `verifiedAt = null`                   | `200 len=22485`（渲染成「未確認」）                    |
| `examYear = null`                     | `200 len=22501`（渲染成 `null年`）                     |
| `startValue = 123`                    | `200 len=22501`                                        |
| `id = null`                           | `200 len=22498`                                        |
| `qualification.aliasesJa = null`      | `200 len=22501`（日程页不读别名）                      |

**探测坑**：`/schedule/` 默认只显示未来 90 天，`dateValue` 用 `2026-04-19`（过去）或 `2027-04-19`（超窗）都会被静默过滤，基线长度会和多数坏值相同——差点误判成「不崩」。改成 `2026-12-15` 后基线才变 `22501`。

### 2.2 `/updates/`（基线 `200 len=21047`）

崩（`200 len=0`）：`eventLabel`/`factKey`/`newValue` = null、`previousValue = 123`、`affectedPages = null`、`affectedPages = [null]`、`createdAt = null`、`sourceUrl = 123`、`data[0] = null`。

不崩：`factLabel = null`（`21050`）、`verifiedAt = null`（`21031`）、`eventType`/`id`/`examYear` = null（均 `21047`）、`qualification.officialNameJa = null`（`21041`）、`qualification.slug = null`（`21040`）——**与 `/compare/` 相反**，因为 `/updates/` 把 qualification 拼进模板字符串再整体 `escapeHtml`。

### 2.3 `/compare/`（基线 `200 len=22972`）

崩：`qualification.officialNameJa`/`slug` = null、`row.label = null`、`cell.entries = null`、`entry.value`/`factKey` = null、`row.cells = null`、`entry = null`、`row = null`、`qualifications[0] = null`。

不崩：`qualification.aliasesJa = null`、`qualification.field = null`（选择器渲染的是本地资格列表，不是比较结果里的副本）、`row.key = null`。

### 2.4 三条路由的共同点

都是「渲染器直接解引用上游字段，上游没保证」。修法只能是逐字段校验——但没有免费清单，只能实测。

## 3. 任务

### Task A — 三个元素级校验器

- `hasQualificationIdentity(value)`：`slug` 与 `officialNameJa` 都是 string。被 `/schedule/` 和 `/compare/` 共用。
- `calendarEventTypes`：`application_open`/`application_deadline`/`exam_date`/`result_date` 四个。**必须钉枚举**——`escapeHtml(eventTone[event.type])` 在未知 type 时拿到 `undefined`，再 `undefined.replaceAll` 抛错。
- `isCalendarEnvelope(value)`：`{data:[...]}`，每个 event 校验 `type`（在枚举内）/`label`/`displayValue`/`factKey`/`dateValue`（null 或 string）/`sourceUrl?`/`hasQualificationIdentity(qualification)`。
- `isComparisonEnvelope(value)` 重写：`qualifications` 每项过 `hasQualificationIdentity`；`rows` 每项 `isRecord` + `label` string + `cells` 是 record + 每 cell 的 `entries` 是数组且每个 entry 的 `factKey`/`value` 是 string。
- `isUpdatesEnvelope(value)`：`eventLabel`/`factKey`/`newValue`/`createdAt` string、`previousValue`（null 或 string）、`affectedPages`（数组且元素全 string）、`sourceUrl?`。
- 接线：`readCalendar`/`readComparison`/`readUpdates` 全部改走新校验器。
- **删掉 `hasArrayData`**（改完后零引用，不留死代码）。

### Task B — 校验范围只到「会崩或会静默丢数据」

**不校验**实测不抛的字段：

- `/schedule/`：`examYear`（渲染 `null年`）、`startValue`（被 `String()` 化）、`verifiedAt`（渲染「未確認」）、`id`（只影响 ICS 链接）、`sequence`（不读）。
- `/updates/`：`factLabel`、`verifiedAt`、`eventType`、`id`、`examYear`、`qualification.*`。
- `/compare/`：`row.key`、`qualification.aliasesJa`、`qualification.field`、`entry.examYear`、`missingReason`。

理由写进 doc comment：**为一个月标把整页判 503 是更差的交易**。`examYear` 尤其要单独说明——`/schedule/` 检查了它自己的 `examYear`（日历页整个职责就是日期），但 `/compare/` 的 `entry.examYear` 只是单元格里一行 `適用年度: X年`，坏值降级成可见的 `null年`，不该拖垮整张比较表。

### Task C — 测试

- 每个坏字段一条用例，加进 `tests/web-upstream-shape.test.ts` 的 `malformed` 数组。
- 每条断言：`503` + `retry-after: 60` + body 含「一時的に」+ **之后仍能 200**（进程没死）。
- stub 形状必须照抄 `packages/schema/src/calendar.ts:6-24`、`updates.ts:3-17`、`compare.ts:30-44`，不能凭猜——第一版凭猜写错形状，连 `ok` 基线都崩，差点误判。

## 4. 硬约束

1. **不改运行时响应语义**：健康数据仍然 200 且内容不变。
2. **`/` 与 `/health` 在坏形状下仍 200**（healthcheck 依赖它们）。
3. **不改 `deploy/`**（compose/Caddy/Dockerfile）。
4. **不加依赖**。
5. **不改 `render.ts`**：本次只加校验，不动渲染逻辑。
6. **`/sitemap.xml` 的错误体仍是 XML**（3A 的约定）。

## 5. 禁止事项

- 不改 `render.ts` 的渲染逻辑（只允许在 `server.ts` 加校验）。
- 不把 `verifiedAt`/`examYear` 这类「渲染得难看但不撒谎」的字段纳入校验。
- 不动 `deploy/`、`package.json`、CI 配置。
- 不顺手做 3K 报告 §11 的 P1（上线）——那需要 Owner 授权。
- 不进入 Sprint 3N。

## 6. 报告要求

`docs/audit/SPRINT_3M_REPORT_2026-11-25.md`，至少包含：执行摘要 / Git 状态与基线 / 修改文件 / 三条路由的实测表（含「不崩」的字段与理由）/ 校验范围取舍 / 变异测试结果 / 完整测试结果 / 未处理问题 / 风险 / 下一步 / 停止声明。

## 7. 停止纪律

Sprint 3M 完成后必须停止，等 Owner 决定下一步。不要自行进入 Sprint 3N、不要自行上线、不要顺手修报告里提到的其它问题。
