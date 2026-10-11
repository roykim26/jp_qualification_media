# 工作包 F：历史统计（合格率类）受控采集授权单（草稿）

状态：**草稿，未签署、未执行**。本单覆盖工作包 F 第一批的官方统计页采集。签署或明确确认前，禁止向外部站点发起请求、保存新真实快照、生成候选或写入数据库。调研正文见 `docs/work-package-f-statistics-sources.md`（PR #18 ⇒ `812288e`），本单只写「要授权什么、执行时会碰到什么」。

来源 URL 全部取自已抓快照正文里的真实链接（离线解析得出，见调研文档 §2），**本轮没有联网，所以 URL 的活性与当前内容未验证**。

## 1. 请求范围（第一批：3 个 HTML 来源）

| 资格     | 拟新增 source_id                      | URL                                                   | 允许域名           | `source_type`         | 采集脚本 / 开关                                                 | 目的（五字段）                                                                        |
| -------- | ------------------------------------- | ----------------------------------------------------- | ------------------ | --------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 基本情報 | `source:fundamental-it:statistics-fe` | `https://www.ipa.go.jp/shiken/reports/toukei_fe.html` | `www.ipa.go.jp`    | `official_statistics` | `capture_fundamental_it.py`／`FUNDAMENTAL_IT_LIVE_AUTHORIZED=1` | `applicants`、`examinees`、`passed`、`pass_rate`、`statistics_methodology` 的历年序列 |
| 宅建     | `source:takken:statistics-overview`   | `https://www.retio.or.jp/toukei/toukei/`              | `www.retio.or.jp`  | `official_statistics` | `capture_takken.py`／`TAKKEN_LIVE_AUTHORIZED=1`                 | 同上，統計概要页                                                                      |
| 日商簿记 | `source:bookkeeping:candidate-data`   | `https://www.kentei.ne.jp/bookkeeping/candidate-data` | `www.kentei.ne.jp` | `official_statistics` | `capture_bookkeeping.py`／`BOOKKEEPING_LIVE_AUTHORIZED=1`       | 同上，受験者データ（1／2／3 级、统一／网络／团体按页内表头分段）                      |

`institution_id` 用库中已存在的值：`institution:ipa`、`institution:retio`、`institution:jcci`。

**本单第一批不含**：行政書士与 IT Passport（两家的完整历年序列在 PDF 侧，见 §5）、FP 两条（第二批）、宅建 10 年 PDF、簿记两条回次新闻页（`/51246`、`/51136`）、`/pdf/attr.pdf`（属性调查，不承载五字段）。

## 2. 采集之前必须先落的代码动作（可离线完成，不需授权联网）

这三处不是「采集的自然部分」，而是**不做完采集就够不到目标页**的前置条件。逐条给判据读数：

1. **注册表**：适配器只认已登记的 `source_id`。`services/collector/src/collector/fundamental_it.py:17` 的 `FUNDAMENTAL_IT_SOURCES` 现有 **3** 条、`bookkeeping.py:16` 的 `BOOKKEEPING_SOURCES` 现有 **15** 条、`takken.py:12` 是**单个** `TAKKEN_SOURCE` 常量而非表。新来源不进去，`snapshot_from_html()` 会 raise `unregistered ... source`；URL 侧两家的严格度不同——`bookkeeping.is_registered_source_url()` 要求逐字命中注册表里的 URL，`fundamental_it.is_registered_source_url()` 只校验主机名（`fundamental_it.py:181`），所以基本情報这条即使 URL 写歪也可能被放行到抓取阶段，注册表要按官方实际链接逐字填。
2. **宅建的特殊性**：`takken.py` 的 `snapshot_from_html()` 把 `source_id` 硬编码成 `TAKKEN_SOURCE["id"]` ⇒ 统计页即使抓下来，也无法用现行 takken 适配器入库。第一批若包含宅建，必须先把它改成多来源表（或走 `capture-only:` 的仅存证路径，则该来源本轮只能抓不能入库）。
3. **`sources` 行**：按既有口径登记——迁移（先例：`0001_takken_source.sql`、`0005_fundamental_it_sources.sql`、`0006_bookkeeping_sources.sql`、`0015_bookkeeping_gap_sources.sql`）或 `packages/db/src/seed.ts` 的 `INSERT INTO sources`；`sources.qualification_id` **仍由 seed 绑定，不写进迁移**（理由见 `docs/data-gate-semantics.md` §11 第 2 项）。`source_type` 在库里是自由文本（`packages/db/migrations/0000_stage_0.sql:7` 无 CHECK），所以写错类型**不会有任何报错**——唯一防线是审核人。

## 3. 默认抓取范围比本单宽（执行时的主要踩坑点）

各采集函数的默认覆盖面本机实测：

| 函数                                                | 是否接受 `source_ids` | 默认触及                       | 落盘命名                                                             |
| --------------------------------------------------- | --------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `capture_fundamental_it.capture_registered_sources` | **否**                | 全表 3 条                      | `var/official-snapshots/fundamental-it/<sha256>.html`，存在即跳过    |
| `capture_bookkeeping.capture_registered_sources`    | **否**                | 全表 15 条                     | `var/official-snapshots/bookkeeping/<slug>.html`，**无条件原地覆盖** |
| `capture_takken.capture_registered_source`          | 无参数（单来源）      | 1 条（`/exam/`），够不到统计页 | `<sha256>.html`，存在即跳过                                          |
| `capture_takken.capture_directly_cited_sources`     | 是                    | 6 条 `capture-only:`           | `<sha256>.html`，存在即跳过                                          |
| `capture_fp.capture_registered_sources`             | 是                    | 全表 13 条                     | `<slug>.html`，**无条件原地覆盖**                                    |

结论：

- 簿记与基本情報的函数**没有 `source_ids` 形参**，按现状直接执行会一次触及 15 条／3 条已登记来源，远超本单的 1 条。⇒ 执行前要么给这两个函数补 `source_ids`（纯代码＋用例，不联网，建议先做），要么在授权单里显式把「整表重抓」也批准下来。**默认按前者**，本单只授权当批 source_id。
- 簿记的快照是**固定文件名＋无条件写盘**：重抓会把 `home.html` 等 15 个文件的字节原地换掉，而库里只存哈希，页一改版旧字节永久丢失且门禁与审计都测不出「文件与 `content_hash` 已不符」。这与 FP 已知的同一风险同源（见 `docs/fp-source-contract.md`）。⇒ 若本轮为补 `source_ids` 而仍要整表遍历，先按 FP 的做法把将被覆盖的文件做内容寻址副本（放 gitignore 的 `var/`，不入库）。
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
- [ ] `source_ids` 已收紧到 §1 的当批来源（见 §3，簿记与基本情報需要先补该形参）。

## 8. 项目所有者确认

授权人：________________

授权日期（JST）：________________

允许执行窗口（JST）：________________

备注（可选）：________________

确认文本可直接使用：

> 我确认并授权按照本文件 §1 所列的 URL、域名、`source_ids` 收紧要求和一次性窗口执行工作包 F 第一批受控采集；仅保存本地快照与采集报告，不写入数据库、不生成候选、不批准事实。

## 9. 执行顺序

1. 先落 §2 的注册表与形参改动（离线，含 pytest 自证），单独提 PR 过 `release-gate`。
2. 设置当批 `<QUAL>_LIVE_AUTHORIZED=1`，逐源 capture-only，记录成功／未变化／404／重定向拒绝／结构异常。
3. 对新快照做哈希复核与离线解析，只报「能取到哪些字段、口径是否成文」，不产生候选。
4. 更新 `docs/work-package-f-statistics-sources.md` 的活性与粒度读数。
5. 单独请求候选入库授权，再单独请求逐条审核批准授权。
