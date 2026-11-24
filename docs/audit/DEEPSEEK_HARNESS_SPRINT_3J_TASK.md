# DEEPSEEK HARNESS — SPRINT 3J 任务文档

## 0. 核心目标

补 G-15 测试缺口：`apps/web/src/server.ts` 的路由层没有进程级测试。

来源：`docs/audit/V2_GAP_MATRIX.md:205`，此后 3A–3I 九份报告的「未处理问题」里反复出现。

## 1. 缺口的准确形状

不是「一条测试都没有」——`tests/web-server.test.ts` 已有 12 个用例，覆盖的是**上游故障语义**：200/503、超时、sitemap 错误形态、静态路由在上游挂掉时仍 200。

缺的是**正常路径的路由行为**：

| 现在有测试的                   | 现在没测试的                                                      |
| ------------------------------ | ----------------------------------------------------------------- |
| `/shikaku/it-passport/` 的 200 | `/images/*`、`/assets/*` 的 content-type 与缓存头                 |
| `/sitemap.xml` 的两种形态      | `/shikaku/` 目录页与 `?q=` 搜索                                   |
| `/robots.txt` 在上游挂掉时 200 | `/schedule/`、`/compare/`、`/guide/`、`/updates/`                 |
| `/` 在上游挂掉时 200           | `/pass-rate/` 的 `?sort=`/`?order=` noindex                       |
| `/ics/*` 超时 503              | `/about/{slug}`、`/compare/{slug}`、`/guide/{slug}` 的 200 与 404 |
|                                | `/shikaku/{slug}/` 的 5 个 section 路由                           |
|                                | 未知 slug → 404、未知路径 → 404                                   |
|                                | `/ics/*` 正常下载（200 + text/calendar）                          |

`verify:all` 与 `docker-smoke.mjs` 在端到端层面碰了其中几条，但那是「起真容器、连真库」的慢验证，不是能在重构时秒级回归的单元测试。

## 2. 为什么现在做

`server.ts` 是 3A（超时 + sitemap 错误体）、3B（api 侧）、3C（配置门禁）三轮改动最集中的文件，606 行、22 条路由分支。它同时是**唯一一个改动会直接影响线上每个请求**的文件。目前改它之后能立刻知道的只有「那 12 个故障路径没坏」，其余全靠人肉 review。

## 3. 方案

新增 `tests/web-routes.test.ts`，照 `tests/web-server.test.ts` 已有的手法：起一个 stub API，`vi.resetModules()` 后 import `handleRequest`，真实发 HTTP 请求。

覆盖每一条路由的：**状态码 + content-type + 一个能证明「渲染的是对的页面」的内容标记**。不比对整页 HTML（那是 `web-render.test.ts` 的职责，且会让测试对样式改动敏感）。

### 3.1 关键约束

1. **不修改 `server.ts`。** 本轮只加测试。如果测试暴露出真实缺陷，记录在报告里，不顺手修——修不修由 Owner 定。
2. **不依赖数据库。** stub API 返回内存里的 JSON，与 `web-server.test.ts` 一致。
3. **不重复已有覆盖。** 故障路径的 12 个用例保持不动。
4. **每个用例自带 server 实例并在 finally 里关掉**，否则端口泄漏会让后续用例串味。

## 4. 交付物

- `tests/web-routes.test.ts`（新增）
- `docs/audit/SPRINT_3J_REPORT_2026-11-25.md`

## 5. 明确禁止

- 不改 `apps/web/src/server.ts`、`render.ts`、`config.ts` 或任何运行时源码。
- 不改 `tests/web-server.test.ts`。
- 不动 `deploy/`、`package.json` 的脚本。
- 不新增依赖。
- 不进入 G-16（schema 漂移）或其它 gap。

## 6. 完成后的要求

报告含：执行摘要、Git 状态、修改文件、**覆盖矩阵**（路由 → 用例 → 断言）、暴露出的问题（如有）、完整测试结果、未处理问题、风险、下一步建议、停止声明。

## 7. 停止纪律

本轮完成后停止。
