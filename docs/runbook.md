# 阶段 0/1 运行说明

本项目仅支持本地开发。不得配置生产数据库、生产对象存储、AdSense 或真实凭据。

`SITE_ORIGIN` 用于 canonical、`robots.txt` 和 `sitemap.xml` 的绝对 URL；本地可使用 `http://127.0.0.1:3000`。已确认的生产值为 `https://shikakucheck.com`；应只在部署平台的生产环境变量中设置，不能提交真实生产凭据。生产环境缺少该变量时公开站拒绝生成 SEO 文件。

1. `pnpm install`
2. `docker compose up -d`（只在需要本地 PostgreSQL/MinIO 时）
3. `pnpm db:migrate`
4. `pnpm db:seed`
5. `pnpm typecheck && pnpm test && pnpm test:python && pnpm build`

`fixtures/official-snapshots` 中的内容必须使用 `synthetic`/`test-only` 标识；当前没有动态生产事实种子。公开 API 仅返回已批准正式事实，空库时返回空集合。

当前阶段 2 用户页面范围为 6 个首发资格。统一页面入口为 `/shikaku/`，每个资格提供概要、`/{year}/` 年度日程、`/application/`、`/exam-content/` 和 `/pass-rate/` 五类页面；页面只通过公开 API 读取事实，年度页严格按 `examYear` 隔离。日程页和资格年度页提供 `/ics/{qualification}/{year}.ics` 全年下载，日程事件提供单事件下载；没有明确日期的事实不会生成 ICS。`/compare/` 提供动态比较器与 3 篇静态比较指南；`/guide/` 提供 4 篇不包含动态事实的通用指南。

## 当前范围

阶段 0/1/2/3 已归档：六资格页面、跨资格日程/比较/更新、ICS 下载与技术 SEO 基线均已完成。数据侧当前状态为 176 条已批准正式事实、覆盖缺口 0、`pnpm verify:all` 六资格全通过（读数见 `docs/data-gate-semantics.md` 第 10 节）。

仍不在范围内：生产发布与生产数据库/对象存储、实时定时采集、正式认证与外部通知。页面完成不等于数据完成；每个资格哪些字段有官方事实、哪些靠规则型说明闭合，以对应的 `docs/<qualification>-source-contract.md` 为准。

API 契约见 [docs/api-contract.md](api-contract.md)。阶段 1 宅建闭环说明见 [docs/stage1-takken.md](stage1-takken.md)。门禁语义、判级规则与三级授权边界见 [docs/data-gate-semantics.md](data-gate-semantics.md)。

## 本地审核队列

启动前设置本地 reviewer 身份（不要使用生产数据库）：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:ADMIN_REVIEWER_ID='local-data-reviewer'
$env:ADMIN_PORT='3001'
pnpm dev:admin
```

打开 `http://127.0.0.1:3001/review/takken?reviewer=local-data-reviewer`，逐条查看官方原文并填写理由后选择批准、拒绝或延期。

写操作（批准、拒绝、延期、撤销）**只接受 `x-reviewer-id` 请求头**；`?reviewer=` 查询参数仅用于打开队列页（只读）。理由是 URL 里的审核人身份可被 `<img src=…>`、浏览器历史和代理访问日志重放。页面上的按钮会先弹出「审核人 ID」输入框，再由 `fetch` 以请求头发送。鉴权验收判据见 `docs/data-gate-semantics.md` 第 7 节。

高风险事实不得自动批准。批准会在同一维度组合上创建新 revision 并复用（复活）既有 `facts` 行；拒绝与延期不撤销已发布的正式事实；撤销只对 `ci://` 快照驱动的事实生效。

## 正式发布前门禁

本地正式发布前必须执行：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
pnpm release:check
```

该命令依次执行格式检查、全项目 Lint、类型检查、完整 JavaScript 测试、Python 测试、构建、门禁配置测试，以及 6 个首发资格的数据库 → API → Web 回归。任一代码检查或测试失败，或任一资格存在真实官方待审核候选、正式事实数量偏离基线、API 未 verified、Web 检查失败时，命令均以非零状态退出。CI 安装 Node.js 24、Python 3.13 和两个本地 Python 包后，直接调用同一命令。

事实数量基线位于 `config/release-gate-baseline.json`，禁止手工随意修改。只有在官方候选已全部审核、事实数量变化已确认时，才运行：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:RELEASE_BASELINE_CONFIRM='UPDATE_RELEASE_GATE_BASELINE'
pnpm baseline:update -- --confirm=UPDATE_RELEASE_GATE_BASELINE
```

维护命令要求参数和环境变量双重确认，仅允许 localhost 数据库，且任何资格仍有真实待审核候选时拒绝更新。更新后必须审查基线文件差异并重新运行 `pnpm release:check`。

## 远程 CI 数据快照

GitHub Actions 使用 PostgreSQL 16，依次执行迁移、seed、恢复 `fixtures/ci/approved-facts.sql`，最后调用与本地相同的 `pnpm release:check`。fixture 仅包含公开链所需的非 synthetic 已批准事实，不包含审核人、审核理由、冲突、本地路径或原始 HTML 正文。

正式事实变化且审核完成后，先更新门禁基线，再显式重新导出：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:CI_FIXTURE_EXPORT_CONFIRM='EXPORT_SANITIZED_CI_FIXTURE'
pnpm ci:fixture:export -- --confirm=EXPORT_SANITIZED_CI_FIXTURE
pnpm ci:fixture:verify
pnpm release:check
```

导出命令仅允许 localhost 数据库，真实候选存在 pending 时拒绝生成，并采用固定时间和 `ci://` object key 保证输出可审查、可重复。提交前必须同时审查基线 JSON 与 fixture SQL 的差异。

夹具现为 176 facts / 176 candidate_facts / 176 fact_revisions / 25 snapshots；重导后必须同步修改 `scripts/verify-ci-fixture.mjs` 第 9–12 行的四个计数断言，否则门禁会以 `ERR_ASSERTION` 失败。完整口径见 `docs/data-gate-semantics.md` 第 5、9 节。

## 采集与入库授权

采集、候选入库、审核批准是三次独立授权，逐段需要项目所有者明示批准，抓取授权不包含后两者。各资格的入口脚本与环境变量开关记录在对应的 `docs/<qualification>-source-contract.md`，总则见 `docs/data-gate-semantics.md` 第 8 节。
