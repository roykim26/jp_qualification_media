# API 契约草案（阶段 0）

## Public

- `GET /health` → `{ status: "ok", stage: 0 }`；**liveness only**，不访问数据库，数据面不可用时仍返回 200。
- `GET /ready` → 就绪探针。数据面可用时 `200 { status: "ready", database: "ok" }`；数据库不可达时 `503 { status: "unavailable", database: "error", message }`；未配置数据库时 `503 { status: "unavailable", database: "unconfigured" }`。只执行 `SELECT 1`，不读业务表、不写、不缓存结果。**与 `/health` 的区别是 liveness vs readiness**：`/health` 回答「进程活着吗」，`/ready` 回答「现在能服务查询吗」。`/ready` 未接入 compose healthcheck（有意为之，见 `docs/runbook.md`）。消费方是运维探针 `scripts/check-readiness.mjs`（`pnpm ready:check`，只读、退出码 0/1、`--json` 输出机器可读结论）。
- `GET /api/v1/qualifications` → `{ data: Qualification[] }`，只返回稳定主数据。
- `GET /api/v1/search/qualifications?q={query}` → `{ data: QualificationSearchResult[], query }`，按正式名称、简称、别名和 slug 搜索稳定资格主数据。
- `GET /api/v1/facts` → `{ data: PublicFact[] }`，实现必须只查询 `status=approved`、存在 `source_snapshot_id` 且当前修订的正式事实；候选事实、审核任务、冲突和未验证事实禁止返回。
- `GET /api/v1/calendar?year={year}&qualification={slug}` → `{ data: PublicCalendarEvent[], query }`，从公开 approved facts 中聚合申込開始、申込締切、試験日/試験日程、合格発表；不得补全未确认日期。
- `GET /api/v1/compare?qualifications={slug,slug,slug}` → `{ data: PublicQualificationComparison, query }`，最多比较 3 个资格，按统一事实维度横向展示；缺失事实必须显示为未确认而不是推断。
- `GET /api/v1/updates?qualification={slug}&limit={1-100}&offset={n}` → `{ data: PublicUpdateEvent[], query, pagination: { limit, offset, hasMore } }`，从 `change_events` 读取公开事实变更和订正记录，展示变更前后值、影响页面、来源和反映时间；`limit` 默认 100、`offset` 默认 0，越界值收敛到安全范围；页面巡检但事实未变时不得生成记录。
- `GET /api/v1/ics/{qualification}/{year}[/{event_id}]` → `text/calendar`，下载资格全年或单事件 ICS；仅包含有明确日期的已批准事实，UID 在事实变更后保持稳定，`SEQUENCE` 随批准变更或回滚递增；定时事件以 UTC 传输并保留日本时间语义，以兼容 Outlook 等不识别 IANA `TZID` 的客户端。
- `GET /api/v1/qualifications/{slug}` → `{ qualification, status, facts, officialVerifiedAt }`；没有非 synthetic 的已批准事实时返回 `status=awaiting_official`、空 `facts` 和 `officialVerifiedAt=null`。

### 数据端点的错误分层

上列数据端点（`/api/v1/facts`、`/api/v1/calendar`、`/api/v1/compare`、`/api/v1/updates`、`/api/v1/ics/*`、`/api/v1/qualifications`、`/api/v1/qualifications/{slug}`、`/api/v1/qualifications/takken`）在两种失败下**不再伪装成合法空数据**：

| 情形                                                          | 响应                                                          | 语义                         |
| ------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------- |
| 数据库**未配置**（`DATABASE_URL`／`API_DATABASE_URL` 均为空） | `500 { statusCode: 500, code: "database_not_configured", … }` | 永久性配置错误，重试不会自愈 |
| 数据库**不可达**（连接被拒／超时）                            | `5xx`，`code` 为驱动错误码（如 `ECONNREFUSED`）               | 瞬态故障，稍后重试有意义     |
| 已配置、连接正常、确实没有已批准事实                          | `200` + 空数组／`awaiting_official`                           | 合法的「暂无数据」           |

用 500 而不是 503 表示配置缺失，是为了把「永久错」和「瞬态错」分开：503 会向客户端承诺「稍后再试就好」，对配置错误是假承诺。

> `NODE_ENV=test` 下保留旧的 fail-empty 行为（返回空数组），因为单元测试套件刻意不连库（`tests/setup.ts` 删除 `DATABASE_URL`）。该逃生口**仅**作用于数据读取路径，`/ready` 在任何环境下都不会对配置缺失报告就绪。

## Internal draft

- `POST /internal/snapshots`：仅 `collector`，写原始快照；幂等键为 `source_id + content_hash`。
- `POST /internal/candidate-facts`：仅 `collector`/`validator`，写候选事实；幂等键为快照、资格、级别、年度、事实键。
- `POST /internal/reviews/{id}`：仅认证 `reviewer`，请求必须包含 `decision=approve|reject|defer` 与非空 `reason`；高风险事实、无快照事实和来源冲突必须人工决策。
- `POST /internal/publish`：仅 `publisher`，只接受已批准候选；在事务内创建 revision、关闭旧 revision、更新 current pointer、记录 change event 并触发重建。

实际落地状态（2026-10-11 只读核查，别再按本节假设存在 HTTP 写入面）：四条里**只有 `POST /internal/reviews/{id}` 已实现**，位于 `apps/admin/src/server.ts`，写操作只认 `x-reviewer-id` 请求头。`POST /internal/snapshots` 与 `POST /internal/candidate-facts` 无对应端点——快照与候选由 `services/collector` 的 Python 入库脚本直接写 `snapshots`／`candidate_facts` 表；`POST /internal/publish` 同样无端点，`facts`／`fact_revisions`／`change_events` 的唯一写入方就是上述审核端点，即本节设想的 publisher 发布职责当前由 reviewer 端点在同一事务内承担。角色权限矩阵见 `packages/content-rules/src/index.ts`，其 `validator`／`publisher` 两个角色目前只被 `tests/stage0.test.ts` 断言、无生产调用方；`services/validator` 与 `services/publisher` 目录尚未创建（见 `docs/product-design.md` §22.2 的同一条标注）。

所有内部写接口必须认证、限速并携带幂等键；阶段 0 不暴露匿名写接口，也不绑定认证供应商。
