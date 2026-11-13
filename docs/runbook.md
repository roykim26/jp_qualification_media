# 阶段 0/1 运行说明

本项目仅支持本地开发。不得配置生产数据库、生产对象存储、AdSense 或真实凭据。

`SITE_ORIGIN` 用于 canonical、`robots.txt` 和 `sitemap.xml` 的绝对 URL；本地可使用 `http://127.0.0.1:3000`。已确认的生产值为 `https://shikakucheck.com`；应只在部署平台的生产环境变量中设置，不能提交真实生产凭据。生产环境缺少该变量时公开站拒绝生成 SEO 文件。

1. `pnpm install`
2. `docker compose up -d`（只在需要本地 PostgreSQL/MinIO 时）
3. `pnpm db:migrate`
4. `pnpm db:seed`
5. `pnpm typecheck && pnpm test && pnpm test:python && pnpm build`

`fixtures/official-snapshots` 中的内容必须使用 `synthetic`/`test-only` 标识；当前没有动态生产事实种子。公开 API 仅返回已批准正式事实，空库时返回空集合。

当前阶段 2 用户页面范围为 6 个首发资格。统一页面入口为 `/shikaku/`，每个资格提供概要、`/{year}/` 年度日程、`/application/`、`/exam-content/` 和 `/pass-rate/` 五类页面；页面只通过公开 API 读取事实，年度页严格按 `examYear` 隔离。日程页和资格年度页提供 `/ics/{qualification}/{year}.ics` 全年下载，日程事件提供单事件下载；没有明确日期的事实不会生成 ICS。`/compare/` 提供动态比较器与 3 篇静态比较指南；`/guide/` 提供 4 篇不包含动态事实的通用指南。

## 当前范围

阶段 0/1/2/3 已归档：六资格页面、跨资格日程/比较/更新、ICS 下载与技术 SEO 基线均已完成。数据侧当前状态为 176 条已批准正式事实、覆盖缺口 0、`pnpm verify:all` 六资格全通过（读数见 `docs/data-gate-semantics.md` 第 10 节）。

仍不在范围内：生产发布与生产数据库/对象存储、实时定时采集、正式认证与外部通知。页面完成不等于数据完成；每个资格哪些字段有官方事实、哪些靠规则型说明闭合，以对应的 `docs/<qualification>-source-contract.md` 为准。

API 契约见 [docs/api-contract.md](api-contract.md)。阶段 1 宅建闭环说明见 [docs/stage1-takken.md](stage1-takken.md)。门禁语义、判级规则与三级授权边界见 [docs/data-gate-semantics.md](data-gate-semantics.md)。

## 本地审核队列

启动前设置本地 reviewer 身份（不要使用生产数据库）：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:ADMIN_REVIEWER_ID='local-data-reviewer'
$env:ADMIN_PORT='3001'
pnpm dev:admin
```

打开 `http://127.0.0.1:3001/review/takken?reviewer=local-data-reviewer`，逐条查看官方原文并填写理由后选择批准、拒绝或延期。

写操作（批准、拒绝、延期、撤销）**只接受 `x-reviewer-id` 请求头**；`?reviewer=` 查询参数仅用于打开队列页（只读）。理由是 URL 里的审核人身份可被 `<img src=…>`、浏览器历史和代理访问日志重放。页面上的按钮会先弹出「审核人 ID」输入框，再由 `fetch` 以请求头发送。鉴权验收判据见 `docs/data-gate-semantics.md` 第 7 节。

高风险事实不得自动批准。批准会在同一维度组合上创建新 revision 并复用（复活）既有 `facts` 行；拒绝与延期不撤销已发布的正式事实；撤销只对 `ci://` 快照驱动的事实生效。

## 正式发布前门禁

本地正式发布前必须执行：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
pnpm release:check
```

该命令依次执行格式检查、全项目 Lint、类型检查、完整 JavaScript 测试、Python 测试、构建、门禁配置测试，以及 6 个首发资格的数据库 → API → Web 回归。任一代码检查或测试失败，或任一资格存在真实官方待审核候选、正式事实数量偏离基线、API 未 verified、Web 检查失败时，命令均以非零状态退出。CI 安装 Node.js 24、Python 3.13 和两个本地 Python 包后，直接调用同一命令。

事实数量基线位于 `config/release-gate-baseline.json`，禁止手工随意修改。只有在官方候选已全部审核、事实数量变化已确认时，才运行：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:RELEASE_BASELINE_CONFIRM='UPDATE_RELEASE_GATE_BASELINE'
pnpm baseline:update -- --confirm=UPDATE_RELEASE_GATE_BASELINE
```

维护命令要求参数和环境变量双重确认，仅允许 localhost 数据库，且任何资格仍有真实待审核候选时拒绝更新。更新后必须审查基线文件差异并重新运行 `pnpm release:check`。

## 远程 CI 数据快照

GitHub Actions 使用 PostgreSQL 16，依次执行迁移、seed、恢复 `fixtures/ci/approved-facts.sql`，最后调用与本地相同的 `pnpm release:check`。fixture 仅包含公开链所需的非 synthetic 已批准事实，不包含审核人、审核理由、冲突、本地路径或原始 HTML 正文。

正式事实变化且审核完成后，先更新门禁基线，再显式重新导出：

```powershell
$env:DATABASE_URL='postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media'
$env:CI_FIXTURE_EXPORT_CONFIRM='EXPORT_SANITIZED_CI_FIXTURE'
pnpm ci:fixture:export -- --confirm=EXPORT_SANITIZED_CI_FIXTURE
pnpm ci:fixture:verify
pnpm release:check
```

导出命令仅允许 localhost 数据库，真实候选存在 pending 时拒绝生成，并采用固定时间和 `ci://` object key 保证输出可审查、可重复。提交前必须同时审查基线 JSON 与 fixture SQL 的差异。

夹具现为 1007 facts / 1007 candidate_facts / 1007 fact_revisions / 37 snapshots（2026-11-12 重导、2026-11-13 随 PR #79 合并）；重导后必须同步修改 `scripts/verify-ci-fixture.mjs` 第 9–12 行的四个计数断言与 `scripts/docker-smoke.mjs` 的四处冒烟断言（第 346／356 行事实数、第 359／360 行快照数），否则门禁或 docker-smoke 会以 `ERR_ASSERTION`／计数不符失败。完整口径见 `docs/data-gate-semantics.md` 第 5、9 节。

## 采集与入库授权

采集、候选入库、审核批准是三次独立授权，逐段需要项目所有者明示批准，抓取授权不包含后两者。各资格的入口脚本与环境变量开关记录在对应的 `docs/<qualification>-source-contract.md`，总则见 `docs/data-gate-semantics.md` 第 8 节。

## 生产 API 只读账号

公开 API 只读，不能复用迁移、seed、采集入库和审核用的管理员账号。分离分三层：

- 迁移 `0025_api_readonly_role.sql` 创建 `qualification_api_ro`（`NOLOGIN`），授予库连接、schema 使用、现有表与后续新表的 `SELECT`，并显式收回写权限。
- `pnpm db:provision-api-role` 用管理员连接把该角色改为可登录并设置口令；口令只从 `API_DB_PASSWORD` 读取，不写进迁移或仓库。
- `pnpm db:verify-readonly` 用该只读账号连真实库，证明读得到、写被拒（SQLSTATE `42501`）。

账号分工：`DATABASE_URL` 继续给迁移、seed、采集入库与审核；API 运行读取 `API_DATABASE_URL`。本地不设 `API_DATABASE_URL` 时回退到 `DATABASE_URL`；`NODE_ENV=production` 时缺少 `API_DATABASE_URL` 直接拒绝启动。

首次开通或轮换口令（PowerShell，整条复制）：

```powershell
$env:DATABASE_URL="postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media"; $env:API_DB_PASSWORD="本机口令"; npm run db:migrate; npm run db:provision-api-role -- --confirm=PROVISION_API_DB_ROLE
```

成功输出 `status: ok`、`login: true`。脚本只允许 localhost；角色不存在时提示先跑 `db:migrate`；重复执行会重新对齐授权，口令轮换也走同一条命令。

验证写操作确实被拒绝：

```powershell
$env:API_DATABASE_URL="postgresql://qualification_api_ro:本机口令@127.0.0.1:5432/qualification_media"; npm run db:verify-readonly
```

判据：`status` 为 `ok`、`currentUser` 为 `qualification_api_ro`、`role` 的 `superuser`／`createRole`／`createDb` 均为 `false`、`write` 的 `insert`／`update`／`delete`／`create_table` 全部为 `denied`，且 `read` 能数出事实与来源。任一项为 `allowed`、`error:<其他 SQLSTATE>` 或退出码非 0 都算失败。口令含 `@`、`:`、`/` 等字符时需按 URL 编码写进连接串。

CI 在 `release-gate` 的迁移与夹具恢复之后，用 CI 专用口令开通角色并跑同一验证，再执行 `release:check`。

## 事实与来源过期检查（只读）

用途：按每条事实的 `verified_at` 年龄和来源的最近快照时间，列出「该重新核对哪些事实、哪些来源该重新抓」，用来决定下一轮复查先看哪个资格、哪个字段。它只输出清单，不判断内容对错，也不改任何数据。

前提：

- 设置 `DATABASE_URL` 指向要检查的库（本机开发库，或生产库的只读副本都可以）。
- 账号只需要读权限。脚本只发一条 `SELECT`，并在 `BEGIN READ ONLY` 事务内执行；仍建议用只读账号，免得将来改脚本时把只读当成唯一的保险。
- 连接超时为 5 秒。没设 `DATABASE_URL` 时脚本不建立任何连接，直接输出 `not_run`。

整条复制执行（PowerShell，一行）：

```powershell
$env:DATABASE_URL="postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media"; npm run data:staleness
```

Git Bash / WSL 用同一件事的另一种写法：

```bash
DATABASE_URL="postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media" npm run data:staleness
```

输出字段（`status` 为 `ok` 时）：

| 字段                              | 含义                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------- |
| `status`                          | `ok`＝已连库并检查完成；`not_run`＝未设 `DATABASE_URL`；`error`＝查询失败                 |
| `checkedAt`                       | 本次检查时刻（UTC ISO 格式）                                                              |
| `referenceYear`                   | 当前 JST 年份，用于判断哪些事实算「历年」                                                 |
| `windowsDays`                     | 本次使用的过期窗口：`fee` 90、`eligibility` 180、`annual` 365、`sourceLink` 7（单位：天） |
| `summary.approvedFacts`           | 命中口径的已批准非合成事实总数（含被跳过的历年记录）                                      |
| `summary.historicalSkipped`       | `exam_year` 小于 `referenceYear` 而被跳过的条数                                           |
| `summary.checked`                 | 实际参与过期判断的条数（＝ `approvedFacts` − `historicalSkipped`）                        |
| `summary.dueFacts`                | 超过窗口的事实条数，等于 `dueFacts` 数组长度                                              |
| `summary.sourcesBehindOnSnapshot` | 最近快照超过 7 天、或从未抓取的来源数，等于 `dueSources` 数组长度                         |
| `dueFacts[]`                      | 过期事实明细，见下                                                                        |
| `dueSources[]`                    | 快照滞后的来源明细，见下                                                                  |

`dueFacts` 每项：`factId`、`qualification`（资格 slug）、`examYear`、`factKey`、`displayValue`（当前展示值）、`verifiedAt`、`ageDays`（距今天数）、`windowDays`（该字段的窗口）、`reason`（`fee` / `eligibility` / `statistics` / `annual`）。数组按 `ageDays ÷ windowDays` 从大到小排序，超期比例最高的排最前。

`dueSources` 每项：`sourceId`、`canonicalUrl`、`lastSnapshotAt`（从未抓取为 `null`）、`ageDays`（从未抓取为 `null`）。数组按 `ageDays` 从大到小排序，从未抓取的排最前。

结构示意（占位值，不是实测读数）：

```json
{
  "status": "ok",
  "checkedAt": "2026-11-09T00:00:00.000Z",
  "referenceYear": 2026,
  "windowsDays": {
    "fee": 90,
    "eligibility": 180,
    "annual": 365,
    "sourceLink": 7
  },
  "summary": {
    "approvedFacts": 0,
    "historicalSkipped": 0,
    "checked": 0,
    "dueFacts": 0,
    "sourcesBehindOnSnapshot": 0
  },
  "dueFacts": [],
  "dueSources": []
}
```

窗口与跳过规则：

- 事实年龄从 `verified_at` 起算，按整天向下取整；严格大于窗口才算过期，恰好等于窗口不算；`verified_at` 为空的事实不判过期。
- 费用类（`fee`、`fee_*`、`payment_method`、`payment_deadline_rule`）90 天；报考资格类（`eligibility`、`eligibility_*`、`application_rule`、`application_change_deadline_rule`）180 天；统计类（`pass_rate`、`pass_rate_*`、`applicants`、`examinees`、`passed`、`statistics_methodology`）365 天，输出里 `reason` 记作 `statistics`；其余所有字段默认 365 天，`reason` 记作 `annual`。
- `exam_year` 小于当前 JST 年份的记录整条跳过：不计入 `dueFacts`，其来源也不参与 `dueSources` 判定。
- 来源按该来源最近一条快照的 `retrieved_at` 判断，没有快照或超过 7 天就进 `dueSources`；同一来源只出一行。
- 统计口径只包含 `facts`、当前 revision、`candidate_facts` 三者均为 `approved` 且候选 `synthetic=false` 的事实。这三层过滤与公开 API 相同，但脚本**不**要求 `source_snapshot_id` 非空，也不把快照是否 `ci://` 或 synthetic 计入，所以条数可能略多于公开页面上可见的事实。

无库时的预期输出（本机未设 `DATABASE_URL`，2026-11-09 实测）：

```json
{
  "status": "not_run",
  "reason": "DATABASE_URL is required for read-only staleness check"
}
```

EXIT=0。这是「本机没有库」时的正常形态，不代表检查失败，也不代表数据过期数为 0。

注意：若设了 `DATABASE_URL` 但库连不上（服务没起、端口不通），脚本会在建连处直接抛出未捕获异常并打印 Node 栈，EXIT=1，**不会**输出 `status: error` 的 JSON。判读时认 `ECONNREFUSED` 即可；`status: error` 只出现在连上库之后查询报错的情况。

边界：

- 只读。全程只有一条 `SELECT` 包在 `BEGIN READ ONLY` 里，不建表、不写 `source_checks`、不改 `verified_at`、不写 `snapshots`。
- 不触发采集。不调用采集器，也不发任何外部 HTTP 请求；`canonicalUrl` 只是从库里原样打印出来的字符串。
- 不参与门禁。结果不进 `release:check`；即使有到期项也仍以 EXIT=0 结束（只有连上库后查询失败才是 EXIT=1），到期项要不要处理由人工判断。
- 「过期」只是时间阈值，不等于内容已错。是否真需要改，仍以对应 `docs/<qualification>-source-contract.md` 和官方原文为准。

## 来源巡检与落库（patrol）

用途：把全部登记来源统一抓一遍，判定 `unchanged`／`changed`／`failed`／`blocked`，留下连续失败记录。分两步、两次授权：巡检抓取（采集类，不连库）与巡检落库（只写运营表）。来源清单由 `collector.source_registry` 聚合六链现有登记（含 capture-only 证据），不新增 URL。

判定口径：200 同 hash 或 304 → `unchanged`；200 新 hash → `changed`（写快照文件，不产候选）；404/410/网络错误/5xx 重试耗尽/跨域被拒 → `failed`；200 但最终 URL 路径偏离登记路径 → `blocked`（疑似改版，人工定新 URL，不自动改登记）。持久 ETag 缓存在 `var/patrol/cache.json`，304 跨运行生效。

第一步·巡检抓取（需所有者明示授权；只写 `var/patrol/` 与 `var/official-snapshots/<qual>/`，不连库）：

```bash
PATROL_LIVE_AUTHORIZED=1 PYTHONIOENCODING=utf-8 npm run patrol:sources
```

只巡个别来源（授权单写明的 id）：

```bash
PATROL_LIVE_AUTHORIZED=1 PATROL_SOURCE_IDS="source:fundamental-it:cbt-s" PYTHONIOENCODING=utf-8 npm run patrol:sources
```

判据＝报告 `database_write: not_run`、`candidate_ingest: not_run`；`var/patrol/patrol-report.json` 每来源一条四态结果；`changed` 来源在对应快照目录有新 hash 文件。`NODE_ENV=production` 或缺开关直接拒绝。

第二步·巡检落库（独立授权；只写 `capture_runs`／`snapshots`／`source_checks` 三张运营表，绝不写候选与事实）：

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:55432/qualification_media" PATROL_LOCAL_WRITE=1 PYTHONIOENCODING=utf-8 npm run patrol:record
```

判据＝`status: recorded`、`candidates: 0`、`approval: not_run`；仅 localhost 库。同一条报告重跑，`capture_runs`／`source_checks` 新增为 0（幂等），`snapshots` 按 `(source_id,content_hash)` 对齐。

## 人工日检（ops:daily，只读）

用途：一条只读命令产出当日运营日报，回答「今天先处理什么」。聚合来源健康（最近检查、连续失败、告警级）、到期事实/滞后来源（与 `data:staleness` 同口径）、待审队列、facts 对基线只读比对、巡检覆盖缺口。告警分级：连续失败 ≥3、`blocked`、404/410 单次 → critical；连续失败 1–2、来源 >7 天无成功检查 → warning。阈值在 `config/source-ops.json`。

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:55432/qualification_media" npm run ops:daily
```

判据＝`status: ok`；报告落 `var/ops-reports/<JST日期>.json` 与 `.md`，markdown 置顶「今日需处理」（critical → 待审 → 到期事实）。有 critical 时 EXIT=1，否则 0；未设 `DATABASE_URL` 输出 `not_run`、EXIT=0。全程 `BEGIN READ ONLY`，不写库、不抓取、不发外部请求。不装定时任务、不装外部通知（2026-11-11 所有者拍板）；每日手动跑。

日检流程（约 5 分钟）：跑 `ops:daily` → 读「今日需处理」→ critical/blocked 来源决定是否进入下面的数据更新流程；warning 与到期事实排入复查；待审候选走审核批准授权。

## 官方数据更新流程（SOP）

触发：日报 `changed`/`blocked`/critical、`data:staleness` 到期、官方公告。采集、候选入库、审核批准仍是三次独立授权，逐段需所有者明示；巡检抓取与巡检落库也各算一次授权。

1. 采集授权（明示）→ 对应资格 capture 脚本或 `patrol:sources`。
2. 离线分析（analyze/precheck，不写库），确认候选与官方原文一致。
3. 入库授权（明示）→ 对应 ingest 脚本，候选 `pending_review`（第二态，未公开）。
4. 批准授权（明示）→ admin 以 `x-reviewer-id` 头逐条对照官方原文批准（第三态）。
5. `npm run build`＋`npm run verify:all` 6/6。
6. 仅当 facts 计数变化：`baseline:update`＋`ci:fixture:export` 同批，同步 `scripts/verify-ci-fixture.mjs` 四处计数断言与 `scripts/docker-smoke.mjs` 冒烟断言，`ci:fixture:verify` 通过；同一 PR 进 main（见第 9 节口径）。
7. 全量回归绿 → commit → push（明示）→ PR（明示）→ 合并（「合并」明示）。
8. `pg_dump` 数据包导出备用。部署暂缓，本流程不执行任何上线动作。

失效分支：`blocked`/404 来源不自动改 `canonical_url`；所有者拍板新 URL 后「代码＋迁移＋文档」同批改（FE cbt-s 先例），再回到第 1 步。

## 生产部署（VPS，web+API 公开面）

上线范围＝公开站（web）＋公开 API＋PostgreSQL＋Caddy 自动 HTTPS。admin 与采集链不在 VPS 上运行（admin 写侧只有 `x-reviewer-id` 头一种弱鉴权，绝不能暴露公网；采集继续在开发机本机跑）。

拓扑：`caddy(80/443) → web(3000) → api(4100) → db(5432)`，除 caddy 外全部只在 compose 内部网络。`WEB_HOST`/`API_HOST` 默认仍为 `127.0.0.1`（本机开发形态不变），仅 compose 显式设 `0.0.0.0` 供容器互访。生产 db 镜像为 `postgres:18-alpine`，与开发机现用库（PG 18）同主版本——PG 18 的 `pg_dump` 备份无法恢复到 PG 16（`transaction_timeout` 等 17+ 参数会报错），故 2026-11-13 起生产与 docker-smoke 从 16 升 18；`release-gate` CI 仍用 PG 16，保留迁移双版本兼容证明。

### 首次部署（Ubuntu 24.04，整条复制执行）

1. 装 Docker（官方脚本）：

```bash
curl -fsSL https://get.docker.com | sh
```

判据＝`docker --version` 有输出。

2. 域名解析：在域名商处给 `shikakucheck.com` 加 A 记录 `@` 与 `www` 都指向 VPS IPv4。判据＝`getent A shikakucheck.com` 返回该 IP。

3. 拉代码并配置环境：

```bash
git clone https://github.com/roykim26/jp_qualification_media.git /opt/jpqm && cd /opt/jpqm && cp deploy/env.prod.example deploy/.env && sed -i "s/change-me/$(openssl rand -hex 24)/" deploy/.env
```

判据＝`grep -c '^DB_PASSWORD=' deploy/.env` 与 `grep -c '^API_DB_PASSWORD=' deploy/.env` 都输出 1，且两个值都不是 change-me。

4. 构建镜像并先起数据库：

```bash
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml up -d --build db
```

判据＝`docker compose -f deploy/docker-compose.prod.yml ps db` 为 healthy。API 现在要求独立的只读账号，账号未开通前不要起 api；第 5 步用一次性容器把库和账号准备好。

5. 建库表、灌入已批准数据并开通只读账号（API 尚未启动，统一用一次性容器执行；镜像里已带 `config/`、`dist/packages/db/migrations` 与 `scripts/`）：

```bash
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml run --rm api node dist/packages/db/src/migrate.js && docker compose -f deploy/docker-compose.prod.yml run --rm api node dist/packages/db/src/seed.js && docker compose -f deploy/docker-compose.prod.yml run --rm -e API_DB_PASSWORD=$(grep ^API_DB_PASSWORD= deploy/.env | cut -d= -f2) api node scripts/provision-api-db-role.mjs --confirm=PROVISION_API_DB_ROLE --allow-non-local
```

（2026-11-13 修正：provision 必须显式 `-e API_DB_PASSWORD=…` 从 `deploy/.env` 直取——`docker compose run` 不会把 `.env` 的插值变量自动传进容器，compose 的 api 服务环境里也没有 `API_DB_PASSWORD`，旧写法会报 `API_DB_PASSWORD is required.`。）

判据＝migrate 逐条输出 `Applied <迁移文件>.`，条数等于镜像里 `dist/packages/db/migrations/*.sql` 的文件数（2026-11-13 是 30 条、末条为 `0029_fe_statistics_suiihyo_source.sql.`；此前 2026-11-12 口径为 29 条／末条 0028，已过期）；同一条 migrate 再跑一次**零 `Applied` 输出**（幂等）；seed 输出 `Seeded 6 stable qualification records`；provision 输出 `status: ok`、`login: true`。若报 `ENOENT ... migrations`，说明镜像没带上迁移目录，属构建缺陷，不要手工补目录。compose 内部库主机名是 `db`，故 provision 需显式加 `--allow-non-local`；本机默认仍只允许 localhost。

6. 从开发机导入生产数据（pg_dump 的自定义格式备份）：

```bash
scp <备份文件> root@<VPS_IP>:/tmp/prod.dump && cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml exec -T db pg_restore -U qualification_prod -d qualification_media --clean --if-exists --no-owner --no-privileges --exit-on-error < /tmp/prod.dump
```

（导入第 6 步后第 5 步的 seed 会被覆盖为备份时点，属预期；两者顺序不能反。2026-11-13 修正：加 `--no-privileges`——开发机 dump 的 ACL 引用本机 `postgres` 角色，生产库没有该角色，带 ACL 恢复会因 `role "postgres" does not exist` 中断；跳过后重建的表靠迁移 0025 的 `ALTER DEFAULT PRIVILEGES`（以 `qualification_prod` 执行）自动获得只读 `SELECT`。**导入完成后必须再跑一次第 5 步的 provision 重新对齐授权**，随后用 `docker compose -f deploy/docker-compose.prod.yml run --rm api node scripts/verify-api-readonly.mjs --allow-non-local` 验证写被拒——api 服务环境已带 `API_DATABASE_URL`，无需再传。）

判据＝

```bash
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml exec -T db psql -U qualification_prod -d qualification_media -tAc "select count(*) from facts where status='approved'"
```

输出与备份时点一致（2026-10-26 开发机基线是 **981**、2026-11-13 现取是 **1007**；以实际备份时点为准，别硬套）。

7. 起全部服务并验收：

```bash
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml up -d --build && docker compose -f deploy/docker-compose.prod.yml ps
```

判据＝四个服务都 running/healthy。healthcheck 只证明进程与端口活着（api 探 `/health`、web 探 `/`），数据面继续在开发机检查：

```bash
for path in / /shikaku/bookkeeping/ /schedule/ /updates/ /sitemap.xml /ics/takken/2026.ics; do curl -s -o /dev/null -w "$path %{http_code} %{content_type}\n" "https://shikakucheck.com$path"; done
curl -s https://shikakucheck.com/robots.txt
curl -s https://shikakucheck.com/sitemap.xml | grep -o '/shikaku/bookkeeping/pass-rate/' | head -1
curl -s https://shikakucheck.com/sitemap.xml | grep -c '?year='
curl -s "https://shikakucheck.com/shikaku/bookkeeping/pass-rate/?year=2010" | grep -c 'content="noindex,follow"'
```

判据＝六个路径全 200（ICS 为 `text/calendar`，`/sitemap.xml` 为 XML，其余 `text/html`）；robots 里 Sitemap 行是 `https://shikakucheck.com/sitemap.xml`；sitemap 含簿記 pass-rate 页、`?year=` 计数为 **0**；年份筛选页 noindex 计数为 **1**。再抽一眼内容：首页含「資格試験の公式情報」、`/shikaku/bookkeeping/` 含「日商簿記」。

以上第 3–7 步的机器版＝`npm run smoke:docker`（CI 的 `docker-smoke` job 跑同一条命令）：构建镜像 → 临时 `postgres:18-alpine` → migrate（含二次幂等）→ seed → 恢复 CI 夹具 → 开通只读角色并验证写被拒 → 起 api+web → 断言 1007 条事实与 37 个夹具快照、首页/资格页/API/sitemap/noindex/ICS/robots/404。改动 Dockerfile、compose 或依赖后先让这条冒烟绿，再上 VPS。

### 例行备份（VPS root crontab）

```bash
(crontab -l 2>/dev/null; echo '15 4 * * * docker compose -f /opt/jpqm/deploy/docker-compose.prod.yml exec -T db pg_dump -U qualification_prod -Fc qualification_media > /var/backups/jpqm-$(date +\%F).dump && find /var/backups -name "jpqm-*.dump" -mtime +14 -delete') | crontab -
```

判据＝`crontab -l` 末行存在；次日 `/var/backups/jpqm-*.dump` 有当日文件。

### 更新发布

```bash
cd /opt/jpqm && git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build
```

有新迁移时随后补跑第 5 步的 migrate 与 provision（新表由默认权限获得 `SELECT`，provision 重新对齐授权）。判据＝`docker compose ... ps` 全 running 且第 7 步验收复跑通过。动了 Dockerfile、`.dockerignore`、compose 或依赖版本的发布，先在本机或 CI 跑 `npm run smoke:docker` 绿了再 merge。
