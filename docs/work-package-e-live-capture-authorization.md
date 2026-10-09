# 工作包 E：受控官方快照采集授权单

本授权单只覆盖工作包 E 已识别的本地证据缺口。签署/明确确认前，禁止向外部站点发起请求、保存新真实快照、生成候选或写入数据库。

## 请求范围

| 资格     | 已登记 source_id                                                                                                                                                                                                                                    | 允许域名                             | 目的                                                             |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------- |
| 宅建     | `source:takken:retio-exam`                                                                                                                                                                                                                          | `www.retio.or.jp`                    | 报名、费用、考试规格、评分与合格标准。                           |
| 行政书士 | `source:gyoseishoshi:home`、`source:gyoseishoshi:abstract`、`source:gyoseishoshi:guide`                                                                                                                                                             | `www.gyosei-shiken.or.jp`            | 2026 报名、试验、结果与合格标准。                                |
| 日商簿记 | `source:bookkeeping:home`、`source:bookkeeping:network`、`source:bookkeeping:calendar-2026`、`source:bookkeeping:class1-exam`、`source:bookkeeping:class2-exam`                                                                                     | `www.kentei.ne.jp`                   | 统一/网络/团体试验按等级和方式区分的日程、报名、规格与合格标准。 |
| FP       | `source:fp:jafp-home`、`source:fp:jafp-2-3-outline`、`source:fp:jafp-1-outline`、`source:fp:kinzai-home`、`source:fp:kinzai-1-academic`、`source:fp:kinzai-1-practical`、`source:fp:kinzai-2`、`source:fp:kinzai-3`、`source:fp:kinzai-eligibility` | `www.jafp.or.jp`、`www.kinzai.or.jp` | JAFP CBT、金财 1 级 PBT/面接及 2/3 级的缺失维度。                |

IT Passport 和基本信息技术者当前已通过覆盖门禁，不属于本次读取范围。

## 不可扩大范围的约束

- [ ] 仅访问上表已登记的 HTTPS URL；任何重定向仍须由 `SafeFetcher` 重验允许域名。
- [ ] 不使用 Cookie、登录态、代理、付费接口、生产数据库或生产对象存储。
- [ ] 只写入 `var/official-snapshots/<qualification>/` 的 HTML 与采集报告；不运行候选摄取、审核、批准、release baseline 或 CI fixture 更新。
- [ ] 每个响应记录最终 URL、HTTP 状态、内容 SHA-256、字节数和 UTC/JST 采集时间。
- [ ] 仅从明确标题、表格或结构化字段中提取；遇到 404、结构变化、适用维度不清或来源冲突时停止该来源，不创建候选。
- [ ] FP 和日商簿记必须保留 provider、level、component、delivery mode；禁止跨机构、等级、科目或实施方式复用值。
- [ ] 抓取完成后先更新本地审计记录和解析测试，再由项目所有者另行授权候选入库与审核。

## 运行环境确认

- [ ] `NODE_ENV` 不是 `production`。
- [ ] 不配置 `DATABASE_URL`；本步骤不需要数据库。
- [ ] 采集器使用项目的 `SafeFetcher`，不绕过 HTTPS、超时、重试、缓存、响应大小或重定向限制。
- [ ] 本次授权仅限一次受控读取；不建立定时采集或持续监控。

## 项目所有者确认

授权人：________________

授权日期（JST）：2026-09-08（项目所有者通过本任务会话确认）

允许执行窗口（JST）：一次性受控读取，已于 2026-09-08 执行完毕

备注（可选）：18 个登记来源均仅保存本地快照和采集报告；未写入数据库。

确认文本可直接使用：

> 我确认并授权按照本文件所列的 URL、域名、一次性窗口和仅保存本地快照的限制执行工作包 E 受控采集；不得写入数据库、生成候选或批准事实。

## 授权后的执行顺序

1. 逐源运行 capture-only 流程，并记录成功、未变化、404、重定向拒绝或结构异常。
2. 对新快照做哈希复核与离线解析，不产生候选。
3. 更新 `docs/data-local-snapshot-audit-2026-09-07.md`，说明每个缺口是否获得明确证据。
4. 单独请求候选入库和审核授权；采集授权本身不包含该权限。
