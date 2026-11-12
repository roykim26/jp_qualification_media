# 工作包 I：kinzai FP 域名迁移（products.kinzai.or.jp）授权单

状态：**已拍板、实施并落地（代码＋迁移＋测试＋文档同批）**。2026-11-11 起草，2026-11-12 执行。所有者已逐条拍板 D1／D2／D4／D5；D3 经唯一索引证据修订为「退役空登记」（见 §2）。本轮已改 FP 代码、写迁移 0028、重写测试、同步文档，并已 commit `4f45330`＋push 直推 main（CI run `43107570678` 双绿）＋本机应用 0028（sources 52→51、verify:all 6/6）。**实抓、候选入库、审核批准仍未触发，各须单独授权**。

前置阅读：`docs/handover-p1-ops-findings.md` §B、`docs/fp-source-contract.md`（如存在）、`docs/work-package-f-live-capture-authorization.md`（授权口径先例）。

## 1. 发现与调查证据

### 1.1 巡检读数（失败是正确行为）

`var/patrol/patrol-report.json`，run_id=`patrol-20261111T105619Z`：9 条 kinzai 来源全部 `failed`，error 逐字为 `host is not allowlisted: products.kinzai.or.jp`。即旧 URL 301 跳到未白名单域名，SafeFetcher 按策略拒绝跟随——**这是白名单在正确工作，不是巡检缺陷**。9 条＝8 条登记 `source:fp:kinzai-*` ＋ 1 条 `capture-only:fp:kinzai-fp-faq`（后者不在库内 `sources`，2026-11-11 现取确认）。

### 1.2 重定向落点（2026-11-11 调查实测）

| source_id                        | 旧 URL（现登记）                                      | 301 落点（新 URL）                                     |
| -------------------------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `source:fp:kinzai-home`          | `https://www.kinzai.or.jp/ginou/fp/`                  | `https://products.kinzai.or.jp/exam-fp/`               |
| `source:fp:kinzai-1-academic`    | `https://www.kinzai.or.jp/ginou/fp/1kyu/g_apply.html` | `https://products.kinzai.or.jp/exam-fp/1kyu-gakka/`    |
| `source:fp:kinzai-1-practical`   | `https://www.kinzai.or.jp/ginou/fp/1kyu/j_apply.html` | `https://products.kinzai.or.jp/exam-fp/1kyu-jitsugi/`  |
| `source:fp:kinzai-2`             | `https://www.kinzai.or.jp/ginou/fp/2kyu/index.html`   | `https://products.kinzai.or.jp/exam-fp/2kyu/`          |
| `source:fp:kinzai-3`             | `https://www.kinzai.or.jp/ginou/fp/3kyu/index.html`   | `https://products.kinzai.or.jp/exam-fp/3kyu/`          |
| `source:fp:kinzai-eligibility`   | `https://www.kinzai.or.jp/ginou/fp/sikaku.html`       | `https://products.kinzai.or.jp/exam-fp/eligibility/`   |
| `source:fp:kinzai-schedule`      | `https://www.kinzai.or.jp/ginou/fp/nittei-fp`         | `https://products.kinzai.or.jp/exam-fp/schedule/`      |
| `source:fp:kinzai-schedule-2026` | `https://www.kinzai.or.jp/fp/nittei-fp/48581.html`    | `https://products.kinzai.or.jp/exam-fp/schedule/`      |
| `capture-only:fp:kinzai-fp-faq`  | `https://www.kinzai.or.jp/ginou/fp/faq`               | `https://products.kinzai.or.jp/exam-fp/`（FAQ 已废止） |

两条 schedule 登记**收敛到同一新 URL**（官方把年度日程页并进了总日程页）。FAQ 页不再存在，跳回考试顶层页。

新路径结构已**离线复核**：调查保存页 `var/ops-investigation/kinzai/home.html` 的内链逐字含上表全部 `products.kinzai.or.jp/exam-fp/…` 路径（2026-11-11 用 BeautifulSoup 提取 href 证实）。调查快照共 7 个（home／1kyu-gakka／1kyu-jitsugi／2kyu／3kyu／eligibility／schedule），标题与内容对应正确考试页。**这些是调查件，不是官方快照**：未登记、未入库、不得用于入库。

### 1.3 内容存活读数（离线，2026-11-11 现取）

- `schedule.html`：2026 年完整日期 **56 个**、10 张表；受検申請受付期間行与已批准事实逐字吻合（如 `2026年3月9日（月）10：00～ 4月2日（木）17：30`）。
- `eligibility.html`：1 級表仍在（学科 3 条替代路径、実技多条），与已批准 `eligibility` 值（含（注1）～（注4））内容一致；但标题锚点从 `h2#aaa` 降为 **`h3#aaa`**。
- `1kyu-jitsugi.html`：面接 2 回（「面接は、異なる設例課題に基づき、2回行います。」）、各面接約 12 分（「各面接の1人当たりの所要時間は約12分です。」）、口頭試問方式、28,000 円（非課税）——7 条已批准事实的原文证据全部存活。
- `1kyu-gakka.html`：基礎編 50 問／応用編 5 題、マークシート／記述式、8,900 円、150 分×2——8 条已批准事实的原文证据全部存活，**但表格行标签从 `td` 改成了 `th`**（见 §3）。

### 1.4 库内依赖（2026-11-11 现取）

27 条已批准事实依赖 4 条 kinzai 来源：

| source_id                        | 已批准事实数 |
| -------------------------------- | ------------ |
| `source:fp:kinzai-1-academic`    | 8            |
| `source:fp:kinzai-1-practical`   | 7            |
| `source:fp:kinzai-eligibility`   | 2            |
| `source:fp:kinzai-schedule-2026` | 10           |

其余 4 条登记（home／2／3／schedule）无事实、无专用提取器，只作证据。库内 `sources` 共 51 条（0026/0027 尚未应用），kinzai 8 条 `allowed_domain` 均为 `www.kinzai.or.jp`、`active=true`。

## 2. 决策点（须所有者逐条拍板）

- **D1 白名单扩张（安全决策）**：把 `products.kinzai.or.jp` 加入 FP kinzai 侧允许域。范围**仅限 kinzai provider 的来源**，不是全局放宽；jafp 侧仍只允许 `www.jafp.or.jp`。域名仍是 kinzai 官方（一般社団法人金融財政事情研究会）所有，属同一主体的站点改版，不是第三方域。
- **D2 登记 8 条新 URL**：按 §1.2 表更新 `FP_SOURCES` 与库内 `sources.canonical_url`＋`allowed_domain`（迁移落点见 §6）。
- **D3 schedule 双登记 → 修订为退役空登记（2026-11-12 所有者拍板）**：原拟「两条都保留」，但执行前只读复核发现迁移 0022 的 `UNIQUE(canonical_url, qualification_id)` 禁止同资格同 URL 双登记——`kinzai-schedule` 与 `kinzai-schedule-2026` 同属 `qualification:fp`，收敛到同一新 URL `/exam-fp/schedule/` 会撞唯一索引；`ipa-fee` 先例是跨资格（it-passport vs fundamental-it），不适用。证据：`kinzai-schedule` 0 事实／0 快照／0 候选，仅 1 条巡检 `source_checks`；10 条已批准日程事实全挂在 `kinzai-schedule-2026`。所有者选择**选项 1：退役空登记＋删除行**——`FP_SOURCES` 移除 `kinzai-schedule`（13→12），迁移 0028 先删其 `source_checks` 行再删 `sources` 行，`kinzai-schedule-2026` 迁新 URL 保住出处链，库内 `sources` 52→51，无 schema 变更。
- **D4 faq capture-only 退役**：FAQ 页已废止（301 回顶层页，无独立内容）。从 `DIRECTLY_CITED_CAPTURE_SOURCES` 移除 `capture-only:fp:kinzai-fp-faq`；旧官方快照 `var/official-snapshots/fp/kinzai-fp-faq.html` **保留作证据，不删**。faq 不在库内，无迁移动作。
- **D5 适配器重写与 URL 变更同批（强制）**：只改 URL 不重写适配器会造成**静默错解**（§3 实测），比巡检 failed 更危险。本工作包不允许「先改 URL 下轮再修适配器」的拆批。

## 3. 静默错解证据（为什么 D5 是强制项）

用**现行适配器**对调查保存的新页离线跑 `extract_candidates()`（2026-11-11 现取）：

| 来源                                           | 读数                                    |
| ---------------------------------------------- | --------------------------------------- |
| home／2／3／eligibility／schedule／1-practical | 0 候选＋`structure_changed`（安全失败） |
| **1-academic**                                 | **6 候选、0 issue，但含 2 条错值**      |

`kinzai-1-academic` 错值明细（对照库内已批准值）：

| fact_key／component        | 已批准值                                        | 新页误读值     |
| -------------------------- | ----------------------------------------------- | -------------- |
| `question_count`／basic    | `50`                                            | **整条丢失**   |
| `question_format`／basic   | `マークシート方式による筆記試験 （四答択一式）` | **整条丢失**   |
| `question_count`／applied  | `5`                                             | `120200`（错） |
| `question_format`／applied | `記述式による筆記試験 （事例形式）`             | `50問`（错）   |

根因：新页把行标签「基礎編／応用編」从 `td` 挪进 `th`。`_extract_kinzai_1_academic()`（`fp.py` L287-294）用 `row.select("td")` 取 `cells[:3]` 当（节名, 形式, 题数）：

- 基礎編行变成 `[形式, 题数, 合格基準]` 三个 td ⇒ 节名被读成形式文本（≠「基礎編」）⇒ 误归 `academic:applied`；题数位读到「120点以上（200点満点）」⇒ `re.sub(r"\D","")` 得 `120200`。
- 応用編行只有 2 个 td（无合格基準列）⇒ `len(cells) < 3` 被整行跳过。

另注意：`exam_time=300` 与 `passing_standard=120/200` 目前是**硬编码常量**（`fp.py` L284-285），新页数值恰好未变所以没暴露；重写时改为从 `#exam-time` 表（150 分×2 行）与合格基準列解析并校验，不再裸写常量。

## 4. 逐来源重写规格

- **1-academic**：锚点 `#exam-time`／`#exam-format`／`#exam-fee` 存活。新表 4 列（科目 th／出題形式／問題数／合格基準），行标签在 `th`；応用編行无合格基準单元格。按 `th` 读节名，产出 8 条事实（basic/applied 各 format+count，academic 的 method/time/passing/fee）。PBT 判定沿用「表内含筆記試験」逻辑。
- **1-practical**：旧锚点 `#syutudai` 消失；新页节锚点为 `#exam-format`（審査の方法・配点等）与 `#exam-fee`（h3）。7 条事实的原文证据位置：面接 2 回／約 12 分／口頭試問方式在 `#exam-format` 节正文，28,000 円在 `#exam-fee` 后首个 p，資産相談業務在页标题与节文。重写须逐条锚定原文；**任一证据句缺失 ⇒ `structure_changed`，不推断**（eligibility/passing_standard 等高风险字段禁止推断是长期边界）。
- **eligibility**：最小改动——`h2#aaa` → `#aaa`（新页是 h3）。表结构（th 学科試験／実技試験 ＋ 多 td 替代路径行）与现行按行归并逻辑兼容；已批准值含全部替代路径与注文，与新页一致。产出 2 条（academic/pbt、practical:asset-consulting/interview），维度沿用对应登记页，不得复用到其他级。
- **schedule-2026**：旧锚点 `h2#g`／`h2#j` 消失；新页 10 张表、无旧 id。按「受検申請受付期間」行与考试日／合格発表行重建映射，产出 10 条（academic/pbt 与 practical:asset-consulting/interview 各 exam_dates／exam_schedule／application_open／application_deadline／result_date）。已批准日期（56 个 2026 日期序列）在新页逐字存活，可作回归基线。
- **home／2／3／schedule**：无专用提取器、0 事实，只作证据。改 URL 后预期巡检不再 failed；整页无候选时报 `structure_changed` 属设计，不需要为它们写提取器。

## 5. 代码改动点

1. `services/collector/src/collector/fp.py` `FP_SOURCES`：8 条 kinzai URL 换新（`allowed_domain` 由 `urlsplit` 自动派生为 `products.kinzai.or.jp`，`source_plan()` 无需另改）。
2. `services/collector/src/collector/capture_fp.py` **L67 硬编码 host**：`host = "www.jafp.or.jp" if provider == "jafp" else "www.kinzai.or.jp"` 改为按 URL hostname 派生（或 kinzai 侧改 `products.kinzai.or.jp`）。这是白名单的第二处落点，漏改则实抓仍被拒。
3. `capture_fp.py` `DIRECTLY_CITED_CAPTURE_SOURCES`：按 D4 移除 faq 条目。
4. `fp.py` 四个提取器按 §4 重写。
5. `source_registry.py`／巡检无需改：FP 域从 `FP_SOURCES` 派生，巡检读库内 `sources`。
6. **（执行轮补充，超出原 §5 枚举，已向所有者标记）** `apps/web/src/render.ts` 的 FP 官方来源链接列表含 6 条 kinzai 旧 URL（home／1-academic／1-practical／2／3／eligibility，无 schedule），是同一域名迁移在 Web UI 的硬编码副本，按 D2 同一映射换新（`products.kinzai.or.jp/exam-fp/…`）。无 Web 测试断言这些 URL，部署暂缓故无实时用户影响。JS 测试夹具 `tests/fixtures/fp-ui-stress.ts`（4 条 mock sourceUrl）与 `scripts/verify-lib.test.mjs:258`（`provenanceStatus:'fixture'`）是合成压测/夹具数据、非登记断言；`scripts/backfill-fp-provenance.mjs` 是历史 localhost 溯源脚本（faq 快照按 D4 保留）——三者本轮**刻意不动**，属范围外。

## 6. 迁移落点（0028，已写，应用待授权）

7 条 `UPDATE sources SET canonical_url='<新>', allowed_domain='products.kinzai.or.jp' WHERE id='<id>' AND canonical_url='<旧>'`（home／1-academic／1-practical／2／3／eligibility／schedule-2026）——旧值守卫保证幂等（重跑零 Applied）。按修订 D3 退役 `kinzai-schedule`：先 `DELETE FROM source_checks WHERE source_id='source:fp:kinzai-schedule'` 再 `DELETE FROM sources WHERE id=… AND canonical_url='https://www.kinzai.or.jp/ginou/fp/nittei-fp'`（FK 安全：2026-11-12 只读复核 candidate_facts／snapshots／source_scopes／conflicts 均 0 引用）。faq 不在库，无动作。`sources` 52→51。`seed.ts` 的 fp 映射按 id 前缀绑定，无需改。**迁移应用到本机库须单独授权**（与代码 commit 分开）；2026-11-12 已经授权应用（0000–0028 共 29 个，sources 51，kinzai-schedule 行已删）。

## 7. 测试影响面

- `test_fp_contract.py`：L9 域集合断言 `{www.jafp.or.jp, www.kinzai.or.jp}` → kinzai 侧换 `products.kinzai.or.jp`；L14/17/18 的 `is_registered_source_url` 旧 URL 断言换新；var 快照用例（存在性守卫）在重抓后按新读数重锁；内联合成夹具（td 行标签、h2#aaa 等旧锚点）同步更新，并**新增一条 td→th 回归用例**锁定 §3 错解不再发生。
- `test_fp_capture.py`：L35 faq URL 断言随 D4 移除/改写。
- `test_fp_ingest.py`：L138 旧 URL 夹具换新。
- baseline 与 CI 夹具（982）**不动**：夹具只写 candidate_facts/fact_revisions/facts/snapshots，不写 sources。

## 8. 快照与证据保全

`var/official-snapshots/fp/` 现存 9 个 kinzai 旧官方快照（含 faq）。**重抓会覆盖同名文件 ⇒ 实抓前必须先备份**（先例＝`var/official-snapshots/fp-preserved/` 的 hash 命名副本＋manifest.json）。调查件 `var/ops-investigation/kinzai/` 只作本单证据，不进官方快照目录、不入库。

## 9. 授权边界（三次独立，逐项一句话）

1. **实抓**：`FP_LIVE_AUTHORIZED=1` ＋ 所有者明示；限 8 条登记来源（faq 不抓）；抓前先备份（§8）。
2. **候选入库**：另行授权。预期候选 27 条（8+7+2+10），与既有事实同槽；若页面措辞有出入（如 format 文本空格差异），以 normalized_value 比对，差异交人工，不自动覆盖批准值。
3. **审核批准**：另行授权；admin 写只认 `x-reviewer-id` 头。

push／开 PR／「合并」各须明示措辞；部署暂缓，不在本单范围。

## 10. 验收判据（执行轮用，须可复跑）

- `PYTHONIOENCODING=utf-8 services/collector/.venv/Scripts/python.exe -m pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests -q` 全绿（含新 td→th 回归用例）。
- `npm run format:check` 通过（改完显式复检）。
- 授权实抓后巡检复跑：9 条 kinzai 不再 failed（faq 已退役则剩 8 条 ok/changed）。
- 只读 SQL 比对：27 条事实的 normalized_value 与重抓候选一致（内容未变前提下）；facts 总数与 baseline 982 口径不受影响。
- 迁移幂等：第二次 migrate 零 `Applied`；`verify:all` 6/6。

## 11. 范围外

jafp 5 条来源不动；不新增事实字段；FE 合格率（`statistics-fe` 附件 PDF）属另一工作包；簿记 URL 漂移已由迁移 0026 闭合，与本单无关。

## 12. 执行轮读数（2026-11-12，离线，可复跑）

- **pytest**：`PYTHONIOENCODING=utf-8 services/collector/.venv/Scripts/python.exe -m pytest -p no:cacheprovider --basetemp=.pytest-basetemp services/collector/tests services/parser/tests -q` ⇒ **218 passed**（上一轮 214，净 +4；含新增 td→th 回归、legacy td fail-safe、practical 缺证据句 fail-safe 用例）。
- **vitest**：`npx vitest run --dir tests --pool=threads --poolOptions.threads.singleThread` ⇒ **15 文件／139 用例**（`npm test` 含 `var/wt-*` 旧 worktree 副本虚增到 42／387，报数以 --dir tests 为准）。**verify-gate** `npm run test:verify-gate` ⇒ **40 pass／0 fail**。**typecheck** 通过。**format:check**「All matched files use Prettier code style!」（render.ts＋2 md 先 --write 复检 unchanged）。
- **提取器离线复核**：新调查页 27 候选／0 issue（8+7+2+10），对 27 条已批准基线 23 不变／4 变化（schedule 实技 2027-02 窗口）／0 缺失／0 多余；home／2／3 报 `structure_changed`（设计）。旧官方磁盘：academic 安全失败 0、practical 7／eligibility 2／schedule 10 仍解析且 19 值与基线逐字一致。
- **只读 DB 现态**：`sources` 52、`facts` 994、`pending_review` 0、已应用迁移 28（0000–0027）、kinzai 8 行仍旧域；`kinzai-schedule` FK 引用仅 `source_checks` 1 条（candidate_facts／snapshots／source_scopes／conflicts 均 0）。
- **已落地（2026-11-12）**：commit `4f45330`＋push 直推 main，CI run `43107570678` 双绿（vitest 15/139、pytest 218、verify-gate 40/0、verify:all 6/0、docker-smoke 982、CI migrate「Applied 0028」、CI seed bound 51）；本机应用 0028（1 Applied、重跑 0 Applied、seed bound 0、sources 52→51、migrations 29、facts 994、pending 0、kinzai 7 行 products 域、kinzai-schedule 行已删、27 事实出处 intact、verify:all 6/6）。落账 commit `18507b4`＋CI run `43113194941` 双绿。
- **实抓链闭合（2026-11-12，三次独立授权「1」→「入库」→「批准」）**：① 实抓——先备份 7 条旧快照到 `var/official-snapshots/fp-kinzai-pre-capture-20261112/`（副本哈希校验一致），`capture_registered_sources(source_ids=7 条 kinzai)` 收紧（不裸跑 `__main__` 以免连 jafp），7/7 ok/200/attempts 1、新哈希全变、`candidate_ingest: not_run`；离线验证 27 候选/0 issue（home/2/3 `structure_changed` 设计），对基线 23 不变/4 变化/0 缺失/0 多余。② 入库——`ingest_snapshot()` 收紧到 4 条产事实 kinzai（`INGEST_SOURCES` 含 2 jafp 但报告无 jafp 记录、home/2/3 证据页脚本拒绝入库），`FP_LOCAL_WRITE=1`＋localhost，＋4 snapshots/＋4 source_checks（changed/200）/＋4 capture_runs/＋27 pending_review，旧 27 approved 未触碰，facts 994 不变，门禁暂 5/6（fp official pending 27）。③ 批准——admin HTTP 端点 `x-reviewer-id=p1-1-b-owner-review`，自包含 Node 脚本 spawn admin 子进程→27 POST→taskkill 树（端口 3001 无残留），27/27 OK，pending 27→0、门禁回 6/6、＋27 reviews/＋27 change_events、kinzai 候选 54 approved（27 旧历史＋27 新），4 条新值成 facts 当前 revision。
- **4 条变化值**（schedule-2026 实技，补旧提取器漏抓的第 3 窗口）：`exam_dates`/`exam_schedule` ＋`2027-02-06,2027-02-13`、`application_open` ＋`2026-11-16`、`application_deadline` ＋`2026-12-11`；`result_date` 不变（旧已含 `2027-03-15`，旧考试日/受理期只 2 窗口＝旧数据不自洽，新提取器补齐属 bug 修复）。
- **两处透明**：① 本机领先冻结夹具 4 条值（CI 夹具 982 仍旧 4 日期值、0 处新窗口），按边界未碰 baseline/夹具，刷新夹具属另一次 baseline 变更授权（**仍待授权**）；② 巡检面曾只清一半——4 条产事实 kinzai `source_checks` 转 changed/200，home/2/3 证据页仍旧 failed（ingest 拒绝证据页、不写 source_checks）；**已由 2026-11-12 巡检收尾轮重跑巡检闭合**（见下条）。⇒ **§10 验收判据「9 条 kinzai 不再 failed」现已全满足**（4 产事实页经 ingest＋3 证据页经 patrol＋kinzai-schedule/faq 已退役）。
- **巡检收尾轮（2026-11-12，号主授权选项 1，`PATROL_LIVE_AUTHORIZED`＋`PATROL_LOCAL_WRITE`）**：`patrol_registered_sources(source_ids=home/2/3)` 收紧（不裸跑全 60），3/3 changed/200、final_url 无路径漂移、哈希与实抓链逐字一致（home cd916db8/2 102f230b/3 42e696ba），run `patrol-20261112T020530Z`，快照内容寻址不覆盖固定名 fp 快照；record 步**按 run_id 过滤只录 3 条**（避免重触合并报告其余 59 条旧快照行）⇒ ＋1 capture_run/＋3 snapshots/＋3 source_checks、candidates 0、skipped 0。现取：**7 条 kinzai 最新 source_checks 全 changed/200、kinzai_latest_failed＝0**，facts 994/pending 0 不变、verify:all **6/6**；snapshots 78/source_checks 66/capture_runs 15、FP 快照 18/FP changed 检查 12/FP 候选 102（kinzai 54/jafp 48）。零代码/迁移/baseline/夹具改动，产物在 gitignore `var/`，落账纯文档。
- **坑**：`NO_PROXY` 含 `[::1]`/CIDR 致 httpx 0.28.1 崩，实抓覆盖 `NO_PROXY=localhost,127.0.0.1`；capture/ingest `__main__` 都连 jafp 跑须收紧；验证脚本 `read_text` 换行归一化致显示哈希与报告不同，入库 `read_bytes().decode` 不归一化故对齐；admin import 即自启动，批准走 HTTP 端点。产物均在 gitignore `var/`，数据刷新不进 git，零代码/迁移/baseline 改动。
