# Sprint 3I 执行报告 — `var/` 留存物清理

日期：2026-11-25
执行工具：DeepSeek Harness
任务文档：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3I_TASK.md`

## 1. 执行摘要

Sprint 3H 报告 §9 的 P2 写的是「一个 `find var -mtime +90 -delete` 的小脚本」。**这条建议本身是错的**，本轮没有照做。

开工前实测 `var/` 的构成，发现 `var/ops-reports`（本轮唯一想清理的对象）只占 0.16 MB / 7 个文件，而 `var/pg-run`（本地 postgres 数据目录）占 104.7 MB / 1645 个文件，另有 `pglite-run`、`chrome-shot-profile`、`qa`、`audit-2026-11-24`、`official-snapshots` 等证据目录。那条 `find` 第一次运行就会把本地数据库和全部证据一起静默删除。

本轮改为**白名单**实现：`scripts/prune-var.sh` 只认死三个目标，各自用符合其增长方式的策略。

| 目标                                   | 增长方式             | 策略                  | 默认   |
| -------------------------------------- | -------------------- | --------------------- | ------ |
| `var/ops-reports/YYYY-MM-DD.{json,md}` | 每天 2 个新文件      | 按 mtime 删超过保留期 | 90 天  |
| `var/notifications/feishu.log`         | 单文件，每次投递一行 | 超 N 行时截断保留尾部 | 500 行 |
| `var/test-*/`                          | 测试崩溃时的残留     | 按 mtime 删超过保留期 | 7 天   |

产出：

- `scripts/prune-var.sh`（新增，约 175 行 POSIX sh）
- `tests/prune-var.test.ts`（新增，18 用例）
- `docs/runbook.md`（+40，新增「`var/` 留存物清理」小节，含那张 `var/` 构成表）
- `docs/audit/DEEPSEEK_HARNESS_SPRINT_3I_TASK.md`（新增，任务文档）

## 2. Git 状态与基线

开工时 HEAD = `942bbec`（`docs: 落账 Sprint 3H 执行报告`），工作树干净，分支 `chore/phase1-baseline`。

本轮内容 commit：**`<CONTENT_SHA>`**

按既有的两段式落账惯例（见 `docs/audit/SPRINT_3A_REPORT_2026-11-24.md` §2），报告里引用自身 commit hash 存在天然循环依赖，因此拆成「内容 commit + `docs: 落账…` 收口 commit」两个；本行在收口 commit 中回填。

## 3. 修改文件

| 文件                                            | 类型 | 变更     |
| ----------------------------------------------- | ---- | -------- |
| `scripts/prune-var.sh`                          | 新增 | 175 行   |
| `tests/prune-var.test.ts`                       | 新增 | 18 用例  |
| `docs/runbook.md`                               | 修改 | +40      |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3I_TASK.md` | 新增 | 任务文档 |

未改动：`scripts/ops-daily-report.mjs`、`scripts/ops-daily-cron.sh`、`deploy/docker-compose.prod.yml`、任何运行时源码。

## 4. 为什么是白名单

### 4.1 实测的 `var/` 构成

```text
var/pg-run               1645 files   104.7 MB   本地 postgres 数据目录
var/pglite-run           1529 files    63.9 MB   pglite 运行目录
var/chrome-shot-profile   206 files    15.9 MB   Chrome 用户配置
var/qa                    459 files    14.9 MB   QA 证据
var/audit-2026-11-24      149 files    13.6 MB   审计证据
var/official-snapshots    180 files    11.7 MB   官方快照
var/ops-reports             7 files     0.16 MB  日检报告 ← 本轮目标
var/notifications           0 files     0        投递记录 ← 本轮目标
```

`find var -mtime +90 -delete` 会连带删除 `pg-run`（本地数据库）、`qa`、`audit-*`、`official-snapshots`。这些目录里很多文件的 mtime 都超过 90 天，而 `find -delete` 不做任何区分。

### 4.2 三道防线

1. **白名单路径**：脚本里写死三个子目录与三种文件名模式，没有任何遍历 `var/` 的代码路径。
2. **文件名模式**：报告文件只匹配 `????-??-??.json` / `????-??-??.md`。`cron.err` 与任何人手工放进 `var/ops-reports/` 的文件都不匹配。
3. **默认 dry-run**：不带 `--apply` 只打印计划，cron 行里显式带 `--apply`。

另外，`test-*` 目录删除前有三重校验：路径必须在 `var/` 之下、必须是目录不是符号链接、`basename` 必须以 `test-` 开头。三条都过才 `rm -rf`。

## 5. 三种策略的取舍

### 5.1 报告文件按 mtime 删

每个文件独立、每天新增两个，按龄删除最自然。`find "$file" -maxdepth 0 -mtime "+$REPORT_DAYS"` 单文件判龄，不递归。

### 5.2 投递记录按行数截断，不按 mtime 删

**这是本轮最容易做错的一处。** `var/notifications/feishu.log` 的 mtime 是**最后一次投递的时间**，不是内容的年龄：

- 一个健康通道每天都在投递 → mtime 总是新的 → 按龄删永远删不掉（无害，但没达到目的）。
- 一个长期安静的通道 → mtime 很旧 → 按龄删会把**唯一的投递历史**整个删掉。

而这份历史正是 Sprint 3G 的 Task B 判断「告警到底有没有发出去」的唯一证据。删了它，`ops:daily` 的通知渠道判定就退化成 `not_run`，而 `not_run` 和 `healthy` 在报告里看起来都不像故障。

所以改成按行数：超过 500 行时 `tail -n 500` 保留最近的。写入方式是先写 `$NOTIFY_LOG.prune.$$` 再 `mv`——通知脚本会并发追加，半写状态的日志比过期的日志更糟。

### 5.3 `test-*` 按龄删

这些目录只在测试崩溃、`afterEach` 没来得及清理时出现。正常跑完的测试不会留下它们，所以 7 天的窗口足够宽松。

## 6. 实测输出

### 6.1 对真实 `var/` 的 dry-run

```text
$ sh scripts/prune-var.sh
prune-var: nothing to do (dry-run)
```

当前 `var/ops-reports/` 里三个报告日期（`2026-11-11`、`2026-11-14`、`2026-11-25`）都在 90 天内，`var/notifications/` 尚未创建，没有 `test-*` 残留。**脚本在真实目录上什么也没做**——这是正确行为，不是没生效。

### 6.2 对构造目录的 dry-run 与 apply

在 `var/test-prune-demo/root` 下造了：一个 200 天前的报告、一个昨天的报告、一个 200 天前的 `cron.err`、一个 12 行的投递记录、一个 200 天前的 `test-leftover/`、一个 200 天前的 `pg-run/`。

```text
--- dry-run ---
would remove var/test-prune-demo/root/ops-reports/2026-06-01.json
would truncate var/test-prune-demo/root/notifications/feishu.log (12 -> 5 lines)
would remove var/test-prune-demo/root/test-leftover
prune-var: 2 to remove, 1 to truncate (dry-run)
--- apply ---
removed var/test-prune-demo/root/ops-reports/2026-06-01.json
truncated var/test-prune-demo/root/notifications/feishu.log (12 -> 5 lines)
removed var/test-prune-demo/root/test-leftover
prune-var: 2 to remove, 1 to truncate (apply)
--- survivors ---
ops-reports: 2026-11-24.json cron.err
root:        notifications ops-reports pg-run
feishu.log lines: 5
last line: {"n":11}
```

逐条对照预期：

| 对象                         | 预期     | 实测                           |
| ---------------------------- | -------- | ------------------------------ |
| 200 天前的 `2026-06-01.json` | 删除     | 已删                           |
| 昨天的 `2026-11-24.json`     | 保留     | 保留                           |
| 200 天前的 `cron.err`        | 保留     | 保留（文件名不匹配日期模式）   |
| 12 行投递记录，上限 5        | 截断到 5 | 截断到 5，尾部 `{"n":11}` 保留 |
| 200 天前的 `test-leftover/`  | 删除     | 已删                           |
| 200 天前的 `pg-run/`         | **保留** | 保留（不在白名单内）           |

`pg-run` 那一行是本轮的重点：同样 200 天没动过，同样在 `var/` 下，但脚本不认识它，所以不碰。

## 7. 完整测试结果

| 检查         | 命令                                              | 结果                                |
| ------------ | ------------------------------------------------- | ----------------------------------- |
| shell 语法   | `sh -n scripts/prune-var.sh`                      | `SYNTAX_OK`                         |
| 新增用例     | `pnpm exec vitest run tests/prune-var.test.ts`    | **18 passed**                       |
| typecheck    | `pnpm typecheck`                                  | EXIT 0                              |
| 全量 vitest  | `pnpm test`                                       | **26 files 345 tests 全过**         |
| verify-gate  | `pnpm test:verify-gate`                           | **51 pass / 0 fail**                |
| build        | `pnpm build`                                      | EXIT 0                              |
| format:check | `pnpm format:check`                               | EXIT 0                              |
| eslint       | `pnpm exec eslint . --ignore-pattern "Python/**"` | EXIT 0                              |
| python 测试  | `pnpm test:python`                                | **239 passed**                      |
| 端到端       | `pnpm verify:all`（带 `DATABASE_URL`）            | EXIT 0，6 资格全过，`errors: []`    |
| 生产镜像冒烟 | `pnpm smoke:docker`                               | **11 项 ok**，`docker smoke passed` |

用例覆盖（18 条）：

- 报告文件：超期删除、未超期保留、默认 dry-run 不删、手放文件（`cron.err`/`notes.md`/`keep-me.json`）不动、自定义保留期生效。
- 投递记录：按行截断且保留尾部、未超限不动、dry-run 不截断、**mtime 很旧但行数很少时保留**。
- `test-*`：超期删除、未超期保留、非 `test-` 前缀的目录（`qa`）不动、符号链接不跟随。
- 安全性：`var/` 不存在 exit 0、`var/` 是文件时拒绝并报错、未知参数 exit 2、白名单外的四条旁观文件（`pg-run`/`official-snapshots`/`patrol`/`audit-*`）全部存活、汇总行区分 dry-run 与 apply。

### 7.1 开发过程中修掉的一个 bug

首轮 18 个用例里 1 个失败：

```text
× refuses to touch a var/ that is a file
  → expected '' to contain 'not a plain directory'
```

原因是脚本开头的守卫写成了 `if [ ! -d "$VAR_DIR" ]`——`var/` 是个**文件**时 `-d` 也为假，于是被当成「不存在」静默 exit 0，把「配置错了」伪装成「没什么可做」。改成 `[ ! -e ]` 判存在性、`[ ! -d ]` 判目录性之后通过。这个 bug 正好是本项目反复强调的那类错误（缺失与为空不可区分），被测试抓住了。

## 8. 未处理问题

1. **crontab 未安装。** 本轮没有自动装 cron（任务文档 §7 明确禁止）。装法写在 runbook 里，由 Owner 执行。
2. **生产 `var/` 的实际构成未实测。** 本报告 §4.1 的数字来自开发机。VPS 上 `var/` 可能有 `deploy/caddy-logs` 之类不同的目录——白名单实现保证这不会造成损坏，但「该清理的有没有清到」需要在生产上跑一次 dry-run 才知道。
3. **`var/patrol/cache.json` 无轮转。** 该文件 16981 字节，增长慢，本轮不在目标内。
4. **`cron.err` 每次覆盖。** 3H 报告已记过，本轮未改（它保存最近一次失败，覆盖是设计而非缺陷）。
5. **投递记录没有按时间戳去重。** 同一秒内的重复投递会各占一行；行数上限对此不敏感。

## 9. 风险

| 风险                         | 影响                           | 缓解                                                      |
| ---------------------------- | ------------------------------ | --------------------------------------------------------- |
| 白名单漏掉了某个该清理的目录 | 该目录继续增长                 | 明确列出未处理项，下次按实测扩充                          |
| 90 天保留期对某人太短        | 想看更早的报告时已被删         | 默认 dry-run；cron 行可写 `OPS_REPORT_RETENTION_DAYS=365` |
| `mv` 截断与并发追加竞争      | 极短时间内可能丢掉刚写入的一行 | 只保留尾部，丢的是最新一行的概率极低；比半写文件好得多    |
| 在 `var/` 是符号链接时误操作 | 可能清理到 `var/` 之外         | 脚本对 `VAR_DIR` 本身做 `-L` 检查，符号链接直接拒绝       |

## 10. 下一步建议

**P1（阻塞中，需 Owner）：把 Sprint 3A–3I 送上生产。** 目前 VPS 是 `main@01b86dd`，3A–3I 的代码全部只在 `chore/phase1-baseline` 分支上。SSH 凭据不在本机（`~/.ssh` 只有 `known_hosts`），本轮无法代为操作。上线属正式发布，需单独授权。

**P2：在生产上跑一次 `sh scripts/prune-var.sh` 的 dry-run**，用真实 `var/` 构成校验白名单是否够用，再决定是否装 cron。

**P3：`/pass-rate/` 单资格故障观测**（3A Task C 的方案 A 保留决定附带了切换条件：生产观测到 503 中过半由单资格故障引起时，才考虑改成部分成功 200）。

**P4：G-15 —— `apps/web/src/server.ts` 的 19 条路由没有进程级测试。** 目前这些路由只有 sitemap 相关的 4 个用例，其余靠 `verify:all` 的端到端覆盖。这是 3A–3C 三轮改动最集中的文件，风险最高。

**P5：`/ready` 的外部可观测性。** 探针目前只在人手动调用时说话；接进 `ops:daily` 或独立 cron 需要先决定「readiness 失败算不算 critical」——它和日检的来源故障不是同一类问题。

## 11. 停止声明

本轮到此停止。

未执行、且不在本轮授权范围内的事项：安装 crontab、push、部署到生产、修改 `deploy/docker-compose.prod.yml`、修改任何运行时源码、进入 Sprint 3J 或后续轮次。

下一轮做什么，由 Owner 根据本报告决定。
