# `audit:mvp` 22 条覆盖缺口的成因分析（2026-11-25）

## 0. Git 基线

| 项              | 值                                  |
| --------------- | ----------------------------------- |
| 分支            | `chore/phase1-baseline`             |
| 执行前 HEAD     | `6e94546`                           |
| 本轮内容 commit | `<CONTENT_SHA>`（第二段回填这一行） |
| 生产运行版本    | `9d793c9`（本轮纯文档，不涉及部署） |

本轮**不改任何代码、不改任何数据、不改契约**。产出只有这份报告。

两段式提交的理由：报告 §2 的成因结论全部来自本地库实测，而第一段提交时还不知道自己会被记成哪个 hash，所以先用占位符提交正文，第二段把占位符换成真实 hash。这样 `git log` 里永远能对上是哪一次提交写了这份报告。

## 1. 执行摘要

`pnpm audit:mvp`（`scripts/audit-mvp.mjs`）在本地库上报告 **22 条覆盖缺口**，`provenance.status=passed`、`totalFacts=1007`、`unverifiedFacts=0`。也就是说：**溯源链是干净的，缺的是覆盖字段本身。**

本轮把 22 条逐条拆开，结论是它们**不是同一种问题**：

| 类别                    | 条数 | 成因                                                                                                                                                                                                                             | 能否靠改数据修                     |
| ----------------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| A. 维度标签缺失         | 10   | `it-passport` 的 10 条 approved fact 的 `delivery_mode` 全是 `null`，而契约要求 `deliveryMode=cbt`；`matchesDimensions` 用 `===` 严格比较，`null !== 'cbt'` 直接筛空                                                             | 能，补 10 条 `delivery_mode` 标签  |
| B. 事实确实不存在       | 10   | `it-passport` 缺 `application_rule`/`booking_window`/`venue_rule`/`scoring_method`；`bookkeeping` 缺 `question_count`×2/`result_date`/`exam_subjects`/`exam_time`/`passing_standard`；`fp` 缺 `question_count`/`question_format` | 不能，要新建事实并走审核链         |
| C. 子维度有、父维度没有 | 2    | `fp` 的 `kinzai fp:1 academic` 本身没有 `question_count`/`question_format`，但它的子组件 `academic:basic` 与 `academic:applied` 各有一条                                                                                         | 能，但要先判定父维度该不该有独立值 |

**关键判断：这 22 条不是回归，也不是本轮引入的。** 它们反映的是「契约要求的字段」与「已批准事实覆盖的字段」之间的真实差额，而这个差额此前没有被逐条解释过——`coverageGaps=0` 那句「覆盖缺口 0」说的是 `verify:all` 的另一套判据（`scripts/verify-lib.mjs`），与 `audit:mvp` 不是同一个口径。

## 2. 22 条缺口的完整清单

本地库：`postgresql://postgres@127.0.0.1:55432/qualification_media`，`examYear=2026`。

### 2.1 `it-passport`（14 条，全部 `dimensions={"deliveryMode":"cbt"}`）

| #   | field                  | reason                      |
| --- | ---------------------- | --------------------------- |
| 1   | `exam_method`          | missing approved fact       |
| 2   | `application_rule`     | missing approved fact       |
| 3   | `booking_window`       | missing approved fact       |
| 4   | `venue_rule`           | missing approved fact       |
| 5   | `eligibility`          | missing approved fact       |
| 6   | `fee`                  | missing approved fact       |
| 7   | `exam_subjects`        | missing approved fact       |
| 8   | `exam_time`            | missing approved fact       |
| 9   | `question_count`       | missing approved fact       |
| 10  | `question_format`      | missing approved fact       |
| 11  | `scoring_method`       | missing approved fact       |
| 12  | `passing_standard`     | missing approved fact       |
| 13  | `source_url`           | missing approved provenance |
| 14  | `official_verified_at` | missing approved provenance |

### 2.2 `bookkeeping`（6 条）

| #   | dimensions                                                 | field              |
| --- | ---------------------------------------------------------- | ------------------ |
| 15  | `{"examLevelId":"bookkeeping:1","deliveryMode":"unified"}` | `question_count`   |
| 16  | `{"examLevelId":"bookkeeping:3","deliveryMode":"unified"}` | `result_date`      |
| 17  | `{"examLevelId":"bookkeeping:3","deliveryMode":"unified"}` | `exam_subjects`    |
| 18  | `{"examLevelId":"bookkeeping:3","deliveryMode":"unified"}` | `exam_time`        |
| 19  | `{"examLevelId":"bookkeeping:3","deliveryMode":"unified"}` | `question_count`   |
| 20  | `{"examLevelId":"bookkeeping:3","deliveryMode":"unified"}` | `passing_standard` |

### 2.3 `fp`（2 条）

| #   | dimensions                                                                                     | field             |
| --- | ---------------------------------------------------------------------------------------------- | ----------------- |
| 21  | `{"providerId":"kinzai","examLevelId":"fp:1","examComponent":"academic","deliveryMode":"pbt"}` | `question_count`  |
| 22  | `{"providerId":"kinzai","examLevelId":"fp:1","examComponent":"academic","deliveryMode":"pbt"}` | `question_format` |

## 3. 类别 A：维度标签缺失（10 条）

### 3.1 机制

`scripts/mvp-coverage.mjs:48-52`：

```js
function matchesDimensions(fact, dimensions) {
  return Object.entries(dimensions).every(
    ([key, value]) => fact[key] === value,
  );
}
```

`fact.deliveryMode` 来自 `candidate_facts.delivery_mode`。`it-passport` 的 10 条 approved fact 该列全是 `NULL`：

```text
synthetic=false  n=10  with_dm=0  with_provider=0  with_level=0  with_component=0
```

而契约（`config/data-coverage-contract.json`）对 `it-passport` 的三条 requirement **全部**带 `dimensions: {"deliveryMode": "cbt"}`。于是 `evaluateMvpCoverage()` 在 `:96-101` 的 `facts.filter(...)` 得到**空数组**，`:102-114` 的每个 field 都判成缺失。

### 3.2 数据里其实有内容

`it-passport` 2026 年的 10 条 approved fact：

```text
application_change_deadline_rule, application_open_2026_may_sessions,
eligibility, exam_method, exam_subjects, exam_time, fee,
passing_standard, question_count, question_format
```

对照契约第一条 requirement 的 14 个字段，**10 个字段的数据是存在的**（`exam_method`/`eligibility`/`fee`/`exam_subjects`/`exam_time`/`question_count`/`question_format`/`passing_standard` 直接同名命中，`source_url`/`official_verified_at` 走 `matchesField` 的 provenance 分支）。它们只是**没有打上 `delivery_mode='cbt'` 这个标签**，所以在维度过滤那一步就被筛掉了。

### 3.3 为什么标签是空的

`services/collector/src/collector/ingest_it_passport.py:64-66` 与 `ingest_it_passport_analysis.py:139-145` 的 `INSERT INTO candidate_facts` **都没有写 `provider_id`/`exam_level_id`/`exam_component`/`delivery_mode`** 这四列。`fixtures/ci/approved-facts.sql:1174` 里的 it-passport 行同样是五个 `NULL`：

```sql
INSERT INTO candidate_facts (id,qualification_id,provider_id,exam_level_id,exam_component,delivery_mode,payment_method,...)
VALUES ('candidate:it-passport:30b9a8bc...:application_change_deadline_rule','qualification:it-passport',
        NULL,NULL,NULL,NULL,NULL,2026,...);
```

`ITPassportFactCandidate`（`it_passport.py:66-76`）这个 dataclass 里**根本没有维度字段**——`fact_key`/`normalized_value`/`display_value`/`source_id`/`source_snapshot_id`/`risk_level`/`status`/`synthetic`/`evidence_text`/`value_type`，就这些。所以这不是「某次写入忘了填」，而是**it-passport 这条采集链路从一开始就不产出维度**。

### 3.4 这不是「null 就是坏」

`delivery_mode` 为 `NULL` 的资格有三个：

| 资格           | approved facts | 是否被契约要求 `deliveryMode` 维度        | 是否产生 `audit:mvp` 缺口 |
| -------------- | -------------- | ----------------------------------------- | ------------------------- |
| `gyoseishoshi` | 15             | 否                                        | 否                        |
| `takken`       | 16             | 否                                        | 否                        |
| `it-passport`  | 10             | **是**（三条 requirement 全部要求 `cbt`） | **是，14 条**             |

`gyoseishoshi` 与 `takken` 的 `NULL` 完全无害——它们的契约 requirement 不带 `deliveryMode` 维度，`matchesDimensions` 遇到空 dimensions 时 `every()` 对空数组返回 `true`，等于不过滤。`docs/fundamental-it-engineer-source-contract.md:132` 也记着同样的道理：FE 的 `deliveryMode=null` 时 `gaps = 0`。

**所以问题的准确表述是：「契约要求某个维度、数据却没打这个标签」才是缺陷；`null` 本身不是。**

## 4. 反事实实验

为了把「标签缺失」与「事实真缺」分开，做了两组反事实（脚本在 `var/`，跑完即弃）：

| 实验                                                                                                | 缺口总数 | `it-passport` | `bookkeeping` | `fp` |
| --------------------------------------------------------------------------------------------------- | -------- | ------------- | ------------- | ---- |
| 基线                                                                                                | **22**   | 14            | 6             | 2    |
| ① 给 `it-passport` 的 10 条 fact 补 `deliveryMode='cbt'`                                            | **12**   | 4             | 6             | 2    |
| ② 在 ① 之上，把 `fp:1 academic:basic`/`academic:applied` 的 `question_*` 也当作父组件 `academic` 的 | **10**   | 4             | 6             | 0    |

实验 ② 的那 2 条是**假设性**的：它证明 `fp` 的 2 条缺口纯粹是「父维度没有独立事实、只有子维度有」，但**是否应该让父维度继承子维度的值，是一个业务判断，不是数据缺陷**——`academic` 与 `academic:basic`/`academic:applied` 在契约里是不同的 `examComponent` 取值，把一个组件的题数当成另一个组件的题数是错误的数据。所以实验 ② **只能用来解释成因，不能作为修复方案**。

实验 ① 剩下的 4 条（`application_rule`/`booking_window`/`venue_rule`/`scoring_method`）是 `it-passport` 真的没有对应事实：现有 10 条里最接近的是 `application_change_deadline_rule`（「受験申込内容の変更は試験日の3日前まで」），它讲的是**变更**规则，不是**通用报名**规则，`matchesField` 的 `startsWith('application_rule')` 也不匹配。

## 5. 为什么「覆盖缺口 0」与「22 条缺口」能同时成立

这两个数字来自两套不同的判据，此前没有被并排解释过：

| 判据                          | 脚本                              | 语义                                                                                       | 当前读数               |
| ----------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------ | ---------------------- |
| `coverageGaps`                | `scripts/verify-lib.mjs:103-112`  | 发布门禁：按契约逐字段判，缺则 `partially_announced`                                       | **0**（六资格全 `[]`） |
| `audit:mvp` 的 `coverageGaps` | `scripts/mvp-coverage.mjs:80-118` | MVP 上线的覆盖评估：**同一套契约**，但额外受 `limitedLaunchScopes` 与 `examYear=2026` 约束 | **22**                 |

两者都用 `config/data-coverage-contract.json`，差别在于：

1. `verify-lib.mjs` 的 `coverageYear` 取的是库里的参考年，`audit-mvp` 显式传 `2026`；
2. `audit-mvp` 对 `bookkeeping`/`fp` 额外套了 `limitedLaunchScopes`（只算 5 个 bookkeeping 范围、7 个 fp 范围），`verify-lib` 不套；
3. 两者的 `matchesField` 实现是**两份独立代码**（`verify-lib.mjs:46-68` 与 `mvp-coverage.mjs:54-78`），语义相近但不是同一份。

`docs/runbook.md:39` 已经写明了这层区分：「`coverageGaps=0` 也不代表字段齐备（`conditional` 档在维度未命中时整条跳过、`post_event` 档永不参与）」。**本轮 22 条缺口正是这句话的具体实例**——`it-passport` 的 14 条全部落在 `conditional` 档，而该档的 `dimensions` 没命中，于是整条被跳过。

## 6. 建议

按「代价 / 收益」排序，**本轮不执行任何一条**，只作为建议提出：

### 6.1 P2 — 补 `it-passport` 的 `delivery_mode` 标签（清 10 条）

- **做什么**：给 `it-passport` 的 10 条 approved fact 补 `delivery_mode='cbt'`。
- **为什么是 10 条而不是 14 条**：补标签后 `it-passport` 的缺口从 14 降到 4，`source_url` 与 `official_verified_at` 两条 provenance 缺口也一并消失（它们的 `matchesField` 分支本来就满足，只是被维度过滤挡掉了）。
- **怎么做才算合规**：`delivery_mode` 是 `candidate_facts` 的列，迁移里没有它，所以**不能直接 UPDATE 生产库**。正确路径是新建候选 → 审核批准，或者由 Owner 明确授权一次数据修复脚本。
- **风险**：IT Passport 确实是 CBT（官方原文「CBT方式により随時実施」已在 `exam_method` 事实里），所以标签值本身没有歧义；风险在于「给历史事实补标签」这个动作会改变 `facts` 表的身份键（`packages/db/migrations/0017_exam_session_dimension.sql` 的九列索引含 `delivery_mode`），可能触发唯一约束冲突或产生重复事实。**必须先在本地库试跑并比对行数。**

### 6.2 P3 — `fp` 的父组件 `academic` 该不该有独立题数（清 2 条）

- 现状：`kinzai fp:1 academic` 有 10 条事实，但 `question_count`/`question_format` 只存在于 `academic:basic` 与 `academic:applied` 两个子组件。
- 这是一个**业务语义问题**：`academic`（学科）在 FP 1 级里是否作为一个整体有独立的题数与题型？如果「学科」的题数就是基础编 + 应用编之和，那么契约要求 `academic` 有独立 `question_count` 本身就是错的；如果不是，那就是数据缺失。
- **建议先问 Owner 或查官方原文，再决定是改契约还是补数据。** 不要为了消掉 2 条缺口而造一条「题数 = 30 + 30」的合成事实。

### 6.3 P3 — `it-passport` 缺的 4 个字段属于内容建设

`application_rule`/`booking_window`/`venue_rule`/`scoring_method` 这 4 个字段要么去官方站找（`https://www3.jitec.ipa.go.jp/...` 的受験案内），要么承认它们对 IT Passport 不适用并改契约。这属于**新内容建设**，超出本轮范围。

### 6.4 P3 — `bookkeeping` 的 6 条

`bookkeeping:1` 缺 `question_count`（该级别 18 条事实里确实没有）、`bookkeeping:3` 缺 `result_date`/`exam_subjects`/`exam_time`/`question_count`/`passing_standard`（该级别 19 条事实里都没有）。这些是**簿記三级（日商簿記 3 級）与一级的官方页面没提供这些字段**，还是采集漏了，需要逐条对官方页面核对。同样属于内容建设。

### 6.5 P4 — 让 `audit:mvp` 自己解释缺口

现在 `audit-mvp` 只输出「缺了哪个 field」，不输出「这个 field 有没有数据、只是维度不匹配」。建议在输出里区分：

```text
missing approved fact          —— 该维度下没有任何 fact
missing approved fact (dimension mismatch)  —— 该资格该 factKey 存在，但维度标签对不上
```

这样下次看到 22 条时，不需要再做一轮反事实实验才能知道哪 10 条是标签问题。

## 7. 未处理

1. **未执行任何修复**：补标签、补数据、改契约三条路都没走，因为都涉及数据变更或契约变更，需要 Owner 授权。
2. **未在 CI 上加门禁**：`audit:mvp` 现在只在有库时跑，CI 的 `release-gate` 不跑它（`package.json` 的 `release:check` 里没有 `audit:mvp`）。是否要把它接进门禁，取决于 Owner 认为 22 条缺口是「必须清零」还是「可接受的现状」。
3. **未核对官方原文**：`fp` 的 `academic` 该不该有独立题数、`bookkeeping` 的 6 条是真缺还是采集漏，都需要对官方页面逐条核对，本轮只做了库内分析。
4. **`gyoseishoshi`/`takken` 的 `delivery_mode` 全 `NULL`** 未深究——它们当前不产生缺口，但如果将来契约给它们加 `deliveryMode` 维度，会立刻复制 `it-passport` 的问题。

## 8. 风险

| 风险                                                     | 影响                                                           | 缓解                                                  |
| -------------------------------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------- |
| 有人看到「22 条缺口」就批量 UPDATE `delivery_mode`       | 改变 `facts` 九列身份键，可能触发唯一约束冲突或产生重复事实    | 本报告 §6.1 写明必须走候选→审核链或先本地试跑比对行数 |
| 有人把 `fp` 的父组件缺口当成「继承子组件值」来修         | 用 `academic:basic` 的题数冒充 `academic` 的题数，制造错误数据 | §6.2 明确标注实验 ② 只是解释成因，不是修复方案        |
| `audit:mvp` 与 `verify:all` 的 `coverageGaps` 被混为一谈 | 误以为「覆盖缺口 0」就等于字段齐备                             | §5 用表格并排说明两套判据的差别                       |
| 补标签后 `it-passport` 仍有 4 条缺口                     | 有人以为「补了标签就该清零」，从而怀疑修复没生效               | §4 反事实表明确写了 22→12，剩余 4 条是真缺数据        |

## 9. 下一步建议

1. **P2** — 由 Owner 决定 `it-passport` 的 `delivery_mode` 标签是否补、怎么补（§6.1）。这是唯一一条「改完能立刻清掉 10 条」的路径。
2. **P3** — 核对 `fp:1 academic` 的官方题数口径（§6.2），决定是改契约还是补数据。
3. **P3** — `it-passport` 的 4 个字段与 `bookkeeping` 的 6 个字段按内容建设流程排期（§6.3/§6.4）。
4. **P4** — 给 `audit-mvp` 的输出区分「真缺」与「维度不匹配」（§6.5），这是一次纯代码改动，可以独立成轮。
5. 生产侧仍有 **P1 未决**：`coverageGap` 恒为 `not_run`（`var/patrol/registry.json` 不存在），两条修复路径的取舍见 `docs/audit/COVERAGE_GAP_CAPTURE_ONLY_2026-11-25.md` §8。

## 10. 停止声明

本轮只做分析，**没有修改任何代码、数据或契约**，没有部署，没有进入任何后续 Sprint。上面 §6 的建议与 §9 的优先级都需要 Owner 拍板后才执行。
