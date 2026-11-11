# 轮次工单：下一轮开工前读这一页

> 本文＝**逐轮滚动的开工单**，只写「这一轮做什么、按什么顺序、卡在哪」；口径与机制的权威正文一律**不在这里复制**，改口径请改 `docs/data-gate-semantics.md`、各资格 `docs/*-source-contract.md` 与 `docs/product-design.md`。全量时点快照在 `docs/transition-handoff.md`（本文的 §5 就是它的摘要指针）。
>
> **维护约定**＝每轮收尾时**就地重写本文**（同一文件、别新开），把「当前工单」换成下一轮的；已闭合的条目删掉并在 `docs/stage-log.md` 留读数。文中任何计数只是写作时点的现取值，**开工先跑 §1**。

## 0. 当前工单＝下一轮（写于 2026-11-11）

- 仓库根＝`E:\自建程序\jp_qualification_media`，remote＝`roykim26/jp_qualification_media`。
- 写作时点现取：main＝origin/main＝**`bdca005`**（P1-1 运营发现 A/C 落账轮＝簿记 2 页 URL 漂移修正迁移 `0026`＋FE 统计来源登记迁移 `0027`＋kinzai 工作包 I 授权单，9 文件 209/30，**号主批准的直推 main**，push CI run `43027223116` release-gate／docker-smoke 双绿）；其前是 `adacaec`（P1-1 交接单落账）与 `1933fd3`（P1-1 来源巡检验收）。历史纯线性（squash PR 或号主批准的直推，无 merge commit）。
- **提交通道口径更新**：默认仍走 squash PR；**直推 main 只在号主对该轮明示批准时用**（先例＝P1-1 实现/验收/交接三轮与本轮 `bdca005`）。直推绕过 release-gate 必需检查但**仍触发 push CI，必须 watch 到绿**才算收口。
- **在途＝2026-11-11 文档同步小轮（纯文档）**：把 `bdca005` 的 CI 读数、本机迁移 0026/0027 应用读数（sources 51→52）落账，同步本文／README／交接单更新注记／`data-gate-semantics.md` §10／P1-1 交接单进度节。零抓取／零入库／零批准／零事实增减。
- **上一轮（2026-11-11）已闭合，不要重做**：P1-1「来源巡检/失败记录/告警/人工日检/数据更新 SOP」全链闭合（`53451b2`／`1933fd3`／`adacaec`）；巡检检出的三类失效来源中 **A（簿记 class2/class3 路径漂移）与 C（statistics-fe 登记）已拍板并落地**（`bdca005`，迁移已在本机应用、幂等复验 0 Applied）；**B（kinzai FP 9 条 301 到 `products.kinzai.or.jp`）离线调查已完成**（跳转目的地、静默误解析证据、新页锚点映射），方案稿＝`docs/work-package-i-kinzai-domain-migration.md`，**待号主拍板 D1～D5**。细节见 `docs/stage-log.md` 顶部当日段与 `docs/handover-p1-ops-findings.md` 进度节。
- 本地工作树只剩未跟踪 `Python/`（不提交、不删）。`git worktree list` 四个＝主工作树（`bdca005`）／另一窗口的 `C:/Users/jinlo/.codex/worktrees/e24e/jp_qualification_media`（detached `97e3fc0`，**不动**）／遗留 `var/wt-docs25`（detached `88febf5`，归属未确认，删前先问）／`var/wt-mvp-execution`（`feat/p0-1-core-facts` `82eca10`，另一窗口 P0-1 遗留，**不动**）。
- ⚠ 号主常并行开多个窗口动同一仓库 ⇒ 若 §1 现取发现 main 又前进了，就以新 commit 为基线，**不要回滚别的窗口的写入**。

## 1. 开工先跑（全部只读，整条可复制）

```
set -a; . ./.env; set +a
git log --oneline -3; git rev-list --merges --count main; git branch -vv; git status --porcelain; git worktree list
GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 ls-remote --heads origin
gh pr list --state open --json number,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup
```

- 远端 git 命令**必须**带那串 `-c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1`（第一个 helper 置空以清空追加列表；不加 `http.version=HTTP/1.1` 时 push 报 `Recv failure: Connection was reset`）。
- ⚠ 仓库 git config 里有 `http.proxy=http://127.0.0.1:7890`：该端口**没在听**时要补 `-c http.proxy= -c https.proxy=` 直接连（否则 `Failed to connect to github.com port 443 via 127.0.0.1`）；**在听**时反而不能加（加了空覆盖后 push 会超时，`ls-remote` 也会挂住——2026-11-10 实测一次、跑到工具超时）。先 `netstat -ano | grep "127.0.0.1:7890.*LISTENING"` 判，**每轮现取、别沿用上一轮结论**（2026-11-11 本轮 push 时在听、未加空覆盖）。
- 裸 `git fetch` 偶发 `schannel: failed to receive handshake, SSL/TLS connection failed`＝本机指纹、不代表断网，远端真值只用上面的 `ls-remote --heads`。
- `gh` 侧：`gh pr create` **必须 `--body-file`**（内联 heredoc 会 exit 0 但静默不开 PR）；`gh pr merge --squash` 成功时**零输出**；`gh pr view -q` 里「字符串 + 数字」会报 `cannot add`，要用 `tostring`／`join`；`gh pr checks --watch` 偶发 `wsarecv: An existing connection was forcibly closed`／GraphQL 断连，原样重跑一次即恢复；**push 后旧 failed run 会让 `--watch` 提前退出**，要盯的是新 head 对应的那条 run。
- 在 worktree 里开工时，`git status` 只看得到该 worktree；要判主工作树是否被别的窗口动了，用 `git -C "E:/自建程序/jp_qualification_media" status --porcelain` 现取，别据本 worktree 的干净状态推断全仓。

## 2. 待办（按建议顺序；commit／push／PR／CI 轮询／merge／删分支**各需单独一句话**，做到就停）

1. **B 执行轮＝工作包 I（kinzai 域名迁移）**：先请号主拍板 `docs/work-package-i-kinzai-domain-migration.md` 的 **D1～D5**（D1 扩白名单到 `products.kinzai.or.jp` 属**安全边界决策**，不在任何概括授权内）；拍板后「代码＋迁移 `0028`＋文档」同批改（`FP_SOURCES` 8 条 URL、`capture_fp.py` 主机硬编码、faq capture-only 退役、4 个抽取器重写＋td→th 回归用例）；**重抓前先按 `<sha256>.html` 固化现有快照**（fp-preserved 先例）；采集／候选入库／审核批准仍是三次独立授权。
2. **FE 合格率事实化＝工作包 J 方案稿（待起草）**：`statistics-fe` 已由 `0027` 登记（仅证据、不产候选）；`toukei_fe.html` 是目录页、数据在 PDF 附件；本机 venv 已装 `pypdf 7.0.1`、仓内已有 `youkou_pdf.py` 解析先例 ⇒ 先出方案稿（依赖、附件清单、字段映射、判级）交号主拍板，**不授权不抓取**。
3. **工作树清理**：`var/wt-docs25`（detached `88febf5`）与 `var/wt-mvp-execution`（`feat/p0-1-core-facts`）归属未确认，删除属仓库操作、单独授权；`C:/Users/jinlo/.codex/worktrees/e24e` 不动。
4. **部署仍暂缓**：号主尚未购服务器；`feat/deploy-vps` 虽已随 #51 合并，也不代表上线，别提议 VPS／DNS。

## 3. 本机环境卡点（未解，直接决定你能跑什么）

- **库侧＝Docker 容器 `jpqm-pg18`（现运行中）**：`postgres:18-alpine`、`127.0.0.1:55432->5432`；2026-11-11 现取 `Up`（P1-1 演练后未再停）。若已停，`docker start jpqm-pg18` 属基础设施变更、先单独请示。另有 `bailu-naming-redis`／`bailu-naming-mysql`（与本项目无关，不动）。⚠ `.env` 里的 `DATABASE_URL` 仍指向 `localhost:5432`（compose 库、并不存在）⇒ 跑任何库侧命令必须**显式**带 `DATABASE_URL='postgresql://postgres@127.0.0.1:55432/qualification_media'`，别靠 `.env` 默认值。只读账号口令 `api_ro_local_2026`（P0-4 开通）。
- **本机库现态（2026-11-11 迁移应用后现取）**：迁移 **28**（`0000–0027`）／`sources` **52**（`qualification_id` 未绑定 0）／`facts` **994**（takken 16／gyoseishoshi 15／it-passport 10／FE 15／bookkeeping 863／fp 75）／`candidate_facts` **1006** 全 approved、pending 0／`reviews` **1006**／`change_events` **1006**／`snapshots` **71**／运营表 `capture_runs` 10／`source_checks` 60／15 张表。**facts 994＝baseline/CI 夹具 982＋P0-1 轮 FE 4＋ITP 8**（夹具未重导，baseline 是下限、不红）。这是「夹具档＋P0-1 写库＋P1-1 运营演练」的库，不是带完整审核历史的开发库（开发库已丢失，历史读数见交接单 §3）。
- **本机 `db:migrate` 前必须 `cp -r packages/db/migrations dist/packages/db/migrations`**：tsc 只编译 JS 不拷 SQL，`migrate.js` 按自身相对路径读 `../migrations/`（Dockerfile 有同款 cp 步骤）；漏拷会报找不到迁移。应用后复跑一次须 0 Applied（幂等）。容器起停属基础设施变更需单独授权；`%TEMP%` 临时 PG 集群只在 Docker 再坏时按交接单 §6 重建（⚠ PG 二进制**不能放中文路径**，否则 `initdb` 报 `FATAL: invalid byte sequence for encoding "UTF8": 0xd7 0xd4`）。
- 采集器的网络坑：`.env` 的 `NO_PROXY` 含 `[::1]`，httpx 0.28.1 会抛 `InvalidURL: Invalid port: ':1]'` ⇒ 实抓用 `NO_PROXY="localhost,127.0.0.1"` 覆盖（或 `env -u NO_PROXY -u no_proxy`），**不改代码规避**。
- 审核通道：`POST /internal/reviews/{candidate_id}` 只认 `x-reviewer-id` 头（值取 `ADMIN_REVIEWER_ID`，见 `apps/admin/src/server.ts:15`），`?reviewer=` 是只读降级；curl 判据前先确认 **3001** 没被残留进程占着（上一轮实测 `taskkill //PID <pid> //F` 后只剩 TIME_WAIT）。
- 测试面：**规范读数＝`npx vitest run --dir tests --pool=threads --poolOptions.threads.singleThread`，2026-11-11 现取 15 文件／139 用例**（124→139 为 P0-1／P0-4／P1-1 轮新增）。⚠ 必须在**仓库根**跑：Bash 的 cwd 跨命令保留，`cd services/collector` 之后再跑会在收集器目录里报「No test files found」。仓库根的 `npm run test`（`vitest run tests`）里 `tests` 是**子串过滤**，会把 `var/wt-*` 遗留 worktree 的测试一起扫进来；裸 `npx vitest run` 会扫 `scripts/*.test.mjs` 的 node:test 文件、报「No test suite found」假 FAIL。跑前确认 **4100** 端口没被占（否则 `tests/public-api.test.ts` 抛 `EADDRINUSE`）。本机**没有 `pnpm`**，README／CI 里的 `pnpm …` 一律换 `npm run …`。
- pytest：**2026-11-11 全量现取 214 passed**（162→214 为 P0/P1 轮新增，含 youkou PDF 解析用例）。规范命令＝`PYTHONIOENCODING=utf-8 services/collector/.venv/Scripts/python.exe -m pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests services/parser/tests -q`（**两目录必须同传**，单跑 parser 会 `ModuleNotFoundError`）。⚠ venv 缺 `pypdf` 会收集错误，本轮已用 `uv pip install --python services/collector/.venv/Scripts/python.exe "pypdf>=5.0"` 装到 7.0.1（venv 无 pip，别用 `python -m pip`）。报数前仍要现取。
- 不依赖库的本地自检＝`npm run format:check`／`npm run typecheck`／`npm run build`、`npm run lint` 需补 `--ignore-pattern "Python/**"`（裸跑只红在未跟踪 `Python/` 的 `flamegraph.js` parse error，按铁律不删不提交）、聚焦 vitest、`npm run test:verify-gate`（**40** 条纯函数断言，2026-11-11 现取）。
- ⚠ **worktree 在 `var/` 下时 `format:check` 会假绿**：从仓库根对 `var/wt-docsNN/...` 跑 prettier 被根 `.prettierignore` 第 4 行的 `var/` 整段跳过、回「All matched files use Prettier code style!」（#49 那轮因此让 CI 红在 `format:check`）。正确做法＝`cd var/wt-docsNN` 后用相对 glob：`node ../../node_modules/prettier/bin/prettier.cjs --write "docs/**/*.md" README.md` 再 `--check …`；给交接单 §2 表加行后必须先 `--write`，否则表格重排会让检查转红。**Edit 不保证自动 prettier，改完一律显式复检。**
- **夹具计数改一处不够**：数字写在四个地方——`config/release-gate-baseline.json` 的 `expectedFacts`、`fixtures/ci/approved-facts.sql`、`scripts/verify-ci-fixture.mjs` 第 9–12 行断言、`scripts/docker-smoke.mjs` 的断言。2026-11-10 PR #58 首跑就因漏改 `docker-smoke.mjs` 而红（`expected 981 approved facts, got 982`）。**本轮不动这条链（982）**。
- 输出与轮询坑：`wsl`／`powershell` 在 Git Bash 下 stdout 是 **UTF-16LE**，管道给 `grep` 会被判 `Binary output` ⇒ `| iconv -f UTF-16LE -t UTF-8 | tr -d '\000'`。判 Docker 就绪看 `docker desktop status` ＋`docker info` 退出码两条。长轮询会被约 150s 的工具超时移到后台且输出文件在 workspace 外**读不回来** ⇒ **分段跑，每段 ≤100s**。`gh run view <runId> --log` 报 results-receiver 连接错误时改用 `--job <jobId> --log`（多数情况原样重试即成功）。CI 日志里有 ANSI 转义，`grep` 用 `-a`。
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

- `docs/handover-p1-ops-findings.md`＝P1-1 运营发现处理交接单（含 2026-11-11 进度节：A/C 已闭合、B 转工作包 I）；`docs/work-package-i-kinzai-domain-migration.md`＝B 的专用授权单（D1～D5 待拍板，含静默误解析证据与逐来源重写规格）。
- `docs/transition-handoff.md`＝时点快照（正文停在 2026-11-10 #68，文首有 2026-11-11 更新注记）＋铁律全文＋§6 可复跑判据命令（含库丢失后的恢复命令组）＋§7 GitHub 通路＋§8 审核通道操作口径。
- `docs/data-gate-semantics.md`＝门禁／判级／溯源／三级授权／鉴权总口径（§6 批准链、§8.1 三态术语、§9 baseline 与夹具维护的现态读数、§10 回归命令表）。§10 已于 2026-11-11 刷新为本机全量实测读数（vitest 15／139、pytest 214、gate 40/40、夹具 982、facts 994、`data:staleness` 行），本页 §3 与之同源。
- 各资格契约：`docs/bookkeeping-source-contract.md`、`docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`、`docs/it-passport-source-contract.md`、`docs/fp-source-contract.md`；宅建没有独立契约文件，阶段闭环与 `source:takken:retio-exam` 登记说明在 `docs/stage1-takken.md`。
- `docs/product-design.md`＝SEO／页面收录契约（18.2 参数筛选页 `noindex,follow`、`:1081` Sitemap 只放可索引 200 正式页；#45 起 sitemap＝状态门＋按内容，空栏目页 `noindex` 且不收；#46 起 `/updates/?page=` 与筛选页 `noindex,follow`、sitemap 仍只收 `/updates/`；#48 起首页工具卡为真链接、主な資格 6 项、非法 ICS 直连走站内 404／错误页）。
- `docs/stage-log.md`＝逐轮交付读数（每轮一段，含踩坑），要「上一轮到底做了什么」看这里而不是看本文。
- `docs/work-package-g-history-presentation.md`＝历年统计接公开面（G-1／G-2）的方案与执行记录；`docs/work-package-h-suspension-fact-proposal.md`＝FE 停考事实的方案、拍板与实施结果（已闭合，只作追溯）；`docs/work-package-f-statistics-sources.md`＝历史统计来源的调研与缺口定性。
- ⚠ `docs/codex-handoff.md` 与 `docs/codex-handoff-next.md` 是 **2026-08-11 时点的归档**（文首自述「仅供追溯」），不要据它们推当前状态。
