# ADR 0003：缺失归因语义——门禁档位与用户可见原因的映射不改门禁、只成文

- 状态：已接受（2026-11-25）
- 背景：2026-11-24 只读审计（`docs/audit/V2_GAP_MATRIX.md` G-12）指出：`coverageGaps = 0` 只证明「`required` + 已命中维度的 `conditional` 齐了」，不证明用户看到的「缺失原因」可理解。运行时 `services/api/src/public-view.ts` 的 6 个 `MissingReason` 里 `mapping_error` 是工程术语、`pending_review` 是流程术语；`not_applicable`／`stale_source` 只有类型声明与文案映射、**没有任何赋值路径**；`not_announced` 不计入 `blockingMissing`。这些语义此前没有任何成文出处。

## 决策

1. **不改门禁与运行时的跳过逻辑**。`scripts/verify-lib.mjs` 的 `evaluateCoverage` 与 `buildPublicQualificationView` 保持同口径（运行时是门禁的镜像）：`post_event`／`optional`／`not_applicable` 跳过、`conditional` 空 scoped 跳过。「不可见缺失」继续由文档（本 ADR＋`docs/data-gate-semantics.md` §12）与工作包 F 追踪，**不在公开页面上报**——页面报一个用户无法行动的「维度没采集」只会制造噪音。
2. **6 个用户可见文案固定**在 `apps/web/src/render.ts` 的 `missingReasonLabels`，工程／流程术语一律软化：`mapping_error` → 「表示処理を確認中」、`pending_review` → 「公式情報確認中」。新增归因必须同时给出日文用户文案，不得把内部术语直接上页面。
3. **`not_applicable`／`stale_source` 保留为预留值不删**。删除会让 `MissingReason` 联合类型与文案映射两处收缩，未来启用（如撤销链给出「対象外」解释、来源巡检检出过期给「情報の再確認中」）时又要反向扩；保留成本只是两个永不命中的分支。启用条件：先补赋值路径＋测试，再更新 §12 映射表。
4. **归因优先级固定**为 `pending_review` > `mapping_error` > `not_announced` > `not_collected`（`public-view.ts:167-173` 短路顺序），`announcedOnly` 是唯一不计入 `blockingMissing` 的分支。改优先级＝改页面状态徽章（`partially_announced` vs `verified`），属产品决策，必须先改本 ADR。

## 后果

- 正面：门禁绿灯与用户可见语义的关系有了单一权威出处；「哪些缺失永远不会出现在页面上」从隐性行为变成 §12 表格；预留值与在用值区分明确。
- 负面：`not_applicable`／`stale_source` 两个死分支留在代码里；§12 表与 `public-view.ts`／`missingReasonLabels` 三处需人工同步（无自动断言）。
- 验证：纯文档轮，不改代码；`web-render` 现有 missing reason 用例（`renders the safe field-level missing reason instead of a generic claim`）继续锁住文案。
