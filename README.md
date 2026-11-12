# 日本资格考试数据媒体

阶段 1 的宅建与 IT Passport 本地闭环已归档；阶段 2 的六资格页面、跨资格日程/比较/更新与 ICS 下载，以及阶段 3 的技术 SEO 基线均已完成。当前不连接生产服务、不生成未审核动态事实。

页面完成不等于数据完成。数据现状：本机库 999 条已批准正式事实（宅建 16／行政書士 15／IT Passport 10／基本情報技術者 20／簿記 863／FP 75；release baseline 与 CI 夹具已于 2026-11-12 同批刷新为 999 facts／37 snapshots，含 kinzai 実技第三场次日期与 3 条 display 空格差），覆盖缺口 0，`pnpm verify:all` 六资格全通过。历史统计类字段：簿記 863 条历年统计事实已批准并接上公开面历年表（工作包 G）；FE 统计五字段已由推移表 xlsx 事实化（工作包 J，令和7完整年度 5 条，迁移 0029；目录页 `statistics-fe` 供方法论证据）；其余资格的合格率等字段仍无已批准事实，其只读调研与候选官方统计页清单见 [docs/work-package-f-statistics-sources.md](docs/work-package-f-statistics-sources.md)。逐资格字段账目见 `docs/<qualification>-source-contract.md`，门禁与授权口径见 [docs/data-gate-semantics.md](docs/data-gate-semantics.md)。

## 本地启动

要求：Node.js 20+、pnpm、Python 3.12+、Docker（仅在需要本地 PostgreSQL/MinIO 时）。

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm test:python
pnpm build
```

需要数据库时：`docker compose up -d`，再执行 `pnpm db:migrate` 与 `pnpm db:seed`。种子仅包含 6 个资格的稳定主数据和别名，不包含动态事实。

入口：`pnpm dev:api`（API）、`pnpm dev:web`（IT Passport 公开页）、`pnpm dev:admin`（后台骨架）。后台写操作（批准、拒绝、延期、撤销）只接受 `x-reviewer-id` 请求头，`?reviewer=` 查询参数仅用于打开队列页（只读），不提供匿名生产写入。

公开页默认从 `http://127.0.0.1:4100` 读取 API，可用 `API_BASE_URL` 覆盖。IT Passport 页面地址：`/shikaku/it-passport/`、`/shikaku/it-passport/application/`、`/shikaku/it-passport/exam-content/`。

实时读取工具仅在完成授权清单后运行，且只保存本地快照，不写数据库：

```powershell
$env:IT_PASSPORT_LIVE_AUTHORIZED='1'
python services/collector/src/collector/capture_it_passport.py
```

输出目录：`var/official-snapshots/it-passport/`。该命令不会生成候选事实；候选入库仍需单独人工确认。

已保存快照可执行纯离线分析：

```powershell
python services/collector/src/collector/analyze_it_passport_snapshots.py
```

该命令生成 `analysis-report.json`，只列出待审核候选和原文证据，不写数据库、不自动批准。

IT Passport 离线 fixture 候选入库示例（仅本地数据库）：

```powershell
$env:STAGE2_LOCAL_WRITE='1'
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:IT_PASSPORT_FIXTURE='fixtures/official-snapshots/it-passport-cbt.html'
$env:IT_PASSPORT_EXAM_YEAR='2026'
python services/collector/src/collector/ingest_it_passport.py
```

审核地址：`http://127.0.0.1:3001/review/it-passport?reviewer=local-reviewer`（只读入口；批准等写操作需 `x-reviewer-id` 请求头，页面会弹窗索取）。

## UI / Design System

后续公开页面 UI 升级、新增页面和组件实现必须先阅读并遵循 [docs/design-system.md](docs/design-system.md)。该文档是本项目统一的视觉、组件、响应式、状态、广告与可访问性规范。

## 目录

`apps/web`、`apps/admin`、`services/api`、`services/collector`、`services/parser`、`packages/schema`、`packages/content-rules`、`packages/db`、`packages/config` 与 `fixtures/official-snapshots`。

详见 [docs/runbook.md](docs/runbook.md)、[docs/adr/0001-stage-0-foundation.md](docs/adr/0001-stage-0-foundation.md) 和 [docs/data-contract.md](docs/data-contract.md)。

阶段记录：[docs/stage1-acceptance.md](docs/stage1-acceptance.md)、[docs/stage-log.md](docs/stage-log.md)。接续开发的交接单（含铁律、待办顺序与本机实测判据命令，2026-11-10 时点＝批准链收口＋工作包 G 的历年表接上公开面＋G-2 完整方案回填收口并已进 main＋`?year=` 的 SEO 口径已定为 `noindex,follow` 且不进 sitemap＋sitemap 自 #45 起按可索引性生成（空栏目页 `noindex,follow` 且不收、年度链接只列有内容年份，已固化成双向门禁断言与单测）＋窗口外 #46 的 MVP P2（更新信息分页、404 首页/搜索入口）与 #48 的 MVP P3（首页工具卡真链接、主な資格补项、ICS 友好错误页）＋基本情報 FE 停考事实 `suspension_period`（`facts` 982／FE 11，baseline 11＋CI 夹具 982 同批，#58）＋工作包 H 方案稿收编（#59）＋文档落账（#60）＋交接时点收尾与 §10 回归命令表刷新（#61／#62／#63，纯文档）＋#64 交接单时点收尾（纯文档）＋回滚路径两处硬编码收口（#65 事件类型按 `fact_key` 走 `updateEventTypeForFact()`、#66 页面标签取事实自己的 `qualification_id`，新增 `tests/rollback-event.test.ts` 4 条断言）＋#68 IT Passport 入口页边界（`jitec-home`／`ipa-exam` 首页 0 候选固化为用例与契约，无库变更）＋P0-1 核心事实／P0-4 生产 API 只读账号／P1-1 来源巡检闭合（巡检／失败记录／告警／人工日检／数据更新 SOP）＋P1-1 运营发现 A/C 落账（`bdca005`：簿记 2 页 URL 漂移修正迁移 0026、FE 统计来源登记迁移 0027，sources 51→52）＋P1-1 B kinzai 域名迁移全链闭合（`4f45330`：迁移 0028＋四提取器重写，sources 52→51；27 候选批准、4 条 schedule 实技新值上线、巡检收尾 7 条全 changed/200）＋工作包 J FE 统计事实化（`f46c943`：推移表 xlsx 提取器＋迁移 0029，批准令和7完整年度 5 条，FE 15→20）＋**开发库已于 2026-10-23 后丢失，本机现存库＝Docker `jpqm-pg18`（容器现运行中、卷保留；迁移 30、facts 999，baseline／CI 夹具 982）**（`verify:all` 6/6、vitest 15／139、pytest 237 已复跑），main `f46c943`）：[docs/transition-handoff.md](docs/transition-handoff.md)（正文停在 2026-11-10 时点，最新状态见文首更新注记）。**新窗口接续开发先读开工单**（在途 PR、本轮待办顺序、轮前现取命令、本机卡点）：[docs/next-round-ticket.md](docs/next-round-ticket.md)。P1-1 运营发现处理见 [docs/handover-p1-ops-findings.md](docs/handover-p1-ops-findings.md)（含 2026-11-12 进度节：A/B/C 全闭合＋工作包 J 闭合）；kinzai FP 域名迁移授权单（已实施完毕）见 [docs/work-package-i-kinzai-domain-migration.md](docs/work-package-i-kinzai-domain-migration.md)；FE 合格率事实化方案与执行记录见 [docs/work-package-j-fe-pass-rate-proposal.md](docs/work-package-j-fe-pass-rate-proposal.md)。簿记历年统计接公开面的工作包 G（方案稿＋第十一轮／第十三轮两段执行记录：**G-1 历年表、G-2 最小方案与完整方案（`event_type` 加 `statistics_update` 并回填历史）均已落地**，G-3 按拍板维持不动）：[docs/work-package-g-history-presentation.md](docs/work-package-g-history-presentation.md)。

逐资格来源登记与字段契约：[docs/it-passport-source-contract.md](docs/it-passport-source-contract.md)、[docs/gyoseishoshi-source-contract.md](docs/gyoseishoshi-source-contract.md)、[docs/fundamental-it-engineer-source-contract.md](docs/fundamental-it-engineer-source-contract.md)、[docs/bookkeeping-source-contract.md](docs/bookkeeping-source-contract.md)、[docs/fp-source-contract.md](docs/fp-source-contract.md)。宅建的阶段闭环与 `source:takken:retio-exam` 登记说明见 [docs/stage1-takken.md](docs/stage1-takken.md)。
