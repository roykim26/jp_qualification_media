# 交接：P1-1 运营发现处理（失效来源拍板与改 URL）

生成：2026-11-11。本轮仅落交接文档，未动代码/迁移/库。所有库态/容器态为生成时现取，**下一窗口须重取复核**（交接单与环境结论会过期）。

## 仓库与进度

- 仓库 `E:\自建程序\jp_qualification_media`，`main` = `1933fd3`（已 push `origin/main`，Release gate CI run `43016104382` success）。工作区干净，仅未跟踪 `Python/` 是旧环境残留，**别删、别提交**。
- P1-1「来源巡检/失败记录/告警/人工日检/数据更新 SOP」已实现＋真实库演练＋验收勾选，全链闭合（checklist 第 18 项 `[x]`，方案 `docs/p1-source-ops-proposal.md`）。本轮任务是处理巡检正确检出的 **3 类失效来源**，不是新功能。

## 进度更新（2026-11-11 A/C 落账轮）

- **A 已闭合**：号主拍板「批准，同批改」。`bookkeeping.py` 与契约测试改新 URL（去掉 `bookkeeping_contents/` 段），迁移 `0026_bookkeeping_statistics_url_drift.sql`（带旧值守卫的 UPDATE），簿记契约文档同步；随 `bdca005` 进 main。
- **C 已闭合**：号主拍板「登记」。迁移 `0027_fundamental_it_statistics_source.sql`（INSERT ON CONFLICT DO NOTHING，`official_statistics`，仅证据、不产候选），FE 契约文档同步；随 `bdca005` 进 main。是否供 FE `pass_rate` 事实＝工作包 J 方案稿范畴，另行拍板。
- `bdca005` 直推 main（号主批准），CI run `43027223116` release-gate／docker-smoke 双绿（vitest 15 文件／139、pytest 214、gate 40/0、verify 6/0、smoke 982、CI seed bound 52）。
- 本机已应用迁移 0026/0027（2 Applied，复跑 0 Applied），`sources` 51→**52**、`facts` **994** 不变、`pending_review` 0、`verify:all` 6/6。⚠ 下文「本机运行态」节的迁移 26/26、sources 51 为生成时点旧读数。
- **B → 工作包 I**：离线调查完成（9 条 301 目的地经 saved-page 内链离线核实、旧适配器静默误解析证据现取、新页锚点映射），方案稿 `docs/work-package-i-kinzai-domain-migration.md` 已起草，**待号主拍板 D1～D5**（D1 扩白名单到 `products.kinzai.or.jp` 属安全边界决策）；采集/候选入库/审核批准仍是三次独立授权，重抓前先固化现有快照。

## 进度更新（2026-11-12：B 全闭合＋工作包 J 闭合＋D2 历史年度轮闭合）

- **B 已全闭合**：号主拍板 D1～D5（D3 修订为退役空登记 `kinzai-schedule`）后，`4f45330` 域名迁移代码＋四提取器重写＋迁移 `0028`（本机已应用，sources 52→51）；随后三次独立授权连走＝7 条 kinzai 实抓（旧快照先固化备份）→4 条产事实页入库 27 候选→admin 批准 27/27（4 条 schedule 实技新值上线，补旧提取器漏抓的第 3 窗口）；同日巡检收尾轮重跑 home/2/3 三条证据页，**7 条 kinzai 最新 source_checks 全 changed/200，原始「9 条 failed」发现全闭合**。逐轮读数见 `docs/stage-log.md` 2026-11-12 三段与 `docs/work-package-i-kinzai-domain-migration.md` §12。
- **C 的延伸＝工作包 J 已闭合**：FE 统计五字段经推移表 xlsx 事实化（阶段 1 仅采集核读→阶段 2 离线代码→阶段 3＋4 连走），迁移 `0029` 登记 `source:fundamental-it:statistics-suiihyo`；批准 5 条（令和7完整年度：応募 172217／受験 147186／合格 56370／合格率 38.3%＋目录页方法论），FE facts 15→**20**、全库 994→**999**、pending 0、门禁 6/6；`f46c943` 直推 main，CI run `43160584486` 双绿。方案与执行记录见 `docs/work-package-j-fe-pass-rate-proposal.md` §11。
- **D2 历史年度轮亦闭合（同日后续轮）**：复用 J 轮既有 xlsx 快照（零新抓取），入库并批准令和5/6 八条统计（`exam_year=2023/2024`：2023 応募 140774／受験 121611／合格 57278／合格率 47.1%；2024 応募 157259／受験 133732／合格 54501／合格率 40.8%，审阅人 `d2-fe-history-owner-review`）⇒ FE facts 20→**28**、全库 999→**1007**、pending 0、门禁 6/6，运营表幂等零新增。D1 月度附件刷新经当日取证判无漂移、挂起。读数见 `docs/stage-log.md` D2 段与 FE 契约 D2 节。
- **本机现态（2026-11-12）**：迁移 **30**（0000–0029）、sources **52**、facts **1007**（FE 28）、pending **0**、candidate_facts/reviews/change_events/fact_revisions 各 **1046**、snapshots **80**、capture_runs **17**、source_checks **68**；baseline／CI 夹具已于 2026-11-12 刷为 **999 facts／37 snapshots** 并合并（squash PR #73＝`ef8ce97`；差 17＋kinzai **7** 条值差同批进夹具，PR CI `43179797846`＋main push CI `43180906300` 双绿）；**D2 轮后本机领先夹具 8 条（1007 vs 999），刷新属另一次授权**。下文「本机运行态」节的旧读数一律以本段与开工单 §3 为准。

## 本机运行态（生成时现取，会过期，用前重取）

- 容器 `jpqm-pg18` **运行中**（卷保留；若已停先启动 Docker Desktop 再 `docker start jpqm-pg18`）。连接 `postgresql://postgres@127.0.0.1:55432/qualification_media`（`.env` 库 URL 无效，须显式 55432）；只读口令 `api_ro_local_2026`。
- 迁移 26/26（`packages/db/migrations/0000–0025`）；`facts_approved=994`、`pending_review=0`、`sources=51`；运营表 `capture_runs=10`、`snapshots=71`、`source_checks=60`（含 P1-1 演练巡检记录，保留）。
- 巡检报告 `var/patrol/patrol-report.json`（`run_id=patrol-20261111T105619Z`，62 来源＝51 changed / 9 failed / 2 blocked）；日报 `var/ops-reports/2026-11-11.{json,md}`。

## 核心口径（务必遵守）

- 失效来源**不自动改 `canonical_url`**；新 URL 须所有者拍板后「**代码＋迁移＋文档**」同批改（先例：FE cbt-s，见 checklist 2026-11-11「FE 补口实抓」条目）。**不猜 URL**。
- **扩大域名白名单属安全边界决策**，须所有者拍板（`SafeFetcher`/`SourcePolicy` 在 `services/collector/src/collector/http_policy.py`）。
- 采集、候选入库、审核批准是三次独立授权；push/开 PR 各要一句明示；只有出现「合并」二字才同意合并；**部署仍暂缓，别提部署**。定时任务/外部通知安装前必须确认。
- 数据边界：不动 release baseline 与 CI 夹具（现 **999／37**，改动仍需单独授权）；不推断 `eligibility`/`passing_standard`/`scoring_method`；`venue_rule`/`booking_window`/`application_rule` 保持 `not_applicable`；admin 写只认 `x-reviewer-id` 头；`data:staleness` 只读。

## 三项发现（证据现取自 patrol-report.json）

### A.（推荐先做）簿记 2 个历史页 blocked＝路径漂移，同域名，新 URL 已知

- `source:bookkeeping:candidate-data-class2`：登记 `https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class2` → 实际 `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class2`（HTTP 200，少了 `bookkeeping_contents/` 段）。
- `source:bookkeeping:candidate-data-class3`：同模式 `data_class3`。
- 代码 `services/collector/src/collector/bookkeeping.py`（`BOOKKEEPING_SOURCES`）、`ingest_bookkeeping.py`；登记迁移 `0018_bookkeeping_statistics_sources.sql`。域名 `kentei.ne.jp` 已在白名单。
- 待拍板：确认新路径 → 改代码 canonical_url ＋ 新迁移 `0026` UPDATE sources ＋ 文档；改前先核新页数据结构是否仍适配（这是合格率统计来源）。三项里最简单。

### B. kinzai FP 9 条 failed＝跳转到未白名单域名

8 条登记 `source:fp:kinzai-*` ＋ 1 条 `capture-only:fp:kinzai-fp-faq`。全部 `www.kinzai.or.jp/...` 301 到 `products.kinzai.or.jp`，白名单拒绝 → failed（**正确行为**）。登记 URL：

| source_id                     | 登记 URL                                              |
| ----------------------------- | ----------------------------------------------------- |
| kinzai-home                   | `https://www.kinzai.or.jp/ginou/fp/`                  |
| kinzai-1-academic             | `https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html` |
| kinzai-1-practical            | `https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html` |
| kinzai-2                      | `https://www.kinzai.or.jp/ginou/fp/2kyu/index.html`   |
| kinzai-3                      | `https://www.kinzai.or.jp/ginou/fp/3kyu/index.html`   |
| kinzai-eligibility            | `https://www.kinzai.or.jp/ginou/fp/sikaku.html`       |
| kinzai-schedule               | `https://www.kinzai.or.jp/ginou/fp/nittei-fp`         |
| kinzai-schedule-2026          | `https://www.kinzai.or.jp/fp/nittei-fp/48581.html`    |
| kinzai-fp-faq（capture-only） | `https://www.kinzai.or.jp/ginou/fp/faq`               |

- 代码 `services/collector/src/collector/fp.py`（`FP_SOURCES`）、`capture_fp.py`（`FP_CAPTURE_ONLY`）；登记迁移 `0009_fp_dimensions_and_sources.sql`（schedule 另见 `0016_fp_annual_schedule_sources.sql`）。
- **新路径未知**（抓取在白名单处即拒，未跟随跳转）。下一步须先查实际新 URL（人工浏览/经授权抓取）再拍板：是否登记 `products.kinzai.or.jp` 新域名 ＋ 改 URL。最复杂，涉及白名单扩张。

### C. statistics-fe changed 但库内未登记

- `source:fundamental-it:statistics-fe`：`https://www.ipa.go.jp/shiken/reports/toukei_fe.html`（HTTP 200，hash `d2178a936311b6e571136fb11d8c4c611c41f59a196c93f0d21d87c4aebf440f`，80686 B）。在代码 `FUNDAMENTAL_IT_SOURCES`（`fundamental_it.py`）且被巡检，但**任何迁移都未登记它**（grep 确认），故 record 跳过（`skipped_unregistered`）。域名 `ipa.go.jp` 已在白名单。
- 待拍板：是否登记进 `sources`（新迁移 INSERT）使巡检记录可关联；它是 FE 统计页，关联 P1 第 3 项「五资格最小合格率内容／FE 附件解析」，需先定它是否供 FE `pass_rate` 事实、适配器是否产候选。登记属独立决定。

## 建议执行顺序

A（新 URL 已知、同域名）→ C（登记决定）→ B（需查 URL ＋ 白名单决策）。每项：所有者拍板 → 代码＋迁移＋文档同批改 → 离线测试（pytest/verify-gate/vitest/format）→ 真实库演练（另行授权）→ commit/push（各需明示）。

## 本机注意

- 无 pnpm，用 npm；Docker Hub 可能走 IPv6 超时，镜像冒烟交 CI；日文输出前设 `PYTHONIOENCODING=utf-8`；`gh pr create/edit` 用 `--body-file`；`gh` 须在仓库内跑。
- 实抓时 `httpx 0.28.1` 会把 `NO_PROXY` 中 `[::1]` 当端口解析，用 `NO_PROXY="localhost,127.0.0.1"` 覆盖，**不改代码规避**。
- 巡检/落库/日检命令：`PATROL_LIVE_AUTHORIZED=1 npm run patrol:sources`（抓取不连库）；`PATROL_LOCAL_WRITE=1 DATABASE_URL=… npm run patrol:record`（仅运营表、localhost、幂等）；`DATABASE_URL=… npm run ops:daily`（只读，含 critical → EXIT 1）。迁移应用方式见 `docs/runbook.md`。
- 改完代码 Edit 不保证自动 prettier，须显式复检；报测试数先重跑、计数现取。
