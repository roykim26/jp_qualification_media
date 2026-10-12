# 工作包 F-2：簿记历年序列子页受控采集授权单

状态：**已获号主确认并执行完毕**。确认来自对话指令「B. 新开一张授权单只授簿记那 6 条子页 URL 并抓取」（同轮另定两个口径：登记为正式 `source:` 来源、xlsx 附件不纳入）；实际抓取时刻 2026-10-12T00:52 UTC，读数见 §8。本单是 `docs/work-package-f-live-capture-authorization.md`（下称 F 单）的**追加单**，只覆盖日商簿记一个域名下的 6 条 HTML 子页；F 单第 3 条（宅建）仍未执行、不在本单范围。

## 1. 为什么要有这一张

F 单第一批三条的实抓读数（见 F 单 §10）给出了两个相反结论：

- IPA `toukei_fe.html` 是**附件目录页**（零 `<table>`），五字段取不到，数据在 PDF／Excel 里 ⇒ 需要另一类授权与解析依赖决策，本单**不解决**。
- 日商 `candidate-data` 是**真数据页**（7 张表，級×実施方式写在段标题里，四个数值字段全是页内印刷官方值），但它只覆盖**近期回合**（統一 161〜173 回、ネット与初級 2022 年度〜2026/4-6）。页内另有 6 条子页链接指向更长的历年序列，且**全是 HTML、不是附件** ⇒ 这是当前唯一能把 `pass_rate` 历史窗口做宽、又不引入新依赖的路径。

## 2. 请求范围（6 条 HTML，全部 `www.kentei.ne.jp`）

URL **逐字取自 2026-10-11 已抓快照正文**（`var/official-snapshots/bookkeeping/candidate-data.html`，`46fcf61f…`），不是拼出来的。**活性已于 2026-10-12 验证：6 条全部 HTTP 200，读数见 §8。**

| #   | 拟登记 source_id                                | URL                                                                                    | 正文入口段                                                                                                          | 落盘文件名（固定名）              |
| --- | ----------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| 1   | `source:bookkeeping:candidate-data-class1`      | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class1`                      | ＞ 1級の過去のデータを見る（統一試験）                                                                              | `candidate-data-class1.html`      |
| 2   | `source:bookkeeping:candidate-data-class2`      | `https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class2` | ＞ 2級の過去のデータを見る（統一試験）                                                                              | `candidate-data-class2.html`      |
| 3   | `source:bookkeeping:candidate-data-class3`      | `https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class3` | ＞ 3級の過去のデータを見る（統一試験）                                                                              | `candidate-data-class3.html`      |
| 4   | `source:bookkeeping:candidate-data-class23-net` | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class2-3`                    | ＞ 2級の過去のデータを見る（ネット試験）**与** ＞ 3級の過去のデータを見る（ネット試験）——主页两个入口指向同一条 URL | `candidate-data-class23-net.html` |
| 5   | `source:bookkeeping:candidate-data-class4`      | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class4`                      | ＞ 簿記初級、4級の過去のデータを見る                                                                                | `candidate-data-class4.html`      |
| 6   | `source:bookkeeping:candidate-data-costing`     | `https://www.kentei.ne.jp/bookkeeping/candidate-data/ca-date`                          | 原価計算初級の過去のデータを見る（路径字面是 `ca-date`，疑为官方自身的拼写，按原样登记，不擅自改成 `data_costing`） | `candidate-data-costing.html`     |

`source_type` 一律 `official_statistics`（`fieldCatalog.pass_rate.allowedSourceTypes` 只认 `official_statistics`／`official_result_information`）。库里 `source_type` 是自由文本、写错不会报错（F 单 §2 第 3 项），唯一防线是审核人。

**本单不含**：`2020～2025nendo_boki_jukensha-2.xlsx`（「全級データ」段的表在此，号主已定不纳入，留待 PDF／Excel 提取工作项）、`画像1-1024x592.png`（图不是数据源）、宅建统计概览、FE 的 PDF／Excel 附件、以及任何 `sources` 建行的迁移。

## 3. 采集之前必须先落的代码动作（本单一并做掉，零联网）

1. **注册表**：`BOOKKEEPING_SOURCES` 16 ⇒ 22 条。`bookkeeping.is_registered_source_url()` 要求 URL **逐字命中**注册表，未登记则 `capture_bookkeeping` 根本不会为它建 fetcher（`selected_capture_sources()` 对未知 id 在建 fetcher 之前抛 `ValueError`）。⇒ 不登记就抓不到，这是硬前置。
2. **形态选择（号主已定）**：登记成**正式 `source:`** 而不是 `capture-only:`。理由：与主页 `candidate-data` 同类、同域、同为 `official_statistics`，入库时不必二次改造。**风险与缓解**：
   - 默认整表跑（`source_ids=None`）的触及面从 16 涨到 22，而簿记落盘是**固定文件名＋无条件原地覆盖**。
   - 已核实**没有任何自动调度会碰它**：`.github/workflows` 只有 `release-gate.yml`，`package.json` 无 capture 脚本，全仓无人定时跑 `python -m collector.capture_bookkeeping` ⇒ 风险只剩「人工漏传 `source_ids`」。
   - 执行纪律：本单命令必须带 `BOOKKEEPING_CAPTURE_SOURCE_IDS`；抓前先做整目录备份（F 单 §10 第 2 条已用同一流程验证过 `diff -rq` 只报新增）。
3. **不做的事**：不给这 6 条加 ingest 映射、不动 `extract_candidates()`、不建 `sources` 迁移、不改 release baseline 与 CI 夹具。铁律 1 的护栏保持原样——统计页对适配器只会报 `structure_changed`，本单给它补一条覆盖 6 条新 id 的用例。

## 4. 授权范围与硬约束

- [ ] 仅访问 §2 表中的 6 条 HTTPS URL；重定向仍由 `SafeFetcher` 重验允许域名（`www.kentei.ne.jp`）。**注**：#2/#3 的 `bookkeeping_contents` 段是 WordPress 老路径，若被 301 到 canonical URL，最终 URL 必须如实记进报告，不得当成新来源。
- [ ] 不使用 Cookie、登录态、代理、付费接口、生产数据库或生产对象存储。
- [ ] 只写 `var/official-snapshots/bookkeeping/` 的 HTML 与 `capture-report.json`；**不含候选摄取、审核、批准、baseline 或夹具更新**。
- [ ] 每个响应记录最终 URL、HTTP 状态、内容 SHA-256、字节数和 UTC/JST 采集时间。
- [ ] 一次性受控读取，不建定时采集。
- [ ] 采集后只做离线解析，报「能取到哪些字段、什么粒度、覆盖哪些年度／回合」，**不产生候选**。
- [ ] `pass_rate` 只用页内印刷的官方值。主页已证实**页面对合格率没有任何成文口径**（「合格率」7 次全在 `<th>`，`※／注：／ただし／集計／口径／分母` 计数 0）；子页若同样无成文口径，`statistics_methodology` 只能记列头原样描述或留缺，**不得**把「合格者数／実受験者数」当官方公式入库。
- [ ] 子页粒度大概率仍是「回＋西历日期」（統一）与「年度 4 月〜次年 3 月」（ネット）两套并存，`exam_year` 归属口径属**入库前必须另行确认的产品决策**，本单不定、不先抓后定。

## 5. 运行环境确认

- [x] `NODE_ENV` 未设置（非 production）。
- [x] 采集不配置 `DATABASE_URL`。
- [x] 走 `SafeFetcher`，不绕过 HTTPS／超时／重试／缓存／大小／重定向限制。
- [x] 执行命令带 `BOOKKEEPING_CAPTURE_SOURCE_IDS`，收紧到 §2 的 6 条。

## 6. 执行命令（在项目根目录，一次性）

先备份（覆盖风险的廉价保险）：

```
cp -r var/official-snapshots/bookkeeping var/official-snapshots/bookkeeping-preserved-before-F2
```

再抓（6 条一次跑完，`source_count` 应为 6）：

```
BOOKKEEPING_LIVE_AUTHORIZED=1 BOOKKEEPING_CAPTURE_SOURCE_IDS=source:bookkeeping:candidate-data-class1,source:bookkeeping:candidate-data-class2,source:bookkeeping:candidate-data-class3,source:bookkeeping:candidate-data-class23-net,source:bookkeeping:candidate-data-class4,source:bookkeeping:candidate-data-costing PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.capture_bookkeeping
```

## 7. 执行顺序

1. 落 §3 的注册表与用例（离线），`pytest` 两个目录全绿 + `format:check` 过。
2. 备份 → 按 §6 抓取 → 逐条复核 `sha256sum` 与 `diff -rq`（确认只新增 6 个文件、其余 16 个字节未动）。
3. 离线解析 6 份快照：表数、列头、回合/年度粒度、覆盖区间、有无成文口径；把读数写进本单 §8。
4. 更新 `docs/work-package-f-statistics-sources.md` 与 `docs/bookkeeping-source-contract.md` 的来源表与活性读数。
5. 单独请求候选入库授权（先定 `exam_year` 口径与 `statistics_methodology` 记法），再单独请求逐条批准授权。

## 8. 执行记录（2026-10-12）

§3 的代码前置已先落地（离线）：`BOOKKEEPING_SOURCES` 16 ⇒ 22，`docs/bookkeeping-source-contract.md` 来源表同步，Python 用例 126 ⇒ **139 passed**（新增 6 条逐字 URL 断言 + 6 条 `structure_changed` 护栏 + 1 条「22 个落盘 slug 互不相同」）。

抓前备份 `var/official-snapshots/bookkeeping-preserved-before-F2/`（18 项）。执行 §6 命令一次跑完，`source_count: 6`／`retained_source_count: 22`／`candidate_ingest: not_run`，`NODE_ENV` 与 `DATABASE_URL` 均未设置。`diff -rq` 对备份只报「新增 6 个 `.html` + 报告文件本身」⇒ **其余 16 个固定文件名快照字节未动**。6 份文件的 `sha256sum` 与报告 `content_hash` 逐条复核一致。

| source_id（缩写） | 最终 URL（重定向后）                                                                                   | 状态/字节   | content_hash 前 12 位 | captured_at（UTC）  |
| ----------------- | ------------------------------------------------------------------------------------------------------ | ----------- | --------------------- | ------------------- |
| …`class1`         | `/bookkeeping/candidate-data/data_class1`                                                              | 200 / 56523 | `72e62d0a6ad8`        | 2026-10-12T00:52:39 |
| …`class2`         | `/bookkeeping/candidate-data/data_class2`（**注册的是 `bookkeeping_contents` 老路径，被 301 到这里**） | 200 / 65426 | `14b2c3ac271b`        | 2026-10-12T00:52:39 |
| …`class3`         | `/bookkeeping/candidate-data/data_class3`（同上，老路径 301）                                          | 200 / 65648 | `f03bdb30a9eb`        | 2026-10-12T00:52:40 |
| …`class23-net`    | `/bookkeeping/candidate-data/data_class2-3`                                                            | 200 / 44726 | `6a49427fcc0b`        | 2026-10-12T00:52:40 |
| …`class4`         | `/bookkeeping/candidate-data/data_class4`                                                              | 200 / 59493 | `eab74e5aad4c`        | 2026-10-12T00:52:40 |
| …`costing`        | `/bookkeeping/candidate-data/ca-date`                                                                  | 200 / 41038 | `10f2fed06dd5`        | 2026-10-12T00:52:41 |

重定向说明：#2/#3 按 §4 如实记录，最终 URL 与注册 URL 不同（同域 301，`SafeFetcher` 已重验允许域名）。注册表**保留页面正文里逐字出现的老路径**作为溯源锚点；`is_registered_source_url()` 在入库链里没有被调用（已核实，只被定义与测试引用），所以这一差异不会阻塞将来入库。

### 离线解析读数（标准库 `HTMLParser`，探针放 `var/` 用完已删）

| 页          | 表数 | 结构                                                                                                                | 覆盖区间                                                                                                      | 数值行数                                        | 页内成文口径                                                 |
| ----------- | ---- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ |
| class1      | 1    | 回／受験者数(申込者数)／実受験者数／合格者数／合格率                                                                | 101 回(2002.6.9)〜173 回(2026.6.14)，**缺 23 个回合号**（103、106、109…每 3 号缺 1，即 1 级早期并非每期都办） | 50 行含 1 条 `155（2020.6.14）中止` ⇒ 49 行有数 | **无**（合格率 1 次仅在 `<th>`；※/注/ただし/口径/分母 全 0） |
| class2      | 1    | 同上                                                                                                                | 101〜173 回，**无缺号**                                                                                       | 73 行含 1 条中止 ⇒ 72 行有数                    | 同上，无                                                     |
| class3      | 1    | 同上                                                                                                                | 101〜173 回，无缺号                                                                                           | 73 行含 1 条中止 ⇒ 72 行有数                    | 同上，无                                                     |
| class23-net | 2    | 期間／受験者数／合格者数／合格率（表 0=2 級、表 1=3 級，靠 H2 分段区分）                                            | 2020 年 12 月〜2021 年 3 月 起，至 2026 年 4〜6 月                                                            | 各 7 行                                         | **全批唯一有一条成文说明**（见下）                           |
| class4      | 1    | **同一张 `<table>` 内混排两种行**：4 列「期間」块（簿記初級，2017/4 起）＋ 5 列「回」块（4 級，含自己的第二行表头） | 初級 2017年4月〜2026年6月（10 行）；4 級 101〜145 回(2002.6〜2017.2)（45 行）                                 | 55 行                                           | 无                                                           |
| costing     | 1    | 期間／受験者数／合格者数／合格率                                                                                    | 2018 年 4 月（施行）〜2026 年 6 月                                                                            | 9 行                                            | 段标题即「2018年4月から施行」                                |

三条必须带进入库轮的事实性发现：

1. **`155（2020.6.14）中止` 是数据行而不是数字**：1／2／3 級三张表里都有一行只有两格，写「中止」（2020 年 6 月统一考试停办）。⇒ 解析器必须把它识别为「该回合无考试」，**不得**落成 0 或留空数字，也不得因此判定结构异常。
2. **class4 一张表两种级＋两种粒度**：4 列块是「簿記初級」（ネット、2017/4 创设）、5 列块是「4 級」（統一、2016 年度为止）。表内还有第二个表头行。⇒ 这正是 §4「维度不得混算」的硬约束落点：一页要拆成 `examLevelId = basic` 与 `examLevelId = 4級` 两组，且 `deliveryMode` 不同（network vs unified）。
3. **唯一一条成文口径在 class23-net**，原文（不是合格率口径）：

   > 2020年12月に開始した日商簿記検定試験2級・3級ネット試験の受験者データは、以下のとおりです。 ※2021年度から、統一試験、団体試験（ペーパー試験）、ネット試験方式で施行しております。試験問題について、3方式いずれも出題範囲や問題の難易度は同じです。

   可作 `statistics_methodology` 的规则型事实候选（ネット試験起始时点 + 三方式出題範囲同一）。**合格率的分母口径六页全数未成文**，§4 的禁令继续有效。

4. 回合日期写法不统一：同一页里既有 `173（2026.06.14）` 全角括号也有 `173(2026.06.14)` 半角，class1 里还有 `2002.6.9` 这类不补零写法。⇒ 解析要按宽容正则取号与日期，`exam_year` 归属仍属**入库前必须确认的产品决策**。

本单到此为止：**未连数据库、未生成候选、未建 `sources` 迁移、未改 baseline 与夹具**。
