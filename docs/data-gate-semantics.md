# 数据门禁与授权口径

本文收口 2026-10-09 整改轮次确定的门禁语义、判级规则、溯源口径与三级授权边界。改动数据链路前必读；具体资格的事实清单与适配器规则见各 `docs/*-source-contract.md`。

## 1. 门禁有两层，不能混为一谈

`node scripts/verify-all.mjs`（= `pnpm verify:all` = CI `release-gate`）对每个资格同时检查：

1. **条数地板**：`config/release-gate-baseline.json` 的 `expectedFacts`，实际取的是「当前正式事实」计数：`facts` → `current_revision_id` → `fact_revisions` → `candidate_facts` → `snapshots` → `sources`，要求 facts/revision/candidate 三处状态都是 `approved` 且 `candidate_facts.synthetic=false`（见 `scripts/verify-lib.mjs` 的 `approvedFacts` 查询）。
2. **覆盖缺口**：按 `config/data-coverage-contract.json` 判定该年度该维度的必需字段是否都有已批准事实。

**计数口径必须从 `facts` 出发。** 按 `candidate_facts` 计数会偏大（一条事实可有多个历史批准候选），门禁永远比对不过。

## 2. 判级档位与改动方式

`requiredLevel` 现有五档：`required`、`conditional`、`not_applicable`、`post_event`、`optional`。其中 `post_event`、`optional`、`not_applicable` 在 `evaluateCoverage()` 开头直接跳过，**只有 `required` 和 `conditional` 会产生缺口**。

- 判级改动属于产品决策，动手前必须取得项目所有者确认。
- 改法是「拆字段克隆 requirement」：把需要不同档位的字段拆成独立 requirement 行，各自带维度。不要整条 requirement 翻转 `level`，那会把无关字段一起改档。
- 新采集到的事实若官方只说「会場／商工会議所ごとに異なる」这类规则性表述，就登记规则型事实（`*_rule` 子键），**不得编造全国统一日期或数值**。

## 3. `conditional` 的空 scoped 跳过机制（最容易误读）

`evaluateCoverage()` 先按 `examYear` + requirement 维度筛出 `scoped` 事实；若 `requiredLevel === 'conditional'` 且 `scoped.length === 0`，**整条 requirement 被跳过**。

后果：维度没打上 ⇒ 不检查 ⇒ 0 缺口。这不是「字段齐备」。实测判据（2026-10-09 本机跑 `evaluateCoverage()`）：

- 基本情報技術者现有 10 条事实 `delivery_mode = NULL` ⇒ 三条 `conditional` requirement 全部跳过 ⇒ `gaps = 0`。
- 同批事实若补上 `delivery_mode = 'cbt'`（不新增事实）⇒ `gaps = 10`：`application_rule`、`booking_window`、`venue_rule`、`eligibility`、`fee`、`scoring_method`、`passing_standard`、`exam_time`、`question_count`、`question_format`。

任何维度补打、fact_key 改名或 requirement 维度调整，都要先用这条判据复算，再决定动数据。

## 4. 字段与 fact_key 的匹配规则

`satisfiesCoverageField()`：

- `factKey === field`，或 `factKey.startsWith(field + '_')`（前缀式）；
- 特例：`field === 'exam_date'` 时 `factKey === 'exam_dates'` 也算满足；
- `source_url` 不看 fact_key，要求该事实的溯源状态为 `verified`；
- `official_verified_at` 只看该事实有审核时间投影。

因此用 `application_open_rule`、`*_deadline_rule`、`*_online`、`*_postal`、`exam_dates` 这类子键即可闭合缺口，**不必改契约**。反过来，`exam_subject_a_time` 这种「后缀式」命名不满足 `exam_time_` 前缀规则，不能指望它闭合 `exam_time`。

## 5. 溯源三态

一条已批准事实的溯源状态由下面全部条件决定（缺任一即 `incomplete`）：`sources.canonical_url` 是合法 https 且主机等于 `allowed_domain`、快照 `object_key` 不以 `ci://` 开头、快照 `synthetic=false`、`snapshots.source_id === candidate_facts.source_id`、有 `content_hash`、最新一条 `reviews.decision='approve'` 且有时间。

- `object_key` 以 `ci://` 开头 ⇒ 状态 `fixture`，**永不视为官方验证**。
- CI 复刻库（迁移 → seed → `restore-ci-db-fixture.mjs`）里所有事实都是 `fixture`，此时 `coverageGaps` 会过滤掉 `source_url` 与 `official_verified_at` 两项，但 API 状态期望值仍按严格评估，得到 `partially_announced`。这与 `expectedStatus` 相同，**属预期行为，不是 bug**，不要为了让 CI 复刻库变 `verified` 而放宽判定。

## 6. 审核链语义

- **批准**：按 `(qualification, provider, level, component, delivery_mode, payment_method, exam_year, fact_key)` 用 `IS NOT DISTINCT FROM` 匹配既有 `facts` 行（**不过滤状态**）。命中则把该行 `status` 置回 `approved` 并指向新 revision —— 这就是「批准会重新激活同维度 `superseded` 事实」；未命中则插入新行。两种情况都写 `fact_revisions` 与 `change_events`。
- **拒绝／延期**：只改候选状态与 `reviews`，不撤销已存在的正式事实。
- **撤销**：`POST /internal/retractions/{id}`，前置条件是对应候选已 `rejected`、且同维度恰好命中 1 条 `object_key LIKE 'ci://%'` 的当前事实；否则整个事务回滚。命中的事实置 `superseded` 并写 `fact_retractions`。真实官方快照驱动的事实不走这条撤销路径。

## 7. 审核写操作鉴权

`apps/admin/src/server.ts` 把鉴权拆成两个函数：

- `authorizedWrite()`：**只认 `x-reviewer-id` 请求头**，用于 `POST /internal/reviews/*` 与 `POST /internal/retractions/*`。
- `authorizedRead()`：头或 `?reviewer=` 查询参数任一即可，只用于 GET 审核队列页（人可以直接点开 URL 干活）。

Why：审核人 ID 放进 URL 就可被任意 `<img src=…>`、浏览器历史或代理访问日志重放 ⇒ 相当于可复用的授权凭据泄露面。不要因为「一致性」把读也收紧。

验收判据（该文件是顶层脚本、没有导出的鉴权函数，故用 curl 而非单测；2026-10-09 在新起实例上实跑）：

| 用例                                                          | 期望                                   |
| ------------------------------------------------------------- | -------------------------------------- |
| GET `/review/<slug>?reviewer=<id>`                            | 200                                    |
| GET `/review/<slug>`（无鉴权）                                | 401                                    |
| POST `/internal/reviews/<id>?reviewer=<id>`（只带参数、无头） | **401**                                |
| POST `/internal/reviews/<id>` + 正确头 + 空 body              | 400，body `{"error":"request failed"}` |
| POST + 错误身份头                                             | 401                                    |
| POST 无任何鉴权                                               | 401                                    |

## 8. 采集、入库、批准是三次独立授权

| 阶段     | 授权开关（各资格前缀不同）                                   | 允许写入                                                                                                                                                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 受控采集 | `<QUAL>_LIVE_AUTHORIZED=1`                                   | 只写本地 `var/official-snapshots/<qual>/` 与 `capture-report.json`（**六条采集链共用** `collector.capture_report.write_capture_report()`，按 `source_id` 合并不再整份覆盖：FP／行政書士／簿记／IT Passport／基本情報／宅建，宅建的 `directly-cited-capture-report.json` 与 `directly-cited-document-capture-report.json` 同样合并），**不连数据库** |
| 候选入库 | `<QUAL>_LOCAL_WRITE=1`（或阶段 2 的 `STAGE2_LOCAL_WRITE=1`） | 只允许 localhost/127.0.0.1 数据库、`NODE_ENV` 不得为 `production`，写入状态固定 `pending_review`                                                                                                                                                                                                                                                    |
| 审核批准 | `ADMIN_REVIEWER_ID` + 请求头 `x-reviewer-id`                 | `reviews`、`fact_revisions`、`facts`、`change_events`                                                                                                                                                                                                                                                                                               |

抓取授权本身**不包含**入库与批准权限；一次授权只管一件事。真实官方页面抓取必须经 `SafeFetcher`（域名、超时、重试、大小、重定向策略），不得绕过。

## 9. baseline 与 CI 夹具维护

- 更新基线：`RELEASE_BASELINE_CONFIRM=UPDATE_RELEASE_GATE_BASELINE` + `pnpm baseline:update -- --confirm=UPDATE_RELEASE_GATE_BASELINE`，双重确认，仅 localhost，仍有真实待审核候选时拒绝更新。
- 重导夹具：`CI_FIXTURE_EXPORT_CONFIRM=EXPORT_SANITIZED_CI_FIXTURE` + `pnpm ci:fixture:export -- --confirm=...`，然后 `pnpm ci:fixture:verify` 与 `pnpm release:check`。
- 夹具现状：`fixtures/ci/approved-facts.sql` = 176 facts / 176 candidate_facts / 176 fact_revisions / 25 snapshots。**重导后必须同步改 `scripts/verify-ci-fixture.mjs` 第 9–12 行这四个硬编码断言**，否则会出现 `ERR_ASSERTION actual:176 expected:167` 这类失败。
- 夹具禁止出现的本地痕迹（同文件断言）：`local-reviewer`、`AppData`、`var/official-snapshots`、`E:\`、`C:\`、`INSERT INTO reviews`。
- 事实数量基线禁止手工随意修改；改动必须能对应到「已审核完成的事实增减」。

## 10. 回归命令与最近读数（2026-10-10 本机实跑）

改 TypeScript 必须先 build 再 verify —— `scripts/verify-all.mjs` 跑的是 `dist/` 编译产物。

| 命令                                                                                | 读数                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build`（本机直调 `node_modules\.bin\tsc.cmd -p tsconfig.json`）               | 通过                                                                                                                                                                                                                                |
| `pnpm test`（`vitest run tests --pool=threads --poolOptions.threads.singleThread`） | 81/81，10 个文件                                                                                                                                                                                                                    |
| `pnpm test:python`（`pytest services/collector/tests services/parser/tests`）       | 115 passed（2026-10-09 为 89；行政書士 `capture_record` +3；FP 对齐 +8；报告合并抽为共享模块并推广到四条链 +5，其中 FP 的 2 条用例移入 `test_capture_report.py`；推广到基本情報与宅建 +4；`ParsedCandidate` 补齐为共享候选契约 +6） |
| `node --test scripts/verify-lib.test.mjs`                                           | 7/7                                                                                                                                                                                                                                 |
| `pnpm verify:all`                                                                   | `status=passed`、`qualifications=6`、`passed=6`、`failed=0`，各资格 `coverageGaps=[]`、`pending_official=0`                                                                                                                         |
| `pnpm lint`（`eslint .`）                                                           | 干净                                                                                                                                                                                                                                |

正式事实总数 **176**：takken 16、gyoseishoshi 15、it-passport 2、fundamental-it-engineer 10、bookkeeping 58、fp 75。覆盖缺口 **18 → 0**。

推荐在改动 baseline 或夹具后跑一次 CI 复刻：新建一次性临时库 → migrate → seed → `node scripts/restore-ci-db-fixture.mjs` → `verify-all.mjs` → `node scripts/verify-ci-fixture.mjs`；删临时库需项目所有者明示授权，且先确认 `pg_stat_activity` 连接数为 0。

## 11. 尚未闭合的口径问题

1. FE 的科目级事实与契约维度/命名对不上（见 `docs/fundamental-it-engineer-source-contract.md` 门禁告警节），补维度前需先定命名与判级方案。
2. `sources.qualification_id` 原有 32/40 条 `NULL`，已于 2026-10-10 定口径：回填放在 `packages/db/src/seed.ts`（不放迁移），因为 `qualifications` 的行只由 seed 写入，迁移里的 `UPDATE ... FROM qualifications` 在空库上会匹配 0 行。只填这一列，`content_scope` 等四列继续留 `NULL`（19 条「注册而未用」的来源没有快照证据，不凭空补全）。该列**没有任何读取方**（来源→资格关系仍由 `candidate_facts` 表达），所以回填不改门禁、API 与 admin 行为；`source_scopes` 是 0012 设计的权威 N:N 表，目前 0 行，等出现一条来源服务两个资格时再启用。详见 `docs/stage-log.md` 当日「`sources.qualification_id` 32 条 NULL 的回填落点」一节。
3. 行政書士入库链已于 2026-10-10 对齐 FE 口径（校验 `capture-report.json`、写 `capture_runs` 与 `snapshots` 全溯源列、写 `source_checks`），并在本机开发库对真实快照重跑一次入库验证通过：真实抓取行就地补全溯源、候选新增 0 条、门禁仍 `6/6`。仍在的只是夹具行（`ci://` object key）按设计不带元数据，见 §5。
4. `services/api/src/release.ts` 的 `rollbackApprovedFact` 维度 join 已于 2026-10-10 补上 `payment_method`，与 0014 迁移建立的 `facts_current_key_idx` 及候选幂等索引同口径。修前本机读数：按「去掉 `payment_method` 的七维」分组全库恰好 1 组装着 2 条事实（`qualification:takken`／`exam_year=2026`／`fact_key=payment_deadline_rule`，渠道 `convenience_store` 与 `pay_easy`），旧 SQL 在这两条上互相挑到对方渠道的 revision（跨渠道串号），加上 `AND f.payment_method IS NOT DISTINCT FROM c.payment_method` 后两条查询均返回 0 行，即正确抛 `no previous approved revision available`。该函数全仓只有定义、无调用方，属正确性收口，不改门禁、不改线上行为；`tests/setup.ts` 会删除 `DATABASE_URL`，Vitest 连不到库，因此这条 SQL 只有只读探针自证、没有 DB 覆盖。
5. 历史统计字段（`pass_rate` 等）六资格全为零官方来源，归工作包 F。
6. FP 入库链已于 2026-10-10 同口径对齐（`capture_record()` 四重校验、写 `capture_runs` 与 `snapshots` 全溯源列、写 `source_checks`）。但**本轮只到代码与用例层**：磁盘上那 4 个 2026-09-08／09-11 入库快照在 `capture-report.json` 里没有记录（旧报告已被覆盖且 `var/` 不入库），新链对它们直接拒绝入库，因此没有本机端到端实跑读数；要跑通需先授权一次抓取，而抓取若导致哈希变化会新增 `pending_review` 并让门禁硬失败。详见 `docs/fp-source-contract.md` 已知剩余项 1。
7. 采集报告的「按 `source_id` 合并」已于 2026-10-10 收口：共享模块 `collector/capture_report.py` 现由**六条采集链全部共用**，含此前整份覆盖的基本情報 `capture_fundamental_it.py` 与宅建 `capture_takken.py`（后者的 `directly-cited-capture-report.json`、`directly-cited-document-capture-report.json` 两份报告各自独立合并）。宅建的 `capture_directly_cited_sources()` 支持只跑部分 `source_id`，此前一次局部运行会把其余来源的报告记录抹掉、让磁盘上仍然存在的快照在入库链看来「无报告」，这一条已被用例锁住。快照本身是内容寻址文件名，从未被覆盖，丢的一直只有报告。
