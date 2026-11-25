# DEEPSEEK HARNESS — SPRINT 3F 任务文档

## 0. 核心目标

Sprint 3E 把数据面故障从「用户报障才发现」变成「cron 五分钟内发现」，但**告警只写进 syslog**——前提是有人去看 `journalctl`。没人看的时候，链路仍然是断的。

本轮把这条链路接到人：**飞书群机器人**。

```text
探针失败
  → readiness-cron.sh 判定状态变化
  → notify-feishu.sh 组装并签名
  → POST https://open.feishu.cn/open-apis/bot/v2/hook/<token>
  → Owner 的飞书群收到一条消息
```

三条原则：

1. **运行时行为零改动**：`/health`、`/ready`、compose healthcheck、Caddy、API、web 全部不动。本轮只碰宿主机上的告警投递。
2. **凭据不进仓库、不进对话**：webhook 与签名密钥只存在于 VPS 的 `deploy/.env`（`.gitignore:4` 已忽略，`git check-ignore` 已验证）。Agent 只交付读取逻辑与自检命令，由 Owner 自己填。
3. **投递失败不能反噬巡检**：通知脚本任何失败都必须被 `|| true` 吞掉，巡检自身的退出码、状态文件、syslog 记录一律不受影响。

## 1. 执行前必读文件

| 文件                                            | 为什么读                                                       |
| ----------------------------------------------- | -------------------------------------------------------------- |
| `scripts/readiness-cron.sh`                     | 本轮唯一的接线点（`emit()`，:94-97）                           |
| `tests/readiness-cron.test.ts`                  | 既有 12 用例与假 `docker`/假 `logger` 手法，本轮要扩展而不破坏 |
| `scripts/check-readiness.mjs`                   | 探针契约：五态、退出码、`--json` 字段                          |
| `docs/runbook.md` :313-373                      | 3E 写下的定时探针小节，本轮要在其后追加飞书小节                |
| `deploy/env.prod.example`                       | 凭据模板，本轮要补两个键的说明                                 |
| `.gitignore`                                    | 确认 `deploy/.env` 被忽略                                      |
| `docs/audit/SPRINT_3E_REPORT_2026-11-24.md` §12 | 本轮对应的是其中的 P1                                          |

## 2. Git 安全检查

开工前必须：

```bash
git status --short      # 期望：无输出
git log --oneline -1    # 期望：b458e0b
git branch --show-current  # 期望：chore/phase1-baseline
```

禁止 `git reset --hard` / `git clean -fd` / `git checkout -- .` / `git restore .`。

提交方式沿用前几轮：逐路径 `git add --`，message 用无 BOM UTF-8：

```powershell
$utf8 = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText("$PWD\var\commit-msg-3f.txt", $msg, $utf8)
git commit -F var/commit-msg-3f.txt
```

提交前用 `Format-Hex` 校验 subject 首字节不是 `EF BB BF`。

## 3. 硬边界

### 3.1 允许修改

| 文件                                            | 动作                                                |
| ----------------------------------------------- | --------------------------------------------------- |
| `scripts/notify-feishu.sh`                      | 新建：飞书投递脚本                                  |
| `scripts/readiness-cron.sh`                     | 改：`emit()` 里追加通知调用                         |
| `tests/notify-feishu.test.ts`                   | 新建：假 HTTP 服务器验证载荷与签名                  |
| `tests/readiness-cron.test.ts`                  | 改：补通知接线用例                                  |
| `deploy/env.prod.example`                       | 改：补 `FEISHU_WEBHOOK` / `FEISHU_SIGN_SECRET` 说明 |
| `docs/runbook.md`                               | 改：追加「飞书通知」小节                            |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3F_TASK.md` | 本文件                                              |
| `docs/audit/SPRINT_3F_REPORT_2026-11-24.md`     | 执行报告                                            |

### 3.2 明确禁止

- 修改 `services/api/**`、`apps/web/**`、`packages/**`
- 修改 `/health`、`/ready` 的任何行为
- 修改 `deploy/docker-compose.prod.yml`、`deploy/caddy/**`、`Dockerfile`、`.github/**`
- 修改 `scripts/check-readiness.mjs` 本体
- 安装任何 npm 依赖（脚本必须用宿主机已有的 `sh`/`curl`/`openssl`/`awk`）
- 在本机安装 crontab、发送真实飞书消息（本机没有凭据，也不该有）
- 把 webhook URL 或 secret 写进任何被跟踪的文件、日志、报告、对话
- 修改 `/pass-rate/` 的 `Promise.all` 行为（Owner 已明确保留方案 A）
- 进入 Sprint 3G / 4

### 3.3 为什么是「宿主机 sh 脚本」而不是 Node

与 Sprint 3E 同一理由：cron 跑在宿主机上，宿主机**可能没有 node**（只有 Docker）。而 `curl`、`openssl`、`awk` 是 Ubuntu 24.04 的基础包，`sh` 是 dash。

`scripts/` 会被 `Dockerfile:23 COPY scripts ./scripts` 打进镜像，所以新脚本必须对生产镜像无害：不被 `CMD` 引用、无副作用、不读环境变量就什么也不做。

### 3.4 为什么拆成独立脚本而不是塞进 readiness-cron.sh

1. **Owner 要能单独自检**：填完凭据第一件事是 `sh scripts/notify-feishu.sh --test`，不该为了验通一条消息去伪造一次数据面故障。
2. **签名/重试/限流是独立逻辑**，可以脱离探针单独测试。
3. **不污染 3E 的 12 个用例语义**：`readiness-cron.sh` 的职责是「判定该不该说话」，`notify-feishu.sh` 的职责是「把话送到」。混在一起会让两边都难测。

## 4. Task A — `scripts/notify-feishu.sh`

### 4.1 接口

```bash
sh scripts/notify-feishu.sh --text "..."        # 发送指定文本
sh scripts/notify-feishu.sh --test              # 发送固定自检消息
printf '%s' "..." | sh scripts/notify-feishu.sh --stdin
```

退出码：`0` 投递成功；`1` 任何失败（未配置、网络错、HTTP 非 2xx、响应 `code != 0`）。调用方一律 `|| true`。

### 4.2 凭据来源

优先级：**环境变量 > `deploy/.env`**。

| 变量                 | 必填 | 说明                             |
| -------------------- | ---- | -------------------------------- |
| `FEISHU_WEBHOOK`     | 是   | 完整 webhook URL                 |
| `FEISHU_SIGN_SECRET` | 否   | 留空＝机器人未启用签名校验       |
| `FEISHU_ENV_FILE`    | 否   | 默认 `deploy/.env`               |
| `FEISHU_TIMEOUT`     | 否   | `curl --max-time`，默认 10 秒    |
| `FEISHU_RETRY_DELAY` | 否   | 重试间隔秒数，默认 1（测试置 0） |

**读取 `.env` 必须用 `grep` + `cut -d= -f2-`，绝不 `source`。** 两个理由：

- `.env` 是 compose 插值文件，`source` 会让含空格或 `$` 的值被 shell 二次解释；
- **`cut` 必须带尾随 `-`**：飞书 webhook token 与 secret 都是 base64 风格，结尾可能有 `=` 填充，`cut -d= -f2` 会把填充吃掉，导致签名永远算错。

### 4.3 飞书契约

```http
POST <webhook>
Content-Type: application/json

{"msg_type":"text","content":{"text":"..."}}
```

启用签名校验时，请求体额外两个字段：

```json
{
  "timestamp": "1700000000",
  "sign": "iCkands+D7soGarEM/8PJyY0NGFHRfnz9rKsOa95jtU="
}
```

**签名算法反直觉**（已在本机用 openssl 与 node crypto 双算交叉验证，同一输入得到同一输出）：

```text
key  = "<timestamp>\n<secret>"      # 换行分隔，不是拼接
data = ""                            # 空字符串，不是请求体
sign = base64(hmac_sha256(key, data))
```

即 `printf '' | openssl dgst -sha256 -hmac "$(printf '%s\n%s' "$ts" "$secret")" -binary | base64`。

`timestamp` 是**秒级字符串**，不是毫秒。

### 4.4 成功判定

飞书成功响应是 HTTP 200 + `{"code":0,"msg":"success",...}`。**只看 HTTP 状态不够**：限流、签名错误、token 失效都可能返回 200 而 `code != 0`。

所以成功条件是：HTTP 2xx **且** 响应体含 `"code":0`（允许 `"code": 0` 带空格）。

### 4.5 重试

只对**瞬态**失败重试，最多 2 次（共 3 次尝试）：

- HTTP 429（限流）
- HTTP >= 500
- 响应 `code` 为 `9499`（飞书限流码）
- curl 自身的连接失败（退出码 6/7/28）

**不重试**签名错误、token 失效（`code` 为 19001/19021/19024 等）——重试只会重复失败。

重试间隔 `FEISHU_RETRY_DELAY` 秒，默认 1。测试里置 0 避免拖慢。

### 4.6 安全约束

- **任何输出都不得包含 webhook URL 或 secret**。失败时只说 `notify-feishu: delivery failed (http=500)`，不带 URL。
- 临时文件用 `mktemp`，`trap` 清理。
- 未配置凭据时：**静默退出 0**，还是报错退出 1？

  选**退出 1 但只说一句 `notify-feishu: FEISHU_WEBHOOK is not configured`**。理由：`--test` 模式下 Owner 需要知道「没配」和「配了但发不出去」的区别；而 cron 调用方用 `|| true` 兜住，不会因此产生邮件。静默跳过会让「以为配好了其实没配」这种最坏情况不可见。

### 4.7 JSON 转义

告警文本里可能有引号、反斜杠、换行（`message=` 来自上游错误）。必须转义，否则载荷非法，飞书返回 400。

用 `awk` 单次遍历（已实测：`a"b\c` → `a\"b\\c`，多行 → `\n` 字面量，输出经 `JSON.parse` 验证通过）。不用 `sed` 的 `:a;N;$!ba` 惯用法——它在单行输入上不输出任何内容（已实测）。

## 5. Task B — 接线 `readiness-cron.sh`

在 `emit()` 里追加通知，**不改变任何既有 syslog 行为**：

```sh
emit() {
  logger -t "$TAG" -p "daemon.$1" -- "$2" 2>/dev/null || true
  # 通知失败绝不能影响巡检自身的结论与状态文件
  sh "$NOTIFY_SCRIPT" --text "[$TAG] $2" >/dev/null 2>&1 || true
}
```

新增环境变量 `READINESS_NOTIFY`（默认 `1`，置 `0` 关闭通知）与 `NOTIFY_SCRIPT`（默认脚本自身同目录的 `notify-feishu.sh`，测试注入用）。

**三个触发点都发**：`err`（故障开始）、`notice`（恢复）、`warning`（心跳）。`unreachable`（探针跑不起来）走 `err` 分支，同样发——它也是故障，而且更严重。

3E 的状态机已经保证「只在变化时说话 + 每小时心跳一次」，正好落在飞书自定义机器人限流（5 次/秒、100 次/分钟）之下，**不需要额外限流**。

## 6. Task C — 测试

### 6.1 `tests/notify-feishu.test.ts`（新建，目标 12 用例）

手法：起一个**本地 node http 服务器**（`127.0.0.1:0`）当假飞书，记录收到的请求体，按用例返回不同状态码与 body。

| #   | 用例                               | 断言                                                                            |
| --- | ---------------------------------- | ------------------------------------------------------------------------------- |
| 1   | `--text` 正常投递                  | HTTP 200 且 `code:0` 时退出 0；收到 `msg_type=text`；`content.text` 与输入一致  |
| 2   | `--stdin` 读标准输入               | 文本来自 stdin                                                                  |
| 3   | `--test` 自检                      | 退出 0，文本非空且含标识                                                        |
| 4   | 无凭据                             | 退出 1，stderr 含 `FEISHU_WEBHOOK is not configured`                            |
| 5   | 无参数                             | 退出 1，打印用法                                                                |
| 6   | 开签名校验                         | 载荷含 `timestamp` 与 `sign`；**用独立实现重算 HMAC 断言 sign 正确**            |
| 7   | 不开签名校验                       | 载荷**不含** `timestamp` / `sign`                                               |
| 8   | HTTP 500                           | 重试后退出 1                                                                    |
| 9   | HTTP 200 但 `code:9499`            | 视为限流，重试，最终退出 1                                                      |
| 10  | HTTP 200 但 `code:19021`（签名错） | **不重试**，一次请求即退出 1                                                    |
| 11  | 文本含引号/反斜杠/换行             | 服务器能 `JSON.parse` 成功，且还原后文本一致                                    |
| 12  | 任何失败路径                       | stdout/stderr **都不含** webhook URL 或 secret                                  |
| 13  | `.env` 回退                        | 环境变量缺失时从 `FEISHU_ENV_FILE` 读到 webhook（含 `=` 填充的 token 不被截断） |

### 6.2 `tests/readiness-cron.test.ts`（改，+3 用例）

| #   | 用例                 | 断言                                        |
| --- | -------------------- | ------------------------------------------- |
| 1   | 故障开始             | 假 notify 被调用一次，参数含 `status=error` |
| 2   | 恢复                 | 假 notify 被调用一次，参数含 `recovered`    |
| 3   | `READINESS_NOTIFY=0` | 假 notify **未被调用**，但 syslog 照常      |
| 4   | notify 脚本失败      | 巡检仍 `exit 0`，状态文件照常写入           |

假 notify 用 `printf '%s\n' "$*" >> "$NOTIFY_LOG"` 写入文件。

### 6.3 真实执行验证

除单测外，必须在 WSL 下用**真 curl** 打一个**本地假 HTTP 服务器**，确认：

- 签名能被服务器独立重算验证；
- 真实 curl 的 `--data-binary` 传中文不坏；
- 限流重试确实发生（服务器记录请求次数）。

**不得**向 `open.feishu.cn` 发真实请求（没有凭据，也不该有）。

## 7. 完整测试矩阵

全部真实执行，记录退出码：

| 命令                                              | 期望                                 |
| ------------------------------------------------- | ------------------------------------ |
| `pnpm run typecheck`                              | 0                                    |
| `pnpm test`                                       | 0，文件数/用例数较 3E 的 23/276 增加 |
| `pnpm run test:verify-gate`                       | 0，40 pass                           |
| `pnpm run build`                                  | 0                                    |
| `pnpm run format:check`                           | **0**（3D 起已全绿，本轮不得回退）   |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | 0                                    |
| `pnpm run test:python`                            | 0，239 passed                        |
| `pnpm run verify:all`（两 DB 变量均设）           | 0，6/6                               |
| `pnpm run smoke:docker`                           | 0，11 项 ok                          |

`smoke:docker` 耗时约 3 分钟，**一开始就重定向到 `var/smoke-3f.log`**（3E 教训：终端缓冲会让人误判卡死）。

## 8. 不允许伪造结果

- 跑不了的写 NOT RUN 并说明原因、替代验证、是否影响验收。
- 不得为了让报告好看而省略失败项。
- 真实执行发现的缺陷必须写进报告，包括「测试当时是绿的但真实运行暴露了问题」这类。

## 9. 执行报告

`docs/audit/SPRINT_3F_REPORT_2026-11-24.md`，13 节：

1. 执行摘要（改前/改后）
2. Git 状态（基线、改动清单、提交结果）
3. 交付物清单
4. Task A（接口、凭据、签名、成功判定、重试、安全）
5. Task B（接线、触发面、为何不需要限流）
6. Task C（测试手法与用例表、真实执行证据）
7. 给 Owner 的交接（填哪个文件、哪两个键、自检命令、判据）
8. 完整测试结果
9. 回归护栏
10. 未处理问题
11. 风险
12. 下一步建议
13. 停止声明

## 10. 验收标准

- [ ] `scripts/notify-feishu.sh` 存在、可执行、`sh -n` 通过、行尾 LF
- [ ] 支持 `--text` / `--stdin` / `--test` 三种模式
- [ ] 凭据优先级：环境变量 > `deploy/.env`，用 `cut -d= -f2-`
- [ ] 签名算法与飞书文档一致，且被独立实现验证
- [ ] 成功判定同时看 HTTP 状态与响应 `code`
- [ ] 瞬态失败重试、签名错不重试
- [ ] 任何输出不含 webhook URL 或 secret
- [ ] JSON 转义正确（引号、反斜杠、换行）
- [ ] `readiness-cron.sh` 三个触发点都通知，`READINESS_NOTIFY=0` 可关
- [ ] 通知失败不影响巡检退出码与状态文件
- [ ] 新增测试全部通过，既有 276 个用例无回归
- [ ] 9 项测试矩阵全部 EXIT 0（`format:check` 保持全绿）
- [ ] `deploy/env.prod.example` 与 `docs/runbook.md` 已同步
- [ ] 未修改 `services/api/**`、`apps/web/**`、`deploy/docker-compose.prod.yml`、`Dockerfile`
- [ ] 未在本机装 crontab、未发真实飞书消息
- [ ] 报告已写，工作树干净

## 11. 停止条件

本轮完成后**必须停止**。不得进入 Sprint 3G / 4，不得顺手做：

- `/pass-rate/` 方案 B（Owner 已明确保留方案 A）
- G-15 测试缺口补齐
- `/ready` 外部可观测性
- 首页/内链/资格页改版

## 12. 与 3B / 3C / 3D / 3E 的关系

| Sprint | 交付               | 与本轮关系                                        |
| ------ | ------------------ | ------------------------------------------------- |
| 3B     | `/ready` 端点      | 本轮通知的**数据源**                              |
| 3C     | web 启动门禁       | 无关                                              |
| 3D     | `ready:check` 探针 | 3E 与本轮都调用它                                 |
| 3E     | cron + syslog      | 本轮在 `emit()` 处接出第二条通道                  |
| 3F     | 飞书通知           | 让告警从「需要有人看 journald」变成「推到人眼前」 |
