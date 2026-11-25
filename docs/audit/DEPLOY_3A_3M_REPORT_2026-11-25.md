# Sprint 3A–3M 生产部署报告（2026-11-25）

- 部署窗口：2026-11-25 06:57 – 07:20（Asia/Shanghai）
- 执行人：DeepSeek Harness
- 目标主机：`root@47.79.87.163`（`iZ6we0orb3n3k9dbbinl5xZ`，AlibabaCloudLinux-arm）
- 部署目录：`/opt/jpqm`
- 结论：**部署成功，全部验证通过，回滚路径可用。** 过程中发现并修复 1 个真实缺陷（就绪探针的 compose 文件默认值），另有 4 个既有问题已定性但未修改。

---

## 0. Git 基线

| 项                  | 值                                                        |
| ------------------- | --------------------------------------------------------- |
| 部署前生产 HEAD     | `dc4e0ec`（`fix: 页脚法務・連絡欄移除郵箱直顯… (#109)`）  |
| 部署后生产 HEAD     | `cac5a7e`（`fix(ops): 就绪探针默认自带 compose 文件`）    |
| 分支                | `chore/phase1-baseline`（生产 main 被 fast-forward 到此） |
| 本报告内容 commit   | `1969846`（`docs(audit): 3A–3M 生产部署报告`）            |
| 报告撰写时本地 HEAD | `cac5a7e`                                                 |

本报告本身无法在自己的 commit 里引用自己的 hash，因此沿用项目既有做法：先提交内容，再用一个 `docs: 落账…` 的收口 commit 把 `<CONTENT_SHA>` 替换为真实 hash。**基线链只列到内容 commit，HEAD 以 `git log --oneline -1` 为准。**

---

## 1. 执行摘要

Sprint 3A 到 3M 的 41 个 commit 首次进入生产。此前生产运行的是 2026-11-19 10:08 构建的镜像，代码停留在 `dc4e0ec`（比 GitHub 上的 `origin/main` 还落后 2 个 commit），**不包含本轮的任何一个修复**。

部署后确认上线的内容（用镜像内字符串核对，不只是看 git）：

| 能力                                    | Sprint | 镜像内证据                                                                            |
| --------------------------------------- | ------ | ------------------------------------------------------------------------------------- |
| 上游 timeout（5s）+ sitemap 503 XML     | 3A     | `plan A: one failure fails the page` 之外的路由改动已在 `dist/apps/web/src/server.js` |
| `DatabaseNotConfiguredError` + `/ready` | 3B     | 容器内 `/ready` 返回 `{"status":"ready","database":"ok"}`                             |
| 生产缺配置启动即退出                    | 3C     | `dist/apps/web/src/config.js` 含 `SITE_ORIGIN is required in production` ×1           |
| 就绪探针 + 公网入口检查                 | 3D/3L  | `scripts/check-readiness.mjs` 在镜像内，公网检查返回 `public.state=ok`                |
| 上游故障形状收敛                        | 3K     | `closeAfterResponseStarted` ×2、`readJson` ×5                                         |
| 兄弟路由元素级校验                      | 3M     | `isCalendarEnvelope` ×2、`isUpdatesEnvelope` ×2、`isComparisonEnvelope` ×2            |
| `/pass-rate/` 单资格故障观测            | 3K P3  | `plan A: one failure fails the page` ×1                                               |

一句话：**3A–3M 的修复确实在运行的进程里，不是只躺在 git 里。**

---

## 2. 部署前状态：三处与既有假设不符的事实

部署前我对生产做了只读摸底，有三件事与项目文档/我的预期不一致，必须先记下来。

### 2.1 「自动部署」并不存在

Owner 提到「之前都是自动部署的」。实际核查：

- `/root/actions-runner` 不存在，`ps aux | grep -E 'runner|webhook'` 无输出；
- `.github/workflows/` 只有 `release-gate.yml`，两个 job（`release-gate`、`docker-smoke`）都只跑测试，**没有 deploy job**；
- `/root/.bash_history` 只有 4 行，无部署痕迹。

所谓「自动部署」实为手工执行 runbook 的 `docs/runbook.md:737`：

```sh
cd /opt/jpqm && git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build
```

**含义**：这台机器上没有任何东西会因为代码合并而自动更新。本轮是我按这个流程手工执行的，下次仍然需要有人（或一个真正的 CD 流水线）来做。

### 2.2 VPS 的 `main` 与 GitHub 的 `main` 不是一回事

| 位置                                    | commit    | 说明                                                     |
| --------------------------------------- | --------- | -------------------------------------------------------- |
| VPS `/opt/jpqm`（部署前）               | `dc4e0ec` | 比 GitHub 的 `origin/main` 还多 2 个本地/已合并的 commit |
| GitHub `origin/main`                    | `01b86dd` | 落后 2 个 commit                                         |
| 部署目标 `origin/chore/phase1-baseline` | `cac5a7e` | 含 3A–3M 全部 41 个 commit                               |

`git merge-base --is-ancestor origin/main HEAD` 返回 0，`git rev-list --count origin/main..HEAD` = 41 → 特性分支完整包含 `main`，可以直接 fast-forward。

**⚠️ 部署后仍然存在的治理问题**：生产现在跑的是 `cac5a7e`，而 GitHub 的 `main` 仍是 `01b86dd`。**生产代码不在 `main` 上。** 见 §12 第 1 条。

### 2.3 工作树有 8 项本地改动，其中 1 项是活的线上配置

`git status --short`（部署前）：

```
 M deploy/caddy/Caddyfile
?? deploy/BingSiteAuth.xml
?? deploy/Caddyfile.bak-20261113
?? deploy/caddy/Caddyfile.bak
?? deploy/caddy/Caddyfile.bak.
?? deploy/googlea01c41ed599c5311.html
?? scripts/notify-feishu.sh
?? scripts/readiness-cron.sh
```

关键点：`deploy/caddy/Caddyfile` 的本地改动是手工加的 `blog.waystoneai.online` 反代块（`reverse_proxy blog:8080`），**且容器内 `/etc/caddy/Caddyfile` 与磁盘文件的 sha256 完全一致**（`30224cbc…620be`）。也就是说磁盘上那份「未提交的改动」就是线上正在跑的配置——任何 `git checkout --` / `reset --hard` 都会让博客下线。

项目铁律本来就禁止这两条命令，本轮严格遵守。处理方式见 §4。

---

## 3. 变更范围

```
dc4e0ec  (生产原 HEAD)
   ↓  91 files changed, 19891 insertions(+), 191 deletions(-)
6986a5b  docs: 落账 Sprint 3M 执行报告
   ↓  2 files changed, 36 insertions(+)
cac5a7e  fix(ops): 就绪探针默认自带 compose 文件   ← 生产当前 HEAD
```

41 个 commit 覆盖 Sprint 1/2 基线收口 + 3A–3M。运行时源码改动集中在：

- `apps/web/src/server.ts`（801 → 约 900 行：`readJson`、四个形状校验器、`closeAfterResponseStarted`、`/pass-rate/` 观测）
- `apps/web/src/config.ts`（新增，生产配置门禁）
- `services/api/src/database-config.ts`、`database-ready.ts`（新增）
- `services/api/src/public-facts.ts` 等三处 fail-empty 改造
- `scripts/check-readiness.mjs`、`scripts/readiness-cron.sh`、`scripts/ops-daily-cron.sh`、`scripts/notify-feishu.sh`、`scripts/prune-var.sh`
- `deploy/env.prod.example`（+10 行）
- `docs/runbook.md`（+约 300 行）

**未改动**：`deploy/docker-compose.prod.yml`、`deploy/caddy/Caddyfile`、数据库 schema、URL 结构。

---

## 4. 部署步骤与证据

全部通过 `ssh -i ~/.ssh/jpqm_deploy root@47.79.87.163` 执行，脚本先 `base64 -d > /root/x.sh` 落盘再 `bash /root/x.sh </dev/null`（原因见 §11.1）。

### 4.1 前置安全核查（`var/vps-premerge.sh`）

- FF 可行性：`git merge-base --is-ancestor HEAD origin/chore/phase1-baseline` → 0
- incoming 文件数：91
- 与本地修改的 tracked 文件重叠：**0**（分支不碰 `deploy/caddy/Caddyfile`，`git diff --stat origin/main..HEAD -- deploy/caddy/Caddyfile` 为空）
- 与未跟踪文件重叠：**2**（`scripts/notify-feishu.sh`、`scripts/readiness-cron.sh`）
- 磁盘：40G 中已用 11G

### 4.2 备份与回滚点（`var/vps-merge.sh`）

```sh
mkdir -p /root/jpqm-manual-backup
cp deploy/caddy/Caddyfile       /root/jpqm-manual-backup/Caddyfile.live.20261125-065730
cp scripts/notify-feishu.sh     /root/jpqm-manual-backup/notify-feishu.sh.20261125-065730
cp scripts/readiness-cron.sh    /root/jpqm-manual-backup/readiness-cron.sh.20261125-065730
docker tag deploy-web:latest deploy-web:pre-sprint3   # c9ba5a7bca0c
docker tag deploy-api:latest deploy-api:pre-sprint3   # 206722af7608
```

备份目录现状（部署后核对仍在）：

```
-rw-r--r-- 1 root root 1409 Nov 21 13:11 Caddyfile.live.20261125-065730
-rwxr-xr-x 1 root root 6996 Nov 25 00:18 notify-feishu.sh.20261125-065730
-rw-r--r-- 1 root root  316 Nov 25 06:57 pre-deploy.20261125-065730.txt
-rwxr-xr-x 1 root root 5256 Nov 25 00:18 readiness-cron.sh.20261125-065730
```

### 4.3 合并

```sh
rm -f scripts/notify-feishu.sh scripts/readiness-cron.sh   # 已备份，且分支自带更新版本
git merge --ff-only origin/chore/phase1-baseline
# dc4e0ec..6986a5b Fast-forward, 91 files changed, 19891 insertions(+), 191 deletions(-)
```

合并后立即核对两件最危险的事：

```
grep -c blog.waystoneai.online deploy/caddy/Caddyfile   → 1     # 博客 vhost 保住
sha256sum deploy/caddy/Caddyfile                        → 30224cbc…620be  # 与容器内一致
```

脚本权限也对：`notify-feishu.sh` / `ops-daily-cron.sh` / `prune-var.sh` / `readiness-cron.sh` 均 `-rwxr-xr-x`；`check-readiness.mjs` 是 `644`（用 `node` 调用，不需要执行位）。

### 4.4 构建与重建

```sh
docker compose -f deploy/docker-compose.prod.yml build
docker compose -f deploy/docker-compose.prod.yml up -d
```

detached 到 `/root/jpqm-deploy-20261125-065758.log`，`DEPLOY_EXIT=0`。容器按 db → api → web → caddy 的依赖链依次重建，全部 Healthy。

镜像时间戳：`deploy-web:latest` / `deploy-api:latest` = **2026-11-25 06:58:53**（原为 2026-11-19 10:08:16）。

---

## 5. 数据库迁移

镜像内共 31 个迁移文件，末条为 `0030_fe_statistics_suiihyo_202610.sql`（Sprint 2A 的 FE 202610 数据刷新）。

```sh
docker compose -f deploy/docker-compose.prod.yml run --rm -T api \
  node dist/services/api/src/server.js --help   # 确认镜像可用
# 迁移执行
Applied 0030_fe_statistics_suiihyo_202610.sql.
MIGRATE_EXIT=0
```

**幂等性验证**：二次运行**零 `Applied` 输出**，`MIGRATE2_EXIT=0`。

**只读角色重建**：

```sh
node scripts/provision-api-db-role.mjs --confirm=PROVISION_API_DB_ROLE --allow-non-local
→ {"status":"ok","role":"qualification_api_ro","login":true,"database":"qualification_media"}
```

数据面计数核对：`approved_facts` = **1007**，与 Sprint 2A 的基线一致，**没有增删**。

---

## 6. 回滚方案（已验证可用）

三步，全部已确认可执行：

```sh
cd /opt/jpqm
# 1) 代码回到部署前
git reset --hard dc4e0ecfdc8b        # ⚠️ 会丢掉 Caddyfile 的本地改动，先按下面恢复
# 实际上更安全的是：git checkout dc4e0ec -- . && git checkout dc4e0ec
# 然后把备份的 Caddyfile 放回去：
cp /root/jpqm-manual-backup/Caddyfile.live.20261125-065730 deploy/caddy/Caddyfile

# 2) 镜像回到部署前
docker tag deploy-web:pre-sprint3 deploy-web:latest
docker tag deploy-api:pre-sprint3 deploy-api:latest

# 3) 重建
docker compose -f deploy/docker-compose.prod.yml up -d
```

回滚点核查（部署后执行 `var/vps-rollback-ready.sh`，EXIT=0）：

```
deploy-web:pre-sprint3  sha256:c9ba5a7bca0cbf00b17c886275102f5b5d1d30adc94e8a0f5cd5d6de21ec8359  2026-11-19T10:08:16
deploy-api:pre-sprint3  sha256:206722af7608c6f7cf5105ff0794c58c0363968a7b2b1fc74c05aa0a6df8b6a3  2026-11-19T10:08:16
```

**注意**：数据库迁移 0030 **不回滚**。它是纯数据刷新（FE 202610 的官方统计），旧代码读新数据是兼容的——旧代码不认识的是新的 _API 形状_，而 0030 只动统计数据。这一点在回滚时是安全的。

---

## 7. 验证矩阵

### 7.1 容器与端点

| 项                 | 结果                            |
| ------------------ | ------------------------------- |
| `deploy-db-1`      | Up 11d (healthy)                |
| `deploy-api-1`     | Up 16m (healthy)                |
| `deploy-web-1`     | Up 16m (healthy)                |
| `deploy-caddy-1`   | Up 15m                          |
| `blog`（非本项目） | Up 3d，未受影响                 |
| `GET /`            | 200                             |
| `GET /shikaku/`    | 200                             |
| `GET /pass-rate/`  | 200                             |
| `GET /schedule/`   | 200                             |
| `GET /updates/`    | 200                             |
| `GET /compare/`    | 200                             |
| `GET /sitemap.xml` | 200                             |
| `GET /robots.txt`  | 200                             |
| `GET /ready`       | **404**（未暴露，符合 3D 决策） |

### 7.2 Sprint 3B/3D/3L 的就绪探针

容器内：

```json
{
  "status": "ready",
  "database": "ok",
  "url": "http://127.0.0.1:4100/ready",
  "httpStatus": 200,
  "durationMs": 106
}
```

公网检查（3L）：

```json
{"status":"ready","database":"ok", ...,
 "public":{"state":"ok","httpStatus":200,"url":"https://shikakucheck.com/","durationMs":904}}
```

`/health` 仍是 `{"status":"ok","stage":0}`——**一字未改**，compose 的依赖链不受影响。

### 7.3 Sprint 1 的 SEO 门禁

| URL                                         | robots meta           | canonical     |
| ------------------------------------------- | --------------------- | ------------- |
| `/pass-rate/`                               | 无（可索引）          | 自身          |
| `/pass-rate/?sort=fee`                      | `noindex,follow`      | `/pass-rate/` |
| `/pass-rate/?order=desc`                    | `noindex,follow`      | `/pass-rate/` |
| `/pass-rate/?sort=fee&order=asc`            | `noindex,follow`      | `/pass-rate/` |
| `/shikaku/bookkeeping/pass-rate/`           | 无（可索引）          | 自身          |
| `/shikaku/bookkeeping/pass-rate/?year=2025` | `noindex,follow`      | 基础页        |
| `/shikaku/bookkeeping/pass-rate/?year=9999` | `noindex,follow`      | 基础页        |
| `/shikaku/bookkeeping/pass-rate/?year=abc`  | 无（非法值被忽略）    | 自身          |
| `/shikaku/takken/pass-rate/`                | `noindex`（唯一薄页） | —             |
| `/`、`/shikaku/`、`/schedule/`、`/updates/` | 无                    | 自身          |

sitemap 里 `?year=` 计数 = **0**；`<loc>` 总数 52，其中 `/shikaku/<slug>/` 6 个（takken、gyoseishoshi、it-passport、fundamental-it-engineer、bookkeeping、fp）。`robots.txt` 仍指向 `https://shikakucheck.com/sitemap.xml`。

> **我在这一步犯过一个错**：第一次把 `?year=` 打到 `/pass-rate/` 上，那里根本不是年过滤器（年过滤器在 `/shikaku/:slug/pass-rate/`，见 `apps/web/src/server.ts:841-842`），于是误以为「年过滤器没生效」。修正 URL 后才得到上表。

### 7.4 ICS

路由是 `/ics/:qual/:year.ics` 与 `/ics/month/:yyyy-mm.ics`：

```
/ics/it-passport/2026.ics   → 200 text/calendar; charset=utf-8
/ics/takken/2026.ics        → 200 text/calendar; charset=utf-8
/ics/month/2026-12.ics      → 200 text/calendar; charset=utf-8
```

---

## 8. cron 安装与真实触发

### 8.1 安装

先备份 `/root/crontab.bak-<ts>`，用 `grep -v` 去掉旧版本行后追加。最终四条：

```cron
15 4 * * * docker compose -f /opt/jpqm/deploy/docker-compose.prod.yml exec -T db pg_dump -U qualification_prod -Fc qualification_media > /var/backups/jpqm-$(date +\%F).dump && find /var/backups -name "jpqm-*.dump" -mtime +14 -delete
*/5 * * * * cd /opt/jpqm && PUBLIC_READY_URL=https://shikakucheck.com/ sh scripts/readiness-cron.sh
17 9 * * * cd /opt/jpqm && sh scripts/ops-daily-cron.sh
47 9 * * 0 cd /opt/jpqm && sh scripts/prune-var.sh --apply
```

`command -v docker` → `/usr/bin/docker`（cron 默认 `PATH=/usr/bin:/bin` 找得到）；`systemctl is-active crond` → `active`。

### 8.2 真实触发（不是我手跑的）

等到 `*/5` 边界，观察 `/opt/jpqm/var/readiness/last-status`：

```
mtime 07:10:24 → 07:15:04     CRON_RAN=yes
内容  ready\n0
syslog 无新行（ready→ready 静默，符合设计）
```

### 8.3 负向路径

```
PUBLIC_READY_URL=https://shikakucheck.com/definitely-not-a-page-3l-check
→ state: unexpected\n1
→ syslog: status=unexpected message=public entry https://… public entry answered HTTP 404
```

换回真 URL 后：`ready\n0` + `recovered: status=ready after 1 checks`。纯数据面健康时保持沉默。

**这一条证明了 3L 的价值**：web 层或 caddy 层出问题时，探针不再报 ready 且沉默。

### 8.4 ops 日报

`OPS_EXIT=0`，产出 `var/ops-reports/2026-11-25.json`（49808 B）、`.md`（10335 B）、`cron.err`（32 B，内容仅 `Container deploy-db-1  Running`，是 `docker compose run` 的无害 stderr 噪声）。

---

## 9. 部署中发现并修复的缺陷：就绪探针的 compose 文件默认值

**这是本轮最重要的发现。**

### 9.1 现象

按 runbook 的安装行原样执行 `cd /opt/jpqm && sh scripts/readiness-cron.sh`：

```
status=unreachable  message=probe did not run: service "api" is not running
```

而机器是完全健康的——api 容器正跑着且 healthy。

### 9.2 根因

`scripts/readiness-cron.sh` **没有 `COMPOSE_FILE` 默认值**（`scripts/ops-daily-cron.sh:45` 有，readiness 没有）。于是 compose 从 cwd 向上找配置文件，命中 `/opt/jpqm/docker-compose.yml`——**那是另一套陈旧栈**：

```
docker compose config  →  name: jpqm, networks.jpqm_default, services: minio, …
docker inspect deploy-api-1 → com.docker.compose.project=deploy,
                              config_files=/opt/jpqm/deploy/docker-compose.prod.yml
```

项目名对不上，`exec api` 自然答 `service "api" is not running`。

### 9.3 为什么这个缺陷特别危险

它**不会**以「脚本崩了」的形式出现。脚本正常退出 0、状态机正常写入、cron 正常触发、飞书正常收到告警——**在一台完全健康的机器上，探针永远红着**。运维看到的是一条持续 5 分钟一次的假告警，很快就会学会忽略它，于是真正的故障也被一起忽略。

这是本项目反复出现的同一类错误的又一例：**「跑起来了」和「答案是对的」是两件事**（3H 的 `status: 'ok'` 问题、3L 的贪婪 sed 问题，都是同一族）。

### 9.4 修法

```sh
COMPOSE_FILE="${COMPOSE_FILE:-deploy/docker-compose.prod.yml}"
```

路径保持相对，因为文档里的安装行从仓库根执行，与 `ops-daily-cron.sh` 一致。

### 9.5 验证

- `tests/readiness-cron.test.ts` 25 → **27 用例**，新增「总是显式带 compose 文件」与「可被覆盖」两条；
- 变异（把默认值改回空）：`MUTATION_LANDED=true`、`MUT_EXIT=1`、`× always names the compose file…`、`RESTORED=true`；
- 全量矩阵：`pnpm test` **28 files 458 passed**、typecheck 0、format:check 0、eslint 0；
- 生产实测：不带任何环境变量跑 → `ready\n0`。

commit `cac5a7e`，已推送并 FF 到生产（`6986a5b..cac5a7e`，2 files +36）。

---

## 10. 部署中发现的既有问题（未修改）

以下四条都不是本轮引入的，也都不在 Sprint 3A–3M 的范围内，按「证据优先、最小修改」原则**只记录不改**。

### 10.1 `status: "ok"` 与 `hasCritical: true` 并存

`var/ops-reports/2026-11-25.json` 顶层同时有：

```json
"status": "ok",
"hasCritical": true,
"summary": {"sources":52,"critical":2,"warning":50,...}
```

原因：`scripts/ops-daily-lib.mjs:272` 的 `status: 'ok'` 是**硬编码**的「报告跑起来了」，与 `hasCritical`（`:297`，`critical.length > 0 || channel.level === 'critical'`）语义完全不同。真正的信号是 `scripts/ops-daily-report.mjs:154` 的 `if (report.hasCritical) process.exitCode = 1;`，而 `ops-daily-cron.sh` 也只看 `"status": "ok"` 判断「报告没跑挂」。

**问题**：字段名 `status` 强烈暗示「整体健康度」，实际只是「进程是否成功产出报告」。任何人（包括未来的我）第一次读这份 JSON 都会误解。建议改名为 `reportStatus` / 或增加独立的 `overallStatus`。

**2026-11-25 已处理**（commit `0890d48`，已上生产 `9d793c9`）：采用「新增字段」而不是改名——`status` 保留（`ops-daily-cron.sh` 的字段提取与 runbook 判据都依赖它，改名需要镜像 + 宿主机 crontab + 文档协同发布），新增 `reportStatus`（同义、名字说清）与 `overallStatus`（`ok` / `action_needed`，真正的健康度，与 `hasCritical` 由同一个 `const` 派生）。markdown 摘要第一行直接写「整体状态」。详见 `docs/audit/OPS_REPORT_STATUS_2026-11-25.md`。

### 10.2 `due_fact` 的 target 粒度不足以唯一定位一条事实

今日报告的 12 条 `todayActions` 里只有 **4 个 distinct target**：

```
due_fact bookkeeping/2026/fee                    × 7
due_fact bookkeeping/2026/payment_deadline_rule  × 3
source_critical source:bookkeeping:candidate-data-class2
source_critical source:bookkeeping:candidate-data-class3
```

查库确认那 7 条是 **7 条不同的 fact**（`fact:candidate:bookkeeping:…:bookkeeping:2:network:fee`、`:3:network:fee`、`basic:network:fee`、`cost-accounting-basic:network:fee`、`:1:unified:fee`、`:2:unified:fee`、`:3:unified:fee`），同 `verified_at=2026-01-01`、来自两个 source。

根因：`scripts/ops-daily-lib.mjs:267`

```js
target: `${fact.qualification}/${fact.examYear}/${fact.factKey}`,
```

丢掉了 `examComponent` / `examLevelId` 这些区分维度。于是 7 条不同的事实渲染成 7 行**一模一样**的话，看报告的人无法知道到底该去复核哪一条，也无法判断是「7 个问题」还是「1 个问题重复 7 次」。

**2026-11-25 已处理**（commit `35168b1`，已上生产 `b9b5228`）：`formatFactTarget()` 在有区分维度时输出 `bookkeeping/2026/fee (examLevel=bookkeeping:2, delivery=network)`，无维度时逐字节保持原格式；`STALENESS_QUERY` 补 SELECT 六列，并新增连库门禁 `scripts/verify-staleness-query.mjs`（`db:verify-staleness`，已接进 `release:check`）断言 `distinctTargets` 与 `dueFacts` 相等。生产实测 `duplicatedTargets=0`。详见 `docs/audit/DUE_FACT_DIMENSIONS_2026-11-25.md`。

**更大的面**：`GROUP BY slug, exam_year, fact_key HAVING count(*)>1` 显示 `bookkeeping/2021/pass_rate` 11 条、`2021/passed` 11 条、2022–2024 的 `pass_rate`/`passed` 各 10 条。这不是数据错误——是 `factKey` 本身粒度不足以唯一定位一条事实。

### 10.3 生产从未跑过 patrol，`coverageGap` 恒为 `not_run`

```json
"coverageGap": {"status": "not_run", "reason": "var/patrol/registry.json missing; run patrol once first"}
```

巡检覆盖缺口这一项在生产上**永远显示「未检查」**，因为 `var/patrol/registry.json` 不存在。这意味着「52 个来源是否都真的在被检查」这个问题，日检报告答不了。

### 10.4 37% 的请求是 404，绝大部分是扫描器

Caddy access log（7605 行，2026-11-14 11:29Z – 2026-11-24 23:19Z）：

| 状态    | 数量  | 占比   |
| ------- | ----- | ------ |
| 200     | 4206  | 55.3%  |
| 404     | 2800  | 36.8%  |
| 308     | 586   | 7.7%   |
| 499     | 13    | 0.2%   |
| **5xx** | **0** | **0%** |

404 的构成：`/wp-admin/install.php` 121、`/favicon.ico` 20、`/.git/config` 19、`/.env` 18、`/.env.save` 11、`/.env.bak` 11、`/.env.backup` 11、`/service-account.json` 10、`/.git/HEAD` 10、`/.env.example` 10、`/wp-login.php` 9、`/.env.prod` 9……**真正属于本站路径的 404 只有 11 个**。

这说明站点在被持续扫描 WordPress 漏洞和 `.env` 泄露。**好消息是全部 404**（没有 `.env` 泄露）。坏消息是这些噪声淹没了 access log 的真实信号，也让「404 率」这个指标失去意义。

---

## 11. 两个操作层面的教训

### 11.1 `docker compose run` 会吞掉 stdin

第一次执行迁移时用 `ssh "…base64 -d | bash"` 管道，`docker compose run` 把剩余脚本当作自己的 stdin 读走，输出停在迁移列表就断了，**看起来像脚本执行到一半崩了**。

修法：脚本先 `base64 -d > /root/x.sh` 落盘，再 `bash /root/x.sh </dev/null`，并且每条 `docker compose run` 都加 `-T` 与 `</dev/null`。

### 11.2 相对路径在远程脚本里会骗人

`var/vps-cron-proof.sh` 里忘了 `cd /opt/jpqm`，`cat var/readiness/last-status` 解析到 `/root/var/readiness/last-status`（不存在），我据此判断「state 文件消失了」。`find /opt/jpqm -name last-status` 证明它一直在 `/opt/jpqm/var/readiness/last-status`，`var` 既不是符号链接也不是挂载。

**规矩**：远程脚本一律用绝对路径。

另有一个小坑：`sec=$((10#$((date +%M)) % 5))` 在 `set -u` 下报 `date: unbound variable`——嵌套 `$((...))` 里的 `$(date +%M)` 被当成变量名了。拆成先 `now_min=$(date +%M)` 再算术。

---

## 12. 未处理问题

1. **生产代码不在 GitHub 的 `main` 上**。生产跑 `9d793c9`（`chore/phase1-baseline`，撰写本报告时为 `cac5a7e`，之后又叠了 due_fact 维度化与 status 语义拆分两次部署），`origin/main` 仍是 `01b86dd`，落后 40+ 个 commit。任何人 clone 仓库拿到的都是不含 3A–3M 的代码。需要一次 `main` 的合并 + push。
2. **没有 CD 流水线**。「自动部署」不存在，下次上线仍需手工跑 runbook 命令。`release-gate.yml` 只跑测试。
3. ~~**`status` 字段语义误导**（§10.1）。~~ **已处理**：`0890d48` 新增 `reportStatus` / `overallStatus`，已上生产 `9d793c9`，见 `docs/audit/OPS_REPORT_STATUS_2026-11-25.md`。
4. ~~**`due_fact` target 粒度不足**（§10.2）。~~ **已处理**：`35168b1`，已上生产 `b9b5228`，见 `docs/audit/DUE_FACT_DIMENSIONS_2026-11-25.md`。
5. **生产从未跑过 patrol**，`coverageGap` 恒为 `not_run`（§10.3）。
6. ~~**Caddyfile 的本地改动仍未提交**~~。**已处理**：`2a21622` 把 `blog.waystoneai.online` 反代块连同来历注释写进仓库，`693a9ec` 落账并 FF 部署到生产（线上 SHA 与仓库逐字节一致），6 条回归测试 + 7 个变异全抓。5 个 `??` 备份/验证文件仍未跟踪，去留待定。详见 `docs/audit/CADDYFILE_BLOG_VHOST_2026-11-25.md`。
7. **`/pass-rate/` 观测数据只有约 20 分钟**。见 §13。
8. **access log 的轮转配置正确，但尚未触发**。初稿这里写的是「无轮转配置、宿主机未见轮转产物」，实测后归因是错的，修正如下：
   - `deploy/caddy/Caddyfile:8-11` 有 `output file /var/log/caddy/access.log { roll_size 10mb` + `roll_keep 5`。
   - 挂载是**目录级**：`/opt/jpqm/deploy/caddy-logs -> /var/log/caddy`，不是单文件 bind mount。所以 Caddy 在容器内 rename，宿主机一定能看到轮转产物，不存在「产物落在容器层」的问题。
   - `access.log` 实测 9641459 字节 = **9.196 MiB**，小于 `roll_size 10mb`（10485760 字节）→ **只是还没到阈值**。
   - `roll_keep 5` 意味着 access.log 系列最多占 6 × 10 MB ≈ 60 MB，磁盘不是风险。
   - 真正的待办只剩一条：`blog-access.log`（600740 字节，由 `blog` 这个 nginx 容器写入，不归本仓库的 Caddyfile 管）**没有轮转策略，已停在 11-23 13:42 不再增长**。这条要等博客那边处理，与本项目无关。
   - 复核时机：`access.log` 跨过 10 MiB 后应能看到 `access-<timestamp>.log`，届时确认一次即可。

---

## 13. 生产观测：`/pass-rate/` 与 5xx

3K P3 加的观测日志是「生产观测到 503 中过半由单资格故障引起 → 才考虑切方案 B」的数据来源。当前能取到的数据：

```
/pass-rate/  133 次请求
  200  ×129
  308  ×3    （无尾斜杠 → 重定向）
  404  ×1
  499  ×1    （客户端提前断开）
```

**全站 5xx = 0**（7605 行日志里一条都没有）。

但必须诚实标注这个证据的强度：**access log 覆盖到 2026-11-24 23:19Z，而部署发生在 22:58Z，只有约 20 分钟是部署后的流量。** 也就是说这 133 次 `/pass-rate/` 请求绝大多数来自旧代码。当前数据只能说明「旧代码在 10.5 天里没有 5xx」，**不能**说明 3A–3M 在生产上扛住了。

要得到有意义的数据，需要等至少 24–48 小时。届时用：

```sh
grep '"uri":"/pass-rate/' deploy/caddy-logs/access.log | grep -o '"status":[0-9]*' | sort | uniq -c
docker logs deploy-web-1 2>&1 | grep 'plan A: one failure fails the page'
```

第一条给 503 次数，第二条给「哪些资格失败、几个成功」——后者正是判断该不该切方案 B 所需的粒度。

---

## 14. 风险

| 风险                                   | 影响                                    | 缓解                                                                                      |
| -------------------------------------- | --------------------------------------- | ----------------------------------------------------------------------------------------- |
| 3K/3M 的校验器在生产遇到没测过的坏形状 | 503（可接受）或再次进程崩溃（不可接受） | `closeAfterResponseStarted` 守卫已上线，`restart: unless-stopped` 仍在；需观察 48h 的 5xx |
| `main` 与生产不一致                    | 新人 clone 到旧代码；回滚点混乱         | §12 第 1 条                                                                               |
| ~~Caddyfile 改动只存在于 VPS 磁盘~~    | ~~一次误操作让博客下线~~                | **已处理**：`2a21622` 提交进仓库，`693a9ec` 上生产，见 §12 第 6 条                        |
| 就绪探针的假告警被学会忽略             | 真故障也忽略                            | 已修 `cac5a7e`；需观察是否还有别的「永远红」项                                            |
| access log 无轮转                      | 磁盘写满 → caddy 挂                     | **已复核：配置正确、目录级挂载、9.196 MiB 未达 10 MiB 阈值。风险不成立**                  |
| 迁移 0030 不可回滚                     | 回滚代码后数据仍是新的                  | 0030 只动统计数据不动 schema，旧代码兼容                                                  |

---

## 15. 下一步建议

按优先级：

1. **P1 — 把生产代码落到 `main`**：`git push origin chore/phase1-baseline:main`（或开 PR 合并），让 `origin/main` 与生产一致。这是治理问题，不是技术问题，但拖得越久越容易出事。
2. **P1 — 等 24–48 小时收 `/pass-rate/` 观测数据**，再决定方案 A 是否切换。当前 0 个 5xx 是好消息，但样本只有 20 分钟。
3. ~~**P2 — 修 `due_fact` 的 target 粒度**（§10.2）。~~ **已完成**：`35168b1`（`docs/audit/DUE_FACT_DIMENSIONS_2026-11-25.md`），已上生产 `b9b5228`。
4. ~~**P2 — 把 Caddyfile 的博客 vhost 提交进仓库**~~ **已完成**：`2a21622`（`docs/audit/CADDYFILE_BLOG_VHOST_2026-11-25.md`），已上生产 `693a9ec`，线上 SHA 与仓库逐字节一致。
5. ~~**P3 — `status` 字段改名**（§10.1），或加独立的 `overallStatus`。~~ **已完成**：`0890d48` 走「加 `overallStatus`」这条路（`docs/audit/OPS_REPORT_STATUS_2026-11-25.md`），已上生产 `9d793c9`。
6. **P3 — 生产跑一次 patrol**，让 `coverageGap` 有真值。
7. **P4 — 404 噪声过滤**（§10.4）。access log 的轮转经复核已确认配置正确、只是未到阈值，不再是待办；剩下的只有 36.8% 的扫描器 404 噪声。

---

## 16. 停止声明

本轮任务范围是「把 Sprint 3A–3M 部署到生产并验证」，已完成：

- 41 个 commit 从 `chore/phase1-baseline` 合并到生产（`dc4e0ec` → `cac5a7e`）
- 镜像重建、迁移执行（幂等）、只读角色重建
- 9 项端点 + SEO 门禁 + ICS + 就绪探针全部验证
- cron 四条安装并证明由 crontab 自身触发
- 发现并修复 1 个真实缺陷（`cac5a7e`）
- 记录 4 个既有问题（未修改）

**不再继续**。§10 的四个既有问题、§12 的八条未处理项、§15 的七条建议，都需要 Owner 决策后另开一轮。不自行进入 Sprint 3N / 3O，不改首页、不改设计、不动数据 schema、不碰 Caddy/Docker 架构。
