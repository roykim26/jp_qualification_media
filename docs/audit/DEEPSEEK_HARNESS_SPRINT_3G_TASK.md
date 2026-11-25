# DEEPSEEK HARNESS — SPRINT 3G 任务文档

## 0. 核心目标

Sprint 3F 把告警接到了飞书，链路端到端打通（2026-11-25 生产自检成功）。但接通的过程暴露了两个问题，本轮只修这两个。

### 问题一：诊断信息没有区分度（P0）

3F 交付后，Owner 在 VPS 上做自检，**连续四轮失败**，每一轮 stderr 都是同一句：

```text
notify-feishu: FEISHU_WEBHOOK is not configured (set it in deploy/.env)
```

而实际发生的故障是**四种完全不同的情况**：

| 实际故障                                    | 当时的报错                            | 该给的提示                                 |
| ------------------------------------------- | ------------------------------------- | ------------------------------------------ |
| 文件不存在（代码根本没送到 VPS）            | `FEISHU_WEBHOOK is not configured`    | 脚本路径不对／仓库没更新                   |
| 文件在，但没有这个键（编辑器未保存）        | 同上                                  | 键缺失，给文件绝对路径与 mtime             |
| 键在，但值是占位符（`把完整 URL 粘在这里`） | 同上 → 之后 `curl=3`                  | 值不像 URL，给长度与前缀，**不要回显原值** |
| 值正确但网络/凭据问题                       | `delivery failed (http=... curl=...)` | 这一条当时是对的                           |

同一句话覆盖四种故障，等于没有诊断。四次往返本可以压缩成一次。

### 问题二：通知渠道本身没有体检（P1）

`ops:daily` 现在检查数据面内容（来源健康、到期事实、待审队列），但不检查**告警通道还能不能响**。webhook 被重置、token 过期、飞书群解散之后，告警会静默消失——比脚本报错更危险的一类故障，因为没有任何信号。

## 1. 三条硬约束

1. **`ops:daily` 不得发网络请求。** 这是 `docs/runbook.md:284` 与 3D 任务文档 §107 写死的契约：日检是纯数据库只读巡检，`BEGIN READ ONLY` 后只查表。要判断通知渠道健康，只能读**本地证据**（投递记录文件），不能现场 POST 一次飞书。
2. **凭据永不回显。** 诊断信息可以给长度、前缀、host，**绝不能给完整 URL 或 token**——这些行会进 syslog、进 cron 邮件。
3. **运行时行为零改动。** `/health`、`/ready`、compose healthcheck、Caddy、API、web 一行不动。本轮只碰宿主机侧的通知脚本与日检报告。

## 2. 执行前必读

| 文件                                            | 为什么读                                                     |
| ----------------------------------------------- | ------------------------------------------------------------ |
| `scripts/notify-feishu.sh`                      | 本轮主改对象，242 行全文                                     |
| `tests/notify-feishu.test.ts`                   | 既有 14 用例，本轮要扩展而不破坏（尤其「never prints」那条） |
| `scripts/ops-daily-lib.mjs`                     | 日检纯函数库，本轮要加一个 section                           |
| `scripts/ops-daily-report.mjs`                  | 日检 CLI，本轮要读一个本地文件                               |
| `scripts/ops-daily-lib.test.mjs`                | 既有 node:test 断言，本轮要扩展                              |
| `config/source-ops.json`                        | 日检阈值配置，本轮加两个键                                   |
| `docs/runbook.md` :375-434                      | 3F 写下的飞书小节，本轮要补失败模式表与投递记录              |
| `docs/audit/SPRINT_3F_REPORT_2026-11-24.md` §12 | 本轮对应的就是其中的 P0（补丁）与 P1                         |

## 3. Git 安全检查

开工前必须：

```bash
git status --short           # 期望：无输出
git log --oneline -1         # 期望：7a45b0f
git branch --show-current    # 期望：chore/phase1-baseline
```

禁止 `git reset --hard` / `git clean -fd` / `git checkout -- .` / `git restore .`。

## 4. Task A（P0）：给凭据解析补诊断区分度

### 4.1 要区分的状态

`notify-feishu.sh` 在 `die` 之前必须先判定值的形态，输出**带原因码**的报错：

```text
notify-feishu: FEISHU_WEBHOOK is not usable (reason=key-absent)
  file: /opt/jpqm/deploy/.env (816 bytes, mtime 2026-11-15T12:38:00Z)
  hint: the file exists but has no FEISHU_WEBHOOK= line; append it with:
        printf 'FEISHU_WEBHOOK=%s\n' '<your webhook url>' >> deploy/.env
```

原因码集合（固定，便于 grep 与测试断言）：

| reason             | 触发条件                                 |
| ------------------ | ---------------------------------------- |
| `env-file-missing` | `FEISHU_ENV_FILE` 指向的文件不存在       |
| `key-absent`       | 文件存在，但没有 `^KEY=` 行              |
| `value-empty`      | 有该键，但 `=` 后面是空串                |
| `value-not-url`    | 值不以 `http://` 或 `https://` 开头      |
| `value-has-cr`     | 值里含 `\r`（Windows 编辑器保存的 CRLF） |
| `value-has-space`  | 值里含空格或制表符（粘 URL 时带进来的）  |

优先级：`env-file-missing` > `key-absent` > `value-empty` > `value-has-cr` > `value-has-space` > `value-not-url`。

### 4.2 必须同时做的两件小事

1. **剥离 CR。** 读到的值先去掉尾部 `\r`。VPS 上不会出现，但 Owner 可能用 Windows 编辑器打开过 `.env`；一个 `\r` 会让 curl 报 `URL rejected`，而报错完全看不出原因。剥离后如果值变了，在成功路径上给一行 stderr 提示（`stripped trailing CR from FEISHU_WEBHOOK`），不静默。
2. **`FEISHU_ENV_FILE` 的相对路径要解析成绝对路径再打印。** 四轮排查里有一条就是靠 `ls -l deploy/.env` 才排除了「相对路径不对」这个可能——报错里直接给出绝对路径与文件大小、mtime，能省掉这一步。

### 4.3 值的展示规则（安全）

- **允许**：长度、`scheme=`（`http`/`https`/`none`）、host（如 `open.feishu.cn`）、`path-prefix=`（如 `/open-apis/bot/v2/hook/`，只到固定前缀，不含 token）。
- **禁止**：完整 URL、token、secret、值的前 8 位之后任何字符。

既有测试 `never prints the webhook or the secret` 必须继续通过（断言 stderr 不含 `test-token`）。

### 4.4 成功路径也要有回执

现在成功时完全静默。加一行 stdout：

```text
notify-feishu: delivered (http=200) after 1 attempt(s)
```

`readiness-cron.sh` 调用时是 `>/dev/null 2>&1`，不会污染 syslog。

### 4.5 投递记录（Task B 的输入）

每次投递结束（无论成败）向 `var/notifications/feishu.log` 追加一行 JSON：

```json
{
  "at": "2026-11-25T00:28:42Z",
  "ok": true,
  "http": 200,
  "curl": 0,
  "attempts": 1,
  "reason": null
}
```

- 目录不存在时创建（`mkdir -p`），创建失败静默忽略（不能因为记不了日志就发不出告警）。
- 路径可用 `FEISHU_DELIVERY_LOG` 覆盖（测试用）。
- **不含任何凭据**，只有状态。
- 用 `printf` 拼 JSON，字段全部是数字或固定枚举，不引入 jq 依赖。

## 5. Task B（P1）：把通知渠道纳入 `ops:daily`

### 5.1 数据来源

只读 `var/notifications/feishu.log`（或 `FEISHU_DELIVERY_LOG` 指向的文件）。**不发任何网络请求。**

### 5.2 判定规则（纯函数，放 `ops-daily-lib.mjs`）

```js
buildNotificationHealth({ records, now, config });
```

| 条件                                  | level      | reason                 |
| ------------------------------------- | ---------- | ---------------------- |
| 记录文件不存在（从未投递过）          | `info`     | `not_run`              |
| 最后一条 `ok: true`，且距今 ≤ 阈值    | `info`     | `healthy`              |
| 最后一条 `ok: false`，连续失败 < 阈值 | `warning`  | `recent_failure`       |
| 连续失败 ≥ 阈值                       | `critical` | `consecutive_failures` |
| 最后一条 `ok: true`，但距今 > 阈值    | `warning`  | `channel_stale`        |

`channel_stale` 是最重要的一条：它抓的是「**告警通道安静太久了**」——可能是好事（一直没故障），也可能是 webhook 早已失效而没人发现。日检只提示，不下结论。

阈值进 `config/source-ops.json`：

```json
"notificationFailureThreshold": 3,
"notificationStaleDays": 14
```

### 5.3 报告接线

- `buildDailyReport` 新增入参 `notificationChannel`，输出到 `report.notificationChannel`。
- `summary.notificationLevel`（`info`/`warning`/`critical`/`not_run`）。
- `todayActions` 里 critical 时追加 `kind: 'notification_channel'` 一条；warning 不进 action 列表（避免噪音，只在摘要与章节里显示）。
- `hasCritical` 要把 `notificationChannel.level === 'critical'` 算进去——**通知渠道挂了和来源挂了同级**，因为前者会让后者永远传不出去。
- `renderMarkdown` 新增 `## 通知渠道` 一节。
- `ops-daily-report.mjs` 读文件；文件不存在时传 `{ status: 'not_run', reason: ... }`（与 `coverageGap` 的既有写法一致）。

### 5.4 不得破坏

- `ops-daily-report.mjs` 仍然**不发外部请求**（只读本地文件 + 数据库只读查询）。
- 既有 node:test 用例全部继续通过（`empty report says there is nothing to handle` 断言 `hasCritical === false`，所以「无记录」必须判 `info`）。

## 6. Task C：文档

`docs/runbook.md` 飞书小节补两块：

1. 「自检」小节加**失败模式对照表**（reason → 含义 → 怎么修）。
2. 新增「投递记录」小节：文件位置、字段含义、怎么用 `tail` 看一眼、`ops:daily` 怎么消费它。

## 7. 测试要求

- `tests/notify-feishu.test.ts` 扩展：六种 reason 各一条断言 + CR 剥离 + 投递记录写入 + 成功回执 + 既有「不泄漏」用例不回归。
- `scripts/ops-daily-lib.test.mjs` 扩展：五种判定各一条 + markdown 含新章节 + critical 进 todayActions + hasCritical 联动。
- 全量矩阵：typecheck / `pnpm test` / verify-gate / build / format:check / eslint / pytest。

## 8. 明确禁止

- 不改 `readiness-cron.sh` 的调用契约（仍是 `sh "$NOTIFY_SCRIPT" --text ... || true`）。
- 不改 `/health`、`/ready`、compose、Caddy、Dockerfile。
- 不给 `ops:daily` 加网络请求。
- 不引入新依赖（jq / openssl 之外的东西）。
- 不动 `deploy/.env`、不打印凭据。
- 不进入 Sprint 3B / 3H / 生产发布。

## 9. 完成后的要求

生成 `docs/audit/SPRINT_3G_REPORT_2026-11-24.md`，含：执行摘要、Git 状态与基线、修改文件、Task A 的六种 reason 实测输出、Task B 的判定表与实测、安全复核（凭据未泄漏）、完整测试结果、未处理问题、风险、下一步建议、停止声明。

## 10. 停止纪律

本轮完成后**必须停止**。不要因为看到日检里别的告警就继续修，不要进入生产发布。
