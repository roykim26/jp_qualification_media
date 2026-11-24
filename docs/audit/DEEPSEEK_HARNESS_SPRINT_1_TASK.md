# ShikakuCheck — DeepSeek Harness Sprint 1 Task

> 项目：ShikakuCheck  
> 网站：https://shikakucheck.com/  
> 本任务执行环境：DeepSeek Harness  
> 阶段：Phase 1 / Sprint 1  
> 任务类型：确定性 SEO / 内链修复  
> 原则：最小改动、证据优先、可验证、可回滚
>
> **本任务完成后必须停止，不得自行进入 Sprint 2 或扩大任务范围。**

---

## 0. 任务目标

本 Sprint 只处理已经通过仓库审计确认、且**不需要产品/SEO策略重新决策**的两个问题：

### G-02：参数页索引边界

检查并修复类似：

```text
/pass-rate/?sort=...
```

这类排序参数 URL 被搜索引擎作为独立可索引 URL 的问题。

目标：

> 对排序参数造成的重复/低价值 URL，建立与项目现有 SEO 策略一致的索引边界。

**注意：**

本 Sprint 不允许自行决定新的 URL 结构，不允许擅自增加 301 规则。

---

### G-18：Pass Rate 内部链接错误

当前审计发现：

`/pass-rate/` 表格中的年份链接指向类似：

```text
/shikaku/bookkeeping/pass-rate/?year=2026
```

而这些年份变体属于 noindex URL。

这会造成：

> 可索引的 Pass Rate 索引页 → 链接到 noindex 的年份参数页

本 Sprint 需要修正这一内部链接关系。

目标：

> 用户从 `/pass-rate/` 进入某资格的 Pass Rate 信息时，应优先进入项目定义的正式、可索引页面，而不是继续进入 noindex 参数变体。

---

# 1. 必须先读取的文件

开始修改代码前，必须先读取并理解以下内容。

## 1.1 项目基础

```text
README.md
```

## 1.2 Phase 0 审计

优先读取：

```text
docs/audit/REPOSITORY_AUDIT_2026-11-24.md
docs/audit/V2_GAP_MATRIX.md
docs/audit/PRODUCTION_BASELINE_2026-11-24.md
```

如果上述文件路径实际不同：

> 先在仓库中定位对应文件，不要创建新的替代审计文件。

---

## 1.3 SEO / 路由 / 页面渲染相关代码

自行定位以下功能的实际实现位置：

```text
/pass-rate/
/shikaku/{slug}/pass-rate/
/pass-rate/?sort=
/pass-rate/?year=
```

重点寻找：

```text
renderPassRateIndex
```

以及：

- Pass Rate 索引页渲染逻辑
- query parameter 处理逻辑
- canonical
- robots / noindex
- sitemap
- 内部链接生成
- route / URL helper
- 对应测试

---

## 1.4 测试

重点检查：

```text
tests/
```

以及与以下内容相关的测试：

```text
pass-rate
canonical
robots
noindex
sitemap
web-render
route
```

如果已经存在相关测试，优先扩展现有测试。

**不要为了本任务重新设计整个测试体系。**

---

# 2. 修改前必须完成的只读确认

在真正修改代码前，先确认以下事实。

## 2.1 确认 G-02

确认：

1. `/pass-rate/?sort=...` 是否实际返回 200。
2. 当前 canonical 指向哪里。
3. 当前 robots / noindex 行为是什么。
4. 不同 `sort` 值是否产生相同或高度重复的主体内容。
5. 当前项目是否已经存在统一的 query parameter SEO 处理机制。

必须把实际代码位置和当前行为记录下来。

---

## 2.2 确认 G-18

确认：

1. `/pass-rate/` 的表格是在哪里生成的。
2. 当前年份链接是如何生成的。
3. 为什么生成：

```text
/shikaku/{slug}/pass-rate/?year=YYYY
```

4. `/shikaku/{slug}/pass-rate/` 是否已经是正式的可索引页面。
5. 当前 noindex 年份变体是否仍然被其他页面大量链接。

---

# 3. G-02 实施要求

## 3.1 原则

只处理**排序参数**造成的 SEO 边界问题。

推荐优先使用项目已经存在的 SEO 机制。

不要自行引入：

- 新的 SEO 框架
- 新的 URL 系统
- 新的 middleware
- 大规模 route 重构
- 新的 canonical 架构

---

## 3.2 必须保持

不能破坏正常排序功能。

例如：

```text
/pass-rate/?sort=...
```

如果排序功能当前对用户界面有实际用途：

> 可以继续让用户使用排序。

本任务重点是：

> 搜索引擎如何处理这些 URL。

不能为了 SEO 直接删除用户需要的排序功能。

---

## 3.3 禁止自行决定 301

除非仓库中已经明确存在既定策略，否则：

**不要新增：**

```text
301 redirect
```

用于处理 `?sort=`。

URL 重定向属于 URL 行为变更，需要单独决策。

---

## 3.4 实现后必须验证

至少验证：

```text
/pass-rate/
```

以及至少两个不同的：

```text
/pass-rate/?sort=...
```

变体。

检查：

- HTTP status
- canonical
- robots
- noindex
- 页面主体内容
- 页面是否仍正常工作

---

# 4. G-18 实施要求

## 4.1 当前问题

当前：

```text
/pass-rate/
```

中的年份链接指向类似：

```text
/shikaku/bookkeeping/pass-rate/?year=2026
```

而该 URL 属于 noindex 参数变体。

---

## 4.2 修改目标

将内部链接修改为：

```text
/shikaku/{slug}/pass-rate/
```

即项目正式的、可索引的资格 Pass Rate 页面。

**不要继续生成：**

```text
/shikaku/{slug}/pass-rate/?year=YYYY
```

作为 `/pass-rate/` 索引表格的主要内部链接目标。

---

## 4.3 重要限制

不要因此重构整个 Pass Rate 系统。

不要修改：

- Pass Rate 数据模型
- 历史数据结构
- 统计计算逻辑
- 数据采集流程
- 数据源
- 宅建数据采集
- FE 月度数据刷新
- sitemap 全局策略
- 年度页面策略

本任务只修：

> `/pass-rate/` → 正式资格 Pass Rate 页

之间的内部链接关系。

---

# 5. 测试要求

至少新增或修改覆盖以下行为的自动化测试。

## 5.1 G-02

测试排序参数：

```text
/pass-rate/?sort=...
```

确认其 SEO 行为符合修改后的策略。

测试至少包括：

- 默认 `/pass-rate/`
- 一个合法 `sort`
- 一个不同的合法 `sort`
- 一个异常/未知 `sort`（如果当前代码允许这种输入）

---

## 5.2 G-18

测试 `/pass-rate/` 渲染出的链接。

必须确保：

### 正确

```text
/shikaku/bookkeeping/pass-rate/
```

### 不再作为主要目标出现

```text
/shikaku/bookkeeping/pass-rate/?year=2026
```

如果测试数据中存在其他资格：

> 同样验证至少一个其他资格。

---

# 6. 不允许修改的范围

本 Sprint 明确禁止以下工作。

## 6.1 禁止产品改版

不要修改：

- 首页
- `/shikaku/`
- 资格详情页整体布局
- 导航体系
- UI 设计
- Mobile UI

---

## 6.2 禁止扩充资格

不要新增资格。

不要为了测试顺便添加：

- FE
- 宅建
- 行政书士
- FP
- 簿记
- 其他资格

数据扩充不属于本 Sprint。

---

## 6.3 禁止修改以下未决策问题

不要自行处理：

```text
/pass-rate/ 空表
```

```text
无筛选 /schedule/ 空态
```

```text
/pass-rate/?sort= 的 301 策略
```

```text
/2025/
/2027/
/2030/
```

等年度空壳页。

尤其不要自行决定：

- 301
- 404
- noindex
- canonical 到其他页面

这些问题属于后续 SEO / 产品决策。

---

## 6.4 禁止修改 URL 结构

不要改变现有正式 URL：

```text
/shikaku/{slug}/pass-rate/
```

不要增加：

```text
新路径
新 slug
新 route
新 URL 层级
```

---

## 6.5 禁止修改数据采集

不要执行或修改：

```text
capture_takken.py
```

或其他正式数据采集流程。

不要修改：

- approved facts
- ingestion
- coverage contract
- release baseline
- production database

---

## 6.6 禁止部署生产

本任务只处理代码和测试。

**不要：**

- 登录生产服务器
- 修改生产数据库
- 修改 Caddy
- 修改 Docker Compose
- 部署生产
- 修改 DNS
- 修改 CDN

---

# 7. 关于已有未提交代码

开始修改前：

```bash
git status
```

确认当前工作树状态。

**不要擅自删除用户已有修改。**

如果发现：

- 未提交修改
- 新文件
- 与本 Sprint 相关的工作

必须先区分：

```text
已有修改
```

和：

```text
本 Sprint 修改
```

不能直接：

```bash
git reset --hard
git clean -fd
```

也不能删除未知来源的修改。

---

# 8. 修改原则

遵循：

> 最小改动原则。

优先：

```text
修改现有 helper
↓
修改现有 renderer
↓
补充现有测试
```

而不是：

```text
重构
↓
重新设计
↓
顺便优化整个 SEO 系统
```

如果发现实现方式需要大规模重构：

**停止修改，并在最终报告中说明原因。**

---

# 9. 验收标准

只有以下条件全部满足，Sprint 1 才算完成。

## A. G-02

能够明确证明：

- `?sort=` 的 SEO 行为已经符合项目策略
- 没有破坏正常页面功能
- canonical / robots / noindex 行为经过测试
- 没有新增未经批准的 301

---

## B. G-18

能够明确证明：

`/pass-rate/`

不再把 noindex 年份参数 URL 作为主要内部链接目标。

正式目标应为：

```text
/shikaku/{slug}/pass-rate/
```

---

## C. 自动化测试

相关测试通过。

必须报告：

```text
测试命令
```

以及：

```text
通过数量
失败数量
```

如果全仓测试耗时过长：

> 至少运行与本次修改直接相关的测试，并明确说明没有运行哪些更大范围测试。

---

## D. SEO 回归

至少检查：

```text
/pass-rate/
/pass-rate/?sort=...
/shikaku/bookkeeping/pass-rate/
```

确认：

- HTTP status 正常
- canonical 正常
- noindex 行为符合预期
- 页面主体正常
- 内部链接正常

---

# 10. 完成后的报告格式

完成后不要只回复：

```text
Done
```

必须输出以下结构。

```markdown
# Sprint 1 完成报告

## 1. 实际修改

### G-02

- 修改文件：
- 修改内容：
- 修改原因：

### G-18

- 修改文件：
- 修改内容：
- 修改原因：

## 2. 测试

测试命令：

结果：

## 3. SEO 回归

### /pass-rate/

结果：

### /pass-rate/?sort=...

结果：

### /shikaku/bookkeeping/pass-rate/

结果：

## 4. Git Diff 摘要

列出实际修改的文件。

## 5. 未处理问题

列出本 Sprint 发现但没有处理的问题。

## 6. 风险

如果存在潜在风险，明确说明。

## 7. 建议的下一步

这里只能列出建议。

**不得自行执行下一 Sprint。**
```

---

# 11. 最重要的停止规则

### 完成以下内容后必须停止：

```text
G-02
+
G-18
+
相关测试
+
SEO 回归
+
完成报告
```

**不得继续执行：**

- Sprint 2
- 移动端 UI 优化
- 内部链接体系重构
- 年度页 SEO
- 301
- 资格扩充
- 首页改版
- 数据采集
- 生产部署

即使你认为这些工作“顺手就可以完成”，也必须停止。

---

# 12. 如果遇到决策冲突

如果执行过程中发现：

> 当前代码无法在不做产品/SEO决策的情况下完成任务。

不要猜。

不要自行决定。

不要扩大范围。

请暂停并报告：

```markdown
## 需要用户决策

问题：
现状：
可选方案：
各方案影响：
我建议：
```

等待用户决定后再继续。

---

# 13. 最终原则

本 Sprint 的目的不是“优化整个 ShikakuCheck”。

而是验证：

> **在真实仓库和真实代码基础上，用最小修改解决两个已经确认的确定性问题。**

优先级：

```text
正确性
>
可验证性
>
可回滚性
>
最小改动
>
优化范围
```

**本任务完成后停止。**
