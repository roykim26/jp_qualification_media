# 轮次工单：下一轮开工前读这一页

> 本文＝**逐轮滚动的开工单**，只写「这一轮做什么、按什么顺序、卡在哪」；口径与机制的权威正文一律**不在这里复制**，改口径请改 `docs/data-gate-semantics.md`、各资格 `docs/*-source-contract.md` 与 `docs/product-design.md`。全量时点快照在 `docs/transition-handoff.md`（本文的 §5 就是它的摘要指针）。
>
> **维护约定**＝每轮收尾时**就地重写本文**（同一文件、别新开），把「当前工单」换成下一轮的；已闭合的条目删掉并在 `docs/stage-log.md` 留读数。文中任何计数只是写作时点的现取值，**开工先跑 §1**。

## 0. 当前工单＝第二十二轮（写于 2026-10-21）

- 仓库根＝`E:\自建程序\jp_qualification_media`，remote＝`roykim26/jp_qualification_media`。
- 写作时点现取：main＝origin/main＝**`70ef524`**（PR #43＝第二十轮合并点）；历史纯线性（`git rev-list --merges --count main` 为 **0**，main 每个 commit 标题带 `(#NN)` ⇒ **一律 squash PR，绝不直接 push main**）。
- **在途＝第二十一轮纯文档 PR**（把 #43 的 CI 读数落账）：分支 `docs-round21-sync`；4 文件＝`docs/transition-handoff.md`＋`docs/stage-log.md`＋`README.md`＋本文。**PR 号开单后才存在** ⇒ 用 `gh pr list --state open --head docs-round21-sync` 现取，别照抄本文。**状态＝PR 已开、CI 待验、未合并。**
  ⚠ 号主常并行开多个窗口动同一仓库 ⇒ 若 §1 现取发现该 PR 已被别的窗口合并，就跳过 §2 第 1 步、直接进第 2 步，并把 main 的 mergeCommit 当新基线；**不要回滚别的窗口的写入**。
- 本轮（第二十一轮）内容口径＝纯文档欠账：文头 SHA→`70ef524`、§2 表补 #43、§3 落 #43 的 CI 四条读数（vitest 94／12、pytest 158、`test:verify-gate` 7/0、`verify:all` 6/0）、§4 首段末态、README 时点；零抓取／零入库／零批准／零迁移／零写库／零代码改动／零判级面改动。

## 1. 开工先跑（全部只读，整条可复制）

```
set -a; . ./.env; set +a
git log --oneline -3; git rev-list --merges --count main; git branch -vv; git status --porcelain
GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 ls-remote --heads origin
gh pr list --state open --json number,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup
```

- 远端 git 命令**必须**带那串 `-c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1`（第一个 helper 置空以清空追加列表；不加 `http.version=HTTP/1.1` 时 push 报 `Recv failure: Connection was reset`）。
- 裸 `git fetch` 偶发 `schannel: failed to receive handshake, SSL/TLS connection failed`＝本机指纹、不代表断网，远端真值只用上面的 `ls-remote --heads`。
- `gh` 侧：`gh pr create` **必须 `--body-file`**（内联 heredoc 会 exit 0 但静默不开 PR）；`gh pr merge --squash` 成功时**零输出**；`gh pr view -q` 里「字符串 + 数字」会报 `cannot add`，要用 `tostring`／`join`。

## 2. 待办（按建议顺序；commit／push／PR／CI 轮询／merge／删分支**各需单独一句话**，做到就停）

1. **收口第二十一轮纯文档 PR**：只读轮询 `release-gate` → squash merge → 回读 `mergeCommit.oid` ＋ `git show --stat` 核对与 4 文件逐文件 numstat 一致（数字现取，本文不预写）→ 按三重判据删分支（⚠ 删分支**单独**问一句，即使已授权合并）。
   - 纯文档轮，CI 预期复现 PR #43 的读数：vitest **94 passed／12 文件**、pytest **158 passed**、`test:verify-gate` **pass 7／fail 0**、`verify:all` **`"status": "passed"`／6 passed／0 failed**。⚠ 这四个数是第二十一轮从 #43 的 run `39618791683`／job `119286375750` 日志现取的，**不是本轮实测**；本轮只核 CI 是否同样绿。
   - 删分支三重判据（squash 仓库里 `git branch -d` 必报 `not fully merged`、`git rev-list --count main <branch>` 恒为 1，都不是「未合并」的证据）：`gh pr list --state merged --head <branch>` 取 `mergeCommit`＋`headRefOid` → 核 `headRefOid` 与本地／远端 tip 三者相等 → `git diff --diff-filter=A --name-only main <branch>` 计数 **0**；过了再 `git branch -D`＋带 helper 链的 `git push origin --delete <branch>`，删后用 `ls-remote --heads` 核对只剩 `main`。
2. **文档欠账**（本仓库线性历史下的结构性惯例：本轮交付只能随**下一个** PR 写档，所以每轮收尾必欠一条）：`docs/transition-handoff.md` 文头 main SHA→新 mergeCommit、文头 CI run／job 换成第二十一轮 PR 的、§2 交付表补第二十一轮 PR 行、§3 把该 PR 的 CI 读数落账、§4 首段分支末态改本轮现取、待办 5 补闭合段；`docs/stage-log.md` 补本轮交付段；`README.md` 时点与 SHA；**并就地重写本文**（§0 换成新 mergeCommit 基线、§2 第 1 步删掉）。
   - ⚠ 给 `docs/transition-handoff.md` 的 §2 表加一行会让 `format:check` 转红（prettier 重排整表列宽）⇒ 改完先 `node node_modules/prettier/bin/prettier.cjs --write docs/transition-handoff.md` 再复跑 `npm run format:check`，即 0。
3. **（推荐的本轮主体，若号主愿碰 Docker）修 Docker 后本机重取库侧计数**：引擎自第十八轮起坏，连续四轮（18／19／20／21）未本机重取任何库侧数字。根因与三条修法见 §3；修好后按交接单 §6 重取 `schema_migrations`／`sources`／`facts`／`candidate_facts`／`reviews`／`snapshots`／`change_events` 分布，并补跑 `npm run test` 全量＋`npm run verify:all`＋`npm run ci:fixture:verify`。
   - 三条修法各需号主明示授权：① `wsl --shutdown` 再拉 Desktop（⚠ 会连带杀掉 `Running` 状态的 `Ubuntu-24.04`，动手前确认没有别的窗口在用）；② 重启 Windows；③ Docker Desktop「Clean / Reset data」＝**毁 `docker_data.vhdx`＝毁本机开发库**，不推荐。
4. **次选小债（各自可独立成轮）**：`services/api/src/release.ts:93` 回滚路径仍硬编码 `schedule_change`；`apps/web/src/sitemap.ts:15` sitemap 年度 URL 仍硬编码 `/2026/`（可改数据驱动）。
5. **新范畴（要新开授权单，别顺手做）**：宅建统计页多来源重构（`snapshot_from_html()` 仍把快照 id 钉在单条 `TAKKEN_SOURCE`，那条背后有已批准事实 ⇒ 该页**只能抓、不能入库**）；基本情報技術者附件提取（`toukei_fe.html` 是目录页、零 `<table>`，数据全在 20 多个 PDF／xlsx，而仓内**既无 PDF 也无 xlsx 解析能力**，要先定依赖）。

## 3. 本机环境卡点（未解，直接决定你能跑什么）

- ⚠ **Docker Desktop 引擎起不来（已连续四轮）⇒ `docker compose up -d postgres` 不可用 ⇒ 本机跑不了 `npm run verify:all`／`npm run test` 全量／`ci:fixture:verify`／一切库侧计数。** 第十九轮已定位根因，**别再按「重启 Desktop 就好」试**：`wsl.exe --mount --bare --vhd <home>\appdata\local\Docker\wsl\disk\docker_data.vhdx` → `ERROR_SHARING_VIOLATION`（句柄被别的进程攥着）→ VM 侧 `wsl-bootstrap run ... --data-disk 8460e93c-...` → `no sd* disk in /sys/block with wwid ending by 8460e93c7545d8e8d0e89d0f`（重试 3 次后 `[F] preparing environment`）→ `apiproxy` 永远 `still waiting for the engine to respond to _ping ... HTTP 503`。取证日志＝`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`。症状指纹：`docker desktop status` 恒 `starting`、`docker info` 回 `Error response from daemon: Docker Desktop is unable to start`、`com.docker.backend`／`Docker Desktop` 进程全在、`docker-desktop` WSL 发行版 `Running` 但里面服务一个都没起。次因（每次必打、非致命）＝`wsl: 检测到 localhost 代理配置，但未镜像到 WSL。NAT 模式下的 WSL 不支持 localhost 代理`。
- **修好后要补的账**＝按交接单 §6 本机重取 §3 全部库侧计数。现仍沿**第十四轮**复跑读数：`schema_migrations` 22（迁移文件 21，行数≠文件数 ⇒ 判落后只认 `candidate_facts.exam_session` 列存在性）、`sources` 47（`qualification_id` NULL 0；CI 是 45，**别混报**）、`facts` 非合成 approved **981**、`candidate_facts` 1075 approved＋13 rejected＋**0 pending_review**、`reviews` 1006、`snapshots` 44、`change_events` 983、只读预检 `stored=903 computed=865 skipped_approved=865 would_stage=0 blocking=0`／EXIT=0。
- 测试面：本机用 **`npm run test`**（＝`vitest run tests --pool=threads --poolOptions.threads.singleThread`），**不要**图快跑 `npx vitest run`（会连 `scripts/*.test.mjs` 的 node:test 文件一起扫，报两个「No test suite found」的假 FAIL）；跑前确认 **4100 端口没被残留进程占着**，否则 `tests/public-api.test.ts` 抛 `EADDRINUSE` 让整轮退出码 1。本机**没有 `pnpm`**，README／CI 里那串 `pnpm …` 等价换成 `npm run …`。
- 不依赖库的本地自检（第二十轮实测全绿）＝`npm run format:check`／`npm run typecheck`／`npm run build`（全 EXIT=0）、`npm run lint` 需补 `--ignore-pattern "Python/**"`（裸跑只红在未跟踪 `Python/` 的 `flamegraph.js` parse error，按铁律不删不提交）、聚焦 vitest、`npm run test:verify-gate`。
- 输出与轮询坑：`wsl`／`powershell` 在 Git Bash 下 stdout 是 **UTF-16LE**，直接管道给 `grep` 会被判 `Binary output` ⇒ `| iconv -f UTF-16LE -t UTF-8 | tr -d '\000'`。判 Docker 就绪要看 `docker desktop status` 字符串＋`docker info` 退出码两条，别只看 `wsl -l -v` 的 `Running`。长轮询会被约 150s 的工具超时移到后台且其输出文件在 workspace 外**读不回来**（被安全策略拦）⇒ **分段跑，每段 ≤100s**。

## 4. 铁律速记（全文见 `docs/transition-handoff.md` §1，违反即返工）

- 采集／候选入库／逐条批准＝**三次独立授权**；commit、push、PR、CI 轮询、merge、删分支、`db:migrate`、`db:seed`、写库、DROP 一律等号主「一句话」，**一步一停**（操作类命令可直接跑、不用他点同意）。
- 改 `config/data-coverage-contract.json`（判级面）＝产品决策，另行请示。
- `git add --` **逐路径，绝不 `-A`**；仓库根未跟踪的 **`Python/` 永不提交、也不要删**。
- 临时件放 gitignored 的 `var/` 并在提交前删（往轮遗留的 `var/` 文件别动）；`uv run` 生成的 `services/collector/uv.lock` 提交前删。
- **判据可复跑、数字要现取**：报任何计数前先跑只读命令；发命令那条消息不得预写读数；写库用词分三态（「入库 N 条」要带 `pending_review` 与「未公开」，「批准 N 条」要带 `facts` 计数变化）。
- 门禁语义：非合成 `pending_review != 0` ⇒ `verify:all` **硬失败**（设计内中间态）；`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` ⇒ 历史统计类**永远不会把门禁跑红**，属产品覆盖债，只能靠人记着。

## 5. 该读的权威文档（口径不写在本文）

- `docs/transition-handoff.md`＝时点快照＋铁律全文＋§6 可复跑判据命令＋§7 GitHub 通路＋§8 审核通道操作口径。
- `docs/data-gate-semantics.md`＝门禁／判级／溯源／三级授权／鉴权总口径（§6 批准链、§8.1 三态术语、§9 baseline 与夹具维护）。
- 各资格契约：`docs/bookkeeping-source-contract.md`、`docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`、`docs/it-passport-source-contract.md`、`docs/fp-source-contract.md`；宅建没有独立契约文件，阶段闭环与 `source:takken:retio-exam` 登记说明在 `docs/stage1-takken.md`。
- `docs/product-design.md`＝SEO／页面收录契约（18.2 参数筛选页 `noindex,follow`、`:1081` Sitemap 只放可索引 200 正式页；第二十轮起 sitemap 实收 `verified`＋`partially_announced`）。
- `docs/stage-log.md`＝逐轮交付读数（每轮一段，含踩坑），要「上一轮到底做了什么」看这里而不是看本文。
- `docs/work-package-g-history-presentation.md`＝历年统计接公开面（G-1／G-2）的方案与执行记录。
- ⚠ `docs/codex-handoff.md` 与 `docs/codex-handoff-next.md` 是 **2026-08-11 时点的归档**（文首自述「仅供追溯」），不要据它们推当前状态。
