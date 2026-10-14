# 工作包 G：把 805 条簿记历年统计接到「能用」的程度（2026-10-13 方案稿 → **同日第十一轮执行 G-1＋G-2 最小方案（§7）、第十三轮补做 G-2 完整方案（§8，已随 PR #36 进 main＝`9bf7ec8`）**）

> 本文前半（§1–§5）是**方案稿**，§7／§8 是两段**执行记录**。目的：把「863 条簿记事实已批准，但公开面看起来仍像只有 2026 一年」这件事拆成可拍板的三块，每块标清改动面、代码坐标、验收判据与风险。
> §1–§6 的数字是 2026-10-13 第十轮的本机现取（**改动前**基线，取证命令见 §6）；§7 是同日晚些时候 G-1／G-2 最小方案落地后的现取，§8 是第十三轮 G-2 完整方案（枚举加成员＋回填历史）的现取，逐条对照。执行细节与踩坑在 `docs/stage-log.md` 第十一轮与第十三轮。

## 1. 结论先说

1. **数据已经在公开面上了，缺的不是「接入」而是「形态」**。`/api/v1/qualifications/bookkeeping` 返回 **863** 条，其中历年统计 **805** 条；`/shikaku/bookkeeping/pass-rate/` 已经把它们全渲染出来＝**802 张卡片／1,075,312 字节**的平铺列表。所以待办 3 里「接到公开面」这半已经成立，真正不能用的是：没有年份轴、没有級别×回合的表、`exam_session` 对用户不可见。
2. **年度导航与统计是断的**。页面顶部有 25 个年份链接（`availableYears` 由 `exam_year` 去重生成，2002–2026），但它们都指向 `/shikaku/bookkeeping/<年>/`，而 `annual` 这段的 `factKeyPrefixes` 只含日程类字段（`application_open`／`exam_schedule`／`exam_date`／`result_date` …）**不含 `pass_rate`／`applicants`／`examinees`／`passed`** ⇒ 实测 `/shikaku/bookkeeping/2010/` = **0 件事实／57,019 字节**。用户点 2010 年什么都看不到，尽管 2010 年的四个数值都已在库里。
3. **批准这 805 条顺带把更新流打脏了**（新发现的既有缺陷，不只统计类）。`change_events` 全库 **983** 条（簿记 **865**，其中 `schedule_change` **856**＝99%），而 `/updates/` 首页 100 张卡（API 定 `LIMIT 100`）**全是这批统计批准事件**＝`applicants`／`examinees`／`passed`／`pass_rate` **各 25 条**，标签**清一色「日程の変更」**。根因是 `apps/admin/src/server.ts:332-338` 的 `eventTypeForFact()` 只有四个分支＋`schedule_change` 兜底，而枚举 `event_type`（`packages/db/src/schema.ts:38-45`）里 `fee_change`／`eligibility_change`／`system_change` **在簿记分布里计数为 0** ⇒ `fee`、`question_format` 等也一并被误标。

## 2. 现状读数（2026-10-13 本机实测）

### 2.1 库里统计类事实的形状

805 条统计事实按 `級 | 実施方式` 分布（全周期，非只 2026）：

| 級 \| 方式      | `applicants` | `examinees` | `passed` | `pass_rate` | `statistics_methodology` |
| --------------- | ------------ | ----------- | -------- | ----------- | ------------------------ |
| 1 級 \| unified | 49           | 49          | 49       | 49          | 1                        |
| 2 級 \| unified | 72           | 72          | 72       | 72          | 1                        |
| 3 級 \| unified | 72           | 72          | 72       | 72          | 1                        |
| 2 級 \| network | 0            | 0           | 7        | 7           | 1                        |
| 3 級 \| network | 0            | 0           | 7        | 7           | 1                        |

- 回合年份跨度 **2002–2026，25 个不同年份**；`group`（会場一括）方式**一条事实都没有**。
- ネット 只有 `passed`＋`pass_rate`＝已拍板口径（裸「受験者数」不映射），不是数据缺失。
- `statistics_methodology` 全库 **5** 条（ネット两槽合并成 1 条 current，各級统一页各 1 条）。
- 带 `exam_session` 的事实 **772** 条（＝統一表历年那批），其余 91 条该列为 NULL。

### 2.2 公开面实测

| 对象                                   | 读数                                            |
| -------------------------------------- | ----------------------------------------------- |
| `/api/v1/qualifications/bookkeeping`   | **863** 条，JSON **663,144** 字节               |
| `/shikaku/bookkeeping/`（概览）        | **863** 张事实卡，HTML **1,150,946** 字节       |
| `/shikaku/bookkeeping/pass-rate/`      | **802** 张卡（207＋593＋2），HTML **1,075,312** |
| `/shikaku/bookkeeping/2026/`（年度頁） | 15 张卡（只日程类）                             |
| `/shikaku/bookkeeping/2010/`           | **0 张卡**                                      |
| 页面里的回合标识                       | 「回」字出现 **0** 次（`exam_session` 不渲染）  |
| `/updates/`                            | 100 张卡，标签**全是**「日程の変更」            |
| 年份导航                               | 25 个年份 × 2 处导航＝50 个链接，全指年度日程页 |

代码坐标（现状为什么长这样）：

- 年度过滤只对 `annual` 段生效：`apps/web/src/render.ts:587-595`（`(section !== 'annual' || fact.examYear === year)`）。
- 卡片排序只有 `factPriority(factKey)` ＋ `factKey` 字典序：`render.ts:596-600` ⇒ 既不按年也不按級。
- `renderFact()` 的维度徽章只取 `providerId`／`examLevelId`／`examComponent`／`deliveryMode`：`render.ts:505-516` ⇒ **`examSession` 不在其中**。
- `pass-rate` 段的 `factKeyPrefixes` 不含 `statistics_methodology`：`render.ts:316-346` ⇒ 口径说明只在概览页混在 863 条里，与它解释的数值不同屏。
- 唯一的表格组件在比较页：`render.ts:851-869`（`.compare-table`），跨资格横向比较，**没有按年的序列表**。

## 3. 三块可独立授权的方案

### G-1 呈现层：给历年统计一条年度序列轴（**已于同日第十一轮执行**，读数见 §7）

改动面＝**只有 `apps/web/src/render.ts` ＋ 对应 CSS**；零 DB 写、零迁移、零判级面。

1. `pass-rate` 段新增一个「历年推移」块：按 `級 | 方式` 分组，组内按 `exam_year DESC, exam_session` 排成表格（列＝回／年月／申込者数／受験者数／合格者数／合格率），复用 `.compare-table` 的表格样式与 `renderSourceModule` 的出处展开方式。形态＝**5 张表、合计 207 行**（1 級 49／2 級 72／3 級 72／ネット各 7），替掉现在 802 张平铺卡片。
2. 表内每行把 `examSession`（如 `173（2026.6.14）`）显示出来 ⇒ 解决「同年两回合不可区分」。
3. 现有卡片列表改成只保留**当年**（`examYear === coverageYear`）＋「その他の年度は表へ」的说明，避免概览/pass-rate 各挂 800 张卡。概览页同理：`facts.length` 863 → 只列当年＋一条「历年は合格率ページ」。
4. `statistics_methodology` 加进 `pass-rate` 的 `factKeyPrefixes`，并把它渲染成表格上方的口径注记（而不是又一张卡）⇒ 号主已拍板「ネット槽以页首引言为 current」，那条引言正好是该表的分母口径说明。
5. 年度导航：把年份链接的落点从 `/<年>/`（annual 日程）改成 `pass-rate?year=<年>`，或者在 annual 段的 prefixes 里加统计字段——**两种要号主选**，因为后者会让年度页同时出现日程与统计，属 IA 决策。⇒ 拍板＝**改链接目标**，年度日程页继续只管日程（见 §5）。

验收判据（全部可复跑）：pass-rate 页 HTML 字节数显著下降、`grep -c 'article class="card fact"'` 从 802 降到百级以内、页面出现「回」标识、`npm run verify:all` 仍 **6 passed／0 failed／EXIT=0**、`vitest`／`typecheck`／`build` 全绿、五个公开页仍 200。风险＝E2E 与 `verify:all` 里对页面的断言可能要跟着改（它只断言 200 与事实数，见 `scripts/verify-lib.mjs:244-266`）。

### G-2 更新流：修事件类型误标（**第十一轮按最小方案执行，同日第十三轮补做完整方案**，读数见 §8）

- 最小方案（**零迁移**）＝只改 `eventTypeForFact()` 的映射：把统计类（`pass_rate`／`applicants`／`examinees`／`passed`／`statistics_methodology`）与 `fee`／`eligibility`／`question_format` 等映射到**现有**枚举成员 `system_change`（制度・方式），或统计类继续 `schedule_change` 但在 `packages/schema/src/updates.ts` 的 `updateFactLabelPrefixes` 里补「合格率データ」类标签，让卡片文案正确而类型不动。**只改代码不改库 ⇒ 历史 945 条误标不会自动纠正**。
- 完整方案（**要迁移＋要写库**）＝给 `event_type` 枚举加 `statistics_update`（`ALTER TYPE`＝迁移，且 `packages/db/src/schema.ts:38` 与 `packages/schema/src/index.ts:42` 两处同步），再回填历史行的 `event_type`（`UPDATE change_events`＝写库）。这条属号主铁律里的「写库／迁移」，要单独一句话。
- 另外要定的口径：`/updates/` 的 `LIMIT 100`（`services/api/src/public-updates.ts:42`）在批量批准场景下会被同一批事件占满。建议加「同一批次只显示 1 张汇总卡」的折叠（纯呈现层，改动在 web 侧），否则以后每批批准都会淹没更新流。

验收判据：`select event_type, count(*) from change_events group by 1` 的分布符合所选方案；`/updates/` 上合格率卡片不再标「日程の変更」。

### G-3 判级面：把历年覆盖纳入门禁（**同日第十一轮按拍板维持不动**，附实测红点清单）

现状：`config/data-coverage-contract.json` 簿记第 6 条 requirement 是
`{fields:[applicants, examinees, passed, pass_rate, statistics_methodology], requiredLevel:'post_event', dimensions:{examLevelId:[1,2,3], deliveryMode:[unified,network,group]}}`，
而 `scripts/verify-lib.mjs:60-66` **跳过** `post_event`／`optional`／`not_applicable` ⇒ 历年统计对门禁零贡献（这正是「F 永远不会把门禁跑红」那条产品事实）。

⚠ 整条改成 `required` 会**立刻红出 24 个字段缺口**（分布在 6 个 `級 × 方式` 维度上；三个級的 `unified` 全齐，缺口全在 `network` 与 `group`）。按 coverageYear=2026 实测：

| 维度                | 缺失字段                                                               |
| ------------------- | ---------------------------------------------------------------------- |
| 1 級 \| network     | `applicants` `examinees` `passed` `pass_rate` `statistics_methodology` |
| 2 級 \| network     | `applicants` `examinees`                                               |
| 3 級 \| network     | `applicants` `examinees`                                               |
| 1／2／3 級 \| group | 五个字段全缺（该方式库里一条都没有）                                   |

⇒ 真要动判级面，必须**先拆字段与维度**（与 2026-10-09 那轮「判级要拆字段而非改整条 level」同一条经验）：

1. `statistics_methodology` 从该 requirement 的 `fields` 里拆出去或降 `optional`（ネット current 只有一条，按級要求会重复）。
2. ネット的 `applicants`／`examinees` 要么单列一条只要求 `passed`＋`pass_rate` 的 requirement，要么显式标 `not_applicable`（依据＝已拍板的裸「受験者数」不映射口径）。
3. `group` 从 `deliveryMode` 数组里去掉，或整条对该维度标 `not_applicable`。
4. 覆盖粒度：`evaluateCoverage(slug, facts, examYear)` 只看**当年**（`verify-lib.mjs:67-71`），而契约的维度 schema（`packages/schema/src/data-coverage-contract.ts:35-43`）**没有 `examSession`** ⇒ 现有判级面既不能要求「历年齐全」也不能防「某一年两个回合只批了一个」。要做「逐回合覆盖」得先扩维度 schema＋新算法，属独立一轮工程。

## 4. 建议顺序与工作量感觉

1. **G-1 先行**（纯呈现层，收益最大：把 805 条已经付过批准成本的数据变成能看的表）。
2. **G-2 的最小方案紧跟**（几行代码，止住更新流的错误文案；要不要加枚举＋回填另开一轮，那是迁移与写库）。
3. **G-3 单独一轮**，且要先定「判级面到底要不要管历年」——不管就维持现状（数据公开但不进门禁），要管就得接受先把 network/group/methodology 三处口径拆干净。

## 5. 需要号主拍板的四件事（**2026-10-13 同日第十一轮已全部拍板，四项均选推荐项**）

1. G-1 里年度导航落点的两种改法：改链接目标（`pass-rate?year=`）还是给 `annual` 段加统计字段？⇒ **拍板＝pass-rate 页内加表**，年份链接改指 `/shikaku/<slug>/pass-rate/?year=<年>`，年度日程页继续只管日程。
2. 概览页与 pass-rate 页是否允许「只列当年＋表格承载历年」这种减卡片的口径（会影响现有 100＋ 张卡片的呈现与 SEO 文本量）。⇒ **拍板＝只列当年＋表格承载历年**。
3. G-2 走最小方案（不改枚举、不回填历史）还是完整方案（迁移＋回填 945 行＝写库）。⇒ **拍板＝最小方案，只改映射与文案**，`event_type` 枚举不动、历史 945 条不回填。
4. G-3 做不做：维持「历年统计不进门禁」，还是拆字段后让门禁开始检查当年统计齐全度（注意它仍然只管当年）。⇒ **拍板＝维持 `post_event` 不动**，`config/data-coverage-contract.json` 零改动。

## 6. 取证命令（本轮实跑，可复跑）

```
set -a; . ./.env; set +a
node dist/services/api/src/server.js                    # API_PORT=4191，另开一条命令
WEB_PORT=3091 API_BASE_URL=http://127.0.0.1:4191 node dist/apps/web/src/server.js
curl -s http://127.0.0.1:4191/api/v1/qualifications/bookkeeping
curl -s http://127.0.0.1:3091/shikaku/bookkeeping/pass-rate/
curl -s http://127.0.0.1:3091/shikaku/bookkeeping/2010/
curl -s http://127.0.0.1:3091/updates/
```

- 卡片数＝`grep -o 'article class="card fact"' <文件> | wc -l`；分组计数＝`grep -o '<h2 id="fact-group-pass-rate-[0-9]*">'` 后的 `meta ... 件`。
- 库侧统计分布与 `change_events` 分布按惯例写成 `var/*.mjs` 再 `node var/x.mjs`（一行式命令通体不带单引号与反引号；`facts` 表没有 `synthetic` 列，非合成要走 `facts → fact_revisions → candidate_facts → snapshots/sources` 链，见 `docs/transition-handoff.md` §3）。
- 本轮用完的临时脚本与 HTML 转储都在 gitignored 的 `var/`，收尾即删；起过的 api／web 进程按 `netstat -ano | grep 127.0.0.1:3091` 取 PID 后 `taskkill //PID <pid> //F //T` 停掉。
- 本稿与 §7 执行记录进 main 需要号主授权 commit／push／squash merge；`docs/transition-handoff.md` §4 待办 3 已在第十一轮标为闭合。

## 7. 执行记录（同日第十一轮：G-1 呈现层＋G-2 最小方案落地）

改动面＝**7 个代码／测试文件、589 增／38 删**（`git diff --numstat` 现取）＝`apps/web/src/render.ts` 274／27、`apps/web/src/server.ts` 9／2（解析 `pass-rate/?year=`）、`apps/web/src/styles.ts` 14／0、`packages/schema/src/updates.ts` 62／0、`apps/admin/src/server.ts` 2／9、`tests/web-render.test.ts` 186／0，加新文件 `tests/update-event-classification.test.ts`（42 行）。**零抓取、零入库、零批准、零迁移、零写库、零判级面改动**：`facts` 仍 **981**、非合成 `pending_review` 仍 **0**、`change_events` 仍 **983**、`snapshots` 仍 44；`config/release-gate-baseline.json` 与 `fixtures/ci/approved-facts.sql` 未动（`approved_official` 未变，无需重导）。

改前（§2.2 的基线）→ 改后（本机 api 4191＋web 3091 起 `dist` 现取）：

| 对象                                   | 改前                                                         | 改后                                                                                                                                                                  |
| -------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/shikaku/bookkeeping/pass-rate/`      | 802 卡／1,075,312 B                                          | **26 卡／123,550 B** ＋ **5 张表／207 行**（页内 meta「207 回・5 表」）                                                                                               |
| `/shikaku/bookkeeping/`（概览）        | 863 卡／1,150,946 B                                          | **82 卡／161,600 B**                                                                                                                                                  |
| `pass-rate/?year=2010`                 | 该形态不存在（点 2010 得 0 件）                              | **32 卡**，与库侧逐键读数一致（四个数值键各 8 条＝1 級 2＋2 級 3＋3 級 3）                                                                                            |
| `/shikaku/bookkeeping/2026/`（年度頁） | 15 卡                                                        | **15 卡未动**                                                                                                                                                         |
| `/shikaku/bookkeeping/2010/`           | 0 卡                                                         | **0 卡未动**（年度页语义仍只管日程）                                                                                                                                  |
| 其余五格 pass-rate／概览               | it-passport 54,765／fp 64,402／takken 54,212／FE 概览 64,414 | **逐格字节数不变** ⇒ 减卡片只发生在簿記的 overview＋pass-rate 两段                                                                                                    |
| 回合标识                               | 「回」字 0 次                                                | 表内「173回」列；ネット行显示 `display_value` 末尾括注期间（如「2026年4月～2026年6月」），无回合号                                                                    |
| `statistics_methodology`               | 混在 863 张卡里，pass-rate 段零消费点                        | 移出卡列表，做成表上「集計口径：」注记（統一表按級三条＋ネット两条页首引言）                                                                                          |
| `/updates/` 标签                       | 首页 100 张卡清一色「日程の変更」                            | **新写的事件按 22 键映射出正确标签**；⚠ 第十一轮按拍板走最小方案，历史 **945** 条 `schedule_change` **当时未回填**（⇒ 旧卡文案不变）；同日第十三轮补做完整方案，见 §8 |

实现与稿的差异（都记下来，便于回溯为什么页面长这样）：

1. 表头是**六列**＝年度／回・期間／申込者数／受験者数／合格者数／合格率，比稿里「回／年月／…」少一列（年与回合合并成一列）。列名走 `historyColumnLabels` 短标签，不用 `factLabel('examinees')` 的「受験者数・受検者数」（后者会在表头占宽）。
2. 表格**只复用 `.compare-table-wrap`／`.compare-table` 的样式**，**未复用 `renderSourceModule` 的逐格出处展开**⇒ 出处仍在下方当年卡片里，表的注记取 `statistics_methodology` 的 `display_value`。
3. 「只列当年」的实际口径比稿里严：**pass-rate 带显式 `?year=` 时该页所有卡都按年过滤**（`cardYearScoped`），不只统计四键。第一版只约束统计键，导致 `passing_standard`（`exam_year=2026`）串进 2010 页、读数 34≠库里 32；加约束后才对齐。
4. 段判定与年参数解耦：`annual` 只看**路由段**是不是四位年（`annualYear`），`?year=` 只影响 pass-rate 的当年口径 ⇒ 否则 `pass-rate/?year=2010` 会被误判成日程页。
5. G-2 的映射从 admin 私有函数**提到 `packages/schema/src/updates.ts` 并导出为 `updateEventTypeForFact()`**，admin 写入点改为 import 同一份，避免两处口径分叉；第十一轮当时 `event_type` 枚举与 SQL 强转 `$3::event_type` 均未动（枚举加成员是同日第十三轮做的，见 §8）。
6. `verify-lib.mjs:244-266` 对页面只断言 200 与事实数，G-1 的减卡片**没有触发门禁断言改动**。

回归读数（全部本机现取，退出码先重定向再 `echo $?`）：`vitest` **89 passed**（11 文件）、`typecheck` **0**、`build` **0**、`format:check` **0**、`test:verify-gate` **0**、`ci:fixture:verify` **0**、`npm run verify:all` **`"status": "passed"`／6 passed：0 failed／EXIT=0**（簿记 `approved_official` **863**、`api.facts` 863、`pending_official` 0、`coverageGaps: []`）、pytest **158 passed**；`lint` **EXIT=1** 仅根目录未跟踪 `Python/…flamegraph.js` 两条既有噪声。

三条已修的实现坑（复跑者会遇到同样的）：① `section` 判定复用 `year` ⇒ `?year=` 误判 annual；② 「只列当年」漏非统计键 ⇒ 页面卡数与库侧不符；③ `.history-row--current th` 特异性（0,1,1）压不过 `.history-table tbody tr:nth-child(even) th`（0,2,3）⇒ 当前行高亮要写成同级选择器并放在斑马纹之后。另：模板插值里再嵌二级模板会让 `render.ts` 出 TS 解析级联报错（`,` expected），拆成 `renderHistoryRow`／`renderHistoryTable`／`compareHistoryRows` 即归零。

后续判据：

- ~~历史 945 条彻底纠正＝「完整方案」＝`ALTER TYPE` 迁移＋`UPDATE change_events` 回填，属迁移＋写库**双授权**，另开一轮。~~ **已闭合（同日第十三轮，号主给到迁移＋写库双授权），读数见 §8。**
- `?year=` 形态目前**未进 sitemap**；要收录属呈现层改动，零写库，另议。
- G-3 维持现状 ⇒ 历年统计仍不进门禁（`verify-lib.mjs:60-66` 跳 `post_event`），这条产品覆盖债**不会因为本轮而消失**。

## 8. 执行记录（同日第十三轮：G-2 完整方案＝迁移加成员＋回填历史）

号主授权原文＝「同意授权给 `event_type` 加 `statistics_update`（`ALTER TYPE`＝迁移）＋回填历史 945 条（＝写库）」，两件一次给足。

回填前的只读影响面（`var/r13-precheck.mjs`／`var/r13-matrix.mjs`／`var/r13-sqlcheck.mjs`，三条可复跑判据；三个脚本随本轮收尾删除，方法已抄进交接单 §6 的「动 `event_type` 口径前的只读判据」）：

| 判据                                        | 读数                                                                                                                                                                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `change_events` 行数／能联到 `facts` 的行数 | 983／983（孤儿 **0**）                                                                                                                                                                                                |
| 回填前分布                                  | `schedule_change` **945**／`application_deadline` 17／`application_open` 11／`result_date` 8／`exam_date` 2，其余成员 **0**                                                                                           |
| 按新映射的目标分布                          | `statistics_update` **807**／`system_change` **88**／`schedule_change` **24**／`application_deadline` 17／`fee_change` 15／`eligibility_change` 11／`application_open` 11／`result_date` 8／`exam_date` 2（合计 983） |
| 实际改写／不变                              | **921／62**                                                                                                                                                                                                           |
| 命中 `statistics_update` 的 `fact_key`      | `pass_rate` 207／`passed` 207／`applicants` 193／`examinees` 193／`statistics_methodology` 7                                                                                                                          |
| 仍留在 `schedule_change` 的                 | `exam_schedule` 13／`exam_dates` 9／`result_date_rule` 2                                                                                                                                                              |

**「回填 945 条」的实质是重分类而不是改名**：945 条里 807 条进新成员，114 条（`system_change` 88＋`fee_change` 15＋`eligibility_change` 11）进**已有**成员，24 条本就属日程、维持原值。

迁移落点与拆分理由：

1. `packages/db/migrations/0019_event_type_statistics_update.sql` **只**含 `ALTER TYPE public.event_type ADD VALUE IF NOT EXISTS 'statistics_update';`。`packages/db/src/migrate.ts` 逐文件单事务（`BEGIN`→SQL→`INSERT INTO schema_migrations`→`COMMIT`），而 Postgres 不允许在**同一事务内使用**刚新增的枚举值 ⇒ 新增与回填必须分文件。
2. `0020_change_event_type_backfill.sql` 是一条带 CASE 的全表 `UPDATE … FROM facts`，分支与 `updateEventTypeForFact()` **逐条同序**（deadline／application_open／exam_date／result_date／fee＋payment_／eligibility／统计五键／考试内容 12 前缀／schedule 兜底）。含下划线的前缀写成 LIKE 的 `\_`（本机实测 `payment_fee` 命中、`paymentxfee` 不命中），以免与 JS 的 `startsWith` 分叉。
3. 执行前把迁移里的 CASE 原文抽出来改写成 SELECT 做只读试算，与 JS 映射**逐行比对：983 行不一致 0**；回填后再跑一遍＝**需改写 0／不变 983**（幂等）。
4. 新成员按 `enumsortorder` 落在**末位**（第 9 个），`packages/db/src/schema.ts` 的 `pgEnum` 与 `packages/schema/src/index.ts` 的 `eventType` 同步加在末位。

代码与文案：`updateEventTypeForFact()` 的统计五键改返 `statistics_update`，`updateEventLabels` 加 `statistics_update: '統計データの変更'`，文件里「closed enum」注释改为说明新成员与分支顺序；`tests/update-event-classification.test.ts` 把统计键与考试内容键拆成两条 `it`，`tests/web-render.test.ts` 那条 pass-rate 卡的 `eventType`／`eventLabel` 同步。**未动**＝`services/api/src/release.ts:92`（回滚仍硬编码 `schedule_change`）、admin 的 `$3::event_type` 强转、`config/data-coverage-contract.json`。

公开面实测（`dev:api` 4100＋`WEB_PORT=3091`，`var/r13-updates.mjs`）：`GET /api/v1/updates` 上限 100 条**全部** `statistics_update`／「統計データの変更」；`/updates/` 200／**118,227 B／100 卡**，「日程の変更」0 次、「制度・方式の変更」0 次，出现的 1 次「公式情報の変更」是区块标题不是兜底标签；统计卡链接仍指 `/shikaku/bookkeeping/pass-rate/?year=2026`。

为什么不需要刷 baseline 与 CI 夹具：`fixtures/ci/approved-facts.sql`（2,070,472 B）的 INSERT 只有 `facts` 981／`fact_revisions` 981／`candidate_facts` 981／`snapshots` 29 四张表，**不含 `change_events`、不含 `event_type`、不含 `CREATE TYPE`**；CI 顺序是 `db:migrate` → `ci:fixture:restore`，所以 0019/0020 在空库上执行、0020 命中 0 行。库侧终态现取：`facts` 981、非合成 `pending_review` 0、`snapshots` 44、`schema_migrations` **22**（迁移文件 **21** 个）、`change_events` 983。

回归读数：`npm run test`（vitest）**90 passed**（11 文件）、`typecheck`／`build`／`format:check`／`test:verify-gate`／`ci:fixture:verify` 全 **0**、`npm run verify:all` **`"status": "passed"`／6：0／EXIT=0**、pytest **158 passed**；`lint` 仍 **EXIT=1**（根目录未跟踪 `Python/…flamegraph.js` 两条既有噪声）。

三条本轮坑（复跑者会遇到同样的）：① 自检要跑 `npm run test` 而不是 `npx vitest run`——后者会扫到 `scripts/*.test.mjs`（node:test 文件）报「No test suite found」；② 4100 若被残留进程占着，`tests/public-api.test.ts` 会抛 `EADDRINUSE` 的 Unhandled Rejection 让整轮退出码 1，`netstat -ano` 的 PID 在**第 5 列**；③ 本机 Bash 里 `taskkill //PID` 会被判成 UNC 路径要求确认，改用 `powershell -NoProfile -Command "Stop-Process -Id <pid> -Force"`。

**交付（第十四轮补记）**：本轮 11 个文件（9 改＋2 新迁移，165 增／45 删）⇒ 分支 `db-round13-statistics-event-type`＝`34b38c3` ⇒ **PR #36 squash 合并＝main `9bf7ec8`**（`mergedAt=2026-10-14T00:53:04Z`，`mergedBy=roykim26`）。CI 两次现取：PR 侧 run `38491023371`／job `115615960976` **success**（00:35:17→00:36:12＝55s），合并后 main push run `38492661733`／job `115621272527` **success**（00:53:09→00:54:12＝63s）；两侧日志均出现 `Applied 0019_event_type_statistics_update.sql.`＋`Applied 0020_change_event_type_backfill.sql.` → `bound 45 sources` → `"status": "passed"`／`"passed": 6`／`"failed": 0`，**未出现 `below regression floor`** ⇒ 「baseline 与 CI 夹具不用刷」由推断变成实测。第十四轮另在本机复跑库侧终态（`docker compose up -d postgres` 起回停摆 12 小时的容器）＝`change_events` 983 分布逐字相符、按 0020 的 CASE 复算**需改写 0／孤儿 0**，幂等性再现。

仍开放的延伸（各需单独授权）：`/updates/` 的 `LIMIT 100` 折叠（§G-2 第 3 条，本轮 100 张卡全被统计批占满，正好复现了稿里的担忧）、`?year=` 进 sitemap、G-3 判级面（按拍板维持不动）。
