# ADR 0002：公开站的索引策略（哪些 URL 可被收录）

- 状态：已接受（2026-11-24）
- 背景：索引行为此前散落在 `apps/web/src/render.ts` 的若干 `noindex:` 赋值、`apps/web/src/sitemap.ts` 的路径拼装和 `scripts/verify-lib.mjs` 的断言里，没有任何一处成文说明「为什么这个 URL 收、那个 URL 不收」。2026-11-24 的只读审计（`docs/audit/V2_GAP_MATRIX.md` G-02／G-03／G-14／G-18）发现三处口径不一致：`/pass-rate/?sort=` 可被索引、年度空壳页 200 且 canonical 自指、部分薄页在 sitemap 里。本 ADR 把判据固定下来，后续改索引行为先改这里。

## 1. 三条判据

一个 URL 只有同时满足下面三条才可被收录（indexable）：

1. **有真实已批准内容**：页面渲染出的正式事实（approved facts）或历史统计不为空。空栏目页、只有导航和说明的壳页一律不可索引。
2. **不是参数变体**：查询参数只用于筛选/排序/翻页，同一个内容有多种参数组合的，参数版一律 `noindex,follow`，可索引版只保留无参数的那个 URL。
3. **与 sitemap 一致**：可索引的页面必须出现在 `/sitemap.xml` 里；不可索引的页面必须不在 sitemap 里。这条由 `scripts/verify-lib.mjs:147-168` 的 `evaluateSitemapRoutes` 双向断言强制（`indexable && !listed` → `Sitemap missing the indexable … page`；`!indexable && listed` → `Sitemap lists the noindex … page`）。

## 2. 现行判定表（2026-11-24 按 `01b86dd` 现取）

| URL 形态                                         | 索引    | 依据                                                                                            |
| ------------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------- |
| `/`                                              | 可索引  | 固定入口                                                                                        |
| `/shikaku/`（无 `?q=`）                          | 可索引  | `render.ts` 目录页                                                                              |
| `/shikaku/?q=…`                                  | noindex | `render.ts:1674`：搜索参数变体                                                                  |
| `/shikaku/{slug}/`（概要）                       | 可索引  | 有事实时                                                                                        |
| `/shikaku/{slug}/{year}/`（年度）                | 可索引  | 该年度有事实时；**无事实的空壳页仍返回 200 但 `noindex`**（`render.ts:1561` 的 `sectionEmpty`） |
| `/shikaku/{slug}/application/`、`/exam-content/` | 可索引  | 该栏目有内容时                                                                                  |
| `/shikaku/{slug}/pass-rate/`                     | 可索引  | 有任一历史统计时（`qualificationSectionHasContent`，`render.ts:1321-1333`）                     |
| `/shikaku/{slug}/pass-rate/?year=YYYY`           | noindex | `render.ts:1561` 第二项：参数筛选变体（product-design 18.2）                                    |
| `/schedule/`（无筛选）                           | 可索引  | 主导航入口                                                                                      |
| `/schedule/?…`（任一筛选）                       | noindex | `render.ts:1989` `noindex: filtered`                                                            |
| `/compare/`（未选资格）                          | 可索引  | `render.ts:2119` 仅在 `selectedCount>0` 时 noindex                                              |
| `/compare/?…`（已选 ≥1）                         | noindex | 同上                                                                                            |
| `/pass-rate/`                                    | 可索引  | 有历史统计时                                                                                    |
| `/pass-rate/?sort=…&order=…`                     | noindex | **本 ADR 新定**：参数变体（G-02），canonical 指 `/pass-rate/`                                   |
| `/updates/`                                      | 可索引  | `render.ts:2519` 仅在 `filtered \|\| page>1` 时 noindex                                         |
| `/updates/?page=N`（N>1）与任一筛选              | noindex | 同上                                                                                            |
| `/guide/`、`/guide/{slug}`                       | 可索引  | 编辑内容                                                                                        |
| `/about/{slug}`（9 页）                          | 可索引  | 编辑内容                                                                                        |
| `/sitemap.xml`、`/robots.txt`                    | 不适用  | 机器文件                                                                                        |
| 错误页、404                                      | noindex | `render.ts:2528`、`:2674`                                                                       |

**`?year=` 一律不收**：`scripts/verify-lib.mjs:149-150` 会对 sitemap 里出现 `?year=` 直接报 `Sitemap lists a parameter-filtered page`，`:380-382` 另有针对 bookkeeping `pass-rate/?year=` 必须含 noindex 的断言。

## 3. 三条已定但尚未实施的决策（2026-11-24 号主拍板）

1. **`/pass-rate/?sort=`／`/pass-rate/` 空表 → `noindex,follow`，canonical 指 `/pass-rate/`**。现状 `apps/web/src/server.ts:280-299` 把 `sort`／`order` 从 `searchParams.get()` 原样传给 `renderPassRateIndex`，既不白名单也不加 noindex；`render.ts:2283` 内部虽有 `passRateSortKeys.includes(...)` 兜底，但兜底只影响排序结果、不影响索引。属修 bug，不是产品判断。
2. **年度空壳页保留 200 + `noindex`，canonical 从自指改指 `/shikaku/{slug}/`**。现状 `render.ts:1519-1524` 的 `canonicalPath` 只按请求的 `year` 拼，不校验该年有没有事实，于是 `/2025/`、`/2027/`、`/2030/` 这类空壳页既 200 又 canonical 自指。选这个方案而不是 301／404：纯元数据改动、零 URL 行为风险；301 会让搜「2027 年日程」的用户落到概要页，404 太激进。
3. **9 组无尾斜杠 URL 不做 301**。先只查 canonical 是否已归一（`canonicalHref()` 生成的都是带尾斜杠版），canonical 已归一就说明重复风险已被缓解；加 301 改的是 URL 行为，风险远高于改 canonical。

## 4. 明确不做的

- **不做**无尾斜杠 → 带尾斜杠的 301 跳转（同上第 3 条）。
- **不改**无筛选 `/schedule/` 空态的索引状态：它是主导航入口，不是搜索落地目标；noindex 导航页会削弱站点结构。要补的是「为什么没有 + 数据来源」说明。
- **不删** 3 个薄 pass-rate 页（`/shikaku/{slug}/pass-rate/` 的单年版本）出 sitemap：它们有真实 approved facts 的单年合格率，不是空页；同模板相似度高的问题靠补「数据来源／统计口径／为何只有单年」解决。
- **不改** API 降级分层：API 不可达 → 502；可达但无数据 → 200 空态 + `noindex`。现有分层是对的，要补的只是 502 页缺搜索框的 UX。

## 5. 实现约束

- `noindex` 只在 `apps/web/src/layout.ts:251-253` 一处输出 `<meta name="robots" content="noindex,follow">`；`layout.ts:258-260` 在 noindex 时把 `structuredData` 置空。**不要在页面模板里另写 robots meta**。
- 任何索引状态改动必须同批改 `scripts/verify-lib.mjs` 的断言与 `tests/web-sitemap.test.ts`／`tests/web-render.test.ts`，否则 CI 的 `verify:all` 会红在 indexable↔listed 不等价。
- sitemap 的路径来源只有两处：`apps/web/src/server.ts:197-208` 的 `stablePaths`（含 `editorialComparisonSlugs`／`editorialGuideSlugs`／`editorialAboutSlugs` 展开）与 `:215-221` 追加的 `sitemapQualificationPaths`。新增可索引页面必须同时改这两处之一。
- `apps/web/src/sitemap.ts` 的 `sitemapQualificationPaths(slug, status, content)` 只对 `verified`／`partially_announced` 输出路径，并按 `qualificationSitemapContent`（`render.ts:1335-1346`）决定是否收 pass-rate 与年度路径。
