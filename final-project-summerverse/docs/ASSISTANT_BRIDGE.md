# 电脑接力与灵感收件箱

## 当前体验版：1.1.0（2026-09-12，公网接力待开通）

【已核实】dataService、deepseekProxy、assistantGateway、assistantInbox已更新；从腾讯云下载回读的35个源码和配置文件与干净副本一致。公众平台显示1.1.0为体验版，上传时间14:44:45。Node.js20.19、256MB及20/90/20/20秒配置保持原样。证据 `dist/relay-cloud-20260912/verification.json`、`experience-1.1.0.json`。未测试真实微信身份数据往返或真实外部客户端。

【已核实】本日再次打开个人版的原生网关资源限频配置，平台提示当前版本不支持并弹出标准版升级：179.10元/月，本周期补差155.22元，到期2026-10-08 23:59:59；仅为当前页面报价。已取消，未购买。`/assistant`仍禁用，路由鉴权未开启、限频未设置。证据 `dist/relay-cloud-20260912/gateway-readback.json`。该阻塞只影响公网电脑连接，不能据此说小程序所有功能都需升级。购买也不替代后续权限、日志、限频与真实客户端验证。

【已核实，本地代码】在旧“电脑投递草稿到手机”的基础上补齐反向交接。首页 → 电脑接力：选择一个已授权连接、一个自有资料工作台和明确勾选的来源，确认发送范围后入队。电脑的本地MCP适配器领取快照，用户自己的AI客户端在已有项目与权限内工作，再回传带资料出处的结果。手机可查看、采纳、取消或清除。采纳只改变接力结果状态，不自动创建记忆、完成任务或增加时长。

### 权限与数据流

- 连接新增独立 `workJobs` 开关，默认false。旧连接不会自动扩权；`readRecent`依然单独授权。最大5个连接、30天有效期不变。
- 手机只传 `workspaceId/revision/sourceIds/connectionId/requestId/prompt`。服务端在事务中按SDK OPENID读取自有工作台并核对版本，再冻结选定文字。客户端不能自行传入任意正文冒充该工作台。
- 单笔至多6份来源、120个片段、12000字符；超限拒绝，不自动截断。正文可能来自OCR或网页提取，不能当作原版文件。任务摘要不含全文，只有已授权且指定的连接领取后拿到快照。
- 状态为 `queued → running → review → accepted`，用户可取消任意未取消状态。领取15分钟有效，同一有效claimId可重试；过期需显式使用该任务从未用过的新claimId，最多20次。旧结果不能覆盖新领取。
- 结果最多3000字符，须有1–6条引文；逐项核对sourceId/chunkId/原句。引文存在不代表结论正确，手机持续显示AI辅助与待核对提示。
- 创建和外部访问沿用每日单连接40次、账号80次额度；手机查看、取消和采纳不消耗此额度。每用户接力列表最多20项，仅已取消且清空正文的墓碑可自动退出索引，已采纳成果不会悄悄消失；满额需用户明确清理。
- `job.cancel`清除该任务标题、要求、来源快照、结果、领取标识及工作台引用，保留所有者/连接绑定/请求摘要/状态时间等最小去重墓碑。无自动TTL；不承诺长期元数据零增长。清除云端任务不能收回电脑或模型已接收的副本。
- 原 `assistant_drafts` 集合复用并增加 `type:job`；无type的旧记录仍视为草稿，旧草稿接受/列表不能误取接力任务。不新增公共集合。
- HTTP请求仍限16KiB、适配器响应256KiB；网关不执行shell、不浏览URL、不读取本机文件。模型及操作权限由外部AI客户端配置。用户导入的通知、网页、文档均不构成额外的工具授权。

### 接口

| 调用方 | action | 输入重点 | 返回 |
|---|---|---|---|
| 微信SDK | capabilities | 无 | `jobsProtocol: relay-v1` |
| 微信SDK | job.create | 连接、工作台版本、所选来源、要求、幂等requestId | `job` |
| 微信SDK | job.list / job.get | 无 / id | `jobs`摘要 / 自有完整job |
| 微信SDK | job.cancel / job.accept | id | 更新后的job |
| 外部连接 | job.list | 无 | 仅指定给该连接的任务摘要 |
| 外部连接 | job.claim | id、claimId | 选定资料快照和领取状态 |
| 外部连接 | job.complete | id、claimId、title/text/evidence结果 | 待手机核对的job |

新增MCP工具 `summerverse_jobs`、`summerverse_claim_job`、`summerverse_complete_job`，与旧3项共6项；沿用stdio自定义工具，**没有声明MCP实验性Tasks能力**。后台业务HTTP地址不能直接用作Streamable HTTP MCP地址。没有自动唤醒电脑或后台轮询。

### 验证与部署顺序

【已核实，本地】`tests/assistant-jobs.test.js`包含实际启动 `server.cjs` stdio子进程并走业务服务的隔离闭环；使用合成数据库和测试网络响应。`tests/relay-client.test.js`验证发送确认、版本/来源白名单、回执丢失重试、重连保持同一请求、换连接拒绝与离页晚到结果。安全复核中的历史领取标识复用、已采纳任务孤立留存和重连重复派单均已修复。它们不证明云端已更新或真实电脑客户端已连接。

1. 保留当前云包及配置，核对三个助手集合和 `material_workspaces` 仍为ADMINONLY。
2. `node scripts/sync-assistant-policy.js` 同步policy/jobs，先部署 `assistantGateway` 与 `assistantInbox` 同一版本，保留SDK-only与公网入口隔离。
3. 本轮可靠性更新还需 `dataService` 与 `deepseekProxy` 的配套部署；确认存量记录字段缺失兼容、`_deleted != true`查询与现有索引、真实事务行为。数据删除使用最小墓碑防止旧创建请求复活；旧客户端绝对值修改目标进度和缺少revision的非零版本记忆编辑将被拒绝，需与新版一起交付。备份只作回滚素材；新数据产生墓碑后不能裸恢复不识别墓碑的旧服务，必须保留删除过滤与版本/权限检查。
4. 平台层入口限频、日志与权限核验完成前不启用 `/assistant`。路由开启不是内部配额的替代，也不是费用封顶承诺。
5. 上传新版小程序后，使用专门测试连接和合成资料，真实验证领取/回传/撤销；只有届时才能标记跨设备可用。外部客户端私有MCP配置由用户明确选择后配置，不把凭证写进仓库。

历史部署记录保留在下方；当前状态以 [ACCEPTANCE_STATUS.md](ACCEPTANCE_STATUS.md) 最上方为准。

## 功能边界

设置 → 灵感收件箱：查看草稿、修改标题/正文/日期或目标数量、确认保存、忽略。连接默认仅投递，可主动允许最近20条记忆正文和20项目标读取。凭证30天有效，最多5个连接，可单独撤销。撤销不清空已收到草稿。

电脑端是本地 stdio MCP 适配器，见 `integrations/mcp/README.md`。HTTP网关是其后端业务接口，不是直接供客户端填写的远程MCP URL。1.1.0新增显式任务交接，仍不包含电脑远程执行、自动背景同步、装饰解锁或聊天室同步。

## 部署顺序

1. 云环境 `cloudbase-d5gdro8i30f1a4efd` 新建 `assistant_accounts`、`assistant_connections`、`assistant_drafts`，全部设 ADMINONLY（read:false / write:false）。不要更改其他课程集合。
2. `node scripts/sync-assistant-policy.js` 同步独立部署包中的纯校验模块；测试校验两份一致。
3. 部署 `assistantInbox` 和 `assistantGateway`，建议执行超时20秒。前者只允许小程序SDK身份调用，**不得绑定HTTP入口**。
4. 在控制台核对网关日志不采集 Authorization / 请求正文、访问日志查询字段不含凭证、无自动请求回显/APM采集；启用适当的网关流量限制。代码只记录计数和最近使用时间，不写请求日志。
5. 仅将 `assistantGateway` 绑定HTTPS路径 `/assistant`，确认原始 httpMethod/headers/body envelope。默认网关域名的可用性、限制以当前套餐和平台实际结果为准，不声称已有正式域名。
6. 使用专门测试连接跑通：MCP初始化、投递、手机编辑接受、事实页刷新、幂等重试、撤销后401、不同用户不可见。读取功能需测试账号单独授权；不使用真实私人记忆作fixture。
7. 更新公众平台隐私说明，再上传并设置体验版。完成以上之前，不把公网接口或新版体验版标记为可用。

## 数据与安全

- Token由服务端32随机字节生成，只返回一次，数据库文档ID为SHA256；列表只返回公开连接ID，不返回摘要或原文。
- 外部网关不含创建连接、接受草稿、删除数据等管理方法；身份只取连接绑定的OPENID。手机管理只取SDK OPENID。
- 单连接每日40请求，用户每日80请求，最多100个待处理草稿；用户每日最多签发10次。已过期连接也占槽位，可断开后重建。计数采用UTC日期。
- 16KB HTTP请求上限、草稿白名单字段、无附件/URL上传。读取仅投影必要内容，模型Key和用户资料不开放。
- 外部草稿不参与成长统计，确认后用固定目标ID在事务里保存，重复确认不会重复生成。source固定ai-assisted；不推断真实步数、时长、地点或目标完成情况。
- 目前保留草稿及撤销记录供幂等和追踪；未实现自动到期清理。限额限制增长速率，不代表永久零成本。
- 文档数据库事务只支持doc操作，因此读取在事务额度预留后查询，返回前重新检查撤销与权限。

## 本地验证与当前状态

【已核实，2026-09-10 本地完整流程】node scripts/local-assistant-demo.cjs 成功。原生模拟器页面经自动化绑定连接回环HTTP服务，复用生产MCP协议和业务服务；合成草稿确认前记忆0条，实际点击确认保存后1条，原时间轴显示该记录，MCP查询accepted。使用内存数据库和stage专用storage桥接，不证明云端或模型调用。证据：dist/local-assistant-demo-1789032120945/index.html、report.json及四张PNG。成功后测试窗口和回环服务已关闭；先前7个本轮遗留stage窗口已限定路径关闭。

【已核实，2026-09-10 免费方案阻塞】Cloudflare通过已登录GitHub继续登录后成功进入控制台；Workers plans显示Free为Current plan（100,000请求/日，10ms CPU/请求）。但腾讯云身份认证→权限控制→创建角色立即弹出“您当前版本暂不支持此功能”标准版升级对话框。专用最小权限角色不可在当前个人版创建，故原免费中转方案暂不可实施。已取消升级，未创建身份/角色、未部署Worker、未开放路由。页面当时展示179.10元/月、剩余周期补差总额167.16元、到期2026-10-08；仅为当时页面报价，不是付款结果或长期固定价格。

【判断，范围澄清】保护目标是无凭据公网请求和非专用HTTP API身份在平台层拒绝；微信已认证SDK调用仍是已有风险，不宣称全身份防绕过或费用封顶。即使采用此范围，专用角色收费仍阻塞当前方案。不要使用管理员API Key或迁移全环境OPA来绕过。若以后决定购买标准版，应优先重新评估原生网关限频，未必还需Cloudflare中转。

【已核实，2026-09-10 本地入口准备】新增 `integrations/cloudflare/ingress.mjs`，默认关闭，仅提供可注入转发器的入口校验和限流逻辑；6项隔离测试通过。未实现真实CloudBase转发/认证，不是可部署完成版。Cloudflare浏览器登录页已交接用户。没有新增远端资源或开放接口。

【判断】后续优先验证原生HTTP API `/v1/functions/assistantGateway`，其默认权限与公开HTTP路由不同；保持公开路由关闭，避免修改公共角色。但还须验证SDK直调权限、专用组织成员配额、最小权限和响应封装。刷新令牌会轮换，必须可靠串行保存，不能静态复制到多个Worker后各自刷新。

【已核实，2026-09-10 免费入口方案复核】当前个人版权限控制页存在系统角色及“创建角色”入口，未创建或修改任何身份/权限；不能仅凭入口存在断言全部能力免费可用。官方网关权限说明指出，拒绝发生在函数执行前，但身份认证不等于限频。现有 /assistant 路由仍禁用。本轮更新清单后 npm run verify 通过，87/87 测试；不代表真实公网联调通过。

【判断，前置安全审查】Cloudflare Worker 仅为待验证候选，不是已交付免费方案。需要同时用 CloudBase 网关身份认证阻断直接源站访问；不得把管理员长期 API Key 放入代理，也不能以函数内部秘密头检查冒充防绕源。不得修改同环境其他课程使用的公共角色权限。Cloudflare 限频按机房计数，不提供严格全局费用上限。当前未部署 Worker、未向新第三方传输用户数据。

【已替代，2026-09-10】此前待确认新增 Cloudflare 处理方；用户随后明确“接受，继续”，已授权本功能中转投递正文、连接令牌及主动授权读取的记忆正文。此决定不代表允许购买套餐或使用管理员凭据。

官方依据：[CloudBase 网关权限](https://docs.cloudbase.net/authentication-v2/auth/auth-gateway)、[HTTP 身份认证](https://docs.cloudbase.net/service/authentication)、[Cloudflare 限频边界](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/)。

【已核实，2026-09-10 后续】使用数字控件加号调整并保存后，官方CLI回读两个函数均 Active / Nodejs20.19 / timeout:20；先前超时3秒状态已被替代。全局日志页显示“当前环境暂未开启日志服务”，未开通额外采集。创建了指向 assistantGateway 的 /assistant 路由，但路由启用开关为false，尚无外部联调。默认域名为 cloudbase-d5gdro8i30f1a4efd-1481960851.ap-shanghai.app.tcloudbase.com。

【已核实】网关资源维度限频标记标准版，尝试配置显示当前版本不支持；已取消套餐升级，未购买。需确定替代入口限流方案或套餐决定后再开放；应用内认证后额度不能替代未认证请求的入口限频。

【已核实，2026-09-10】ego 控制台创建 assistant_accounts、assistant_connections、assistant_drafts，逐项回读选中的权限均为 ADMINONLY。官方微信开发工具 CLI 限定两个新函数部署成功；初次创建阶段曾报 Creating，随后重试成功。HTTP 网关尚无本功能路由，新体验版未上传。

【已核实，2026-09-10】用户同意后，仅删除并通过控制台代码包重建两个新函数；CLI回读两者均 Active / Nodejs20.19。此前“待确认重建”为已替代状态。集合和旧函数保留，尚未开放HTTP。表单20秒未可靠保存，回读曾仍为3秒，超时需继续核实；不将表单输入作为配置成功证据。代码包位于 /tmp/summerverse-node20-20260910/，分别包含本地四个源文件。

【已核实】业务核心与MCP握手已通过隔离内存数据库测试，覆盖串号、撤销、过期、幂等、草稿接受、HTTP入口与页面隐藏凭证。内存事务fixture不代表云端数据库已验收。

【待验证】真实HTTPS网关、集合权限、平台日志/限流、真实外部客户端连接与微信端完整联调。当前体验版仍为此前核实的1.0.5，本功能未正式发布。

参考：[腾讯云HTTP云函数](https://docs.cloudbase.net/service/access-cloud-function)、[事务限制](https://docs.cloudbase.net/database/transaction)、[MCP stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports)。
