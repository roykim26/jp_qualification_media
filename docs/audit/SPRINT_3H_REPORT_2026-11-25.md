# SPRINT 3H 执行报告 — 把日检接进 cron

- 日期：2026-11-25
- 分支：`chore/phase1-baseline`
- 起点：`a0baaf3`（`style: prettier 格式化 Sprint 3G 报告`）
- 任务文档：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3H_TASK.md`

## 1. 执行摘要

`ops:daily` 现在可以由 cron 每天自动跑，并且**只在需要人动手时说话**。

新增 `scripts/ops-daily-cron.sh`（宿主机 POSIX sh）与 `tests/ops-daily-cron.test.ts`（15 用例），改写 `docs/runbook.md` 的日检小节，并在 `docs/p1-source-ops-proposal.md` 里标注那条「不装定时任务」的旧决定已被取代。

日检本身一行没改：仍然 `BEGIN READ ONLY`，仍然不发任何外部请求，退出码契约不变。本轮只解决「谁来按这个按钮」。

实测（真实数据库 + 只读角色 + 真实报告）：

```text
WRAPPER_EXIT=0
-t jpqm-ops -p daemon.err -- source_critical source:bookkeeping:candidate-data-class2：blocked（连续失败 0，最近状态 blocked）;…;due_fact bookkeeping/2026/payment_deadline_rule：已 327 天未复核（窗口 90 天）
```

即：报告真有 critical 时，一条 `daemon.err` 带着「今日需处理」的条目落到 syslog，条目里没有 markdown 记号。

## 2. Git 状态与基线

本轮开始前工作树干净，HEAD = `a0baaf3`。基线链（只列到 3G 收口，本轮内容 commit 见下一节）：

```text
a319d46  Sprint 1+2 合并 baseline
4796f8b  Sprint 3A 代码
013e680  Sprint 3A 文档
864535e  Sprint 3B
f09e438  Sprint 3B hash 收口
9bc946f  Sprint 3C 代码
9fc9c72  Sprint 3C 报告
f99e475  Sprint 3D
3142605  P3 格式化 3A 任务文档
2afa33d  format:check 首次全绿
031e9af  Sprint 3E
525098e  Sprint 3E 收口
ef975a8  Sprint 3F
74db96b  Sprint 3F 文档
cd514ed  Sprint 3F 收口
b458e0b  Sprint 3F 报告
9af0642  Sprint 3F hash 收口
7a45b0f  Sprint 3F 收口
79cebe2  Sprint 3G 代码
3c2e4fb  Sprint 3G 报告落账
a0baaf3  Sprint 3G 报告格式化
```

本轮内容 commit：**`71ad2b6`** `feat(ops): 日检接进 cron（Sprint 3H）`。

引用自身 hash 有天然的循环依赖（报告要写 commit，commit 要包含报告），所以沿用前几轮的两段式：先提交内容，再提交一次只改本节 hash 的收口 commit。理由与 Sprint 3A 报告 §2 相同。

## 3. 修改文件

| 文件                                            | 类型 | 说明                                                               |
| ----------------------------------------------- | ---- | ------------------------------------------------------------------ |
| `scripts/ops-daily-cron.sh`                     | 新增 | 4921 字节，宿主机 cron 包装脚本                                    |
| `tests/ops-daily-cron.test.ts`                  | 新增 | 15 用例，假 docker / 假 logger / 假通知脚本                        |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3H_TASK.md` | 新增 | 任务文档                                                           |
| `docs/runbook.md`                               | 修改 | +48/−3：新增「定时日检（cron）」小节，改写两处「不装定时任务」表述 |
| `docs/p1-source-ops-proposal.md`                | 修改 | +1/−1：给 2026-11-11 的「全手动」决定加上取代说明                  |

**未改**：`deploy/docker-compose.prod.yml`、`Dockerfile`、`scripts/ops-daily-report.mjs`、`scripts/ops-daily-lib.mjs`、`services/**`、`apps/**`、Caddy、任何 schema。

## 4. 方案与取舍

### 4.1 为什么必须挂载 `var/`

`scripts/ops-daily-report.mjs` 把报告写到 `path.resolve('var/ops-reports')`——相对工作目录。

| 做法                          | 报告落点                 | 后果                                       |
| ----------------------------- | ------------------------ | ------------------------------------------ |
| `docker compose exec -T api`  | 容器可写层               | `up -d --build` 一次全没，日检失去留档意义 |
| `docker compose run` 不带挂载 | 一次性容器的可写层       | 容器退出即删，报告当场消失                 |
| `run --rm -T -v var:/app/var` | 宿主机 `var/ops-reports` | 报告留档，且宿主机侧的证据同时可见         |

第三个方案还顺带解决了一个**此前在生产上等于空转**的问题：Sprint 3G 的 Task B 让日检读 `var/notifications/feishu.log` 判断告警通道健康，而那个文件是宿主机脚本写的。不挂载的话，容器里永远读到「从未投递过」，判定恒为 `not_run`。

### 4.2 为什么是 `run` 而不是 `exec`

- 日检不该因为 api 服务挂了就跑不了——`exec` 要求目标容器正在运行。
- `exec` 不能带 `-v`。
- cron 没有 TTY，`-T` 两种都需要。

代价是每次跑要起一个一次性容器（实测约 1.5 秒），可接受。

### 4.3 为什么相对 `OPS_VAR_DIR` 必须转绝对

`docker -v` 的源路径如果是相对的，会被解释成**命名卷**而不是宿主目录。脚本会把报告写进一个没人看的卷里，而且**不会有任何报错**——这是那种「跑了一整年才发现报告从来没落盘」的故障。所以脚本里显式转换：

```sh
case "$VAR_DIR" in
  /*) VAR_ABS="$VAR_DIR" ;;
  *) VAR_ABS="$(pwd)/$VAR_DIR" ;;
esac
```

并有一条专门的用例守着它。

### 4.4 为什么退出码不能用来判断

`ops-daily-report.mjs` 在「有 critical」和「自己跑挂了」两种情况下都返回 1。包装脚本因此不看退出码，而是看 stdout 是否是一份 `"status": "ok"` 的报告：

| stdout                   | 判定                           |
| ------------------------ | ------------------------------ |
| 有 `"status": "ok"`      | 报告跑成了，再看 `hasCritical` |
| 有 `"status": "not_run"` | 没配 `DATABASE_URL`            |
| 有 `"status": "error"`   | 报告自己失败                   |
| 什么都没有               | 容器根本没起来                 |

四条分支都会说话，只有「跑成了且没有 critical」沉默。

### 4.5 消息正文从 markdown 取，不从 JSON 重建

「今日需处理」的措辞（`**source_critical** \`source:…\`：blocked（连续失败 0，…）`）是给人看的，逻辑在 `renderMarkdown`里。如果在包装脚本里再从 JSON 拼一遍，两处措辞一定会漂移。所以直接读`var/ops-reports/<date>.md`的`## 今日需处理`一节，取`- ` 开头的行。

但 markdown 记号要剥掉：syslog 和飞书文本消息不渲染 `**` 和反引号，原样发出去就是一堆转义垃圾。实测对比：

```text
剥离前： **source_critical** `source:bookkeeping:candidate-data-class2`：blocked
剥离后： source_critical source:bookkeeping:candidate-data-class2：blocked
```

条目上限 `OPS_MAX_ACTIONS`（默认 10），整体截断到 1200 字符——飞书文本消息有长度上限，且 40 条 due_fact 全发过去没人会读。

## 5. 脚本行为

| 情况                      | syslog       | 飞书 | 退出码 |
| ------------------------- | ------------ | ---- | ------ |
| `status: ok`，无 critical | 沉默         | 沉默 | 0      |
| `status: ok`，有 critical | `daemon.err` | 发   | 0      |
| `status` 不是 `ok`        | `daemon.err` | 发   | 0      |
| 容器没起来 / 没有输出     | `daemon.err` | 发   | 0      |
| 通知脚本自己失败          | `daemon.err` | —    | 0      |

永远 `exit 0`：cron 的退出码只会触发没人读的邮件，通知渠道是 syslog + 飞书。

stderr 落 `var/ops-reports/cron.err`，失败消息带其尾部 3 行（压平成一行、截 300 字符）。没有这个文件，容器启动失败将完全无从排查——这正是 Sprint 3F 四轮往返的教训。

## 6. 测试

### 6.1 新增用例（15 条，全部通过，12.0s）

健康沉默 / critical 带动作条目 / 完全没有报告 / `not_run` / 报告自身失败带 stderr / `OPS_NOTIFY=0` 只写 syslog / 通知脚本失败仍 exit 0 / markdown 缺失时明说 / docker 不存在仍 exit 0 / 传给 docker 的参数（`compose -f … run --rm -T -v <abs>:/app/var api node scripts/ops-daily-report.mjs`）/ markdown 记号剥离 / `OPS_MAX_ACTIONS` 截断 / `COMPOSE_PROJECT` / `OPS_TODAY` 生效 / 相对 `OPS_VAR_DIR` 转绝对。

假 `docker` 记录 argv 后回放用例预置的 stdout，因此断言的是**真实调用形态**而不是脚本内部变量。本机没有构建好的生产镜像，所有用例都不碰 Docker。

### 6.2 全量矩阵

| 项目                                    | 结果                                                 |
| --------------------------------------- | ---------------------------------------------------- |
| `typecheck`                             | EXIT 0                                               |
| `pnpm test`                             | **25 files / 327 tests 全过**（+1 file / +15 tests） |
| `test:verify-gate`                      | 51 tests，pass 51 / fail 0                           |
| `build`                                 | EXIT 0                                               |
| `format:check`                          | EXIT 0                                               |
| `eslint . --ignore-pattern "Python/**"` | EXIT 0                                               |
| `test:python`                           | 239 passed                                           |
| `verify:all`                            | EXIT 0，6 资格全过，每个 `errors: []`                |
| `sh -n ops-daily-cron.sh`               | SYNTAX_OK                                            |

`pnpm lint` 裸跑仍会因 `Python/pythoncore-3.15-64*.deleteme/**` 的 JS 资源报解析错误（EXIT 1）。该目录被 `.git/info/exclude:8` 忽略、`git ls-files` 不跟踪，与 Sprint 3F 报告 §7 的处理一致，属环境残留而非本轮引入。

### 6.3 端到端实测

用只读角色 `qualification_api_ro` 连本地库，把假 `docker` 换成直接跑真实 `node scripts/ops-daily-report.mjs`，走完整包装脚本：

```text
WRAPPER_EXIT=0
logger: -t jpqm-ops -p daemon.err -- source_critical …;due_fact …
```

报告确实落到了 `var/ops-reports/2026-11-25.md`（宿主机侧，非容器内），`## 今日需处理` 一节的内容被正确提取、剥记号、按 `;` 连接后送进 logger。

## 7. 未处理问题

1. **crontab 尚未在 VPS 上安装。** 按任务文档 §7，安装由 Owner 执行：`(crontab -l 2>/dev/null; echo '17 9 * * * cd /opt/jpqm && sh scripts/ops-daily-cron.sh') | crontab -`。
2. **`docker compose run` 在生产上的真实行为未实测。** 本机没有生产镜像与 `deploy/.env`，只能验证脚本逻辑与真实报告输出。首次上机建议手动跑一次 `cd /opt/jpqm && sh scripts/ops-daily-cron.sh; echo exit=$?` 再装 cron。
3. **报告文件没有轮转。** `var/ops-reports/` 每天新增两个文件（`.json` + `.md`），一年约 700 个、几 MB。目前不构成问题，但它是 Sprint 3G 报告 §10 P2（投递记录轮转）的同类问题。
4. **`cron.err` 每次覆盖。** 它只保留最后一次运行的 stderr，历史失败原因不留档。日检本身有报告留档，stderr 只用于「当场排查」，暂不追加。
5. **`OPS_MAX_ACTIONS` 的截断是静默的。** 超过 10 条时消息里不会写「还有 N 条」，看报告 md 才知道全貌。

## 8. 风险

| 风险                                                | 影响                            | 缓解                                                            |
| --------------------------------------------------- | ------------------------------- | --------------------------------------------------------------- |
| VPS 上 `docker compose run` 因镜像名/项目名不符失败 | 日检每天报 `report did not run` | 失败会经 syslog + 飞书说话，不会静默；`cron.err` 留 stderr      |
| 宿主机 `var/` 权限与容器内 uid 不匹配               | 报告写不出来                    | 同上，报 `status=error` + stderr 尾部                           |
| 日检容器与 api 争用数据库连接                       | 高峰期短暂连接紧张              | `run` 是短生命周期，且用只读角色；连接池上限未变                |
| 每天 9:17 固定时刻跑                                | 与备份/其他 cron 撞车           | 选的是非整点；如有冲突改一行即可                                |
| 挂载 `var/` 进容器                                  | 容器能写宿主机 `var/`           | 只读契约由报告代码的 `BEGIN READ ONLY` 保证；容器内无其他写入方 |

## 9. 下一步建议

按优先级：

1. **P1：在 VPS 上手动跑一次再装 cron。** `cd /opt/jpqm && sh scripts/ops-daily-cron.sh; echo exit=$?` 应输出 `exit=0`；若本地库有 critical，`journalctl -t jpqm-ops -n 5` 应能看到条目。确认后再装 crontab。
2. **P2：`var/` 下的留存物轮转。** `ops-reports/`（每天 2 个文件）、`notifications/feishu.log`（每次投递一行）、`readiness/`。一个 `find var -mtime +90 -delete` 的小脚本 + 同一条 cron 里跑，成本很低。
3. **P3：`/pass-rate/` 单资格故障观测。** 3A 定了保留整页 503，但没定「什么时候该重新评估」。需要的是生产侧证据：503 里有多少是单资格引起的。
4. **P4：G-15 测试缺口。** `apps/web/src/server.ts` 的 19 条路由仍无进程级测试，3A 的 sitemap 错误体、3B/3C 的配置门禁都靠单元测试兜着。
5. **P5：`/ready` 的外部可观测性。** 目前探针只在机器上主动跑，站外无法知道数据面状态。

仍然悬着：**Sprint 3A–3H 的代码都还没有部署到生产。** VPS 上的 `/opt/jpqm` 仍是 `main@01b86dd` 的 clone（只在 3F 时手工取过两个宿主机脚本）。上线属正式发布，需要 Owner 单独授权，且要重建镜像。

## 10. 停止声明

本轮到此为止。

没有进入 Sprint 3I，没有改首页/资格页/内链/设计系统，没有新增资格，没有动 schema、Caddy、Docker 架构、CDN、URL 结构、GSC/Bing/GA4，没有在生产数据库上执行任何写操作，没有安装 crontab。

下一步由 Owner 根据本报告决定。
