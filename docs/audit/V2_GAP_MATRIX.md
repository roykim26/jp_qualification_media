# V2 差距矩阵（Phase 0 产出，只读审计）

- 编制日期：2026-11-24
- 依据：`docs/audit/REPOSITORY_AUDIT_2026-11-24.md`（仓库与产品基线）、`docs/audit/PRODUCTION_BASELINE_2026-11-24.md`（线上可验证证据）、`E:\项目运营\05.shikakucheck\项目审计\V2_PLAN_CORRECTION.md`（修订版 V2 方案）
- 性质：**只读分析**。本文档为新增文件，未修改任何既有文档、代码、配置、数据。
- 证据目录：`var/audit-2026-11-24/`（`.gitignore` 内，不进版本库）

> **本文档不提出「新建功能」。** 修订版 V2 §4 明确：任何新增路由前必须先说明为什么现有页面无法满足同一用户任务。因此下面的差距全部落在**现有路由与现有组件**内，逐条标注改动文件范围。

---

## 0. 判读口径（先声明，避免误用）

1. **代码事实基准 ≠ 生产事实基准**。代码事实取自工作树 `70740d9`（detached，2026-11-15），它**落后 `origin/main` `01b86dd` 7 个提交**且额外缺失 footer badge 支持；生产实际运行的是含 #106/#109 的更新版本。涉及「生产表现」的判断只用线上证据，涉及「代码实现」的判断只用工作树证据，两者在本文中分别标注。
2. **本次没有任何流量/曝光/点击数据**。`var/` 下无 GSC / Bing / GA4 导出。因此本文**不对流量原因做任何推断**，也不按「高曝光低 CTR」排序——修订版 V2 §6 Phase 2 的第 3 项排序在本轮**无法评估**，标记为 `待数据`。
3. **`coverage gaps = 0` 不能当作「内容完整」的证据**（详见 §2）。它只表示「5 条 `required` 全部命中 + 维度已命中的 `conditional` 全部命中」。
4. **事实条数不代表内容维度**。簿记 863 条里 800 条（92.7%）是四类历年统计数字（`pass_rate` 207 + `passed` 207 + `applicants` 193 + `examinees` 193），只有 63 条属于报名/考试等其它字段；而 IT Passport 10 条是 10 个**不同**字段、行政書士 15 条是 15 个不同字段。修订版 V2 §5.2 已明确「不按事实条数简单排序」，本文据此不把「簿记数据最多」读成「簿记最完整」。
5. 优先级定义：**P0** = 影响索引正确性或页面可用性的确定性缺陷，且修复不需要产品决策；**P1** = 影响用户完成任务或影响可访问性的确定性缺陷；**P2** = 文档/工程一致性问题，不直接面向用户；**待数据** = 无数据不能排序。

---

## 1. V2 三目标 × 现状（总览矩阵）

| V2 目标（修订版 §3）                                                      | 现状（实测）                                                                                                                                                                                                            | 判定                               | 主要差距编号                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- | ---------------------------- |
| **发现效率**：目标用户能更快找到适合的资格与相关页面                      | 目录搜索存在（NFKC + 别名 + `includes`）；孤儿页 0、从 `/` 两跳内全部可达；但**专题页只有 1–2 个入链**，14 个枢纽页各 51 个入链（页脚全站链接）                                                                         | 结构可达，权重分配扁平             | G-07、G-11                   |
| **信息决策效率**：快速确认年度、报名/考试状态、缺失原因、官方来源、下一步 | 详情页已有「要点摘要 3 卡 + 情報ステータス + 公式サイト」；`missingReasons` 有 6 种归因；但**概要页与年度页 57% 重复**、**takken 导航暴露空的合格率页**、**移动端 Cookie 横幅遮首屏 25%**                               | 信息存在，但重复与遮挡削弱决策效率 | G-01、G-05、G-08、G-09       |
| **搜索落地页价值**：每个被索引页面独立回答一个明确问题                    | 52 条 sitemap 全 200 / 无 noindex / canonical 全自指 / ld+json 齐全（基础项干净）；但**排序参数页可索引**、**年度空壳页 200+自指 canonical**、**3 个薄 pass-rate 页在 sitemap 内**、**9 组无尾斜杠变体 200 且正文相同** | 基础项干净，边界项不干净           | G-02、G-03、G-04、G-06、G-10 |

**一句话结论**：修订版 V2 判断「不是缺基本功能、而是早期产品」在实测中成立——**基础项（sitemap/robots/canonical/ld+json/五类页面/比较/日程/ICS/统计）全部已存在且可用**；差距集中在**边界情况（参数页、空壳页、空状态、薄页）、移动可访问性、以及文档与代码的双向漂移**，而不是功能缺失。

---

## 2. 数据维度矩阵（回答「六资格覆盖差异」）

事实来源：`fixtures/ci/approved-facts.sql`（1007 条 approved facts，与 `config/release-gate-baseline.json` 的 expectedFacts 逐资格一致：16/15/10/28/863/75）。

| 资格                                     | facts    | 占比      | 不同 `fact_key` 数 | 年度跨度      | 有历史统计数字？ | coverage 契约条数（required/conditional/n-a/post_event） | 索引页数（sitemap 内）    |
| ---------------------------------------- | -------- | --------- | ------------------ | ------------- | ---------------- | -------------------------------------------------------- | ------------------------- |
| 宅地建物取引士 `takken`                  | 16       | 1.6%      | 15                 | 2026          | ❌               | 4（**3**/0/0/1）                                         | **4**（缺 `/pass-rate/`） |
| 行政書士 `gyoseishoshi`                  | 15       | 1.5%      | 15                 | 2026          | ❌               | 2（1/0/0/1）                                             | 5                         |
| ITパスポート `it-passport`               | 10       | 1.0%      | 10                 | 2026          | ❌               | 3（0/2/0/1）                                             | 5                         |
| 基本情報技術者 `fundamental-it-engineer` | 28       | 2.8%      | 20                 | 2023–2026     | ❌               | 4（0/2/**1**/1）                                         | 5                         |
| 日商簿記 `bookkeeping`                   | 863      | **85.7%** | 20                 | **2002–2026** | ✅（800 条）     | 6（1/2/**2**/1）                                         | 5                         |
| FP技能検定 `fp`                          | 75       | 7.4%      | 16                 | 2026          | ❌               | 10（0/5/**4**/1）                                        | 5                         |
| **合计**                                 | **1007** | 100%      | —                  | —             | —                | **29（5/11/7/6）**                                       | **29**                    |

（索引页数 29 = 6 资格 × 5 类页面 − takken 缺 1 个；sitemap 总 52 = 29 + 7 个固定入口 + 3 个比较专题 + 4 篇指南 + 9 个政策页。）

### 2.1 `coverage gaps = 0` 的真实含义（逐档区分）

`scripts/verify-lib.mjs:71-109` 的 `evaluateCoverage` 执行顺序：

1. 找不到该资格的 requirements → 记 `{field:'*', reason:'unknown qualification'}`；
2. **跳过 `post_event` / `optional` / `not_applicable` 三档**（`:79-84`）；
3. 按 `examYear` + 维度过滤出 `scoped`；
4. **`conditional` 且 `scoped.length === 0` 时整条 `continue`**（`:90-91`）；
5. 对 `required` 与已命中的 `conditional` 逐字段判 `satisfiesCoverageField`；
6. `gaps.length === 0` → `verified`，否则 `partially_announced`。

由此得到四档的**真实门禁效力**：

| requiredLevel    | 条数                                             | 门禁效力                                     | 对应「缺失」的真实性质                                                                                                     |
| ---------------- | ------------------------------------------------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `required`       | **5**（takken 3、gyoseishoshi 1、bookkeeping 1） | **无条件参与**，缺一即 gaps>0                | 真实缺失（或未采集/未批准）                                                                                                |
| `conditional`    | 11                                               | **仅当维度命中才参与**；维度未打上则整条跳过 | 可能是「条件不适用」，也可能是「维度没采集」——**门禁无法区分**                                                             |
| `not_applicable` | 7                                                | 永不参与                                     | 已明确判定不适用（如 FE 的 `application_rule`/`booking_window`/`venue_rule`@cbt、bookkeeping 的 `scoring_method`@network） |
| `post_event`     | 6                                                | 永不参与                                     | 考后字段（`statistics_methodology`/`scoring_method`/`passing_standard` 等），**永不进入公开页门禁**                        |
| `optional`       | 0                                                | —                                            | 当前契约未使用该档                                                                                                         |

**结论**：`coverageGaps = 0` 只证明「5 条硬约束 + 已命中维度的 conditional 都齐了」。**它不能证明**：

- 未命中维度的 conditional 字段是否真的不适用（G-12）；
- 6 条 `post_event` 的考后字段是否有数据（G-12）；
- 页面上「缺失原因」的归因是否与用户直觉一致（`public-view.ts` 的 6 种 `MissingReason` 里 `mapping_error` 是工程术语，`pending_review` 是流程术语）。

### 2.2 三个「看起来有内容、实际是空壳」的位置

| 位置                                                                                            | 事实                                                                                                                                                                                                                                                                                           | 证据                                                                       |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `/shikaku/takken/pass-rate/`                                                                    | 无任何历史统计数字 → 空态 + `noindex`，且**不在 sitemap**（`sitemap.ts` 状态白名单 + `qualificationSectionHasContent` 正确剔除）；**但资格页的 subnav 仍然显示「合格率」标签**（360px 截图 `takken-360.png` 中 `.subnav` scrollWidth 390 > clientWidth 360，「合格率」需横滑才能看到）         | `render.ts:1432`（`sectionEmpty`）、`:1561`（noindex）、`sitemap.ts:15-30` |
| `/shikaku/gyoseishoshi/pass-rate/`、`/shikaku/it-passport/pass-rate/`、`/shikaku/fp/pass-rate/` | 正文分别 **1147 / 1046 / 2697 字**，**0 张历史表**，却**在 sitemap 内**（因为 `qualificationSectionHasContent` 对 `pass-rate` 无 `year` 时只要有任一 `historyNumericKeys` 事实就返回 true，而这三者有 `pass_rate` 等单年事实）；三页彼此相似度 **44.97% / 80.89%**（同模板不同资格的天然基线） | `check_thin.py` → `thin-result`；`sim-result.txt`                          |
| `/shikaku/{slug}/2025/`、`/2027/`、`/2030/`                                                     | 返回 **200 + `noindex,follow` + 自指 canonical**（`/shikaku/takken/2030/` 的 canonical 就是自己）→ 空壳页仍可被抓取、且 canonical 指向自身而非主页面                                                                                                                                           | `edge-check.txt`、`head-metrics.txt`（`p_shikaku_takken_2030_.html`）      |

---

## 3. 差距清单（逐条：证据 → 影响 → 修复范围 → 风险）

> 每条都是**现有页面/现有组件内的改动**，不含新路由、不含新依赖、不含技术栈变更。所有「改动文件范围」均以工作树路径书写。

### G-01 概要页与年度页重复（P0）

- **证据**：`/shikaku/takken/`（4703 字）vs `/shikaku/takken/2026/`（2306 字）→ Jaccard **57.05%**、containment **90.61%**、**最长连续相同片段 974 字（42.24%）**；`/2025/`（599 字）vs `/2026/`（2306 字）→ 38.91%/84.35%。对照：`/shikaku/{slug}/pass-rate/` vs `/pass-rate/` 仅 0.23%/0.74%，guide vs 资格详情仅 3.78%/10.96% → **重复只发生在「概要 ↔ 年度」这一对**。
- **影响**：年度页与概要页争夺同一批查询；修订版 V2 §3 目标 3「每个被索引页面独立回答一个明确问题」在此不成立。两页都可索引（`/2026/` 无 noindex）。
- **改动文件范围**：`apps/web/src/render.ts`（`renderQualificationSectionPage` 的 `annual` 分支内容构成，约 `:1374-1564`）、`tests/web-render.test.ts`。
- **风险**：**中**。年度页若删内容过多会削弱「2026 年专属信息」；必须保留「本年度申込/試験日/合格発表」等年度独有事实。改动会牵动 `test:verify-gate` 的 `pageContains` 断言（`config/release-gate-baseline.json` 每资格一条日文串），需同步核对。
- **不做什么**：**不新增路由**、不改 URL（修订版 V2 要求 URL 变更需重定向 + 单独审批）。

### G-02 排序参数页可索引，且参数未做白名单校验（P0）

- **证据**：`/pass-rate/?sort=pass_rate&order=desc`、`/pass-rate/?sort=year&order=asc` 均 **200 且无 noindex**，canonical 收敛到 `/pass-rate/`；而站内其它筛选参数（`/schedule/?year=`、`/updates/?page=`、`/compare/?qualifications=`）**全部 `noindex,follow`**。代码侧：`apps/web/src/server.ts:279-298` 的 `sort`/`order` 直接从 `searchParams.get()` 取值，**无白名单校验**，原样传入 `renderPassRateIndex`。
- **影响**：索引策略自相矛盾（同一站两套口径）；非法 `sort` 值会进入渲染路径，属未校验输入。
- **改动文件范围**：`apps/web/src/server.ts:279-298`（参数白名单 + 传入 `noindex`）、`apps/web/src/render.ts`（`renderPassRateIndex` 增加 `noindex` 入参，`:2283-2353`）、`tests/web-render.test.ts`。
- **风险**：**低**。注意 `scripts/verify-lib.mjs` 的 `evaluateSitemapRoutes` 要求「indexable ↔ listed 等价」，`/pass-rate/` 主页面仍必须可索引且仍在 sitemap 内；只要只对**带参变体**加 noindex 即不触发该断言。
- **状态**：✅ **已修复（2026-11-24 Sprint 1）**。`render.ts` 新增 `parsePassRateIndexQuery()`（`sort` 走 `passRateSortKeys` 白名单、`order` 只认 `desc`、任一参数出现即 `noindex`），`PassRateIndexOptions` 增 `noindex` 入参；`server.ts` 的 `/pass-rate/` 路由改走该解析函数，canonical 仍为 `/pass-rate/`。门禁：`scripts/verify-lib.mjs` 的 sitemap 参数检查扩到 `sort|order`，`verifyQualification` 增 `/pass-rate/`（可索引）＋`?sort=`（noindex）成对探针；`scripts/docker-smoke.mjs` 同步；单测 `tests/web-render.test.ts` 2 例＋`scripts/verify-lib.test.mjs` 2 例。实测 `verify:all` 6/6、vitest 191、`test:verify-gate` 40/40。**遗留**：`/pass-rate/` 空表仍可索引（属 G-06 范畴，需单独拍板）。

### G-03 年度空壳页 200 + 自指 canonical（P0）

- **证据**：`/shikaku/takken/2025/`（过期年度）、`/shikaku/takken/2027/`、`/shikaku/takken/2030/` 均 **200 + `noindex,follow` + canonical 指向自身**。代码侧：`render.ts:1519-1524` 的 canonical 用**请求里的 year** 生成，**不校验该 year 是否有事实**。
- **影响**：可被抓取的 200 空壳；canonical 指向自身而非主页面，属「canonical 指向无有效内容的页面」。这是修订版 V2 §6 Phase 2 排序第 2 项（「被索引但缺少有效内容 / canonical 错误」）的直接命中项。
- **改动文件范围**：`apps/web/src/render.ts:1519-1524`（canonical 逻辑）、`apps/web/src/server.ts:353-391`（年度路由是否 404）、`tests/web-render.test.ts`、`tests/web-sitemap.test.ts`。
- **风险**：**中**。若改成 404/410，属**URL 行为变更**（修订版 V2：URL 变更需重定向 + 单独审批）→ **本项建议拆成两个选项交用户拍板**：(a) 仅把 canonical 改为指向 `/shikaku/{slug}/`（零 URL 变更，风险低）；(b) 改成 301/404（需单独审批）。
- **不做什么**：不擅自决定 301 目标。

### G-04 无尾斜杠变体 200 且正文相同（无 301 归一）（P1，含 URL 审批项）

- **证据**：`check_slash.py` 逐对比较 9 组（`/shikaku` ↔ `/shikaku/`、`/shikaku/takken` ↔ `/shikaku/takken/`、`/shikaku/takken/2026` ↔ …、`/schedule`、`/compare`、`/pass-rate`、`/updates`、`/guide`、`/about/privacy`）→ **全部 200 且 body SHA256 相同**，无 301。
- **影响**：同一内容两个 URL 都可返回 200（canonical 会收敛，但仍是重复抓取面）。
- **改动文件范围**：`apps/web/src/server.ts`（路由层 301 归一）。
- **风险**：**高（需审批）**。属 URL 行为变更，修订版 V2 明确要求「重定向 + 单独审批」。**本文档不提议本轮执行**，只登记为待决策项。

### G-05 takken 导航暴露空的「合格率」页（P1）

- **证据**：`/shikaku/takken/pass-rate/` 是空态 + noindex + 不在 sitemap（行为正确）；但 takken 资格页的 `.subnav` 仍渲染「合格率」标签（360px 截图可见，且该 subnav 在 360px 下 `scrollWidth 390 > clientWidth 360`，需要横滑才能看到）。
- **影响**：用户从导航点进去得到空页；同时暴露一个「可发现性问题」——横滑才能看到的标签等于半隐藏。
- **改动文件范围**：`apps/web/src/render.ts`（subnav 构建处，按 `qualificationSectionHasContent` 决定是否渲染该标签）、`packages/ui/src/index.ts`（`.subnav` 在窄屏的可发现性）、`tests/web-render.test.ts`。
- **风险**：**低**。注意不要与 `verify:all` 的 Web 五页断言冲突——`verify-lib.mjs:337-355` 会直接请求 `/shikaku/{slug}/pass-rate/` 并要求「noindex 时含 `公開できる公式情報はありません`」；隐藏导航标签**不改变该页仍可被直接访问**，因此断言仍成立。

### G-06 3 个薄 pass-rate 页在 sitemap 内（P1）

- **证据**：`/shikaku/gyoseishoshi/pass-rate/` 1147 字、`/shikaku/it-passport/pass-rate/` 1046 字、`/shikaku/fp/pass-rate/` 2697 字，均 **0 张历史表**；三者互相相似度 44.97%/80.89%。判定逻辑：`render.ts` 的 `qualificationSectionHasContent(view,'pass-rate')` 在**无 year** 时，只要有任一 `historyNumericKeys` 事实就返回 true。
- **影响**：sitemap 收录了「只有单年数字、没有历史趋势」的页面，与「每个索引页独立回答一个问题」冲突。
- **改动文件范围**：`apps/web/src/render.ts`（`qualificationSectionHasContent` 的 pass-rate 判定是否需要「≥2 个年度」）、`apps/web/src/sitemap.ts`（无需改，跟随 content 判定）、`tests/web-sitemap.test.ts`。
- **风险**：**中**。收紧判定会让这 3 页移出 sitemap，需同步 `test:verify-gate`（40 条）与 `verify:all` 的 indexable↔listed 等价断言；另外**必须先确认产品意图**——「有单年合格率但无历史」到底算不算有效内容，这是产品判断，不是工程判断。→ **建议列为需用户确认项**。

### G-07 内链权重扁平：专题页 1–2 入链，14 个枢纽页各 51 入链（P1）

- **证据**：`link_graph.py` 抓 52 条 + `/`，`crawled=52 errors=0`。入链数：3 个比较专题各 **1**、4 篇指南各 1（`how-to-read-pass-rates` 为 2）；`/shikaku/takken/application/` 与 `/exam-content/` 各 **3**（其余五资格子页各 4）；`/shikaku/{slug}/2026/` 4–7；`/shikaku/{slug}/` 7–8；而 `/`、9 个政策页、`/compare/`、`/guide/`、`/pass-rate/`、`/schedule/`、`/shikaku/` **全部 51**（页脚全站链接）。**孤儿页 0、两跳内全部可达**。
- **影响**：页脚把 14 个页面抬到同一权重，专题内容页（指南/比较）只有 1–2 个内链指向 → 修订版 V2 §6 Phase 2 排序第 4 项「导航、内链或空状态」的直接命中项。
- **改动文件范围**：`apps/web/src/render.ts`（资格详情页/年度页内增加指向对应专题的上下文链接）、`apps/web/src/layout.ts`（页脚是否保留 14 个全站链接）、`tests/web-render.test.ts`。
- **风险**：**低–中**。改页脚会影响**所有页面**（51 个入链同时变化），必须一次性核对 `tests/web-render.test.ts`（2246 行主测）与 64 张截图回归；建议只「增加专题入链」而不「删页脚链接」，把风险控制在一侧。

### G-08 点击目标普遍 18px 高（< WCAG 2.2 AA 24×24）（P1）

- **证据**：`ui-metrics.json` 的 `smallTargets`（32 条记录 = 8 页 × 4 视口）中大量 `a` 高度 18px：「公式ソース」70×18、「公式サイトで確認（新しいタブ）」210×18、「ホーム」42×18、「資格を探す」70×18、Cookie設定 button 74×18、表头排序「資格↑」39×18、「年度↕」39×19、「合格率↕」53×19；比较页 6 个 `input[type=checkbox]` 为 **18×18**。
- **影响**：WCAG 2.2 AA 的 2.5.8（Target Size Minimum，24×24 CSS px）不满足；移动端误触风险。
- **改动文件范围**：`packages/ui/src/index.ts`（链接/按钮/checkbox 的最小高度或 padding）、`apps/web/src/styles.ts`（表头排序链接）、**`apps/web/src/assets.ts` 的 `criticalCss`（双维护点，必须同步）**、`tests/ui-foundation.test.ts`。
- **风险**：**中**。①`criticalCss` 与 `uiStyles`/`webStyles` 是两处维护点（`assets.ts:1-13` 注释明确要求同步），漏改会出现首屏闪动；②改 CSS 会改变 `siteCssHash`（`sha256(siteCss).slice(0,12)`）→ 资源 URL 变化，属正常行为但需确认 Caddy 缓存策略；③需重跑 `scripts/visual_smoke.py` 做视觉回归。

### G-09 移动端 Cookie 横幅遮挡首屏约 1/4（P1）

- **证据**：`cookieBannerHeight` / `cookieBannerCoversViewportPct`：1440 = 81px(9%)、900 = 104px(12%)、390 = 208px(**25%**)、360 = 208px(**26%**)；移动端固定在底部导航之上。截图 `home-390.png`、`guide-390.png` 可见横幅压住正文与底部导航。
- **影响**：首次访问的移动用户首屏可用面积减少约四分之一；属修订版 V2 §6 Phase 2 排序第 5 项「移动端可访问性和布局问题」。
- **改动文件范围**：`apps/web/src/layout.ts`（`renderCookieBanner` 的文案长度/结构，`:66-68`）、`packages/ui/src/index.ts`（`.cookie-banner` 移动端布局）、`apps/web/src/assets.ts`（criticalCss 同步）、`tests/web-render.test.ts`（已有「keeps the mailbox out of the global footer」类断言，注意不要破坏同意/拒绝路径的既有断言）。
- **风险**：**中**。**不得改动同意/拒绝逻辑**（`sqc-analytics-consent` 的 granted/denied 分支、`data-cookie-accept`/`data-cookie-decline`、footer `data-cookie-settings` 重置路径），只改视觉；`layout.ts:263` 的「无 GA ID 不渲染横幅」行为也必须保留。改文案会牵动 `tests/web-render.test.ts` 的文案断言。

### G-10 除首页外 7 个数据页 + sitemap 无降级：任一 API 抛错即整页 502（P1）

- **证据**：`server.ts` 只有 `/`（`:392-420`）用 `Promise.allSettled` 降级；`/shikaku/`、`/shikaku/{slug}/…`、`/schedule/`、`/compare/`、`/pass-rate/`、`/updates/`、`/sitemap.xml`（`:194-229`，**无 try/catch**）任一上游 fetch 抛错 → 顶层 catch → `renderErrorPage` 502。502 页无搜索框、无热门出口（对比 404 页有搜索表单 + 5 条热门 + 4 个资格链接）。
- **影响**：API 抖动会放大成整站 502；`/sitemap.xml` 502 会直接影响抓取。
- **改动文件范围**：`apps/web/src/server.ts`（各路由的降级/局部失败）、`apps/web/src/render.ts`（`renderErrorPage` 增加出口）、`tests/web-render.test.ts`、`tests/public-api.test.ts`。
- **风险**：**中–高**。降级策略会改变「页面是否可索引」的判定——若某页在 API 失败时返回 200 空态，`verify-lib.mjs:117-145` 的 `evaluatePublicPage` 与 `verify:all` 的第 ⑤ 项断言会受影响。**必须先定义「降级后的页面是 200 空态还是 503」**，这是产品/SEO 决策 → 建议先出决策再改代码。
- **部分修复（2026-11-24 Sprint 2B）**：决策已由号主在 Sprint 2 给出（`docs/audit/DEEPSEEK_HARNESS_SPRINT_2_TASK.md` §0/§6）。实测前提被修正——上游失败时**当前并非 200 空态而是 502**，且 catch 不接收 error、不区分失败类型。已实施：`fetchUpstream()` 在连接失败/非 2xx 时抛 `UpstreamUnavailableError`，顶层 catch 对它回 **503 + `retry-after: 60` + `renderErrorPage()`（noindex）**，其余错误仍 502；`proxyIcs` 的非 404 分支同步改 503；`/sitemap.xml` 走同一 helper，故障时 503 而非吐 HTML 冒充 XML。**`/` 保持 200**（`Promise.allSettled` 降级为空模块）——这是 healthcheck 依赖项，改成 503 会让容器 unhealthy、Caddy 不启动、全站不可用。静态路由不 fetch，不受影响 ⇒ 非全站 503。回归：`tests/web-server.test.ts`（8 例，桩 API 驱动真实 `handleRequest`）。**未做**：`renderErrorPage` 补搜索框与更多出口（G-10 原文的 UX 部分仍未做）；`/pass-rate/` 单资格失败导致整表 503 的粒度问题仍待拍板。

### G-11 生产 HTML 无 Cache-Control/ETag、Brotli 未启用、单页最大 518KB（P1，性能）

- **证据**：`headers-check.txt` — HTML/XML/ICS 仅 `Content-Type` + `Vary: Accept-Encoding`，**无 Cache-Control、无 ETag、无 Last-Modified**；CSS `public, max-age=31536000, immutable`、PNG `max-age=604800`（代码 `server.ts:165`、`:176`）。`reliability.py` — `Accept-Encoding: br` 返回 **identity 39640B**（Brotli 未启用）；`gzip, deflate, br` 返回 gzip。页面体积（identity）：`/shikaku/bookkeeping/pass-rate/` **518538B**（5 table / 94 tr / 31 h3）、`/shikaku/bookkeeping/` 143663B（82 h3）、`/shikaku/fp/` 145402B。
- **影响**：**不是「服务端慢」**——声明 gzip 后 45 次请求 0 失败、`/` 0.99–2.24s、`/shikaku/fp/` 0.32–0.73s；但**未压缩 145–518KB 的 HTML 在慢链路上实测 36.97s / 60.01s（被截断）**。移动网络下首屏风险来自传输体积，不是渲染。
- **改动文件范围**：`apps/web/src/server.ts`（HTML 加 `Cache-Control`/`ETag` 或至少 `Vary` 明确化）、`deploy/caddy/Caddyfile`（`encode zstd gzip` 是否加 brotli/zstd）、`apps/web/src/render.ts`（bookkeeping pass-rate 的表格分页/折叠）。
- **风险**：**中**。①加 HTML 缓存会导致事实更新后用户看到旧页 → 需要短 TTL（如 `max-age=0, must-revalidate` + ETag），**这是产品决策**；②改 Caddyfile 属部署配置（本次禁止改，需单独授权）；③改表格呈现属 UI 变更，需视觉回归。
- **不做什么**：**本次不改 Caddyfile、不改部署配置**。

### G-12 conditional/post_event 的「不可见缺失」（P2，语义）

- **证据**：`evaluateCoverage` 跳过 `post_event`/`optional`/`not_applicable`，且 `conditional` 在维度未命中时整条 `continue`（`verify-lib.mjs:79-91`）。运行时镜像 `public-view.ts:112-193` 有 6 种 `MissingReason`，其中 `mapping_error`、`pending_review` 是**工程/流程术语**；`announcedOnly` 不计入 `blockingMissing`（`:174`）。
- **影响**：门禁绿灯不等于「用户看到的缺失原因可理解」；`not_applicable` 与「未采集」在门禁层不可区分（区分只发生在 `public-view.ts` 的归因逻辑里）。
- **改动文件范围**：**本项不改代码**，建议在 `docs/data-gate-semantics.md` 增补一节「四档语义与用户可见缺失原因的映射」，并在 `docs/adr/` 新增一篇 ADR 记录该映射决策。
- **风险**：**低（纯文档）**。但注意 `docs/data-gate-semantics.md` 当前处于**未提交修改状态**（`M`），动它之前必须先处理工作区。

### G-13 文档与代码双向漂移（P2，但阻塞 Phase 1 的文档阅读）

| 文档                                  | 漂移点（行号）                                                                                                                                                                                                                                                                          | 性质                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| `docs/runbook.md`                     | `:3`「仅支持本地开发」vs `:277`「生产部署（VPS）」vs `:377`「生产已启用（2026-11-15，PR #103）」；`:1` 标题仍「阶段 0/1」；`:19`「**176 条**」vs 实际 1007；`:21`「生产发布仍不在范围内」                                                                                               | **代码领先文档**            |
| `docs/compliance-audit-2026-11-13.md` | H1/H2/M1/M2 主体已整改，`:67` 现状句「GA/广告/联盟均未启用、`GA_MEASUREMENT_ID` 为空」失效；L1 六项安全头**已补 5 项，仅 CSP 全仓 0 命中**                                                                                                                                              | **代码领先文档**            |
| `docs/next-round-ticket.md`           | `:10` 停在 `dc4e0ec`（#109），实际 `01b86dd`（#111）；`:13`「local main behind 1」                                                                                                                                                                                                      | **指针落后 2 commit**       |
| `docs/transition-handoff.md`          | `:3` 停在 #109；`:1`/`:5`/`:7` 正文「2026-11-10、facts 982、sources 45、main `16ce98a`」→ 落后 **43+ commit**；`:106`「全仓既无 PDF 也无 xlsx 解析能力」已被 `services/collector/src/collector/fe_statistics_xlsx.py` 推翻                                                              | **指针严重落后**            |
| `docs/design-system.md`               | 字号表「44/34、36/30、28/24、21/19」实际为 `packages/ui/src/index.ts:179-181` 的 32/24/18（移动 26/24/18）；`1280px` 断点全仓 0 命中；6 个交互组件（dropdown/tooltip/toast/skeleton/drawer）文档有代码无；`.cookie-banner`/`.pass-rate-table`/`.history-table` 等 10 类类名代码有文档无 | **文档领先代码 + 双向缺漏** |
| `docs/ui-redesign-plan-2026-09.md`    | `:34-36` 三项标「未完成」其实已完成（`scripts/visual_smoke.py` 在 main；`render.ts:2571` 首页已接真实 updates；`schedule-month`/`pass-rate-table`/`history-table`/政策页七页齐全）                                                                                                      | **未回填**                  |
| `README.md`                           | `:3`「当前不连接生产服务」与生产已上线矛盾；`:21` 把 `dev:web` 描述为「IT Passport 公开页」；`:64` 仍含「facts 982／999、main `f46c943`」旧读数，与 `:5` 的 1007 并存                                                                                                                   | **入口页自相矛盾**          |
| `docs/data-gate-semantics.md`         | `:26-29` 旧 gaps 数字（0/10）只加注未删；`:116` 引用 `verify-lib.mjs:215` 实际已漂移到 `:292-295`；`:140`/`:142` 的 1007／30 迁移／sources 52／snapshots 80 仍准确                                                                                                                      | **部分陈旧**                |

- **影响**：修订版 V2 §6 Phase 1 要求「读文档 + 看数据」来归因。若文档仍写「仅本地开发」「176 条」「GA 未启用」，Phase 1 的结论会被系统性带偏。
- **改动文件范围**：上述 7 个 md（**纯文档**）。
- **风险**：**低**。唯一注意点：`docs/data-gate-semantics.md`、`docs/handover-p1-ops-findings.md`、`docs/next-round-ticket.md`、`docs/stage-log.md`、`docs/transition-handoff.md` 当前都在**未提交修改状态**（`M`）→ 动手前必须先决定工作区怎么处理（见 §5 前置条件）。
- **✅ 2026-11-24 已回填（Sprint 1 完成）**：上表 8 个文件全部按行号对齐完毕——`docs/runbook.md`（标题、双形态说明、176→1007、删「生产发布不在范围内」、13 处 `npm run `→`pnpm `）、`docs/compliance-audit-2026-11-13.md`（M2 现状句改「GA 已启用／广告未启用」、L1 改「6 项已补 5、仅缺 CSP」、优先级表重排）、`docs/next-round-ticket.md`（指针推到 `01b86dd`／`9df67ed`、本地工作树段整段重写）、`docs/transition-handoff.md`（文首加 2026-11-24 注记四条，正文按该文件自有约定不改写）、`docs/design-system.md`（字号表按代码改 32/24/18 与 40/28、断点表删 1280 两档、新增 §6.22 站点特有组件登记 11 行）、`docs/ui-redesign-plan-2026-09.md`（`:34-36` 三项改 `[x]` 并附证据）、`README.md`（`:3`／`:21`／`:64`，并补 `coverageGaps` 语义限定）、`docs/data-gate-semantics.md`（`:26-29` 历史判据加删除线并标 2026-10-09 时点、`:116` 行号改 `:292`／`:329`）。验收：`176 条`／`仅支持本地开发`（除 `runbook.md:5` 修订说明中的引用）／`facts` 176` 全 0 命中；prettier、tsc、vitest 17/189、`verify-lib.test.mjs` 全绿；12 个文件本地链接零死链。

### G-14 全仓没有任何 SEO/noindex 决策 ADR（P2）

- **证据**：`docs/adr/` 只有 `0001-stage-0-foundation.md`（727 B / 8 行），内容是技术栈/时间口径/版本不可原地覆盖/权限边界/阶段 0 不连生产。**没有任何关于索引策略的 ADR。**
- **影响**：以下四个决策目前**没有书面依据**，只能从代码反推：①`/pass-rate/` 空表是否应可索引；②无筛选 `/schedule/` 空态是否应可索引；③`/pass-rate/?sort=` 为何不 noindex；④年度空壳页为何 200 而非 301/404。G-02/G-03/G-06 的修复方向都取决于这些决策。
- **改动文件范围**：新增 `docs/adr/0002-index-policy.md`（**新增文件**，不改既有文档）。
- **风险**：**极低（纯文档）**。但**必须先由用户拍板**，否则 G-02/G-03/G-06 只能做「最小安全子集」。

### G-15 测试覆盖缺口（P2，工程风险）

- **证据**：`tests/*.test.ts` 共 17 个，`web-render.test.ts` 2246 行为主测，`public-api.test.ts` 是**唯一**用 `app.inject` 打真实 HTTP 的。**0 命中**：`apps/web/src/server.ts` 进程入口（19 条路由无一条进程级测试）、`renderErrorPage`、`renderSitemap`、`proxyIcs`、`siteOrigin`、`STATIC_IMAGES`、`/images/`、`/robots.txt`、`/assets/`、slug 白名单 404；**没有任何测试断言「`/pass-rate/` 空表页是否应 noindex」**。
- **影响**：G-02/G-03/G-10 这类「路由层行为」的修复没有回归网；改 `/sitemap.xml` 只能靠 `test:verify-gate` 的间接断言。
- **改动文件范围**：`tests/`（新增进程级/路由级测试）、`vitest.config.ts`（如需 setup）。
- **风险**：**低**。属纯测试新增。

### G-16 `change_events` 的 schema 漂移（P2，工程风险）

- **证据**：`packages/db/migrations/0021_change_event_audit.sql:7-8` 已加 `operator_id`/`reason` 两列，但 `packages/db/src/schema.ts:320-332` 的 `changeEvents` **未声明**这两列；而 `services/api/src/release.ts:208`（手写 INSERT）与 `scripts/rollback-fact.ts:57` 都在用它们 → **Drizzle ORM 读不到回滚审计字段**。
- **影响**：任何走 Drizzle 读取 `change_events` 的代码会静默丢失审计信息；属「schema 与迁移不同步」。
- **改动文件范围**：`packages/db/src/schema.ts:320-332`（补两列声明）。
- **风险**：**低**，但**本次禁止改迁移/schema**（Phase 0 禁止项明确包含「不修改数据库、迁移」）→ **仅登记，不在 Phase 0 执行**。

### G-17 唯一真正未做的既有待办：FE 统计月度附件刷新（P2）

- **证据**：`docs/next-round-ticket.md:33`「待办 1 FE 统计月度附件刷新（`202610` 预期 2026-12 上中旬）」。另 `transition-handoff.md:105`「宅建统计页只能抓不能入库」**仍成立**（`services/collector/src/collector/capture_takken.py:33` 注释 `still pins every Takken snapshot to the single TAKKEN_SOURCE ingestion id.`）。
- **影响**：FE 统计在 2026-12 会出现月度缺口；宅建统计永远无法进公开页（这也是 G-05 中 takken pass-rate 为空态的根因）。
- **改动文件范围**：`services/collector`（FE 月度刷新）、`services/collector/src/collector/capture_takken.py`（若做宅建统计入库）。
- **风险**：**中**。属采集侧变更，**Phase 0 禁止运行真实采集命令**；且宅建统计入库会改变 `config/data-coverage-contract.json` 与 `release-gate-baseline.json` → 需按既有流程走。

### G-18 其它索引面缺口（P2）

- **证据**：`/about/` 索引页 404（只有 9 个 `/about/{slug}/`）；无搜索页；无 feed（404）；`/updates/` 分页 `rel=next` 指向 noindex 变体；`/pass-rate/` 表格数据行全部指向 **noindex 的 `?year=` 变体**（`/shikaku/bookkeeping/pass-rate/?year=2026` 等）。
- **影响**：①`/pass-rate/` 表格是「合格率比较」的落地页，但每行出口都指向 noindex 页 → 内链把权重导向不可索引目标；②`/about/` 无索引页属信息架构缺口，但**新增路由需先证明现有页面无法满足**（修订版 V2 §4）。
- **改动文件范围**：`apps/web/src/render.ts`（`renderPassRateIndex` 的行链接改指可索引的 `/shikaku/{slug}/pass-rate/`）、`tests/web-render.test.ts`。`/about/` 索引页**建议不做**（政策页已由页脚全站链接覆盖，51 入链）。
- **风险**：**低**（只改链接目标）。
- **状态**：🟡 **部分修复（2026-11-24 Sprint 1，仅前半）**。`/pass-rate/` 表格数据行已从 `?year=` 变体改指可索引的 `/shikaku/{slug}/pass-rate/`（`render.ts` 的 `renderPassRateIndex`），门禁在 `verifyQualification` 的 `/pass-rate/` 探针里断言表格不含 `?year=`，`docker-smoke.mjs` 同款。**未做**：`/about/` 索引页、搜索页、feed（属新增路由，需先证明现有页面无法满足，见修订版 V2 §4）。

---

## 4. 与旧 V2 方案的冲突处

| #   | 旧 V2 假设                                                           | 本次实测                                                                                                                                                  | 冲突性质       | 结论                                                                                               |
| --- | -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------- |
| 1   | 「第一阶段扩充到约 30 个资格」                                       | 现有 6 资格，且 1007 条事实里 863 条集中在簿记（其中 800 条是四类历年统计数字）                                                                           | **直接冲突**   | 修订版已删该目标；本次审计进一步支持删除——**数据量集中不等于维度丰富**，扩资格只会放大采集维护成本 |
| 2   | 「重做首页、目录、详情和工具页」                                     | 8 页 × 4 视口：**横向溢出 0、H1 唯一、无 JS 错误、最小字号 12px**                                                                                         | **直接冲突**   | 不是「重做」问题；真实问题是**点击目标 18px（G-08）**与**Cookie 横幅遮 25%（G-09）**——都是小步修   |
| 3   | 「建立技术 SEO 基础（sitemap/robots/canonical/结构化数据/noindex）」 | **52 条 sitemap 全部 200、无 noindex、canonical 全自指、ld+json 齐全、`test:verify-gate` 40/40 通过**                                                     | **直接冲突**   | 基础项**已存在**；问题只在**参数页（G-02）/空壳页（G-03）/薄页（G-06）**这些边界                   |
| 4   | 「GA 尚未安装，先装 GA」                                             | 生产已启用 `G-G9SN61J5LS`（旧 `G-LV4250LZNY` 已删除重建），同意门控已内置（`sqc-analytics-consent`，无 ID 不渲染横幅）                                    | **直接冲突**   | 修订版 §6 Phase 1 已明确「不能再按尚未安装 GA 安排工作」；本次实测确认该表述正确                   |
| 5   | 「新建资格发现/筛选系统」「新建比较器/日历/统计」                    | `/shikaku/` 已有搜索（NFKC + 别名）、`/compare/` 已有最多 3 项比较、`/schedule/` 已有筛选、`/pass-rate/` 已有排序、`/ics/` 已有两种粒度、历史统计表已存在 | **直接冲突**   | 全部不新建；只补**可发现性**（G-05、G-07）与**边界正确性**                                         |
| 6   | 「30 个资格 = 成功指标」                                             | 簿记 863 条里 92.7% 是统计数字；IT Passport 10 条却是 10 个不同字段                                                                                       | **直接冲突**   | 修订版 §7 已改；本次审计支持「以任务价值而非条数/URL 数衡量」                                      |
| 7   | 「旧 V2 认为 UI 改造 2026-09 已完成」                                | `docs/ui-redesign-plan-2026-09.md:34-36` 三项仍标「未完成」，实际已完成 → **文档未回填**                                                                  | **文档侧冲突** | 归入 G-13；不影响产品判断                                                                          |
| 8   | 「两周低流量 → IA/UI 失败」                                          | **本轮无任何流量数据**（`var/` 下无 GSC/Bing/GA4 导出）                                                                                                   | **无法评估**   | 修订版已改为「先取数据再归因」；本文档**不做流量归因**，Phase 2 第 3 项排序标记 `待数据`           |

---

## 5. 建议的前三个最小 Sprint

> 约束：每个 Sprint 只做「证据明确、不需要新增路由、不需要换栈」的改动；每个 Sprint 独立可回滚；生产发布需单独授权（本阶段不部署）。
> **前置条件（所有 Sprint 共用）**：工作区当前有 10 项未提交改动（`M` × 9 + `?? scripts/visual_smoke.py`），且工作树**比 `origin/main` 旧**（缺 footer badge 支持）。动手前必须先决定：是 `git stash` 后对齐到 `01b86dd` 再开工，还是先把工作区改动整理成一个 PR。**这一步不做，任何 Sprint 的 diff 都不可信。**
>
> **✅ 2026-11-24 已处理**：留底 `var/audit-2026-11-24/pre-align.patch`（163298 B）＋旧脚本备份 `.bak`（4333 B）后，9 个 tracked 改动进 `stash@{0}: pre-phase1-wip`，未跟踪的旧 `scripts/visual_smoke.py` 删除（origin/main 已跟踪同名新版），工作树已从 `01b86dd` 切出分支 `chore/phase1-baseline`，`git diff origin/main --name-status` 为空。

### Sprint 1（建议先做）：文档基线对齐 —— 零产品改动、零风险、解锁 Phase 1

- **目标**：让「读文档」不再误导 Phase 1 的数据归因。修订版 V2 §6 Phase 1 的第一步就是读文档 + 看数据。
- **证据**：G-13 全表（7 个文件、逐行号）；G-14（缺索引策略 ADR）。
- **改动文件范围**（全部为 `.md`）：
  - `docs/runbook.md` — `:1` 标题、`:3` 删除/改写「仅支持本地开发」、`:19` 176→1007、`:21` 删「生产发布不在范围内」、`:98`/`:106`/`:126`/`:217`/`:241`/`:270`/`:357` 的 npm/pnpm 口径统一
  - `docs/compliance-audit-2026-11-13.md` — `:67` 现状句、L1 行补「CSP 仍未配置」
  - `docs/next-round-ticket.md` — `:10`/`:13` 指针推到 `01b86dd`
  - `docs/transition-handoff.md` — `:3` 指针推到 `01b86dd`；`:106` 删除「无 PDF/xlsx 解析能力」
  - `docs/design-system.md` — 字号表与 `1280px` 断点二选一对齐；补登记 `.cookie-banner`/`.pass-rate-table`/`.history-table`/`.home-timeline`/`.detail-kpi`/`.trust-panel`/`.filter-chips`/`.mobile-menu-panel`
  - `docs/ui-redesign-plan-2026-09.md` — `:34-36` 回填为已完成
  - `README.md` — `:3`、`:21`、`:64`
  - `docs/data-gate-semantics.md` — `:26-29` 删旧数字、`:116` 改行号
  - **新增** `docs/adr/0002-index-policy.md`（只新增，不改既有）
- **风险**：**低**。①这些文件多数处于未提交修改状态，需先与工作区对齐；②`docs/adr/0002` 的内容是**决策记录**，必须由用户拍板后才能写（否则又是一份「文档领先代码」）。
- **验收**：`README.md` 内 20 个 docs 链接仍零死链（当前实测零死链）；全文搜索 `176 条`、`dc4e0ec`、`仅支持本地开发` 无残留（除历史档案 `stage-log.md`/`transition-handoff.md` 的正文历史段）。

### Sprint 2：索引卫生（P0 边界项）—— 只动参数页与空壳页的 canonical/noindex

- **目标**：把「被索引但没有有效内容 / canonical 指向自身」的边界收干净。对应修订版 V2 §6 Phase 2 排序第 2 项。
- **证据**：G-02（`?sort=` 可索引 + 未校验白名单）、G-03（年度空壳 200 + 自指 canonical）、G-18 前半（`/pass-rate/` 表格行指向 noindex 变体）。
- **改动文件范围**：
  - `apps/web/src/server.ts:279-298`（`sort`/`order` 白名单 + 传 `noindex`）
  - `apps/web/src/render.ts:1519-1524`（年度页 canonical 改指 `/shikaku/{slug}/` 或主年度页 —— **只改 canonical，不改状态码**）
  - `apps/web/src/render.ts:2283-2353`（`renderPassRateIndex` 增加 `noindex` 入参 + 行链接改指 `/shikaku/{slug}/pass-rate/`）
  - `tests/web-render.test.ts`、`tests/web-sitemap.test.ts`
- **风险**：**中**。①`scripts/verify-lib.mjs:147-168` 的 `evaluateSitemapRoutes` 要求 **indexable ↔ listed 等价**，改 noindex 必须同步 sitemap 或保持主页面可索引；②`test:verify-gate` 40 条断言里有针对 noindex 的显式断言（`verify-lib.mjs:380-383` 要求 bookkeeping `?year=` 必须含 noindex meta），改动不能破坏它；③**301/404 归一（G-03 选项 b、G-04）不在本 Sprint** —— 属 URL 变更，需单独审批。
- **验收**：`corepack pnpm test`（当前 189 passed）、`test:verify-gate`（当前 40/40）、`verify:all`（**需可用 DATABASE_URL，本次不可用 → 必须由 CI 或运维环境补跑**）。

### Sprint 3：移动可访问性（P1）—— 点击目标与 Cookie 横幅

- **目标**：满足 WCAG 2.2 AA 2.5.8（24×24），并让移动端首屏不被 Cookie 横幅占掉 1/4。对应修订版 V2 §6 Phase 2 排序第 5 项。
- **证据**：G-08（18px 目标清单，含具体尺寸）、G-09（208px / 25–26%）。
- **改动文件范围**：
  - `packages/ui/src/index.ts`（链接/按钮/`input[type=checkbox]` 最小高度与 padding；`.cookie-banner` 移动端布局；`.subnav` 窄屏可发现性）
  - `apps/web/src/styles.ts`（表头排序链接）
  - **`apps/web/src/assets.ts` 的 `criticalCss`（必须与上两处同步，双维护点）**
  - `tests/ui-foundation.test.ts`、`tests/web-render.test.ts`
- **风险**：**中**。①**不得改动同意/拒绝逻辑**（`sqc-analytics-consent` 分支、`data-cookie-accept`/`data-cookie-decline`/`data-cookie-settings`）；②`layout.ts:263`「无 GA ID 不渲染横幅」必须保留；③改 CSS 会改 `siteCssHash`（`sha256(siteCss).slice(0,12)`）→ 资源 URL 变化（正常，但需确认缓存策略）；④`criticalCss` 漏改会造成首屏闪动；⑤需重跑 `scripts/visual_smoke.py` 做 64 张截图回归。
- **验收**：`ui-metrics` 重跑后 `smallTargets` 中 24×24 以下的项归零；`cookieBannerCoversViewportPct` 在 390/360 视口 ≤ 12%；`overflow` 仍为 0。

### 不建议放进前三个 Sprint 的事项（明确排除）

| 事项                                         | 原因                                                                                           |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| G-04 无尾斜杠 301 归一                       | **URL 行为变更**，修订版 V2 要求重定向 + 单独审批                                              |
| G-03 选项 b（年度空壳改 301/404）            | 同上                                                                                           |
| G-06 收紧 3 个薄 pass-rate 页的 sitemap 准入 | 需**产品判断**「有单年合格率但无历史」是否算有效内容                                           |
| G-10 API 失败时的降级策略                    | 需先决定「降级后是 200 空态还是 503」，影响索引                                                |
| G-11 HTML 缓存与 Caddy 压缩                  | 涉及**部署配置**（本次禁止）与缓存 TTL 产品决策                                                |
| G-16 schema 漂移                             | Phase 0 禁止改迁移/schema                                                                      |
| G-17 FE 月度刷新 / 宅建统计入库              | 涉及**真实采集**（本次禁止）与 coverage 契约变更                                               |
| G-01 概要 vs 年度页去重                      | 影响面大（牵动 `release-gate-baseline.json` 的 `pageContains`），建议在 Phase 1 数据出来后再定 |
| G-07 内链重构                                | 会同时改变 51 个入链，需完整视觉与测试回归；建议排在 Sprint 3 之后                             |
| 新增 `/about/` 索引页、搜索页、feed          | **新增路由**，修订版 V2 §4 要求先证明现有页面无法满足                                          |

---

## 6. 需要用户拍板的 6 个决策（Phase 1 之前）

1. **索引策略**：`/pass-rate/` 空表、无筛选 `/schedule/` 空态、`/pass-rate/?sort=` 变体，三者分别应「可索引 / noindex / 不可访问」中的哪一种？（决定 G-02/G-03/G-06 的方向，也决定 `docs/adr/0002` 的内容）
2. **URL 归一**：9 组无尾斜杠变体是否要做 301？（属 URL 变更，需单独审批）
3. **年度空壳页**：`/2025/`、`/2027/`、`/2030/` 是「保留 200 + noindex」还是「301 到主页面」还是「404」？
4. **薄页准入**：「有单年合格率、无历史趋势」的 pass-rate 页算不算有效内容（是否留在 sitemap）？
5. **API 失败降级**：数据页在上游失败时应返回 200 空态（可索引？）还是 503？
6. **数据侧优先级**：先做 FE 202610 月度刷新（G-17，2026-12 前有硬期限），还是先做宅建统计入库（能补上 takken pass-rate 空态）？

---

## 7. 本文档的边界声明

- 本文档为**新增**文件，未修改任何既有文档、代码、CSS、文案、路由、API、数据库、迁移、baseline、CI fixture、source contract、`.env`、密钥、GA4/GSC/Bing 配置。
- 本文档**未创建/删除/合并任何分支或 PR**，**未部署、未重启生产**，**未安装任何新依赖**。
- 本文档**不含流量归因**：本轮没有 GSC/Bing/GA4 数据，任何「曝光低/CTR 低」的判断都是无证据推断，已全部排除。
- 所有数字均可回溯：仓库/代码事实见 `docs/audit/REPOSITORY_AUDIT_2026-11-24.md`，线上事实见 `docs/audit/PRODUCTION_BASELINE_2026-11-24.md`，原始证据在 `var/audit-2026-11-24/`。
