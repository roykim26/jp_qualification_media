# admin 后台生产部署与鉴权（2026-11-25）

## 1. 结论

审核队列与到期复核页面已具备上生产所需的鉴权与部署形态，本轮落地为：

- **路径式入口** `https://shikakucheck.com/admin/`：Caddy `handle_path /admin/*` 剥离前缀后反代到 `admin:3002`。
- **应用内 HTTP Basic**：账号配置在 `ADMIN_AUTH_USERS`（scrypt 加盐哈希），生产未设置时容器拒绝启动。
- **单一鉴权源**：Caddy 不重复做一层口令，避免轮换时两边不同步；`/admin/*` 响应额外加 `X-Robots-Tag: noindex, nofollow` 与 `Cache-Control: no-store`。
- 写入数据库的审核人身份改取**当前通过鉴权的账号名**，不再取全局 `ADMIN_REVIEWER_ID` 环境变量。

## 2. 为什么用路径而不是子域

`admin.shikakucheck.com` 没有 A 记录，只有 apex 指向 `47.79.87.163`；本仓库不掌握注册商 DNS，新增子域需要人工在注册商操作。路径式只需一次 Caddyfile 变更，HTTPS 证书沿用 apex，不新增 DNS 与证书配置。

## 3. 改动

| 文件                                    | 内容                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/admin/src/auth.ts`（新）          | `parseAuthUsers` / `hashPassword` / `formatAuthUser` / `verifyBasic`；严格校验条目，`timingSafeEqual` 比较，未知用户也跑一次 scrypt（等时）                                                                                                                                                                                   |
| `apps/admin/src/server.ts`              | `ADMIN_HOST` / `ADMIN_BASE_PATH` / Basic 鉴权；`authenticate(req)` 返回账号名；`jsLiteral` + `authScript` 把 `basePath`、`basicAuth` 注入页面脚本；三个写操作函数显式接收 reviewer 并写入 `reviews.reviewer_id`、`fact_revisions.verified_by`、`fact_retractions.reviewer_id`；根路径 `/` 返回后台首页（六资格审核/复核入口） |
| `scripts/admin-hash-password.mjs`（新） | 从 `ADMIN_PASSWORD` 或 stdin 读口令，输出一条 `ADMIN_AUTH_USERS` 条目                                                                                                                                                                                                                                                         |
| `deploy/docker-compose.prod.yml`        | 新增 `admin` 服务；caddy 依赖 admin healthy                                                                                                                                                                                                                                                                                   |
| `deploy/caddy/Caddyfile`                | `/admin` 308 → `/admin/`，`/admin/*` 反代并加 noindex 头                                                                                                                                                                                                                                                                      |
| `deploy/env.prod.example`               | `ADMIN_AUTH_USERS` 说明                                                                                                                                                                                                                                                                                                       |
| `tests/admin-auth.test.ts`（新）        | 解析、口令校验、畸形配置拒绝、CLI 脚本与解析器互通                                                                                                                                                                                                                                                                            |
| `docs/runbook.md`                       | 新增「admin 后台部署与鉴权」                                                                                                                                                                                                                                                                                                  |

本地开发保持原样：无 `ADMIN_AUTH_USERS` 时继续用 `x-reviewer-id` / `?reviewer=`，不要求改日常流程。

## 4. 上线步骤

```bash
# 1) 生成账号（口令 ≥12 位）
ADMIN_PASSWORD='…' node scripts/admin-hash-password.mjs operator

# 2) 写入生产 deploy/.env（已在 2026-11-25 完成）
#    ADMIN_AUTH_USERS=operator:scrypt:<salt>:<hash>

# 3) 部署
cd /opt/jpqm && git pull --ff-only
docker compose -f deploy/docker-compose.prod.yml up -d --build
```

## 5. 验收

- `GET /admin/review/takken`（无凭据）→ 401。
- 带正确 Basic → 200，页面内 `fetch` 前缀为 `/admin/internal/...`。
- 错误口令、未知账号 → 401。
- `/admin` → 308 到 `/admin/`。
- 响应头含 `X-Robots-Tag: noindex, nofollow`。
- `admin` 容器 healthy（健康检查把 401 视为存活）。

## 6. 回滚

- 只回退入口：从 `deploy/caddy/Caddyfile` 删掉两个 `handle` 块并 reload caddy，admin 容器可留在原地。
- 回退代码：`git revert` 本次提交后重新 `up -d --build`；`ADMIN_AUTH_USERS` 留空会让 admin 容器拒绝启动，不会以无鉴权状态暴露。

## 7. 遗留

- 首次口令为随机生成，交付后请轮换为本人口令（改 `deploy/.env` 后 `up -d admin`，不必重建镜像）。
- 3 条到期事实仍需人工确认（takken `payment_deadline_rule` ×2、it-passport `application_change_deadline_rule`），入口在 `/admin/reverify/<资格>`。
- 若将来接管 DNS，可平滑迁到 `admin.shikakucheck.com`：加站点块 + 去掉 `ADMIN_BASE_PATH`，应用代码无需改动。
