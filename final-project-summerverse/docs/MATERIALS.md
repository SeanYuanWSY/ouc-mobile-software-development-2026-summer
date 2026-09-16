# 资料分析工作台

2026-09-12。状态：文件、图片、文字及公开网页导入已部署到腾讯云，公众平台确认1.1.0为体验版，新增计划拆解、专注和电脑接力界面。真实微信身份资料往返、聊天网页入口及BYOK模型效果仍未验收，电脑接力公网入口仍关闭，未正式发布。当前验收记录见 [ACCEPTANCE_STATUS.md](ACCEPTANCE_STATUS.md)。

## 用户实际能做什么

入口是首页「收好资料」。例如，把课程要求、老师的补充通知和一张作业截图放在一起：

1. 「提取要求」整理交付物、截止时间、明确要求和建议任务。
2. 「对比变更」对照至少两份资料，找出新增内容、变更和冲突；不自行认定哪个来源更权威。
3. 「问资料」只根据已导入资料回答，资料不足则明确列为待确认。
4. 「检查清单」生成提交前需要核对的事项，不声称已经完成检查。
5. 「讨论纪要」整理材料中明确的决定、分工和待确认问题。
6. 「拆解计划」把要求拆成可核对的下一步，接受后可进入专注页。
7. 「汇报练习」根据材料生成问题与参考要点，收在更多场景中，属于可选辅助。

只显示常用入口，其他场景按需展开。资料工作台也可点「让电脑助手接着做」：先保存，再明确选择接收连接和资料来源。手机页面与服务已部署，跨设备公网接入状态见 [电脑接力](ASSISTANT_BRIDGE.md)。

AI 结果可点击出处，查看文件名、页码或片段和引用文字。任务经用户确认后加入此工作台的「我的下一步」，由用户手动标为完成；目前不自动写入成长页目标，不创建提醒或外部消息。结果可复制或导出为 TXT，由用户主动选择分享对象。

## 能读取的内容

| 入口/类型 | 当前处理 | 限制 |
|---|---|---|
| 从微信聊天选文件 | `wx.chooseMessageFile` 返回用户所选文件 | 不能选择普通文字或链接消息，也无法读取整个群的消息、成员或历史 |
| 粘贴文字、TXT/MD | 本机读取 UTF-8 文字，云保存前征求同意 | 不自动读取剪贴板 |
| 网页链接/聊天网页转入 | 用户确认后，腾讯云读取公开页面的标题、域名和纯文字 | 不登录、不运行脚本、不绕过验证码或付费；输入URL不作为元数据保存或交给AI |
| PDF | 云端提取文字层，保留页码 | 扫描空页会提示；图表、图片不分析 |
| DOCX | 云端提取正文段落 | 不含嵌入图片、批注和页眉页脚；没有原版页码 |
| PPTX | 云端提取幻灯片文字，保留页序 | 不含嵌入图片、图表数据及演讲备注 |
| JPG/JPEG/PNG/WebP | 用户的识图模型转写可见文字，再参与分析 | 单列「AI识别文字」和错误/遗漏提示；不是完整视觉理解 |
| 微信「用小程序打开」 | 场景1173接收 `forwardMaterials`；1.0.7已声明文件类型及`text/html` | 体验入口配置及真实客户端展示未验收；正式入口需审核上线，支持平台见下方官方说明 |

单文件最多8MB，每份工作台最多6个来源、4万字、120个片段、40项任务；PDF最多40页，PPTX最多40张可读取幻灯片。每个用户最多12份工作台，可删除后再建。

老师发的是网页链接时：复制网址→首页「收好资料」→「网页链接」→粘贴并「提取网页」→核对正文→选择分析方式。网页响应限制1MB，正文超过4万字时明确拒绝，不静默截断。网页提取不需要模型Key，后续AI分析需要。

不支持旧 `.doc`/`.ppt`、表格、音视频转写、微信语音气泡、合并转发消息对象、需登录/验证码/付费或纯脚本渲染的网页、网盘下载和压缩包导入。用户可以自行把语音或网页内容转成文字后粘贴；小程序不会声称获得了原语音或完整会话。

## 保存、权限与出处

- 云端可用时，经用户同意将提取文字、分析及任务写入 `material_workspaces`。服务端按微信 OPENID 隔离。代码无到期自动删除；不承诺脱离云资源可用性的永久保存。
- 启用云开发的配置遇到启动失败或断网，保留云端模式并提示重连；不会切到本机副本。只有明确关闭云开发的隔离配置使用本机模式。两种模式不自动互相迁移。
- 每次保存携带版本号，事务处理并发与数量限制。冲突明确报错，不覆盖另一个页面的新版；当前未保存文字仍留在页面，可复制后重新打开。
- 上传确认、云端保存同意、发送给模型服务商的同意分别处理；界面显示实际接收方。离开页面后的迟到确认不会留下同意状态。
- AI Key 沿用已有 BYOK 会话模式，不写入资料库或文件。文件解析不需要模型 Key；图片转写和分析需要用户自己的对应模型与额度。
- 文档/图片临时上传到专用 `material` 目录，完成或失败都尝试清理；失败有提示。工作台保存提取文字，不持久保留原文件。中途关闭微信、网络中断等仍可能留下孤立临时云文件，部署运维需检查。
- 公开链接须再次确认后才访问。云函数逐跳校验公网地址、固定已解析IP、限制3次跳转/1MB/10秒并拒绝HTTPS降级、压缩响应和敏感查询参数。工作台只保存标题、域名和纯文字，不保存完整URL；模型只接收保存后的白名单字段。
- 引用必须能匹配当前提取片段中的文字，忽略空白差异；这只能证明引文存在，不能证明 AI 的解读正确。图片转写本身可能有错误，所以结果始终标为 AI 草稿。
- 模型没有执行工具、访问资料中的 URL 或自动发送消息的权限。解析器不运行宏、不请求 Office 外部资源；渲染使用原生 text，不执行资料中的 HTML。

## 开发与部署入口

| 文件 | 用途 |
|---|---|
| `miniprogram/pages/materials/` | 原生页面、资料库、出处和任务交互 |
| `miniprogram/services/materials.js` | 选择结果导入、上传同意、本机/云保存、临时清理 |
| `miniprogram/utils/material-policy.js` | 资料、引用、任务、保存的规范与上限 |
| `cloudfunctions/dataService/material-workspaces.js` | OPENID 隔离、事务版本检查和资料库限额 |
| `cloudfunctions/dataService/material-storage-policy.js` | 精确文件环境及用户路径校验 |
| `cloudfunctions/deepseekProxy/material-download.js` | 仅下载已登记文件，公网地址校验、固定IP、拒重定向、实际流量限额 |
| `cloudfunctions/deepseekProxy/material-web.js` | 公开网页逐跳校验、固定IP、限时限量下载和纯文字提取 |
| `cloudfunctions/deepseekProxy/material-parser*.js` | Worker 中解析 PDF/Office，限制时间、条目、字节、页数和文字量 |
| `cloudfunctions/deepseekProxy/material-ai.js` | 识图转写、七种分析提示与结果出处校验 |

修改规范后运行 `node scripts/sync-material-policy.js`，同步到两云函数的部署目录；测试保证三处内容一致。Worker 限制 JS 堆96MB、运行10秒，但这不是整个进程总内存上限，正式部署仍须用实际复杂文件观测峰值。

部署需要新增 ADMINONLY 集合、配置非敏感存储标识、更新两个已有云函数和前端。完整顺序在 [CLOUD_SETUP.md](CLOUD_SETUP.md) 的「资料分析部署」；不需要开公网 HTTP 网关，也不依赖外部助手中转。

## 可复现的本地验证

原生页面截图： [首页入口](screenshots/materials-v1/00-home-entry.png) · [导入页面](screenshots/materials-v1/01-import.png) · [对比分析](screenshots/materials-v1/02-comparison.png) · [查看出处](screenshots/materials-v1/03-evidence.png) · [手动任务](screenshots/materials-v1/04-task.png)。分析截图中的通知和AI回复为测试样例。

```bash
npm ci --prefix cloudfunctions/deepseekProxy --ignore-scripts
node scripts/sync-material-policy.js
npm run manifest
npm run verify
node scripts/local-experience-demo.cjs
```

最后一项需要已安装微信开发者工具、服务端口开启和本地 `miniprogram-automator`。可通过 `AUTOMATOR_PACKAGE` 指定其 package.json 路径。脚本只打开一个隔离临时工程，结束后关闭；使用独立内存存储与合成网络/模型响应，验证实际原生页面交互。输出在 `dist/local-experience-demo-<时间戳>/`；它不能证明真实模型效果、跨设备连接或微信手机选择器已验收。上述materials-v1图片与旧 `local-materials-demo.cjs` 保留为早期资料功能证据，新版三模式、计划、专注、接力截图见 `screenshots/experience-v1/`。

## 官方接口依据

- [微信聊天文件选择](https://developers.weixin.qq.com/miniprogram/dev/api/media/image/wx.chooseMessageFile.html)
- [小程序打开文件、supportedMaterials与场景1173](https://developers.weixin.qq.com/miniprogram/dev/framework/material/support_material.html)
- [unpdf](https://github.com/unjs/unpdf)、[yauzl](https://github.com/thejoshwolfe/yauzl)

2026-09-12重读微信官方说明：正式文件打开入口需要审核发布，体验版配置独立；文档标注Android支持，并说明PC基础库大于3.7.6可拖入文件。不承诺iPhone展示相同菜单，也不等于获得整段聊天或原生语音的读取权限。
