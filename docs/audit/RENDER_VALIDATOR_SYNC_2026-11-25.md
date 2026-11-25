# 渲染器与校验器的字段同步门禁（P6）— 2026-11-25

## 0. Git 基线

| 项              | 值                                                |
| --------------- | ------------------------------------------------- |
| 分支            | `chore/phase1-baseline`                           |
| 执行前 HEAD     | `409078f`（`docs: 回填三份报告里已完成的待办项`） |
| 本轮内容 commit | `e14c85f`（第一段；第二段落账后见下方说明）       |
| 生产运行版本    | `9d793c9`（本次只加测试，无运行时行为变化）       |

## 1. 执行摘要

Sprint 3K 报告 §11 的 P6 是这么写的：

> `render.ts` 解引用与 `isQualificationView` 的同步机制。目前靠人工扫。若
> `render.ts` 新增 `fact.xxx` 解引用，校验不会自动跟上。根治办法是让渲染器的类型收窄
> 把「可空字段」显式标注出来，或加一条静态检查（例如测试里断言
> `isQualificationView` 的字段集 ⊇ `render.ts` 解引用的字段集）。

本轮做了后半句：**加了一条静态检查**，把它变成一个会失败的测试。

`tests/render-validator-sync.test.ts` 读两个源文件，抽出 `render.ts` 里对 `fact.*` 与
`qualification.*` 的读取集合，与 `server.ts` 的 `isQualificationView()` 实际检查的
字段集合比对。渲染器读了、校验器没查、又不在豁免清单里的字段，测试失败。

现在这两个集合完全吻合：渲染器读 15 个 `fact` 字段 + 5 个 `qualification` 字段，
校验器查 7 + 5，差的 8 个全部有明确豁免理由。

## 2. 为什么用文本比对，而不是类型系统

报告里提的第一条路（「让渲染器的类型收窄把可空字段显式标注出来」）是更好的长期方案，
但它解决的是另一个问题，而且在这个代码库里做不到。

`readJson<T>()` 的 `T` 是调用方的一句承诺，不是编译器验证过的事实：

```ts
return readJson<PublicQualificationView>(
  response,
  'qualification',
  isQualificationView,
);
```

`isQualificationView` 的签名是 `(value: unknown) => boolean`，**不是类型谓词**
（`value is PublicQualificationView`）。所以即使把它改成类型谓词，编译器能知道的也只是
「校验器声称这是这个类型」，而校验器到底查了哪些字段，类型系统一样看不见 —— 那正是
3K/3M 里一个个实测出来的东西。

换句话说：类型系统能表达「这个字段可空」，但表达不了「这个字段在运行时被检查过」。
前者是 schema 的事（`packages/schema/src/index.ts` 已经写清楚了），后者才是这里要
防的漂移。所以本测试用文本比对，并在文件头写明了这个取舍。

## 3. 断言的内容

五条：

1. **`checks every fact field the renderer dereferences`** —— `render.ts` 读的
   `fact.*` 字段，要么在 `isQualificationView()` 里被检查，要么在豁免清单里。
2. **`checks every qualification field the renderer dereferences`** —— 同上，
   `qualification.*`。
3. **`every allow-listed field is still read by the renderer`** —— 豁免清单里的字段
   必须真的还在被读。渲染器不再读某个字段时，它的豁免条目就成了没人敢删的死名字。
4. **`every allow-listed field is unchecked, not merely excused`** —— 豁免清单里的
   字段必须**没有**被校验器检查。如果校验器开始查它了，这条豁免就是多余的，而且会
   掩盖真正的理由。
5. **`reads the validator rather than trusting a hand-written copy of it`** —— 给提取
   逻辑本身兜底：断言 `validatedFields()` 确实抽到了 `factKey` / `displayValue` /
   `examYear` / `sourceId` / `sourceSnapshotId` 与 `slug` / `officialNameJa` /
   `aliasesJa` / `field` / `category`。如果哪天 `isQualificationView` 被改名或改到
   解析不了，前两条会拿空集合去比，反而"通过"。

第 5 条是这套测试里最重要的自保：**一个比较空集合的测试永远通过**。我第一版用内联
`node -e` 打印集合时，因为引号转义问题拿到的就是 4 个空集合，如果没有第 5 条，那种
状态下整个测试是绿的。

## 4. 豁免清单与理由

8 个字段，每条都写了「坏值为什么不炸」：

| 字段               | 理由                                                                        |
| ------------------ | --------------------------------------------------------------------------- |
| `deliveryMode`     | schema 里 optional；只进 `.filter(Boolean)` 与 `String()`                   |
| `examComponent`    | 同上                                                                        |
| `examLevelId`      | schema 里 nullable；只进 `.filter(Boolean)` / `String()` / `JSON.stringify` |
| `examSession`      | nullable；读取都在 `if (fact.examSession)` 里，坏值跳过分支而非抛错         |
| `normalizedValue`  | schema 里是 `z.unknown()`；每个读者都先 `typeof ... !== 'string'` 再动      |
| `paymentMethod`    | schema 里 optional；只进 `.filter(Boolean)` 与 `String()`                   |
| `provenanceStatus` | optional enum；只做 `===` 比较，未知值降级成「未确认」                      |
| `providerId`       | schema 里 optional；只进 `.filter(Boolean)` 与 `String()`                   |

这 8 个和 3K/3M 报告里「刻意不校验」的清单是一致的，本轮把它们从注释变成了机器可查的
断言。

## 5. 变异验证

`var/mutate-render-sync.mjs`，5 个变异，全部抓住（`MUTATION_PROBLEMS=0`）：

| 变异                                           | 结果   |
| ---------------------------------------------- | ------ |
| 渲染器新增 `fact.riskLevel` 读取（校验器没查） | CAUGHT |
| 校验器删掉 `fact.sourceSnapshotId` 的检查      | CAUGHT |
| 校验器删掉 `qualification.aliasesJa` 的检查    | CAUGHT |
| 豁免清单里塞一个渲染器从不读的字段             | CAUGHT |
| 校验器开始检查一个已在豁免清单里的字段         | CAUGHT |

### 5.1 第一次跑时漏了一个，原因是变异打偏了

最初第四个变异是「删掉 `render.ts` 里对 `fact.provenanceStatus` 的一处读取」，期望它
变成"不再被读"从而让豁免条目失效。结果 MISSED。

原因不是断言失效，是**变异本身没达到目的**：`provenanceStatus` 在 `render.ts` 里有
五处读取（`:663`、`:665`、`:697`、`:700`、`:719`），删掉一处它仍然被读。这和 3M 那次
「`toContain` 断言在另一个 block 上」是同一类错误：**变异没有真的改到断言关心的那个
性质**。

改成直接往豁免清单里注入 `neverReadAnywhere` 一条之后抓住。变异脚本里留了注释说明
这件事。

## 6. 全量矩阵

| 项                                                                   | 结果                                        |
| -------------------------------------------------------------------- | ------------------------------------------- |
| `vitest run tests --pool=threads --poolOptions.threads.singleThread` | **30 文件 / 470 用例全过**（此前 29 / 465） |
| `tsc -p tsconfig.json --noEmit`                                      | EXIT=0                                      |
| `prettier --check tests/render-validator-sync.test.ts`               | EXIT=0                                      |
| `eslint . --ignore-pattern "Python/**"`                              | EXIT=0                                      |

## 7. 未处理的问题

1. **提取是正则 + 大括号配平，不是真正的解析器**。`fact.x` 出现在字符串字面量或注释里
   会被误算成一次读取 —— 这只会让断言更严格（多要求一个字段被校验），不会放过真问题，
   所以是可接受的保守方向。但如果哪天 `render.ts` 里出现模板字符串拼出的字段访问，
   它抓不到。真正的解析需要引入 TypeScript 编译器 API，那是另一个量级的改动。
2. **`isCalendarEnvelope` / `isComparisonEnvelope` / `isUpdatesEnvelope` 没有同类门禁**。
   本轮只覆盖了 `/shikaku/` 的 `isQualificationView`，因为 3K 报告 §11 P6 指的正是它。
   三条兄弟路由的校验器与它们各自的渲染函数之间同样存在漂移风险（3M 已经实测过这些
   字段的崩/不崩分界），可以照这个模式各加一条。
3. **豁免清单是手写的**。它现在有 4 条断言守着（还在读、确实没被查、名字拼写正确、
   提取逻辑有效），但「理由」那一栏的文本正确性无法自动验证。

## 8. 风险

| 风险                                    | 影响                                   | 缓解                                                                  |
| --------------------------------------- | -------------------------------------- | --------------------------------------------------------------------- |
| 提取逻辑失效后测试静默通过              | 门禁形同虚设                           | 第 5 条断言钉住 10 个已知被校验的字段                                 |
| 有人为了让测试变绿而往豁免清单里塞字段  | 门禁被绕过                             | 每个条目必须写理由；第 4 条断言「确实没被校验」会阻止塞进已校验的字段 |
| 正则把注释/字符串里的 `fact.x` 当成读取 | 误报（要求一个其实没被读的字段被校验） | 偏保守的方向，宁严勿松                                                |

## 9. 下一步建议

1. **P1 — 把 `chore/phase1-baseline` 落到 `main`**（`origin/main` 仍是 `01b86dd`）。
   需要 Owner 授权 merge。这已经是第四次出现在建议里了，它是「生产代码不在主干」这条
   风险的根。
2. **P2 — 给三条兄弟路由各加一条同类门禁**（`isCalendarEnvelope` ↔ `renderSchedulePage`、
   `isComparisonEnvelope` ↔ `renderComparePage`、`isUpdatesEnvelope` ↔ 更新列表渲染）。
   模式已经跑通，剩下的是机械工作。
3. **P2 — 生产跑一次 `patrol`**，消掉 ops 日报里长期的 `coverageGap: not_run`。
4. **P3 — 决定 `audit-mvp` 那 22 个覆盖缺口的处置**（补数据还是写进契约豁免）。
5. **P3 — 统一博客域名两层安全头**。

## 10. 停止声明

本轮只做一件事：把 `render.ts` 与 `isQualificationView` 之间的字段同步从「靠人记」
变成一条会失败的测试。

没有改运行时、没有改校验器的任何一条判断、没有改渲染逻辑、没有碰三条兄弟路由、没有
部署。第 7 节第 2 条是明确划出去的边界，不是遗漏。

下一步由 Owner 按本报告 §9 决定。
