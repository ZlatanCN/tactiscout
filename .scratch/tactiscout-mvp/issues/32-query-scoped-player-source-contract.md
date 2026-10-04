# 面向按需调查的数据源查询契约

Type: task
Status: claimed
Labels: ready-for-agent

## Goal

让 LangGraph 的候选搜索、球队调查和候选评估能够按实际问题向数据源查询，而不要求在线 provider 先把整个球员库加载到内存。这个接口为后续接入 PlayerElo 当前球员评分等数据源打基础。

## Why now

当前 `PlayerRepository` 只有 `loadPlayers()`。每次 `inspect_team`、`search_candidates` 和 `evaluate_candidates` 都会先加载整份数据，再由 Agent 进程本地筛选。这个设计适合小型离线样本，却不适合 79K 球员级在线 API：一次全量读取会耗尽免费请求额度，也无法保留 provider 自己的分页、延迟、限流与查询范围语义。

已有代码还将“搜索发现”“球队名单核查”“按 ID 评估”拆成 LangGraph 工具动作。数据源契约应让这些动作保留清晰的查询边界，使每一步的实际条件、命中数、续页位置和数据范围都进入工具轨迹；来源失败不能伪装成空名单。

## Scope

- 定义稳定的按需查询接口，至少覆盖按球队调查、候选页搜索、按来源 ID 取得评估资料，以及按赛事/赛季/位置取同组比较样本。
- 离线 StatsBomb、Wyscout、SkillCorner 和虚构 demo 仓库继续使用本地数据实现该接口。
- LangGraph 继续负责选择是否调用哪个数据工具；适配器只执行结构化查询，不替 Agent 做推荐决策。
- 远端分页不得跳页或隐藏候选；如果 provider 不返回精确总数，结果需显式标记总数未知，不能虚报零命中或完整数据范围。
- provider 限流、认证、空结果和响应错误维持可区分；长请求支持取消或时限。
- 下一步 PlayerElo 集成只作为独立来源信号：外部 Elo/EAR 可以作为有来源和更新时间的评估证据，但不采用 provider 的 transfer-fit、prospect score 或 market-value estimate 代替 TactiScout 自己的分析。

## Acceptance criteria

- [x] 对话式 LangGraph 数据工具通过查询契约访问数据；现有离线仓库继续通过本地数据适配保持原有筛选行为。
- [x] 候选搜索的请求条件、offset/limit、返回游标、已应用筛选和匹配数是否已知均可审计；数据源若未应用硬条件或返回不连续分页，结果会报错而不会进入名单。
- [x] 候选评估按已发现来源 ID 取得档案，并单独请求同位置、同赛事、同赛季的比较样本；query-only provider 无需提供全库读取方法。
- [x] 报告数据范围按本案实际读取到的球员身份、赛事和赛季累计；checkpoint 只保留该范围摘要，不复制完整球员记录。
- [x] 在线 adapter 的凭据只在服务端；PlayerElo 默认关闭，报告展示必须显式 opt-in；报告专用路径不会把来源数据传给 Agent 模型。
- [ ] 配置可用的 PlayerElo key，并确认当前方案允许报告展示及保存在本机 LangGraph checkpoint / 浏览器 localStorage 后，执行真实 API smoke；记录脱敏结果，不保存 key 或完整原始响应。客户端自身不缓存；应用管理的本地保留由独立 opt-in 门控。未来若将来源数据传给 Ollama，需单独确认模型处理权限。

## Research basis

- [足球数据源扩展调查](../research/football-data-source-expansion-2026-10.md)：PlayerElo 的列表接口按 Elo 排序且用 `limit/offset` 分页；详情接口提供 Elo、EAR、队/联赛、比赛和分钟样本。官方免费层为每月 500 次、每分钟 10 次，定位 evaluation/hobby；未找到完整公开 API license，公开展示、缓存/持久化与将响应交给本地 Ollama 的范围仍未说明。
- [PlayerElo 官方 API 文档](https://playerelo.football/docs)、[定价/接口与商业使用说明](https://playerelo.football/api-access)：文档给出 bearer key、最多 100 条分页及 401/404/429 错误；详情字段与 fit/value endpoints 区分清楚。
- [PlayerElo 模型说明](https://playerelo.football/)：其 Elo 基于球队赛果与阵容/分钟加权，可补整体贡献信号，但不是逐事件战术表现统计。
- [Sportmonks 现有接入 issue](20-licensed-player-provider-and-provenance.md)：真实当前赛季 provider 仍等待账户/模型处理权限验证；不要通过复用来源开关绕过权限。
- [Reep 身份注册表](https://reep.football/data/)：官方免费 CC0 release 提供 `(provider, namespace, external_id) -> reep_id` 精确桥接；可作为后续 Sportmonks、StatsBomb、Wyscout 与 API-Football/PlayerElo 连接的本地身份层，但不是阵容或表现数据源。

## Comments

- 2026-10-04：基于新增数据源调查和现有 Agent 代码检查认领。当前全库 `loadPlayers()` 适合本地数据，却会让在线 provider 的 API 使用与 Agent 分页脱节；先加深真实的数据源接口，再接外部评分源。
- 2026-10-04：新增 `PlayerEloClient` 只读底座：支持按姓名/联赛分页、按来源 ID 读取档案与评分历史；请求带超时并区分鉴权、限流、网络和响应错误，不缓存、不落盘，也不暴露 transfer-fit、prospect-score 或 market-value endpoint。模型处理与报告展示权限都未显式确认时构造失败。此 client 尚未接入 Agent；当前 LangGraph 工作流仍通过 `loadPlayers()` 全量加载，因此在线接入前仍须完成本 issue 的按需查询契约。
- 2026-10-04：对话图已改用 `searchCandidates`、`inspectTeam`、`getPlayersByIds` 和 `getComparisonPlayers` 四个按需入口；`loadPlayers` 可选，只有离线兼容适配器才以它作为默认实现。候选页校验来源实际执行的筛选、精确/未知总数、ID 唯一性和连续游标；来源失败不填成零匹配。调查范围累计真实读取记录的身份、赛事和赛季摘要，不把完整球员档案复制到 checkpoint。TypeScript build 通过；没有运行测试。PlayerElo 尚未接入，真实授权、key 和 smoke 仍未完成。
- 2026-10-04：PlayerElo 已接入为可选 LangGraph 报告节点：仅在证据审查通过后，对最终推荐候选按姓名查询；只有分页结果未满 100 条且规范化姓名唯一时才附加 Elo/EAR 标签。外部信号在结构、报告卡片和覆盖状态中独立呈现，不进入 Agent prompt、能力证据、排序或评分；默认因缺 API key/展示许可/本地保留许可而关闭。客户端不做缓存，但启用后应用会将报告状态保存在本机 LangGraph checkpoint 与浏览器 localStorage，因此有单独保留许可门控。前后端 build 通过；没有运行测试，也未配置 key 或调用真实 API，展示权、保留权和 smoke 仍待确认。
- 2026-10-04：重新查看 [PlayerElo 官方 API access](https://playerelo.football/api-access) 与[接口文档](https://playerelo.football/docs)：官网当前仍列免费档 €0、500 次/月、每分钟 10 次、evaluation/hobby 用途，且所有 endpoint 需要 Bearer key；页面的 key/subscription 入口当前显示 “Temporarily unavailable”。因此它暂时不能作为无需用户凭据的 live 验证路径，也不适合替代 FBref 成为主候选源；保留现有可选 report-only adapter，等 free-key 入口恢复后再联调。

## Answer

进行中。查询契约已进入对话 Agent，离线适配可继续使用现有数据。PlayerElo 现有一个默认关闭的 report-only enrichment 路径，仍缺可用 key、展示权与本地保留权确认，尚未执行真实 API smoke；它是推荐后的独立信号，不是候选发现数据源。
