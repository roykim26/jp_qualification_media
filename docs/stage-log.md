# 阶段记录与剩余问题

## 阶段 0 结束时

- 已完成：单仓骨架、契约、PostgreSQL 迁移、6 个稳定资格主数据、权限边界、幂等规则、高风险审核规则、测试、CI 和运行文档。
- 已验证：TypeScript 类型检查/构建、Vitest 6/6、pytest 2/2、Prettier。
- 已验证：本机 PostgreSQL 空库迁移。`0000_stage_0.sql` 与 `0001_takken_source.sql` 各执行一次；迁移重跑无重复执行，种子重跑不重复插入；6 个资格、1 个宅建来源登记存在，候选事实和正式事实均为 0。
- 非阻塞：ESLint 当前只检查配置文件，TypeScript parser 接入留待工程质量专项；Python 测试曾生成受权限保护的临时目录，已加入忽略规则，不属于业务数据。

## 阶段 1 当前边界

本轮只实现宅建（`takken`）数据闭环，所有快照和考试事实使用明确标记的 `synthetic`/`test-only` 夹具。实时官方抓取、生产写入、ITパスポート和其他资格不在范围内。

## 宅建真实页面接入前置策略

- 已完成：允许域名、HTTPS、重定向、超时、重试、ETag/Last-Modified 缓存、响应体积限制和 404 非变更策略。
- 已测试：仅使用 HTTPX MockTransport 离线测试；未访问 `www.retio.or.jp`，未生成真实快照。
- 下一阻塞：需要在本地 Docker PostgreSQL 可用后验证迁移，再由项目所有者明确批准实时抓取窗口和运行环境。

## 受控宅建真实页面抓取记录

- 来源：`https://www.retio.or.jp/exam/`
- 结果：预检与适配器读取各执行 1 次 sequential GET；首次 HTTP 200，均未发生重试或重定向（该运行实际产生 2 次受控读取）。
- 响应：78,143 bytes；SHA-256 `4ec79b62f278d65d036694dd0240c1e08ce0f25784baf84bd4e61efb220f6aa9`。
- 解析：当前宅建适配器未识别声明字段，未生成候选事实。
- 写入：未写入 PostgreSQL、MinIO、正式事实或公开页面；该响应仅作为本次受控读取结果，不是生产种子数据。

## 宅建候选本地入库

- 已通过显式 `STAGE1_LOCAL_WRITE=1`、`NODE_ENV!=production`、localhost 数据库限制后执行。
- 保存 1 个真实日程快照到本地 `var/official-snapshots/takken/`，写入 6 条 `pending_review/high` 候选：网络申请开始/截止、邮寄申请开始/截止、考试日、合格发表日。
- 重跑结果：新增候选 0 条；数据库中正式事实仍为 0 条。
- 真实快照目录已加入 `.gitignore`，不会成为生产种子或提交内容。

## 宅建审核队列

- 当前待审核候选：6 条，全部绑定同一官方来源和同一真实快照，均为 `high` + `pending_review`。
- 重复候选：0 条；已有审核记录：0 条。
- 因为考试日、申请期限和合格发表日属于高风险事实，本轮未自动批准；需要逐项明确 `approve`、`reject` 或 `defer` 及审核理由。

## 自动安全审核决定

- 已对 6 条候选逐项执行 `defer`。
- reviewer：`codex:safety-defer`。
- 理由：日期类高风险事实虽已绑定官方来源和原始快照，但仍需人工复核官方原文后才能批准。
- 结果：6 条仍为 `pending_review`；正式事实仍为 0 条。

## 本地人工审核入口

- 已实现 `apps/admin` 的宅建审核队列：`GET /review/takken`。
- 审核写入：`POST /internal/reviews/{candidate_id}`，要求 `x-reviewer-id` 与 `ADMIN_REVIEWER_ID` 一致，并要求非空理由。
- `approve` 在事务中写入 `reviews`、`fact_revisions` 和 `facts`；`reject/defer` 不写入公开事实。
- 已用本地数据库验证页面 HTTP 200；本轮未执行批准，当前仍为 6 条 `pending_review`、0 条正式事实。

## 阶段 1 归档

- 已完成宅建本地闭环归档和验收记录：见 [stage1-acceptance.md](stage1-acceptance.md)。
- 已确认下一阶段只进入 IT Passport 的来源与字段契约，不批量接入其他资格。
- IT Passport 来源计划见 [it-passport-source-contract.md](it-passport-source-contract.md)；本轮未抓取实时页面、未生成动态事实。

## IT Passport 离线适配器

- 已完成来源绑定的 snapshot、显式字段提取和字段级变化检测。
- 已覆盖 CBT 页面、公告费用变化、结构失效和 404 不创建快照。
- 日期、费用、报名规则候选默认 `high + pending_review`；结构失效不产生候选。
- 使用 `fixtures/official-snapshots/it-passport-*.html` 离线夹具，未写入数据库和公开 API。
- 已完成本地 fixture 候选入库入口 `services/collector/src/collector/ingest_it_passport.py`。
- 审核后台已支持 `/review/it-passport`，批准仍通过统一 revision/fact/change event 事务。
- 候选入库必须显式设置 `STAGE2_LOCAL_WRITE=1`、localhost `DATABASE_URL` 和 `IT_PASSPORT_EXAM_YEAR`。

## IT Passport 本地数据库验收

- Docker PostgreSQL/MinIO 已启动；`0002_it_passport_sources.sql` 成功应用，迁移表包含 0000、0001、0002。
- IT Passport 来源记录：3 条；fixture 首次入库 2 条，第二次入库 0 条，快照 1 条，幂等有效。
- 已通过 `/review/it-passport` 完成 1 条候选批准，写入 1 条 approved fact、1 条 approved revision 和 1 条 change event。
- 当前 IT Passport 本地状态：1 条 `pending_review + synthetic`，1 条 `approved + synthetic`。
- 公开 API `/api/v1/facts` 返回 6 条既有宅建事实，IT Passport 返回 0 条；synthetic 事实过滤有效。
- 本次批准仅用于本地链路验收，不构成生产事实，不得作为生产发布依据。

## IT Passport 公开读取链路

- 新增 `/api/v1/qualifications/{slug}` 资格详情接口。
- 返回资格稳定主数据、`verified/awaiting_official` 状态、公开事实和最新官方确认时间。
- 公开查询继续过滤 `synthetic=true`；本地实际 HTTP 验证返回 IT Passport `awaiting_official`、0 条 facts。
- Vitest：20/20 通过；Python：21/21 通过；类型检查、构建和 ESLint 通过。

## IT Passport 公开展示层

- 新增 IT Passport 公开页 `/shikaku/it-passport/`，从公开 API 读取，不直接访问数据库。
- 已实现 `awaiting_official` 空状态、官方来源展开、快照 ID 和确认时间展示。
- 页面不显示 synthetic 事实；API 不可用时显示安全错误页，不回退到伪造数据。
- 本地 API/Web 联调 HTTP 200；页面显示「公式発表待ち」，未显示 CBT synthetic fixture 内容。
- Vitest：22/22 通过；类型检查、构建和 ESLint 通过。

## IT Passport 公开子页面

- 新增 `/shikaku/it-passport/application/` 报名与受験資格页。
- 新增 `/shikaku/it-passport/exam-content/` 考试内容页。
- 两个页面复用公开 API、来源展开和状态组件，并按事实键隔离展示内容。
- 缺少对应的非 synthetic 已批准事实时，显示对应的 `公式発表待ち` 空状态。
- 本地 HTTP 联调两个页面均返回 200；Vitest：23/23 通过；类型检查和构建通过。

## IT Passport 来源与更新说明

- 公开页面新增官方来源列表、字段级来源说明、状态解释和更新/订正提示。
- 新增实时抓取前人工授权清单：见 [it-passport-live-capture-authorization.md](it-passport-live-capture-authorization.md)。
- 清单完成前不执行实时页面抓取；当前页面仍只展示已批准且非 synthetic 的事实。

## IT Passport 首次受控真实读取

- 授权：项目所有者明确授权，仅保存本地快照，不写数据库。
- 时间：2026-08-12 13:46 JST。
- `source:it-passport:ipa-exam`：HTTP 200，1 次请求，55,447 bytes，SHA-256 `0b482c75862c7be1e4b537154266aca59d7919f3a70404ccfb62052d43b5ead3`。
- `source:it-passport:jitec-home`：HTTP 200，1 次请求，30,037 bytes，SHA-256 `d97229af297656c12a19cad159d399180e974498caf1ad3a805b7aa21e2af964`。
- `source:it-passport:jitec-application`：HTTP 200，1 次请求，37,756 bytes，SHA-256 `30b9a8bcf03614f5e50847d18d122c320dbee019caee8c780a19be484adf0d25`。
- 快照目录：`var/official-snapshots/it-passport/`；抓取报告：`capture-report.json`。
- 本次 `candidate_ingest=not_run`，未写 PostgreSQL、未生成候选事实、未改变公开 API。

## IT Passport 真实快照离线解析

- 新增真实页面专用解析器；不复用 synthetic fixture 的 `data-fact-key` 约定。
- IPA 总入口仅做页面结构确认，不从导航卡片推导 IT Passport 事实。
- JITEC 首页本轮未生成事实；JITEC 报名页生成 2 条离线候选：
  - `application_change_deadline_rule`：`試験日の3日前まで変更可能`。
  - `application_open_2026_may_sessions`：`2026年3月24日21:30以降`。
- 两条候选均为 `high + pending_review + synthetic=false`，并保存匹配到的官方原文证据。
- 分析报告：`var/official-snapshots/it-passport/analysis-report.json`。
- `database_write=not_run`、`automatic_approval=not_run`；公开 API 和页面未变化。

## IT Passport 真实候选审核队列准备

- 新增 `0003_candidate_evidence.sql`，为候选事实保存官方原文证据。
- 审核后台显示 `evidence_text`，便于对照候选值与官方原文。
- 新增 `ingest_it_passport_analysis.py`，只允许显式授权写入 localhost PostgreSQL。
- 本地迁移 `0003_candidate_evidence.sql` 已应用；首次入库新增 1 个真实快照和 2 条候选，重跑新增 0 条。
- 两条真实候选当前均为 `pending_review + high + synthetic=false`，未执行批准。
- 审核后台对候选值、官方原文、来源 URL 和快照哈希进行 HTML 转义后展示。

## IT Passport 阶段 1 数据链路归档

- 数据链路已归档为：官方来源登记 → 受控快照 → 离线结构分析 → 候选事实 → 高风险人工审核 → revision/fact/change event → 公开 API 过滤 → 用户页面展示。
- synthetic fixture 仅用于本地链路验收；真实快照候选即使 `synthetic=false`，在人工批准前也不得进入公开 API。
- 已实现真实分析报告到本地审核队列的显式授权入口：`IT_PASSPORT_REAL_CANDIDATE_WRITE=1`，仅允许 localhost PostgreSQL，生产环境拒绝执行。
- 已实现统一公开读取接口和页面状态：没有非 synthetic 已批准事实时显示 `awaiting_official`，不使用 fixture 或推测值补全。
- 本阶段仍未完成生产发布、生产对象存储、正式认证、定时调度和外部通知；这些内容保留到上线准备阶段。

## 两个资格统一用户页面

- 已完成统一的 overview、application、exam-content 页面模板，当前可用于 `takken` 和 `it-passport`。
- 已完成 `/shikaku/` 资格目录，仅列出阶段 1 已进入用户页面范围的两个资格；其他四个资格暂不生成空页面。
- 页面统一展示资格状态、官方确认时间、事实来源、快照标识和更新/订正说明；动态事实仍只从公开 API 读取。

## 阶段 1 用户端验收与收口

- 已联调 `/shikaku/`、宅建 3 个页面和 IT Passport 3 个页面，全部 HTTP 200。
- 修复宅建兼容 API 路由返回非标准事实结构的问题，统一为资格详情响应结构。
- 页面连续请求后 Web/API 进程保持运行；公开 API 无事实时正确显示 `awaiting_official`，不显示 synthetic 内容。
- Python 非实时抓取与解析测试 25/25 通过；Vitest 因当前沙箱 `spawn EPERM` 未完成，需在非受限环境重跑。
- 阶段 1 用户端和数据链路已完成本地收口；不包含生产发布、生产认证、定时采集和跨资格工具。
