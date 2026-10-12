# 阶段记录与剩余问题

## 2026-10-13（同日第九轮）：批准链的批后独立复核落账＋交接单欠账补齐，并纠正交接单里一条写错的列名口径（零抓取／零入库／零批准／零迁移／零写库）

- 触发：号主点「1」＝合并 PR #31 后按交接单 §4 待办 5 补文档欠账。查 `gh pr view 31 --json state` ⇒ **已 MERGED**（`mergeCommit=727ffb9`、`mergedAt=2026-10-12T23:36:52Z`、`release-gate` **pass 50s**，run `38322932381`）⇒ 另一窗口已合完，本轮只剩欠账本体。轮前现取：main＝origin/main＝`727ffb9`，`git rev-list --merges --count main` **0**，`git ls-remote --heads origin | wc -l` **1**（本地只剩 `main`），工作区只剩 `?? Python/`。
- **批后独立复核落账**（第八轮之后、本段之前在本会话做的，此前无人记账）：对 2026-10-13 批准的統一表 **772 条**做逐字段转写核对＝**193 段不同 `evidence_text` × 5 项检查**（`applicants`／`examinees`／`passed`／`pass_rate`／`exam_year` 对磁盘快照的印刷原值），结论 **零问题**；脚本 `var/audit-approved-unified.mjs` 用完已删。这条与第七轮那条「批前体检」不是同一件事：批前查的是不变量（`applicants ≥ examinees ≥ passed`、`pass_rate` 自洽），本轮查的是**库里值与官方印刷值是否逐字一致**。
- 复核脚本自己的三个坑（都不是数据问题，记下来省一轮）：① `normalized_value` 是 jsonb，`::text` 取出来带引号（`"16663"`）⇒ 会假报 776 条不一致，要交给驱动解析；② `display_value` 带千分位与「名」（`16,663名`）⇒ 裸 `includes("16663")` 必漏，要先抽数字串；③ **平成年号**：回合括号 `124（Ｈ22.2.28）` 里的两位年要按平成换算（Ｈ22＝**2010**），按 20xx 直读会把库里正确的 `exam_year=2010` 误判成 2022——第一版就是这样误报了 4 条。
- 文档侧改动：`docs/transition-handoff.md` 文头 main SHA `32c4b84` → `727ffb9`；§2 交付表补 `#31` 行；§3 末段记「第九轮逐字复跑，全部未动」；§4 待办 5 改成「已闭合，但**每轮必欠一次**」。⚠ **纠正一条写错的口径**：原文写「`candidate_facts` 与 `facts` 的状态列叫 `status`、合成标记叫 `synthetic`」，实测 **`facts` 表没有 `synthetic` 列**（`select count(*) from facts where synthetic=false` ⇒ `column "synthetic" does not exist`）⇒ 数「非合成现行事实」必须走 `facts f → fact_revisions fr(fr.id=f.current_revision_id) → candidate_facts c → snapshots s / sources src` 且 `f/fr/c` 三个 `status` 全 `approved` 加 `c.synthetic=false`，判据 SQL 坐标 `scripts/verify-lib.mjs:154-177`；另记 `reviews.decision` 是 text 而非枚举。`README.md` 交接单指针的时点同批。
- 本轮现取复跑（纯文档，零写库）：`facts` approved 非合成 **981**（簿记 863＋其余五格 16／15／2／10／75）、`candidate_facts` **1075 approved ＋ 13 rejected ＋ 0 pending_review**、`reviews` **1006**（approve 983／reject 18／requeue 5）、`snapshots` **44**（全部非合成）、`sources` 47（`qualification_id` NULL 0）、`schema_migrations` 20、`source_scopes` 0、`candidate_facts.exam_session` 列存在。预检 `stored=903 computed=865 skipped_approved=865 would_stage=0 blocking=0` **EXIT=0**。`npm run verify:all` ⇒ `"status": "passed"`、**6 passed／0 failed**、EXIT=0（簿记 `approved_official 863`、`api.facts 863`、五个公开页 200、`coverageGaps: []`）。`npm run format:check` EXIT=0、pytest **158 passed**。库侧一个字节没动。
- 下一步（各需单独授权）：① 把 863 条统一表历史统计接到公开面与判级面——属产品决策先议；⚠ 取证一条：`statistics_methodology` 在展示层**零消费点**，`apps/web/src/render.ts` 的 `pass-rate` 页 `factKeyPrefixes` 只有 `pass_rate`／`passing_standard`／`pass_mark`／`applicants`／`examinees`／`passed`；② 宅建统计页多来源重构（`snapshot_from_html()` 的快照 id 钉在单条 `TAKKEN_SOURCE` 上，那页只能抓不能入库）；③ 基本情報 `toukei_fe.html` 是附件目录页，要「附件提取」授权并先定 PDF／xlsx 依赖。

## 2026-10-13（同日第八轮）：#30 合并读数落账，删掉 10 条已合并分支（交接单原记 9 条，漏计一条），补齐交接单 SHA 与待办（零抓取／零入库／零批准／零写库）

- 触发：号主点「执行候选第一项」，一次授权含两件事＝**文档同步到 `32c4b84` 时点走 PR**＋**删已合并分支**。轮前现取：main＝origin/main＝`32c4b84`，`git rev-list --merges --count main` **0**，工作区只剩 `?? Python/`。
- **#30 的 CI 实测读数**（从 `gh run view --job=115046050260 --log` 取，不是推算）：`release-gate` **pass／1m16s**；夹具三步全绿＝`ci:fixture:verify` 输出 `Sanitized CI fixture structure verified.` → `db:migrate`＋`db:seed` → `ci:fixture:restore`（981 条事实／29 条快照灌进 CI 空库）；门禁 `"status": "passed"`、`qualifications: 6`、`passed: 6`、`failed: 0`，六格 `approved_official` **16／15／2／10／863／75**（合计 **981**＝`facts` 总数）、六格 `pending_official` **全 0**。关键一条：CI **没有**红在 `approved official 58 below regression floor 863` ⇒ 「baseline 与夹具必须同批进同一个 PR」由实跑坐实，上一轮那条静态判据（夹具 23 条 `source_id` 全部由迁移登记）降级为备份结论。合并后 main 的 push run `38320357386` 同样 **success**。
- 删分支前的取证是**三重**的，因为 squash 合并把常用判据全废了：`git branch -d` 必报 `not fully merged`，`git cherry`／patch-id 也不可比（squash 把多条提交压成一条，`git rev-list --count main <branch>` 恒为 **1** 属设计内现象，**不能**当「未合并」的证据）。改用：① `gh pr list --state merged --head <branch>` 拿 PR 号／`mergedAt`／`mergeCommit`／`headRefOid`；② 核 `headRefOid == origin/<branch> tip == 本地 tip`，即合并后没有新推上去的提交；③ `git diff --diff-filter=A --name-only main <branch>` 计数 **0**，即分支上不存在 main 里没有的文件。三条全过的分支才删。
- 实删 **10 条**（不是交接单原来记的 9 条——那条清单漏了 `docs-wpf-round5-ingest-record`＝PR #29 的分支）：`wp-f2-bookkeeping-history-capture`(#21)／`wp-f-bookkeeping-statistics-mapping`(#22)／`wp-f-bookkeeping-precheck`(#23)／`wp-f-statistics-source-registration`(#24)／`docs-stage-log-wpf-round3-delivery`(#25)／`wp-f-precheck-breakdown`(#26)／`docs-transition-handoff`(#27)／`docs-wpf-round4-delivery`(#28)／`docs-wpf-round5-ingest-record`(#29)／`bookkeeping-approval-round7-baseline-fixture`(#30)。每条都对应一个已 MERGED 的 squash PR，`headRefOid` 与两侧 tip 逐条相等，`only_in_branch` 全为 0 ⇒ 零丢失。动作＝`git branch -D` ×10 ＋ `git push origin --delete` ×10 ＋ `git remote prune origin`；末态本地只剩 `* main`，`git ls-remote --heads origin | wc -l` = **1**。
- 文档侧补齐：`docs/transition-handoff.md` 的 main SHA、§2 交付表、§4 待办顺序（删分支一项转已闭合，并把「9 条」改成实际的 10 条）；README 指针同步到本轮时点。簿记第七轮交付段里「分支与 PR 号见本段的合并结果」这种占位写法也换成了实数的 PR 号与 SHA。
- 本轮**零抓取、零入库、零批准、零迁移、零判级面改动**，库侧一个字节没动（`facts` 仍 981、非合成 pending 仍 0、`reviews` 仍 1006）；改动全是文档。`services/collector/uv.lock` 若被 `uv run` 生成则提交前删。
- 下一步（各需单独授权）：① 把 863 条统一表历史统计接到公开面——`approved_official` 已够判级，但要动 `config/data-coverage-contract.json` 或展示契约，属产品决策，先议再动；② 宅建统计页多来源重构（`snapshot_from_html()` 的快照 id 钉在单条 `TAKKEN_SOURCE` 上，那页只能抓不能入库）；③ 基本情報 `toukei_fe.html` 是附件目录页，要「附件提取」授权并先定 PDF／xlsx 依赖。

## 2026-10-13：按号主第五次授权分批批准統一表 772 条，`facts` 209 → 981、非合成 `pending_review` 归 0，门禁自行恢复 6/6；baseline 与 CI 夹具同批改到 981 口径（零抓取、零入库）

- 触发：号主把「批准統一 772 条」写进接续交接单，并在本轮三次拍板——分批口径选**按級切三档先验通道**、ネット那两条 `statistics_methodology` 槽选**维持页首引言为 current**、收尾范围选**批准＋`baseline:update`＋docs 走 PR**。轮前现取：预检 `stored=903 computed=865 skipped_approved=93 would_stage=772 blocking=3`、EXIT=1；`verify:all` blocked／5 passed 1 failed／EXIT=1，唯一失败项 `official pending 772 != 0`；库侧 `facts` 非合成 approved **209**、非合成 `pending_review` **772**、`reviews` **234**、`snapshots` **44**。
- 批前只做了一件实质取证：**按九维身份键（`qualification, provider, exam_level, component, delivery, payment, session, year, fact_key`）实测碰撞面**——`pending` 与已批准事实同槽 **0 命中**、`pending` 内部同槽 **无组** ⇒ 判「批完 772 条会产 772 条新 `facts`，209 + 772 = 981」是可验证的结论而不是猜测。另对 772 条做只读体检：`applicants ≥ examinees ≥ passed`、`pass_rate` 与 `passed/examinees` 自洽（101 期 1,533/13,672＝11.2％ ✓）、`normalized_value`／`display_value`／`evidence_text` 零空值、背后只有 **3 个快照**且全部带 `content_hash`。
- 批准实跑（`ADMIN_REVIEWER_ID=local-data-reviewer` ＋ `x-reviewer-id` 头 ＋ `POST /internal/reviews/{id}`，逐条 `decision=approve`）：**class1 196 条**（49 段原文 × 4 字段）⇒ `facts` 209 → **405**、非合成 pending 772 → 576、`reviews` 234 → 430，HTTP 200 ×196／失败 0；**class2 288 条**（72 段）⇒ 405 → **693**、pending 288、`reviews` 718；**class3 288 条**（72 段）⇒ 693 → **981**、pending **0**、`reviews` **1006**。**每一档 `facts` 增量都恰等于该档候选条数**（196／288／288）⇒ 全程零同槽覆盖，与批前取证一致。`reject` 0 条（预期：值全部来自已哈希校验的官方快照，且未成文的分母一条都没推断）。
- 终态读数（全部现取）：`facts` 非合成 approved **981**；`candidate_facts` **1075 approved ＋ 13 rejected ＋ 0 pending**；`reviews` **1006**（approve 983／reject 18／requeue 5）；`snapshots` **44**（批准不动快照）。预检从 `would_stage=772 blocking=3` 经 `289/576/2`（class1 后）走到 **`stored=903 computed=865 skipped_approved=865 would_stage=0 blocking=0`、EXIT=0**。`npm run verify:all` **`"status": "passed"`、6 passed／0 failed、EXIT=0**，簿记格 `approved_official` 91 → **863**、`pending_official: 0`、`api.facts 863`、五个公开页 **200**、`coverageGaps: []`；其余五格 `approved_official` 16／15／2／10／75 不变 ⇒ 六格合计 **981**＝`facts` 总数。
- **交接单 §3(a) 的预检读法被本轮四次读数坐实**：`skipped_approved`／`would_stage`／`blocking` 三列随批准进度**逐级下降**（93/772/3 → 289/576/2 → 865/0/0），`blocking` 每降一档就是「该来源批完」的指纹（class1 批完 ⇒ 它的 `id_collision` 消失），可直接当进度判据用；旧文「入队后仍报 807」只对仍 pending 的行成立。已把这条写进 `docs/bookkeeping-source-contract.md`。
- 产品决策落地：ネット两条 `statistics_methodology` 槽（`bookkeeping:2|3`／`delivery_mode=network`／`exam_year=2026`）**维持页首引言为 current**，不翻转、不改维度。取证坐标现取：current＝引言那条候选 `…:statistics_methodology:98f76b0bbf3f`，被顶掉的列头那条 `…:statistics_methodology:1630ebd87ec8` 仍是 `approved` 但非 current，且 `facts.id` 挂的是**列头**那条的 candidate id（名实不符）——这条机制（同槽后批者赢、`facts.id` 不随之换）已写进 `docs/data-gate-semantics.md` §6，比交接单的口头结论更可核。
- **批准之后才能做的两件写盘动作**：`npm run baseline:update`（需 `--confirm=UPDATE_RELEASE_GATE_BASELINE` ＋ 同名环境变量双重确认）⇒ `config/release-gate-baseline.json` 的 bookkeeping `expectedFacts` **58 → 863**，其余五格不变；`npm run ci:fixture:export`（同样双重确认，且它会在仍有非合成 pending 时直接拒绝）⇒ `fixtures/ci/approved-facts.sql` 从 176/176/176/25 变为 **981/981/981/29**（逐资格 16／15／2／10／863／75），文件 437,867 → 2,163,170 字节。⚠ 顺序不可颠倒也不是巧合：`scripts/verify-lib.mjs:215` 把 baseline 当**回归下限**用（`approved_official < expectedFacts` 即失败），而 CI 跑的是夹具空库——**只刷 baseline 不重导夹具会让 CI 红在 `approved official 58 below regression floor 863`**，故两者必须同批进同一个 PR。夹具侧另改了 `scripts/verify-ci-fixture.mjs` 第 9–12 行的四个硬编码计数（176/176/176/25 → 981/981/981/29），`node scripts/verify-ci-fixture.mjs` **EXIT=0**。
- CI 空库能落地夹具的取证（本机建复刻库被自动模式拦，见末条）：夹具里被引用的 **23 条 `source_id` 全部由迁移登记**（比对 `packages/db/migrations/*.sql` 抽出的 51 条 id，缺失 **0**）⇒ CI 侧 `db:migrate`＋`db:seed` 之后外键必成立；夹具禁止项断言（无 `INSERT INTO reviews`、无本地路径、无 `synthetic=true` 行）同条命令覆盖。
- 回归读数（本机 Git Bash **无 `pnpm`**，故逐段跑 `npm run` 等价命令）：`format:check` **EXIT=0**、`typecheck` 0、`vitest` 0、`test:verify-gate` 0、`build` 0、`verify:all` **0（6/6）**、`PYTHONIOENCODING=utf-8 uv run --project services/collector python -m pytest services/collector/tests services/parser/tests` **158 passed**。**`lint` 段本机 EXIT=1，但两条错误全部来自根目录未跟踪的 `Python/pythoncore-3.15-*.deleteme/Lib/profiling/.../flamegraph.js`（`eslint .` 把它扫进去了）**——`git diff main <改动文件>` 单跑 `npx eslint scripts/verify-ci-fixture.mjs` **EXIT=0**，且 CI 的 checkout 不含 `Python/` ⇒ 属本机环境噪声，不是本轮引入的缺陷；`Python/` 依铁律**不提交也不删**。
- 三次自动模式拦停的实测（都记下来省下一轮试错）：`npm run baseline:update` 被连拦两次（判它改 git 跟踪的门禁配置），要号主对该条命令**再确认一次**才放行；`docker compose exec -T postgres psql ... CREATE DATABASE ci_replica_r9` 被拦（基础设施变更），故本机 CI 复刻库这条路**走不通**，改用上面的「夹具来源全集比对」替代；沿用既有口径——`gh auth git-credential get` 探测与 `for` 循环 curl 一律不写。本轮按号主长期指令把多步逻辑落成 `var/` 下脚本（`approve-batch.mjs`、`counts-r7.mjs`、`sanity-r8.mjs`、`fixture-source-check.mjs`）跑完即删。
- 交付段（号主已授权 commit／push／squash merge）：PR **#30** ⇒ squash 合并点 main **`32c4b84`**（`mergedAt=2026-10-12T23:06:14Z`），改动八个文件＝`config/release-gate-baseline.json`、`fixtures/ci/approved-facts.sql`（176→981 条，437,867→2,163,170 字节）、`scripts/verify-ci-fixture.mjs`、本文件＋`docs/data-gate-semantics.md`＋`docs/bookkeeping-source-contract.md`＋`docs/transition-handoff.md`＋`README.md`。库侧改动只在 `facts`／`fact_revisions`／`reviews`／`change_events` 四张表（981 条批准链），**零抓取、零入库、零迁移、零判级面改动**；`services/collector/uv.lock` 由 `uv run` 生成，提交前删。
- 下一步（各需单独授权）：① 删已合并的 9 个工作分支；② 宅建统计页多来源重构（`snapshot_from_html()` 的 id 钉在单条 `TAKKEN_SOURCE` 上，那页只能抓不能入库）；③ 基本情報 `toukei_fe.html` 是附件目录页，要「附件提取」授权并先定 PDF／xlsx 依赖；④ 若要给统一表补可视化页，`approved_official` 863 已是可判级的量，但判级面改动属产品决策。

## 2026-10-12（同日第六轮）：按号主第四次授权批准 35 条（ネット 28＋口径 7 只产 5），并挖出批准机制的三条硬事实（零抓取、零入库、零 commit）

- 本轮是**第三次独立授权＝逐条批准**的首段：号主授权 35 条 ⇒ `facts` approved **176 → 204 → 209**、簿记 `approved_official` **58 → 86 → 91**、`reviews` 合计 **234**，`reject` 0 条。第一批＝**ネット数值 28 条**（14 行原文 × `passed`＋`pass_rate`，2 級／3 級各 7 期，2020–2026）；第二批＝**`statistics_methodology` 7 条**（规则型口径，不推断分母）。轮末本机门禁仍按设计红（非合成 pending **772**，全部是統一表数值序列＝193 段不同原文 × 4 字段），`verify:all` blocked／5 passed 1 failed／EXIT=1。
- ⚠ **第二批 7 条只产 5 条 `facts`，根因是批准的同槽覆盖语义**，本轮从 `apps/admin/src/server.ts:131` 读代码坐实并写成三条既有文档都没记的事实：① **幂等**——`reviews.id=review:{candidate}:{decision}`、`fact_revisions.idempotency_key=approve:{candidate}`、`change_events.id=change:{candidate}` 全是 `ON CONFLICT DO NOTHING` ＋ 单事务 `FOR UPDATE` ⇒ curl／循环重跑无副作用；② **approve 不可回滚**——`requeue` 只接受 `status='rejected'`，`/internal/retractions/` 要求当前事实的快照 `object_key LIKE 'ci://%'`（本机这批不是）⇒ 批错没有撤销接口；③ **同维度静默覆盖**——approve 先按九维身份键查既有事实，命中就 `UPDATE facts SET current_revision_id=新修订` ⇒ **一个槽只留一条值，后批者赢**，被顶掉那条的 `fact_revisions`／`reviews` 记录仍完整可追溯。
- 本轮登记的另两条读法（下一轮若不当场验证极易读错）：**审核量按人眼算是「不同 `evidence_text` 行数」而不是候选条数**（統一表每行拆 4 条候选共享同一段原文，全批 807 条实际只有 210 段＝統一 193 ＋ ネット 14 ＋ 口径 3）；**预检的 `would_stage` 不是死数**——批准会按 `value_key` 计入 `skipped_approved` 而把它扣下去，`blocking` 也随来源批完而下降（本轮 4 → 3）。交接单旧文「入队后仍报 807」只对仍 pending 的行成立。
- 遗留的产品决策（**已于 2026-10-13 拍板＝维持页首引言为 current**）：ネット那两条槽该留「列头（`期間/受験者数/合格者数/合格率`）」还是「页首引言（`2020年12月に開始した…`）」；两条共存需要改身份维度或拆 `fact_key`（`collector` 代码＋判级面），另需授权。
- 交付段（补第五轮欠账）：第五轮那段（807 条候选按授权完成入库＋门禁转红）随 **PR #29** squash 合并 ⇒ **main＝origin/main＝`203d06e`**（3 文件 32 增／8 删：`docs/bookkeeping-source-contract.md`＋`docs/stage-log.md`＋`docs/transition-handoff.md`），`git rev-list --merges --count main` 仍 **0**。本轮自身**零 commit**（只写库），故 main SHA 未变，本段与上一段同批随下一个 PR 进档。

## 2026-10-12（同日第五轮）：#28 合并进 main，另一窗口按号主授权执行真入库 807 条，本机门禁按设计转红（零抓取、零批准）

- 触发分两段。前半段是上一轮遗留：号主回「1」⇒ 一个 docs PR 同时清三笔（第四轮 stage-log 交付段＋交接单 §2 表补 #26/#27＋§3 分支与 main SHA 同步）⇒ **PR #28 按明示授权 squash 合并**。后半段是本现取读数发现的**状态变化**：本机 807 条候选**已经入队**了，而执行方不是本会话。⇒ 本节的任务是**如实登记这件事并给出取证链**，不是重做入库。
- **取证（谁写的库）**：本会话 18:35–18:39 只跑过只读命令（`--breakdown` 预检、`format:check`、`gh pr create`），从未执行 `ingest_bookkeeping`；本地与远端分支 SHA 逐条一致、main 顶部仍是 `eac1584` ⇒ 无代码侧写入。写入来自**另一个 Qoder 窗口**（会话标题「交接：jp_qualification_media（工作包 F 入库／批准轮待启）」，cwd 同本仓库）：号主在该窗口于 **2026-10-12T10:36:41Z（本地 18:36:41）** 给出「真入库 807 条」这句授权，该窗口随后确认守卫（`BOOKKEEPING_LOCAL_WRITE=1`＋非 `NODE_ENV=production`＋`DATABASE_URL` 主机 localhost）并跑 `python -m collector.ingest_bookkeeping`，**EXIT=0**，逐来源回 `candidates=197/289/289/32`、八条既有来源 `candidates=0 skipped_approved=9/25/6/5/6/1/3/3`、`approval: not_run`。库内 `candidate_facts.created_at` 插入窗 **10:38:24–10:38:40 UTC（本地 18:38）** 与之吻合。⇒ **三次独立授权链的第二次（候选入库）已由号主行使**；第一次（抓取）与第三次（逐条批准）分别在前几轮与「尚未发生」。
- **本轮现取的三态读数**：① 采集＝磁盘上簿记 7 页**一个字节没重抓**（`var/official-snapshots/` 目录 mtime 仍是当日 08:52），但 `snapshots` 表 **40 → 44**（入队时给四个统计页各登记一行快照，指向既有磁盘哈希）；② 入库＝非合成 `pending_review` **0 → 807**（`class2` 289／`class3` 289／`class1` 197／`class23-net` 32，全部 `risk_level=high`，全部挂 `qualification:bookkeeping`，`candidate_facts` 合计 1088＝268 approved＋13 rejected＋807 pending）；③ 批准＝**0 条**，`facts` approved **仍 176**、`sources` 仍 **47**（NULL 0）、`schema_migrations` **20**、`source_scopes` **0** ⇒ **公开面零变化**。
- 门禁红法（设计内中间态，不是新故障）：`npm run verify:all` ⇒ `"status": "blocked"`、**5 passed／1 failed**、**EXIT=1**，唯一失败项是 `bookkeeping: ["official pending 807 != 0"]`，该格同屏读数 `pending_synthetic: 0`／`approved_official: 58`／`coverageGaps: []`、`api.facts 58`、`/shikaku/bookkeeping/` 五个页 **200**；其余五个资格 `pending_official: 0` 全绿。⇒ 红的是**审核量**，不是覆盖缺口也不是发布判级。CI 不受本机 pending 影响（`release-gate` 跑 `fixtures/ci/approved-facts.sql` 空库夹具），所以 PR 链路照常绿。
- 预检读数同向变化：`collector.precheck_bookkeeping` 从第四轮的 `stored=96 … would_stage=807 blocking=0`、EXIT=0 变为 **`summary: stored=903 computed=865 skipped_approved=58 would_stage=807 blocking=4`、EXIT=1**，四条阻塞全是 `id_collision`（计算出的候选 id 已在库中）⇒ 语义上是**「这批已入队」的回执**，不是新障碍。⚠ 这里暴露一个**既有口径缺口**：`would_stage` 只扣写入侧「值与维度都与已批准事实相同则跳过」的保护，**不扣同 id 的 pending 行**，所以入队后仍报 807；要不要让预检区分「未入队／已入队待批」属代码改动，需号主单独授权。
- 两个本轮踩到并要长期记住的判据坑：① **`npm run verify:all 2>&1 | tail -30` 之后取 `$?` 拿到的是 `tail` 的退出码**，我第一次就据此把 EXIT=1 读成了 0 ⇒ 判退出码要么先重定向到文件再 `echo $?`，要么用 `${PIPESTATUS[0]}`。② `candidate_facts` 的状态列叫 **`status`**、合成标记叫 **`synthetic`**（不是 `review_status`／`is_synthetic`）；`facts` 同样用 `status`。查库脚本写错列名会得到 `column "review_status" does not exist` 而不是「0 条」。
- 文档就地更新（同批进本 PR）：`docs/transition-handoff.md` 文头 main SHA 改 `eac1584`、§2 表补 #28 行、§3 改写为「已入队」后的现态（含 `snapshots` 44 与非合成 pending 807）、§4 待办 1 标记**已按授权执行**并把「逐条批准」提为下一步、待办 4 的分支清单 7 → 8、§5 补 `blocking=4 id_collision` 的读法与 `would_stage` 口径缺口。
- 交付：分支 `docs-wpf-round4-delivery`＝`303dd28`（2 文件 15 增／3 删）⇒ **PR #28 squash 合并 ⇒ main＝origin/main＝`eac1584`**。两次独立佐证：PR 上 `release-gate` **success**（run `38237567207`，pass 50s，空库日志 `Applied 0017…`＋`Applied 0018…`＋`bound 45 sources`＋`"passed": 6, "failed": 0`）、合并后 main push 的 run **`38240043728` success**。`git rev-list --merges --count main` 仍 **0**。八个 `wp-f*`／docs 分支加 main 共 9 条 ref，本地与远端 SHA 逐条一致、**全部保留**（删分支从未被授权）。本轮自身零代码改动，pytest 基线仍是上一轮现取的 **158 passed**。
- 本轮自身的 stage-log 交付段按惯例仍**欠**，随下一个 PR 提交；下一个动作是**第四次授权＝逐条批准 807 条**，`--breakdown` 已证明无可自动放行的 `low`／`medium` 子集，建议先议分批口径（按来源／年度切，或先只批 1 級 unified 那 197 条）。

## 2026-10-12（同日第四轮）：把待入队候选的审核量分解固化成常驻命令，并立接续开发交接单（零抓取、零入库、零批准）

- 触发：号主要「跑一下预演看看分布情况」，看到分布后依次授权「把这份分解固化成可复跑命令」⇒「提交并开 PR」⇒「squash 合并 PR #26」；随后又授权「为下一项任务写一段简洁交接文案」⇒「落成 `docs/transition-handoff.md` 并开 PR」⇒「squash 合并 PR #27」。本轮**没有**抓取、**没有**入库、**没有**批准；轮末现取的三态读数与第三轮逐项相同：`facts` approved **176**／`candidate_facts` **268 approved ＋ 13 rejected ＋ 0 pending_review**（非合成 pending 仍 **0**）／`snapshots` **40**／`sources` **47**（`qualification_id` NULL **0**）／`schema_migrations` **20**／`source_scopes` **0**。
- 预演本身是纯只读的（只用假游标侧的 `approved_keys` 做一次 `SELECT`），第一次跑靠一次性脚本 `var/breakdown_bookkeeping_candidates.py`，出数后即删——这正是号主长期口径「重要判据要固化成可复跑命令，不交临时脚本」要防的形态，所以本轮把它搬进常驻命令面。**807 条待入队候选的实跑分布**（与预检 `would_stage` 逐字相符）：来源 `class2` 289／`class3` 289／`class1` 197／`class23-net` 32；級别与方式 2 級 unified 289（2002–2026、25 年、72 回合）＝3 級 unified 289（同）、1 級 unified 197（49 回合）、2 級 network 16＝3 級 network 16（2020–2026、7 年、`sessions=0`）；字段 `pass_rate` 207／`passed` 207／`applicants` 193／`examinees` 193／`statistics_methodology` 7；值类型 integer 593／decimal 207／text 7；**风险级 `high` 807＝全部**。
- 实现（`services/collector/src/collector/precheck_bookkeeping.py`）：同一条只读预检加 `--breakdown`，聚合对象是各来源的 `fresh` 行集合（**已扣掉写入侧「值与维度都与已批准事实相同则跳过」的保护**），所以 `breakdown.total` 恒等于 `summary` 的 `would_stage`，本轮把这条不变量写进用例钉住。`planned_rows()` 的返回值从裸去重键元组改为 `PlannedRow`（`dedup_key` ＋ 候选的 `fact_key`／`exam_level_id`／`delivery_mode`／`exam_session`／`exam_year`／`value_type`／`risk_level`），**候选 id 与去重键仍只有写入侧那一个算法**，预检＝真入库结果的等价性不变；无法识别的参数退 2 并打印用法（`--broked` 不会再被当成「跑过了但没数」）。
- 本轮回归读数（全部现取）：`--breakdown` ⇒ `summary: stored=96 computed=865 skipped_approved=58 would_stage=807 blocking=0`、**EXIT=0**（不带参数同读数；带坏参数 EXIT=2）；`pytest services/collector/tests services/parser/tests` **155 → 158 通过**（`test_bookkeeping_precheck.py` 加 3 条，仍全用假游标不连库）；`npm run verify:all` **EXIT=0、6/6**、`coverageGaps: []`、簿记 `approved_official=58`／FP 75；`npm run format:check` 全绿。合并后在 main 上复跑 `--breakdown` 与 pytest，读数同上（**158 passed**）。
- 两个可直接用于批准轮决策的读数：① **审核量是 807 条全量**，没有 `low`／`medium` 子集可自动放行，且这四条统计来源的 `skipped_approved` 为 0 ⇒ 一条都不会被去重跳过；② **ネット的 32 条只产 `passed`＋`pass_rate`**（按已拍板口径，裸「受験者数」不映射），`sessions=0` 是「ネット按期間行、无回合维度」的指纹，真正的历年数值序列是统一考试那 **765** 条。另注：fixture 里 net 页的 `statistics_methodology` 头行取 `DEFAULT_EXAM_YEAR`，所以按級别看年份时 3 級是 `{2025, 2026}` 而非只有数据年——这是实现事实不是数据问题。
- 新增 `docs/transition-handoff.md`（103 行／8 节）＋ README「阶段记录」行加一行指针：把铁律、PR #21→#27 已闭合链、本机库现态、待办顺序（真入库→逐条批准→docs 欠账→删分支→宅建多来源与 FE 附件两条旧债）、可复跑判据命令、GitHub 通路集中在一份时点快照里，文头第一句即要求下一轮重取所有数字；**它刻意不复制口径正文**，权威定义仍指向 `docs/data-gate-semantics.md` 与逐资格契约，以免两处漂移。文中每条事实性断言落地前都回读了源码（`scripts/verify-lib.mjs:62` 的 `post_event`／`optional`／`not_applicable` 跳过、`apps/admin/src/server.ts:386` 的 `POST /internal/reviews/` ＋ `x-reviewer-id`、`docker-compose.yml` 的 `postgres:16-alpine` 服务名、`docs/work-package-f-statistics-sources.md` §2 的 27 条候选 URL）。
- 交付：**PR #26**（分支 `wp-f-precheck-breakdown`＝`610950c`，3 文件 197 增／26 删）squash ⇒ **main＝`fa42e90`**；**PR #27**（分支 `docs-transition-handoff`＝`543c68e`，2 文件 104 增／1 删）squash ⇒ **main＝origin/main＝`a193e69`**。四次独立佐证均为 `release-gate` **success**：PR #26 的 run `38227432178`（python 158／Vitest 81／`"passed": 6, "failed": 0`／空库日志 `Applied 0017…`＋`Applied 0018…`＋`bound 45 sources`）、其合并后 main push 的 run `38230136927`、PR #27 的 run `38231074181`、其合并后 main push 的 run `38236962108`。`git rev-list --merges --count main` 仍 **0**（线性历史保持）。七个 `wp-f*`／docs 分支本地与远端**全部保留**，删分支从未被授权。**两次合并都与入库无关**：807 条候选至今一条未入，`facts` 仍 176。
- 本轮自身的 stage-log 交付段按本项目惯例（main 每个 commit 标题都带 `(#NN)`＝全部经 PR 进来，不直接 push main）仍**欠着**，随下一个 PR 提交；同批要一并更新的是 `docs/transition-handoff.md` §2 的 PR 表（尚未含 #26／#27 自己）与 §3 的分支清单及 main SHA（现应为 `a193e69`、七个分支）。

## 2026-10-12（同日第三轮）：补齐统计来源登记迁移并应用 0017，写库前预检转为零阻塞（零抓取、零入库、零批准）

- 触发：号主对上一轮报的三条下一步给了明确授权——**步骤 1 且带上另外三条 evidence-only 来源**、步骤 2（文档判据口径）、步骤 3（本机 `db:migrate`）。本轮**没有**抓取、**没有**入库、**没有**批准，`facts`／`candidate_facts`／`snapshots` 三态计数逐项与轮前相同（176／268＋13／40，非合成 `pending_review` 仍 0）。
- 新增 `packages/db/migrations/0018_bookkeeping_statistics_sources.sql`：照 `0015` 先例 `INSERT INTO sources … ON CONFLICT (id) DO NOTHING`，`institution:jcci`（已在库）＋`www.kentei.ne.jp`＋`source_type='official_statistics'`，URL 逐字取自 `bookkeeping.BOOKKEEPING_SOURCES` 常量（含 `class2`／`class3` 的 `bookkeeping_contents` 旧段与 `costing` 的官方 `ca-date` 拼写）。七条＝四条可入库序列 `class1`／`class2`／`class3`／`class23-net`，加号主本轮点名要带的三条 evidence-only：父页 `candidate-data`、`class4`（簿記初級＋已废止 4 級）、`costing`（原価計算初級）。带后三条的唯一理由是 `snapshots.source_id` 是**全表共用**外键，将来给它们存证会撞同一个坑；它们不在 `INGEST_SOURCES` 的 12 条里，本轮行为零变化。
- 登记前先排掉三个风险（全部只读取证）：① 七条 URL 与既有 `sources.canonical_url` 零冲突（该列 NOT NULL UNIQUE）；② `source_scopes` 全表 **0 行**，登记不需要配套 scope 行；③ 无计数断言会被打破——`fixtures/ci/approved-facts.sql` 不含任何 `sources` INSERT，`scripts/verify-lib.mjs`／`update-release-baseline.mjs` 只按 `source_id` join，全仓**没有任何读取方按 `sources` 全表计数或过滤 `active`**（`active` 只被 `backfill-fp-provenance.mjs` 写过一次），故「active 但 CI 取不到快照」的三条在门禁／API／admin 上是惰性的。
- 本机执行：`npm run db:migrate` ⇒ `Applied 0017_exam_session_dimension.sql.` ＋ `Applied 0018_bookkeeping_statistics_sources.sql.`。库侧读数：`schema_migrations` 18 → **20**，`sources` 40 → **47**（其中 `official_statistics` 0 → **7**，`official_result_information` 仍 0），`exam_session` 列在 `candidate_facts` 与 `facts` 上均为 nullable。
- **交接口径的一处修正值得记住**：「`schema_migrations` 18 行 vs 迁移文件 19 个」这个判据本身是错的——目录里只有 **18** 个 `.sql`（git 跟踪同数），行数与文件数当时**相等**却仍缺 0017。根因是 `migrate.ts` 以**文件名**为主键、`readdir().sort()` 顺序执行且不校验记录，0010→0016 改名留下的孤儿记录 `0010_fp_annual_schedule_sources.sql` 恰好补上了缺 0017 的那一格。可靠判据是列存在性（`information_schema.columns` 查 `candidate_facts.exam_session`），已写进 `docs/bookkeeping-source-contract.md`；本文件下方两节（同日第二轮「阻塞项①」那条、同日第一轮的「交付」段括号注）里的原措辞保留作历史记录，以本节为准。
- 闭合后同一条只读预检的重跑读数：`summary: stored=96 computed=865 skipped_approved=58 would_stage=807 blocking=0`，**退出码 0**（轮前为 `blocking=5`／退出码 1）。四个统计来源逐项从 `unregistered_source` 变成 `stored=0 computed=197/289/289/32 would_stage=197/289/289/32`，`would_stage` 合计仍是 **807**；八个既有来源 `would_stage=0` 不变。**`blocking=0` 只代表「代码与库层面允许入队」，不是入库授权**；真入库一次产 807 条非合成 `pending_review` ⇒ 门禁 `pending_official != 0` 硬红，逐条批准另属第四次授权。
- 文档收口三处：`docs/bookkeeping-source-contract.md` 预检节改为「首次读数＋闭合后读数」两段并写死列存在性判据；`docs/work-package-f-statistics-sources.md` 在「这类来源从未登记过」的调研原文下加 2026-10-12 更新块（40 → 47、`official_statistics` 7 条，原文数字保留作当轮记录）；`docs/data-gate-semantics.md` §11 第 8 项的「本机 40／CI 38」补注 0018 给两侧各加 7 条 ⇒ 47／45，差值仍是那 2 条 fp capture-only，口径不变。
- 回归读数：`pytest services/collector/tests services/parser/tests` **155 通过**（本轮零代码改动，与轮前同数）；`npm run build` 通过；`npm run verify:all` **EXIT=0、6/6 通过**——这是 0017 落地后本机第一次跑通全链（前两轮因 `readApprovedFacts` SELECT `c.exam_session` 缺列而根本无法启动），FP 一节 `approved_official=75`、`coverageGaps: []`、五个公开页 200；`npm run format:check` 全绿。`services/collector/uv.lock` 由 `uv run` 重新生成，按既有口径提交前删除。
- **`db:seed` 已于同日按号主明示授权补跑，本机与 CI 同态**：既有口径是「迁移只登记来源、`qualification_id` 由 `seed.ts` 的 `UPDATE … WHERE qualification_id IS NULL` 绑定」，CI 的 `release-gate` 正是 `db:migrate` ⇒ `db:seed` 两步。跑前的只读预检把 NULL 清单列全＝**恰好那七行**（⚠ 该 `UPDATE` 覆盖全部 NULL 行而非仅新增行，所以每次跑 seed 前都要先取这份清单）；`npm run db:seed` ⇒ `Seeded 6 stable qualification records (no dynamic facts); bound 7 sources to their qualification.`。跑后读数：`sources` 仍 **47**、`qualification_id` NULL **7 → 0**、七行全绑 `qualification:bookkeeping`；数据面一字未动（`facts` approved 176／`candidate_facts` 268＋13／非合成 `pending_review` 0／`snapshots` 40／`schema_migrations` 20／`source_scopes` 0）。复跑只读预检仍 `blocking=0`、`would_stage=807`、EXIT=0，`npm run verify:all` 仍 **6/6、EXIT=0**。该字段不进采集／入库链（`ingest_bookkeeping` 的 `qualification_id` 来自候选侧），本机此前留 NULL 也不影响任何读取方 ⇒ 这一步是元数据完整性，不是功能前置。
- 交付：分支 `wp-f-statistics-source-registration`＝`154ce99`（5 文件 38 增／3 删：新迁移 `0018` ＋ 4 份文档）⇒ **PR #24 squash 合并，main＝origin/main＝`1c38a45`**（号主明示授权合并）。两次独立佐证：PR 上 `release-gate` **success**，空库日志实证 `Applied 0017_exam_session_dimension.sql.` ＋ `Applied 0018_bookkeeping_statistics_sources.sql.` ＋ seed 回 `bound 45 sources to their qualification.`（⇒ 来源数口径坐实为**本机 47／CI 空库 45**）＋门禁 `"passed": 6, "failed": 0`；合并后 main push 的 `release-gate` 亦 **success**。四个 `wp-f*` 分支本地与远端**全部保留**（删分支从未被授权）。**合并只让登记进 main，与入库无关**：807 条候选至今一条未入。

## 2026-10-12（同日第二轮）：写库前预检固化为可复跑命令，并收口三态口径措辞（零抓取、零写库）

- 触发：号主拆成两件事——**先把「入库／批准」的文档口径理顺**（`pending_review` 不得写成「已入库」），**再把写库前预检的判据落成可复跑脚本**而不是临时探针；并要求「先取判据读数再动手，别用记忆里的数字」。本轮全部产物是代码／文档／用例，**没有**执行 `db:migrate`、**没有**入库、**没有**抓取。
- 新模块 `services/collector/src/collector/precheck_bookkeeping.py`：只 `SELECT`，按 `INGEST_SOURCES` 的 12 个来源逐项回答「库能不能收、磁盘字节是不是报告那一代、离线重算的 id 与库里同一代是否相符」，退出码 0／1／2（有阻塞项＝1，可直接当真入库的前置门禁）。判据码、两条刻意口径与用法见 `docs/bookkeeping-source-contract.md` 的「写库前预检」节。它复用写入侧的同一套符号（`INGEST_SOURCES`／`candidate_id()`／`value_key()`／`approved_value_keys()`／`capture_record()`），所以预检读数与真入库结果之间不存在第二套算法。
- `ingest_bookkeeping.py` 的两处改动是为了让这个复用成立：`__main__` 里的文件名→来源映射提到模块级 `INGEST_SOURCES`，无年份候选的归属年份提成 `DEFAULT_EXAM_YEAR = 2026`（此前这两样在 `__main__` 内部，预检要么抄一份、要么 import 不到）。行为零变化。
- **两条此前没有任何文档记过的阻塞项，是脚本第一次真跑暴露的**（读数 `stored=96 computed=865 skipped_approved=58 would_stage=807 blocking=5`，退出码 1）：① `session_column_absent`——本机 `schema_migrations` 18 行 vs 迁移文件 19 个，0017 未 apply；② `unregistered_source` ×4——四条统计来源 `candidate-data-class1/class2/class3/class23-net` 只活在 collector 常量里，`sources` 表**一行都没有**，而 `snapshots.source_id`／`candidate_facts.source_id`／`source_checks.source_id`／`source_scopes.source_id` 全是外键 ⇒ 真入库会在写第一条快照行时撞 FK。这与 `0015_bookkeeping_gap_sources.sql` 那批不同：F-2 只授了采集，登记迁移从没建过。结论：**「要不要真入库」现在有了可执行的前置清单**——补 `sources` 登记迁移、apply 0017、接受 807 条非合成 `pending_review` 让门禁硬红、批准是第四次授权。
- 过程中修掉两个自己的判据错误（都值得记住）：① 第一版拿**全部**存量 id 比对照 ⇒ 5 个来源假报 `id_drift`（home 9/9、network 51/51、calendar-2026 18/18、class1-exam 4/5、class2-exam 5/6），根因是 `candidate_facts` 按设计累积历史代次，改为只比 `source_snapshot_id = snapshot:bookkeeping:{磁盘哈希}` 的当代行；② 第一版 `would_stage` 忽略写入侧的已批准跳过保护而虚高，补 `approved_keys()`（0017 未 apply 时按不含 `exam_session` 的旧式元组比较）后，8 个既有来源全量重跑 `would_stage=0`，与「幂等」这一事实对齐。
- 三态口径的文档收口（号主 directive 1）：`docs/data-gate-semantics.md` 新增 §8.1 词表——采集（不连库）／候选入库（`candidate_facts` 行 `pending_review`，**公开面为零**）／批准（`facts`，公开 API 可读、计入 baseline），并定表述硬规则（写「已入库 N 条」必须同句带 `pending_review` 与「未公开」；写「批准 N 条」必须写 `facts` 计数变化）。`docs/data-local-snapshot-audit-2026-09-07.md` 里 2026-09-11 两节据此改名：「本地待审核候选入库」→「本地候选入队（第二态：44 条 `pending_review`，未公开）」，「候选逐条审核结果」→「…（第三态：批准）」，并在正文写明那 39 条 `approve`／5 条 `reject` 才是写 `facts` 的一步，**「批准 44 条入库」这一合称不成立**（分属两次授权）。簿记那节的标题同样改为「第二态与第三态各一次独立授权」。
- 本机环境的一个新事实（不是本轮改动，但影响后续任何写库/读取判据）：PostgreSQL 与 MinIO 由 docker compose 起，容器 `jp_qualification_media-postgres-1` 本轮处于 `Exited (255) 3 hours ago`，所以第一次连库报 `ECONNREFUSED ::1:5432`——**不是凭据问题也不是网络问题**。`docker compose up -d postgres` 起回后所有读数即取得。
- 回归读数：`pytest services/collector/tests services/parser/tests` **150 ⇒ 155 通过**（新增 `test_bookkeeping_precheck.py` 5 条，全用假游标、不连库：旧式 id 形状、`unregistered_source` 阻塞、已批准值全跳过 ⇒ 只剩 `staged_delta` 且 `would_stage=0`、历史代次只报 info 而当代漂移阻塞、`hash_mismatch` 阻塞）。TypeScript 侧本轮未改，故未跑 build／Vitest／`verify:all`（且本机未 apply 0017 时 `verify:all` 本来就跑不起来，见上一节）。`services/collector/uv.lock` 被 `uv run` 重新生成，按既有口径提交前删除；`var/` 下的临时探针已清理。

## 2026-10-12：工作包 F 的 `exam_session` 身份维度与簿记统计页入库映射（零抓取、零写库、代码就绪）

- 触发：号主以「同意按你的建议执行」批准两条口径——**一 A**（新增 `exam_session` 身份维度）与**二 B＋C**（`statistics_methodology` 记列头原文一条＋ネット页 ※ 句一条），并授权合并 PR #21（squash ⇒ main `08e18f1`；本地与远端分支按规矩未删）。本轮全部产物是代码／迁移／文档／用例，**没有**执行 `db:migrate`、**没有**入库、**没有**抓取。
- A 的必要性有硬读数：0007／0009／0014 建起来的身份键只到 `exam_year`，而 2002–2026 的簿記統一序列里 **292 个 `(級, 方式, 年, 字段)` 键装着 2–3 条事实**（同一年最多 3 个回合，例如 173 回 2026.06.14 与 172 回 2026.02.22 同为 2026 年）。不补回合，批准第二条时会在 `facts_current_key_idx` 上静默串号或丢数据。
- **改前预检（本轮的写库前置，结果全部离线）**：`0017` 只加可空列、`candidate_id()` 在 `exam_session` 为 `None` 时走不含回合段的旧式分支，于是 `fixtures/ci/approved-facts.sql` 逐字节未动（sha256 仍 `9781080a…`）。按现存 8 个簿记快照重算：**凡当前文件字节就是某条已批准候选的那一代快照，9 条 id 全部逐字节复现、0 条不符**；其余 **49 条属更早的已批准代次**（同一来源在 fixture 里并存 `38c961bb…`／`5824a42e…`／`a1a9f4f0…` 等多代，是 `candidate_facts` 累计历史代次的既有设计），本轮改动不触碰它们。新生成的 **807 条统计候选 id 互不相同、且与既有 176 条零重叠**。
- B＋C 的落地方式：列头原文按 `回/受験者数 (申込者数)/実受験者数/合格者数/合格率` 与 `期間/受験者数/合格者数/合格率` 两种各记一条，ネット页另记「2020年12月に開始した…3方式いずれも出題範囲や問題の難易度は同じです」整句，按 2 級／3 級各一条。7 页全数**没有**成文的合格率分母口径，所以没有任何一条事实写算式；用例锁「方法说明里不得出现 ÷ ＝ ×100 で割る で除す」。
- 两处刻意的少产：① 主页 `candidate-data` 印的是同一批表的近年切片，入库会与子页重复计同一事实 ⇒ 不进出库入口，只作证据；② `data_class4`（簿記初級＋已废止 4 級）与 `ca-date`（原価計算初級）的級在契约里**没有统计 requirement** ⇒ 行照样解析但不产出候选，要出事实必须先动 `config/data-coverage-contract.json`（判级/契约改动，另行请示）。契约的 `dimensions` 本轮**没加** `examSession`：它是身份维度而非判级维度。
- 一条拒绝推断的口径值得单独记：ネット／初級表只有一个**裸「受験者数」**，既无 `(申込者数)` 注记也无 `実受験者数` 列，页面从未说明它数的是报名还是实际应考 ⇒ 不映射到 `applicants` 也不映射到 `examinees`，所以ネット行只出 `passed`＋`pass_rate`。若号主定了口径，改 `STATISTICS_COLUMNS` 一行即可。
- 解析陷阱实测四种（不止调研写的三种）：`155（2020.6.14）中止` 两格行既不入库也不报结构错；`data_class4` 一张 `<table>` 内混排「期間」4 列块与「回」5 列块（第二个表头行在第 11 行）；回合日期半角／全角／平年（`124（Ｈ22.2.28）`→2010）三种写法并存；`合格率` 半角 `%` 与全角 `％` 混用（1 級 49 期里约一半是全角）。前三种靠 NFKC＋去空白统一，解析不了的行报 `unparsed_statistics_row`，整次入库在发写之前中止。
- 一处新暴露的执行顺序约束：`services/api/src/public-facts.ts` 的 `readApprovedFacts` 现在 `SELECT c.exam_session`，因此**本机库必须先应用 `0017` 才能跑 API／admin**，`verify:all` 也随之只能在迁移后跑。本轮未跑 `verify:all`（它要求 `DATABASE_URL`），迁移的正确性交给 release-gate 的「空库 `db:migrate` ⇒ `ci:fixture:restore` ⇒ verify」链路验证。
- 回归读数：`pytest services/collector/tests services/parser/tests` **139 ⇒ 150 通过**（新增 `test_bookkeeping_statistics.py` 11 条，含中止行、混排块、年号与全角百分号、裸「受験者数」、id 旧式形状、同年多回合端到端可区分；`value_key` 加参数后 1 条既有用例同步）；Vitest **81 通过**、`test:verify-gate` 7 通过、`ci:fixture:verify` 通过、`npm run build` 通过、`npm run format:check` 全绿。`npm run lint` 仍有 1 条报错，来自未跟踪的本机解释器目录 `Python/`，与本轮改动无关（CI 无该目录）。`services/collector/uv.lock` 被 `uv run` 重新生成，未提交。
- **同日收尾的三项口径拍板（号主逐条选定，三项都是「维持现状」⇒ 零代码改动）**：① ネット／初級的裸「受験者数」**继续不映射**；② 簿記初級／4 級／原価計算初級**继续不进覆盖契约**；③ `pass_rate` **存官方印刷百分数原值**（转写不换算，百分号留在 `display_value`）。为①补做的反向证据（离线探针，用完即删，不入库）：統一页 193 行的印刷合格率 **193/193 与 `合格者数 ÷ 実受験者数` 吻合**（最大 0.055pp），与除以 `申込者数` 全不吻合；ネット页 14 行 `合格者数 ÷ 受験者数` 14/14 吻合（≤0.05pp）。即该列行为上是官方合格率的分母、字面却与統一页「受験者数 (申込者数)」同词，两个指向冲突且官方不成文——这正是号主选择继续不替它选的理由。逐页候选数复核为 **197／289／289／32＝807**，`class4`／`costing` 两页各 0 条并报 `structure_changed`。
- 交付：分支 `wp-f-bookkeeping-statistics-mapping`（`eb033a3`，15 文件 512 增／18 删）⇒ **PR #22 squash 合并，main＝`fcba8c4`**。CI 独立佐证迁移正确性：PR 上 `release-gate` **pass 1m1s**（空库 `db:migrate` 含 0017 ⇒ `ci:fixture:restore` ⇒ verify），合并后 main push 的 `release-gate` 亦 **success**。两个 `wp-f*` 分支本地与远端**均未删除**（删分支另行请示）。**本机库仍未 apply 0017**（`schema_migrations` 18 行 vs 迁移文件 19 个，属预期差），因此 `verify:all`／API／admin 在本机暂时跑不起来（`readApprovedFacts` 查询会因缺列直接报错）；入库与逐条批准各需单独授权。

## 2026-10-11：工作包 F 第一批的采集侧代码前置（零抓取、零写库、零联网）

- 动机与范围：授权单 `docs/work-package-f-live-capture-authorization.md` 的 §2／§3 记了三条「不做完采集就够不到目标页」的前置，本轮把它们落完。只动 `services/collector` 的采集侧与契约文档，**没有**建 `sources` 迁移、**没有**抓任何页、**没有**连数据库。
- 注册表读数（改动前后）：`FUNDAMENTAL_IT_SOURCES` **3 ⇒ 4**（新增 `source:fundamental-it:statistics-fe` → `https://www.ipa.go.jp/shiken/reports/toukei_fe.html`）、`BOOKKEEPING_SOURCES` **15 ⇒ 16**（新增 `source:bookkeeping:candidate-data` → `https://www.kentei.ne.jp/bookkeeping/candidate-data`，注册表里带的 `source_type` 写成 `official_statistics`，因为 `pass_rate` 的契约只认这一类）、`capture_takken.DIRECTLY_CITED_CAPTURE_SOURCES` **6 ⇒ 7**（新增 `capture-only:takken:statistics-overview` → `https://www.retio.or.jp/toukei/toukei/`）。三条来源的 `institution_id` 将来分别用库里已有的 `institution:ipa`／`institution:jcci`／`institution:retio`。
- **收紧形参补上了，而且补到命令行够得到的地方**：`capture_bookkeeping` 与 `capture_fundamental_it` 各加 `selected_capture_sources()`（照 `capture_fp` 的写法，`source_ids=None` 保持整表的例行语义）与 `requested_capture_source_ids()`（读 `<QUAL>_CAPTURE_SOURCE_IDS`，逗号分隔）。后者是必要的：光有形参的话 `python -m collector.capture_bookkeeping` 永远只能等于「重抓 16 条」，授权单写的「收紧」在执行时无法落实。未登记的 id 在建 fetcher 之前抛 `ValueError`，用例把 `SafeFetcher` 换成「一构造就 raise」的桩来证明真的没发请求。
- **宅建刻意没做多来源重构**：`TAKKEN_SOURCE` 被 `takken.py`／`capture_takken.py`／`ingest_takken.py` 三个模块引用十余处，且 `snapshot_from_html()` 把 `source_id` 钉死在它上面——重构会碰到承载已批准事实的入库链，代价与本批收益不匹配。改走仓库已有的 `capture-only:` 先例（FP 那两条就是同形），后果写进授权单 §1：**宅建这条本轮只能抓、不能入库**，要出事实得先在入库授权轮做多来源重构。
- 铁律 1 的护栏：新来源**没有**进任何 ingest 映射（两条 ingest 的 `__main__` 映射都是显式列文件名，不受注册表增长影响；`ingest_fundamental_it` 还要求 `FUNDAMENTAL_IT_SOURCE_ID` 显式指定）。`extract_candidates()` 对这两条统计页只会报 `structure_changed`、产 0 候选，各有一条新用例锁住——即使误传去入库也不会造出推断值。
- 顺手修的一处陈旧口径：`docs/fundamental-it-engineer-source-contract.md` 仍写着「`sources.qualification_id` 同样为 `NULL`（属工作包 G 收尾项）」，而该项已于本日由 seed 回填收口（本机 32→0、CI 38/38）；已改写为「由 `packages/db/src/seed.ts` 绑定、不写进迁移」。
- 回归读数：`pytest services/collector/tests services/parser/tests` **117 ⇒ 126 通过**（新增 9 条：两条收紧用例 ×2 模块、命令行范围来自环境变量 ×2、`structure_changed` 护栏 ×2、簿记 `source_type` 断言 1，另有 3 条既有用例的 id 集合断言同步 +1 与 1 条硬编码 `source_count == 3` 改为按注册表长度派生）；`npm run build` 通过、Vitest **81 通过**；`npm run format:check` 通过。`services/collector/uv.lock` 被 `uv run` 重新生成，已删除未提交。未跑 `verify:all`：本轮零库写入、零 `sources` 行变化，门禁输入不变。

## 2026-10-11：工作包 F 采集授权单草稿（零抓取、零写库、零联网）

- 动机与范围：把上一轮调研文档 §4 的建议切法推成一张**可签署的授权单草稿**，产物是新文档 `docs/work-package-f-live-capture-authorization.md`（状态：未签署、未执行），调研文档 §4 末条改为指向它并补上本轮实测的两条执行前事实。全程只读代码与只读查库，未发起任何外部请求。
- 授权范围（第一批三条，URL 全部来自已抓快照正文）：`source:fundamental-it:statistics-fe`（IPA `shiken/reports/toukei_fe.html`）、`source:takken:statistics-overview`（retio `/toukei/toukei/`）、`source:bookkeeping:candidate-data`（日商 `/bookkeeping/candidate-data`），`source_type` 统一 `official_statistics`，`institution_id` 复用库里已有的 `institution:ipa`／`retio`／`jcci`。行政書士与 IT Passport 不入本单（完整序列在 PDF 侧），FP 两条留第二批。
- **执行前的三条硬前置（本轮实测，非推断）**：① 六资格的采集开关名逐一核过——`FUNDAMENTAL_IT_LIVE_AUTHORIZED`／`TAKKEN_LIVE_AUTHORIZED`／`BOOKKEEPING_LIVE_AUTHORIZED`／`FP_LIVE_AUTHORIZED`／`GYOSEISHOSHI_LIVE_AUTHORIZED`／`IT_PASSPORT_LIVE_AUTHORIZED`。② 适配器注册表条数：`FUNDAMENTAL_IT_SOURCES` **3**、`BOOKKEEPING_SOURCES` **15**、`FP_SOURCES` **13**、`GYoseishoshi_SOURCES` **3**、`IT_PASSPORT_SOURCES` **3**，而 `takken.py` 是**单个** `TAKKEN_SOURCE` 常量且 `snapshot_from_html()` 把 `source_id` 硬编码成它 ⇒ 宅建统计页抓下来也进不了现行入库链，要先改多来源表。③ **簿记与基本情報的 `capture_registered_sources()` 没有 `source_ids` 形参**（只有 `capture_fp` 与 `capture_takken.capture_directly_cited_sources` 有）⇒ 按现状执行会一次重抓整表 15 条／3 条，远超授权面；先补形参（纯代码＋用例）再执行。
- 落盘命名的不对称是本单的风险点：`fundamental-it`／`it-passport`／`takken` 写 `<sha256>.html` 且「存在即跳过」；`bookkeeping`／`gyoseishoshi`／`fp` 写**固定文件名并无条件 `write_bytes`** ⇒ 整表重抓会原地覆盖磁盘上唯一的证据字节，而库内只存哈希，门禁与审计都测不出「文件与 `content_hash` 已不符」。若必须整表遍历，先按 FP 的做法留内容寻址副本（gitignore 的 `var/`，不入库）。
- 口径类读数：`source_type` 在库里是自由文本（`packages/db/migrations/0000_stage_0.sql:7` 无 CHECK／无枚举），`allowedSourceTypes` 只被 `packages/schema/src/data-coverage-contract.ts:49` 做 zod 形状校验、**运行时无任何读取方强制** ⇒ 写错来源类型不会报错，唯一防线是审核人；`is_registered_source_url()` 两家严格度不同，簿记要求逐字命中注册表 URL，基本情報只校验主机名。
- 与门禁的关系沿用上一轮结论：F 的 `post_event` 需求被 `scripts/verify-lib.mjs:62` 跳过，采集与入库都不会让覆盖缺口变红；但入库必然产生非合成 `pending_review`，`pending_official != 0` 是硬失败 ⇒ 采集／入库／批准三次授权分开，本单只给第一次。
- 本轮明确未执行：未联网、未抓取、未写库、未登记来源迁移、未改任何采集代码。`docs/work-package-f-statistics-sources.md` 里那 27 条 URL 的活性仍未验证。
- 回归读数：只新增与修改 `docs/`，未动 TypeScript 与 Python，故未重跑 build／Vitest／pytest；`prettier --write` 新文档后 `npm run format:check` 通过。工作树只剩未跟踪的 `Python/`。

## 2026-10-11：工作包 F 的只读来源调研（零抓取、零写库、零联网）

- 动机与范围：`docs/data-gate-semantics.md` §11 第 5 项长期只写了一句「历史统计字段六资格全为零官方来源，归工作包 F」，没有读数也没有来源清单。本轮把它推成一份可执行的调研，全程不向外部站点发起请求（也不用搜索引擎），只读契约、只读查库、只解析 `var/official-snapshots/` 里已有的官方快照。产物是新文档 `docs/work-package-f-statistics-sources.md`；三份既有文档（§11 第 5 项、`docs/data-remediation-handoff.md` 工作包 F 引言、README 数据现状句）改为指向它。
- **定性一：F 不是门禁欠账**。六资格的这类需求在契约里一律 `requiredLevel="post_event"`，而 `scripts/verify-lib.mjs:62` 算覆盖缺口时对 `post_event`／`optional`／`not_applicable` 直接 `continue` ⇒ 门禁永远不会因为 F 变红。这解释了它为什么能长期挂在待办而无人动，也意味着「等门禁报警再说」永远不会发生。
- 定性二：**是从未登记，不是登记了没批**。`fieldCatalog.pass_rate` 只允许 `official_statistics`／`official_result_information` 两种来源类型，本机 40 条 `sources` 的 `source_type` 分布里这两类**一条都没有**；`applicants`／`examinees`／`passed`／`pass_rate`／`statistics_methodology` 五个 `fact_key` 在 `candidate_facts` 与 `facts` 里均命中 **0 条**（全库总量仍为 facts 176／candidates 281／snapshots 40／sources 40，与基线一致，本轮零写入）。
- **关键发现：统计页入口就挂在已抓快照的正文里**。方法是对 50 个 HTML（另有 6 份 `fp-preserved/` 副本与 2 份 PDF 不参与锚点解析）去标签扫「合格率／試験結果／統計／実施概況／合格発表／受験者データ／受検者データ」，取命中锚文本的 `<a href>`，按各文件 `rel=canonical` 解析为绝对地址（无 canonical 者回落采集器注册的 `canonical_url`，两个 IT Passport 哈希名页回落库里的 `snapshots.original_url`）。得到 **27 条**候选（23 HTML／4 PDF），域全部落在 `www*.or.jp`／`www*.go.jp`，无外部域混入。引用面最高的几条：金财 `kinzai.or.jp/ginou/fp/result-fp` 与 `kinzai.or.jp/gokaku`（各 8 个快照挂着）、宅建 `retio.or.jp/toukei/toukei/`（9）、簿记 `kentei.ne.jp/bookkeeping/candidate-data`（7）、JAFP `jafp.or.jp/exam/syutoku/`（5）、IPA `www.ipa.go.jp/shiken/reports/toukei_fe.html`（5，按考试区分配布的历年统计表，FE／IT Passport 一条页可覆盖多年度序列）。
- 最大阻碍：**四条 PDF 恰好是各家最完整的历年序列，而解析链只吃 HTML**。行政書士 `pdf/trans.pdf`（試験結果の推移）与 `pdf/prefsummary.pdf`、宅建 `10years_result2025.pdf`（令和7年度以前の過去10年間）、IT Passport `html/openinfo/pdf/statistics/202606_ip_shikenkekka.pdf`。采集链能落 `.pdf` 字节，但六个 collector 适配器入参都是 `str` HTML，没有任何 PDF 正文解析器 ⇒ 首批只能走 HTML 入口，PDF 提取要另立工作项、不在 F 里顺手加。
- 另记：`/pdf/attr.pdf`「受験者・合格者の属性」由首轮宽检索发现，属属性调查不是人数序列，未计入 27 条。
- 与 FP 那类情形的关键区别：F 是**全新来源＋全新候选**，一旦入库必然出现非合成 `pending_review`，而门禁 `pending_official != 0` 是硬失败（不像哈希不变的 FP 重跑可 0 新增）⇒ 采集→入库→批准要么能连着走完，要么停在「只采集、不入库」；来源行仍按既有口径由迁移或 `packages/db/src/seed.ts` 登记、`sources.qualification_id` 由 seed 绑定。
- 建议切法（未执行，等号主定夺）：第一批三条纯 HTML 且带年度序列的 `source:fundamental-it:statistics-fe`／`source:takken:statistics-overview`／`source:bookkeeping:candidate-data`；第二批 FP 两条；行政書士与 IT Passport 等 PDF 议题定案后再排。采集要新写一张 F 授权单——`docs/work-package-e-live-capture-authorization.md` 注明已于 2026-09-08 执行完毕，不可复用。
- 回归读数：本轮只新增与修改 `docs/`，未动 TypeScript 与 Python，故未重跑 build／Vitest／pytest（Python 用例仍 117）；`prettier --write` 后 `npm run format:check` 通过；`verify:all` 未跑——本轮零库写入、零来源变更，门禁判据的输入没有任何变化。三个一次性探针脚本（锚点提取、canonical 解析、库侧核对）放在 gitignore 的 `var/`，跑完即删。

## 2026-10-11：FP 入库入口从 4 个来源扩到 6 个（零抓取、零写库）

- 动机：上一节查出的缺口——`jafp-schedule` 12 ＋ `kinzai-schedule-2026` 10 ＝ 22 条已批准候选挂在库里，但旧 `__main__` mapping 从未含它们（`git log -S` 证明），所以「补齐报告后重跑」最多补得回 4 个来源。本轮按号主点的候选把它补成 6 个，纯代码＋pytest，不联网、不写库。
- 改法：`services/collector/src/collector/ingest_fp.py` 的 mapping 从 `__main__` 里提到模块级 `INGEST_SOURCES`（文件名 → `source_id` 六条，顺序按来源名字典序），`__main__` 直接遍历它；这样测试能断言覆盖面，而 `INGEST_SOURCES` 与 `FP_SOURCES`／磁盘文件名的对应关系也是可检查的。函数体、四重校验与三段 INSERT 一字未动。
- 扩两个来源的前置核对（读库 `SELECT`）：那 22 条候选与另外 53 条同维度——`exam_year` 全为 `2026`、`payment_method` 全为 `NULL`，而 `ingest_fp.py` 里这两个参数就是这两个默认值 ⇒ 沿用默认即可复现同形 candidate-id，不需要为 schedule 页加特殊维度。两个 `source_id` 已在 `FP_SOURCES` 注册，磁盘文件名与 `source:fp:` 后缀一致。
- 新增两条用例（`services/collector/tests/test_fp_ingest.py`）：① `INGEST_SOURCES` 覆盖面必须恰等于「适配器能读出字段的那 6 个来源」，并逐条校验 `source_id` 在 `FP_SOURCES` 内、文件名＝去掉 `source:fp:` 前缀加 `.html`、与 `UNPARSED_FP_SOURCES` 那 7 个不相交；② 给一个解析不出契约字段的页面（`kinzai-2`，合成快照＋逐条相符的报告记录）跑 `ingest_snapshot()`，必须在连库之前抛 `snapshot parse failed` 且消息含 `structure_changed` ⇒ 把「7 个 `structure_changed` 来源刻意不进 mapping」这条划分变成用例约束，而不是注释里的默契。
- 回归读数：`PYTHONIOENCODING=utf-8 uv run --project services/collector --extra test pytest -q services/collector/tests services/parser/tests` → **117 passed**（上一节基线 115，＋2）。未跑 build／Vitest／门禁：本轮没有改 TypeScript，也没有写库，`verify:all` 的 facts 计数与 `pending_review` 判据不受影响（暴露面只是「将来若授权重抓，会有 75 条而非 53 条跟着哈希走」）。
- 文档同步：`docs/fp-source-contract.md` 已知剩余项 1 与 `docs/data-gate-semantics.md` §11 第 6 项改为「`INGEST_SOURCES` 覆盖 6 个来源＝75 条」，重抓暴露面 53→**75**，单页最大占比由 68% 记为 36/75＝**48%**；建议的重抓 `source_ids` 收紧口径由「映射内那 4 个」改为「`INGEST_SOURCES` 那 6 个」。
- 仍待授权（口径不变）：端到端跑通仍要先给一次 `FP_LIVE_AUTHORIZED=1` 采集（新授权单，`source_ids` 收紧到 6 个），再给 `FP_LOCAL_WRITE=1` 入库，批准是第三次；本轮三者皆未发生。取证快照副本仍在 `var/official-snapshots/fp-preserved/`（6 个 `<sha256>.html` ＋ `manifest.json`，本机专有）。

## 2026-10-11：FP 端到端入库的离线预演与取证快照固化（零抓取、零写库）

- 动机与范围：`docs/data-gate-semantics.md` §11 第 6 项此前只留了一句「补齐报告后重跑则候选新增 0 条」，没有可复核的读数。本轮把它推成一次纯离线预演——解析磁盘快照、按新链规则算 candidate-id、与本机开发库对账，全程不联网、不写库（库侧只 `SELECT`，唯一一条机制判据用临时表实测后 rollback）。探针脚本放 gitignore 的 `var/`，跑完即删。
- **更正范围**：没有采集报告记录的取证快照是 **6 个、共 75 条候选**，不是文档里写的「那 4 个／53 条」。按页分布 `jafp-2-3-outline` 36／`jafp-schedule` 12／`kinzai-schedule-2026` 10／`kinzai-1-academic` 8／`kinzai-1-practical` 7／`kinzai-eligibility` 2；这 75 条 id 与库里 6 条真实快照行逐条相符、无重复 id、**全部已是 `approved`**。其余 7 个注册来源解析 0 条并报 `structure_changed`，库里也没有它们的快照行（本来就没入库）。适配器 `sha256(html.encode())` 与磁盘原始字节 **13/13 全等** ⇒ `capture_record()` 的第 4 重校验不会因编码差异失败。
- 新发现的缺口（此前没记过）：`ingest_fp.py` 的 `__main__` mapping 只覆盖 4 个来源＝53 条，**另外 22 条（两个 schedule 来源）没有任何已提交的入库入口**——`git log -S` 显示 mapping 从未含它们，0016 迁移只有 `INSERT INTO sources`。⇒ 「补齐报告后重跑」最多补得回那 4 个来源；要让 22 条也可重跑得先扩 mapping，代价是把重抓暴露面从 53 抬到 75。
- FP 总账（本机库读数）：`candidate_facts` 114 全 `approved` 全非合成 ＝ 75（磁盘真实快照）＋ 39（3 条 `ci://` 夹具快照行，24/8/7）；`facts` 75 全 approved；**0 条现行事实挂在 `ci://` 快照上**，39 条夹具候选都不是任何事实的当前 revision；全库 `pending_review` 0。`npm run audit:provenance`：176 条事实里 blocked 4，**全在 takken，FP blocked 0** ⇒ 夹具残留不承重。`source_checks` 对 FP 是 6 条 `blocked` ＋ 2 条 `changed`，**8 条全部由 `scripts/backfill-fp-provenance.mjs` 写入，新链一条 `changed` 都还没落过**；两套 id 要分清——capture-only 那 2 条用的是与新链同形的 `source-check:fp:<content_hash>`（将来幂等），那 6 条 `blocked` 用的是 `source-check:legacy-metadata:snapshot:fp:<content_hash>`（将来新链重跑这 6 个快照会**新增** `changed` 而非取代 `blocked`，两条并排属正常）。11 个 FP 快照行里 **9 个缺 `original_url`／`final_url`／`http_status`／`collector_version`**，正好是那 6 个真实取证行 ＋ 3 个 `ci://` 夹具行。
- 机制判据（临时表实测，非推断）：`ON CONFLICT (id) DO UPDATE … WHERE candidate_facts.status='pending_review'` 对已批准行 rowcount＝0 且 `normalized_value` 原值不动，对 pending 行 rowcount＝1 并更新 ⇒ 「哈希不变则候选新增 0 条」成立；整事务 rollback，真实表未被触碰。
- 暴露量与副作用：候选 id 内嵌 `content_hash`，某页哈希一变、该页候选全部变成新的 `pending_review`；单页最大是 `jafp-2-3-outline` 的 36 条＝映射内 53 条的 **68%**。另一条不对称是 `snapshots` 用**无条件** `DO UPDATE` ⇒ 即使哈希不变，也会把那 6 行真实快照的 `retrieved_at` 从 2026-09-07／09-11 改成新的抓取时刻（顺带补全溯源列）；门禁不受影响（§5 的 `official_verified_at` 取 `reviews` 时间），但「证据何时取得」的语义会变，属需项目所有者定性的副作用。
- 排除的假风险：`SafeFetcher.cache` 是实例内且逐来源新建，抓取不会返回 304／`not_modified` ⇒ 卡不住 `capture_record()` 的 `status=='ok'`；`candidate_idempotency_idx` 含 `source_snapshot_id`，新哈希的候选不会与旧行撞唯一索引。
- 已落地的动作（号主明示后执行）：把承载那 75 条已批准事实的 6 个 HTML 按 `<sha256>.html` 复制进 `var/official-snapshots/fp-preserved/`——6/6 复制后重算哈希一致，另附 `manifest.json` 记哈希↔来源↔候选数↔字节数，并逐条回库确认 `snapshot:fp:<hash>` 行存在、行上 `source_id` 一致、`object_key` 指向原文件。**原文件未改动**。理由：FP 快照按固定文件名原地覆盖，磁盘字节是这 75 条事实唯一的物理证据而库内只存哈希；页一改版旧字节永久丢失，而「文件与 `content_hash` 已不符」在门禁与审计里都测不出来。基本情報的内容寻址命名没有这问题，FP 补齐映射前先用这份副本兜住。
- 仍待授权：跑通 FP 端到端需要一次新抓取授权（`FP_LIVE_AUTHORIZED=1`），且 `capture_registered_sources(source_ids=None)` 默认抓 **13** 个 `FP_SOURCES`，超出 `docs/work-package-e-live-capture-authorization.md` 登记的 9 个 FP 来源，而该单注明已于 2026-09-08 执行完毕 ⇒ 重抓要开新单并用 `source_ids` 收紧到映射内那 4 个。
- 回归读数：本轮只改 `docs/`，未动 TypeScript 与 Python，故未重跑 build／Vitest／pytest；`prettier --write` 三份文档后 `npm run format:check` 通过。未抓取、未写库，门禁与事实计数沿用本日上一节读数（`verify:all` 6/6 PASS、176 facts）。

## 2026-10-11：`sources.qualification_id` 回填本机实跑（PR #12 的收尾读数）

- 上面那节留的「本机尚未 apply」已按明示授权补跑：`NODE_ENV=development DATABASE_URL=...qualification_media node_modules/.bin/tsx.cmd packages/db/src/seed.ts`，全部输出只有一行 `Seeded 6 stable qualification records (no dynamic facts); bound 32 sources to their qualification.` ⇒ 与只读预演的 32 完全吻合。这是本项唯一的一次库写入（32 行 `UPDATE`）。
- 前后计数对照（同一开发库）：
  - `sources.qualification_id` NULL **32 → 0**、已设 **8 → 40**；分布 `bookkeeping 15 / fp 15 / takken 1 / gyoseishoshi 3 / it-passport 3 / fundamental-it-engineer 3 = 40`，与预演逐档一致。
  - 其余计数一律不动：`facts` approved 176 → 176、`candidate_facts` 281 → 281、approved `fact_revisions` 268 → 268、`change_events` 176 → 176、`snapshots` 40 → 40、非合成 `pending_review` 0 → 0、`schema_migrations` 18 → 18、`source_scopes` **0 → 0**（未启用）。
  - 四列溯源元数据按设计继续留 NULL：`content_scope`／`parser_adapter`／`update_cycle`／`default_risk` 各仍 32 条 NULL（抽查 `source:fp:jafp-2-3-application-outline-pdf` 与 `source:fp:kinzai-fp-faq` 仍保持 backfill 脚本写的 `capture_only_evidence`，未被覆写）。
- 本机与 CI 的来源口径现已对齐到「seed 登记的每条来源都有资格」：CI 空库 `bound 38`、本机 `bound 32`（差的那 8 条早在 backfill 时就有值）⇒ 两边最终都是 100% 非 NULL；本机总数 40、CI 38 的差异仍只是那 2 条脚本专有来源。
- 入库后复跑门禁：`verify:all` `status=passed, qualifications=6, passed=6, failed=0`，176 facts（16/15/2/10/58/75）、API 与页面全 `verified`、`coverageGaps=[]`、`pending_official=0`——印证「该列无读取方 ⇒ 回填不改门禁」。

## 2026-10-10：`sources.qualification_id` 32 条 NULL 的回填落点（改 seed，不改迁移）

- 先只读盘底（`var/` 探针跑 `SELECT`、跑完即删）：`sources` 40 条，`qualification_id` NULL 32 条、已设 8 条（全是 FP；其中 6 条由迁移登记、由 `scripts/backfill-fp-provenance.mjs` 在本机 UPDATE 补上，另 **2 条只存在于本机**——`source:fp:jafp-2-3-application-outline-pdf` 与 `source:fp:kinzai-fp-faq` 由该脚本 INSERT，没有迁移，所以 CI 空库只有 38 条来源）。32 条按可推导性分两类——
  - **13 条有候选事实**，其 `candidate_facts.qualification_id` 去重后恰好 1 个值 ⇒ 有数据证据；**0 条**跨两个资格。
  - **19 条是「注册而未用」**：`candidate_facts` 0 条且 `snapshots` 也 0 条，库里没有任何证据能推导其资格，只有来源 id 前缀与 `source_type` 表达登记意图。
- 该列**当前无任何读取方**：`grep` 全仓只有 `scripts/backfill-fp-provenance.mjs:149` 的 `WHERE src.qualification_id IS NULL` 与 `tests/source-provenance-model.test.ts:21` 的「列存在」断言；`services/api/src/public-facts.ts:86`、`scripts/verify-lib.mjs:169`、`apps/admin/src/server.ts:121` 都 join `sources` 但不取该列。⇒ 回填属溯源元数据完整性，不改门禁、不改 API、不改 admin。
- 落点为什么是 `db:seed` 而不是新迁移（关键约束）：`qualifications` 的行**只由 `packages/db/src/seed.ts` 写入**（迁移里只有 `institutions` 与 `sources` 的自插），CI 顺序是 `db:migrate` → `db:seed` → 恢复夹具 → `release:check`。写成迁移 0017 的 `UPDATE ... FROM qualifications` 在空库上会匹配 0 行；若改成硬编码 `qualification:<slug>` 字面值则在那一刻违反 `sources.qualification_id` 的外键。放在 seed 里还额外得到一条性质：今后任何迁移新登记的来源，下一次 seed 自动补上。
- 实现：`packages/db/src/seed.ts` 在插完资格与来源后跑一条幂等 `UPDATE sources s SET qualification_id = q.id FROM qualifications q WHERE s.qualification_id IS NULL AND split_part(s.id,':',1)='source' AND split_part(s.id,':',2) = CASE q.slug WHEN 'fundamental-it-engineer' THEN 'fundamental-it' ELSE q.slug END`，并把绑定条数打进原有的 seed 日志行。`CASE` 那支是命名陷阱：基本情報的来源 id 用 `source:fundamental-it:*`，而资格 slug 是 `fundamental-it-engineer`（13 条里 11 条前缀＝派生结果，差的正是这 2 条）。
- 只留 `qualification_id`，**不填** `content_scope`／`update_cycle`／`parser_adapter`／`default_risk`：这四列无法从来源 id 推导，而那 19 条注册而未用的来源又没有快照证据，填了就是凭空补全（违铁律 1）。`source_scopes` 仍 0 行——它是 0012 设计的权威 N:N 表，等真出现一条来源服务两个资格时再启用。
- 只读预演（本机开发库，未写库）：该谓词命中 **32/32** 条 NULL、`(source, qualification)` 配对数也是 **32**（无一行匹配两个资格）、未命中 **0** 条；回填后分布 `bookkeeping 15 / fp 15 / takken 1 / gyoseishoshi 3 / it-passport 3 / fundamental-it-engineer 3 = 40`（现为 `fp 8`＋`(NULL) 32`）。
- 无 DB 用例覆盖：`tests/setup.ts` 删除 `DATABASE_URL`，Vitest 连不到库，seed 又是脚本而非查询层。自证两路——上面的只读谓词预演，以及 PR #12 的 CI 日志实跑读数：`Seeded 6 stable qualification records (no dynamic facts); bound 38 sources to their qualification.`，即 CI 空库上迁移与 seed 登记的全部 38 条来源都被绑定，**无一条漏网**（本机 40 条比 CI 多那 2 条脚本专有的 FP 来源）。本机尚未 apply（`db:seed` 要 UPDATE 32 行，需另行授权）；`release-gate` 通过 55s。
- 文档：`docs/data-gate-semantics.md` §11 第 2 项改写为已定口径；`packages/db/migrations/0017_*` 曾按迁移方案建过程稿，验证 seed 落点后已删除，迁移目录仍 0000–0016。
- 回归读数：`node_modules/.bin/tsc.cmd -p tsconfig.json` 通过（`dist/` 已重建）、Vitest 81/81（10 files）、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、`verify:all` `status=passed, qualifications=6, passed=6, failed=0`，176 facts（16/15/2/10/58/75）、六资格 API 与页面均 `verified`、`coverageGaps=[]`、`pending_official=0`；本轮未抓取、未写库，Python 侧无改动故未重跑 pytest。

## 2026-10-10：`services/parser` 补齐为共享候选契约（只动 Python，未抓取未写库）

- 这一项是上一轮留下的结构决策（「删或填」）。两条路的对比：
  - **填成真实适配层**（六条链的候选 dataclass 全改为消费 `services/parser` 的契约）：能消除可见的字段漂移——`TakkenFactCandidate` 带 `exam_year` 但不带 `value_type`，`BookkeepingFactCandidate` 反之，共同字段 `fact_key`／`normalized_value`／`display_value`／`source_id`／`source_snapshot_id`／`risk_level`／`status`／`synthetic` 在六个文件里各抄一遍。代价是要动六条采集+入库链，而候选 id 由字段值算出，任何口径漂移都会撞门禁（`requireNoOfficialPending` 对非合成 pending 是硬失败）。
  - **连同 CI／README／docs 引用一起移除**：改动面实测 6 处——`.github/workflows/release-gate.yml:47` 的 `cache-dependency-path` 与 `:50` 的 `pip install -e services/parser`、`package.json:15` 的 `test:python`、`services/collector/pyproject.toml` 的 `pythonpath = ["src", "../parser/src"]`、`README.md:60` 目录清单、`docs/product-design.md:1289`。且 §22.2 服务边界把 `services/parser`／`services/validator`／`services/publisher` 并列成规划层，只删第一个会留下「同一张表里两个还没建、一个已删」的不一致。
- 取**折中：本轮只把契约本身补实，不动六条链、不动 CI**。这样包不再是「会误导的桩」，但门禁暴露面为零。
- 改前取证：`grep -rn ParsedCandidate` 全仓只命中 `services/parser/src/parser/__init__.py` 的定义与它自己那条用例，六条 collector 链无一处 import ⇒ 扩字段属纯增量，不会改变任何现有行为。
- `ParsedCandidate` 现与 `packages/schema` 的 `candidateFactSchema`（`packages/schema/src/index.ts:60-79`）同口径：必填 `fact_key`／`exam_year`／`value_type`／`normalized_value`／`display_value`／`source_id`／`source_snapshot_id`，身份维度 `provider_id`／`exam_level_id`／`exam_component`／`delivery_mode`／`payment_method` 可空（含当日 `rollbackApprovedFact` 补的 `payment_method`，与 0014 索引一致），`value_type`／`status`／`risk_level` 用与 TS 侧逐字对齐的 `Literal` 枚举，`extra='forbid'` 保留。
- 刻意保留的差异：`synthetic` 默认 **True**，与六条 collector dataclass 一致，而 TS 侧默认 `false`。两者方向不同是安全的——公开 API 只放行 `synthetic = false` 的行（`services/api/src/public-facts.ts:95`），Python 采集侧默认按夹具处理，漏标只会让事实进不了公开面，不会把夹具漏进公开面。
- 用例 1 → 7：默认为合成、三条必填溯源（空串与缺失各断一次，参数化 3 项）、三个枚举越界各 1 项、含 `payment_method` 的全身份维度、`extra='forbid'` 拒未知字段。
- 回归读数：`uv run --project services/collector --extra test python -m pytest services/collector/tests services/parser/tests` **115 passed**（109 → 115，+6）、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、`verify:all` `status=passed, passed=6/6, failed=0`，176 facts 与六资格 `coverageGaps=[]` 不变（本轮未改 TypeScript，`dist/` 未变）。跑 pytest 会生成 `services/collector/uv.lock`，按既有口径提交前删除。
- 未做（等需求出现再动）：让六条链改为继承/消费该契约。真要做时必须先离线核算候选 id 与快照哈希不变，否则门禁硬失败。

## 2026-10-10：重复实现与迁移重号的结构性清理（纯代码，未抓取；本机开发库按授权跑过一次 `db:migrate`）

- `escapeHtml` 原在 4 处各写一份：`packages/ui/src/index.ts`、`apps/web/src/layout.ts`、`apps/web/src/render.ts` 三份逐字符相同（签名 `(value: string) => string`），`apps/admin/src/server.ts` 那份多一层 `String(value ?? '')` 容错（签名 `(value: unknown) => string`）。现把 `packages/ui` 那份改为 `export function escapeHtml` 作为唯一转义实现，web 两处删本地定义改为从 ui 导入；admin 保留同名本地薄封装只委托一行，其 21 处调用点一字未改。
- 刻意不合并：`apps/web/src/server.ts` 的 `escapeXml` 把 `'` 编成 `&apos;`（sitemap XML 用），与 HTML 的 `&#39;` 是两种输出，属不同契约而非重复实现，合并会改 sitemap 字节。
- 等价性自证（不依赖库）：11 个样本（空串、`&<>"'` 混排、日文、`null`／`undefined`／数字／对象）逐一比对 `escapeHtml(String(v ?? ''))` 与两份旧实现，mismatches=0。渲染侧回归由 `tests/web-render.test.ts` 24 项与 `verify:all` 的 web 步骤兜住——后者断言页面正文含状态标签、`gate.pageContains` 与路由 marker，不只是 HTTP 200。
- 迁移重号：`packages/db/migrations/` 下 `0010_drop_legacy_candidate_unique.sql` 与 `0010_fp_annual_schedule_sources.sql` 同号，后者按下一个空号 `git mv` 为 `0016_fp_annual_schedule_sources.sql`，序号恢复为 0000–0016 无重号无缺口。
  - 判据：`packages/db/src/migrate.ts` 以**文件名**作 `schema_migrations.name` 主键、`readdir().sort()` 全量顺序执行，序号只是人读的排序提示，引擎不解析；本机开发库 `schema_migrations` 17 行与 17 个文件严格一一对应（无缺档、无孤儿记录），重号从未造成漏跑或错序。（此为本机跑 `db:migrate` 之前的读数；跑后见下。）
  - 语义影响：遍历全部迁移，没有任何迁移 `UPDATE sources` 或引用这三行 fp `source:fp:*-schedule` id，故把该文件移到末尾不改变全新库的结果；其内容本身是 `INSERT … ON CONFLICT (id) DO NOTHING`，在已建库上会以新名重跑一次并成 0 行 no-op（下文本机实测已钉死），旧名记录留在 `schema_migrations` 作无害孤儿（runner 只遍历文件，不校验记录）。
  - 全新顺序由 CI 独立自证：`release-gate` 每次在空的 `qualification_media_ci` 上 `db:migrate` → `db:seed` → 恢复夹具 → `release:check`。PR #9 的 CI 日志实测 **17 条 `Applied`**，其中 `Applied 0016_fp_annual_schedule_sources.sql.` 紧随 `0015` 之后、末位应用无报错，整链 `release-gate pass 58s`。
  - 本机开发库实测（2026-10-10，经授权执行，是本轮唯一的库写入）：命令 `NODE_ENV=development DATABASE_URL=postgresql://qualification_dev:qualification_dev@localhost:5432/qualification_media node_modules/.bin/tsx.cmd packages/db/src/migrate.ts`，全部输出只有一行 `Applied 0016_fp_annual_schedule_sources.sql.`，即重跑确实按新名发生且为 0 行 no-op。前后读数：
    - `schema_migrations` 17 → **18** 行：旧名 `0010_fp_annual_schedule_sources.sql`（@2026-09-11T01:38:04）保留，新名 `0016_fp_annual_schedule_sources.sql`（@2026-10-10T13:36:48）新增——正是 runner「只认文件名、不校验记录」的形态。
    - `sources` 40 → **40**，三行 `source:fp:*-schedule` 逐字段未变（`ON CONFLICT (id) DO NOTHING` 生效，未覆写）。
    - `facts` approved 176 → **176**；`candidate_facts` 281 → **281**；approved `fact_revisions` 268 → **268**；`change_events` 176 → **176**；非合成 `pending_review` 0 → **0**。
    - `verify:all` 迁移后复跑：`status=passed, passed=6/6, failed=0`，176 facts（六资格 16/15/2/10/58/75）不变，六资格 API 与页面均 `verified`，`coverageGaps=[]`。
    - 旧名那 1 条孤儿记录保留未删：删除是又一次库写入，且 runner 不校验记录，留着不影响任何判据；如需清理要另行授权。本轮未新建、也未删除临时库。
  - `docs/data-local-snapshot-audit-2026-09-07.md` 引用旧文件名的位置就地注明更名缘由，不改写当时的结论。
- 更正一条长期记错的口径：`services/parser` **不是空壳**。它含 `pyproject.toml`（`jp-qualification-parser`）、`src/parser/__init__.py` 的 `ParsedCandidate` 桩模型、`tests/test_parser.py` 1 条用例，且被 CI `pip install -e services/parser` 安装、被 README 与 `docs/product-design.md` 列为「资格适配器和提取」层，`test:python` 也显式传它的 `tests` 目录。删或填它属结构决策，不在本轮纯清理范围，因此本轮**未动**。（后续：同日已选「填」的收敛版，见顶部「`services/parser` 补齐为共享候选契约」一节。）
- 回归读数：`node_modules/.bin/tsc.cmd -p tsconfig.json` 通过、Vitest 81/81（10 files）、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、`pytest services/collector/tests services/parser/tests` 109 passed、`node --test scripts/verify-lib.test.mjs` 7/7、`verify:all` `status=passed, passed=6/6, failed=0`，176 facts 不变、六资格 API 与页面均 `verified`、`coverageGaps=[]`、`pending_official=0`。

## 2026-10-10：`rollbackApprovedFact` 维度 join 补 `payment_method`（§11 第 4 项收口）

- `services/api/src/release.ts:69-80` 那条「取上一条 approved revision」的子查询，原先只比 `qualification_id`／`provider_id`／`exam_level_id`／`exam_component`／`delivery_mode`／`exam_year`／`fact_key` 七维，与 0014 迁移把 `payment_method` 纳入 `facts_current_key_idx` 与 `candidate_idempotency_idx` 之后的身份口径不一致。只在 `delivery_mode` 之后加一行 `AND f.payment_method IS NOT DISTINCT FROM c.payment_method`，不重构、不动别的 SQL 与索引。
- 只读探针前后对照（本机开发库，脚本放 `var/`、只跑 `SELECT`、跑完即删，未写库）：
  - 按「去掉 `payment_method` 的七维」分组，176 条事实中恰好 **1 组**装着 2 条事实——`qualification:takken`／`exam_year=2026`／`fact_key=payment_deadline_rule`，渠道分别 `convenience_store` 与 `pay_easy`；两条各自只有 **1 条同渠道** approved revision。
  - 修前：`convenience_store` 那条查询返回 1 行，挑中的是 `pay_easy` 的 revision id；`pay_easy` 那条反之——即跨渠道串号，会把事实回退到另一条支付渠道的口径上。
  - 修后：两条查询都返回 **0 行**，函数按预期抛 `no previous approved revision available`，这是正确行为（该维度组合下确实不存在「同渠道的上一条」）。
  - 其余计数复确认：`facts` approved 176、带渠道 2；`candidate_facts` 281、带渠道 2；非合成 `pending_review` 0。
- 无测试覆盖：`rollbackApprovedFact` 全仓只有定义、无调用方（`grep -rn rollbackApprovedFact` 仅命中定义与 `dist/` 编译产物），且 `tests/setup.ts` 会 `delete process.env.DATABASE_URL`，Vitest 一律连不到库。这条 SQL 属纯 DB 行为，只由上述只读探针自证，未写 mock 用例，也没有不依赖库的纯逻辑可覆盖。
- 该函数不参与门禁、不改线上行为；事实计数与 `verify:all` 结果均不变。
- 文档同步：`docs/data-gate-semantics.md` §11 第 4 项改写为已收口并记下前后读数；`docs/stage-log.md` 2026-10-09 节「真实剩余项」同一条就地标注。
- 回归读数：`node_modules/.bin/tsc.cmd -p tsconfig.json` 通过、Vitest 81/81（10 files）、`pytest services/collector/tests services/parser/tests` 109 passed、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、`verify:all` `status=passed, passed=6/6, failed=0`，六资格 API/页面均 `verified`、`coverageGaps=[]`、`pending_official=0`。

## 2026-10-10：报告合并推广到基本情報与宅建，六条采集链全部共用

- `capture_fundamental_it.py` 与 `capture_takken.py` 的三个采集入口（`capture_registered_source()`、`capture_directly_cited_sources()`、`capture_directly_cited_documents()`）全部改用共享的 `write_capture_report()`；宅建两份 directly-cited 报告各按自己的文件名独立合并，新增模块常量 `DIRECTLY_CITED_REPORT`、`DIRECTLY_CITED_DOCUMENT_REPORT` 承载文件名。至此六条采集链同一份语义，`docs/data-gate-semantics.md` §11 第 7 项收口。
- 宅建是这次风险最高的一条：`capture_directly_cited_sources()` 的 `source_ids` 允许只传子集，旧实现会把未参与本次运行的来源记录整份抹掉，磁盘快照仍在但 `ingest_takken_directly_cited.py` 的 `rows[capture_id]` 直接 KeyError、`ingest_takken.py` 的 `capture_record()` 判定「无报告」。快照一直是内容寻址文件名，被覆盖的只有报告。
- 读取侧未改动：`ingest_fundamental_it.py`、`ingest_takken.py` 的 `capture_record()` 与 `ingest_takken_directly_cited.py` 都按 `source_id` 在 `results` 里取记录，合并带入的历史条目不影响选取，且陈旧记录会撞 sha256 校验被拒，不会静默用旧内容入库。
- 用例 +4：`test_fundamental_it_capture.py` 加 1 项（外部来源记录在合并后保留；顺手把假 fetcher 提为模块级 `_FakeFetcher` 并抽出播种报告的 `_seed_foreign_record`）；`test_takken_capture.py` 加 3 项（注册来源报告保留、只跑 2／6 个 directly-cited 来源时第 3 条记录保留、document 报告保留），共用 `_seed_offline_report` 与 `_offline_fetcher`。
- 文档同步：`docs/data-gate-semantics.md`（§8 采集行改为六条链、§10 Python 读数 105→109、§11 第 7 项改写为已收口）、`docs/fundamental-it-engineer-source-contract.md`（采集行注明按 `source_id` 合并；另更正校验口径——`ingest_fundamental_it.py` 的 `capture_record()` 实为**四重**，原文写成三重、漏了「报告必须带 `content_hash` 与 `captured_at`」那条）、`docs/fp-source-contract.md`（共用链数口径更正）。
- 本轮纯 Python + 文档，未抓取、未写库，事实计数不变。回归读数见下一行：`pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests services/parser/tests` 109 passed、Vitest 81/81、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`tsc -p tsconfig.json` 通过、`prettier --check`（项目 `format:check` 的 glob）通过、`verify:all` `status=passed, passed=6/6, failed=0`。

## 2026-10-10：采集报告合并抽为共享模块，推广到行政書士／簿记／IT Passport

- 新增 `services/collector/src/collector/capture_report.py`：`merge_capture_report()`（按 `source_id` 合并，本次运行里没有 `content_hash` 的失败记录不会抹掉上一次成功记录；该来源此前没落盘过才写入失败记录）与 `write_capture_report()`（合并 + 落盘 + 返回报告）。计数字段定为 `source_count`＝本次运行条数、`retained_source_count`＝文件累计保留条数，`results` 为合并后的全集，`captured_at`/`candidate_ingest` 含义不变。
- `capture_fp.py` 删除本地那份实现改用共享模块；`capture_gyoseishoshi.py`、`capture_bookkeeping.py`、`capture_it_passport.py` 的报告写入同批换成 `write_capture_report()`，四链从此共用一份语义，不再整份覆盖。
- 读取侧无需改动：`ingest_fp.py`／`ingest_gyoseishoshi.py`／`ingest_bookkeeping.py`／`ingest_it_passport_analysis.py` 的 `capture_record()` 都是按 `source_id`（it-passport 还叠加 `content_hash`）在 `results` 里取记录，合并后的多余条目不影响选取；陈旧记录会撞哈希校验而被拒绝，不会静默用旧内容入库。
- 用例：新增 `tests/test_capture_report.py` 5 项（保留未参与本次运行的来源、同来源新记录替换旧的、失败保留上次成功记录、无历史时失败也留痕、`source_count`/`retained_source_count` 与落盘内容一致）；`tests/test_gyoseishoshi_capture.py`、`tests/test_bookkeeping_capture.py` 各加 1 项用假 fetcher 真跑一次采集，验证这两条链的报告确实保留了外部来源记录。FP 原有 2 项合并用例移入共享模块测试，`test_fp_capture.py` 回到只测 FP 自身契约。
- 尚未统一：基本情報 `capture_fundamental_it.py` 与宅建 `capture_takken.py`（含两份 directly-cited 报告）仍是整份覆盖 —— 前者快照是内容寻址文件名所以文件不被覆盖，但报告同样会丢。已记在 `docs/data-gate-semantics.md` §11 第 7 项。**该项已由上一节于同日收口，六条采集链现全部共用同一实现。**
- 文档同步：`docs/fp-source-contract.md`（合并段改写为共享模块口径、键命名更正）、`docs/gyoseishoshi-source-contract.md`（采集行）、`docs/data-gate-semantics.md`（§8 采集行、§10 Python 计数、§11 新增第 7 项）。
- 回归读数：`pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests services/parser/tests` 105 passed、Vitest 81/81、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、build 通过、`prettier --check`（项目 `format:check` glob）通过、`verify:all` `status=passed, passed=6/6, failed=0`（本轮纯 Python + 文档，未写库，事实计数不变）。

## 2026-10-10：FP 入库链同口径对齐（只到代码与用例层，未抓取未写库）

- `services/collector/src/collector/ingest_fp.py` 增加与行政書士同构的 `capture_record()` 四重校验（报告须 `status=ok`+`status_code=200`、`snapshot_path` 与入库路径全等、必须带 `content_hash` 与 `captured_at`、磁盘原始字节 sha256 与报告相符，适配器解析哈希再二次比对），连库之前完成，任一不符零写入。原先合并成一条的守卫拆为「拒绝 `NODE_ENV=production`」与「必须 `FP_LOCAL_WRITE=1`」两条，报错各自指明。
- 溯源写入对齐：`capture_runs`（`capture-run:fp:<content_hash>`、`succeeded`、`request_count` 取报告 `attempts`）、`snapshots` 全溯源列并以 `ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写（`retrieved_at`/`retrieved_at_jst` 取报告真实抓取时刻，不再用 `now()`；`collector_version=collector.capture_fp`）、`source_checks`（`source-check:fp:<content_hash>`、`changed`）。FP 特有的部分保留不动：候选 id 带 `provider`／`exam_level`／`exam_component`／`delivery_mode` 四维，语句仍是 `ON CONFLICT (id) DO UPDATE … WHERE candidate_facts.status='pending_review'`，即已批准候选不会被重跑覆盖。
- 根因修复 `capture_fp.py`：`capture-report.json` 由整份覆盖改为按 `source_id` 合并（当时新增 `run_source_count` 表示本次运行条数，`source_count` 变成累计保留来源数）；某来源本次抓取失败时保留上一次成功记录，因为那才对应磁盘上的字节。**该键命名已被下一节的共享实现取代**（现为 `source_count`＝本次运行、`retained_source_count`＝累计保留）。此前 2026-09-22 一次 capture-only 运行把 2026-09-08 那份 9/9 成功的报告整份覆盖掉（`docs/data-local-snapshot-audit-2026-09-07.md` 有当时读数），而 `var/` 在 `.gitignore` 第 18 行、报告既不在磁盘也不在 git，无法恢复。
- 只读核算（未写库）：磁盘 4 个入库 HTML 的 sha256 与库里 4 条真实快照行逐条相符（`c0efa64e9fcb`／`d8603a927e58`／`8a77e714535c`／`9a460642fe3d`），离线解析出 53 条候选 id，53 条全部已是 `approved` ⇒ 报告补齐后重跑候选新增 0 条、`pending_official` 仍为 0。顺带查出本机 FP 另有 3 条 `ci://official-snapshot/…` 夹具快照行（`retrieved_at=2026-01-01`）挂着 24／8／7＝39 条 `approved` 候选。
- 本轮明确未执行：不抓取、不写库。新链对那 4 个无报告快照直接抛 `capture report has no successful record`，所以没有端到端实跑读数；跑通需要先给 `FP_LIVE_AUTHORIZED=1` 采一次，而官方页改版会使哈希变化、候选 id 全部变成新的 pending，触发门禁 `pending_official != 0` 硬失败，届时要逐条审核并重算 baseline 计数。三段 INSERT 语句的列名与字面量依据是行政書士同日在本机真实库已执行通过的同构语句，FP 侧本轮仅由 pytest 合成报告自证。
- 文档同步：`docs/fp-source-contract.md` 新增三次授权表、四重校验清单、候选幂等语义、报告合并口径与 5 条已知剩余项；`docs/data-gate-semantics.md` §11 新增第 6 项、§10 Python 读数更新。
- 回归读数：`pytest services/collector/tests services/parser/tests` 100 passed（新增 8 项：6 条 `capture_record` + 2 条报告合并）、Vitest 81/81、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、build 通过、`verify:all` `status=passed, passed=6/6, failed=0`，各资格 `coverageGaps=[]`、公开 API `verified`（本轮未写库，事实计数不变）。

## 2026-10-10：行政書士入库链对齐基本情報口径

- `services/collector/src/collector/ingest_gyoseishoshi.py` 在连库之前增加 `capture_record()` 四重校验：`capture-report.json` 内该来源须 `status=ok` 且 `status_code=200`、报告 `snapshot_path` 与入库路径全等、报告必须带 `content_hash` 与 `captured_at`、磁盘原始字节重算 sha256 必须与报告相符，适配器解析哈希再与报告二次比对。任一不符即抛错、零写入。
- 入库补齐溯源链：写 `capture_runs`、`snapshots` 全溯源列（`capture_run_id`/`original_url`/`final_url`/`http_status`/`retrieved_at`/`retrieved_at_jst`/`collector_version`，`ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写，抓取时刻取报告值不再用 `now()`）、`source_checks`；候选 `risk_level` 改取适配器给出的值，不在 SQL 里硬编码。
- 真实数据自证（只读，不连库）：对 2026-09-08 的 `var/official-snapshots/gyoseishoshi/capture-report.json` 跑 `capture_record()`，home／abstract／guide 三条均通过，sha256 与磁盘快照相符。
- 端到端入库验证（经项目所有者授权，写本机 localhost 开发库，`GYOSEISHOSHI_LOCAL_WRITE=1`）：用磁盘上 2026-09-08 的真实 `guide.html` 重跑新链，返回 `candidates: 0`。写回读数——`snapshots` 行 `capture_run_id`/`original_url=https://www.gyosei-shiken.or.jp/doc/guide/guide.html`/`http_status=200`/`retrieved_at=2026-09-08 02:10:08.722939+00`（取自报告，原为写库时刻 `2026-09-11`）全部就位，`capture_runs` 新增 1 行（`succeeded`、`request_count=1`）、`source_checks` 新增 1 行（`changed`、200）；15 条候选因 id 与既有 approved 行相同被 `ON CONFLICT DO NOTHING` 跳过，`pending_official` 仍 0，门禁重跑仍 `6/6`、`gyoseishoshi` API/页面 `verified`。批准动作未执行。
- 快照行构成更正（先前误把候选 join 计数 21 当成快照行数）：`source:gyoseishoshi:guide` 实际只有 3 行 —— 1 行真实抓取（已补全溯源）+ 2 行 CI 夹具复刻写入（`object_key` 为 `ci://official-snapshot/…`、`retrieved_at` 固定 `2026-01-01`），夹具行按口径保持无元数据、不伪装官方来源。
- 文档同步：`docs/gyoseishoshi-source-contract.md`（入库表写入范围、四重校验、已知剩余项 1 改写）、`docs/data-gate-semantics.md`（§11 第 3 项、§10 读数日期与 Python 计数）。
- 回归读数：Vitest 81/81、`pytest services/collector/tests services/parser/tests` 92 passed（新增 3 项 `capture_record` 用例）、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`prettier --check` 全项目通过、build 通过、`verify:all` `status=passed, passed=6/6, failed=0`（含入库后复跑）。

## 2026-10-09：数据完整性整改收口（工作包 A–H）

- 覆盖契约冻结为机器可读文件 `config/data-coverage-contract.json`（6 资格 × 字段 × 维度 × 页面 × 判级），并由 `scripts/verify-lib.mjs` 的 `evaluateCoverage()` 逐资格判定缺口。
- 发布门禁从「条数比对」升级为条数地板 + 覆盖缺口两层；覆盖缺口由 **18 → 0**，`pnpm verify:all` 读数 `status=passed, qualifications=6, passed=6, failed=0`，各资格 `coverageGaps=[]`、`pending_official=0`。
- 正式事实 **176 条**：takken 16、gyoseishoshi 15、it-passport 2、fundamental-it-engineer 10、bookkeeping 58、fp 75。基线 `config/release-gate-baseline.json` 与脱敏夹具 `fixtures/ci/approved-facts.sql`（176/176/176/25）同步。
- 簿记统一试验剩余三项缺口闭合：新增 10 个官方来源登记（`0015_bookkeeping_gap_sources.sql`）、三个离线适配器（`class3-exam`／`qa`／`flow-teller`），9 条候选经审核链逐条批准。`payment_deadline` 用规则型事实 `payment_deadline_rule` 闭合，未编造全国统一缴款日期。
- admin 审核写操作鉴权收紧：写只认 `x-reviewer-id` 头，`?reviewer=` 降级为只读；6 条 curl 判据在新起实例上复跑通过。
- 新增来源/字段契约文档 `docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`，口径收口文档 `docs/data-gate-semantics.md`；`docs/runbook.md` 的过时阶段边界已替换为当前范围。
- 本轮回归读数：Vitest 81/81、`pnpm test:python` 89 passed、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、build 通过。

### 真实剩余项

- 基本情報技術者的 10 条事实 `delivery_mode` 为 `NULL`，契约三条 `conditional` requirement 因「空 scoped」被整条跳过 ⇒ 0 缺口不代表字段齐备；补维度会立即暴露 10 个缺口，且 `exam_subject_a_*` 命名不满足前缀匹配规则。**属判级/契约产品决策，待项目所有者确认。**
- 2027 年度簿记配点已公告（3 级第1問45／第2問25／第3問30、合計100、合格70以上）⇒ 覆盖年度滚到 2027 前，簿记 3 级 `scoring_method` 需从 `not_applicable` 回改并按三次授权流程重新采集。
- 历史统计字段（`pass_rate` 等）六资格零官方来源（工作包 F）。
- `sources.qualification_id` 有 32/40 条为 `NULL`；行政書士入库链不写 `capture_runs`/`source_checks`，与基本情報链路口径不一致（该项已于 2026-10-10 对齐，见上方最新一节）。
- `services/api/src/release.ts` 的 `rollbackApprovedFact` 维度 join 漏 `payment_method`，与 0014 迁移的 `facts_current_key_idx` 不一致。（已于 2026-10-10 收口，见当日「`rollbackApprovedFact` 维度 join 补 `payment_method`」一节。）
- ~~`escapeHtml` 在 4 处重复定义~~、~~迁移目录存在 `0010_` 重号~~ —— 两项已于 2026-10-10 收口，见当日「重复实现与迁移重号的结构性清理」一节。`services/parser` **更正：它不是空壳**，而是含 `ParsedCandidate` 桩模型与 1 条用例、且被 CI `pip install -e services/parser` 安装、被 README 与 `docs/product-design.md` 列为「资格适配器和提取」层的独立包；删它与否属结构决策，不在纯清理范围（同日已按「填」的收敛版收口，见顶部）。

## 2026-09-07：阶段 3 技术 SEO 基线

- 公开页面加入正規 URL、说明文与页面级 `robots` 指示。
- 搜索、筛选和动态比较的参数页使用 `noindex,follow`，并回归到稳定的目录、日程或比较页面正規 URL。
- 新增 `robots.txt` 和 `sitemap.xml`；公开地址只从 `SITE_ORIGIN` 读取，避免生成未确认的生产域名。
- 已确认正式域名为 `shikakucheck.com`；生产环境应设置 `SITE_ORIGIN=https://shikakucheck.com`，canonical、robots 与 sitemap 将使用该地址。

## 2026-09-07：阶段 2 用户内容收口

- 新增 3 篇静态比较指南：宅建与行政書士、ITパスポート与基本情報技術者、日商簿記与FP技能検定。
- 新增 `/guide/` 目录与 4 篇通用指南，覆盖官方信息确认、年度计划、申込み前检查和合格率数据阅读。
- 比较指南只解释选择与核对维度，并跳转至动态比较器；没有写入日期、费用、合格率或制度等动态事实。
- 所有新增页面沿用公开页面的面包屑、日文 H1、相关页面链接与响应式阅读布局。

## 2026-08-29：阶段 2 ICS 日历下载

- 新增资格全年与单事件 ICS API，并通过 Web 同源下载路径提供给用户。
- 同一资格、年度和事实维度使用稳定 UID；`SEQUENCE` 从事实变更事件数量派生，批准变更或回滚后递增。
- 精确日期使用全天事件，带时间的事实按 `Asia/Tokyo` 输出；没有明确日期的说明性事实不生成 ICS。
- 单条事实包含多个官方日期时，按原顺序展开为稳定 occurrence 事件，避免全年 ICS 漏掉后续场次。
- 年度资格页、筛选后的日程页和每个有日期的日程事件均提供下载入口。

## 2026-08-14：阶段 2 六资格完整页面

- 六个首发资格统一开放概要、2026 年度日程、申込み・条件、試験内容、合格率五类页面。
- 年度页仅显示匹配 `examYear` 的事实，不混用其他年度。
- 分区字段支持资格特有后缀，例如 `application_open_2026_may_sessions`。
- `verify:all` 扩展为数据库 → API → 每资格 5 个 Web 页面，共 30 条页面路由回归。
- 验证结果：6/6 资格通过，30/30 页面 HTTP 200；JavaScript 30/30、Python 51/51 通过。

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
