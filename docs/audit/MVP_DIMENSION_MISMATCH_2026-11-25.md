# 让 `audit:mvp` 区分「维度标签缺失」与「事实真缺」

## 0. Git 基线

| 项              | 值                                        |
| --------------- | ----------------------------------------- |
| 分支            | `chore/phase1-baseline`                   |
| 执行前 HEAD     | `2237827`                                 |
| 本轮内容 commit | `<CONTENT_SHA>`（第二段回填这一行）       |
| 生产运行版本    | `9d793c9`（本轮只改脚本，不影响线上渲染） |

两段式提交的理由：第一段提交正文时还不知道自己会被记成哪个 hash，第二段把占位符换成真实 hash，这样 `git log` 里永远能对上是哪一次提交写了这份报告。

## 1. 执行摘要

`docs/audit/MVP_COVERAGE_GAPS_2026-11-25.md` §6.5 提了一条建议：让 `audit:mvp` 自己说明每条缺口是「维度标签对不上」还是「事实真的不存在」。本轮把它做掉了。

改动只有三处，**没有改判据、没有改契约、没有动数据**：

| 文件                            | 改动                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| `scripts/mvp-coverage.mjs`      | 新增 `isUnlabelled()`；每条 gap 增加 `dimensionMismatch` 布尔字段   |
| `scripts/audit-mvp.mjs`         | `summary` 增加 `dimensionMismatchGaps` / `missingDataGaps` 两个计数 |
| `scripts/mvp-coverage.test.mjs` | 10 → 15 用例（新增 5 条，其中 3 条是反向用例）                      |

本地库实测：**22 条缺口 = 10 条标签缺失 + 12 条真缺**，与上一份报告的结论逐条一致。两个计数之和恒等于 `coverageGaps`。

## 2. 为什么不能简单地「忽略维度」

第一版实现是「同资格同年、完全忽略维度、只要 `matchesField` 命中就算标签问题」。跑出来是 **18 条标签缺失 / 4 条真缺**——比真实情况多算了 8 条。多出来的是：

- `bookkeeping` 的 6 条：`bookkeeping:1` 确实有 `fee`、`bookkeeping:3` 确实有 `result_date` 之类的事实，但那是**另一个级别**的事实。把 `bookkeeping:1` 的数据当成 `bookkeeping:3` 缺口的证据，等于说「三级没有，但一级有，所以三级只是没打标签」——这是错的。
- `fp` 的 2 条：`academic:basic` 与 `academic:applied` 各有题数，但它们是**两个独立组件**，不能顶替 `academic`。

所以判据必须是：**只有在请求的维度上「该字段是 null/undefined」才算标签缺失；值是另一个非空值（`bookkeeping:1` vs `bookkeeping:3`、`academic:basic` vs `academic`）一律算「真缺」。**

这就是 `isUnlabelled()`：

```js
function isUnlabelled(fact, dimensions) {
  return Object.entries(dimensions).every(
    ([key, value]) => fact[key] === value || fact[key] == null,
  );
}
```

对照 `matchesDimensions()`（`fact[key] === value` 严格相等），差别只在 `|| fact[key] == null` 这一支——**正是「没打标签」与「打了别的标签」的分界线**。

## 3. 输出变化

`audit-mvp` 的 `summary` 从：

```json
{ "approvedFacts": 1007, "coverageGaps": 22, "unverifiedFacts": 0 }
```

变成：

```json
{
  "approvedFacts": 1007,
  "coverageGaps": 22,
  "dimensionMismatchGaps": 10,
  "missingDataGaps": 12,
  "unverifiedFacts": 0
}
```

每条 gap 多一个布尔字段：

```json
{
  "qualificationSlug": "it-passport",
  "examYear": 2026,
  "dimensions": { "deliveryMode": "cbt" },
  "field": "fee",
  "dimensionMismatch": true,
  "reason": "missing approved fact"
}
```

`reason` **保持不变**——`scripts/verify-lib.test.mjs:311` 断言了 `missing approved provenance` 这个字符串，改名会破坏既有消费者。`status` 与退出码语义也完全没动：仍然是「有缺口就 `blocked` / exit 1」，本轮只是让缺口可分类，不是让缺口消失。

## 4. 实测结果

本地库 `postgresql://postgres@127.0.0.1:55432/qualification_media`，`examYear=2026`：

| 资格          | 标签缺失 | 真缺   | 合计   |
| ------------- | -------- | ------ | ------ |
| `it-passport` | 10       | 4      | 14     |
| `bookkeeping` | 0        | 6      | 6      |
| `fp`          | 0        | 2      | 2      |
| **合计**      | **10**   | **12** | **22** |

标签缺失的 10 条全部是 `it-passport`：

```text
exam_method, eligibility, fee, exam_subjects, exam_time,
question_count, question_format, passing_standard,
source_url, official_verified_at
```

真缺的 12 条：

```text
it-passport: application_rule, booking_window, venue_rule, scoring_method
bookkeeping: question_count(x2), result_date, exam_subjects, exam_time, passing_standard
fp: question_count, question_format
```

这与 `docs/audit/MVP_COVERAGE_GAPS_2026-11-25.md` §4 的反事实实验结果完全吻合（补 `cbt` 标签后剩 12 条，其中 `it-passport` 4 条）。**反事实实验是「假设性地改数据再看」，本轮是「不改数据、直接读事实」，两条路径得出了同一个数字。**

## 5. 测试

`scripts/mvp-coverage.test.mjs` 10 → 15 用例。新增 5 条：

| 用例                                                                            | 断言什么                                                                                                      |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `a gap whose fact exists with an unlabelled dimension is a labelling problem`   | `deliveryMode: null` 的 `fee` → `dimensionMismatch === true`；同一条数据下 `exam_method`（真不存在）→ `false` |
| `a fact belonging to a different dimension value is not a labelling problem`    | `bookkeeping:1` 的 `fee` 不能让任何 `bookkeeping` 缺口变成 `true`                                             |
| `a child component fact is not a labelling problem for its parent component`    | `fp academic:basic` 的 `question_count` 不能让 `academic` 缺口变成 `true`                                     |
| `a fact from another qualification or year never counts as a labelling problem` | 跨资格、跨年份**分别**验证（不是一次改两个）                                                                  |
| （既有 10 条全部保留）                                                          |                                                                                                               |

**第四条用例暴露了我自己的一个测试缺陷**：第一版写成「一条 `takken`/2026 的 fact + 一条 `bookkeeping`/2025 的 fact」，同时改了两个维度。变异「`sameScope` 跨年份」因此**漏抓**——因为跨资格那半已经把测试打挂了。拆成两个独立 case 后 6/6 全抓。

这和 `docs/audit/QUERY_SHAPE_GUARD_2026-11-25.md` 里那条教训同族：**一次只变一个变量的用例，才能定位到唯一的那行代码。**

## 6. 变异验证

`var/mutate-mvp-dimension.mjs`（临时脚本，gitignored）6 个变异，**6/6 全抓**，`RESTORED=true`：

| #   | 变异                                                           | 被哪条用例抓住        |
| --- | -------------------------------------------------------------- | --------------------- |
| 1   | `dimensionMismatch` 恒 `false`                                 | 标签缺失用例          |
| 2   | 只看维度不匹配、不看字段是否存在                               | 标签缺失用例          |
| 3   | `isUnlabelled` 接受任意非 null 值（`fact[key] !== undefined`） | 跨维度值 + 子组件两条 |
| 4   | `isUnlabelled` 恒 `true`（完全忽略维度）                       | 跨维度值 + 子组件两条 |
| 5   | `sameScope` 跨资格                                             | 跨资格用例            |
| 6   | `sameScope` 跨年份                                             | 跨年份用例（拆分后）  |

变异脚本每写一次盘都 `readFileSync` 读回确认变异真的落盘，避免「模式串没找到、测试没失败」被误读成「变异被覆盖」。

## 7. 全量矩阵

| 项                                               | 结果                                                        |
| ------------------------------------------------ | ----------------------------------------------------------- |
| `tsc -p tsconfig.json --noEmit`                  | 0                                                           |
| `vitest run tests`（30 files）                   | **506 passed**                                              |
| `node --test`（`test:verify-gate` 的 5 个文件）  | **85 pass / 0 fail**                                        |
| `node --test`（11 个 `.mjs`，含未进门禁的 6 个） | **88 pass / 0 fail**                                        |
| `prettier --check`                               | 0                                                           |
| `eslint .`                                       | 0                                                           |
| 本地库 `audit-mvp`                               | `dimensionMismatchGaps: 10`、`missingDataGaps: 12`、和 = 22 |

`test:verify-gate` 从 81 涨到 85。**注意它只跑 5 个文件**（`verify-lib`/`mvp-coverage`/`staleness-lib`/`ops-daily-lib`/`query-shape-lib`），而 `scripts/` 下另有 6 个测试文件（`readiness-cron`/`notify-feishu`/`prune-var`/`ops-daily-cron`/`provenance-audit-lib`/`caddyfile-blog-vhost`）**不在门禁里**。这是既有状态，本轮没动它，只在这里记一笔。

## 8. 未处理

1. **没有补任何标签**。`it-passport` 的 10 条 `delivery_mode` 仍是 `NULL`，本轮只是让它们**可被识别**，不是修掉它们。补标签涉及改 `candidate_facts` 的列，需 Owner 授权（见 `MVP_COVERAGE_GAPS_2026-11-25.md` §6.1）。
2. **没有改契约**。`fp academic` 该不该有独立题数仍是开放问题（§6.2）。
3. **`audit:mvp` 仍未接进 `release:check`**。它需要真实数据库，CI 的 `release-gate` 不跑它，所以这个新字段目前只在本地/手工运行时可见。
4. **`verify-lib.mjs` 的 `matchesField` 与 `mvp-coverage.mjs` 仍是两份独立实现**（前者 `official_verified_at` 不要求 `provenanceStatus === 'verified'`，后者要求）。本轮没碰，因为合并它们会改变发布门禁的判据。

## 9. 风险

| 风险                                                | 影响                                               | 缓解                                                                              |
| --------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| 有人把 `dimensionMismatch: true` 读成「数据没问题」 | 忽略掉「标签缺失」本身也是一种数据缺陷             | 字段名是 `dimensionMismatch`（维度不匹配），不是 `ok`；报告 §2 写明它是缺陷的一种 |
| `isUnlabelled` 的 `== null` 被改成 `!== undefined`  | 把「打了别的标签」误判成「没打标签」，缺口分类失真 | 变异 3 专门守这一行，跨维度值 + 子组件两条用例会挂                                |
| 新字段被接进退出码                                  | `status` 语义变化，可能让 `release:check` 突然变红 | `audit-mvp.mjs` 的 `status` 计算未改动，`dimensionMismatchGaps` 只进 `summary`    |

## 10. 下一步建议

1. **P2** — 由 Owner 决定是否补 `it-passport` 的 `delivery_mode` 标签（清 10 条，见 `MVP_COVERAGE_GAPS_2026-11-25.md` §6.1）。现在有了 `dimensionMismatch` 字段，补完标签后重新跑 `audit:mvp` 应该看到 `dimensionMismatchGaps` 归零而 `missingDataGaps` 仍是 12——这是一个干净的验收信号。
2. **P3** — `fp academic` 的题数口径（§6.2）。
3. **P3** — 生产 `coverageGap` 仍是 `not_run`（`var/patrol/registry.json` 不存在），两条路径取舍见 `COVERAGE_GAP_CAPTURE_ONLY_2026-11-25.md` §8，需 Owner 决策。
4. **P1** — `chore/phase1-baseline` 落到 `main`（`origin/main` 仍 `01b86dd`），需 Owner 授权 merge。

## 11. 停止声明

本轮只改了两个脚本 + 一个测试文件，没有改数据、契约、渲染代码，没有部署，没有进入任何后续 Sprint。上面 §10 的四条都需要 Owner 拍板后才执行。
