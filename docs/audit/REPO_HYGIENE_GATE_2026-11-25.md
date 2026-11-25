# 仓库卫生门禁（REPO_HYGIENE_GATE）执行报告 — 2026-11-25

## 0. Git 基线

| 项目            | 值                                                  |
| --------------- | --------------------------------------------------- |
| 仓库            | `roykim26/jp_qualification_media`（**公开**）       |
| 分支            | `chore/phase1-baseline`（与 `main` 同 SHA）         |
| 执行前 HEAD     | `3c79940`（`docs: 补记 force-push 之后的实测结果`） |
| 本轮内容 commit | `b15feb1`（第二段提交这份回填）                     |
| 生产运行版本    | 未变（本轮无部署）                                  |

两段式：第一段提交内容，第二段把上面那行的占位换成真实 hash。回填 hash 会改变表格列宽，所以第二段提交前必须重跑 prettier。

## 1. 摘要

上一轮把一次数据泄露处置完了（`docs/audit/DSH_BASELINE_LEAK_2026-11-25.md`），但**处置只解决了已经发生的那一次**。本轮加的是让它不能悄悄再发生一次的机制：

```text
scripts/repo-hygiene-lib.mjs        纯函数：扫描、规范化、允许清单匹配
scripts/check-repo-hygiene.mjs      读暂存区，跑扫描，非零退出码
scripts/repo-hygiene-allowlist.json 13 条历史豁免，每条带理由
scripts/repo-hygiene-lib.test.mjs   17 条用例
```

接入点：`test:verify-gate`（7 个文件）+ 新增 `hygiene:check` + `release:check` 里插一道。

结论：`pnpm run hygiene:check` 在干净树上 `EXIT=0`（`337 tracked text file(s) clean, 12 skipped, 13 allowlisted hit(s)`），六个变异全部被抓。

## 2. 为什么要门禁

`8892e45` 把一份 DSH 会话延迟基线提交进了公开仓库，里面有：

- 3 个本机盘符路径（含检出目录与另一个项目目录）；
- 用户目录形式的绝对路径；
- 30 条 distinct 会话提示词，其中 24 条属于其它项目（微信小程序、贵州 3D 地图、博客选题、第三方工具项目等）。

凭据扫描（10 类模式）0 命中，所以不是密钥泄露；泄露的是**本机目录结构与会话标题**。处置是历史重写 + force-push，但那次能发生，是因为**没有任何一步会去看「这个文件里有没有本机路径」**。代码评审看逻辑，测试看行为，两者都不看「这行字符串是不是一台真实机器的目录」。

门禁补的就是这一步。

## 3. 三个设计问题与解法

写这个门禁时连续撞上三个「门禁会把自己报出来」的问题，每一个都会让允许清单从第一天起就在说谎。

### 3.1 允许清单会把自己报出来

清单必然要写出它要豁免的那些值。如果值原样写成反斜杠形式，清单文件本身就包含一个扫描器能匹配的字符串，于是它需要豁免自己；豁免自己之后，下一个豁免值又要再豁免一次——清单会自我增殖。

解法：给清单条目规定一种**规范形式**——反斜杠转正斜杠、去掉前导斜杠。

```js
export function canonicalPath(value) {
  return String(value).replace(/\\/g, '/').replace(/^\/+/, '');
}
```

清单里写 `E:/work`、`Users/alice`、`C:/Program`，两边比较前都过 `canonicalPath`。这样清单文件不含任何扫描器能匹配的字符串，**清单不需要豁免自己**。

### 3.2 测试夹具会把自己报出来

测试必须构造盘符路径与 home 路径样本，字面量一写进门禁就报自己。这不是靠加豁免能解决的——豁免清单会长到没人读。

解法：**运行时拼装**。

```js
const SEP = '\\';
function winPath(...parts) {
  return parts.join(SEP);
}
function homePath(root, user) {
  return `/${root}/${user}`;
}
```

样本用 `alice`/`work` 而不是真实用户名与真实目录。门禁跑在仓库上，拼装出来的字符串不在文件里。

这一条在实现时被违反过一次：有一条断言直接把 home 路径字面量写死（`canonicalPath` 接收 home 目录形式的完整字符串），门禁立刻报出该测试文件自己。改成用 `homePath('Users', 'alice')` 拼装才过。

### 3.3 唯一真正需要豁免的

`scripts/repo-hygiene-lib.test.mjs` 必须含一段 dump 形状的字面量，否则无法证明检测器会触发。

```json
{
  "path": "scripts/repo-hygiene-lib.test.mjs",
  "kind": "sessionDump",
  "value": true,
  "reason": "the detector's own test has to contain a dump-shaped literal to prove the detector fires"
}
```

这是 13 条豁免里唯一一条属于本轮新增代码的，其余 12 条都是历史文档。

## 4. 正则收紧：16 → 7

初版盘符路径正则：

```js
/[A-Za-z]:\\+[^"\\,\n]{1,80}/g;
```

第一次跑报 16 条 distinct，其中 3 条是源码：一条 JS 正则字面量、一条 `g:\s*$` 的行尾锚点、一条模板字面量。**门禁第一次运行就把源码报成路径，允许清单从一开头就在说谎。**

收紧为排除正则元字符：

```js
export const windowsPathPattern =
  /^[A-Za-z]:\\+[^\s"\\,;'`$(){}*+[\]?|]{2,80}$/gm;
```

结果 **16 → 7 distinct、14 → 10 files**，源码误报清零，真实路径一条不少。

## 5. 读暂存区，不读 HEAD

`check-repo-hygiene.mjs` 用 `git show :<file>` 读**暂存区**的 blob。

第一次实现读的是 `git show HEAD:<file>`，结果是：我脱敏完报告但还没提交时，门禁仍然报出旧值。这不只是不方便——它意味着**门禁永远看不到你正要提交的内容**，而「正要提交的内容」恰恰是唯一要紧的东西。

改成暂存区之后语义也更准：门禁回答的是「一次 fresh clone 会拿到什么」。

## 6. 变异验证

`var/mutate-hygiene.mjs`，6 个变异，逐条写盘后 `readFileSync` 复核 `landed`：

| #   | 变异                                              | 期望失败的用例         | 结果                             |
| --- | ------------------------------------------------- | ---------------------- | -------------------------------- |
| 1   | `windowsPathPattern` 放宽回 `[^"\\,\n]{1,80}`     | 正则/模板字面量不误报  | CAUGHT                           |
| 2   | `entries` 不按 `entry.path === file` 过滤         | 跨文件不泄漏           | CAUGHT                           |
| 3   | 匹配时忽略 `entry.kind`                           | 同值不同 kind 不得抑制 | **首轮 MISSED**，补样本后 CAUGHT |
| 4   | `const wanted = value`（不走 canonical）          | canonical 形式仍匹配   | CAUGHT                           |
| 5   | `looksLikeSessionDump` 只判 `"sessions"` 一个 key | 需两个 key 才算 dump   | CAUGHT                           |
| 6   | `describeProblems` 把 dump 内容引出来             | dump 描述不引用内容    | CAUGHT                           |

最终：`6/6 CAUGHT`、`RESTORED=true`、`MUTATION_PROBLEMS=[]`。

### 6.1 #3 为什么首轮漏抓

现有用例里 **kind 与 value 是共变的**：`windowsPath` 的样例值总是盘符路径，`homePath` 的总是 home 目录形式，`sessionDump` 的总是 `true`。所以「只按 value 匹配、不看 kind」在任何一条用例上都不会多抑制一条——去掉 kind 判断，测试全绿。

补的样本把两个维度拆开：

```js
const home = homePath('Users', 'alice');
const allowlist = {
  entries: [
    {
      path: 'docs/a.md',
      kind: 'windowsPath',
      value: canonicalPath(home),
      reason: 'wrong kind on purpose',
    },
  ],
};
const filtered = applyAllowlist('docs/a.md', scanText(home), allowlist);
assert.deepEqual(filtered.homePaths, [home]);
assert.deepEqual(filtered.suppressed, []);
```

一个 `kind: 'windowsPath'` 的条目持有 home 路径的 canonical 值。只看 value 会误抑制，看 `(kind, value)` 才不会。

**这与 Sprint 3J 的教训同族**：断言本身是真的，但没有一个能让错版本失败的样本。测试通过不等于门禁有效。

## 7. 允许清单：13 条

按 `(path, kind, value)` **三元组**抑制，不按文件、不按 kind：

- 按文件抑制会让该文件里**其余内容**全部瞎掉；
- 按 kind 抑制会让**所有文件**的该类问题全部瞎掉。

12 条历史文档 + 1 条自测，每条带 `reason`。清单的 `note` 写明「值用正斜杠无前导斜杠形式，这样本文件不含扫描器能匹配的字符串」。

## 8. 接入点

| 位置               | 改动                                                           |
| ------------------ | -------------------------------------------------------------- |
| `test:verify-gate` | 追加 `scripts/repo-hygiene-lib.test.mjs`（7 个文件，107 pass） |
| `package.json`     | 新增 `"hygiene:check": "node scripts/check-repo-hygiene.mjs"`  |
| `release:check`    | 在 `test:verify-gate &&` 之后插入 `pnpm run hygiene:check &&`  |

**刻意没有接进 `verify:all`**：`scripts/verify-all.mjs` 要求 `DATABASE_URL` 并会起 API 进程，与文件扫描无关；接进去会让门禁在不连库的环境里变成「跳过」而不是「通过」。

## 9. 矩阵

| 检查                                                       | 结果                                            |
| ---------------------------------------------------------- | ----------------------------------------------- |
| `node --test` 七个 `.mjs`                                  | 107 pass / 0 fail                               |
| `node scripts/check-repo-hygiene.mjs`                      | EXIT 0，337 clean / 12 skipped / 13 allowlisted |
| prettier `--check`（apps/tests/scripts/docs/package.json） | 0                                               |
| 变异 6 个                                                  | 6/6 CAUGHT，RESTORED=true                       |

## 10. 未处理

1. **`refs/pull/*` 与 CDN 缓存**：历史重写后，按分支名请求 `raw.githubusercontent.com` 仍返回旧内容（CDN 缓存），GitHub 的 PR ref 也可能仍指向旧对象。本机无法清。
2. **12 条历史文档豁免**：都是真实存在的本机路径，目前只做「登记 + 有理由」，没有做「改写掉」。改写这些历史审计文档会破坏它们的可追溯性，需要单独决策。
3. **只扫文本**：16 类二进制后缀直接跳过。二进制里塞路径不会被发现（但 git 也搜不到，实际风险低）。
4. **只扫 `git ls-files`**：未跟踪文件不扫。这正是本轮的场景（`8892e45` 提交前是未跟踪的），但门禁只回答「暂存了什么」，不回答「工作区里有什么」。

## 11. 风险

| 风险                                   | 影响                       | 缓解                                                        |
| -------------------------------------- | -------------------------- | ----------------------------------------------------------- |
| 正则太严导致误报，有人为过门禁乱加豁免 | 门禁退化成噪声             | 3.2 用运行时拼装消掉夹具误报；收紧后源码误报已清零          |
| 正则太松导致漏报                       | 本机路径再次进仓库         | 7 distinct 全是真路径，说明当前数据上没有漏；新增来源需复核 |
| 允许清单无人维护                       | 豁免越积越多               | 每条强制 `reason`；按三元组抑制，最小化盲区                 |
| 只扫暂存区                             | `git add` 之前的文件不检查 | 提交前跑一次即可；`release:check` 里已包含                  |

## 12. 下一步建议

- **P1** 观察 24h 后删除本地回滚点（`refs/original/*`、`backup/pre-leak-*`、`var/pre-rewrite.bundle`）。
- **P2** Owner 决定是否给 `it-passport` 补 `delivery_mode` 标签（验收信号：`dimensionMismatchGaps` 归零、`missingDataGaps` 仍 12）。
- **P2** 决定 12 条历史文档豁免是「保留登记」还是「改写脱敏」。
- **P3** 生产跑一次 patrol（两条路径需 Owner 决策，见 `docs/audit/COVERAGE_GAP_CAPTURE_ONLY_2026-11-25.md` §8）。
- **P3** 给 patrol 加「registry 过期」检查；**P3** 统一博客域名两层安全头。
- **P4** 404 噪声过滤；**P4** G-15 路由测试缺口。

## 13. 停止声明

本轮只做了「仓库卫生门禁」这一件事：三个新脚本 + 一个允许清单 + 一个测试文件 + 两处 `package.json` 接入 + 一条铁律 + 这份报告。

没有做：生产部署、数据库操作、契约修改、首页/资格页改动、Sprint 3B/4、`refs/pull/*` 清理、12 条历史豁免的改写。

按 `docs/next-round-ticket.md` §4 铁律，下一步（是否继续 P2/P3）由 Owner 决定。
