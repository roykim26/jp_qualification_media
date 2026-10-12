# 交接单：工作包 F 批准轮待启（2026-10-12 时点；入库已于同日按授权完成）

> 本文是**时点快照**，供复制进新会话接续开发用。文中所有数字都是 2026-10-12 本机实测读数，**下一轮必须先按 §6 的命令现取，别把本文的数当结论**。口径权威定义在 `docs/data-gate-semantics.md`（§8.1 是三态术语），逐资格账目在 `docs/<qualification>-source-contract.md`。

工作目录＝仓库根 `E:\自建程序\jp_qualification_media`；本单合并进 main 后该点为 **`eac1584` 及其后一个 docs commit**（下一轮以 `git log --oneline -1` 现取为准）。历史纯线性（`git rev-list --merges --count main` 为 0），main 每个 commit 标题都带 `(#NN)`＝**一律走 squash PR，不直接 push main**。

## 1. 铁律（号主长期口径，违反即返工）

- 采集／候选入库／逐条批准＝**三次独立授权**，一次授权只管一件事。commit、push、merge、删分支、`db:migrate`、`db:seed`、写库、DROP 一律等号主明示「一句话」；做到需授权的步骤就停下问。
- 改 `config/data-coverage-contract.json`（判级面）属产品决策，必须另行请示。
- 不用未确认的值补事实；`normalized_value` 用官方原文；官方只写「会場ごとに異なる」这类就记规则型事实，不得编造全国统一值。
- 非合成 `pending_review` 会让门禁 `pending_official != 0` **硬失败**，这是设计内的中间态，不是故障。
- 写库前先跑只读预检；写库绝不带 `NODE_ENV=production`，`DATABASE_URL` 只允许 localhost。
- 汇报写库动作按三态用词：「入库 N 条」要同句带 `pending_review` 与「未公开」；「批准 N 条」要带 `facts` 计数变化（如 167→176）。
- 判据要可复跑、数字要现取：报任何计数前先跑只读命令；不要交一次性临时探针（重要判据应固化进常驻命令面，本轮的 `--breakdown` 就是这一条的落地样例）。
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

另外这些口径**已拍板且均为「维持现状」**，别再重开：ネット／初級的裸「受験者数」不映射任何字段；簿記初級／4 級／原価計算初級不进覆盖契约；`pass_rate` 存官方印刷百分数原值（转写不换算，`value_type='decimal'`）。

迁移是否落后的**唯一可靠判据**＝查列：`information_schema.columns` 里 `candidate_facts.exam_session` 存在即已应用 `0017`。不要用「`schema_migrations` 行数 vs 迁移文件数」推断——`packages/db/src/migrate.ts` 以**文件名**为主键且不校验记录，0010→0016 改名留下的孤儿记录会让两者在真的缺一条迁移时恰好相等。

## 3. 本机库现态（2026-10-12 实测，每轮请重取）

`schema_migrations` 20、`sources` 47（`qualification_id` NULL 已归 0）、`facts` approved **176**、`candidate_facts` **268 approved ＋ 13 rejected ＋ 807 pending_review（合计 1088）**、`snapshots` **44**、`source_scopes` 0。

**807 条候选已入队（第二次授权已由号主行使）**：2026-10-12T10:36:41Z 号主在另一个窗口说「真入库 807 条」，该窗口确认守卫（`BOOKKEEPING_LOCAL_WRITE=1`＋非 `NODE_ENV=production`＋`DATABASE_URL` 主机 localhost）后跑 `python -m collector.ingest_bookkeeping`，**EXIT=0**，逐来源 `197／289／289／32`；库内插入窗 **10:38:24–10:38:40Z（本地 18:38）**，全部非合成、全部 `risk_level=high`、全部挂 `qualification:bookkeeping`。**批准仍是 0 条** ⇒ 公开面一字未动（`facts` 仍 176、簿记五个页仍 200）。`snapshots` 40 → 44 是入队时为四个统计页登记的快照行，**磁盘快照文件没有重抓**。

⇒ 本机门禁此刻**按设计转红**：`npm run verify:all`＝`"status": "blocked"`、**5 passed／1 failed**、EXIT=1，唯一失败项 `bookkeeping: ["official pending 807 != 0"]`（同格 `pending_synthetic: 0`／`approved_official: 58`／`coverageGaps: []`）。CI 不受本机 pending 影响（`release-gate` 跑 `fixtures/ci/approved-facts.sql` 空库夹具）⇒ PR 链路照常绿。

⚠ 连库报 `ECONNREFUSED ::1:5432 / 127.0.0.1:5432` 多半是 **docker compose 的 postgres 容器没在跑**（容器名 `jp_qualification_media-postgres-1`，`postgres:16-alpine`），`docker compose up -d postgres` 即恢复；Windows 服务里没有 postgres，`psql` 也不在 PATH（查库用 `node -e` ＋ `pg` 的 `Client`，连接串走 `.env`）。

⚠ 查库列名：`candidate_facts` 与 `facts` 的状态列叫 **`status`**、合成标记叫 **`synthetic`**（写成 `review_status`／`is_synthetic` 会得到 `column ... does not exist`，而不是「0 条」）。⚠ 判退出码：`npm run verify:all 2>&1 | tail -30` 之后再取 `$?` 拿到的是 **`tail`** 的退出码，会把 EXIT=1 读成 0 ⇒ 先重定向到文件再 `echo $?`，或用 `${PIPESTATUS[0]}`。

## 4. 待办（按建议顺序，每件都要单独授权）

1. ~~真入库~~ **已于 2026-10-12 按号主授权执行完毕（见 §3），别再重复跑**：同一命令再跑一次会撞 `candidate_facts` 主键，只读预检此刻的 `blocking=4 id_collision` 就是「这批已入队」的回执而非新障碍。入库侧守卫留档备查：必须 `BOOKKEEPING_LOCAL_WRITE=1`、非 `NODE_ENV=production`、且 `DATABASE_URL` 主机是 localhost/127.0.0.1。
2. **逐条批准（第四次授权）＝当前唯一的下一步写库动作**：⚠ **先议策略再动手**。`--breakdown` 的实跑分布（2026-10-12，入队前后同数）：

   | 维度       | 分布                                                                                                                                               |
   | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
   | 来源       | `class2` 289／`class3` 289／`class1` 197／`class23-net` 32                                                                                         |
   | 級别／方式 | 2 級 unified 289（2002–2026、72 回合）；3 級 unified 289（同）；1 級 unified 197（49 回合）；2 級 network 16、3 級 network 16（2020–2026、无回合） |
   | 字段       | `pass_rate` 207／`passed` 207／`applicants` 193／`examinees` 193／`statistics_methodology` 7                                                       |
   | 风险级     | `high` **807＝全部**（无 `low`／`medium` 子集可自动放行）                                                                                          |
   | 值类型     | integer 593／decimal 207／text 7                                                                                                                   |

   需要号主定：是否分批（建议按来源／年度切）、走 admin `POST /internal/reviews/{id}` 逐条打还是先只批 1 級那一序列、reject 的判定标准。批准才是写 `facts`，必须附 `facts` 计数变化。鉴权口径：写只认 `x-reviewer-id` 头，`?reviewer=` 查询参数是**降级只读**（重放面，别用）。

3. **stage-log 与本单的同步欠账**：第四轮交付段已随 #28 进档；本轮（#28 之后那一轮）补的是**第五轮**＝「#28 合并」＋「另一窗口按授权完成 807 条入库、本机门禁转红、批准仍 0」。按本项目惯例（main 每个 commit 都经 PR 进来），**第五轮自身的交付段仍欠**，随下一个 PR 提交，届时要一并给本单 §2 的表补上那一行、并把文头的 main SHA 换成新值。
4. **删已合并分支**（8 个：`wp-f2-bookkeeping-history-capture`、`wp-f-bookkeeping-statistics-mapping`、`wp-f-bookkeeping-precheck`、`wp-f-statistics-source-registration`、`docs-stage-log-wpf-round3-delivery`、`wp-f-precheck-breakdown`、`docs-transition-handoff`、`docs-wpf-round4-delivery`）。即使用户已授权合并，删分支也要单独问一句；squash 后 `git branch -d` 必报 `not fully merged`，先 `git diff main <branch>` 确认**输出为空**再 `-D`。
5. **两条旧债**：宅建统计页多来源重构（`snapshot_from_html()` 仍把 id 钉在单条 `TAKKEN_SOURCE`，那条背后有已批准事实 ⇒ 这页**只能抓、不能入库**）；基本情報技術者 `toukei_fe.html` 只是附件目录页（零 `<table>`，数据全在 20 多个 PDF／xlsx 附件里），而全仓**既无 PDF 也无 xlsx 解析能力** ⇒ 要另开「附件提取」授权并先定依赖。

## 5. 两个容易踩空的产品事实

- **F 永远不会把门禁跑红**：`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` 的 requirement，历史统计类正属此类 ⇒ 这是产品覆盖债，不会自己浮出水面，只能靠人记着。
- **`--breakdown` 的 `blocking=0`／EXIT=0 只代表「代码与库层面允许入队」**，不是入库授权；`breakdown.total` 恒等于 `summary` 的 `would_stage`（用例钉住了这条不变量），且已扣掉写入侧「值与维度都与已批准事实相同则跳过」的保护。
- **入库之后再跑预检的新读法**：现在是 `stored=903 … would_stage=807 blocking=4`、**EXIT=1**，四条全是 `id_collision`＝「这批 id 已在库里」的回执，**别把它当成新障碍**。⚠ 已知口径缺口：`would_stage` 不扣同 id 的 pending 行，所以入队后仍报 807；要让预检区分「未入队／已入队待批」属代码改动，需单独授权。

## 6. 可复跑判据命令（本机实测通）

```
set -a; . ./.env; set +a
PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.precheck_bookkeeping --breakdown
PYTHONIOENCODING=utf-8 uv run --project services/collector python -m pytest services/collector/tests services/parser/tests -q
npm run format:check
npm run verify:all
```

- 预检只 `SELECT`；退出码 0＝无阻塞项、1＝有阻塞项（可直接当真入库的前置门禁）、2＝缺 `DATABASE_URL` 或参数不认识。
- pytest **必须同传 collector 与 parser 两个目录**（只传 parser 会 `ModuleNotFoundError`，因为 `pythonpath` 是按 collector 的 ini 解析的）；本轮基线 158 passed，**该数字每轮都会变**。
- `format:check` 用项目自己的 glob，别用宽 glob（会稳定虚报 `fixtures/official-snapshots/takken-synthetic.json`）。
- 本会话的 Git Bash **没有 `pnpm`**（README 里那串 `pnpm verify:all` 等价于 `npm run verify:all`）。
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

## 8. 该读的权威文档

| 文档                                                                                                                     | 管什么                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `docs/data-gate-semantics.md`                                                                                            | 门禁／判级／溯源／三级授权／鉴权总口径；§8.1 三态术语；§3 FE 缺口差集；§11 第 8 条本机 47 vs CI 45 的来源计数差 |
| `docs/bookkeeping-source-contract.md`                                                                                    | 簿记来源登记、统计页入库映射、写库前预检码表与 `--breakdown` 读数                                               |
| `docs/work-package-f-statistics-sources.md`                                                                              | 历史统计来源只读调研（27 条候选 URL、为何第一批只能做 3 个 HTML 来源）                                          |
| `docs/work-package-f-live-capture-authorization.md`／`docs/work-package-f2-bookkeeping-history-capture-authorization.md` | F／F-2 授权单原文与执行记录（§8 逐条哈希）                                                                      |
| `docs/runbook.md`                                                                                                        | 当前发布门禁与资格范围                                                                                          |
| `docs/stage-log.md`                                                                                                      | 逐轮阶段记录（含各轮交付与读数）                                                                                |
