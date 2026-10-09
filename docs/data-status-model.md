# 数据状态与缺失原因（工作包 B）

资格状态由当前年度的覆盖契约与已批准公开事实计算，不能再由事实数量或任意单条事实决定。公开接口只返回已批准事实；候选的值、原文证据和展示值绝不通过状态或比较接口泄露。

## 资格状态

- `verified`：当前已激活的 required/conditional 覆盖项均有公开事实。
- `partially_announced`：存在应有但尚无公开事实的覆盖项。
- `awaiting_official`：没有公开事实，也没有非 synthetic 待审核字段元数据。
- `under_review`：没有公开事实，但存在待审核字段元数据。

其余产品状态（`previous_year_reference`、`changed_or_corrected`、报名开闭、`completed`、`suspended`）保留为公开状态枚举；只有在事实链具备相应的年度/变更/事件证据时才能选择，不能由页面时间或推测生成。

## 字段缺失原因

- `not_announced`：契约明确为“仅官方公布时适用”的条件字段尚未公布。
- `not_collected`：适用且应有，但当前没有公开事实或待审核字段。
- `pending_review`：只存在待审核候选字段；页面不显示其值。
- `not_applicable`：契约明确声明不适用。
- `mapping_error`：已批准的同类维度事实存在，但消费端尚未映射规范字段。
- `stale_source`：预留给独立来源检查记录与生产新鲜度阈值；当前不得根据 CI fixture 的固定 `verifiedAt` 推断。

详情页和比较器使用同一原因代码。比较器只显示本地化原因标签，空单元格不会声称“官方未确认”。
