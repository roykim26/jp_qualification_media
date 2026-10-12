# 日商簿記：来源登记与字段契约

资格：`bookkeeping`（日商簿記）；实施机构：日本商工会議所（JCCI）；允许域名仅为 `www.kentei.ne.jp`。

## 已登记官方来源

| source_id                          | 用途                                           |
| ---------------------------------- | ---------------------------------------------- |
| `source:bookkeeping:home`          | 资格入口与公告                                 |
| `source:bookkeeping:network`       | 2级、3级、簿記初級、原価計算初級网络试验       |
| `source:bookkeeping:calendar-2026` | 2026年度统一试验、团体试验、网络试验日程与费用 |
| `source:bookkeeping:class1-exam`   | 1级科目、时间与合格标准                        |
| `source:bookkeeping:class2-exam`   | 2级、3级试验注意事项入口                       |

2026-10-09 为补齐统一试验的 `eligibility`、`question_format`、`payment_deadline` 三项缺口，另登记以下来源（URL 全部取自已捕获快照正文中的真实链接）；采集与离线审计完成后，同日经项目所有者另行授权，已建 `0015_bookkeeping_gap_sources.sql` 迁移、入候选并逐条审核批准，见 `docs/data-local-snapshot-audit-2026-09-07.md` 的 2026-10-09 小节：

| source_id                        | 用途                                     |
| -------------------------------- | ---------------------------------------- |
| `source:bookkeeping:class1`      | 1 级等级页（级别说明与公告）             |
| `source:bookkeeping:class2`      | 2 级等级页                               |
| `source:bookkeeping:class3`      | 3 级等级页                               |
| `source:bookkeeping:class3-exam` | 3 级科目、时间与合格标准                 |
| `source:bookkeeping:flow`        | 受験の申し込みの流れ（入口与分流）       |
| `source:bookkeeping:flow-teller` | 统一试验各商工会議所窗口的报名与缴费流程 |
| `source:bookkeeping:flow-net`    | 网络试验报名与缴费流程                   |
| `source:bookkeeping:report`      | 受験者への連絡・注意事項（受験料返還等） |
| `source:bookkeeping:qa`          | 検定試験 Q&A（受験条件・級順・得点開示） |
| `source:bookkeeping:news-51504`  | 2027 年度以降 3 级配点变更公告           |

当前适配器只会从这些来源产出候选：`class1-exam`／`class2-exam`／`class3-exam` 产出按等级分流的 `question_format`，`qa` 产出统一试验 1／2／3 级的 `eligibility`，`flow-teller` 产出 `payment_deadline_rule`，另有 `home`／`network`／`calendar-2026` 产出日程与费用类字段。其余新登记来源（`class1`／`class2`／`class3`／`flow`／`flow-net`／`report`／`news-51504`）只作证据留存，不产出候选。

## 工作包 F／F-2 新增的统计来源登记（2026-10-11 采集，2026-10-12 建映射）

| source_id                                       | URL                                                                                    | `source_type`         | 用途                                                                    |
| ----------------------------------------------- | -------------------------------------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------- |
| `source:bookkeeping:candidate-data`             | `https://www.kentei.ne.jp/bookkeeping/candidate-data`                                  | `official_statistics` | 受験者データ（近年的各級×実施方式序列）                                 |
| `source:bookkeeping:candidate-data-class1`      | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class1`                      | `official_statistics` | 1 級統一の過去のデータ                                                  |
| `source:bookkeeping:candidate-data-class2`      | `https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class2` | `official_statistics` | 2 級統一の過去のデータ（老路径带 `bookkeeping_contents`，官方自身如此） |
| `source:bookkeeping:candidate-data-class3`      | `https://www.kentei.ne.jp/bookkeeping/bookkeeping_contents/candidate-data/data_class3` | `official_statistics` | 3 級統一の過去のデータ（同上）                                          |
| `source:bookkeeping:candidate-data-class23-net` | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class2-3`                    | `official_statistics` | 2 級与 3 級ネットの過去のデータ（主页两个入口指向同一条 URL）           |
| `source:bookkeeping:candidate-data-class4`      | `https://www.kentei.ne.jp/bookkeeping/candidate-data/data_class4`                      | `official_statistics` | 簿記初級（2016 年度まで 4 級）の過去のデータ                            |
| `source:bookkeeping:candidate-data-costing`     | `https://www.kentei.ne.jp/bookkeeping/candidate-data/ca-date`                          | `official_statistics` | 原価計算初級の過去のデータ（路径字面是官方的 `ca-date` 拼写）           |

这 7 条 2026-10-11 先进了**采集侧**：`BOOKKEEPING_SOURCES` 从 15 涨到 **22**（`capture_bookkeeping.capture_registered_sources()` 接受 `source_ids`／`BOOKKEEPING_CAPTURE_SOURCE_IDS` 收紧到当批）。URL 逐字取自已抓快照正文（`docs/work-package-f-statistics-sources.md` §2、`docs/work-package-f2-bookkeeping-history-capture-authorization.md` §2）。授权口径见 `docs/work-package-f-live-capture-authorization.md` 与 `docs/work-package-f2-bookkeeping-history-capture-authorization.md`。

## 统计页的入库映射（2026-10-12 落地，代码就绪、未执行入库）

`_extract_statistics()`（`services/collector/src/collector/bookkeeping.py`）现在读取其中 **4 条**：`candidate-data-class1`／`-class2`／`-class3`／`-class23-net`，产出 `applicants`／`examinees`／`passed`／`pass_rate`／`statistics_methodology`。对已抓快照的实测读数：**807 条候选**（1 級 197＝49 回合×4＋1 条口径说明、2 級／3 級各 289、ネット 32＝7 期×2×2＋4 条口径说明），id 全不相同且与既有 176 条零重叠。

其余 3 条仍只报 `structure_changed`，是刻意的：

- `candidate-data`（主页）印的是同一批表的近年切片，入库会与子页重复计同一事实 ⇒ 只作证据，`ingest_bookkeeping` 的入口映射里没有它。
- `candidate-data-class4`（簿記初級＋已废止 4 級）与 `candidate-data-costing`（原価計算初級）：契约的统计 requirement 只声明 `examLevelId` 1／2／3 級，这三个级**没有契约条目** ⇒ 行照样解析，但不产出候选。要把它们变成事实，得先动 `config/data-coverage-contract.json`（判级/契约改动，需号主确认；**2026-10-12 号主已拍板：继续不纳入**）。

四条硬口径，全部由页面自身文字决定：

1. **列头原文映射**：`受験者数 (申込者数)`→`applicants`、`実受験者数`→`examinees`、`合格者数`→`passed`、`合格率`→`pass_rate`。ネット／初級表只有一个**裸「受験者数」**，页面从未写明它是报名数还是实际应考数 ⇒ **不映射**，所以ネット行只出 `passed`＋`pass_rate`。这不是遗漏，是拒绝推断；一旦号主定口径，改 `STATISTICS_COLUMNS` 一行即可。
2. **`中止` 行不入库也不报错**：統一表各有一行 `155（2020.6.14）中止`（只有两格），含义是「该回合停办」，既不是 0 也不是结构变更 ⇒ 跳过且不计 issue（有用例锁定）。
3. **回合日期三种写法并存**：半角 `173(2026.06.14)`、全角 `172（2026.02.22）`、以及平成年号 `124（Ｈ22.2.28）`⇒ 解析前统一 NFKC＋去空白；`合格率` 同样混用 `%` 与全角 `％`（1 級 49 期里约一半是全角）。无法解析的行报 `unparsed_statistics_row`，整次入库在发写之前中止。
4. **`data_class4` 一张 `<table>` 内混排两个块**（「期間」4 列的簿記初級在上、「回」5 列的 4 級在下，中间有第二个表头行）⇒ `_statistics_blocks()` 按表头行切块，两块各自定級与方式。

### 2026-10-12 号主拍板（三项均维持上述实现，零代码改动）

- **裸「受験者数」继续不映射**。判定用过的两条反向证据（离线探针，不入库、只作决策依据）：統一页 193 行（49＋72＋72）的印刷合格率 **193/193 与 `合格者数 ÷ 実受験者数` 吻合**（最大偏差 0.055pp＝四舍五入），与除以 `申込者数` 全不吻合；ネット页 14 行则 `合格者数 ÷ 受験者数` 14/14 吻合（≤0.05pp）。⇒ 该列**行为上是官方合格率的分母**，但**字面又与統一页的「受験者数 (申込者数)」同词**，两个指向冲突且官方不成文，故不替它选。
- **簿記初級／4級／原価計算初級继续不进契约**（F-2 授权单本来就只授 1／2／3 級統一＋ネット）。要扩需另开一轮，因为改 `config/data-coverage-contract.json` 就是改判级面。
- **`pass_rate` 存官方印刷百分数原值**：`normalized_value` 是转写不是换算（`21.2% 合格率（173（2026.06.14））`⇒`21.2`，全角 `11.2％`⇒`11.2`），`value_type='decimal'`，百分号与回合日期留在 `display_value`。不存 0–1 小数，以免前端反乘小数位与官方印值不一致。

`exam_year` 归属（原「入库前必须确认的产品决策」）已定为：統一表取该行印刷日期的西历年，并另带 `exam_session`（回合号）；ネット／初級的「期間」行取**起始年**作 `exam_year`、`exam_session` 留空，`display_value` 始终原样保留官方期间写法。理由是 0017 之前的身份键只到 `exam_year`，而 2002–2026 的統一序列里有 **292 个 (級, 方式, 年, 字段) 键装着 2–3 条事实**（同一年最多 3 个回合），不加回合就会在批准阶段静默丢数据。

## 写库前预检（只读、可复跑）

`services/collector/src/collector/precheck_bookkeeping.py` 把「要不要真入库」这件事的判据固化成一条命令，跑之前不需要临时探针：

```
set -a; . ./.env; set +a; PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.precheck_bookkeeping
```

它**只 `SELECT`**，逐条走 `INGEST_SOURCES` 的 12 个来源，回答三件事：库能不能收这批候选、磁盘字节还是不是采集报告那一代、离线重算的候选 id 与库里同一代是否逐字节相符。退出码 0＝无阻塞项，1＝有阻塞项（可直接作为真入库的前置门禁），2＝缺 `DATABASE_URL`。

它复用写入侧的同一套符号（`INGEST_SOURCES`／`candidate_id()`／`value_key()`／`approved_value_keys()`／`capture_record()`／`DEFAULT_EXAM_YEAR`），所以「预检说会产 N 条」与「入库真产 N 条」之间不存在第二套算法。

判据码（阻塞项全部大写标记为 `BLOCK`）：

| 码                       | 阻塞 | 含义                                                                                 |
| ------------------------ | ---- | ------------------------------------------------------------------------------------ |
| `session_column_absent`  | 是   | `candidate_facts` 没有 `exam_session` 列，即本机未应用 0017                          |
| `unregistered_source`    | 是   | `sources` 里没有该 `source_id`；`snapshots.source_id` 是外键，入库会在写第一行前中止 |
| `snapshot_missing`       | 是   | 快照文件不在磁盘上                                                                   |
| `capture_record_invalid` | 是   | `capture-report.json` 缺记录、状态非 `ok`／非 200、或缺哈希与抓取时刻                |
| `hash_mismatch`          | 是   | 磁盘字节的 sha256 与报告记录不符（固定文件名原地覆盖过的指纹）                       |
| `parse_failed`           | 是   | `extract_candidates` 对本页报了 issue（结构变更或无法解析的行）                      |
| `id_drift`               | 是   | 库里声称属于**当前这一代快照**的候选 id，代码复现不出来                              |
| `id_collision`           | 是   | 将要新入队的 id 已存在于 `candidate_facts`                                           |
| `staged_delta`           | 否   | 该来源的读数行：`stored`／`computed`／`skipped_approved`／`would_stage`              |

两条刻意的口径：

- **历史代次不算漂移**。`candidate_facts` 会累积同一来源的多个已批准代次（`38c961bb…`／`5824a42e…`／`a1a9f4f0…` 等），这是既有设计。`id_drift` 只比对 `source_snapshot_id = 'snapshot:bookkeeping:' + 磁盘哈希` 那一批行；更早代次在 `staged_delta` 里以 `other generations=M` 报出，不阻塞。
- **`would_stage` 已扣掉写入侧的跳过保护**。`ingest_bookkeeping` 对值与维度都与已批准事实相同的候选不再入队，预检按同一 `value_key` 集合先算 `skipped_approved`，因此 `would_stage` 才是真入库会新增的行数。

2026-10-12 首次本机实跑读数（非推算）：`summary: stored=96 computed=865 skipped_approved=58 would_stage=807 blocking=5`，退出码 1。两个阻塞项是本包的入库前置，此前没有任何文档记过：

1. `session_column_absent` —— 本机库未应用 0017。**判据看列不看计数**：`select 1 from information_schema.columns where table_name='candidate_facts' and column_name='exam_session'` 空即未应用。不要用「`schema_migrations` 行数 vs 迁移文件数」推断——`packages/db/src/migrate.ts` 以**文件名**为主键且不校验记录，0010→0016 改名留下的孤儿记录会让两者在同一条未应用的迁移上恰好相等（本机实测：18 行＝17 个已应用文件＋1 条孤儿，0017 尚未应用）。
2. `unregistered_source` × 4 —— `candidate-data-class1`／`-class2`／`-class3`／`-class23-net` 四条统计来源只存在于 collector 常量里，**`sources` 表中一行都没有**。它们不像 `0015_bookkeeping_gap_sources.sql` 那批：F-2 只授了采集，没建登记迁移 ⇒ 真入库必须先补一条 `INSERT INTO sources` 迁移，否则在写第一条快照时就撞外键。

其余 8 个既有来源 `would_stage=0`（值全部命中已批准跳过保护），即这条链现在重跑是幂等的。

**两条前置已于同日闭合**：`0018_bookkeeping_statistics_sources.sql` 登记七条统计来源（四条可入库序列 `class1`／`class2`／`class3`／`class23-net`，加三条 evidence-only 的父页 `candidate-data`、`class4`、`costing`，后者只为与 collector 常量对齐、避免将来给它们存证时撞同一个外键），本机 `npm run db:migrate` 应用 `0017`＋`0018`。闭合后同一条命令的重跑读数：`summary: stored=96 computed=865 skipped_approved=58 would_stage=807 blocking=0`，**退出码 0**；四个统计来源逐项从 `unregistered_source` 变为 `stored=0 computed=197/289/289/32 would_stage=197/289/289/32`，`would_stage` 合计仍是 807。**即预检已无阻塞项，真入库在代码与库层面就绪，但 `blocking=0` 只是「允许入队」的判据，不等于已获入库授权**；入队后这 807 行全是非合成 `pending_review`，门禁会硬红，逐条批准是另一次授权。

### 审核工作量的分解：`--breakdown`

同一条命令加 `--breakdown` 就把「这 807 条到底是什么」打印出来，供批准轮（第四次授权）前估工作量；仍是只读，聚合对象正是各来源的 `fresh` 行（已扣 `skipped_approved`），字段全部取自候选本身而非第二套算法：

```
set -a; . ./.env; set +a; PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.precheck_bookkeeping --breakdown
```

无法识别的参数直接退 2 并打印用法（避免把拼错的 `--breakdown` 当成「跑过了但没数」）。

2026-10-12 本机实跑读数（非推算，与上面的 `would_stage=807` 逐字相符）：

| 维度       | 分布                                                                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 来源       | `class2` 289／`class3` 289／`class1` 197／`class23-net` 32                                                                                                                                             |
| 級别／方式 | 2 級 unified 289（2002–2026，25 年，72 回合）；3 級 unified 289（同区间，72 回合）；1 級 unified 197（同区间，49 回合）；2 級 network 16（2020–2026，7 年，无回合）；3 級 network 16（同区间，无回合） |
| 字段       | `pass_rate` 207／`passed` 207／`applicants` 193／`examinees` 193／`statistics_methodology` 7                                                                                                           |
| 风险级     | `high` **807（全部）**                                                                                                                                                                                 |
| 值类型     | integer 593／decimal 207／text 7                                                                                                                                                                       |

两个可直接用于决策的读数：

1. **审核量是 807 条全量**，没有 `low`／`medium` 子集可自动放行；`skipped_already_approved=0` 也说明这批值一条都不会被去重保护跳过。
2. **ネット的 32 条只产数值序列之外的字段**：按已拍板口径（裸「受験者数」不映射）每条只落 `passed`＋`pass_rate`，`sessions=0` 是「ネット按期间行、无回合维度」的指纹；真正的历年数值序列是统一考试那 765 条。

## 事实维度

日商簿記不得只用 `qualification + year + fact_key` 表达事实。每条候选必须同时携带：

- `exam_level_id`：`bookkeeping:1`、`bookkeeping:2`、`bookkeeping:3`、`bookkeeping:basic`、`bookkeeping:cost-accounting-basic`
- `delivery_mode`：`unified`、`network`、`group`
- `exam_year`、`fact_key`、值类型、原文证据、官方快照
- `exam_session`：只有按「回」印刷的統一表行才带；ネット／初級行与其余来源一律为 `NULL`

首批允许字段：`exam_method`、`exam_schedule`、`exam_date`、`fee`、`exam_subjects`、`exam_time`、`question_format`、`question_count`、`passing_standard`、`suspension_period`。

日期、费用、合格标准和休止期间均为高风险字段，必须进入人工审核；不同级别或实施方式不得合并。候选入库只在项目所有者单独授权后执行（`BOOKKEEPING_LOCAL_WRITE=1` + 仅 localhost 库 + `capture-report.json` 的 200 与哈希复核），采集授权本身不包含该权限。
