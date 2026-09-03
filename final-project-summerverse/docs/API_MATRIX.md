# 真实接口矩阵

| 能力 | 前端 API | 云端/第三方 | 无权限或失败时 | 数据性质 |
|---|---|---|---|---|
| 微信步数 | `wx.login`、`wx.getWeRunData` | `weRunData` + `CloudID` | 显示“未授权”，不填模拟数 | 真实微信开放数据 |
| 当前位置 | `wx.getLocation` | 无 | 保持为空并解释权限 | 实时真实位置 |
| 选择记忆地点 | `wx.chooseLocation` | 无 | 用户可跳过 | 用户主动选择的真实坐标 |
| 记忆地图 | 原生 `<map>` | 无 | 空地图与空状态 | 已保存坐标 |
| 路线 | `polyline` | 无 | 不绘制 | 按时间连接记录点，不是后台轨迹 |
| 实时天气 | 位置 API | `weather` → Open-Meteo | 显示“点此授权天气” | 第三方实况/预报数据 |
| 照片/视频 | `wx.chooseMedia` | 云存储 | 本机持久化 | 用户主动选择 |
| 语音 | `wx.getRecorderManager` | 云存储 | 显示权限错误 | 用户主动录制 |
| 记忆 CRUD | 页面表单 | `dataService` | 本机 Storage 回退 | 真实用户数据 |
| 一句话记录 | 文本输入 | `deepseekProxy` | 本地规则解析 | AI 草稿，需用户确认 |
| AI 看图 | 用户照片 | DeepSeek 视觉模型 | 功能单独失败，不影响保存 | AI 推断 |
| SummerTwin 对话 | 用户问题 | DeepSeek V4 | 本地证据式回答 | AI 生成，引用记忆 |
| 时间电话 | 日期与问题 | DeepSeek V4 | 本地时间边界回答 | 受约束叙事生成 |
| 平行暑假 | 真实记忆 + 替代选择 | DeepSeek V4 | 本地反事实模板 | 明确标注的生成故事 |
| 夏日导演 | 真实记忆 ID | DeepSeek V4 | 本地章节编排 | AI 结构 + 真实素材 |
