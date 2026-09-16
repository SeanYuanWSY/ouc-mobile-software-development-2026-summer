# 真实接口矩阵

| 能力 | 前端 API | 云端/第三方 | 无权限或失败时 | 数据性质 |
|---|---|---|---|---|
| 微信步数 | `wx.login`、`wx.getWeRunData` | `weRunData` + `CloudID` | 显示“未授权”，不填模拟数 | 真实微信开放数据 |
| 当前位置 | `wx.getLocation` | 无 | 保持为空并解释权限 | 实时真实位置 |
| 选择记忆地点 | `wx.chooseLocation` | 无 | 用户可跳过 | 用户主动选择的真实坐标 |
| 记忆地图 | 原生 `<map>` | 无 | 空地图与空状态 | 已保存坐标 |
| 路线 | `polyline` | 无 | 不绘制 | 按时间连接记录点，不是后台轨迹 |
| 实时天气 | 位置 API | `weather` → Open-Meteo | 显示“点此授权天气” | 第三方实况/预报数据 |
| 照片/视频 | `wx.chooseMedia` | 云存储 + `media.prepare/register` | 云模式保留待重试；只有明确本机配置才本机持久化 | 用户主动选择，按 OPENID 校验所有权 |
| 语音 | `wx.getRecorderManager` | 云存储 + `media.prepare/register` | 显示权限错误 | 用户主动录制，按 OPENID 校验所有权 |
| 记忆 CRUD | 页面表单 | `dataService` | 云模式明确等待连接与重试，不静默写本机 | 真实用户数据；幂等创建、版本编辑与删除墓碑 |
| 一句话记录 | 文本输入 | `deepseekProxy` | 明确提示失败，不生成替代回复 | AI 草稿，需用户确认 |
| AI 看图 | 用户照片 | 用户选择的视觉模型 | 功能单独失败，不影响保存 | AI 推断 |
| SummerTwin 对话 | 用户问题 | 用户选择的文字模型 | 明确提示失败，不生成替代回复 | AI 生成，引用记忆 |
| 时间电话 | 日期与问题 | 用户选择的文字模型 | 明确提示失败，不生成替代回复 | 受约束叙事生成 |
| 平行暑假 | 真实记忆 + 替代选择 | 用户选择的文字模型 | 明确提示失败，不生成替代回复 | 明确标注的生成故事 |
| 夏日导演 | 真实记忆 ID | 用户选择的文字模型 | 明确提示失败，不生成替代回复 | AI 结构 + 真实素材 |

`deepseekProxy` 按 APPID/OPENID 哈希使用事务检查分钟、每日和 credits 额度。严格使用用户会话 Key，不回退共享 Key；应用不记录请求内容或原始上游错误。

## 资料分析接口（含网页入口，1.0.7已部署）

| 入口/Action | 输入与结果 | 边界 |
|---|---|---|
| wx.chooseMessageFile / wx.chooseMedia | 用户选中的文件路径、名称 | 不可读取完整群聊或语音气泡 |
| app.onLaunch/onShow，场景1173 | forwardMaterials → 资料页面 | 文件进入导入流程；网页只预填，用户确认后才访问；正式入口需审核发布 |
| dataService material.capabilities | protocol/storageConfigured | 无Key、无资料正文 |
| dataService material.register | 专用目录云文件ID | 精确环境、当前OPENID、已登记状态 |
| dataService material.list/get/save/delete | 工作台与revision | ADMINONLY集合、OPENID隔离、事务CAS、最多12份 |
| deepseekProxy materialExtract | fileID → chunks/extraction/warnings | 无模型Key；PDF文字、DOCX/PPTX；失败计云端额度 |
| deepseekProxy materialWebExtract | 公开URL → title/domain/chunks/warnings | 无模型Key；不持久化输入URL；逐跳SSRF防护、1MB和10秒上限，正文超过4万字拒绝 |
| deepseekProxy materialVision | 图片fileID + 用户会话配置 → 转写 | 仅指定识图模型；不得当作准确原图原文 |
| deepseekProxy materialsAnalyze | sources/mode/question + 会话配置 → items/evidence | 候选版7种模式；新增行动拆解与可选练习，引文存在性验证不能证明结论正确 |
| wx.shareFileMessage | 用户主动导出的结果TXT | 用户选择分享对象，无自动发送 |

资料同意、限额、源码和未支持类型详见 [MATERIALS.md](MATERIALS.md)。参数等待：网页18秒（服务端总处理10秒）、资料解析35秒、分析65秒、图片转写80秒；需云端端到端验收，不等于实际调用成功。

## 1.1.0 配套接口与兼容性

| 接口 | 行为 | 兼容边界 |
|---|---|---|
| memory.create / goal.create | requestId与所有者派生固定ID；同请求同正文重试返回同记录，异正文冲突 | 请求有效期24小时；不是无限离线待发队列 |
| memory.update | requestId、revision和正文摘要；事务校验版本 | 旧客户端未带revision时，记录已有非零版本会明确拒绝 |
| goal.increment | 原子增量、requestId去重 | 旧绝对进度更新不再接受；新版按钮使用增量 |
| memory/goal.delete、reset.mine | 移除正文并保留最小删除墓碑 | 不得直接回滚到不识别墓碑的旧数据服务 |
| assistantInbox capabilities / job.* | 微信身份下派发与管理自己的接力任务 | jobsProtocol=relay-v1；云端未更新时页面提示，不显示伪任务 |
| assistantGateway job.list/claim/complete | 指定连接的任务摘要、限时领取和结果回传 | 独立workJobs权限；不提供本机文件或shell工具；HTTP入口待核验 |

更多限额与MCP工具定义见 [ASSISTANT_BRIDGE.md](ASSISTANT_BRIDGE.md)。这些接口的本地实现、部署回读与真实云端调用分别验收。
