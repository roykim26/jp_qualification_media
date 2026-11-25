# 巡检清单过期检查（Sprint 3H §9 P3）— 2026-11-25

## 0. Git 基线

| 项目            | 值                                                                                                    |
| --------------- | ----------------------------------------------------------------------------------------------------- |
| 分支            | `chore/phase1-baseline`（与 `main` 同 SHA）                                                           |
| 执行前 HEAD     | `3418ab4`                                                                                             |
| 本轮内容 commit | `73f1ecc`（第一段提交内容，第二段只把这一行的占位换成真实 hash）                                      |
| 生产运行版本    | `be43cc2`（admin 并行工作线的 tip，见 `docs/audit/PASS_RATE_FAILURE_OBSERVATION_2026-11-25.md` §5.1） |

两段式提交的理由：报告正文要引用本轮内容 commit 的 hash，而这个 hash 只有在提交之后才存在。第一段提交代码、测试与报告正文（占位符留在表格里），第二段把占位符换成真实 hash。这样「代码 + 它自己的执行报告」是同一个逻辑变更，回滚时一起回滚。

## 1. 问题

`scripts/ops-daily-report.mjs` 读 `var/patrol/registry.json`，把它与数据库里的 `sources` 表比对，算出两个方向的差集：

- `missingFromRegistry`：**数据库里有、巡检清单里没有**。含义是上一次巡检发生在这些来源入库之前，也就是**清单比数据库旧**。
- `missingFromDatabase`：巡检清单里有、数据库里没有（capture-only 来源按设计不入库，已在上一次改动中排除）。

在本次改动之前，`missingFromRegistry` 只有两个出口：`summary.coverageGap`（一个数字）和 markdown「## 巡检覆盖缺口」段落里的一行文字。**`todayActions` 里没有任何对应动作**，所以：

- 日检的「今日需处理」不会因为清单过期而出现任何条目；
- `hasCritical` 不受影响，`ops-daily-cron.sh` 判定「健康」并静默；
- 唯一能看到的是摘要行里一个孤零零的数字，而它和「有一个来源没被监控」长得一模一样。

换句话说：**巡检覆盖检查自己失效的时候，没有任何机制告诉人它在失效。** 这与 `status: 'ok'` 那个坑是同族问题——字段名叫「覆盖缺口」，读起来像数据问题，实际是度量问题。

## 2. 改动

### 2.1 `scripts/ops-daily-lib.mjs` — 新增 `patrol_registry_stale` 动作

插在 `pending_review` 循环之前：

```js
// A registry older than the database is not a data problem, it is a problem
// with the coverage check itself: every source added since the last patrol is
// invisible to the "is everything being watched?" question. It is an action
// but not a critical one — the same treatment as a review backlog — so it
// never pages; paging daily until someone runs patrol would only teach people
// to ignore the channel.
if (coverageGap.status === 'ok' && coverageGap.missingFromRegistry.length > 0) {
  todayActions.push({
    kind: 'patrol_registry_stale',
    target: 'var/patrol/registry.json',
    detail: `巡检清单比数据库旧，缺 ${coverageGap.missingFromRegistry.length} 个来源（${coverageGap.missingFromRegistry.join(', ')}）；重跑一次巡检即可补齐`,
  });
}
```

三个设计决定：

1. **排在 `pending_review` 之前**，在 `source_critical` 与 `notification_channel` 之后。理由：它比「待审积压」更接近「度量本身失效」，但比「某个来源抓取失败」轻——后者意味着有数据正在变旧，前者只是「我们不知道有没有数据在变旧」。
2. **不是 critical，不进 `hasCritical`**。理由：修它需要人登录服务器跑一次巡检，不是分钟级能完成的动作；每天 page 一次直到有人跑，只会训练人忽略告警通道。这与 3G/3H 里「静默设计」的既有取舍一致。
3. **`target` 用文件路径 `var/patrol/registry.json`，不是缺的那个 source id**。理由：这个动作的执行对象是那份文件（重跑巡检会重写它），列出 source id 在 `detail` 里，两者分工不同。

`status === 'ok'` 这个前置条件是必要的：`not_run` 意味着根本没读到清单，那时候「清单过期」是无从判断的，编造这个动作会给出错误指令（真实问题是第一次巡检压根没跑）。

### 2.2 `scripts/ops-daily-lib.mjs` — 摘要行不再是裸数字

```js
lines.push(
  `- 巡检覆盖缺口 ${summary.coverageGap === null ? '未检查（先跑一次巡检）' : summary.coverageGap === 0 ? '0' : `${summary.coverageGap}（巡检清单过期，见上）`}`,
);
```

原先是 `summary.coverageGap === null ? '未检查（先跑一次巡检）' : summary.coverageGap`。改动的理由：摘要的读者可能不看下面「今日需处理」段，一个孤零零的 `1` 会被读成「有一个来源没被监控」而不是「清单过期了，重跑一次就好」。这两件事的处置完全不同。

### 2.3 `scripts/ops-daily-lib.mjs` — 缺口段落补一句解释

在「库有登记但巡检清单缺失：…」那行之后：

```js
if (report.coverageGap.missingFromRegistry.length > 0) {
  lines.push(
    '这一行不是数据缺口，是巡检清单比数据库旧：上面这些来源是在上一次巡检之后才入库的，重跑一次巡检即可补齐。',
  );
}
```

理由：段落标题写的是「缺失」，读者很容易当成监控漏洞去追，需要一句话说明它是清单过期。

## 3. 测试

`scripts/ops-daily-lib.test.mjs` 从 31 条增加到 **36 条**。新增一个 helper `reportWithCoverageGap(coverageGap, pendingReview = [])`（`sourceHealth: []`、全零 staleness、`factsVsBaseline: []`，只暴露要测的两个输入），避免新用例复制整段 fixture。

| 用例                                                                            | 断言                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `a stale patrol registry becomes an action before the review backlog`           | `todayActions.map(kind)` 严格等于 `['patrol_registry_stale', 'pending_review']`；`target === 'var/patrol/registry.json'`；`detail` 含缺的那个 source id |
| `a fresh patrol registry adds no patrol action`                                 | `todayActions` 为空                                                                                                                                     |
| `an unchecked coverage gap adds no patrol action`                               | `{status:'not_run'}` → `todayActions` 为空                                                                                                              |
| `the summary line says the registry is stale instead of printing a bare number` | markdown 含 `- 巡检覆盖缺口 2（巡检清单过期，见上）` 且含 `这一行不是数据缺口，是巡检清单比数据库旧`                                                    |
| `the summary line keeps printing a plain number when the registry is fresh`     | 含 `- 巡检覆盖缺口 0`，且**不含** `巡检清单过期`、**不含** `这一行不是数据缺口`                                                                         |

第 5 条是反向用例：只断言「有缺口时会说」不够，还要断言「没缺口时不会说」，否则把文案写成无条件的也能通过。

`node --test scripts/ops-daily-lib.test.mjs` → **36 pass / 0 fail**。

## 4. 变异验证

`var/mutate-patrol-stale.mjs`（临时脚本，gitignored）。每个变异都先 `original.includes(from)` 预检、写盘后 `readFileSync` 读回确认落盘、跑完立刻还原。

| #   | 变异                                                                 | 结果   |
| --- | -------------------------------------------------------------------- | ------ |
| 1   | 删掉整个 stale 分支                                                  | CAUGHT |
| 2   | `missingFromRegistry.length > 0` → `>= 0`                            | CAUGHT |
| 3   | 去掉 `coverageGap.status === 'ok' &&` 守卫                           | CAUGHT |
| 4   | 摘要行改回只印数字                                                   | CAUGHT |
| 5   | 删掉「这一行不是数据缺口…」那句                                      | CAUGHT |
| 6   | 把 `for (const item of pendingReview)` 改成 `for (const item of [])` | CAUGHT |

**6/6 全抓，`MUTATION_PROBLEMS=[]`，`RESTORED=true`。**

第 6 条值得说明：它删的不是 patrol 动作，而是待审动作。它证明的是「patrol 动作不依赖待审循环存在」——如果实现里把 patrol 动作写在了 `pendingReview` 循环内部（很容易犯的错），这条变异就会漏抓。

## 5. 全量矩阵

| 检查     | 命令                                                                 | 结果                                             |
| -------- | -------------------------------------------------------------------- | ------------------------------------------------ |
| 类型     | `tsc -p tsconfig.json --noEmit`                                      | 0                                                |
| 单元     | `vitest run tests --pool=threads --poolOptions.threads.singleThread` | 0（**31 files / 520 tests**）                    |
| 门禁脚本 | `node --test` 七个 `.mjs`                                            | 0（**112 pass / 0 fail**）                       |
| 格式     | `prettier --check apps/**/*.ts tests/**/*.ts scripts/**/*.mjs`       | 0                                                |
| Lint     | `eslint . --ignore-pattern "Python/**"`                              | 0                                                |
| 仓库卫生 | `node scripts/check-repo-hygiene.mjs`                                | 0（339 files clean, 12 skipped, 13 allowlisted） |

首轮 `prettier --check` 报 `scripts/ops-daily-lib.test.mjs`，`--write` 后归零，再复跑 vitest 仍 520 pass。

## 6. 本地真实数据复核

用本地库（`postgresql://postgres@127.0.0.1:55432/qualification_media`）跑 `node scripts/ops-daily-report.mjs`：

```json
coverageGap = {"status":"ok","missingFromRegistry":[],"missingFromDatabase":[],"captureOnly":9}
patrol_registry_stale 动作 = []
```

**这个结果是「不触发」，而不是「改动无效」**。原因：`var/patrol/registry.json` 在 **2026-11-25 14:03:25** 被重新生成过（20182 B，61 keys，含 `source:fundamental-it:statistics-fe-suiihyo`）。同目录的 `patrol-report.json`（44525 B，14:03:25）、`cache.json`（19462 B）、`patrol-report.record.json`（41780 B，14:08:40）证明那次巡检真的跑了。

在那次巡检之前，本地 `missingFromRegistry` 是 `['source:fundamental-it:statistics-fe-suiihyo']`——因为旧 registry 是 2026-11-12 的，而 Sprint 2A 的 202610 迁移之后才新增这个来源。这正是本改动要覆盖的场景，但它已经被 14:03 那次巡检「自然修好」了，所以现在无法用真实数据复现。

**结论：验证只能靠构造数据的单元测试与变异，不能靠本地 registry 的当前状态。** 这一点必须如实写出来，否则读者会以为「本地实测没触发，说明改错了」。

## 7. 未处理

1. **生产上的 `coverageGap` 仍是 `not_run`**。`/opt/jpqm/var/` 没有 `patrol` 目录，所以本改动在生产上还不会生效——它要等生产第一次跑 patrol 之后才有意义。这仍然是待 Owner 决策的两条路径（见 `docs/audit/COVERAGE_GAP_CAPTURE_ONLY_2026-11-25.md` §8）。
2. **`missingFromDatabase` 仍可能因 capture-only 之外的原因出现**，目前没有对应的动作。它意味着「巡检清单里有、数据库里没有」，可能是入库失败，也可能是新来源还没导入。判据不足，本轮不臆造动作。
3. **`ops-daily-cron.sh` 的 `action_lines()` 只取 `## 今日需处理` 段的 `^- ` 行**，所以新动作会随飞书通知一起发出去。这是想要的效果，但意味着清单过期时会有消息——如果 Owner 希望它完全静默，需要改 wrapper 而不是 lib。

## 8. 风险

| 风险                                                      | 影响                                            | 缓解                                                                                                  |
| --------------------------------------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 有人把 `patrol_registry_stale` 也设成 critical            | 每天 page 一次直到有人跑 patrol，训练人忽略通道 | 代码注释写明「not a critical one … would only teach people to ignore the channel」                    |
| registry 长期过期但没人跑 patrol                          | 动作每天出现，变成新的恒定噪声                  | 这是**有意的**：噪声的内容是「去跑一次巡检」，跑完就消失；capture-only 那种跑完也不消失的噪声才是问题 |
| 生产首次跑 patrol 后 `missingFromRegistry` 因数据差异非空 | 日检立刻出现一条动作                            | 这是正确行为——那说明清单与库确实不一致                                                                |

## 9. 下一步建议

1. **P1（需 Owner 决策）**：生产跑一次 patrol，让 `coverageGap` 从 `not_run` 变成真值。两条路径见 `docs/audit/COVERAGE_GAP_CAPTURE_ONLY_2026-11-25.md` §8。
2. **P2**：`missingFromDatabase` 的动作化——等有明确的判据（入库失败 vs 未导入）再做。
3. **P3**：`ops-daily-cron.sh` 的 `action_lines()` 目前用贪婪 `sed` 提取 `status`，与 3L 那个坑同族；建议换成 `grep -o '"status": *"[a-z_]*"' | head -n 1`。
4. **P3**：compose 加 `logging.options.max-size`/`max-file`，关键日志行落宿主机（见 `docs/audit/PASS_RATE_FAILURE_OBSERVATION_2026-11-25.md` §5.3）。
5. **P4**：`?sort=` 在 `/shikaku/:slug/pass-rate/` 章节页的语义未验证；admin 的 `HEAD` 返回 404（`apps/admin/src/server.ts` 只处理 `GET`/`POST`）。

## 10. 停止声明

本轮只做了巡检清单过期检查这一件事：三处 `ops-daily-lib.mjs` 改动 + 五条用例 + 六个变异。没有改生产、没有跑 patrol、没有改数据、没有动 `hasCritical` 的语义、没有碰 capture-only 的既有判定。

按 Sprint 纪律在此停止，不进入其它待办项。
