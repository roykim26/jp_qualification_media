# G-17 宅建考试统计来源调研报告（只读，未采集、未入库）

> 对应 `V2_GAP_MATRIX.md` §G-17「宅建统计来源」缺口。调研日期＝2026-11-25（宅建令和8年度合格発表当日）。
> 方法＝WebSearch／WebFetch 查证公开网页＋只读仓库文件。**本轮零真实采集命令、零写库、零代码改动**。
> 前序文档＝`docs/work-package-f-statistics-sources.md`（2026-10-11 离线调研）与 `docs/work-package-f-live-capture-authorization.md`（仅授权 FE＋簿记两条，宅建未实抓）。本报告是其**联网复核与修正版**。

---

## 1. 官方发布主体与权威 URL

### 1.1 主管主体：RETIO（考试实施者）＝第一权威来源

宅地建物取引士资格试验自平成21年度（2009）起由**一般财団法人 不動産適正取引推進機構（RETIO／Real Estate Transaction Improvement Organization）**作为登记试验实施机关统一实施（此前由都道府县知事实施）。历年**申込者数／受験者数／合格者数／合格率／合格基準点**的官方发布主体就是 RETIO，国土交通省是主管官厅（发布登录相关统计与白皮书数据，见 §1.2）。

已查证的具体 URL（2026-11-25 活性确认）：

| 用途                            | URL                                                                                                                                                                 | 形态 | 备注                                                                                                                 |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------------------------------- |
| 宅建试验入口页（含统计链接）    | https://www.retio.or.jp/exam/                                                                                                                                       | HTML | 站内挂「試験実施概況（令和7年度以前の過去10年間）」链接                                                              |
| **近10年统计序列（核心）**      | https://www.retio.or.jp/wp-content/uploads/2025-12-10years_result2025.pdf                                                                                           | PDF  | 申込者数・受験者数・合格者数・合格率・合格基準点 的年度表；令和7年度以前10年窗口；2025-12 上传，预计每年12月滚动更新 |
| 单年度结果概要（例：令和6年度） | https://www.retio.or.jp/wp-content/uploads/2024-12-2024result.pdf                                                                                                   | PDF  | 申込301,336／受験者／合格44,992／合格率18.6%／平均年齢等                                                             |
| 单年度受験状況速報（试后数日）  | https://www.retio.or.jp/wp-content/uploads/2025/10/%E2%98%86%EF%BC%B2%EF%BC%97%E5%8F%97%E9%A8%93%E7%8A%B6%E6%B3%81%E3%80%90%E9%80%9F%E5%A0%B1%E3%80%91%E2%98%86.pdf | PDF  | 令和7年度速报，含都道府県别申込/受験                                                                                 |
| 合格者の受験番号公告（单年度）  | https://www.retio.or.jp/wp-content/uploads/2024/12/r6_goukaku_1409.pdf                                                                                              | PDF  | 合格番号公表，不承载汇总统计                                                                                         |
| 旧年度実施結果（杂志存档）      | http://www.retio.or.jp/attach/archive/104-005.pdf                                                                                                                   | PDF  | 平成28年度结果概要，证明 10 年窗口之前的历史序列散在 RETIO 機関誌存档                                                |

### 1.2 国土交通省（主管官厅）＝登录/施行统计与长历史旁证

- 令和7年度 宅地建物取引業法 施行状況調査结果（报道発表）：https://www.mlit.go.jp/report/press/tochi_fudousan_kensetsugyo16_hh_000001_00128.html —— 含「令和7年度新規登録 34,714 人／総登録者数 1,243,738 人」等**登录者**统计（非合格率序列）。
- 国土交通白书历史页（試験统计的官方旁证，可回溯到昭和/平成期）：例 https://www.mlit.go.jp/hakusyo/mlit/h16/hakusho/h17/html/g2055220.html（平成15年度 合格25,942人／合格率15.3％）。
- **e-Stat（政府统计の総合窓口）未检索到宅建试验合格率专门统计数据集**（site:e-stat.go.jp 检索 0 命中，2026-11-25 现取）——宅建试验统计不是以 e-Stat 统计表形式提供，**权威渠道仍是 RETIO 官网公告**。

### 1.3 RETIO「統計概要」页的实际内容（重要修正）

`https://www.retio.or.jp/toukei/toukei/`（更新日 2026-06-01）实际是**《宅建業者と宅建士の統計概要》**——宅建業者数・宅建士登记者数（宅建システム登记数据）的 PDF（令和7年版：`https://www.retio.or.jp/wp-content/uploads/2026/06/Ｒ７-統計概要（宅建業者）.pdf` 与 `…（宅建士）.pdf`），**不是**考试申込/受験/合格/合格率序列。

⇒ **仓库内既有注释与事实不符**：`services/collector/src/collector/capture_takken.py:31-34` 称该页「carries the historical applicant, examinee, passed and pass-rate series」——该说法不成立（工作包 F §2 当时也未实抓此页）。历年合格率序列的正确入口是 `/exam/` 页挂的 **10years_result PDF**。若做宅建统计入库，`capture-only:takken:statistics-overview` 这条登记应改指向/补充 `/exam/` 的结果公告族，并把 `/toukei/toukei/` 定位为「登记者规模」类佐证来源（可支撑 `statistics_methodology` 或背景页，不支撑 `pass_rate` 五字段）。

---

## 2. 发布物形式与更新节奏（已验证）

宅建考试统计**以 PDF 为主、HTML 入口为辅**，年度节奏如下（以令和6/7/8年度实证）：

1. **10 月下旬（第三个日曜）考试**：令和6年度＝2024-10-20、令和7年度＝2025-10-19。
2. **试后数日**：`受験状況【速報】` PDF（都道府県别申込/受験者数）。
3. **11 月下旬～12 月上旬 合格発表**：令和7年度＝2025-11-26 09:30、令和8年度＝**2026-11-25 09:30（今日）**；同日挂出合格者の受験番号公告 PDF。
4. **12 月**：`試験結果の概要` PDF（单年度全量：申込/受験/合格/合格率/性别/年龄/合格者属性）＋ **`試験実施概況（過去10年間）` PDF 滚动更新**（`10years_result2025.pdf` 即 2025-12 上传）。
5. **次年 6 月**：《宅建業者と宅建士の統計概要》PDF 更新（登记者规模，非合格率）。
6. **都道府县厅页**（如广岛 https://www.pref.hiroshima.lg.jp/soshiki/107/1275036993986.html）转载全国+县别数值，可作交叉校验旁证，不作主来源。

⇒ 对本站的含义：**每年只有一个硬更新窗口（12 月上中旬）**，比簿记（隔月更新）和 FE（月度附件）都低频；令和8年度新数据（含 10 年表刷新）预计 **2026-12** 出现。

## 3. 与本站现有 takken 事实数据的对比

### 3.1 现状（只读核对）

- `fixtures/ci/approved-facts.sql`：takken 现行事实 **16 条**（14 个 distinct fact_key＋`payment_deadline` 按 convenience_store／pay_easy 两维度），全部 `exam_year=2026` 的日程/概要类字段（application_open/deadline、eligibility、exam_date/method/subjects/time、fee、question_count/format、result_date 等）。**统计五字段（applicants/examinees/passed/pass_rate/statistics_methodology）0 条**。
- `config/data-coverage-contract.json` 已为 takken 定义 `post_event` 需求：`applicants/examinees/passed/pass_rate/statistics_methodology/scoring_method/passing_standard`（第 298-315 行）——**契约早已就位、数据从未进库**，这正是 G-05 takken pass-rate 空态的根因。
- `packages/db/src/seed.ts:28`：takken 只登记了 `source:takken:retio-exam`（`source_type=official_exam_entry`）。而 `fieldCatalog.pass_rate` 只允许 `official_statistics`／`official_result_information` 两种来源类型 ⇒ **takken 没有任何合法统计来源行**。
- 簿记先例可复用：迁移 `0018_bookkeeping_statistics_sources.sql` 注册了 7 条 `official_statistics` 来源＋F2 追加采集授权单＋863 条历史统计入库链，宅建可照此路径走。
- 工程阻碍两条（工作包 F §3 已识别，本次复核仍成立）：① `snapshot_from_html()` 把快照钉死在单一 `TAKKEN_SOURCE` ingestion id（`capture_takken.py:33` 注释），多来源重构未做；② **全仓无 PDF 表格解析能力**（collector/parser 入口全是 `*_from_html`；venv 有 `pypdf 7.0.1` 但缺 `cryptography`，且无表格化提取器）——宅建核心序列恰在 PDF 里。
- 文档欠账：`docs/` 有 5 个资格的 source-contract，**唯独没有 `takken-source-contract.md`**。

### 3.2 若要给 takken 增加历年合格率表，需要采集的来源清单

| 优先级 | 来源                                               | 提供字段                                                        | 形态      | 更新窗口           |
| ------ | -------------------------------------------------- | --------------------------------------------------------------- | --------- | ------------------ |
| P0     | `10years_result<年>.pdf`（RETIO，链接于 `/exam/`） | applicants/examinees/passed/pass_rate/passing_standard ×10 年   | PDF 表    | 每年 12 月         |
| P1     | `試験結果の概要` 单年度 PDF                        | 当年全字段＋性别/年龄内訳（背景）                               | PDF       | 每年 12 月         |
| P1     | `/toukei/toukei/` 页＋《宅建士統計概要》PDF        | 登记者规模、口径注记（`statistics_methodology` 旁证）           | HTML＋PDF | 每年 6 月          |
| P2     | 受験状況速報 PDF                                   | 当年申込/受験（试后即时值，12 月被正式版取代）                  | PDF       | 每年 10 月末       |
| P2     | 10 年窗口之前的历史年度                            | 需 RETIO 機関誌存档（`attach/archive/*.pdf`）＋国交省白皮书拼接 | PDF/HTML  | 一次性回填，成本高 |

首批建议只做 **P0 一条链**（10 年窗口＝官方自定边界，与「最近 5 年」建议窗口兼容），其余留后续。

### 3.3 许可／引用注意事项

- **RETIO 不是政府机关**，其站点政策页 https://www.retio.or.jp/sitepolicy/ 明示版权声明 “Copyright (C) 2009-2026 Real Estate Transaction Improvement Organization. All Rights Reserved.” ⇒ **无概括性转载许可**。注意：
  1. 纯数值事实（某年申込数/合格率）在日本法下本身不受著作权保护，**摘录数字＋明示出典＋链接回原始 URL** 是安全惯例；
  2. **不得整页转载、不得把官方 PDF 镜像到本站公开供下载**（内网 `var/official-snapshots/` 留证属内部溯源件，不外发，与现有 FP/宅建 capture-only 做法一致）；
  3. 若批量复制其表格版式或长段原文，建议向 RETIO 申请许可以绝后患；
  4. 本站已有「非官方」免责（合规轮 H1），pass-rate 页需带「出典：不動産適正取引推進機構『試験実施概況』URL」级注记。
- **国交省内容**适用政府标准使用条件（政府標準利用規約，CC BY 4.0 兼容）——引用需注明来源，禁止误导为官方背书。
- **口径红线**（工作包 F §3.2/3.3 铁律仍适用）：`pass_rate` 必须取官方印刷值；`statistics_methodology` 只记 PDF 内成文口径（如「合格率＝合格者／受験者」是否成文需逐份核对），不得用通行算法推断入库。

## 4. 可执行采集建议（仅建议，不实施；均需号主单独授权）

1. **先修注释与登记口径**：更正 `capture_takken.py:31-34` 对 `/toukei/toukei/` 的错误描述；新增 `docs/takken-source-contract.md`（补齐六资格契约文档的最后一格）。
2. **重构快照钉死问题**（改代码轮）：让 `snapshot_from_html()` 接受 source_id 参数或按 URL 路由到多个已登记来源，解除「只能抓不能入库」；同步 `test_takken_adapter.py`／`test_takken_capture.py`。
3. **注册来源行**（seed 或迁移，按既有口径：来源行进 `seed.ts`、`qualification_id` 由 seed 绑定）：`source:takken:retio-exam-results`（`official_result_information`，PDF 族）＋`source:takken:retio-statistics`（`official_statistics`，`/toukei/toukei/`）。
4. **立「PDF 表格提取」工作项**（与行政書士/IT Passport 共用，勿在采集轮顺手加）：先定依赖（pdfplumber 或 pypdf＋表格线重建），解决 venv 缺 `cryptography` 的加密 PDF 问题，写 `takken_stats_from_pdf()` 提取器＋夹具。
5. **新开宅建采集授权单**（工作包 F 授权单不可复用）：逐条列 P0/P1 URL、允许域名 `www.retio.or.jp`、`source_ids` 收紧到当批；执行时点建议 **2026-12 中旬**（令和8年度 10years PDF 刷新后），一次拿到 2017–2026 十一年窗口。
6. **入库链走既有三次独立授权**（采集→候选→逐条批准）：新增 `applicants/examinees/passed/pass_rate/passing_standard ×10 年 ≈ 50 条`候选，全部 `pending_review` 需批准；**同批**更新 `config/data-coverage-contract.json`（如需把 post_event 转 required 属产品决策）、`config/release-gate-baseline.json`、`fixtures/ci/approved-facts.sql`、`scripts/verify-ci-fixture.mjs`、`scripts/docker-smoke.mjs` 四处计数链（facts 1007→＋N、snapshots 37→＋M），否则 CI 必红。
7. **呈现层**：复用簿记 `renderHistoryTables()` 的年次表组件即可把 `/shikaku/takken/pass-rate/` 从空态转实表，无需新路由。

## 5. 本报告边界

- 只新增本文件；未改任何代码/配置/既有文档，未运行真实采集，未 git add/commit。
- 所有 URL 为 2026-11-25 检索/抓取时点读数；RETIO 的 PDF 文件名含年份（如 `10years_result2025.pdf`），**逐年改名**，采集时不可硬编码旧文件名。
