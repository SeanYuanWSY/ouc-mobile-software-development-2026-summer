# 云开发与真实接口配置

## 1. 准备真实小程序

1. 在微信公众平台注册小程序并取得 AppID。
2. 用真实 AppID 替换 `project.config.json` 中的 `touristappid`。
3. 在微信开发者工具中创建云开发环境，并把 AppID 与环境绑定。
4. `miniprogram/config/env.js` 中的 `CLOUD_ENV_ID` 可以留空使用当前绑定环境，也可以明确填写环境 ID。

## 2. 部署云函数

在微信开发者工具的 `cloudfunctions` 目录中依次右键：

1. `initProject` → 上传并部署：云端安装依赖；运行一次，创建数据库集合。
2. `dataService` → 上传并部署。小程序启动时会调用 `system.ping`，只有检查成功才会显示“微信云开发”模式。
3. `weRunData` → 上传并部署。
4. `weather` → 上传并部署。
5. `deepseekProxy` → 上传并部署。

推荐 Node.js 18 或更新运行时；依赖使用 `wx-server-sdk ^3.0.1`。

## 3. 严格 BYOK 配置

每位用户在设置页填写所选服务商的 API Key，由其 API 账户承担费用。开发者不提供共享 Key；不读取 `DEEPSEEK_API_KEY`、`ALLOW_CLIENT_API_KEY` 等旧环境变量。不要配置这些旧变量。

环境变量只需使用限额项（见 `cloudfunctions/deepseekProxy/env.example`）：

```text
AI_MAX_REQUESTS_PER_MINUTE=6
AI_MAX_REQUESTS_PER_DAY=40
AI_MAX_CREDITS_PER_DAY=80
AI_QUOTA_TIMEZONE=Asia/Shanghai
```

- Key 仅本次运行存于应用内存与输入框；清除或进程结束后需重新填写。切到后台不一定结束进程。
- 首次文字与图片调用分别说明数据发送和费用。看图同意发生在上传前；分析新上传的照片请求结束后尝试清理，原表单附件保留用于正常保存。
- 预设服务商地址由服务端固定；自定义支持公网 HTTPS OpenAI Chat Completions 接口，拒绝内网、重定向和 URL 凭据。模型目录见 cloudfunctions/deepseekProxy/providers.js。
- 显式设置 `thinking: { type: 'disabled' }`，避免短回复额度被默认思考消耗。官方参数：https://api-docs.deepseek.com/guides/thinking_mode/ 。
- 测试连接也会真实扣费；成功才显示本次 AI 已验证。改 Key 或模型重置状态，失败不使用本地模板替代。
- 按 APPID/OPENID 哈希分别限额。缺少 Key 或无效参数在限额前拒绝，额度数据库不可用时不请求上游 AI 服务。BYOK 不使用共享 Key 全局池；微信云资源仍由应用维护者承担，需设预算告警。
- 上游文字超时 50 秒、视觉 55 秒；部署时配置足够的云函数总超时，并根据鉴权、下载、冷启动耗时调整前端等待（当前文字 60 秒、图片 65 秒）。必须实测，不能仅凭这些参数宣称已接通。
- 应用仅记公共错误码与 HTTP 状态，不记 Key、原始上游错误或请求内容。但平台调用追踪可能另行采集参数，部署时必须核对 APM、调用详情和日志权限，避免保存含真实 Key 的测试事件。
- API 账户说明：https://api-docs.deepseek.com/ ；模型与费用：https://api-docs.deepseek.com/quick_start/pricing/ 。

## 4. 数据库安全规则

前端不直接读写数据库，所有云端数据通过 `dataService` 并按 `OPENID` 过滤。因此数据库集合建议设置为：

```json
{
  "read": false,
  "write": false
}
```

集合：

```text
memories
profiles
goals
step_snapshots
media_assets
ai_usage
```

演示数据只会写入本机预览存储，云模式下按钮会禁用，不会把示例混入真实账号。

云函数拥有服务端权限，不受客户端规则阻挡。

## 5. 微信运动

真实链路：

```text
wx.login
  → 用户授权 scope.werun
  → wx.getWeRunData
  → wx.cloud.CloudID(res.cloudID)
  → weRunData 云函数自动获得解密后的 stepInfoList
```

注意：

- 通常需要真机；开发者工具的模拟结果不能作为验收证据。
- 步数只会在用户主动进入并同步时更新。
- 页面不会在失败时显示预设的 8,632 等数字。

## 6. 位置、地图与天气

- 记录地点：`wx.chooseLocation`。
- 当前位置：`wx.getLocation({ type: 'gcj02' })`。
- 地图展示：原生 `<map>`、`markers`、`polyline`。
- 天气：位置授权后由 `weather` 云函数调用 Open-Meteo；Key 不需要放进前端。
- 项目已经在 `app.json` 声明 `requiredPrivateInfos` 和 `scope.userLocation` 用途。

发布前还需在小程序公众平台的隐私保护指引中完整声明用途。

## 7. 云存储

记录页通过 `wx.cloud.uploadFile` 上传用户主动选择的图片、视频和录音，路径为：

```text
summerverse/<当前用户哈希>/memory/YYYY-MM-DD/...
summerverse/<当前用户哈希>/voice/YYYY-MM-DD/...
```

用户哈希命名空间由 `dataService` 生成；上传后必须登记到 `media_assets`，AI 看图才会接受该文件。本机模式会复制到 `wx.env.USER_DATA_PATH`；本机文件不具备跨设备能力。

云端记忆写入会再次核验每个 `fileID` 都属于当前 OPENID。附件引用和记忆/头像文档在数据库事务中同步更新；删除记忆、移除附件或更换头像时，只有引用为空并被事务标记为 `deleting` 的文件才会进入清理，因此多端并发保存不会被旧请求误删。清理兼容检查 `wx-server-sdk` 的 `status` 与 CloudBase SDK 的 `code` 结果；确认成功或文件已经不存在时才移除登记，其他失败记录会恢复为可重试状态。

前端只给本次从临时路径新建的附件添加短暂回滚标记，不会把标记写入记忆数据。批量上传中途失败或后续保存失败时，会调用 `media.cleanup` 回滚这些新文件；服务端若发现文件已经被成功保存的记忆引用，会保留它而不是误删。

`ai_usage` 中只保存用户哈希和当日计数。这些文档不能由小程序客户端删除，否则可绕过额度；如需清理，由管理员定期删除已过期日期的文档。

## 8. 上线前必做

- 验证缺少用户 Key 时不能回退共享 Key。
- 配置限额、超时与日志采集；不配置开发者 Key。
- 检查数据库规则。
- 完成隐私保护指引与用户信息用途声明。
- 真机测试相机、相册、麦克风、位置、微信运动、云存储。
- 对删除账号/数据、内容安全和异常重试做最终审核。

## 9. 资料分析部署（2026-09-12已部署，真实微信联调待完成）

当前环境已完成下列集合、权限、精确authority和两个函数部署，实际云包已下载核对；公众平台确认1.0.7为体验版、备案和认证完成。不要重复创建集合或改动已有用户数据。隐私指引提交后显示审核中，但待审正文回读异常、保存完整性尚未确认；真实微信身份及模型调用仍待验收，详细证据见 `ACCEPTANCE_STATUS.md` 最新节。以下步骤保留供复现与剩余验收使用。

此功能复用 `dataService` 和 `deepseekProxy`，无需 HTTP 网关。按以下顺序执行：

1. 在同一云环境新增 `material_workspaces` 集合，客户端读写均关闭（ADMINONLY）。也可由管理员运行更新后的 `initProject` 创建，再逐项核对权限；创建函数不会替你配置安全规则。不要自动开放客户端权限。
2. 核对 `media_assets`、`ai_usage` 仍为 ADMINONLY，云存储仍为仅创建者/管理员读写。
3. 给 **dataService 和 deepseekProxy 两者** 添加非敏感环境变量 `MATERIAL_STORAGE_AUTHORITY`，值为本环境原生云文件 ID 中 `cloud://` 与第一个 `/` 之间的完整 `环境ID.桶标识`。必须从实际云存储文件 ID 读取，不能只填环境ID、猜桶名或带URL路径。此值不是 Key。缺少配置时文档/图片导入明确失败；粘贴文字与分析不依赖它。
4. `node scripts/sync-material-policy.js` 后，部署新的 dataService；将 `deepseekProxy` 连同 `package.json`、锁文件和全部解析代码部署，使用云端安装依赖。依赖为 wx-server-sdk、固定版本 unpdf1.7.0/yauzl3.4.0。运行环境 Node.js20.19；执行超时90秒。Worker 文件须包含在部署包内。内存先用实际最大允许文件测量，不把96MB JS堆限制等同于函数总内存上限。
5. 回读能力：dataService `material.capabilities` 的 protocol=materials-v1/storageConfigured=true；deepseekProxy `capabilities` 的 materialsProtocol=materials-v1/materialStorageConfigured=true。然后测试实际解析及保存往返；布尔配置检测不能替代真实文件 ID 匹配。
6. 核对函数日志与平台追踪不采集 Key、原文件内容、提取文字和临时下载URL。解析占用额度在下载前预留，失败也计数；默认 credits：解析1、识图8、分析4。BYOK 模型费由用户承担，云资源仍由应用方承担。
7. 用测试资料核验临时文件删除结果、另一微信账号的访问隔离、资料恢复和版本冲突，再用用户自行输入的 Key 做真实识图与分析。不在云函数测试事件中保存 Key。
8. 更新公众平台隐私说明，上传新版前端并设置体验版。`supportedMaterials` 正式文件打开入口需审核与发布；体验版入口可独立配置。普通首页入口不依赖外部助手网关。

2026-09-12公开网页导入已更新两个目标函数，25个云端源码及配置文件SHA-256与干净部署副本匹配，含 `text/html` 声明的1.0.7前端已成为体验版。云端启动测试只验证缺身份拒绝；真实微信调用仍需确认 `webMaterials=true` 并完成提取/保存/恢复。发布前更新隐私保护指引，明确“用户提供的公开URL由腾讯云访问，保存标题、域名和提取文字”，并在真机验证聊天网页入口和手动粘贴入口。网页补充说明已准备，尚未覆盖当前待审材料。

2026-09-11 两函数保留 wx-server-sdk3.0.4，并以 overrides 固定 form-data2.5.6；两个锁文件均随部署包交付。依赖审计仍有11项（0 critical、6 high、5 moderate），来自 SDK 旧依赖链，unpdf/yauzl未被列入。定点审查未发现本次资料入口调用 JWT 验签、realtime.watch 或服务端 multipart 上传的路径；这不是对全部依赖的无漏洞保证。云端安装后仍需回读实际版本和完成文件往返验收；不运行自动降级/强制 audit fix。
