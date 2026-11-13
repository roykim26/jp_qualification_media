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

2026-11-11 所有者拍板 FE 口径后，上述数字已过期：`application_rule`／`booking_window`／`venue_rule` 从 conditional 拆出并标 `not_applicable`（CBT 无年度统一窗口），`exam_subject_{a|b}_*` 保留原名并由 `satisfiesCoverageField()` 按 `examComponent=subject-a|subject-b` 映射到 `exam_time`／`question_count`／`question_format`。同批复算：补上 `delivery_mode='cbt'` 与科目维度、且 eligibility／passing_standard／scoring_method 仍为零事实时，`gaps = 3`（就是这三项）；三项关闭后 `gaps = 0`。维度回填由迁移 `0024_fe_cbt_dimensions_backfill.sql` 完成，只动 FE 2026 非合成已批准事实。

## 4. 字段与 fact_key 的匹配规则

`satisfiesCoverageField()`：

- `factKey === field`，或 `factKey.startsWith(field + '_')`（前缀式）；
- 特例：`field === 'exam_date'` 时 `factKey === 'exam_dates'` 也算满足；
- `source_url` 不看 fact_key，要求该事实的溯源状态为 `verified`；
- `official_verified_at` 只看该事实有审核时间投影。

因此用 `application_open_rule`、`*_deadline_rule`、`*_online`、`*_postal`、`exam_dates` 这类子键即可闭合缺口，**不必改契约**。反过来，`exam_subject_a_time` 这种「后缀式」命名不满足 `exam_time_` 前缀规则；FE 由 2026-11-11 新增的科目维度映射单独处理（见 §3 末段），其他资格仍按前缀规则。

## 5. 溯源三态

一条已批准事实的溯源状态由下面全部条件决定（缺任一即 `incomplete`）：`sources.canonical_url` 是合法 https 且主机等于 `allowed_domain`、快照 `object_key` 不以 `ci://` 开头、快照 `synthetic=false`、`snapshots.source_id === candidate_facts.source_id`、有 `content_hash`、最新一条 `reviews.decision='approve'` 且有时间。

- `object_key` 以 `ci://` 开头 ⇒ 状态 `fixture`，**永不视为官方验证**。
- CI 复刻库（迁移 → seed → `restore-ci-db-fixture.mjs`）里所有事实都是 `fixture`，此时 `coverageGaps` 会过滤掉 `source_url` 与 `official_verified_at` 两项，但 API 状态期望值仍按严格评估，得到 `partially_announced`。这与 `expectedStatus` 相同，**属预期行为，不是 bug**，不要为了让 CI 复刻库变 `verified` 而放宽判定。

## 6. 审核链语义

- **批准**：按 `(qualification, provider, level, component, delivery_mode, payment_method, exam_session, exam_year, fact_key)` 用 `IS NOT DISTINCT FROM` 匹配既有 `facts` 行（**不过滤状态**）。命中则把该行 `status` 置回 `approved` 并指向新 revision —— 这就是「批准会重新激活同维度 `superseded` 事实」；未命中则插入新行。两种情况都写 `fact_revisions` 与 `change_events`。
- **批准链的三条机制（2026-10-12 读 `apps/admin/src/server.ts:131` 坐实，10-13 第七轮全量批准实测）**，此前任何文档都没记，估批准风险时必须按这三条：
  1. **整条链幂等**：`reviews.id=review:{candidate}:{decision}`、`fact_revisions.id=revision:{candidate}` 与 `idempotency_key=approve:{candidate}`、`change_events.id=change:{candidate}` 全部 `ON CONFLICT DO NOTHING`，且单事务内先 `SELECT … FOR UPDATE` 锁候选 ⇒ 用 curl 或脚本重跑同一决定**无副作用**，「先 defer 后 approve」也不冲突（两条 `reviews` 行的 id 不同）。
  2. **`approve` 没有撤销接口**：`requeue` 只接受 `status='rejected'` 的候选；`POST /internal/retractions/{id}` 的前置条件之一是当前事实的快照 `object_key LIKE 'ci://%'`，真实官方快照驱动的事实不满足 ⇒ 整事务回滚。批错了只能改库或改代码，**不能靠再发一次请求撤销**。
  3. **同维度静默覆盖，后批者赢**：命中既有 `facts` 行时走 `UPDATE facts SET current_revision_id=$新修订`（`server.ts:205-211`），**一个槽只留一条 current 值**；被顶掉那条的 `fact_revisions`／`reviews` 记录仍完整可追溯，但不再是 current。想翻转就在另一条候选上再发一次 `approve`（幂等、不改码），**但仍然二选一**；要两条共存必须改身份维度或拆 `fact_key`，属 collector 代码＋判级面改动。⚠ 附带的名实不符：命中已有行时 `facts.id` **不随之更换**，仍等于最初插入该行的那条候选 id，因此不能拿 `facts.id` 反推「当前值来自哪条候选」——要看 `facts.current_revision_id`。
- **批准量与 `facts` 增量不一定相等，报数前必须核槽位碰撞**：第六轮 7 条口径候选只产 5 条 `facts`（两条被同槽覆盖）；第七轮 772 条批完 `facts` 恰增 772，是先按九维键实测过「`pending` 与已批准事实同槽 0 命中、`pending` 内部同槽 0 组」才成立的。⇒ 分批批准时把「该档 `facts` 增量＝该档候选条数」当验收判据，不相等就是有覆盖，要立刻停下核对，别继续批。
- **簿记ネット槽位的已拍板口径（2026-10-13）**：`bookkeeping:2|3`／`delivery_mode=network`／`exam_year=2026`／`fact_key=statistics_methodology` 两个槽**以页首引言为 current**（`…:statistics_methodology:98f76b0bbf3f`），列头那条（`…:1630ebd87ec8`，值 `期間/受験者数/合格者数/合格率`）保留为已批准但非 current；理由是该 `fact_key` 语义是「统计口径说明」，列头无口径信息量。不翻转、不改维度。
- **`exam_session`（0017 迁移，2026-10-12）**：簿记統一試験同一西历年有多个回合（173 回 2026.06.14 与 172 回 2026.02.22 都属 2026），所以回合号进入候选与正式事实的身份。列可空，该轮既有 176 条事实一律为 `NULL`，其 candidate-id 仍由不含回合段的旧式公式逐字节复现（见 `docs/stage-log.md` 当日预检读数）。⚠ 「176 条」是当时点读数：2026-10-13 批完統一表后簿记非合成事实为 **863** 条、全库 **981** 条，其中統一表那 772 条**带** `exam_session`，ネット／初級行与其余来源仍为 `NULL`。`config/data-coverage-contract.json` 的 `dimensions` **没有**加 `examSession`：它只是身份维度，不参与契约判级匹配。
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

### 8.1 三态词表（文档与汇报的措辞基准）

「入库」在本仓库**只指第二态**，绝不用于第三态；第三态一律写「批准」。

| 术语                       | 数据库落点                                                                                   | 公开面                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| 采集／已抓                 | 只写磁盘快照与 `capture-report.json`，**不连库**                                             | 无                                                                     |
| 候选入库／已入队（第二态） | `candidate_facts` 行 `status='pending_review'`＋`snapshots`／`capture_runs`／`source_checks` | **无**：公开 API、页面与 `release-gate-baseline` 的 facts 计数都读不到 |
| 批准／已生效（第三态）     | `facts`＋`fact_revisions`＋`reviews`＋`change_events`                                        | 有：公开 API 可读，计入 facts 计数                                     |

表述硬规则：

- 写「已入库 N 条」必须同句带上状态名 `pending_review` 与「未公开」，否则读者会把候选当成事实。
- 写「批准 N 条」必须写 `facts` 计数的变化（如「167 → 176」），不能只写条数。
- 第二态本身也是**写库动作**，不是读操作：非合成 `pending_review` 会让门禁 `pending_official != 0` 硬失败（见 §1、`scripts/verify-lib.mjs` 的 `requireNoOfficialPending`）。
- 历史措辞的更正基准：`docs/data-local-snapshot-audit-2026-09-07.md` 2026-09-11 两节里的「44 条」是**第二态**（候选入队），随后的 39 条 `approve`／5 条 `reject` 才是**第三态**。把这两步合称「批准 44 条入库」或「已入库 44 条（即批准）」都不成立——它们分属两次授权。
- 要判断某批候选此刻处于哪一态，用只读预检 `collector.precheck_bookkeeping`（见 `docs/bookkeeping-source-contract.md` 的「写库前预检」节），不要凭文档措辞推断。

## 9. baseline 与 CI 夹具维护

- ⚠ **baseline 是「下限」不是「相等」**：`scripts/verify-lib.mjs:215` 判 `approved_official < expectedFacts` 为失败，API 侧同理比 `facts.length`。因此**抬高 baseline 必须与 CI 夹具同批改、同一个 PR 进 main**——只跑 `baseline:update` 不重导夹具，本机 `verify:all` 照样绿（本机有真数据），CI 必红在 `approved official 58 below regression floor 863`（夹具只有 58 条簿记）。2026-10-13 即按这条把 58 → 863 与夹具 176 → 981 一起提。
- 更新基线：`RELEASE_BASELINE_CONFIRM=UPDATE_RELEASE_GATE_BASELINE` + `pnpm baseline:update -- --confirm=UPDATE_RELEASE_GATE_BASELINE`，双重确认，仅 localhost，仍有真实待审核候选时拒绝更新。
- 重导夹具：`CI_FIXTURE_EXPORT_CONFIRM=EXPORT_SANITIZED_CI_FIXTURE` + `pnpm ci:fixture:export -- --confirm=...`（同样在非合成 `pending_review` 未清零时**直接拒绝**：`official candidates pending review: …`），然后 `pnpm ci:fixture:verify` 与 `pnpm release:check`。
- 夹具现状（2026-11-13 baseline／CI 夹具刷新轮合并后现取；前值 999／37）：`fixtures/ci/approved-facts.sql` = **1007 facts / 1007 candidate_facts / 1007 fact_revisions / 37 snapshots**，逐资格 16／15／**10**／**28**／863／75，文件 2,218,265 字节（3,214 行；2026-11-12 重导、2026-11-13 随 squash PR #79＝`1158457` 合并，D2 八条纯新增、按 `fact_id` 比对零值差）。**重导后必须同步改 `scripts/verify-ci-fixture.mjs` 第 9–12 行的四个硬编码断言，以及 `scripts/docker-smoke.mjs` 的四处（第 346／356 行的事实数＋第 359／360 行的快照数）**，否则得到 `ERR_ASSERTION actual:981 expected:176` 或 `expected 981 approved facts, got 982` 这类失败（后者在 2026-11-10 PR #58 首轮 CI 实际发生过）。⚠ 快照数断言（29→37）历次交接单都漏记，2026-11-12 那轮全仓扫描才补上；2026-11-13 本轮快照数不变（37），只改事实数两处（346／356）。
- 夹具在 CI 空库落地的判据：CI 走 `db:migrate` + `db:seed` 再 `ci:fixture:restore`，所以夹具引用的每条 `source_id` 都必须由迁移登记。本机复刻库需要新建数据库（`CREATE DATABASE`），该动作属基础设施变更、不在批准轮授权面内 ⇒ 用静态比对替代：2026-11-13 合并的夹具（#79）引用的 **31 条 `source_id` 全部命中迁移登记的 52 条**，缺失 0（2026-11-12 刷新轮决策材料现取）。
- 夹具禁止出现的本地痕迹（同文件断言）：`local-reviewer`、`AppData`、`var/official-snapshots`、`E:\`、`C:\`、`INSERT INTO reviews`。
- 事实数量基线禁止手工随意修改；改动必须能对应到「已审核完成的事实增减」。

## 10. 回归命令与最近读数（2026-11-13 本机实跑，baseline 1007 刷新轮落账现取）

改 TypeScript 必须先 build 再 verify —— `scripts/verify-all.mjs` 跑的是 `dist/` 编译产物。本会话 Git Bash **没有 `pnpm`**，`pnpm <script>` 一律等价换成 `npm run <script>`。库侧命令必须**显式**带 `DATABASE_URL='postgresql://postgres@127.0.0.1:55432/qualification_media'`（本机是 Docker `jpqm-pg18`；`.env` 默认值指向并不存在的 compose 库 `localhost:5432`）。容器**现运行中**（2026-11-13 现取 `Up`；若已停，`docker start jpqm-pg18` 属基础设施变更、先单独请示）。⚠ 本机 `npm run db:migrate` 走 tsx，`import.meta.url` 解析到**源** `packages/db/migrations/`，**无需 cp**；「先 `cp -r packages/db/migrations dist/packages/db/migrations`」只在跑编译/Docker 产物（`migrate.js` 按自身相对路径读 `../migrations/`）时需要（Dockerfile 有同款 cp 步骤）。应用后复跑须 0 Applied（幂等）。

| 命令                                                                             | 读数                                                                                                                                                                                                                                                                                                                                      |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`（`tsc -p tsconfig.json`）                                        | EXIT=0                                                                                                                                                                                                                                                                                                                                    |
| `npx vitest run --dir tests --pool=threads --poolOptions.threads.singleThread`   | **15 文件／139 用例**全过（规范读数；124→139 为 P0-1／P0-4／P1-1 轮新增用例）。⚠ 仓库根跑 `npm test` 同参数但会把 `var/wt-*` 遗留 worktree 的测试一起扫进来；裸 `npx vitest run` 会扫 `scripts/*.test.mjs` 报「No test suite found」假 FAIL；跑前确认 4100 端口空闲，否则 `tests/public-api.test.ts` 抛 `EADDRINUSE`。                    |
| `npm run test:python`（`pytest services/collector/tests services/parser/tests`） | **237 passed**（2026-11-13 现取；collector 230＋parser 7 为 2026-11-12 分解读数、其后零 Python 改动；214→237 为 P1-1 B／工作包 J 轮新增，含 FE 推移表 xlsx 提取器 13 条用例；本机 venv 需装 `pypdf>=5.0`（现 7.0.1）与 `openpyxl>=3.1`（现 3.1.5），否则收集错误；基线数每轮都会变，报数前必现取；两目录必须同传，单传 collector 会少 7） |
| `npm run test:verify-gate`（`node --test scripts/verify-lib.test.mjs`）          | **40/40**                                                                                                                                                                                                                                                                                                                                 |
| `npm run verify:all`                                                             | `status=passed`、`qualifications=6`、`passed=6`、`failed=0`，逐格 `approved_official` 16／15／10／28／863／75，各资格 `coverageGaps=[]`、`pending_official=0`；簿记 `api.facts=863`                                                                                                                                                       |
| `npm run ci:fixture:verify`                                                      | `Sanitized CI fixture structure verified.`（EXIT=0，四个计数 1007／1007／1007／37）                                                                                                                                                                                                                                                       |
| `npm run data:staleness`（`node scripts/check-staleness.mjs`）                   | `status=ok`、`approvedFacts=1007`（只读；`historicalSkipped=789`、`checked=218`、`dueFacts=29`、`sourcesBehindOnSnapshot=2`，2026-11-13 刷新轮落账现取）                                                                                                                                                                                  |
| `npm run format:check`                                                           | 通过（EXIT=0）。⚠ worktree 在 `var/` 下时从仓库根跑会被 `.prettierignore` 的 `var/` 整段跳过而**假绿**，必须 `cd` 进 worktree 用相对 glob 复检（#49 那轮因此让 CI 红在 `format:check`）。                                                                                                                                                 |
| `npm run lint`（`eslint .`）                                                     | 加 `-- --ignore-pattern "Python/**"` 后 EXIT=0；不加时本机只红在根目录未跟踪的 `Python/pythoncore-3.15-*.deleteme/Lib/profiling/sampling/_flamegraph_assets/flamegraph.js`（parse error），不是代码问题。`Python/` 按铁律不提交不删；CI 的 checkout 无此目录故照常绿。                                                                    |

正式事实总数 **1007**：takken 16、gyoseishoshi 15、it-passport 10、fundamental-it-engineer **28**、bookkeeping **863**、fp 75（2026-11-13 刷新轮落账现取值）。baseline／CI 夹具已同批刷为 **1007 facts／37 snapshots**（逐格 16／15／10／28／863／75，2026-11-12 重导、2026-11-13 随 squash PR #79＝`1158457` 合并；D2 八条纯新增、按 `fact_id` 比对零值差）⇒ **本机库／baseline／CI 夹具三方一致**，不再领先。baseline 是下限不是相等。覆盖缺口 **0**。

2026-11-13 本机库侧现取（Docker `jpqm-pg18`，baseline 1007 刷新轮落账；迁移 0000–0029 共 30、本轮零新迁移）：15 张表、`sources` 52（`qualification_id` 未绑定 0）、`snapshots` 80、`facts` 1007（16／15／10／28／863／75）、`candidate_facts` 1046 全 `approved`（`pending_review` 0）、`reviews` 1046 全 `approve`、`change_events` 1046、`fact_revisions` 1046、`schema_migrations` 30、运营表 `capture_runs` 17／`source_checks` 68（刷新轮零抓取零入库，快照与运营表计数不变）。CI 夹具为 #79 重导的 **1007／1007／1007／37**，与本机 `facts` 一致；本机 `snapshots` **80** 仍多于夹具 **37**——夹具只含被批准事实引用的快照，巡检与证据页快照不进夹具。`smoke:docker` 本机未跑（Docker Hub 认证走 IPv6 超时），docker 冒烟证据取自 CI：**1007／37** 的冒烟证据＝PR #79 CI run `43339301778`（head `b00ce53`）与合并后 main push run `43342694532`（head `1158457`）的 docker-smoke job 均 SUCCESS（断言 1007 facts＋37 snapshots）；999／37 的历史证据＝#73 的 run `43179797846`／`43180906300`，982 的更早证据＝run `43160584486`／`43170979492`。

推荐在改动 baseline 或夹具后跑一次 CI 复刻：新建一次性临时库 → migrate → seed → `node scripts/restore-ci-db-fixture.mjs` → `verify-all.mjs` → `node scripts/verify-ci-fixture.mjs`；删临时库需项目所有者明示授权，且先确认 `pg_stat_activity` 连接数为 0。⚠ 本会话实测 `docker compose exec -T postgres psql -c "CREATE DATABASE …"` 会被自动模式按「基础设施变更」拦下，故 2026-10-13 改用静态判据替代：核对夹具引用的 `source_id` 全集是否都由迁移登记（2026-11-12 刷新轮复核 31 条全部命中，缺失 0），CI 的 `db:migrate` 后外键必成立。

## 11. 尚未闭合的口径问题

1. FE 的科目级事实与契约维度/命名对不上（见 `docs/fundamental-it-engineer-source-contract.md` 门禁告警节），补维度前需先定命名与判级方案。
2. `sources.qualification_id` 原有 32/40 条 `NULL`，已于 2026-10-10 定口径：回填放在 `packages/db/src/seed.ts`（不放迁移），因为 `qualifications` 的行只由 seed 写入，迁移里的 `UPDATE ... FROM qualifications` 在空库上会匹配 0 行。只填这一列，`content_scope` 等四列继续留 `NULL`（19 条「注册而未用」的来源没有快照证据，不凭空补全）。该列**没有任何读取方**（来源→资格关系仍由 `candidate_facts` 表达），所以回填不改门禁、API 与 admin 行为；`source_scopes` 是 0012 设计的权威 N:N 表，目前 0 行，等出现一条来源服务两个资格时再启用。详见 `docs/stage-log.md` 当日「`sources.qualification_id` 32 条 NULL 的回填落点」一节。
3. 行政書士入库链已于 2026-10-10 对齐 FE 口径（校验 `capture-report.json`、写 `capture_runs` 与 `snapshots` 全溯源列、写 `source_checks`），并在本机开发库对真实快照重跑一次入库验证通过：真实抓取行就地补全溯源、候选新增 0 条、门禁仍 `6/6`。仍在的只是夹具行（`ci://` object key）按设计不带元数据，见 §5。
4. `services/api/src/release.ts` 的 `rollbackApprovedFact` 维度 join 已于 2026-10-10 补上 `payment_method`，与 0014 迁移建立的 `facts_current_key_idx` 及候选幂等索引同口径。修前本机读数：按「去掉 `payment_method` 的七维」分组全库恰好 1 组装着 2 条事实（`qualification:takken`／`exam_year=2026`／`fact_key=payment_deadline_rule`，渠道 `convenience_store` 与 `pay_easy`），旧 SQL 在这两条上互相挑到对方渠道的 revision（跨渠道串号），加上 `AND f.payment_method IS NOT DISTINCT FROM c.payment_method` 后两条查询均返回 0 行，即正确抛 `no previous approved revision available`。该函数全仓只有定义、无调用方，属正确性收口，不改门禁、不改线上行为；`tests/setup.ts` 会删除 `DATABASE_URL`，Vitest 连不到库，因此这条 SQL 只有只读探针自证、没有 DB 覆盖。2026-11-10 再收口同一函数的另一处硬编码：回滚事件原本一律写 `schedule_change`，现改为按事实的 `fact_key` 走 `updateEventTypeForFact()`（与批准链同口径，INSERT 参数补 `::event_type` 强转），否则料金／締切／統計类回滚会在 `/updates/` 挂错标签。`tests/rollback-event.test.ts` 用 4 条纯函数断言锁住映射（`fee`→`fee_change`、`application_deadline_online`→`application_deadline`、`application_open_postal`→`application_open`、`passed`→`statistics_update`、`eligibility`→`eligibility_change`、`exam_method`→`system_change`、`exam_schedule`→`schedule_change`）、id／前后 revision 方向与 `affected_pages`；写库 SQL 本身仍无 DB 覆盖。同一 INSERT 的 `affected_pages` 原本也是常量 `['qualification:takken']`，同日改为事实自己的 `qualification_id`（与批准链一致；宅建事实行为不变，其余 966／982 条非宅建事实回滚不再标到宅建页）。本机只读试算：982 条事实的 79 个（资格×`fact_key`）组合里，旧硬编码会把 72 个组合（覆盖 959／982 条事实）写成 `schedule_change`。
5. 历史统计字段（`applicants`／`examinees`／`passed`／`pass_rate`／`statistics_methodology`）六资格全为零官方来源，归工作包 F。2026-10-11 只读调研定性（详见 `docs/work-package-f-statistics-sources.md`）：这类需求在契约里一律是 `requiredLevel="post_event"`，而 `scripts/verify-lib.mjs` 算覆盖缺口时对 `post_event`／`optional`／`not_applicable` 直接跳过 ⇒ **门禁永远不会因为 F 变红**，它是产品覆盖欠账而非门禁欠账；本机 `sources` 的 40 条里 `source_type` 没有一条是 `pass_rate` 唯一合法的 `official_statistics`／`official_result_information`，那五个 `fact_key` 在候选与正式事实里都是 **0 条**，即从未登记过而非「登记了没批」。统计页入口其实就挂在已抓快照的正文里（离线解析 58 个 HTML 得 27 条候选 URL，23 HTML／4 PDF），最大阻碍是四条 PDF 是各家最完整的历年序列而六个解析适配器只吃 HTML 字符串。**2026-11-12 现态更新**：簿记 863 条历年统计已批准并接上公开面历年表（工作包 F／G）；FE 统计五字段已由推移表 xlsx 事实化（工作包 J，`exam_year=2025` 五条；2026-11-12 D2 历史年度轮再批准令和5/6 八条，`exam_year=2023/2024`，FE 统计合计 13 条，见 `docs/work-package-j-fe-pass-rate-proposal.md` §11 及 D2 补记）；其余资格的统计字段仍为零。
6. FP 入库链已于 2026-10-10 同口径对齐（`capture_record()` 四重校验、写 `capture_runs` 与 `snapshots` 全溯源列、写 `source_checks`），但**只到代码与用例层**，端到端仍卡在采集报告缺失，且此前把范围记小了：磁盘上没有报告记录的取证快照是 **6 个、共 75 条候选**（不是「那 4 个／53 条」），入库入口 `INGEST_SOURCES`（`ingest_fp.py`）于 2026-10-11 从 4 个来源扩到全部 6 个＝75 条（此前 `jafp-schedule` 12 ＋ `kinzai-schedule-2026` 10 这 22 条有事实、有 `approved` 候选，却没有已提交的入库入口；0016 迁移只登记来源、不写候选），解析不出契约字段的其余 7 个来源刻意留在 mapping 之外并由 pytest 用例锁住划分。2026-10-11 只读预演给出三条判据：① 这 75 条候选 id 全部已是 `approved`，且与库里 6 条真实快照行逐条相符；FP 的 75 条现行事实 **0 条挂在 `ci://` 夹具快照上**，那 39 条夹具候选只是历史 revision，`npm run audit:provenance` 对 FP 报 blocked 0（全库 blocked 4 全在 takken）⇒ 夹具残留不承重。② 已批准候选重跑按 `WHERE status='pending_review'` 不改值（临时表实测 rowcount＝0），但 `snapshots` 是**无条件** `DO UPDATE` ⇒ 即使哈希不变也会把抓取时刻改写成新值，属需项目所有者定性的副作用。③ 要拿到新报告必须授权一次抓取；候选 id 内嵌 `content_hash`，**某页哈希一变该页候选全变成新的 `pending_review`** ⇒ 门禁 `pending_official != 0` 硬失败，且暴露量仍集中在单页（`jafp-2-3-outline` 36 条＝映射内 75 条的 48%）。抓取入口 `capture_registered_sources(source_ids=None)` 默认覆盖 13 个 `FP_SOURCES`，超出 `docs/work-package-e-live-capture-authorization.md` 登记的 9 个 FP 来源，而该单注明已于 2026-09-08 执行完毕 ⇒ 重抓需一张新授权单，并用 `source_ids` 收紧到 `INGEST_SOURCES` 那 6 个来源。另因固定文件名原地覆盖，承载这 75 条事实的 6 个 HTML 已按 `<sha256>.html` 固化到 `var/official-snapshots/fp-preserved/`（本机专有、`var/` 不入库）：「文件字节与 `content_hash` 不符」在门禁与审计里都测不出来，只能靠这份副本。详见 `docs/fp-source-contract.md` 已知剩余项 1／2／4 与 `docs/stage-log.md` 2026-10-11 节。
7. 采集报告的「按 `source_id` 合并」已于 2026-10-10 收口：共享模块 `collector/capture_report.py` 现由**六条采集链全部共用**，含此前整份覆盖的基本情報 `capture_fundamental_it.py` 与宅建 `capture_takken.py`（后者的 `directly-cited-capture-report.json`、`directly-cited-document-capture-report.json` 两份报告各自独立合并）。宅建的 `capture_directly_cited_sources()` 支持只跑部分 `source_id`，此前一次局部运行会把其余来源的报告记录抹掉、让磁盘上仍然存在的快照在入库链看来「无报告」，这一条已被用例锁住。快照本身是内容寻址文件名，从未被覆盖，丢的一直只有报告。
8. `sources` 本机与 CI 空库的计数差**曾是设计，不是漏登记**（2026-10-11 只读核查后定口径；2026-10-12 `0018_bookkeeping_statistics_sources.sql` 给两侧各加 7 条 ⇒ 本机 47／CI 空库 45，差值 2 条）：多出的 2 条 `source:fp:jafp-2-3-application-outline-pdf` 与 `source:fp:kinzai-fp-faq` 由 `scripts/backfill-fp-provenance.mjs` 在本机 `INSERT`，承载的是 capture-only 证据——`services/collector/src/collector/capture_fp.py` 明确注释它们「has not been registered as an ingestion source」，collector 侧另用 `capture-only:fp:*` 前缀的 id，且脚本写入库的 id 是 `source:fp:*`，两套命名本就分叉；它们的非合成快照 `object_key` 指向 `.gitignore` 里的 `var/official-snapshots/fp/…`，CI 夹具不含这些行，所以补成迁移只会在 CI 造出两条「`active` 但永远取不到快照」的来源。**2026-11-11 现态：该差值已不存在**——本机库按 CI 夹具 dump 重建后叠加迁移 `0000–0027`，本机 52＝CI 空库 52（CI seed 现取 bound 52），那 2 条 backfill 行已不在本机库；`kinzai-fp-faq` 的 capture-only 入口仍在 `capture_fp.py` 的 `DIRECTLY_CITED_CAPTURE_SOURCES`，将随工作包 I 的 D4 退役。全仓触及 `sources` 的 SQL 一律从 `candidate_facts`／`snapshots` 侧 join 过去（`scripts/verify-lib.mjs`、`scripts/audit-approved-provenance.mjs`、`scripts/update-release-baseline.mjs`、`services/api/src/public-facts.ts`、`services/api/src/public-updates.ts`、`apps/admin/src/server.ts`），没有按来源全表计数的读取方，测试与 CI 也没有来源条数断言 ⇒ 计数差不影响门禁、API、admin 与 baseline 计数。**不要为了数字对齐去补登记迁移**（`0027` 登记 `statistics-fe` 是巡检检出未登记来源、号主拍板的独立决定，不属此例）。
