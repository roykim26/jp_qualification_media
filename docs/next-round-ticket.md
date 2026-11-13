# 轮次工单：下一轮开工前读这一页

> 本文＝**逐轮滚动的开工单**，只写「这一轮做什么、按什么顺序、卡在哪」；口径与机制的权威正文一律**不在这里复制**，改口径请改 `docs/data-gate-semantics.md`、各资格 `docs/*-source-contract.md` 与 `docs/product-design.md`。全量时点快照在 `docs/transition-handoff.md`（本文的 §5 就是它的摘要指针）。
>
> **维护约定**＝每轮收尾时**就地重写本文**（同一文件、别新开），把「当前工单」换成下一轮的；已闭合的条目删掉并在 `docs/stage-log.md` 留读数。文中任何计数只是写作时点的现取值，**开工先跑 §1**。

## 0. 当前工单＝下一轮（写于 2026-11-13，baseline 1007 刷新轮闭合＋文档落账后）

- 仓库根＝`E:\自建程序\jp_qualification_media`，remote＝`roykim26/jp_qualification_media`。
- 写作时点现取：main＝origin/main＝**`1158457`**（baseline／CI 夹具刷新轮 **PR #79** squash，999→1007 facts／37 snapshots 不变）；其前是 `696ff03`（D2 历史年度轮文档落账 **PR #77**）、`2be681d`（另一窗口品牌 logo 全站补齐 **PR #76**）、`2e82641`（**PR #75**）。历史纯线性（`git rev-list --merges --count main`＝**0**，squash 不产生 merge commit）。**另一窗口 PR #78（`chore/dev-env-file`，head `4c471a0`）在途 OPEN，不碰**；#79 合并后 main push CI run `43342694532` 本轮现取＝**success**（双绿）。
- **提交通道口径**：默认仍走 squash PR；**直推 main 只在号主对该轮明示批准时用**（先例＝P1-1 各轮、B 轮与工作包 J）。直推绕过 release-gate 必需检查但**仍触发 push CI，必须 watch 到绿**才算收口。
- **上一轮（2026-11-12 夜～11-13）已闭合，不要重做＝baseline／CI 夹具刷新轮（999→1007）**：AskUserQuestion 拍板「刷＋squash PR」→ 四处计数链同批（baseline FE 20→28／夹具全量重导 **1007×3／37**＝3,214 行 2,218,265 字节、D2 八条纯新增零值差／`verify-ci-fixture.mjs` 9–11 行→1007／`docker-smoke.mjs` 346／356→1007，359／360 快照数 37 不变）→「提交」`b00ce53`（4 文件 30+/6−）→「push 并开 PR」#79 →「盯 CI」run `43339301778` 双绿 →「合并」squash **`1158457`**（2026-11-13T01:09:08Z）→「盯合并后 CI」run `43342694532` 双绿 →「删分支」`chore/baseline-fixture-1007`（三重判据）⇒ **本机库／baseline／CI 夹具三方一致 1007／37**。**D2 轮交付补落账**：文档 commit `5dddc0b` 经 rebase 对齐另一窗口 #76 后为 `38dfd32`（8 文件 66+/37−）→ PR #77 → run `43215890696` 双绿 → squash `696ff03`（2026-11-12T12:37:28Z）→ run `43219610763` 双绿 → 分支 `docs/d2-fe-history-close` 已删。**D1 月度附件刷新仍挂起**（登记 `202609_fe_01_suiihyo.xlsx`，等 IPA 新月度版）。**`feat/p0-1-core-facts` 已拍板保留**（未合并遗留：cherry 全 `+`、diff vs main 76 文件 519+/4510−、内容已被后续轮超越，留档不删）。本落账轮（纯文档）同步九处文档（含本工单）；commit／PR 待授权。
- 本地工作树（本落账轮现取）：主工作树在 **main**（`1158457`），干净（仅未跟踪 `Python/`、`vibe_images/`）。`git worktree list` 四个＝主工作树／另一窗口的 `C:/Users/jinlo/.codex/worktrees/e24e/jp_qualification_media`（detached `97e3fc0`，**不动**）／遗留 `var/wt-docs25`（detached `88febf5`，归属未确认，删前先问）／`var/wt-mvp-execution`（`feat/p0-1-core-facts` `82eca10`，**已拍板保留、不动**）。本地分支＝`main`＋`chore/dev-env-file`（另一窗口 #78 在途）＋`feat/p0-1-core-facts`；远端 heads 3＝main／chore/dev-env-file／feat/p0-1-core-facts。此前轮保留的已合并分支（`docs/baseline-close-999`、`chore/baseline-fixture-999`、`feat/brand-logo`、`feat/mvp-execution`）本轮现取本地与远端均已不存在（无需再删）。未跟踪 `Python/`（永不提交、不删）与 `vibe_images/`（另一窗口）照旧。
- ⚠ 号主常并行开多个窗口动同一仓库 ⇒ 每次写入前重新现取 main；若 main 又前进了，就以新 commit 为基线，**不要回滚别的窗口的写入**。

## 1. 开工先跑（全部只读，整条可复制）

```
set -a; . ./.env; set +a
git log --oneline -3; git rev-list --merges --count main; git branch -vv; git status --porcelain; git worktree list
GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 ls-remote --heads origin
gh pr list --state open --json number,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup
```

- 远端 git 命令**必须**带那串 `-c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1`（第一个 helper 置空以清空追加列表；不加 `http.version=HTTP/1.1` 时 push 报 `Recv failure: Connection was reset`）。
- ⚠ 仓库 git config 里有 `http.proxy=http://127.0.0.1:7890`：该端口**没在听**时要补 `-c http.proxy= -c https.proxy=` 直接连（否则 `Failed to connect to github.com port 443 via 127.0.0.1`）；**在听**时反而不能加（加了空覆盖后 push 会超时，`ls-remote` 也会挂住——2026-11-10 实测一次、跑到工具超时）。先 `netstat -ano | grep "127.0.0.1:7890.*LISTENING"` 判，**每轮现取、别沿用上一轮结论**（2026-11-13 本轮现取在听、未加空覆盖）。
- 裸 `git fetch` 偶发 `schannel: failed to receive handshake, SSL/TLS connection failed`＝本机指纹、不代表断网，远端真值只用上面的 `ls-remote --heads`。
- `gh` 侧：`gh pr create` **必须 `--body-file`**（内联 heredoc 会 exit 0 但静默不开 PR）；`gh pr merge --squash` 成功时**零输出**；`gh pr view -q` 里「字符串 + 数字」会报 `cannot add`，要用 `tostring`／`join`；`gh pr checks --watch` 偶发 `wsarecv: An existing connection was forcibly closed`／GraphQL 断连，原样重跑一次即恢复；**push 后旧 failed run 会让 `--watch` 提前退出**，要盯的是新 head 对应的那条 run。
- 在 worktree 里开工时，`git status` 只看得到该 worktree；要判主工作树是否被别的窗口动了，用 `git -C "E:/自建程序/jp_qualification_media" status --porcelain` 现取，别据本 worktree 的干净状态推断全仓。

## 2. 待办（按建议顺序；commit／push／PR／CI 轮询／merge／删分支**各需单独一句话**，做到就停）

1. **FE 统计月度附件刷新（D1，挂起至漂移）**：推移表附件名按月滚（当前登记 `202609_fe_01_suiihyo.xlsx`）；2026-11-12 D2 轮现取当日目录页快照无漂移。新月度版发布后开新轮：实抓新附件（一次采集授权，先固化现有快照备份）→改 `FUNDAMENTAL_IT_SOURCES` canonical_url＋迁移 0030（旧值守卫 UPDATE）＋文档同批→本机应用迁移／入库／批准各需单独一句话。⚠ 目录页哈希一变 `statistics_methodology` 换号成新 pending 须同批批准；xlsx 哈希一变该页全部候选换号（kinzai 先例）。~~令和5/6 历史年度入库~~ **已由 D2 轮闭合**（8 条批准，FE 28／facts 1007）。口径见 FE 契约「D2 历史年度轮」节与 J 方案稿 §11 补记。
2. **工作树与分支清理**：`var/wt-docs25`（detached `88febf5`）归属未确认，删除属仓库操作、单独授权、删前先问；`var/wt-mvp-execution` 与 `feat/p0-1-core-facts` 已拍板**保留**（未合并遗留留档），不再列为待删；`C:/Users/jinlo/.codex/worktrees/e24e` 不动。`chore/dev-env-file` 属另一窗口在途 PR #78，不碰。
3. **部署仍暂缓**：号主尚未购服务器；`feat/deploy-vps` 虽已随 #51 合并，也不代表上线，别提议 VPS／DNS。

## 3. 本机环境卡点（未解，直接决定你能跑什么）

- **库侧＝Docker 容器 `jpqm-pg18`（现运行中）**：`postgres:18-alpine`、`127.0.0.1:55432->5432`；2026-11-13 现取 `Up`（本落账轮 Up 2 hours）。若已停，`docker start jpqm-pg18` 属基础设施变更、先单独请示。另有 `bailu-naming-redis`／`bailu-naming-mysql`（与本项目无关，不动）。⚠ `.env` 里的 `DATABASE_URL` 仍指向 `localhost:5432`（compose 库、并不存在）⇒ 跑任何库侧命令必须**显式**带 `DATABASE_URL='postgresql://postgres@127.0.0.1:55432/qualification_media'`，别靠 `.env` 默认值。只读账号口令 `api_ro_local_2026`（P0-4 开通）。
- **本机库现态（2026-11-13 刷新轮落账现取）**：迁移 **30**（`0000–0029`）／`sources` **52**（`qualification_id` 未绑定 0）／`facts` **1007**（takken 16／gyoseishoshi 15／it-passport 10／FE **28**／bookkeeping 863／fp 75）／`candidate_facts` **1046** 全 approved、pending 0／`reviews` **1046**／`change_events` **1046**／`fact_revisions` **1046**／`snapshots` **80**／运营表 `capture_runs` 17／`source_checks` 68。baseline／CI 夹具已随 #79 刷为 **1007／37**（逐格 16／15／10／28／863／75）⇒ **本机库／baseline／CI 夹具三方一致**，不再领先。本机 `snapshots` **80** 多于夹具 **37**（夹具只含被批准事实引用的快照，巡检与证据页快照不进夹具）。这是「夹具档＋P0-1 写库＋P1-1 运营演练＋B 实抓链＋J 统计＋D2 历史年度」的库，不是带完整审核历史的开发库（开发库已丢失，历史读数见交接单 §3）。
- **本机 `npm run db:migrate`＝tsx 直跑源码，读 `packages/db/migrations/`，无需 cp 进 dist**（2026-11-12 B 轮与 J 轮两次实测：0028/0029 各 1 条 Applied、重跑 0 Applied）；「先 cp 进 dist」只是**编译/Docker 路径**的口径（tsc 只编译 JS 不拷 SQL，Dockerfile 有显式 cp 步骤），别盲目 cp。容器起停属基础设施变更需单独授权；`%TEMP%` 临时 PG 集群只在 Docker 再坏时按交接单 §6 重建（⚠ PG 二进制**不能放中文路径**，否则 `initdb` 报 `FATAL: invalid byte sequence for encoding "UTF8": 0xd7 0xd4`）。
- 采集器的网络坑：`.env` 的 `NO_PROXY` 含 `[::1]`，httpx 0.28.1 会抛 `InvalidURL: Invalid port: ':1]'` ⇒ 实抓用 `NO_PROXY="localhost,127.0.0.1"` 覆盖（或 `env -u NO_PROXY -u no_proxy`），**不改代码规避**。
- 审核通道：`POST /internal/reviews/{candidate_id}` 只认 `x-reviewer-id` 头（值取 `ADMIN_REVIEWER_ID`，见 `apps/admin/src/server.ts:15`），`?reviewer=` 是只读降级；curl 判据前先确认 **3001** 没被残留进程占着（上一轮实测 `taskkill //PID <pid> //F` 后只剩 TIME_WAIT）。
- 测试面：**规范读数＝`npx vitest run --dir tests --pool=threads --poolOptions.threads.singleThread`，2026-11-13 现取 15 文件／139 用例**（124→139 为 P0-1／P0-4／P1-1 轮新增）。⚠ 必须在**仓库根**跑：Bash 的 cwd 跨命令保留，`cd services/collector` 之后再跑会在收集器目录里报「No test files found」。仓库根的 `npm run test`（`vitest run tests`）里 `tests` 是**子串过滤**，会把 `var/wt-*` 遗留 worktree 的测试一起扫进来；裸 `npx vitest run` 会扫 `scripts/*.test.mjs` 的 node:test 文件、报「No test suite found」假 FAIL。跑前确认 **4100** 端口没被占（否则 `tests/public-api.test.ts` 抛 `EADDRINUSE`）。本机**没有 `pnpm`**，README／CI 里的 `pnpm …` 一律换 `npm run …`。
- pytest：**2026-11-13 全量现取 237 passed**（collector 230＋parser 7 为 2026-11-12 分解读数、其后零 Python 改动；218→237 为工作包 J 新增提取器/契约/采集/registry 用例）。规范命令＝`PYTHONIOENCODING=utf-8 services/collector/.venv/Scripts/python.exe -m pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests services/parser/tests -q`（**两目录必须同传**，单跑 parser 会 `ModuleNotFoundError`；单传 collector 会少 7 条，报数口径以两目录为准）。venv 已用 ensurepip 引导 pip 并装 `openpyxl 3.1.5`（J 轮，pyproject 依赖 `openpyxl>=3.1`）；`pypdf 7.0.1` 在但缺 `cryptography`，读加密 PDF 用系统 Python313。报数前仍要现取。
- 不依赖库的本地自检＝`npm run format:check`／`npm run typecheck`／`npm run build`、`npm run lint` 需补 `--ignore-pattern "Python/**"`（裸跑只红在未跟踪 `Python/` 的 `flamegraph.js` parse error，按铁律不删不提交）、聚焦 vitest、`npm run test:verify-gate`（**40** 条纯函数断言，2026-11-13 现取）。
- ⚠ **worktree 在 `var/` 下时 `format:check` 会假绿**：从仓库根对 `var/wt-docsNN/...` 跑 prettier 被根 `.prettierignore` 第 4 行的 `var/` 整段跳过、回「All matched files use Prettier code style!」（#49 那轮因此让 CI 红在 `format:check`）。正确做法＝`cd var/wt-docsNN` 后用相对 glob：`node ../../node_modules/prettier/bin/prettier.cjs --write "docs/**/*.md" README.md` 再 `--check …`；给交接单 §2 表加行后必须先 `--write`，否则表格重排会让检查转红。**Edit 不保证自动 prettier，改完一律显式复检。**
- **夹具计数改一处不够**：数字写在四个地方——`config/release-gate-baseline.json` 的 `expectedFacts`、`fixtures/ci/approved-facts.sql`、`scripts/verify-ci-fixture.mjs` 第 9–12 行断言、`scripts/docker-smoke.mjs` 的断言（**4 行**：346／356 事实数＋**359／360 快照数**，后者历次交接单漏记）。2026-11-10 PR #58 首跑就因漏改 `docker-smoke.mjs` 而红（`expected 981 approved facts, got 982`）。**2026-11-13 已把这条链整体刷到 1007／37 并合并（#79）**（前值 999／37＝#73；本轮快照数不变，只改事实数两处）。
- 输出与轮询坑：`wsl`／`powershell` 在 Git Bash 下 stdout 是 **UTF-16LE**，管道给 `grep` 会被判 `Binary output` ⇒ `| iconv -f UTF-16LE -t UTF-8 | tr -d '\000'`。判 Docker 就绪看 `docker desktop status` ＋`docker info` 退出码两条。长轮询会被约 150s 的工具超时移到后台且输出文件在 workspace 外**读不回来** ⇒ **分段跑，每段 ≤100s**。`gh run view <runId> --log` 报 results-receiver 连接错误**或返回空**（2026-11-13 两次实测）时，先 `--json jobs` 取 jobId 再 `--job <jobId> --log`（多数情况原样重试即成功）。CI 日志里有 ANSI 转义，`grep` 用 `-a`。
- 自动权限门：`createdb`／`pg_restore`／`docker exec … psql -c "写语句"` 会被分类器判「写操作」直接拒，**即使上一句授权覆盖了整条流程也要再说一句**（2026-10-13／10-25 实测反复被拦）；`docker compose up -d` 同样按基础设施变更拦。

## 4. 铁律速记（全文见 `docs/transition-handoff.md` §1，违反即返工）

- 采集／候选入库／逐条批准＝**三次独立授权**；commit、push、PR、CI 轮询、merge、删分支、`db:migrate`、`db:seed`、写库、DROP 一律等号主「一句话」，**一步一停**（操作类命令可直接跑、不用他点同意）。概括性的「继续执行」只覆盖已明示批准的推荐序列，**不覆盖安全决策（扩白名单）与三次数据授权**。
- 改 `config/data-coverage-contract.json`（判级面）＝产品决策，另行请示；`config/release-gate-baseline.json`、CI 夹具、`verify-ci-fixture.mjs`、`docker-smoke.mjs` 属同一条计数链，必须**同一个 PR** 一起改（baseline 是下限：只抬 baseline 不重导夹具，本机绿、CI 必红）。
- `git add --` **逐路径，绝不 `-A`**；仓库根未跟踪的 **`Python/` 永不提交、也不要删**。
- 临时件放 gitignored 的 `var/` 并在提交前删（往轮遗留的 `var/` 文件别动）；`uv run` 生成的 `services/collector/uv.lock` 是未跟踪的本地产物（CI 用 pip 装包），提交前删掉。
- **判据可复跑、数字要现取**：报任何计数前先跑只读命令；发命令那条消息不得预写读数；写库用词分三态（「入库 N 条」要带 `pending_review` 与「未公开」，「批准 N 条」要带 `facts` 计数变化）。交接单与环境结论会过期，每轮重取。
- 门禁语义：非合成 `pending_review != 0` ⇒ `verify:all` **硬失败**（设计内中间态）；`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` ⇒ 历史统计类**永远不会把门禁跑红**，属产品覆盖债，只能靠人记着。FE 的维度全 NULL，三个 `{deliveryMode:"cbt"}` 条件字段因此不参与检查 ⇒ **6/6 ≠ 字段齐全**。
- 并行窗口：优先 `git worktree` 隔离；**不碰主工作树里的未提交改动、不回滚别的窗口的写入**；删分支前先确认它确实属于自己这轮。

## 5. 该读的权威文档（口径不写在本文）

- `docs/handover-p1-ops-findings.md`＝P1-1 运营发现处理交接单（含 2026-11-12／11-13 进度节：A/B/C 全闭合＋工作包 J＋D2＋baseline 1007 刷新轮闭合）；`docs/work-package-i-kinzai-domain-migration.md`＝B 的专用授权单（已拍板并实施＋执行完毕，§12 有逐轮读数，只作追溯）。
- `docs/transition-handoff.md`＝时点快照（正文停在 2026-11-10 #68，文首有 2026-11-13 更新注记）＋铁律全文＋§6 可复跑判据命令（含库丢失后的恢复命令组）＋§7 GitHub 通路＋§8 审核通道操作口径。
- `docs/data-gate-semantics.md`＝门禁／判级／溯源／三级授权／鉴权总口径（§6 批准链、§8.1 三态术语、§9 baseline 与夹具维护的现态读数、§10 回归命令表）。§10 已于 2026-11-13 刷新为本机全量实测读数（刷新轮落账：vitest 15／139、pytest 237、gate 40/40、夹具 1007／37、facts 1007 三方一致、`data:staleness` 行），本页 §3 与之同源。
- 各资格契约：`docs/bookkeeping-source-contract.md`、`docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`、`docs/it-passport-source-contract.md`、`docs/fp-source-contract.md`；宅建没有独立契约文件，阶段闭环与 `source:takken:retio-exam` 登记说明在 `docs/stage1-takken.md`。
- `docs/product-design.md`＝SEO／页面收录契约（18.2 参数筛选页 `noindex,follow`、`:1081` Sitemap 只放可索引 200 正式页；#45 起 sitemap＝状态门＋按内容，空栏目页 `noindex` 且不收；#46 起 `/updates/?page=` 与筛选页 `noindex,follow`、sitemap 仍只收 `/updates/`；#48 起首页工具卡为真链接、主な資格 6 项、非法 ICS 直连走站内 404／错误页）。
- `docs/stage-log.md`＝逐轮交付读数（每轮一段，含踩坑），要「上一轮到底做了什么」看这里而不是看本文。
- `docs/work-package-g-history-presentation.md`＝历年统计接公开面（G-1／G-2）的方案与执行记录；`docs/work-package-h-suspension-fact-proposal.md`＝FE 停考事实的方案、拍板与实施结果（已闭合，只作追溯）；`docs/work-package-j-fe-pass-rate-proposal.md`＝FE 合格率事实化的方案与执行记录（已闭合，§0–§10 为起草时点原文、§11 为拍板结果与实测读数＋D2 历史年度轮补记）；`docs/work-package-f-statistics-sources.md`＝历史统计来源的调研与缺口定性。
- ⚠ `docs/codex-handoff.md` 与 `docs/codex-handoff-next.md` 是 **2026-08-11 时点的归档**（文首自述「仅供追溯」），不要据它们推当前状态。
