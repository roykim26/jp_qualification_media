# 工作包 J：基本情報技術者（FE）合格率事实化方案稿

> **状态：已闭合（2026-11-12）**——阶段 1-4 全部执行完毕并经号主逐句授权（「1」→D2/D3/D5 拍板→「同意授权阶段 3＋4 连走」→「提交」→「push」），执行提交 `f46c943` 直推 main、push CI run `43160584486` 双绿，5 条统计事实已批准（FE 15→20、facts 994→999）。**下文 §0–§10 保留为起草时点的方案原文（只作追溯），执行读数与拍板结果见 §11。**

## 0. 一句话结论

FE 的 `pass_rate` 数据**不在已登记的 `statistics-fe` 来源里**——那是一张附件目录页（零 `<table>`），真正的历年人数／合格率在它指向的 **推移表 xlsx** 与 **統計資料 PDF** 附件里。这两类附件**全仓都没有解析能力**，附件 URL **未登记**，且采集／入库链对 xlsx 还有两处硬阻碍。**建议先授权一次「仅采集」把真实附件抓到本地核读结构，再定提取器路线，不要凭空设计表格解析**（与 `youkou_pdf` 先例「先在真实字节上验证再固化」一致）。

## 1. 目标与范围

- 闭合 FE 的 `post_event` 产品覆盖欠账：首要 `pass_rate`，连带同一条 requirement 的 `applicants`／`examinees`／`passed`／`statistics_methodology`。
- **这是产品覆盖欠账，不是门禁欠账**：`scripts/verify-lib.mjs:80` 对 `post_event`／`optional`／`not_applicable` 直接跳过，所以加不加 `pass_rate` 都不改门禁通过判据。别理解成「等门禁报警再说」。
- 范围**只 FE**。IT Passport／宅建／行政書士／FP／簿记的统计各自另包（簿记已有 HTML 链，见工作包 F）。

## 2. 现状读数（本轮现取，2026-11-12）

库侧（只读 `SELECT`，容器 `jpqm-pg18` / 55432）：

| 判据                                                                          | 读数                                                                                      |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| FE 已批准事实（`facts`）                                                      | **15**（契约文档写的「12」已过期）                                                        |
| FE `pass_rate`／`applicants`／`examinees`／`passed`／`statistics_methodology` | **0**                                                                                     |
| 全库 `facts`                                                                  | **994**                                                                                   |
| 非合成 `pending_review`（`official_pending`）                                 | **0**                                                                                     |
| `source:fundamental-it:statistics-fe`                                         | 已登记，`official_statistics`，`active=t`，已绑定 `qualification:fundamental-it-engineer` |

FE 现有 15 条事实（全部 `exam_year=2026`、`delivery_mode=cbt`）：`eligibility`、`exam_method`、`exam_schedule`、`fee`、`passing_standard`、`scoring_method`、`suspension_period`，以及 `exam_subject_{a,b}_{time,format,question_count,answer_count}` 八条。**`eligibility`／`passing_standard`／`scoring_method` 三项已闭合**（工作包 H／I），不再是缺口；本包只动统计五字段，不碰这 15 条。

契约侧（`config/data-coverage-contract.json`）：

- FE `post_event` requirement（L434–444）：字段 `applicants`／`examinees`／`passed`／`pass_rate`／`statistics_methodology`，`requiredLevel=post_event`，维度 `{deliveryMode: "cbt"}`。
- `fieldCatalog.pass_rate`：`valueType=decimal`，`riskLevel=high`，`allowedSourceTypes=[official_statistics, official_result_information]`。⇒ 新来源必须用这两类之一（`statistics-fe` 已是 `official_statistics`）。

## 3. 关键证据：目录页就在盘上，附件清单已离线解析

快照 `var/official-snapshots/fundamental-it/d3d78fa544c37ca9df15d9c60992ee0cbfbb467ec17f5955bd6c4810b39f46ed.html`（2026-10-11 实抓，HTTP 200，79254 字节）。页内**零张 `<table>`**，「合格率」「受験者数」正文 0 次。它只承载三组附件链接＋两句成文口径：

**成文口径（`statistics_methodology` 候选原文，已在盘、无需再抓）：**

- L536：「令和5年度以降の基本情報技術者試験の統計情報を掲載しています。」
- L548：「応募者の方々に**受験申込時に記入していただいたアンケートに基づいた情報**です。」

**附件清单（全部同域 `www.ipa.go.jp`，基路径 `/shiken/reports/ps6vr70000016ew6-att/`，无需扩允许域）：**

| 组                          | 附件                                                                                 | 大小               | 与五字段关系                           |
| --------------------------- | ------------------------------------------------------------------------------------ | ------------------ | -------------------------------------- |
| 統計資料（最新）            | `202608_fe_toukei.pdf`                                                               | 1.2 MB             | 完整报告，含人数／合格率（版式待核）   |
| 統計資料中のデータ（Excel） | `202608_fe_01_suiihyo.xlsx`（**推移表**）                                            | 18 KB              | **历年序列首选**，最可能直接含合格率列 |
| 同上                        | `202608_fe_02_kenbetsu.xlsx`（都道府県別）等 8 个属性 xlsx                           | 16–578 KB          | 属性细分，**与五字段无关，不取**       |
| 評価点分布                  | `202608_fe_hyoukaten_bunpu.pdf`                                                      | 91 KB              | 评分分布，非合格率，**不取**           |
| 過去の統計資料              | `202603_fe_toukei.pdf`／`202503_fe_toukei.pdf`／`202403_fe_toukei.pdf`（各＋`.zip`） | 1.3 MB／640–717 KB | 历史年度，按需取                       |

**时点校正**：盘上快照（2026-10-11）的最新統計資料是 **`202608`（令和8年8月分）**；契约文档与迁移 0027 注释写的「最新 `202609_fe_toukei.pdf`」**未在盘验证**，实抓时须以当时页面实际链接为准，不得照抄 202609。

## 4. 阻碍（按代价排序，含具体代码位置）

1. **无 xlsx 解析能力**：`services/collector/pyproject.toml` 依赖只有 `httpx／beautifulsoup4／lxml／pydantic／psycopg／pypdf`，**无 `openpyxl`** 一类。读推移表须新增依赖。
2. **pypdf 表格提取不可靠**：`youkou_pdf.py` 先例只做「去空白＋整句正则」，`PdfReader.extract_text()` 会把数字表拍平成无序文本，1.2 MB 报告版式复杂，直接套先例风险高。
3. **附件 URL 未登记**：`FUNDAMENTAL_IT_SOURCES` 只有目录页 `statistics-fe`，推移表／統計資料 PDF 的 URL 不在常量表，也不在 `sources`。
4. **采集后缀 bug**：`capture_fundamental_it.py` L75–79 只按「URL 以 `.pdf` 结尾→`.pdf`，否则→`.html`」判后缀，**`.xlsx` 会被存成 `.html`**。
5. **入库 PDF 路由钉死 youkou**：`ingest_fundamental_it.py` L52–54 把**所有** `.pdf` 走 `youkou_pdf.snapshot_from_pdf`（`SOURCE_ID` 硬编码 `source:fundamental-it:youkou-pdf`），统计 PDF 不能复用此路径。
6. **入库后缀白名单不含 xlsx**：`ingest_fundamental_it.py` L47 只允许 `{".html", ".pdf"}`。
7. **`exam_year` 归属口径未定**：FE 自令和5年度起全年 CBT，统计按**年度／年月**发布（非单一考试日）。`exam_year` 该取统计覆盖年度、发布年月、还是单一年度试点，须拍板（工作包 F §3 第 4 项遗留）。
8. **`pass_rate` 必须官方印刷值**：若附件只印人数没有合格率，自行计算须有官方成文分母口径，且与官方原始值**分列**（工作包 F 硬要求／铁律）。目录页两句口径只说「アンケート_based」，**未成文分母公式**，不得据此推断合格率算式。
9. **新非合成 `pending_review` 会让门禁硬失败**：`pending_official != 0` 即红。⇒ 采集→入库→批准三步要能连走，或干脆停在「仅采集、不入库」。

## 5. 路线选项（供拍板）

| 路线                                       | 做法                                                                                         | 优点                                                                  | 代价／风险                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **A：xlsx 推移表（推荐）**                 | 加 `openpyxl`；登记推移表附件为 `official_statistics` 来源；新写 xlsx 提取器；修阻碍 4／5／6 | 结构化最可靠、文件最小（18 KB）、最接近历年序列；单元格可精确定位证据 | 新增依赖；**前提：推移表确含官方合格率列（待抓后核）**                       |
| B：PDF 統計資料                            | 登记 PDF 附件；新写 pypdf 表格提取器                                                         | `pypdf` 已在依赖                                                      | 1.2 MB 报告版式复杂、数字表提取脆弱，风险高                                  |
| C：最小试点（仅 `statistics_methodology`） | 只用盘上目录页两句成文口径产 `statistics_methodology`，不抓附件、不产 `pass_rate`            | 代价最低、无需采集                                                    | **没真正交付合格率**；且要改 `statistics-fe` 的 `structure_changed` 锁定用例 |

**共同前置**：无论 A／B，都要**先看到真实附件结构**才能设计可靠提取器。现在附件不在盘，任何「表头长这样、合格率在第几列」的设计都是猜测。

## 6. 推荐推进切法（分阶段，每阶段单独授权）

- **阶段 1（仅采集，推荐先做）**：授权把 `202608_fe_01_suiihyo.xlsx`（推移表）＋ `202608_fe_toukei.pdf`（統計資料）抓到 `var/`（gitignored），**不入库、不改登记、不改适配器**。可用一次性 `var/` 探针走 `SafeFetcher`（同域、无需扩域），或先小改采集链支持 xlsx 后缀。抓后**离线核读**：推移表有没有合格率列？年度怎么排？分母口径成文没有？PDF 与 xlsx 哪个更可靠？
- **阶段 2（定路线＋代码，离线）**：据真实结构定 A 或 B，写提取器＋登记迁移＋修阻碍 4／5／6＋真实字节离线用例（结构变化→`structure_changed`，不推断）。**不入库。**
- **阶段 3（入库）**：`FUNDAMENTAL_IT_LOCAL_WRITE=1`＋localhost＋非 production，产 `pending_review`。
- **阶段 4（批准）**：admin `x-reviewer-id` 头，逐条绑定快照证据。
- **阶段 5（落账）**：文档＋commit／push（另授权）。

阶段 3／4 必须连走（否则门禁红）；阶段 1／2 可独立停在「只采集／只改代码不入库」。

## 7. 门禁与基线影响

- `post_event` 跳过（verify-lib L80）⇒ 加 `pass_rate` **不改门禁通过判据**（仍 6/6）。
- 但新非合成 `pending` 会硬失败 `pending_official` ⇒ 阶段 3／4 必须连走，批准归 0 后才绿。
- **baseline 982／CI 夹具不动**；本机 `facts` 会 994→994+N（N＝批准的统计事实数），与夹具领先差继续扩大；刷新须另开 baseline 变更授权。
- 不推断、不改动已批准的 `eligibility`／`passing_standard`／`scoring_method`。

## 8. 验收标准（草案）

1. `pass_rate` 绑定真实官方附件快照（`synthetic=false`、HTTP 200），`normalized_value` 为**官方印刷合格率**（decimal），`evidence_text` 保留原文／单元格位置。
2. `exam_year`／`delivery_mode=cbt` 维度按拍板口径写入；来源 `source_type=official_statistics`。
3. 提取器有**真实字节离线用例**锁定；附件结构变化→`structure_changed`，不推断。
4. 若只取到人数无官方合格率：要么留 `pass_rate` 缺、要么按官方成文口径计算并与官方值分列——二者须拍板（D4）。
5. 门禁仍 6/6，`official_pending` 归 0，baseline／夹具未动。

## 9. 边界与铁律（沿用交接）

- 采集／候选入库／审核批准**三次独立授权**；push／开 PR／「合并」各一句明示；**部署暂缓，不提**。
- 不动 baseline 与 CI 夹具（982）；不推断 `eligibility`／`passing_standard`／`scoring_method`；admin 写只认 `x-reviewer-id` 头。
- 未跟踪 `Python/` 是旧残留，别删别提交。定时／通知安装前确认。
- **本轮纯离线，未抓、未写库、未改代码。**

## 10. 待拍板决策点

- **D1（路线）**：A（xlsx）／B（PDF）／C（仅 methodology）／**先阶段 1 仅采集核读再定**？（推荐：先阶段 1 仅采集，核读后定 A）
- **D2（`exam_year` 口径）**：统计覆盖年度 vs 发布年月 vs 单一年度试点？
- **D3（首批范围）**：取哪个年度（建议最近一个完整年度，如令和7年度＝2025）？取几年？
- **D4（无官方合格率时）**：留缺，还是按官方成文口径计算并分列？
- **D5（methodology 同批）**：`statistics_methodology` 是否同批取（目录页两句已在盘，但需改 `structure_changed` 锁定用例）？

## 11. 执行记录（2026-11-12，已闭合）

**拍板结果**：D1=**A（xlsx 推移表）**；D2=**exam_year 取年度起始年**（令和 N→2018+N，令和7→2025，与簿记统计先例一致）；D3=**仅令和7完整年度**（进行中年度整块跳过，令和5/6 在表内但未入库）；D4=**不再需要**（官方印刷合格率存在，分母公式成文在 xlsx oddFooter「合格率（合格者数／受験者数：％）」——修正 §4 第 8 条「目录页未成文」的假设：成文位置在附件脚注）；D5=**methodology 同批**。

**阶段 1（仅采集）实测**：附件已按月滚到 **202609**（§3 时点校正被验证，202608 清单是历史值）；`202609_fe_01_suiihyo.xlsx` 18040B（sha256 `2063cd07…`）、`202609_fe_toukei.pdf` 1234980B（AES 加密、空口令，文本扁平）⇒ A 路线成立。推移表结构：sheet「ＦＥ」A1:AA60，每年度 3 行（応募者数／受験者数／合格者数），4月–3月成对列（数+率），Z/AA=年度合計；行 10-12=令和7（Z10=172217／Z11=147186／Z12=56370／AA12=38.3），行 13-15=令和8 进行中（仅 4-9 月），58-60=累計。表头截止注记「(令和8年10月21日現在)」。

**阶段 2（离线代码）**：`openpyxl>=3.1` 进 pyproject；新提取器 `fe_statistics_xlsx.py`（四重锚定＋完整年度块＋round(x,1) 去浮点尾差＋NFKC 归一月份常量）；阻碍 4/5/6 全修（采集后缀、入库 PDF 路由守卫、白名单）＋registry/patrol/analyze 同批 xlsx 支持；迁移 `0029`；真实字节夹具＋13 条用例（8 条篡改→structure_changed）。

**阶段 3＋4（连走授权）**：0029 应用（1 Applied、seed bound 1）→两来源实抓 2/2 ok/200（哈希与阶段 1 逐字节一致）→入库 `FUNDAMENTAL_IT_ONLY_EXAM_YEAR=2025` 过滤出 **5 条 pending**→admin 批准 **5/5**（`x-reviewer-id=work-package-j-owner-review`，脚本 `var/approve-fe-statistics.mjs`）。落账：applicants 172217／examinees 147186／passed 56370／pass_rate 38.3（官方印刷值）／statistics_methodology 两句原文，全 `exam_year=2025`、`delivery_mode=cbt`、high。

**交付与验收（对照 §8）**：`f46c943`（15 文件 796/14）直推 main，CI run `43160584486` 双 job success。①pass_rate 绑定真实快照、官方印刷值、evidence 带单元格地址✓；②exam_year/delivery_mode/source_type 按拍板✓；③真实字节用例锁定、结构变化→structure_changed✓；④D4 消解✓；⑤门禁 6/6、pending 0、baseline/夹具 982 未动✓。facts 994→**999**（FE 15→**20**）、pytest **237**（collector 230＋parser 7）。

**遗留（各需新授权）**：月度附件 URL 滚动刷新（改常量表＋新迁移＋三次授权）；令和5/6 历史年度入库；baseline/夹具刷新（本机领先 17）。

---

相关文档：`docs/work-package-f-statistics-sources.md`（六资格统计来源调研，FE 附件目录页结论的出处）、`docs/fundamental-it-engineer-source-contract.md`（FE 来源登记与字段契约，含 suiihyo 条目与 J 落账节）、`docs/data-gate-semantics.md`（`post_event` 跳过机制）、`services/collector/src/collector/youkou_pdf.py`（PDF 最小提取先例）、`services/collector/src/collector/fe_statistics_xlsx.py`（本包落地的 xlsx 提取器）。
