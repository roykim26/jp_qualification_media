# Sprint 2 完成报告（2026-11-24）

依据：`docs/audit/DEEPSEEK_HARNESS_SPRINT_2_TASK.md`（609 行，已按 §17 执行顺序「先读 → 只读审计 → 确认现状 → 2A → 验证 → 2B 检查 → 必要时最小修改 → 完整测试 → 报告 → 停止」执行）。
用户指令（原话）：「请读取并严格执行 docs/audit/DEEPSEEK_HARNESS_SPRINT_2_TASK.md。先执行只读审计，再开始修改。Sprint 2 完成后必须停止并输出完成报告，不得自行进入 Sprint 3。」

分支 `chore/phase1-baseline`，基线 HEAD `a319d46`（Sprint 1 改动仍在工作树，**未回退、未覆盖、未 reset**，Sprint 2 建立在其之上）。**未 commit、未 push、未部署生产。**

---

## 1. 执行范围

| 项  | 内容                                                                                                 | 状态                                |
| --- | ---------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 2A  | FE（基本情報技術者試験）202610 月度统计刷新：来源 → 迁移 → 采集 → 入库 → 批准 → 夹具/baseline → 文档 | **已完成**                          |
| 2B  | 上游（官方情報 API）不可用时的降级架构检查与最小修复（502 → 503）                                    | **已完成**（前提被实测修正，见 §3） |
| —   | 全套测试 + SEO 回归                                                                                  | **已完成**，全部通过                |

**明确未做**（按 §7–§11、§16）：`/pass-rate/` 空表索引状态、`/schedule/` 空态索引、年度空壳页 canonical/301、薄 pass-rate 页清理、无尾斜杠 301、首页/`/shikaku/`/资格详情页/设计系统改版、移动端改版、URL 重构、新增 `/about/` 或搜索页或 feed、GSC/Bing/GA4、宅建统计入库、资格扩充、DB schema 变更、任何 Sprint 3 工作。

**写入边界**：全部数据库写操作只针对本机 docker 容器 `jpqm-pg18`（`postgresql://postgres@127.0.0.1:55432/qualification_media`）。零生产库、零线上数据、零部署、零生产重启。

---

## 2. FE 202610 数据刷新（2A）

### 2.1 数据来源是否明确

**是。** FE 统计有两个已登记 source（`services/collector/src/collector/fundamental_it.py` 的 `FUNDAMENTAL_IT_SOURCES`）：

| source id                                     | URL                                                                                                                | 用途                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| `source:fundamental-it:statistics-fe`         | `https://www.ipa.go.jp/shiken/reports/toukei_fe.html`                                                              | 统计目录页 → `statistics_methodology` 事实                          |
| `source:fundamental-it:statistics-fe-suiihyo` | `https://www.ipa.go.jp/shiken/reports/ps6vr70000016ew6-att/202610_fe_01_suiihyo.xlsx`（本轮由 `202609_` 滚动而来） | 推移表 → `applicants`/`examinees`/`passed`/`pass_rate` 四个统计字段 |

**只读探针实测（`var/d1_probe_20261124.py`，2026-11-24 当日实抓）**：

- `202610` 附件**已发布**，比 `docs/fundamental-it-engineer-source-contract.md:154` 原先推断的「2026-12 上中旬」提前。
- 目录页 200 / 80688 B / sha256 `54226275e25a09238283f137113c5f11ac87097b64f93a357231786341c568e2`（基线 `d2178a936311…` / 80686 B，+2 字节）。
- 附件清单：`added` 12 项、`removed` 12 项 —— 12 个 `202609_*` 全部换成 `202610_*`；三个年度 PDF（`202603`/`202503`/`202403`）不变。
- **已登记在案的 `202609_fe_01_suiihyo.xlsx` 现返回 404**（`status: not_found`）⇒ 这是一次**真实的 URL 漂移**，不是预防性换名。
- 目录页文本 diff：`最終更新日：2026年10月21日` → `2026年11月20日`；`令和8年9月時点` → `令和8年10月時点`；附件链接全部 202609 → 202610。`statistics_methodology` 的两句正文**未变**。

### 2.2 格式是否符合 source contract

**是。** `202610_fe_01_suiihyo.xlsx`：200 / 18062 B / sha256 `08add2120f62780993619a8b51a97bef8b2153c54a7af7308938609b8fc66082`。

- `extract_suiihyo_candidates()` 产出 **12 条候选、0 issues**（`structure_changed` 未触发）。
- 表头 `…推移表(令和8年11月20日現在)`（基线为 `令和8年10月21日現在`），`HEADER_CUTOFF` 正则匹配成功。
- 行结构一致：r4 令和５年度 12/12、r7 令和６年度 12/12、r10 令和７年度 12/12 均 `complete=True`；r13 令和８年度 6/12 → **7/12**、`complete=False`（进行中年度，按 `fe_statistics_xlsx.py:171-172` 跳过，不产事实）；r58 `累計` 548801 → 563285（`CUMULATIVE_LABEL` 跳过，不产事实）。
- sheet 名「ＦＥ」、footer 行序「応募者数／受験者数／合格者数」、footer 分母公式「合格率（合格者数／受験者数：％）」全部与契约一致。

**关键读数：三个完整年度的 12 条数值与基线逐字段完全一致**（2023：140,774 / 121,611 / 57,278 / 47.1%；2024：157,259 / 133,732 / 54,501 / 40.8%；2025：172,217 / 147,186 / 56,370 / 38.3%）。即本次月度滚动只推进了**进行中年度与累計**，已完整年度零变化 —— 本轮刷新的实质是**快照与来源 URL 换新**，不是数值更新。

### 2.3 ingestion 是否成功

**是。** 走仓库既有流程（未自建导入体系）：

1. **采集**（一次，`FUNDAMENTAL_IT_LIVE_AUTHORIZED=1`，`FUNDAMENTAL_IT_CAPTURE_SOURCE_IDS=source:fundamental-it:statistics-fe,source:fundamental-it:statistics-fe-suiihyo`）。采集前先把 16 个既有快照备份到 `var/sprint2a-snapshot-backup/`（1930917 B）。落盘按内容寻址，**旧字节零覆盖**：
   - `54226275….html`（80688 B，目录页）
   - `08add212….xlsx`（18062 B，推移表）
   - `capture-report.json` 经 `merge_capture_report` 合并，`retained_source_count: 5`（其余 5 条 source 的旧成功记录被保留，未被本次失败/未抓擦除）。
2. **迁移**：新建 `packages/db/migrations/0030_fe_statistics_suiihyo_202610.sql`（带旧值守卫的幂等 UPDATE，先例为 `0026_bookkeeping_statistics_url_drift.sql`）。`pnpm run db:migrate` → `Applied 0030_fe_statistics_suiihyo_202610.sql.`，`schema_migrations` 30 → **31**，`sources.canonical_url` 已为 202610。
3. **入库**（`FUNDAMENTAL_IT_LOCAL_WRITE=1`，hostname 校验通过）：
   - 推移表：`{"status":"inserted","snapshots":1,"candidates":12,"approval":"not_run"}`
   - 目录页：`{"candidates":1}`
   - `candidate_facts` 出现 **13 条 `pending_review`**（12 条年度统计 + 1 条 `statistics_methodology`，后者因目录页快照哈希变化而换号）。

### 2.4 approved facts 是否生成/更新

**是，且全部批准。**

- 批准脚本 `var/approve-fe-202610.mjs`（照既有 `var/approve-fe-statistics.mjs` 模板，reviewer `sprint2a-owner-review`，含「必须恰好 13 条」守卫）→ `pending FE statistics candidates to approve: 13` / `approved OK: 13/13`。
- 批准后：`candidate_facts` **1059 条全 approved、`pending_review` 归零**；`facts` **1007 条不变**（换号而非新增维度）；`snapshots` 80 → **82**。
- FE 12 条统计值逐条复核与 §2.2 完全一致；`statistics_methodology` 的值不变，`current_revision_id` 更新为 `revision:candidate:fundamental-it:54226275…`（证据快照换新）。
- 未批准前若直接跑基线脚本会抛错（`update-release-baseline.mjs:76-79` 的 `pending_official !== 0` 守卫、`export-ci-db-fixture.mjs:49-56` 的 `official candidates pending review` 守卫），故批准必须与入库同批完成。

### 2.5 coverage contract 是否异常

**无异常。** `tests/data-coverage-contract.test.ts`（6 例）通过；`verify:all` 六格 `pending_official: 0`、`approved_official` = 16 / 15 / 10 / **28** / 863 / 75，与 `config/release-gate-baseline.json` 完全一致，六格 `errors: []`。

### 2.6 release baseline 是否有未解释变化

**无变化，且已重导验证。**

- `CI_FIXTURE_EXPORT_CONFIRM=EXPORT_SANITIZED_CI_FIXTURE` + `--confirm=…` 重导 → `{status:'exported', snapshots:37, facts:1007, counts:{takken:16,gyoseishoshi:15,it-passport:10,fundamental-it-engineer:28,bookkeeping:863,fp:75}}`；`verify-ci-fixture.mjs` → `Sanitized CI fixture structure verified.`
- `fixtures/ci/approved-facts.sql` diff = **82 行（41 插入 / 41 删除）**，全部是 FE 证据串换号：`snapshots` 由 `2063cd07…`/`d2178a93…` 换成 `08add212…`/`54226275…`，12 条 FE candidate/revision/facts 与 1 条 methodology 换 id，**计数不变（1007 / 1007 / 1007 / 37）**。
- `RELEASE_BASELINE_CONFIRM=UPDATE_RELEASE_GATE_BASELINE` + `--confirm=…` → `{status:'updated'}`，六格 `expectedFacts` 仍为 16 / 15 / 10 / 28 / 863 / 75，`config/release-gate-baseline.json` **无 diff**（说明本次刷新不改变任何资格的已批准事实数量，符合预期）。

### 2.7 FE Pass Rate 页面是否读到正确数据

**是。** `verify:all` 的 FE 一格全部 `status: 200`，`/shikaku/fundamental-it-engineer/pass-rate/` 正常渲染；手工起 `dist` 进程实测该页 200 且 robots=(none)、canonical 自指（薄页仍可索引，符合 §10）。页面数值与 §2.2 一致（三年度 4 字段）。

### 2.8 sitemap / canonical / noindex 是否异常

**无异常。** `/sitemap.xml` 200；FE 的 overview / application / exam-content / pass-rate 四条在 sitemap 中且可索引（indexable ⇔ listed 断言通过）；年度路径按 `annualYears` 输出；`?year=` 变体仍 `noindex,follow`。

---

## 3. API 失败降级（2B）

### 3.1 当前架构（修改前实测）

**任务文档 §6 的前提「上游失败 → 200 空态」与实测不符，这是本轮最关键的发现。** 修改前的真实行为是：

- `apps/web/src/server.ts` 有唯一错误出口 `catch { res.writeHead(502, …); res.end(renderErrorPage()) }`。该 `catch` **不接收 error 参数**，不区分网络错误 / 非 2xx / JSON 解析失败 / 渲染抛错，**一律 502**。
- 逐路由：`/shikaku/`、`/schedule/`、`/compare/`、`/pass-rate/`、`/updates/`、`/shikaku/{slug}/{part}`、`/sitemap.xml`、`/ics/*` —— **上游失败时全部 502**。
- 静态路由（`/images/`、`/assets/`、`/robots.txt`、`/guide/`、`/about/`、`/compare/{slug}`、`/guide/{slug}`、404）**从不 fetch**，不受影响。
- **唯一例外 `/`**：用 `Promise.allSettled` 逐项回落 `[]`，无论 API 是否可用都 `200`。代码注释自陈「a data outage degrades to empty modules instead of 502」。
- 四个 fetch helper（`readQualification` / `readCalendar` / `readComparison` / `readUpdates`）都写 `if (!response.ok) throw new Error(...)`，**已在做「合法空 vs 上游失败」的区分**（`response.ok === true` 且 `facts: []` 是合法空；`ok === false` 或 fetch 抛异常才是失败），**只是 throw 之后顶层 catch 把状态码写死 502 且不读 error**。
- 合法空在 API 侧是 200（`public-view.ts:178-185` 返回 `awaiting_official` / `under_review`，`docs/api-contract.md:13` 明确 200），未知 slug 是 404，DB 错误是 Fastify 默认 500。
- **无超时**：`apps/web/src` 内 `AbortController|signal|timeout` 零命中，上游挂起属未定义行为（本 Sprint 不处理）。
- 错误页 `renderErrorPage()` 本身 SEO 安全：`noindex: true`、无 canonical、抑制 structured data、唯一出口是 `/shikaku/`。

### 3.2 修改后行为

最小改动（未新增全站中间件、未动 Caddy/Docker/CDN/全局错误页）：

1. `apps/web/src/server.ts` 新增 `export class UpstreamUnavailableError extends Error`（携带可选 `status`）与 `fetchUpstream(input)`：fetch 自身抛异常 → `UpstreamUnavailableError('API request failed: …')`；`!response.ok` → `UpstreamUnavailableError('API returned <status>', status)`。
2. 四个 `read*` helper 全部改走 `fetchUpstream()`，删除各自的 `!response.ok` throw。
3. 顶层 `catch (error)` 按类型分码：`UpstreamUnavailableError` → **503** + `Retry-After: 60` + `renderErrorPage()`；其它（渲染异常等）仍 **502**。
4. `proxyIcs` 同步：连接失败 → 503；非 404 的上游失败由 502 改 503；404 仍 404。
5. 抽出 `export async function handleRequest(req, res)`，`listen` 由 `if (process.env.NODE_ENV !== 'test')` 保护（沿用 `services/api/src/server.ts:244` 的既有先例），使 503 路径可被单测直接覆盖。

**`/` 保持 200，这是硬约束不是遗漏**：`deploy/docker-compose.prod.yml` 的 web healthcheck 打 `/` 并 `process.exit(response.ok ? 0 : 1)`，Caddy `depends_on: web: condition: service_healthy`。若 `/` 返回 503，容器变 unhealthy → Caddy 永不启动 → 全站不可用。

### 3.3 为什么选 503

- 语义正确：上游不可用是**临时性**故障，503 + `Retry-After` 是标准表达；502 表示「网关收到无效响应」，与实际（连不上 / 上游 5xx）不符。
- 可区分：`response.ok` 边界已存在，只需把「已知失败类型」映射到「已知状态码」（仓库先例：`proxyIcs` 的 404 vs 502）。
- SEO 安全：503 页仍走 `renderErrorPage()`（`noindex` + 无 canonical），且 `/sitemap.xml` 故障时也 503、不输出 `<urlset>`，不会产生可索引的错误页。
- 不扩大范围：静态路由从不 fetch，因此「按错误类型分码」不会变成全站 503（§6.1 满足）。
- 对门禁零影响：`verify:all` 的 `waitFor` 只接受 `response.ok`，502 与 503 后果相同；`docker-smoke` 全部断言都在容器健康时执行。

### 3.4 可重复验证的测试路径

**自动化**（`tests/web-server.test.ts`，8 例，随 `pnpm test` 跑）：

| #   | 场景                          | 断言                                                                  |
| --- | ----------------------------- | --------------------------------------------------------------------- |
| 1   | 上游有 facts                  | 200、含「ITパスポート」、无 noindex                                   |
| 2   | 上游返回合法空（`facts: []`） | **仍 200**、不是故障页（不含「情報を取得できませんでした」）          |
| 3   | 上游 5xx                      | **503**、`retry-after: 60`、`text/html`、含 noindex、**无 canonical** |
| 4   | 上游连不上（关闭端口）        | **503** + noindex                                                     |
| 5   | `/sitemap.xml` 上游 5xx       | **503**、`text/html`、正文不含 `<urlset`                              |
| 6   | `/robots.txt` 上游连不上      | **仍 200** 且含 `Sitemap:`                                            |
| 7   | `/` 上游连不上                | **仍 200**（healthcheck 依赖）                                        |
| 8   | 上游恢复                      | 回 **200**                                                            |

**手工端到端**（真实起 `dist` 进程，`API_PORT=4199` / `WEB_PORT=3099` / `SITE_ORIGIN=https://shikakucheck.com`）：

| 状态   | 路由                                              | 实测                      |
| ------ | ------------------------------------------------- | ------------------------- |
| 正常   | `/shikaku/takken/`、`/pass-rate/`、`/sitemap.xml` | 200                       |
| 上游停 | `/shikaku/takken/`                                | **503**，`retry-after=60` |
| 上游停 | `/pass-rate/`                                     | **503**，`retry-after=60` |
| 上游停 | `/sitemap.xml`                                    | **503**，`retry-after=60` |
| 上游停 | `/`、`/robots.txt`、`/guide/`、`/assets/*.css`    | 200（证明非全站 503）     |
| 恢复   | 上述三条数据路由                                  | 全部回 **200**            |

---

## 4. SEO 验证

手工起 `dist` 进程实测（`SITE_ORIGIN=https://shikakucheck.com`）：

| 路由                                    | 状态 | robots           | canonical                             |
| --------------------------------------- | ---- | ---------------- | ------------------------------------- |
| `/pass-rate/`                           | 200  | （无）           | `https://shikakucheck.com/pass-rate/` |
| `/pass-rate/?sort=pass_rate&order=desc` | 200  | `noindex,follow` | 同上                                  |
| `/pass-rate/?sort=bogus`                | 200  | `noindex,follow` | 同上                                  |
| `/schedule/`                            | 200  | （无）           | `https://shikakucheck.com/schedule/`  |
| `/shikaku/takken/2025/`                 | 200  | `noindex,follow` | 自指（未改）                          |
| `/shikaku/takken/2027/`                 | 200  | `noindex,follow` | 自指（未改）                          |
| `/shikaku/takken/2030/`                 | 200  | `noindex,follow` | 自指（未改）                          |
| `/shikaku/fp/pass-rate/`                | 200  | （无）           | 自指                                  |
| `/shikaku/gyoseishoshi/pass-rate/`      | 200  | （无）           | 自指                                  |
| `/shikaku/it-passport/pass-rate/`       | 200  | （无）           | 自指                                  |

逐条对照任务文档：

- **§7 `/pass-rate/` 空表保持可索引**：未加 noindex、未删 sitemap 条目、未改 canonical、未 404/503。**符合**。
- **§8 `/schedule/` 空态保持现状**：无 noindex、无 301、未新增空态路由、未改 UI。**符合**。
- **§9 年度空壳页**：`/2025/`、`/2027/`、`/2030/` 均 **200 + noindex,follow**，canonical 仍自指。任务文档只要求「统一 200+noindex，不 301/404/改 canonical，若现状不符只报告不扩大范围」——现状已符合，故**未改 canonical**。**符合**。
- **§10 薄 Pass Rate 页保留 sitemap**：3 个单年页均 200 且可索引，sitemap 条目保留。**符合**。
- 门禁层：`scripts/verify-lib.mjs` 的 indexable ⇔ listed 等价约束、`?year=`/`?sort=`/`?order=` 参数页不得进 sitemap 的断言，全部通过（`test:verify-gate` 40/40、`verify:all` 6/6、`smoke:docker` 通过）。

---

## 5. 测试（逐条命令与结果）

| 命令                                                                                           | 结果                                                                                          |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `pnpm run typecheck`                                                                           | EXIT 0                                                                                        |
| `pnpm test`                                                                                    | **18 files / 199 tests passed**（Sprint 1 后为 17/191；新增 `tests/web-server.test.ts` 8 例） |
| `pnpm run test:verify-gate`                                                                    | **40 pass / 0 fail**，EXIT 0                                                                  |
| `pnpm run build`                                                                               | EXIT 0                                                                                        |
| `pnpm run format:check`                                                                        | `All matched files use Prettier code style!`，EXIT 0                                          |
| `pnpm exec eslint . --ignore-pattern "Python/**"`                                              | EXIT 0                                                                                        |
| `pnpm run test:python`                                                                         | **239 passed**（Sprint 1 基线 237；2A 新增 2 例）                                             |
| `DATABASE_URL='postgresql://postgres@127.0.0.1:55432/qualification_media' pnpm run verify:all` | `"status": "passed"`、`passed: 6`、`failed: 0`，六格 `errors: []`、`pending_official: 0`      |
| `pnpm run smoke:docker`                                                                        | `docker smoke passed`，12 条 ok                                                               |

环境说明（**未伪造任何读数**）：

- `lint` 必须带 `--ignore-pattern "Python/**"`：本地存在 `Python/pythoncore-3.15-64.0.deleteme` 目录（非仓库内容），不加会报 2 个与环境相关的 error。这是既有本地噪声，与 Sprint 1 一致。
- `verify:all` / `smoke:docker` 需要 `DATABASE_URL`。`.env` 里的默认值指向不存在的 `localhost:5432`，实测须显式用 `127.0.0.1:55432`（docker 容器 `jpqm-pg18`，`postgres:18-alpine`）。
- pwsh 下 `tsc`/`eslint`/`pnpm` 的正常 stdout 会被当作 `NativeCommandError` 噪声输出，**以 EXIT 码为准**（均 0）。
- `format:check` 首轮曾对用户新放入的 `docs/audit/DEEPSEEK_HARNESS_SPRINT_1_TASK.md`、`DEEPSEEK_HARNESS_SPRINT_2_TASK.md` 报 warn（不符合 prettier）；已 `prettier --write`，改动仅 **12 行纯空行插入**，语义零变化。

---

## 6. 修改文件

**生产代码（2）**

- `apps/web/src/render.ts`：Sprint 1 的 G-02/G-18（`parsePassRateIndexQuery`、`PassRateIndexOptions.noindex`、行链接改指可索引 section 页）。
- `apps/web/src/server.ts`：Sprint 1 的 `/pass-rate/` 参数白名单接线 + **Sprint 2B 的 503 分层**（`UpstreamUnavailableError`、`fetchUpstream`、四个 helper、`proxyIcs`、顶层 catch、`handleRequest` 导出 + `NODE_ENV !== 'test'` 保护 listen）。

**数据/迁移/夹具（2）**

- `packages/db/migrations/0030_fe_statistics_suiihyo_202610.sql`（新建，旧值守卫幂等 UPDATE）。
- `fixtures/ci/approved-facts.sql`（重导，FE 证据串换号，计数不变）。
- `services/collector/tests/fixtures/fe/202610_fe_01_suiihyo.xlsx`（新建，18062 B / `08add212…`；上一版 `202609_…` 保留作对照）。

**采集器（2）**

- `services/collector/src/collector/fundamental_it.py`：`statistics-fe-suiihyo` 的 `canonical_url` 202609 → 202610 + 注释更新。
- `services/collector/tests/test_fe_statistics_xlsx.py`：`FIXTURE` 指向 202610、`FIXTURE_SHA256 = 08add212…`、新增 `PREVIOUS_FIXTURE` 与两条新用例（月度滚动三完整年度零变化、上一版字节仍是登记过的 202609）；证据断言改 `(令和8年11月20日現在)`。
- `services/collector/tests/test_fundamental_it_contract.py`：注册 URL 断言改 202610。

**测试（3）**

- `tests/web-render.test.ts`：Sprint 1 的 G-02/G-18 断言（新增 2 例）。
- `tests/web-server.test.ts`（新建，8 例，503 分层回归）。
- `scripts/verify-lib.test.mjs`：`?sort=`/`?order=` 不得进 sitemap 的 2 条断言（Sprint 1）。

**门禁脚本（2）**

- `scripts/verify-lib.mjs`：`?year|sort|order` 参数页检查 + `/pass-rate/` 与 `?sort=` 成对探针（Sprint 1）。
- `scripts/docker-smoke.mjs`：`the pass-rate sort variants stay noindex` 冒烟 + sitemap `?sort=` 检查（Sprint 1）。

**文档（5）**

- `docs/adr/0002-index-policy.md`：§4 第 4 条按 Sprint 2B 修订（503 + `Retry-After: 60` + noindex，`/` 例外仍 200）；§5 新增「上游故障的响应分层」。
- `docs/audit/V2_GAP_MATRIX.md`：G-02 ✅、G-18 🟡（Sprint 1）；G-10 追加「部分修复（Sprint 2B）」并记录实测前提修正。
- `docs/fundamental-it-engineer-source-contract.md`：来源表 URL 改 202610、新增 Sprint 2A 滚动记录段、提取规则与夹具描述更新、D1 现状第 5 条改为已闭合。
- `docs/next-round-ticket.md`：待办 1（D1）标记已由 Sprint 2A 闭合；待办 3 按 Sprint 1/2B 实际结果全面改写。
- `docs/audit/SPRINT_2_REPORT_2026-11-24.md`（本文件，新建）。

---

## 7. Git diff

```
 apps/web/src/render.ts                             |  36 +++++-
 apps/web/src/server.ts                             | 122 +++++++++++++++++----
 docs/adr/0002-index-policy.md                      |  12 +-
 docs/audit/V2_GAP_MATRIX.md                        |   3 +
 docs/fundamental-it-engineer-source-contract.md    |  12 +-
 docs/next-round-ticket.md                          |   4 +-
 fixtures/ci/approved-facts.sql                     |  82 +++++++-------
 scripts/docker-smoke.mjs                           |  40 +++++++
 scripts/verify-lib.mjs                             |  40 ++++++-
 scripts/verify-lib.test.mjs                        |  16 +++
 services/collector/src/collector/fundamental_it.py |   7 +-
 .../collector/tests/test_fe_statistics_xlsx.py     |  57 +++++++++-
 .../tests/test_fundamental_it_contract.py          |   2 +-
 tests/web-render.test.ts                           |  55 +++++++++-
 14 files changed, 402 insertions(+), 86 deletions(-)
```

未跟踪（6）：`docs/audit/DEEPSEEK_HARNESS_SPRINT_1_TASK.md`、`docs/audit/DEEPSEEK_HARNESS_SPRINT_2_TASK.md`（用户放入）、`docs/audit/SPRINT_1_REPORT_2026-11-24.md`、`docs/audit/SPRINT_2_REPORT_2026-11-24.md`（本文件）、`packages/db/migrations/0030_fe_statistics_suiihyo_202610.sql`、`services/collector/tests/fixtures/fe/202610_fe_01_suiihyo.xlsx`、`tests/web-server.test.ts`。

关键摘要：

- `apps/web/src/server.ts` 的 122 行改动 = Sprint 1 的 `/pass-rate/` 接线（约 10 行）+ Sprint 2B 的 503 分层（约 110 行，含类型、helper、catch、`handleRequest` 导出与 listen 保护）。
- `fixtures/ci/approved-facts.sql` 的 82 行改动是**纯换号**（41/41），四个计数断言（1007/1007/1007/37）不变。
- `config/release-gate-baseline.json` **无 diff**（重导后六格 expectedFacts 不变）。
- 所有改动均在工作树，**未 commit**。

---

## 8. 未处理问题

1. **`renderErrorPage` 的出口仍只有 `/shikaku/` 一个按钮**（无搜索框、无热门页）。这是 `docs/next-round-ticket.md:36` 旧决定里唯一真正落地过的一半，Sprint 2B 只改了状态码分层，**UX 部分未动**。
2. **`/pass-rate/` 单资格失败会拖垮整张表**：该路由用 `Promise.all` 并发读 6 个资格，任一失败 → 整页 503。一个资格的数据问题会打掉整张可索引合格率表。粒度（是否改成 `allSettled` + 部分渲染）需 owner 拍板，本轮未改。
3. **无上游超时**：`AbortController`/`signal`/`timeout` 全仓零命中，上游挂起时行为未定义（既不是 503 也不是 502）。修它要引入超时策略，超出 §6 最小实施范围。
4. **`/sitemap.xml` 故障时返回 HTML**（`content-type: text/html`）：状态码已改 503，但 XML 端点返回 HTML 的形态问题（G-10 的另一半）未处理。
5. **`services/api/src/public-facts.ts:69` `if (!databaseUrl) return []`**：未配库时 API 返回 200 + 空事实集，web 侧与「确实没数据」外观相同。这是配置错误，任何 503 方案都覆盖不到，明确排除。
6. **年度空壳页 canonical 仍自指**：§9 只要求保持 200+noindex，故未改；若要改指 `/shikaku/{slug}/`，属后续决策。
7. **`/pass-rate/` 空表索引状态**：按 §0 决策保持可索引，sitemap 准入问题（G-06）留待后续。

---

## 9. 风险

1. **503 改变了运维可观测信号**：过去所有上游故障都是 502，现在数据页是 503。若线上有基于状态码的告警/看板，需要同步调整阈值语义（本轮无部署，故无即时影响）。
2. **`Retry-After: 60` 是固定值**，未与真实恢复时间关联；上游长时间故障时会被反复重试。对搜索引擎无害（503 本身表示暂时不可用），但会放大上游压力。
3. **`/pass-rate/` 粒度风险**（见 §8.2）：503 分层让「一个资格坏了 → 整张表 503」变得语义更明确，但也更容易被外部观察为整站数据不可用。
4. **`handleRequest` 导出改变了模块契约**：`apps/web/src/server.ts` 从「零导出」变为「导出 `handleRequest` + `UpstreamUnavailableError`」。若有外部代码依赖「import 即启动」，会受影响（当前仓库内无此类依赖，已 grep 确认）。
5. **迁移 0030 是旧值守卫 UPDATE**：若某环境 `canonical_url` 已被手工改成别的值，迁移会静默不生效（守卫设计如此），需要在部署时确认 `sources` 实际值。
6. **CI 夹具换号**：`fixtures/ci/approved-facts.sql` 的 FE 证据串已全部换成 202610 哈希，任何仍引用 `2063cd07…`/`d2178a93…` 的外部脚本会失配（仓库内已同步更新，`verify-ci-fixture.mjs` 通过）。
7. **工作树未提交**：14 modified + 6 untracked 全在工作树，若被 `git reset --hard`/`git clean -fd` 会丢失（任务文档 §3 已禁止这类命令）。

---

## 10. 下一步建议（仅建议，未执行）

1. **先提交**：Sprint 1 + Sprint 2 共 14 modified + 6 untracked 应作为一个或两个 commit 落盘（建议按 Sprint 拆分，Sprint 2A 与 2B 再拆一次），避免工作树长期悬挂。
2. **拍板 `/pass-rate/` 的失败粒度**：单资格失败是否应整页 503，还是 `allSettled` + 只渲染成功部分（并在页面上标注部分数据暂缺）。这是 §8.2 的唯一阻塞点。
3. **补 `renderErrorPage` 的 UX**：搜索框 + 热门页 + 资格直链，参照 `renderNotFoundPage()` 的结构。这是旧决定里未完成的一半，与状态码无关，可独立做。
4. **引入上游超时**：给 `fetchUpstream` 加 `AbortSignal.timeout(...)`，让「挂起」变成确定的 503。需要 owner 定超时值（建议 5–8s，与 web 侧其他响应时间量级对齐）。
5. **修 `/sitemap.xml` 的响应形态**：故障时至少返回 `content-type: application/xml` 或纯文本错误，避免 XML 端点返回 HTML。
6. **年度空壳页 canonical**：若要统一改指 `/shikaku/{slug}/`，需先确认与 `verify-lib.mjs` 的 canonical 断言不冲突，再单独一批做。
7. **G-06（sitemap 准入）**：`/pass-rate/` 空表与薄页的索引策略是同一族问题，建议合并成一个决策点再动手。

---

**停止声明**：Sprint 2 的 2A + 2B + 测试 + SEO 回归 + 本报告已全部完成，按任务文档 §16 **在此停止**，不进入 Sprint 3（不碰 G-07 内链重构、首页改版、移动端大改、资格扩充、年度页 301、无尾斜杠 301、薄页清理、宅建统计入库）。未 commit、未 push、未部署生产。
