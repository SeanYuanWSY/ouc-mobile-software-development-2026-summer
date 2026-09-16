# Cloudflare 入口防护（本地准备，未部署）

`ingress.mjs` 是可测试的入口处理器，不是已能连接腾讯云的 Worker。没有默认上游、部署配置或真实凭据；`ENABLED` 默认关闭。用户已于2026-09-10接受 Cloudflare 中转投递文本、连接令牌及主动授权读取的记忆。

【现场阻塞，2026-09-10】Cloudflare免费账号已登录；腾讯云“创建角色”要求标准版。当前个人版无法按计划创建专用最小权限角色，未部署。不要把此处理器作为已经可用的接入地址。

## 本地处理规则

- 仅 POST `/assistant`，不接受查询串；仅三种现有业务动作。
- 全入口、可信 Cloudflare IP、连接令牌摘要三层限频；任一组件缺失或异常均停止转发。
- 建议绑定分别为每机房120次/分钟、每IP30次/分钟、每连接6次/分钟。共享IP可能误限同网络用户，需真实联调调整；这不是全球调用数或账单硬上限。
- 流式请求16KiB、响应256KiB、总等待18秒；不转发请求中的自定义头、URL、Cookie或源站身份。
- 上游错误仅返回公共代码，丢弃源响应头与错误详情；没有请求日志。

## 尚未实现及上线前必验

1. 专用非管理员组织成员、最小权限角色、短期认证与刷新；不可使用CloudBase管理员长期API Key。
2. 固定原生 HTTP API `/v1/functions/assistantGateway` 的真实封装和响应解封装，作为 `createIngress(forward)` 的唯一转发器。
3. 保持旧 `/assistant` 路由关闭；核验普通身份从HTTP API及SDK直调是否在函数执行前被拒绝。不能只凭函数返回401判定防绕过成功。
4. 当前免费套餐支持度、国内网络可达性、平台日志采集范围和隐私告知。
5. 完成以上前不提供可部署入口文件，不设置 `ENABLED=true`，不替换体验版。

本地测试通过只证明处理器行为；真实Cloudflare binding、腾讯云认证及完整MCP调用仍待联调。

依据：[Cloudflare Rate Limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)、[CloudBase 网关权限](https://docs.cloudbase.net/authentication-v2/auth/auth-gateway)。
