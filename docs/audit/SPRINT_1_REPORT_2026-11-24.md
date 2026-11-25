# Sprint 1 完成报告（G-02 + G-18）

- 日期：2026-11-24
- 分支：`chore/phase1-baseline`（基于 `a319d46`）
- 状态：**代码 + 测试 + 门禁全部完成；未提交、未部署**
- 范围：仅 G-02、G-18 及其测试与 SEO 回归

---

## 0. 先说明一件事：任务文档缺失

交接说明要求先读并严格执行 `docs/audit/DEEPSEEK_HARNESS_SPRINT_1_TASK.md`。**该文件在仓库中不存在**，核验过程：

| 核验方式                                           | 结果                           |
| -------------------------------------------------- | ------------------------------ |
| `git log --all -- docs/audit/DEEPSEEK_HARNESS_*`   | 无任何提交记录                 |
| 全盘 `Get-ChildItem -Recurse -Filter "*SPRINT_1*"` | 0 命中                         |
| 全盘 `Get-ChildItem -Recurse -Filter "*DEEPSEEK*"` | 0 命中                         |
| `docs/audit/` 实际内容                             | 只有三份 Phase 0 审计 + 本报告 |
| 外部交付包 `E:\项目运营\05.shikakucheck\项目审计\` | 7 个文件，无 SPRINT_1 任务文档 |

因此本轮**按仓库内既有的书面依据执行**，两者对 G-02／G-18 的定义完全一致：

- `docs/audit/V2_GAP_MATRIX.md` §3 的 G-02（P0）、G-18（P2）条目 —— 含证据、改动文件范围、风险。
- `docs/adr/0002-index-policy.md` §2 判定表、§3.1、§5 实现约束 —— 已由号主于 2026-11-24 拍板接受。

> 如果 `DEEPSEEK_HARNESS_SPRINT_1_TASK.md` 后续补入仓库，请复核本报告的验收口径是否与其一致；本轮未做任何该文档之外的工作。

---

## 1. G-02：`/pass-rate/?sort=…` 的索引边界

### 1.1 问题

`/pass-rate/?sort=pass_rate&order=desc` 与 `?sort=year&order=asc` 均返回 **200 且无 noindex**，canonical 收敛到 `/pass-rate/`。而站内其它筛选参数（`/schedule/?year=`、`/updates/?page=`、`/compare/?qualifications=`、`/shikaku/?q=`）**全部 `noindex,follow`** —— 同一站两套口径。

代码侧两个缺陷：`apps/web/src/server.ts` 把 `sort`／`order` 从 `searchParams.get()` **原样**传给渲染层（无白名单）；`renderPassRateIndex` 没有 noindex 入参。`render.ts` 内部虽有 `passRateSortKeys.includes(...)` 兜底，但**兜底只影响排序结果、不影响索引状态**。

### 1.2 改法（最小改动）

`apps/web/src/render.ts`：

- 新增 `parsePassRateIndexQuery(params: Pick<URLSearchParams, 'get'>): PassRateIndexQuery`（`render.ts:2265`）。它把解析与白名单从路由层收进一个纯函数，便于单测：
  - `sort` 走 `passRateSortKeys` 白名单，非法值回落到 `'qualification'`；
  - `order` 只认 `'desc'`，其余一律 `'asc'`；
  - `noindex: sort !== null || order !== null` —— **只要带了任一参数就是变体**，与参数值是否合法无关（非法值同样是重复内容）。
- `PassRateIndexOptions` 增 `noindex?: boolean`（`render.ts:2250`）。
- `renderPassRateIndex` 把 `noindex: Boolean(options.noindex)` 透传给 `renderPublicDocument`（`render.ts:2383`），canonical 保持 `/pass-rate/` 不变。

`apps/web/src/server.ts`：`/pass-rate/` 路由改走 `parsePassRateIndexQuery(url.searchParams)`，传 `{ sort, order, noindex }`。

`noindex` 的 HTML 输出仍然只由 `apps/web/src/layout.ts:251-253` 一处产生，符合 ADR 0002 §5「不要在页面模板里另写 robots meta」。

### 1.3 为什么主页面必须保持可索引

`scripts/verify-lib.mjs` 的 `evaluateSitemapRoutes` 强制 **indexable ⇔ listed 双向等价**（`indexable && !listed` → `Sitemap missing the indexable … page`；`!indexable && listed` → `Sitemap lists the noindex … page`）。`/pass-rate/` 在 `stablePaths` 里，因此：

- **只对带参变体**加 noindex → 不触发断言（本轮做法）；
- 若给主页面也加 noindex（例如空表时）→ 必须同时把它移出 sitemap，属 G-06「薄页/空表 sitemap 准入」范畴，**需单独拍板**。

> 我一度加过 `|| rows.length === 0`（ADR §3.1 确实写了「空表 → noindex」），随后**主动撤回**：它会与 sitemap 等价断言冲突，且超出本轮 G-02 定义。已在 ADR §3.1 明确标注为「未实施部分（故意留下）」。

---

## 2. G-18：`/pass-rate/` 内部链接指向 noindex 年份参数页

### 2.1 问题

`/pass-rate/` 比较表是「合格率比较」的落地页，但每行数据链接都指向 `?year=` 变体（`/shikaku/bookkeeping/pass-rate/?year=2026` 等），而 `?year=` 一律 noindex —— **内链把权重导向站点自己要求搜索引擎丢弃的 URL**。

### 2.2 改法

`render.ts:2332`：行链接从 `/shikaku/{slug}/pass-rate/?year={year}` 改为 `/shikaku/{slug}/pass-rate/`（可索引的栏目页），并留注释说明理由。

**未改动**：资格详情页内部的年度导航（`yearLinkHref`，`render.ts:1348-1357`）仍指向 `?year=`。那是站内导航、不是索引出口，G-18 的定义只针对 `/pass-rate/` 索引表。年度导航的索引语义由 `render.ts:1561` 的 `noindex` 单独处理，既有测试 `marks the year-filtered pass-rate page noindex but keeps the base page indexable` 继续覆盖。

**未做**（按 G-18 条目本身「建议不做」）：`/about/` 索引页、搜索页、feed —— 均属新增路由，需先证明现有页面无法满足同一用户任务。

---

## 3. 自动化测试（优先补齐，本轮新增/修改 4 处）

| 文件                              | 改动                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/web-render.test.ts:1844`   | 既有用例改为断言 `href="/shikaku/it-passport/pass-rate/"` 且**不含** `?year=`（G-18 回归网）                                                                          |
| `tests/web-render.test.ts:1857`   | 新增 `keeps the plain pass-rate index indexable and its sorted variants noindex`（base 无 robots meta、canonical 不变；带参时含 noindex、canonical 不变、无 ld+json） |
| `tests/web-render.test.ts:1882`   | 新增 `whitelists the pass-rate sort parameters and marks any variant noindex`（5 组参数组合，含非法值 `drop_table`／`sideways`）                                      |
| `scripts/verify-lib.test.mjs:200` | 新增 2 条 `evaluateSitemapRoutes` 断言：sitemap 出现 `?sort=`／`?order=` 必须报 `Sitemap lists a parameter-filtered page`                                             |

vitest 用例数 **189 → 191**（2 个新增 `it`），node:test 门禁 **40 → 40**（新增断言在既有 test 内）。

---

## 4. 常驻门禁（SEO 回归的自动化部分）

| 门禁                             | 改动                                                                                                                                                                                                                                  |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `scripts/verify-lib.mjs:152`     | sitemap 参数变体检查从 `?year=` 单查扩到 `/\?(?:year\|sort\|order)=/`                                                                                                                                                                 |
| `scripts/verify-lib.mjs:391-425` | 新增 `/pass-rate/` 成对探针（按 `gate.slug === launchGate[0].slug` 只跑一次）：主页面须**无** noindex、canonical 指向 `/pass-rate/`、表格不含 `?year=`；`?sort=pass_rate&order=desc` 须**有** noindex、canonical 仍指向 `/pass-rate/` |
| `scripts/docker-smoke.mjs:428`   | 新增 `the pass-rate sort variants stay noindex` 冒烟；sitemap 检查补 `?sort=`                                                                                                                                                         |

探针里的 canonical 用正则 `/<link rel="canonical" href="[^"]*\/pass-rate\/">/` 而非字面量 —— `layout.ts` 的 `canonicalHref()` 在配置了 `SITE_ORIGIN` 时会前缀 origin（Docker 冒烟容器正是如此），写死字面量会假红。这一点是实跑后才发现并修正的。

---

## 5. 验证读数（本机实测，全部通过）

| 命令                                              | 结果                                                                            |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm run typecheck`                              | EXIT=0                                                                          |
| `pnpm test`                                       | **17 文件 / 191 用例通过**（改前 189）                                          |
| `pnpm run test:verify-gate`                       | **40 pass / 0 fail**，EXIT=0                                                    |
| `pnpm run build`                                  | EXIT=0                                                                          |
| `pnpm run format:check`                           | All matched files use Prettier code style!                                      |
| `pnpm exec eslint . --ignore-pattern "Python/**"` | EXIT=0                                                                          |
| `pnpm run test:python`                            | **237 passed**                                                                  |
| `DATABASE_URL=…:55432 pnpm run verify:all`        | **`"status": "passed"` / 6 passed / 0 failed**，6 格 `errors: []`               |
| `pnpm run smoke:docker`                           | **docker smoke passed**，含新增 `ok - the pass-rate sort variants stay noindex` |

`verify:all` 的 `/pass-rate/` 与 `/pass-rate/?sort=pass_rate&order=desc` 两条探针在**真实渲染的 HTML** 上跑通，六资格全部 `errors: []`。Docker 冒烟在**生产镜像 + 容器内真实 HTTP** 上跑通，说明改法在打包产物里同样成立。

> 环境注记：`.env` 的 `DATABASE_URL` 指向不存在的 `localhost:5432`，本轮显式用 `postgresql://postgres@127.0.0.1:55432/qualification_media`（容器 `jpqm-pg18` 由 `docker start` 启动）。`lint` 不加 `--ignore-pattern "Python/**"` 会因本地 `Python/pythoncore-3.15-64.0.deleteme` 报 2 errors，属本地环境噪声、与本轮改动无关。

---

## 6. 改动清单（8 文件，+197 / −10）

```
 apps/web/src/render.ts        | 36 +++++++++++++++++++++++++++-
 apps/web/src/server.ts        |  9 +++----
 docs/adr/0002-index-policy.md |  9 ++++---
 docs/audit/V2_GAP_MATRIX.md   |  2 ++
 scripts/docker-smoke.mjs      | 40 +++++++++++++++++++++++++++++++
 scripts/verify-lib.mjs        | 40 ++++++++++++++++++++++++++++++-
 scripts/verify-lib.test.mjs   | 16 +++++++++++++
 tests/web-render.test.ts      | 55 ++++++++++++++++++++++++++++++++++++++++++-
```

生产代码只有 2 个文件、+40/−5；其余是测试与门禁。**零依赖新增、零路由新增、零 UI 改动、零首页改动、零资格扩充、零数据库迁移。**

---

## 7. 文档回填

按交接说明「改完对应问题后要回填状态」：

- `docs/adr/0002-index-policy.md`：§2 判定表标注 G-02 已实现、补「主页面必须仍在 sitemap」；§3.1 补「已实施」与「未实施部分（故意留下）」；§5 新增 G-18 内链约束。
- `docs/audit/V2_GAP_MATRIX.md`：G-02 标 ✅ 已修复（含门禁与读数）、G-18 标 🟡 部分修复（前半已修，后半新增路由未做）。

---

## 8. 明确没做的事

| 项                                          | 原因                                                    |
| ------------------------------------------- | ------------------------------------------------------- |
| 生产部署                                    | 交接说明明确「不部署生产环境」                          |
| git commit / push                           | 交接说明未要求；改动全部留在工作树，待下一步指令        |
| `/pass-rate/` 空表 noindex                  | 会与 sitemap indexable⇔listed 断言冲突，属 G-06，需拍板 |
| 年度空壳页 301/404（G-03 选项 b）           | 需 URL 行为变更审批，ADR §4 已明确不做                  |
| 无尾斜杠 301（G-04）                        | 同上                                                    |
| 薄页 sitemap 准入（G-06）                   | 需产品判断（单年合格率算不算有效内容）                  |
| `/about/` 索引页、搜索页、feed（G-18 后半） | 新增路由需先证明现有页面无法满足（修订版 V2 §4）        |
| 首页与整体 UI                               | 交接说明明确不改                                        |

---

## 9. 需要下一步指令确认的三件事

1. **是否提交**：改动未 commit。若要提交，建议单笔 commit 覆盖 8 文件（代码 + 测试 + 门禁 + 文档回填），或拆成「代码+测试」与「文档回填」两笔。
2. **`DEEPSEEK_HARNESS_SPRINT_1_TASK.md` 是否应存在**：若该文档应在本仓，请补入后我按其验收清单逐条复核；若外部另有版本，请指明路径。
3. **`/pass-rate/` 空表索引状态**：ADR §3.1 写了「空表 → noindex」，但实施会牵动 sitemap 准入（G-06）。要不要在 Sprint 2 一起处理，还是维持现状（空表仍可索引）？

---

**Sprint 1 到此停止，等待下一步指令。**
