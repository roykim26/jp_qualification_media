# 到期事实人工复核清单（2026-11-25）

- 数据来源：`pnpm data:staleness`（`scripts/check-staleness.mjs`，只读，本地开发库 `jpqm-pg18`）。
- 读数：approvedFacts **1030**、historicalSkipped **789**、checked **241**、**dueFacts 29**、sourcesBehindOnSnapshot **0**。
- 特征：29 条的 `verifiedAt` 全部为 **2026-01-01**（同一批快照，ageDays=328），可按资格批量复核，无需逐条处理。
- 注意：本地库含另一窗口的在途数据（1030 ≠ CI 基线 1007），本清单以运行时读数为准备；上线前应在生产库重跑一次 `data:staleness` 对齐条数。

## 分组汇总

| 资格         | 原因档                                             | 条数 | 复核入口（官方）                                                   |
| ------------ | -------------------------------------------------- | ---- | ------------------------------------------------------------------ |
| bookkeeping  | fee（含 payment_deadline_rule）                    | 10   | 日本商工会議所 試験案内 https://www.kentei.ne.jp/                  |
| fp           | fee                                                | 4    | 日本FP協会 https://www.jafp.or.jp/exam/                            |
| fp           | eligibility                                        | 4    | 日本FP協会 同上                                                    |
| bookkeeping  | eligibility                                        | 3    | https://www.kentei.ne.jp/                                          |
| takken       | fee（含 payment_deadline_rule）                    | 3    | RETIO https://www.retio.or.jp/exam/                                |
| gyoseishoshi | fee（含 payment_deadline_rule）                    | 2    | 法務省 行政書士試験 https://www.moj.go.jp/MINJI/minji05_00375.html |
| takken       | eligibility                                        | 1    | RETIO 同上                                                         |
| it-passport  | eligibility 档（application_change_deadline_rule） | 1    | IPA https://www.ipa.go.jp/shiken/                                  |
| gyoseishoshi | eligibility                                        | 1    | 法務省 同上                                                        |

## 明细（29 条）

复核动作统一为：打开官方 2026 年度（或最新）要纲 → 比对 displayValue → 若官方已更新则走 admin 流程重新确认（刷新 officialVerifiedAt），若未变则记录「已复核、官方未更新」。

### bookkeeping（13 条）

| factKey               | 维度                                      | 复核要点                                    |
| --------------------- | ----------------------------------------- | ------------------------------------------- |
| payment_deadline_rule | 1/2/3級 × unified                         | 支払期限目安（試験日2カ月前）表述是否仍有效 |
| fee                   | 2/3/basic/cost-accounting-basic × network | ネット試験 受験料                           |
| fee                   | 1/2/3級 × unified                         | 統一試験 受験料                             |
| eligibility           | 1/2/3級 × unified                         | 受験資格（無制限等）表述                    |

### fp（8 条，均 jafp × cbt）

| factKey     | 维度                                                         | 复核要点                                 |
| ----------- | ------------------------------------------------------------ | ---------------------------------------- |
| fee         | 2級 academic / 2級 実技（資産設計）/ 3級 academic / 3級 実技 | 2026 年度受験料                          |
| eligibility | 同上 4 组                                                    | 2級学科・実技の受験資格（3級合格要件等） |

### takken（4 条）

| factKey               | 维度                         | 复核要点                          |
| --------------------- | ---------------------------- | --------------------------------- |
| payment_deadline_rule | convenience_store / pay_easy | 支払期限                          |
| fee                   | —                            | 受験手数料 7,400円 是否仍为官方值 |
| eligibility           | —                            | 受験資格（業務実績5年等）表述     |

### gyoseishoshi（3 条）

| factKey               | 维度 | 复核要点                   |
| --------------------- | ---- | -------------------------- |
| fee                   | —    | 手数料 14,200円            |
| payment_deadline_rule | —    | 支払期限ルール             |
| eligibility           | —    | 受験資格（第5号～第8号等） |

### it-passport（1 条）

| factKey                          | 维度 | 复核要点                               |
| -------------------------------- | ---- | -------------------------------------- |
| application_change_deadline_rule | —    | 申込情報変更期限ルール（IPA 年度要綱） |

## 结论与建议

1. **无紧急项**：29 条全部来自 2026-01-01 同一批确认，且 `sourcesBehindOnSnapshot=0`（快照未变化）→ 大概率官方未更新，属于「窗口到期例行复核」而非「数据过期」。
2. 建议按上表每资格一次会话完成复核（共 5 次），复核后在 admin 侧刷新确认日期，staleness 窗口即重置。
3. 本清单为只读产出；任何事实写库操作需另行执行。
