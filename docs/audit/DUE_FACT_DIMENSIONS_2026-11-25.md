# DUE_FACT_DIMENSIONS — 到期事实动作的粒度修复

日期：2026-11-25
范围：`scripts/staleness-lib.mjs`、`scripts/ops-daily-lib.mjs` 及两者测试
起因：`docs/audit/DEPLOY_3A_3M_REPORT_2026-11-25.md` §10.2 / §15 P3

## 0. Git 基线

| 项              | 值                            |
| --------------- | ----------------------------- |
| 分支            | `chore/phase1-baseline`       |
| 执行前 HEAD     | `bf37922`                     |
| 本轮内容 commit | `35168b1`                     |
| 生产运行版本    | `cac5a7e`（本轮改动尚未部署） |

报告无法在自己那个 commit 里引用自己的 hash，所以内容 commit 先落，再由一个
`docs: 落账…` 收口 commit 把上面的 `<CONTENT_SHA>` 换成真实值 —— 现在表里填的
就是收口 commit 回填后的结果。

---

## 1. 现象

生产环境 2026-11-25 的 `ops:daily` 报告里，「今日需处理」12 条动作中有 8 条是重复文本：

```
- **due_fact** `bookkeeping/2026/fee`：已 327 天未复核（窗口 90 天）
- **due_fact** `bookkeeping/2026/fee`：已 327 天未复核（窗口 90 天）
...（共 7 行）
- **due_fact** `bookkeeping/2026/payment_deadline_rule`：已 327 天未复核（窗口 90 天）
...（共 3 行）
```

12 条动作里 distinct target 只有 4 个。复核人看到 7 行一模一样的话，无法判断这是
「同一条事实被重复计了 7 次」还是「7 条不同的费用事实都要复核」——实际上后者才是真的。

## 2. 根因

`scripts/ops-daily-lib.mjs` 构造 `due_fact` 动作时，target 只用了三个字段：

```js
target: `${fact.qualification}/${fact.examYear}/${fact.factKey}`;
```

但这三个字段不足以定位一条事实。数据库里事实的身份由
`packages/db/migrations/0017_exam_session_dimension.sql` 的唯一索引定义：

```sql
CREATE UNIQUE INDEX facts_current_key_idx ON facts
  (qualification_id, provider_id, exam_level_id, exam_component, delivery_mode,
   payment_method, exam_session, exam_year, fact_key);
```

**九列**。日商簿記 2026 的 7 条 fee 事实，正是 `exam_level_id`（`bookkeeping:1` /
`:2` / `:3`）× `delivery_mode`（`unified` / `network`）的不同组合 —— 它们在
`qualification/examYear/factKey` 这三个字段上完全一样。

同时 `scripts/staleness-lib.mjs` 的 `STALENESS_QUERY` 也没有查这六列，
`computeStaleness()` 往 `dueFacts` 里 push 的对象同样没有维度字段，
所以修法不是改一行 target 模板，而要贯穿查询、聚合、渲染三层。

## 3. 为什么选「带维度」而不是「同 target 聚合」

两个候选方案：

- **A：按 target 聚合**，同 target 合并成一行「N 条事实」，列出各自的 `displayValue`。
- **B：target 带上维度**，让每一条事实有唯一可读的标识。

选了 B，理由是 A 解决不了复核人的核心问题：知道「这里有 7 条费用要复核」不等于
知道「是哪 7 个价格」。日商簿記的费用按等级和出题方式不同，7,500 円与 2,200 円是
两条完全不同的事实，复核时要去核对的原始来源也不同。聚合只是把 7 行噪音压成 1 行
噪音，信息量没有增加。

B 的额外好处是 target 与数据库唯一键语义对齐：一条 target 精确对应一条事实。

B 的代价是 target 变长：

```
bookkeeping/2026/fee (examLevel=bookkeeping:2, delivery=network)
```

## 4. 改动

### 4.1 `scripts/staleness-lib.mjs`

1. **`STALENESS_QUERY` 补 6 列**（`f.fact_key` 之后）：

   ```sql
   f.provider_id,
   f.exam_level_id,
   f.exam_component,
   f.delivery_mode,
   f.payment_method,
   f.exam_session,
   ```

2. **新增 `factDimensionFields`**：字段名、数据库列名、显示标签的单一来源，
   顺序即输出顺序（`provider` → `examLevel` → `component` → `delivery` →
   `payment` → `session`）。

3. **新增 `factDimensions(row)`**：从一行查询结果里挑出非空维度。
   `null` 与空串都丢弃 —— 空串会渲染成 `component=` 这种什么都没说的标签。

4. **新增 `formatFactTarget(fact)`**：把 `qualification/examYear/factKey`
   与维度拼成 target。**无维度时逐字节返回原来的格式**，所以没有维度的事实
   （绝大多数）输出与改动前完全一致。

5. **`dueFacts.push` 带上 `dimensions`**。

6. **排序加 `factId` 兜底**：

   ```js
   dueFacts.sort(
     (a, b) =>
       b.ageDays / b.windowDays - a.ageDays / a.windowDays ||
       a.factId.localeCompare(b.factId),
   );
   ```

   SQL 的 `ORDER BY` 停在 `fact_key`，有了维度之后不再唯一；不加兜底，
   同一份数据两次跑可能给出不同顺序，报告 diff 会出现假变更。

### 4.2 `scripts/ops-daily-lib.mjs`

- import 增加 `formatFactTarget`。
- `todayActions` 的 `due_fact`：`target: formatFactTarget(fact)`。
- `renderMarkdown` 的「到期事实（前 20）」行：同样改用 `formatFactTarget(fact)`。

两处都改，是因为「今日需处理」和「到期事实」是两个独立渲染路径，
只改一处会留下一条仍然重复的清单。

## 5. 测试

### 5.1 新增用例

`scripts/staleness-lib.test.mjs`（+5）：

| 用例                                                                            | 守的是什么                                       |
| ------------------------------------------------------------------------------- | ------------------------------------------------ |
| `fact dimensions drop nulls and keep only set axes`                             | `null` 与空串都不产出维度                        |
| `fact target names the dimensions that distinguish two identical-looking facts` | 无维度时逐字节等于旧格式；带维度时按固定顺序输出 |
| `fee facts that differ only in dimensions get distinct targets`                 | 3 等级 × 2 方式 = 6 条 → 6 个不同 target         |
| `due facts with the same overdue ratio keep a stable order`                     | 超期比相同时按 `factId` 稳定排序                 |
| `the staleness query selects every dimension the target format prints`          | 见 §5.2                                          |

`scripts/ops-daily-lib.test.mjs`（+1）：

| 用例                                                                  | 守的是什么                                                             |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `due facts that differ only in dimensions render as distinct actions` | 6 条同 key 不同维度的事实 → 6 个不同 action target + 6 行不同 markdown |

### 5.2 一个真实缺口：SQL 没有任何执行期测试

变异测试第一轮 8 个变异抓住 7 个，漏的是：

```
MISSED sql: stop selecting the dimension columns
```

原因：所有单元测试都是**直接构造 rows 喂给 `computeStaleness()`**，
从不执行 `STALENESS_QUERY`。把 SELECT 里的六列删掉，运行期不会有任何用例失败 ——
只是每行都少了那个键，`factDimensions()` 静默返回 `{}`，报告退回到重复的老样子。

这类「纯 SQL 改动」无法被「喂数据」的测试守住。仓库里也没有连库跑查询的测试
（`pnpm test` 只跑 `tests/`，`scripts/*.test.mjs` 全部是纯函数测试）。

可用且唯一轻量的守卫是**断言查询文本包含所需列**：

```js
test('the staleness query selects every dimension the target format prints', () => {
  for (const { column } of factDimensionFields) {
    assert.match(
      STALENESS_QUERY,
      new RegExp(`\\bf\\.${column}\\b`),
      `STALENESS_QUERY must select f.${column} or the report cannot name it`,
    );
  }
  assert.match(STALENESS_QUERY, /\bf\.exam_year\b/);
  assert.match(STALENESS_QUERY, /\bf\.fact_key\b/);
});
```

它测的是「查询和格式化的字段集一致」这个不变量，而不是 SQL 的执行结果。
这是权衡后的次优解，已记入 §7 未处理问题。

### 5.3 变异测试

`var/mutate-duefact.mjs`，8 个变异，每个都确认写盘后字节真的变了、
跑完确认还原：

| 变异                            | 结果               |
| ------------------------------- | ------------------ |
| target 完全忽略维度             | CAUGHT             |
| 维度保留空串                    | CAUGHT             |
| 维度按对象键顺序输出            | CAUGHT             |
| `computeStaleness` 不再携带维度 | CAUGHT             |
| 排序去掉 `factId` 兜底          | CAUGHT             |
| **SQL 不再 select 维度列**      | CAUGHT（补守卫后） |
| markdown 退回裸 key             | CAUGHT             |
| action target 退回裸 key        | CAUGHT             |

最终 `PROBLEMS=0`，EXIT 0。

### 5.4 完整矩阵

| 检查                                                                        | 结果                   |
| --------------------------------------------------------------------------- | ---------------------- |
| `node --test scripts/staleness-lib.test.mjs scripts/ops-daily-lib.test.mjs` | 35 pass                |
| `pnpm test:verify-gate`                                                     | 57 pass 0 fail         |
| `pnpm typecheck`                                                            | 0                      |
| `pnpm test`                                                                 | 28 files 458 tests     |
| `pnpm build`                                                                | 0                      |
| `pnpm format:check`                                                         | 0                      |
| `eslint . --ignore-pattern "Python/**"`                                     | 0                      |
| `pnpm test:python`                                                          | 239 passed             |
| `pnpm verify:all`                                                           | EXIT 0，`"errors": []` |
| `pnpm smoke:docker`                                                         | 见 §5.5                |

### 5.5 冒烟

`pnpm smoke:docker` → `SMOKE_EXIT=0`，11 项检查全过：

```
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

注意 `pnpm smoke:docker` 输出开头那行 `node : ... NativeCommandError` 是
PowerShell 对 stderr 的包装噪声（`$ node scripts/docker-smoke.mjs` 这行提示走了
stderr），不代表失败 —— 以退出码和最后的 `docker smoke passed` 为准。

## 6. 兼容性

- **`data:staleness` CLI 输出**（`scripts/check-staleness.mjs` 把 `dueFacts`
  原样 JSON 输出）多了一个 `dimensions` 键。这是**新增键**，没有删除或重命名
  任何已有字段，读取方按名取字段不受影响。
- **`ops:daily` 报告**的 target 文本对有维度的事实在变长。JSON 里 `target`
  是字符串，没有下游按格式解析它；markdown 是给人看的。
- **无维度的事实输出逐字节不变**，有测试守着。

## 7. 未处理

1. **SQL 仍无执行期测试**。本轮只加了文本断言。真正的守卫需要一条连库的集成
   测试（跑一次 `STALENESS_QUERY`，断言返回行里带六列），而这需要 CI 里有库 ——
   `release-gate.yml` 的 `release-gate` job 确实起了一个 postgres service，
   但目前没有跑这类脚本测试。
2. **`exam_session` 维度尚未在真实数据里出现**。2026 年统一试验有 173 回 / 172 回
   两场，一旦入库，`session=` 会自动出现在 target 里，无需再改代码。但这意味着
   target 的长度上限还没有实测过。
3. **`status: 'ok'` 与 `hasCritical: true` 并存**（部署报告 §10.1）未动，
   属于同一份报告里的另一个语义问题。
4. **生产尚未部署本次改动**。VPS 跑的是 `cac5a7e`，本次改动在其之后。

## 8. 下一步建议

- **P1**：把 `chore/phase1-baseline` 落到 `main`（需 Owner 授权 merge），
  否则生产永远是手工 FF 的游离状态。
- **P2**：部署本次改动后跑一次 `pnpm ops:daily`，确认「今日需处理」从 12 条
  变成 5 条（4 个 distinct target + 2 条 source_critical），并核对 target 文本。
- **P3**：给 `release-gate.yml` 加一条连库的 `STALENESS_QUERY` 测试，补上 §7.1 的缺口。
- **P4**：处理部署报告 §10.1 的 `status` 语义问题。

## 9. 停止声明

本次改动只涉及 `due_fact` 动作的粒度，未触碰查询条件、窗口天数、数据本身、
报告的其他部分，也未进入任何新的 Sprint 范围。
