# 巡检覆盖缺口剔除 capture-only 噪声

## 0. Git 基线

| 项目            | 值                            |
| --------------- | ----------------------------- |
| 分支            | `chore/phase1-baseline`       |
| 执行前 HEAD     | `8dd019f`                     |
| 本轮内容 commit | `a31f3a1`（第二段回填这一行） |
| 生产运行版本    | `9d793c9`（本轮改动尚未部署） |

两段式提交：第一段提交内容（`a31f3a1`），第二段把上面那行的占位换成真实 hash。
原因是提交信息不能包含自己的 hash，而报告正文要引用它。

## 1. 摘要

`scripts/ops-daily-lib.mjs` 的 `computeCoverageGap()` 把巡检清单里所有「库里没有」的
来源都报成缺口。其中 9 条是 `capture-only:` 前缀的抓取存档来源，按设计永不入库
（`docs/work-package-g-provenance-projection-design.md:89`：不把 capture-only 内容写入
候选或批准链）。结果是「巡检清单有但库未登记」这一行每天固定列 9 个 id。

这不是数据问题，是**报告噪声**：一段每天都列出同样九条、且永远不需要处理的内容，
会训练读者跳过整段。与 404 扫描器噪声、`status:'ok'` 语义混淆属于同一类失效——
不是错，但让人看不见真正的问题。

本轮把 capture-only 从缺口里剔除，单独计数并在 markdown 里如实说明。

## 2. 为什么现在才做

`docs/audit/DEPLOY_3A_3M_REPORT_2026-11-25.md` §10.3 记录生产上 `coverageGap` 恒为
`not_run`，因为 `var/patrol/registry.json` 从未生成过。这一项在生产上是**空**的，
所以没人看到那 9 条噪声。

本轮为了评估「生产跑一次 patrol」的代价，在本地离线生成了 registry
（`services/collector/src/collector/source_registry.py` 只依赖代码里的来源常量，
不抓网、不连库，两次运行 sha256 相同），这才第一次用真实数据看到
`computeCoverageGap` 的输出：

```
missingFromRegistry: []
missingFromDatabase: 9 条，全部以 capture-only: 开头
```

换句话说：**这个缺陷在生产上是潜伏的，一旦 patrol 真跑起来就会每天出现。**

## 3. 改动内容

### 3.1 `scripts/ops-daily-lib.mjs` — `computeCoverageGap()`

签名从 `(dbSourceIds, registrySourceIds)` 改为 `(dbSourceIds, registry)`，第二个参数
收整个 registry 对象而不是 id 列表——`capture_only` 标记在值里。

```js
export function computeCoverageGap(dbSourceIds, registry) {
  if (Array.isArray(registry)) {
    throw new TypeError(
      'computeCoverageGap expects the parsed registry object (capture_only lives in it), not a list of ids',
    );
  }
  const database = new Set(dbSourceIds);
  const registeredIds = Object.keys(registry ?? {});
  const inRegistry = new Set(registeredIds);
  const captureOnlyIds = new Set(
    registeredIds.filter((id) => registry[id]?.capture_only === true),
  );
  return {
    status: 'ok',
    missingFromRegistry: dbSourceIds.filter((id) => !inRegistry.has(id)),
    missingFromDatabase: registeredIds.filter(
      (id) => !database.has(id) && !captureOnlyIds.has(id),
    ),
    captureOnly: captureOnlyIds.size,
  };
}
```

三个设计决定：

1. **`captureOnly` 是计数不是列表。** 它是「按设计如此」，不是待办事项。给出列表会
   诱使读者去逐条核对，而核对的结果永远是「确实不该入库」。
2. **缺 `capture_only` 字段的条目按「应入库」处理**（`=== true` 才算 capture-only）。
   旧 registry 早于这个字段，把缺字段当成 capture-only 会**掩盖**真正该入库却没入库
   的来源。
3. **收到数组直接抛错。** 只把 `Object.keys()` 传进来正是产生这批噪声的原因，与其
   静默退回旧行为，不如让调用方立刻失败。

### 3.2 `scripts/ops-daily-report.mjs`

```diff
-      Object.keys(registry),
+      registry,
```

### 3.3 `scripts/ops-daily-lib.mjs` — `renderMarkdown()`

「## 巡检覆盖缺口」段在「巡检清单有但库未登记」之后增加一行（仅当计数大于 0）：

```
另有 9 个 capture-only 来源按设计不入库（只抓取存档，不写候选链）
```

理由：如果只把 9 条从缺口里删掉，读者看到「库未登记：无」会无法判断这一段是**检查过**
它们，还是**漏掉**了它们。写出计数与理由，两个问题都答了。

## 4. 测试

`scripts/ops-daily-lib.test.mjs` 新增 6 条用例（原 25 → 31）：

| 用例                                                                      | 断言什么                                                            |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `coverage gap reports both directions`（改）                              | 两个方向仍各自成立，`captureOnly` 为 0                              |
| `capture-only sources are counted, never reported as missing`             | 2 条 capture-only → `missingFromDatabase` 为空、`captureOnly === 2` |
| `a registry entry without the capture_only flag is treated as a real gap` | `{}` 条目仍进 `missingFromDatabase`                                 |
| `a capture-only source still reports when the database has it`            | 两个方向独立：capture-only 进了库，`missingFromRegistry` 仍能报     |
| `coverage gap refuses a bare list of ids`                                 | 传数组抛 `TypeError`                                                |
| `markdown says capture-only sources are out of scope by design`           | markdown 含「9 个 capture-only 来源按设计不入库」                   |
| `markdown omits the capture-only line when there are none`                | 计数为 0 时不出现该行                                               |

### 4.1 变异验证

`var/mutate-coverage-gap.mjs`，6 个变异，**6/6 全抓**，`RESTORED=true`，
`MUTATION_PROBLEMS=[]`：

| 变异                                   | 被哪条用例抓住                                                            |
| -------------------------------------- | ------------------------------------------------------------------------- |
| 把 capture-only 重新算进缺口           | `capture-only sources are counted, never reported as missing`             |
| 把每个清单条目都当 capture-only        | `coverage gap reports both directions`                                    |
| 缺字段也当 capture-only（`!== false`） | `a registry entry without the capture_only flag is treated as a real gap` |
| `captureOnly` 恒为 0                   | `capture-only sources are counted...`（计数断言）                         |
| 不再拒绝数组入参                       | `coverage gap refuses a bare list of ids`                                 |
| markdown 不再解释计数                  | `markdown says capture-only sources are out of scope by design`           |

第三个变异是本轮最值得留的一条：`capture_only === true` 与 `capture_only !== false`
在**当前**数据上输出相同（现有 registry 每条都带这个字段），只有「缺字段」那条用例
能把它们分开。这与 3J 的教训同族——**被兜底逻辑吸收的差异，测试数据必须显式构造出
那个边界。**

## 5. 全量矩阵

| 检查        | 命令                                                                 | 结果                      |
| ----------- | -------------------------------------------------------------------- | ------------------------- |
| 类型        | `tsc -p tsconfig.json --noEmit`                                      | `TSC=0`                   |
| 单元测试    | `vitest run tests --pool=threads --poolOptions.threads.singleThread` | **30 files / 506 passed** |
| verify-gate | `node --test` 五个 `.mjs`                                            | **81 pass / 0 fail**      |
| 格式        | `prettier --check "apps/**/*.ts" "tests/**/*.ts" "scripts/**/*.mjs"` | `FMT=0`                   |
| lint        | `eslint . --ignore-pattern "Python/**"`                              | `LINT=0`                  |

## 6. 真实数据验证

用本地库（`postgresql://postgres@127.0.0.1:55432/qualification_media`，`sources` 表 52 行）
与 2026-11-12 那次真巡检留下的 `var/patrol/registry.json`（60 条）跑
`node scripts/ops-daily-report.mjs`：

```json
"coverageGap": {
  "status": "ok",
  "missingFromRegistry": ["source:fundamental-it:statistics-fe-suiihyo"],
  "missingFromDatabase": [],
  "captureOnly": 9
}
```

markdown 对应段落：

```
## 巡检覆盖缺口

库有登记但巡检清单缺失：source:fundamental-it:statistics-fe-suiihyo
巡检清单有但库未登记：无
另有 9 个 capture-only 来源按设计不入库（只抓取存档，不写候选链）
```

`missingFromDatabase` 从 9 条降到 0，`captureOnly` 是 9。

### 6.1 顺带发现的真缺口

`missingFromRegistry` 出现 `source:fundamental-it:statistics-fe-suiihyo`，不是本轮
引入的。原因是 **`var/patrol/registry.json` 是 2026-11-12 的，而 Sprint 2A 的 202610
迁移后来新增了这个来源**。用当前代码离线生成的 registry 是 61 条，包含它：

```
var/patrol/registry.json  keys=60  missingFromRegistry=["source:fundamental-it:statistics-fe-suiihyo"]
var/registry-a.json       keys=61  missingFromRegistry=[]
```

**这正是「巡检清单过期」这个检查应该抓到的东西——它工作了。** 但要注意它之所以
能被看到，是因为本地恰好有一份 11-12 的旧 registry；生产上 registry 根本不存在，
这一项是 `not_run`，所以这个真缺口在生产上同样不可见。

## 7. 未处理

1. **生产 `coverageGap` 仍是 `not_run`。** 本轮只修了「有了 registry 之后会怎么算」，
   没有在生产生成 registry。两条路径的取舍需要 Owner 决定（见 §8）。
2. **`summary.coverageGap` 语义未变**，仍只取 `missingFromRegistry.length`。
   capture-only 不进任何 summary 字段，只在明细与 markdown 里出现。这是有意的：
   加一个 `summary.captureOnly` 会让它看起来像个指标，而它其实是个常数。
3. **`audit-mvp` 的 22 个覆盖缺口未处理**（既有问题，与本轮无关）。
4. **三份来路未确认的 DSH 延迟基线文件仍未跟踪**
   （`docs/audit/DSH_LATENCY_BASELINE_2026-11-25.json`/`.md`、`scripts/dsh-latency-audit.mjs`）。

## 8. 生产跑 patrol 的两条路径（需 Owner 决策）

|                    | 路径 A：真跑 `patrol:sources`                                                                  | 路径 B：只生成 registry                                |
| ------------------ | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 做什么             | 实抓 61 个官方源，写 `var/patrol/` 与 `var/official-snapshots/`                                | 只写 `var/patrol/registry.json`                        |
| 前置               | 生产装 Python 3.12 + httpx/bs4/lxml/pydantic/psycopg/pypdf/openpyxl（宿主机只有 3.6.8 与 3.8） | 无（离线、确定性、不抓网、不连库）                     |
| 出网               | 是，61 个官方站                                                                                | 否                                                     |
| 耗时               | 数十分钟量级                                                                                   | 毫秒级                                                 |
| `coverageGap` 结果 | 真值                                                                                           | 真值（但 `patrol-report.json` 不存在）                 |
| 诚实性             | 完整                                                                                           | **会让日检显示「已巡检」，而实际没有任何来源被检查过** |

**路径 B 的诚实性问题与 `status:'ok'` 那个坑同族**：`registry.json` 的语义是「最后一次
巡检的注册表」，凭空写一份会让「巡检覆盖缺口」这一项从「未检查」变成「无缺口」，
而真正的巡检从未发生。`coverageGap` 会显示得很好看，但没有任何来源被验证过。

因此本轮**没有**在生产写 registry，也没有抓任何官方站。

## 9. 风险

| 风险                                                    | 影响                       | 缓解                                                                                              |
| ------------------------------------------------------- | -------------------------- | ------------------------------------------------------------------------------------------------- |
| 未来的 registry 用别的方式生成，`capture_only` 字段丢失 | 9 条噪声重新出现           | `=== true` 的保守默认会把它们当真实缺口报出来（宁可吵，不可掩盖）                                 |
| 有人把 `computeCoverageGap` 改回收数组                  | 静默退回旧行为             | 显式 `TypeError` + 对应用例                                                                       |
| capture-only 来源将来真的要入库                         | 它们被错误地排除在缺口之外 | 需同时改 `docs/work-package-g-provenance-projection-design.md` 的设计与三份来源常量，不会悄悄发生 |

## 10. 下一步建议

1. **P1 — Owner 决策 §8 的两条路径**，然后让 `coverageGap` 有真值。
2. **P2 — 把 `chore/phase1-baseline` 落到 `main`**（`origin/main` 仍 `01b86dd`，已 60+
   commits ahead，需授权 merge）。
3. **P3 — 给 patrol 加一条「registry 过期」检查**：registry 里缺了库里有的来源时，
   除了报 `missingFromRegistry`，还应该指出「registry 可能过期了，重跑 patrol」，
   否则读者会以为是来源配置漏了。本轮 §6.1 那个 `statistics-fe-suiihyo` 就是这种情形。
4. **P3 — `audit-mvp` 22 个覆盖缺口**的处置决策。
5. **P3 — 统一博客域名两层安全头**（Caddy site block + blog 容器 nginx 叠加）。

## 11. 停止声明

本轮只改 `computeCoverageGap` 的入参形状与 capture-only 分类、markdown 的一行说明、
以及对应测试。没有改 patrol 本身，没有抓任何官方站，没有连生产库，没有在生产写
`registry.json`，没有改 `summary.coverageGap` 语义，没有改 schema、URL、首页、资格页。

生产部署、`main` 合并、生产跑 patrol 都需要 Owner 单独授权。
