# ADR 0001：阶段 0 工程基础决策

- 状态：已接受
- 技术栈：pnpm workspace、TypeScript、Fastify、Drizzle ORM、PostgreSQL；Python 3.12+、httpx/BeautifulSoup/lxml 适配器骨架、Pydantic 契约、Vitest/pytest。
- 时间：数据库使用 UTC；业务日期与公开显示使用 `Asia/Tokyo`。
- 版本：正式事实不可原地覆盖，以 revision 和 current pointer 表达历史；批准动作必须幂等。
- 权限：collector 仅写 snapshot/candidate；validator/reviewer 才能写 review/fact/revision/change；public 只读 approved；AI 只读 approved。
- 边界：阶段 0 不连接生产、不抓取真实数据、不生成正式页面；测试数据必须 `synthetic`/`test-only`。
