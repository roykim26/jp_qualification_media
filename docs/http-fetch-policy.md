# 宅建官方页面接入前的 HTTP 策略

实现位置：`services/collector/src/collector/http_policy.py`。

- 允许域名：宅建来源只允许 `www.retio.or.jp`，仅 HTTPS，拒绝凭据 URL、非 443 端口和其他 host；每个重定向目标重新校验。
- 重定向：不自动跟随，由策略层逐跳处理，最多 3 跳；缺少 `Location` 或超过上限即失败。
- 超时：connect 5 秒、read 15 秒、write 5 秒、pool 5 秒。
- 重试：仅对网络错误和 408/425/429/500/502/503/504 重试，最多 2 次，指数退避；404 不重试。
- 缓存：保存 ETag/Last-Modified，下次请求发送 `If-None-Match`/`If-Modified-Since`；304 复用已缓存正文。
- 404：返回 `not_found`，不创建快照、不创建候选事实、不改变正式事实。
- 体积限制：单响应最多 5 MiB。
- 采集器只有在 `ok`/`not_modified` 且正文可解码时才生成宅建快照；不会自动发布事实。

当前策略只通过 MockTransport 离线测试，未访问真实官方页面。
