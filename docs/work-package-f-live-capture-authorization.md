# 工作包 F：历史统计（合格率类）受控采集授权单（草稿）

状态：**草稿，未签署、未执行**。本单覆盖工作包 F 第一批的官方统计页采集。签署或明确确认前，禁止向外部站点发起请求、保存新真实快照、生成候选或写入数据库。调研正文见 `docs/work-package-f-statistics-sources.md`（PR #18 ⇒ `812288e`），本单只写「要授权什么、执行时会碰到什么」。

来源 URL 全部取自已抓快照正文里的真实链接（离线解析得出，见调研文档 §2），**本轮没有联网，所以 URL 的活性与当前内容未验证**。

## 1. 请求范围（第一批：3 个 HTML 来源）

| 资格     | 拟新增 source_id                          | URL                                                   | 允许域名           | `source_type`                     | 采集脚本 / 开关                                                                     | 目的（五字段）                                                                        |
| -------- | ----------------------------------------- | ----------------------------------------------------- | ------------------ | --------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 基本情報 | `source:fundamental-it:statistics-fe`     | `https://www.ipa.go.jp/shiken/reports/toukei_fe.html` | `www.ipa.go.jp`    | `official_statistics`             | `capture_fundamental_it.py`／`FUNDAMENTAL_IT_LIVE_AUTHORIZED=1`                     | `applicants`、`examinees`、`passed`、`pass_rate`、`statistics_methodology` 的历年序列 |
| 宅建     | `capture-only:takken:statistics-overview` | `https://www.retio.or.jp/toukei/toukei/`              | `www.retio.or.jp`  | `official_statistics`（入库时用） | `capture_takken.py` 的 `capture_directly_cited_sources`／`TAKKEN_LIVE_AUTHORIZED=1` | 同上，統計概要页                                                                      |
| 日商簿记 | `source:bookkeeping:candidate-data`       | `https://www.kentei.ne.jp/bookkeeping/candidate-data` | `www.kentei.ne.jp` | `official_statistics`             | `capture_bookkeeping.py`／`BOOKKEEPING_LIVE_AUTHORIZED=1`                           | 同上，受験者データ（1／2／3 级、统一／网络／团体按页内表头分段）                      |

`institution_id` 用库中已存在的值：`institution:ipa`、`institution:retio`、`institution:jcci`。

宅建那一条刻意用 `capture-only:takken:statistics-overview` 而不是 `source:takken:statistics-overview`：`takken.py` 的 `snapshot_from_html()` 把 `source_id` 钉死在单个 `TAKKEN_SOURCE` 常量上（全仓 15 处引用该常量，含 `ingest_takken.py`），所以本批宅建**只能存证、不能入库**；要让它进公开面，得先做多来源重构，那属于第二次（入库）授权的范围。这与 FP 的 `capture-only:fp:*` 先例同形。

**本单第一批不含**：行政書士与 IT Passport（两家的完整历年序列在 PDF 侧，见 §5）、FP 两条（第二批）、宅建 10 年 PDF、簿记两条回次新闻页（`/51246`、`/51136`）、`/pdf/attr.pdf`（属性调查，不承载五字段）。

## 2. 采集之前必须先落的代码动作（2026-10-11 已落地，零联网）

这三处不是「采集的自然部分」，而是**不做完采集就够不到目标页**的前置条件。本轮落的状态：

1. **注册表：已登记。** `services/collector/src/collector/fundamental_it.py` 的 `FUNDAMENTAL_IT_SOURCES` 从 **3** 条增到 **4** 条（新增 `source:fundamental-it:statistics-fe`），`bookkeeping.py` 的 `BOOKKEEPING_SOURCES` 从 **15** 条增到 **16** 条（新增 `source:bookkeeping:candidate-data`，`source_type` 写 `official_statistics`），`capture_takken.DIRECTLY_CITED_CAPTURE_SOURCES` 从 **6** 条增到 **7** 条。三家契约文档的来源表同步更新。URL 侧两家的严格度不同——`bookkeeping.is_registered_source_url()` 要求逐字命中注册表里的 URL，`fundamental_it.is_registered_source_url()` 只校验主机名（`fundamental_it.py`），所以基本情報那条即使 URL 写歪也会被放行到抓取阶段；注册表已按官方实际链接逐字填。
2. **宅建：走仅存证路径，多来源重构仍未做。** `takken.py` 的 `snapshot_from_html()` 仍把 `source_id` 硬编码成 `TAKKEN_SOURCE["id"]`，该常量被 `takken.py`／`capture_takken.py`／`ingest_takken.py` 三处模块共十余处引用，属入侵式重构且触及已批准事实所在的入库链 ⇒ 本轮**没有**改它，改为把统计页登记成 `capture-only:` id。后果要说清：宅建这一条本轮**只能抓、不能入库**，要出事实得先做多来源重构，那是入库授权轮的前置。
3. **`sources` 行：本轮仍未做。** 采集不需要库行，而既有先例（工作包 E）是「先抓、离线审计通过后再建迁移」。所以 `source:fundamental-it:statistics-fe` 与 `source:bookkeeping:candidate-data` 目前**只存在于采集侧常量表**，库里没有它们的行、也没有快照与候选。将来登记时 `sources.qualification_id` 仍由 `packages/db/src/seed.ts` 绑定、不写进迁移（理由见 `docs/data-gate-semantics.md` §11 第 2 项）；`source_type` 在库里是自由文本（`packages/db/migrations/0000_stage_0.sql:7` 无 CHECK），写错类型**不会有任何报错**——唯一防线是审核人。

另外补了一条铁律 1 的护栏：新来源都**没有**加进任何 ingest 映射，`extract_candidates()` 对这两条统计页只会报 `structure_changed`（`test_bookkeeping_contract.py` 与 `test_fundamental_it_contract.py` 各一条用例锁定），所以即使有人误传去入库也不会造出推断值。

## 3. 默认抓取范围与本单授权范围的对齐（2026-10-11 已收紧）

各采集函数的覆盖面本机实测（括号内为登记新来源后的条数）：

| 函数                                                | 是否接受 `source_ids` | 默认（`source_ids=None`）触及  | 落盘命名                                                             |
| --------------------------------------------------- | --------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `capture_fundamental_it.capture_registered_sources` | **是**（本轮补）      | 整表 4 条                      | `var/official-snapshots/fundamental-it/<sha256>.html`，存在即跳过    |
| `capture_bookkeeping.capture_registered_sources`    | **是**（本轮补）      | 整表 16 条                     | `var/official-snapshots/bookkeeping/<slug>.html`，**无条件原地覆盖** |
| `capture_takken.capture_registered_source`          | 无参数（单来源）      | 1 条（`/exam/`），够不到统计页 | `<sha256>.html`，存在即跳过                                          |
| `capture_takken.capture_directly_cited_sources`     | 是                    | 整表 7 条 `capture-only:`      | `<sha256>.html`，存在即跳过                                          |
| `capture_fp.capture_registered_sources`             | 是                    | 整表 13 条                     | `<slug>.html`，**无条件原地覆盖**                                    |

要点：

- 簿记与基本情報的函数原先**没有** `source_ids` 形参，按现状执行会一次触及整表来源、远超本单的 1 条。本轮已补 `selected_capture_sources()`（照 `capture_fp` 的写法：`None` 保持整表的例行行为，显式传入才收紧；未登记的 id 在**建 fetcher 之前**抛 `ValueError`），并各加 2 条用例：收紧后 `results` 只含当批 id；未知 id 被拒且**没有构造任何 fetcher**（用例里把 `SafeFetcher` 换成会直接 raise 的桩）。⇒ 签署本单时，执行命令必须显式传 `source_ids`。
- 簿记的快照是**固定文件名＋无条件写盘**：整表重抓会把 `home.html` 等 16 个文件的字节原地换掉，而库里只存哈希，页一改版旧字节永久丢失，且「文件与 `content_hash` 已不符」在门禁与审计里都测不出。这与 FP 已知的同一风险同源（见 `docs/fp-source-contract.md`）。⇒ 只要按上一条用 `source_ids` 收紧到 `candidate-data` 一条，就不会碰到其余 15 个文件；若因故要整表遍历，先给将被覆盖的文件做内容寻址副本（放 gitignore 的 `var/`，不入库）。
- 基本情報／宅建的落盘是内容寻址且「存在即跳过」，不存在覆盖丢证据的问题。

## 4. 入库与批准是另外的授权，且一定让门禁变红

- 采集本身**不连数据库**：只写 `var/official-snapshots/<qualification>/` 与 `capture-report.json`（六条链共用 `collector.capture_report.write_capture_report()`，按 `source_id` 合并）。
- F 与 FP 那类「哈希不变则候选新增 0 条」不同：本批是**全新来源＋全新候选**，任何一条非合成 `pending_review` 都触发门禁 `requireNoOfficialPending` 硬失败（`scripts/verify-lib.mjs`）。所以「采集 → 入库 → 批准」要能连着走完，或者明确停在「只采集、不入库」。
- 批准后要同轮更新 `config/release-gate-baseline.json` 与 CI 夹具计数口径（见 `docs/data-gate-semantics.md`），否则计数断言会漂。
- 三次授权各自独立：本单只给第 1 次（采集）。第 2 次需要 `<QUAL>_LOCAL_WRITE=1` 且 `NODE_ENV` 非 `production`，第 3 次是 `POST /internal/reviews/{id}` 带 `x-reviewer-id` 头逐条批准并写明官方原文依据。

## 5. 阻碍项：PDF（本单不解决，只登记为待决）

四条 PDF 是行政書士／宅建／IT Passport 各自最完整的历年序列，但**全仓没有任何读 PDF 正文的能力**：六个适配器入口一律 `*_from_html(html: str, ...)`，`services/collector/pyproject.toml` 无 `pypdf`／`pdfplumber`／`pdfminer`。⇒ 行政書士与 IT Passport 的历史统计不在本单范围，要先立「PDF 表格提取」工作项并由号主决定是否引依赖。

## 6. 不可扩大范围的约束

- [ ] 仅访问 §1 表中列出的 HTTPS URL；重定向仍由 `SafeFetcher` 重验允许域名。
- [ ] 不使用 Cookie、登录态、代理、付费接口、生产数据库或生产对象存储。
- [ ] 只写 `var/official-snapshots/<qualification>/` 的 HTML 与采集报告；本单不含候选摄取、审核、批准、release baseline 或 CI fixture 更新。
- [ ] 每个响应记录最终 URL、HTTP 状态、内容 SHA-256、字节数和 UTC／JST 采集时间。
- [ ] 只从明确标题、表格或结构化字段取值；遇 404、结构变化、口径不明或来源冲突即停该来源，不创建候选。
- [ ] `pass_rate` 只按官方口径展示；页面无成文分母口径时，`statistics_methodology` 按铁律 1 记规则型事实或留缺，不得用通行算法推断。
- [ ] 簿记按页内实际表头拆 `examLevelId` × `deliveryMode`；禁止跨等级、跨实施方式复用值。
- [ ] IPA 的 FE 表按春期／秋期分年，`exam_year` 归属口径要在入库前定下来，不得先抓后定。
- [ ] 本次授权仅限一次受控读取；不建立定时采集或持续监控。

## 7. 运行环境确认

- [ ] `NODE_ENV` 不是 `production`。
- [ ] 采集步骤不配置 `DATABASE_URL`。
- [ ] 走项目的 `SafeFetcher`，不绕过 HTTPS、超时、重试、缓存、响应大小或重定向限制。
- [ ] 执行命令带上了 `*_CAPTURE_SOURCE_IDS`，把当批范围收紧到 §1 的来源（不传就等于整表重抓，见 §3 与 §9 的命令）。

## 8. 项目所有者确认

授权人：________________

授权日期（JST）：________________

允许执行窗口（JST）：________________

备注（可选）：________________

确认文本可直接使用：

> 我确认并授权按照本文件 §1 所列的 URL、域名、`source_ids` 收紧要求和一次性窗口执行工作包 F 第一批受控采集；仅保存本地快照与采集报告，不写入数据库、不生成候选、不批准事实。

## 9. 执行顺序

1. ~~先落 §2 的注册表与形参改动~~ **2026-10-11 已落地**：两条采集函数补了 `source_ids`（并从 `*_CAPTURE_SOURCE_IDS` 环境变量取当批范围，否则命令行只有「整表重抓」一种含义），三条来源进了采集侧常量表，宅建走 `capture-only` 路径。Python 用例 117 ⇒ **126**。
2. 签署本单后设置当批 `<QUAL>_LIVE_AUTHORIZED=1`，逐源 capture-only，记录成功／未变化／404／重定向拒绝／结构异常。整条可复制命令（在项目根目录、一次性受控读取，三条各跑一次）：

   ```
   FUNDAMENTAL_IT_LIVE_AUTHORIZED=1 FUNDAMENTAL_IT_CAPTURE_SOURCE_IDS=source:fundamental-it:statistics-fe PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.capture_fundamental_it
   ```

   ```
   BOOKKEEPING_LIVE_AUTHORIZED=1 BOOKKEEPING_CAPTURE_SOURCE_IDS=source:bookkeeping:candidate-data PYTHONIOENCODING=utf-8 uv run --project services/collector python -m collector.capture_bookkeeping
   ```

   宅建那条走仅存证路径，需要一次 Python 调用而不是命令行模块（因为它的 `__main__` 只跑根页）：

   ```
   TAKKEN_LIVE_AUTHORIZED=1 uv run --project services/collector python -c "import json;from collector.capture_takken import capture_directly_cited_sources as c;print(json.dumps(c(source_ids=('capture-only:takken:statistics-overview',)),ensure_ascii=False,indent=2))"
   ```

3. 对新快照做哈希复核与离线解析，只报「能取到哪些字段、口径是否成文」，不产生候选。
4. 更新 `docs/work-package-f-statistics-sources.md` 的活性与粒度读数。
5. 单独请求候选入库授权，再单独请求逐条审核批准授权。宅建在入库前还要先做多来源重构（§1 说明）。
