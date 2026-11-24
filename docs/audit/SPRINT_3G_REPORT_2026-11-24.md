# Sprint 3G 执行报告（2026-11-24）

## 1. 执行摘要

Sprint 3F 把告警接到了飞书，链路已经端到端打通（2026-11-25 生产自检成功）。但接通的过程本身暴露了两个问题，本轮只修这两个，其余一律不动。

**Task A（P0）：凭据诊断的区分度。** 3F 交付后 Owner 在 VPS 上自检**连续四轮失败**，每一轮的 stderr 都是同一句 `notify-feishu: FEISHU_WEBHOOK is not configured (set it in deploy/.env)`。而这四轮背后是四种完全不同的故障：代码没送到 VPS（文件不存在）、编辑器没保存（文件在但没这个键）、占位符被原样写入（值不是 URL）、以及真正的投递失败。同一句话覆盖四种情况，等于没有诊断——排查只能靠一轮一轮地试。

本轮把凭据解析拆成六个稳定的 `reason=` 码，并在报错里带上**绝对路径 + 文件大小 + mtime**（区分「找错文件」与「没保存」的唯一线索）和**值的形状**（`len=81 scheme=https host=open.feishu.cn quoted=no`，host 之后一律不打印）。

**Task B（P1）：把告警通道本身纳入日检。** 此前 `ops:daily` 检查来源、到期事实、待审队列，但不检查告警通道还能不能响。webhook 被重置、token 过期、机器人被移出群之后，告警会**静默消失**——比脚本报错更危险，因为没有任何信号。本轮让它读本地投递记录判断通道健康，其中 `channel_stale`（通道安静超过 14 天）专门抓这一类。

**两条硬约束都守住了**：`ops:daily` 仍然不发任何外部请求（只读本地文件 + 数据库只读查询）；凭据在任何输出路径上都没有出现。

## 2. Git 状态与基线

开工前：

```text
$ git status --short          # 无输出
$ git log --oneline -1        # 7a45b0f docs: 落账 Sprint 3F 执行报告
$ git branch --show-current   # chore/phase1-baseline
```

本轮内容 commit：**`79cebe2`** `feat(ops): 告警通道诊断与体检（Sprint 3G）`。

报告的落账方式沿用 3A–3F 的两段式：内容 commit 在前，本报告自身的 hash 回填（以及这份回填产生的改动）放在 `docs: 落账 Sprint 3G 执行报告` 收口 commit 里。原因见 3A 报告 §2：报告要写自己的 commit hash，存在天然的循环依赖，只能拆成两个。

## 3. 修改文件

| 文件 | 改动 | 性质 |
| --- | --- | --- |
| `scripts/notify-feishu.sh` | +200 −19 | Task A 主体 |
| `scripts/ops-daily-lib.mjs` | +145 | Task B 纯函数 |
| `scripts/ops-daily-report.mjs` | +29 | Task B 接线 |
| `config/source-ops.json` | +2 | 两个阈值 |
| `scripts/ops-daily-lib.test.mjs` | +170 | 11 条新用例 |
| `tests/notify-feishu.test.ts` | +240 −8 | 14 → 28 条用例 |
| `docs/runbook.md` | +53 | 失败模式表 + 投递记录 |
| `docs/audit/DEEPSEEK_HARNESS_SPRINT_3G_TASK.md` | 新建 | 任务文档 |

合计 7 个文件改动、1 个新建，+822 −19。

**没有改动的**：`/health`、`/ready`、`deploy/docker-compose.prod.yml`、`Caddyfile`、`Dockerfile`、`services/**`、`apps/**`、`packages/**`、`scripts/readiness-cron.sh`。

## 4. Task A：凭据诊断

### 4.1 六个 reason 的实测输出

全部在 WSL 内对真实脚本执行（`var/g-reasons.sh`，gitignored）：

```text
=== 1 env-file-missing ===
notify-feishu: FEISHU_WEBHOOK is not usable (reason=env-file-missing)
  file: /tmp/tmp.1BgaLUcMvf/nope.env (absent)
  hint: create it, or point FEISHU_ENV_FILE at the file that has the key
exit=1

=== 2 key-absent ===
notify-feishu: FEISHU_WEBHOOK is not usable (reason=key-absent)
  file: /tmp/tmp.1BgaLUcMvf/a.env (8 bytes, mtime 2026-11-25T00:34:16)
  hint: the file exists but has no FEISHU_WEBHOOK= line; append it: printf 'FEISHU_WEBHOOK=%s\n' '<webhook url>' >> /tmp/tmp.1BgaLUcMvf/a.env
exit=1

=== 3 value-empty ===
notify-feishu: FEISHU_WEBHOOK is not usable (reason=value-empty)
  file: /tmp/tmp.1BgaLUcMvf/b.env (16 bytes, mtime 2026-11-25T00:34:16)
  hint: the key is present but its value is empty; put the full webhook URL after the =
exit=1

=== 4 value-not-url ===
notify-feishu: FEISHU_WEBHOOK is not usable (reason=value-not-url)
  file: /tmp/tmp.1BgaLUcMvf/c.env (32 bytes, mtime 2026-11-25T00:34:16)
  value: len=16 scheme=none host=none
  hint: the value does not start with http:// or https://; it may still be the placeholder text
exit=1

=== 5 value-has-space ===
notify-feishu: FEISHU_WEBHOOK is not usable (reason=value-has-space)
  file: /tmp/tmp.1BgaLUcMvf/d.env (42 bytes, mtime 2026-11-25T00:34:16)
  value: len=26 scheme=https host=open.feishu.cn
  hint: the value contains a space or tab; paste only the URL
exit=1

=== 6 CR 剥离（之后连接失败）===
notify-feishu: stripped a trailing CR from FEISHU_WEBHOOK (Windows line ending)
notify-feishu: delivery failed (http=000 curl=7 reason=unreachable) after 3 attempt(s)
exit=1
```

### 4.2 判定优先级

`env-file-missing` > `key-absent` > `value-empty` > CR 剥离（不致命）> `value-has-space` > `value-not-url`。

CR 单独处理而不是拒绝：webhook token 不可能含 `\r`，只有一种正确解释，失败只会让调用方再改一遍文件。但剥离**会打一行提示**——静默修复一个调用方以为没问题的文件，本身就是另一种陷阱。

### 4.3 引号包装单独提示

测试时发现最常见的粘贴错误是 `FEISHU_WEBHOOK="https://..."`：`.env` 不是 shell 脚本，引号会**变成值的一部分**，URL 就不再是 URL。这种情况下 `describe_value` 会给出 `quoted=yes`，hint 直接说「去掉引号」。

### 4.4 值的展示边界

| 允许 | 禁止 |
| --- | --- |
| `len=`、`scheme=`、`host=`、`quoted=` | 完整 URL |
| 绝对路径、文件大小、mtime | token / secret |
| reason 码与修复提示 | host 之后的任何字符 |

既有断言 `never prints the webhook or the secret`（stderr 不含 `test-token` / `super-secret-value`）继续通过；新增的 `value-has-space` 用例也断言了同样的边界。

### 4.5 投递记录

每次投递结束（成功或失败）向 `var/notifications/feishu.log` 追加一行：

```json
{"at":"2026-11-24T16:34:17Z","ok":false,"http":null,"curl":7,"attempts":3,"reason":"unreachable"}
```

两个实现细节：

- **`http` 用 `null` 而不是 `000`**：curl 读不到响应时报 `000`，它既不是状态码，也不是合法 JSON 数字（前导零）。第一版写成了 `000`，实测发现会产出非法 JSON，已修。
- **写日志失败被吞掉**：目录建不了、磁盘满了，都不能成为「告警发不出去」的原因。有专门用例（`still delivers when the log directory cannot be created`）守着这条。

## 5. Task B：通知渠道体检

### 5.1 判定表

| 情况 | 级别 | reason |
| --- | --- | --- |
| 从未投递过 | info | `not_run` |
| 最近一次成功且在 14 天内 | info | `healthy` |
| 最近一次失败，连续失败 < 3 | warning | `recent_failure` |
| 连续失败 ≥ 3 | **critical** | `consecutive_failures` |
| 最近一次成功，但已超过 14 天 | warning | `channel_stale` |

阈值进 `config/source-ops.json`（`notificationFailureThreshold: 3`、`notificationStaleDays: 14`）。

### 5.2 为什么 critical 与来源故障同级

`hasCritical` 现在等于「有来源 critical **或** 通道 critical」。理由是因果性的，不是审美性的：通道挂了会让此后**所有**告警静默消失，包括本来应该报出来的来源故障。一个只会沉默的告警系统比没有告警系统更糟，因为它让人误以为一切正常。

### 5.3 `channel_stale` 只提示不下结论

14 天没有成功投递，可能是**一直没故障**（好事），也可能是 **webhook 早已失效**（坏事），日检无法区分——区分它需要真的发一条消息，而日检不许发外部请求。所以这一条给 warning 并写明「手动跑一次 `--test` 可区分」。

### 5.4 端到端实测

用一份构造的投递记录（3 次连续 `bad-token` 失败）跑真实 `ops:daily`：

```text
"notificationLevel": "critical"
"hasCritical": true
{
  "kind": "notification_channel",
  "target": "bad-token",
  "detail": "告警通道连续失败 3 次（最近 2026-11-25T00:00:00Z）；修好之前所有告警都发不出去"
}
EXIT=1
```

退出码从 0 变成 1，与来源故障的行为一致。

### 5.5 仍然不发网络请求

`ops:daily-report.mjs` 新增的代码只有 `existsSync` / `readFileSync` / `JSON.parse`。`BEGIN READ ONLY` 事务与查询集一字未改。runbook 的「日检不发外部请求」契约保持。

## 6. 安全复核

| 检查 | 结果 |
| --- | --- |
| `git diff` 内是否含真实 webhook token / DB 密码 / GA ID | 无 |
| 新建任务文档内是否含凭据 | 无 |
| 投递记录内是否含凭据 | 无（专门用例守着） |
| 诊断输出内是否含凭据 | 无（只到 host 为止） |
| 测试用的假 token | `test-token` / `super-secret-value`，非真实凭据 |

## 7. 完整测试结果

| 检查 | 命令 | 结果 | 退出码 |
| --- | --- | --- | --- |
| 类型 | `pnpm typecheck` | 无输出 | 0 |
| 格式 | `pnpm format:check` | All matched files use Prettier code style | 0 |
| Lint | `pnpm exec eslint . --ignore-pattern "Python/**"` | 无输出 | 0 |
| 单测 | `pnpm test` | **24 files, 312 tests passed** | 0 |
| 门禁 | `pnpm test:verify-gate` | 51 tests passed | 0 |
| 构建 | `pnpm build` | 无输出 | 0 |
| Python | `pnpm test:python` | 239 passed | 0 |
| 端到端 | `pnpm verify:all` | 6 资格全过，`errors: []` | 0 |
| 日检 | `node scripts/ops-daily-report.mjs` | 正常产出，含新章节 | 1（既有 critical 来源，非本轮引入） |

用例数从 3F 的 298 增至 **312**（+14：`notify-feishu` 14→28 条，`ops-daily-lib` 11→22 条，其中既有 11 条不变）。

**关于 lint**：`pnpm lint` 裸跑会失败，原因是本地 `Python/` 目录里两个 `.deleteme` 残留的 `flamegraph.js` 解析报错。该目录被 `.git/info/exclude:8` 忽略、不在仓库里，与 3F 报告 §7 记录的处理方式一致（当时也是 `--ignore-pattern "Python/**"`）。这是环境残留，不是本轮引入。

## 8. 未处理问题

1. **`readiness-cron.sh` 的 `emit()` 仍是 `|| true`**，通知失败不会写进 syslog。现在的补救是 `ops:daily` 会读投递记录发现通道故障——但日检本身是手动/cron 跑的，如果它也不跑，就还是没人知道。
2. **投递记录没有轮转**。每次投递一行，健康稳态下一天最多几行，一年几千行，暂时无害；但如果将来接入高频告警，需要加轮转。
3. **`channel_stale` 的 14 天阈值是拍的**，没有生产数据支撑。合理值取决于真实故障频率。
4. **`bad-token` 与 `bad-signature` 的判定依赖飞书返回的 `code` 字段**，飞书改错误码就会退化到 `delivery-failed`。有兜底，不会崩，但分类会变粗。

## 9. 风险

| 风险 | 影响 | 缓解 |
| --- | --- | --- |
| `notify-feishu.sh` 变长（242 → 约 420 行） | 维护成本上升 | 每个新函数都有注释说明「为什么存在」；28 条用例覆盖 |
| 报错文案改变影响外部脚本 grep | 若有外部监控 grep `is not configured`，会失配 | 仓库内无此类消费方（已 grep 确认）；runbook 已更新 |
| 新增 `var/notifications/feishu.log` 写盘 | 磁盘占用 | 每行约 110 字节，可忽略 |
| `hasCritical` 语义扩大 | 通道故障会让日检退出码变 1 | 这是**有意**的；日检的退出码本来就表示「今天需要有人看」 |

## 10. 下一步建议

**P1（建议下一轮）：把 `ops:daily` 接进 cron。** 现在它是个手动命令，通道体检的价值取决于它被定时执行。这不是本轮范围（需要碰 crontab，属运维授权），但它是让 §8.1 那个缺口真正闭合的最短路径。

**P2：投递记录轮转。** 与 P1 配套。

**P3：`/pass-rate/` 单资格故障观测**（3A Task C 的后续，Owner 已定保留整页 503，需要的是观测而不是改行为）。

**P4：G-15 测试缺口**（`apps/web/src/server.ts` 19 条路由无进程级测试）。

**P5：`/ready` 外部可观测性。**

另外仍然悬着：**Sprint 3A–3F 的代码还没上生产**。VPS 上只取了两个宿主机脚本，上游超时、sitemap XML 错误体、配置门禁、`/ready` 都还在分支里。这属于正式发布，需要 Owner 单独授权。

## 11. 停止声明

本轮到此为止。

Task A 与 Task B 已按任务文档完成并通过全部检查。**没有**继续处理 §8 列出的未处理问题，**没有**进入生产发布，**没有**改动 `/health`、`/ready`、compose、Caddy、Dockerfile，**没有**碰任何 3A–3F 的既有行为。

下一步由 Owner 根据本报告决定。