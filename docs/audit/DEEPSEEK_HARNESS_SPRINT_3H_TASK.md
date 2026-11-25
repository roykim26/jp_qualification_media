# DEEPSEEK HARNESS — SPRINT 3H 任务文档

## 0. 核心目标

把 `ops:daily`（只读日检）接进 VPS 的 cron，让「今天有什么要处理」这个问题不再依赖有人记得手动跑。

Owner 原话（2026-11-25）：**「把 ops:daily 接进 cron」**。

这条指令**取代** 2026-11-11 那条「日检不装定时任务、每日手动跑」的决定。取代关系必须在 `docs/runbook.md` 里写清楚，否则下一个人会看到两处互相矛盾的说明。

## 1. 为什么不是「加一行 crontab」就完事

`pnpm ops:daily` 现在有两个只有在 VPS 上才会暴露的约束：

1. **宿主机没有 node。** 这不是猜测，`docs/runbook.md:274` 已经为此把 `access-report.mjs` 改成「日志经 stdin 进容器跑」。所以 cron 必须把日检放进容器执行。
2. **容器内写出的报告会随容器消失。** `scripts/ops-daily-report.mjs` 把报告写到 `path.resolve('var/ops-reports')`。如果用 `docker compose exec -T api node ...`，报告落进容器的可写层，`up -d --build` 一次就没了——日检报告的价值恰恰在于**历史留档**。

还有一个反向的机会：

3. **投递记录就在宿主机上。** Sprint 3G 的 `notify-feishu.sh` 是宿主机脚本，它把投递记录写在 `/opt/jpqm/var/notifications/feishu.log`。日检的「通知渠道」判定要读这个文件；如果不挂载，容器里读到的是「从未投递过」，Sprint 3G 的 Task B 在生产上等于空转。

把宿主机的 `var/` 挂进一次性容器，三个问题一起解决。

## 2. 方案

新增 `scripts/ops-daily-cron.sh`（POSIX sh，宿主机侧），由 crontab 每天调一次：

```sh
docker compose -f deploy/docker-compose.prod.yml run --rm -T \
  -v "$(pwd)/var:/app/var" \
  api node scripts/ops-daily-report.mjs
```

- `run --rm -T` 而不是 `exec`：一次性容器可以带 bind mount，且不依赖 api 服务正在运行（日检不该因为 web/api 挂了就跑不了）。
- `-v "$(pwd)/var:/app/var"`：报告落回宿主机 `var/ops-reports/`；`var/notifications/feishu.log` 与 `var/patrol/registry.json` 也一并可见。

**只在需要人动手时说话**（与 `readiness-cron.sh` 同一套哲学：健康稳态沉默）：

| 报告结果                            | 行为                                            |
| ----------------------------------- | ----------------------------------------------- |
| `status: ok` 且 `hasCritical` 假    | 完全沉默（报告文件就是留档）                    |
| `status: ok` 且 `hasCritical` 真    | `daemon.err` + 飞书，正文列出「今日需处理」条目 |
| `status` 不是 `ok`（跑失败/未配置） | `daemon.err` + 飞书，正文带 stderr 尾部         |
| 脚本永远 `exit 0`                   | cron 的退出码只会触发没人读的邮件               |

退出码不能单独用来判断：`ops-daily-report.mjs` 在「有 critical」和「自己跑挂了」两种情况下都返回 1，所以必须先看 stdout 是否是一份 `"status": "ok"` 的报告。

## 3. 三条硬约束

1. **日检仍然只读。** `BEGIN READ ONLY` 不变，不发外部请求的契约不变。本轮只改「谁来按这个按钮」，不改按钮里做的事。
2. **不改运行时。** `/health`、`/ready`、compose 服务定义、Caddy、Dockerfile、API、web 一行不动。挂载只出现在 `docker compose run` 的临时容器上，不写进 compose 文件。
3. **不引入新依赖。** 只用 POSIX sh + 已有的 `docker` / `logger` / `notify-feishu.sh`。

## 4. 执行前必读

| 文件                                            | 为什么读                                                    |
| ----------------------------------------------- | ----------------------------------------------------------- |
| `scripts/ops-daily-report.mjs`                  | 报告写到哪、退出码是什么、stdout 是什么形状                 |
| `scripts/ops-daily-lib.mjs`                     | `renderMarkdown` 的章节标题，消息正文要从「今日需处理」里取 |
| `scripts/readiness-cron.sh`                     | 同一套包装脚本的写法与注释风格，本轮照抄结构                |
| `tests/readiness-cron.test.ts`                  | 假 `docker` / 假 `logger` / 假通知脚本的测试手法            |
| `scripts/notify-feishu.sh`                      | 调用契约是 `--text <message>`，失败必须 `                   |     | true` |
| `docs/runbook.md` :256-266                      | 「人工日检」小节，本轮要在其后加「定时日检」并标注取代关系  |
| `docs/runbook.md` :313-315                      | 「唯一一处打破不装定时任务惯例」这句话本轮变成「两处」      |
| `docs/audit/SPRINT_3G_REPORT_2026-11-24.md` §10 | 本轮对应的就是其中的 P1（把 ops:daily 接进 cron）           |

## 5. 任务分解

### Task A：包装脚本

`scripts/ops-daily-cron.sh`，要求：

- 环境变量：`COMPOSE_FILE`（默认 `deploy/docker-compose.prod.yml`）、`COMPOSE_PROJECT`、`OPS_VAR_DIR`（默认 `var`）、`OPS_REPORT_DIR`（默认 `$OPS_VAR_DIR/ops-reports`）、`OPS_TODAY`（默认 JST 今天，测试用）、`OPS_TAG`（默认 `jpqm-ops`）、`OPS_NOTIFY`（`0` 关闭飞书）、`NOTIFY_SCRIPT`（默认同目录 `notify-feishu.sh`）。
- stderr 落 `$OPS_VAR_DIR/ops-reports/cron.err`，跑失败时从里面取尾部放进消息——**没有 stderr 的失败无法排查**，这正是 Sprint 3F 四轮往返的教训。
- 消息正文从 `$OPS_REPORT_DIR/$OPS_TODAY.md` 的 `## 今日需处理` 一节取 `- ` 开头的行，最多 10 条；文件缺失时消息里明说缺失，不静默。
- 消息不超过飞书文本上限（截断到合理长度）。

### Task B：测试

`tests/ops-daily-cron.test.ts`，行为测试，假 `docker` / 假 `logger` / 假通知脚本，覆盖：健康沉默、critical 报警、跑失败报警、`not_run` 报警、`OPS_NOTIFY=0`、通知脚本自己挂掉仍 exit 0、报告 md 缺失、传给 docker 的参数（`run`/`--rm`/`-T`/`-v`/`-f`）、`OPS_TODAY` 生效、`COMPOSE_PROJECT` 生效。

### Task C：文档

`docs/runbook.md`：

1. 「人工日检」小节后新增「定时日检（cron）」小节：安装、判据、日志位置、报告留档位置、卸载。
2. 改写 :264 与 :315 两处「不装定时任务」的表述，注明 2026-11-25 的所有者决定与其理由。

## 6. 测试要求

- 新增测试文件全绿；既有 24 files 全部继续通过。
- 全量矩阵：typecheck / `pnpm test` / verify-gate / build / format:check / eslint / pytest。

## 7. 明确禁止

- 不改 `deploy/docker-compose.prod.yml`（挂载只出现在 `run` 命令行上）。
- 不改 `ops-daily-report.mjs` 的判定逻辑与退出码契约。
- 不改 `/health`、`/ready`、Caddy、Dockerfile。
- 不给日检加网络请求。
- 不自动 `crontab -e`（安装命令写进 runbook，由 Owner 执行）。
- 不进入生产发布，不进入 Sprint 3I。

## 8. 完成后的要求

生成 `docs/audit/SPRINT_3H_REPORT_2026-11-25.md`：执行摘要、Git 状态与基线、修改文件、方案与取舍、`docker compose run` 的实测输出、消息正文实测、完整测试结果、未处理问题、风险、下一步建议、停止声明。

## 9. 停止纪律

本轮完成后**必须停止**。安装 crontab 由 Owner 在 VPS 上执行；不要顺手改别的东西。
