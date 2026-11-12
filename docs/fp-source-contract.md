# FP技能検定：官方来源与字段契约

资格 slug：`fp`。这是国家检定，但由两个指定试验机构实施，公开事实必须同时记录实施机构、等级、考试组成和实施方式。

## 实施机构

- `jafp`：日本FP協会。实施2级、3级学科和“資産設計提案業務”实技；1级仅实施“資産設計提案業務”实技。
- `kinzai`：金融財政事情研究会。实施1级学科和“資産相談業務”实技，以及2级、3级学科与多种实技业务。

## 必需维度

- `provider_id`：`jafp` / `kinzai`
- `exam_level_id`：`fp:1` / `fp:2` / `fp:3`
- `exam_component`：`academic`，或带业务类型的 `practical:*`
- `delivery_mode`：`cbt` / `pbt` / `interview`
- `exam_year`、`fact_key`、官方来源、快照和证据原文

2级、3级学科与实技原则上按 CBT 建模。1级不得套用该规则，必须按机构与具体科目从官方页面提取。

首批字段：`exam_method`、`exam_schedule`、`exam_date`、`exam_time`、`question_count`、`question_format`、`passing_standard`、`fee`、`eligibility`、`practical_subject`。所有字段进入人工审核；同一数值不得跨机构、等级或科目复用。

## 域名迁移与适配器重写（2026-11-12，工作包 I）

kinzai 官方站从 `www.kinzai.or.jp/ginou/fp/` 整体改版到 `products.kinzai.or.jp/exam-fp/`，旧 URL 全部 301 到新域；巡检按白名单正确拒绝跟随（run `patrol-20261111T105619Z`：9 条 kinzai `failed`）。所有者拍板 D1（仅 kinzai 侧扩允许域到 `products.kinzai.or.jp`，jafp 侧仍只允许 `www.jafp.or.jp`）／D2（7 条存活来源换新 URL）／D4（faq capture-only 退役，旧快照 `kinzai-fp-faq.html` 保留作证据）／D5（URL 变更与适配器重写同批，禁止静默错解）。

- **D3 修订（退役空登记）**：官方把年度日程页（`48581.html`）与日程索引（`nittei-fp`）并进同一新 URL `/exam-fp/schedule/`。迁移 0022 的 `UNIQUE(canonical_url, qualification_id)` 禁止同资格同 URL 双登记（`ipa-fee` 先例是跨资格，不适用）。`kinzai-schedule` 0 事实／0 快照／0 候选（仅 1 条巡检 `source_checks`，2026-11-12 只读复核 FK 安全），10 条已批准日程事实全挂在 `kinzai-schedule-2026`。所有者选择退役空登记：迁移 0028 先删其 `source_checks` 行再删 `sources` 行，`kinzai-schedule-2026` 迁新 URL 保住出处链。`FP_SOURCES` 13→12，库内 `sources` 52→51。**迁移 0028 已于 2026-11-12 经授权应用到本机库**（migrate 1 Applied、重跑 0 Applied、seed bound 0；已应用 0000–0028 共 29 个，sources 51，kinzai 7 行 `products.kinzai.or.jp`、`kinzai-schedule` 行已删，27 事实出处 intact，verify:all 6/6）；commit `4f45330` push CI run `43107570678` 双绿；落账 commit `18507b4` push CI run `43113194941` 双绿。**实抓→入库→批准三次独立授权已于 2026-11-12 全闭合**（读数见下节「实抓链落账」）。
- **四个提取器按新结构重写**（`fp.py`）：1-academic 行标签 td→th，改按文本读节名并从 `#exam-time`／合格基準列解析 time/passing（不再裸写 300／120-200 常量）；1-practical 锚 `#exam-format`／`#exam-fee`，逐条锚定原文证据句，任一缺失即 `structure_changed`（`exam_time` 锚「所要時間は約12分」避开同段「約15分」陷阱）；eligibility `h2#aaa`→`#aaa`（新页 h3）；schedule-2026 锚从 `h2#g`／`h2#j` 改为文本「1級学科試験」／「1級実技試験」。`capture_fp.py` 第二处白名单 host 改为按 `urlsplit(url).hostname` 派生。
- **旧官方磁盘快照是迁移前字节**：用新提取器离线复跑（2026-11-12 现取），1-academic 安全失败（`structure_changed`，0 候选），1-practical 7／eligibility 2／schedule-2026 10 仍解析且这 19 条 `normalized_value` 与已批准基线逐字一致。新调查页（`var/ops-investigation/kinzai/`，未登记未入库）产 27 条候选，23 条与已批准一致、4 条变化（schedule 实技新增 `2027-02-06`／`2027-02-13` 窗口）——这 4 条须待授权重抓→入库后成为新 `pending_review` 交人工，不自动覆盖批准值。**27 条已批准 DB 事实不受本次代码改动影响**；`facts` 994／`pending_review` 0 不变。
- 重抓会覆盖同名旧快照 ⇒ 实抓前先按 `var/official-snapshots/fp-preserved/` 先例备份。**本轮已备份 7 个 kinzai 旧官方快照到 `var/official-snapshots/fp-kinzai-pre-capture-20261112/`（固定名副本＋manifest.json 记 source_id／sha256／bytes／候选数）后才实抓**；实抓→入库→批准三次独立授权本轮全闭合（下节）。

## 实抓链落账（2026-11-12，三次独立授权全闭合）

所有者按「1（实抓）→入库→批准」逐句授权，每步停下等下一句，零代码／零迁移／零 baseline／零夹具改动。落账 commit／push 另行授权（纯文档）。

- **① 实抓**（`FP_LIVE_AUTHORIZED=1`，`NO_PROXY` 覆盖为 `localhost,127.0.0.1` 避开 httpx 0.28.1 对 `[::1]`／CIDR 条目的解析崩溃）：`capture_registered_sources(source_ids=<7 kinzai>)` 收紧到 7 条（不跑裸 `__main__` 的全 12 条，避免动 jafp）⇒ **7/7 ok、status_code 200**。新 content_hash：home `cd916db8…`／1-academic `480db24b…`／1-practical `6f357f18…`／2 `102f230b…`／3 `42e696ba…`／eligibility `5cce78b5…`／schedule-2026 `170867bd…`。离线复核（`snapshot_from_html(synthetic=False)`＋`extract_candidates`）：**27 候选／0 issue**（8+7+2+10），home／2／3 仍 `structure_changed`（设计，证据页不产契约字段）。
- **② 入库**（`FP_LOCAL_WRITE=1`＋`DATABASE_URL` 主机 127.0.0.1:55432）：`ingest_snapshot` 收紧到 4 个产事实的 kinzai 文件（1-academic／1-practical／eligibility／schedule-2026；不跑裸 `__main__` 的 6 条，因当前 `capture-report.json` 无 2 条 jafp 记录会整体抛错）⇒ **+4 snapshots／+4 source_checks（status=changed、200）／+4 capture_runs／+27 candidate_facts（pending_review）**。`capture_record()` 四重校验通过（4 个 raw-byte sha256 与报告逐字相等）。`facts` **994 不变**（候选只进审核队列），门禁暂 **5/6**（`pending_official=27` 硬失败，属预期）。
- **③ 批准**（admin `x-reviewer-id=p1-1-b-owner-review` 头，经 HTTP `POST /internal/reviews/{id}`，非直接 import）：**27/27 approve**，`pending_review` 27→**0**，门禁回 **6/6**；**+27 reviews／+27 change_events**。批准事务按全维度 `IS NOT DISTINCT FROM` 命中既有 fact 槽、就地更新 `current_revision_id` ⇒ `facts` 仍 **994**（同槽覆盖，不新增）；kinzai 已批准候选 **54**（27 旧＋27 新，旧批准候选作历史保留、不被覆盖）。端口 3001 用后 `taskkill /T /F` 释放。
- **4 条变化值（schedule-2026 实技，旧提取器漏抓的 bug 修复，非官方改期）**：`exam_dates`／`exam_schedule` 新增第 3 窗口 `2027-02-06`／`2027-02-13`；`application_open` 新增 `2026-11-16`；`application_deadline` 新增 `2026-12-11`；`result_date` 不变。其余 23 条 `normalized_value` 与旧批准逐字一致。
- **两处透明**：① 本机库现领先冻结夹具——4 条 kinzai schedule 实技值已上线，而 CI 夹具（982、pending 0）仍是旧值（旧 4 日期值 ×4、新窗口 ×0）；按边界 **baseline／夹具不动**，刷新须另开 baseline 变更授权。② 巡检面曾半清——4 个产事实 kinzai 的 `source_checks` 已 changed／200，但 home／2／3 仍 `failed`（入库链按设计排除证据页）；**已由 2026-11-12 巡检收尾轮重跑巡检闭合**（见下节「巡检收尾落账」），7 条 kinzai 最新 `source_checks` 现全 changed／200。
- **坑**：① 验证脚本用 `read_text`（通用换行归一）算出的 hash 与报告不同，仅显示假象；入库用 `read_bytes().decode("utf-8")`（不归一）与报告对齐，候选值不受影响。② `.mjs` 脚本头误写 Python 三引号 ⇒ SyntaxError（零执行、零库写），改 `//` 注释后重跑。③ admin `server.ts` 顶层 `server.listen` ⇒ import 即起服务，批准必须走 HTTP 端点。④ Windows tsx 用 `node node_modules/tsx/dist/cli.mjs` 避 .bat shim，杀进程树用 `taskkill /PID <pid> /T /F`（TaskStop 不杀 tsx 子进程）。

## 巡检收尾落账（2026-11-12，号主授权选项 1）

实抓链只清掉 4 个产事实 kinzai 的巡检面（ingest 写 `source_checks`），home／2／3 三条证据页最新 `source_checks` 仍是 2026-11-11 的 `failed`（入库链按设计排除证据页、不写 source_checks）。本轮重跑巡检把这 3 条转 changed／200，**B 原始「9 条 kinzai failed」发现全闭合**。

- **巡检实抓**（`PATROL_LIVE_AUTHORIZED=1`，capture-class、不连库）：`patrol_registered_sources(source_ids=<home／2／3>)` 收紧（不裸跑全 60 条注册来源），白名单按 `source.allowed_domain` 派生（迁移后＝`products.kinzai.or.jp`）。**3/3 changed／200**，`final_url` 与 canonical 路径逐字一致（`_paths_equal` 容忍尾斜杠，无漂移→不 blocked），content_hash 与实抓链逐字相同（home `cd916db8…`／2 `102f230b…`／3 `42e696ba…`），run `patrol-20261112T020530Z`。快照**内容寻址** `<hash>.html` 落 `var/official-snapshots/fp/`（存在即跳过，**不覆盖固定名 fp 快照**，与 capture_fp 的固定名覆盖是两套命名）；`patrol-report.json` 按 source_id 合并（retained 62，含已退役 kinzai-schedule／faq 历史记录）。
- **巡检落库**（`PATROL_LOCAL_WRITE=1`＋localhost，仅运营表）：`record_patrol_report()` 默认录整份合并报告（62 条）会重触其余 59 条旧快照行 ⇒ **按本轮 `run_id` 过滤出 3 条**再录。`validate_changed_snapshots` 重算 3 文件 sha256 对齐报告。增量 **＋1 capture_run／＋3 snapshots（`snapshot:patrol:…`）／＋3 source_checks（`source-check:patrol:…:patrol-20261112T020530Z`）**，candidates 0、skipped 0；**不碰 candidate_facts／facts／fact_revisions／change_events／reviews**。
- **现取复核**：7 条 kinzai 最新 `source_checks` 全 changed／200、`kinzai_latest_failed`＝0；facts 994／pending 0 不变、`verify:all` 6/6。全库 snapshots 78／source_checks 66／capture_runs 15；FP 快照 **18**、FP changed 检查 **12**、FP 候选 **102 全 approved**（kinzai 54／jafp 48）。零代码／迁移／baseline／夹具改动，产物在 gitignore `var/`，落账纯文档。

## 采集、入库、批准是三次独立授权

| 阶段 | 入口                                             | 授权开关                                                                                                | 写什么                                                                                                                        |
| ---- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| 采集 | `services/collector/src/collector/capture_fp.py` | `FP_LIVE_AUTHORIZED=1`                                                                                  | 只写 `var/official-snapshots/fp/` 与 `capture-report.json`（按 `source_id` 合并），不连数据库                                 |
| 入库 | `services/collector/src/collector/ingest_fp.py`  | `FP_LOCAL_WRITE=1`，且 `DATABASE_URL` 主机必须是 localhost/127.0.0.1，且 `NODE_ENV` 不得为 `production` | `capture_runs` + `snapshots`（含全溯源列）+ `source_checks` + `candidate_facts`（`pending_review`），返回 `approval: not_run` |
| 批准 | `apps/admin/src/server.ts` 审核队列              | 请求头 `x-reviewer-id`                                                                                  | `reviews`、`fact_revisions`、`facts`、`change_events`                                                                         |

入库前必须确认快照路径在 `var/official-snapshots/fp` 之下且后缀为 `.html`；解析出问题（`structure_changed`／`invalid_contract_dimensions`）时以 `snapshot parse failed` 报错退出，不写半条数据。

`capture_record()` 在打开数据库连接之前做四重校验，任一不符即抛错、零写入：

1. `capture-report.json` 里该 `source_id` 的记录必须 `status='ok'` 且 `status_code=200`；
2. 报告里的 `snapshot_path` 解析后必须与入库路径完全一致；
3. 报告必须带 `content_hash` 与 `captured_at`；
4. 对磁盘原始字节重新算 sha256 必须等于报告的 `content_hash`，且适配器解析出的 `snapshot.content_hash` 也须相等。

`snapshots` 行用 `ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写全溯源列，`retrieved_at`/`retrieved_at_jst` 取报告里的真实抓取时刻而非 `now()`，`collector_version` 记为 `collector.capture_fp`；`capture_runs.id` 为 `capture-run:fp:<content_hash>`、`source_checks.id` 为 `source-check:fp:<content_hash>`。候选 id 带四维（`provider`／`exam_level`／`exam_component`／`delivery_mode`），入库语句是 `ON CONFLICT (id) DO UPDATE … WHERE candidate_facts.status='pending_review'`，即**已批准的候选不会被重跑覆盖**（2026-10-11 用临时表实测：已批准 id 的 rowcount＝0、`normalized_value` 原值不动）。

要注意一条不对称：候选是带条件更新，快照行是**无条件** `DO UPDATE`。所以即使哈希没变，重跑也会把那 6 条真实快照行的 `retrieved_at` 从 2026-09-07／09-11 改成新的抓取时刻，同时补全目前为 NULL 的 `original_url`／`final_url`／`http_status`／`collector_version`（本机读数：11 个 FP 快照行里 9 个缺这些列，其中 3 个是 `ci://` 夹具行、按设计留空）。门禁不受影响（§5 的 `official_verified_at` 取 `reviews` 时间），但「这批证据何时取得」的语义会变，属需要项目所有者定性的副作用。

`capture-report.json` 自 2026-10-10 起按 `source_id` 合并写入，实现落在共享模块 `services/collector/src/collector/capture_report.py`（`write_capture_report()`），行政書士／簿记／IT Passport／基本情報／宅建五条采集链与之共用，即六条采集链全部使用同一实现。报告里 `source_count` 是**本次运行**条数，`retained_source_count` 是文件里累计保留的来源记录数，`results` 是合并后的全集；某来源本次抓取失败时保留上一次成功记录（那才对应磁盘上的字节），失败记录只在该来源从未成功落盘时才会写入。此前整份覆盖的行为曾让 2026-09-08 的 9／9 成功报告消失。

## 已知剩余项

> **时点注记（2026-11-12 实抓链＋巡检后现取， supersede 下列部分 2026-10-11 预演读数）**：FP 候选 **102**（全 `approved`、全 `synthetic=false`），其中 kinzai **54**（1-academic 16／1-practical 14／eligibility 4／schedule-2026 20 ＝ 27 旧＋27 新）、jafp 48；`ci://` 夹具快照 **0**、synthetic 候选 **0**（项 2 的「39 夹具候选／3 `ci://` 快照行」已不在本机库）；FP 快照 **18**（全 real）、`changed` 的 `source_checks` **12**；7 条 kinzai 最新 `source_checks` 全 changed／200（home／2／3 经巡检收尾轮转 changed，见「巡检收尾落账」节）；`capture-report.json` retained **8** ＝ 7 kinzai（实抓链）＋1 旧 faq capture-only，2 个 jafp 产事实页仍无记录。`facts` 994／`pending_review` 0／`sources` 51／migrations 29／门禁 6/6。⇒ **项 1** 的 4 个 kinzai 产事实页现已有报告记录＋入库＋批准（2 jafp 仍无记录、新链仍拒绝）；**项 2** 夹具残留读数过期（现 0）；**项 3**「新链一条 `changed` 都还没落过」已被实抓链 +4＋巡检 +3 `changed` 推翻。详见上节「实抓链落账」「巡检收尾落账」。下列各条正文保留 2026-10-11 时点原文作审计轨迹。

1. **6 个取证快照在 `capture-report.json` 里没有记录，新链当下会拒绝它们**（2026-10-11 只读预演更正，此前记为「那 4 个」）：`var/official-snapshots/fp/capture-report.json` 现在只剩 2026-09-22 那次 capture-only 运行的 1 条记录，而 `var/` 在 `.gitignore` 里，旧报告无从恢复。磁盘上能解析出候选的来源实为 **6 个、共 75 条候选 id**，按页分布 `jafp-2-3-outline` 36／`jafp-schedule` 12／`kinzai-schedule-2026` 10／`kinzai-1-academic` 8／`kinzai-1-practical` 7／`kinzai-eligibility` 2；这 75 条与库里 6 条真实快照行逐条相符且**全部已是 `approved`**，其余 6 个注册来源解析 0 条并报 `structure_changed`（库里也没有它们的快照行；`kinzai-schedule` 已于 2026-11-12 退役）。**本项 kinzai 磁盘读数为迁移前历史值**，迁移后新提取器对旧磁盘的复跑读数见上节「域名迁移与适配器重写」。
   - **入库入口 `INGEST_SOURCES`（`ingest_fp.py`）现覆盖全部 6 个来源＝75 条**（2026-10-11 从 4 个扩到 6 个；此前 `jafp-schedule` 12 ＋ `kinzai-schedule-2026` 10 这 22 条有事实、有 `approved` 候选，却没有已提交的入库入口，`git log -S` 显示旧 mapping 从未含它们，0016 迁移只登记来源、不写候选）。⇒ 「若报告补齐后重跑，候选新增 0 条、`pending_official` 仍为 0」这句现在对 6 个来源全部成立；代价是重抓暴露面从 53 抬到 **75**，那 22 条也进了暴露面。
   - 解析不出任何契约字段的 6 个来源（`jafp-home`／`jafp-1-outline`／`jafp-2-3-application`／`kinzai-home`／`kinzai-2`／`kinzai-3`；`kinzai-schedule` 已于 2026-11-12 退役，见上节）**刻意留在 mapping 之外**：`ingest_snapshot()` 对任何解析问题都是整体抛错、零写入，把它们加进来只会让入口一跑就红。这层划分由 `services/collector/tests/test_fp_ingest.py` 的两条用例锁住（覆盖面相等 ＋ 无字段页面必须在连库之前就抛错）。
   - **官方页改版是唯一能让门禁变红的变量**：候选 id 内嵌 `content_hash`，某页哈希一变，该页候选全部变成新的 `pending_review` ⇒ `pending_official != 0` 硬失败，届时需逐条审核并重算 baseline 计数（另需授权）。暴露量仍集中在单页：`jafp-2-3-outline` 一页 36 条＝映射内 75 条的 48%。
   - **授权面**：`capture_registered_sources(source_ids=None)` 默认抓全部 12 个 `FP_SOURCES`（2026-11-12 起 kinzai-schedule 退役，13→12），而 `docs/work-package-e-live-capture-authorization.md` 只登记 FP 的 9 个来源且注明**已于 2026-09-08 执行完毕** ⇒ 重抓要开一张新授权单，并建议用 `source_ids` 收紧到 `INGEST_SOURCES` 那 6 个来源（另外 7 个来源解析不出契约字段，抓回来也进不了入库链，只增大报告与快照的噪音）。这一轮按决定只读预演，未抓取、未写库。
2. **本机开发库有夹具残留**：3 条 `object_key=ci://official-snapshot/…`、`retrieved_at=2026-01-01` 的快照行分别挂着 24／8／7 ＝ 39 条 `approved` 候选。按口径它们不得伪装成官方溯源，元数据保持为空即可。本机读数（2026-10-11）：FP 候选 114 ＝ 75（磁盘真实快照）＋ 39（夹具），**75 条现行事实 0 条挂在 `ci://` 快照上**，这 39 条也不是任何事实的当前 revision；`npm run audit:provenance` 对 FP 报 blocked 0（全库 blocked 4 全在 takken）⇒ 夹具残留不承重，别把它当成 FP 的真实溯源缺口。
3. **`scripts/backfill-fp-provenance.mjs` 仍在负责无报告的旧真实快照**：它把 capture-only 文档登记成来源、写 `capture_runs`（`capture-run:fp:<name>:<timestamp>`）与 `source_checks`，并对无法证实的旧行写 `status='blocked'` 的检查记录、明确声明未推断任何值（本机读回 6 条 `blocked`、2 条 `changed`，8 条**全部由该脚本写入**，新链一条 `changed` 都还没落过）。两套 id 要分清：给 capture-only 那 2 条用的 id 与新链同形（`source-check:fp:<content_hash>`），所以新链将来对那两个快照写检查是幂等；而那 6 条 `blocked` 用的是另一套 id（`source-check:legacy-metadata:snapshot:fp:<content_hash>`），**新链将来重跑这 6 个快照会新增一条 `changed`，不会取代那条 `blocked`**——读账时两条并排属正常，不是重复登记。
4. **快照按固定文件名覆盖**：与行政書士同问题——重抓会改写同名文件，库里旧快照行 `object_key` 指向的字节随之丢失，历史证据只剩数据库里的 `content_hash`。基本情報采用 `<sha256>.html` 内容寻址命名，没有该问题。更要紧的是**这种丢失测不出来**：`object_key` 仍指向同名路径，门禁与 `audit:approved-provenance` 都不重算文件字节，快照与 `content_hash` 不符也不会报。2026-10-11 已把承载那 75 条已批准事实的 6 个 HTML 按 `<sha256>.html` 复制到 `var/official-snapshots/fp-preserved/`（附 `manifest.json` 记录哈希↔来源↔候选数；`var/` 不入库，属本机专有），此后任何一次授权抓取都不再会永久毁掉原始字节。
5. **年度滚动**：JAFP／金财的募集页随年度更新，覆盖年度推进到 2027 需要重新走采集→入库→批准三次授权，已批准事实的年度归属也要复核。
