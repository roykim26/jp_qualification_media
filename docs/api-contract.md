# API 契约草案（阶段 0）

## Public

- `GET /health` → `{ status: "ok", stage: 0 }`
- `GET /api/v1/qualifications` → `{ data: Qualification[] }`，只返回稳定主数据。
- `GET /api/v1/search/qualifications?q={query}` → `{ data: QualificationSearchResult[], query }`，按正式名称、简称、别名和 slug 搜索稳定资格主数据。
- `GET /api/v1/facts` → `{ data: PublicFact[] }`，实现必须只查询 `status=approved`、存在 `source_snapshot_id` 且当前修订的正式事实；候选事实、审核任务、冲突和未验证事实禁止返回。
- `GET /api/v1/calendar?year={year}&qualification={slug}` → `{ data: PublicCalendarEvent[], query }`，从公开 approved facts 中聚合申込開始、申込締切、試験日/試験日程、合格発表；不得补全未确认日期。
- `GET /api/v1/compare?qualifications={slug,slug,slug}` → `{ data: PublicQualificationComparison, query }`，最多比较 3 个资格，按统一事实维度横向展示；缺失事实必须显示为未确认而不是推断。
- `GET /api/v1/qualifications/{slug}` → `{ qualification, status, facts, officialVerifiedAt }`；没有非 synthetic 的已批准事实时返回 `status=awaiting_official`、空 `facts` 和 `officialVerifiedAt=null`。

## Internal draft

- `POST /internal/snapshots`：仅 `collector`，写原始快照；幂等键为 `source_id + content_hash`。
- `POST /internal/candidate-facts`：仅 `collector`/`validator`，写候选事实；幂等键为快照、资格、级别、年度、事实键。
- `POST /internal/reviews/{id}`：仅认证 `reviewer`，请求必须包含 `decision=approve|reject|defer` 与非空 `reason`；高风险事实、无快照事实和来源冲突必须人工决策。
- `POST /internal/publish`：仅 `publisher`，只接受已批准候选；在事务内创建 revision、关闭旧 revision、更新 current pointer、记录 change event 并触发重建。

所有内部写接口必须认证、限速并携带幂等键；阶段 0 不暴露匿名写接口，也不绑定认证供应商。
