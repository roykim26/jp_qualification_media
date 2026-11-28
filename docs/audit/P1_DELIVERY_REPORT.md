# P1 交付报告（P0/P1 本轮收尾）

- 报告日期：2026-11-28
- 代码状态：`3317c96`（已推送 `origin/main`）
- 生产状态：**已部署**（2026-11-28，生产 SHA `3317c96`）

## 1. 完成情况

| 阶段           | 状态   | 说明                                                              |
| -------------- | ------ | ----------------------------------------------------------------- |
| P0-01～P0-04   | 已完成 | 已随 P0 发布到生产                                                |
| P1-01～P1-07   | 已完成 | 更新日志、时间标签、比较器 scope、质量评分、gap 复核、文档、CSP   |
| 数据缺口第一批 | 已完成 | it-passport 维度回填 10 键；application_rule／scoring_method 2 键 |
| 数据缺口第二批 | 已完成 | booking_window／venue_rule 2 键；fp 契约拆分 2 键                 |
| P2 / Sprint D  | 未开始 | 扩资格、决策型比较器等，等本轮部署后再启动                        |

## 2. 修改文件

### Migration

- `packages/db/migrations/0033_it_passport_cbt_dimensions_backfill.sql`
  - 把 it-passport 已批准事实的 `delivery_mode` 回填为 `cbt`，幂等。
- `packages/db/migrations/0034_it_passport_youkou_pdf_source.sql`
  - 登记 `source:it-passport:youkou-pdf`（同一官方 `試験要綱 Ver.5.6` PDF，按资格独立溯源）。

### 数据与门禁

- `config/data-coverage-contract.json`
  - fp:1 PBT 的 `question_count`／`question_format` 拆到 `academic:basic`／`academic:applied`。
- `scripts/mvp-coverage.mjs`
  - `limitedLaunchScopes` 增加两个已公开子维度。
- `scripts/verify-lib.mjs`
  - 硬门禁按字段尊重 `only_when_officially_published`：无事实的字段不报缺口；有事实时仍检查。
- `config/release-gate-baseline.json`
  - `it-passport.expectedFacts`：9 → 13。
- `fixtures/ci/approved-facts.sql`
  - 1811 → 1815 facts；47 snapshots；it-passport 全部 `delivery_mode=cbt`。
- `scripts/docker-smoke.mjs`、`scripts/verify-ci-fixture.mjs`
  - 计数同步为 1815／47。

### 采集器

- `services/collector/src/collector/it_passport.py`
  - 新增 `application_rule`、`booking_window`、`venue_rule` 官方原文提取。
- `services/collector/src/collector/youkou_pdf.py`
  - 支持按资格解析 `試験要綱` PDF 的 IRT 条款。
- `services/collector/src/collector/capture_it_passport.py`
  - 支持 PDF 后缀与按 `source_id` 定向抓取。
- `services/collector/src/collector/analyze_it_passport_snapshots.py`
  - 按快照后缀分派 HTML／PDF 解析。
- `services/collector/src/collector/ingest_it_passport_analysis.py`
  - 新候选写入 `delivery_mode=cbt`；快照冲突时使用数据库实际 id。

### 测试

- `scripts/mvp-coverage.test.mjs`、`scripts/verify-lib.test.mjs`
- `services/collector/tests/test_it_passport_contract.py`
- `services/collector/tests/test_it_passport_analysis_ingest.py`

### 文档

- `docs/audit/MVP_GAP_BASELINE_STATUS.md`
- `docs/it-passport-source-contract.md`
- `docs/fp-source-contract.md`
- `docs/data-gate-semantics.md`

## 3. 验证结果（2026-11-28）

| 命令                          | 结果                                                              |
| ----------------------------- | ----------------------------------------------------------------- |
| `npm run lint`                | 通过                                                              |
| `npm run format:check`        | 仅 4 个未跟踪任务文档失败；已跟踪文档单独 `prettier --check` 通过 |
| `npm run typecheck`           | 通过                                                              |
| `npm run build`               | 通过                                                              |
| `npm test`                    | 583 / 583 通过                                                    |
| `npm run test:python`         | 246 / 246 通过                                                    |
| `npm run test:verify-gate`    | 130 / 130 通过                                                    |
| `npm run hygiene:check`       | 通过                                                              |
| `verify:all`（CI 夹具库）     | 6 / 6 通过                                                        |
| `db:verify-staleness`（同上） | 0 problems                                                        |
| `audit:mvp`（同上）           | `warning`，33 known，**0 new**                                    |

> `format:check` 的 4 个失败文件位于未跟踪的 `docs/第二轮审计及迭代开发任务/`，本轮未修改、未提交；CI 中不存在这些文件。

## 4. known gaps 变化

| 范围                   | 本轮前 | 部署后实测 | 说明                                                       |
| ---------------------- | ------ | ---------- | ---------------------------------------------------------- |
| 生产审计（1815 facts） | 19     | 3          | 剩余 bookkeeping:1 question_count、takken 2 条（到期下架） |
| CI 夹具（1815 facts）  | 47 键  | 33 键      | it-passport 14 键、fp 2 键闭合                             |
| 本机 dev（1041 facts） | 22     | 6          | 1 已知 + 5 个 bookkeeping:3 夹具漂移（不加入 baseline）    |

本轮闭合的 16 键全部有官方原文或已批准事实支持；没有为通过门禁删除基线、放宽 requiredLevel 或写入推导值。

## 5. 生产部署影响

- 需要执行 migration `0033`、`0034`；两者幂等。
- 部署后 it-passport 公开页字段增至 13 条事实，API 状态仍按严格口径评估。
- fp 的比较/覆盖按 `academic:basic`／`academic:applied` 子维度展示，不显示合并的 55 题。
- 已执行：`git pull --ff-only` → 构建 api／admin／web → `migrate`（Applied 0033、0034）→ 同步 4 条已批准事实与快照 → `up -d` → `caddy reload`。
- `smoke:docker` 本轮未执行。

### 部署后验证（2026-11-28 实测）

- 容器：db／api／admin／web 均 healthy，Caddy 已 reload。
- 生产审计：1815 approved facts、3 known gaps、**0 new**、`dimensionMismatch=0`、`unverified=0`、quality 78.9。
- IT Passport：13 条事实全部 `delivery_mode=cbt`，含 application_rule／scoring_method／booking_window／venue_rule。
- 公开站：`/` 200 且带 `Content-Security-Policy-Report-Only`；`/shikaku/it-passport/` 200 且显示新补采原文；`/updates/` 200；`/admin/` 401；`/sitemap.xml` 200。

## 6. 回滚

- 应用层：回退到 `5e709df` 或上一发布 SHA。
- 数据层：`0033` 回填与 `0034` 来源登记均为附加/幂等变更；如需完全回滚，需另写脚本删除 4 条新 it-passport 事实（application_rule、scoring_method、booking_window、venue_rule）并把 `delivery_mode` 回置 `NULL`。回滚会使对应的 14 个审计缺口重新出现。

## 7. 未解决事项

1. `bookkeeping:1 question_count`：官方 1 级页面未公开问题数，保留为已知缺口。
2. takken `payment_deadline` 2 条：2026-11-26 所有者决定「到期下架」，保留。
3. 本机 5 个 bookkeeping:3 漂移：夹具裁剪造成，未写入 baseline。
4. `release:check` 的 `format:check` 受未跟踪任务文档影响；CI 不受影响。
5. `smoke:docker` 本轮未执行；生产部署与公开站抽查已完成。
