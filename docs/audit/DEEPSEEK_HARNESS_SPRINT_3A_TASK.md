# DeepSeek Harness — Sprint 3A Task

## 数据可靠性与错误边界收敛

**项目：** ShikakuCheck  
**仓库：** `jp_qualification_media`  
**执行环境：** DeepSeek Harness  
**任务类型：** 小范围工程收尾 + 只读决策分析  
**本 Sprint 原则：** 证据优先、最小修改、可验证、可回滚  
**完成后：必须停止，不得自行进入 Sprint 3B / Sprint 4**

---

# 0. 本 Sprint 的核心目标

Sprint 2 已完成：

1. FE 202610 月度数据刷新；
2. 上游明确失败时由 502 分层为 503；
3. 合法空数据继续返回 200；
4. SEO / sitemap / canonical / noindex 回归；
5. 完整自动化测试。

Sprint 2 同时暴露出 3 个值得进一步收敛的问题：

- 上游请求没有明确 timeout；
- `/sitemap.xml` 上游故障时虽然返回 503，但响应形态仍是 HTML；
- `/pass-rate/` 使用 `Promise.all`，一个资格失败可能导致整个 `/pass-rate/` 返回 503。

本 Sprint 只处理上述问题。

**不要把本 Sprint 扩大成 SEO 改版、UI 改版、资格扩充或数据建设 Sprint。**

---

# 1. 执行前必须读取的文件

开始任何修改前，必须依次读取：

```text
README.md

docs/audit/REPOSITORY_AUDIT_2026-11-24.md
docs/audit/V2_GAP_MATRIX.md
docs/audit/PRODUCTION_BASELINE_2026-11-24.md

docs/adr/0001-stage-0-foundation.md
docs/adr/0002-index-policy.md

docs/audit/SPRINT_1_REPORT_2026-11-24.md
docs/audit/SPRINT_2_REPORT_2026-11-24.md

docs/audit/DEEPSEEK_HARNESS_SPRINT_1_TASK.md
docs/audit/DEEPSEEK_HARNESS_SPRINT_2_TASK.md
```

如果其中某个任务文档尚未进入仓库：

- 不得假设其内容；
- 使用当前工作区实际存在的版本；
- 在报告中明确说明。

同时读取：

```text
docs/next-round-ticket.md
```

以及与以下代码直接相关的文件：

```text
apps/web/src/server.ts
apps/web/src/render.ts
services/api/src/public-facts.ts
tests/web-server.test.ts
scripts/verify-lib.mjs
scripts/docker-smoke.mjs
```

---

# 2. Git 安全检查：先保护 Sprint 1 + Sprint 2

开始任何代码修改前执行：

```bash
git status --short
git branch --show-current
git diff --stat
git diff --name-only
git diff -- apps/web/src/server.ts
git diff -- docs/adr/0002-index-policy.md
```

必须确认：

- 当前仍在 Sprint 1/2 所在工作分支；
- Sprint 1 + Sprint 2 改动仍存在；
- 没有执行过 `git reset --hard`；
- 没有执行过 `git clean -fd`；
- 不得覆盖、删除或重置现有改动。

**禁止：**

```bash
git reset --hard
git clean -fd
git checkout -- .
git restore .
```

---

# 3. 提交 Sprint 1 + Sprint 2：先检查，再提交

本 Sprint 允许完成一次 Git 落盘，但必须非常谨慎。

## 3.1 先输出待提交清单

在任何 commit 前检查：

```bash
git status --short
git diff --stat
git diff --name-only
```

确认不存在与本项目无关的用户文件、临时文件或环境文件。

如果发现无法判断是否属于 Sprint 1/2 的文件：

**停止并报告，不得擅自删除或提交。**

## 3.2 提交方式

如果确认工作树中的改动全部属于 Sprint 1 + Sprint 2，可以拆成两个 commit：

### Commit 1

Sprint 1 相关改动。

建议 message：

```text
feat(seo): close sprint 1 indexing boundary issues
```

### Commit 2

Sprint 2 相关改动。

建议 message：

```text
feat(data): refresh FE 202610 and harden upstream failures
```

如果无法可靠区分 Sprint 1 / Sprint 2 的文件归属：

- 不要强行拆 commit；
- 可以使用一个合并 commit；
- commit message：

```text
feat: close sprint 1 and sprint 2 baseline
```

**无论采用哪种方式，都必须在报告中记录 commit hash。**

## 3.3 Commit 后立即检查

```bash
git status --short
git log -2 --oneline
```

目标：

```text
working tree clean
```

如果仍有未提交文件：

- 不要删除；
- 不要强制清理；
- 报告剩余文件。

---

# 4. Sprint 3A 的硬边界

## 允许修改

只允许修改与以下目标直接相关的文件：

1. `apps/web/src/server.ts`
2. `tests/web-server.test.ts`
3. 与 sitemap 错误响应直接相关的测试/验证文件
4. 与 timeout 直接相关的必要文档
5. 与本 Sprint 决策直接相关的 ADR / audit 文档

如果确实需要修改其它文件：

**必须先在报告中说明原因，并且只允许在确认必要后修改。**

## 明确禁止

本 Sprint 不得：

- 改首页；
- 改 `/shikaku/` UI；
- 重做资格详情页；
- 改设计系统；
- 做移动端改版；
- 做内链重构；
- 增加资格；
- 扩充到 30 个资格；
- 新建 `/about/`；
- 新建搜索页；
- 新建 feed；
- 改 GSC；
- 改 Bing；
- 改 GA4；
- 做宅建统计入库；
- 修改数据库 schema；
- 修改生产数据库；
- 修改 Caddy；
- 修改 Docker；
- 修改 CDN；
- 重构 URL；
- 做无尾斜杠 301；
- 做年度页 301/404；
- 清理薄 Pass Rate 页面；
- 改 `/pass-rate/` 空表的既定索引策略；
- 改 `/schedule/` 空态既定策略；
- 自行进入 Sprint 3B / Sprint 4。

---

# 5. Task A：为上游请求建立明确 timeout

## 5.1 先做只读分析

确认当前：

```text
fetchUpstream()
readQualification()
readCalendar()
readComparison()
readUpdates()
proxyIcs()
```

的请求链路。

确认：

- timeout 是否已经存在；
- timeout 是否在 fetch helper 层；
- 哪些请求共用 helper；
- 哪些请求不经过 helper；
- 当前错误是否已经能进入 `UpstreamUnavailableError`。

## 5.2 实施目标

目标行为：

```text
正常上游
→ 200

合法业务空数据
→ 200

上游明确返回错误
→ 503

上游网络连接失败
→ 503

上游请求超时
→ 503
```

建议 timeout：

```text
5–8 秒
```

但 Harness 不得因为“建议”而直接假定具体值。

请根据现有架构和测试条件选择一个明确值，并在报告中说明理由。

## 5.3 实现要求

优先在现有 `fetchUpstream()` 层实现。

不要给每一个 route 单独实现 timeout。

不要引入大型依赖。

如果运行环境支持：

```ts
AbortSignal.timeout(...)
```

可以优先考虑。

如果需要兼容当前 Node/runtime，则采用仓库现有兼容方式。

## 5.4 测试要求

至少增加：

```text
上游正常 → 200
上游合法空数据 → 200
上游 5xx → 503
上游连接失败 → 503
上游 timeout → 503
上游恢复 → 200
```

同时确认：

```text
Retry-After: 60
```

仍然存在。

---

# 6. Task B：修正 `/sitemap.xml` 故障响应形态

当前已知状态：

```text
/sitemap.xml
正常 → 200 + XML

上游故障 → 503
```

Sprint 2 发现：

```text
上游故障 → 503 + text/html
```

本 Sprint 只解决这个响应形态问题。

## 6.1 目标

正常：

```http
HTTP 200
Content-Type: application/xml
```

故障：

```http
HTTP 503
Content-Type: application/xml
```

响应体不得包含正常 `<urlset>`。

如果项目已有更合适的 XML 错误输出方式，优先使用现有模式；不要扩大 sitemap 结构。

## 6.2 测试

必须增加/调整自动化测试：

```text
正常 sitemap
→ 200
→ application/xml
→ 包含正常 urlset

上游失败
→ 503
→ application/xml
→ 不包含正常 urlset
```

同时确认：

```text
Retry-After: 60
```

保持不变。

---

# 7. Task C：只读评估 `/pass-rate/` 的失败粒度

这是本 Sprint 最重要的**决策任务**。

**默认禁止直接修改生产代码。**

## 7.1 当前已知问题

当前 `/pass-rate/` 使用：

```text
Promise.all(...)
```

一个资格失败可能导致：

```text
整个 /pass-rate/
→ 503
```

## 7.2 必须分析

阅读实际实现，确认：

1. `/pass-rate/` 一次请求多少资格；
2. 每个资格请求是否相互独立；
3. 数据是否可以独立渲染；
4. `Promise.allSettled()` 是否适用；
5. 部分失败时 SEO HTML 是否安全；
6. 部分失败时 structured data 是否会产生错误；
7. 页面是否会产生“看起来完整但数据不完整”的误导；
8. 部分失败是否会影响 sitemap；
9. 部分失败是否应该返回 200；
10. 是否需要明确的用户可见提示。

## 7.3 输出两个方案

### 方案 A：保持整页 503

```text
任意资格失败
→ /pass-rate/ = 503
```

列出：

- 优点；
- 缺点；
- SEO 影响；
- 用户体验；
- 实施成本。

### 方案 B：部分成功

```text
成功资格 → 正常显示
失败资格 → 显示暂不可用
整页 → 200
```

列出：

- 优点；
- 缺点；
- SEO 影响；
- 用户体验；
- 实施成本；
- structured data 风险。

## 7.4 必须给出 Harness 建议

在报告最后明确：

```text
推荐方案：
A / B

理由：
……
```

但：

**本 Sprint 不得根据自己的推荐直接实施。**

必须等待 Owner 决策。

---

# 8. Task D：验证配置错误是否会伪装成正常空数据

Sprint 2 发现：

```text
services/api/src/public-facts.ts
```

存在：

```ts
if (!databaseUrl) return [];
```

这可能导致：

```text
数据库配置错误
→ API 200 + []
→ Web 认为是合法空数据
```

本 Sprint 只允许：

1. 阅读；
2. 写最小测试或验证；
3. 判断当前行为；
4. 提出是否应该改成错误响应。

**除非发现该问题会直接破坏 Sprint 3A 的 timeout / 503 语义，否则不要修改生产代码。**

如果不修改，必须在报告中明确：

```text
发现
→ 已确认
→ 本 Sprint 不处理
→ 建议后续单独处理
```

---

# 9. SEO 回归边界

本 Sprint 修改错误处理后，必须确认这些既定策略没有被破坏：

## `/pass-rate/`

```text
200
可索引
canonical 自指
sitemap 保持
```

## `/pass-rate/?sort=...`

```text
200
noindex,follow
canonical → /pass-rate/
不进 sitemap
```

## `/schedule/`

保持现状。

## 年度空壳页

保持：

```text
200
noindex,follow
```

不要改 canonical。

## 薄 Pass Rate 页

继续保持当前策略：

```text
可索引
继续留在 sitemap
```

---

# 10. 完整测试要求

至少执行：

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

如果 `verify:all` 需要：

```text
DATABASE_URL=postgresql://postgres@127.0.0.1:55432/qualification_media
```

继续使用当前已验证的本机 Docker 数据库。

**不得连接生产数据库。**

---

# 11. 必须增加的回归测试

最终测试必须覆盖：

### Upstream

```text
200 normal
200 legitimate empty
503 upstream 5xx
503 connection failure
503 timeout
200 recovery
```

### Sitemap

```text
200 + application/xml + urlset
503 + application/xml + no urlset
```

### SEO

```text
/pass-rate/
/pass-rate/?sort=
/pass-rate/?order=
/schedule/
/shikaku/takken/2025/
/shikaku/takken/2027/
/shikaku/takken/2030/
/shikaku/fp/pass-rate/
/shikaku/gyoseishoshi/pass-rate/
/shikaku/it-passport/pass-rate/
```

---

# 12. 不允许伪造测试结果

如果某项测试由于环境限制无法完成：

必须明确：

```text
NOT RUN
```

并说明：

- 原因；
- 已完成的替代验证；
- 是否影响验收。

禁止把“理论上应该通过”写成“已通过”。

---

# 13. Sprint 3A 完成报告

必须新建：

```text
docs/audit/SPRINT_3A_REPORT_2026-11-24.md
```

报告必须包含：

1. 执行摘要；
2. Git 状态；
3. Sprint 1/2 commit hash；
4. 修改文件；
5. Task A timeout；
6. Task B sitemap；
7. Task C pass-rate 方案评估；
8. Task D databaseUrl 配置错误；
9. SEO 回归；
10. 全部测试结果；
11. 未处理问题；
12. 风险；
13. 下一步建议；
14. 停止声明。

---

# 14. 验收标准

Sprint 3A 只有同时满足以下条件才算完成：

- [ ] Sprint 1 + Sprint 2 已安全 commit；
- [ ] timeout 已明确实现并有测试；
- [ ] timeout → 503；
- [ ] 合法空 → 200；
- [ ] 上游 5xx → 503；
- [ ] 连接失败 → 503；
- [ ] sitemap 正常 → 200 + XML；
- [ ] sitemap 故障 → 503 + XML；
- [ ] sitemap 故障不输出正常 urlset；
- [ ] `/pass-rate/` 失败粒度完成只读分析；
- [ ] 已给出 A/B 两个方案；
- [ ] 已给出 Harness 推荐方案；
- [ ] **没有未经 Owner 同意实施 pass-rate 粒度改造**；
- [ ] SEO 回归通过；
- [ ] 全部测试通过；
- [ ] 未修改生产数据库；
- [ ] 未部署生产；
- [ ] 未进入 Sprint 3B / Sprint 4。

---

# 15. 严格停止条件

完成以上工作后：

**立即停止。**

不得继续：

- 首页优化；
- 资格目录优化；
- 内链优化；
- 移动端优化；
- 新增资格；
- 宅建统计；
- sitemap 大规模重构；
- URL 规范化；
- 年度页处理；
- 薄页处理；
- 任何 Sprint 3B / Sprint 4 工作。

最终输出：

```text
Sprint 3A 完成报告
```

并等待 Owner 下一步指令。

---

# 16. Owner 决策点

本 Sprint 结束后，只允许把以下问题交给 Owner：

### 决策 1

`/pass-rate/` 单资格失败：

```text
A. 整页 503
B. 部分成功 + 200
```

### 决策 2

`databaseUrl` 缺失：

```text
A. 保持当前 200 + []
B. 后续改为明确配置错误
```

除此之外，不得自行扩大产品决策范围。
