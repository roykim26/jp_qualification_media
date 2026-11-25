# DSH 任务延迟基线（2026-11-25）

| 项       | 值                                                                           |
| -------- | ---------------------------------------------------------------------------- |
| 观测窗口 | 2026-11-18 00:44 ~ 2026-11-25 00:45（近 7 天）                               |
| 会话数   | 44（含 mnemon 委派微会话）                                                   |
| DSH 版本 | 0.2.2-rc.5（桌面端 `D:\Program Files\Deepseek Harness`）                     |
| 生成脚本 | `scripts/dsh-latency-audit.mjs`（`npm run audit:latency`，装了 pnpm 时等价） |
| 机器     | Windows 10，Node v24.14.0                                                    |

## 为什么需要基线

2026-11-25 对“随便一个任务都要超过半小时”做过一次实证分析，结论是延迟由四块叠加而成，且**通道是否命中前缀缓存**是第一位的可变因素：

1. 等人回答（`ask_user_question`，单次可达 11,432s）；
2. 工具执行（长命令、`wait=true` 轮询，单次 120–300s 多次）；
3. 模型生成（输出 738 token/步，解码速度全程 151–209 tok/s，**没有退化**）；
4. 未被缓存的前缀重算（trae 通道 cacheRead=0，每步重算 10 万+ token，TTFT 3.38s/步 vs 官方通道 1.2s/步）。

这份基线把上述结论固化成可复跑的判据，避免下次再靠翻会话手工统计。

机器可读快照：`docs/audit/DSH_LATENCY_BASELINE_2026-11-25.json`（44 条会话 + 9 个阈值），下次生成后用同样的字段做 diff。

## 数据源与口径

脚本直接读 DSH 本地记账，不依赖 GUI：

- 会话统计：`C:\Users\jinlo\.dsh\storages\session_projcache\sessions\*.json`
  - `sessionStats`：turns / steps / llmMs / toolMs / ttftMs / decodeMs / decodeTokens
  - `costUsage`：provider / model / totals{input, output, cacheRead, cacheWrite, cost}
  - `contextBreakdown.breakdown`：systemTokens / toolsTokens / messageTokens
- 事件流（`--session` 下钻时）：`C:\Users\jinlo\.dsh\sessions\<workspace>\<session>\session.v4.jsonl.zstd`（多 zstd 帧串接，脚本手工逐帧解压）

三个派生指标：

| 指标         | 定义                              | 含义                                                |
| ------------ | --------------------------------- | --------------------------------------------------- |
| cache        | `cacheRead / (cacheRead + input)` | 前缀缓存命中率；0% = 通道完全不支持缓存             |
| prefill/step | `ttftMs / steps`                  | 每步平均等待首 token 的时间，≈ 每步重算的上下文成本 |
| wall/step    | `(llmMs + toolMs) / steps`        | 每步实际墙钟；>20s 说明有阻塞型工具调用             |

## 判定阈值

脚本内置（`scripts/dsh-latency-audit.mjs` 顶部 `T`），步数 <20 的微会话不参与缓存/TTFT/墙钟判定，只参与工具 schema 判定：

| 判据         | WARN           | FAIL  |
| ------------ | -------------- | ----- |
| 缓存命中率   | <90%           | <50%  |
| prefill/step | >2.0s          | >3.0s |
| wall/step    | >15s           | >20s  |
| 单会话步数   | >300           | —     |
| 工具 schema  | >26,000 tokens | —     |

目标线：缓存 ≥90%、prefill/step <2s、wall/step <15s、单会话 <300 步。

## 7 天基线

- 判定：PASS 25 / WARN 1 / FAIL 18
- 中位缓存命中：**92.0%**
- 中位 prefill/step：**1.73s**
- 中位 wall/step：**19.1s**

## 通道对比（中位数）

| 通道                            | 会话数 | 中位步数 | 缓存     | prefill/step | wall/step | FAIL   |
| ------------------------------- | ------ | -------- | -------- | ------------ | --------- | ------ |
| deepseek-account/deepseek-flash | 11     | 47       | 97.0%    | 1.08s        | 12.4s     | 3      |
| trae/deepseek-v4.1-flash        | 19     | 33       | **0.0%** | 1.73s        | 7.8s      | **10** |
| workbuddy/deepseek-v4.1-flash   | 3      | 240      | 64.0%    | 1.68s        | 11.5s     | 1      |
| workbuddy/hy4flash-free         | 9      | 3        | 62.9%    | 2.09s        | 11.7s     | 3      |
| ?/?（无 costUsage 的旧会话）    | 2      | 66       | n/a      | 1.31s        | 24.1s     | 1      |

注意：通道中位数被大量 1–5 步的短会话稀释，trae 的 TTFT 劣势只在长会话暴露（见下表）。

## 长会话样本（>150 步）

| 会话                 | 通道                          | 步数              | 缓存  | prefill/step | 墙钟                 | 判定         |
| -------------------- | ----------------------------- | ----------------- | ----- | ------------ | -------------------- | ------------ |
| 25dcff28（当次诊断） | deepseek-account              | 62                | 95.3% | 1.28s        | 12m23s               | PASS         |
| d2176aff             | trae                          | 2,268（仍在增长） | 0.0%  | 3.38s        | 4.9h LLM + 6.0h 工具 | FAIL         |
| 483 步会话           | trae                          | 483               | 0.0%  | 3.04s        | 1.0h + 43m           | FAIL         |
| 347 步会话           | trae                          | 347               | 0.0%  | 2.22s        | 47m + 26m            | FAIL         |
| 313 步会话           | deepseek-account              | 313               | 99.8% | 1.49s        | 33m + 53m            | WARN（步数） |
| 240 步会话           | workbuddy/deepseek-v4.1-flash | 240               | 45.1% | 1.68s        | 28m + 20m            | FAIL         |
| 181 步会话           | workbuddy/hy4flash-free       | 181               | 7.5%  | 3.26s        | 28m + 7m             | FAIL         |

同一通道内 313 步（99.8% 缓存、1.49s/步）与 2,268 步（0% 缓存、3.38s/步）的差异，说明**步数大本身不是原罪，步数大 + 无缓存才是**；而 313 步会话的 53 分钟工具时间是任务设计问题（大量扫描类命令），不是模型问题。

## 每周复跑

```cmd
:: 用 cmd 重定向，避免 PowerShell 的 UTF-16 编码把中文写坏
cd /d E:\自建程序\jp_qualification_media
node scripts\dsh-latency-audit.mjs --since 7 --md > docs\audit\DSH_LATENCY_<YYYY-MM-DD>.md

:: 或者走 package.json 脚本（注意 npm 传参要加 --）
npm run audit:latency -- --since 7

:: CI / 门禁用：有 FAIL 时退出码 1
node scripts\dsh-latency-audit.mjs --since 7 --strict
```

对比上一次基线时看四件事：

1. 中位缓存是否仍 ≥90%；若某通道从 ≥90% 掉到 <50%，先查路由/代理（provider 配置、upstream 地址），不要先怀疑模型；
2. 中位 prefill/step 是否 >2s；涨了优先看 `toolsTokens`（插件增减）与 prompt 均值；
3. 新出现的 FAIL 是否都落在同一通道/同一类工具；
4. 单会话步数分布是否继续右移（>300 步会话变多 = 任务粒度需要拆）。

下钻单会话（含逐 turn / 逐工具的耗时与错误）：

```cmd
node scripts\dsh-latency-audit.mjs --session d2176aff
node scripts\dsh-latency-audit.mjs --since 7 --json
```

## 反模式清单（每次任务自查）

- [ ] 长任务不在 trae 通道跑（无前缀缓存）；官方通道留给 30 分钟以上的活。
- [ ] 后台任务用 `run_in_background` + 完成通知，不要 `job_output wait=true` 反复轮询（观测到 p90=300s）。
- [ ] 等待外部服务就绪用端口探测循环，不用 `Start-Sleep -Seconds 120`。
- [ ] 全树扫描先限定范围：`grep --include`、指定子目录、排除 `var\pglite-run`、`node_modules`、`.pnpm-store`、`.git`（工作区 30,409 文件，其中约 2.7 万是 PGlite 数据文件）。
- [ ] 不重复跑全量 `pnpm install` / `git status` / `tsc`；需要时用增量参数。
- [ ] 问题攒一批再问；`ask_user_question` 的等待会计入墙钟（单次可能几十分钟到几小时）。
- [ ] 一个会话别干到底：>300 步就拆任务、开新会话（上下文越大每步越贵，压缩也会让下一次调用重新付前缀）。
- [ ] 一次工具调用能解决的不要拆成多次 `read`；读文件前先 `grep` 定位。
- [ ] 插件按需开关：工具 schema 从 7,938 → 24,107 tokens 是逐步装插件的结果，每步固定多付。

## 已知噪声

- `mnemon-review-owner-v1-*` 委派微会话只有 1–4 步，会拉低通道中位数；判定时已用 `steps >= 20` 过滤。
- 仍在运行的会话（如 d2176aff）统计值会随时间增长，比对时以同一生成时刻为准。
- 11-19 前后的旧会话没有 `costUsage`，显示 `?/?` 且缓存 `n/a`，不参与通道对比。
- `projcache` 文件名有两种：`<uuid>.json` 与 `session-<uuid>.json`；脚本已统一取 uuid 前 8 位显示。
