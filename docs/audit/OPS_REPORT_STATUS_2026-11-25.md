# 运营日检报告的 `status` 语义拆分

- 日期：2026-11-25
- 分支：`chore/phase1-baseline`
- 执行前 HEAD：`2cfb16c`
- 本轮内容 commit：`0890d48`（收口 commit 只回填这一行）
- 触发来源：`docs/audit/DEPLOY_3A_3M_REPORT_2026-11-25.md` §10.1 / §15 P3，`docs/audit/DUE_FACT_DIMENSIONS_2026-11-25.md` §8 第 4 条 / §9 P3

## 0. 一句话结论

`status` 不再被当作健康度：新增 `reportStatus`（与 `status` 同义、名字说清）与 `overallStatus`（真正的健康度），markdown 摘要第一行直接写人话。`status` 与 cron 包装脚本的解析逻辑一个字没改，向后兼容。

## 1. 问题

生产报告长期同时出现这两个字段：

```json
{ "status": "ok", "hasCritical": true }
```

`status` 在 `scripts/ops-daily-lib.mjs` 里是硬编码的 `'ok'`，回答的只是「报告跑起来了吗」；`hasCritical` 才是「今天要不要动手」。两个字段语义完全不同却并列，任何第一次读这份 JSON 的人都会以为 `status: ok` 意味着站点健康——部署报告 §10.1 把它列为「任何第一次读这份 JSON 都会误解」。

这不是本轮引入的缺陷，是 3H 设计时留下的命名债：`status` 被 cron 包装脚本当成「报告可用」的判据（`scripts/ops-daily-cron.sh` 从 stdout 提取它区分「跑挂了」与「有 critical」），所以它必须是 `ok`。

## 2. 为什么改名不可行

先评估了「把 `status` 改名成 `reportStatus`」这条路，结论是不可行：

1. `scripts/ops-daily-cron.sh` 从 stdout 用 `sed` 提取 `"status"` 字段；改名后提取到空串，包装脚本会把每一次正常日检都当成 `report did not run` 并报警。
2. `docs/runbook.md` 的人工判据（`status: ok`）与定时日检的三行行为表都以 `status` 为准。
3. 生产上已经装了 crontab（`17 9 * * *`），改名的兼容窗口需要同时发布新镜像与新脚本，而脚本在镜像里、crontab 在宿主机上——中间态必然报警。

所以选**新增字段**而不是改名：新旧读者各取所需，包装脚本行为零变化。

## 3. 改动

### 3.1 `scripts/ops-daily-lib.mjs`

`buildDailyReport` 的返回对象：

```js
const hasCritical = critical.length > 0 || channel.level === 'critical';
return {
  // `status` answers one question only: did the report get produced? The cron
  // wrapper parses this field to tell a broken run from a working one, so a
  // run that found critical problems still says `ok` here. That is easy to
  // misread as "everything is fine", so the health verdict lives in
  // `overallStatus` and the boolean lives in `hasCritical`.
  status: 'ok',
  reportStatus: 'ok',
  overallStatus: hasCritical ? 'action_needed' : 'ok',
  checkedAt: now.toISOString(),
  ...
  hasCritical,
```

`hasCritical` 的表达式被提到 `return` 之前，只计算一次，`overallStatus` 与 `hasCritical` 因此**不可能不一致**。

`renderMarkdown` 的「摘要」段第一行：

```js
lines.push(
  `- 整体状态：${report.overallStatus === 'action_needed' ? '需要处理（见上）' : '正常'}`,
);
```

放在摘要第一行是刻意的：只读摘要块的人也必须第一眼看到真话。

### 3.2 `docs/runbook.md`

人工日检一节新增三字段对照表（`status` / `reportStatus` / `overallStatus` 各回答什么问题、谁在读），并写明「`status` 保留是为了不打破已在跑的 cron 行与本文档的判据，它不代表健康度」。

## 4. 测试

### 4.1 `scripts/ops-daily-lib.test.mjs`（23 → 25 用例）

| 用例                                                               | 锁住什么                                                                                        |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `a report with critical findings still reports itself as produced` | `hasCritical===true` 时 `status` 与 `reportStatus` 仍是 `ok`，`overallStatus==='action_needed'` |
| `a quiet report is ok in both senses`                              | 无 critical 时 `overallStatus==='ok'`，且 markdown 含 `- 整体状态：正常`                        |

第一条用例故意让两个字段「看起来矛盾」，因为这个矛盾正是要被固定的契约：`status` 回答的不是健康度。

### 4.2 `tests/ops-daily-cron.test.ts`（15 → 16 用例）

新增 `ignores overallStatus when deciding whether to speak`：喂一份 `{status:'ok', hasCritical:false, overallStatus:'action_needed'}` 的**自相矛盾**报告，断言包装脚本仍然沉默（`logs` 空、`notifications` 空）。

这条用例的价值在于反向锁定：如果将来有人「顺手」让包装脚本改读 `overallStatus`，一个人读的字段就会开始给人发飞书，而这份测试会立刻红。

`stageReport` fixture 未改——包装脚本仍只读 `status` 与 `hasCritical`。

### 4.3 结果

```text
node --test scripts/ops-daily-lib.test.mjs   → tests 25 / pass 25 / fail 0
vitest run tests/ops-daily-cron.test.ts      → 16 passed (12.09s)
```

## 5. 真实报告验证

本地库（`postgresql://postgres@127.0.0.1:55432/qualification_media`）跑 `node scripts/ops-daily-report.mjs`，退出码 1（有 critical，符合 `:154` 的既有逻辑），报告顶层字段：

```json
{
  "status": "ok",
  "reportStatus": "ok",
  "overallStatus": "action_needed",
  "hasCritical": true,
  "actions": 12
}
```

markdown `var/ops-reports/2026-11-25.md:20`：`- 整体状态：需要处理（见上）`。

再用包装脚本同款的 `sed` 提取逻辑跑一遍新报告，确认**向后兼容**：

```text
PARSED_STATUS=ok
PARSED_HASCRITICAL=true
```

即：生产上现有的 `ops-daily-cron.sh`（无论宿主机上那版还是镜像里那版）读到新报告时行为完全不变。

## 6. 完整矩阵

| 检查                                    | 结果                                       |
| --------------------------------------- | ------------------------------------------ |
| `pnpm typecheck`                        | 0                                          |
| `pnpm test`                             | **28 files / 459 tests passed**（本轮 +1） |
| `pnpm test:verify-gate`                 | 59 pass / 0 fail（本轮 +2）                |
| `pnpm build`                            | 0                                          |
| `pnpm format:check`                     | 0                                          |
| `pnpm test:python`                      | 239 passed                                 |
| `pnpm verify:all`                       | EXIT 0，`"errors": []`                     |
| `pnpm smoke:docker`                     | 11 项 ok，`docker smoke passed`            |
| `eslint . --ignore-pattern "Python/**"` | 0                                          |

## 7. 未处理问题

1. **`status` 仍然是硬编码的 `'ok'`**。本轮只加了旁路字段，没有改变它的语义。要真正改名需要一次协同发布（镜像 + 宿主机 crontab 行 + runbook），本轮不做。
2. **`reportStatus` 与 `status` 永远相同**，是冗余字段。保留它是为了让新读者有一个名字正确的入口；将来若真做改名，`reportStatus` 就是目标名，届时删 `status` 即可。
3. **`overallStatus` 只有两个取值**。若将来需要「需要处理但不必今天」这类中间态，得再设计——本轮不预先虚构。

## 8. 风险

| 风险                                  | 影响 | 缓解                                                            |
| ------------------------------------- | ---- | --------------------------------------------------------------- |
| 有人以为 `status` 已经代表健康度      | 低   | runbook 三字段表 + markdown 摘要首行 + 用例名直说               |
| 未来把包装脚本改成读 `overallStatus`  | 中   | `ignores overallStatus when deciding whether to speak` 会立刻红 |
| `overallStatus` 与 `hasCritical` 漂移 | 极低 | 两者由同一个 `const hasCritical` 派生，不可能不一致             |

## 9. 下一步建议

- **P1**：把 `chore/phase1-baseline` 落到 `main`（需 Owner 授权 merge）。
- **P2**：把 `verify-staleness-query.mjs` 的三条连库断言用到 `audit-mvp.mjs` / `check-staleness.mjs`。
- **P3**：生产跑一次 patrol，消掉 `coverageGap: not_run`。
- **P4**：等 24–48h 收 `/pass-rate/` 部署后观测；提交 Caddyfile 博客 vhost 进仓库；404 噪声过滤。

## 10. 停止声明

本轮只做 `status` 语义拆分这一件事。未改动 `ops-daily-cron.sh` 的任何判据、未改动 `ops-daily-report.mjs` 的退出码逻辑、未部署、未改 crontab、未进入 patrol 或 Caddyfile 等其它待办。下一步由 Owner 决定。
