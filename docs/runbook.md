# 运行说明（本机开发 → 生产部署）

本文件同时覆盖**本机开发**与**生产部署**两套形态。第 1–8 节与第 9 节的部分内容适用于本机；「生产部署（VPS）」一节及其后内容适用于生产。两者不得混用凭据：本机用 `qualification_dev`，生产用 `deploy/.env` 中的口令，真实凭据只存在于服务器上，不提交仓库。

> 2026-11-24 修订：本文件此前在开头写「仅支持本地开发、不得配置生产数据库」，与后文的「生产部署（VPS）」章节自相矛盾（生产自 2026-11-15 起已在 https://shikakucheck.com 运行）。现已改为双形态说明，并把数据读数从 176 条更新为当前实际值。

`SITE_ORIGIN` 用于 canonical、`robots.txt` 和 `sitemap.xml` 的绝对 URL；本地可使用 `http://127.0.0.1:3000`。已确认的生产值为 `https://shikakucheck.com`；应只在部署平台的生产环境变量中设置，不能提交真实生产凭据。生产环境缺少该变量时公开站拒绝生成 SEO 文件。

### web 进程的启动门禁（Sprint 3C）

`NODE_ENV=production` 时，web 进程要求 `API_BASE_URL` 与 `SITE_ORIGIN` **都显式设置**，缺任一项直接拒绝启动（退出码非 0，stderr 打印 `API_BASE_URL is required in production` 或 `SITE_ORIGIN is required in production`）。

之所以在启动期硬失败，而不是运行期降级：web 原先对 `API_BASE_URL` 的缺省值是 `http://127.0.0.1:4100`。在容器里这个地址指向**自己**，于是所有数据页都连不上 API 而返回 503，而 `/` 因为走 `Promise.allSettled` 降级仍然返回 200 —— 而 compose 的 web healthcheck 恰好探 `/`。结果就是「用户看到整站故障，运维看到服务健康」。启动期失败把这种状态提前到部署时刻。

容器内自检：

```bash
docker compose -f deploy/docker-compose.prod.yml exec -T web node -e "fetch('http://127.0.0.1:3000/robots.txt').then(r=>r.text()).then(t=>console.log(t.split('\n').filter(l=>l.startsWith('Sitemap:')).join('\n')))"
```

输出应为 `Sitemap: https://shikakucheck.com/sitemap.xml`；若显示的是 `http://127.0.0.1:3000/...`，说明 `SITE_ORIGIN` 没进到容器。

`WEB_HOST` 有意**不在**门禁范围内：它缺失时 web 绑 `127.0.0.1`，Caddy 连不上，web 容器 healthcheck 随即失败，Caddy 因此不启动 —— 这是响亮的失败，不是静默的错误成功。

1. `pnpm install`
2. `docker compose up -d`（只在需要本地 PostgreSQL/MinIO 时）
3. `pnpm db:migrate`
4. `pnpm db:seed`
5. `pnpm typecheck && pnpm test && pnpm test:python && pnpm build`

`fixtures/official-snapshots` 中的内容必须使用 `synthetic`/`test-only` 标识；当前没有动态生产事实种子。公开 API 仅返回已批准正式事实，空库时返回空集合。

当前阶段 2 用户页面范围为 6 个首发资格。统一页面入口为 `/shikaku/`，每个资格提供概要、`/{year}/` 年度日程、`/application/`、`/exam-content/` 和 `/pass-rate/` 五类页面；页面只通过公开 API 读取事实，年度页严格按 `examYear` 隔离。日程页和资格年度页提供 `/ics/{qualification}/{year}.ics` 全年下载，日程事件提供单事件下载；没有明确日期的事实不会生成 ICS。`/compare/` 提供动态比较器与 3 篇静态比较指南；`/guide/` 提供 4 篇不包含动态事实的通用指南。

## 当前范围

阶段 0/1/2/3 已归档：六资格页面、跨资格日程/比较/更新、ICS 下载与技术 SEO 基线均已完成。生产站自 2026-11-15 起在 `https://shikakucheck.com` 运行。

数据侧当前状态为 **1007 条**已批准正式事实（宅建 16／行政書士 15／IT Passport 10／基本情報技術者 28／簿記 863／FP 75）、覆盖缺口 0、`pnpm verify:all` 六资格全通过（读数见 `docs/data-gate-semantics.md` 第 10 节）。注意 1007 条里簿記占 863 条（85.7%）且几乎全是历年合格率统计，**条数不代表六个资格信息同等丰富**；`coverageGaps=0` 也不代表字段齐备（`conditional` 档在维度未命中时整条跳过、`post_event` 档永不参与），语义见 `docs/data-gate-semantics.md`。

仍不在生产范围：实时定时采集与采集链本身（采集继续在开发机本机跑）。admin 已作为独立容器部署在 `/admin/`（HTTP Basic，见「admin 后台部署与鉴权」）。页面完成不等于数据完成；每个资格哪些字段有官方事实、哪些靠规则型说明闭合，以对应的 `docs/<qualification>-source-contract.md` 为准。

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

## admin 后台部署与鉴权

本地开发仍用上面的 `ADMIN_REVIEWER_ID`（`x-reviewer-id` 请求头 / `?reviewer=` 查询参数），不要把该模式带到生产。

生产把审核与到期复核页面挂在 `https://shikakucheck.com/admin/`：Caddy `handle_path /admin/*` 只负责 TLS 与剥离前缀，鉴权由应用自己做 HTTP Basic，避免两层口令不同步。`apps/admin` 作为独立 `admin` 容器（端口 3002）与 `/opt/jpqm/deploy/docker-compose.prod.yml` 一起部署。

生成一条账号凭据（口令不入 shell 历史）：

```bash
ADMIN_PASSWORD='至少 12 位' node scripts/admin-hash-password.mjs operator
# 输出形如 operator:scrypt:<saltHex>:<hashHex>
```

把输出写进生产 `deploy/.env` 的 `ADMIN_AUTH_USERS`（多账号用英文逗号分隔，`.env` 不提交）。**生产环境未设置时 `admin` 容器会拒绝启动**（fail closed）；`ADMIN_BASE_PATH=/admin` 仅用于让页面内 `fetch` 走 `/admin/internal/...`，容器内路由仍是根路径。

验收：

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://shikakucheck.com/admin/review/takken          # 401
curl -s -o /dev/null -w '%{http_code}\n' -u operator:口令 https://shikakucheck.com/admin/review/takken  # 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://shikakucheck.com/admin        # 308 …/admin/
```

换口令/加账号：重新生成条目 → 改 `deploy/.env` → `docker compose -f deploy/docker-compose.prod.yml up -d admin`（无需重建镜像）。

排障 401：先看 `docker compose -f deploy/docker-compose.prod.yml exec -T admin printenv ADMIN_AUTH_USERS`（不应为空）；应用启动日志里 `invalid ADMIN_AUTH_USERS ...` 表示条目格式不对（名字 2–32 位 `[A-Za-z0-9._-]`、salt 32 个 hex、hash 64 个 hex）；浏览器可能缓存了旧口令，换无痕窗口再试。

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
$env:DATABASE_URL="postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media"; $env:API_DB_PASSWORD="本机口令"; pnpm db:migrate; pnpm db:provision-api-role -- --confirm=PROVISION_API_DB_ROLE
```

成功输出 `status: ok`、`login: true`。脚本只允许 localhost；角色不存在时提示先跑 `db:migrate`；重复执行会重新对齐授权，口令轮换也走同一条命令。

验证写操作确实被拒绝：

```powershell
$env:API_DATABASE_URL="postgresql://qualification_api_ro:本机口令@127.0.0.1:5432/qualification_media"; pnpm db:verify-readonly
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
$env:DATABASE_URL="postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media"; pnpm data:staleness
```

Git Bash / WSL 用同一件事的另一种写法：

```bash
DATABASE_URL="postgresql://qualification_dev:qualification_dev@127.0.0.1:5432/qualification_media" pnpm data:staleness
```

输出字段（`status` 为 `ok` 时）：

| 字段                              | 含义                                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`                          | `ok`＝已连库并检查完成；`not_run`＝未设 `DATABASE_URL`；`error`＝查询失败                                                                                       |
| `checkedAt`                       | 本次检查时刻（UTC ISO 格式）                                                                                                                                    |
| `referenceYear`                   | 当前 JST 年份，用于判断哪些事实算「历年」                                                                                                                       |
| `windowsDays`                     | 本次使用的过期窗口：`fee` 90、`eligibility` 180、`annual` 365、`sourceLink` 7（单位：天）                                                                       |
| `summary.approvedFacts`           | 命中口径的已批准非合成事实总数（含被跳过的历年记录）                                                                                                            |
| `summary.historicalSkipped`       | `exam_year` 小于 `referenceYear` 而被跳过的条数                                                                                                                 |
| `summary.checked`                 | 实际参与过期判断的条数（＝ `approvedFacts` − `historicalSkipped`）                                                                                              |
| `summary.dueFacts`                | 超过窗口的事实条数，等于 `dueFacts` 数组长度                                                                                                                    |
| `summary.sourcesBehindOnSnapshot` | 最近一次抓取超过 7 天、或从未抓取的来源数，等于 `dueSources` 数组长度（抓取时间优先取 `source_checks.checked_at`，没有检查记录时回退 `snapshots.retrieved_at`） |
| `dueFacts[]`                      | 过期事实明细，见下                                                                                                                                              |
| `dueSources[]`                    | 抓取滞后的来源明细，见下                                                                                                                                        |

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
- 来源按该来源最近一次抓取判断（优先 `source_checks` 的最近一条 `checked_at`，缺失时回退 `snapshots.retrieved_at`），没有抓取记录或超过 7 天就进 `dueSources`；同一来源只出一行。巡检落库只给 `changed` 的来源写快照，所以不能用快照时间代表「抓过没有」。
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

## 到期事实复核（re-verification）

`data:staleness` 报出的到期事实，若今天官网内容与已批准值一致，用 admin 的「确认无变化」把这次复核落账。否则事实会一直到期，而唯一能刷新 `verified_at` 的路径是「再产一条候选并批准」——值没变时根本产不出候选。

前置迁移：`packages/db/migrations/0031_fact_reverification.sql`（`fact_revisions.verified_by` / `verification_note`，已在 2026-11-25 应用到生产）。

本机起 admin（`DATABASE_URL` 指本地库，或经 SSH 隧道指生产库 127.0.0.1:15432）：

```powershell
$env:DATABASE_URL="postgresql://qualification_prod:<pw>@127.0.0.1:15432/qualification_media"; $env:ADMIN_REVIEWER_ID="<复核人>"; pnpm dev:admin
```

打开 `http://127.0.0.1:3001/reverify/<slug>?reviewer=<复核人>`（slug 与 `/review/<slug>` 相同：`bookkeeping` / `fp` / `gyoseishoshi` / `takken` / `it-passport` / `fundamental-it-engineer`），只看**超过窗口**的当期事实；逐条填复核理由后点「确认无变化」。

机制：追加一条复用当前 candidate 的 `approved` revision（`normalized_value` / `display_value` 原样沿用，`verified_at=now`，`verified_by` / `verification_note` 记录复核人与理由），并把 `facts.current_revision_id` 指过去。

- **不写 `change_events`**：内容没变，不应出现在「更新」列表。
- **不改 candidate、不写 review**：provenance 审计要求最新一条 review 是 approve，同值复核不产生新的审核决策。
- 只对超过窗口的事实生效；窗口内调用返回 400。
- 同一天同一事实重复提交幂等：`idempotency_key=reverify:<factId>:<JST 日期>`，已存在且已是当前 revision 时直接返回 200。
- 复核后 `data:staleness` 的 `dueFacts` 应减少；`sourcesBehindOnSnapshot` 与「内容是否变化」解耦（口径见上一节）。

判据：打开页面能看到到期卡片；提交后 `fact_revisions` 多一条 `verified_by` 非空、`verification_note` 有内容的同值 revision；`data:staleness` 的 `dueFacts` 下降。

## 来源巡检与落库（patrol）

用途：把全部登记来源统一抓一遍，判定 `unchanged`／`changed`／`failed`／`blocked`，留下连续失败记录。分两步、两次授权：巡检抓取（采集类，不连库）与巡检落库（只写运营表）。来源清单由 `collector.source_registry` 聚合六链现有登记（含 capture-only 证据），不新增 URL。

判定口径：200 同 hash 或 304 → `unchanged`；200 新 hash → `changed`（写快照文件，不产候选）；404/410/网络错误/5xx 重试耗尽/跨域被拒 → `failed`；200 但最终 URL 路径偏离登记路径 → `blocked`（疑似改版，人工定新 URL，不自动改登记）。持久 ETag 缓存在 `var/patrol/cache.json`，304 跨运行生效。

第一步·巡检抓取（需所有者明示授权；只写 `var/patrol/` 与 `var/official-snapshots/<qual>/`，不连库）：

```bash
PATROL_LIVE_AUTHORIZED=1 PYTHONIOENCODING=utf-8 pnpm patrol:sources
```

只巡个别来源（授权单写明的 id）：

```bash
PATROL_LIVE_AUTHORIZED=1 PATROL_SOURCE_IDS="source:fundamental-it:cbt-s" PYTHONIOENCODING=utf-8 pnpm patrol:sources
```

判据＝报告 `database_write: not_run`、`candidate_ingest: not_run`；`var/patrol/patrol-report.json` 每来源一条四态结果；`changed` 来源在对应快照目录有新 hash 文件。`NODE_ENV=production` 或缺开关直接拒绝。

抓取在哪台机器跑：默认在**开发机**跑，再把产物同步到生产（见下一条）。2026-11-25 实测生产云出口访问 jafp／kinzai／gyoseishoshi 会被连接重置或超时（16 条 `failed` 全部是本机 200），在生产直接跑抓取会把「出口被限」记成「来源坏了」，污染连续失败记录。开发机需要 Python 3.13 与 `httpx`／`beautifulsoup4`／`lxml`／`pydantic`（生产镜像 `node:24-slim` 不含 Python，宿主 Python 3.6 也跑不了 collector），并设置 `PYTHONPATH=services/collector/src:services/parser/src`（Windows 用分号）。

### 同步巡检产物到生产（patrol:sync）

抓取只写本机 `var/patrol/`；生产只需 `registry.json` 给 `ops:daily` 算覆盖缺口，另外 `patrol-report.json`／`cache.json` 留作证据与 304 缓存。落库前若在生产执行 `patrol:record`，还要先把快照文件送过去。

```bash
pnpm patrol:sync                 # 只同步三份产物（report/registry/cache）
pnpm patrol:sync -- --snapshots  # 连 var/official-snapshots/<qual>/ 一起同步
```

同步前脚本会校验本机三份产物齐全、报告 `run_id` 与结果条数一致，并把报告里的 `snapshot_path` 在**传输副本**里改写成仓库相对 POSIX 路径（本地原始报告不动，`patrol:record` 仍用本机绝对路径校验哈希）。远端目录由 `PATROL_REMOTE_DIR`（默认 `/opt/jpqm/var/patrol`）、`PATROL_REMOTE_SNAPSHOTS`、`PATROL_SYNC_HOST`、`PATROL_SSH_KEY` 决定。判据＝打印本地 `run_id`／条数并列出远端三份文件的 `ls -l`。

第二步·巡检落库（独立授权；只写 `capture_runs`／`snapshots`／`source_checks` 三张运营表，绝不写候选与事实）：

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:55432/qualification_media" PATROL_LOCAL_WRITE=1 PYTHONIOENCODING=utf-8 pnpm patrol:record
```

判据＝`status: recorded`、`candidates: 0`、`approval: not_run`；仅 localhost 库。同一条报告重跑，`capture_runs`／`source_checks` 新增为 0（幂等），`snapshots` 按 `(source_id,content_hash)` 对齐。

生产库落库（开发机执行）：护栏要求 `DATABASE_URL` 的 hostname 是 localhost／127.0.0.1，所以先开 SSH 隧道，把生产 db 容器端口映射到本机，再用生产角色 `qualification_prod` 落库。生产 compose 里 db 未发布端口，容器 IP 用 `docker inspect` 取（本例 `172.19.0.2`）。

```bash
ssh -i ~/.ssh/jpqm_deploy -N -L 15432:172.19.0.2:5432 root@47.79.87.163   # 另开一个终端
# 密码：ssh ... 'cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml exec -T db printenv POSTGRES_PASSWORD'
export DATABASE_URL="postgresql://qualification_prod:<pw>@127.0.0.1:15432/qualification_media"
export PATROL_LOCAL_WRITE=1 NODE_ENV=development
pnpm patrol:record
```

落库只写 `capture_runs`／`snapshots`／`source_checks`，不产候选、不改事实；未登记在 `sources` 表的 capture-only id 会以 `skipped_unregistered` 跳过（2026-11-25 实测 11 条）。`source_checks` 的 `checked_at` 用报告时间，所以生产「来源健康」立刻反映这次抓取——这是清掉陈旧 `blocked` 记录的正规方式（陈旧记录不会再被手工 UPDATE 掩盖）。

## 人工日检（ops:daily，只读）

用途：一条只读命令产出当日运营日报，回答「今天先处理什么」。聚合来源健康（最近检查、连续失败、告警级）、到期事实/滞后来源（与 `data:staleness` 同口径）、待审队列、facts 对基线只读比对、巡检覆盖缺口。告警分级：连续失败 ≥3、`blocked`、404/410 单次 → critical；连续失败 1–2、来源 >7 天无成功检查 → warning。阈值在 `config/source-ops.json`。

```bash
DATABASE_URL="postgresql://postgres@127.0.0.1:55432/qualification_media" pnpm ops:daily
```

判据＝`status: ok`；报告落 `var/ops-reports/<JST日期>.json` 与 `.md`，markdown 置顶「今日需处理」（critical → 待审 → 到期事实）。有 critical 时 EXIT=1，否则 0；未设 `DATABASE_URL` 输出 `not_run`、EXIT=0。全程 `BEGIN READ ONLY`，不写库、不抓取、不发外部请求。

**注意退出码不足以判断成败**：`1` 同时代表「有 critical」和「报告自己跑挂了」。要区分，看 stdout 是否是一份 `"status": "ok"` 的报告——包装脚本就是这么做的（见下一节）。

报告里有三个容易混淆的字段，2026-11-25 起如此：

| 字段            | 回答的问题           | 取值                            | 谁在读                              |
| --------------- | -------------------- | ------------------------------- | ----------------------------------- |
| `status`        | 报告跑起来了吗       | 恒 `ok`（跑挂了就根本没有报告） | `ops-daily-cron.sh` 的字段提取      |
| `reportStatus`  | 同上，名字说得更清楚 | 恒 `ok`                         | 人；与 `status` 永远一致            |
| `overallStatus` | 今天需要动手吗       | `ok` / `action_needed`          | 人；`action_needed` ⟺ `hasCritical` |

`status` 保留是为了不打破已在跑的 cron 行与本文档的判据，**它不代表健康度**——有 critical 时它仍然是 `ok`。要判断「今天要不要干活」看 `overallStatus`（或等价的布尔 `hasCritical`），markdown 的「摘要」段第一行也会直接写「整体状态：需要处理（见上）／正常」。

日检流程（约 5 分钟）：跑 `ops:daily` → 读「今日需处理」→ critical/blocked 来源决定是否进入下面的数据更新流程；warning 与到期事实排入复查；待审候选走审核批准授权。

### 定时日检（cron）

2026-11-25 所有者决定把日检接进 cron，**取代** 2026-11-11 那条「日检不装定时任务、每日手动跑」。理由：日检回答的是「今天先处理什么」，这个问题的时效性正好是一天；靠人记得跑，等于在故障发生时才发现上次跑是两周前。

```bash
# VPS root
(crontab -l 2>/dev/null; echo '17 9 * * * cd /opt/jpqm && sh scripts/ops-daily-cron.sh') | crontab -
```

`scripts/ops-daily-cron.sh` 解决三个只在服务器上才暴露的问题：

1. **宿主机没有 node**（与 `access-report` 同一个约束），所以日检在容器里跑。
2. **容器内写出的报告会随容器消失**，所以用 `docker compose run --rm -T -v "$(pwd)/var:/app/var"` 把宿主机 `var/` 挂进去——报告落回 `var/ops-reports/`，`up -d --build` 不会带走历史。
3. **投递记录在宿主机上**（`var/notifications/feishu.log`，宿主机脚本写的），不挂载的话容器里读到的永远是「从未投递过」，日检的通知渠道判定在生产上等于空转。

用 `run --rm -T` 而不是 `exec`：日检不该因为 api 服务挂了就跑不了；cron 也没有 TTY。

判据与人工跑同一套，只是**健康时完全沉默**（报告文件本身就是留档）：

| 报告结果                  | 行为                                            |
| ------------------------- | ----------------------------------------------- |
| `status: ok`、无 critical | 沉默                                            |
| `status: ok`、有 critical | `daemon.err` + 飞书，正文是「今日需处理」的条目 |
| `status` 不是 `ok`        | `daemon.err` + 飞书，正文带 stderr 尾部         |

```bash
crontab -l | grep ops-daily-cron                      # 该行存在
journalctl -t jpqm-ops --since "3 days ago"           # 只在需要动手时有记录
ls -l /opt/jpqm/var/ops-reports/                      # 每天一份 .json + .md
```

报告缺失或 `journalctl` 出现 `report did not run` 时，看 `var/ops-reports/cron.err`（容器的 stderr 原文）——没有它，失败无从排查。

环境变量可写进 crontab 行首：`OPS_TAG`（默认 `jpqm-ops`）、`OPS_NOTIFY=0`（只写 syslog 不发飞书）、`OPS_VAR_DIR`、`OPS_REPORT_DIR`、`OPS_MAX_ACTIONS`、`COMPOSE_FILE`、`COMPOSE_PROJECT`。

卸载：

```bash
crontab -l | grep -v ops-daily-cron | crontab -
```

**日检仍然只读**：定时化只改了「谁来按这个按钮」，不改按钮里做的事——`BEGIN READ ONLY`、不发外部请求两条契约不变。

### `var/` 留存物清理（prune-var）

日检每天往 `var/ops-reports/` 写两个文件，投递记录每次投递追加一行，两者都没有上限。`scripts/prune-var.sh` 按白名单收敛它们：

```bash
cd /opt/jpqm && sh scripts/prune-var.sh            # dry-run，只打印将要做什么（默认）
cd /opt/jpqm && sh scripts/prune-var.sh --apply    # 真的删
```

| 目标                                   | 策略                           | 默认值 |
| -------------------------------------- | ------------------------------ | ------ |
| `var/ops-reports/YYYY-MM-DD.{json,md}` | 按 mtime 删除超过保留期的      | 90 天  |
| `var/notifications/feishu.log`         | 超过 N 行时截断，保留最后 N 行 | 500 行 |
| `var/test-*/`（测试崩溃的残留）        | 按 mtime 删除超过保留期的      | 7 天   |

环境变量：`VAR_DIR`、`OPS_REPORT_RETENTION_DAYS`、`NOTIFICATION_LOG_MAX_LINES`、`TEST_DIR_RETENTION_DAYS`、`PRUNE_APPLY=1`（等同 `--apply`）。

装进 cron（可选，与日检错开半小时）：

```bash
(crontab -l 2>/dev/null; echo '47 9 * * 0 cd /opt/jpqm && sh scripts/prune-var.sh --apply') | crontab -
```

**为什么是白名单，而不是 `find var -mtime +90 -delete`。** 开发机实测的 `var/` 构成：

| 目录                      | 文件数 | 大小     | 是什么                 |
| ------------------------- | ------ | -------- | ---------------------- |
| `var/pg-run`              | 1645   | 104.7 MB | 本地 postgres 数据目录 |
| `var/pglite-run`          | 1529   | 63.9 MB  | pglite 运行目录        |
| `var/chrome-shot-profile` | 206    | 15.9 MB  | Chrome 用户配置        |
| `var/qa`                  | 459    | 14.9 MB  | QA 证据                |
| `var/audit-2026-11-24`    | 149    | 13.6 MB  | 审计证据               |
| `var/official-snapshots`  | 180    | 11.7 MB  | 官方快照               |
| `var/ops-reports`         | 7      | 0.16 MB  | **日检报告**           |
| `var/notifications`       | 0      | 0        | **投递记录**           |

那条 `find` 会在第一次运行时把本地数据库和全部证据目录一起静默删掉。所以脚本只认死三个目标：日期命名的报告文件、投递记录、`test-*` 目录；`cron.err`（最近一次失败的 stderr，可能正是排查的唯一线索）和任何人手工放进 `var/ops-reports/` 的文件都不碰——文件名模式 `????-??-??.json` 天然排除了它们。

投递记录按**行数**截断而不是按 mtime 删除：文件的 mtime 是最后一次投递的时间，不是内容的年龄；按龄删会让一个长期安静的通道丢掉全部投递历史，而这正是判断「告警到底有没有发出去」的唯一证据。

## 访问日志统计（access-report，只读）

用途：MVP 验证期的保底访问统计（不装第三方分析脚本）。Caddy 站点块把 JSON 访问日志写到容器内 `/var/log/caddy/access.log`（10MB 滚动、保留 5 份），compose 以 `./caddy-logs:/var/log/caddy` bind mount 到宿主机 `deploy/caddy-logs/`（gitignore，不入库）。`scripts/access-report.mjs` 只读解析日志，输出总请求、人类/bot 拆分、ユニークIP、状态码分布、参照元（直接/検索/SNS/内部）、功能利用（ICS・検索・比較）、上位页面、日别趋势；日期按 JST 聚合。空 User-Agent 与常见爬虫/脚本 UA 计入 bot，不进人类计数。

```bash
# 服务器上（/opt/jpqm），手动跑，建议每周一次＋推广活动后各一次
# 宿主机没有 node：日志经 stdin 进 web 容器跑（2026-11-14 实测 status: ok）
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml exec -T web node scripts/access-report.mjs /dev/stdin < deploy/caddy-logs/access.log
# 指定窗口与 JSON 输出
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml exec -T web node scripts/access-report.mjs /dev/stdin --since=2026-11-14 --until=2026-11-20 --json < deploy/caddy-logs/access.log
```

判据＝`status: ok`（JSON 模式）或文本报告正常打印；不写库、不发外部请求、不装定时任务（仍为手动，日检已在 2026-11-25 接进 cron，访问统计没有）。首次启用需 `docker compose -f deploy/docker-compose.prod.yml up -d caddy` 重建一次 caddy 容器以挂上日志卷（此后改 Caddyfile 只需 reload）。安全响应头（HSTS/nosniff/X-Frame/Referrer-Policy/Permissions-Policy）由同一 Caddyfile 的 `header` 块下发；CSP 因站内内联样式/脚本暂未启用。

## 数据面就绪探针（ready:check，只读）

用途：一条命令回答「数据面**现在**能不能服务查询」，输出机器可读结论。与日检的分工是——`ops:daily` 看**数据内容**（来源健康、到期事实、待审队列），`ready:check` 看**数据面可用性**；两者互不替代。日检完全不发网络请求，探针只发一次 HTTP GET。

`/ready` 端点由 API 提供（`services/api/src/server.ts`，实现见 `services/api/src/database-ready.ts`），三态契约见 `docs/api-contract.md`。本探针是它的消费方。

```bash
# 宿主机（API 在 4100 上，默认目标 http://127.0.0.1:4100/ready）
pnpm ready:check

# 容器内（宿主机没有 node 时，与 access-report 同一手法）
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml exec -T api node scripts/check-readiness.mjs --url=http://127.0.0.1:4100/ready

# 指定目标与超时，要机器可读输出
node scripts/check-readiness.mjs --url=http://api:4100/ready --timeout=3000 --json
```

目标地址优先级：`--url` > `READY_URL` > `API_BASE_URL` + `/ready` > `http://127.0.0.1:4100/ready`。超时默认 5000ms，与 `connectionTimeoutMillis` 对齐——探针不该比它探测的对象更有耐心。

退出码只有两种：**`ready` → 0，其余一律 1**。原因由 JSON 的 `status` 承担（告警只需要「是否可用」这一个比特）：

| `status`       | 含义                                                   | 下一步                 |
| -------------- | ------------------------------------------------------ | ---------------------- |
| `ready`        | 数据面可用                                             | 无                     |
| `error`        | 数据库不可达（瞬态），`message` 带驱动码               | 查 db 容器与网络       |
| `unconfigured` | 进程没拿到 `DATABASE_URL`／`API_DATABASE_URL`          | 查部署配置，属永久错误 |
| `unreachable`  | 探针自己连不上 API，`reason` 区分 `timeout`／`connect` | 查 api 容器是否在跑    |
| `unexpected`   | 端点行为与契约不符，`rawBody` 留了片段                 | 端点被改坏了，看契约   |

**刻意不接 compose healthcheck，也不在 Caddy 暴露。** 依赖链是 `db → api(/health) → web(depends_on api healthy) → caddy`，把 readiness 接进去意味着数据库一抖动就让 api unhealthy → web 不启动 → 整站下线；而 `/ready` 会对外泄露「数据库连不上」这类内部状态。所以它是**主动探针**（人/脚本按需调用），不是**被动 healthcheck**（编排器轮询）。

## 定时探针与 syslog 告警（VPS root crontab）

探针回答了「现在什么状态」，但没人看指针时它不会自己说话。这一节让数据面故障在 5 分钟内出现在 syslog 里，而不是等用户报障。2026-11-11 那条「不装定时任务」的决定针对的是日检，已由上一节的定时日检取代；探针告警这一处由所有者另行批准。

### 为什么需要包装脚本

直接把探针写进 crontab 有三个问题：每 5 分钟一条日志会把「故障开始」和「恢复」两个真正重要的时刻淹没（两小时故障 = 24 条重复行）；日志里只有 `status`，看不出坏了多久；cron 命令有输出时会尝试发邮件。

`scripts/readiness-cron.sh` 因此只在**状态变化**时写 syslog，故障持续时按小时留一条心跳：

| 情况                    | 行为                                        |
| ----------------------- | ------------------------------------------- |
| 首次运行，正常          | 不写（避免部署当天误报「恢复」）            |
| 首次运行，异常          | 立刻写 `daemon.err`                         |
| 正常 → 异常             | 立刻写 `daemon.err`                         |
| 异常 → 异常（未到间隔） | 不写                                        |
| 异常 → 异常（满间隔）   | 写 `daemon.warning` 心跳，带已持续次数      |
| 异常 → 正常             | 写 `daemon.notice`，带故障持续了多少次      |
| 容器没起／探针跑不起来  | 立刻写 `daemon.err`，状态记为 `unreachable` |

syslog 用固定 tag `jpqm-readiness`，便于过滤。脚本**永远 `exit 0`**：cron 的退出码只会触发没人读的邮件，通知渠道是 syslog。

### 安装

```bash
# VPS root
(crontab -l 2>/dev/null; echo '*/5 * * * * cd /opt/jpqm && sh scripts/readiness-cron.sh') | crontab -
```

`docker compose exec -T` 里的 `-T` 是必须的——cron 没有 TTY。脚本会自己调用 `docker compose exec -T api node scripts/check-readiness.mjs`，所以宿主机不需要 node，也不需要 `DATABASE_URL`。

### 判据

```bash
crontab -l | grep readiness-cron           # 该行存在
journalctl -t jpqm-readiness -n 20         # 有记录（故障发生/恢复时）
```

健康稳态下 `journalctl` **是空的**——这是设计，不是故障。想确认脚本在跑，看状态文件：

```bash
cat /opt/jpqm/var/readiness/last-status    # 第一行 ready，第二行 0
```

### 查询与调优

```bash
journalctl -t jpqm-readiness --since "1 hour ago"
journalctl -t jpqm-readiness -p err        # 只看故障开始
journalctl -t jpqm-readiness -p warning    # 只看心跳
```

环境变量可覆盖默认值（写进 crontab 行首即可）：`HEARTBEAT_EVERY`（默认 12 次 = 1 小时）、`READINESS_TIMEOUT_MS`（默认 5000）、`READINESS_STATE_FILE`、`COMPOSE_FILE`、`COMPOSE_PROJECT`、`READINESS_TAG`、`PUBLIC_READY_URL`（见下）、`ALERT_AFTER`（默认 2 次 = 10 分钟；连续失败够次数才发第一条 err，单次抖动不再成对推送「unreachable + recovered」；设为 1 恢复旧行为）。

### 公网入口检查（web 与 caddy）

**默认不查公网。** 上面的探针是在 api 容器里问 api 自己的 `/ready`，所以它只覆盖 `db` 与 `api` 两环：

| 坏在哪                    | 探针说什么        | 用户看到什么                  |
| ------------------------- | ----------------- | ----------------------------- |
| db 连不上                 | `error`           | 503                           |
| api 挂了                  | `unreachable`     | 502                           |
| **web 起不来 / 重启循环** | **`ready`，沉默** | **502/503**                   |
| **caddy 挂了或证书过期**  | **`ready`，沉默** | **连不上 / 证书警告**         |
| **`SITE_ORIGIN` 配错**    | **`ready`，沉默** | **页面能开但 canonical 全错** |

后三行就是 3C 修过的同一类问题——用户拿到错误页，运维那边一切「健康」——只是换了一层。compose 的 healthcheck 补不上这个缺口：它只看进程活没活（web 挂了会被 `restart: unless-stopped` 拉起，但拉起前那段时间没人知道），caddy **根本没有 healthcheck**，而证书过期和配置错误都不影响进程存活。

要补上，就让探针顺带抓一次公网首页：

```bash
# 手动验一次（宿主机）
node scripts/check-readiness.mjs \
  --public-url=https://shikakucheck.com/ --json

# 让定时探针也带上（写进 crontab 行首）
PUBLIC_READY_URL=https://shikakucheck.com/
```

判据是「2xx **且** 返回一个完整的 HTML 文档」（有 `<html`，也有 `</html>`）。抓到的不是 HTML（比如网关的 JSON 错误体）算 `not-html`，HTML 被截断算 `truncated`——两者都说明中间某一环在返回半成品，而这正是用户会遇到的。

失败时报告里的 `status` 仍是既有词汇，不新增状态词（否则 `readiness-cron.sh` 的状态机会把整站故障当成健康）：

| `status`      | `reason`       | 通常是                                             |
| ------------- | -------------- | -------------------------------------------------- |
| `unreachable` | `connect`      | DNS 或主机不可达                                   |
| `unreachable` | `tls`          | 证书过期、域名不符、链不完整（`code` 带 `CERT_*`） |
| `unreachable` | `timeout`      | 进程活着但不应答：web 卡死、caddy 等上游           |
| `unexpected`  | `public-entry` | 拿到了应答但不可用：5xx、3xx、非 HTML、截断        |

同时报告会把数据面原判据留在 `dataPlane` 里——「API 好好的但外面进不来」是这份报告最有价值的一条信息，别被顶层 `status` 盖掉。

`reason` 与 `code` 会一起进 syslog（`status=unreachable reason=tls code=CERT_HAS_EXPIRED ...`），因为 `message` 对连接失败一律是 `fetch failed`，区分不了「证书过期」和「DNS 写错」——这两件事该找的人不一样。

**仍然不暴露 `/ready`。** 这里查的是公网首页（本来就公开），不是内部端点；把 `/ready` 放到 Caddy 后面才会泄露「数据库连不上」这类内部状态。上一节末尾那条警告继续有效。

### 卸载

```bash
crontab -l | grep -v readiness-cron | crontab -
```

**不要**顺手把 `/ready` 接进 compose healthcheck 或 Caddy——理由见上一节。

## 飞书通知

syslog 只有会去看 journald 的人才有用。这一节把同一批告警再发一份到飞书群，让故障自己找上门。

### 凭据放哪

在 `deploy/.env`（服务器上是 `/opt/jpqm/deploy/.env`）里加两个键，和 `DB_PASSWORD` 住一起。`.env` 已被 `.gitignore` 忽略，凭据不进仓库：

```bash
FEISHU_WEBHOOK=https://open.feishu.cn/open-apis/bot/v2/hook/<token>
FEISHU_SIGN_SECRET=<机器人开启签名校验时才有，没开就留空>
```

`FEISHU_WEBHOOK` 留空 = 不发飞书，行为与 Sprint 3E 完全一致（只写 syslog）。`FEISHU_SIGN_SECRET` 留空 = 不签名；只有飞书机器人后台勾了「签名校验」才需要填。

脚本按 `grep` + `cut -d= -f2-` 读这个文件，**不 source 它**——`.env` 是 compose 的插值文件，值里可能有空格或 `$`，source 会被 shell 解释。`-f2-` 的尾随 `-` 是必需的：base64 密钥末尾的 `=` 填充否则会被截掉。

### 自检

填完凭据先手动验一次，别等 cron 半夜发现发不出去：

```bash
cd /opt/jpqm && sh scripts/notify-feishu.sh --test
```

判据：飞书群里收到一条 `jpqm readiness self-check: ...`，且命令退出码为 `0`。成功时 stdout 会有一行 `notify-feishu: delivered (http=200) after 1 attempt(s)`。

失败时退出码 `1`，stderr 给出**原因码**（Sprint 3G 之前所有故障都是同一句 `FEISHU_WEBHOOK is not configured`，四种完全不同的情况无法区分）：

| `reason=`          | 含义                                    | 怎么修                                                                                                            |
| ------------------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `env-file-missing` | 读的 `.env` 根本不存在                  | 报错里有绝对路径；确认 `FEISHU_ENV_FILE` 或工作目录                                                               |
| `key-absent`       | 文件在，但没有 `FEISHU_WEBHOOK=` 这一行 | **最可能是编辑器没保存**（报错里的 `mtime` 会是旧时间）；或 `printf 'FEISHU_WEBHOOK=%s\n' '<url>' >> deploy/.env` |
| `value-empty`      | 有这一行，但 `=` 后面是空的             | 补上完整 URL                                                                                                      |
| `value-has-space`  | 值里有空格或制表符                      | 常见于把 URL 连同引号一起粘进来                                                                                   |
| `value-not-url`    | 值不以 `http://` / `https://` 开头      | 占位符没替换，或值被引号包住（看 `quoted=yes`）                                                                   |

投递阶段的失败另有 `reason=`：`bad-signature`（签名密钥不对，或机器人开了签名校验但没填密钥）、`bad-token`（webhook 被重置／机器人被移出群）、`rate-limited`、`http-error`、`unreachable`（连不上飞书）、`timeout`。

**失败信息里不会出现 webhook 地址或密钥**——这行可能被 cron 抄进邮件或 syslog。诊断只会给出形状：`len=81 scheme=https host=open.feishu.cn quoted=no`，host 之后一律不打印。地址只在你自己的 `deploy/.env` 里。

### 投递记录

每次投递结束（成功或失败）都会往 `var/notifications/feishu.log` 追加一行 JSON：

```json
{
  "at": "2026-11-25T00:28:42Z",
  "ok": true,
  "http": 200,
  "curl": 0,
  "attempts": 1,
  "reason": null
}
```

`http` 为 `null` 表示一个响应都没读到（curl 连不上），不是状态码。这个文件里**没有任何凭据**，只有状态。

看一眼最近几次：

```bash
tail -5 /opt/jpqm/var/notifications/feishu.log
```

`ops:daily` 会读这个文件来判断**告警通道本身**还活着没有（见「人工日检」）。这是刻意的：日检是只读数据库巡检，不发任何外部请求，所以不能现场探测 webhook，只能读本地证据。判定规则：

| 情况                         | 级别         | `reason`               |
| ---------------------------- | ------------ | ---------------------- |
| 从未投递过                   | info         | `not_run`              |
| 最近一次成功且在 14 天内     | info         | `healthy`              |
| 最近一次失败，连续失败 < 3   | warning      | `recent_failure`       |
| 连续失败 ≥ 3                 | **critical** | `consecutive_failures` |
| 最近一次成功，但已超过 14 天 | warning      | `channel_stale`        |

`channel_stale` 只提示不下结论：两周安静可能是**一直没故障**，也可能是 **webhook 早已失效而没人发现**。手动跑一次 `--test` 就能区分。

**通道连续失败是 critical，和来源挂了同级**——因为通道挂了会让此后所有告警静默消失，比来源故障更危险。

### 什么时候会发

由定时探针的状态机决定（见上一节），不是每次巡检都发：

| 事件                                  | 消息内容                                            | syslog 级别 |
| ------------------------------------- | --------------------------------------------------- | ----------- |
| 故障开始                              | `status=error message=...`                          | err         |
| 持续故障心跳（默认每 12 次 = 1 小时） | `still status=... for N checks`                     | warning     |
| 恢复                                  | `recovered: status=ready after N checks`            | notice      |
| 探针自身跑不起来                      | `status=unreachable message=probe did not run: ...` | err         |

健康稳态下一条都不发。这个频率远低于飞书的限流阈值（5 次/秒、100 次/分钟），所以不需要额外限流。

重试策略：HTTP 429、5xx、以及飞书返回的限流码 `9499` 会重试，共 3 次；签名错（`19021`）、token 失效这类每次都一样的错误不重试，直接报出来——重试只会延迟你知道它坏了。

### 只留 syslog

想临时关掉飞书、回到纯 syslog：

```bash
# 单次
READINESS_NOTIFY=0 sh scripts/readiness-cron.sh
# 长期：改 crontab 行
*/5 * * * * cd /opt/jpqm && READINESS_NOTIFY=0 sh scripts/readiness-cron.sh
```

通知失败**不影响**巡检本身：状态文件照写、syslog 照记、退出码仍是 0。

### 卸载

删掉 `deploy/.env` 里的 `FEISHU_WEBHOOK=` 即可，或按上一节把 crontab 行去掉。

## 官方数据更新流程（SOP）

触发：日报 `changed`/`blocked`/critical、`data:staleness` 到期、官方公告。采集、候选入库、审核批准仍是三次独立授权，逐段需所有者明示；巡检抓取与巡检落库也各算一次授权。

1. 采集授权（明示）→ 对应资格 capture 脚本或 `patrol:sources`。
2. 离线分析（analyze/precheck，不写库），确认候选与官方原文一致。
3. 入库授权（明示）→ 对应 ingest 脚本，候选 `pending_review`（第二态，未公开）。
4. 批准授权（明示）→ admin 以 `x-reviewer-id` 头逐条对照官方原文批准（第三态）。
5. `pnpm build`＋`pnpm verify:all` 6/6。
6. 仅当 facts 计数变化：`baseline:update`＋`ci:fixture:export` 同批，同步 `scripts/verify-ci-fixture.mjs` 四处计数断言与 `scripts/docker-smoke.mjs` 冒烟断言，`ci:fixture:verify` 通过；同一 PR 进 main（见第 9 节口径）。
7. 全量回归绿 → commit → push（明示）→ PR（明示）→ 合并（「合并」明示）。
8. `pg_dump` 数据包导出备用。上线按「生产部署 → 更新发布」节执行，每次发布仍需所有者明示授权；admin 与采集链不上 VPS。

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

（2026-11-13 修正：postgres:18+ 官方镜像把数据目录布局改为 `PGDATA=/var/lib/postgresql/18/docker`，entrypoint 检测到旧路径 `/var/lib/postgresql/data` 上有挂载（哪怕空卷）会直接拒绝启动，故 compose 的卷挂载必须是 `pgdata:/var/lib/postgresql`。docker-smoke 不挂卷，抓不到这一项；db 反复 unhealthy 时先看 `docker compose -f deploy/docker-compose.prod.yml logs db --tail 30`。）

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

#### liveness 与 readiness 是两件事（别混用）

- **`/health` = liveness**：只证明 API 进程活着，**不访问数据库**，数据面全挂时仍返回 200。compose 的 `depends_on: api: service_healthy` 与 web 的启动都挂在这个信号上。**不要拿它判断数据面是否正常。**
- **`/ready` = readiness**：真实对数据库执行 `SELECT 1`，回答「现在能不能服务查询」。手工排查数据面时用它。直接跑 `pnpm ready:check`（容器内 `node scripts/check-readiness.mjs`）即可，它会打一条结论并给出退出码——见「数据面就绪探针（ready:check，只读）」节。要手工看原始响应：

```bash
# 容器内
docker compose -f deploy/docker-compose.prod.yml exec -T api node -e "fetch('http://127.0.0.1:4100/ready').then(async r=>console.log(r.status, await r.text()))"

# 或从宿主机打（/ready 未在 Caddy 里暴露到公网，见下）
```

判据：`200 {"status":"ready","database":"ok"}` = 数据面正常；`503 {"database":"error",…}` = 数据库不可达（看 `message` 里的驱动错误）；`503 {"database":"unconfigured"}` = 进程没拿到 `DATABASE_URL`／`API_DATABASE_URL`。

- **`/ready` 有意未接入 compose healthcheck。** 若把它接上，数据库一抖动 → api 变 unhealthy → web 因 `depends_on` 不再启动 → Caddy 跟着下线 → **整站不可用**。那比它要解决的问题严重得多。将来若要接，必须先解决这条级联依赖（例如把 web 对 api 的依赖从 `service_healthy` 降级为 `service_started`）。
- 数据面故障的排查顺序：先 `/ready` 定位是「配置缺失」还是「连不上」，再看 API 数据路由的 `code`（`database_not_configured` 是配置错，`ECONNREFUSED` 一类是连接错）。配置缺失时数据路由返回 **500**，不是 200 空数据——这是 Sprint 3B 有意改的语义，别把它当回归。

判据＝六个路径全 200（ICS 为 `text/calendar`，`/sitemap.xml` 为 XML，其余 `text/html`）；robots 里 Sitemap 行是 `https://shikakucheck.com/sitemap.xml`；sitemap 含簿記 pass-rate 页、`?year=` 计数为 **0**；年份筛选页 noindex 计数为 **1**。再抽一眼内容：首页含「資格試験の日程・受験料を」（H1）与「本サイトは個人が運営する非公式の参考情報サイト」、`/shikaku/bookkeeping/` 含「日商簿記」。**不要再用「資格試験の公式情報」当判据**：2026-11-24 复核时首页已无该短语（它只剩在 `/guide/*` 三处正文里，见 `docs/compliance-audit-2026-11-13.md` 的 H1 遗留项）。

以上第 3–7 步的机器版＝`pnpm smoke:docker`（CI 的 `docker-smoke` job 跑同一条命令）：构建镜像 → 临时 `postgres:18-alpine` → migrate（含二次幂等）→ seed → 恢复 CI 夹具 → 开通只读角色并验证写被拒 → 起 api+web → 断言 1007 条事实与 37 个夹具快照、首页/资格页/API/sitemap/noindex/ICS/robots/404。改动 Dockerfile、compose 或依赖后先让这条冒烟绿，再上 VPS。

### 例行备份（VPS root crontab）

```bash
(crontab -l 2>/dev/null; echo '15 4 * * * docker compose -f /opt/jpqm/deploy/docker-compose.prod.yml exec -T db pg_dump -U qualification_prod -Fc qualification_media > /var/backups/jpqm-$(date +\%F).dump && find /var/backups -name "jpqm-*.dump" -mtime +14 -delete') | crontab -
```

判据＝`crontab -l` 末行存在；次日 `/var/backups/jpqm-*.dump` 有当日文件。

### 更新发布

```bash
cd /opt/jpqm && git pull && docker compose -f deploy/docker-compose.prod.yml up -d --build
```

有新迁移时随后补跑第 5 步的 migrate 与 provision（新表由默认权限获得 `SELECT`，provision 重新对齐授权）。判据＝`docker compose ... ps` 全 running 且第 7 步验收复跑通过。动了 Dockerfile、`.dockerignore`、compose 或依赖版本的发布，先在本机或 CI 跑 `pnpm smoke:docker` 绿了再 merge。

### GA4 启用（同意门控已内置，M2）

**现态＝生产已启用（2026-11-15，PR #103 部署后）**：服务器 `deploy/.env` 已填 `GA_MEASUREMENT_ID=G-G9SN61J5LS` 并 `up -d web`（无需重建镜像；2026-11-15 原媒体资源 `G-LV4250LZNY` 因 GA 权限问题被号主删除并重建为 `G-G9SN61J5LS`，已换 ID 重启用＋复测）；首页 `data-cookie-banner` 计数 **1**、无条件 GA 脚本计数 **0**（同意前零 Google 请求）；生产同意流 playwright 实测 **19/19**（同意する → gtag.js＋collect 带 ID；同意しない → 零 gtag；页脚 Cookie設定 → 横幅重开）。GA「报告 → 实时」由号主自查（号主账号，agent 无法访问）。下方为通用启用/回滚步骤（ID 用占位符 `G-XXXXXXXXXX`；现已填真实值，换 ID 或回滚后重启用时照此）。

前置＝M2 合规机制已随代码内置（2026-11-15 轮）：Cookie 同意横幅（同意する／同意しない）、隐私政策的外部送信告知与 opt-out、页脚「Cookie設定」撤回入口。GA4 只在访客同意后加载；`GA_MEASUREMENT_ID` 为空时不加载任何统计脚本。衡量 ID 由号主在 GA 后台取得（管理 → 数据收集和修改 → 数据流 → 网站数据流详情第一行，形如 `G-XXXXXXXXXX`）。

```bash
cd /opt/jpqm && grep -n "^GA_MEASUREMENT_ID=" deploy/.env
```

判据＝输出一行（空值）。把 `G-XXXXXXXXXX` 换成真实 ID 后执行：

```bash
cd /opt/jpqm && sed -i "s/^GA_MEASUREMENT_ID=.*/GA_MEASUREMENT_ID=G-XXXXXXXXXX/" deploy/.env && docker compose -f deploy/docker-compose.prod.yml up -d web
```

无需重建镜像（钩子已在代码里），compose 会因环境变量变化重建 web 容器。判据：

```bash
cd /opt/jpqm && docker compose -f deploy/docker-compose.prod.yml ps ; curl -s https://shikakucheck.com/ | grep -c "data-cookie-banner"
```

web 为 running/healthy，横幅计数由 0（2026-11-15 启用前实测）变 1。再用浏览器打开站点：横幅点「同意する」后 GA 后台「报告 → 实时」应出现该次访问（可延迟几十秒）；点「同意しない」则不应发出任何 gtag 请求。回滚＝把变量值清空后重跑 `up -d web`。
