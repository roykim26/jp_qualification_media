# 交接单：簿記批准轮已收口＋历年统计接上公开面＋G-2 完整方案已进 main＋`?year=` 的 SEO 口径已定（2026-10-18 时点；非合成 `pending_review` 归 0、门禁 6/6）

> 本文是**时点快照**，供复制进新会话接续开发用。文中库侧与门禁数字是 **2026-10-14 第十四轮本机复跑读数**（迁移 `0019`／回填 `0020` 的执行实测出自 2026-10-13 第十三轮，同日复算幂等性已再现），**下一轮必须先按 §6 的命令现取，别把本文的数当结论**。口径权威定义在 `docs/data-gate-semantics.md`（§6 是批准链机制、§8.1 是三态术语、§9 是 baseline 与夹具维护），簿记账目在 `docs/bookkeeping-source-contract.md`。

工作目录＝仓库根 `E:\自建程序\jp_qualification_media`；第十八轮同步本行时 main＝origin/main＝**`ec881aa`**（PR #40 合并点＝第十七轮：交接单文头 SHA→`83cf841`＋§2 表补 #39＋§4 首段末态＋README 时点，**纯文档** 3 文件 13 增／4 删），本单自己的合并会把它顶掉 ⇒ 下一轮以 `git log --oneline -1` 现取为准。历史纯线性（`git rev-list --merges --count main` 为 0），main 每个 commit 标题都带 `(#NN)`＝**一律走 squash PR，不直接 push main**。仓库 ref 现状（第十八轮现取）＝本地只剩 `main`、`git ls-remote --heads origin`＝**1** 条 ⇒ #40 的分支 `docs-handoff-round16-sync`（`72e770a`）已按 §4 首段三重判据删净（远端 `git push origin --delete`＋本地 `git branch -D`），本轮开 PR 的分支＝`feat-round18-year-noindex-sitemap-gate`。⚠ 第十八轮本机 **Docker Desktop 引擎报 `Docker Desktop is unable to start`**（`docker-desktop` WSL 发行版在跑但引擎起不来）⇒ `docker compose up -d postgres` 不可用，`verify:all`／`npm run test` 全量／`ci:fixture:verify` 与全部库侧计数**本机未重取**，§3 的数字仍是第十四轮复跑读数；本轮新增的三条门禁断言只能由 PR 的 CI `release-gate` 实测，读数由第十九轮落账。

**批准链已走完，别再找批准任务**：簿记 807 条候选的三次独立授权（采集／入库／批准）已全部由号主行使完毕，2026-10-13 批完最后 772 条 ⇒ 非合成 `pending_review` **0**、`facts` **176 → 981**、门禁自行恢复 **6/6**；同日第十一轮已把 **863 条统一表历史统计接成公开面的历年表**（G-1／G-2 落地，见 §4 待办 3 闭合段），同日第十三轮再把 G-2 完整方案（`event_type` 加 `statistics_update`＋历史 945 条重分类回填）落成 **PR #36＝main `9bf7ec8`**。剩余待办见 §4，都属新范畴（宅建多来源、FE 附件提取、批准链的机制债、G 的两条延伸）。

## 1. 铁律（号主长期口径，违反即返工）

- 采集／候选入库／逐条批准＝**三次独立授权**，一次授权只管一件事。commit、push、merge、删分支、`db:migrate`、`db:seed`、写库、DROP 一律等号主明示「一句话」；做到需授权的步骤就停下问。
- 改 `config/data-coverage-contract.json`（判级面）属产品决策，必须另行请示。
- 不用未确认的值补事实；`normalized_value` 用官方原文；官方只写「会場ごとに異なる」这类就记规则型事实，不得编造全国统一值。
- 非合成 `pending_review` 会让门禁 `pending_official != 0` **硬失败**，这是设计内的中间态，不是故障（本轮已归 0，但只要再入队新候选就会重新出现）。
- 写库前先跑只读预检；写库绝不带 `NODE_ENV=production`，`DATABASE_URL` 只允许 localhost。
- 汇报写库动作按三态用词：「入库 N 条」要同句带 `pending_review` 与「未公开」；「批准 N 条」要带 `facts` 计数变化（如 209 → 981）。
- 判据要可复跑、数字要现取：报任何计数前先跑只读命令；不要交一次性临时探针（`--breakdown` 就是这一条的落地样例）。
- `git add --` 逐个明确路径，**绝不用 `git add -A`**；仓库根未跟踪的 `Python/` 目录归属未查明，**永不提交、也不要删**。
- 临时文件放 gitignored 的 `var/`，用完删；`uv run` 每次会重新生成的 `services/collector/uv.lock` 提交前删。

## 2. 已闭合的前置（别重推一遍）

簿记工作包 F／F-2 的推进链，全部经 squash PR 进 main：

| PR  | 内容                                                                                                                                        | main SHA  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| #21 | F-2 簿记 6 条历年序列子页采集侧登记（7 页已抓，实抓读数与逐条哈希在授权单 §8）                                                              | `08e18f1` |
| #22 | 统计页入库映射＋身份键补 `exam_session` 回合维度（迁移 `0017`）                                                                             | `fcba8c4` |
| #23 | 只读写库前预检 CLI `collector.precheck_bookkeeping`＋三态文档口径                                                                           | `bb8c73f` |
| #24 | 迁移 `0018` 登记七条统计来源；本机 apply `0017`＋`0018`；预检判据改「列存在性」                                                             | `1c38a45` |
| #25 | `docs/stage-log.md` 补第三轮交付段与 `db:seed` 读数（纯文档）                                                                               | `442a7e7` |
| #26 | 预检加 `--breakdown`，把待入队候选的审核量分解固化成常驻命令                                                                                | `fa42e90` |
| #27 | 新文档 `docs/transition-handoff.md`（即本单）＋ README 指针（纯文档）                                                                       | `a193e69` |
| #28 | `docs/stage-log.md` 补第四轮交付段＋本单就地同步（纯文档）                                                                                  | `eac1584` |
| #29 | `docs/stage-log.md` 补第五轮（807 条入库＋门禁转红）＋本单同步（纯文档）                                                                    | `203d06e` |
| #30 | 批准轮收口：baseline 58→863＋CI 夹具 176→981 同批＋四份文档交付段                                                                           | `32c4b84` |
| #31 | 第八轮纯文档：#30 的 CI 实测读数落账＋删 10 条已合并分支的三重判据与末态                                                                    | `727ffb9` |
| #32 | 第九轮纯文档：批后独立复核与三个取证坑落账＋本单欠账补齐＋纠正 `facts` 无 `synthetic` 列                                                    | `5f0635a` |
| #33 | 第十轮纯文档：工作包 G 方案稿（805 条历年统计接公开面的实测与三块拆法）＋本单欠账补齐                                                       | `0d91f1c` |
| #34 | 第十一轮代码＋文档：簿記 pass-rate 页接 5 张历年表（G-1）＋更新流事件类型最小方案（G-2）                                                    | `432021d` |
| #35 | 第十二轮纯文档：#34 的 CI 读数落账＋按三重判据删 #32／#33 两条遗留分支＋本单欠账补齐                                                        | `19e9db9` |
| #36 | 第十三轮代码＋迁移＋写库回填：G-2 完整方案＝`event_type` 加 `statistics_update`（0019）＋按新映射回填 921 条（0020），11 文件 165 增／45 删 | `9bf7ec8` |
| #37 | 第十四轮纯文档：#36 的交付链与 CI／库侧／门禁数字本机复跑落账＋本单欠账补齐，4 文件 58 增／42 删                                            | `930bbc1` |
| #38 | 第十五轮纯文档：#37 的交付链落账＋交接单文头 SHA／§2 表／§4 首段三处过时补齐＋README 时点，3 文件 13 增／4 删                               | `16597e3` |
| #39 | 第十六轮代码＋文档：`/updates/` 统计卡 details 分组折叠 A ＋ `?year=` 常驻门禁断言 B1 ＋ 本单欠账落账 C，7 文件 127 增／24 删               | `83cf841` |
| #40 | 第十七轮纯文档：本单文头 SHA→`83cf841`＋§2 表补 `#39` 行＋§4 首段末态＋README 时点，3 文件 13 增／4 删                                      | `ec881aa` |

批准链的三次授权落点（都已在库里，不要重跑）：抓取 2026-10-12 早（磁盘 7 页，`var/official-snapshots/`）；入库 2026-10-12T10:38Z 另一窗口 `ingest_bookkeeping` EXIT=0 产 807 条候选；批准分两段——2026-10-12 批 **35 条**（ネット数值 28 ＋ 口径 7 只产 5 条 `facts`）⇒ `facts` 176 → 209，2026-10-13 按級分三档批完 **772 条**（196／288／288）⇒ 209 → **981**。`reject` 全程 0 条。

另外这些口径**已拍板且均为「维持现状」**，别再重开：ネット／初級的裸「受験者数」不映射任何字段；簿記初級／4 級／原価計算初級不进覆盖契约；`pass_rate` 存官方印刷百分数原值（转写不换算，`value_type='decimal'`）；ネット两条 `statistics_methodology` 槽**以页首引言为 current**，列头那条保留为已批准但非 current（2026-10-13 拍板，取证坐标见 `docs/data-gate-semantics.md` §6）。

迁移是否落后的**唯一可靠判据**＝查列：`information_schema.columns` 里 `candidate_facts.exam_session` 存在即已应用 `0017`。不要用「`schema_migrations` 行数 vs 迁移文件数」推断——`packages/db/src/migrate.ts` 以**文件名**为主键且不校验记录，0010→0016 改名留下的孤儿记录会让两者在真的缺一条迁移时恰好相等。

## 3. 本机库与配置现态（2026-10-14 第十四轮复跑，每轮请重取）

`schema_migrations` **22**（迁移文件 **21** 个；行数≠文件数，见下文判据）、`sources` 47（`qualification_id` NULL 0）、`facts` 非合成 approved **981**、`candidate_facts` **1075 approved ＋ 13 rejected ＋ 0 pending_review**、`reviews` **1006**（approve 983／reject 18／requeue 5）、`snapshots` **44**、`source_scopes` 0、`change_events` **983**（**第十三轮回填后**＝`statistics_update` 807／`system_change` 88／`schedule_change` 24／`application_deadline` 17／`fee_change` 15／`eligibility_change` 11／`application_open` 11／`result_date` 8／`exam_date` 2）。磁盘快照**没有重抓**，`snapshots` 44 是入队时登记的快照行。⇒ 第十四轮把这十几格全部本机重取一遍，**逐字与第十三轮相符**；另按 0020 的 CASE 原文复算＝**需改写 0／孤儿 0**（幂等再现）。

门禁与预检都是绿态：`npm run verify:all` ⇒ `status=passed`、**6 passed／0 failed**、EXIT=0，簿记 `approved_official` **863**、`api.facts` **863**、五个公开页 200、`coverageGaps: []`，其余五格 16／15／2／10／75。只读预检 ⇒ `summary: stored=903 computed=865 skipped_approved=865 would_stage=0 blocking=0`、**EXIT=0**。⚠ 读预检别只看退出码：`blocking=0／EXIT=0` 在「未入队」与「已批完」两种终态上形状相同，要靠 `skipped_approved` 与 `would_stage` 两列区分（五次读数表在 `docs/bookkeeping-source-contract.md`）。第十一轮（改代码轮）、第十二轮（本单补齐轮）、第十三轮（迁移＋回填轮）与第十四轮（本单再补齐轮）各把本节数字复跑了一遍 ⇒ 除 `change_events` 的 `event_type` **分布**（第十三轮按拍板回填）与 `schema_migrations` 行数（20 → **22**）之外，库侧计数、`verify:all` 6/6、预检 `would_stage=0 blocking=0`、pytest **158 passed** 逐字未动（第十四轮现取＝`"status": "passed"`／**6 passed／0 failed**／EXIT=0，预检 `stored=903 computed=865 skipped_approved=865 would_stage=0 blocking=0`／EXIT=0，vitest **90 passed／11 文件**，`format:check`／`typecheck`／`build`／`ci:fixture:verify` 全 **0**）。⚠ 本机自检命令是 **`npm run test`**（＝`vitest run tests --pool=threads --poolOptions.threads.singleThread`），不要图快跑 `npx vitest run`：后者会连 `scripts/*.test.mjs`（node:test 文件）一起扫，报两个「No test suite found」的 FAIL；另外跑测试前确认 **4100 没被残留进程占着**，否则 `tests/public-api.test.ts` 抛 `EADDRINUSE` 让整轮退出码 1。

`change_events` 的 `event_type` **已在第十三轮按新映射回填完毕**（迁移 `0019_event_type_statistics_update`＝`ALTER TYPE` 加成员 `statistics_update`，迁移 `0020_change_event_type_backfill`＝一条与 `updateEventTypeForFact()` 同序的 CASE 全表 `UPDATE`；实际改写 **921** 行／不变 62 行，回填后复算改写 0 ⇒ 幂等）。⇒ 现在在 `/updates/` 上看到的是「統計データの変更」，**旧的「日程の変更」误标已不存在**；`event_type` 枚举现有 **9** 个成员、`statistics_update` 按 `enumsortorder` 在**末位**。⚠ 两条硬约束留给下一轮：① `packages/db/src/migrate.ts` 是**逐文件单事务**，Postgres 不允许在同一事务内**使用**刚 `ADD VALUE` 的新枚举值 ⇒ 加成员与用它的 `UPDATE` 必须分两个迁移文件；② 回填是**重分类不是改名**（945 条 `schedule_change` 里 807 条进 `statistics_update`、114 条进 `system_change`／`fee_change`／`eligibility_change`、24 条本就属日程），要再动口径必须照 §6 的先只读试算（把迁移里的 CASE 抽出来改写成 SELECT 与 JS 映射逐行比对）。⚠ 判级面与 baseline **未动**，`fixtures/ci/approved-facts.sql` **不含 `change_events`**（只有 facts／fact_revisions／candidate_facts／snapshots 四张表），CI 又是先 `db:migrate` 后 `ci:fixture:restore` ⇒ 这两个迁移在 CI 上命中 0 行，夹具与 baseline **不需要重导**。这条已由 **#36 的两次 CI 实测坐实**（不是推断）：PR 侧 run `38491023371`／job `115615960976` **success**（55s）与合并后 main push run `38492661733`／job `115621272527` **success**（63s），两侧日志都有 `Applied 0019_event_type_statistics_update.sql.`＋`Applied 0020_change_event_type_backfill.sql.` → `bound 45 sources` → `"status": "passed"`／`"passed": 6`／`"failed": 0`，且**未出现 `below regression floor`**；第十四轮另把幂等复算在本机重跑＝**需改写 0／孤儿 0**。仍开放＝`services/api/src/release.ts:92` 回滚路径仍硬编码 `schedule_change`。**折叠已闭合（第十六轮 A）**＝回填后 `/updates/` 首页 100 张卡全被统一表统计批占满的 G 稿点名问题，本轮改为 render 侧按 `eventLabel` 分组进 `<details>`（同类多卡默认收起并显示件数、单卡分组保持展开），是**纯呈现层**；`services/api/src/public-updates.ts:42` 的 `LIMIT 100` 与 API 返回**未动**，故 100 条上限本身仍在（要放宽须另改查询与分页，属新授权）。

`config/release-gate-baseline.json` 与 CI 夹具**已同批刷到 981 口径**：bookkeeping `expectedFacts` 58 → **863**（其余五格不变），`fixtures/ci/approved-facts.sql` 176/176/176/25 → **981/981/981/29**（`scripts/verify-ci-fixture.mjs` 第 9–12 行四个断言同步改）。⚠ 两者必须同批：baseline 是**回归下限**（`scripts/verify-lib.mjs:215` 判 `approved_official < expectedFacts`），只刷 baseline 不重导夹具 ⇒ 本机照绿而 CI 必红在 `approved official 58 below regression floor 863`。

⚠ 连库报 `ECONNREFUSED ::1:5432 / 127.0.0.1:5432` 多半是 **docker compose 的 postgres 容器没在跑**（容器名 `jp_qualification_media-postgres-1`，`postgres:16-alpine`），`docker compose up -d postgres` 即恢复；Windows 服务里没有 postgres（第十四轮 `Get-Service` 查 `*postgres*` 回空已证实），`psql` 也不在 PATH（查库用 `node` ＋ `pg` 的 `Client`，连接串走 `.env`）。第十四轮实测＝容器 `Exited (0)` 停摆约 12 小时，`docker ps -a --format '{{.Names}}\t{{.Status}}'` 一眼可判，`docker compose up -d postgres` 后 **4 秒**即可连；⇒ **报库侧数字前先探这一层**，别把昨天的读数当今天的。

⚠ 查库列名：状态列叫 **`status`**、来源列叫 **`source_id`**（写成 `review_status`／`source_key` 会得到 `column ... does not exist`，而不是「0 条」）。⚠ **`synthetic` 只在 `candidate_facts` 与 `snapshots` 上存在，`facts` 表没有这一列**（2026-10-13 实测：`select count(*) from facts where synthetic=false` ⇒ `column "synthetic" does not exist`）⇒ 数「非合成现行事实」必须照 `scripts/verify-lib.mjs:154-177` 的链取：`facts f → fact_revisions fr（fr.id=f.current_revision_id）→ candidate_facts c → snapshots s / sources src`，条件是 `f.status`／`fr.status`／`c.status` 三者全 `approved` 且 `c.synthetic=false`（本轮实测合计 981＝簿记 863＋其余五格 16／15／2／10／75，与 §3 逐格相符）。`reviews` 的决定列叫 **`decision`**（text，非枚举），按它分组即得 approve 983／reject 18／requeue 5。⚠ 判退出码：`npm run verify:all 2>&1 | tail -30` 之后再取 `$?` 拿到的是 **`tail`** 的退出码 ⇒ 先重定向到文件再 `echo $?`，或用 `${PIPESTATUS[0]}`。⚠ 本机 **没有 `pnpm`**，README 里那串 `pnpm …` 等价换成 `npm run …`。

## 4. 待办（按建议顺序，每件都要单独授权）

**已闭合（2026-10-13 第八轮＋第十二轮两批）**：第八轮删 **10 条**（本单旧版记的 9 条漏了 `docs-wpf-round5-ingest-record`＝PR #29 的分支）；第十二轮再删 **#32／#33 的两条**＝`docs-handoff-round9-sync`（`headRefOid` `7ccad39`，mergeCommit `5f0635a`）与 `docs-work-package-g-proposal`（`ad89513`，mergeCommit `0d91f1c`）⇒ 末态本地只剩 `main`、`git ls-remote --heads origin | wc -l` 回到 **1**（第十二轮现取）。⚠ squash 合并的仓库里 `git branch -d` 必报 `not fully merged`、`git rev-list --count main <branch>` **恒为 1**（这不是「未合并」的证据），可用判据是三条一起过：`gh pr list --state merged --head <branch>` 拿到 `mergeCommit`＋`headRefOid` → 核 `headRefOid` 与本地／远端 tip 三者相等 → `git diff --diff-filter=A --name-only main <branch>` 计数 0。细节在 `docs/stage-log.md` 第八轮与第十二轮。⚠ **第十八轮轮前现取的末态＝本地只剩 `* main`**＝#40 的分支 `docs-handoff-round16-sync`（`72e770a`）已按上面三重判据删净（远端 `git push origin --delete`＋本地 `git branch -D`）⇒ `git ls-remote --heads origin | wc -l`＝**1**、`git rev-list --merges --count main` **0**、`git branch -vv` 只剩 `* main`（第十八轮轮前现取）；本轮分支＝`feat-round18-year-noindex-sitemap-gate`（代码 commit `c06f13f`），合并后由第十九轮按同一条三重判据删净。

1. **宅建统计页多来源重构**：`snapshot_from_html()` 仍把快照 id 钉在单条 `TAKKEN_SOURCE`，而那条背后有已批准事实 ⇒ 这页**只能抓、不能入库**。要动的是 collector 代码＋可能的迁移，属新授权。
2. **基本情報技術者附件提取**：`toukei_fe.html` 只是附件目录页（零 `<table>`，数据全在 20 多个 PDF／xlsx 里），而全仓**既无 PDF 也无 xlsx 解析能力** ⇒ 要另开「附件提取」授权并先定依赖。
3. **把 805 条历年统计接到「能用」的程度**：**已闭合（2026-10-13 同日第十一轮＝G-1＋G-2 落地，号主对 G 稿 §5 四问全部拍板选推荐项）**。结果＝簿記 pass-rate 页 **802 卡／1,075,312 B → 26 卡／123,550 B ＋ 5 张历年表 207 行**，概览 863 → **82 卡**，年份链接改指 `/shikaku/<slug>/pass-rate/?year=<年>`（`?year=2010` 实测 **32 卡**＝库侧逐键读数），`exam_session` 以「173回」列可见，`statistics_methodology` 改成表上「集計口径：」注记；G-2 走最小方案＝映射与文案改完（`updateEventTypeForFact()`，22 键），**当时**历史 945 条 `schedule_change` 未回填（第十三轮已补做，见本节末）；G-3 按拍板**判级面零改动**，历年统计仍不进门禁。改动 7 个代码／测试文件 589 增／38 删，零写库、零迁移，baseline 与 CI 夹具未动。执行读数与实现差异在 `docs/work-package-g-history-presentation.md` §7，踩坑在 `docs/stage-log.md` 第十一轮。⚠ **延伸拆两条＝断言已闭合／sitemap 未闭合（需单独授权）**＝**第十六轮 B1** 已把 `?year=` 接成常驻门禁断言（`scripts/verify-lib.mjs` 的 bookkeeping gate 追加 `pass-rate/?year=<pass_rate 最大 examYear>` 只读探针，检「受験者数・合格者数・合格率の年次推移」表存在＋当年链接带 `aria-current="page"`，本轮实测探针年 **2026**／200、`verify:all` 仍 **6/6**）；`?year=` **进 sitemap 这条延伸已由第十八轮 A 闭合＝结论是不收**＝该变体与 `/pass-rate/` 共用同一份年次表（`apps/web/src/render.ts:812-815` 把全量 `view.facts` 交给 `renderHistoryTables()`，年参数只换卡片集与 `aria-current` 高亮行），canonical 又恒指 `/shikaku/<slug>/pass-rate/`（render.ts:927-932），按 `docs/product-design.md` 18.2「参数筛选页 `noindex,follow`」它属筛选页 ⇒ 第十八轮给 `pass-rate` 的 `?year=` 变体补上 `noindex`（与 render.ts:1068 的 `/schedule/?year=` 对齐），**sitemap 继续不收** `?year=`，并把这一口径固化成三条常驻门禁断言（`scripts/verify-lib.mjs`：`?year=` 页含 `<meta name="robots" content="noindex,follow">`＋`/sitemap.xml` 含 `/shikaku/bookkeeping/pass-rate/`＋`/sitemap.xml` 不含 `?year=`）。⚠ 这三条断言**第十八轮未本机实测**（Docker Desktop 引擎报 `unable to start`，库起不来，见文头末段），由本轮 PR 的 CI `release-gate` 首验，读数由第十九轮落账。G-2 完整方案**已闭合（2026-10-13 同日第十三轮＝号主给迁移＋写库双授权）**＝`event_type` 加 `statistics_update`（迁移 0019）＋按映射回填历史（迁移 0020，改写 921 条），读数与两条硬约束见 §3 末段与 `docs/work-package-g-history-presentation.md` §8；**第十四轮坐实它已进 main**＝PR **#36** ⇒ `9bf7ec8`，两个迁移文件已在 main 树里（`git ls-tree -r --name-only main | grep -E "0019_|0020_"` 两条齐全），别的机器 clone 即得。
4. **批准链的遗留机制债（不急，但要知道）**：`approve` 无撤销接口（`docs/data-gate-semantics.md` §6 第 2 条），同槽覆盖会让 `facts.id` 与实际 current 候选名实不符（第 3 条）。要补「撤销真实快照事实」的能力属改代码＋改鉴权面，另需授权。
5. **文档欠账**：**已闭合（2026-10-13 第十二轮，同日第十三轮再补一次）**＝本单文头 main SHA → `432021d`、§2 交付表补 `#33`／`#34` 两行、§3 加 `change_events` 分布与「945 条未回填」的读法、§4 首段两批删分支的实数、待办 3 的 G 闭合段与 §5 两条产品事实、§9 与工作包 G 稿的「§7 执行记录」指针、README 时点同批。**第十三轮再补**＝文头 main SHA → `19e9db9`（#35 合并点）、§2 交付表补 `#35` 行、§3 与 §5 的「945 条未回填」改成回填后的实测分布＋两条迁移硬约束、§3 末段加 `npm run test` 与 4100 残留进程两条自检坑、待办 3 标 G-2 完整方案闭合、G 稿新增 §8、README 指针同批。⚠ 仍是**每轮必欠一次**的结构：本单合并后文头 SHA 与 §2 表立刻又过时一轮，惯例仍是下一轮开 PR 时顺手补，不需要单独立项。**第十四轮再补**＝文头时点 → 2026-10-14、main SHA → `9bf7ec8`（#36 合并点＝第十三轮）、§2 交付表补 `#36` 行、§3 全部库侧与门禁数字由第十四轮本机复跑（含 `docker compose up -d postgres` 的恢复实测）、§3 的「不需要刷夹具」从推断升级为 #36 两次 CI 实测、§4 首段分支末态改成 2 条＋待办 3 标 G-2 完整方案已进 main、§6 加幂等复算的 `::text` 坑、§7 加 `gh pr merge` 零输出与 `git rev-parse` 多 ref 两条判据坑、§9 与工作包 G 稿 §8 的交付段、README 时点同批。第十四轮＝**纯文档**（4 个文件），零抓取／零入库／零批准／零迁移／零写库／零代码改动。**第十五轮再补（本轮）**＝文头 main SHA → `930bbc1`（#37 合并点＝第十四轮）、§2 交付表补 `#37` 行、§4 首段分支末态由「本地＋远端各 2 条＝#36 分支未删」改回「只剩 main／远端 1 条」（本轮按 §4 首段三重判据删净 #36 分支 `db-round13-statistics-event-type`＋`git remote prune` 陈旧 `origin/docs-handoff-round12-sync`）、README 时点同批；本轮＝**纯文档**（3 个文件：`docs/transition-handoff.md`／`docs/stage-log.md`／`README.md`），零抓取／零入库／零批准／零迁移／零写库／零代码改动，库侧与门禁数字沿第十四轮复跑读数（本轮无代码／无写库改动，未重取）。**第十六轮再补（本轮＝代码＋文档）**＝代码两块＝A（`/updates/` render 侧 `<details>` 分组折叠，见 §3 末段）＋B1（`?year=` 接成常驻门禁断言，见待办 3）；文档欠账＝文头 main SHA → `16597e3`（#38 合并点＝第十五轮）＋ ref 现状改成本轮现取、§2 交付表补 `#38` 行（3 文件 13 增／4 删）、§4 首段分支末态改成第十六轮现取的「只剩 `main`／`ls-remote`=1／`merges`=0，#38 分支 `docs-handoff-round15-sync`（`0f04950`）已删净」、§3 末段把折叠标为已闭合（A）、待办 3 的 `?year=` 延伸拆成「断言已闭合／sitemap 未闭合」（B1）、README 时点同批。本轮文档＝**3 个文件**（`docs/transition-handoff.md`／`docs/stage-log.md`／`README.md`），代码＝**4 个文件 109 增／18 删**（`apps/web/src/render.ts` 34/18＋`apps/web/src/styles.ts` 6/0＋`scripts/verify-lib.mjs` 29/0＋`tests/web-render.test.ts` 40/0），零抓取／零入库／零批准／零迁移／零写库／零判级面改动（`config/data-coverage-contract.json` 未动）。本轮门禁数字本机现取＝`verify:all` **`"status": "passed"`／6 passed／0 failed／EXIT=0**（含新增 `?year=2026` 探针）、`npm run test` **91 passed／11 文件**（比第十三轮 90 多 1＝本轮新增的折叠分组断言）、`format:check`／`typecheck`／`build`／`ci:fixture:verify` 全 **0**；库侧计数沿第十四轮复跑读数未重取（本轮无写库）。**第十七轮再补（本轮＝纯文档）**＝文头 main SHA → `83cf841`（#39 合并点＝第十六轮）＋ ref 现状改本轮现取（#39 分支 `feat-round16-updates-fold-year-gate`（`570772c`）已删净／本轮开 PR 的分支＝`docs-handoff-round16-sync`）、§2 交付表补 `#39` 行（7 文件 127 增／24 删）、§4 首段分支末态改成第十七轮现取的「只剩 `main`／`ls-remote`=1／`merges`=0」、README 时点同批；本轮＝**纯文档**（3 个文件：`docs/transition-handoff.md`／`docs/stage-log.md`／`README.md`），零抓取／零入库／零批准／零迁移／零写库／零代码改动／零判级面改动，库侧与门禁数字沿第十六轮现取读数（本轮无代码／无写库改动，未重取）。**第十八轮再补（本轮＝代码＋文档）**＝文头 main SHA → `ec881aa`（#40 合并点＝第十七轮）＋ ref 现状改本轮轮前现取、时点 → 2026-10-18、§2 交付表补 `#40` 行（3 文件 13 增／4 删）、§4 待办 3 的 sitemap 延伸按 A 闭合（`?year=` 补 `noindex` ＋ 三条常驻断言）、§4 首段分支末态改成第十八轮轮前现取、§5 加「`?year=` 是 `noindex,follow` 且不进 sitemap」的产品事实、README 时点同批；本轮代码＝**3 个文件 43 增／0 删**（`apps/web/src/render.ts` 3/0＋`scripts/verify-lib.mjs` 20/0＋`tests/web-render.test.ts` 20/0），零抓取／零入库／零批准／零迁移／零写库／零判级面改动（`config/data-coverage-contract.json` 未动）。⚠ 本轮自检只跑到不依赖库的四项＝`format:check`／`typecheck`／`build` 全 **EXIT=0**、`tests/web-render.test.ts` 单跑 **30 passed**（同文件改前 **29** 条用例，净增 1，用 `git show main:tests/web-render.test.ts` 现取）；`npm run test` 全量／`verify:all`／`ci:fixture:verify` **未跑**＝Docker Desktop 引擎两次干净启动均报 `unable to start`（WSL 发行版 `docker-desktop` 已在跑），postgres 起不来 ⇒ §3 全部库侧数字沿用第十四轮复跑读数，本轮新增断言的实测面交给 CI。

## 5. 容易踩空的产品事实

- **F 永远不会把门禁跑红**：`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` 的 requirement，历史统计类正属此类 ⇒ 这是产品覆盖债，不会自己浮出水面，只能靠人记着。⚠ 第十一轮把统计接成历年表**没有改变这一条**（判级面按拍板零改动），公开面能看≠门禁会管。
- **簿記历年统计的公开面口径（2026-10-13 第十一轮起）**：历年数值走 `pass-rate` 页的 **5 张表／207 行**，卡片**只列当年**；年份链接指 `pass-rate/?year=<年>` 而不是年度日程页，且 **`?year=` 时该页所有卡都按年过滤**（含 `passing_standard` 等非统计键）；`statistics_methodology` 不是卡片而是表上「集計口径：」注记；`/shikaku/<slug>/<年>/` 年度页**继续只管日程**（2010 仍是 0 卡）。改统计呈现时若只看年度页会以为没生效。⚠ **`?year=` 变体自第十八轮起是 `noindex,follow` 且不进 sitemap**：它与 `/pass-rate/` 渲染同一份年次表、canonical 恒指 `/pass-rate/`（`apps/web/src/render.ts:927-932`），按 `docs/product-design.md` 18.2 属参数筛选页；要让历年页各占一条收录，必须**同时**改 canonical 与 sitemap 生成（`apps/web/src/server.ts:142-152`），只改一处会得出「sitemap 列一个自己声明不是标准页的 URL」，已被第十八轮明确否掉。另记一条本轮未动的既有事实＝sitemap 里的年度 URL 是**硬编码 `/2026/`**（server.ts:146），不是数据驱动。
- **`/updates/` 的标签口径第十三轮起是「映射＋库」两份要对齐**：`updateEventTypeForFact()`（`packages/schema/src/updates.ts`）是 admin 批准写入点的唯一映射，历史 983 条 `change_events` 已按同一份 CASE 回填（迁移 0020）⇒ 改映射就是**同时改两处**：代码里的分支顺序＋迁移里的 CASE。判据＝`var/r13-sqlcheck.mjs` 那种「把迁移里的 CASE 抽出来改写成 SELECT、与 JS 逐行比对」的只读试算，不一致必须为 0 才能写库。
- **审核量的换算按「不同 `evidence_text` 段数」而不是候选条数**：統一表每行拆 4 条候选共享一段原文，807 条候选实际只有 210 段（統一 193 ＋ ネット 14 ＋ 口径 3）。估人工时照这条。
- **本机批准不会自动进 CI 夹具**：夹具要 `ci:fixture:export` 重导＋四个硬编码计数同步（§3 末段）。重导与 `baseline:update` 都有双重确认开关，且**都拒绝在非合成 pending 未清零时执行**，所以顺序永远是：批完 → `verify:all` 6/6 → `baseline:update` → `ci:fixture:export` → `ci:fixture:verify`。
- **公开面的卡片数不再等于事实数**（与上一条同批次生效）：核对「库里某年有哪些统计事实」不能再数卡片，要看 pass-rate 的表或按 §6 的库侧脚本现取。基准读数＝pass-rate **26 卡＋5 表 207 行／123,550 B**、概览 **82 卡／161,600 B**、`pass-rate/?year=2010` **32 卡**，而 `/shikaku/bookkeeping/2010/`（日程页）**仍 0 卡**、`/2026/` 仍 15 卡。
- ⚠ 本机想做 CI 复刻需要新建临时库，而 `CREATE DATABASE` 会被自动模式按「基础设施变更」拦下（2026-10-13 实测）。替代判据：核对夹具引用的 `source_id` 是否全部由迁移登记（本轮 23 条全命中，缺失 0）。

## 6. 可复跑判据命令（本机实测通）

```
set -a; . ./.env; set +a
PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.precheck_bookkeeping --breakdown
PYTHONIOENCODING=utf-8 uv run --project services/collector python -m pytest services/collector/tests services/parser/tests -q
npm run format:check
npm run test
npm run verify:all
npm run ci:fixture:verify
```

- 预检只 `SELECT`；退出码 0＝无阻塞项、1＝有阻塞项、2＝缺 `DATABASE_URL` 或参数不认识。
- 库侧计数（`facts`／`pending_review`／`reviews`／`snapshots`）把 SQL 写成 `var/` 下的脚本再 `node var/x.mjs` 跑，别拼一行式内联 SQL（一行式命令通体不要带单引号与反引号）。本轮用的四条判据语句已归档进 `docs/stage-log.md` 第七轮与 `docs/bookkeeping-source-contract.md`。
- **动 `event_type` 口径前的只读判据**（第十三轮立下的，脚本 `var/r13-precheck.mjs`／`var/r13-matrix.mjs`／`var/r13-sqlcheck.mjs` 已按铁律删除，方法要复用就照下面三步重写）：① 分布对照 `select event_type::text, count(*) from change_events group by 1 order by 2 desc`；② 影响面＝把目标映射跑成「库里实际值 → 新值」的转移矩阵（`change_events ce join facts f on f.id=ce.fact_id`，全部 983 行都能联到，孤儿 0）；③ **一致性**＝从迁移文件里读出 CASE 原文、剥掉 `--` 注释后改写成 SELECT 并**去掉 `::event_type` 强转**（新成员未 apply 时强转必报错），与 `updateEventTypeForFact()` 逐行比对，**不一致必须为 0** 才允许写库。本机实测：983 行逐行一致／改写 921／不变 62，回填后复算改写 0（幂等）。⚠ 复算那条比对语句的**两侧都要 `::text`**：写成 `ce.event_type::text IS DISTINCT FROM (CASE … END)::event_type` 会报 `operator does not exist: text = event_type`（第十四轮实测）；顺带两条列名坑——`fact_revisions` 的外键叫 **`candidate_fact_id`**（不是 `candidate_id`），数非合成现行事实的链是 `facts f → fact_revisions fr ON fr.id=f.current_revision_id → candidate_facts c ON c.id=fr.candidate_fact_id`。
- 自检命令是 **`npm run test`**，不是 `npx vitest run`：后者会扫 `scripts/*.test.mjs`（node:test 文件）报「No test suite found」的 FAIL；跑测试前还要确认 **4100 没被残留进程占着**（`netstat -ano` 的 PID 在**第 5 列**；本机 Bash 里 `taskkill //PID` 会被判成 UNC 路径要求确认，改 `powershell -NoProfile -Command "Stop-Process -Id <pid> -Force"`），否则 `tests/public-api.test.ts` 抛 `EADDRINUSE` 让整轮退出码 1。
- baseline 与夹具的两个双重确认命令（都要 localhost，都拒绝非合成 pending 未清零）：

```
set -a; . ./.env; set +a
RELEASE_BASELINE_CONFIRM=UPDATE_RELEASE_GATE_BASELINE npm run baseline:update -- --confirm=UPDATE_RELEASE_GATE_BASELINE
CI_FIXTURE_EXPORT_CONFIRM=EXPORT_SANITIZED_CI_FIXTURE npm run ci:fixture:export -- --confirm=EXPORT_SANITIZED_CI_FIXTURE
```

- pytest **必须同传 collector 与 parser 两个目录**（只传 parser 会 `ModuleNotFoundError`）；2026-10-13 基线 **158 passed**，**该数字每轮都会变**。
- 打印日文要 `PYTHONIOENCODING=utf-8`，否则 GBK 控制台必崩。

## 7. GitHub 通路（本机实测一次即通，不改任何 git 配置）

```
GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 push -u origin <branch>
```

- 判序：`netstat -ano | grep "127.0.0.1:7890.*LISTENING"` 确认代理在 ＋ `gh auth status` 已登录 ⇒ 直接推。**别显式跑 `gh auth git-credential get` 探凭据**，会被自动模式拒，重试无意义。
- push 被 `Recv failure: Connection was reset` 时：先原样重试一次 → 再加 `-c http.version=HTTP/1.1`（HTTP/2 经代理 CONNECT 隧道易被重置）→ 最后才试空代理覆盖 `-c http.proxy= -c https.proxy=`。
- 推成功的判据用 `git rev-parse --short refs/remotes/origin/<branch>` 对比 `HEAD`，不要看 `git status -sb`。
- PR／CI 读数一律用 `gh`：`gh pr view <n> --json state,mergeable,mergeStateStatus,changedFiles`、`gh run view <id> --json status,conclusion,jobs`。`gh pr create` 的多行正文先写进 `var/pr-body.md` 再用 `--body-file`（内联 heredoc 会静默失败、回 exit 0 但没开成 PR）。
- 合并后回读远端：`GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 fetch origin main`。本地 main 不在检出态时可用 `fetch origin main:main` 直接快进（第十四轮实测 `19e9db9..9bf7ec8` 一次通过），再拿同一条 helper 链跑 `ls-remote origin refs/heads/main` 问远端。
- ⚠ **`gh pr merge <n> --squash` 成功时回显为空**（exit 0／零输出，与 `gh pr create` 的内联 heredoc 同族假失败），别据此判「没推上」或「没合上」。判据只能用只读回读＝`gh pr view <n> --json number,state,mergedAt,mergeCommit,mergedBy,baseRefOid,headRefOid,changedFiles`；squash 后的落地 SHA 在 **`mergeCommit.oid`**，而 **`squashCommit` 不是合法字段**（报 `Unknown JSON field` 且 exit 1）。
- ⚠ 本机的 git 对 `git rev-parse --short A B C`（一次传多个 rev）**必报 `fatal: Needed a single revision`**，单传则正常 ⇒ 多 ref 对数用 `for r in ...; do git rev-parse --short "$r"; done` 或 `git show-ref | grep <branch>`。

## 8. 审核通道的操作口径（若将来还要批新候选）

```
set -a; . ./.env; set +a
netstat -ano | grep 127.0.0.1:3001        # 起服务前先确认端口没被残留进程占
ADMIN_REVIEWER_ID=local-data-reviewer npm run dev:admin > var/admin.log 2>&1 &
curl -s -o /dev/null -w "HTTP=%{http_code}\n" -H "x-reviewer-id: local-data-reviewer" http://127.0.0.1:3001/review/bookkeeping
```

- `ADMIN_REVIEWER_ID` 不在 `.env` 里，启动必须显式带，否则读写全 401；历史 1006 条 `reviews.reviewer_id` 与之一致。
- 写只认 `x-reviewer-id` 头，`?reviewer=` 查询参数是降级只读的重放面，别用于写。`POST /internal/reviews/{candidate_id}` body `{"decision":"approve|reject|defer|requeue","reason":"非空必填"}`；成功 200，任何失败（含 candidate not found、reason 空）一律 400 `{"error":"request failed"}` ⇒ HTTP 码只当粗筛，**净效果必须以库侧计数验收**。
- 收尾停服务：`pkill -f tsx` 杀不干净 tsx 的子 node，要 `netstat` 取 PID 后 `taskkill //PID <pid> //F //T`（`grep` 出来的行里 TIME_WAIT 那条 PID 是 0，别拿去 kill）。

## 9. 该读的权威文档

| 文档                                                                                                                     | 管什么                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/data-gate-semantics.md`                                                                                            | 门禁／判级／溯源／三级授权／鉴权总口径；§6 批准链三条机制；§8.1 三态术语；§9 baseline 与夹具；§10 回归读数                                                                                                                                                                                                       |
| `docs/bookkeeping-source-contract.md`                                                                                    | 簿记来源登记、统计页入库映射、写库前预检码表、`--breakdown` 与批准推进的五次读数表                                                                                                                                                                                                                               |
| `docs/work-package-g-history-presentation.md`                                                                            | 待办 3 的方案稿**＋§7／§8 两段执行记录**：805 条历年统计的公开面实测、G-1／G-2／G-3 三块改动面与判据、判级面改 `required` 的 24 个缺口清单，第十一轮的改前／改后读数与五条实现差异，第十三轮的 G-2 完整方案（枚举加成员＋回填影响面与两条迁移硬约束）**＋第十四轮补的 #36 交付段（两次 CI 实测与幂等复算再现）** |
| `docs/work-package-f-statistics-sources.md`                                                                              | 历史统计来源只读调研（27 条候选 URL、为何第一批只能做 3 个 HTML 来源）                                                                                                                                                                                                                                           |
| `docs/work-package-f-live-capture-authorization.md`／`docs/work-package-f2-bookkeeping-history-capture-authorization.md` | F／F-2 授权单原文与执行记录（§8 逐条哈希）                                                                                                                                                                                                                                                                       |
| `docs/runbook.md`                                                                                                        | 当前发布门禁与资格范围                                                                                                                                                                                                                                                                                           |
| `docs/stage-log.md`                                                                                                      | 逐轮阶段记录（含各轮交付与读数）                                                                                                                                                                                                                                                                                 |
