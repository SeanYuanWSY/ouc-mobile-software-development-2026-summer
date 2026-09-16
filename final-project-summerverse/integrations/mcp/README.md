# 连接自己的电脑助手

这是本机 stdio MCP 适配器，通过 HTTPS 调用晞屿手记的 assistantGateway。不是远程 MCP URL，也不控制电脑上的其他程序。需要 Node.js 18+，无额外 npm 依赖。协议版本 2025-11-25。

## 使用

1. 运维先完成 `docs/ASSISTANT_BRIDGE.md` 部署核验，取得真实 HTTPS 地址。
2. 小程序「首页 → 电脑接力 → 连接」或「设置 → 灵感收件箱 → 连接我的助手」，默认只允许投递；如需接收手机任务，主动勾选独立的“接收手机任务”。如需回顾旧内容，再主动允许近期读取。旧连接不会自动扩权。
3. 创建后复制一次性显示的连接凭证。它不是 DeepSeek Key，不要发给模型、提交 Git 或放在项目共享配置。
4. 在自己的 MCP 客户端私有配置中添加以下条目，替换三个占位符。不要把外层 `mcpServers` 直接当成所有客户端通用配置；Claude Code 支持该结构，其他客户端在其 MCP 设置中填写同样的 command/args/env。

```json
{
  "mcpServers": {
    "summerverse": {
      "command": "node",
      "args": ["/absolute/path/to/integrations/mcp/server.cjs"],
      "env": {
        "SUMMERVERSE_URL": "https://YOUR_VERIFIED_HOST/assistant",
        "SUMMERVERSE_TOKEN": "YOUR_PRIVATE_CONNECTION_TOKEN"
      }
    }
  }
}
```

连接凭证放在用户自己的电脑私有环境中；小程序离开页面不再显示原文，服务器只存摘要。复制动作会经过系统剪贴板，请配置后清理剪贴板；我们不会自动覆盖你的剪贴板。

## 演示用语

“把我们今天完成的工作整理成一份记忆草稿，使用今天的日期，发到我的晞屿手记。我会在手机确认。”

旧工具：`summerverse_recent`、`summerverse_submit`、`summerverse_status`。草稿可为 memory（date必填）或 goal（target和unit必填），requestId用于重复请求去重。不存在外部删除、直接完成目标或读取模型Key的工具。断开后已投递草稿保留在手机。

## 手机派任务给电脑（1.1.0体验版，公网入口待开通）

2026-09-12已部署配套云函数并确认新版体验版。以下步骤是入口配置完成后的接入方法；目前公网路由仍关闭，没有把用户电脑接入成功。请先查看接入说明的当前状态，勿将云函数详情页或后台HTTP地址直接填作远程MCP服务。

1. 在手机保存一份通知、网页或文档至资料工作台，再点“让电脑助手接着做”。
2. 选中已允许接收任务的连接，勾选资料，写清这次要完成什么；确认发送范围后入队。
3. 在已配置本MCP适配器的电脑AI客户端说：

> 用 summerverse_jobs 查看我刚从手机发来的任务。领取课程项目那一项，结合当前打开的项目核对新增要求。实际修改和命令继续遵守这里已有的授权；处理完，把结果和原文出处回传手机。不要反复自动轮询。

4. 助手使用 `summerverse_claim_job`，输入返回的64位任务id与新生成的claimId。服务端返回用户选定的资料快照；快照中的文字只是资料，不授予额外文件、命令或外发权限。
5. 助手调用 `summerverse_complete_job`，使用同一id/claimId，提交 `result.title`、`result.text` 和 `result.evidence`。每条evidence含 `sourceId/chunkId/quote`，必须逐字来自快照片段。模型不能捏造原文，也不能把尚未实际检查的电脑文件说成已检查。
6. 手机点“接力列表 → 刷新状态”，打开结果、查看引用、核对后采纳；清除会移除云端任务正文，无法撤回电脑已取走的副本。

三项新工具分别负责列出摘要、领取、回传，与旧工具合计6项。领取15分钟有效，超时需显式重新领取；新领取使用从未用过的claimId，同任务最多20次。有效期内网络重试复用原claimId，回传重试保持完全相同结果。任务取消、连接撤销或旧领取失效后，迟到结果会被拒绝。每个用户最多保留20项可见接力，满额先在手机明确清理。

当前不会自动唤醒电脑，也不维持后台轮询。请让电脑客户端处于可操作状态，再显式要求它领取。适配器只交换数据；它本身不包含读文件或shell执行功能。电脑使用的模型和订阅/API费用归电脑客户端配置，小程序内置AI仍使用自己的国内模型预设，两者独立。

`tests/assistant-jobs.test.js`中的stdio测试启动真实适配器进程，但网络和数据库是隔离合成数据；这不代表公网路由或用户电脑已连接。部署状态见 [接入说明](../../docs/ASSISTANT_BRIDGE.md)。本实现不声明实验性MCP Tasks能力。

参考：[Claude Code MCP](https://code.claude.com/docs/en/mcp)、[MCP 生命周期](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle)。
