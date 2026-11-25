# DSH 延迟基线文件泄露处置报告（2026-11-25）

## 0. Git 基线

| 项目            | 值                                                                                                                                                   |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 仓库            | `E:\自建程序\jp_qualification_media`                                                                                                                 |
| 远端            | `https://github.com/roykim26/jp_qualification_media.git`（**public**）                                                                               |
| 泄露提交        | `8892e45`（`chore(audit): 提交 DSH 延迟审计基线与生成脚本`，2026-11-25 10:29:41）                                                                    |
| 改写范围        | `883e0e9..main` 共 11 个提交（无 merge 提交）；`883e0e9..chore/phase1-baseline` 共 2 个                                                              |
| 改写前 tip      | `main` = `be43cc2`、`chore/phase1-baseline` = `a4d38db`                                                                                              |
| 改写后 tip      | `main` = `bc5abaa`、`chore/phase1-baseline` = `8a577a4`                                                                                              |
| 本轮内容 commit | `8a5f6c6`（删掉悬空的 `audit:latency`，两分支同指此处）                                                                                              |
| 本轮报告 commit | `<REPORT_SHA>`（第二段回填这一行）                                                                                                                   |
| 回滚点          | `var/pre-rewrite.bundle`（4573056 B，`--all` 全量）、分支 `backup/pre-leak-main` = `be43cc2`、`backup/pre-leak-chore` = `a4d38db`、`refs/original/*` |

## 1. 执行摘要

`8892e45` 把一份 DSH 会话延迟基线提交进了**公开**仓库。该文件不是这个项目的产物：它统计的是本机 44 条 DSH 会话，其中 30 条去重后的 prompt 有 24 条属于别的项目（微信小程序、贵州省 3D 旅游地图、英伟达黄仁勋博客选题、`toolsbar.cn` 部署、`Agent-Autoloop`、`trea`/`qoder` 插件、生图智能体等），并带出三个本机绝对路径与一个 Windows 用户名。

凭据扫描（10 类模式：邮箱、`ghp_*`、`sk-*`、`AKIA*`、私钥头、`Bearer`、`ses_*`、`password=`、飞书 webhook、`"token": "…"`）在三个文件上**全部 0 命中**。所以这次泄露的是**路径与会话标题**，不是密钥。

处置：Owner 决策「改写历史 + force-push」。本机没有 `git filter-repo`，改用 `git filter-branch --index-filter`，把三个文件从 11 个提交的树里全部移除，两个分支都改写，再补一个提交删掉因此悬空的 `audit:latency`。

## 2. 泄露范围（定量）

三个文件在 `8892e45` 上的大小与体量：

| 文件                                              | 字节  | `--stat` 行数 | 路径命中 | 去重路径 |
| ------------------------------------------------- | ----- | ------------- | -------- | -------- |
| `docs/audit/DSH_LATENCY_BASELINE_2026-11-25.json` | 24848 | +805          | 5        | 3        |
| `docs/audit/DSH_LATENCY_BASELINE_2026-11-25.md`   | 8763  | +134          | 4        | 3        |
| `scripts/dsh-latency-audit.mjs`                   | 20000 | +672          | 0        | 0        |

### 2.1 路径

- `.json`：`E:\项目运营`、`E:\自建程序`、`E:\Dev_Progra`。**没有** `C:\Users\*`。
- `.md`：`C:\Users\jinlo`（2 处，含 `C:\Users\jinlo\.dsh\storages\session_projcache\sessions\*.json` 与 `C:\Users\jinlo\.dsh\sessions\<workspace>\<session>\session.v4.jsonl.zstd`）、`D:\Program Files\Deepseek Harness`、`E:\自建程序`。
- `.mjs`：干净。它是只读工具，不含任何采集结果。

### 2.2 会话标题

`.json` 顶层键是 `["thresholds", "sessions"]`，`sessions` 44 条，每条一个 `prompt`，去重后 30 条。逐条读过后，属于本项目的约 6 条（ShikakuCheck Sprint 1 / 3A 交接、三个只读审计员、`我让chatgpt给这个项目做了一次审计…E:\项目运营\05.shikaku`），**其余 24 条与这个项目无关**：

- 微信小程序上线 50 天的运营问题；
- 结合英伟达黄仁勋事件的博客选题；
- 贵州省 3D 旅游地图（含后续补景点/桥梁文案的那条）；
- 把项目部署到 `toolsbar.cn`；
- `Agent-Autoloop` 项目文件与代码；
- 用 `trea`/`qoder` 开发小产品、插件与积分；
- 「生图智能体」为一篇技术博客生成 5 张配图；
- 安装 `github.com/liyupi/awesome-vibe-coding`、`github.com/kaankiziltug/logo-design-sk`；
- 把一套中文信息图改成英文版（`E:\Dev_Progra`）。

### 2.3 与仓库里既有「先例」的区别

`8892e45` 的提交信息把 `docs/stage-log.md`、`docs/transition-handoff.md` 当作先例。核查后：

- `docs/stage-log.md` 只有 `C:\Program Files\Docker\Docker\Docker Desktop.exe`（软件安装路径，**不含用户名**）；
- `docs/transition-handoff.md` 只有 `E:\自建程序\jp_qualification_media`（**本项目自己的路径**）。

先例泄露的是「软件装在哪 / 本项目在哪」；`8892e45` 新增的是**用户名**与**其它项目的工作内容**。性质不同，不能用先例免责。

## 3. 暴露窗口与实证

- GitHub API：`roykim26/jp_qualification_media` → `private: False`、`visibility: public`。
- `raw.githubusercontent.com/roykim26/jp_qualification_media/8892e45/docs/audit/DSH_LATENCY_BASELINE_2026-11-25.json` → **HTTP 200，24848 bytes**，内容含 `E:\项目运营` 与 `微信小程序`。
- 暴露窗口：`8892e45` 提交于 2026-11-25 10:29:41，改写于同日 15:43。**约 5 小时**，期间文件可匿名下载。
- 期间是否有第三方抓取：**无法从本地判断**。GitHub 的 raw 缓存与任何派生 clone 都不受本次改写影响（见 §6）。

## 4. 处置

### 4.1 备份（先做，不可跳过）

```
git bundle create var/pre-rewrite.bundle --all      # 4573056 B，EXIT 0
git branch backup/pre-leak-main be43cc2
git branch backup/pre-leak-chore a4d38db
```

`var/` 在 `.gitignore` 里，bundle 不会被误提交。

### 4.2 改写

```
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch -f --index-filter \
  "git rm --cached --ignore-unmatch \
     docs/audit/DSH_LATENCY_BASELINE_2026-11-25.json \
     docs/audit/DSH_LATENCY_BASELINE_2026-11-25.md \
     scripts/dsh-latency-audit.mjs" \
  --prune-empty 883e0e9..main
```

对 `883e0e9..chore/phase1-baseline` 再跑一次（该分支只含 `8892e45` 与 `a4d38db` 两个待改写提交）。

结果：

| 分支                    | 改写前    | 改写后    |
| ----------------------- | --------- | --------- |
| `main`                  | `be43cc2` | `bc5abaa` |
| `chore/phase1-baseline` | `a4d38db` | `8a577a4` |

验证：

- `git ls-files` 对三个路径**无输出**（已不在树里）；
- `main` 提交总数改写前后都是 211（改写不改数量，`--prune-empty` 没有触发，因为每个提交都还改了别的文件）；加上 §4.3 的新提交后为 212；
- `git merge-base --is-ancestor 8a577a4 bc5abaa` → 0，**改写后两分支的祖先关系保持不变**。

### 4.3 修掉悬空引用

三个文件被移出树之后，`package.json` 的 `"audit:latency": "node scripts/dsh-latency-audit.mjs"` 变成悬空引用（`pnpm audit:latency` 必然 `MODULE_NOT_FOUND`，且 `scripts/package-scripts.test.mjs` 的前两条用例正是为此而建）。新增提交 `8a5f6c6` 删掉这一行，scripts 33 → 32。

`scripts/package-scripts-lib.mjs` 与它的 5 条用例**保留**：它们抓的是一类缺陷（脚本名指向不存在或未跟踪的文件），不是这一个实例。

### 4.4 分支对齐

`main` 与 `chore/phase1-baseline` 现同指 `8a5f6c6`。改写后 `chore` 是 `main` 的祖先，用 `git branch -f chore/phase1-baseline 8a5f6c6` 对齐，不需要额外提交。

## 5. 验证矩阵

| 检查                            | 命令                                                                                                                 | 结果                                                                                             |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| 三个文件已离开工作树            | `git ls-files <三路径>`                                                                                              | 空                                                                                               |
| 三个文件已离开历史（当前 refs） | `git log --all --oneline -- <三路径>`                                                                                | 只剩 `8892e45`（由 §6 的备份 ref 造成）                                                          |
| 分支祖先关系                    | `git merge-base --is-ancestor 8a577a4 bc5abaa`                                                                       | 0                                                                                                |
| 哪些分支仍含 `8892e45`          | `git branch -a --contains 8892e45`                                                                                   | 只有 `backup/pre-leak-*` 与 `remotes/origin/*`；`fix/footer-column-align` 等业务分支为 1（不含） |
| 悬空引用门禁                    | `node --test scripts/package-scripts.test.mjs`                                                                       | 5 pass / 0 fail                                                                                  |
| verify-gate（六文件）           | `node --test scripts/{verify-lib,mvp-coverage,staleness-lib,ops-daily-lib,query-shape-lib,package-scripts}.test.mjs` | 90 pass / 0 fail                                                                                 |
| 格式                            | `prettier --check package.json`                                                                                      | 0                                                                                                |
| 静态检查                        | `eslint . --ignore-pattern "Python/**"`                                                                              | 0                                                                                                |
| 提交信息编码                    | `git cat-file commit HEAD` 首字节                                                                                    | `7472656520`（`tree `），`HAS_BOM=false`、`CRLF=false`                                           |

## 6. 残余风险

**改写只覆盖本地两个分支，下面这些仍然持有旧对象：**

1. **`refs/pull/1..112`** —— GitHub 为每个 PR 保留的引用。它们指向的是历史 PR 的 head，其中是否包含 `8892e45` 取决于 PR 时间；`8892e45` 未经过 PR，**大概率不在其中**，但本地无法验证，需要 GitHub 侧确认。
2. **GitHub 的服务端缓存与 GC** —— force-push 之后，旧对象在 GitHub 上进入「不可达」状态，但不会立即删除。`raw.githubusercontent.com` 对**旧 SHA 的直链**可能仍能取到（本次未验证旧 SHA 直链，避免再次确认可用性）。
3. **派生 clone / fork / 本地其他人的副本** —— 任何在 10:29–15:43 之间 `git clone` 或 `git pull` 过的人，本地仍保有完整对象。
4. **`refs/original/refs/heads/chore/phase1-baseline`、`backup/pre-leak-main`、`backup/pre-leak-chore`** —— 这是我刻意保留的本地回滚点，**不会被 push**，但它们让 `git log --all -- <路径>` 仍能查到 `8892e45`。确认不再需要回滚后应删除。
5. **`var/pre-rewrite.bundle`** —— 同上，gitignored，仅本地。

**结论：这次泄露的对象是路径与会话标题，不含凭据，因此不构成必须轮换密钥的事件。** 但如果 Owner 认为「本机目录结构 + 其它项目在做什么」本身敏感，则需要按 §7 处理。

## 7. 未处理问题

1. **旧 SHA 直链是否仍可访问未验证** —— 刻意不做，避免在报告里再写一次可用的 URL。
2. **`refs/pull/*` 是否含泄露对象未验证** —— 需要 GitHub API 逐个 PR 比对，成本高、收益低（`8892e45` 未经 PR）。
3. **是否联系 GitHub Support 强制 GC** —— 只有在「必须让旧对象彻底消失」时才需要，当前判断为不需要。
4. **`8892e45` 是谁提交的未查明** —— reflog 显示创建于 10:29:41，提交信息文件 `var/commit-msg2.txt` 不是我写的。本机只有一个 git 身份，无法区分。**这条要如实留着，不要假装查清了。**
5. **`883e0e9`（同一批里的另一个非我提交）已保留** —— 它是真实修复（cron 测试里 `$PATH` 被单引号冻住导致 Linux 上 exit 127），不含泄露内容，改写时未动它。

## 8. 下一步建议

1. **P0 — force-push 两个分支**（Owner 已授权）：`git push --force-with-lease origin main chore/phase1-baseline`，然后用 `git ls-remote origin` 核对远端 SHA 等于 `8a5f6c6`。
2. **P1 — push 后验证 404**：对**新 SHA** 请求三个路径应 404；对旧 SHA 不做验证（理由见 §7.1）。
3. **P1 — 观察 24 小时后删除本地回滚点**：`refs/original/*`、`backup/pre-leak-*`、`var/pre-rewrite.bundle`。删之前确认远端两个分支都能正常 `clone`。
4. **P2 — 把「不得提交本机绝对路径与会话标题」写进 `docs/next-round-ticket.md` 的铁律**，并在 `scripts/` 加一条扫描门禁（复用 `package-scripts-lib` 的注入式设计），在 `verify-gate` 里拦住下一次。
5. **P2 — 其它分支未改写，但已核实不含泄露提交**：`git branch -a --contains 8892e45` 只列出 `backup/pre-leak-*` 与 `remotes/origin/*`；`fix/footer-column-align`、`chore/dev-env-file`、`feat/p0-1-core-facts`、`feat/prod-pg18`、`feat/prod-pg18-mount` 都不含它。push 前不必处理这些分支。

## 9. 停止声明

本轮只做「把已泄露的文件从公开历史里移除 + 修掉因此悬空的脚本引用」。**没有**修改任何业务代码、数据库、生产环境、Caddy 配置或部署脚本；**没有** force-push（等 Owner 授权后的下一步）；**没有**删除本地回滚点。下一步按 §8 执行，不自行进入其它待办。
