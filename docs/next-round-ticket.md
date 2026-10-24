# 轮次工单：下一轮开工前读这一页

> 本文＝**逐轮滚动的开工单**，只写「这一轮做什么、按什么顺序、卡在哪」；口径与机制的权威正文一律**不在这里复制**，改口径请改 `docs/data-gate-semantics.md`、各资格 `docs/*-source-contract.md` 与 `docs/product-design.md`。全量时点快照在 `docs/transition-handoff.md`（本文的 §5 就是它的摘要指针）。
>
> **维护约定**＝每轮收尾时**就地重写本文**（同一文件、别新开），把「当前工单」换成下一轮的；已闭合的条目删掉并在 `docs/stage-log.md` 留读数。文中任何计数只是写作时点的现取值，**开工先跑 §1**。

## 0. 当前工单＝第二十三轮（写于 2026-10-23）

- 仓库根＝`E:\自建程序\jp_qualification_media`，remote＝`roykim26/jp_qualification_media`。
- 写作时点现取：main＝origin/main＝**`4dd44f5`**（PR #48＝窗口外「MVP 上线前 P3 修复」合并点；其前两个合并点是 #46＝`6aa62d4`、#45＝`0978f7b`）；历史纯线性（`git rev-list --merges --count main` 为 **0**，main 每个 commit 标题带 `(#NN)` ⇒ **一律 squash PR，绝不直接 push main**）。
- **在途＝第二十二轮纯文档 PR #47**（#44 收口＋#45／#46／#48 交付与 CI 落账）：分支 `docs-round22-sync`，隔离 worktree `var/wt-docs22`，4 文件＝`docs/transition-handoff.md`＋`docs/stage-log.md`＋`README.md`＋本文。PR 号开单后才存在 ⇒ 用 `gh pr list --state open --head docs-round22-sync` 现取，别照抄本文。**状态＝PR #47 已开、两轮 CI 绿（首轮 run `39879644790`；最新 run `39883436390`，基底含 #46＋#48：vitest 109／12、pytest 158、gate 10/0、verify:all 6/0）；#48 落账后待第三次提交／推送，CI 需再复验一轮（预期同值）。**
  ⚠ 号主常并行开多个窗口动同一仓库：另一窗口的 MVP P2 已于 2026-10-23T00:41:33Z 合并成 **#46（`6aa62d4`）**、P3 于 2026-10-23T01:03:12Z 合并成 **#48（`4dd44f5`）** 且 `fix/mvp-p3-qa` 已删，主工作树已切到 **`feat/deploy-vps`（`4dd44f5`）写部署**（`M apps/web/src/server.ts`＋`M docs/runbook.md`＋`?? .dockerignore`／`Dockerfile`／`deploy/`／`Python/`，未推送）；本窗口用 worktree 隔离，**绝不碰主工作树、也不回滚它的改动**。若 §1 现取发现 #47 已被别的窗口合并，就跳过 §2 第 1 步、直接进第 2 步，并把 main 的 mergeCommit 当新基线。
- 另注意：**两条已合并分支仍未删**＝#45 的 `fix/mvp-p1-qa`（`989a207`）与 #46 的 `fix/mvp-p2-qa`（`584ba97`）（本地／远端都在）；删除要按 §2 第 1 步的三重判据并**分别**单独授权，别顺手删。
- 本轮（第二十二轮）内容口径＝纯文档欠账：#44 收口读数（squash `3a97e7e`、4 文件 60/50、CI run `39632457832`／job `119334034210`）＋窗口外 #45 的交付（squash `0978f7b`、11 文件 724/84、CI run `39875081410`／job `120158607154`）＋轮中合并的 #46（squash `6aa62d4`、8 文件 264/55、CI run `39879619439`）＋推送后合并的 #48（squash `4dd44f5`、4 文件 18/2、CI run `39881597183`）并入档；零抓取／零入库／零批准／零迁移／零写库／零代码改动／零判级面改动。

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
- 在 worktree 里开工时，`git status` 只看得到该 worktree；要判主工作树是否被别的窗口动了，用 `git -C "E:/自建程序/jp_qualification_media" status --porcelain` 现取，别据本 worktree 的干净状态推断全仓。

## 2. 待办（按建议顺序；commit／push／PR／CI 轮询／merge／删分支**各需单独一句话**，做到就停）

1. **收口第二十二轮纯文档 PR #47**：只读轮询 `release-gate` → squash merge → 回读 `mergeCommit.oid` ＋ `git show --stat` 核对与 4 文件逐文件 numstat 一致（数字现取，本文不预写）→ 按三重判据删分支（⚠ 删分支**单独**问一句，即使已授权合并）。
   - 纯文档轮、CI 基底含 #46＋#48，预期读数：vitest **109 passed／12 文件**、pytest **158 passed**、`test:verify-gate` **pass 10／fail 0**、`verify:all` **`"status": "passed"`／6 passed／0 failed**（#47 首轮 run `39879644790`、补记 #46 后 run `39883436390`、#46 的 run `39879619439`、#48 的 run `39881597183` 都是这四条）；补记 #48 推送后 CI 再跑，仍应是这四条。
   - 删分支三重判据（squash 仓库里 `git branch -d` 必报 `not fully merged`、`git rev-list --count main <branch>` 恒为 1，都不是「未合并」的证据）：`gh pr list --state merged --head <branch>` 取 `mergeCommit`＋`headRefOid` → 核 `headRefOid` 与本地／远端 tip 三者相等 → `git diff --diff-filter=A --name-only main <branch>` 计数 **0**；过了再 `git branch -D`＋带 helper 链的 `git push origin --delete <branch>`，删后用 `ls-remote --heads` 核对只剩 `main`（#45 的 `fix/mvp-p1-qa`、#46 的 `fix/mvp-p2-qa` 是另外两条，删它们要分别再问一次）。
2. **文档欠账**（本仓库线性历史下的结构性惯例：本轮交付只能随**下一个** PR 写档，所以每轮收尾必欠一条）：`docs/transition-handoff.md` 文头 main SHA→新 mergeCommit、文头 CI run／job 换成第二十二轮 PR 的、§2 交付表补第二十二轮 PR 行（4 文件 numstat 现取）、§3 把该 PR 的 CI 读数落账、§4 首段分支末态改本轮现取、待办 5 补闭合段；`docs/stage-log.md` 补本轮交付段；`README.md` 时点与 SHA；**并就地重写本文**（§0 换成新 mergeCommit 基线、§2 第 1 步删掉）。
   - ⚠ 给 `docs/transition-handoff.md` 的 §2 表加一行会让 `format:check` 转红（prettier 重排整表列宽）⇒ 改完先 `node node_modules/prettier/bin/prettier.cjs --write docs/transition-handoff.md` 再复跑 `npm run format:check`，即 0。
3. **（推荐）补库侧计数：优先走本机原生 PostgreSQL 55432**：引擎自第十八轮起坏，连续五轮（18～22）未本机重取任何库侧数字；但本机已有原生 PG 监听 `127.0.0.1:55432`（`%TEMP%/jpqm-pg-data`，#46 的本机验证即用它）⇒ 先用它按交接单 §6 重取 `schema_migrations`／`sources`／`facts`／`candidate_facts`／`reviews`／`snapshots`／`change_events` 分布，并补跑 `npm run test` 全量＋`npm run verify:all`＋`npm run ci:fixture:verify`。⚠ 本步只读；`db:migrate`／`db:seed`／任何写库若需要，另要一句话授权。
   - Docker 根因与三条修法见 §3，修不修都不挡这一步：① `wsl --shutdown` 再拉 Desktop（⚠ 会连带杀掉 `Running` 状态的 `Ubuntu-24.04`，动手前确认没有别的窗口在用）；② 重启 Windows；③ Docker Desktop「Clean / Reset data」＝**毁 `docker_data.vhdx`＝毁本机开发库**，不推荐。
4. **MVP P3 已全部交付，别再重复做**：
   - #46 已交付 P2 两项＝404 页首页／搜索入口、更新信息页分页（每页 20 条、保留筛选、`noindex`）——**已完成**。
   - #48 已交付 P3 三项＝首页工具卡箭头改真链接、主な資格补行政書士／基本情報技術者、非法 ICS 直连返回站内 404／错误页——**已完成**（4 文件 18/2）。
   - 当前活跃工作是另一窗口的部署分支 `feat/deploy-vps`（`4dd44f5`，主工作树有 `Dockerfile`／`deploy/` 等未提交）；接手前先按 §1 现取 main 与 open PR，避免撞车。
5. **次选小债（各自可独立成轮）**：`services/api/src/release.ts:93` 回滚路径仍硬编码 `schedule_change`；`README.md:5` 仍写「176 条已批准正式事实」（与交接单 §3 的 **981** 口径不一致，改写前需先取库侧读数）。⚠ `apps/web/src/sitemap.ts` 的 `/2026/` 硬编码**已由 #45 闭合**（年度 URL 改由 `qualificationSitemapContent(view).annualYears` 数据驱动），这条不再是欠账。
6. **新范畴（要新开授权单，别顺手做）**：宅建统计页多来源重构（`snapshot_from_html()` 仍把快照 id 钉在单条 `TAKKEN_SOURCE`，那条背后有已批准事实 ⇒ 该页**只能抓、不能入库**）；基本情報技術者附件提取（`toukei_fe.html` 是目录页、零 `<table>`，数据全在 20 多个 PDF／xlsx，而仓内**既无 PDF 也无 xlsx 解析能力**，要先定依赖）。

## 3. 本机环境卡点（未解，直接决定你能跑什么）

- ⚠ **Docker Desktop 引擎起不来（已连续五轮）⇒ `docker compose up -d postgres` 不可用；但本机已有原生 PG 55432（见下条），库侧任务可绕过 Docker。** 第十九轮已定位根因，**别再按「重启 Desktop 就好」试**：`wsl.exe --mount --bare --vhd <home>\appdata\local\Docker\wsl\disk\docker_data.vhdx` → `ERROR_SHARING_VIOLATION`（句柄被别的进程攥着）→ VM 侧 `wsl-bootstrap run ... --data-disk 8460e93c-...` → `no sd* disk in /sys/block with wwid ending by 8460e93c7545d8e8d0e89d0f`（重试 3 次后 `[F] preparing environment`）→ `apiproxy` 永远 `still waiting for the engine to respond to _ping ... HTTP 503`。取证日志＝`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`。症状指纹：`docker desktop status` 恒 `starting`、`docker info` 回 `Error response from daemon: Docker Desktop is unable to start`、`com.docker.backend`／`Docker Desktop` 进程全在、`docker-desktop` WSL 发行版 `Running` 但里面服务一个都没起。次因（每次必打、非致命）＝`wsl: 检测到 localhost 代理配置，但未镜像到 WSL。NAT 模式下的 WSL 不支持 localhost 代理`。
- **原生 PostgreSQL 55432**：`127.0.0.1:55432` 在监听（第二十二轮轮中 `netstat` 与 `tasklist` 现取，`postgres.exe` 多进程）；连接串（#46 正文的验证命令所用）＝`postgresql://postgres@127.0.0.1:55432/qualification_media`，数据目录 `%TEMP%/jpqm-pg-data`。用它跑 `verify:all`／库侧只读查询不必等 Docker。
- **要补的账**＝按交接单 §6 本机重取 §3 全部库侧计数。现仍沿**第十四轮**复跑读数：`schema_migrations` 22（迁移文件 21，行数≠文件数 ⇒ 判落后只认 `candidate_facts.exam_session` 列存在性）、`sources` 47（`qualification_id` NULL 0；CI 是 45，**别混报**）、`facts` 非合成 approved **981**、`candidate_facts` 1075 approved＋13 rejected＋**0 pending_review**、`reviews` 1006、`snapshots` 44、`change_events` 983、只读预检 `stored=903 computed=865 skipped_approved=865 would_stage=0 blocking=0`／EXIT=0。
- 测试面：本机用 **`npm run test`**（＝`vitest run tests --pool=threads --poolOptions.threads.singleThread`），**不要**图快跑 `npx vitest run`（会连 `scripts/*.test.mjs` 的 node:test 文件一起扫，报两个「No test suite found」的假 FAIL）；跑前确认 **4100 端口没被残留进程占着**，否则 `tests/public-api.test.ts` 抛 `EADDRINUSE` 让整轮退出码 1。本机**没有 `pnpm`**，README／CI 里那串 `pnpm …` 等价换成 `npm run …`。
- 不依赖库的本地自检（#45 的 CI 已全绿；本机可复跑）＝`npm run format:check`／`npm run typecheck`／`npm run build`、`npm run lint` 需补 `--ignore-pattern "Python/**"`（裸跑只红在未跟踪 `Python/` 的 `flamegraph.js` parse error，按铁律不删不提交）、聚焦 vitest、`npm run test:verify-gate`（现在是 **10** 条纯函数断言）。
- 输出与轮询坑：`wsl`／`powershell` 在 Git Bash 下 stdout 是 **UTF-16LE**，直接管道给 `grep` 会被判 `Binary output` ⇒ `| iconv -f UTF-16LE -t UTF-8 | tr -d '\000'`。判 Docker 就绪要看 `docker desktop status` 字符串＋`docker info` 退出码两条，别只看 `wsl -l -v` 的 `Running`。长轮询会被约 150s 的工具超时移到后台且其输出文件在 workspace 外**读不回来**（被安全策略拦）⇒ **分段跑，每段 ≤100s**。

## 4. 铁律速记（全文见 `docs/transition-handoff.md` §1，违反即返工）

- 采集／候选入库／逐条批准＝**三次独立授权**；commit、push、PR、CI 轮询、merge、删分支、`db:migrate`、`db:seed`、写库、DROP 一律等号主「一句话」，**一步一停**（操作类命令可直接跑、不用他点同意）。
- 改 `config/data-coverage-contract.json`（判级面）＝产品决策，另行请示。
- `git add --` **逐路径，绝不 `-A`**；仓库根未跟踪的 **`Python/` 永不提交、也不要删**。
- 临时件放 gitignored 的 `var/` 并在提交前删（往轮遗留的 `var/` 文件别动）；`uv run` 生成的 `services/collector/uv.lock` 提交前删。
- **判据可复跑、数字要现取**：报任何计数前先跑只读命令；发命令那条消息不得预写读数；写库用词分三态（「入库 N 条」要带 `pending_review` 与「未公开」，「批准 N 条」要带 `facts` 计数变化）。
- 门禁语义：非合成 `pending_review != 0` ⇒ `verify:all` **硬失败**（设计内中间态）；`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` ⇒ 历史统计类**永远不会把门禁跑红**，属产品覆盖债，只能靠人记着。
- 并行窗口：优先 `git worktree` 隔离；**不碰主工作树里的未提交改动、不回滚别的窗口的写入**；删分支前先确认它确实属于自己这轮。

## 5. 该读的权威文档（口径不写在本文）

- `docs/transition-handoff.md`＝时点快照＋铁律全文＋§6 可复跑判据命令＋§7 GitHub 通路＋§8 审核通道操作口径。
- `docs/data-gate-semantics.md`＝门禁／判级／溯源／三级授权／鉴权总口径（§6 批准链、§8.1 三态术语、§9 baseline 与夹具维护）。
- 各资格契约：`docs/bookkeeping-source-contract.md`、`docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`、`docs/it-passport-source-contract.md`、`docs/fp-source-contract.md`；宅建没有独立契约文件，阶段闭环与 `source:takken:retio-exam` 登记说明在 `docs/stage1-takken.md`。
- `docs/product-design.md`＝SEO／页面收录契约（18.2 参数筛选页 `noindex,follow`、`:1081` Sitemap 只放可索引 200 正式页；#45 起 sitemap＝状态门＋按内容，空栏目页 `noindex` 且不收；#46 起 `/updates/?page=` 与筛选页 `noindex,follow`、sitemap 仍只收 `/updates/`；#48 起首页工具卡为真链接、主な資格 6 项、非法 ICS 直连走站内 404／错误页）。
- `docs/stage-log.md`＝逐轮交付读数（每轮一段，含踩坑），要「上一轮到底做了什么」看这里而不是看本文。
- `docs/work-package-g-history-presentation.md`＝历年统计接公开面（G-1／G-2）的方案与执行记录。
- ⚠ `docs/codex-handoff.md` 与 `docs/codex-handoff-next.md` 是 **2026-08-11 时点的归档**（文首自述「仅供追溯」），不要据它们推当前状态。
