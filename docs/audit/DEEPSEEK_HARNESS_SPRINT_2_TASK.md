# ShikakuCheck — DeepSeek Harness Sprint 2 Task

> 项目：ShikakuCheck
> 网站：https://shikakucheck.com/
> 执行环境：DeepSeek Harness
> 阶段：Phase 1 / Sprint 2
> 原则：先验证架构，再做最小改动；所有决策已由项目负责人确认
>
> **本任务完成后必须停止，不得自行进入 Sprint 3。**

---

## 0. 本 Sprint 已确认的决策

以下决策已经确认，Harness 不需要再次询问：

1. `/pass-rate/` 空表：**保持可索引**
2. 无筛选 `/schedule/` 空态：**保持现状，不做 noindex / 404**
3. `/2025/`、`/2027/`、`/2030/` 等年度空壳页：**保留 200 + noindex**
4. 单年合格率、无历史趋势的 Pass Rate 薄页：**暂时保留在 sitemap**
5. API / 上游数据失败：**目标方向为 503，但必须先检查实际架构与现有错误处理；不得未经检查直接修改**
6. 数据优先级：**先完成 FE 202610 月度刷新，再处理宅建统计入库**

这些决策来源于 Phase 0 审计中的用户决策项；本 Sprint 以已确认结果为准。

---

# 1. Sprint 2 目标

本 Sprint 不做全站改版。

本轮重点只有两个方向：

### Sprint 2A — FE 202610 月度数据刷新

优先完成 FE 统计数据的正式刷新，并验证：

- 数据来源
- ingestion
- approved facts
- coverage contract
- release baseline
- Pass Rate 页面渲染
- sitemap / SEO 状态

### Sprint 2B — API 失败降级架构检查与必要修复

先确认数据页在上游失败时的真实行为。

如果当前行为确实是：

- HTTP 200
- 页面主体为空或不完整
- 搜索引擎仍可将其视为正常页面

则根据项目实际架构实施 **503**。

如果现有架构无法安全实施 503：

> 不要自行重构；暂停并报告具体原因。

---

# 2. 必须先读取的文件

开始工作前必须读取：

```text
README.md

docs/audit/REPOSITORY_AUDIT_2026-11-24.md
docs/audit/V2_GAP_MATRIX.md
docs/audit/PRODUCTION_BASELINE_2026-11-24.md

docs/adr/0001-stage-0-foundation.md
docs/adr/0002-index-policy.md
```

以及：

```text
SPRINT_1_REPORT_2026-11-24.md
```

如果 `DEEPSEEK_HARNESS_SPRINT_1_TASK.md` 已经补入仓库，也必须读取。

---

# 3. Git 工作树安全检查

开始前执行：

```bash
git status
git branch --show-current
git diff --stat
git diff --name-only
```

当前 Sprint 1 改动可能仍未提交。

**禁止：**

```bash
git reset --hard
git clean -fd
```

禁止删除未知来源的已有修改。

如果 Sprint 1 改动仍在工作树：

> 不要覆盖、回退或重置。

本 Sprint 必须建立在当前 Sprint 1 结果之上。

---

# 4. Sprint 2A — FE 202610 数据刷新

## 4.1 先做只读审计

先定位：

- FE 资格的 slug
- FE 数据源定义
- 当前最新已入库月份
- 202610 数据源/附件
- ingestion 逻辑
- approved facts
- coverage contract
- release baseline
- FE Pass Rate 页面

重点检查是否已经存在：

```text
FE 202610
```

相关文件、fixture、source contract 或 ingestion 记录。

---

## 4.2 不允许直接修改生产数据

本 Sprint 的数据刷新必须先在项目规定的本地/测试流程中完成验证。

禁止：

- 修改生产数据库
- 直接操作线上数据库
- 修改线上数据
- 部署生产
- 重启生产服务

如果仓库已有正式的本地 ingestion / validation / release 流程：

> 必须优先使用现有流程。

不要自行设计新的数据导入体系。

---

## 4.3 FE 数据刷新必须验证

至少确认：

1. 202610 数据来源明确；
2. 数据格式符合现有 source contract；
3. ingestion 成功；
4. approved facts 成功生成或更新；
5. coverage contract 没有异常；
6. release baseline 没有出现未解释的变化；
7. FE Pass Rate 页面能够读取正确数据；
8. sitemap / canonical / noindex 没有因数据刷新产生异常。

---

## 4.4 如果 202610 数据不存在

不要伪造数据。

不要根据搜索结果自行编写统计数字。

不要使用未经项目数据链批准的数据。

如果真实来源缺失：

停止数据写入，只报告：

```markdown
## FE 202610 数据缺失

当前状态：
已找到的来源：
缺失内容：
为什么无法继续：
需要用户提供/确认的内容：
```

---

# 5. Sprint 2B — API 失败降级

## 5.1 先不要修改

必须先找到数据页真实的失败路径。

重点检查：

- server-side rendering
- API client
- fetch / database access
- error handling
- fallback
- empty state
- HTTP status
- robots
- canonical
- sitemap

至少回答：

> 当上游数据不可用时，当前页面最终返回什么 HTTP 状态，以及 HTML 中有什么内容？

---

# 6. API 失败策略

目标策略：

> **真实上游数据不可用时，返回 503，而不是伪装成正常的 200 空页面。**

但是：

### 只有在确认架构允许安全实施后才能修改。

必须确保：

- 正常数据页面仍返回 200；
- 正常空数据（业务上确实没有数据）不能被误判为 503；
- 上游临时失败与合法空结果能够区分；
- 503 不进入 sitemap；
- 不破坏现有正常页面 SEO；
- 不影响客户端正常错误提示。

---

## 6.1 不得自行扩大为全站 503

只处理：

> 本次确认存在“上游数据失败 → 200 空态”的数据页面。

不要建立全站统一 503 middleware。

不要修改：

- Caddy
- Docker
- CDN
- 全局 HTTP 错误页
- 所有 API
- 所有页面

除非现有架构已经明确要求如此。

---

# 7. `/pass-rate/` 空表

本 Sprint 明确：

> **保持可索引。**

不要：

- 添加 noindex；
- 从 sitemap 删除；
- 修改 canonical；
- 改为 404；
- 改为 503。

原因：

当前项目已确认此页面保持可索引。

---

# 8. `/schedule/` 空态

本 Sprint 明确：

> **保持现状。**

不要：

- noindex
- 404
- 301
- 新增空态路由
- 重做 schedule UI

---

# 9. 年度空壳页

以下类型：

```text
/2025/
/2027/
/2030/
```

统一按照：

> **200 + noindex**

执行。

不要自行改为：

- 301
- 404
- canonical 到其他页面

如果当前代码不是该状态：

> 先报告现状，不要自行扩大任务范围。

---

# 10. Pass Rate 薄页

对于：

> 只有单年合格率，没有历史趋势

的 Pass Rate 页面：

**本 Sprint 暂时保留 sitemap。**

不要：

- 删除 sitemap 条目；
- noindex；
- 404；
- 合并页面。

后续是否收紧由新的数据和产品判断决定。

---

# 11. 严格禁止事项

本 Sprint 不得：

### 产品 / UI

- 重做首页
- 重做 `/shikaku/`
- 重做资格详情页
- 修改设计系统
- 大规模移动端 UI 改版

### SEO

- 不做 301 体系重构
- 不处理无尾斜杠 301
- 不重构 URL
- 不新增 `/about/`
- 不新增搜索页
- 不新增 feed
- 不修改 GSC / Bing / GA4

### 数据

- 不伪造数据
- 不修改生产数据库
- 不修改数据源契约之外的字段
- 不修改数据库 schema
- 不做宅建统计入库
- 不提前做 G-17 之外的数据扩充

### 资格

- 不新增资格
- 不扩充到 30 个资格

---

# 12. 测试要求

修改后至少运行与本 Sprint 相关的测试。

优先：

```bash
pnpm run typecheck
pnpm test
pnpm run test:verify-gate
pnpm run build
pnpm run format:check
pnpm exec eslint . --ignore-pattern "Python/**"
pnpm run test:python
pnpm run verify:all
pnpm run smoke:docker
```

如果某项不适合本 Sprint 或环境不允许：

> 明确说明原因，不得伪造通过结果。

---

# 13. 数据刷新专项验收

必须能够明确回答：

```text
FE 202610 数据是否存在？
↓
来源是否明确？
↓
是否经过现有 ingestion？
↓
approved facts 是否正确？
↓
coverage contract 是否通过？
↓
release baseline 是否正常？
↓
Pass Rate 页面是否正确显示？
↓
SEO 门禁是否通过？
```

---

# 14. API 失败专项验收

必须提供至少一个可重复验证的测试路径，证明：

### 正常数据

```text
HTTP 200
```

### 合法空数据

保持项目定义的正常行为。

### 上游失败

如果本 Sprint 完成 503：

```text
HTTP 503
```

并确认：

- 不产生正常可索引页面；
- 不进入 sitemap；
- 不破坏正常页面；
- 恢复数据后页面重新返回 200。

如果由于架构原因暂时无法安全实现 503：

> 不要硬改。

直接报告原因并停止。

---

# 15. 最终报告

完成后必须输出：

```markdown
# Sprint 2 完成报告

## 1. 执行范围

实际完成了哪些内容。

## 2. FE 202610

### 数据来源

### ingestion

### approved facts

### coverage contract

### release baseline

### 页面验证

## 3. API 失败降级

### 当前架构

### 修改前行为

### 修改后行为

### 为什么选择 503 / 为什么无法实施 503

## 4. SEO 验证

### /pass-rate/

### /schedule/

### 年度空壳页

### 薄 Pass Rate 页

## 5. 测试

列出每条测试命令及结果。

## 6. 修改文件

只列实际修改文件。

## 7. Git diff

列出：

git diff --stat

以及关键修改摘要。

## 8. 未处理问题

列出本 Sprint 发现但没有处理的问题。

## 9. 风险

如有风险，明确说明。

## 10. 下一步建议

只提出建议。

**不得自行执行 Sprint 3。**
```

---

# 16. 最终停止规则

完成：

```text
FE 202610
+
API 失败架构检查/必要修复
+
测试
+
SEO 回归
+
完成报告
```

后立即停止。

不得继续：

- G-07 内链重构
- 首页改版
- 移动端大改
- 资格扩充
- 年度页 301
- 无尾斜杠 301
- 薄页清理
- 宅建统计入库
- 其他 Sprint 3 工作

---

# 17. 最重要的执行原则

本 Sprint 的目标不是“继续优化 ShikakuCheck”。

目标是：

> **在 Sprint 1 已验证的基础上，先完成最有硬期限的数据任务，并把数据失败时的 SEO/HTTP 行为处理清楚。**

执行顺序：

```text
先读
↓
只读审计
↓
确认现状
↓
FE 202610
↓
验证
↓
API 失败路径检查
↓
必要时最小修改
↓
完整测试
↓
完成报告
↓
停止
```

**不要猜，不要伪造，不要顺手扩大范围。**
