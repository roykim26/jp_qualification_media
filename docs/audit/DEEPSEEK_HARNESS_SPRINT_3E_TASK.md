# DeepSeek Harness — Sprint 3E Task

## 让数据面故障自己发声：`/ready` 的定时探针与 syslog 告警

**项目：** ShikakuCheck
**仓库：** `jp_qualification_media`
**执行工具：** DeepSeek Harness
**前置：** Sprint 3D（`f99e475`）已交付 `scripts/check-readiness.mjs`，`format:check` 已由 `2afa33d` 恢复全绿
**Owner 决策（m01525「按推荐执行」）：** 采纳 Sprint 3D 报告 §11 的 **P1 选项 (a)** —— VPS cron 每 5 分钟跑一次探针，失败写 syslog。

---

## §0 核心目标

Sprint 3D 造了指针，但**没人看指针**。当前生产形态下，数据面挂掉的传播路径是：

```text
数据库挂 / 配置错
→ 用户访问 /pass-rate/ 得到 503
→ 用户报障
→ 运维才知道
```

本轮把它改成：

```text
数据库挂 / 配置错
→ cron 5 分钟内发现
→ syslog 留一条带状态的记录
→ 运维巡检 / 日志告警时看到
```

**不改变任何运行时行为。** 不接 compose healthcheck、不改 `/health`、不改 Caddy、不改 API、不改 web。只新增一个**宿主机侧的观察者**。

---

## §1 执行前必读

1. `docs/audit/SPRINT_3D_REPORT_2026-11-24.md` §11（P1 选项 (a) 的原文推荐）
2. `docs/audit/DEEPSEEK_HARNESS_SPRINT_3D_TASK.md` §3.3（为什么 `/ready` 不接 compose healthcheck）
3. `scripts/check-readiness.mjs`（探针本体、退出码契约、`--json` 输出形状）
4. `docs/runbook.md`「数据面就绪探针（ready:check，只读）」节 + `### 例行备份（VPS root crontab）` 节
5. `deploy/docker-compose.prod.yml`（`api` 服务名、容器内 `/app` 工作目录、`/ready` 在容器内是 `127.0.0.1:4100`）
6. `Dockerfile`（`COPY scripts ./scripts` —— 脚本已在镜像里，容器内可直接调用）
7. `docs/runbook.md:427-433`（既有 crontab 安装手法与判据写法）

---

## §2 Git 安全检查

```bash
git status --short      # 必须干净
git log --oneline -1    # 期望 031e9af
```

基线链：`a319d46 → 9a42cb4 → 4796f8b → 013e680 → 864535e → f09e438 → 9bc946f → 9fc9c72 → f99e475 → 3142605 → 2afa33d → 031e9af`

---

## §3 硬边界

### 3.1 允许修改

| 文件                                            | 类型                       |
| ----------------------------------------------- | -------------------------- |
| `scripts/readiness-cron.sh`                     | 新增：宿主机 cron 包装脚本 |
| `tests/readiness-cron.test.ts`                  | 新增：包装脚本的行为测试   |
| `docs/runbook.md`                               | 改：安装与判据小节         |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3E_TASK.md` | 新增：本文档               |
| `docs/audit/SPRINT_3E_REPORT_2026-11-24.md`     | 新增：执行报告             |

### 3.2 明确禁止

- 修改 `services/api/**`（`/ready` 实现一字不动）
- 修改 `/health` 的语义或响应体
- 修改 `deploy/docker-compose.prod.yml`（**不得把 `/ready` 接进 healthcheck**）
- 修改 `deploy/caddy/Caddyfile`（**不得把 `/ready` 暴露到公网**）
- 修改 `Dockerfile`
- 修改 `apps/web/**`
- 修改 `scripts/check-readiness.mjs`（探针本体已定稿；包装脚本只消费它的输出）
- 新增 npm 依赖
- 在本机真的安装 crontab
- 进入 Sprint 3F / 4 / 首页优化 / 新资格建设

### 3.3 为什么是「宿主机 cron + docker compose exec」

**不在容器里跑 cron。** 容器职责单一（只跑 web/api），塞进 cron 会让镜像承担调度职责，且容器重启后 cron 状态丢失。

**不在宿主机直连数据库。** VPS 的 db 端口不对宿主暴露（compose 里 db 没有 `ports`），宿主机也没有 `DATABASE_URL`。探针必须走 API 的 `/ready`。

**宿主机可能没有 node。** runbook 里 access-report 的既有做法是 `docker compose exec -T web node scripts/access-report.mjs`，本轮照抄：`docker compose exec -T api node scripts/check-readiness.mjs`。`-T` 是必须的（cron 没有 TTY）。

**`/ready` 在容器内是 `127.0.0.1:4100`。** 这是容器自己的回环，不需要走 compose 网络，也不依赖 `API_HOST`。

---

## §4 Task A：包装脚本 `scripts/readiness-cron.sh`

### 4.1 为什么要包装脚本，而不是直接在 crontab 里写一行

直接写：

```cron
*/5 * * * * cd /opt/jpqm && docker compose exec -T api node scripts/check-readiness.mjs --json >> /var/log/x.log
```

问题有三个：

1. **每 5 分钟一条日志。** 一次持续 2 小时的故障 = 24 条重复记录；持续一天 = 288 条。真正重要的「故障开始」和「恢复」两个时刻被淹没。
2. **没有时间维度。** 日志里只有 `status`，看不出「已经坏了多久」。
3. **cron 在命令有输出时会发邮件**（若 MTA 存在）。探针正常也打 JSON，等于每 5 分钟一封邮件。

所以包装脚本的职责是：**只在状态发生变化时写 syslog，并在故障持续时按小时留心跳。**

### 4.2 状态机

```text
             ┌──────────── 每 5 分钟 ────────────┐
             │                                   │
  unknown ──►│ ready ──(变坏)──► failed ──(恢复)──► ready
             │   │                  │
             │   └─ 不写日志         ├─ 每 12 次（1 小时）写一次心跳
             │                      └─ 状态变化立刻写
```

- `prev == ready` 且 `now == ready` → **不写**
- `prev != now` → **立刻写**（故障开始写 `err`，恢复写 `notice`）
- `prev == now == 非 ready` → 每 `HEARTBEAT_EVERY` 次（默认 12，即 1 小时）写一次心跳，带「已持续 N 次」
- `prev == unknown`（首次运行）→ 只在非 ready 时写，避免部署当天误报「恢复」

### 4.3 syslog 约定

用 `logger`，tag 固定为 `jpqm-readiness`，便于 `journalctl -t jpqm-readiness` 或 rsyslog 过滤：

| 事件             | priority         | 示例                                                                     |
| ---------------- | ---------------- | ------------------------------------------------------------------------ |
| 故障开始         | `daemon.err`     | `status=error database=error message="connect ECONNREFUSED ..." url=...` |
| 故障持续（心跳） | `daemon.warning` | `still status=error for 12 checks`                                       |
| 恢复             | `daemon.notice`  | `recovered: status=ready after 37 checks (185 min)`                      |
| 包装脚本自身故障 | `daemon.err`     | `probe did not run: docker compose exec failed`                          |

### 4.4 关键实现约束

1. **POSIX sh**（`#!/bin/sh`），不是 bash。VPS 上 `/bin/sh` 是 dash，与 WSL 一致，便于本地验证。
2. **`set -eu`**，但 `docker compose exec` 的退出码要显式接住（探针失败时退出 1 是**预期行为**，不是脚本错误）。
3. **不用 jq。** Ubuntu 24.04 默认没装 jq。用 `sed` 从 JSON 里取 `"status": "xxx"` 与 `"message": "..."`。
4. **不用 `--json` 之外的解析路径。** 探针的 `--json` 输出是稳定契约（`check-readiness.d.mts` 定义了形状）。
5. **状态文件**：`var/readiness/last-status`（仓库内、gitignored、与 `var/patrol/` 同约定），可用 `READINESS_STATE_FILE` 覆盖。
6. **失败不得让 cron 报错刷屏**：脚本自身永远 `exit 0`，所有问题都通过 syslog 表达。
7. **`docker compose exec` 失败**（容器没起）与**探针报非 ready**是两种事件，必须区分。

### 4.5 退出码

`exit 0` 永远。cron 的退出码只会触发 MTA 邮件，而本脚本的通知渠道是 syslog。

---

## §5 Task B：测试 `tests/readiness-cron.test.ts`

包装脚本是 sh，但**测试用 Node 跑**（项目已有 vitest，且 WSL/bash 在开发机可用）。

测试手法：把 `docker` 用 PATH 前置的假命令替换掉，让假 `docker` 输出预置 JSON，然后断言：

1. syslog 收到了什么（用假的 `logger` 捕获参数）
2. 状态文件被写成了什么

### 5.1 必须覆盖的用例

| #   | 场景                          | 断言                                                              |
| --- | ----------------------------- | ----------------------------------------------------------------- |
| 1   | 首次运行，ready               | 不写 syslog，状态文件写 `ready`                                   |
| 2   | 首次运行，error               | 写 `daemon.err`，含 `status=error`，状态文件写 `error`            |
| 3   | ready → error                 | 写 `daemon.err`（故障开始）                                       |
| 4   | error → error（第 2 次）      | **不写**（未到心跳间隔）                                          |
| 5   | error → error（第 12 次）     | 写 `daemon.warning` 心跳，含持续次数                              |
| 6   | error → ready                 | 写 `daemon.notice` 恢复，含故障持续次数                           |
| 7   | ready → ready                 | 不写                                                              |
| 8   | `docker` 命令失败（容器没起） | 写 `daemon.err`，含 `probe did not run`，状态文件写 `unreachable` |
| 9   | JSON 缺 `status` 字段         | 写 `daemon.err`，不崩溃                                           |
| 10  | 自定义 `HEARTBEAT_EVERY`      | 心跳按新间隔触发                                                  |

### 5.2 测试不得依赖真实 docker

假 `docker` 是一个临时目录里的可执行文件，内容 `#!/bin/sh` + 打印预置 JSON。PATH 前置该目录。

### 5.3 测试不得污染真实 syslog

假 `logger` 同理，把收到的参数写到一个临时文件，测试读它。

---

## §6 Task C：文档 `docs/runbook.md`

在「数据面就绪探针（ready:check，只读）」节末尾追加 **「定时探针与 syslog 告警（VPS root crontab）」** 小节：

1. 安装命令（与既有备份 crontab 同一手法）
2. 判据（`crontab -l` 有该行；手工触发一次后 `journalctl -t jpqm-readiness -n 5` 有输出）
3. 状态机说明（为什么不每 5 分钟写一条）
4. syslog 查询命令
5. 卸载命令
6. **明确记录：这是 Owner 在 m01525 拍板的 (a) 选项**，且不暴露 `/ready`、不接 healthcheck

---

## §7 完整测试要求

| 命令                                              | 期望                                      |
| ------------------------------------------------- | ----------------------------------------- |
| `pnpm run typecheck`                              | EXIT 0                                    |
| `pnpm test`                                       | 全过，且总数 > 264（3D 基线）             |
| `pnpm run test:verify-gate`                       | 40 pass / 0 fail                          |
| `pnpm run build`                                  | EXIT 0                                    |
| `pnpm run format:check`                           | **EXIT 0**（3D 已恢复全绿，本轮不得打破） |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | EXIT 0                                    |
| `pnpm run test:python`                            | 239 passed                                |
| `pnpm run verify:all`                             | 6/6                                       |
| `pnpm run smoke:docker`                           | 11 项全 ok                                |

`.sh` 不在 prettier glob 内（`scripts/**/*.{mjs,ts}`），无需格式化；但需保证行尾 LF（`.gitattributes` 已声明 `* text=auto`，`.sh` 未单列——**须确认提交后行尾为 LF**，否则 VPS 上 `#!/bin/sh\r` 会报 `bad interpreter`）。

---

## §8 不允许伪造测试结果

- 包装脚本必须**真的跑起来**（WSL 的 `sh` 与 VPS 的 dash 同源），不能只在 Node 里模拟逻辑
- syslog 断言必须来自**真实执行**的假 `logger`
- 跑不了的项目写 **NOT RUN** + 原因 + 替代验证 + 是否影响验收

---

## §9 完成报告

`docs/audit/SPRINT_3E_REPORT_2026-11-24.md`，13 节：

1. 执行摘要（改前/改后）
2. Git 状态
3. 交付物
4. Task A 包装脚本（状态机、syslog 约定、实现约束）
5. Task B 测试（用例表、被测试抓出的问题）
6. Task C 文档
7. 真实执行证据（WSL 实跑输出）
8. 完整测试结果
9. 回归护栏
10. 未处理问题
11. 风险
12. 下一步建议
13. 停止声明

---

## §10 验收标准

- [ ] `scripts/readiness-cron.sh` 存在，`#!/bin/sh`，行尾 LF
- [ ] 状态机四态正确（首次 / 稳态 / 变化 / 心跳）
- [ ] syslog priority 与 tag 符合 §4.3
- [ ] `docker` 失败与探针非 ready 可区分
- [ ] 脚本永远 `exit 0`
- [ ] 测试覆盖 §5.1 的 10 个用例
- [ ] 测试用假 `docker` + 假 `logger`，不依赖真实环境
- [ ] 包装脚本在 WSL 下真实执行过（不是只跑测试）
- [ ] runbook 有安装、判据、查询、卸载四段
- [ ] 未改 `services/api/**`、`/health`、`deploy/**`、`Dockerfile`、`apps/web/**`
- [ ] 未接 compose healthcheck，未暴露 `/ready`
- [ ] 无新增依赖
- [ ] 完整测试矩阵全绿（含 `format:check`）
- [ ] 工作树干净
- [ ] 未进入 Sprint 3F / 4

---

## §11 停止条件

本轮**只做**探针的定时化与 syslog 告警。完成后停止。

**不**处理：告警升级（邮件/Slack）、`/ready` 公网暴露、G-15 测试缺口、`/pass-rate/` 方案 B、首页/SEO/新资格。这些由 Owner 根据报告决定。

---

## §12 与 Sprint 3B/3C/3D 的关系

| Sprint     | 做了什么                                  | 本轮的关系                                       |
| ---------- | ----------------------------------------- | ------------------------------------------------ |
| 3B         | 建 `/ready`，区分「配置缺失」与「连不上」 | 探针消费这个三态                                 |
| 3C         | web 进程启动门禁                          | 无关（本轮不碰 web）                             |
| 3D         | 建探针 `check-readiness.mjs`，五态可区分  | **本轮的输入**：包装脚本只消费它的 `--json` 输出 |
| 3E（本轮） | 定时 + syslog，让故障自己发声             | 闭合 3D 报告 §11 的 P1                           |

**探针本体一行不改**——它已经是稳定契约，包装脚本是它的消费者。这是分层：探针回答「现在什么状态」，包装脚本回答「要不要告诉人」。
