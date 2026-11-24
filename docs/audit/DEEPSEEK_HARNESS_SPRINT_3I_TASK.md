# DEEPSEEK HARNESS — SPRINT 3I 任务文档

## 0. 核心目标

让 `var/` 下的运营产物按保留期自动收敛，避免「每天新增两个文件、几年后没人知道哪些能删」。

来源：`docs/audit/SPRINT_3H_REPORT_2026-11-25.md` §9 P2。

## 1. 先说清楚上一轮建议里的一处危险

3H 报告 §9 P2 写的是「一个 `find var -mtime +90 -delete` 的小脚本」。**这条建议本身是错的，本轮不能照做。**

本机实测 `var/` 的构成：

| 目录                      | 文件数 | 大小     | 是什么                   |
| ------------------------- | ------ | -------- | ------------------------ |
| `var/pg-run`              | 1645   | 104.7 MB | 本地 postgres 的数据目录 |
| `var/pglite-run`          | 1529   | 63.9 MB  | pglite 运行目录          |
| `var/chrome-shot-profile` | 206    | 15.9 MB  | Chrome 用户配置          |
| `var/qa`                  | 459    | 14.9 MB  | QA 证据                  |
| `var/audit-2026-11-24`    | 149    | 13.6 MB  | 审计证据                 |
| `var/official-snapshots`  | 180    | 11.7 MB  | 官方快照                 |
| …                         |        |          |                          |
| `var/ops-reports`         | 7      | 0.16 MB  | **日检报告（本轮目标）** |
| `var/notifications`       | 0      | 0        | **投递记录（本轮目标）** |

`find var -mtime +90 -delete` 会在第一次运行时把本地数据库和全部证据目录一起删掉，而且**不会有任何提示**。

所以本轮的原则是**白名单**：脚本只认识几个明确的目录和明确的文件名模式，其余一概不碰。

## 2. 三个目标，三种不同的清理逻辑

| 目标                             | 增长方式               | 正确策略                     | 为什么不是另一种                                                                         |
| -------------------------------- | ---------------------- | ---------------------------- | ---------------------------------------------------------------------------------------- |
| `var/ops-reports/*.json`、`*.md` | 每天 2 个新文件        | 按 mtime 删超过 90 天的      | 每个文件独立，按龄删除最自然                                                             |
| `var/notifications/feishu.log`   | 单个文件，每次投递一行 | 超过 N 行时截断保留最后 N 行 | 按 mtime 删会把「唯一的投递历史」整个删掉；文件 mtime 是最后一次投递时间，不代表内容过期 |
| `var/test-*/`（测试残留）        | 测试崩溃时残留         | 按 mtime 删超过 7 天的目录   | 正常情况 afterEach 会删；残留说明那次跑崩了                                              |

**只删「日期命名的报告文件」**：模式限定 `????-??-??.json` / `????-??-??.md`。别人手工放进 `var/ops-reports/` 的任何文件（包括 `cron.err`）都不会被碰——`cron.err` 是最近一次失败的 stderr，它可能正是一个人排查问题的唯一线索。

## 3. 安全约束（硬性）

1. **白名单，不是黑名单。** 脚本里写死目标子目录与文件名模式，绝不出现「遍历 `var/` 全删」的写法。
2. **默认 dry-run。** 不带 `--apply` 只打印将要删什么，不动手。cron 行里显式带 `--apply`。
3. **`var/` 不存在 → 什么也不做，exit 0。** 首次部署、或在没有 `var/` 的机器上跑，都不该报错。
4. **永不 `rm -rf` 一个未经验证的路径。** 目录删除前必须确认：路径在 `var/` 之下、名字匹配 `test-*`、是目录不是符号链接。
5. **不引入新依赖。** POSIX sh + `find` / `awk` / `wc` / `tail`。

## 4. 交付物

### Task A：`scripts/prune-var.sh`

环境变量：

| 变量                         | 默认  | 含义                      |
| ---------------------------- | ----- | ------------------------- |
| `VAR_DIR`                    | `var` | 根目录                    |
| `OPS_REPORT_RETENTION_DAYS`  | `90`  | 日检报告保留天数          |
| `TEST_DIR_RETENTION_DAYS`    | `7`   | `test-*` 残留目录保留天数 |
| `NOTIFICATION_LOG_MAX_LINES` | `500` | 投递记录保留行数          |
| `PRUNE_APPLY`                | `0`   | `1` 等同 `--apply`        |

输出：每个动作一行（`would remove …` / `removed …` / `truncated …`），末尾一行汇总。`--apply` 与 dry-run 的汇总行必须区分得出来。

### Task B：`tests/prune-var.test.ts`

真实文件操作，临时目录里造夹具。覆盖：dry-run 不删、`--apply` 才删、只删日期命名的文件、保留未到期文件、`cron.err` 与手放文件不动、投递记录按行截断、`test-*` 目录按龄删除、`var/` 不存在时 exit 0、`var/` 是文件时不动手、不跟随符号链接。

### Task C：文档

`docs/runbook.md` 的「定时日检（cron）」小节后补一小段「`var/` 留存物清理」，写清装法、默认值、`--apply` 的必要性，以及**为什么不能 `find var -delete`**（把 §1 那张表放进去，否则下一个人还会想当然）。

## 5. 明确禁止

- 不删 `var/pg-run`、`var/pglite-run`、`var/chrome-shot-profile`、`var/qa`、`var/audit-*`、`var/official-snapshots` 及任何未列出的目录。
- 不删 `var/patrol/*.json`（巡检状态，日检要读）。
- 不删 `var/ops-reports/cron.err`。
- 不清理 git 跟踪的文件（`var/` 整体被 `.gitignore:18` 忽略，但脚本仍不该假设这一点）。
- 不改 `ops-daily-report.mjs` / `ops-daily-cron.sh` 的既有行为。
- 不自动装 crontab。

## 6. 完成后的要求

生成 `docs/audit/SPRINT_3I_REPORT_2026-11-25.md`：执行摘要、Git 状态、修改文件、为什么白名单、三种清理逻辑与取舍、dry-run 实测输出、`--apply` 实测输出、完整测试结果、未处理问题、风险、下一步建议、停止声明。

## 7. 停止纪律

本轮完成后停止。安装 crontab 由 Owner 执行。
