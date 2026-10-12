# 交接单：簿記批准轮已收口（2026-10-13 时点；非合成 `pending_review` 归 0、门禁 6/6）

> 本文是**时点快照**，供复制进新会话接续开发用。文中所有数字都是 2026-10-13 本机实测读数，**下一轮必须先按 §6 的命令现取，别把本文的数当结论**。口径权威定义在 `docs/data-gate-semantics.md`（§6 是批准链机制、§8.1 是三态术语、§9 是 baseline 与夹具维护），簿记账目在 `docs/bookkeeping-source-contract.md`。

工作目录＝仓库根 `E:\自建程序\jp_qualification_media`；第九轮同步本行时 main＝origin/main＝**`727ffb9`**（PR #31 合并点＝第八轮纯文档：#30 的 CI 实测读数落账＋删 10 条已合并分支），本单自己的合并会把它顶掉 ⇒ 下一轮以 `git log --oneline -1` 现取为准。历史纯线性（`git rev-list --merges --count main` 为 0），main 每个 commit 标题都带 `(#NN)`＝**一律走 squash PR，不直接 push main**。仓库在第八轮清理后**只剩 main 一条分支**（本地＋远端，`git ls-remote --heads origin | wc -l` = 1），本轮工作分支 `docs-handoff-round9-sync` 是清理后新增的第一条 ⇒ 下一轮直接开新分支即可，不必先挑残留分支；要删这条仍另需一句话。

**批准链已走完，别再找批准任务**：簿记 807 条候选的三次独立授权（采集／入库／批准）已全部由号主行使完毕，2026-10-13 批完最后 772 条 ⇒ 非合成 `pending_review` **0**、`facts` **176 → 981**、门禁自行恢复 **6/6**。剩余待办见 §4，都属新范畴（宅建多来源、FE 附件提取、把 863 条统一表数据接到公开面呈现、批准链的机制债）。

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

| PR  | 内容                                                                            | main SHA  |
| --- | ------------------------------------------------------------------------------- | --------- |
| #21 | F-2 簿记 6 条历年序列子页采集侧登记（7 页已抓，实抓读数与逐条哈希在授权单 §8）  | `08e18f1` |
| #22 | 统计页入库映射＋身份键补 `exam_session` 回合维度（迁移 `0017`）                 | `fcba8c4` |
| #23 | 只读写库前预检 CLI `collector.precheck_bookkeeping`＋三态文档口径               | `bb8c73f` |
| #24 | 迁移 `0018` 登记七条统计来源；本机 apply `0017`＋`0018`；预检判据改「列存在性」 | `1c38a45` |
| #25 | `docs/stage-log.md` 补第三轮交付段与 `db:seed` 读数（纯文档）                   | `442a7e7` |
| #26 | 预检加 `--breakdown`，把待入队候选的审核量分解固化成常驻命令                    | `fa42e90` |
| #27 | 新文档 `docs/transition-handoff.md`（即本单）＋ README 指针（纯文档）           | `a193e69` |
| #28 | `docs/stage-log.md` 补第四轮交付段＋本单就地同步（纯文档）                      | `eac1584` |
| #29 | `docs/stage-log.md` 补第五轮（807 条入库＋门禁转红）＋本单同步（纯文档）        | `203d06e` |
| #30 | 批准轮收口：baseline 58→863＋CI 夹具 176→981 同批＋四份文档交付段               | `32c4b84` |
| #31 | 第八轮纯文档：#30 的 CI 实测读数落账＋删 10 条已合并分支的三重判据与末态        | `727ffb9` |

批准链的三次授权落点（都已在库里，不要重跑）：抓取 2026-10-12 早（磁盘 7 页，`var/official-snapshots/`）；入库 2026-10-12T10:38Z 另一窗口 `ingest_bookkeeping` EXIT=0 产 807 条候选；批准分两段——2026-10-12 批 **35 条**（ネット数值 28 ＋ 口径 7 只产 5 条 `facts`）⇒ `facts` 176 → 209，2026-10-13 按級分三档批完 **772 条**（196／288／288）⇒ 209 → **981**。`reject` 全程 0 条。

另外这些口径**已拍板且均为「维持现状」**，别再重开：ネット／初級的裸「受験者数」不映射任何字段；簿記初級／4 級／原価計算初級不进覆盖契约；`pass_rate` 存官方印刷百分数原值（转写不换算，`value_type='decimal'`）；ネット两条 `statistics_methodology` 槽**以页首引言为 current**，列头那条保留为已批准但非 current（2026-10-13 拍板，取证坐标见 `docs/data-gate-semantics.md` §6）。

迁移是否落后的**唯一可靠判据**＝查列：`information_schema.columns` 里 `candidate_facts.exam_session` 存在即已应用 `0017`。不要用「`schema_migrations` 行数 vs 迁移文件数」推断——`packages/db/src/migrate.ts` 以**文件名**为主键且不校验记录，0010→0016 改名留下的孤儿记录会让两者在真的缺一条迁移时恰好相等。

## 3. 本机库与配置现态（2026-10-13 实测，每轮请重取）

`schema_migrations` 20、`sources` 47（`qualification_id` NULL 0）、`facts` 非合成 approved **981**、`candidate_facts` **1075 approved ＋ 13 rejected ＋ 0 pending_review**、`reviews` **1006**（approve 983／reject 18／requeue 5）、`snapshots` **44**、`source_scopes` 0。磁盘快照**没有重抓**，`snapshots` 44 是入队时登记的快照行。

门禁与预检都是绿态：`npm run verify:all` ⇒ `status=passed`、**6 passed／0 failed**、EXIT=0，簿记 `approved_official` **863**、`api.facts` **863**、五个公开页 200、`coverageGaps: []`，其余五格 16／15／2／10／75。只读预检 ⇒ `summary: stored=903 computed=865 skipped_approved=865 would_stage=0 blocking=0`、**EXIT=0**。⚠ 读预检别只看退出码：`blocking=0／EXIT=0` 在「未入队」与「已批完」两种终态上形状相同，要靠 `skipped_approved` 与 `would_stage` 两列区分（五次读数表在 `docs/bookkeeping-source-contract.md`）。第九轮（2026-10-13，纯文档轮）把本节全部数字复跑了一遍 ⇒ 库侧计数、`verify:all` 6/6、预检 `would_stage=0 blocking=0`、pytest **158 passed** 逐字未动。

`config/release-gate-baseline.json` 与 CI 夹具**已同批刷到 981 口径**：bookkeeping `expectedFacts` 58 → **863**（其余五格不变），`fixtures/ci/approved-facts.sql` 176/176/176/25 → **981/981/981/29**（`scripts/verify-ci-fixture.mjs` 第 9–12 行四个断言同步改）。⚠ 两者必须同批：baseline 是**回归下限**（`scripts/verify-lib.mjs:215` 判 `approved_official < expectedFacts`），只刷 baseline 不重导夹具 ⇒ 本机照绿而 CI 必红在 `approved official 58 below regression floor 863`。

⚠ 连库报 `ECONNREFUSED ::1:5432 / 127.0.0.1:5432` 多半是 **docker compose 的 postgres 容器没在跑**（容器名 `jp_qualification_media-postgres-1`，`postgres:16-alpine`），`docker compose up -d postgres` 即恢复；Windows 服务里没有 postgres，`psql` 也不在 PATH（查库用 `node` ＋ `pg` 的 `Client`，连接串走 `.env`）。

⚠ 查库列名：状态列叫 **`status`**、来源列叫 **`source_id`**（写成 `review_status`／`source_key` 会得到 `column ... does not exist`，而不是「0 条」）。⚠ **`synthetic` 只在 `candidate_facts` 与 `snapshots` 上存在，`facts` 表没有这一列**（2026-10-13 实测：`select count(*) from facts where synthetic=false` ⇒ `column "synthetic" does not exist`）⇒ 数「非合成现行事实」必须照 `scripts/verify-lib.mjs:154-177` 的链取：`facts f → fact_revisions fr（fr.id=f.current_revision_id）→ candidate_facts c → snapshots s / sources src`，条件是 `f.status`／`fr.status`／`c.status` 三者全 `approved` 且 `c.synthetic=false`（本轮实测合计 981＝簿记 863＋其余五格 16／15／2／10／75，与 §3 逐格相符）。`reviews` 的决定列叫 **`decision`**（text，非枚举），按它分组即得 approve 983／reject 18／requeue 5。⚠ 判退出码：`npm run verify:all 2>&1 | tail -30` 之后再取 `$?` 拿到的是 **`tail`** 的退出码 ⇒ 先重定向到文件再 `echo $?`，或用 `${PIPESTATUS[0]}`。⚠ 本机 **没有 `pnpm`**，README 里那串 `pnpm …` 等价换成 `npm run …`。

## 4. 待办（按建议顺序，每件都要单独授权）

**已闭合（2026-10-13 第八轮）**：删已合并分支＝实际 **10 条**（本单旧版记的 9 条漏了 `docs-wpf-round5-ingest-record`＝PR #29 的分支），本地＋远端全删，`git ls-remote --heads origin | wc -l` 现为 **1**。⚠ squash 合并的仓库里 `git branch -d` 必报 `not fully merged`、`git rev-list --count main <branch>` **恒为 1**（这不是「未合并」的证据），可用判据是三条一起过：`gh pr list --state merged --head <branch>` 拿到 `mergeCommit`＋`headRefOid` → 核 `headRefOid` 与本地／远端 tip 三者相等 → `git diff --diff-filter=A --name-only main <branch>` 计数 0。细节在 `docs/stage-log.md` 第八轮。

1. **宅建统计页多来源重构**：`snapshot_from_html()` 仍把快照 id 钉在单条 `TAKKEN_SOURCE`，而那条背后有已批准事实 ⇒ 这页**只能抓、不能入库**。要动的是 collector 代码＋可能的迁移，属新授权。
2. **基本情報技術者附件提取**：`toukei_fe.html` 只是附件目录页（零 `<table>`，数据全在 20 多个 PDF／xlsx 里），而全仓**既无 PDF 也无 xlsx 解析能力** ⇒ 要另开「附件提取」授权并先定依赖。
3. **把 863 条统一表数据接到公开面**：现在它们已是可判级的现行事实（`approved_official` 863、`coverageGaps: []`），但页面呈现与判级面（`config/data-coverage-contract.json`）都还没为历年序列设计 ⇒ 属产品决策，先议再动。
4. **批准链的遗留机制债（不急，但要知道）**：`approve` 无撤销接口（`docs/data-gate-semantics.md` §6 第 2 条），同槽覆盖会让 `facts.id` 与实际 current 候选名实不符（第 3 条）。要补「撤销真实快照事实」的能力属改代码＋改鉴权面，另需授权。
5. **文档欠账**：**已闭合（2026-10-13 第九轮）**＝本单文头 main SHA、§2 交付表补 `#31`、§3 列名口径纠正与 README 指针同步到 `727ffb9`。⚠ 但这是**每轮必欠一次**的结构：本单合并后这些数立刻又过时一轮，惯例仍是下一轮开 PR 时顺手补，不需要单独立项。

## 5. 三条容易踩空的产品事实

- **F 永远不会把门禁跑红**：`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` 的 requirement，历史统计类正属此类 ⇒ 这是产品覆盖债，不会自己浮出水面，只能靠人记着。
- **审核量的换算按「不同 `evidence_text` 段数」而不是候选条数**：統一表每行拆 4 条候选共享一段原文，807 条候选实际只有 210 段（統一 193 ＋ ネット 14 ＋ 口径 3）。估人工时照这条。
- **本机批准不会自动进 CI 夹具**：夹具要 `ci:fixture:export` 重导＋四个硬编码计数同步（§3 末段）。重导与 `baseline:update` 都有双重确认开关，且**都拒绝在非合成 pending 未清零时执行**，所以顺序永远是：批完 → `verify:all` 6/6 → `baseline:update` → `ci:fixture:export` → `ci:fixture:verify`。
- ⚠ 本机想做 CI 复刻需要新建临时库，而 `CREATE DATABASE` 会被自动模式按「基础设施变更」拦下（2026-10-13 实测）。替代判据：核对夹具引用的 `source_id` 是否全部由迁移登记（本轮 23 条全命中，缺失 0）。

## 6. 可复跑判据命令（本机实测通）

```
set -a; . ./.env; set +a
PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.precheck_bookkeeping --breakdown
PYTHONIOENCODING=utf-8 uv run --project services/collector python -m pytest services/collector/tests services/parser/tests -q
npm run format:check
npm run verify:all
npm run ci:fixture:verify
```

- 预检只 `SELECT`；退出码 0＝无阻塞项、1＝有阻塞项、2＝缺 `DATABASE_URL` 或参数不认识。
- 库侧计数（`facts`／`pending_review`／`reviews`／`snapshots`）把 SQL 写成 `var/` 下的脚本再 `node var/x.mjs` 跑，别拼一行式内联 SQL（一行式命令通体不要带单引号与反引号）。本轮用的四条判据语句已归档进 `docs/stage-log.md` 第七轮与 `docs/bookkeeping-source-contract.md`。
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
- 合并后回读远端：`GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 fetch origin main`。

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

| 文档                                                                                                                     | 管什么                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `docs/data-gate-semantics.md`                                                                                            | 门禁／判级／溯源／三级授权／鉴权总口径；§6 批准链三条机制；§8.1 三态术语；§9 baseline 与夹具；§10 回归读数 |
| `docs/bookkeeping-source-contract.md`                                                                                    | 簿记来源登记、统计页入库映射、写库前预检码表、`--breakdown` 与批准推进的五次读数表                         |
| `docs/work-package-f-statistics-sources.md`                                                                              | 历史统计来源只读调研（27 条候选 URL、为何第一批只能做 3 个 HTML 来源）                                     |
| `docs/work-package-f-live-capture-authorization.md`／`docs/work-package-f2-bookkeeping-history-capture-authorization.md` | F／F-2 授权单原文与执行记录（§8 逐条哈希）                                                                 |
| `docs/runbook.md`                                                                                                        | 当前发布门禁与资格范围                                                                                     |
| `docs/stage-log.md`                                                                                                      | 逐轮阶段记录（含各轮交付与读数）                                                                           |
