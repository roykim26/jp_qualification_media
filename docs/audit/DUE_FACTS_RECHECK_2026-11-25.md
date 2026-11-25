# 29 条到期事实复核（2026-11-25）

> 背景：运营日检 `staleness.dueFacts = 29`，全部 `verifiedAt 2026-01-01T00:00:00Z`（328 天未复核，窗口 fee 90 天／eligibility 180 天）。本文件是「采集 → 候选入库 → 批准」中第 ① 步的产出：把今日官网快照与已批准值逐条比对，回答「内容到底变没变」。**本文件不改任何线上数据**，第 ②③ 步需另行授权。

## 1. 结论

| 结论                           | 条数 | 含义                                                  |
| ------------------------------ | ---: | ----------------------------------------------------- |
| `same`（结构化抽取逐字段相等） |   24 | 官网内容未变                                          |
| `same_text`（原文文本命中）    |    2 | 无结构化抽取器，但今日页面确有等价原文                |
| 无法机验，需人工复核           |    3 | takken 2 条支付截止规则、it-passport 1 条变更截止规则 |

- **29 条跨 5 个资格**（更正此前「全是 bookkeeping」的说法）：bookkeeping 10、fp 8、gyoseishoshi 3、takken 4、it-passport 1。
- **没有一条是「内容已变需要更新」**；24 条确认未变，2 条文本层面确认，3 条因来源页缺少原文而无法确认。
- 因此这 29 条到期**不是数据变质问题，而是缺少「复核无变化」的落账通道**（见 §4 缺口一）。

## 2. 复核方法

1. 采集（今日，本机）：`capture_bookkeeping`（22 页）、`capture_fp`（6 页）、`capture_gyoseishoshi`（6 页）、`capture_it_passport`（6 页）、`capture_takken`（注册页 1 页 + 自动跟随的 7 页）。全部 exit 0，产物在 `var/official-snapshots/<qual>/`。
2. 比对脚本：`var/due-facts-recheck.py`（gitignored，本地工具）。从快照重建候选索引，按 `(fact_key, exam_level_id, exam_component, delivery_mode, payment_method, exam_session)` 匹配 DB 中到期 fact 的当前 revision，`exam_year` 不参与匹配（候选多不带年、DB 为 2026）。
3. 判定：
   - `equal()`：结构相等比较，兼容 jsonb 标量（`"5500"`）与 parser 整数（`5500`）、dict/list 递归；
   - 结构化抽取不可用时，用 `flat()`（去空白/逗号、全角数字转半角）在今日快照全文里做原文命中，命中记 `same_text`；
   - 都失败记 `not_found`，转人工。

## 3. 逐条结果

图例：`dim` 为 `examLevel/examComponent/delivery/payment/session`；`-` 表示该维度为空。

| 资格         | fact_key                         | dim                                 | 已批准值（截断）                                                      | 结论                                                             |
| ------------ | -------------------------------- | ----------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------- |
| bookkeeping  | payment_deadline_rule            | 1/-/unified/-/-                     | 試験日の2ヵ月前を目安に…                                              | same                                                             |
| bookkeeping  | payment_deadline_rule            | 2/-/unified/-/-                     | 試験日の2ヵ月前を目安に…                                              | same                                                             |
| bookkeeping  | payment_deadline_rule            | 3/-/unified/-/-                     | 試験日の2ヵ月前を目安に…                                              | same                                                             |
| bookkeeping  | fee                              | 2/-/network/-/-                     | 2級 5,500円（税込）                                                   | same                                                             |
| bookkeeping  | fee                              | 3/-/network/-/-                     | 3級 3,300円（税込）                                                   | same                                                             |
| bookkeeping  | fee                              | basic/-/network/-/-                 | 簿記初級 2,200円（税込）                                              | same                                                             |
| bookkeeping  | fee                              | cost-accounting-basic/-/network/-/- | 原価計算初級 2,200円（税込）                                          | same                                                             |
| bookkeeping  | fee                              | 1/-/unified/-/-                     | 1級 8,800円（税込）                                                   | same                                                             |
| bookkeeping  | fee                              | 2/-/unified/-/-                     | 2級 5,500円（税込）                                                   | same                                                             |
| bookkeeping  | fee                              | 3/-/unified/-/-                     | 3級 3,300円（税込）                                                   | same                                                             |
| bookkeeping  | eligibility                      | 1/-/unified/-/-                     | 商工会議所の検定試験は、どの級からでも受験可…                         | same                                                             |
| bookkeeping  | eligibility                      | 2/-/unified/-/-                     | 同上                                                                  | same                                                             |
| bookkeeping  | eligibility                      | 3/-/unified/-/-                     | 同上                                                                  | same                                                             |
| fp           | fee                              | 2/academic/cbt/-/-                  | 5,700円（非課税）                                                     | same                                                             |
| fp           | fee                              | 2/practical:asset-design/cbt/-/-    | 6,000円（非課税）                                                     | same                                                             |
| fp           | fee                              | 3/academic/cbt/-/-                  | 4,000円（非課税）                                                     | same                                                             |
| fp           | fee                              | 3/practical:asset-design/cbt/-/-    | 4,000円（非課税）                                                     | same                                                             |
| fp           | eligibility                      | 2/academic/cbt/-/-                  | 3級FP技能検定の合格者…                                                | same                                                             |
| fp           | eligibility                      | 2/practical:asset-design/cbt/-/-    | 同上                                                                  | same                                                             |
| fp           | eligibility                      | 3/academic/cbt/-/-                  | FP業務に従事している者または従事しようとしている者…                   | same                                                             |
| fp           | eligibility                      | 3/practical:asset-design/cbt/-/-    | 同上                                                                  | same                                                             |
| gyoseishoshi | fee                              | -                                   | １０，４００円                                                        | same                                                             |
| gyoseishoshi | payment_deadline_rule            | -                                   | 受験手数料は、受験願書の受付期間内に払い込んでください…               | same                                                             |
| gyoseishoshi | eligibility                      | -                                   | 年齢、学歴、国籍等に関係なく、どなたでも受験できます。                | same                                                             |
| takken       | fee                              | -                                   | 8200                                                                  | same_text（今日の概要/スケジュール页均有「受験手数料 8,200円」） |
| takken       | eligibility                      | -                                   | 日本国内に居住する方であれば…                                         | same_text（今日の概要页原文命中）                                |
| takken       | payment_deadline_rule            | -/-/convenience_store               | 申込入力完了日から4日目又は令和8年8月1日（土）のうち、いずれか早い方… | **not_found**                                                    |
| takken       | payment_deadline_rule            | -/-/pay_easy                        | 同上                                                                  | **not_found**                                                    |
| it-passport  | application_change_deadline_rule | -                                   | 試験日の3日前まで変更可能                                             | **not_found**（语义未变，见 §3.1）                               |

### 3.1 三条需人工复核的实情

**takken `payment_deadline_rule` ×2（convenience_store / pay_easy）**

- 今日抓到的 8 页（概要/FAQ/スケジュール/郵送申込み/登録講習/統計/首页/注册页）全文搜「申込入力完了日」「4日目」「早い方」「払込期限」，均无命中；FAQ 只说明支付方式（クレカ・コンビニ・ペイジー），没有时限规则。
- 已批准值引用「令和8年8月1日」这类年度限定表述，来源页很可能在 2026 年度改版后被移除或移到了「試験案内 PDF」。**建议**：人工确认该规则 2026 年度是否仍适用；若已不适用，应停用这两条 fact 或改为取自最新試験案内。
- 注意：takken 的结构化抽取器本身不全（`collector.takken` 只有 `extract_schedule_candidates`，无 `extract_candidates`），fee/eligibility 只能靠原文命中，payment_deadline_rule 连原文都没有。

**it-passport `application_change_deadline_rule`**

- 来源 `source:it-passport:jitec-application`（`https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html`）。`it_passport.extract_candidates` 要求页面「explicitly declared fact fields」，今日 6 页全部返回 `structure_changed: no explicitly declared fact fields found`，故无法结构化比对。
- 人工核对：FAQ 页（`d8d6f4bb…html`）原文「受験日の3日前まででしたら、申込内容の変更（試験会場、受験日、試験開始時間）が可能です。」；已批准 display「試験日の3日前まで変更可能」是它的改写，normalized `"P3D_BEFORE_EXAM"` 语义一致。**内容未变**，但缺可机验抽取器。
- 建议：给 it-passport 的 FAQ 页补一个「3日前」规则抽取器，或把该 fact 的来源指向含结构化字段的页面。

## 4. 两处设计缺口（本轮最重要的发现）

### 缺口一：到期事实没有「复核无变化」的落账通道

- `ingest_bookkeeping.approved_value_keys()` / 各 ingest 的 `skipped_approved` 会跳过「与已批准值完全相同」的候选 → 内容未变时**不会产生任何候选**；
- `facts` 的 `verified_at` 只在新 revision 生成时写；`apps/admin` 只有 approve / reject / defer / requeue，没有「确认无变化」；
- 结果：日检的 `dueFacts` 28 天复 28 天，永远清不掉，运营会逐渐忽略这个指标。

**建议方案**（推荐 A）：

- A. 后台新增动作「复核无变化」：为 current revision 追加一条 `fact_revisions`（值相同、`verified_at = now()`、`verified_by = 运营`），并写审计。改动小，指标恢复可信。
- B. 给 `facts` 加 `last_verified_at` 列（不动 revision 链），日检改读该列。改动更小但丢「谁在何时基于哪个快照确认」的证据，不推荐。

### 缺口二：`sourcesBehindOnSnapshot` 把「快照新鲜度」与「内容是否变化」混算

- `patrol_record.py` 只对 **changed** 的来源写 `snapshots` 行；内容未变的来源不会产生新快照。
- 而 `scripts/staleness-lib.mjs` 的 `dueSources` 用的是 `snapshots.retrieved_at` → 稳定页面会永远「落后」，与「没抓到」无法区分。
- 今日 `dueSources` 4 条（`source:fp:jafp-2-3-outline`、`source:fp:jafp-schedule`、`source:fundamental-it:youkou-pdf`、`source:gyoseishoshi:guide`，`lastSnapshotAt 2026-11-11`，ageDays 13，窗口 7 天）正是这个原因；**下周一跑巡检也不会自动归零**。
- **建议**：`dueSources` 改为看 `source_checks.checked_at`（每次抓取都写），`snapshots` 只承担「内容版本」语义；或 `patrol_record` 对 unchanged 也写一条轻量 snapshot 指针。

## 5. 待拍板事项

1. **783 条历史候选**：`precheck_bookkeeping` 显示 `stored=863 / computed=870 / skipped_approved=87 / would_stage=783`，分布 candidate-data-class2 288、class3 288、class1 196、class23-net 6、class3-exam 5，全部 `risk_level=high`。预检脚本 docstring 明说「staging the history candidates turns the release gate hard-red」。**建议：不落库**；若确需补历史，应给 candidate-data 页加年份/状态过滤，而不是整页灌入。
2. **class3-exam 5 条增量**（exam_subjects / exam_time / passing_standard / question_count / result_date_rule）：唯一小增量，**建议单独落库并走批准**（需授权执行 ingest 与批准）。
3. **缺口一、缺口二**是否立项修复（建议都做，缺口一是运营可信度的根）。
4. **takken 2 条 payment_deadline_rule**：人工确认 2026 年度是否仍适用，决定保留/停用。

## 6. 附：本轮未落库

本轮**只做了采集与比对**，没有执行 `ingest_bookkeeping`、没有写 `candidate_facts`、没有批准任何 revision；生产的公开页面与 DB 业务数据均未改动。

## 7. 后续进展（2026-11-25 15:2x 已执行）

第 5 节四项待拍板已由所有者逐项决定并执行，详见 `docs/audit/REVERIFICATION_2026-11-25.md`：

1. 783 条历史候选：**不落库**（维持建议）。
2. class3-exam 5 条：已入库并全部批准（`facts` 1007→1012）。
3. 缺口一、缺口二：已实现（admin「确认无变化」动作 + `dueSources` 改看 `source_checks.checked_at`），并已把 24 条 `same` + 2 条 `same_text` 共 26 条复核落账。
4. takken 2 条 `payment_deadline_rule` + it-passport 1 条 `application_change_deadline_rule`：仍待人工确认，当前 `dueFacts` 只剩这 3 条。
