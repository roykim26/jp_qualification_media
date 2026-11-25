# `/pass-rate/` 年过滤器测试（G-15）

**日期**：2026-11-25
**范围**：只加测试，不改运行时源码。
**结论**：`?year=` 这条路径此前**没有任何进程级测试**；现已补上 5 条，并用 5 个变异证明它们真的会失败。

---

## 0. Git 基线

| 项              | 值                                             |
| --------------- | ---------------------------------------------- |
| 分支            | `chore/phase1-baseline`                        |
| 执行前 HEAD     | `58e6ad1`（`fix(web): 闭合审计 P0 信任缺陷…`） |
| 本轮内容 commit | `<CONTENT_SHA>`（第二段回填这一行）            |
| 改动文件        | `tests/web-routes.test.ts`（+174 / −1）        |

两段式：第一段提交测试，第二段把上面那行的占位换成真实 hash。

---

## 1. 为什么这条路径需要单独的测试

`?year=` 的 SEO 行为由两个**互相独立**的输入决定，都在 `apps/web/src/render.ts`：

```ts
// :1439
sectionEmpty = sortedFacts.length === 0 && !historyTables;
// :1568
noindex: sectionEmpty || (section === 'pass-rate' && year !== undefined),
```

这意味着：

- 如果 `?year=` 那一半退化成 `false`，而 `sectionEmpty` 那一半还工作，那么**所有** `?year=` 用例仍然会通过——只要测试数据恰好让页面为空。
- 反过来，如果 `sectionEmpty` 退化，而 `?year=` 那一半还在，基础页会莫名其妙变成 `noindex`，但 `?year=` 用例不受影响。

已有的覆盖分散在三处，都不是进程级：

| 位置                                                   | 覆盖了什么                        |
| ------------------------------------------------------ | --------------------------------- |
| `scripts/verify-lib.mjs:360-410`                       | sitemap 与 indexable 的一致性断言 |
| `scripts/docker-smoke.mjs:408-450`                     | 冒烟时的 HTTP 状态码              |
| `tests/web-render.test.ts:1458/:1466/:1647/:1845-1848` | 直接调渲染函数，不经 HTTP         |

`tests/web-routes.test.ts` 这个**唯一会起真实 HTTP 服务**的文件，对 `?year=` 是零覆盖。G-15 记的就是这个缺口。

---

## 2. 测试数据的设计（这一步最容易做错）

第一版我用了 `fee`（2025）当「基础页有、`?year=2025` 没有」的差异锚点，**两条用例直接失败**。

原因：`sectionPageFacts()` 会先按 `sectionConfig['pass-rate'].factKeyPrefixes` 过滤，而这个清单是

```ts
[
  'pass_rate',
  'passing_standard',
  'pass_mark',
  'applicants',
  'examinees',
  'passed',
];
```

`fee` 不在里面，**永远不会渲染成卡片**。所以那条 `toContain('6,000円（2024年度）')` 断言的是页面上根本不可能出现的东西。

改用 `passing_standard`：它在 `factKeyPrefixes` 里（会成为卡片），又**不在** `historyNumericKeys`（`['applicants','examinees','passed','pass_rate']`）里（不会进历史表）。于是它成为唯一一条「基础页作为卡片出现、`?year=2025` 时消失」的事实。

同时必须让视图带**至少一条** `historyNumericKeys` 的事实，否则：

```
renderHistoryTables() → '' → historyTables === '' → sectionEmpty === true
→ 基础页也 noindex
```

那样测试会「通过」，但它证明的是「空页不可索引」，而不是「`?year=` 参数不可索引」。这就是 `historyFact()` 那个构造函数存在的理由，我在它的 doc comment 里写清了这一点。

最终的 `yearFilterFacts()`：

```ts
historyFact('it-passport', 2024, 'pass_rate', '50.0%'),          // 让历史表非空
historyFact('it-passport', 2025, 'pass_rate', '55.0%'),
historyFact('it-passport', 2024, 'passing_standard', '600点（2024年度）'), // 卡片差异锚点
```

---

## 3. 五条用例

| #   | 用例                                                                   | 断言                                                                      |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | `keeps the bare section indexable and canonical to itself`             | 无 `noindex`；canonical = `/shikaku/it-passport/pass-rate/`；含 2024 卡片 |
| 2   | `marks ?year= noindex and canonical to the bare section`               | `noindex,follow`；canonical 仍是基础页；**不含** 2024 卡片                |
| 3   | `ignores a year that is not four digits`                               | `?year=abc` 与基础页完全一致（无 `noindex`、含 2024 卡片）                |
| 4   | `marks the bare section noindex when it has nothing to show`           | `stubMode='empty'` 时基础页 `noindex,follow`                              |
| 5   | `marks an empty year noindex while still rendering the history tables` | `?year=9999` → `noindex,follow`、无卡片、**仍有历史表**                   |

第 5 条是关键的判别器：`?year=9999` 一张卡片都没有，但历史表是从**全部** facts 渲染的（`render.ts:1392` 传的是 `view.facts`，不是过滤后的集合），所以页面非空。它的 `noindex` **不可能**由 `sectionEmpty` 解释——只能是 `?year=` 那一半。没有这条，第 2 条用例无法区分两个原因。

第 4 条补的是另一半：没有它，`sectionEmpty` 那一半可以退化成常量 `false` 而其余四条全绿。

---

## 4. 变异验证

`var/mutate-year-filter.mjs`（临时脚本，不入库）。每个变异先确认**真的落盘**（读回比对），再跑 `tests/web-routes.test.ts`，只有测试失败才算抓住。

| #   | 变异                                                                               | 结果 |
| --- | ---------------------------------------------------------------------------------- | ---- |
| 1   | `noindex: sectionEmpty,`（去掉 `?year=` 那一半）                                   | 抓住 |
| 2   | `noindex: (section === 'pass-rate' && year !== undefined),`（去掉 `sectionEmpty`） | 抓住 |
| 3   | canonical 拼上 `?year=`                                                            | 抓住 |
| 4   | 历史表也跟着 `year` 过滤                                                           | 抓住 |
| 5   | `(requestedYear === null ? undefined : Number(requestedYear))`（接受非四位年份）   | 抓住 |

**5/5，`problems: []`，`restored: true`。**

第一版只落地了 1 个变异，另外 4 个报 `pattern not found`——因为我按记忆写了跨行的模式串。改成从源码逐字复制的单行片段后全部命中。**这个坑值得记住：变异没落地时的现象是「测试没失败」，看起来和「测试没覆盖」一模一样。** 所以脚本必须先读回确认。

---

## 5. 矩阵

| 检查                                        | 结果                            |
| ------------------------------------------- | ------------------------------- |
| `tsc -p tsconfig.json --noEmit`             | 0                               |
| `vitest run tests`（单线程池）              | **31 files / 520 tests passed** |
| `node --test`（7 个 `.mjs` 门禁文件）       | **107 pass / 0 fail**           |
| `eslint . --ignore-pattern "Python/**"`     | 0                               |
| `prettier --check tests/web-routes.test.ts` | 0                               |
| `node scripts/check-repo-hygiene.mjs`       | 0（337 文件干净）               |

`tests/web-routes.test.ts` 从 23 条用例增至 28 条。

---

## 6. 未处理

1. **`?sort=` / `?order=` 在 `/shikaku/:slug/pass-rate/` 上的行为没有测试。** 索引页 `/pass-rate/` 的排序参数已有覆盖（`tests/web-routes.test.ts:397`），但章节页的 `?year=` 与排序参数组合起来是什么语义，代码里没有分支，也就没有测试。这属于「没写就不用测」还是「应该有明确语义」，需要产品判断。
2. **`?year=` 与 `?sort=` 同时出现时的 canonical 只有一条。** 当前 canonical 固定去掉所有查询参数，这在只有一个参数时是对的；两个参数叠加时是否仍应 canonical 到基础页，ADR 0002 §2 没有明说。
3. **`navigationYear` 的上界没有测试。** `render.ts:1389` 是 `year ?? Math.max(...availableYears, 2026)`，如果 facts 里出现未来年份，年份导航会跟着走，但没有用例锁定这个行为。

---

## 7. 风险

| 风险                                                | 影响                                        | 缓解                                                                                     |
| --------------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 测试依赖 stub 的 facts 形状                         | stub 改动后断言可能失效而不报错             | `historyFact()` 的字段与 `PublicFact` 对齐；`isQualificationView` 会先拦掉形状不对的响应 |
| `?year=9999` 依赖「历史表用全部 facts」这个实现细节 | 若将来改成按年过滤历史表，第 5 条会失败     | 这正是它要守的行为，失败即是信号                                                         |
| 只测了 `it-passport`                                | 其他资格的 `pass-rate` 章节若有特殊分支会漏 | 章节渲染是同一函数，无按资格的 `pass-rate` 分支                                          |

---

## 8. 下一步建议

1. **P1 — 决定 `?sort=` 在章节页的语义**（§6 第 1 条）。当前是「静默忽略」，要么明确忽略并加测试，要么明确支持。
2. **P3 — 生产跑一次 patrol**，消掉 `coverageGap: not_run`（两条路径的取舍见 `docs/audit/COVERAGE_GAP_CAPTURE_ONLY_2026-11-25.md` §8，需 Owner 决策）。
3. **P3 — 补 `it-passport` 的 `delivery_mode` 标签**（`docs/audit/MVP_DIMENSION_MISMATCH_2026-11-25.md`），验收信号是 `dimensionMismatchGaps` 归零、`missingDataGaps` 仍为 12。
4. **P4 — 404 噪声过滤**：生产 access log 里 36.8% 是扫描器请求，会淹没真实错误。

---

## 9. 停止声明

本轮只做了 G-15 这一项：**加测试，不改运行时源码**。

没有做：`?sort=` 语义变更、patrol、数据补标签、404 过滤、任何生产部署。

下一步由 Owner 决定。
