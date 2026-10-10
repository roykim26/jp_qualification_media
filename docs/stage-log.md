# 阶段记录与剩余问题

## 2026-10-10：重复实现与迁移重号的结构性清理（纯代码，未抓取；本机开发库按授权跑过一次 `db:migrate`）

- `escapeHtml` 原在 4 处各写一份：`packages/ui/src/index.ts`、`apps/web/src/layout.ts`、`apps/web/src/render.ts` 三份逐字符相同（签名 `(value: string) => string`），`apps/admin/src/server.ts` 那份多一层 `String(value ?? '')` 容错（签名 `(value: unknown) => string`）。现把 `packages/ui` 那份改为 `export function escapeHtml` 作为唯一转义实现，web 两处删本地定义改为从 ui 导入；admin 保留同名本地薄封装只委托一行，其 21 处调用点一字未改。
- 刻意不合并：`apps/web/src/server.ts` 的 `escapeXml` 把 `'` 编成 `&apos;`（sitemap XML 用），与 HTML 的 `&#39;` 是两种输出，属不同契约而非重复实现，合并会改 sitemap 字节。
- 等价性自证（不依赖库）：11 个样本（空串、`&<>"'` 混排、日文、`null`／`undefined`／数字／对象）逐一比对 `escapeHtml(String(v ?? ''))` 与两份旧实现，mismatches=0。渲染侧回归由 `tests/web-render.test.ts` 24 项与 `verify:all` 的 web 步骤兜住——后者断言页面正文含状态标签、`gate.pageContains` 与路由 marker，不只是 HTTP 200。
- 迁移重号：`packages/db/migrations/` 下 `0010_drop_legacy_candidate_unique.sql` 与 `0010_fp_annual_schedule_sources.sql` 同号，后者按下一个空号 `git mv` 为 `0016_fp_annual_schedule_sources.sql`，序号恢复为 0000–0016 无重号无缺口。
  - 判据：`packages/db/src/migrate.ts` 以**文件名**作 `schema_migrations.name` 主键、`readdir().sort()` 全量顺序执行，序号只是人读的排序提示，引擎不解析；本机开发库 `schema_migrations` 17 行与 17 个文件严格一一对应（无缺档、无孤儿记录），重号从未造成漏跑或错序。（此为本机跑 `db:migrate` 之前的读数；跑后见下。）
  - 语义影响：遍历全部迁移，没有任何迁移 `UPDATE sources` 或引用这三行 fp `source:fp:*-schedule` id，故把该文件移到末尾不改变全新库的结果；其内容本身是 `INSERT … ON CONFLICT (id) DO NOTHING`，在已建库上会以新名重跑一次并成 0 行 no-op（下文本机实测已钉死），旧名记录留在 `schema_migrations` 作无害孤儿（runner 只遍历文件，不校验记录）。
  - 全新顺序由 CI 独立自证：`release-gate` 每次在空的 `qualification_media_ci` 上 `db:migrate` → `db:seed` → 恢复夹具 → `release:check`。PR #9 的 CI 日志实测 **17 条 `Applied`**，其中 `Applied 0016_fp_annual_schedule_sources.sql.` 紧随 `0015` 之后、末位应用无报错，整链 `release-gate pass 58s`。
  - 本机开发库实测（2026-10-10，经授权执行，是本轮唯一的库写入）：命令 `NODE_ENV=development DATABASE_URL=postgresql://qualification_dev:qualification_dev@localhost:5432/qualification_media node_modules/.bin/tsx.cmd packages/db/src/migrate.ts`，全部输出只有一行 `Applied 0016_fp_annual_schedule_sources.sql.`，即重跑确实按新名发生且为 0 行 no-op。前后读数：
    - `schema_migrations` 17 → **18** 行：旧名 `0010_fp_annual_schedule_sources.sql`（@2026-09-11T01:38:04）保留，新名 `0016_fp_annual_schedule_sources.sql`（@2026-10-10T13:36:48）新增——正是 runner「只认文件名、不校验记录」的形态。
    - `sources` 40 → **40**，三行 `source:fp:*-schedule` 逐字段未变（`ON CONFLICT (id) DO NOTHING` 生效，未覆写）。
    - `facts` approved 176 → **176**；`candidate_facts` 281 → **281**；approved `fact_revisions` 268 → **268**；`change_events` 176 → **176**；非合成 `pending_review` 0 → **0**。
    - `verify:all` 迁移后复跑：`status=passed, passed=6/6, failed=0`，176 facts（六资格 16/15/2/10/58/75）不变，六资格 API 与页面均 `verified`，`coverageGaps=[]`。
    - 旧名那 1 条孤儿记录保留未删：删除是又一次库写入，且 runner 不校验记录，留着不影响任何判据；如需清理要另行授权。本轮未新建、也未删除临时库。
  - `docs/data-local-snapshot-audit-2026-09-07.md` 引用旧文件名的位置就地注明更名缘由，不改写当时的结论。
- 更正一条长期记错的口径：`services/parser` **不是空壳**。它含 `pyproject.toml`（`jp-qualification-parser`）、`src/parser/__init__.py` 的 `ParsedCandidate` 桩模型、`tests/test_parser.py` 1 条用例，且被 CI `pip install -e services/parser` 安装、被 README 与 `docs/product-design.md` 列为「资格适配器和提取」层，`test:python` 也显式传它的 `tests` 目录。删或填它属结构决策，不在本轮纯清理范围，因此本轮**未动**。
- 回归读数：`node_modules/.bin/tsc.cmd -p tsconfig.json` 通过、Vitest 81/81（10 files）、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、`pytest services/collector/tests services/parser/tests` 109 passed、`node --test scripts/verify-lib.test.mjs` 7/7、`verify:all` `status=passed, passed=6/6, failed=0`，176 facts 不变、六资格 API 与页面均 `verified`、`coverageGaps=[]`、`pending_official=0`。

## 2026-10-10：`rollbackApprovedFact` 维度 join 补 `payment_method`（§11 第 4 项收口）

- `services/api/src/release.ts:69-80` 那条「取上一条 approved revision」的子查询，原先只比 `qualification_id`／`provider_id`／`exam_level_id`／`exam_component`／`delivery_mode`／`exam_year`／`fact_key` 七维，与 0014 迁移把 `payment_method` 纳入 `facts_current_key_idx` 与 `candidate_idempotency_idx` 之后的身份口径不一致。只在 `delivery_mode` 之后加一行 `AND f.payment_method IS NOT DISTINCT FROM c.payment_method`，不重构、不动别的 SQL 与索引。
- 只读探针前后对照（本机开发库，脚本放 `var/`、只跑 `SELECT`、跑完即删，未写库）：
  - 按「去掉 `payment_method` 的七维」分组，176 条事实中恰好 **1 组**装着 2 条事实——`qualification:takken`／`exam_year=2026`／`fact_key=payment_deadline_rule`，渠道分别 `convenience_store` 与 `pay_easy`；两条各自只有 **1 条同渠道** approved revision。
  - 修前：`convenience_store` 那条查询返回 1 行，挑中的是 `pay_easy` 的 revision id；`pay_easy` 那条反之——即跨渠道串号，会把事实回退到另一条支付渠道的口径上。
  - 修后：两条查询都返回 **0 行**，函数按预期抛 `no previous approved revision available`，这是正确行为（该维度组合下确实不存在「同渠道的上一条」）。
  - 其余计数复确认：`facts` approved 176、带渠道 2；`candidate_facts` 281、带渠道 2；非合成 `pending_review` 0。
- 无测试覆盖：`rollbackApprovedFact` 全仓只有定义、无调用方（`grep -rn rollbackApprovedFact` 仅命中定义与 `dist/` 编译产物），且 `tests/setup.ts` 会 `delete process.env.DATABASE_URL`，Vitest 一律连不到库。这条 SQL 属纯 DB 行为，只由上述只读探针自证，未写 mock 用例，也没有不依赖库的纯逻辑可覆盖。
- 该函数不参与门禁、不改线上行为；事实计数与 `verify:all` 结果均不变。
- 文档同步：`docs/data-gate-semantics.md` §11 第 4 项改写为已收口并记下前后读数；`docs/stage-log.md` 2026-10-09 节「真实剩余项」同一条就地标注。
- 回归读数：`node_modules/.bin/tsc.cmd -p tsconfig.json` 通过、Vitest 81/81（10 files）、`pytest services/collector/tests services/parser/tests` 109 passed、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、`verify:all` `status=passed, passed=6/6, failed=0`，六资格 API/页面均 `verified`、`coverageGaps=[]`、`pending_official=0`。

## 2026-10-10：报告合并推广到基本情報与宅建，六条采集链全部共用

- `capture_fundamental_it.py` 与 `capture_takken.py` 的三个采集入口（`capture_registered_source()`、`capture_directly_cited_sources()`、`capture_directly_cited_documents()`）全部改用共享的 `write_capture_report()`；宅建两份 directly-cited 报告各按自己的文件名独立合并，新增模块常量 `DIRECTLY_CITED_REPORT`、`DIRECTLY_CITED_DOCUMENT_REPORT` 承载文件名。至此六条采集链同一份语义，`docs/data-gate-semantics.md` §11 第 7 项收口。
- 宅建是这次风险最高的一条：`capture_directly_cited_sources()` 的 `source_ids` 允许只传子集，旧实现会把未参与本次运行的来源记录整份抹掉，磁盘快照仍在但 `ingest_takken_directly_cited.py` 的 `rows[capture_id]` 直接 KeyError、`ingest_takken.py` 的 `capture_record()` 判定「无报告」。快照一直是内容寻址文件名，被覆盖的只有报告。
- 读取侧未改动：`ingest_fundamental_it.py`、`ingest_takken.py` 的 `capture_record()` 与 `ingest_takken_directly_cited.py` 都按 `source_id` 在 `results` 里取记录，合并带入的历史条目不影响选取，且陈旧记录会撞 sha256 校验被拒，不会静默用旧内容入库。
- 用例 +4：`test_fundamental_it_capture.py` 加 1 项（外部来源记录在合并后保留；顺手把假 fetcher 提为模块级 `_FakeFetcher` 并抽出播种报告的 `_seed_foreign_record`）；`test_takken_capture.py` 加 3 项（注册来源报告保留、只跑 2／6 个 directly-cited 来源时第 3 条记录保留、document 报告保留），共用 `_seed_offline_report` 与 `_offline_fetcher`。
- 文档同步：`docs/data-gate-semantics.md`（§8 采集行改为六条链、§10 Python 读数 105→109、§11 第 7 项改写为已收口）、`docs/fundamental-it-engineer-source-contract.md`（采集行注明按 `source_id` 合并；另更正校验口径——`ingest_fundamental_it.py` 的 `capture_record()` 实为**四重**，原文写成三重、漏了「报告必须带 `content_hash` 与 `captured_at`」那条）、`docs/fp-source-contract.md`（共用链数口径更正）。
- 本轮纯 Python + 文档，未抓取、未写库，事实计数不变。回归读数见下一行：`pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests services/parser/tests` 109 passed、Vitest 81/81、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`tsc -p tsconfig.json` 通过、`prettier --check`（项目 `format:check` 的 glob）通过、`verify:all` `status=passed, passed=6/6, failed=0`。

## 2026-10-10：采集报告合并抽为共享模块，推广到行政書士／簿记／IT Passport

- 新增 `services/collector/src/collector/capture_report.py`：`merge_capture_report()`（按 `source_id` 合并，本次运行里没有 `content_hash` 的失败记录不会抹掉上一次成功记录；该来源此前没落盘过才写入失败记录）与 `write_capture_report()`（合并 + 落盘 + 返回报告）。计数字段定为 `source_count`＝本次运行条数、`retained_source_count`＝文件累计保留条数，`results` 为合并后的全集，`captured_at`/`candidate_ingest` 含义不变。
- `capture_fp.py` 删除本地那份实现改用共享模块；`capture_gyoseishoshi.py`、`capture_bookkeeping.py`、`capture_it_passport.py` 的报告写入同批换成 `write_capture_report()`，四链从此共用一份语义，不再整份覆盖。
- 读取侧无需改动：`ingest_fp.py`／`ingest_gyoseishoshi.py`／`ingest_bookkeeping.py`／`ingest_it_passport_analysis.py` 的 `capture_record()` 都是按 `source_id`（it-passport 还叠加 `content_hash`）在 `results` 里取记录，合并后的多余条目不影响选取；陈旧记录会撞哈希校验而被拒绝，不会静默用旧内容入库。
- 用例：新增 `tests/test_capture_report.py` 5 项（保留未参与本次运行的来源、同来源新记录替换旧的、失败保留上次成功记录、无历史时失败也留痕、`source_count`/`retained_source_count` 与落盘内容一致）；`tests/test_gyoseishoshi_capture.py`、`tests/test_bookkeeping_capture.py` 各加 1 项用假 fetcher 真跑一次采集，验证这两条链的报告确实保留了外部来源记录。FP 原有 2 项合并用例移入共享模块测试，`test_fp_capture.py` 回到只测 FP 自身契约。
- 尚未统一：基本情報 `capture_fundamental_it.py` 与宅建 `capture_takken.py`（含两份 directly-cited 报告）仍是整份覆盖 —— 前者快照是内容寻址文件名所以文件不被覆盖，但报告同样会丢。已记在 `docs/data-gate-semantics.md` §11 第 7 项。**该项已由上一节于同日收口，六条采集链现全部共用同一实现。**
- 文档同步：`docs/fp-source-contract.md`（合并段改写为共享模块口径、键命名更正）、`docs/gyoseishoshi-source-contract.md`（采集行）、`docs/data-gate-semantics.md`（§8 采集行、§10 Python 计数、§11 新增第 7 项）。
- 回归读数：`pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests services/parser/tests` 105 passed、Vitest 81/81、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、build 通过、`prettier --check`（项目 `format:check` glob）通过、`verify:all` `status=passed, passed=6/6, failed=0`（本轮纯 Python + 文档，未写库，事实计数不变）。

## 2026-10-10：FP 入库链同口径对齐（只到代码与用例层，未抓取未写库）

- `services/collector/src/collector/ingest_fp.py` 增加与行政書士同构的 `capture_record()` 四重校验（报告须 `status=ok`+`status_code=200`、`snapshot_path` 与入库路径全等、必须带 `content_hash` 与 `captured_at`、磁盘原始字节 sha256 与报告相符，适配器解析哈希再二次比对），连库之前完成，任一不符零写入。原先合并成一条的守卫拆为「拒绝 `NODE_ENV=production`」与「必须 `FP_LOCAL_WRITE=1`」两条，报错各自指明。
- 溯源写入对齐：`capture_runs`（`capture-run:fp:<content_hash>`、`succeeded`、`request_count` 取报告 `attempts`）、`snapshots` 全溯源列并以 `ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写（`retrieved_at`/`retrieved_at_jst` 取报告真实抓取时刻，不再用 `now()`；`collector_version=collector.capture_fp`）、`source_checks`（`source-check:fp:<content_hash>`、`changed`）。FP 特有的部分保留不动：候选 id 带 `provider`／`exam_level`／`exam_component`／`delivery_mode` 四维，语句仍是 `ON CONFLICT (id) DO UPDATE … WHERE candidate_facts.status='pending_review'`，即已批准候选不会被重跑覆盖。
- 根因修复 `capture_fp.py`：`capture-report.json` 由整份覆盖改为按 `source_id` 合并（当时新增 `run_source_count` 表示本次运行条数，`source_count` 变成累计保留来源数）；某来源本次抓取失败时保留上一次成功记录，因为那才对应磁盘上的字节。**该键命名已被下一节的共享实现取代**（现为 `source_count`＝本次运行、`retained_source_count`＝累计保留）。此前 2026-09-22 一次 capture-only 运行把 2026-09-08 那份 9/9 成功的报告整份覆盖掉（`docs/data-local-snapshot-audit-2026-09-07.md` 有当时读数），而 `var/` 在 `.gitignore` 第 18 行、报告既不在磁盘也不在 git，无法恢复。
- 只读核算（未写库）：磁盘 4 个入库 HTML 的 sha256 与库里 4 条真实快照行逐条相符（`c0efa64e9fcb`／`d8603a927e58`／`8a77e714535c`／`9a460642fe3d`），离线解析出 53 条候选 id，53 条全部已是 `approved` ⇒ 报告补齐后重跑候选新增 0 条、`pending_official` 仍为 0。顺带查出本机 FP 另有 3 条 `ci://official-snapshot/…` 夹具快照行（`retrieved_at=2026-01-01`）挂着 24／8／7＝39 条 `approved` 候选。
- 本轮明确未执行：不抓取、不写库。新链对那 4 个无报告快照直接抛 `capture report has no successful record`，所以没有端到端实跑读数；跑通需要先给 `FP_LIVE_AUTHORIZED=1` 采一次，而官方页改版会使哈希变化、候选 id 全部变成新的 pending，触发门禁 `pending_official != 0` 硬失败，届时要逐条审核并重算 baseline 计数。三段 INSERT 语句的列名与字面量依据是行政書士同日在本机真实库已执行通过的同构语句，FP 侧本轮仅由 pytest 合成报告自证。
- 文档同步：`docs/fp-source-contract.md` 新增三次授权表、四重校验清单、候选幂等语义、报告合并口径与 5 条已知剩余项；`docs/data-gate-semantics.md` §11 新增第 6 项、§10 Python 读数更新。
- 回归读数：`pytest services/collector/tests services/parser/tests` 100 passed（新增 8 项：6 条 `capture_record` + 2 条报告合并）、Vitest 81/81、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`prettier --check`（项目 `format:check` 的 glob）通过、build 通过、`verify:all` `status=passed, passed=6/6, failed=0`，各资格 `coverageGaps=[]`、公开 API `verified`（本轮未写库，事实计数不变）。

## 2026-10-10：行政書士入库链对齐基本情報口径

- `services/collector/src/collector/ingest_gyoseishoshi.py` 在连库之前增加 `capture_record()` 四重校验：`capture-report.json` 内该来源须 `status=ok` 且 `status_code=200`、报告 `snapshot_path` 与入库路径全等、报告必须带 `content_hash` 与 `captured_at`、磁盘原始字节重算 sha256 必须与报告相符，适配器解析哈希再与报告二次比对。任一不符即抛错、零写入。
- 入库补齐溯源链：写 `capture_runs`、`snapshots` 全溯源列（`capture_run_id`/`original_url`/`final_url`/`http_status`/`retrieved_at`/`retrieved_at_jst`/`collector_version`，`ON CONFLICT (source_id,content_hash) DO UPDATE` 幂等回写，抓取时刻取报告值不再用 `now()`）、`source_checks`；候选 `risk_level` 改取适配器给出的值，不在 SQL 里硬编码。
- 真实数据自证（只读，不连库）：对 2026-09-08 的 `var/official-snapshots/gyoseishoshi/capture-report.json` 跑 `capture_record()`，home／abstract／guide 三条均通过，sha256 与磁盘快照相符。
- 端到端入库验证（经项目所有者授权，写本机 localhost 开发库，`GYOSEISHOSHI_LOCAL_WRITE=1`）：用磁盘上 2026-09-08 的真实 `guide.html` 重跑新链，返回 `candidates: 0`。写回读数——`snapshots` 行 `capture_run_id`/`original_url=https://www.gyosei-shiken.or.jp/doc/guide/guide.html`/`http_status=200`/`retrieved_at=2026-09-08 02:10:08.722939+00`（取自报告，原为写库时刻 `2026-09-11`）全部就位，`capture_runs` 新增 1 行（`succeeded`、`request_count=1`）、`source_checks` 新增 1 行（`changed`、200）；15 条候选因 id 与既有 approved 行相同被 `ON CONFLICT DO NOTHING` 跳过，`pending_official` 仍 0，门禁重跑仍 `6/6`、`gyoseishoshi` API/页面 `verified`。批准动作未执行。
- 快照行构成更正（先前误把候选 join 计数 21 当成快照行数）：`source:gyoseishoshi:guide` 实际只有 3 行 —— 1 行真实抓取（已补全溯源）+ 2 行 CI 夹具复刻写入（`object_key` 为 `ci://official-snapshot/…`、`retrieved_at` 固定 `2026-01-01`），夹具行按口径保持无元数据、不伪装官方来源。
- 文档同步：`docs/gyoseishoshi-source-contract.md`（入库表写入范围、四重校验、已知剩余项 1 改写）、`docs/data-gate-semantics.md`（§11 第 3 项、§10 读数日期与 Python 计数）。
- 回归读数：Vitest 81/81、`pytest services/collector/tests services/parser/tests` 92 passed（新增 3 项 `capture_record` 用例）、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、`prettier --check` 全项目通过、build 通过、`verify:all` `status=passed, passed=6/6, failed=0`（含入库后复跑）。

## 2026-10-09：数据完整性整改收口（工作包 A–H）

- 覆盖契约冻结为机器可读文件 `config/data-coverage-contract.json`（6 资格 × 字段 × 维度 × 页面 × 判级），并由 `scripts/verify-lib.mjs` 的 `evaluateCoverage()` 逐资格判定缺口。
- 发布门禁从「条数比对」升级为条数地板 + 覆盖缺口两层；覆盖缺口由 **18 → 0**，`pnpm verify:all` 读数 `status=passed, qualifications=6, passed=6, failed=0`，各资格 `coverageGaps=[]`、`pending_official=0`。
- 正式事实 **176 条**：takken 16、gyoseishoshi 15、it-passport 2、fundamental-it-engineer 10、bookkeeping 58、fp 75。基线 `config/release-gate-baseline.json` 与脱敏夹具 `fixtures/ci/approved-facts.sql`（176/176/176/25）同步。
- 簿记统一试验剩余三项缺口闭合：新增 10 个官方来源登记（`0015_bookkeeping_gap_sources.sql`）、三个离线适配器（`class3-exam`／`qa`／`flow-teller`），9 条候选经审核链逐条批准。`payment_deadline` 用规则型事实 `payment_deadline_rule` 闭合，未编造全国统一缴款日期。
- admin 审核写操作鉴权收紧：写只认 `x-reviewer-id` 头，`?reviewer=` 降级为只读；6 条 curl 判据在新起实例上复跑通过。
- 新增来源/字段契约文档 `docs/gyoseishoshi-source-contract.md`、`docs/fundamental-it-engineer-source-contract.md`，口径收口文档 `docs/data-gate-semantics.md`；`docs/runbook.md` 的过时阶段边界已替换为当前范围。
- 本轮回归读数：Vitest 81/81、`pnpm test:python` 89 passed、`node --test scripts/verify-lib.test.mjs` 7/7、`eslint .` 干净、build 通过。

### 真实剩余项

- 基本情報技術者的 10 条事实 `delivery_mode` 为 `NULL`，契约三条 `conditional` requirement 因「空 scoped」被整条跳过 ⇒ 0 缺口不代表字段齐备；补维度会立即暴露 10 个缺口，且 `exam_subject_a_*` 命名不满足前缀匹配规则。**属判级/契约产品决策，待项目所有者确认。**
- 2027 年度簿记配点已公告（3 级第1問45／第2問25／第3問30、合計100、合格70以上）⇒ 覆盖年度滚到 2027 前，簿记 3 级 `scoring_method` 需从 `not_applicable` 回改并按三次授权流程重新采集。
- 历史统计字段（`pass_rate` 等）六资格零官方来源（工作包 F）。
- `sources.qualification_id` 有 32/40 条为 `NULL`；行政書士入库链不写 `capture_runs`/`source_checks`，与基本情報链路口径不一致（该项已于 2026-10-10 对齐，见上方最新一节）。
- `services/api/src/release.ts` 的 `rollbackApprovedFact` 维度 join 漏 `payment_method`，与 0014 迁移的 `facts_current_key_idx` 不一致。（已于 2026-10-10 收口，见当日「`rollbackApprovedFact` 维度 join 补 `payment_method`」一节。）
- ~~`escapeHtml` 在 4 处重复定义~~、~~迁移目录存在 `0010_` 重号~~ —— 两项已于 2026-10-10 收口，见当日「重复实现与迁移重号的结构性清理」一节。`services/parser` **更正：它不是空壳**，而是含 `ParsedCandidate` 桩模型与 1 条用例、且被 CI `pip install -e services/parser` 安装、被 README 与 `docs/product-design.md` 列为「资格适配器和提取」层的独立包；删它与否属结构决策，不在纯清理范围。

## 2026-09-07：阶段 3 技术 SEO 基线

- 公开页面加入正規 URL、说明文与页面级 `robots` 指示。
- 搜索、筛选和动态比较的参数页使用 `noindex,follow`，并回归到稳定的目录、日程或比较页面正規 URL。
- 新增 `robots.txt` 和 `sitemap.xml`；公开地址只从 `SITE_ORIGIN` 读取，避免生成未确认的生产域名。
- 已确认正式域名为 `shikakucheck.com`；生产环境应设置 `SITE_ORIGIN=https://shikakucheck.com`，canonical、robots 与 sitemap 将使用该地址。

## 2026-09-07：阶段 2 用户内容收口

- 新增 3 篇静态比较指南：宅建与行政書士、ITパスポート与基本情報技術者、日商簿記与FP技能検定。
- 新增 `/guide/` 目录与 4 篇通用指南，覆盖官方信息确认、年度计划、申込み前检查和合格率数据阅读。
- 比较指南只解释选择与核对维度，并跳转至动态比较器；没有写入日期、费用、合格率或制度等动态事实。
- 所有新增页面沿用公开页面的面包屑、日文 H1、相关页面链接与响应式阅读布局。

## 2026-08-29：阶段 2 ICS 日历下载

- 新增资格全年与单事件 ICS API，并通过 Web 同源下载路径提供给用户。
- 同一资格、年度和事实维度使用稳定 UID；`SEQUENCE` 从事实变更事件数量派生，批准变更或回滚后递增。
- 精确日期使用全天事件，带时间的事实按 `Asia/Tokyo` 输出；没有明确日期的说明性事实不生成 ICS。
- 单条事实包含多个官方日期时，按原顺序展开为稳定 occurrence 事件，避免全年 ICS 漏掉后续场次。
- 年度资格页、筛选后的日程页和每个有日期的日程事件均提供下载入口。

## 2026-08-14：阶段 2 六资格完整页面

- 六个首发资格统一开放概要、2026 年度日程、申込み・条件、試験内容、合格率五类页面。
- 年度页仅显示匹配 `examYear` 的事实，不混用其他年度。
- 分区字段支持资格特有后缀，例如 `application_open_2026_may_sessions`。
- `verify:all` 扩展为数据库 → API → 每资格 5 个 Web 页面，共 30 条页面路由回归。
- 验证结果：6/6 资格通过，30/30 页面 HTTP 200；JavaScript 30/30、Python 51/51 通过。

## 阶段 0 结束时

- 已完成：单仓骨架、契约、PostgreSQL 迁移、6 个稳定资格主数据、权限边界、幂等规则、高风险审核规则、测试、CI 和运行文档。
- 已验证：TypeScript 类型检查/构建、Vitest 6/6、pytest 2/2、Prettier。
- 已验证：本机 PostgreSQL 空库迁移。`0000_stage_0.sql` 与 `0001_takken_source.sql` 各执行一次；迁移重跑无重复执行，种子重跑不重复插入；6 个资格、1 个宅建来源登记存在，候选事实和正式事实均为 0。
- 非阻塞：ESLint 当前只检查配置文件，TypeScript parser 接入留待工程质量专项；Python 测试曾生成受权限保护的临时目录，已加入忽略规则，不属于业务数据。

## 阶段 1 当前边界

本轮只实现宅建（`takken`）数据闭环，所有快照和考试事实使用明确标记的 `synthetic`/`test-only` 夹具。实时官方抓取、生产写入、ITパスポート和其他资格不在范围内。

## 宅建真实页面接入前置策略

- 已完成：允许域名、HTTPS、重定向、超时、重试、ETag/Last-Modified 缓存、响应体积限制和 404 非变更策略。
- 已测试：仅使用 HTTPX MockTransport 离线测试；未访问 `www.retio.or.jp`，未生成真实快照。
- 下一阻塞：需要在本地 Docker PostgreSQL 可用后验证迁移，再由项目所有者明确批准实时抓取窗口和运行环境。

## 受控宅建真实页面抓取记录

- 来源：`https://www.retio.or.jp/exam/`
- 结果：预检与适配器读取各执行 1 次 sequential GET；首次 HTTP 200，均未发生重试或重定向（该运行实际产生 2 次受控读取）。
- 响应：78,143 bytes；SHA-256 `4ec79b62f278d65d036694dd0240c1e08ce0f25784baf84bd4e61efb220f6aa9`。
- 解析：当前宅建适配器未识别声明字段，未生成候选事实。
- 写入：未写入 PostgreSQL、MinIO、正式事实或公开页面；该响应仅作为本次受控读取结果，不是生产种子数据。

## 宅建候选本地入库

- 已通过显式 `STAGE1_LOCAL_WRITE=1`、`NODE_ENV!=production`、localhost 数据库限制后执行。
- 保存 1 个真实日程快照到本地 `var/official-snapshots/takken/`，写入 6 条 `pending_review/high` 候选：网络申请开始/截止、邮寄申请开始/截止、考试日、合格发表日。
- 重跑结果：新增候选 0 条；数据库中正式事实仍为 0 条。
- 真实快照目录已加入 `.gitignore`，不会成为生产种子或提交内容。

## 宅建审核队列

- 当前待审核候选：6 条，全部绑定同一官方来源和同一真实快照，均为 `high` + `pending_review`。
- 重复候选：0 条；已有审核记录：0 条。
- 因为考试日、申请期限和合格发表日属于高风险事实，本轮未自动批准；需要逐项明确 `approve`、`reject` 或 `defer` 及审核理由。

## 自动安全审核决定

- 已对 6 条候选逐项执行 `defer`。
- reviewer：`codex:safety-defer`。
- 理由：日期类高风险事实虽已绑定官方来源和原始快照，但仍需人工复核官方原文后才能批准。
- 结果：6 条仍为 `pending_review`；正式事实仍为 0 条。

## 本地人工审核入口

- 已实现 `apps/admin` 的宅建审核队列：`GET /review/takken`。
- 审核写入：`POST /internal/reviews/{candidate_id}`，要求 `x-reviewer-id` 与 `ADMIN_REVIEWER_ID` 一致，并要求非空理由。
- `approve` 在事务中写入 `reviews`、`fact_revisions` 和 `facts`；`reject/defer` 不写入公开事实。
- 已用本地数据库验证页面 HTTP 200；本轮未执行批准，当前仍为 6 条 `pending_review`、0 条正式事实。

## 阶段 1 归档

- 已完成宅建本地闭环归档和验收记录：见 [stage1-acceptance.md](stage1-acceptance.md)。
- 已确认下一阶段只进入 IT Passport 的来源与字段契约，不批量接入其他资格。
- IT Passport 来源计划见 [it-passport-source-contract.md](it-passport-source-contract.md)；本轮未抓取实时页面、未生成动态事实。

## IT Passport 离线适配器

- 已完成来源绑定的 snapshot、显式字段提取和字段级变化检测。
- 已覆盖 CBT 页面、公告费用变化、结构失效和 404 不创建快照。
- 日期、费用、报名规则候选默认 `high + pending_review`；结构失效不产生候选。
- 使用 `fixtures/official-snapshots/it-passport-*.html` 离线夹具，未写入数据库和公开 API。
- 已完成本地 fixture 候选入库入口 `services/collector/src/collector/ingest_it_passport.py`。
- 审核后台已支持 `/review/it-passport`，批准仍通过统一 revision/fact/change event 事务。
- 候选入库必须显式设置 `STAGE2_LOCAL_WRITE=1`、localhost `DATABASE_URL` 和 `IT_PASSPORT_EXAM_YEAR`。

## IT Passport 本地数据库验收

- Docker PostgreSQL/MinIO 已启动；`0002_it_passport_sources.sql` 成功应用，迁移表包含 0000、0001、0002。
- IT Passport 来源记录：3 条；fixture 首次入库 2 条，第二次入库 0 条，快照 1 条，幂等有效。
- 已通过 `/review/it-passport` 完成 1 条候选批准，写入 1 条 approved fact、1 条 approved revision 和 1 条 change event。
- 当前 IT Passport 本地状态：1 条 `pending_review + synthetic`，1 条 `approved + synthetic`。
- 公开 API `/api/v1/facts` 返回 6 条既有宅建事实，IT Passport 返回 0 条；synthetic 事实过滤有效。
- 本次批准仅用于本地链路验收，不构成生产事实，不得作为生产发布依据。

## IT Passport 公开读取链路

- 新增 `/api/v1/qualifications/{slug}` 资格详情接口。
- 返回资格稳定主数据、`verified/awaiting_official` 状态、公开事实和最新官方确认时间。
- 公开查询继续过滤 `synthetic=true`；本地实际 HTTP 验证返回 IT Passport `awaiting_official`、0 条 facts。
- Vitest：20/20 通过；Python：21/21 通过；类型检查、构建和 ESLint 通过。

## IT Passport 公开展示层

- 新增 IT Passport 公开页 `/shikaku/it-passport/`，从公开 API 读取，不直接访问数据库。
- 已实现 `awaiting_official` 空状态、官方来源展开、快照 ID 和确认时间展示。
- 页面不显示 synthetic 事实；API 不可用时显示安全错误页，不回退到伪造数据。
- 本地 API/Web 联调 HTTP 200；页面显示「公式発表待ち」，未显示 CBT synthetic fixture 内容。
- Vitest：22/22 通过；类型检查、构建和 ESLint 通过。

## IT Passport 公开子页面

- 新增 `/shikaku/it-passport/application/` 报名与受験資格页。
- 新增 `/shikaku/it-passport/exam-content/` 考试内容页。
- 两个页面复用公开 API、来源展开和状态组件，并按事实键隔离展示内容。
- 缺少对应的非 synthetic 已批准事实时，显示对应的 `公式発表待ち` 空状态。
- 本地 HTTP 联调两个页面均返回 200；Vitest：23/23 通过；类型检查和构建通过。

## IT Passport 来源与更新说明

- 公开页面新增官方来源列表、字段级来源说明、状态解释和更新/订正提示。
- 新增实时抓取前人工授权清单：见 [it-passport-live-capture-authorization.md](it-passport-live-capture-authorization.md)。
- 清单完成前不执行实时页面抓取；当前页面仍只展示已批准且非 synthetic 的事实。

## IT Passport 首次受控真实读取

- 授权：项目所有者明确授权，仅保存本地快照，不写数据库。
- 时间：2026-08-12 13:46 JST。
- `source:it-passport:ipa-exam`：HTTP 200，1 次请求，55,447 bytes，SHA-256 `0b482c75862c7be1e4b537154266aca59d7919f3a70404ccfb62052d43b5ead3`。
- `source:it-passport:jitec-home`：HTTP 200，1 次请求，30,037 bytes，SHA-256 `d97229af297656c12a19cad159d399180e974498caf1ad3a805b7aa21e2af964`。
- `source:it-passport:jitec-application`：HTTP 200，1 次请求，37,756 bytes，SHA-256 `30b9a8bcf03614f5e50847d18d122c320dbee019caee8c780a19be484adf0d25`。
- 快照目录：`var/official-snapshots/it-passport/`；抓取报告：`capture-report.json`。
- 本次 `candidate_ingest=not_run`，未写 PostgreSQL、未生成候选事实、未改变公开 API。

## IT Passport 真实快照离线解析

- 新增真实页面专用解析器；不复用 synthetic fixture 的 `data-fact-key` 约定。
- IPA 总入口仅做页面结构确认，不从导航卡片推导 IT Passport 事实。
- JITEC 首页本轮未生成事实；JITEC 报名页生成 2 条离线候选：
  - `application_change_deadline_rule`：`試験日の3日前まで変更可能`。
  - `application_open_2026_may_sessions`：`2026年3月24日21:30以降`。
- 两条候选均为 `high + pending_review + synthetic=false`，并保存匹配到的官方原文证据。
- 分析报告：`var/official-snapshots/it-passport/analysis-report.json`。
- `database_write=not_run`、`automatic_approval=not_run`；公开 API 和页面未变化。

## IT Passport 真实候选审核队列准备

- 新增 `0003_candidate_evidence.sql`，为候选事实保存官方原文证据。
- 审核后台显示 `evidence_text`，便于对照候选值与官方原文。
- 新增 `ingest_it_passport_analysis.py`，只允许显式授权写入 localhost PostgreSQL。
- 本地迁移 `0003_candidate_evidence.sql` 已应用；首次入库新增 1 个真实快照和 2 条候选，重跑新增 0 条。
- 两条真实候选当前均为 `pending_review + high + synthetic=false`，未执行批准。
- 审核后台对候选值、官方原文、来源 URL 和快照哈希进行 HTML 转义后展示。

## IT Passport 阶段 1 数据链路归档

- 数据链路已归档为：官方来源登记 → 受控快照 → 离线结构分析 → 候选事实 → 高风险人工审核 → revision/fact/change event → 公开 API 过滤 → 用户页面展示。
- synthetic fixture 仅用于本地链路验收；真实快照候选即使 `synthetic=false`，在人工批准前也不得进入公开 API。
- 已实现真实分析报告到本地审核队列的显式授权入口：`IT_PASSPORT_REAL_CANDIDATE_WRITE=1`，仅允许 localhost PostgreSQL，生产环境拒绝执行。
- 已实现统一公开读取接口和页面状态：没有非 synthetic 已批准事实时显示 `awaiting_official`，不使用 fixture 或推测值补全。
- 本阶段仍未完成生产发布、生产对象存储、正式认证、定时调度和外部通知；这些内容保留到上线准备阶段。

## 两个资格统一用户页面

- 已完成统一的 overview、application、exam-content 页面模板，当前可用于 `takken` 和 `it-passport`。
- 已完成 `/shikaku/` 资格目录，仅列出阶段 1 已进入用户页面范围的两个资格；其他四个资格暂不生成空页面。
- 页面统一展示资格状态、官方确认时间、事实来源、快照标识和更新/订正说明；动态事实仍只从公开 API 读取。

## 阶段 1 用户端验收与收口

- 已联调 `/shikaku/`、宅建 3 个页面和 IT Passport 3 个页面，全部 HTTP 200。
- 修复宅建兼容 API 路由返回非标准事实结构的问题，统一为资格详情响应结构。
- 页面连续请求后 Web/API 进程保持运行；公开 API 无事实时正确显示 `awaiting_official`，不显示 synthetic 内容。
- Python 非实时抓取与解析测试 25/25 通过；Vitest 因当前沙箱 `spawn EPERM` 未完成，需在非受限环境重跑。
- 阶段 1 用户端和数据链路已完成本地收口；不包含生产发布、生产认证、定时采集和跨资格工具。
