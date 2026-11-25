# Caddyfile 博客 vhost 纳入版本控制（2026-11-25）

## 0. Git 基线

| 项              | 值                                                                                  |
| --------------- | ----------------------------------------------------------------------------------- |
| 分支            | `chore/phase1-baseline`                                                             |
| 执行前 HEAD     | `6bd0285`                                                                           |
| 本轮内容 commit | `2a21622`                                                                           |
| 生产运行版本    | `9d793c9`（本轮改动尚未部署；但**线上 Caddyfile 的实际内容已被本仓库覆盖**，见 §2） |

本报告是一次两段式提交的第一段。第二段会把上面的内容 commit 回填成真实 hash（现在表里填的就是回填后的结果）。

## 1. 结论

线上 `deploy/caddy/Caddyfile` 里有一段 `blog.waystoneai.online` 反代，是 2026-11-21 手工加到 VPS 上的，**从未进入 git**。这意味着任何一次「从仓库重建部署目录」的操作都会让博客域名直接掉线，而且不会有任何报错——Caddy 只是少了一个 site block。

本轮把这段配置连同说明它来历的注释一起写进 `deploy/caddy/Caddyfile`，并加 6 条回归测试锁住它。**没有改任何线上文件，没有重启任何容器，没有触碰 `deploy/docker-compose.prod.yml`。**

## 2. 事实核对（全部来自生产机只读命令）

- 线上文件：1409 字节，`sha256 = 30224cbc87ef9883c0dc93ddf45d14cf7eab08c03a079a22f38521aa591620be`。
- 相对 git HEAD 的唯一差异：**末尾多出 22 行** `blog.waystoneai.online { … }`。`git diff` 全文确认没有其它改动。
- 容器内 `/etc/caddy/Caddyfile` 与该文件的 sha256 相同 → 线上跑的就是这份。
- 该块内容：`encode gzip` + 独立日志 `blog-access.log`（`roll_size 10mb` / `roll_keep 5` / `format json`）+ 与主站完全相同的 5 条安全头 + `reverse_proxy blog:8080`。

所以「仓库与线上的差异」不是一堆散落的改动，而是**恰好一个完整的 site block**。这让「以线上字节为底、只插入注释」的做法可行且可验证。

## 3. 那个 `blog` 容器从哪来

这一点决定了注释里必须写什么，所以单独记：

- 容器名 `blog`，镜像 `nginx:1.27-alpine`，创建于 2026-11-21T05:09:57Z，`restart: unless-stopped`。
- **不在 `deploy/docker-compose.prod.yml` 里**，`docker compose config` 的服务列表只有 `api` / `caddy` / `db` / `web`。
- 两个只读 bind mount：`/opt/blog/dist → /usr/share/nginx/html`、`/opt/blog/nginx.conf → /etc/nginx/conf.d/default.conf`。`/opt/blog/dist` 是 Astro 构建产物（`index.html`、`blog.html`、`_astro/`、`pagefind/`、`rss.xml` 等）。
- 不发布端口，只接 `deploy_default` 网络 —— 与 `deploy-caddy-1` 同网，所以 `blog:8080` 能解析。

后果：**在一台新机器上按 compose 拉起整套服务，Caddy 仍然会接受 `blog.waystoneai.online` 的请求（site block 存在），但上游解析不到，答 502 而不是 404。** 这个区别很重要——502 看起来像「服务坏了」，404 才像「没有这个站」。注释里写清了这一点。

## 4. 改动

### 4.1 `deploy/caddy/Caddyfile`

以线上 1409 字节为底，在 `blog.waystoneai.online {` 之前插入 7 行 ASCII 注释：

```caddyfile
# Blog host. The `blog` container is NOT part of deploy/docker-compose.prod.yml:
# it is an independent nginx container (image nginx:1.27-alpine) that mounts
# /opt/blog/dist and /opt/blog/nginx.conf from the host, created outside compose
# and joined to this stack's `deploy_default` network so this name resolves.
# Keep the block here so the live routing lives in version control; a fresh
# deployment must bring that container up separately, otherwise this vhost
# answers 502 instead of disappearing (Caddy resolves upstreams per request).
blog.waystoneai.online {
	…
}
```

重建过程用 `var/build-caddyfile.mjs` 完成，脚本自带两个断言：

- `written.replace(comment, '') === live` —— 去掉注释后必须**逐字节**等于线上文件；
- `crCount === 0` —— 不引入 CR（仓库 `core.autocrlf=true`，工作区 CRLF、仓库 LF，混进来会污染 `git diff`）。

输出 `{"liveBytes":1409,"newBytes":1954,"addedLines":7,"crCount":0,"roundTripOk":true}`。

结果：文件 1954 字节、71 行、`sha256 = b6599e8233b70d030655b8407d95613872ecaf86084cf2b40abf4941490836ca`、`cr = 0`。

### 4.2 语法校验

```bash
docker run --rm -v "$PWD/deploy/caddy:/etc/caddy:ro" caddy:2-alpine \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
```

→ `Valid configuration`，退出码 0。用的是与生产同一个镜像 tag `caddy:2-alpine`。

## 5. 回归测试

新增 `tests/caddyfile-blog-vhost.test.ts`（6 条用例）。它把两个部署文件当文本读——仓库里没有 Caddy 解析器，而这里要防的失败（某个 block 悄悄消失）在文本上就看得见。

| 用例                                                                    | 断言什么                                                                           |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `routes the blog host to the nginx container`                           | 博客 block 里有 `reverse_proxy blog:8080`                                          |
| `keeps the blog access log out of the main site log`                    | 用 `blog-access.log`，且**不含**主站的 `access.log`                                |
| `bounds both access logs by size`                                       | 主站与博客**各自**都有 `roll_size 10mb` / `roll_keep 5`                            |
| `applies the same security headers as the main site`                    | 5 条安全头在两个 block 里都在                                                      |
| `still answers the search-engine verification files itself`             | 4 个 `handle` 与 `reverse_proxy web:3000` 仍在主站 block 内                        |
| `documents that the blog container is not started by this compose file` | compose 里没有 `blog:` 服务，且注释写明了 `NOT part of …`、`/opt/blog/dist`、`502` |

`siteBlock(host)` 按大括号配平截取单个 site block，而不是在整份文件里 `toContain`。这一点是变异测试逼出来的，见 §5.1。

### 5.1 变异测试（7 个，全抓）

`var/mutate-caddyfile.mjs`，每次写盘后读回确认变异真的落盘，再跑测试，最后恢复原文件并校验 `RESTORED`。

| 变异                                         | 结果   |
| -------------------------------------------- | ------ |
| 删掉整个博客 block                           | CAUGHT |
| 把 `reverse_proxy blog:8080` 改成 `web:3000` | CAUGHT |
| 博客日志写进主站 `access.log`                | CAUGHT |
| 删掉主站 block 的 roll 设置                  | CAUGHT |
| **只**删掉博客 block 的 roll 设置            | CAUGHT |
| 删掉博客 block 的一条安全头                  | CAUGHT |
| 删掉解释容器来历的注释                       | CAUGHT |

**首轮 2 个问题，都值得记下来：**

1. `drop the log roll settings` 一开始 **MISSED**。原因是我的第一版用例写的是 `expect(blog).toContain('roll_size 10mb')` —— 但 `blog` 是截出来的 block 文本，而变异删的是**主站** block 的 roll 设置。换句话说：断言写在了错误的 block 上，而变异恰好打在另一个 block。拆成「两个 block 各自都要有」的循环断言后抓住。**教训：`toContain` 作用在截取的片段上时，要先想清楚变异会打在哪一段。**
2. `drop one security header` 一开始 **NOT_LANDED**。`String.replace` 只替换第一处，`X-Frame-Options "DENY"` 在主站 block 里先出现，所以变异根本没打到博客 block。改成锚定博客 block 独有的 `Permissions-Policy … \n }\n\n reverse_proxy blog:8080` 后落盘成功并被抓住。**这和 Sprint 3M 那次「模式串在多处出现」是同一个坑。**

## 6. 完整测试结果

| 命令                                    | 结果                                                                |
| --------------------------------------- | ------------------------------------------------------------------- |
| `vitest run tests`                      | **29 files / 465 tests passed**（`status` 拆分那轮是 459，本轮 +6） |
| `tsc -p tsconfig.json --noEmit`         | 0                                                                   |
| `prettier --check …`                    | 0（`All matched files use Prettier code style!`）                   |
| `eslint . --ignore-pattern "Python/**"` | 0                                                                   |
| `caddy validate`                        | 0（`Valid configuration`）                                          |

本轮没有改运行时源码，因此没有重跑 `test:python` / `verify:all` / `smoke:docker` —— 这三项与 Caddyfile 文本无关，且上一轮（`9d793c9`）刚全绿。

## 7. 未处理

1. **`blog` 容器仍未纳入 compose。** 它有自己的构建产物与 nginx 配置，纳入 compose 需要先决定这些文件放哪（仓库？还是继续留在宿主机？），超出本轮「把线上路由进版本控制」的范围。
2. **三个 `Caddyfile.bak*` 与两个搜索引擎验证文件仍是未跟踪状态**（`deploy/Caddyfile.bak-20261113`、`deploy/caddy/Caddyfile.bak`、`deploy/caddy/Caddyfile.bak.`、`deploy/BingSiteAuth.xml`、`deploy/googlea01c41ed599c5311.html`）。它们与 Caddyfile 里内联的 4 个 `handle` 内容完全一致，是冗余副本，不是缺件。删或留需要 Owner 定。
3. **部署后 Caddy 会自动 reload。** `caddy run` 默认 `--watch`，bind mount 的文件一变就重新加载。本次改动只加注释、生效配置不变，所以 reload 是安全的；但下一次真改这个文件时要记得线上会立刻生效，没有「先合并、稍后生效」的窗口。
4. `format:check` 的 glob 不含 `Caddyfile`，所以这个文件没有自动格式化。Caddyfile 的格式靠 `caddy fmt`，本轮没有引入。

## 8. 风险

| 风险                                           | 影响                      | 缓解                                           |
| ---------------------------------------------- | ------------------------- | ---------------------------------------------- |
| 注释与实际不符（比如以后 `blog` 进了 compose） | 误导后来的人              | 测试断言 compose 里没有 `blog:` 服务，加了就红 |
| 线上 Caddyfile 之后又被手工改动                | 仓库与线上再次分叉        | 测试锁住当前内容；下次部署前比对 sha256        |
| `core.autocrlf=true` 导致换行符抖动            | `git diff` 出现整文件改动 | 脚本断言 `crCount === 0`，仓库里是 LF          |

## 9. 下一步建议

- **P1** 把 `chore/phase1-baseline` 落到 `main`（需 Owner 授权 merge）——这是「生产代码不在主干」这条风险的根。
- **P2** 把三条连库断言用到 `scripts/audit-mvp.mjs` 与 `scripts/check-staleness.mjs`。
- **P2** 决定三个 `Caddyfile.bak*` 与两个验证文件的去留。
- **P3** 生产跑一次 patrol，消掉 `coverageGap: not_run`。
- **P3** 3K 报告 §11 的 P6：`apps/web/src/render.ts` 解引用与 `isQualificationView` 的同步机制。

## 10. 停止声明

本轮只做「把线上 Caddyfile 的博客 vhost 写进仓库 + 加回归测试」这一件事。没有部署，没有重启容器，没有改 compose，没有碰任何别的待办。到此停止。
