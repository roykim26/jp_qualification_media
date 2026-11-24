# Sprint 3L 执行报告 — 公网入口可观测性（2026-11-25）

## 1. 执行摘要

3K 报告 §11 把 P4 写成「`/ready` 外部可观测性」。照字面做就是把它挂到 Caddy 后面——而 3D 报告已经明确否决过这个做法（`docs/audit/SPRINT_3D_REPORT_2026-11-24.md:204`），理由是不泄露内部状态、不让数据面抖动级联下线。**所以本轮先核实缺口，再动手。**

核实结果是：真正的盲区不是「`/ready` 没人能从外面调」，而是**探针只覆盖 `db` 与 `api` 两环**。`scripts/readiness-cron.sh:71-74` 的执行形态是 `docker compose exec -T api node scripts/check-readiness.mjs`——进 api 容器、问 api 自己的 `/ready`。于是：

| 坏在哪                    | 探针报什么           | 用户看到什么                  |
| ------------------------- | -------------------- | ----------------------------- |
| db 连不上                 | `error` + 飞书       | 503                           |
| api 挂了                  | `unreachable` + 飞书 | 502                           |
| **web 起不来 / 重启循环** | **`ready`，沉默**    | **502/503**                   |
| **caddy 挂了或证书过期**  | **`ready`，沉默**    | **连不上 / 证书警告**         |
| **`SITE_ORIGIN` 配错**    | **`ready`，沉默**    | **页面能开但 canonical 全错** |

后三行是 3C 修过的同一类问题——用户拿到错误页，运维那边一切「健康」——只是换了一层。compose healthcheck 补不上：它只看进程活没活，web 挂了会被 `restart: unless-stopped` 拉起，但拉起前那段没人知道；caddy **根本没有 healthcheck**（`deploy/docker-compose.prod.yml:76-89` 只有 `depends_on`）；证书过期和配置错误都不影响进程存活。

本轮做了三件事，**没有暴露 `/ready`，没有改 compose，没有改 Caddy**：

- **Task A**：`scripts/check-readiness.mjs` 增加可选公网检查（`--public-url` / `PUBLIC_READY_URL`），默认关闭。
- **Task B**：`scripts/readiness-cron.sh` 透传该开关，公网故障进同一状态机、同一 syslog 通道、同一飞书。
- **Task C**：`docs/runbook.md` 新增「公网入口检查」小节。

过程中撞到两个值得单独记录的东西：**Node/libuv 在 Windows 上的崩溃**（§6）和**我自己引入的贪婪 sed 缺陷**（§7.2）。两者都不是「实现细节」，前者解释了 3K 里那个神秘的 `0xC0000409`，后者差点把本轮要补的盲区重新抹掉。

## 2. Git 状态与基线

执行前：

- 分支 `chore/phase1-baseline`
- HEAD `d2c8e03`（`docs: 落账 Sprint 3K 的 P3 收尾`）
- `git status --short` 无输出

本轮内容 commit：`96bce93`（`feat(ops): 公网入口纳入就绪探针（Sprint 3L）`）

报告自身无法在写它的那个 commit 里引用自己的 hash——这是循环依赖。所以沿用 3A 起的两段式：先提交内容，再用一个 `docs: 落账…` 的收口 commit 把 hash 回填进来。

`git diff --stat`（提交前）：

```
 docs/runbook.md               |  44 +++-
 scripts/check-readiness.d.mts |  77 ++++++-
 scripts/check-readiness.mjs   | 244 +++++++++++++++++++++-
 scripts/readiness-cron.sh     |  75 ++++++-
 tests/check-readiness.test.ts | 465 +++++++++++++++++++++++++++++++++++++++---
 tests/readiness-cron.test.ts  | 131 ++++++++++++
 6 files changed, 993 insertions(+), 43 deletions(-)
```

外加两个新增文件：`docs/audit/DEEPSEEK_HARNESS_SPRINT_3L_TASK.md`、本报告。

## 3. 修改文件

| 文件                                            | 变化                       | 说明                                                                                                                                   |
| ----------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/check-readiness.mjs`                   | 302 → 524 行               | 公网检查：`resolvePublicUrl` / `classifyPublicEntry` / `probePublicEntry` / `mergePublicEntry`；`main()` 改用 `process.exitCode`（§6） |
| `scripts/check-readiness.d.mts`                 | 127 → 142 行               | 新增 `PublicEntryState` / `PublicEntryReport` / `CombinedReport`；`CombinedReport` 刻意放宽（§5.3）                                    |
| `scripts/readiness-cron.sh`                     | 134 → 201 行               | `PUBLIC_READY_URL` 透传；提取器从贪婪 sed 换成 `grep -o`（§7.2）；`reason`/`code` 进 detail                                            |
| `tests/check-readiness.test.ts`                 | 442 → 855 行，21 → 46 用例 | 6 个新 describe                                                                                                                        |
| `tests/readiness-cron.test.ts`                  | 401 → 531 行，20 → 25 用例 | 新增「public entry passthrough」5 条                                                                                                   |
| `docs/runbook.md`                               | +44 行                     | 新增「公网入口检查（web 与 caddy）」小节                                                                                               |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3L_TASK.md` | 新增                       | 本轮任务文档                                                                                                                           |
| `docs/audit/SPRINT_3L_REPORT_2026-11-25.md`     | 新增                       | 本报告                                                                                                                                 |

**运行时源码零改动。** `apps/`、`services/`、`packages/`、`deploy/` 全部未动。

## 4. 为什么 P4 不是「暴露 `/ready`」

3D 报告的三条理由仍然成立，逐条复核：

1. **依赖链级联**：`db → api(/health) → web(depends_on api healthy) → caddy`。把 readiness 接进编排器，数据库抖动就会让 api unhealthy → web 不启动 → 整站下线。3B 为此特意让 `/health` 一字未改。
2. **信息泄露**：`/ready` 的 `unconfigured` 与 `error` 会对外说明「数据库连不上」这类内部状态。
3. **语义错配**：`/ready` 回答的是「数据面现在能不能服务查询」，公网入口关心的是「外面能不能拿到一个完整页面」。两者失败模式不同，硬塞进一个端点会两头不讨好。

所以本轮查的是**公网首页**（`https://shikakucheck.com/`，本来就公开），不是内部端点。`deploy/caddy/Caddyfile` 未改动，`/ready` 仍然只在容器网络内可达。

## 5. Task A：`check-readiness.mjs` 的公网检查

### 5.1 默认关闭

`resolvePublicUrl(env, overrideUrl)` 的优先级：`--public-url` > `PUBLIC_READY_URL` > 无（关闭）。**没有任何默认值**——不像 `--url` 会回落到 `http://127.0.0.1:4100/ready`，公网地址无法猜，猜错会产生假告警。

不设该变量时，脚本行为与 3K 逐字节相同：只发一次 fetch，报告里没有 `public` 字段。

### 5.2 判据

`classifyPublicEntry(httpStatus, rawBody)`：

| 条件                            | `state`        | 含义                            |
| ------------------------------- | -------------- | ------------------------------- |
| 2xx + 有 `<html` + 有 `</html>` | `ok`           | 完整页面                        |
| 2xx + 有 `<html` 无 `</html>`   | `truncated`    | 页面被截断                      |
| 2xx + 无 `<html`                | `not-html`     | 网关的 JSON 错误体之类          |
| 3xx                             | `redirect`     | `redirect: 'manual'` 刻意不跟随 |
| ≥500                            | `server-error` | 上游或 caddy 报错               |
| 其余                            | `client-error` | 4xx                             |

`redirect: 'manual'` 是刻意的：探针查的是**用户输入的那个地址**，跟着跳走就变成在查别的东西。301 到 `www` 那种配置错误应当被发现，而不是被跟随掩盖。

`probePublicEntry` 的失败分类按「该找谁」切：

| `reason`  | 触发                                                                                                                                       | 该找谁                 |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| `connect` | DNS 失败、主机不可达                                                                                                                       | 网络 / DNS             |
| `tls`     | `code` 以 `CERT_*` / `ERR_TLS` 开头，或 `UNABLE_TO_VERIFY_LEAF_SIGNATURE` / `DEPTH_ZERO_SELF_SIGNED_CERT` / `ERR_TLS_CERT_ALTNAME_INVALID` | 证书 / 域名            |
| `timeout` | `TimeoutError` / `AbortError`                                                                                                              | web 卡死、caddy 等上游 |

### 5.3 状态词刻意不扩张

`mergePublicEntry` 把公网结果折进数据面报告时，`status` 只用既有的 `unreachable`（拿不到应答）与 `unexpected`（拿到应答但不可用）。**不新增 `web-down` 这类词**，因为 `readiness-cron.sh` 的状态机只认 `ready` 与非 `ready`；新词会被当成「非 ready」纯属巧合而非设计。

同时把数据面原判据保留进 `dataPlane: {status, database, message}`。「API 好好的但外面进不来」是这份报告最有价值的一条信息，不能让它被顶层 `status` 盖掉。

这也导致类型上必须放宽：`CombinedReport` 不再是 `ReadinessReport & {...}`，而是独立定义（`status: ReadinessState; database: string | null; ...`）。原因很实在——公网覆盖后会出现「`database: 'ok'` 配 `status: 'unreachable'`」这种数据面联合类型里不存在的组合，而它恰恰是真实的。所有 `ReadinessReport` 仍然可赋值给它。

## 6. libuv 崩溃：Windows + Node 24 下 ≥2 次 fetch 后 `process.exit()` 必崩

### 6.1 症状

Task A 写完代码后，`tests/check-readiness.test.ts` 里三条真起子进程的 CLI 用例全部失败：

```
expected 3221226505 to be +0
```

`3221226505` = `0xC0000409`。**这正是 3K 里那个「进程崩溃码」**（见 3K 报告 §1.2）。手工跑同一条命令却完全正常：

```
node scripts/check-readiness.mjs --url=http://127.0.0.1:9/ready \
  --public-url=http://127.0.0.1:9/ --timeout=1000 --json
→ EXIT=1，JSON 正常输出
```

抓 stderr 才看到真凶：

```
Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), file src\win\async.c, line 76
```

### 6.2 缩小范围

用独立 stub（`var/stub-ready.mjs`）与探针（`var/probe-exit.mjs`、`var/probe-exit2.mjs`）实测：

| 场景                                             | 结果                            |
| ------------------------------------------------ | ------------------------------- |
| 1 次 fetch + `process.exit(0)`                   | EXIT 0                          |
| 2 次 fetch + `process.exit(0)`                   | **崩溃**（-1073740791）         |
| 3 次 fetch + `process.exit(0)`                   | 崩溃                            |
| 2 次 fetch + 只设 `process.exitCode`（自然退出） | **EXIT 0**                      |
| 两个不同端口的 stub 各 fetch 一次                | 崩溃（与是否同 host:port 无关） |
| 数据面成功 + 公网 404                            | 崩溃（与响应状态无关）          |
| 只 1 次 fetch、无 `--public-url`                 | EXIT 0                          |

**结论：与响应内容无关，只与「完成的 fetch 次数 ≥ 2」和「显式 `process.exit()`」这两个条件同时成立有关。** 这是 Node v24.14.0 在 Windows 上的 libuv 缺陷，不是本项目的逻辑错误。

### 6.3 为什么 3K 那次没定位到

3K 的 `0xC0000409` 出现在 web 进程崩溃复现里，当时归因为「未处理 rejection 导致 abort」。现在看，那是**同一族 Windows abort 的两个不同触发点**：一个是 unhandled rejection，一个是 libuv 句柄断言。3K 的结论（进程会崩、需要 headersSent 守卫）依然正确，但「崩溃码相同即同一原因」这个推断是错的。

### 6.4 修法

`main()` 里三处 `process.exit(1)` 改成 `process.exitCode = 1; return;`，末尾的 `process.exit(...)` 改成 `process.exitCode = ...`。注释写明了原因。

退出码语义完全不变（`ready` → 0，其余 → 1），因为 `process.exitCode` 就是进程最终的退出码；变的只是「不再强制中断事件循环」。这对 cron wrapper 尤其重要——它读的就是退出码，而崩溃看起来会像「探针没跑」。

修后实测：健康双检 EXIT=0、公网不可达 EXIT=1、仅数据面 EXIT=0、坏参数 EXIT=1。

## 7. Task B：`readiness-cron.sh` 透传

### 7.1 改动

- `PUBLIC_READY_URL` 有值时，`docker compose exec` 追加 `-e PUBLIC_READY_URL=...`；无值时命令与 3L 前逐字节相同。
- **用环境变量而非 `--public-url` 参数**，因为命令行参数会出现在 `ps` 输出里。
- `reason` 与 `code` 提取后拼进 `detail`：`status=... message=... reason=... code=...`。理由：连接失败时 `message` 一律是 `fetch failed`，区分「证书过期」和「DNS 写错」只能靠这两个字段，而这两件事该找的人不一样。
- syslog 优先级、心跳节流、state 文件格式、通知契约**全部未变**。公网故障只是让 `status` 变成非 `ready`，走既有的跃迁/心跳逻辑。

### 7.2 我自己引入的缺陷：贪婪 sed

原提取器：

```sh
sed -n 's/.*"status": *"\([a-z]*\)".*/\1/p' | head -n 1
```

`.*` 是**贪婪**的。3L 之前报告里只有一个 `"status"`，怎么贪都一样。3L 之后报告带嵌套 `dataPlane.status`，于是一行紧凑 JSON 时贪婪会吃到**最后一个** `"status"`——也就是 `dataPlane` 的 `ready`：

| 探针输出格式             | 提取结果     | 后果                        |
| ------------------------ | ------------ | --------------------------- |
| pretty-print（顶层在前） | `unexpected` | 正确，纯属 `head -n 1` 碰巧 |
| 单行 JSON                | **`ready`**  | **公网已挂而 wrapper 沉默** |

第二种情况正好把本轮要补的盲区重新抹掉。生产没出事只是因为探针输出恰好是 pretty-print。

**修法**：

```sh
grep -o '"status": *"[a-z_]*"' | head -n 1 | sed 's/.*"\([a-z_]*\)"$/\1/'
```

`grep -o` 按文档顺序逐次产出匹配，第一次出现即顶层键，两种格式都对。`message` 同样从 `.*` 改成 `[^"]*`（POSIX sed 无惰性量词，这是本项目第二次踩同一个坑，见 3E）。

**变异验证**：把提取器换回贪婪 sed，确认变异真的落盘（`Select-String` 打印出 `MUTATED_LINE`）→ 2 条用例失败（`reports a public-entry failure through the same syslog path`、`treats the public entry going down as a transition, not a new state word`）→ 还原 → 71 用例全绿。

## 8. Task C：runbook

`docs/runbook.md` 在「### 查询与调优」与「### 卸载」之间新增 **「### 公网入口检查（web 与 caddy）」**（+44 行），包含：覆盖缺口表、为什么 compose healthcheck 补不上、开法、判据、`status`×`reason` 分诊表、`dataPlane` 保留原判据的理由、`reason`+`code` 进 syslog 的理由、**仍然不暴露 `/ready`** 的说明。环境变量列表也补了 `PUBLIC_READY_URL`。

## 9. 完整测试结果

| 项                                       | 结果                                                       |
| ---------------------------------------- | ---------------------------------------------------------- |
| `pnpm typecheck`                         | **0**                                                      |
| `pnpm test`                              | **28 files / 421 tests 全过**（3K P3 时 28/391，本轮 +30） |
| `pnpm test:verify-gate`                  | **51 pass 0 fail**                                         |
| `pnpm build`                             | **0**                                                      |
| `pnpm format:check`                      | **0**                                                      |
| `eslint . --ignore-pattern "Python/**"`  | **0**                                                      |
| `pnpm test:python`                       | **239 passed**                                             |
| `pnpm verify:all`                        | **EXIT 0**，6 资格全过，`"errors": []`                     |
| `pnpm smoke:docker`                      | **11 项 ok**                                               |
| `wsl -e sh -n scripts/readiness-cron.sh` | EXIT 0                                                     |

新增用例分布：`tests/check-readiness.test.ts` 21 → 46（+25）、`tests/readiness-cron.test.ts` 20 → 25（+5）。

### 9.1 变异测试

| 变异                      | 结果            |
| ------------------------- | --------------- |
| `status` 提取换回贪婪 sed | ✅ 2 条用例失败 |

### 9.2 环境注记

- `pnpm lint` 裸跑会因 `Python/pythoncore-3.15-64.0.deleteme/` 下的 JS 残留报解析错误（`.git/info/exclude:8` 忽略、`git ls-files` 不跟踪），正确跑法是 `eslint . --ignore-pattern "Python/**"`。与 3F/3G 处理一致，非本轮引入。
- `pnpm exec pytest` 裸跑 EXIT 2（collect 到同一残留目录），必须用 `pnpm test:python`。
- `verify:all` 需显式提供 `DATABASE_URL`。

## 10. 未处理问题

1. **公网检查默认关闭。** 要在 VPS 上生效，需要在 crontab 行首加 `PUBLIC_READY_URL=https://shikakucheck.com/`。这一步需要 SSH 凭据，本机没有私钥，未执行。
2. **`not-html` 与 `truncated` 只判 HTML 结构，不判内容正确性。** 页面 200 + 完整 HTML 但内容全错（比如渲染出空列表）探针看不出来。要覆盖得比对关键字符串或页面长度阈值，那属于内容校验，不是入口校验。
3. **`redirect` 不跟随，因此无法区分「有意跳 www」与「配置错误」。** 当前一律算 `unexpected`。如果将来确实需要裸域跳 www，得加白名单。
4. **公网检查会随 cron 每 5 分钟访问一次自己的首页。** 这会进 caddy access log，也会被 GA4 计为一次访问（如果 GA 在服务端渲染时触发）。量很小，但确实污染统计。
5. **`CombinedReport` 的类型放宽了。** 这是为「API 好但站点挂」这种真实组合让步。代价是调用方不再能靠类型排除 `database: 'ok'` + `status: 'error'` 这种组合。

## 11. 风险

| 风险                                                              | 影响                                   | 缓解                                                                                 |
| ----------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------ |
| VPS 上误配 `PUBLIC_READY_URL`（比如写成内网地址）                 | 每 5 分钟一条假告警                    | 手动 `node scripts/check-readiness.mjs --public-url=... --json` 先验一次再写 crontab |
| 探针访问自己首页被 WAF 限流                                       | 探针拿到 429 → `client-error` → 假告警 | 观察一周；必要时给探针 IP 加白名单或改查静态资源                                     |
| `reason`/`code` 进 syslog 后行变长                                | journald 单行过长被截                  | 当前最长约 200 字符，远低于限制                                                      |
| Node 升级后 libuv 崩溃消失，`process.exitCode` 写法变成「不必要」 | 无功能影响                             | 该写法本身就是正确做法，与缺陷是否修复无关                                           |

## 12. 下一步建议

- **P1（需 Owner）**：在 VPS 上验证并启用公网检查——先手跑一次 `--public-url`，再写进 crontab。**永久阻塞于缺 SSH 私钥。**
- **P2**：把 3A–3L 全部代码部署到生产。VPS 仍是 `main@01b86dd`，本轮及之前十一轮的修复都还在分支里。属正式发布，需单独授权。
- **P3**：3K 报告 §11 的 P6——`render.ts` 的解引用与 `isQualificationView` 之间没有同步机制，P2 靠人工枚举字段发现 4 个漏检。根治需要静态检查或类型收窄，属架构改动。
- **P4**：`/pass-rate/` 观测日志已上线（3K P3），但还没有人真正看过生产数据。等 P2 上线后收集一段时间，再决定是否切方案 B。
- **P5**：`ops:daily` 的 `docker compose run` 在生产上的实际行为仍未实测（3H 报告 §7 第 2 条）。

## 13. 停止声明

本轮只做 Task A/B/C 三件事，未进入 3M 及以后。未做：暴露 `/ready`、改 compose、改 Caddy、改运行时源码、新增依赖、上线部署。

**停止。** 下一步由 Owner 根据本报告决定。
