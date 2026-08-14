# IT Passport 实时抓取前人工授权清单

更新时间：2026-08-12

本清单用于授权一次受控官方页面读取。完成前不得执行实时抓取、真实快照保存或候选事实入库。

## 业务范围

- [ ] 只读取 IT Passport，不读取其他资格。
- [ ] 只读取已登记的 IPA/JITEC 页面。
- [ ] 本次读取目标：入口页、CBT 说明页、报名页或指定公告页（逐项填写）。
- [ ] 明确读取时间窗口和 JST 记录时间。

## 安全与运行环境

- [ ] Docker PostgreSQL/MinIO 为本地实例，未配置生产连接。
- [ ] `NODE_ENV` 不是 `production`。
- [ ] `DATABASE_URL` 主机为 `127.0.0.1` 或 `localhost`。
- [ ] 不使用生产对象存储、生产密钥、代理 Cookie 或登录态。
- [ ] 所有请求通过 `SafeFetcher`，不绕过域名、HTTPS、超时、重试、缓存和重定向限制。

## 页面和字段范围

- [ ] 允许域名为 `www.ipa.go.jp` 或 `www3.jitec.ipa.go.jp`。
- [ ] 页面 URL 已在 `docs/it-passport-source-contract.md` 登记，未临时扩大范围。
- [ ] CBT 页面只提取明确标记的考试方式/考试内容字段。
- [ ] 报名和公告页面的日期、费用、报名规则默认 `high + pending_review`。
- [ ] CBT 动态场次没有被错误转换为全年统一日历。
- [ ] 页面结构变化、404、来源冲突或适用范围不明时停止候选生成。

## 验收与后续动作

- [ ] 保存响应状态、最终 URL、内容哈希、大小和抓取时间。
- [ ] 快照保存位置为本地 `var/official-snapshots/it-passport/`，不提交生产种子。
- [ ] 先查看候选和原文，再逐条决定 `approve`、`reject` 或 `defer`。
- [ ] 未经人工复核的候选不得进入公开 API 或公开页面。
- [ ] 本次读取完成后记录结果、异常和下一次抓取建议。

授权人：________________

授权日期（JST）：________________

授权备注：________________

## 执行入口

完成以上清单并由项目所有者明确授权后，才可设置 `IT_PASSPORT_LIVE_AUTHORIZED=1`，执行 `services/collector/src/collector/capture_it_passport.py`。该命令只保存本地 HTML 快照和 JSON 报告，不自动生成候选事实。
