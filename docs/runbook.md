# 阶段 0/1 运行说明

本项目仅支持本地开发。不得配置生产数据库、生产对象存储、AdSense 或真实凭据。

1. `pnpm install`
2. `docker compose up -d`（只在需要本地 PostgreSQL/MinIO 时）
3. `pnpm db:migrate`
4. `pnpm db:seed`
5. `pnpm typecheck && pnpm test && pnpm test:python && pnpm build`

`fixtures/official-snapshots` 中的内容必须使用 `synthetic`/`test-only` 标识；当前没有动态生产事实种子。公开 API 仅返回已批准正式事实，空库时返回空集合。

当前阶段 1 用户页面范围为宅建和 IT Passport。统一页面入口为 `/shikaku/`，资格详情使用 `/shikaku/{slug}/`、`/application/` 和 `/exam-content/`；页面只通过公开 API 读取事实。

## 阶段边界

阶段 1 当前只实现宅建闭环，不实现实时采集、其他资格、正式页面模板、生产发布、认证供应商、通知服务或外部生产连接。

API 契约见 [docs/api-contract.md](api-contract.md)。

阶段 1 宅建闭环说明见 [docs/stage1-takken.md](stage1-takken.md)。

# 本地审核队列

启动前设置本地 reviewer 身份（不要使用生产数据库）：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:ADMIN_REVIEWER_ID='local-reviewer'
$env:ADMIN_PORT='3001'
pnpm dev:admin
```

打开 `http://127.0.0.1:3001/review/takken`。页面只接受配置的 reviewer 身份，逐条查看 RETIO 官方原文并填写理由后选择批准、拒绝或延期。高风险事实批准后会创建修订和正式事实，但仍需后续构建成功才允许公开发布；延期和拒绝不会进入公开 API。

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
