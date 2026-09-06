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

每位用户在设置页填写自己的 DeepSeek API Key，由其 API 账户承担费用。开发者不提供共享 Key；不读取 `DEEPSEEK_API_KEY`、`ALLOW_CLIENT_API_KEY` 或自定义上游地址。不要配置这些旧变量。

环境变量只需使用限额项（见 `cloudfunctions/deepseekProxy/env.example`）：

```text
AI_MAX_REQUESTS_PER_MINUTE=6
AI_MAX_REQUESTS_PER_DAY=40
AI_MAX_CREDITS_PER_DAY=80
AI_QUOTA_TIMEZONE=Asia/Shanghai
```

- Key 仅本次运行存于应用内存与输入框；清除或进程结束后需重新填写。切到后台不一定结束进程。
- 首次文字与图片调用分别说明数据发送和费用。看图同意发生在上传前；分析新上传的照片请求结束后尝试清理，原表单附件保留用于正常保存。
- 固定请求地址为 `https://api.deepseek.com/chat/completions`，禁止重定向；正文模型只允许 `deepseek-v4-flash`、`deepseek-v4-pro`，视觉固定 `deepseek-v4-flash-vision-exp`。
- 显式设置 `thinking: { type: 'disabled' }`，避免短回复额度被默认思考消耗。官方参数：https://api-docs.deepseek.com/guides/thinking_mode/ 。
- 测试连接也会真实扣费；成功才显示本次 AI 已验证。改 Key 或模型重置状态，失败不使用本地模板替代。
- 按 APPID/OPENID 哈希分别限额。缺少 Key 或无效参数在限额前拒绝，额度数据库不可用时不请求 DeepSeek。BYOK 不使用共享 Key 全局池；微信云资源仍由应用维护者承担，需设预算告警。
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
