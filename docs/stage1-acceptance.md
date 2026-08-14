# 阶段 1 归档与验收记录

更新时间：2026-08-13

## 范围

本记录归档宅建（`takken`）与 IT Passport（`it-passport`）阶段 1 的本地数据链路和用户端验收。未执行生产发布、生产对象存储写入或生产数据库写入。

## 已验收能力

- RETIO 官方来源登记、允许域名和受控抓取策略。
- 官方快照哈希、候选事实、风险分级和人工审核。
- 6 条真实页面候选事实均绑定官方来源和本地真实快照。
- 批准事务写入 revision、正式事实和 change event。
- 公开读取只返回已批准且非 synthetic 的事实。
- 构建失败保留上一版本，受控回滚后恢复一致。
- 候选重复入库和重复批准具备幂等保护。
- IT Passport 来源登记、离线解析、真实快照分析、候选入库和审核队列已接入统一事实链。
- IT Passport 真实候选保持 `pending_review`，未执行批准；synthetic fixture 批准结果不会进入公开 API。
- 两个资格共用 overview、application、exam-content 页面模板和来源/状态组件。
- `/shikaku/` 目录仅展示宅建和 IT Passport；其他四个资格不生成空页面。
- 页面通过公开 API 读取，缺少非 synthetic 已批准事实时显示 `公式発表待ち`。

## 本地数据库验收结果

```json
{
  "pending": 0,
  "approvedFacts": 6,
  "approvedRevisions": 6,
  "changeEvents": 6,
  "valid": true
}
```

6 条宅建已批准事实均来自 RETIO 官方来源和真实快照；IT Passport synthetic fixture 不进入公开 API。

## 用户端路由验收

已验证页面范围：

- `/shikaku/`
- `/shikaku/takken/`
- `/shikaku/takken/application/`
- `/shikaku/takken/exam-content/`
- `/shikaku/it-passport/`
- `/shikaku/it-passport/application/`
- `/shikaku/it-passport/exam-content/`

验收结果：本地 API/Web 联调中，上述 7 个页面全部返回 HTTP 200，目录页包含两个阶段 1 资格，宅建和 IT Passport 页面均展示对应资格或 `公式発表待ち` 状态；Web/API 进程在连续请求后保持运行。公开 API 不可用时仍返回安全错误页，不回退到 fixture 或推测数据。

联调期间发现并修复宅建旧 API 路由返回非标准 `facts` 对象的问题；现在 `/api/v1/qualifications/takken` 与通用 `/:slug` 接口统一返回 `status/facts/officialVerifiedAt` 结构。

## 验证记录

- TypeScript 类型检查：通过。
- TypeScript 构建：通过。
- Python 非实时抓取测试：25/25 通过；实时抓取相关 3 项未在本轮执行，避免触发网络读取和 pytest 临时目录权限问题。
- Vitest：当前受 Windows 沙箱 `spawn EPERM` 限制，未完成运行；页面渲染和 API 路由测试已补充，需在非受限环境重跑。
- 生产数据库、生产对象存储和生产发布：未执行。

## 未纳入本阶段

- 生产部署、生产密钥、生产备份和监控。
- 生产级后台身份认证。
- 生产级后台身份认证、定时调度和通知服务。
- 资格比较、年度日历、合格率、费用和更新中心等跨资格工具。
- 其他四个资格的采集器和正式页面。

## 结论

阶段 1 用户端和数据链路作为本地可重复验收闭环归档。进入阶段 2 前，建议在非受限环境重跑 Vitest，并由项目所有者逐条确认 IT Passport 真实候选；在确认前不得批准或公开这些候选。
