# 日本资格考试数据媒体

阶段 1 宅建本地闭环已归档，IT Passport 当前处于来源与字段契约阶段。当前不连接生产服务、不生成未审核动态事实。

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

入口：`pnpm dev:api`（API）、`pnpm dev:web`（IT Passport 公开页）、`pnpm dev:admin`（后台骨架）。后台写接口需要 reviewer 身份校验，不提供匿名生产写入。

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

审核地址：`http://127.0.0.1:3001/review/it-passport?reviewer=local-reviewer`。

## UI / Design System

后续公开页面 UI 升级、新增页面和组件实现必须先阅读并遵循 [docs/design-system.md](docs/design-system.md)。该文档是本项目统一的视觉、组件、响应式、状态、广告与可访问性规范。

## 目录

`apps/web`、`apps/admin`、`services/api`、`services/collector`、`services/parser`、`packages/schema`、`packages/content-rules`、`packages/db`、`packages/config` 与 `fixtures/official-snapshots`。

详见 [docs/runbook.md](docs/runbook.md)、[docs/adr/0001-stage-0-foundation.md](docs/adr/0001-stage-0-foundation.md) 和 [docs/data-contract.md](docs/data-contract.md)。

阶段记录：[docs/stage1-acceptance.md](docs/stage1-acceptance.md)、[docs/it-passport-source-contract.md](docs/it-passport-source-contract.md)。
