# 日本资格考试数据媒体

阶段 1 的宅建与 IT Passport 本地闭环已归档；阶段 2 的六资格页面、跨资格日程/比较/更新与 ICS 下载，以及阶段 3 的技术 SEO 基线均已完成。**公开站与公开 API 自 2026-11-15 起已部署生产（`https://shikakucheck.com`）**；admin 与采集链不上生产，采集继续在开发机本机跑。任何动态事实都必须先经批准才出现在公开面。

页面完成不等于数据完成。数据现状：本机库 1007 条已批准正式事实（宅建 16／行政書士 15／IT Passport 10／基本情報技術者 28／簿記 863／FP 75；release baseline 与 CI 夹具已同批刷新为 1007 facts／37 snapshots＝本机库／baseline／CI 夹具三方一致，2026-11-13 随 squash PR #79 合并；D2 八条纯新增、按 fact_id 比对零值差），覆盖缺口 0（`coverageGaps=0` 只表示 required 档字段齐全，`conditional` 档在维度未命中时整条跳过、`post_event` 档永不参与，**不等于字段全齐**），`pnpm verify:all` 六资格全通过。历史统计类字段：簿記 863 条历年统计事实已批准并接上公开面历年表（工作包 G）；FE 统计五字段已由推移表 xlsx 事实化（工作包 J，令和7完整年度 5 条，迁移 0029；目录页 `statistics-fe` 供方法论证据；同日 D2 历史年度轮再批准令和5/6 八条，`exam_year` 2023/2024，FE 统计合计 13 条）；其余资格的合格率等字段仍无已批准事实，其只读调研与候选官方统计页清单见 [docs/work-package-f-statistics-sources.md](docs/work-package-f-statistics-sources.md)。逐资格字段账目见 `docs/<qualification>-source-contract.md`，门禁与授权口径见 [docs/data-gate-semantics.md](docs/data-gate-semantics.md)。

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

入口：`pnpm dev:api`（API）、`pnpm dev:web`（公开站，六资格全部页面）、`pnpm dev:admin`（后台骨架）。后台写操作（批准、拒绝、延期、撤销）只接受 `x-reviewer-id` 请求头，`?reviewer=` 查询参数仅用于打开队列页（只读），不提供匿名生产写入。

公开页默认从 `http://127.0.0.1:4100` 读取 API，可用 `API_BASE_URL` 覆盖。公开页入口为 `/`、`/shikaku/`（六资格总览）、`/shikaku/{slug}/` 及各自的 `/application/`、`/exam-content/`、`/pass-rate/`、`/{year}/` 年度页，另有 `/schedule/`、`/compare/`、`/pass-rate/`、`/guide/`、`/updates/`、`/about/*` 等。完整路由清单与索引策略见 [docs/adr/0002-index-policy.md](docs/adr/0002-index-policy.md)。

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

阶段记录：[docs/stage1-acceptance.md](docs/stage1-acceptance.md)、[docs/stage-log.md](docs/stage-log.md)（按日期追加的完整交付流水，含每次 PR／CI／部署证据）。**接续开发先读开工单** [docs/next-round-ticket.md](docs/next-round-ticket.md)（在途 PR、本轮待办顺序、轮前现取命令、本机卡点）；长周期交接背景见 [docs/transition-handoff.md](docs/transition-handoff.md)（正文停在 2026-11-10 时点，最新状态见文首更新注记）。P1-1 运营发现处理见 [docs/handover-p1-ops-findings.md](docs/handover-p1-ops-findings.md)；kinzai FP 域名迁移授权单见 [docs/work-package-i-kinzai-domain-migration.md](docs/work-package-i-kinzai-domain-migration.md)；FE 合格率事实化见 [docs/work-package-j-fe-pass-rate-proposal.md](docs/work-package-j-fe-pass-rate-proposal.md)；簿记历年统计接公开面见 [docs/work-package-g-history-presentation.md](docs/work-package-g-history-presentation.md)；统计来源调研见 [docs/work-package-f-statistics-sources.md](docs/work-package-f-statistics-sources.md)。

逐资格来源登记与字段契约：[docs/it-passport-source-contract.md](docs/it-passport-source-contract.md)、[docs/gyoseishoshi-source-contract.md](docs/gyoseishoshi-source-contract.md)、[docs/fundamental-it-engineer-source-contract.md](docs/fundamental-it-engineer-source-contract.md)、[docs/bookkeeping-source-contract.md](docs/bookkeeping-source-contract.md)、[docs/fp-source-contract.md](docs/fp-source-contract.md)。宅建的阶段闭环与 `source:takken:retio-exam` 登记说明见 [docs/stage1-takken.md](docs/stage1-takken.md)。
