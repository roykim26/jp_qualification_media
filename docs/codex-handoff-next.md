# Codex 历史开发交接说明

> 本文记录 2026-08-11 时点的宅建阶段状态，仅供追溯；当前发布门禁和资格范围以 `docs/runbook.md` 为准。

更新时间：2026-08-11
项目：日本资格考试数据媒体
工作目录：项目仓库根目录

## 1. 当前结论

宅建（`takken`）阶段 1 已完成发布前闭环，但尚未执行生产发布，也未连接任何生产服务。

当前本地 PostgreSQL 数据库已完成：

- 6 条宅建真实官方页面候选事实人工批准；
- 6 条正式事实；
- 6 条批准 revision；
- 6 条 change event；
- 0 条 `pending_review`；
- 所有公开事实均绑定 RETIO 官方来源和真实快照；
- 公开 API 本地返回 6 条 `approved`、`synthetic=false` 的事实。

数据库门禁结果：

```json
{
  "pending": 0,
  "approvedFacts": 6,
  "approvedRevisions": 6,
  "changeEvents": 6,
  "valid": true
}
```

## 2. 已完成模块

### 阶段 0

- 单仓 TypeScript + Python 工程骨架；
- PostgreSQL schema 和幂等迁移；
- 6 个资格主数据；
- collector / validator / reviewer / publisher / public 权限边界；
- 高风险事实强制人工审核；
- CI、运行文档、数据契约和测试。

### 宅建阶段 1

- RETIO 来源登记：`https://www.retio.or.jp/exam/`；
- 允许域名、HTTPS、超时、重试、缓存、重定向、404 策略；
- 真实日程页受控抓取；
- 本地真实快照保存于 `var/official-snapshots/takken/`；
- 日程字段解析：网上/邮寄申请开始与截止、考试日、合格发表日；
- 所有高风险候选默认 `pending_review/high`；
- 本地审核后台和审核接口；
- 审核批准事务写入 `reviews`、`fact_revisions`、`facts`、`change_events`；
- 公开 API 查询正式批准事实；
- 发布失败保留上一版本；
- 回滚函数和本地发布演练。

## 3. 关键入口

- 审核后台：[apps/admin/src/server.ts](../apps/admin/src/server.ts)
- API 服务：[services/api/src/server.ts](../services/api/src/server.ts)
- 公开事实查询：[services/api/src/public-facts.ts](../services/api/src/public-facts.ts)
- 发布门禁和数据库回滚：[services/api/src/release.ts](../services/api/src/release.ts)
- 宅建管线：[services/api/src/takken.ts](../services/api/src/takken.ts)
- 采集器：[services/collector/src/collector/takken.py](../services/collector/src/collector/takken.py)
- 安全抓取策略：[services/collector/src/collector/http_policy.py](../services/collector/src/collector/http_policy.py)
- 发布演练测试：[tests/release-rehearsal.test.ts](../tests/release-rehearsal.test.ts)
- 阶段记录：[docs/stage-log.md](../docs/stage-log.md)
- 阶段 1 说明：[docs/stage1-takken.md](../docs/stage1-takken.md)

## 4. 本地环境

Docker Desktop 应运行本地 PostgreSQL 和 MinIO。数据库连接：

```text
postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media
```

项目命令统一使用 `pnpm`，并以 `package.json` 中声明的版本为准。

pnpm v11 构建配置已固定为允许 esbuild：

```yaml
allowBuilds:
  esbuild: true
```

## 5. 启动本地审核后台

当前 6 条事实已经审核完成，通常不需要再次审核。若需查看审核记录：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:ADMIN_REVIEWER_ID='local-reviewer'
$env:ADMIN_PORT='3001'
pnpm dev:admin
```

地址：

```text
http://127.0.0.1:3001/review/takken?reviewer=local-reviewer
```

## 6. 已验证命令

```powershell
pnpm install --offline
pnpm typecheck
pnpm build
pnpm test
pnpm test:python
```

最近一次结果：

- Vitest：16/16 通过；
- Python：13/13 通过；
- TypeScript 类型检查：通过；
- 构建：通过。

发布门禁：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
node --input-type=module -e "import {checkTakkenRelease} from './dist/services/api/src/release.js'; console.log(JSON.stringify(await checkTakkenRelease(process.env.DATABASE_URL)))"
```

期望：`valid:true`。

## 7. 下一步建议

推荐顺序：

1. 不改动已批准的宅建正式事实，完成阶段 1 的归档和验收记录；
2. 若用户明确授权生产发布，再单独设计生产部署、密钥、备份、监控和发布审批流程；
3. 若继续开发而不发布生产，进入阶段 2，优先处理 IT Passport；
4. IT Passport 必须复用来源登记 → 快照 → 候选事实 → 高风险审核 → revision → 公开读取链路；
5. IT Passport 接入真实页面前，必须先制定该资格的允许域名、页面结构、字段映射和受控抓取计划；
6. 不要同时批量接入其他 5 个资格，也不要创建 52 个正式页面。

## 8. 安全边界

- 不得把示例日期、费用、合格率作为生产种子数据；
- 高风险事实不得自动批准；
- 未绑定官方来源和原始快照的事实不得进入公开 API；
- 不得使用 `NODE_ENV=production` 运行本地候选写入命令；
- 不得向生产数据库、生产对象存储或生产部署写入；
- 真实页面抓取必须通过 `SafeFetcher`，不得绕过域名、超时、重试、缓存和重定向策略；
- 任何新资格必须先完成来源和字段契约，再写采集器。

## 9. 当前已知注意事项

- `apps/admin` 是本地最小审核后台，不是生产级身份认证系统；
- `release.ts` 的回滚函数是受控数据库函数，使用前必须由 publisher 权限流程调用，不能直接暴露给公开 API；
- 历史 `defer` 审核记录保留在 `reviews` 表中，最新 `approve` 记录才决定候选当前状态；
- 全仓 Prettier 可能仍报告历史设计文档和部分配置文件格式问题；本次修改文件已格式化；
- 真实快照目录属于本地运行产物，已加入忽略规则，不应提交为生产种子。

## 10. 新会话启动检查清单

- [x] 读取 `docs/product-design.md`；
- [x] 读取 `docs/codex-handoff.md`；
- [x] 读取本文件；
- [ ] 检查 Docker 容器和本地数据库（本轮 Docker API 不可用）；
- [ ] 运行发布门禁检查（依赖本地 PostgreSQL，本轮未验证）；
- [x] 运行类型检查、构建和 Python 测试；Vitest 受当前沙箱 `spawn EPERM` 阻塞；
- [x] 确认没有生产环境变量和生产写入；
- [x] 完成宅建阶段 1 归档，并进入 IT Passport 来源/字段契约阶段。
