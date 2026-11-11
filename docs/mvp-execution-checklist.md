# MVP 执行清单

基线：`20be7de`（2026-11-10）。执行分支：`feat/p0-1-core-facts`。

用户已要求按优先级自动逐项开发和验证；遇到真实数据批准、生产操作或缺少外部账号信息时再确认。完成必须有测试或验收证据，代码完成不等于已入库、已批准或已上线。

## P0：首发前完成

- [ ] 核心事实与分范围验收：IT Passport 的费用、条件、考试结构；FE 的费用、条件、评分标准及字段映射；簿记三级核心字段。FP 首发保持日本 FP 协会 2/3 级和金财 1 级已覆盖范围，页面明确范围，不暗示全覆盖。
- [x] 比较、详情和历史数据展示：按机构、等级、科目、方式区分，显示年度、确认时间和来源；已有评分字段进入正确栏目。
- [x] 可审计事实回滚：受保护的本机命令、明确目标版本、操作人和理由、事务测试、真实库演练。
- [ ] 生产 API 只读权限：运行账号与迁移管理账号分离，授权脚本幂等，真实库验证写操作被拒绝。

## P1：持续运营与近期补齐

- [ ] 来源巡检、连续失败记录、过期/失效告警、人工日检和生产数据更新流程；定时任务与外部通知安装前确认。
- [ ] 年度滚动：移除固定年度，验证 2027/2028 跨年，不生成未公布事实。
- [ ] 五资格最小合格率内容：先最近一期；宅建多来源、FE 附件解析；历史扩展不阻塞首发。
- [ ] 核心业务事件：搜索结果、比较、日历筛选、ICS 下载、来源展开、官方链接点击；不传敏感搜索原文。
- [ ] 审核新旧值对照：按完整事实身份匹配，保留风险、来源和理由。

## P2：主链完成后开发

- [ ] 资格目录高级筛选：仅按可信的已有数据筛选，未知值不猜测，参数页不收录。
- [ ] 月历/表格视图、合格率趋势图和 CSV：保留表格替代与逐项来源，兼容移动端与键盘。
- [ ] 独立更新详情页及报名说明：基于现有官方证据补正文，不自动新增事实。

## 上线验收

- [ ] 真实初始数据与快照可追溯，不能用 `ci://` 夹具冒充官方验证。
- [ ] 私密联系邮箱、纠错可达与接收验证；邮箱由用户提供，不捏造。
- [ ] GA/GSC 生产参数、收数、隐私与保留期；账号数据由用户提供。
- [ ] 桌面/移动端核心链路、空数据、过期日期、下载、日文内容验收。
- [ ] 真实环境 HTTPS、数据库备份、隔离恢复、代码及数据回退演练。

## 首版暂不实施

- AdSense 广告及相应同意管理：按建议先无广告首发，启用广告另行确认。
- 站内工单平台：先用现有 GitHub 纠错入口和私密邮箱。
- 账号、收藏同步、邮件提醒、社区、收费题库、新资格、自动批准与微服务拆分。

## 执行记录

- 2026-11-10：建立隔离工作树与执行清单，开始 P0 核心事实的离线取证与补齐；尚未启动数据库、联网抓取、入库、批准、提交或发布。
- P0 核心检查工具已实现：`npm run audit:mvp -- --year=2026` 只读事务核对正式事实、逐范围字段和真实溯源，无库退出 2，缺口退出 1。新旧门禁逻辑测试合计 21 项通过；这不是实库检查通过。
- 簿记三级按现有官方快照离线新增科目、时长、题数上限、合格标准及成绩发布规则。专项测试 40 项通过；保存的真实快照（哈希 `8ee5ec56…`）重算为 6 候选、0 issue，未入库、未批准。
- IT Passport／FE 的其他核心字段缺少本地官方明细证据，真实新采集、入库、批准以及数据库启动验证保留待授权；不以夹具补齐。先推进独立的 P0 展示修正。
- 2026-11-10 验收（本机 Chrome 无头 + fixture 预览，只读）：比较页 1280px 与 390px 下页面横向溢出均为 0；390px 下比较表在容器内横向滚动（可视 356px / 内容 760px，`overflow-x:auto`）；2 件选取时 11 条数值各自带机构・级别・科目・方式、年度与确认来源标签；0/1 件选取均显示「2件以上」引导态；点击「比較する」实际跳转到 `?qualifications=bookkeeping,fp` 并渲染表格。资格页面：`scoring_method` 归入「合格基準」，`practical_subject`／`interview_count` 归入「科目・出題内容」；详情页 11 个来源折叠块均可展开并显示官方链接、快照 ID 与确认状态；簿记合格率页 18 个历史数值按等级分组且逐项带来源。截图与读数在仓库外 `var/mvp-accept-*.png` 与 `var/mvp-accept-report.json`。
- P0-3 回滚命令已实现：`npm run rollback:fact -- --fact-id=<id> --operator=<name> --reason="…" [--to-revision=<id>] [--dry-run] --confirm=<fact-id>`。操作人与理由经校验后写入 `change_events.operator_id/reason`（迁移 0021）；`--confirm` 必须原样复述事实 ID，`--dry-run` 在事务内执行后 ROLLBACK，`--to-revision` 只接受该事实的历史批准版本；回滚后读取当前版本与页面可见值并输出 JSON。参数与守卫用例 8 项（vitest 合计 139 项）通过，CLI 无参数／缺 confirm／短理由／无库退出码实测为 2。
- 2026-11-10 P0-3 真实库演练（本机 `jpqm-pg18`@55432）：迁移 0021 应用后 `schema_migrations` 21→22，只新增两个可空列；对 FE `exam_schedule` 事实先 `--dry-run`（events 994、当前版本均未变），再带 `--confirm` 真实回滚，新事件带 `operator_id=rehearsal-local`、理由与 `affected_pages=["qualification:fundamental-it-engineer"]`，`/shikaku/fundamental-it-engineer/` 页面由「年間を通じて随時実施」变为回滚目标旧值；随后再次回滚恢复原版本。演练产生的 2 条事件已删除，计数回到 facts 982／revisions 994／events 994／pending 0。演练中修正 dry-run 报告：`to` 改为显示目标版本真值，`pageShowsRolledBackValue` 在 dry-run 为 `null`，并新增 `wouldCreate` 区分「将写入」与「已写入」。复跑 `verify:all` 6/6、pytest 171、vitest 139、format／lint／typecheck 全绿。
- 2026-11-10 P0-1 取证、适配器与本机审核队列：新增 IT Passport 的 `ipa-fee`、`ipa-exam-detail`、`jitec-faq` 与 FE 的 `ipa-fee` 来源及解析分支，六个 IT Passport 来源和 FE 费用页均 HTTP 200。IT Passport 解析出 10 条候选（费用 7,500 円；CBT、120 分、多肢選択式（四肢択一）、100 問；受験資格なし、三领域、综合 600 点且各分野 300 点），FE 解析出 1 条（`fee=7500`，`integer`，high）。经单独授权，9 条新候选写入本机审核队列：IT 8 条（2 条报名类候选此前已批准）、FE 1 条，全部 `pending_review`；`/review/it-passport` 待审核 8 条、`/review/fundamental-it-engineer` 待审核 1 条，审核未执行。库内 `facts` 仍 982，`candidate_facts` 994→1003，`snapshots` 35，`sources` 49；迁移 `0022_p0_1_core_fact_sources.sql` 已应用（`schema_migrations` 23），四条新来源均由 seed 绑定资格。首次入库把 `risk_level` 硬编码为 high，已修正为按候选写入并删除错误行重跑，结构类 5 条为 medium、费用/资格/合格标准 3 条为 high；新增回归用例后全量 pytest 179 项、相关用例 33 项通过。P0-1 仍未勾选，差人工审核与页面展示验证；当前 `verify:all` 因审核队列有官方待审候选变为 4/6（`it-passport` / `fundamental-it-engineer` 报 `official pending 8 != 0` 与 `pending 1 != 0`），审核后需复跑（同日已审核并复跑，见下条）。评分方式只在试验要纲 PDF 中公布，当前不产事实；FE 的报考资格与合格标准仅见于运营方 `cbt-s.com`，是否登记该域名待定。
- 2026-11-10 P0-1 本机审核与展示验证：经所有者授权，9 条候选全部批准（审阅人 `p0-1-owner-review`，理由逐条绑定对应官方快照证据）；IT Passport 8 条（结构类 5 条 medium、费用/资格/合格标准 3 条 high）与 FE 费用 1 条（high）进入正式事实。本机读数：`facts` 982→991、`fact_revisions`／`change_events`／`reviews` 均 994→1003、`candidate_facts` 1003、`pending_review` 0；`/review/it-passport` 与 `/review/fundamental-it-engineer` 待审核均为 0。页面回读确认 IT Passport 页每个新键各出现一次、FE 页「7,500円／90分／100分」各出现一次，`verify:all` 恢复 6/6。该批准只作用于本机库，CI 夹具与 release baseline 公开计数仍为 982。P0-1 仍未勾选：FE 的报考资格、评分标准与字段映射（`delivery_mode`／`exam_component` 维度及 fact_key 命名）尚未闭合，需所有者决策。
- 2026-11-10 本机环境：应用迁移 0022 时 Docker 端口映射一度失效，重启 Docker Desktop 后恢复；操作期间未改动任何正式事实，`reviews` 仍 994 条。
- 2026-11-11 P0-1 FE 口径拍板与代码落地：所有者确认四项——保留 `exam_subject_{a|b}_*` 键名并给门禁加科目映射、登记 `www.cbt-s.com` 为 FE 运营方来源、登记試験要綱 Ver.5.6 PDF 并新增最小 `pypdf` 解析、把 `application_rule`／`booking_window`／`venue_rule` 标为 `not_applicable`。已实现：`config/data-coverage-contract.json` 拆分 requirement；`verify-lib.mjs` 增加 `examComponent=subject-a|subject-b` 到 `exam_subject_{a|b}_{time|format|question_count}` 的匹配；迁移 `0023` 登记 `cbt-s`／`youkou-pdf` 两来源；FE 适配器解析资格与合格标准、PDF 解析 IRT，并给候选写入 `delivery_mode=cbt`／科目维度；`ingest_fundamental_it.py` 支持 `.pdf` 快照与维度列；迁移 `0024` 准备回填既有 FE 事实维度。离线验证用本机真实副本：cbt-s 页产出 `eligibility=どなたでも受験可能`、`passing_standard=各科目の評価点が基準点（600点）以上`；PDF 产出 `scoring_method=IRT`。测试：pytest 185、vitest 139、verify-gate 22、format／lint／typecheck／build 全绿。**尚未实抓、未入库、未批准、迁移 0023/0024 未应用**；回填后门禁预计只剩 eligibility／passing_standard／scoring_method 三项缺口，关闭后 P0-1 才可勾选。
- 已知边界：簿记 `applicants`／`examinees`／`pass_rate`／`passed` 在同一 `exam_year` 下存在多个场次候选（如 2006 年的 112/113/114），而事实维度没有 `exam_session`，默认「上一批准版本」可能取到另一场次的数值。回滚这类事实应显式 `--to-revision`；按场次隔离需把 `exam_session` 纳入这些事实的维度，属于数据模型变更，未在本轮处理。
