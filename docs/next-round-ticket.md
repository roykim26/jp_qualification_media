# 轮次工单：下一轮开工前读这一页

> 本文＝**逐轮滚动的开工单**，只写「这一轮做什么、按什么顺序、卡在哪」；口径与机制的权威正文一律**不在这里复制**，改口径请改 `docs/data-gate-semantics.md`、各资格 `docs/*-source-contract.md` 与 `docs/product-design.md`。全量时点快照在 `docs/transition-handoff.md`（本文的 §5 就是它的摘要指针）。
>
> **维护约定**＝每轮收尾时**就地重写本文**（同一文件、别新开），把「当前工单」换成下一轮的；已闭合的条目删掉并在 `docs/stage-log.md` 留读数。文中任何计数只是写作时点的现取值，**开工先跑 §1**。

## 0. 当前工单＝第二十六轮（写于 2026-10-27）

- 仓库根＝`E:\自建程序\jp_qualification_media`，remote＝`roykim26/jp_qualification_media`。
- 写作时点现取：main＝origin/main＝**`fb40890`**（PR #50＝第二十四轮纯文档合并点，4 文件 37 增／23 删；其前三个合并点是 #49＝`eb24e3b`、#48＝`4dd44f5`、#46＝`6aa62d4`）；历史纯线性（`git rev-list --merges --count main` 为 **0**，main 每个 commit 标题带 `(#NN)` ⇒ **一律 squash PR，绝不直接 push main**）。
- **在途＝第二十五轮纯文档 PR**（#50 收口落账＋库侧复核＋交接单／README／本页）：分支 `docs-round25-sync`，隔离 worktree `var/wt-docs25`，4 文件＝`docs/transition-handoff.md`＋`docs/stage-log.md`＋`README.md`＋本文。**PR 号开单后才存在** ⇒ 用 `gh pr list --state open --head docs-round25-sync` 现取，别照抄本文。**状态＝文档已改完、待 commit／push／开 PR；CI 待验。**
- 本轮（第二十五轮）内容口径＝纯文档＋只读库侧复核：#50 收口（head `571b0aa` → squash `fb40890`，4 文件 37/23；CI run `40256876666`／job `121360523757`：vitest 109／12、pytest 158、`test:verify-gate` 10/0、`verify:all` 6/0）＋**开发库丢失与新库现态**（`var/pglite-run/data` 已空，唯一副本＝`var/backup/jpqm-dev-20261023-0930.dump`，恢复出的库是夹具档：45／981／981／981／29／981、迁移 21）＋本机补跑 `verify:all` 6/6、vitest 12／109、`ci:fixture:verify` 0；零抓取／零入库／零批准／零迁移／零业务库写入／零代码改动／零判级面改动。
  ⚠ 号主常并行开多个窗口动同一仓库 ⇒ 若 §1 现取发现该 PR 已被别的窗口合并，就跳过 §2 第 1 步、直接进第 2 步，并把 main 的 mergeCommit 当新基线；**不要回滚别的窗口的写入**。主工作树现切在 **`feat/deploy-vps`（`5aecf25`，已推送、开着 open PR #51）**，另一窗口在做部署；本窗口全程用 worktree 隔离，**绝不碰主工作树**。
- 另注意：遗留 worktree 三个＝`var/wt-docs22`（detached `f2ab75b`）／`var/wt-docs23`（detached `51bbcf8`）／`var/wt-docs24`（detached `571b0aa`），另有另一窗口的 `C:/Users/jinlo/.codex/worktrees/e24e/jp_qualification_media`（detached `97e3fc0`，不动）；`#45`／`#46`／`#47`／`#49`／`#50` 的五条分支已按三重判据删净，远端现有 `main`＋另一窗口的 `feat/deploy-vps`。

## 1. 开工先跑（全部只读，整条可复制）

```
set -a; . ./.env; set +a
git log --oneline -3; git rev-list --merges --count main; git branch -vv; git status --porcelain
GIT_TERMINAL_PROMPT=0 GCM_INTERACTIVE=never git -c http.proxy= -c https.proxy= -c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1 ls-remote --heads origin
gh pr list --state open --json number,headRefName,headRefOid,mergeable,mergeStateStatus,statusCheckRollup
```

- 远端 git 命令**必须**带那串 `-c credential.helper= -c credential.helper=manager -c credential.interactive=0 -c http.version=HTTP/1.1`（第一个 helper 置空以清空追加列表；不加 `http.version=HTTP/1.1` 时 push 报 `Recv failure: Connection was reset`）。
- ⚠ 仓库 git config 里有 `http.proxy=http://127.0.0.1:7890`：该端口**没在听**时要补 `-c http.proxy= -c https.proxy=` 直接连（否则 `Failed to connect to github.com port 443 via 127.0.0.1`）；**在听**时反而不能加（第二十四轮实测：加了空覆盖后 push 超时 21076 ms）。先 `netstat -ano | grep "127.0.0.1:7890.*LISTENING"` 判。
- 裸 `git fetch` 偶发 `schannel: failed to receive handshake, SSL/TLS connection failed`＝本机指纹、不代表断网，远端真值只用上面的 `ls-remote --heads`。
- `gh` 侧：`gh pr create` **必须 `--body-file`**（内联 heredoc 会 exit 0 但静默不开 PR）；`gh pr merge --squash` 成功时**零输出**；`gh pr view -q` 里「字符串 + 数字」会报 `cannot add`，要用 `tostring`／`join`。
- 在 worktree 里开工时，`git status` 只看得到该 worktree；要判主工作树是否被别的窗口动了，用 `git -C "E:/自建程序/jp_qualification_media" status --porcelain` 现取，别据本 worktree 的干净状态推断全仓。

## 2. 待办（按建议顺序；commit／push／PR／CI 轮询／merge／删分支**各需单独一句话**，做到就停）

1. **收口第二十五轮纯文档 PR**：只读轮询 `release-gate` → squash merge → 回读 `mergeCommit.oid` ＋ `git show --numstat` 核对与 4 文件逐文件 numstat 一致（数字现取，本文不预写）→ 按三重判据删 `docs-round25-sync`（⚠ 删分支**单独**问一句，即使已授权合并）。
   - 纯文档轮，CI 预期复现上一轮读数：vitest **109 passed／12 文件**、pytest **158 passed**、`test:verify-gate` **pass 10／fail 0**、`verify:all` **`"status": "passed"`／6 passed／0 failed**。⚠ 这四个数是第二十五轮从 #50 的 run `40256876666`／job `121360523757` 的 job 日志现取的，**不是本轮实测**；本轮只核 CI 是否同样绿。
   - 若 `gh pr merge --squash` 报 head 不最新：用服务端 `gh pr update-branch <号>`（新 merge commit＋CI 自动重跑），更新后重新轮询；**不要 `--admin`**。
   - 删分支三重判据（squash 仓库里 `git branch -d` 必报 `not fully merged`、`git rev-list --count main <branch>` 恒为 1，都不是「未合并」的证据）：`gh pr list --state merged --head <branch>` 取 `mergeCommit`＋`headRefOid` → 核 `headRefOid` 与本地／远端 tip 三者相等 → `git diff --diff-filter=A --name-only main <headRefOid>` 计数 **0**；过了再 `git branch -D`＋带 helper 链的 `git push origin --delete <branch>`，删后用 `ls-remote --heads` 核对（现应是 `main`＋另一窗口的 `feat/deploy-vps` 两条）。
2. **文档欠账**（本仓库线性历史下的结构性惯例：本轮交付只能随**下一个** PR 写档，所以每轮收尾必欠一条）：`docs/transition-handoff.md` 文头 main SHA→新 mergeCommit、文头 CI run／job 换成第二十五轮 PR 的、§2 交付表补第二十五轮 PR 行（4 文件 numstat 现取）、§3 把该 PR 的 CI 读数落账、§4 首段分支末态改本轮现取、待办 5 补闭合段；`docs/stage-log.md` 补本轮交付段；`README.md` 时点与 SHA；**并就地重写本文**（§0 换成新 mergeCommit 基线、§2 第 1 步删掉）。
3. **库侧：开发库已丢失，只剩夹具档**。第二十五轮现取＝本机现存的库是从 `var/backup/jpqm-dev-20261023-0930.dump` 恢复出来的**夹具档**（`schema_migrations` 21／`sources` 45／`facts` 981／`candidate_facts` 981 全 approved／`reviews` 981 全 approve／`snapshots` 29／`change_events` 981）；开发库的 `sources` 47／`candidate_facts` 1075+13 rejected／`reviews` 1006／`snapshots` 44／`change_events` 983／迁移 22 **已不可复原**。
   - 集群可能已停（`%TEMP%\jpqm-r25-pg` 数据目录 + `%TEMP%\jpqm-pg-bin` 二进制）。起：`cd "C:/Users/jinlo/AppData/Local/Temp" && ./jpqm-pg-bin/bin/pg_ctl.exe -D jpqm-r25-pg -l jpqm-r25-pg.log -o "-p 55432 -c listen_addresses=127.0.0.1" start`；停：同目录 `./jpqm-pg-bin/bin/pg_ctl.exe -D jpqm-r25-pg stop`。
   - 连接串＝`postgresql://postgres@127.0.0.1:55432/qualification_media`，要显式传给 `npm run verify:all`。若数据目录也没了，按交接单 §6「库丢失后的恢复」重来（下 zip → bsdtar 抽 bin/share/lib → **复制到 ASCII 路径** → initdb → pg_ctl → createdb → pg_restore；`createdb`／`pg_restore` 属写库，各需一句话授权）。
4. **MVP P1／P2／P3 已全部交付，别再重复做**：#45（P1，11 文件 724/84）、#46（P2，8 文件 264/55）、#48（P3，4 文件 18/2）均已进 main。当前活跃工作是另一窗口的部署分支 `feat/deploy-vps`（`5aecf25`，已推送、open PR **#51**）；接手前先按 §1 现取 main 与 open PR，避免撞车。
5. **次选小债（各自可独立成轮）**：`services/api/src/release.ts:93` 回滚路径仍硬编码 `schedule_change`；`README.md:5` 仍写「176 条已批准正式事实」（与交接单 §3 的 **981** 口径不一致，改写前需先取库侧读数 —— 现在只能取夹具档的 981）；另可清掉三个遗留 worktree（`var/wt-docs22|23|24`，需单独授权）。⚠ `apps/web/src/sitemap.ts` 的 `/2026/` 硬编码**已由 #45 闭合**，这条不再是欠账。
6. **新范畴（要新开授权单，别顺手做）**：宅建统计页多来源重构（`snapshot_from_html()` 仍把快照 id 钉在单条 `TAKKEN_SOURCE`，那条背后有已批准事实 ⇒ 该页**只能抓、不能入库**）；基本情報技術者附件提取（`toukei_fe.html` 是目录页、零 `<table>`，数据全在 20 多个 PDF／xlsx，而仓内**既无 PDF 也无 xlsx 解析能力**，要先定依赖）。

## 3. 本机环境卡点（未解，直接决定你能跑什么）

- ⚠ **Docker Desktop 引擎起不来（已连续八轮，18～25）⇒ `docker compose up -d postgres` 不可用；库侧任务改走 `%TEMP%` 里的临时 PG 18.4 集群（见下条）。** 第十九轮已定位根因，**别再按「重启 Desktop 就好」试**：`wsl.exe --mount --bare --vhd <home>\appdata\local\Docker\wsl\disk\docker_data.vhdx` → `ERROR_SHARING_VIOLATION`（句柄被别的进程攥着）→ VM 侧 `wsl-bootstrap run ... --data-disk 8460e93c-...` → `no sd* disk in /sys/block with wwid ending by 8460e93c7545d8e8d0e89d0f`（重试 3 次后 `[F] preparing environment`）→ `apiproxy` 永远 `still waiting for the engine to respond to _ping ... HTTP 503`。取证日志＝`%LOCALAPPDATA%\Docker\log\host\com.docker.backend.exe.log`。次因（每次必打、非致命）＝`wsl: 检测到 localhost 代理配置，但未镜像到 WSL`。
- **临时 PG 18.4 集群（第二十五轮建的）**：二进制 `%TEMP%\jpqm-pg-bin`（官方 zip 抽出，337,444,127 B 那份）、数据 `%TEMP%\jpqm-r25-pg`、日志 `%TEMP%\jpqm-r25-pg.log`、端口 `127.0.0.1:55432`。⚠ 二进制**不能放中文路径**：直接在 `E:\自建程序\...` 下跑 `initdb` 必报 `FATAL: invalid byte sequence for encoding "UTF8": 0xd7 0xd4`，复制到 ASCII 路径即成功。`tasklist` 里没有常驻 postgres 时先 `pg_ctl start`。
- **本机库现态**＝夹具档（45／981／981／981／29／981、迁移 21），能跑 `verify:all` 与 `ci:fixture` 面，**不能**回答开发库的 `reviews`／`snapshots`／被拒候选。历史开发库读数见交接单 §3（已标注为历史值）。
- 测试面：**规范读数用 `npx vitest run --dir tests --pool=threads --poolOptions.threads.singleThread`（12 文件／109 用例）**。⚠ 仓库根直接跑 `npm run test` 时 `tests` 是**子串过滤**，会把 `var/wt-docs22|23|24` 三个遗留 worktree 的测试一起扫进来（第二十五轮实测 **48 文件／430 用例**，全过但不是规范读数）。也不要用裸 `npx vitest run`（会扫 `scripts/*.test.mjs` 的 node:test 文件，报「No test suite found」假 FAIL）。跑前确认 **4100 端口没被残留进程占着**，否则 `tests/public-api.test.ts` 抛 `EADDRINUSE` 退出码 1。本机**没有 `pnpm`**，README／CI 里那串 `pnpm …` 等价换成 `npm run …`。
- 不依赖库的本地自检＝`npm run format:check`／`npm run typecheck`／`npm run build`、`npm run lint` 需补 `--ignore-pattern "Python/**"`（裸跑只红在未跟踪 `Python/` 的 `flamegraph.js` parse error，按铁律不删不提交）、聚焦 vitest、`npm run test:verify-gate`（现在是 **10** 条纯函数断言）。
- ⚠ **worktree 在 `var/` 下时，`format:check` 的复检必须 `cd` 进 worktree**：从仓库根对 `var/wt-docsNN/...` 跑 prettier 会被根 `.prettierignore` 第 4 行的 `var/` 整段跳过、回「All matched files use Prettier code style!」＝**假绿**（#49 那轮因此让 CI 红在 `format:check`）。正确做法＝`cd var/wt-docsNN` 后用相对 glob：`node ../../node_modules/prettier/bin/prettier.cjs --write "docs/**/*.md" README.md` 再 `--check "docs/**/*.md" README.md`。
- 输出与轮询坑：`wsl`／`powershell` 在 Git Bash 下 stdout 是 **UTF-16LE**，直接管道给 `grep` 会被判 `Binary output` ⇒ `| iconv -f UTF-16LE -t UTF-8 | tr -d '\000'`。判 Docker 就绪要看 `docker desktop status` 字符串＋`docker info` 退出码两条。长轮询会被约 150s 的工具超时移到后台且其输出文件在 workspace 外**读不回来** ⇒ **分段跑，每段 ≤100s**。`gh run view <runId> --log` 报 results-receiver 连接错误时改用 `gh run view --job <jobId> --log`（多数情况原样重试即成功）。CI 日志里有 ANSI 转义，`grep` 用 `-a`。
- 自动权限门：`createdb`／`pg_restore`／任何写库会被分类器判「写操作」直接拒，**即使上一句授权覆盖了整条流程也要再说一句**（第二十五轮实测连拒 3 次后才在明确授权下通过）。

## 4. 铁律速记（全文见 `docs/transition-handoff.md` §1，违反即返工）

- 采集／候选入库／逐条批准＝**三次独立授权**；commit、push、PR、CI 轮询、merge、删分支、`db:migrate`、`db:seed`、写库、DROP 一律等号主「一句话」，**一步一停**（操作类命令可直接跑、不用他点同意）。
- 改 `config/data-coverage-contract.json`（判级面）＝产品决策，另行请示。
- `git add --` **逐路径，绝不 `-A`**；仓库根未跟踪的 **`Python/` 永不提交、也不要删**。
- 临时件放 gitignored 的 `var/` 并在提交前删（往轮遗留的 `var/` 文件别动）；`uv run` 生成的 `services/collector/uv.lock` 提交前删。
- **判据可复跑、数字要现取**：报任何计数前先跑只读命令；发命令那条消息不得预写读数；写库用词分三态（「入库 N 条」要带 `pending_review` 与「未公开」，「批准 N 条」要带 `facts` 计数变化）。
- 门禁语义：非合成 `pending_review != 0` ⇒ `verify:all` **硬失败**（设计内中间态）；`scripts/verify-lib.mjs` 跳过 `requiredLevel ∈ {post_event, optional, not_applicable}` ⇒ 历史统计类**永远不会把门禁跑红**，属产品覆盖债，只能靠人记着。
- 并行窗口：优先 `git worktree` 隔离；**不碰主工作树里的未提交改动、不回滚别的窗口的写入**；删分支前先确认它确实属于自己这轮。

## 5. 该读的权威文档（口径不写在本文）

- `docs/transition-handoff.md`＝时点快照＋铁律全文＋§6 可复跑判据命令（含库丢失后的恢复命令组）＋§7 GitHub 通路＋§8 审核通道操作口径。
- `docs/data-gate-semantics.md`＝门禁／判级／溯源／三级授权／鉴权总口径（§6 批准链、§8.1 三态术语、§9 baseline 与夹具维护）。
- 各资格契约：`docs/bookkeeping-source-contract.md`、`docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`、`docs/it-passport-source-contract.md`、`docs/fp-source-contract.md`；宅建没有独立契约文件，阶段闭环与 `source:takken:retio-exam` 登记说明在 `docs/stage1-takken.md`。
- `docs/product-design.md`＝SEO／页面收录契约（18.2 参数筛选页 `noindex,follow`、`:1081` Sitemap 只放可索引 200 正式页；#45 起 sitemap＝状态门＋按内容，空栏目页 `noindex` 且不收；#46 起 `/updates/?page=` 与筛选页 `noindex,follow`、sitemap 仍只收 `/updates/`；#48 起首页工具卡为真链接、主な資格 6 项、非法 ICS 直连走站内 404／错误页）。
- `docs/stage-log.md`＝逐轮交付读数（每轮一段，含踩坑），要「上一轮到底做了什么」看这里而不是看本文。
- `docs/work-package-g-history-presentation.md`＝历年统计接公开面（G-1／G-2）的方案与执行记录。
- ⚠ `docs/codex-handoff.md` 与 `docs/codex-handoff-next.md` 是 **2026-08-11 时点的归档**（文首自述「仅供追溯」），不要据它们推当前状态。
