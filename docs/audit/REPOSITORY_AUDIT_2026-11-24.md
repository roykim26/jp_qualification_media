# 仓库与产品基线审计（Phase 0，只读）

- 审计日期：2026-11-24（Asia/Tokyo 业务口径，执行机本地时间 Asia/Shanghai）
- 审计范围：本地工作区 `E:\自建程序\jp_qualification_media` + GitHub `roykim26/jp_qualification_media` + 生产 `https://shikakucheck.com`
- 审计性质：**只读**。本次未修改任何业务代码、CSS、文案、路由、API、数据库、迁移、baseline、CI fixture、source contract、`.env`、密钥、GA4 ID、GSC/Bing 配置；未创建/删除/合并分支或 PR；未部署、未重启生产；未安装任何新依赖。
- 本文档为**新增**文件，未修改任何既有文档。
- 证据目录：`var/audit-2026-11-24/`（在 `.gitignore` 内，不进版本库）。本文所有数字均可回溯到该目录下的探针脚本输出或下列文件行号。

> **代码事实基准与生产事实基准不同源（重要）**
> 本文的「代码事实」以**当前工作树**为准；「生产部署版本」以线上响应反推。两者并不相同：工作树 `70740d9`（detached，2026-11-15）**比 `origin/main` `01b86dd` 落后 7 个提交**，且工作树还额外缺失 `origin/main` 已有的 footer badge 支持。详见 §1.3。

---

## 0. 结论速览

| #   | 结论                                                                                                                                 | 证据       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| 1   | 仓库**不在干净的可发布状态**：detached HEAD、工作区 10 项未提交、落后 `origin/main` 7 个提交                                         | §1.1–§1.3  |
| 2   | 生产已上线且**比本地工作树新**（含 #106/#109 完整版）                                                                                | §1.4、§6.1 |
| 3   | 除首页外，**7 个数据页 + sitemap 均无降级**：任一 API 抛错即整页 502                                                                 | §2.1、§2.6 |
| 4   | 数据高度不均：簿记 863/1007 = **85.7%**，IT Passport 仅 10 条、行政書士 15 条                                                        | §3.2       |
| 5   | `coverage gaps = 0` **不等于字段齐备**：只有 5 条 `required` 参与硬约束，`conditional` 在维度未命中时整条跳过                        | §3.5       |
| 6   | SEO 基础项干净（52 条 sitemap 全 200、无 noindex、canonical 全自指），但存在**排序参数页可索引**与**年度页/概要页 57% Jaccard 重复** | §4.2–§4.5  |
| 7   | UI 无横向溢出、H1 唯一、无 JS 错误；但**点击目标普遍 18px 高（< WCAG 2.2 AA 24×24）**，移动端 Cookie 横幅占首屏 25%                  | §5.3       |
| 8   | 文档**代码与文档双向漂移**：runbook 仍写「仅本地开发 / 176 条」；design-system 字号表与 1280 断点未实现                              | §6.2–§6.4  |
| 9   | 生产 HTML **无 Cache-Control/ETag**、**未启用 Brotli**、单页最大 518KB（未压缩）                                                     | §6.1       |
| 10  | 本次**无法**取得 GSC / Bing / GA4 数据；`verify:all` 等需 DB 的校验**本次未能执行**                                                  | §7、§3.7   |

---

## 1. 第一步：仓库状态

### 1.1 当前分支与 HEAD

```
HEAD (detached)  70740d9fffb962f8fc632d21cd6b9d38effb881d
                 (HEAD detached from ebf83e7)
                 2026-11-15 13:51:03 +0800
                 docs: 落账 PR #104 交付链补记（…纯文档）
本地分支
  main                      f3a6492  [origin/main: behind 3]
  chore/dev-env-file        4c471a0  [origin/chore/dev-env-file]
  fix/footer-column-align   8cf5bb7  [origin/fix/footer-column-align: gone]
tag: v0.1.0（唯一）
```

### 1.2 与 `origin/main` 是否一致

**不一致。**

```
git rev-list --left-right --count origin/main...HEAD  →  7   1
```

- `origin/main` HEAD = `01b86dd8d399f5a5545a8d3761f06db31df5bacd`（2026-11-19T03:46:22Z，PR #111 merge）
- `origin/main` tree = `4f22435278caffe003494299021532cf111dfd95` —— 与本次审查基线 tree **完全一致**，说明审查方看到的 `main` 就是当前 `origin/main`。
- 工作树独有 1 个提交（`70740d9`，纯文档）；`origin/main` 独有 7 个提交（#105、#106、#107、#108、#109、#110、#111）。

### 1.3 工作区是否干净

**不干净，共 10 项。**

```
 M apps/web/src/editorial.ts
 M apps/web/src/layout.ts
 M docs/data-gate-semantics.md
 M docs/handover-p1-ops-findings.md
 M docs/next-round-ticket.md
 M docs/stage-log.md
 M docs/transition-handoff.md
 M packages/ui/src/index.ts
 M tests/web-render.test.ts
?? scripts/visual_smoke.py
```

`git diff --stat`（相对 HEAD）：9 files changed, 119 insertions(+), 17 deletions(-)。

**关键判读**：`git diff origin/main --name-status` 只剩 4 项，即工作树内容≈`origin/main`，但方向是**工作树更旧**：

| 文件                                                   | 相对 `origin/main` 的差异                                                                                 | 含义                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ----------------------- |
| `apps/web/src/server.ts`                               | 删掉了 `STATIC_IMAGES` 里的 `'twelve-tools-badge0-white.svg': 'image/svg+xml'`；`/images/` 正则从 `(?:png | webp                    | avif | svg)`退回`(?:png | webp | avif)` | **本地代码无法提供该 SVG** |
| `apps/web/src/styles.ts`                               | 删掉 `.footer-badges` 4 条规则（`origin/main` 在 `:481-484`）                                             | 本地构建 CSS 无该组样式 |
| `apps/web/public/images/twelve-tools-badge0-white.svg` | 删除（D）                                                                                                 | 资产缺失                |
| `scripts/visual_smoke.py`                              | 本地是更早版本（本地 SHA256 `E958BBC6…39E2` vs `origin/main` `CC4EC583…F98`）                             | 工具落后                |

佐证：本地 `corepack pnpm run build` 产出 `siteCssPath = /assets/site.ee6d75d9787e.css`（68314 B），而生产是 `/assets/site.c022119125ca.css`（解码后 68600 B）。两者差异点正是 `.footer-badges`。**结论：生产运行的代码比本地工作树新。**

### 1.4 最近 20 条提交（`origin/main` 视角）

```
01b86dd 2026-11-19  #111 chore: 常备线上视觉冒烟工具 scripts/visual_smoke.py＋开工单 §3 补 .bin 缺失根因…（纯工具/文档）
9df67ed 2026-11-19  #110 docs: 落账 PR #109 页脚邮箱移除交付链＋#108 中间轮＋清理＋部署
dc4e0ec 2026-11-19  #109 fix: 页脚法務・連絡栏移除邮箱直显（四页 mailto 保留，页脚仅留お問い合わせ入口）
f3a6492 2026-11-18  #108 feat: 全站联系入口加入业务邮箱 contact@shikakucheck.com
ab71d64 2026-11-18  #107 fix: 页脚桌面/平板四列标题对齐（≥768px 隐藏運営・法務折叠行、子列标题升为 16px 深色）
af18a34 2026-11-18  #106 feat: 页脚添加 Twelve Tools 友情链接徽章（SVG 自托管避免未同意外部送信）
17a9185 2026-11-15  #105 docs: 落账 PR #104
ebf83e7 2026-11-15  #104 docs: 落账 PR #103 M2/GA 交付链＋GA 媒体资源重建换 ID（G-LV4250LZNY→G-G9SN61J5LS）
87af837 2026-11-15  #103 feat: M2 Cookie 同意门控＋外部送信告知＋opt-out
e38c79a 2026-11-14  feat: UX 整改全量收口（Phase 0〜2＋P3：品牌更名、日程/详情/比较/目录重构、关键 CSS 内联＋Hero AVIF/WebP）
d963550 2026-11-14  #102 docs
23111cd 2026-11-14  #101 feat: 验证就绪收口轮（A1 Caddy JSON 日志、A3 日期兜底、B4 終了 badge、B5 首页去重、C2 安全响应头）
7cd048a 2026-11-14  #100 docs
e61cb12 2026-11-14  #99  docs
8cf8039 2026-11-14  #98  docs
29f26ba 2026-11-14  #97  docs
039af7f 2026-11-14  #96  docs
2476a60 2026-11-14  #95  feat: IndexNow 换 Bing 官方 key 路由＋Caddy 配置改目录挂载
fb0d1ac 2026-11-14  #94  docs
a4c8111 2026-11-14  #93  feat: Caddy 增加 IndexNow 密钥文件路由（52 条 sitemap URL 已提交 IndexNow 获 202）
```

### 1.5 开放 PR、未合并分支与 CI

- **开放 PR 仅 1 个**：`#78`「chore: dev 脚本加载本地 .env（--env-file-if-exists）」，head `chore/dev-env-file`，创建于 2026-11-12T14:38Z，`isDraft=false`，`mergeable=UNKNOWN`，**已闲置 11 天**。内容：给 `dev:api`/`dev:web`/`dev:admin` 加 `--env-file-if-exists=.env`（`.env` 本身不入库）。
- **CI**：workflow 名 `Release gate`；最近 8 次运行 `conclusion` 全部为 `success`（最新一次是 2026-11-19T03:46:25Z 的 `push main`）。
- **远端分支**：`origin/main`、`origin/chore/dev-env-file`、`origin/feat/footer-twelve-tools-badge`、`origin/feat/p0-1-core-facts`、`origin/feat/prod-pg18`、`origin/feat/prod-pg18-mount`。

### 1.6 是否有其他窗口/开发者正在进行的工作

**没有。** 仓库只有一个作者：`roykim26 <jinlong242024@gmail.com>`（140 commits）。本机只有 1 个 worktree（`E:/自建程序/jp_qualification_media`，`70740d9` detached），无 stash。工作区那 10 项未提交改动与本轮审计无关（它们是 #106/#108 的中间态），本次审计**未触碰**它们。

### 1.7 当前生产部署版本

**可从只读证据反推，但无法得到 commit SHA。**

从生产 HTML 反推的特征：

| 特征              | 生产实测                                                                                                          | 对应改动                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| Twelve Tools 徽章 | `twelve-tools-badge` ×1、`footer-badges` ×1；`/images/twelve-tools-badge0-white.svg` → 200 `image/svg+xml` 1794 B | #106 已上线                       |
| 页脚邮箱          | 首页 `contact@shikakucheck.com` 0 次、`mailto:` 0 次；`/about/contact/` 页内 3 次 + `mailto:` 1 次                | #109 已上线（页脚移除、四页保留） |
| GA4               | `G-G9SN61J5LS` ×1；旧 `G-LV4250LZNY` 0 次                                                                         | #103/#104 已上线                  |
| Cookie 同意门控   | `data-cookie-banner` ×2、`data-cookie-settings` ×2                                                                | #103 M2 已上线                    |
| CSS               | `/assets/site.c022119125ca.css`，`media="print" onload` 异步加载 + `<noscript>` 兜底                              | 与本地构建 `ee6d75d9787e` 不同    |
| Hero              | `hero-1200.avif`                                                                                                  | e38c79a UX 收口已上线             |

→ 生产**至少包含 #109 与 #106/#107 的全部内容**，即部署版本 ≥ `dc4e0ec`。**具体部署到哪个 commit 无法从只读证据确认**（容器内镜像无版本号注入、无 `/version` 端点）。**待用户/运维核实**（见 §7.3）。

---

## 2. 第二步：现有页面与功能盘点

### 2.1 路由 → 渲染函数 → API 依赖 → 测试 → 是否依赖真实 approved facts

| #   | 路由                                                                    | 实现（文件:行）                                                                               | API 依赖                                                                 | 有测试？                                 | 依赖真实 approved facts？                  |
| --- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------ |
| 1   | `/`                                                                     | `apps/web/src/server.ts:392-420` → `render.ts:2571-2660` `renderHomePage`                     | `/api/v1/calendar`、`/api/v1/updates`、6×`/api/v1/qualifications/{slug}` | `tests/web-render.test.ts`（渲染函数级） | 是（**唯一**用 `Promise.allSettled` 降级） |
| 2   | `/shikaku/`（目录/搜索 `?q=`）                                          | `server.ts:241-257` → `render.ts:1619-1678` `renderQualificationDirectory`                    | 本地 `searchQualifications` + 6×`/api/v1/qualifications/{slug}`          | 是                                       | 是（任一抛错 → 502）                       |
| 3   | `/shikaku/{slug}/`（概要）                                              | `server.ts:353-391` → `render.ts:1374-1564` `renderQualificationSectionPage(view,'overview')` | `/api/v1/qualifications/{slug}`                                          | 是                                       | 是                                         |
| 4   | `/shikaku/{slug}/2026/`（年度）                                         | 同上（`section='annual'`）                                                                    | 同上                                                                     | 是                                       | 是                                         |
| 5   | `/shikaku/{slug}/application/`                                          | 同上（`section='application'`）                                                               | 同上                                                                     | 是                                       | 是                                         |
| 6   | `/shikaku/{slug}/exam-content/`                                         | 同上（`section='exam-content'`）                                                              | 同上                                                                     | 是                                       | 是                                         |
| 7   | `/shikaku/{slug}/pass-rate/`（含 `?year=`）                             | 同上（`section='pass-rate'`）                                                                 | 同上                                                                     | 是                                       | 是                                         |
| 8   | `/schedule/`（`?year= &qualification= &type= &range=`）                 | `server.ts:258-269` → `render.ts:1715-1993` `renderSchedulePage`                              | `/api/v1/calendar`                                                       | 是                                       | 是                                         |
| 9   | `/compare/`（`?qualifications=…` ≤3）                                   | `server.ts:270-274` → `render.ts:2010-2123` `renderComparePage`                               | `/api/v1/compare`                                                        | 是（`tests/compare-scopes.test.ts`）     | 是                                         |
| 10  | `/pass-rate/`（`?sort= &order=`）                                       | `server.ts:279-298` → `render.ts:2283-2353` `renderPassRateIndex`                             | 6×`/api/v1/qualifications/{slug}`                                        | 是                                       | 是                                         |
| 11  | `/updates/`（`?page= &qualification=`）                                 | `server.ts:339-352` → `render.ts:2362-2523` `renderUpdatesPage`                               | `/api/v1/updates`                                                        | 是                                       | 是                                         |
| 12  | `/guide/`                                                               | `server.ts:275-278` → `render.ts:2169-2215` `renderGuideIndex`                                | 无（纯静态）                                                             | 是                                       | **否**                                     |
| 13  | `/about/{slug}/`（9 页）                                                | `server.ts:299-310` → `render.ts:2125-2167` `renderEditorialPage`                             | 无                                                                       | 是                                       | **否**                                     |
| 14  | `/compare/{slug}/`（3 页）                                              | `server.ts:311-326` → 同上                                                                    | 无                                                                       | 是                                       | **否**                                     |
| 15  | `/guide/{slug}/`（4 页）                                                | `server.ts:327-338` → 同上                                                                    | 无                                                                       | 是                                       | **否**                                     |
| 16  | `/ics/{qualification}/{year}[/{eventId}].ics`、`/ics/month/YYYY-MM.ics` | `server.ts:230-240` → `:114-135` `proxyIcs`                                                   | `/api/v1/ics/...` 字节透传                                               | **无**                                   | 是                                         |
| 17  | `/sitemap.xml`                                                          | `server.ts:194-229` → `render.ts:63-65` + `apps/web/src/sitemap.ts:15-30`                     | 6×`/api/v1/qualifications/{slug}`（**无 try/catch**）                    | `tests/web-sitemap.test.ts`（纯函数级）  | 是                                         |
| 18  | `/robots.txt`                                                           | `server.ts:187-193`（内联文本）                                                               | 无                                                                       | **无**                                   | 否                                         |
| 19  | 404                                                                     | `server.ts:421-422` → `render.ts:2662-2684` `renderNotFoundPage`                              | 无                                                                       | **无**                                   | 否                                         |
| 20  | 502                                                                     | `server.ts:423-426` → `render.ts:2525-2542` `renderErrorPage`                                 | 无                                                                       | **无**                                   | 否                                         |

补充事实：

- `renderQualificationPage`（`render.ts:1272-1274`）是 `renderQualificationSectionPage(view,'overview')` 的别名，**`apps/web/src` 内 0 调用点 → 死代码**。
- slug 白名单**硬编码两处**：`server.ts:375-384` 与 `render.ts:60-67` 的 `launchSlugs`（6 值：`takken`/`gyoseishoshi`/`it-passport`/`fundamental-it-engineer`/`bookkeeping`/`fp`）。新增资格必须同时改两处，否则 404。
- 路由正则 `server.ts:184-186`：`/^\/shikaku\/([^/]+)(?:\/(application|exam-content|pass-rate|\d{4}))?\/?$/`，年度段只接受 4 位数字；`?year=` 只对 `pass-rate` 段生效（`server.ts:359-360`）。
- **`/api/v1/facts` 全仓无任何消费方**（grep 仅命中定义处 `services/api/src/server.ts:62`）。

### 2.2 空状态

| 页面                                   | 空态文案                                                 | 是否 noindex                                              |
| -------------------------------------- | -------------------------------------------------------- | --------------------------------------------------------- |
| `/shikaku/{slug}/`（无 approved 事实） | `公開できる公式情報はありません`                         | **是**（`render.ts:1561`，`sectionEmpty` 定义在 `:1432`） |
| `/schedule/`（无事件）                 | `表示できる公式日程はまだありません`（`render.ts:1913`） | 无筛选时 **否**（有筛选才 noindex，`:1989`）              |
| `/compare/`（选中 <2）                 | 空态提示（`render.ts:2092-2099`）                        | 选中 0 时 **否**（`selectedCount>0` 才 noindex，`:2119`） |
| `/pass-rate/`（空表）                  | `render.ts:2333-2342` 有空态分支                         | **无 noindex 字段 → 空表仍可索引**                        |
| `/updates/`（无结果）                  | 有空态                                                   | 有筛选或 `page>1` 时 noindex（`:2519`）                   |
| `/shikaku/?q=xxx`（无结果）            | 有空态                                                   | **是**（`:1674`）                                         |
| 首页（API 全挂）                       | 各模块退化为空                                           | **否**（`renderHomePage` 无 noindex 字段）                |

→ **三处「空态可索引」点位**：`/pass-rate/` 空表、无筛选的 `/schedule/` 空态、API 全挂的首页。**全仓没有关于「空态是否应可索引」的 ADR**（`docs/adr/` 只有 1 篇 8 行的 `0001-stage-0-foundation.md`，内容与 SEO 无关）。

### 2.3 404 与 502 的差异

| 维度                | 404（`renderNotFoundPage`）                              | 502（`renderErrorPage`）                                                        |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------- |
| title               | `ページが見つかりません`（`:2673`）                      | `一時的に表示できません`（`:2527`）                                             |
| H1                  | 含 `<span class="not-found__code">404</span>`（`:2675`） | `ページを表示できません`（`:2529`）                                             |
| kind                | `'empty'`（`:2677`）                                     | `'error'`（`:2531`）                                                            |
| 搜索表单            | **有**（action `/shikaku/`，带 `q`，`:2663`）            | **无**                                                                          |
| 热门出口            | 5 条（`:2664-2671`）+ 4 个资格链接（`:2682`）            | 仅资格一览（`:2534-2538`）                                                      |
| 正文                | —                                                        | `公式情報 API に接続できないため、未確認の内容は表示していません。…`（`:2533`） |
| canonical / ld+json | **都没有**（无 `canonicalPath`）                         | **都没有**                                                                      |

### 2.4 结构化数据

`apps/web/src/layout.ts:93-130` `renderStructuredData()`，输出 `{"@context":"https://schema.org","@graph":[…]}`（`<` 转 `\u003c`）。仅 4 种 `@type`：

- `WebSite`（`:95-102`，**仅当 `currentNav==='home'`**）
- `WebPage`（`:103-112`，仅当 `pageUrl` 存在）
- `BreadcrumbList` + `ListItem`（`:113-123`，有面包屑时）

**门禁**：`layout.ts:258-260` `const structuredData = input.noindex ? '' : renderStructuredData(input, pageUrl)` → **凡 noindex 页一律不输出 ld+json**。
**缺失**：无 `Organization`、无 `FAQPage`、无 `ItemList`、无 `Course`。

### 2.5 测试覆盖现状（关键缺口）

- `tests/*.test.ts` 共 **17 个**；`web-render.test.ts`（80.4 KB / 2246 行）是主测，`public-api.test.ts`（17.4 KB）是**唯一**用 `app.inject` 打真实 HTTP 的测试。
- **`apps/web/src/server.ts` 这个进程级入口没有任何测试导入**（grep 0 命中）：`createServer` 的 19 条路由无一条有进程级测试。
- 以下函数/行为 **0 测试**：`renderErrorPage`、`renderSitemap`、`proxyIcs`、`siteOrigin`、`escapeXml`、`readQualification`、`readCalendar`、`readComparison`、`readUpdates`、`parseUpdatesPage`、`STATIC_IMAGES`、`/images/`、`/robots.txt`、`/assets/`、`/sitemap.xml`、`/shikaku/:slug` 的 slug 白名单 404。
- **没有任何测试断言「`/pass-rate/` 空表页是否应 noindex」**，也没有测试覆盖 `/pass-rate/?sort=` 的 noindex 语义。

### 2.6 降级策略（重要风险）

- 只有首页用 `Promise.allSettled`（`server.ts:395-403`），失败项退化为 `[]`，返回 200 + 空模块。
- **其余 7 个数据页（`/shikaku/`、`/shikaku/{slug}/…`、`/schedule/`、`/compare/`、`/pass-rate/`、`/updates/`）与 `/sitemap.xml` 均无降级**：任一 `fetch` 抛错 → 整页 502。
- `/sitemap.xml` 的 `Promise.all`（`server.ts:194-229`）**没有 try/catch** → API 不可用时 sitemap 变 502，这对搜索引擎是最坏情况（sitemap 抓取失败比单页失败影响更大）。

---

## 3. 第三步：数据架构与资格覆盖

### 3.1 表结构（`packages/db/src/schema.ts`，14 张表）

`qualifications`(52-62)、`institutions`(63-67)、`sources`(68-91)、`source_scopes`(92-123)、`capture_runs`(124-136)、`snapshots`(137-163)、`source_checks`(164-182)、`candidate_facts`(183-229)、`fact_revisions`(230-246)、`facts`(247-280)、`reviews`(281-292)、`fact_retractions`(293-308)、`conflicts`(309-319)、`change_events`(320-332)。

枚举：`fact_status`（6 值）、`risk_level`（4 值）、`fact_value_type`（8 值）、`event_type`（9 值；`statistics_update` 由迁移 0019 追加，**必须保持在末尾**以免枚举值错位）。

**事实链完整**：`sources → snapshots → candidate_facts → fact_revisions → facts(current_revision_id) → change_events`，另有 `reviews`、`fact_retractions`、`conflicts` 三个审核/冲突/撤回表。

### 3.2 迁移（30 个）

只有 `0000_stage_0.sql`（10 表）、`0012`（3 表）、`0013`（1 表）建表；其余为源登记/加列/索引/枚举/回填/授权。值得注意的：

- `0017` 加 `exam_session`：日商簿记一年内多回（173 回 2026-06-14 与 172 回 2026-02-22 同属 2026），旧身份键会**静默丢数据**。
- `0020` 重分类历史 983 行（其中 921 行改值）。
- `0021` 加 `operator_id`/`reason`。
- `0024` FE CBT 维度回填。
- `0025` 建只读角色 `qualification_api_ro`（NOLOGIN + GRANT SELECT + REVOKE 写）。
- `0026` 修簿记 URL 漂移；`0028` kinzai 域名迁移；`0029` FE 推移表 xlsx 源。

**schema 漂移（缺陷）**：`0021_change_event_audit.sql:7-8` 已给 `change_events` 加 `operator_id`/`reason`，但 `packages/db/src/schema.ts:320-332` 的 `changeEvents` **未声明这两个字段**（grep `operator_id`/`operatorId` 全 false）。而 `services/api/src/release.ts:208`（手写 SQL）与 `scripts/rollback-fact.ts:57` 都在用它们 → **Drizzle ORM 层读不到回滚审计字段**，类型系统也无法校验。

### 3.3 数据量（CI 夹具 `fixtures/ci/approved-facts.sql` 实测）

文件 2218265 B、3214 物理行、**3060 条 INSERT**。按表：`snapshots` 37 / `candidate_facts` 1007 / `fact_revisions` 1007 / `facts` 1007 / **`sources` 0 / `reviews` 0 / `change_events` 0**（夹具为脱敏快照，不含审核身份与变更事件）。头注释明确：`Generated sanitized CI fixture. Do not edit by hand. Contains no reviewer identities, review reasons, local filesystem paths, or synthetic facts.`；`object_key` 全为 `ci://official-snapshot/…`，`retrieved_at` 全 `2026-01-01T00:00:00.000Z`。

> 解析踩坑（供复现）：`display_value` 内含真实换行，导致 22 条 INSERT 语句跨行。必须先按「行尾 `;`」重组语句、且正则加 `re.DOTALL`，否则只能解析到 985 条（少 22 条），分布会算错。

### 3.4 六资格逐项对比（1007 条 approved facts）

| 资格           |   facts |      占比 | fact_key 种数 | 年份跨度                     | 维度分布要点                                                                                                                                                                    |
| -------------- | ------: | --------: | ------------: | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 日商簿记       | **863** | **85.7%** |            20 | 2002–2026（2026 有 87 条）   | level 1=210/2=324/3=319/basic=5/cost-accounting-basic=5；unified 811/network 52；主体是 `pass_rate` 207、`passed` 207、`applicants` 193、`examinees` 193，其余 fact_key 均 ≤7   |
| FP 技能検定    |      75 |      7.4% |            16 | 全 2026                      | fp:1=27/fp:2=24/fp:3=24；academic 34/practical:asset-design 24/practical:asset-consulting 13/academic:basic 2/academic:applied 2；cbt 48/pbt 14/interview 13；jafp 48/kinzai 27 |
| 基本情報技術者 |      28 |      2.8% |            20 | 2023=4/2024=4/2025=5/2026=15 | subject-a 4/subject-b 4；全 cbt；含 `suspension_period` 1                                                                                                                       |
| 行政書士       |      15 |      1.5% |            15 | 全 2026                      | 每 fact_key 各 1 条                                                                                                                                                             |
| 宅地建物取引士 |      16 |      1.6% |            15 | 全 2026                      | paymentMethod 14 NULL + convenience_store 1 + pay_easy 1；`application_open`/`application_deadline` 各分 online/postal                                                          |
| IT Passport    |      10 |      1.0% |            10 | 全 2026                      | 每 fact_key 各 1 条；含 `application_change_deadline_rule`、`application_open_2026_may_sessions`                                                                                |

**结论**：

1. **不得宣称「六资格同等丰富」**。簿记一家占 85.7%，且其体量主要来自**历年统计序列**（2002–2026），不是「当前年度必填字段更全」。
2. **IT Passport（10 条）与行政書士（15 条）实际上只有「每类字段一条」的骨架**，任一字段缺失就会让该资格的相关区块变空。
3. **基本情報技術者 28 条跨 4 个年度**，但 2026 只有 15 条，且 `subject-a`/`subject-b` 各仅 4 条 → 分科目维度覆盖薄。
4. **FP 75 条全在 2026**，无历史统计，因此 `/shikaku/fp/pass-rate/` 只有合格基准类字段、没有历年表格（见 §4.5 薄内容）。

### 3.5 `coverage gaps = 0` 到底是什么

`config/data-coverage-contract.json`（version 1，`examYearPolicy: current_year_or_explicitly_scoped`，7 个维度，`fieldCatalog` 28 字段）共 **29 条 requirement**：

| 资格           | requirement 数 | required | conditional | not_applicable | post_event |
| -------------- | -------------: | -------: | ----------: | -------------: | ---------: |
| 宅地建物取引士 |              4 |    **3** |           0 |              0 |          1 |
| 行政書士       |              2 |    **1** |           0 |              0 |          1 |
| IT Passport    |              3 |        0 |           2 |              0 |          1 |
| 基本情報技術者 |              4 |        0 |           2 |          **1** |          1 |
| 日商簿記       |              6 |    **1** |           2 |          **2** |          1 |
| FP 技能検定    |             10 |        0 |           5 |          **4** |          1 |
| **合计**       |         **29** |    **5** |      **11** |          **7** |      **6** |

`scripts/verify-lib.mjs` 的 `evaluateCoverage(slug, facts, examYear)`（`:71-109`）逻辑：

1. 找不到 requirements → `{field:'*', reason:'unknown qualification'}`；
2. **直接跳过 `post_event` / `optional` / `not_applicable` 三档**（`:79-84`）；
3. `scoped = facts.filter(examYear === year && matchesCoverageDimensions(fact, dimensions))`（`:85-89`）；
4. **`conditional` 且 `scoped.length === 0` → 整条 `continue`**（`:90-91`）；
5. 逐字段用 `satisfiesCoverageField`（`:46-68`）判断，缺则记 gap（`source_url`/`official_verified_at` 记 `missing approved provenance`，其余记 `missing approved fact`）；
6. `gaps.length === 0` → `verified`，否则 `partially_announced`（`:111-113`）。

**因此 `coverage gaps = 0` 的正确解读是**：

- ✅ **当前年度「契约规定的必填项」没有缺口**；
- ❌ **不是「字段齐备」**：`conditional` 条在「维度没打上」时整条被跳过 —— 也就是**维度缺失反而让门禁更容易通过**；
- ❌ **不是「六资格同等完整」**：`required` 只有 5 条参与无条件硬约束，其中 takken 独占 3 条；IT Passport 与 FP 的 `required` 数为 **0**；
- ❌ **不是「没有真实缺失」**：`post_event`（考试后统计）6 条全部不参与门禁，所以「合格率历史数据缺失」不会让门禁变红。

必须区分的四类缺失：

| 类型                                          | 含义                     | 是否让门禁变红                                                               |
| --------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| 真实缺失（`required` 字段没有 approved 事实） | 契约要求必须有，确实没有 | ✅ 会                                                                        |
| 官方未公布（`not_announced`）                 | 官方还没发布             | ❌ 不会（`announcedOnly` 不计入 `blockingMissing`，见 `public-view.ts:174`） |
| 条件字段（`conditional` 且维度未命中）        | 该维度本年度不存在       | ❌ 不会（整条跳过）                                                          |
| 考试后字段（`post_event`）                    | 统计类，考完才有         | ❌ 不会（开头跳过）                                                          |

`docs/data-gate-semantics.md` 自己写得很清楚：「`conditional` 且 `scoped.length === 0` 时整条跳过 ⇒ 维度没打上就不检查 ⇒ gaps=0（**这不是字段齐备**）」；并明确「**按 `candidate_facts` 计数会偏大，门禁永远比对不过**」——计数必须走 `facts → current_revision_id → fact_revisions → candidate_facts → snapshots → sources`，且三处 `status='approved'`、`synthetic=false`。

### 3.6 `verify:all` 的 6 项校验（`scripts/verify-all.mjs` 42 行 + `verify-lib.mjs`）

1. **DB 计数**（`:224-230`, `:292-297`）：`pending_official`（`candidate_facts.status='pending_review' AND synthetic=false`）必须 `=== 0`；`approved_official >= expectedFacts`（来自 `config/release-gate-baseline.json`：takken 16 / gyoseishoshi 15 / it-passport 10 / fundamental-it-engineer 28 / bookkeeping 863 / fp 75）。
2. **provenance 投影重算**（`:231-284`）：8 条件重算 `verified`/`fixture`/`incomplete`，与 API 输出比对。
3. **coverage 缺口**（`:305-318`）：全 fixture 时过滤 `source_url`/`official_verified_at` 缺口（`:302-314`）。
4. **API 契约**（`:323-334`）：`status === expectedStatus`、`facts.length >= expectedFacts`、每条 `approved && !synthetic`。
5. **Web 五页**（`:337-355`）：overview 必须可索引且含状态标签；section 若 noindex 必须含 `公開できる公式情報はありません`；且含 `pageContains` + marker。
6. **bookkeeping `?year=` 专项**（`:360-401`）：断言含「受験者数・合格者数・合格率の年次推移」、含 `aria-current="page">${probeYear}年`、**必须含 noindex meta**（`:380-383`）；再抓 `/sitemap.xml` 用 `evaluateSitemapRoutes`（`:147-168`）断言无 `?year=` 且 indexable↔listed 等价。

`createRuntime`（`:170-200`）用 `VERIFY_API_PORT ?? 4191` / `VERIFY_WEB_PORT ?? 3091` spawn `dist/services/api/src/server.js` 与 `dist/apps/web/src/server.js`。

### 3.7 本次未能执行的校验

`verify:all` 需要真实 `DATABASE_URL` + 构建产物 + 起进程。本机 `.env` 的 `DATABASE_URL=postgresql://postgres@127.0.0.1:55432/qualification_media`，**端口 55432 未监听**；容器 `jpqm-pg18`（postgres:18-alpine）状态 `Exited (255)` 20 小时以上。

因此**本次未执行**：`pnpm verify:all`、`pnpm verify:e2e`、`pnpm smoke:docker`、任何需要连库的脚本。**这三个是本次审计最重要的未验证项**（详见 §7.2）。

### 3.8 本机能执行并通过的部分

| 命令                                 | 结果                                          |
| ------------------------------------ | --------------------------------------------- |
| `corepack pnpm run typecheck`        | 通过（5.4s）                                  |
| `corepack pnpm test`                 | **17 files / 189 tests 全部 passed**（3.00s） |
| `corepack pnpm test:python`          | **237 passed**（14.09s）                      |
| `corepack pnpm run format:check`     | 通过                                          |
| `corepack pnpm run build`            | 通过                                          |
| `corepack pnpm run test:verify-gate` | **40 tests / 40 pass / 0 fail**（2.41s）      |
| `corepack pnpm run lint`             | **失败 2 errors** —— 见下                     |

**lint 失败的根因是本地环境污染，不是仓库缺陷**：

```
E:\自建程序\jp_qualification_media\Python\pythoncore-3.15-64.0.deleteme\Lib\profiling\sampling\_flamegraph_assets\flamegraph.js
  1:24  error  Parsing error: Unexpected token {
（同上，64.1.deleteme）
```

`Python/` 只被 `.git/info/exclude:8`（**本地**忽略）排除，而 `eslint.config.mjs` 的 `ignores` 只有 `dist/**`、`node_modules/**`、`.pytest-tmp-*/**`、`.pytest-basetemp/**`、`.test-tmp/**`、`var/**`、`services/**/pytest-cache-files-*/**`，**不含 `Python/`**。CI 上没有这个目录，所以 CI lint 是绿的。加 `--ignore-pattern "Python/**"` 后本地 lint 通过。

> 建议（不在本次范围）：把 `Python/` 加进 `.git/info/exclude` 之外的处理，或在本地产物目录上做 eslint ignore。**这属于本地环境治理，不是 Sprint 内容。**

---

## 4. 第四步：SEO 与内容索引

### 4.1 `robots.txt` / `sitemap.xml`

- `/robots.txt` 内容仅三行：`User-agent: *` / `Allow: /` / `Sitemap: https://shikakucheck.com/sitemap.xml`。**无 `Host`、无任何 `Disallow`**。
- `/sitemap.xml` 3787 B，**52 条 `<loc>`、无重复**。**全部没有 `<lastmod>`、`<changefreq>`、`<priority>`（各 0 处）** —— 只有裸 `loc`，搜索引擎无法据 sitemap 判断页面更新。
- 52 条构成：7 个稳定入口（`/`、`/shikaku/`、`/schedule/`、`/compare/`、`/pass-rate/`、`/updates/`、`/guide/`）+ 3 个比较专题 + 4 个指南 + 9 个 about + 六资格块。
- **takken 只有 4 条**（`/shikaku/takken/`、`/2026/`、`/application/`、`/exam-content/`，**没有 `/shikaku/takken/pass-rate/`**），其余五资格各 5 条。原因：takken 的 pass-rate 页当前无 approved 事实 → 空态 + noindex → `sitemapQualificationPaths` 依 `content.sections` 剔除（`apps/web/src/sitemap.ts:15-30`，注释写明「A section without approved facts renders an empty state with noindex, so it must not be advertised in the sitemap either.」）。**这个逻辑是正确的。**

### 4.2 noindex 与 canonical（生产实测矩阵）

| 页面                                             | robots meta      | canonical                 |
| ------------------------------------------------ | ---------------- | ------------------------- |
| `/`                                              | 无               | 自指                      |
| `/shikaku/`                                      | 无               | 自指                      |
| `/shikaku/?q=FP`                                 | `noindex,follow` | → `/shikaku/`             |
| `/shikaku/takken/`                               | 无               | 自指                      |
| `/shikaku/takken/2026/`                          | 无               | 自指                      |
| `/shikaku/takken/2025/`、`/2027/`、`/2030/`      | `noindex,follow` | **自指**（不是指回 2026） |
| `/shikaku/takken/pass-rate/`                     | `noindex,follow` | 自指                      |
| `/shikaku/fp/pass-rate/`                         | 无               | 自指                      |
| `/schedule/`（无参数）                           | 无               | 自指                      |
| `/schedule/?year=2026` 等任意筛选                | `noindex,follow` | → `/schedule/`            |
| `/compare/`                                      | 无               | 自指                      |
| `/compare/?qualifications=takken,fp,bookkeeping` | `noindex,follow` | → `/compare/`             |
| `/pass-rate/`                                    | 无               | 自指                      |
| **`/pass-rate/?sort=pass_rate&order=desc`**      | **无**           | → `/pass-rate/`           |
| `/updates/`                                      | 无               | 自指                      |
| `/updates/?page=999`、`?qualification=takken`    | `noindex,follow` | → `/updates/`             |
| `/guide/`、`/about/*/`                           | 无               | 自指                      |
| 404 / 502                                        | `noindex,follow` | **无 canonical**          |

**两个不一致点**：

1. **排序参数页可索引**：`/pass-rate/?sort=…&order=…` 返回 200、**无 noindex**，而站内其它所有筛选参数（schedule/updates/compare/search）都是 `noindex,follow`。且 `server.ts:279-298` 的 `sort`/`order` **直接从 `searchParams` 取，未做白名单校验**（不在白名单的值会被原样传下去）。这既是不一致，也是潜在的参数污染入口。
2. **历史/未来年度页 canonical 自指**：`/shikaku/takken/2025|2027|2030/` 是 200 + `noindex,follow` + **self-canonical** 的空壳页。noindex 能挡住索引，但用户与爬虫仍能拿到 200 的空页面；更干净的做法是 301 到 `/shikaku/takken/2026/` 或直接 404。

**canonical 生成机制**（`layout.ts:33-43` `canonicalHref(path)`）：只拼 path，**天然剔除 query**，因此所有带参变体都收敛到无参主路径。这是正确设计。

### 4.3 搜索参数、年度参数、筛选参数

- 搜索：`?q=` → noindex + canonical 回主路径 ✅
- 年度：`/shikaku/{slug}/2026/` 走**路径**而非参数，只有「该年有 ≥1 条 fact」才可索引（`render.ts:1432` `sectionEmpty` → `:1561` noindex）；`?year=` 只用于 pass-rate 段，且**一律 noindex** ✅
- 筛选：schedule/updates/compare 全部 noindex + canonical 回主路径 ✅
- **排序：唯一漏网** ❌

### 4.4 结构化数据、标题、description

20 个生产页实测：

- **H1 恒为 1**（全部页面）✅
- title 长度 11–37 字（404 是 11，其余 26–37）；description 42–61 字（404 为 0/EMPTY）
- og 标签 7–9 个、twitter 标签 3–4 个
- **52 条 sitemap 逐条抓取：`non200=0 noindex=0 canonical_mismatch=0 no_ld=0`** —— 索引面本身是干净的
- **所有 noindex 页 `LD: (none)`**（`layout.ts:258-260` 的门禁生效）
- `robots` meta **只在 noindex 时输出**（`layout.ts:251-253`），可索引页**没有** `index,follow`（不是错误，但显式声明更稳）
- **`og:type` 除首页外全是 `article`**（`layout.ts:72`），包括列表页、工具页、404；且全站没有 `article:published_time`。对「目录页/工具页」用 `article` 语义不准确。
- **title 没有模板函数**：`renderPublicDocument` 只把 `input.title` 原样插入（`layout.ts:272`），各页硬编码（资格页三分支在 `render.ts:1526-1531`，编辑页在 `render.ts:2159`）。这意味着**新增页面容易漏 title**，也没有统一长度约束。

### 4.5 指南/比较专题是否与资格详情页重复

用去标签正文做 n-gram 相似度实测（`var/audit-2026-11-24/sim-result.txt`）：

| 对比                                               | lenA |  lenB |    Jaccard | containment | 最长连续相同 |
| -------------------------------------------------- | ---: | ----: | ---------: | ----------: | -----------: |
| `/shikaku/takken/pass-rate/` vs `/pass-rate/`      |  675 |   357 |      0.23% |       0.74% |         6 字 |
| `/shikaku/fp/pass-rate/` vs `/pass-rate/`          | 2697 |   357 |      0.13% |       0.74% |         6 字 |
| **`/shikaku/takken/` vs `/shikaku/takken/2026/`**  | 4703 |  2306 | **57.05%** |  **90.61%** |   **974 字** |
| `/shikaku/takken/2025/` vs `/shikaku/takken/2026/` |  599 |  2306 |     38.91% |      84.35% |       376 字 |
| `/compare/` vs `/compare/?qualifications=…`        |  276 | 12509 |      6.28% |      61.67% |       104 字 |
| `/compare/` vs 比较指南页                          |  276 |   408 |      1.32% |       3.52% |         7 字 |
| guide 页 vs 资格 pass-rate                         |  318 |   675 |      3.78% |      10.96% |        13 字 |
| guide 页 vs 资格概要                               |  318 |  4703 |      0.38% |       2.40% |         7 字 |

参考基线（同模板不同资格的天然相似度）：宅建 vs 簿记 17.91%/46.73%；宅建合格率 vs 行政書士合格率 44.97%/80.89%。

**结论**：

- **指南页与比较专题页不与资格详情页重复**（<4%），这部分内容策略是成立的；
- **唯一高危重复是「资格概要页 vs 该资格年度页」**：Jaccard 57%、containment 90.6%、**974 字连续相同**。这是模板结构相同 + 概要页已包含当年关键事实导致的；
- `/pass-rate/` 与各资格 pass-rate 页不重复（<1%）。

**`?year=` 变体的重复度**（本地已存 HTML 比对，未再发请求）：`/shikaku/bookkeeping/pass-rate/` 与 `?year=2026` 的**正文 n-gram 完全相同（100.00%）**，差异只在 meta 与年份导航；与 `?year=2025` 为 89.18%。**已正确 noindex，不会造成重复索引风险**，但从「同一内容两个 URL」的角度看，主页面与 `?year=2026` 完全等价这一点值得在 Phase 3 考虑收敛（例如默认年份直接渲染为主页面）。

### 4.6 薄内容与低信息量页面

| 页面                               | 正文字数 | 历史表格数 | 是否在 sitemap     |
| ---------------------------------- | -------: | ---------: | ------------------ |
| `/shikaku/it-passport/pass-rate/`  |     1046 |          0 | **是**             |
| `/shikaku/gyoseishoshi/pass-rate/` |     1147 |          0 | **是**             |
| `/shikaku/fp/pass-rate/`           |     2697 |          0 | **是**             |
| `/shikaku/takken/pass-rate/`       |      675 |          0 | 否（空态，已剔除） |

前三个页面在 sitemap 里、可索引，但**没有任何历史统计表格**，只有合格基准/方式类字段，且三者互相相似度 44.97%/80.89%。这不是「必须删除」，但属于 V2 里说的「被索引但信息量偏低」的候选，处理方向应是**补数据**而不是删页。

### 4.7 内部链接结构

抓 sitemap 52 条 + `/`，**crawled=52、errors=0、孤儿页 0、从 `/` 两跳内全部可达**。

入链数（升序）：

- **3 个比较专题各 1 条入链**；**4 个指南页各 1 条**（`how-to-read-pass-rates` 为 2）
- `/shikaku/takken/application/` 与 `/shikaku/takken/exam-content/` 各 **3**（其余五资格同类页各 4）
- `/shikaku/{slug}/2026/` 4–7；`/shikaku/{slug}/` 7–8
- **`/`、9 个 about、`/compare/`、`/guide/`、`/pass-rate/`、`/schedule/`、`/shikaku/` 全部 51 条入链**（页脚全站链接）

**结论**：页脚把 14 个枢纽页拉到各 51 入链，形成**极其扁平**的结构；而真正有独特内容的**专题页只有 1–2 条入链**。这是「内链分配」的具体可改点，且不需要新增页面（符合 V2「不新建系统」约束）。

### 4.8 其他索引面缺口

- **无 `/about/` 索引页**（直接 404）—— 9 个政策页只能靠页脚进入
- **无站内搜索结果页**（`?q=` 只在 `/shikaku/` 内，且 noindex）
- **无 feed**（404）
- `/updates/` 分页的 `rel=next` 指向 noindex 的 `?page=2`（分页被 noindex 后，`rel=next` 链路的语义价值下降）
- `/pass-rate/` 表格里每一行都指向 `?year=` 变体（noindex）—— 用户从可索引页跳到不可索引页，是可用性问题而非 SEO 问题
- **9 组无尾斜杠变体返回 200 且 body 与带斜杠版本完全相同（无 301 归一）**：`/shikaku`、`/shikaku/takken`、`/shikaku/takken/2026`、`/schedule`、`/compare`、`/pass-rate`、`/updates`、`/guide`、`/about/privacy`。每个页面因此有两个可访问 URL，canonical 会收敛，但**多一次 200 而不是 301** 是浪费抓取预算的。

---

## 5. 第五步：UI 与交互

### 5.1 方法

用 Python Playwright 1.59.0 + 本机 Chrome headless，对 **8 个页面 × 4 个视口（1440 / 900 / 390 / 360）** 真实渲染并截图，共 **64 张 PNG**（每页每视口一张首屏 + 一张全页），存放于 `var/audit-2026-11-24/shots/`；同时采集 `h1Count`、`minFontPx`、横向溢出、可点击元素尺寸、Cookie 横幅高度与遮挡比例、`pageerrors`。

**视觉验收已真实完成，不是推断。** 审计的 8 个页面：首页、`/shikaku/`、`/shikaku/takken/`、`/schedule/`、`/compare/`、`/updates/`、`/pass-rate/`、`/guide/`（覆盖了任务要求的「首页、目录、一个资格详情、日程、比较、更新」六类）。

### 5.2 通过项

- 全部页面 HTTP 200；**H1 恒为 1**；`pageerrors` 全为 0（无 JS 运行时错误）。
- **横向溢出 = 0**（`documentElement.scrollWidth - innerWidth` 在所有 32 个组合下均为 0）。
- **最小字号 12px**（所有视口一致，无 <12px 正文）。
- 移动端底部导航存在（探索/日程/比较/指南/菜单 5 项）。
- 首页 hero、宅建详情页的「公式確認済み」徽章 + 官方确认时间、要点摘要 3 卡（试验日/申込締切/受験料，各带「カレンダーに追加」）、比较页复选框卡片、更新页按变更类型折叠分组，视觉层级清晰、无破版。

### 5.3 问题项

1. **点击目标高度普遍 18px（< WCAG 2.2 AA 24×24）**
   实测样本：「公式ソース」70×18、「公式サイトで確認（新しいタブ）」210×18、「ホーム」42×18、「資格を探す」70×18、Cookie 设置按钮 74×18、表头排序链接「資格↑」39×18、「年度↕」39×19、「合格率↕」53×19；比较页 6 个 `input[type=checkbox]` 18×18。
   影响：触屏与运动障碍用户误点率高；这是**可访问性硬指标**，不是审美问题。

2. **移动端 Cookie 横幅遮挡首屏约四分之一**
   高度：1440 → 81px（占视口 9%）；900 → 104px（12%）；390 → 208px（**25%**）；360 → 208px（**26%**）。移动端固定在底部导航之上。
   影响：首屏可用高度被压缩，且横幅必须用户操作才消失（合规上正确，交互上可优化）。

3. **360px 下 `/shikaku/takken/` 的子导航需横向滑动**
   `.subnav` 是 `overflow-x:auto` 容器，`scrollWidth 390 > clientWidth 360` → 「合格率」标签初始不可见。
   **注意：这不是布局溢出**（整页 overflow=0），而是**可发现性问题**——用户可能不知道右侧还有内容。

4. **页面高度偏长**（移动端全页 scrollHeight）：首页 7185、宅建 8938、日程 8996。

### 5.4 设计系统一致性（`docs/design-system.md` vs 代码）

**一致的**：24 个 `--color-*` 值逐一相同；间距 4→80；圆角 8/12/16/999；容器 1200 / 正文 720；header 72 / subnav 52 / mobile 64；动效 120/180/240；badge `min-height: 26px`；fact-value `clamp(22px,2vw,28px)`；品牌标记 40/34px；搜索框 52px；`.field input{min-height:44px}`；九条常用文案。

**文档有、代码无**：

- **字号表**：文档写「首页 44/34、H1 36/30、H2 28/24、H3 21/19」，代码实际是 `packages/ui/src/index.ts:179-181` h1 **32px** / h2 **24px** / h3 **18px**、移动 26/24/18、`.home-hero h1` 40px（移动 28px）→ **44/36/28/21 全部未实现**
- **`1280px` 断点全仓 0 命中**（实际只有 1024 / 1023 / 767）
- **6 个交互组件文档有代码无**：`dropdown`、`tooltip`、`toast`、`skeleton`、`drawer` 各 0 命中；`.modal` 只有 CSS 没有 render 函数
- `filter-chip` 无选中态、无移除 ×
- 图层顺序未 token 化

**代码有、文档无**：

- `--color-border-control: #808A99`（代码 25 色 vs 文档 24 色）
- 7 类 token 名在文档里 0 命中
- 以下组件样式未登记：`.cookie-banner`、`.unofficial-notice` / `.footer-note--unofficial`、`.trust-panel`(13 处)、`.detail-kpi`(16)、`.home-timeline`(14)、`.pass-rate-table`(28)、`.history-table`(19)、`.mobile-menu-panel` / `-backdrop`(4)、`.filter-chips`(10)、`.schedule-filter` 四列栅格

**`docs/ui-redesign-plan-2026-09.md:34-36` 三项「未完成」其实已完成**：`:34` 视觉验收 → `scripts/visual_smoke.py` 已在 `main`；`:35` 真实更新列表与首页近期事件 → `render.ts:2571` `renderHomePage(calendarEvents, updates, factsBySlug)` + `home-timeline` 14 处；`:36` 完整月历/统计专题/政策页 → `schedule-month` 6 处、`pass-rate-table` 28 处、`history-table` 19 处、政策页七页齐全。属**未回填**。

### 5.5 CSS 维护风险

`apps/web/src/assets.ts:1-13`：

```ts
export const siteCss = `${uiStyles}${webStyles}`;
export const siteCssHash = createHash('sha256')
  .update(siteCss)
  .digest('hex')
  .slice(0, 12);
export const siteCssPath = `/assets/site.${siteCssHash}.css`;
export const criticalCss = `${uiTokens}${String.raw`…`}`;
```

`criticalCss` 的注释明确写着「修改 uiStyles / webStyles 中的基础规则时需要同步这里的对应声明」→ **同一个视觉规则有两个维护点**（`packages/ui/src/index.ts` 的 `uiStyles` 与 `apps/web/src/assets.ts` 的手写关键 CSS）。改字号/间距时漏改一处会导致首屏闪烁或样式不一致。

---

## 6. 第六步：分析与生产文档一致性

### 6.1 生产运行状态（只用只读证据）

- **反代与端口链**：`deploy/caddy/Caddyfile` 只 `reverse_proxy web:3000`；`deploy/docker-compose.prod.yml` 中只有 `caddy` 暴露 80/443，`api`(4100) 与 `web`(3000) 无 ports → **API 与 DB 均不对外**。唯一对外间接面是 `/ics/*.ics`（字节透传）。
- **安全响应头**：HSTS（`max-age=31536000; includeSubDomains`）、`X-Content-Type-Options: nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy: strict-origin-when-cross-origin`、`Permissions-Policy: camera=(), microphone=(), geolocation=()` 五项齐全；**`Content-Security-Policy` 全仓 0 命中**（唯一缺项）。
- **缓存**：**HTML / XML / ICS 全部没有 `Cache-Control`、没有 `ETag`、没有 `Last-Modified`**。CSS `public, max-age=31536000, immutable`；图片 `public, max-age=604800`。API 侧 `services/api/src/*.ts` grep `cache|memo` = **0 命中** → 每个页面请求都全量查库。
- **压缩**：Caddy `encode gzip` 生效（声明 `Accept-Encoding: gzip` 时返回 gzip）；**Brotli 未启用**（声明 `br` 时返回 identity）。
- **TLS**：ALPN 协商 **h2**、TLSv1.3、`TLS_AES_128_GCM_SHA256`；证书 `CN=shikakucheck.com`、issuer `Let's Encrypt / YE2`、**`notAfter = Feb 11 11:50:58 2027 GMT`（约 79 天后到期）**；TLS 1.0/1.1 被拒，1.2/1.3 接受。
- **DNS**：A `47.79.87.163`（阿里云日本区，与「东京 VPS」一致）；**无 AAAA（IPv6 未启用）**；NS 为 Cloudflare；MX 走 Cloudflare Email Routing；TXT `v=spf1 include:_spf.mx.cloudflare.net ~all`。
- **GA4**：`G-G9SN61J5LS`（旧 `G-LV4250LZNY` 0 次）；`data-cookie-banner` ×2、`data-cookie-settings` ×2；同意前不加载 Google 脚本（`layout.ts:59-64` 的 `analyticsSnippet` 逻辑）。

### 6.2 性能口径（**必须按两种口径分开表述**）

**口径 A：未声明 `Accept-Encoding`（curl 默认）**

- `/` 2.09 / 3.19 / 1.85 s；`/shikaku/takken/` 3.62 / 2.22 / 3.05 s；`/shikaku/bookkeeping/` 4.19 / 2.50 / 2.90 s；`/compare/?qualifications=takken,fp,bookkeeping` **16.93 s**；`/guide/` 7.04 s。
- `/shikaku/fp/` 5 次：6.38 / 10.43 / 10.56 / 8.72 / 9.36 s。
- 30 次 `/robots.txt`：ok=29 / fail=1（3.3%）；20 次 `/`：ok=19 / fail=1（5%），其中两次虽 200 但卡满 15 s；另有 1 次 45 s 超时。
- **决定性对照**：同一 `/shikaku/bookkeeping/pass-rate/` 页用 `identity` 编码请求 2 次 → **36.97 s 与 60.01 s**（后者被 max-time 截断，只收到 430074 / 518538 字节）。

**口径 B：声明 `Accept-Encoding: gzip`（浏览器等价）**

- `/` 25 次：**ok=25 / fail=0 / slow>5s=0**（0.99–2.24 s）。
- `/shikaku/fp/` 20 次：**ok=20 / fail=0**（0.32–0.73 s）。
- 11 个页面各 3 次：全部 ok、无超时（`/shikaku/bookkeeping/pass-rate/` gzip 后 1.2–3.0 s、下行 23337 B）。

**结论（重要，避免误判）**：

> 服务端渲染与可用性**没有异常证据**。此前观察到的 5–17 s 与 3.3%/5% 失败率，**全部来自「未压缩的 145 KB–518 KB HTML 在低带宽链路上传输」这一口径**（curl 默认不发 `Accept-Encoding`，Caddy 因此不做 gzip）。
> **真正的三个问题是**：① HTML 无 `Cache-Control`/`ETag`（每次都全量重传）；② 未启用 Brotli；③ 单页体积过大（`/shikaku/bookkeeping/pass-rate/` **518538 B**、`/shikaku/bookkeeping/` 143663 B、`/shikaku/fp/` 145402 B）。

**页面体积构成**（解释 143 KB 的簿记页）：`h2=17 / h3=82 / table=0 / tr=0 / li=37 / a=190` —— 体量来自 **82 个 h3 事实条目**，不是表格。`/shikaku/bookkeeping/pass-rate/` 则是 `5 table / 94 tr / 31 h3`。

### 6.3 `docs/runbook.md`（397 行）——**分叉（严重）**

自相矛盾的三处硬证据：

- `:3`「本项目**仅支持本地开发**。不得配置生产数据库、生产对象存储、AdSense 或真实凭据。」
- `:277` 起整章「生产部署（VPS）」；`:377`「**现态＝生产已启用（2026-11-15，PR #103 部署后）**：服务器 `deploy/.env` 已填 `GA_MEASUREMENT_ID=G-G9SN61J5LS`…」
- `:1` 标题仍是「阶段 0/1 运行说明」；`:19`「数据侧当前状态为 **176 条**已批准正式事实」vs 实际 1007；`:21`「仍不在范围内：**生产发布与生产数据库/对象存储**」

**与实现一致的部分（全部 ✅）**：端口链 `caddy(80/443)→web(3000)→api(4100)→db(5432)`；`WEB_HOST`/`API_HOST` 默认 `127.0.0.1`；生产 db `postgres:18-alpine` 而 CI 用 PG16；卷挂载 `/var/lib/postgresql`；生产迁移命令 `docker compose -f deploy/docker-compose.prod.yml run --rm api node dist/packages/db/src/migrate.js`；迁移 30 条末条 `0029`；`db:provision-api-role` 需 `-e API_DB_PASSWORD=`；GA4 为空时不加载脚本。

**真实不一致**：前半用 `pnpm`、后半（`:98`/`:106`/`:126`/`:217`/`:241`/`:270`/`:357`）改用 `npm`，命令口径混用（非致命，但照文档执行会失败或产生两套 lockfile 语义）。

### 6.4 `docs/compliance-audit-2026-11-13.md`（111 行）——**已过期（主体已整改）**

| 审计项              | 当时结论 | 当前状态      | 证据                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------- | -------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| H1 官方名义误认     | 需整改   | **已整改**    | `editorial.ts:7-8` `unofficialNotice`；`layout.ts:161` 页眉「非公式」徽章；`render.ts:2654` 首页「非公式サイトです。」。站名已改 `シカクチェック`，但描述性短语「資格試験の公式情報」仍留在 `editorial.ts:162`/`:460`、`render.ts:2209`                                                                                                                                                                    |
| H2 10 条显示异常    | 需整改   | **已整改**    | 新增 `apps/web/src/format.ts`（169 行）：`methodLabels={paper:'紙筆方式',cbt:'CBT方式',net:'ネット方式'}`、`fee→toLocaleString('ja-JP')+'円'`、`time→'分'`、`question_count→'問'`、`answer_count→'解答'`、`looksTruncated=/[^0-9]\d$/`；测试 `tests/web-format.test.ts:4` describe「formatFactDisplayValue (H2 display fix)」、`tests/web-render.test.ts:2046` 断言 `'8,200円'`、`:2053` 断言 `'紙筆方式'` |
| M1 联系渠道         | 需整改   | **已整改**    | `editorial.ts:316` `contactEmail='contact@shikakucheck.com'`；四页 mailto `:407-408`/`:475-476`/`:564-565`/`:748-749`；GitHub Issues 保留为公开订正 `:312`/`:438`/`:768`                                                                                                                                                                                                                                   |
| M2 GA4/Cookie       | 需整改   | **机制已建**  | `layout.ts:53-57` `G-` 校验、`:59-64` `analyticsSnippet()`、`:66-68` `renderCookieBanner()`、`:179` footer `data-cookie-settings`、`:263` 无 ID 则连横幅都不渲染；隐私页 `editorial.ts:513`/`:518`/`:534`/`:539-541`                                                                                                                                                                                       |
| L1 六项安全响应头   | 缺       | **已补 5 项** | 仅 `Content-Security-Policy` 全仓 0 命中                                                                                                                                                                                                                                                                                                                                                                   |
| L2 运营者信息最小化 | 可接受   | 仍成立        | —                                                                                                                                                                                                                                                                                                                                                                                                          |

**仍失效的具体句子**：

- `:67` 现状句「GA/广告/联盟均未启用、`GA_MEASUREMENT_ID` 为空」**已不成立**（生产已启用 `G-G9SN61J5LS`）
- 广告段 `editorial.ts:547-548`/`:667` 仍写「利用する場合があります」（尚未启用广告，属预防性表述，但与 `:67` 的「均未启用」口径需统一）

**另一个显示层遗留**：`render.ts:171` 仍保留历史标签 `paper: '筆記試験'`，与 `format.ts` 的 `'紙筆方式'` 并存 → **同一枚举两套日文标签**。

### 6.5 `docs/next-round-ticket.md`（74 行）与 `docs/transition-handoff.md`（205 行）——**指针落后**

- 两者都停在 `dc4e0ec`（#109），实际 `origin/main` = `01b86dd`（#111）→ **落后 2 个提交**。
- `next-round-ticket.md:10`「main＝origin/main＝`dc4e0ec`…已部署东京 `/opt/jpqm` `f3a6492`→`dc4e0ec`…heads 6」；`:13` 工作树 detached `70740d9`、local main `f3a6492` behind 1。
- `transition-handoff.md:3` 更新注记同样停在 #109；`:1`/`:5`/`:7` 正文仍是「2026-11-10 时点、facts 982、sources 45、candidate_facts 994、main `16ce98a`（PR #68）」→ **落后 43+ 个提交**。
- **正文中已被推翻的条目**：`:106`「全仓既无 PDF 也无 xlsx 解析能力」已被 `services/collector/src/collector/fe_statistics_xlsx.py` + `services/collector/pyproject.toml:8` 的 `openpyxl>=3.1`/`pypdf>=5.0` 推翻；`:111`「176 条已改成 982」现为 1007。
- **仍然成立的条目**：`:105`「宅建统计页只能抓不能入库」（`services/collector/src/collector/capture_takken.py:33` 注释：`still pins every Takken snapshot to the single TAKKEN_SOURCE ingestion id.`）。
- **唯一真正未做的待办**：`next-round-ticket.md:33`「待办 1 FE 统计月度附件刷新（`202610` 预期 2026-12 上中旬）」。

### 6.6 `docs/data-gate-semantics.md`（155 行）

三条核心语义与实现**逐条一致**（`coverageGaps` 跳过三档 + `conditional` 空 `scoped` 跳过；`verified`/`partially_announced` 语义；CI 夹具全 `ci://` 故为 `partially_announced`，见 `verify-lib.mjs:302-321` 的 `fixtureProvenance` 过滤）。

**陈旧项**：`:26-29` 旧 gaps 数字（0/10）只加注未删；`:116` 引用 `verify-lib.mjs:215`，实际已漂移到 `:292-295`；`:140`/`:142` 的 1007 / 30 迁移 / sources 52 / snapshots 80 **仍然准确**（是全库最准的读数段）。

### 6.7 `docs/stage-log.md` 与 `docs/handover-p1-ops-findings.md`

- `stage-log.md` 342926 B / 917 行 / **86 个 `##` 段**，倒序流水账，最新一条 `:3` 停在 #109。
- `handover-p1-ops-findings.md` 33074 B / 109 行，2026-11-11 的三条运营发现专题档案，`:3` 写 `main = 1933fd3`，A/B/C 三项均已闭合。

→ **两者都不适合当「当前状态入口」**，只能当历史档案。当前状态入口应该是 `README.md`，但见 §6.8。

### 6.8 `README.md` —— **入口页自相矛盾**

- `:3`「…阶段 3 的技术 SEO 基线均已完成。**当前不连接生产服务**、不生成未审核动态事实。」→ **与生产已上线矛盾**（这是最需要优先修的一句）
- `:5`「1007 条已批准正式事实（宅建 16／行政書士 15／IT Passport 10／基本情報技術者 28／簿記 863／FP 75；release baseline 与 CI 夹具已同批刷新为 1007 facts／37 snapshots＝三方一致…）；覆盖缺口 0，`pnpm verify:all` 六资格全通过…其余资格的合格率等字段仍无已批准事实」→ 读数正确
- `:21` 把 `pnpm dev:web` 描述为「**IT Passport 公开页**」→ 旧表述（现在是六资格站点）
- `:64` 巨长交接串仍含「facts 982／facts 999／vitest 15／139」「开发库已于 2026-10-23 后丢失，本机现存库＝Docker `jpqm-pg18`」「main `f46c943`」等旧读数 → 与 `:5` 的 1007 并存，**同一文件里两套数字**

**链接健康度**：`README.md` 内 20 个 `docs/*.md` 相对链接**全部 Test-Path True，零死链**；`runbook.md` 内 3 个链接同样零死链。**但链接健康 ≠ 内容健康**。

### 6.9 ADR 现状

`docs/adr/` 只有 1 篇 `0001-stage-0-foundation.md`（727 B，8 行），内容是技术栈/时间口径/版本不可原地覆盖/权限边界/阶段 0 不连生产。**全仓没有任何 SEO/noindex/索引策略 ADR**。

→ 因此以下决策**没有书面依据**：`/pass-rate/` 空表是否应可索引、无筛选 `/schedule/` 空态是否应可索引、`/pass-rate/?sort=` 为何不 noindex、年度页空壳为何返回 200 而非 301/404。

---

## 7. 未验证事项与所需证据

### 7.1 本次已充分验证（可直接作为决策依据）

- 仓库状态（分支/HEAD/工作区/PR/CI/作者数）
- 生产可达性、响应头、TLS/DNS、sitemap 52 条逐条抓取、20 个页面的 head 度量、noindex/canonical/ld+json 矩阵
- 6 个资格 × 4 视口的真实渲染与截图（64 张 PNG）
- 1007 条 approved facts 的逐资格分布（从 CI 夹具解析）
- 29 条 coverage requirement 的构成与门禁语义（代码逐行核对）
- 文档与代码的一致性（runbook / compliance-audit / next-round-ticket / transition-handoff / design-system / data-gate-semantics / README）
- 本机可执行的测试：typecheck / vitest 189 / pytest 237 / format / build / verify-gate 40

### 7.2 本次未验证（按重要性排序）

| #   | 未验证项                                                                          | 原因                                                | 需要什么才能验证                                                                                |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1   | `pnpm verify:all` 当前是否真的 passed（6 资格 6 项校验）                          | 本地 DB 不可用（55432 未监听、容器 Exited）         | 可用的 `DATABASE_URL` + 已构建 `dist/`；或让 CI 跑一次并给出日志                                |
| 2   | 生产库的真实计数（facts / candidate_facts / sources / snapshots / change_events） | 生产 DB 不对外、无只读通道                          | 运维在服务器上跑只读 SQL（见 `PRODUCTION_BASELINE_2026-11-24.md` §4）                           |
| 3   | 生产部署的确切 commit SHA                                                         | 镜像无版本注入、无 `/version` 端点                  | 运维执行 `docker compose -f deploy/docker-compose.prod.yml images` / 看 `/opt/jpqm` 的 git HEAD |
| 4   | GSC / Bing Webmaster / GA4 的真实流量与索引数据                                   | 无账户访问、`var/` 下无任何导出                     | 用户提供导出或授权（见 `PRODUCTION_BASELINE_2026-11-24.md` §3）                                 |
| 5   | `apps/admin` 的部署方式（是否在生产运行）                                         | compose 里没有 admin 服务，也没有别的部署配置引用它 | 运维确认服务器上是否有 admin 进程/容器                                                          |
| 6   | `event_type` 历史脏数据情况                                                       | 需查库                                              | 同上 #2                                                                                         |
| 7   | 真实用户行为（点击、停留、跳出）                                                  | 无分析数据                                          | 同上 #4                                                                                         |

### 7.3 待用户/运维核实（一句话清单）

1. 生产部署到哪个 commit（`01b86dd`？还是更早/更晚）？
2. 生产库当前 `facts`/`sources`/`snapshots`/`change_events` 各多少行？
3. `apps/admin` 在生产是否有实例？
4. GSC/Bing/GA4 能否提供 2026-11-10 至 2026-11-24 的导出？

---

## 8. 本次审计的产出与边界声明

**产出**（均为新增，未改任何既有文件）：

- `docs/audit/REPOSITORY_AUDIT_2026-11-24.md`（本文件）
- `docs/audit/V2_GAP_MATRIX.md`
- `docs/audit/PRODUCTION_BASELINE_2026-11-24.md`

**证据目录**：`var/audit-2026-11-24/`（`.gitignore` 内，不进版本库），含 36 个只读探针脚本、11 个度量文本、3 份子代理 findings、30+ 份生产 HTML 抓取、64 张截图。

**边界**：本次审计**没有**修改业务代码/CSS/文案/路由/API，**没有**改 DB/迁移/baseline/CI fixture/source contract，**没有**运行写库或真实采集命令，**没有**改 `.env`/密钥/GA4 ID/GSC/Bing 配置，**没有**创建/删除/合并分支或 PR，**没有**部署或重启生产，**没有**安装新依赖，**没有**扩到 30 资格，**没有**做全站 UI 重做。

**下一步**：等待用户确认后再进入 Sprint 1（见 `V2_GAP_MATRIX.md` §5 的建议）。**本次不自行进入 Sprint 1。**
