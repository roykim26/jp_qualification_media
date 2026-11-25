# Sprint 3F 执行报告 — 2026-11-24

> 主题：把定时探针的告警从 syslog 转发到飞书
> 分支：`chore/phase1-baseline`
> 执行工具：DeepSeek Harness
> 原则：证据优先、最小修改、可验证、可回滚

---

## 1. 执行摘要

Sprint 3E 让 cron 每 5 分钟检查一次数据面，故障写进 syslog。但 syslog 只有主动去看 journald 的人才有用——告警仍然依赖「有人正好在看」。本轮加一条出站通道，把同一批事件推到飞书群。

| 维度       | 改前                           | 改后                                                       |
| ---------- | ------------------------------ | ---------------------------------------------------------- |
| 故障送达   | 写 syslog，需人工 `journalctl` | 同时推飞书群，手机上直接看到                               |
| 通知粒度   | 无（只有日志行）               | 故障开始 / 每小时心跳 / 恢复 / 探针跑不起来，四类          |
| 静默       | —                              | 健康稳态一条不发                                           |
| 失败隔离   | —                              | 通知失败不影响巡检退出码、状态文件与 syslog                |
| 凭据位置   | —                              | `deploy/.env`（已被 gitignore），不进仓库                  |
| 运行时行为 | —                              | **零改动**：API、web、compose、Caddy、Dockerfile 全无 diff |

真实投递证据（本地假 webhook，真实 curl）：

```text
plain text delivered          exit=0  requests=1  msg_type=text  text='plain hello'
signature matches independent HMAC   sign === createHmac('sha256', ts+'\n'+secret).update('').digest('base64')
HTTP 500 retried three times  exit=1  requests=3  stderr='after 3 attempt(s)'
code 9499 treated as transient exit=1 requests=3
code 19021 is not retried     exit=1  requests=1
webhook and secret never printed    stderr 不含 token / secret
```

---

## 2. Git 状态

### 2.1 基线

- 分支：`chore/phase1-baseline`
- 本轮起点：`b458e0b`（Sprint 3E 收尾）
- 起点工作树：干净

### 2.2 改动清单

| 文件                                            | 类型 | 说明                                               |
| ----------------------------------------------- | ---- | -------------------------------------------------- |
| `scripts/notify-feishu.sh`                      | 新增 | 240 行 POSIX sh，签名 + 重试 + 脱敏                |
| `scripts/readiness-cron.sh`                     | 修改 | +10 行，`emit()` 里接出第二条通道                  |
| `tests/notify-feishu.test.ts`                   | 新增 | 14 用例，真实执行脚本 + 子进程假 webhook           |
| `tests/readiness-cron.test.ts`                  | 修改 | +120 行，新增 8 个通知接线用例（12 → 20）          |
| `deploy/env.prod.example`                       | 修改 | +10 行，补 `FEISHU_WEBHOOK` / `FEISHU_SIGN_SECRET` |
| `docs/runbook.md`                               | 修改 | +61 行，「飞书通知」小节                           |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3F_TASK.md` | 新增 | 本轮任务文档                                       |
| `docs/audit/SPRINT_3F_REPORT_2026-11-24.md`     | 新增 | 本文件                                             |

`git diff --stat`（不含新增文件）：4 files changed, 200 insertions(+), 1 deletion(-)。

### 2.3 提交

报告内引用自身 commit hash 存在天然的循环依赖（写 hash → 改报告 → hash 变）。沿用 3A/3B/3C/3E 的先例：内容 commit 一次，随后一个纯文档 commit 收口 hash，不反复 amend。

| commit    | subject                                    | 内容                                       |
| --------- | ------------------------------------------ | ------------------------------------------ |
| `9af0642` | `feat: deliver readiness alerts to Feishu` | 8 files，代码 + 测试 + 文档 + 两份 3F 文档 |
| `4d0c8a5` | `docs: 落账 Sprint 3F 执行报告`            | 1 file，只改本报告的 hash 与基线链         |

基线链：`a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438 → 9bc946f → 9fc9c72 → f99e475 → 3142605 → 2afa33d → 031e9af → 525098e → ef975a8 → 74db96b → cd514ed → b458e0b → 9af0642 → 4d0c8a5`

链只列到收口 commit；此后纯文档 commit 不再回填——回填本身会再产生 commit，是不收敛的自引用。要确认当前 HEAD 用 `git log`。

---

## 3. 交付物清单

1. `scripts/notify-feishu.sh` — 投递脚本，可独立调用
2. `scripts/readiness-cron.sh` — 接线（`emit()` 处）
3. `tests/notify-feishu.test.ts` — 14 用例
4. `tests/readiness-cron.test.ts` — 12 → 20 用例
5. `deploy/env.prod.example` + `docs/runbook.md` — 凭据位置与操作手册

---

## 4. Task A — `scripts/notify-feishu.sh`

### 4.1 为什么是独立脚本而不是塞进 cron 脚本

三个理由：

1. **Owner 需要能单独自检。** 填完凭据第一件事是验通，`sh scripts/notify-feishu.sh --test` 比「等 5 分钟看 cron 有没有报错」直接得多。
2. **签名、重试、限流判定是可独立测试的逻辑。** 塞进 `readiness-cron.sh` 会让 3E 那 12 个状态机用例的语义被污染。
3. **宿主机可能没有 node。** 用 POSIX sh + curl + openssl，与 3E 选 sh 的理由一致。

### 4.2 凭据解析

优先级：环境变量 > `deploy/.env`。

```sh
read_env_value() {
  grep "^$1=" "$ENV_FILE" 2>/dev/null | tail -n 1 | cut -d= -f2- || true
}
```

**`cut -d= -f2-` 的尾随 `-` 是必需的。** base64 密钥末尾有 `=` 填充，`-f2` 会把它截掉，签名随即不匹配。这一点有专门用例守着（`falls back to the env file and keeps "=" padding in the secret`）。

**绝不 `source` 这个文件。** `.env` 是 compose 的插值文件，值里可能有空格或 `$`，source 会被 shell 解释。runbook 里已有同样的先例（`$(grep ^API_DB_PASSWORD= deploy/.env | cut -d= -f2)`）。

### 4.3 签名

飞书的算法反直觉——HMAC 的 key 是 `<timestamp>\n<secret>`，data 是空字符串，输出 base64：

```sh
sign_payload() {
  printf '' | openssl dgst -sha256 -hmac "$(printf '%s\n%s' "$1" "$2")" -binary | base64 | tr -d '\n'
}
```

本机用 openssl 与 node crypto 双算同一组 `ts=1700000000` / `secret='test-secret-value'`，结果逐字相同：

```text
iCkands+D7soGarEM/8PJyY0NGFHRfnz9rKsOa95jtU=
```

测试里用 `createHmac('sha256', ts + '\n' + secret).update('').digest('base64')` 独立重算并断言相等——不是拿脚本的输出跟自己比。

`FEISHU_SIGN_SECRET` 留空时不输出 `timestamp` / `sign` 字段，有用例断言 payload 的 key 恰好是 `msg_type,content`。

### 4.4 成功判定

**只有 HTTP 2xx 是不够的。** 飞书对限流和签名错误也回 HTTP 200，靠响应体里的 `code` 区分：

```sh
body_has_code() {
  grep -Eq "\"code\"[[:space:]]*:[[:space:]]*$2([^0-9]|$)" "$1"
}
```

`code=0` 才算接受。

### 4.5 重试策略

| 情况                               | 是否重试 | 理由                                 |
| ---------------------------------- | -------- | ------------------------------------ |
| curl 退出码 6 / 7 / 28             | 是       | DNS / 连接 / 超时，都是瞬态          |
| HTTP 429                           | 是       | 限流，等一会就好                     |
| HTTP 5xx                           | 是       | 服务端瞬态                           |
| body `code=9499`                   | 是       | 飞书限流码                           |
| 其它（签名错 `19021`、token 失效） | 否       | 每次都一样，重试只是延迟你知道它坏了 |

共 3 次，间隔由 `FEISHU_RETRY_DELAY` 控制（默认 1 秒）。

### 4.6 安全

- webhook 与 secret 只从环境变量或 `deploy/.env` 读，不接受命令行参数（否则会进 shell history）。
- **任何输出都不含 webhook 或 secret。** 失败尾行只有 `delivery failed (http=500 curl=0) after 3 attempt(s)`——这行可能被 cron 抄进邮件或 syslog。有用例断言 stdout / stderr 都不含 token 与 secret 子串。
- `mktemp -d` + `trap 'rm -rf "$tmp_dir"' EXIT INT TERM`，载荷文件不落盘到固定路径。

### 4.7 JSON 转义

试过 sed 的 `:a;N;$!ba` 惯用法，**在单行输入上不输出任何内容**（`printf '%s' 'single' | sed -e ':a' -e 'N' -e '$!ba' -e 's/\n/\\n/g'` → 空）。改用 awk 单次遍历：

```sh
json_escape() {
  awk 'BEGIN { ORS = "" } { gsub(/\\/, "\\\\"); gsub(/"/, "\\\""); if (NR > 1) printf "\\n"; printf "%s", $0 }'
}
```

用例覆盖引号、反斜杠、换行（`he said "hi" \ and\ntwo lines` 往返一致）与非 ASCII（`データベースに接続できません — データ面が利用不可` 往返一致）。

---

## 5. Task B — 接线 `readiness-cron.sh`

### 5.1 改动

`emit()` 里 syslog 之后加一行：

```sh
emit() {
  logger -t "$TAG" -p "daemon.$1" -- "$2" 2>/dev/null || true
  if [ "$NOTIFY" != "0" ]; then
    sh "$NOTIFY_SCRIPT" --text "[$TAG] $2" >/dev/null 2>&1 || true
  fi
}
```

三个触发点（`err` / `notice` / `warning`）自动全覆盖，因为它们都走 `emit()`。

**`|| true` 是关键。** 通知失败不改变本轮判定、不改变退出码、不改变状态文件写入。有用例专门造一个恒失败的 notifier，断言巡检仍 `exit 0`、syslog 有行、状态文件已写。

`READINESS_NOTIFY=0` 可单独关掉通知，保留 syslog——有用例断言这种情况下 syslog 照常但通知 0 条、状态照写。

### 5.2 为什么不需要额外限流

3E 的状态机已经保证「只在状态变化时说话 + 每 12 次（1 小时）一次心跳」。最坏情况是每小时 1 条，远低于飞书的 5 次/秒、100 次/分钟。

### 5.3 8 个新用例

| 用例                 | 断言                                                       |
| -------------------- | ---------------------------------------------------------- |
| 故障开始             | 恰好 1 条，含 `--text` / `jpqm-readiness` / `status=error` |
| 恢复                 | 恰好 1 条，含 `recovered` / `after 9 checks`               |
| 健康稳态             | 0 条                                                       |
| 心跳之间             | 0 条                                                       |
| 心跳本身             | 1 条，含 `still`                                           |
| `READINESS_NOTIFY=0` | syslog 照常、通知 0 条、状态照写                           |
| notifier 恒失败      | 巡检 `exit 0`、syslog 有行、状态已写                       |
| notifier 文件不存在  | 同上                                                       |

---

## 6. Task C — 测试手法

### 6.1 为什么假 webhook 是子进程

**这是本轮最值得记的一条。** 第一版测试让 vitest 进程内起 `createServer`，脚本通过 `bash -c` 跑在 WSL 里——**WSL2 有独立的网络命名空间，WSL 内的 curl 连不上 Windows 进程的 `127.0.0.1`**。表现为每个用例都要等满 curl 超时 ×3 次重试。

解法：把假服务器也做成子进程，`spawn(shell, ['-c', command])`，`shell = isWindows ? 'bash' : 'sh'`。服务器监听 `0`（临时端口），把端口写文件，测试轮询等它出现；每个请求体 append 到日志文件，断言就是读文件。

这样在 Linux CI 上不需要任何改动——`shell` 退化成 `sh`，一切仍在同一命名空间。

顺带记一条同源教训：**同一进程内既跑服务器又跑客户端时，子进程必须异步 `spawn`。** 第一版验证脚本用 `spawnSync`，阻塞了 Node 事件循环，假服务器根本无法应答，每个检查都等满超时。

### 6.2 假服务器行为

由 `modeFile` 控制，每个用例切换：

| mode         | 响应                             |
| ------------ | -------------------------------- |
| `ok`         | 200 `{"code":0,"msg":"success"}` |
| `rate-limit` | 200 `{"code":9499}`              |
| `bad-sign`   | 200 `{"code":19021}`             |
| `http-500`   | 500 `boom`                       |

### 6.3 真实执行证据

除单测外，另用 `var/tmp-3f-run-wsl.mjs` 在 WSL 内整体跑了一遍（真实 curl → 真实 HTTP 服务器，无出站网络），13 项全 PASS。其中三项是单测覆盖不到的真实链路：

```text
[PASS] signature matches independent HMAC
[PASS] .env fallback keeps "=" padding in the secret   (secret 以 = 结尾仍验签成功)
[PASS] non-ASCII text survives
```

---

## 7. 给 Owner 的交接

### 7.1 填哪里

在服务器的 `/opt/jpqm/deploy/.env` 里加两行（本地是 `deploy/.env`，已被 `.gitignore` 忽略）：

```bash
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/<你的 token>
FEISHU_SIGN_SECRET=<机器人开了签名校验才填，没开就留空>
```

- 只填 `FEISHU_WEBHOOK` → 不签名，直接发
- 两个都填 → 带 `timestamp` + `sign`
- `FEISHU_WEBHOOK` 留空 → 不发飞书，行为与 3E 完全一致

### 7.2 自检

```bash
cd /opt/jpqm && sh scripts/notify-feishu.sh --test
```

**判据**：飞书群收到一条 `jpqm readiness self-check: ...`，命令退出码 `0`。

失败时退出码 `1`，stderr 会说明原因（`FEISHU_WEBHOOK is not configured` / `delivery failed (http=... curl=...) after N attempt(s)`）。**错误信息里不会出现地址或密钥**——这是刻意的，那行可能进 syslog。

### 7.3 之后会发生什么

cron 已经在跑（3E 装的）。填完凭据不需要改 crontab——`readiness-cron.sh` 会自动开始调用通知脚本。

想看效果，最省事的办法是故意让探针失败一次，或等下一次真实故障。

---

## 8. 完整测试结果

全部真实执行：

| 命令                                              | 结果                                                                 | EXIT |
| ------------------------------------------------- | -------------------------------------------------------------------- | ---- |
| `pnpm run typecheck`                              | 无输出                                                               | 0    |
| `pnpm test`                                       | **24 files / 298 tests passed**（3E 基线 23/276，+1 file/+22 tests） | 0    |
| `pnpm run test:verify-gate`                       | 40 pass / 0 fail                                                     | 0    |
| `pnpm run build`                                  | 无输出                                                               | 0    |
| `pnpm run format:check`                           | All matched files use Prettier code style!                           | 0    |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | 无输出                                                               | 0    |
| `pnpm run test:python`                            | 239 passed in 2.44s                                                  | 0    |
| `pnpm run verify:all`（两 DB 变量均设）           | `{"status":"passed","passed":6,"failed":0}`                          | 0    |
| `pnpm run smoke:docker`                           | 11 项 ok，末行 `docker smoke passed`                                 | 0    |

`smoke:docker` 一开始就重定向到 `var/smoke-3f.log`（3E 教训：终端缓冲会让人误判卡死），约 3 分钟。

### 8.1 format:check 的一次波动

首次跑 `format:check` 是 EXIT 1，唯一失败文件是 `docs/audit/DEEPSEEK_HARNESS_SPRINT_3F_TASK.md`——本轮新写的任务文档还没格式化。`prettier --write` 后复跑全绿。

这不是既有问题（3D 已把 3A 文档格式收口），是本轮自己漏跑了一次格式化。已修正。

### 8.2 prettier 对 sh / env 文件无解析器

`prettier --write` 对 `scripts/notify-feishu.sh`、`scripts/readiness-cron.sh`、`deploy/env.prod.example` 报 `No parser could be inferred`。这是预期的——它们不在 `format:check` 的 glob 集里（glob 只含 `scripts/**/*.{mjs,ts}`）。shell 脚本的正确性由 `sh -n` 与真实执行保证。

---

## 9. 回归护栏

新增测试锁住的行为：

1. 明文投递（`msg_type=text` + `content.text` 精确相等）
2. `--stdin` 模式
3. `--test` 自检文案含 `self-check`
4. 缺 webhook 时退出码 1 且 stderr 明确
5. 签名与独立 HMAC 实现逐字相等
6. 无 secret 时 payload 不含 `timestamp` / `sign`
7. HTTP 5xx 重试 3 次后失败，stderr 含 `after 3 attempt(s)`
8. `code=9499` 重试 3 次
9. `code=19021` 不重试（只发 1 次）
10. 引号 / 反斜杠 / 换行 JSON 往返一致
11. 非 ASCII 往返一致
12. webhook 与 secret 不出现在任何输出
13. `.env` 回退保留 base64 的 `=` 填充
14. 巡检三个触发点都通知
15. `READINESS_NOTIFY=0` 只留 syslog
16. notifier 失败/缺失不影响巡检退出码与状态文件

### 9.1 真实执行抓出的缺陷

**计数器差一。** 首轮真实执行第 11 项显示 `after 4 attempt(s)`，而 `MAX_ATTEMPTS=3`、实际只发了 3 次请求——循环耗尽时 `attempt` 被自增到 4。

单测当时没抓到这个，因为断言写的是「重试 3 次」看的是请求数量（对的），没断言 stderr 里的次数文本。修法：新增 `attempts_made` 计数器，每轮进入时自增，失败尾行用它。

修复后重跑 13/13，第 7、11 项均显示 `after 3 attempt(s)`。验证脚本第 7 项补断言 `stderr.includes('after 3 attempt(s)')`，单测也加了同样的断言。

**教训**：真实执行与单测的差异往往在「措辞」而不是「逻辑」——逻辑对了，报出去的话可能还是错的。

---

## 10. 未处理问题

1. **通知失败本身没有二次告警。** 如果 webhook token 失效，飞书发不出去，syslog 里也只有一行 `delivery failed`。这是有意的最小实现——真要兜底得引入另一个通知渠道，属于新授权。
2. **没有「通知已发送」的确认回执。** 脚本只知道自己发出去了、飞书回了 `code=0`，不追踪人有没有看到。
3. **签名算法依赖 openssl。** Ubuntu 24.04 自带，但如果哪天换成精简镜像或 alpine 基础，需要确认 openssl 还在。
4. **`.env` 的读取假设键名唯一。** `tail -n 1` 取最后一个，重复定义时后写的生效——与 compose 的行为一致，但没写进文档。
5. **未做 shellcheck。** 本机没装，`sh -n` 只查语法不查可疑写法。

---

## 11. 风险

| 风险                      | 影响                                   | 缓解                                                               |
| ------------------------- | -------------------------------------- | ------------------------------------------------------------------ |
| webhook token 泄露        | 任何人都能往群里发消息                 | 只存 `deploy/.env`（gitignored）；脚本输出脱敏；不进 shell history |
| 飞书限流                  | 告警延迟或丢失                         | 状态机已把频率压到每小时 1 条上限，远低于阈值                      |
| 通知脚本自身故障          | 告警只到 syslog                        | `\|\| true` 保证不影响巡检；`--test` 可随时自检                    |
| `FEISHU_SIGN_SECRET` 配错 | 全部发送失败，但错误信息不说「签名错」 | `code=19021` 不重试、立即报出；`--test` 能一次验通                 |
| 宿主机缺 openssl          | 开了签名校验时无法发送                 | 脚本 `command -v openssl` 前置检查，缺了立刻报错而不是静默失败     |
| `.env` 被误提交           | 凭据进仓库                             | `.gitignore:4` 已忽略；`deploy/env.prod.example` 只放空占位        |

---

## 12. 下一步建议

**P1（建议）：通知渠道健康自检纳入运维例程。** 现在「通知能不能发出去」只有 `--test` 这一个手动入口。可以把它挂进 `ops:daily`（每日一次自检，失败则当天的日报标红），这样 token 过期不会等到真实故障时才发现。成本很低——一个 script 条目 + 一条日报判据。

**P2：`/pass-rate/` 单资格故障的观测。** 3A 定了保留方案 A（整页 503），但至今没有数据支撑「到底有多少 503 是单资格故障引起的」。这是将来切方案 B 的唯一依据，也是 3A 报告 §7.5 留下的触发条件。做法是在 `/pass-rate/` 的 catch 里记一行「哪个 slug 失败」，写 syslog 或结构化日志。

**P3：G-15 测试缺口。** `apps/web/src/server.ts` 19 条路由没有进程级测试。3C 的配置门禁、3A 的 sitemap 错误形态都已经有覆盖，剩下的是纯渲染路由。

**P4：`/ready` 的外部可观测性。** 需要先决定是否接受把 DB 状态暴露给第三方监控——这是产品决策，不是技术决策。

---

## 13. 停止声明

Sprint 3F 到此结束。本轮**未**进入 Sprint 3G / 4，**未**触碰：

- `/pass-rate/` 方案 B（Owner 已明确保留方案 A）
- G-15 测试缺口
- `/ready` 外部可观测性
- 首页 / 内链 / 资格页改版
- `services/api/**`、`apps/web/**`、`deploy/docker-compose.prod.yml`、`Caddyfile`、`Dockerfile`

运行时行为零改动。本机未装 crontab、未向真实飞书群发送任何消息（无凭据，全部验证走本地假 webhook）。

下一步由 Owner 根据本报告决定。
