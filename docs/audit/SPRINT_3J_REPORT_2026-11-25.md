# SPRINT 3J 执行报告 — G-15 路由层测试缺口

日期：2026-11-25
分支：`chore/phase1-baseline`
执行工具：DeepSeek Harness

---

## 1. 执行摘要

补齐 G-15：`apps/web/src/server.ts` 的 22 条路由分支首次获得进程级测试。

新增 `tests/web-routes.test.ts`，**23 个用例**，覆盖每一条路由的**正常路径**——状态码、content-type、canonical/noindex 对、一个能证明渲染对了的标题标记。已有 `tests/web-server.test.ts` 的 12 个用例保持不动，那 12 条管的是上游故障语义（200/503、超时、sitemap 错误体）。

**没有修改任何运行时源码。** 本轮只加测试，任务文档 §5 明确禁止改 `server.ts`。

两件超出「写测试」范围的事，都记在 §6：

1. 用**变异测试**验证这些断言真的有牙——造 9 个真实缺陷，7 个当场被抓住，**2 个没抓住**，说明两处断言写得太松，已修好并复验。
2. 我的第一版测试**污染了后续测试文件的环境变量**，导致 `web-render.test.ts` 3 个用例在整套跑时失败、单独跑时通过。修好后全绿。

---

## 2. Git 状态与基线

执行前 HEAD：`a15ccb5` `docs: 落账 Sprint 3I 执行报告`，工作树干净。

本轮内容 commit：**`5ff986a`** `test(web): 补齐 G-15 路由层测试缺口（Sprint 3J）`

报告里引用自己的 commit hash 有天然循环依赖，所以照 3A 起的惯例拆两段：先提内容，再回填本行做一次 `docs: 落账` 收口 commit。

工作树变化（全部为新增，无修改）：

| 状态 | 文件                                            |
| ---- | ----------------------------------------------- |
| `??` | `docs/audit/DEEPSEEK_HARNESS_SPRINT_3J_TASK.md` |
| `??` | `tests/web-routes.test.ts`                      |

---

## 3. 修改文件

| 文件                                            | 变化        | 说明                     |
| ----------------------------------------------- | ----------- | ------------------------ |
| `tests/web-routes.test.ts`                      | 新增 523 行 | 23 个用例，8 个 describe |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3J_TASK.md` | 新增 105 行 | 任务文档                 |

运行时源码、`deploy/`、`package.json`、`tests/web-server.test.ts`：**零改动**。

---

## 4. 覆盖矩阵

`server.ts` 的 22 条分支，逐条对应：

| #   | 路由                                                    | 用例                                       | 断言                                                                          |
| --- | ------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| 1   | `/images/{name}`（白名单内）                            | 白名单图片带类型与长缓存                   | 200 / `image/png` / `cache-control: max-age` / 非空 body                      |
| 2   | `/images/{name}`（白名单外）                            | 白名单外的图片名 404                       | 404（两种：模式不匹配 + 模式匹配但不在表内）                                  |
| 3   | `/assets/{hash}.css`（正确 hash）                       | 只在哈希路径提供样式表                     | 200 / `text/css` / `immutable`                                                |
| 4   | `/assets/{hash}.css`（错误 hash）                       | 同上                                       | 404 / `text/plain`                                                            |
| 5   | `/robots.txt`                                           | robots.txt 指向配置的 origin               | 200 / `text/plain` / `Sitemap: https://example.test/sitemap.xml` / `Allow: /` |
| 6   | `/sitemap.xml`                                          | sitemap 列出稳定路由与每个已上线资格       | 200 / `application/xml` / 6 条稳定路径 + 每个 slug 的 overview                |
| 7   | `/shikaku/`                                             | 目录页有 canonical、无 noindex             | 200 / `text/html` / `rel="canonical"` / 无 `noindex`                          |
| 8   | `/shikaku/?q=`                                          | 搜索结果 noindex 但 canonical 仍指目录     | 200 / `検索結果` / `noindex,follow`                                           |
| 9   | `/shikaku/{slug}/`                                      | 每个 section 都 200                        | 200 / `text/html` / 含资格名                                                  |
| 10  | `/shikaku/{slug}/application/`                          | 同上                                       | 同上                                                                          |
| 11  | `/shikaku/{slug}/exam-content/`                         | 同上                                       | 同上                                                                          |
| 12  | `/shikaku/{slug}/pass-rate/`                            | 同上                                       | 同上                                                                          |
| 13  | `/shikaku/{slug}/{year}/`                               | 同上                                       | 同上                                                                          |
| 14  | `/shikaku/{非白名单 slug}/`                             | 白名单外 slug 404                          | 404 / `ページが見つかりません`                                                |
| 15  | `/schedule/`                                            | 日程页带 canonical                         | 200 / canonical 指 `https://example.test/schedule/`                           |
| 16  | `/compare/`                                             | 比较页                                     | 200 / canonical 指 `/compare/`                                                |
| 17  | `/guide/`                                               | 指南索引                                   | 200 / canonical 指 `/guide/`                                                  |
| 18  | `/updates/`                                             | 更新页                                     | 200 / canonical 指 `/updates/`                                                |
| 19  | `/pass-rate/`（基础）                                   | 基础表格保持可索引                         | 200 / canonical 指 `/pass-rate/` / 无 noindex                                 |
| 20  | `/pass-rate/?sort=` `?order=` `?sort&order`             | 每个参数变体 noindex 但 canonical 回基础页 | 3 条路径各断言 `noindex,follow` + canonical                                   |
| 21  | `/about/{slug}`                                         | 每个 about 页都 200                        | 200 / canonical 指 `/about/{slug}/`（遍历全部 slug）                          |
| 22  | `/compare/{slug}`                                       | 每个比较指南都 200                         | 200 / canonical 指 `/compare/{slug}/`（遍历全部 slug）                        |
| 23  | `/guide/{slug}`                                         | 每个指南都 200                             | 200 / canonical 指 `/guide/{slug}/`（遍历全部 slug）                          |
| 24  | `/about/{不存在}` `/compare/{不存在}` `/guide/{不存在}` | 编辑页 slug 不存在时 404                   | 3 条路径各 404 / `ページが見つかりません`                                     |
| 25  | `/ics/{slug}/{year}.ics`                                | ICS 下载转发上游 content-type              | 200 / `method=PUBLISH`（见 §6.2）/ `attachment` / `BEGIN:VCALENDAR`           |
| 26  | `/ics/month/{yyyy-mm}.ics`                              | 月历 feed                                  | 200 / `BEGIN:VCALENDAR`                                                       |
| 27  | `/`                                                     | 首页带 canonical                           | 200 / canonical 指 `https://example.test/`                                    |
| 28  | 未匹配路径                                              | 未知路径 404                               | 404 / `text/html` / `ページが見つかりません`                                  |

### 4.1 明确不覆盖

- **故障语义**：仍由 `tests/web-server.test.ts` 的 12 个用例负责，本轮不重复。
- **整页 HTML 结构**：由 `tests/web-render.test.ts` 的 77 个用例负责。在这里做整页快照会让每次样式改动都失败一条路由测试，教人闭眼更新快照。
- **数据库**：stub API 返回内存 JSON，与既有 `web-server.test.ts` 一致。
- **上游 502 兜底**（`server.ts:592`）：需要上游抛非 `UpstreamUnavailableError` 的异常才能触发，本轮未造该场景，见 §8。

---

## 5. 测试结果

| 检查                                    | 结果                                                                                                             | 退出码 |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------ |
| `tests/web-routes.test.ts`              | 23 passed                                                                                                        | 0      |
| `pnpm test`                             | **27 files / 368 tests**（3I 时 26 files / 345 tests）                                                           | 0      |
| `pnpm typecheck`                        | 无输出                                                                                                           | 0      |
| `pnpm test:verify-gate`                 | 51 pass / 0 fail                                                                                                 | 0      |
| `pnpm build`                            | 无输出                                                                                                           | 0      |
| `pnpm format:check`                     | All matched files use Prettier code style                                                                        | 0      |
| `eslint . --ignore-pattern "Python/**"` | 无输出                                                                                                           | 0      |
| `pnpm test:python`                      | 239 passed                                                                                                       | 0      |
| `pnpm verify:all`                       | 6 个资格全过，`errors: []`                                                                                       | 0      |
| `pnpm smoke:docker`                     | 11 项 ok（含 `pass-rate sort variants stay noindex`、`year filter stays noindex`、`unknown qualifications 404`） | 0      |

---

## 6. 变异测试：这些断言真的有牙吗

写完测试全部通过，只能证明「代码现在是对的」。要证明「测试能发现代码变坏」，得故意把代码改坏。

做法：对 `apps/web/src/server.ts` 施加单点改动 → 跑 `tests/web-routes.test.ts` → `git restore --source=HEAD --` 还原。每轮结束都确认 `git status` 干净。

| #   | 变异                                                          | 预期失败用例           | 首轮结果  |
| --- | ------------------------------------------------------------- | ---------------------- | --------- |
| 1   | `/pass-rate/` 的 `noindex: query.noindex` → `false`           | 参数变体 noindex       | ✅ 抓住   |
| 2   | 资格 slug 白名单 `.concat([slug])`（任何 slug 都放行）        | 白名单外 slug 404      | ✅ 抓住   |
| 3   | 图片白名单 `STATIC_IMAGES[x] ?? 'image/png'`（未列名也放行）  | 白名单外图片 404       | ❌ **漏** |
| 4   | 目录页忽略 `?q=`（`renderQualificationDirectory(items, '')`） | 搜索结果 noindex       | ✅ 抓住   |
| 5   | `robots.txt` 的 `Sitemap:` 改成相对路径                       | robots 指向 origin     | ✅ 抓住   |
| 6   | ICS 代理强制用本地默认 content-type                           | ICS 转发上游类型       | ❌ **漏** |
| 7   | `/about/{不存在}` 回落到 `sources` 页                         | 编辑页 slug 404        | ✅ 抓住   |
| 8   | `/pass-rate/` 基础页 `noindex: true`                          | 基础表格保持可索引     | ✅ 抓住   |
| 9   | 样式表 hash 校验 `if (false)`（任何 hash 都 200）             | 只在哈希路径提供样式表 | ✅ 抓住   |

**7 抓 2 漏。** 两处漏网都出在「测试值域比代码分支宽」：

### 6.1 漏网 1：图片白名单

原断言只请求 `/images/../../package.json` —— 这个值连正则 `/^\/images\/([a-z0-9-]+\.(?:png|webp|avif|svg))$/` 都过不了，走的是「模式不匹配」分支。白名单（`STATIC_IMAGES[name]`）本身根本没被考验。

修法：补一条 `/images/not-in-the-whitelist.png` —— 匹配模式、不在表内，这才是白名单负责的拒绝。

### 6.2 漏网 2：ICS content-type

原断言 `expect(content-type).toContain('text/calendar')`，而 stub 返回的和本地兜底默认值都是 `text/calendar; charset=utf-8`。变异把「转发上游」改成「永远用默认」，输出一字不差。

修法：让 stub 返回 `text/calendar; charset=utf-8; method=PUBLISH`，断言 `toContain('method=PUBLISH')` —— 这个标记只有真正转发上游才会有。

**这条教训值得记住**：断言一个「上游值和兜底值相同」的字段等于没断言。凡是被 `??` 兜底的字段，测试数据必须让上游值和兜底值可区分。

---

## 7. 本轮引入并修掉的问题：环境变量泄漏

第一版 `startWeb()` 只设 `process.env.SITE_ORIGIN`，`close()` 不还原。

结果：

- `pnpm exec vitest run tests/web-render.test.ts` → **77 passed**
- `pnpm test`（全套）→ `web-render.test.ts` **3 个用例失败**：`renders a guide with a readable checklist`、`marks parameterized discovery pages as noindex while retaining their canonical URL`、`marks the year-filtered pass-rate page noindex but keeps the base page indexable`

原因：`siteOrigin()`（`server.ts:99`）和 `layout.ts` 的 canonical 拼接都是**每次渲染时重读** `process.env.SITE_ORIGIN`，不是模块加载时读一次。我的测试跑完把 `SITE_ORIGIN=https://example.test` 留在进程里，下一个测试文件渲染出来的 canonical 全成了绝对地址，而它断言的是相对路径。

修法：`startWeb()` 记住进入前的三个变量，`close()` 里逐个还原（`undefined` 就 `delete`）。

这件事本身是个有价值的发现：**`SITE_ORIGIN` 是渲染时读的，不是启动时读的**。3C 的配置门禁只在 production 拦启动，dev/test 下这个变量可以随时变——`web-render.test.ts:1205` 的 `uses the configured public origin for canonical URLs` 正是靠这个行为工作的。所以任何碰它的测试都必须自己收尾。

---

## 8. 未处理问题

1. **上游 502 兜底无测试。** `server.ts:592` 的 `res.writeHead(502)` 只在抛出的异常不是 `UpstreamUnavailableError` 时到达。`fetchUpstream()` 把所有 fetch 失败都包成了 `UpstreamUnavailableError`，所以这条分支在实践中几乎不可达——要么它是死代码，要么存在一条我没想到的路径。**没有为它造测试，因为造不出来就说明它是死代码，而删代码不在本轮范围。** 建议下一轮先确认它是否可达。

2. **`/shikaku/{slug}/{year}/` 只测了有数据的一年（2025）。** 无数据的年份页行为（200 空壳 vs 404）属 G-18 的索引策略问题，没有 ADR 定论，不在本轮假设。

3. **`?page=` 分页边界未测。** `parseUpdatesPage()` 接受 1–10000，越界回落 1。函数本身简单，但「`/updates/?page=0` 返回第一页」这个行为没有被路由层断言。

4. **`/ics` 的 404 分支未测。** 上游 404 → 本地 404 + 找不到页（`server.ts:248-255`）。`web-server.test.ts` 只测了超时 503。

5. **未测 `WEB_HOST` 绑定行为。** 需要在进程级启动真实 listener，与「导入 `handleRequest`」的测试模型冲突。

---

## 9. 风险

| 风险                                                            | 影响           | 缓解                                                                               |
| --------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------- |
| 测试与实现耦合到「字符串标记」而非语义                          | 低             | 断言的是 canonical 链接、noindex meta、页面标题——这些是 SEO 契约本身，不是实现细节 |
| 每个用例起一个真实 HTTP server（23 次）                         | 低             | 整套 `web-routes.test.ts` 2.2s，占全套 368 用例里很小一部分                        |
| stub API 的响应形状可能与真实 API 漂移                          | 中             | `smoke:docker` 与 `verify:all` 打真容器真库，是这一层的兜底                        |
| 遍历 `editorialAboutSlugs` 等导出数组：新增 slug 会自动纳入测试 | 低（这是优点） | 新增编辑页不需要改测试，只要它 404 或 canonical 错就会红                           |

---

## 10. 下一步建议

**P1 — 确认 `server.ts:592` 的 502 兜底是否可达。** 本轮唯一一个「想测但造不出场景」的分支。如果确认不可达，那它是一段永远不执行的错误处理，删掉比留着好（错误处理代码不被执行过，就不能假定它是对的）。

**P2 — 补 `/ics` 的 404 与 `/updates/?page=` 边界。** 都是十几行的增量，属于本轮矩阵里明确留白的两格。

**P3 — `/pass-rate/` 单资格故障观测（3A Task C 的方案 B 触发条件）。** Owner 已定保留方案 A（整页 503），切换条件是「生产观测到 503 中过半由单资格故障引起」。现在没有任何东西在观测这个比例。

**P4 — `/ready` 外部可观测性。** 3D 做完了 `ready:check`，3E 接进了 cron，但 `/ready` 端点本身没有对外暴露，外部监控看不到。

**P5 — Sprint 3A–3J 的代码仍未上生产。** VPS `/opt/jpqm` 是 `main@01b86dd`，只取过两个宿主机脚本。上线属正式发布，需要单独授权。

**另需 Owner 处理**：3I 报告 §10 的 P1（VPS 上装 crontab、跑 `docker compose run` 验证）因**本机无 SSH 凭据**仍无法执行——`~/.ssh` 只有 `known_hosts`，没有私钥。这不是授权问题，是缺凭据。

---

## 11. 停止声明

Sprint 3J 到此停止。

本轮只做 G-15 测试缺口，未触碰运行时源码、未进入 G-16（`change_events` schema 漂移）、未做任何上线动作。下一步由 Owner 根据本报告决定。
