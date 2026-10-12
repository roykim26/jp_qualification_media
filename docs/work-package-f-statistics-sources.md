# 工作包 F：历史统计（合格率类）官方来源调研

调研日期：2026-10-11。范围：**纯离线**——只读仓库契约、只读查询本机开发库、只解析 `var/official-snapshots/` 里已抓好的官方快照。本轮**没有向任何外部站点发起请求**（也没用搜索引擎），所以表内 URL 的**活性与当前内容尚未验证**；验证属采集授权之后的动作。
**2026-10-11 采集授权后的更新**：`toukei_fe.html` 与 `https://www.kentei.ne.jp/bookkeeping/candidate-data` 两条已实抓并复核（HTTP 200，读数见授权单 §10）；宅建 `https://www.retio.or.jp/toukei/toukei/` **仍未实抓**，活性未验证。两条已抓的结论相反，务必按下述两条分别看待，不要把「IPA 式目录页」的经验套到日商。

## 1. 现状读数

契约侧（`config/data-coverage-contract.json`）：六个资格**各自都有一条 `post_event` 需求**，字段基本同构：

| 资格           | 字段                                                                                                             | 维度约束                                                                             |
| -------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 宅建           | `applicants`、`examinees`、`passed`、`pass_rate`、`statistics_methodology`、`scoring_method`、`passing_standard` | 无                                                                                   |
| 行政書士       | 前五项                                                                                                           | 无                                                                                   |
| IT Passport    | 前五项                                                                                                           | `deliveryMode=cbt`                                                                   |
| 基本情報技術者 | 前五项                                                                                                           | `deliveryMode=cbt`                                                                   |
| 日商簿记       | 前五项                                                                                                           | `examLevelId ∈ {1,2,3}` × `deliveryMode ∈ {unified,network,group}`                   |
| FP             | 前五项                                                                                                           | `providerId ∈ {jafp,kinzai}` × 三个等级 × 七个 `examComponent` × 三种 `deliveryMode` |

`fieldCatalog.pass_rate` 只允许两种来源类型：`official_statistics`、`official_result_information`。本机 `sources` 现有 40 条，`source_type` 分布里**没有一条**是这两类（全是 `official_exam_*`／`official_eligibility`／`official_syllabus`／`official_faq` 一类）⇒ 这不是「登记了没批」，而是**这类来源从未登记过**。

库侧（只读 `SELECT`）：`candidate_facts` 里这五个 `fact_key` 命中 **0 条**，`facts` 里 **0 条**；全库总量仍是 facts 176／candidates 281／snapshots 40／sources 40，与既有基线一致。

**门禁永远不会因为 F 变红**：`scripts/verify-lib.mjs:62` 计算覆盖缺口时对 `post_event`／`optional`／`not_applicable` 直接 `continue`。所以 F 是产品覆盖欠账，不是门禁欠账——这也正是它能长期挂在待办而无人动的原因，别把它理解成「等门禁报警再说」。

## 2. 关键发现：统计页入口就躺在已抓快照的正文里

方法：对 `var/official-snapshots/` 下 **50 个 HTML**（另有 6 份 `fp-preserved/` 内容寻址副本与 2 份 PDF 不参与锚点解析）去标签后扫「合格率／試験結果／統計／実施概況／合格発表／受験者データ／受検者データ」，取命中锚文本的 `<a href>`，按各文件的 `rel=canonical` 解析为绝对地址（无 canonical 的 JAFP／金财／行政書士页回落到采集器注册的 `canonical_url`，两个 IT Passport 哈希名页回落到库里的 `snapshots.original_url`）。结果 **27 条**候选（23 HTML／4 PDF），全部 `www*.or.jp`／`www*.go.jp`，无外部域混入。

「引用面」＝有多少个已抓快照正文里出现这条链接，可作「该页确属官方导航体系的一部分」的旁证。

### 宅建（2 条）

- `https://www.retio.or.jp/toukei/toukei/` — 統計概要，引用面 9。
- `https://www.retio.or.jp/wp-content/uploads/2025/12/10years_result2025.pdf` — 試験実施概況（令和7年度以前の過去10年間），引用面 2，**PDF**。

### 日商簿记（3 条）

- `https://www.kentei.ne.jp/bookkeeping/candidate-data` — 受験者データ，引用面 7（1／2／3 级的六个考试页＋首页都挂着它）。
- `https://www.kentei.ne.jp/51246` — 【第173回簿記検定試験（１級）】受験者データを掲載しました，引用面 1（回次新闻）。
- `https://www.kentei.ne.jp/51136` — 【２級・３級ネット試験】受験者データを掲載しました（2026年４月～６月），引用面 1（回次新闻）。

### FP（4 条）

- `https://www.kinzai.or.jp/ginou/fp/result-fp` — 試験結果，引用面 8。
- `https://www.kinzai.or.jp/gokaku` — 合格発表，引用面 8。
- `https://www.jafp.or.jp/exam/syutoku/` — 試験結果データ，引用面 5。
- `https://www.jafp.or.jp/exam/#Section12` — 試験結果データ（協会首页同一锚点），引用面 5。

### 行政書士（3 条 + 1 条相邻）

- `https://www.gyosei-shiken.or.jp/doc/exam/result/analytics.html#r07a` — 試験結果分析資料，引用面 4，HTML。
- `https://www.gyosei-shiken.or.jp/pdf/trans.pdf` — 試験結果の推移，引用面 4，**PDF**。
- `https://www.gyosei-shiken.or.jp/pdf/prefsummary.pdf` — 都道府県別試験結果一覧，引用面 4，**PDF**。
- 相邻项（不计入五字段）：`/pdf/attr.pdf`「受験者・合格者の属性」，锚文本不含上列关键词、由首轮宽检索发现，属属性调查而非人数序列。

### IT Passport（5 条）

- `https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/statistics.html` — 統計情報，**CBT 站点自己的统计页**。
- `https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pdf/statistics/202606_ip_shikenkekka.pdf` — 試験結果，**PDF**。
- `https://www3.jitec.ipa.go.jp/JitesCbt/html/openinfo/pass.html` — 合格発表等の日程。
- `https://www.ipa.go.jp/shiken/reports/index.html`、`https://www.ipa.go.jp/shiken/goukaku/index.html` — 与本機構（IPA）总页共用，引用面各 1。

### 基本情報技術者（10 条）

- 统计表类：`https://www.ipa.go.jp/shiken/reports/toukei_fe.html`（統計情報（基本情報技術者試験））、`toukei_all.html`（全試験区分）、`toukei.html`（応用／高度／支援士）、`toukei_sg.html`（セキュリティマネジメント）、`reports/index.html`，引用面各 5。
- 结果公布类（多为日程与注意事项，不承载人数表）：`goukaku/index.html`、`goukaku/happyobi.html`、`goukaku/shoukai.html`、`2025/20250420_schedule.html`、`2025/20251012_schedule.html`。

三条判读要点：

- **~~若页内即含历次受験者数／合格者数／合格率~~ 该假设已被 2026-10-11 的实抓推翻**：`toukei_fe.html` 抓到了（HTTP 200、79254 字节、`d3d78fa544…`），但页内**零张 `<table>`**，正文里「合格率」「受験者数」出现 **0 次**，它是一个**附件目录页**：正文只有「統計資料／評価点分布／過去の統計資料（令和5・6・7年度）」三组链接，指向 `*_fe_toukei.pdf`、`202608_fe_01_suiihyo.xlsx`（推移表）、`…_02_kenbetsu.xlsx`（都道府県別）等 20 余个 `.pdf`／`.xlsx`／`.zip`。⇒ 五字段**不在这条 HTML 来源里**，必须再授权抓附件（Excel 优先，推移表最接近历年序列），而全仓同样**没有 xlsx 解析能力**（见 §3 第 1 项，与 PDF 同阻碍）。页内另外确认了「令和5年度以降」「受験申込時のアンケートに基づく」两句成文口径，可作 `statistics_methodology` 的候选原文。
- **日商 `candidate-data` 相反，是六资格里目前唯一「HTML 就够」的一条**（2026-10-11 实抓：HTTP 200、58027 字节、`46fcf61fc2…`）：页内 **7 张 `<table>`**，級与実施方式直接写在 H2 段标题里（1級統一／2級統一／3級統一／2級ネット／3級ネット／簿記初級／原価計算初級），`applicants`／`examinees`／`passed`／`pass_rate` 全是页内印刷的官方值。两种粒度不可混：**統一表按「回＋西历日期」**（列头含 `実受験者数`），**ネット与初級表按「年度（4月〜次年3月）」**（列头只有 `受験者数`）。但**页面对合格率没有任何成文说明**（「合格率」7 次出现全在 `<th>`，「※／注：／ただし／集計／口径／分母」计数为 0），⇒ `statistics_methodology` 只能记列头原样描述或留缺，不得把「合格者／実受験者」当官方公式入库（本机核验该算式与印刷值逐条吻合，仅可作理解用）。更长的历年序列在同站 **6 条子页链接**（`/bookkeeping/candidate-data/data_class1`、`…/candidate-data/data_class2`、`data_class2-3`（2 与 3 级ネット共用）、`data_class3`、`data_class4`、`ca-date`）＋ 1 个 Excel（`2020～2025nendo_boki_jukensha-2.xlsx`，「全級データ」段只有一张 PNG 图，表在附件里）；**这 6 条已于 2026-10-12 按追加单 `docs/work-package-f2-bookkeeping-history-capture-authorization.md` 抓完（全部 HTTP 200）**。追加单 §8 的读数：1／2／3 級統一各一张表回溯到 **101 回(2002.6.9)**（2、3 級 72 期无缺号；1 級 49 期、缺 23 个回合号），三张表里各有一行 `155（2020.6.14）中止`；ネット那页两张表（2 級／3 級各 7 行，自 2020 年 12 月起）；初級／4 級那页是**同一张 `<table>` 内混排「期間」4 列块与「回」5 列块**（初級 2017/4 起 10 行、4 級 101〜145 回 45 行）；原価計算初級 9 行（2018/4 施行起）。**合格率的分母口径六页全数未成文**，唯一一条成文说明在ネット页（ネット起始时点＋「3方式いずれも出題範囲や問題の難易度は同じ」）。⇒ 单靠簿记一条链就足以撑起 `pass_rate` 的历史窗口，行政書士／IT Passport 仍卡在 PDF。
- **宅建那份 10 年 PDF 是官方自己划定的窗口**（令和7年度以前の過去10年間），与 `docs/data-remediation-handoff.md` 工作包 F「首批建议确定统一历史窗口，例如最近 5 年」直接对得上；同一站点的 `/toukei/toukei/` 有 HTML 入口，优先走 HTML。

## 3. 前置条件与阻碍（按代价排序）

1. **PDF 读不了**。四条 PDF 里行政書士两条、宅建一条、IT Passport 一条是各自最完整的历年序列。采集链能落 `.pdf` 字节（`capture_fp.py` 的 capture-only 项与宅建的 directly-cited 文档报告都把 PDF 当快照存），但**没有任何解析器读 PDF 正文**：六个资格适配器的入口一律是 `*_from_html(html: str, ...)`，`services/collector/pyproject.toml` 里没有 `pypdf`／`pdfplumber`／`pdfminer` 一类依赖，全仓 `.pdf` 只出现在采集侧的文件名与 `scripts/backfill-fp-provenance.mjs`。⇒ 要么只用同源 HTML 页（宅建／簿记／FP／行政書士分析资料／IPA 统计都有 HTML 入口），要么先立「PDF 表格提取」工作项，别在 F 里顺手加。
2. **`statistics_methodology` 要页面里成文的口径**：分母是申込数还是実受数、CBT 与统一考试是否合算、年度按上期／下期还是回合。页面无成文口径时按铁律 1 记规则型事实或留缺，不得用通行算法推断。
3. **`pass_rate` 必须是官方口径**。只在同页有明确的実際受考人数与合格人数时才可自行计算，且要与官方原始值分列（工作包 F 的硬要求）。
4. **维度不得混算**：FP 的 provider×level×component×delivery、簿记的 level×delivery 要按页内实际表头拆分；IPA 的 FE 表按区分（春期／秋期）分年，需要先定 `exam_year` 归属口径。
5. **新来源要进 `sources`**：仍按既有口径——来源行由迁移或 `packages/db/src/seed.ts` 写入，`sources.qualification_id` 由 seed 绑定（不放迁移，理由见 `docs/data-gate-semantics.md` §11 第 2 项）；`source_type` 必须用 `official_statistics`／`official_result_information`，这是 `pass_rate` 的唯一合法类型。
6. **入库必然出现 `pending_review`**：与 FP 那类「哈希不变则 0 新增」不同，F 是**全新来源＋全新候选**，任何一条非合成 `pending_review` 都会让门禁 `pending_official != 0` 硬失败。⇒ 采集→入库→批准三步要能连着走完，或者干脆停在「只采集、不入库」。

## 4. 建议的推进切法（供号主定夺，本轮不含任何动作）

- 第一批只做 HTML、且天然带年度序列的三条：`source:fundamental-it:statistics-fe`（IPA `toukei_fe.html`）、`source:takken:statistics-overview`（retio `/toukei/toukei/`）、`source:bookkeeping:candidate-data`（日商受験者データ）。理由：一条页覆盖多年、口径成文概率高、不需要 PDF。**（2026-10-11 实抓后的修正：三条里只有簿记成立。FE 是附件目录页、零表；「口径成文」在簿记页也未成立——合格率无任何成文说明。宅建未抓。⇒ 「HTML 入口＝能取到数」这个前提不能再当作批次规划的依据。）**
- 第二批 FP 两条：`source:fp:jafp-result-data`、`source:fp:kinzai-result-fp`。维度最复杂，放第二批可先在第一批里跑通 `statistics_methodology` 的记法。
- 行政書士与 IT Passport 留到 PDF 议题定案后再排（两家的完整历年序列都在 PDF 侧）。
- 采集要**新写一张工作包 F 授权单**：`docs/work-package-e-live-capture-authorization.md` 已注明 2026-09-08 执行完毕，不可复用；逐条列 URL 与允许域名，并把 `source_ids` 收紧到当批范围。⇒ 已落在 `docs/work-package-f-live-capture-authorization.md`（**2026-10-11 已签署，FE＋簿记两条已执行，读数在其 §10**）。其中记过的两条执行前代码事实已于同日收口：簿记与基本情報的采集函数现已支持 `source_ids`（并从 `<QUAL>_CAPTURE_SOURCE_IDS` 环境变量取值），宅建统计页登记成 `capture-only:takken:statistics-overview` 走仅存证路径，因为 `snapshot_from_html()` 仍把 `source_id` 钉死在单来源常量上——重构留到入库授权轮再做。

## 5. 读数复现方式

三个一次性探针脚本（解析快照正文取锚点、解析 canonical、查库核对 `fact_key` 与来源类型）临时放在 gitignore 的 `var/` 下，跑完即删；本轮读数全部记录在上文，复现需要重新写探针。库侧全程只 `SELECT`，未写入任何一行。
