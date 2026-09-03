# 云开发与真实接口配置

## 1. 准备真实小程序

1. 在微信公众平台注册小程序并取得 AppID。
2. 用真实 AppID 替换 `project.config.json` 中的 `touristappid`。
3. 在微信开发者工具中创建云开发环境，并把 AppID 与环境绑定。
4. `miniprogram/config/env.js` 中的 `CLOUD_ENV_ID` 可以留空使用当前绑定环境，也可以明确填写环境 ID。

## 2. 部署云函数

在微信开发者工具的 `cloudfunctions` 目录中依次右键：

1. `initProject` → 上传并部署：云端安装依赖；运行一次，创建数据库集合。
2. `dataService` → 上传并部署。
3. `weRunData` → 上传并部署。
4. `weather` → 上传并部署。
5. `deepseekProxy` → 上传并部署。

推荐 Node.js 18 或更新运行时；依赖使用 `wx-server-sdk ^3.0.1`。

## 3. 配置 DeepSeek

在云开发控制台 → 云函数 → `deepseekProxy` → 环境变量：

```text
DEEPSEEK_API_KEY=sk-你的真实Key
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_VISION_MODEL=deepseek-v4-flash-vision-exp
ALLOW_CLIENT_API_KEY=false
```

- 日常聊天、结构化记录和报告默认使用 `deepseek-v4-flash`。
- 复杂推演可在设置页选择 `deepseek-v4-pro`。
- AI 看图使用实验性视觉模型；视觉接口不可用时，其余功能不受影响。
- 正式部署保持 `ALLOW_CLIENT_API_KEY=false`。
- 课堂联调期间确实需要在设置页粘贴临时 Key 时，才临时改为 `true`；测试后立即恢复。

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
```

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
summerverse/memory/YYYY-MM-DD/...
summerverse/voice/YYYY-MM-DD/...
```

本机模式会复制到 `wx.env.USER_DATA_PATH`；本机文件不具备跨设备能力。

## 8. 上线前必做

- 关闭客户端临时 Key。
- 配置云函数环境变量。
- 检查数据库规则。
- 完成隐私保护指引与用户信息用途声明。
- 真机测试相机、相册、麦克风、位置、微信运动、云存储。
- 对删除账号/数据、内容安全和异常重试做最终审核。
