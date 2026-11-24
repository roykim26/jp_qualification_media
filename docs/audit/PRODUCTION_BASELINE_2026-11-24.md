# 生产基线（2026-11-24，只读测量）

- 目标站点：<https://shikakucheck.com>
- 测量时间：2026-11-24（本地时间 UTC+08:00，全部为**只读 GET 请求**）
- 测量来源：本机 `curl.exe` / Python `urllib` / Playwright(Chrome headless) / `ssl` / DNS 查询
- 原始证据：`var/audit-2026-11-24/`（36 个只读探针脚本 + 11 份度量文本 + 30+ 份生产 HTML 快照 + 64 张截图；`var/` 在 `.gitignore` 内，不进版本库）
- 性质：**只读**。未登录任何后台、未提交任何表单、未触发任何写操作、未修改任何生产配置。

> **本文件回答的问题**：2026-11-24 这一刻，生产对外表现是什么？哪些数字是实测的，哪些是**取不到、必须由用户提供**的？
> **本文件不回答**：流量为什么低、用户为什么不转化——因为本次**没有任何 GSC / Bing / GA4 数据**（见 §7）。

---

## 0. 一页速览

| 维度             | 实测结论                                                                                                                    | 证据                                    |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| 可用性           | 52 条 sitemap URL **全部 200**；45 次浏览器等价请求（声明 gzip）**0 失败、0 次 >5s**                                        | `sitemap-check.txt`、`reliability.py`   |
| 传输层           | **HTTP/2 (h2)**、**TLS 1.3**、证书有效期至 **2027-02-11**（约 79 天）、TLS 1.0/1.1 已拒绝                                   | `tls_probe.py`                          |
| DNS              | A `47.79.87.163`（阿里云日本）；**无 AAAA（IPv6 未启用）**；NS/MX 均为 Cloudflare                                           | `nslookup`/`Resolve-DnsName`            |
| 压缩             | **gzip 生效、Brotli 未启用**（`Accept-Encoding: br` → identity）                                                            | `reliability.py`                        |
| 缓存             | CSS `immutable` 一年、图片 7 天；**HTML / XML / ICS 无 Cache-Control、无 ETag**                                             | `headers-check.txt`                     |
| 体积             | 最大单页 **518,538 B**（`/shikaku/bookkeeping/pass-rate/`，未压缩）；gzip 后 23,337 B                                       | `perf_gzip.py`                          |
| 索引             | sitemap **52 条、无重复、无 `<lastmod>`/`<changefreq>`/`<priority>`**；全部 200、无 noindex、canonical 全自指、ld+json 齐全 | `prod-sitemap.xml`、`sitemap-check.txt` |
| 安全头           | HSTS / nosniff / X-Frame-Options / Referrer-Policy / Permissions-Policy **齐全**；**CSP 缺失**                              | `headers-check.txt`、全仓 grep          |
| API 暴露         | **`/api/*` 对外 404**（Caddy 只反代 web:3000）；唯一间接面是 `/ics/*.ics` 字节透传                                          | `edge-check.txt`                        |
| 部署版本         | 生产**比本地工作树新**：已含 #106（footer badge）+ #109（页脚移除邮箱）；CSS hash `c022119125ca`                            | §5                                      |
| **取不到的数据** | **GSC / Bing Webmaster / GA4 / Caddy 访问日志 / 生产库行数 / 确切部署 commit**                                              | §7                                      |

---

## 1. 响应头与缓存策略

### 1.1 实测响应头（`headers-check.txt`，10 个 URL）

| URL                             | 状态 | Content-Type                     | 缓存相关头                                                                 |
| ------------------------------- | ---- | -------------------------------- | -------------------------------------------------------------------------- |
| `/`                             | 200  | `text/html; charset=utf-8`       | **无** Cache-Control / ETag / Last-Modified                                |
| `/shikaku/takken/`              | 200  | `text/html; charset=utf-8`       | **无**                                                                     |
| `/shikaku/takken/2026/`         | 200  | `text/html; charset=utf-8`       | **无**                                                                     |
| `/shikaku/takken/2025/`         | 200  | `text/html; charset=utf-8`       | **无**（noindex 页同样无缓存头）                                           |
| `/sitemap.xml`                  | 200  | `application/xml; charset=utf-8` | **无**                                                                     |
| `/robots.txt`                   | 200  | `text/plain; charset=utf-8`      | **无**                                                                     |
| `/ics/takken/2026.ics`          | 200  | `text/calendar; charset=utf-8`   | **无**；有 `Content-Disposition: attachment; filename="takken-2026.ics"`   |
| `/ics/month/2026-11.ics`        | 200  | `text/calendar; charset=utf-8`   | **无**；`Content-Disposition: attachment; filename="schedule-2026-11.ics"` |
| `/assets/site.c022119125ca.css` | 200  | `text/css; charset=utf-8`        | `public, max-age=31536000, immutable`                                      |
| `/images/og-brand.png`          | 200  | `image/png`                      | `public, max-age=604800`                                                   |

代码位置：`apps/web/src/server.ts:165`（图片 `max-age=604800`）、`:176`（CSS `max-age=31536000, immutable`）；HTML 路径**未设置任何缓存头**。

### 1.2 安全头（实测齐全项）

- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

**缺失**：`Content-Security-Policy` —— 全仓 grep **0 命中**（`deploy/caddy/Caddyfile`、`apps/web/src/server.ts`、`packages/ui/src/index.ts` 均无）。这与 `docs/compliance-audit-2026-11-13.md` 的 L1 项一致（该文档写「六项缺」），但**其余五项已补齐，文档未回填**。

### 1.3 缓存策略的后果

- HTML 无 `Cache-Control`/`ETag` → 每次访问都是完整重下（即使未变更），CDN/浏览器无法做条件请求。
- 事实更新后用户不会看到旧页（因为没有缓存），**这既是缺点也是当前的安全网**：一旦给 HTML 加长缓存，就必须同时引入 ETag 或短 TTL，否则会出现「已更正的事实仍显示旧值」——这直接违反本项目「正式事实可追溯、不显示过期值」的核心约束。

---

## 2. 性能：两个口径必须分开

### 2.1 口径 A：未声明 `Accept-Encoding`（curl 默认）

| URL                                              | 耗时                                      | 备注                       |
| ------------------------------------------------ | ----------------------------------------- | -------------------------- |
| `/shikaku/takken/`                               | 5.05 s                                    |                            |
| `/shikaku/bookkeeping/`                          | 11.99 s                                   | 143,663 B                  |
| `/shikaku/bookkeeping/pass-rate/`                | **36.97 s / 60.01 s（被 max-time 截断）** | 只收到 430,074 / 518,538 B |
| `/compare/?qualifications=takken,fp,bookkeeping` | 16.93 s                                   | 69,467 B                   |
| `/guide/`                                        | 7.04 s                                    |                            |

可靠性（同口径）：30 次 `/robots.txt` → 失败率 3.3%；20 次 `/` → 失败率 5%（含 15 s / 45 s 卡死）。

### 2.2 口径 B：声明 `Accept-Encoding: gzip`（浏览器等价）

| 测量                               | 结果                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/` × 25 次                        | **ok=25，fail=0，>5s=0**，min 0.99 s / max 2.24 s                                                                                                                                                                                                                                                                                                                          |
| `/shikaku/fp/` × 20 次             | **ok=20，fail=0，>5s=0**，0.32–0.73 s                                                                                                                                                                                                                                                                                                                                      |
| 11 个页面 × 3 次（`perf_gzip.py`） | 全部 ok，无超时；`/` 2.49/1.06/1.08 s、`/shikaku/` 0.94/0.61/0.63、`/shikaku/takken/` 0.31/0.26/0.26、`/shikaku/bookkeeping/` 0.55/0.61/0.62、`/shikaku/fp/` 0.54/0.35/0.32、`/shikaku/bookkeeping/pass-rate/` 0.78/1.25/1.19、`/schedule/` 0.70/0.64/0.72、`/compare/` 0.72/0.61/1.45、`/pass-rate/` 0.97/0.61/0.58、`/updates/` 0.26/0.27/0.27、`/guide/` 0.25/0.24/0.23 |

### 2.3 结论（必须按此表述，不得写成「生产端不稳定」）

- **服务端渲染与可用性没有异常证据**：浏览器等价条件下 45 次请求 0 失败。
- **真正的瓶颈是「未压缩的大体积 HTML 在低带宽链路上传输」**：同一页面 identity 编码 36.97 s / 60.01 s vs gzip 1.2–3.0 s。
- **Brotli 未启用**：`Accept-Encoding: br` → `identity`（39,640 B）；`gzip, deflate, br` → `gzip`（9,255 B）。Caddy 当前只对 gzip 生效。
- 页面体积排行（identity）：`/shikaku/bookkeeping/pass-rate/` 518,538 B（5 个 `<table>`、94 个 `<tr>`、31 个 `<h3>`）> `/shikaku/bookkeeping/` 143,663 B（0 table、0 tr、82 个 `<h3>`）≈ `/shikaku/fp/` 145,402 B > `/compare/?…` 69,467 B > `/schedule/` 54,464 B > `/shikaku/takken/` 50,190 B > `/` 39,640 B。

---

## 3. 索引面（robots / sitemap / noindex / canonical / 结构化数据）

### 3.1 `robots.txt`（全文）

```
User-agent: *
Allow: /
Sitemap: https://shikakucheck.com/sitemap.xml
```

无 `Host`、无 `Disallow`、无 `Crawl-delay`。代码：`apps/web/src/server.ts:187-193`（内联文本）。

### 3.2 `sitemap.xml`（3,787 B，52 条 `<loc>`）

- **无重复**；`total=52 non200=0 noindex=0 canonical_mismatch=0 no_ld=0`（逐条抓取验证）。
- **`<lastmod>` 0 处、`<changefreq>` 0 处、`<priority>` 0 处** —— 只有裸 `<loc>`。
- 构成：7 个固定入口（`/`、`/shikaku/`、`/schedule/`、`/compare/`、`/pass-rate/`、`/updates/`、`/guide/`）+ 3 个比较专题 + 4 篇指南 + 9 个政策页 + **29 个资格页**。
- **资格页分布**：takken **4** 条（`/shikaku/takken/`、`/2026/`、`/application/`、`/exam-content/`，**缺 `/pass-rate/`**）；其余五资格各 **5** 条。
- 代码：`apps/web/src/server.ts:194-229`（**无 try/catch**：任一资格 fetch 抛错 → 整个 sitemap 502）+ `apps/web/src/sitemap.ts`（状态白名单 `verified`/`partially_announced` + `qualificationSectionHasContent` 过滤）。

### 3.3 noindex / canonical 实测矩阵

| URL                                                      | 状态    | robots           | canonical                           |
| -------------------------------------------------------- | ------- | ---------------- | ----------------------------------- |
| `/`                                                      | 200     | 无               | `/`                                 |
| `/shikaku/`                                              | 200     | 无               | `/shikaku/`                         |
| `/shikaku/?q=FP`                                         | 200     | `noindex,follow` | `/shikaku/`                         |
| `/shikaku/takken/`                                       | 200     | 无               | 自指                                |
| `/shikaku/takken/2026/`                                  | 200     | 无               | 自指                                |
| `/shikaku/takken/2025/`                                  | 200     | `noindex,follow` | **自指**（`/shikaku/takken/2025/`） |
| `/shikaku/takken/2030/`                                  | 200     | `noindex,follow` | **自指**                            |
| `/shikaku/takken/pass-rate/`                             | 200     | `noindex,follow` | 自指                                |
| `/shikaku/takken/pass-rate/?year=2025`                   | —       | 请求超时（-1）   | —                                   |
| `/shikaku/takken/pass-rate/?year=2026`                   | 200     | `noindex,follow` | `/shikaku/takken/pass-rate/`        |
| `/shikaku/bookkeeping/`                                  | 200     | 无               | 自指                                |
| `/shikaku/fp/pass-rate/`                                 | 200     | **无**           | 自指                                |
| `/schedule/`                                             | 200     | 无               | 自指                                |
| `/schedule/?year=2026` 等 4 种参数                       | 200     | `noindex,follow` | `/schedule/`                        |
| `/compare/`                                              | 200     | 无               | 自指                                |
| `/compare/?qualifications=takken,fp,bookkeeping`         | 200     | `noindex,follow` | `/compare/`                         |
| `/pass-rate/`                                            | 200     | 无               | 自指                                |
| **`/pass-rate/?sort=pass_rate&order=desc`**              | 200     | **无（可索引）** | `/pass-rate/`                       |
| **`/pass-rate/?sort=year&order=asc`**                    | 200     | **无（可索引）** | `/pass-rate/`                       |
| `/updates/`                                              | 200     | 无               | 自指                                |
| `/updates/?page=2`、`?page=999`、`?qualification=takken` | 200     | `noindex,follow` | `/updates/`                         |
| `/guide/`                                                | 200     | 无               | 自指                                |
| `/about/contact/`                                        | 200     | 无               | 自指                                |
| `/shikaku/unknown/`、`/shikaku/takken/bogus/`            | **404** | `noindex,follow` | **无**                              |
| `/ics/takken/2026.ics`                                   | 200     | —                | —                                   |
| `/ics/takken/2025.ics`                                   | **404** | `noindex,follow` | 无                                  |
| `/assets/site.css`（无 hash）                            | **404** | —                | —                                   |

**两个策略不一致点**：

1. `/pass-rate/?sort=…` 可索引，而 `/schedule/`、`/updates/`、`/compare/` 的参数变体全部 noindex。
2. 年度空壳页（`/2025/`、`/2027/`、`/2030/`）返回 200 + `noindex,follow` + **自指 canonical**（不是指向主页面）。

### 3.4 结构化数据

- 类型只有 4 种：`WebSite`（仅首页）、`WebPage`、`BreadcrumbList`、`ListItem`。
- **所有 noindex 页不输出 ld+json**（代码：`apps/web/src/layout.ts:258-260` 的 `input.noindex ? '' : renderStructuredData(...)`）。
- 无 `Organization`、`FAQPage`、`ItemList`、`Course`。
- 首页 ld 为 `WebSite,WebPage`；可索引内页为 `WebPage,BreadcrumbList`（`sitemap-check.txt` 另显示含 `WebSite,ListItem`）。

### 3.5 标题与描述（20 页实测）

- 全部页面 **H1 唯一**；title 11–37 字（404 为 11，其余 26–37）；description 42–61 字（404 为空）。
- 无重复 title、无重复 description。
- canonical 全部自指（404 / 未知 slug 无 canonical）。
- 可索引页**没有**显式的 `<meta name="robots" content="index,follow">`（只在 noindex 时输出 robots meta）。

---

## 4. 重复内容与薄内容（实测相似度）

方法：去标签正文，计算 Jaccard / containment / 最长公共子串（LCS）。

| 对比                                                | 长度 A/B     | Jaccard    | Containment | LCS                  | 判定                                             |
| --------------------------------------------------- | ------------ | ---------- | ----------- | -------------------- | ------------------------------------------------ |
| `/shikaku/takken/` vs `/shikaku/takken/2026/`       | 4703 / 2306  | **57.05%** | **90.61%**  | **974 字（42.24%）** | **高危：概要页与年度页大面积重复，两者都可索引** |
| `/shikaku/takken/2025/` vs `/2026/`                 | 599 / 2306   | 38.91%     | 84.35%      | 376 字（62.77%）     | 中（2025 已 noindex）                            |
| `/shikaku/takken/pass-rate/` vs `/pass-rate/`       | 675 / 357    | 0.23%      | 0.74%       | 6 字                 | 不重复                                           |
| `/shikaku/fp/pass-rate/` vs `/pass-rate/`           | 2697 / 357   | 0.13%      | 0.74%       | 6 字                 | 不重复                                           |
| `/compare/` vs `/compare/?qualifications=…`         | 276 / 12509  | 6.28%      | 61.67%      | 104 字               | 低（参数页已 noindex）                           |
| `/compare/` vs 比较专题页                           | 276 / 408    | 1.32%      | 3.52%       | 7 字                 | 不重复                                           |
| `/guide/` vs `/shikaku/takken/`                     | 318 / 675    | 3.78%      | 10.96%      | 13 字                | **不重复（指南与详情页内容不同）**               |
| `/guide/` vs `/shikaku/takken/`（长页）             | 318 / 4703   | 0.38%      | 2.40%       | 7 字                 | 不重复                                           |
| 参考：`/shikaku/takken/` vs `/shikaku/bookkeeping/` | 4703 / 23290 | 17.91%     | 46.73%      | 289 字               | 同模板不同资格的天然基线                         |
| 参考：takken 合格率 vs 行政書士合格率               | 675 / 1147   | **44.97%** | **80.89%**  | 251 字（37.19%）     | **同模板不同资格的天然相似度上限**               |

**`?year=` 变体（本地已存 HTML 比对，未发网络请求）**：`/shikaku/bookkeeping/pass-rate/` vs `?year=2026` → 正文 n-gram **100.00% 相同**（差异只在 meta 与年份导航），vs `?year=2025` → 89.18%。**该变体已正确 noindex，不构成重复索引风险**。

**薄内容（`check_thin.py`）**：`/shikaku/gyoseishoshi/pass-rate/` **1147 字**、`/shikaku/it-passport/pass-rate/` **1046 字**、`/shikaku/fp/pass-rate/` **2697 字**，三者均 **0 张历史表**，但**都在 sitemap 内**。

**生产 `/pass-rate/` 实际内容**（24,555 B 快照）：**非空**，`<table class="pass-rate-table">`，caption「資格別の受験者数・合格者数・合格率の比較表」，7 个 `<tr>`，5 列表头带排序链接，数据行如「基本情報技術者 CBT / 2025 / 147,186人 / 56,370人 / 38.3%」；**无空态文案**（`renderPassRateIndex` 的「空表仍可索引」代码路径存在，但当前生产未触发）。

---

## 5. 部署版本反推（生产跑的是哪个代码）

生产镜像**没有版本注入、也没有 `/version` 端点**，因此只能靠线上产物反推：

| 观测                                                                                               | 结论                                                                                                 |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| HTML 含 `twelve-tools-badge` ×1、CSS 含 `.footer-badges` ×1                                        | **#106（footer badge）已上线**                                                                       |
| 首页与全站页脚**不含** `contact@shikakucheck.com`（home 0 次），而 `/about/contact/` 页内 3 次     | **#109（页脚移除邮箱）已上线**                                                                       |
| `GA_MEASUREMENT_ID` = `G-G9SN61J5LS` ×1；旧 ID `G-LV4250LZNY` 0 次                                 | **#103（M2 Cookie 同意）已上线**，且 GA 资源已重建                                                   |
| `data-cookie-banner` ×2、`data-cookie-settings` ×2                                                 | 同意门控已上线                                                                                       |
| CSS 资源名 `/assets/site.c022119125ca.css`（68,600 B），`media="print" onload` + `<noscript>` 兜底 | 与本地工作树构建出的 `site.ee6d75d9787e.css`（68,314 B）**不同**，差异正是 `.footer-badges` 4 条规则 |
| hero 使用 `hero-1200.avif`                                                                         | 响应式图片已上线                                                                                     |
| `/images/twelve-tools-badge0-white.svg` 返回 200（1,794 B）                                        | 本地工作树**已删除**该文件 → **本地比生产旧**                                                        |

**结论**：生产运行的是**含 #106 完整版 + #109 之后**的代码，**比本地工作树（detached `70740d9`，2026-11-15）新**。本地工作树落后 `origin/main` `01b86dd` 7 个提交，且额外缺失 footer badge 支持。**确切部署 commit SHA 无法从外部确定**（见 §7 Q1）。

---

## 6. 基础设施（DNS / TLS / 边界）

### 6.1 DNS

| 记录 | 值                                                                                                             |
| ---- | -------------------------------------------------------------------------------------------------------------- |
| A    | `47.79.87.163`（阿里云日本区网段）                                                                             |
| AAAA | **无（IPv6 未启用）**                                                                                          |
| NS   | `curt.ns.cloudflare.com`、`daphne.ns.cloudflare.com`（Cloudflare 托管）                                        |
| MX   | `route1.mx.cloudflare.net`、`route2.mx.cloudflare.net`、`route3.mx.cloudflare.net`（Cloudflare Email Routing） |
| TXT  | `v=spf1 include:_spf.mx.cloudflare.net ~all`                                                                   |

### 6.2 TLS（`tls_probe.py`）

- ALPN 声明 `h2,http/1.1` → 服务端协商 **`h2`**；`version=TLSv1.3`；`cipher=TLS_AES_128_GCM_SHA256`。
- 证书：`commonName=shikakucheck.com`，issuer `Let's Encrypt / YE2`，**`notAfter = Feb 11 11:50:58 2027 GMT`**（距测量日约 **79 天**）。
- 版本接受度：TLSv1.0 → 握手超时（拒绝）；TLSv1.1 → `TLSV1_ALERT_PROTOCOL_VERSION`（拒绝）；**TLSv1.2 / TLSv1.3 接受**。
- 注意：本机 `curl.exe` **不支持 `--http2`**（`option --http2: the installed libcurl version does not support this`），所以 HTTP/2 结论只能来自 Python `ssl` 的 ALPN 协商，不能来自 curl 的 `%{http_version}`。

### 6.3 Caddy 边界（为什么 `/api/*` 是 404）

- `deploy/caddy/Caddyfile:40` 只有 `reverse_proxy web:3000`；另有 4 个 `handle`（`:24-39`）只服务搜索引擎验证文件：`/BingSiteAuth.xml`、`/googlea01c41ed599c5311.html`、`/dd3d6c883de8475fb7f2d7639208d313.txt`、`/b416920e453b400196646cfea16e885b.txt`（四者实测均 200；`/indexnow.txt` 为 404）。
- `deploy/docker-compose.prod.yml` 中只有 `caddy` 有 `ports: 80/443`；`api` 与 `web` 均无对外端口。
- `http://` → **308** 跳 `https://`。
- 因此 **`/api/v1/*` 对外不可达（实测 404）**，唯一对外的 API 间接面是 `/ics/{qualification}/{year}.ics` 与 `/ics/month/YYYY-MM.ics` 的字节透传。

---

## 7. 取不到的数据（必须由用户提供）+ 最小取数步骤

> 这一节是 Phase 1 的前置条件。修订版 V2 §6 Phase 1 要求「两周数据观察（GSC / Bing / GA4 / Caddy log / sitemap）」，但**本次审计在 `var/` 下未发现任何 GSC / Bing / GA4 导出**（`Get-ChildItem var -Recurse` 匹配 `gsc|search.?console|bing|ga4|analytics|indexnow|sitemap` 只命中旧快照 `var/sitemap-live.xml`、`var/live-audit/sitemap.xml` 与本次产物）。
> 因此下面 6 项**一律不得由推断填充**，只能等用户提供或等运维核实。

| #   | 缺什么                                  | 为什么需要                                                                                                    | 最小取数步骤（用户/运维侧）                                                                                                                                                                                                                                                                                   |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Q1  | **生产确切部署 commit**                 | `REPOSITORY_AUDIT` 与本文的「生产版本」只能反推到 PR 级别（#106/#109），无法确认是否还有本地未提交改动被部署  | 在 `/opt/jpqm` 执行 `docker compose -f deploy/docker-compose.prod.yml ps` 与 `git -C /opt/jpqm log -1 --format='%H %ci'`，或给镜像打 `GIT_SHA` 标签                                                                                                                                                           |
| Q2  | **生产库各表行数**                      | CI 夹具是 1007 条，但**生产库真实行数未知**；`sources`/`reviews`/`change_events` 在夹具里是 0，生产必然非 0   | 只读 SQL：`SELECT (SELECT count(*) FROM facts WHERE status='approved') AS facts, (SELECT count(*) FROM sources) AS sources, (SELECT count(*) FROM reviews) AS reviews, (SELECT count(*) FROM change_events) AS changes, (SELECT count(*) FROM snapshots) AS snapshots;`（用 `qualification_api_ro` 只读角色） |
| Q3  | **`apps/admin` 是否在生产运行**         | `deploy/docker-compose.prod.yml` **没有 admin 服务**，但 `README.md:52` 仍给出审核地址 → 审核入口是否可达未知 | `docker compose ps` 看是否有 admin 容器；或确认审核是在本地/内网进行                                                                                                                                                                                                                                          |
| Q4  | **GSC 数据（2026-11-10 ~ 2026-11-24）** | Phase 1 的核心输入：曝光、点击、CTR、平均排名、被索引页面数、抓取错误                                         | Search Console → 「效果」导出 CSV（日期/查询/页面/国家/设备）→ 「页面」→「索引」→「网页」导出未编入索引原因                                                                                                                                                                                                   |
| Q5  | **Bing Webmaster 数据（同期）**         | 与 GSC 交叉验证；站点已有 `BingSiteAuth.xml` 与 IndexNow key，说明已提交                                      | Bing Webmaster Tools → 「Search performance」导出 CSV                                                                                                                                                                                                                                                         |
| Q6  | **GA4 数据（同期）**                    | 行为数据：会话来源、落地页、参与度、事件（含 `sqc-analytics-consent` 的同意/拒绝比例）                        | GA4 → 「流量获取」/「参与度」/「事件」导出 CSV（属性 `G-G9SN61J5LS`）；**注意同意门控会让未同意用户不被计入**，导出时需注明                                                                                                                                                                                   |
| Q7  | **Caddy 访问日志**                      | 真实 UA、真实慢请求分布、5xx 计数（本次只能从外部探测）                                                       | `/opt/jpqm/deploy/caddy-logs/` 下的 access log（compose 已挂载该卷）；按天切片即可，不需要全量                                                                                                                                                                                                                |
| Q8  | **`event_type` 历史脏数据**             | `packages/db/migrations/0020` 曾重分类 983 行（921 行改值），是否仍有遗留未知                                 | `SELECT event_type, count(*) FROM change_events GROUP BY 1 ORDER BY 2 DESC;`                                                                                                                                                                                                                                  |
| Q9  | **真实用户行为（点击/滚动/放弃）**      | 「用户是否真的完成决策」无法从 HTML 推断                                                                      | 需 GA4 增强测量或热图工具；**本轮不做，且不建议为此新增第三方脚本**（会牵动 Cookie 同意与隐私政策）                                                                                                                                                                                                           |

---

## 8. 已充分验证的项（不需要再取数）

- sitemap 52 条逐条可达性、noindex、canonical 一致性、ld+json 存在性（`sitemap-check.txt`）。
- 20 个页面的 head 结构（title/description/H1/canonical/robots/og/twitter/ld）。
- 8 个页面 × 4 视口（1440/900/390/360）的渲染结果：全 200、H1 唯一、**横向溢出 0**、最小字号 12px、无 JS 错误、64 张截图已存档。
- 内链图（52 条 + `/`，孤儿页 0、两跳全达、入链计数）。
- 重复内容与薄内容的量化相似度。
- TLS/DNS/HTTP2/证书有效期/安全头/缓存头。
- gzip 与 identity 两种口径下的性能与可靠性。

---

## 9. 边界声明

- 本文件为**新增**文件；未修改任何既有文档、代码、配置、数据。
- 全部测量为**只读 GET**；未登录、未提交表单、未触发写操作。
- **未部署、未重启生产、未改 Caddyfile、未改 `.env`、未动 GA4/GSC/Bing 配置。**
- 未创建/删除/合并任何分支或 PR。
- §7 的 9 项均为「取不到」而非「没查」：已确认 `var/` 下无对应导出文件，且本次不申请生产服务器/后台访问权限。
