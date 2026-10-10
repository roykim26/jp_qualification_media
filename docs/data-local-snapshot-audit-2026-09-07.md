# 工作包 E：本地快照与适配器审计（2026-09-07）

本记录只审计已登记来源对应的本地 HTML 快照。没有进行 HTTP 请求、没有读取官网实时内容。

## 结论

本轮向 localhost 审核队列生成候选，并完成可复核项的人工审核：

| 资格           | 新增候选 | 风险   | 来源/快照                                    | 说明                                     |
| -------------- | -------: | ------ | -------------------------------------------- | ---------------------------------------- |
| 宅建           |        6 | high   | `source:takken:retio-exam` / `a0b3…e5d1`     | 文本重编码哈希与原始快照不一致，全部拒绝 |
| 基本信息技术者 |        2 | medium | `source:fundamental-it:cbt` / `e254…0eeb1`   | 审核后批准：CBT 实施方式、全年随时实施   |
| FP             |        2 | high   | `source:fp:kinzai-eligibility` / `9a46…18ab` | 审核后批准：1级学科与实技资格条件        |

所有上述项保留 `source_id`、`source_snapshot_id` 与 `evidence_text`。宅建正确字节 SHA-256 为 `e78a…b9ad`，其对应的 6 条历史候选原已处于 `approved`，本轮没有重复批准。基本信息技术者两条审核后分别创建 revision，并更新对应正式 fact 与 change event。

## 六资格适配器核对

| 资格                    | 可用本地快照                    | 适配器结果                                                     | 覆盖/适配器缺口                                                                                           |
| ----------------------- | ------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| takken                  | 2026 日程快照                   | 新增 6 条待审；补充离线入队入口，避免为本地快照发起联网请求    | 费用、资格、方式、题型、合格标准等没有可安全映射的本地证据                                                |
| gyoseishoshi            | `guide.html`、`guide-2026.html` | 已解析字段与历史候选幂等冲突，未新增                           | 结果日、题数、题型、评分、合格标准和来源/核验元数据仍缺                                                   |
| it-passport             | 三份 IPA/JITEC 快照与分析报告   | 报告中的 2 条候选已存在，幂等不重复入队                        | 本地报告未产出新的条件字段；不得由 CBT 叙述推断日期/费用                                                  |
| fundamental-it-engineer | exam、cbt                       | exam 已在历史链；cbt 原结构不匹配，新增受控解析后产生 2 条待审 | 月度结果表缺少可表达的月份/场次维度，未生成会混淆年度的 `result_date`                                     |
| bookkeeping             | home、network、calendar、1/2 级 | 已登记的四份解析后均与 38 条历史候选幂等                       | home 及部分等级/统一/团体组合尚无安全的字段提取；不能以网络试验值覆盖统一试验                             |
| fp                      | 两机构九份快照                  | 三个已映射来源均与 39 条历史候选幂等                           | JA FP 1级、金财 2/3级/资格等快照尚无完整 provider × level × component × mode 提取；不得合并机构或实施方式 |

## 本轮适配器变更

- `ingest_takken.py` 新增只读取 `var/official-snapshots/takken/` 的离线入口。它要求显式本地写入授权、拒绝生产/非 localhost 数据库，并按原始文件字节计算 SHA-256，避免 CRLF 文本重编码造成不可验证的快照哈希。
- `fundamental_it.py` 为已登记 `source:fundamental-it:cbt` 增加严格匹配：仅当原文明确同时出现 FE 的 CBT 声明时提取 `exam_method=CBT`；仅在明确出现“全年随时实施”时提取 `exam_schedule=year_round`。不读取共享页面中的月度结果表。

## 审核注意事项

1. 宅建错误哈希的 6 条副本已被拒绝，拒绝理由已记录在审核链；不得将其与正确哈希的历史已批准事实混同。
2. 基本信息技术者两条为中风险，已确认共享 SG/FE 页面中的声明明确包含 FE 后批准。
3. FP 两条均保留金财 1级、科目和实施方式维度；资格表的 `rowspan` 由适配器逐行处理，避免学科和实技要求混合。
4. 本地快照的采集日期不等于生产新鲜度；不得将其作为 `official_verified_at` 或解除发布门禁的理由。
5. 本轮未更新 release baseline 或 CI fixture。基线条数仅作为回归下限，完整性仍以覆盖契约判定。

## 下一步的安全前提

只有人工审核完成新增候选，且由独立人员决定批准/拒绝后，才可重新运行覆盖门禁。对仍缺的维度，需要先补齐对应登记来源的本地快照或获得受控抓取授权；不得从现有快照推断或跨机构、等级、科目、实施方式复用值。

## 本地证据无法补齐清单

本清单由本地快照审计和 2026 年覆盖门禁共同得出。它表示“当前登记的本地快照和已批准事实链不足以安全产生候选”，**并不**表示官网没有这些信息。除非取得对应登记来源的新快照或受控抓取授权，以下项目不得创建候选、不得跨维度复用，也不得以缺失值解除门禁。

| 资格     | 覆盖维度                                | 当前不能由本地证据补齐的字段                                                                                                                                                           | 需要的下一份证据                                                                                                       |
| -------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 宅建     | 全资格 / 2026                           | `payment_deadline`、`eligibility`、`application_method`、`fee`、`exam_method`、`exam_subjects`、`exam_time`、`question_count`、`question_format`、`scoring_method`、`passing_standard` | 分别含报名、费用、考试规格、评分/合格标准的登记官方页面快照；日程快照仅能证明已入链的日期字段。                        |
| 行政书士 | 全资格 / 2026                           | `application_open`、`payment_deadline`、`result_date`、`application_method`、`exam_time`、`question_count`、`question_format`、`scoring_method`、`passing_standard`                    | 2026 报名、试验实施、成绩/合格标准的逐页登记快照；不得只依据指南页的非结构化叙述填值。                                 |
| 日商簿记 | 1/2/3 级 × 统一试验                     | `application_open`、`application_deadline`、`payment_deadline`、`exam_date`、`result_date`、`eligibility`、`application_method`、`question_format`、`scoring_method`                   | 含统一试验报名窗口、各级日期/结果和规格的快照，且须维持等级与方式维度。                                                |
| 日商簿记 | 2/3/初级/原价计算初级 × 网络试验        | `passing_standard`                                                                                                                                                                     | 网络试验各等级合格标准的登记来源快照；现有网络试验值不得推到未明确的等级。                                             |
| FP       | JAFP × 2/3 级 × 学科/资产设计实技 × CBT | `application_open`、`application_deadline`、`exam_schedule`、`result_date`、`eligibility`、`scoring_method`                                                                            | JAFP CBT 的报名、日程、资格和评分规则快照；JAFP 1 级 PBT 资料不能替代。                                                |
| FP       | 金财 × 1 级 × 学科/基礎/応用 × PBT      | `application_open`、`application_deadline`、`exam_date`、`result_date`、`scoring_method`                                                                                               | 金财 1 级学科考试的年度报名、日期、结果与评分快照。资格条件已由 `kinzai-eligibility.html` 入链，不能据此推导其它字段。 |
| FP       | 金财 × 1 级 × 資産相談業務实技 × 面接   | `application_open`、`application_deadline`、`exam_date`、`result_date`                                                                                                                 | 专属实技面接的年度日程与结果快照；不可从学科/PBT 或其他实技方式复制日期。                                              |

`source_url` 与 `official_verified_at` 同时显示为门禁缺口，是当前事实模型尚未将来源登记和来源检查记录投影为字段事实的结果。它们必须由工作包 G 的来源/快照/检查模型解决，不能伪造为页面内容候选。

## 2026-09-08 受控采集记录

项目所有者已确认 [工作包 E 受控采集授权单](work-package-e-live-capture-authorization.md) 的一次性、capture-only 条款。本次通过 `SafeFetcher` 对 18 个已登记 HTTPS 来源执行读取；未连接数据库、未生成候选、未触发审核或批准。

| 资格     |       读取结果 | 本地报告                                                  | 说明                                                                                                                                   |
| -------- | -------------: | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 宅建     | 1 / 1 HTTP 200 | `var/official-snapshots/takken/capture-report.json`       | `source:takken:retio-exam` 的 SHA-256 为 `17be…8bd5`。                                                                                 |
| 行政书士 | 3 / 3 HTTP 200 | `var/official-snapshots/gyoseishoshi/capture-report.json` | home、abstract、guide 均保存为独立快照。                                                                                               |
| 日商簿记 | 5 / 5 HTTP 200 | `var/official-snapshots/bookkeeping/capture-report.json`  | home、network、calendar、1 级、2 级页均已保存。                                                                                        |
| FP       | 9 / 9 HTTP 200 | `var/official-snapshots/fp/capture-report.json`           | JAFP 3 页、金财 6 页均已保存；`source:fp:kinzai-home` 最终 URL 为同域 `https://www.kinzai.or.jp/info/next20230907`，报告已保留该变化。 |

已对每条报告的 `content_hash` 与实际 HTML 文件重新计算 SHA-256，18 / 18 一致。所有报告的 `candidate_ingest` 均为 `not_run`。下一步只能是离线结构审计和适配器扩展；候选入库、审核和批准须另行取得授权。

## 2026-09-08 离线结构审计与解析器结果

本节仅以内存方式调用适配器，读取 HTML 原始字节后 UTF-8 解码，以保持报告 SHA-256 的可追溯性。没有调用任何 `ingest_*` 入口，也没有产生数据库写入。

| 资格     | 内存候选数 | 明确可解析内容                                     | 结构/契约发现                                                                                                         |
| -------- | ---------: | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 宅建     |          1 | 2026 合格发表日期。                                | 当前入口页还明确写有网络/邮送两种申込方法，但现有候选结构缺少 `evidence_text`，不在本轮将其转为可审核候选。           |
| 行政书士 |          5 | 资格、考试日、网络报名截止、费用、笔试方式。       | `home` 与 `guide` 均含 2026 报名信息；正式候选阶段须避免同字段不同来源的重复或冲突。                                  |
| 日商簿记 |         38 | 网络/统一试验的既有等级 × 实施方式字段。           | `home` 当前没有已契约化字段，适配器正确报告 `structure_changed`；不把地方商工会议所决定的报名窗口误写为统一全国日期。 |
| FP       |         41 | JAFP 2/3 级、金财 1 级和资格条件的现有维度化字段。 | `jafp-home`、`kinzai-2`、`kinzai-3` 暂无严格结构化提取，适配器报告 `structure_changed`，不从叙述推导日期。            |

### FP 金财 1 级学科实施方式确认

2026-09-08 捕获的 `source:fp:kinzai-1-academic` 页面在同一页面中同时出现 2026 年度日程入口、`CBT受検者専用サイト` 的受检申请说明，以及考试形式表。后者明确写明“マークシート方式による筆記試験”“記述式による筆記試験”。因此，`CBT受検者専用サイト` 只能证明申请平台，不能证明考试实施方式；金财 1 级学科在该快照的适用组合是 `provider=kinzai × level=fp:1 × component=academic/academic:basic/academic:applied × deliveryMode=pbt`。

覆盖契约的既有 PBT 组合经本次确认保持不变。解析器已收紧为优先读取考试形式表：明确笔试时使用 `pbt`，仅当该表本身明确出现 `CBT方式` 时使用 `cbt`。这样不会因申请入口的 CBT 字样错误改变事实维度、已批准事实或发布门禁。

## 2026-09-11 本地待审核候选入库

项目所有者已单独授权：将已明确、不依赖未采集日程链接页的离线解析结果写入本地 `pending_review` 队列。本次使用 localhost PostgreSQL，未执行批准、拒绝、release baseline 更新或 CI fixture 更新。

| 资格     | 来源                           | 新入队候选 | 说明                                               |
| -------- | ------------------------------ | ---------: | -------------------------------------------------- |
| 行政书士 | `source:gyoseishoshi:guide`    |          5 | 资格、考试日、网络报名截止、费用、笔试方式。       |
| FP       | `source:fp:jafp-2-3-outline`   |         24 | JAFP 2/3 级，保留学科/资产设计实技与 CBT 维度。    |
| FP       | `source:fp:kinzai-1-academic`  |          8 | 金财 1 级学科，保留 PBT 与学科分项维度。           |
| FP       | `source:fp:kinzai-1-practical` |          7 | 金财 1 级资产咨询实技，保留面接维度。              |
| FP       | `source:fp:kinzai-eligibility` |          0 | 快照哈希与历史候选一致，幂等跳过；未生成重复候选。 |

入库后只读核对：44 条候选均为 `pending_review`、均有 `evidence_text`，待审核候选关联的审核记录为 0。候选值尚未进入公开 API 或页面；逐条审核、批准或拒绝仍需单独授权。

## 2026-09-11 候选逐条审核结果

项目所有者已授权由 `reviewer:codex-data-remediation` 对上述 44 条候选逐条复核快照、字段值、适用年度与维度。审核服务记录 39 条 `approve`、5 条 `reject`；审核后 `pending_review` 为 0。批准均通过 revision 链更新既有事实或创建缺失事实，不以增加公开事实数量作为完整性结论。

| 来源范围              | 批准 | 拒绝 | 审核结论                                                                                                                                                 |
| --------------------- | ---: | ---: | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 行政书士 2026 指南    |    5 |    0 | 资格、考试日、网络报名截止、费用、笔试方式均有直接原文证据。                                                                                             |
| JAFP 2/3 级 CBT 要纲  |   24 |    0 | 等级、学科/资产设计实技、CBT 与规格/费用维度一致。                                                                                                       |
| 金财 1 级学科         |    7 |    1 | 除 `exam_method` 外均有可直接对应的表格或金额/合格标准原文；`exam_method` 的候选证据仅为归一化的 `PBT`，未保留原始“笔记试验”片段，拒绝并待解析器补证据。 |
| 金财 1 级资产咨询实技 |    3 |    4 | 批准题型、合格标准、费用；拒绝 `practical_subject`、`exam_method`、`interview_count`、`exam_time`，因为候选保存的证据片段没有直接指向相应原文。          |

被拒绝项没有生成公开事实。后续若需重入队，必须先修正解析器以保留准确原文片段，再形成新的可审核候选；不得复用本次拒绝记录绕过证据要求。

审核后运行本地 `pnpm verify:all`：仍为 `blocked`，6 项中 IT Passport 与基本信息技术者通过；其余 4 项仅因覆盖契约报告的真实缺口阻断。行政书士当前公开事实数仍为 6、FP 为 41，说明 revision 更新没有被错误当作数据完整性或事实总数增长。

### 证据修复后的重新审核

本次审核后遗留的 5 条拒绝候选已在同一快照内修复解析器证据提取，并通过审核服务的 `requeue` 决定重新进入待审。`requeue` 仅允许目标候选处于 `rejected` 状态且必须记录理由，因此保留首次拒绝、重新入队与最终批准的完整审核历史。

| 来源范围              | 修复内容                                                                                                                                | 重新审核结果 |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| 金财 1 级学科         | `exam_method` 证据改为出题形式表中“笔记试验”的完整原文，而非归一化 `PBT`。                                                              | 批准。       |
| 金财 1 级资产咨询实技 | `practical_subject`、`exam_method`、`interview_count`、`exam_time` 分别保留“资产咨询业务”、对面口述试验、2 回面接、约 12 分的原文片段。 | 4 条均批准。 |

重新审核后，本地官方候选状态为 149 条 `approved`、6 条 `rejected`，不存在 `pending_review`。未解决的日程/报名日期缺口仍需要先登记并受控采集年度日程页面；本次没有扩展来源范围或访问外部站点。

### 复核结果

- 运行 `pnpm verify:all`（本地 `qualification_media` fixture）得到 `blocked`：6 项中 2 项通过（IT Passport、基本信息技术者），4 项因上表的真实覆盖缺口被阻断。
- 所有资格的 `pending_official` 均为 0；本轮没有为缺口创建候选、没有执行审核或写入数据库。
- 门禁中未列出的字段要么已有已批准事实，要么依覆盖契约属于 `post_event`，不应以事实总数或本地快照的文件数量代替覆盖判断。

## 2026-09-11 行政书士指南补充解析与审核

对已捕获的 `source:gyoseishoshi:guide` 重新进行离线结构审计后，发现指南页本身以明确标签或可逐项定位的原文给出了更多字段。适配器只新增以下可直接复核的候选；未把付款时间、计分办法或来源元数据从相邻文本推导出来。

| 字段                               | 已批准值                              | 直接证据边界                     |
| ---------------------------------- | ------------------------------------- | -------------------------------- |
| `application_open`                 | `2026-07-21T09:00:00+09:00`           | 网络报名“令和8年7月21日…午前9时” |
| `application_method`               | 网络报名、邮寄报名                    | “2つの方法があります”句          |
| `exam_subjects` / `question_count` | 法令等、基础知识 / 60                 | 同一考试科目表的 46 题和 14 题   |
| `exam_time`                        | 180 分钟                              | “午後1時から午後4時まで”         |
| `question_format`                  | 选择式、记述式                        | 考试方法段的出题形式句           |
| `result_date`                      | `2027-01-27`                          | 合格发表段的日期与时刻句         |
| `passing_standard`                 | 法令等 50%+、基础知识 40%+、全体 60%+ | 合格基准三项原文                 |

已按项目所有者授权写入 localhost 的 `pending_review` 队列（8 条），并经审核服务逐条批准；每条批准保留原始快照哈希、`evidence_text` 和审核理由。本轮不更新 release baseline 或 CI fixture。

批准后的 `pnpm verify:all` 仍为预期的 `blocked`：行政书士从 12 个实质字段缺口降为 4 个，仅剩 `payment_deadline`、`scoring_method` 以及必须由工作包 G 投影的 `source_url`、`official_verified_at`。这不是发布通过结论；其余资格的覆盖缺口仍保持阻断。

### FP 年度日程入口的受控补采集

从已捕获 FP 页面直接引用、且同属既有 JAFP/金财允许域的两份日程入口，已登记为 `source:fp:jafp-schedule` 与 `source:fp:kinzai-schedule`，并仅对这两项执行一次 capture-only 读取。两项均 HTTP 200；JAFP 快照 SHA-256 为 `699f…363c`，金财入口为 `8b2b…b021`，报告仍标记 `candidate_ingest: not_run`。JAFP 页明确区分 2/3 级 CBT 的考试期间和结果日；金财入口只给出其 2026 年年度明细页链接，因此未据入口创建候选或跨方式填补 1 级 PBT/面接缺口。

金财入口直接链接的 2026 年明细随后登记为 `source:fp:kinzai-schedule-2026` 并受控采集（HTTP 200，SHA-256 `22adaf…ab3de`，仍为 `candidate_ingest: not_run`）。离线审计确认：1 级学科 PBT 有 2026-05-24、2026-09-13、2027-01-24 三个日期；资产咨询实技面接按考区和实施月包含多个独立日期。当前 FP 候选 ID 以“维度 × 字段”为唯一键，若直接生成多个同维度 `exam_date` 候选会彼此覆盖；因此本轮没有入队。后续实现必须采用可保存多日期的 `exam_dates`/`exam_schedule` 表示，并保持日历与 ICS 的独立事件展开，再将其明确映射到覆盖契约的 `exam_date` 需求，禁止以最后一个日期替代全部日期。

### FP 多日期候选与审核

适配器现将同一维度下的日期序列作为单个 `json` 候选保存，并把 `exam_dates` 明确映射为覆盖契约 `exam_date` 的满足来源；日历和 ICS 依现有 ISO 日期展开逻辑产生独立事件。为使本地数据库来源链完整，新增的三项日程来源通过 `0010_fp_annual_schedule_sources.sql` 迁移登记（该文件当时与 `0010_drop_legacy_candidate_unique.sql` 重号，2026-10-10 按下一个空号更名为 `0016_fp_annual_schedule_sources.sql`，内容不变，仍是向 `sources` 登记三行）。金财 2026 年明细产生 10 条候选：学科 PBT 与资产咨询实技面接各有报名开始、报名截止、`exam_dates`、`exam_schedule`、结果日；全部经审核服务逐项批准。

审核后，FP 覆盖门禁不再报告金财 1 级学科的报名/考试/结果缺口，也不再报告资产咨询实技的报名/考试/结果缺口。它仍因 JAFP CBT 的未采集字段、金财学科 `scoring_method` 及所有资格尚未由工作包 G 投影的 `source_url`/`official_verified_at` 而保持 `blocked`。本轮没有更新 release baseline 或 CI fixture。

### JAFP 2/3 级 CBT 月度日程审核

已捕获的 `source:fp:jafp-schedule` 明确将 2026 年度的 2/3 级、学科及资产设计实技共同标为 CBT，并逐月给出考试区间和合格发表日。解析器为 2/3 级 × 学科/资产设计实技各生成 `exam_dates`、`exam_schedule`、`result_date` 三项候选；每个考试区间的开始与结束日期都保留（共 24 个端点），结果日保留 12 个。12 条候选经审核服务逐项批准。

该页面未给出报名开放/截止或资格、评分办法，因此没有为这些字段生成候选。审核后门禁仍为 `blocked`，但 JAFP CBT 的考试日期、日程和结果日期缺口已消除；剩余 JAFP 实质缺口仅为报名开放、报名截止、资格、评分办法，另有来源元数据投影缺口。

## 2026-10-09：日商簿记统一试验剩余三项缺口的受控采集

项目所有者授权「抓取簿记官网补 3 项缺口」后，按工作包 E 的采集器执行一次性 capture-only 读取（`BOOKKEEPING_LIVE_AUTHORIZED=1`、`NODE_ENV=development`、只允许 `www.kentei.ne.jp`、`SafeFetcher` 未绕过任何限制）。新增 10 个来源全部由已捕获快照正文里的真实链接得出，未猜测路径。15 个来源全部 HTTP 200、单次尝试成功，采集报告标记 `candidate_ingest: not_run`；本轮**没有**建 `sources` 迁移、没有入库候选、没有审核或批准。

同一主机上的 5 个既有来源也在本次运行中重取，内容相对 2026-09-08 已变化（例如 `home` 从 `5824a42e…` 变为 `bb00b367…`、`class1-exam` 从 `aaddddae…` 变为 `323b708b…`），因此后续入库会为同一 `source_id` 产生新的快照行；9-08 的原始报告已另存为 `var/official-snapshots/bookkeeping/capture-report.before-20261009.json`（本地文件，不入 git）。

新增来源的短哈希：`class1 352e191e0651`、`class2 4228f6e9f55f`、`class3 5528707fc109`、`class3-exam 8ee5ec5666d9`、`flow 2652580b8dca`、`flow-teller 09be77958422`、`flow-net 8bc6bacd955d`、`report cc91370fa9f0`、`qa 4e7eabaf4fa2`、`news-51504 d131bcc69650`。

### 三项缺口的证据结论

- `eligibility`（统一试验 1、2、3 级）：`/qa` 的「受験するための条件はありますか？」答「商工会議所の検定試験では、学歴、年齢、性別、国籍は一切問いません」，「下位級から順に受けなくてはいけないのですか？」答「どの級(クラス)から受験していただいても構いません。例えば、3級に合格していなくても、2級あるいは1級を受験できます」。同一回答把「2級に合格していること」的条件明确只归给 DCプランナー1級，因此簿记各级不受下级合格限制。三项均为可逐字引用的官方原文，可入库。
- `question_format`：1 级 `class1-exam`「検定試験会場では、計算用紙を配布しますが、これはＡ４サイズ１枚といたします…試験終了後、答案用紙を回収します。試験問題・計算用紙については、持ち帰りを認めます」；2 级与 3 级 `class2-exam`／`class3-exam` 同句「試験会場では、問題用紙・答案用紙・計算用紙が一体となった冊子を配布し、試験終了後に全て回収いたします」。两级形态不同，必须按 `examLevelId` 分别保存，禁止 1 级复用 2/3 级的「一体冊子」。
- `payment_deadline`：`/flow/teller` 只给出「STEP2：…受験料の支払方法等をご確認ください」「受験申込受付期間は、商工会議所によって異なります」「受験申込受付は、インターネット、商工会議所の窓口、郵送等で受け付けます」，即统一试验不存在全国统一的缴费截止。因此该缺口应按门禁的前缀匹配用 `payment_deadline_rule` 子键闭合（与行政書士、簿记 `application_*_rule` 同一先例），**不得**编造一个跨商工会議所的日期。

`/report`、`/flow/net`、三个等级页 `class1`/`class2`/`class3` 未提供这三项字段的额外原文（等级页主要是公告与导流），因此不据它们创建候选。

### 对本次判级的补充与告警

`/flow/teller` 尾部再次出现「※試験問題の内容や採点内容、採点基準・方法についてのご質問には一切回答できません。※解答の公開や答案用紙の公開・返却には、一切応じられません。（得点は、受験者ご本人からのお申し出によりお答えいたします）」，与 `/qa`「合計得点（科目別得点含む）を開示します…ご本人様のみ可能」一致。这印证了本日 A 类判级：本人得点开示不等于公布配点与采点方法。

**但 `/51504`（2026 年 9 月 25 日公布）是一个必须记账的例外**：「2027年4月1日以降に施行する日商簿記３級（ネット試験および統一試験・団体試験）におきまして、各問の配点を以下のとおりといたします。・第1問：45点 ・第2問：25点 ・第3問：30点（合計100点／合格基準：70点以上）」，并注明「１級、２級、初級、原価計算初級の配点・出題形式に変更はございません」。⇒ 簿记 3 级的 `scoring_method` 在 2027 年度起**官方会公布**，当前 `not_applicable` 判级只对 2026 年度成立；覆盖年度翻到 2027 时，必须先把 3 级维度改回 `conditional`/`required` 并入库该配点事实，其余等级维持 `not_applicable`。本轮未改动覆盖契约，因为门禁的覆盖年度仍是 2026。

### 离线解析适配器落地（同日，未联网、未写库）

按上面的三条证据在 `services/collector/src/collector/bookkeeping.py` 落地抽取适配器：

- `question_format`：`_extract_answer_format` 按等级分流。1 级必须同时命中「答案用紙を回収します」和「持ち帰りを認めます」两句才产出候选，2／3 级命中「一体となった冊子」；缺句即不产出候选（`structure_changed`），不做跨等级复用。
- `eligibility`：`_extract_qa_eligibility` 从 `/qa` 取「どの級(クラス)から受験していただいても構いません」＋「2級あるいは1級を受験できます」，对统一试验 1／2／3 级各出一条，同一回答里属于 DCプランナー1級 的「2級に合格していること」不会被带进 display。
- `payment_deadline_rule`：`_extract_flow_payment_rule` 从 `/flow/teller` 取缴费确认句与「受験申込受付期間は、商工会議所によって異なります」，`normalized_value` 用既有的 `venue_defined`（与 `application_*_rule`、行政書士 `payment_deadline_rule` 同一先例），不编造日期。
- 新增 `_clause`：按括号深度切句，只在「（）」「『』」之外遇到 `。` 才断句，并剥掉行首 `※`，避免把同一 `li` 里的隐私告知、其他商工会議所备注混进 `display_value`。

`services/collector/tests/test_bookkeeping_contract.py` 为上述三项各加契约测试（含缺句时停止产出、1 级与 2／3 级措辞不得互换、来源等级维度保真），并冻结 15 个已登记 `source_id`。`uv run --project services/collector --extra test python -m pytest services/collector/tests services/parser/tests -q` 实测 **89 passed**；对已捕获快照的离线抽取复核结果与上面三条证据逐字一致、`issues` 为空。

本小节只到「适配器＋测试」为止：候选入库、审核与批准仍需项目所有者单独授权。

### 候选入库与审核批准（同日，项目所有者另行授权后执行）

- 迁移 `packages/db/migrations/0015_bookkeeping_gap_sources.sql` 登记 10 个新来源；`db:migrate` 在开发库与 CI 复刻库各应用一次。
- 入库前先复核 `capture-report.json`：15 个来源全部 HTTP 200，且报告 `content_hash` 与快照文件实际 SHA-256 逐条一致（15/15 OK）。
- `BOOKKEEPING_LOCAL_WRITE=1` 下对开发库 `qualification_media` 跑 `python -m collector.ingest_bookkeeping`（映射已扩到 8 个有抽取器的来源）：`home`/`network`/`calendar-2026` 因重取产生新快照行，但 40 条候选值与已批准值逐字相同 ⇒ `candidates: 0`、`skipped_approved` 9/25/6；新增候选共 **9 条**（`question_format` 1/2/3 级各 1、`eligibility` 1/2/3 级各 1、`payment_deadline_rule` 1/2/3 级各 1），全部 `risk_level=high`、`synthetic=false`。
- 9 条候选逐条走审核链批准（`POST /internal/reviews/{id}`、审核人 `local-data-reviewer`），理由均写明官方原文与「不编造日期/不跨等级复用」的判定依据。批准后 `pending_review=0`，`facts` 由 167 → **176**，簿记由 49 → **58**。
- `node scripts/verify-all.mjs` 两条路径读数一致：**passed 6/6、coverageGaps 0、pending 0、errors 0**。开发库簿记 `api.status=verified`；CI 复刻库（新建临时库 → `db:migrate` → `db:seed` → `ci:fixture:restore`）簿记为 `partially_announced`，与预期 `expectedStatus` 相同，原因是 ci:// 溯源永不计为官方验证。
- 基线与夹具重导：`config/release-gate-baseline.json` 簿记 49→58；`fixtures/ci/approved-facts.sql` 现为 176 facts / 25 snapshots，`scripts/verify-ci-fixture.mjs` 的计数断言同步改为 176/176/176/25。
- 回归读数：`vitest` 10 个文件全绿、`eslint` 与 `tsc --noEmit` 无输出、`prettier --check` 全部通过、`pytest` 89 passed、`node --test scripts/verify-lib.test.mjs` 7 passed、`tsc -p tsconfig.json` 构建成功。

至此三项 C 类缺口全部以官方原文闭合，簿记统一试验的覆盖缺口为 0。遗留告警见上一小节：2027 年度起 3 级 `scoring_method` 会由官方公布配点，覆盖年度翻页前必须先改判级再入库。
