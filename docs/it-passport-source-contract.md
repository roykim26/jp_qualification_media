# IT Passport 来源与字段契约

更新时间：2026-08-11

## 目标

验证 CBT/动态公告场景的来源边界和字段映射，不在本阶段生成或写入动态事实。

## 官方来源登记计划

| source id                              | URL                                                                   | 允许域名               | 用途                                   |
| -------------------------------------- | --------------------------------------------------------------------- | ---------------------- | -------------------------------------- |
| `source:it-passport:ipa-exam`          | `https://www.ipa.go.jp/shiken/`                                       | `www.ipa.go.jp`        | 制度公告、考试要纲、特别措施和统计入口 |
| `source:it-passport:jitec-home`        | `https://www3.jitec.ipa.go.jp/JitesCbt/`                              | `www3.jitec.ipa.go.jp` | CBT 考试说明、报名流程和官方 FAQ       |
| `source:it-passport:jitec-application` | `https://www3.jitec.ipa.go.jp/JitesCbt/html/application/applies.html` | `www3.jitec.ipa.go.jp` | 报名规则和可选考试日期说明             |

页面是登记入口，不代表页面上的所有文本都能直接转成事实。所有实际字段仍必须绑定快照、解析规则和审核记录。

## 字段映射边界

| 事实键                 | 允许来源              | 风险   | 处理规则                                         |
| ---------------------- | --------------------- | ------ | ------------------------------------------------ |
| `exam_method`          | JITEC 考试说明        | medium | 只读取明确标注的 CBT/特别措施文字                |
| `application_rule`     | JITEC 报名页          | high   | 保存官方原文片段，禁止推导统一报名窗口           |
| `exam_date`            | 具体报名/公告页面     | high   | 仅提取明确日期；不得从当前日期或示例文本推算     |
| `application_deadline` | 具体报名/公告页面     | high   | CBT 可能按场次变化，必须按页面声明的适用范围保存 |
| `fee`                  | 官方考试要领/报名说明 | high   | 只有明确金额和适用条件同时存在时才生成候选       |
| `exam_content`         | JITEC 考试内容页      | medium | 保存版本号和原文范围，制度变化进入审核           |

本资格没有固定的全年统一考试日历；未发现明确日期时必须保持 `awaiting_official`，不能生成伪日期。

## 受控抓取计划

1. 只允许 HTTPS 和登记域名；重定向仍必须通过 `SafeFetcher` 校验。
2. 先抓入口页并保存快照，再按登记链接抓取具体页面。
3. 仅提取明确标题、表格或结构化标记下的字段；解析失败不得产生候选。
4. 日期、费用、制度和报名条件默认 `high + pending_review`。
5. 页面结构变化、来源冲突或适用范围不明时只生成异常记录，不更新正式事实。
6. 首次真实读取前先用离线快照夹具覆盖 CBT 页面、公告变化、404 和结构失效。

## 本轮实现与验收

- 已完成离线快照适配器：显式字段提取、内容哈希和来源绑定。
- 已覆盖 CBT 页面字段、公告字段变化、结构失效和 404。
- 日期、费用、报名规则等高风险字段固定生成 `high + pending_review` 候选。
- 页面结构失效只生成解析异常，不生成候选事实。
- 测试夹具位于 `fixtures/official-snapshots/it-passport-*.html`，均为 synthetic 数据。

## 当前结论

离线解析边界、真实快照分析、显式授权的本地候选入库、审核队列和公开读取/展示链路均已完成本地验收。当前仍不等同于生产事实：真实候选必须人工审核，公开 API 继续过滤 synthetic 事实；实时定时采集、生产发布、正式认证和外部通知不在本阶段范围。

本地 fixture 候选入库命令要求同时设置 `STAGE2_LOCAL_WRITE=1`、`DATABASE_URL`、`IT_PASSPORT_FIXTURE` 和明确的 `IT_PASSPORT_EXAM_YEAR`，入口为 `services/collector/src/collector/ingest_it_passport.py`。审核队列地址为 `/review/it-passport`。fixture 候选保留 `synthetic=true`，不会进入公开 API。
