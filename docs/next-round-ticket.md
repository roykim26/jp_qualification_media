# 轮次工单：下一轮开工前读这一页

> 本文＝**逐轮滚动的开工单**，只写「这一轮做什么、按什么顺序、卡在哪」；口径与机制的权威正文一律**不在这里复制**，改口径请改 `docs/data-gate-semantics.md`、各资格 `docs/*-source-contract.md` 与 `docs/product-design.md`。全量时点快照在 `docs/transition-handoff.md`（本文的 §5 就是它的摘要指针）。
>
> **维护约定**＝每轮收尾时**就地重写本文**（同一文件、别新开），把「当前工单」换成下一轮的；已闭合的条目删掉并在 `docs/stage-log.md` 留读数。文中任何计数只是写作时点的现取值，**开工先跑 §1**。

## 0. 当前工单＝下一轮（写于 2026-11-10）

- 仓库根＝`E:\自建程序\jp_qualification_media`，remote＝`roykim26/jp_qualification_media`。
- 写作时点现取：main＝origin/main＝**`8cfe3d6`**（PR #66＝回滚页标签小轮，5 文件 84/54；其前四个合并点 #65＝`63cede7`（回滚事件分类，5 文件 117/27）、#64＝`885a523`（交接单时点收尾，4 文件 23/11）、#63＝`a72d4b7`（开工单旧债清理，1 文件 12/12）、#62＝`de54367`（§10 回归命令表刷新，1 文件 16/15））；历史纯线性（`git rev-list --merges --count main` 为 **0**，main 每个 commit 标题带 `(#NN)` ⇒ **一律 squash PR，绝不直接 push main**）；远端只有 `refs/heads/main`，open PR **0 条**。
- **在途＝2026-11-10 #65／#66 收尾轮（纯文档）**：分支 `docs-round31-sync`（从 `8cfe3d6` 切出），把两笔代码轮的合并与 CI 读数落账，并记下 `jpqm-pg18` 容器已由号主停掉（`Exited (0)`，卷保留）。PR 号开单后现取，CI 待验。更早的六笔轮次（#61／#62／#63／#64 纯文档＋#65／#66 代码）均已合并，分支已按三重判据删净（本地＋远端）。
- **上一轮（2026-11-10）已闭合，不要重做**：基本情報 FE 停考事实 `suspension_period` 落地（#58：适配器＋3 测试＋标签，候选 1 条入库批准，`facts` 981→**982**、FE 10→**11**、baseline 11、CI 夹具 982）；工作包 H 方案稿收编并补实施结果（#59）；阶段记录与门禁读数同步（#60）；文档时点同步轮（#61）；§10 回归命令表刷新轮（#62）；开工单旧债清理轮（#63）；交接单时点收尾轮（#64）；回滚事件分类小轮（#65：`event_type` 改走 `updateEventTypeForFact()`）；回滚页标签小轮（#66：`affected_pages` 取事实自己的 `qualification_id`，`tests/rollback-event.test.ts` 共 4 条断言）。细节见 `docs/stage-log.md` 顶部当日段。
- 本地工作树只剩未跟踪 `Python/`（不提交、不删）。`git worktree list` 三个＝主工作树（`8cfe3d6`）／另一窗口的 `C:/Users/jinlo/.codex/worktrees/e24e/jp_qualification_media`（detached `97e3fc0`，**不动**）／遗留 `var/wt-docs25`（detached `88febf5`，归属未确认，删前先问）。
- ⚠ 号主常并行开多个窗口动同一仓库 ⇒ 若 §1 现取发现 main 又前进了，就以新 mergeCommit 为基线，**不要回滚别的窗口的写入**。

## 1. 开工先跑（全部只读，整条可复制）

```
set -a; . ./.env; set +a
git log --oneline -3; git rev-list --merges --count main; git branch -vv; git status --porcelain; git worktree list
GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 ls-remote --heads origin
gh pr list --state open --json number,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup
```

- 远端 git 命令**必须**带那串 `-c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1`（第一个 helper 置空以清空追加列表；不加 `http.version=HTTP/1.1` 时 push 报 `Recv failure: Connection was reset`）。
- ⚠ 仓库 git config 里有 `http.proxy=http://127.0.0.1:7890`：该端口**没在听**时要补 `-c http.proxy= -c https.proxy=` 直接连（否则 `Failed to connect to github.com port 443 via 127.0.0.1`）；**在听**时反而不能加（加了空覆盖后 push 会超时，`ls-remote` 也会挂住——2026-11-10 实测一次、跑到工具超时）。先 `netstat -ano | grep "127.0.0.1:7890.*LISTENING"` 判；**2026-11-10 现取在听，故 §1 那段命令不带空覆盖**。
- 裸 `git fetch` 偶发 `schannel: failed to receive handshake, SSL/TLS connection failed`＝本机指纹、不代表断网，远端真值只用上面的 `ls-remote --heads`。
- `gh` 侧：`gh pr create` **必须 `--body-file`**（内联 heredoc 会 exit 0 但静默不开 PR）；`gh pr merge --squash` 成功时**零输出**；`gh pr view -q` 里「字符串 + 数字」会报 `cannot add`，要用 `tostring`／`join`；`gh pr checks --watch` 偶发 `wsarecv: An existing connection was forcibly closed`／GraphQL 断连，原样重跑一次即恢复。
- 在 worktree 里开工时，`git status` 只看得到该 worktree；要判主工作树是否被别的窗口动了，用 `git -C "E:/自建程序/jp_qualification_media" status --porcelain` 现取，别据本 worktree 的干净状态推断全仓。

## 2. 待办（按建议顺序；commit／push／PR／CI 轮询／merge／删分支**各需单独一句话**，做到就停）

1. **新范畴（要新开授权单，别顺手做）**：IT Passport 的 `ipa-exam`（`76cf0e64`）与 `jitec-home`（`03af14f0`）页面 2026-11-09 已变但适配器 0 候选，事实化需扩适配器；宅建统计页多来源重构（`snapshot_from_html()` 仍把快照 id 钉在单条 `TAKKEN_SOURCE`，那条背后有已批准事实 ⇒ 该页**只能抓、不能入库**）；基本情報技術者附件提取（`toukei_fe.html` 是目录页、零 `<table>`，数据在 20 多个 PDF／xlsx，而仓内**既无 PDF 也无 xlsx 解析能力**，要先定依赖）。
2. **工作树清理**：`var/wt-docs25`（detached `88febf5`）不再需要，但归属未确认，删除属仓库操作、单独授权；`C:/Users/jinlo/.codex/worktrees/e24e` 不动。
3. **部署仍暂缓**：号主尚未购服务器；`feat/deploy-vps` 虽已随 #51 合并，也不代表上线，别提议 VPS／DNS。
4. **库容器已停（2026-11-10 号主拍板）**：`jpqm-pg18` 现为 `Exited (0)`、卷保留；要跑库侧任务先单独请示 `docker start jpqm-pg18`（起停容器属基础设施变更）。

## 3. 本机环境卡点（未解，直接决定你能跑什么）

- **库侧＝Docker 容器 `jpqm-pg18`（夹具档，现已停）**：`postgres:18-alpine`、`127.0.0.1:55432->5432`；2026-11-10 号主拍板停掉后现取 `Exited (0)`（卷保留、数据不丢），用前须单独请示 `docker start jpqm-pg18`。另有 `bailu-naming-redis`／`bailu-naming-mysql`（与本项目无关，不动）。没有 `docker compose` 起的 `jp_qualification_media-postgres-1`。⚠ `.env` 里的 `DATABASE_URL` 仍指向 `localhost:5432`（compose 库、并不存在）⇒ 跑任何库侧命令必须**显式**带 `DATABASE_URL='postgresql://postgres@127.0.0.1:55432/qualification_media'`，别靠 `.env` 默认值。
- **本机库现态（2026-11-10 现取，容器停之前）＝夹具档**：`sources` 45／`snapshots` 31／`facts` 982（takken 16／gyoseishoshi 15／it-passport 2／FE 11／bookkeeping 863／fp 75）／`candidate_facts` 994 全 approved、pending 0／`reviews` 994 全 approve／`change_events` 994（statistics_update 805／system_change 96／schedule_change 25／application_deadline 19／fee_change 15／application_open 13／eligibility_change 11／result_date 8／exam_date 2）／`schema_migrations` 21。能跑 `verify:all`、`ci:fixture` 面与门禁复算（起容器后），**不能**回答开发库的 `reviews`／`snapshots`／被拒候选（开发库已丢失，历史读数见交接单 §3，均标注为历史值）。⚠ 这是「按夹具清洗过的库」，不是带审核历史的开发库。
- 容器起停：`docker start jpqm-pg18`／`docker stop jpqm-pg18` 属基础设施变更，需单独授权；容器 2026-11-10 已停，**下一轮跑 `verify:all`／`ci:fixture:verify`／库侧计数前，先把「起容器」当一步单独请示**。上一轮建的 `%TEMP%` 临时 PG 集群已被这个容器取代，只在 Docker 再坏时按交接单 §6 重建（⚠ PG 二进制**不能放中文路径**，否则 `initdb` 报 `FATAL: invalid byte sequence for encoding "UTF8": 0xd7 0xd4`）。
- 采集器的网络坑：`.env` 的 `NO_PROXY` 含 `[::1]`，httpx 0.28.1 会抛 `InvalidURL: Invalid port: ':1]'` ⇒ 跑 collector 要 `env -u NO_PROXY -u no_proxy …` 剥掉再传 `DATABASE_URL`。
- 审核通道：`POST /internal/reviews/{candidate_id}` 只认 `x-reviewer-id` 头（值取 `ADMIN_REVIEWER_ID`，见 `apps/admin/src/server.ts:15`），`?reviewer=` 是只读降级；curl 判据前先确认 **3001** 没被残留进程占着（上一轮实测 `taskkill //PID <pid> //F` 后只剩 TIME_WAIT）。
- 测试面：**规范读数＝`npx vitest run --dir tests --pool=threads --poolOptions.threads.singleThread`，2026-11-10 现取 13 文件／124 用例**（109→120 的 11 条来自 FE 停考适配器与公开层标签；120→124 是 #65 的 3 条＋#66 的 1 条，均在 `tests/rollback-event.test.ts`）。⚠ 必须在**仓库根**跑：Bash 的 cwd 跨命令保留，`cd services/collector` 之后再跑会在收集器目录里报「No test files found」。仓库根的 `npm run test`（`vitest run tests`）里 `tests` 是**子串过滤**，会把 `var/wt-docs25` 的测试一起扫进来；裸 `npx vitest run` 会扫 `scripts/*.test.mjs` 的 node:test 文件、报「No test suite found」假 FAIL。跑前确认 **4100** 端口没被占（否则 `tests/public-api.test.ts` 抛 `EADDRINUSE`）。本机**没有 `pnpm`**，README／CI 里的 `pnpm …` 一律换 `npm run …`。
- pytest：2026-11-10 已跑全量 `npm run test:python`（`pytest services/collector/tests services/parser/tests`，两目录必须同传）＝**161 passed**，与本机 CI 同值；报数前仍要现取（FE 轮曾只跑契约那个文件的 11 条）。
- 不依赖库的本地自检＝`npm run format:check`／`npm run typecheck`／`npm run build`、`npm run lint` 需补 `--ignore-pattern "Python/**"`（裸跑只红在未跟踪 `Python/` 的 `flamegraph.js` parse error，按铁律不删不提交）、聚焦 vitest、`npm run test:verify-gate`（**10** 条纯函数断言）。
- ⚠ **worktree 在 `var/` 下时 `format:check` 会假绿**：从仓库根对 `var/wt-docsNN/...` 跑 prettier 被根 `.prettierignore` 第 4 行的 `var/` 整段跳过、回「All matched files use Prettier code style!」（#49 那轮因此让 CI 红在 `format:check`）。正确做法＝`cd var/wt-docsNN` 后用相对 glob：`node ../../node_modules/prettier/bin/prettier.cjs --write "docs/**/*.md" README.md` 再 `--check …`；给交接单 §2 表加行后必须先 `--write`，否则表格重排会让检查转红。
- **夹具计数改一处不够**：数字写在四个地方——`config/release-gate-baseline.json` 的 `expectedFacts`、`fixtures/ci/approved-facts.sql`、`scripts/verify-ci-fixture.mjs` 第 9–12 行断言、`scripts/docker-smoke.mjs` 的断言。2026-11-10 PR #58 首跑就因漏改 `docker-smoke.mjs` 而红（`expected 981 approved facts, got 982`）。
- 输出与轮询坑：`wsl`／`powershell` 在 Git Bash 下 stdout 是 **UTF-16LE**，管道给 `grep` 会被判 `Binary output` ⇒ `| iconv -f UTF-16LE -t UTF-8 | tr -d '\000'`。判 Docker 就绪看 `docker desktop status` ＋`docker info` 退出码两条。长轮询会被约 150s 的工具超时移到后台且输出文件在 workspace 外**读不回来** ⇒ **分段跑，每段 ≤100s**。`gh run view <runId> --log` 报 results-receiver 连接错误时改用 `--job <jobId> --log`（多数情况原样重试即成功）。CI 日志里有 ANSI 转义，`grep` 用 `-a`。
- 自动权限门：`createdb`／`pg_restore`／`docker exec … psql -c "写语句"` 会被分类器判「写操作」直接拒，**即使上一句授权覆盖了整条流程也要再说一句**（2026-10-13／10-25 实测反复被拦）；`docker compose up -d` 同样按基础设施变更拦。

## 4. 铁律速记（全文见 `docs/transition-handoff.md` §1，违反即返工）

- 采集／候选入库／逐条批准＝**三次独立授权**；commit、push、PR、CI 轮询、merge、删分支、`db:migrate`、`db:seed`、写库、DROP 一律等号主「一句话」，**一步一停**（操作类命令可直接跑、不用他点同意）。
- 改 `config/data-coverage-contract.json`（判级面）＝产品决策，另行请示；`config/release-gate-baseline.json`、CI 夹具、`verify-ci-fixture.mjs`、`docker-smoke.mjs` 属同一条计数链，必须**同一个 PR** 一起改（baseline 是下限：只抬 baseline 不重导夹具，本机绿、CI 必红）。
- `git add --` **逐路径，绝不 `-A`**；仓库根未跟踪的 **`Python/` 永不提交、也不要删**。
- 临时件放 gitignored 的 `var/` 并在提交前删（往轮遗留的 `var/` 文件别动）；`uv run` 生成的 `services/collector/uv.lock` 是未跟踪的本地产物（CI 用 pip 装包），提交前删掉。
- **判据可复跑、数字要现取**：报任何计数前先跑只读命令；发命令那条消息不得预写读数；写库用词分三态（「入库 N 条」要带 `pending_review` 与「未公开」，「批准 N 条」要带 `facts` 计数变化）。
- 门禁语义：非合成 `pending_review != 0` ⇒ `verify:all` **硬失败**（设计内中间态）；`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` ⇒ 历史统计类**永远不会把门禁跑红**，属产品覆盖债，只能靠人记着。FE 的维度全 NULL，三个 `{deliveryMode:"cbt"}` 条件字段因此不参与检查 ⇒ **6/6 ≠ 字段齐全**。
- 并行窗口：优先 `git worktree` 隔离；**不碰主工作树里的未提交改动、不回滚别的窗口的写入**；删分支前先确认它确实属于自己这轮。

## 5. 该读的权威文档（口径不写在本文）

- `docs/transition-handoff.md`＝时点快照＋铁律全文＋§6 可复跑判据命令（含库丢失后的恢复命令组）＋§7 GitHub 通路＋§8 审核通道操作口径。
- `docs/data-gate-semantics.md`＝门禁／判级／溯源／三级授权／鉴权总口径（§6 批准链、§8.1 三态术语、§9 baseline 与夹具维护的现态读数、§10 回归命令表）。§10 已于 2026-11-10 刷新为本机全量实测读数（现为 #66 后：vitest 13／124、pytest 161、gate 10/10、夹具 982、`data:staleness` 行），本页 §3 与之同源。
- 各资格契约：`docs/bookkeeping-source-contract.md`、`docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`、`docs/it-passport-source-contract.md`、`docs/fp-source-contract.md`；宅建没有独立契约文件，阶段闭环与 `source:takken:retio-exam` 登记说明在 `docs/stage1-takken.md`。
- `docs/product-design.md`＝SEO／页面收录契约（18.2 参数筛选页 `noindex,follow`、`:1081` Sitemap 只放可索引 200 正式页；#45 起 sitemap＝状态门＋按内容，空栏目页 `noindex` 且不收；#46 起 `/updates/?page=` 与筛选页 `noindex,follow`、sitemap 仍只收 `/updates/`；#48 起首页工具卡为真链接、主な資格 6 项、非法 ICS 直连走站内 404／错误页）。
- `docs/stage-log.md`＝逐轮交付读数（每轮一段，含踩坑），要「上一轮到底做了什么」看这里而不是看本文。
- `docs/work-package-g-history-presentation.md`＝历年统计接公开面（G-1／G-2）的方案与执行记录；`docs/work-package-h-suspension-fact-proposal.md`＝FE 停考事实的方案、拍板与实施结果（已闭合，只作追溯）；`docs/work-package-f-statistics-sources.md`＝历史统计来源的调研与缺口定性。
- ⚠ `docs/codex-handoff.md` 与 `docs/codex-handoff-next.md` 是 **2026-08-11 时点的归档**（文首自述「仅供追溯」），不要据它们推当前状态。
