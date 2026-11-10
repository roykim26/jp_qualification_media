# 工作包 H 记录（已拍板并实施）：基本情報技術者 CBT 実施一時休止的事実化

状态：**已拍板并实施（2026-11-10，PR #58 / `abee98c`）**——决策见 §11，落地结果见 §12。以下 §1–§10 为撰写时的原文，保留不改。

撰写时的现取口径：main `1ec9957`；本机库＝`jpqm-pg18` 容器（PG 18.6，`127.0.0.1:55432`）恢复的 2026-10-23 dump；FE 已批准事实 10 条，pending 0（2026-11-09 批准 12 条后）。

## 1. 触发：cbt 页 2026-11-05 新增停考通知

来源 `source:fundamental-it:cbt`（`https://www.ipa.go.jp/shiken/mousikomi/cbt_sg_fe.html`），本轮采集快照 `7bf47930`…（2026-11-09，页面「最終更新日：2026年11月5日」）。原文：

> 情報セキュリティマネジメント試験（SG）、基本情報技術者試験（FE）は、CBT（Computer Based Testing）方式により実施しています。
>
> 注記 CBT方式は、試験会場に設置されたコンピュータを使用して実施する試験です。
>
> **システムリプレースのため、2026年12月28日から試験実施を一時休止することとしています。一時休止後の試験再開は、2027年1月下旬を予定しています。**
>
> 詳しくは次のページをご参照ください。…「CBT方式で実施するITパスポート試験、情報セキュリティマネジメント試験及び基本情報技術者試験における2027年1月以降の実施予定について」（リンク先 `/shiken/2026/cbt-202701-yotei.html`）

`exam` 页（`7e349607`…）**没有**「一時休止」句，只挂了同一条公告链接 ⇒ 停考句的唯一已登记载体是 cbt 页。

## 2. 现状读数（2026-11-09 现取）

- 库侧：`facts` 里 `fact_key like '%susp%'` **0 条**；`candidate_facts` 同样 **0 条**。FE 现行 10 条事实（`exam_method`、`exam_schedule`、`exam_subject_{a,b}_{time,format,question_count,answer_count}`）都不表达停考。
- 代码里已经有 `suspension_period` 这个键的三处约定（但从未产出过事实）：
  - `apps/web/src/render.ts:108` 标签「実施休止期間」，且 `annual` 区块的 `factKeyPrefixes` 与「結果発表・実施変更」分组都已包含它 ⇒ 事实一旦存在会进入年度别日程区。
  - `services/collector/src/collector/bookkeeping.py` 的 `FIELD_KEYS` 含 `suspension_period`（簿记适配器无对应抽取）。
  - `packages/schema/src/index.ts` 的 `highRiskFactKeys` 只有 `suspension`／`postponement`，**不含** `suspension_period`；风险可由 `risk_level='high'` 表达，不影响判级。
- `change_events.event_type` 是封闭枚举（8 值，最近一次扩值是 0019 加 `statistics_update`）。`suspension_period` 不匹配 `examContentFactKeyPrefixes`，`updateEventTypeForFact()` 会落到 `schedule_change`（「日程の変更」），**无需新枚举**。
- `packages/schema/src/updates.ts` 的 `updateFactLabelPrefixes` **没有** `suspension_period` ⇒ 若不补一行，`/updates/` 的 `factLabel` 会回落到裸键名 `suspension_period`。
- 契约 `config/data-coverage-contract.json` 的 FE 三条 requirement 不含该字段；且现有 10 条 `delivery_mode` 全为 NULL、三条 requirement 全被维度筛空跳过 ⇒ 新增一条事实**不会改变 6/6 与 `coverageGaps`**（也不会让它变成「字段齐备」）。
- CI 侧：`config/release-gate-baseline.json` 的 `expectedFacts` 现值 FE **10**；`fixtures/ci/approved-facts.sql` 与 `scripts/verify-ci-fixture.mjs` 的四条断言现值 **981／981／981／29**。事实数 +1 会同时触碰这两处。

## 3. 方案对比

| 方案                                 | 做法                                                                                     | 改动面                                                               | 收益                                                            | 风险／成本                                                     |
| ------------------------------------ | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------- |
| **A. 新增 `suspension_period` 事实** | 复用 cbt 页（已登记、同域），按两句原文产 1 条 high 事实                                 | 适配器＋pytest＋契约文档＋/updates/ 标签；批准后再动 baseline 与夹具 | 停考信息可被检索、可被 `/updates/` 与年度区展示；不改已批准事实 | 需改代码与夹具（后者另需授权）；事实价值口径要定（§5）         |
| B. 只记录不进库                      | 仅在本方案稿／stage-log 留原文                                                           | 仅文档                                                               | 零代码风险                                                      | 用户看不到停考；下轮仍会再次碰到                               |
| C. 另登记公告页来源                  | 把 `https://www.ipa.go.jp/shiken/2026/cbt-202701-yotei.html` 登记为第 5 个 FE 来源再采集 | 迁移（sources）＋常量表＋采集/契约/测试                              | 可拿到「2027 年 1 月以降」的精确恢复安排                        | 该页是三资格共用公告；来源越多，归属越难；本轮未抓、内容未验证 |

## 4. 推荐

**A 为主，C 留作后续可选**。理由：停考句已躺在**已登记来源**的已哈希快照里，不需要扩域名、不需要新来源即可事实化；`suspension_period` 在展示层已有标签与分组约定；且不改动已批准的 12 条（`year_round` 仍是官方原话，未失真）。

## 5. 字段口径（若批 A）

| 项                 | 建议值                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `fact_key`         | `suspension_period`                                                                                                                             |
| `value_type`       | `json`（枚举已有）                                                                                                                              |
| `normalized_value` | `{"startsOn":"2026-12-28","resumesFrom":"2027-01-late"}`（`late`＝下旬，原文只说「下旬」，**不折算成具体日**）                                  |
| `display_value`    | `2026年12月28日～2027年1月下旬（予定）実施休止`                                                                                                 |
| `evidence_text`    | 「システムリプレースのため、2026年12月28日から試験実施を一時休止することとしています。一時休止後の試験再開は、2027年1月下旬を予定しています。」 |
| `risk_level`       | `high`（受験計画に直結する日程类）                                                                                                              |
| `exam_year`        | `2026`（停考开始年度；是否需要 2027 年度条目见 §10-2）                                                                                          |
| 维度               | `provider_id`／`exam_level_id`／`exam_component`／`delivery_mode`／`payment_method`／`exam_session` 全 NULL（与现有 10 条一致）                 |
| 候选 id            | `candidate:fundamental-it:{snapshot_hash}:suspension_period`                                                                                    |
| 事件类型           | `schedule_change`（现有枚举；不新增）                                                                                                           |

## 6. 解析规则（若批 A）

- 只在 `source:fundamental-it:cbt` 上抽取；`exam` 页不产（该页无停考句）。
- 两句必须**同时**命中，否则 0 候选、不推断：
  - `(\d{4})年(\d{1,2})月(\d{1,2})日から試験実施を一時休止`
  - `試験再開は、?(\d{4})年(\d{1,2})月(上旬|中旬|下旬)`
  - 末尾必须含「予定」（原文「予定しています」），否则视为临时表述、不产。
- 句子被改写／结构变化 ⇒ 0 候选，保留原文到分析报告，**不改已批准事实**、不手写补值。
- 不因为公告是三资格共用就把事实挂到 IT Passport／SG；事实资格范围仍只 `qualification:fundamental-it-engineer`。

## 7. 实施步骤（批准后逐项进行，每项按仓库惯例再要授权）

1. `services/collector/src/collector/fundamental_it.py`：cbt 适配器加停考抽取（新增函数，不影响现有两句）。
2. `services/collector/tests/test_fundamental_it_contract.py`：新增 3 例——两句命中／缺停考句为零候选／日期变体（上旬・中旬）与「予定」缺失不产。
3. `packages/schema/src/updates.ts`：`updateFactLabelPrefixes` 增 `['suspension_period', '実施休止期間']`（否则 `/updates/` 显示裸键）。
4. 契约文档 `docs/fundamental-it-engineer-source-contract.md`：在「适配器产出规则」与「当前已批准事实」两节各补一行（实施停考）。
5. 采集（只 cbt 页）→ 入库（FE 单条）→ 审核批准（三次独立授权，照本轮流程）。
6. `config/release-gate-baseline.json` 的 FE `expectedFacts` 10 → 11；`fixtures/ci/approved-facts.sql` 重导（981 → 982）；`scripts/verify-ci-fixture.mjs` 四条断言同步。**这两项按交接单需单独授权，不在实施代码时顺手改。**
7. 公开页验证＋文档落账（stage-log／handoff）。

## 8. 验收判据（可复跑，只读）

- `pytest services/collector/tests -q`：新 3 例通过，既有用例不改红。
- 入库后 `candidate_facts` pending 1、`facts` FE 10 → 11、总 facts 981 → 982；批准后 reviews／change_events 各 +1。
- `npm run verify:all`：6/6 不变、`coverageGaps: []`（不可因此宣称 FE 字段齐备）。
- `/shikaku/fundamental-it-engineer/` 年度区出现「実施休止期間」条目，值为 §5 的 display。
- `/updates/` 该条的 `factLabel` 为「実施休止期間」、`eventLabel` 为「日程の変更」。
- baseline 与夹具更新后 `release-gate` 绿；`npm run ci:fixture:verify` 通过。

## 9. 不做的事

- 不改 `year_round` 与已批准的 12 条事实。
- 不登记、不抓 `2026/cbt-202701-yotei.html`（除非选 C）。
- 不给 IT Passport／SG 建停考事实。
- 不为覆盖率补 `delivery_mode`（判级改动，需另行拍板）。
- 不把停考写进 ICS 日历（`packages/schema/src/calendar.ts` 只用 `exam_date`／`exam_schedule`）。

## 10. 待拍板

1. **是否新增事实**：A（新增 `suspension_period`）／B（仅文档）／A+C（同时登记公告页拿精确恢复日）。
2. **`exam_year` 归属**：`2026`（停考开始）／`2027`（恢复年度）／两条都建（年度页各能看到）。
3. **`risk_level`**：`high`（建议）还是 `medium`；事件按 `schedule_change` 是否可接受（不接受则要动枚举，成本更高）。
4. **是否同步维护公开层标签**：`/updates/` 加「実施休止期間」一行（建议加）——不加就只有年度区显示、`/updates/` 显示裸键。

## 11. 拍板结果（2026-11-10）

| 问题                | 拍板                            | 落地要点                                                                     |
| ------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| 是否新增            | **A**：新增 `suspension_period` | 源用已登记 `source:fundamental-it:cbt`，**不登记**公告页（C 不做），不扩域名 |
| `exam_year`         | **2026**                        | 单条；`normalized_value` 内保留 `resumesFrom: "2027-01-late"`                |
| `risk_level` / 事件 | **high** / `schedule_change`    | 不新增枚举                                                                   |
| 公开层标签          | **补**                          | `packages/schema/src/updates.ts` 加 `['suspension_period', '実施休止期間']`  |

实施顺序与授权边界不变：先改适配器＋pytest＋标签＋契约文档 → 跑测试 → 采集（cbt）→ 入库（1 条）→ 审核批准；`release-gate-baseline.json` 与 CI 夹具（981→982）在批准后**单独授权**再动。该顺序已于 2026-11-10 全部执行完毕，见 §12。

## 12. 实施结果（2026-11-10）

- **适配器**：`services/collector/src/collector/fundamental_it.py` 新增 `_extract_suspension_period()`，仅在「停考句＋含『予定』的恢复句」同时存在时产出；`下旬` 保留为 `late`，不折算具体日。
- **测试**：`services/collector/tests/test_fundamental_it_contract.py` 新增 3 个契约测试（计划内停考、下旬不折算、缺句或缺「予定」不产），pytest 11 passed。
- **展示层**：`packages/schema/src/updates.ts` 加 `['suspension_period', '実施休止期間']`；契约文档补产出规则与事实表（10 → 11 行），并更正快照来源与采集时间。
- **入库与批准**：候选 `candidate:fundamental-it:7bf47930…:suspension_period` 入库 1 条并批准。`facts` 981 → **982**、FE 10 → **11**、`reviews`／`change_events` 993 → **994**，事件类型 `schedule_change`；事实来源绑定 cbt 快照 `7bf47930`。
- **门禁与 CI 夹具**：baseline FE `expectedFacts` 10 → 11；`fixtures/ci/approved-facts.sql` 重导为 **982 facts / 29 snapshots**；`scripts/verify-ci-fixture.mjs` 与 `scripts/docker-smoke.mjs` 的计数断言同步 982（后者是首轮 CI 红后补修的）。
- **合并**：PR #58 squash 合并点 `abee98c`；`release-gate` 与 `docker-smoke` 在 PR head 与 main push 均 success。
- **未做**：C（公告页 `2026/cbt-202701-yotei.html` 未登记、未抓取）、`delivery_mode` 未补、ICS 日历未改。
