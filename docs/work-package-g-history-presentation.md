# 工作包 G（提案稿）：把 805 条簿记历年统计接到「能用」的程度（2026-10-13 时点，只读调研，零代码改动／零写库／零判级面改动）

> 本文是**方案稿**，不是执行记录。目的：把「863 条簿记事实已批准，但公开面看起来仍像只有 2026 一年」这件事拆成可拍板的三块，每块标清改动面、代码坐标、验收判据与风险。号主拍板后才按块开工，**每块各需单独授权**。
> 文中所有数字都是 2026-10-13 本机现取（取证命令见 §6），不是推算，也不是上一轮的缓存值。

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

### G-1 呈现层：给历年统计一条年度序列轴（建议先做）

改动面＝**只有 `apps/web/src/render.ts` ＋ 对应 CSS**；零 DB 写、零迁移、零判级面。

1. `pass-rate` 段新增一个「历年推移」块：按 `級 | 方式` 分组，组内按 `exam_year DESC, exam_session` 排成表格（列＝回／年月／申込者数／受験者数／合格者数／合格率），复用 `.compare-table` 的表格样式与 `renderSourceModule` 的出处展开方式。形态＝**5 张表、合计 207 行**（1 級 49／2 級 72／3 級 72／ネット各 7），替掉现在 802 张平铺卡片。
2. 表内每行把 `examSession`（如 `173（2026.6.14）`）显示出来 ⇒ 解决「同年两回合不可区分」。
3. 现有卡片列表改成只保留**当年**（`examYear === coverageYear`）＋「その他の年度は表へ」的说明，避免概览/pass-rate 各挂 800 张卡。概览页同理：`facts.length` 863 → 只列当年＋一条「历年は合格率ページ」。
4. `statistics_methodology` 加进 `pass-rate` 的 `factKeyPrefixes`，并把它渲染成表格上方的口径注记（而不是又一张卡）⇒ 号主已拍板「ネット槽以页首引言为 current」，那条引言正好是该表的分母口径说明。
5. 年度导航：把年份链接的落点从 `/<年>/`（annual 日程）改成 `pass-rate?year=<年>`，或者在 annual 段的 prefixes 里加统计字段——**两种都要号主选**，因为后者会让年度页同时出现日程与统计，属 IA 决策。

验收判据（全部可复跑）：pass-rate 页 HTML 字节数显著下降、`grep -c 'article class="card fact"'` 从 802 降到百级以内、页面出现「回」标识、`npm run verify:all` 仍 **6 passed／0 failed／EXIT=0**、`vitest`／`typecheck`／`build` 全绿、五个公开页仍 200。风险＝E2E 与 `verify:all` 里对页面的断言可能要跟着改（它只断言 200 与事实数，见 `scripts/verify-lib.mjs:244-266`）。

### G-2 更新流：修事件类型误标（建议第二做，但有一条硬约束）

- 最小方案（**零迁移**）＝只改 `eventTypeForFact()` 的映射：把统计类（`pass_rate`／`applicants`／`examinees`／`passed`／`statistics_methodology`）与 `fee`／`eligibility`／`question_format` 等映射到**现有**枚举成员 `system_change`（制度・方式），或统计类继续 `schedule_change` 但在 `packages/schema/src/updates.ts` 的 `updateFactLabelPrefixes` 里补「合格率データ」类标签，让卡片文案正确而类型不动。**只改代码不改库 ⇒ 历史 945 条误标不会自动纠正**。
- 完整方案（**要迁移＋要写库**）＝给 `event_type` 枚举加 `statistics_update`（`ALTER TYPE`＝迁移，且 `packages/db/src/schema.ts:38` 与 `packages/schema/src/index.ts:42` 两处同步），再回填历史行的 `event_type`（`UPDATE change_events`＝写库）。这条属号主铁律里的「写库／迁移」，要单独一句话。
- 另外要定的口径：`/updates/` 的 `LIMIT 100`（`services/api/src/public-updates.ts:42`）在批量批准场景下会被同一批事件占满。建议加「同一批次只显示 1 张汇总卡」的折叠（纯呈现层，改动在 web 侧），否则以后每批批准都会淹没更新流。

验收判据：`select event_type, count(*) from change_events group by 1` 的分布符合所选方案；`/updates/` 上合格率卡片不再标「日程の変更」。

### G-3 判级面：把历年覆盖纳入门禁（**本轮不建议动**，附实测红点清单）

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

## 5. 需要号主拍板的四件事（拍板前不动任何代码）

1. G-1 里年度导航落点的两种改法：改链接目标（`pass-rate?year=`）还是给 `annual` 段加统计字段？
2. 概览页与 pass-rate 页是否允许「只列当年＋表格承载历年」这种减卡片的口径（会影响现有 100＋ 张卡片的呈现与 SEO 文本量）。
3. G-2 走最小方案（不改枚举、不回填历史）还是完整方案（迁移＋回填 945 行＝写库）。
4. G-3 做不做：维持「历年统计不进门禁」，还是拆字段后让门禁开始检查当年统计齐全度（注意它仍然只管当年）。

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
- 本稿进 main 需要号主授权 commit／push／squash merge；`docs/transition-handoff.md` §4 待办 3 要改成指向本稿。
