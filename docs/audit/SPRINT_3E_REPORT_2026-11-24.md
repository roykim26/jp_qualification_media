# Sprint 3E 执行报告 — 让数据面故障自己发声

**日期：** 2026-11-24
**项目：** ShikakuCheck
**仓库：** `jp_qualification_media`
**执行工具：** DeepSeek Harness
**任务文档：** `docs/audit/DEEPSEEK_HARNESS_SPRINT_3E_TASK.md`
**Owner 决策：** m01525「按推荐执行」= 采纳 Sprint 3D 报告 §11 的 P1 选项 (a)

---

## §1 执行摘要

Sprint 3D 造好了探针，但**没人看指针**。数据面挂掉时的传播路径仍是：

```text
数据库挂 / 配置错 → 用户访问 /pass-rate/ 得到 503 → 用户报障 → 运维才知道
```

本轮加了一个**宿主机侧的观察者**，把它改成：

```text
数据库挂 / 配置错 → cron 5 分钟内发现 → syslog 留一条带状态与时长的记录
```

**没有改变任何运行时行为**：`/health` 一字未动、`/ready` 一字未动、compose healthcheck 未接、Caddy 未暴露、API 与 web 未改。

| 维度     | 改前                   | 改后                                         |
| -------- | ---------------------- | -------------------------------------------- |
| 故障发现 | 用户报障               | 5 分钟内 syslog                              |
| 故障时长 | 不可知                 | 恢复时写明「持续 N 次（约 N×5 分钟）」       |
| 日志量   | （无）                 | 故障开始 1 条 + 每小时 1 条心跳 + 恢复 1 条  |
| 容器没起 | 与「数据面不可达」混淆 | 独立状态 `unreachable` + `probe did not run` |
| 通知渠道 | —                      | syslog（tag `jpqm-readiness`）               |

真实执行证据（WSL，dash + util-linux 2.39.3，与 VPS Ubuntu 24.04 同源）：

```text
Nov 24 22:52:38 Jin-PC jpqm-readiness[1041]: status=error message=connect ECONNREFUSED 127.0.0.1:5432
Nov 24 22:52:38 Jin-PC jpqm-readiness[1095]: recovered: status=ready after 3 checks
Nov 24 22:52:38 Jin-PC jpqm-readiness[1136]: status=unreachable message=probe did not run: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

---

## §2 Git 状态

### 2.1 开工前基线

```text
分支：chore/phase1-baseline
HEAD：031e9af（工作树干净）
链：a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438 → 9bc946f → 9fc9c72 → f99e475 → 3142605 → 2afa33d → 031e9af
```

### 2.2 改动清单

| 文件                                            | 类型 | 行数   |
| ----------------------------------------------- | ---- | ------ |
| `scripts/readiness-cron.sh`                     | 新增 | 110    |
| `tests/readiness-cron.test.ts`                  | 新增 | 229    |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3E_TASK.md` | 新增 | 164    |
| `docs/audit/SPRINT_3E_REPORT_2026-11-24.md`     | 新增 | 本文件 |
| `docs/runbook.md`                               | 改   | +62    |
| `.gitattributes`                                | 改   | +1     |

### 2.3 提交

见 §2.4（hash 在报告内引用存在循环依赖，故由 docs commit 收口，沿用 3A/3B/3C/3D 先例）。

### 2.4 提交结果

| commit     | 内容               |
| ---------- | ------------------ |
| `TBD-CODE` | 代码 + 测试 + 文档 |
| `TBD-DOCS` | 报告 hash 收口     |

---

## §3 交付物

1. **`scripts/readiness-cron.sh`** —— 宿主机 cron 包装脚本（POSIX sh）
2. **`tests/readiness-cron.test.ts`** —— 12 个行为测试，真实执行脚本
3. **`docs/runbook.md`** 新增「定时探针与 syslog 告警（VPS root crontab）」节
4. **`.gitattributes`** 补 `*.sh text eol=lf`
5. 本报告

---

## §4 Task A：包装脚本

### 4.1 为什么不能直接在 crontab 里写一行

```cron
*/5 * * * * cd /opt/jpqm && docker compose exec -T api node scripts/check-readiness.mjs --json >> /var/log/x.log
```

三个问题：

1. **每 5 分钟一条。** 两小时故障 = 24 条重复行，一天的故障 = 288 条。「故障开始」和「恢复」两个真正重要的时刻被淹没。
2. **没有时间维度。** 日志里只有 `status`，看不出已经坏了多久。
3. **cron 有输出会尝试发邮件。** 探针正常也打 JSON，等于每 5 分钟一封。

包装脚本的职责因此是：**只在状态变化时写 syslog，故障持续时按小时留心跳。**

### 4.2 状态机

```text
unknown ──(首次)──► ready / 非 ready
ready   ──(变坏)──► 写 err，进入 failed
failed  ──(第 N 次)─► 每 HEARTBEAT_EVERY 次写一条 warning
failed  ──(恢复)───► 写 notice，带故障持续次数
ready   ──(稳态)───► 不写
```

状态文件 `var/readiness/last-status`（gitignored，与 `var/patrol/` 同约定）记两行：`status` 与「连续非 ready 次数」。

### 4.3 syslog 约定

`logger -t jpqm-readiness -p daemon.<priority> -- <message>`：

| 事件         | priority  | 实际输出（真实执行）                                       |
| ------------ | --------- | ---------------------------------------------------------- |
| 故障开始     | `err`     | `status=error message=connect ECONNREFUSED 127.0.0.1:5432` |
| 故障心跳     | `warning` | `still status=error message=... for 12 checks`             |
| 恢复         | `notice`  | `recovered: status=ready after 3 checks`                   |
| 探针跑不起来 | `err`     | `status=unreachable message=probe did not run: ...`        |

### 4.4 实现约束与理由

1. **POSIX sh（`#!/bin/sh`），不是 bash。** VPS 的 `/bin/sh` 是 dash；写 dash 兼容的脚本才能在 WSL 里用同一解释器真实验证。
2. **`set -eu`，但显式接住 `docker compose exec` 的退出码。** 探针在非 ready 时**故意**退出 1，这不是脚本错误。
3. **不用 jq。** Ubuntu 24.04 默认没有 jq。用 `sed` 从 JSON 取字段。
4. **永远 `exit 0`。** cron 的退出码只会触发 MTA 邮件；通知渠道是 syslog。
5. **区分「容器没起」与「数据面不可达」。** 解析不出 `status` 字段时记为 `unreachable` 并写明 `probe did not run`，而不是假装成 `error`。

### 4.5 真实执行中被发现并修掉的缺陷

**贪婪匹配把 JSON 尾巴吞进了 syslog。**

首版用 `sed -n 's/.*"message": *"\(.*\)".*/\1/p'`。POSIX sed 没有惰性量词，`\(.*\)` 会一路吃到最后一个引号，于是第一条真实 syslog 长这样：

```text
status=error message=connect ECONNREFUSED 127.0.0.1:5432", "durationMs
```

测试当时是绿的——因为断言只查了 `toContain('ECONNREFUSED')`。**是真实执行（看 `journalctl`）暴露了它，不是测试。** 修法：`\([^"]*\)`，并在测试里加两条断言（`not.toContain('durationMs')` + 精确匹配整段 message）。修复后：

```text
Nov 24 22:52:38 Jin-PC jpqm-readiness[1041]: status=error message=connect ECONNREFUSED 127.0.0.1:5432
```

这条记入 §9.1，因为它说明「测试绿」不等于「输出对」。

---

## §5 Task B：测试

### 5.1 手法

包装脚本是 sh，但测试用 vitest 跑——**真实执行脚本**，而不是在 JS 里重写一遍逻辑：

- 假 `docker` 写进临时目录并经 `PATH` 前置，决定「探针报了什么」
- 假 `logger` 同样前置，把收到的参数追加到临时文件，测试读它
- 断言两件事：syslog 收到了什么、状态文件被写成了什么

Windows 上通过 `bash -c`（WSL）执行，因为 WSL 的 dash 与 util-linux `logger` 与 VPS 同源。

### 5.2 用例（12 个，全过）

| #   | 场景                       | 断言                                                                                        |
| --- | -------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | 首次运行，ready            | 不写 syslog，状态 `ready\n0`                                                                |
| 2   | 首次运行，error            | 1 条 `daemon.err`，含 `status=error`、`message=...`，**不含 `durationMs`**，状态 `error\n1` |
| 3   | ready → error              | 1 条 `daemon.err`（故障开始）                                                               |
| 4   | error → error（第 2 次）   | 不写（未到心跳）                                                                            |
| 5   | error → error（第 12 次）  | 1 条 `daemon.warning`，含 `for 12 checks`                                                   |
| 6   | 自定义 `HEARTBEAT_EVERY=2` | 心跳按新间隔触发                                                                            |
| 7   | error → ready              | 1 条 `daemon.notice`，含 `recovered`、`after 37 checks`                                     |
| 8   | ready → ready              | 不写                                                                                        |
| 9   | docker 命令失败            | `daemon.err` + `status=unreachable` + `probe did not run`                                   |
| 10  | 输出无 status 字段         | 同上，不崩溃                                                                                |
| 11  | unreachable → ready        | `recovered: ... after 5 checks`（故障计数不丢）                                             |
| 12  | 状态目录不存在             | 自动创建                                                                                    |

### 5.3 测试中被发现并修掉的问题

**WSL 首次进程启动超过 vitest 默认 5 秒超时。** 第一个用例 5191ms 超时，其余 11 个都在 300ms 左右——WSL 虚拟机冷启动的一次性成本，不是脚本慢。修法：`beforeAll` 里跑一次 `bash -c true` 预热（120s 超时），单用例恢复正常。

---

## §6 Task C：文档

`docs/runbook.md` 在「数据面就绪探针（ready:check，只读）」节之后新增「定时探针与 syslog 告警（VPS root crontab）」：

1. **为什么需要包装脚本**（三个问题）
2. **状态机表**（7 种情况的 syslog 行为）
3. **安装**（`(crontab -l 2>/dev/null; echo '*/5 * * * * ...') | crontab -`，与既有备份 crontab 同一手法）
4. **判据**（`crontab -l | grep`、`journalctl -t jpqm-readiness`、状态文件；并写明「健康稳态下 journalctl 是空的，这是设计不是故障」）
5. **查询与调优**（`-p err` / `-p warning`、环境变量表）
6. **卸载**
7. **明确不接 healthcheck、不暴露 Caddy**（指向上一节理由）

同时明确记录这是**唯一一处打破「不装定时任务」惯例**的地方——2026-11-11 那条拍板针对的是日检，探针告警由 m01525 另行批准。

---

## §7 真实执行证据

### 7.1 WSL 实跑（`var/tmp-3e-run.sh`，假 docker，真 logger）

```text
=== run 1: first observation, failing ===
exit=0 state=error 1
=== run 2: still failing, below heartbeat interval ===
exit=0 state=error 2
=== run 3: still failing, HEARTBEAT_EVERY=2 -> heartbeat ===
exit=0 state=error 3
=== run 4: recovery ===
exit=0 state=ready 0
=== run 5: healthy steady state (must be silent) ===
exit=0 state=ready 0
=== run 6: docker itself is broken ===
exit=0 state=unreachable 1
```

六次运行退出码全 0，状态机迁移正确。

### 7.2 真实 syslog 捕获（`journalctl -t jpqm-readiness`）

```text
Nov 24 22:51:37 Jin-PC jpqm-readiness[1417]: status=error message=connect ECONNREFUSED 127.0.0.1:5432", "durationMs
Nov 24 22:51:37 Jin-PC jpqm-readiness[1471]: recovered: status=ready after 3 checks
Nov 24 22:51:37 Jin-PC jpqm-readiness[1512]: status=unreachable message=probe did not run: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

（第一行即 §4.5 的缺陷现场；修复后重跑：）

```text
Nov 24 22:52:38 Jin-PC jpqm-readiness[1041]: status=error message=connect ECONNREFUSED 127.0.0.1:5432
Nov 24 22:52:38 Jin-PC jpqm-readiness[1095]: recovered: status=ready after 3 checks
Nov 24 22:52:38 Jin-PC jpqm-readiness[1136]: status=unreachable message=probe did not run: Cannot connect to the Docker daemon at unix:///var/run/docker.sock
```

### 7.3 环境核对

| 项             | 值                                                                                    |
| -------------- | ------------------------------------------------------------------------------------- |
| WSL `/bin/sh`  | dash（与 VPS Ubuntu 24.04 一致）                                                      |
| WSL `logger`   | `/usr/bin/logger`，util-linux **2.39.3**                                              |
| WSL `/dev/log` | `→ /run/systemd/journal/dev-log`，journald 正常接收                                   |
| shellcheck     | **未安装**（`command -v shellcheck` 无输出），故未跑静态检查；以 `sh -n` 语法检查替代 |
| 行尾           | `scripts/readiness-cron.sh` 提交前为纯 LF（`CRLF=0 LF=124`）                          |

### 7.4 行尾保护

`.gitattributes` 原先只把 `*.{ts,mjs,js,json,yml,yaml,md,sql,py,toml}` 钉为 `eol=lf`，**`.sh` 未列**，而本机 `core.autocrlf=true`。若不处理，VPS 上的 `#!/bin/sh\r` 会报 `bad interpreter`。已补 `*.sh text eol=lf`，`git check-attr` 确认 `text: set` / `eol: lf`。

---

## §8 完整测试结果

| 命令                                              | 结果                                                                 | EXIT  |
| ------------------------------------------------- | -------------------------------------------------------------------- | ----- |
| `pnpm run typecheck`                              | 无错误                                                               | **0** |
| `pnpm test`                                       | **23 files / 276 tests** 全过（3D 基线 22/264，+1 file / +12 tests） | **0** |
| `pnpm run test:verify-gate`                       | 40 pass / 0 fail                                                     | **0** |
| `pnpm run build`                                  | 无错误                                                               | **0** |
| `pnpm run format:check`                           | `All matched files use Prettier code style!`                         | **0** |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | 无输出                                                               | **0** |
| `pnpm run test:python`                            | 239 passed in 2.44s                                                  | **0** |
| `pnpm run verify:all`                             | `{"status":"passed","qualifications":6,"passed":6,"failed":0}`       | **0** |
| `pnpm run smoke:docker`                           | 11 项全 ok，末行 `docker smoke passed`                               | **0** |

`smoke:docker` 的 11 项：

```text
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

`format:check` 自 `2afa33d` 恢复全绿后**本轮保持全绿**（新增的 `.sh` 不在 prettier glob 内，新增的 `.ts` 与 `.md` 均已格式化）。

---

## §9 回归护栏

1. **`/health` 与 `/ready` 未被触碰。** `git diff` 中无 `services/api/**` 任何文件；`/health` 仍返回 `{status:'ok',stage:0}`。
2. **compose healthcheck 未接 `/ready`。** `deploy/` 无 diff。依赖链 `db → api(/health) → web → caddy` 保持原样，数据库抖动不会导致整站下线。
3. **Caddy 未暴露 `/ready`。** `deploy/caddy/Caddyfile` 无 diff。
4. **`Dockerfile` 未改。** 镜像里已有 `COPY scripts ./scripts`，包装脚本不需要进镜像（它在宿主机跑）。
5. **`scripts/check-readiness.mjs` 未改。** 探针本体是稳定契约，包装脚本只是消费者。
6. **`smoke:docker` 通过**证明容器内 `/ready` 与全部页面行为未变。
7. **`verify:all` 6/6** 证明数据面与 web 渲染未变。
8. **无新增 npm 依赖**（`package.json` 无 diff）。

### 9.1 被真实执行（而非测试）抓出的缺陷

**贪婪 sed 把 JSON 尾巴写进 syslog**（详见 §4.5）。测试当时是绿的，因为断言只查了子串。教训：**对「人读的日志格式」必须断言整段内容，不能只断言关键词**。已加两条断言锁死。

---

## §10 未处理问题

1. **告警只到 syslog，没有主动推送。** 若 VPS 上没人看 journald、也没配 rsyslog 转发，故障仍可能没人注意到。升级到邮件/Slack 需要新的外部依赖与凭据，属 Owner 决策（3D 报告 §11 的 b/c 选项）。
2. **`/ready` 仍不对外。** 外部监控（UptimeRobot 等）无法探到。若要接，需先解决「暴露内部状态」与「公网依赖」两个问题。
3. **状态文件是本地文件。** 容器重建不影响（它在宿主机），但若换了机器或清了 `var/`，故障计数会从头开始——表现为「恢复时报告的次数偏小」或首次运行静默。这是可接受的降级。
4. **cron 未在本机安装。** 按任务文档 §3.2 禁止，只在 WSL 用假 `docker` 验证了脚本行为。**VPS 上的真实安装与首次触发未验证**（无 VPS 访问）。
5. **shellcheck 未跑。** 环境未安装，以 `sh -n` 语法检查 + 真实执行替代。
6. **G-15 测试缺口仍在**（`apps/web/src/server.ts` 的 19 条路由无进程级测试），本轮未触及。

---

## §11 风险

| 风险                                              | 影响                           | 缓解                                                                                                         |
| ------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `docker compose exec` 在 cron 环境下路径/权限不同 | 探针跑不起来                   | 脚本会记 `unreachable` + `probe did not run`，故障本身仍可见；runbook 给了手工触发验证步骤                   |
| cron 无 TTY 导致 compose 报错                     | 同上                           | 已用 `-T`                                                                                                    |
| 状态文件写失败（磁盘满/权限）                     | 每次都当作首次运行，重复写 err | 写失败被 `                                                                                                   |     | true` 吞掉，但 syslog 仍会写；表现为「故障期间每次都是 err」而非静默 |
| 心跳间隔与 cron 周期不同步                        | 心跳时间不精确                 | 心跳按「次数」而非「时间」计算，cron 频率变化时需同步调 `HEARTBEAT_EVERY`；runbook 已写明默认 12 次 = 1 小时 |
| `logger` 不存在（极简镜像/容器）                  | 消息丢失                       | 本脚本跑在宿主机，Ubuntu 24.04 自带 util-linux；`                                                            |     | true` 保证不因 logger 缺失让 cron 报错                               |
| 日志被 journald 轮转/丢弃                         | 故障记录丢失                   | 属 syslog 固有特性；需要长期留存时应配 rsyslog 转发（未做）                                                  |

---

## §12 下一步建议

按优先级：

**P1（建议下一轮）：把告警接到人。**
当前故障会进 syslog，但**前提是有人看 journald**。最小可行做法：在 VPS 上配一条 rsyslog 规则把 `jpqm-readiness` 的 `err` 级别转发到一个已有的通知渠道（邮件或 webhook）。这需要 Owner 提供渠道与凭据，属新授权。

**P2：`/ready` 的外部可观测性。**
若要接外部监控，需先决定「是否接受把数据库状态暴露给第三方」。若接受，最小做法是在 Caddy 上加一条仅内网/带 token 的路由，而不是公开暴露。

**P3：G-15 测试缺口。**
`apps/web/src/server.ts` 的 19 条路由无进程级测试。这是从 Phase 0 就存在的结构性缺口，与可靠性无直接关系，但会让后续每次改 server.ts 都缺少护栏。

**P4：`/pass-rate/` 方案 A 的观测。**
Owner 已决定保留整页 503。`/ready` 现在能区分「整体不可用」与「配置缺失」，但**仍不能区分「单资格故障导致整页 503」**。若将来要切方案 B，需要先有「哪个资格失败」的观测数据——目前没有。

---

## §13 停止声明

本轮**只做**探针的定时化与 syslog 告警。已完成，停止。

**未做**（等 Owner 根据本报告决定）：

- 告警升级到邮件/Slack/webhook
- `/ready` 公网或内网暴露
- compose healthcheck 接入
- G-15 测试缺口
- `/pass-rate/` 方案 B
- 首页 / SEO / 内链 / 新资格 / 宅建数据

未进入 Sprint 3F / Sprint 4。
