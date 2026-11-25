# 连库查询形状断言（QUERY_SHAPE_GUARD）— 2026-11-25

## 0. Git 基线

| 项              | 值                                                          |
| --------------- | ----------------------------------------------------------- |
| 分支            | `chore/phase1-baseline`                                     |
| 执行前 HEAD     | `2c783df`（`docs: 落账 Caddyfile 博客 vhost 的完成状态`）   |
| 本轮内容 commit | `<CONTENT_SHA>`                                             |
| 生产运行版本    | `9d793c9`（本次改动尚未部署，属脚本门禁，无运行时行为变化） |

本轮沿用两段式提交：第一段提交内容，第二段把上面这行的 `<CONTENT_SHA>` 换成真实
hash 并落账。理由与 `DEPLOY_3A_3M_REPORT_2026-11-25.md` §0 相同 —— 报告里写的 hash
必须能在提交历史里查到，而不能是先写一个占位再指望事后补。

## 1. 执行摘要

把「连库查询必须返回它声称会返回的列」这条断言，从 `verify-staleness-query.mjs`
一个脚本推广到三个会读库的脚本，并抽成共享模块 `scripts/query-shape-lib.mjs`。

一句话说明为什么值得做：**Postgres 不会因为 SELECT 少写了一列而报错**。调用方拿到
的行里那个属性就是 `undefined`，下游会把它读成「这条事实没有维度」或「这条事实没有
溯源信息」—— 前者让 `due_fact` 的 target 退回到有歧义的三段式（正是
`DUE_FACT_DIMENSIONS` 修掉的 bug），后者把一次查询缺陷伪装成一条数据质量问题。
两种都是静默的，日志里没有任何异常。

本次改动不碰运行时、不碰数据库、不碰部署，只改三个运维脚本与它们的测试。

## 2. 三个调用方各自需要什么

| 脚本                                 | 谁在用                              | 本轮新增的断言                                                      |
| ------------------------------------ | ----------------------------------- | ------------------------------------------------------------------- |
| `scripts/verify-staleness-query.mjs` | `release:check` 末尾（CI 有库）     | 改为复用共享模块，输出契约不变                                      |
| `scripts/check-staleness.mjs`        | `data:staleness`、runbook、人工排查 | 6 个维度列必须返回且每行都有 key；`due_fact` 的 target 必须互不相同 |
| `scripts/audit-mvp.mjs`              | `audit:mvp`、发布前判级             | 20 个列（11 个溯源 + 9 个维度与身份）必须返回且每行都有 key         |

`audit-mvp.mjs` 那 20 列是从两个读者反推的：`auditProvenanceRow()` 读溯源半区，
`facts.map()` 读维度半区。少任何一列，前者报「缺快照/缺哈希」、后者让覆盖判定拿到
`undefined` 维度 —— 都是把查询缺陷说成数据问题。

## 3. 共享模块

`scripts/query-shape-lib.mjs`，四个导出：

- `missingColumns(fields, columns)` —— `pg` 的 `result.fields` 里没有的列，顺序跟随
  `columns` 而不是字母序，这样报错信息与查询里列的顺序一致，粘贴进 issue 时能对上。
- `countRowsMissingKeys(rows, columns)` —— **用 `in` 判断，不用真值判断**。LEFT JOIN
  合法地产出 `null`，`null` 是存在的；只有 key 不存在才说明 SELECT 漏了列。这条是
  整个模块最容易被写错的地方，所以单独有测试。
- `shapeProblems(queryName, result, columns, keyNoun = 'column')` —— 把前两者拼成可读
  的字符串数组。`keyNoun` 让每个调用方保留自己的措辞（staleness 说「dimension key」，
  MVP 审计说「provenance column」），不必为了共用而统一术语。
- `duplicatedTargets(targets)` —— 全 distinct 返回 `null`，否则 `{extra, repeated}`。
  比较的是**渲染后的 target** 而不是行身份，因为重复只在格式化之后才可见。

## 4. 三个脚本的接入方式

### 4.1 `check-staleness.mjs`

`COMMIT` 之后、`computeStaleness` 之前插形状断言；`computeStaleness` 之后查 target
唯一性。发现问题时**只设 `process.exitCode = 1`，不额外打印一份 JSON** —— stdout 上
永远只有一份文档，`| jq` 的调用方不会看到两个 payload；退出码是给机器的信号，`problems`
字段是给人的说明。

### 4.2 `audit-mvp.mjs`

`COMMIT` 之后立刻查 20 列。形状不对就打印 `{status:'error', reason, problems}` 并
`process.exitCode = 2`，**跳过覆盖判定与溯源判定**。跳过是刻意的：形状已经不可信，
继续算出来的 `blocked` 或 `passed` 都是在猜。

### 4.3 `verify-staleness-query.mjs`

原来手写的三段断言换成一次 `shapeProblems()` + 一次 `duplicatedTargets()`，文件从
110 行降到 92 行，输出契约（`status` / `rows` / `dueFacts` / `distinctTargets` /
`dimensionColumns` / `sampleTargets` / `problems`）与退出码完全不变。

## 5. 测试

### 5.1 单元测试

新增 `scripts/query-shape-lib.test.mjs`，16 条，已接进 `test:verify-gate`
（75 条，此前 59 条）。

首跑失败一条，是**我的测试写错**而不是库错：`shapeProblems lets each caller name its
own kind of key` 里我构造的 `{fields:['a'], rows:[{a:1}]}` 对 `['a','b']` 同时缺列与缺
key，而断言只写了缺列那条。改成两个各自只触发一种问题的用例。

### 5.2 变异测试（`var/mutate-query-shape.mjs`）

10 个变异，全部抓住：

| 变异                                                  | 结果                  |
| ----------------------------------------------------- | --------------------- |
| `missingColumns` 恒返回空                             | CAUGHT                |
| `missingColumns` 把缺失的 `fields` 当作「什么都不缺」 | CAUGHT                |
| `missingColumns` 对结果排序                           | 首轮 MISSED → 见 §5.3 |
| `countRowsMissingKeys` 用真值判断代替 `in`            | CAUGHT                |
| `countRowsMissingKeys` 用 `map` 代替 `filter`         | CAUGHT                |
| `shapeProblems` 只报第一个问题                        | CAUGHT                |
| `shapeProblems` 忽略调用方给的 `keyNoun`              | CAUGHT                |
| `duplicatedTargets` 恒返回 `null`                     | CAUGHT                |
| `duplicatedTargets` 的 `extra` 填 distinct 数         | CAUGHT                |
| `duplicatedTargets` 的 `repeated` 不去重              | CAUGHT                |

### 5.3 首轮漏掉的那个变异，暴露了测试本身的弱点

`missingColumns: sort the names` 没被抓住。原因是我那条「保持请求顺序」的用例用了
`['exam_level_id', 'provider_id']` —— 这两个名字**本来就是字母序**，`.sort()` 之后输出
完全一样，所以测试和一个有 bug 的实现达成了一致。

改成 `['provider_id', 'exam_level_id']`（故意逆字母序）后抓住。这类「测试数据恰好让
变异无效」的情况，和 3J 那两个漏网变异是同一族：**断言值与被测实现碰巧一致**。

### 5.4 连库变异（`var/mutate-live-sql.mjs`）

单元测试喂的是普通对象，SQL 根本不执行，所以它证明不了「真删一列会不会被抓」。这
一组在本地库（`jpqm-pg18`，1007 facts）上真跑：

| 变异                                     | 目标脚本                     | 期望退出码 | 结果                 |
| ---------------------------------------- | ---------------------------- | ---------- | -------------------- |
| `STALENESS_QUERY` 删掉 `f.exam_level_id` | `verify-staleness-query.mjs` | 1          | CAUGHT（含形状信息） |
| `STALENESS_QUERY` 删掉 `f.exam_level_id` | `check-staleness.mjs`        | 1          | CAUGHT（含形状信息） |
| MVP 审计查询删掉 `src.canonical_url`     | `audit-mvp.mjs`              | 2          | CAUGHT（含形状信息） |

三个变异都确认了输出里带「does not return」或「lack a」的字样 —— 只看退出码不够，
因为退出码 1/2 也可能来自连接失败。

## 6. 全量矩阵

| 项                                                                                  | 结果                                                                   |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `tsc -p tsconfig.json --noEmit`                                                     | EXIT=0                                                                 |
| `pnpm test`（`vitest run tests --pool=threads --poolOptions.threads.singleThread`） | **29 文件 / 465 用例全过**                                             |
| `test:verify-gate`                                                                  | **75 pass / 0 fail**（此前 59）                                        |
| `tsc -p tsconfig.json`（build）                                                     | EXIT=0                                                                 |
| `format:check`                                                                      | EXIT=0                                                                 |
| `eslint . --ignore-pattern "Python/**"`                                             | EXIT=0                                                                 |
| `test:python`                                                                       | **239 passed**                                                         |
| `verify:all`                                                                        | EXIT=0，`"errors": []`                                                 |
| `data:staleness`（连本地库）                                                        | `status=ok`、`dueFacts=29`、`problems=0`                               |
| `db:verify-staleness`（连本地库）                                                   | `status=ok`、`rows=1007`、`distinctTargets=29`、`problems=[]`          |
| `audit:mvp`（连本地库）                                                             | `blocked`、22 个覆盖缺口、1007 facts、0 未验证 —— **与改动前逐项一致** |

最后一行是这次改动最重要的自证：形状断言上线后，正常数据上的结论没有变，变的只是
「查询漂移时会不会说出来」。

## 7. 两个我踩到的坑

### 7.1 裸跑 `vitest run` 会给出假的失败

我第一次跑矩阵用的是 `node node_modules/vitest/vitest.mjs run`（没有参数），得到
「10 files failed / 24 tests failed」，全是 `Test timed out in 5000ms` 或
`No test suite found in file scripts/*.test.mjs`。两个原因都不是回归：

1. 不带 `tests` 路径时 vitest 会把 `scripts/*.test.mjs`（node:test 的文件）也当
   vitest 测试收集，报 `No test suite found`；
2. 默认文件级并行下，四个依赖真实 shell 子进程的测试文件（`notify-feishu`、
   `prune-var`、`ops-daily-cron`、`readiness-cron`）同时抢 WSL 启动，5 秒超时不够。

项目脚本 `test` 已经带了 `tests --pool=threads --poolOptions.threads.singleThread`，
按它跑就是 465/465。加 `--no-file-parallelism` 也能让那四个文件单独跑绿（89/89）。
`docs/data-gate-semantics.md:131` 早就写了这条，是我没照做。

### 7.2 `Set-Content -Encoding utf8` 在 PowerShell 5.1 里会写 BOM

我用它改 `package.json`，`git diff` 第一行变成 `-{` / `+﻿{`。这和我此前记过的
「PowerShell 下 `node … > var/x.json` 写出 UTF-16LE 带 BOM」是同一族坑。修法：
用 `[System.IO.File]::WriteAllText(path, text, (New-Object System.Text.UTF8Encoding($false)))`。
提交前用 `git diff` 看一眼首行就能发现。

## 8. 未处理的问题

1. **`audit-mvp.mjs` 在本地库上是 `blocked`**（22 个覆盖缺口，如 `it-passport/exam_method`）。
   这是数据覆盖的现状，不是本次改动引入的，也不在本轮范围内 —— 本轮只保证「判级
   依据的查询形状是对的」。是否补数据是另一件事，需要单独决策。
2. **`query-shape-lib.mjs` 的断言是「列在不在」，不是「值对不对」**。一列在但类型错了
   （比如 `exam_year` 变成字符串）仍然不会被抓。要覆盖这一点需要类型断言，属于另一层。
3. **三个脚本的列清单是手写常量**，与 SQL 里的 SELECT 是两处维护。有人加列不会报错
   （多返回的列不影响），只有删列才会被抓。这是有意的取舍：加列不需要同步，删列必须。
4. 工作树里另有三份不属于本轮的未跟踪文件（`docs/audit/DSH_LATENCY_BASELINE_2026-11-25.{json,md}`、
   `scripts/dsh-latency-audit.mjs`），本轮不提交，去留待定。

## 9. 风险

| 风险                                               | 影响                         | 缓解                                                                        |
| -------------------------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| 形状断言误报，让 `data:staleness` 在健康库上退出 1 | 运维告警误报                 | 本地 1007 facts 实跑 `problems=0`；连库变异证明只在真删列时触发             |
| `audit-mvp.mjs` 的 20 列清单漏掉某个读者需要的列   | 该读者仍静默拿到 `undefined` | 清单是从 `auditProvenanceRow` 与 `facts.map()` 逐个反推的，并有连库变异兜底 |
| 有人把 `shapeProblems` 的结果吞掉不设退出码        | 门禁变成纯日志               | 变异「只报第一个问题」等已验证；三个调用方都有连库变异覆盖                  |

## 10. 下一步建议

1. **P1 — 把 `chore/phase1-baseline` 落到 `main`**（`origin/main` 仍是 `01b86dd`，
   落后 40+ commit）。需要 Owner 授权 merge。
2. **P2 — 生产跑一次 `patrol`**，消掉 ops 日报里长期存在的
   `coverageGap: {"status":"not_run","reason":"var/patrol/registry.json missing"}`。
3. **P3 — 决定 `audit-mvp` 那 22 个覆盖缺口的处置**：是补数据，还是把缺口写进
   `config/data-coverage-contract.json` 的豁免。
4. **P3 — 统一博客域名两层安全头**（`CADDYFILE_BLOG_VHOST_2026-11-25.md` §4.3）。
5. **P3 — 3K 报告 §11 的 P6**：`apps/web/src/render.ts` 的解引用与
   `isQualificationView` 之间的同步机制，属于架构改动。

## 11. 停止声明

本轮只做「连库查询形状断言」一件事：新增一个共享模块、把它接进三个读库脚本、补
16 条单元测试与两组变异验证，并在本地库上证明改动前后结论一致。

没有做：任何运行时改动、任何数据库写入、任何部署、任何数据补录、任何 schema 调整。
没有进入 `audit-mvp` 覆盖缺口的修复，没有动 `patrol`，没有动博客安全头，没有开始
3K 的 P6。

下一步由 Owner 按本报告 §10 决定。
