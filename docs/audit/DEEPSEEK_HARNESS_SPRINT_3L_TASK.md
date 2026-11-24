# DeepSeek Harness — Sprint 3L 任务文档

> 2026-11-25。上游依据：3K 报告 §11 的 P4（`/ready` 外部可观测性）。
> 实际代码与本文档冲突时，**以实际代码和真实测试结果为准**，并在报告里说明，不得为了「完成任务」而伪造符合预期的结果。

---

## §0 一句话

把探针从「只问 api 能不能连库」扩到「整条 `db → api → web → caddy` 链上每一环都有人看着」，**不暴露 `/ready` 到公网**。

---

## §1 为什么不能照 3K 报告的字面做

3K 报告 §11 P4 写的是「`/ready` 外部可观测性。3D 的 `check-readiness.mjs` 已就绪但未在 Caddy 暴露」。但 3D 报告 §9 第 4 条和 §10 风险表都明确写了**刻意不暴露**，理由是 `/ready` 泄露内部状态（「数据库连不上」这类信息）。

按 3K 的字面做，等于推翻 3D 的安全决策；按 3D 的决定不做，P4 就等于没做。两者都不对。

实测发现的真问题在别处：

| 层        | 谁在看着它                                                                     | 它挂了会怎样                                               |
| --------- | ------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| db        | `api` healthcheck 打 `/health`；`check-readiness.mjs` 探 `/ready`              | api 变 unhealthy → web 不启动；探针报 `error`；cron 发飞书 |
| api       | `web` 的 `depends_on: api: service_healthy`；`check-readiness.mjs` 探 `/ready` | web 不启动；探针 `unreachable`；cron 发飞书                |
| **web**   | **只有 compose healthcheck 打 `/`**                                            | **探针照旧报 `ready`，cron 一句话都不发**                  |
| **caddy** | **没有任何东西**                                                               | **同上：探针报 `ready`，无人知道**                         |

`readiness-cron.sh` 每 5 分钟跑的是：

```sh
docker compose $COMPOSE_ARGS exec -T api node scripts/check-readiness.mjs --timeout=... --json
```

它进的是 **api 容器**，探的是 **api 的 `/ready`**。web 挂了、caddy 挂了、web 的 `SITE_ORIGIN` 配错了、证书过期了——探针全都报 `ready`。

这正是 3C 修过的那一类问题（容器内 web 连自己 → 用户 503 但 healthcheck 打 `/` 恒 200 → 运维看到健康），只是发生在另一层。3C 修的是「web 怎么知道 api 连不上」，本轮修的是「**运维怎么知道 web 连不上**」。

### §1.1 为什么 compose healthcheck 不算数

web 的 healthcheck 是 `fetch('http://127.0.0.1:3000/')`，`restart: unless-stopped`。它确实会在 web 挂掉时重启容器。但：

1. **重启不等于恢复。** 如果 web 因为配置错误（3C 的 `API_BASE_URL` 缺失）启动即退出，healthcheck 只会让它无限重启，而**没有任何人收到消息**——探针报 `ready`。
2. **caddy 完全没有 healthcheck**，也不在 `depends_on` 的下游被检查。
3. **healthcheck 只看进程，不看内容。** web 返回一个 200 的空页面它也是健康的。

### §1.2 触发条件的现实性

不是假想。3C 修的就是「配置缺失 → 容器启动即退出」；`deploy/env.prod.example` 里 `SITE_ORIGIN`、`API_BASE_URL` 都是必填项，配错一次就会进重启循环。届时：

- 用户：整站 502/503 或连不上
- `crontab` 日志：`jpqm-readiness` 一片安静，每 5 分钟报 `ready`
- 飞书：零消息

---

## §2 任务分解

### Task A — 让探针能问「公网入口还活着吗」

给 `scripts/check-readiness.mjs` 增加一个**可选的**外部检查：探一个公网 URL（默认不启用，由 `--public-url` 或 `PUBLIC_READY_URL` 打开）。

要求：

- 不改变现有默认行为（不带参数时行为与今天逐字节相同）。
- 检查**只读**：GET，不跟随重定向到别的站，不写任何东西。
- 结论要能区分「web 挂了」与「caddy/证书挂了」：至少区分 HTTP 状态码与 TLS/连接错误。
- 失败时的 JSON 结构与现有五态（`ready`/`error`/`unconfigured`/`unreachable`/`unexpected`）一致，不新增顶层状态词，避免下游 `readiness-cron.sh` 的状态机失效。
- 退出码语义不变：0 = 全部就绪，1 = 其它。

### Task B — 让 cron 用上它

`scripts/readiness-cron.sh` 增加一个可选的外部检查开关（默认关），把 Task A 的结论并进同一个状态机。**不改**现有的 syslog 优先级、心跳节流、state 文件格式、通知调用契约。

### Task C — 文档与回归

- `docs/runbook.md` 增加「公网入口检查」小节：怎么开、看到什么、失败怎么分诊。
- 新增/扩展测试，覆盖 Task A 的六种响应形态与 Task B 的合并逻辑。
- 明确写下「为什么不暴露 `/ready`」，把 3D 的决定与本轮的替代方案接上。

---

## §3 硬约束

1. **不暴露 `/ready` 到公网。** 不改 `deploy/caddy/Caddyfile` 的路由，不给 `/ready` 加 Caddy 路由。
2. **不改 compose。** `deploy/docker-compose.prod.yml` 一个字节都不动——healthcheck 与依赖链是 3B/3C 反复确认过的，改它会让 DB 抖动级联下线。
3. **不改 `/health` 与 `/` 的语义。** 它们是 liveness，不是 readiness。
4. **默认关闭。** 不配 `PUBLIC_READY_URL` 时，探针与 cron 的行为与今天完全一致。
5. **不引入新依赖。** 只用 Node 内置 `fetch` 与 POSIX sh。
6. **失败不能改变退出码语义。** 外部检查失败 → 探针 exit 1（与其它非就绪态一致）；cron 永远 exit 0。

---

## §4 必读文件

| 文件                                        | 看什么                                                            |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `scripts/check-readiness.mjs`               | 302 行；URL 解析优先级、五态判定、`fetch` 调用、JSON 输出、退出码 |
| `scripts/readiness-cron.sh`                 | 134 行；状态机、`emit()`、心跳节流、state 文件两行格式            |
| `tests/readiness-cron.test.ts`              | 401 行；假 docker / 假 logger 手法、`runScript()`、`seedState()`  |
| `deploy/docker-compose.prod.yml`            | 94 行；确认 healthcheck 与 `depends_on` 链，**只读不改**          |
| `docs/runbook.md`                           | `:375` 起的飞书小节、`:406` 起的 readiness 小节                   |
| `docs/audit/SPRINT_3D_REPORT_2026-11-24.md` | §9 第 4 条、§10 风险表：为什么不暴露 `/ready`                     |

---

## §5 禁止项

- 不改 `deploy/caddy/Caddyfile`、`deploy/docker-compose.prod.yml`、`Dockerfile`。
- 不改 `services/api/**`、`apps/web/src/**`（本轮是运维脚本轮，不碰运行时）。
- 不给 `/ready` 加公网路由，不改 `/health` 语义。
- 不改 `scripts/ops-daily-*`、`scripts/notify-feishu.sh`、`scripts/prune-var.sh`。
- 不装 crontab、不连 VPS、不部署。
- 不进入 Sprint 3M。

---

## §6 报告要求

`docs/audit/SPRINT_3L_REPORT_2026-11-25.md`，至少 12 节：执行摘要 / Git 状态与基线 / 修改文件 / 缺口证据（§1 那张表 + 实测）/ Task A 设计取舍 / Task B 合并逻辑 / 为什么不暴露 `/ready` / 完整测试结果 / 未处理问题 / 风险 / 下一步建议 / 停止声明。

必须包含**实测输出原文**，不能只写「已验证」。

---

## §7 停止纪律

本轮只做探针覆盖面。做完**必须停**。

不要顺手去改 compose、不要加 Caddy 路由、不要开始 3M、不要上线。
