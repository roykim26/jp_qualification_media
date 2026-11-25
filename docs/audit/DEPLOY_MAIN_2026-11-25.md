# main 部署到生产 + PR #78 合并落账（2026-11-25）

- 时间：2026-11-25 13:43–13:56（Asia/Shanghai）
- 仓库：`roykim26/jp_qualification_media`
- 生产：`root@47.79.87.163`，部署目录 `/opt/jpqm`
- 部署前 HEAD：`693a9ec`（`docs: 落账 Caddyfile 博客 vhost 的内容 commit`，2026-11-25 08:23:46 +0800）
- 部署后 HEAD：`d53db8f`（`chore: dev 脚本加载本地 .env（--env-file-if-exists，缺文件自动跳过） (#78)`，2026-11-25 13:42:56 +0800）
- 结论：**部署成功，全部验收通过；5 个冗余文件已删；PR #78 已 squash 合并；生产首次跑完 patrol，`coverageGap` 从 `not_run` 变成 0。**

---

## 1. 本轮做了什么

| 项                  | 动作                                                                                    | 结果                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| P1 部署             | `git pull --ff-only` + `docker compose -f deploy/docker-compose.prod.yml up -d --build` | 693a9ec → d53db8f，22 个 commit（21 + PR #78 squash）进入生产                                       |
| P2 日志轮转         | 只观测，未改配置                                                                        | `access.log` 9,978,812 B = 95.2%（阈值 10,485,760），尚未触发；配置在 `deploy/caddy/Caddyfile:8-11` |
| P3 patrol           | 生产容器内跑 `collector.patrol_sources`（只抓取，不连库）                               | 61 来源：45 changed、16 failed；`registry.json` 生成；`coverageGap` 0                               |
| P4 冗余文件         | 备份到 `/root/jpqm-manual-backup-20261125/` 后删除 5 个未跟踪文件                       | 删除后 4 条验证 URL 仍 200（内容由 Caddyfile 内联 `respond` 提供）                                  |
| P5 PR #78           | `update-branch` → checks 通过 → `gh pr merge 78 --squash`                               | 合并为 `d53db8f`；远端分支未删（未授权）                                                            |
| P6 /pass-rate/ 观测 | 读生产 access.log                                                                       | 近 24h 55 次请求全 200；全日志 7,902 行 0 个 5xx                                                    |

本轮无数据库迁移、无 lockfile/Dockerfile/compose 变更，未跑 migrate/provision。

---

## 2. 部署前准备

```sh
cd /opt/jpqm
# 备份镜像（回滚点）
docker tag deploy-web:latest deploy-web:pre-main-20261125   # 旧 c884cda85860
docker tag deploy-api:latest deploy-api:pre-main-20261125   # 旧 467802e4cacc

# 5 个未跟踪文件：先备份再删
mkdir -p /root/jpqm-manual-backup-20261125
cp -a deploy/BingSiteAuth.xml deploy/googlea01c41ed599c5311.html \
      deploy/Caddyfile.bak-20261113 deploy/caddy/Caddyfile.bak deploy/caddy/Caddyfile.bak. \
      /root/jpqm-manual-backup-20261125/
rm -f deploy/BingSiteAuth.xml deploy/googlea01c41ed599c5311.html \
      deploy/Caddyfile.bak-20261113 deploy/caddy/Caddyfile.bak deploy/caddy/Caddyfile.bak.
```

删除后 `git status --porcelain` 为空。两个站点验证文件的内容本来就在 `deploy/caddy/Caddyfile:24-39` 的内联 `handle` 里（Bing 验证串 `EDA4FA186A6B3A981863D4145C31280D`、Google 验证串），所以文件是纯冗余。

---

## 3. 合并 PR #78

PR 因为分支落后被要求先更新：

```text
X Pull request #78 is not mergeable: the head branch is not up to date with the base branch.
gh pr update-branch 78   → head 31300c0，checks(release-gate / docker-smoke) 全 SUCCESS
gh pr merge 78 --squash  → mergeCommit d53db8f，state MERGED
```

PR 内容只改 `package.json` 的 dev 脚本（加 `--env-file-if-exists=.env`），不影响生产运行时；仍随本轮部署一并上线，保持生产 HEAD 与 main 一致。

---

## 4. 部署

```sh
cd /opt/jpqm && git pull --ff-only
# 693a9ec..d53db8f  Fast-forward，32 files changed，+4570/−124
nohup sh -c 'cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml up -d --build' \
  > /tmp/jpqm-deploy-20261125.log 2>&1 &
```

构建产物：

| 镜像                | 新 ID          | 创建时间 (UTC)       |
| ------------------- | -------------- | -------------------- |
| `deploy-web:latest` | `53a947dc4d84` | 2026-11-25T05:44:43Z |
| `deploy-api:latest` | `65eae05a69ec` | 2026-11-25T05:44:33Z |

容器：`api` healthy、`web` healthy、`caddy` 重启后正常、`db` 未重建（仍 11 天）。

---

## 5. 验收

### 5.1 端点

| 路径               | 状态 | 大小                             |
| ------------------ | ---- | -------------------------------- |
| `/`                | 200  | 39,640 B                         |
| `/shikaku/`        | 200  | 30,421 B                         |
| `/shikaku/takken/` | 200  | 50,190 B                         |
| `/pass-rate/`      | 200  | 27,225 B                         |
| `/schedule/`       | 200  | 54,464 B                         |
| `/compare/`        | 200  | 27,929 B                         |
| `/updates/`        | 200  | 34,577 B                         |
| `/robots.txt`      | 200  | 69 B                             |
| `/sitemap.xml`     | 200  | 3,787 B                          |
| `/ready`           | 404  | 24,200 B（按 3D 决策不对外暴露） |

### 5.2 sitemap / robots

- `<loc>` 52 条；`?year=` 0 条；`/shikaku/<slug>/` 6 个（takken、gyoseishoshi、it-passport、fundamental-it-engineer、bookkeeping、fp）。
- `robots.txt` 仍指向 `https://shikakucheck.com/sitemap.xml`。

### 5.3 ICS

```text
/ics/it-passport/2026.ics  → 200 text/calendar; charset=utf-8
/ics/takken/2026.ics       → 200 text/calendar; charset=utf-8
/ics/month/2026-12.ics     → 200 text/calendar; charset=utf-8
```

### 5.4 就绪探针

```text
docker compose -f deploy/docker-compose.prod.yml exec -T api \
  node scripts/check-readiness.mjs --url=http://127.0.0.1:4100/ready
ready | http://127.0.0.1:4100/ready | HTTP 200 | 102ms
exit=0
```

### 5.5 镜像内容核对（只看 git 不够）

`9b97a50` 的兄弟路由元素级校验已在镜像里：

```text
isCalendarEnvelope    x2
isUpdatesEnvelope     x2
isComparisonEnvelope  x2
```

### 5.6 删除冗余文件后验证 URL

```text
/BingSiteAuth.xml                      -> 200
/googlea01c41ed599c5311.html           -> 200
/dd3d6c883de8475fb7f2d7639208d313.txt  -> 200
/b416920e453b400196646cfea16e885b.txt  -> 200
```

### 5.7 部署期间的 readiness 抖动

重启窗口内定时探针记录了一次失败，随后自动恢复：

```text
13:45:01 jpqm-readiness: status=unreachable ... reason=connect code=ECONNREFUSED
13:50:03 jpqm-readiness: recovered: status=ready after 1 checks
```

这是部署重建容器导致的预期瞬断，不是缺陷；也顺带证明 3L 探针会在站点不可达时真的喊出来。当前状态文件为 `ready / 0`。

---

## 6. patrol（首次在生产跑）

在 `python:3.12-slim` 容器里挂载 `/opt/jpqm` 执行（宿主机 Python 3.6.8 跑不了 collector）：

```sh
docker run --rm -v /opt/jpqm:/w -w /w python:3.12-slim sh /w/var/patrol-run-prod.sh
```

- run_id：`patrol-20261125T054725Z`，耗时 05:47:25Z–05:51:10Z
- 来源 61：**changed 45 / failed 16**；`candidate_ingest: not_run`、`database_write: not_run`（未授权落库，未写库）
- 快照 43 个文件：bookkeeping 22、takken 9、fundamental-it 8、it-passport 4
- 产物：`var/patrol/patrol-report.json`、`registry.json`（61 条）、`cache.json`

失败 16 条（未写库，只影响本轮快照覆盖）：

| 资格                | 条数 | 错误                                         |
| ------------------- | ---- | -------------------------------------------- |
| fp（jafp + kinzai） | 13   | `Connection reset by peer` 6、`timed out` 10 |
| gyoseishoshi        | 3    | 同上                                         |

这是**生产出口网络对这些站点的连通性问题**（云 VPS IP 被重置/超时），不是采集逻辑错误；从开发机跑的 patrol 通常能取到。若以后要在生产执行 `patrol:record`，需先解决这 16 条的出口问题，否则会把失败记进 `source_checks`。

跑完后同容器命令重跑 `ops-daily-report`：

```text
覆盖缺口 0
库有登记但巡检清单缺失：无
巡检清单有但库未登记：无
```

`ops-daily` 摘要（05:52Z）：来源 52（critical 2 / warning 50）、到期事实 29、待审 0、`overallStatus: action_needed`。2 个 critical 是既有的 `source:bookkeeping:candidate-data-class2/class3`（blocked），与本次部署无关。

---

## 7. access.log 观测（P2/P6）

```text
日志 7,902 行；首条 ts 1794655760（11-19），末条 ts 1795585636（11-25 13:47）
/pass-rate/ 近 24h：55 次，全部 200
/pass-rate/ 部署后：5 次，全部 200
部署后总请求 67：200 ×62、404 ×5（404 来自验收时的 /ready 探测）
全日志 5xx：0
```

`access.log` 当前 9,978,812 B = 阈值的 95.2%，尚未轮转；`blog-access.log` 600,740 B，自 11-23 13:42 起不再增长（由独立 `blog` nginx 容器写入，不归本仓库 Caddyfile 管，无轮转策略属已知外部问题）。`roll_keep 5` 下最多约 60 MB，磁盘（12G/40G）无压力。

---

## 8. 回滚路径

```sh
cd /opt/jpqm
git checkout 693a9ec            # 或 git reset --hard 693a9ec（现分支已 FF）
docker compose -f deploy/docker-compose.prod.yml up -d --build
# 若只想回镜像、不改代码：
docker tag deploy-web:pre-main-20261125 deploy-web:latest
docker tag deploy-api:pre-main-20261125 deploy-api:latest
docker compose -f deploy/docker-compose.prod.yml up -d web api
```

本轮无 DB 迁移，回滚不需要动数据库。

---

## 9. 遗留与下一步

1. **access.log 预计今天内到 10 MB 自动轮转**；轮转后应出现 `access-<timestamp>.log`，确认后即可把 P2 关闭。若到明天仍未轮转，再查 caddy 容器的 `roll_size` 是否生效。
2. **patrol 16 条失败**：确认是生产出口问题后，决定 patrol 的常规执行位置（生产仅生成 registry，抓取放开发机），或在生产前加代理；在解决前不要在生产执行 `patrol:record`。
3. PR #78 的远端分支 `chore/dev-env-file` 仍在（未授权删除），可择机清理。
4. 既有运营待办不变：2 个 bookkeeping 来源 blocked、29 条到期事实（328 天未复核）。
