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

- 定义稳定的按需查询接口，至少覆盖按球队调查、候选页搜索和按来源 ID 取得评估资料。
- 离线 StatsBomb、Wyscout、SkillCorner 和虚构 demo 仓库继续使用本地数据实现该接口。
- LangGraph 继续负责选择是否调用哪个数据工具；适配器只执行结构化查询，不替 Agent 做推荐决策。
- 远端分页不得跳页或隐藏候选；如果 provider 不返回精确总数，结果需显式标记总数未知，不能虚报零命中或完整数据范围。
- provider 限流、认证、空结果和响应错误维持可区分；长请求支持取消或时限。
- 下一步 PlayerElo 集成只作为独立来源信号：外部 Elo/EAR 可以作为有来源和更新时间的评估证据，但不采用 provider 的 transfer-fit、prospect score 或 market-value estimate 代替 TactiScout 自己的分析。

## Acceptance criteria

- [ ] LangGraph 数据工具通过查询契约访问数据，离线仓库保持相同行为。
- [ ] 候选搜索的请求条件、offset/limit、返回游标、匹配数或未知状态均可审计。
- [ ] 候选评估只为已发现并请求的来源 ID 加载证据，不隐式读入整个远端目录。
- [ ] 报告中的数据范围反映实际查询结果；不会把一次 provider 页响应描述成完整市场。
- [ ] 在线 adapter 的凭据只在服务端；默认不允许来源数据进入 Agent 模型上下文或用户报告，直到对应处理/展示权限被明确启用。
- [ ] PlayerElo 免费 key、报告展示、本地 Ollama 处理和缓存/保留条件完成核实后，才执行真实 API smoke；记录脱敏结果，不保存 key 或完整原始响应。

## Research basis

- [足球数据源扩展调查](../research/football-data-source-expansion-2026-10.md)：PlayerElo 的列表接口按 Elo 排序且用 `limit/offset` 分页；详情接口提供 Elo、EAR、队/联赛、比赛和分钟样本。官方免费层为每月 500 次、每分钟 10 次，定位 evaluation/hobby；未找到完整公开 API license，公开展示、缓存/持久化与将响应交给本地 Ollama 的范围仍未说明。
- [PlayerElo 官方 API 文档](https://playerelo.football/docs)、[定价/接口与商业使用说明](https://playerelo.football/api-access)：文档给出 bearer key、最多 100 条分页及 401/404/429 错误；详情字段与 fit/value endpoints 区分清楚。
- [PlayerElo 模型说明](https://playerelo.football/)：其 Elo 基于球队赛果与阵容/分钟加权，可补整体贡献信号，但不是逐事件战术表现统计。
- [Sportmonks 现有接入 issue](20-licensed-player-provider-and-provenance.md)：真实当前赛季 provider 仍等待账户/模型处理权限验证；不要通过复用来源开关绕过权限。
- [Reep 身份注册表](https://reep.football/data/)：官方免费 CC0 release 提供 `(provider, namespace, external_id) -> reep_id` 精确桥接；可作为后续 Sportmonks、StatsBomb、Wyscout 与 API-Football/PlayerElo 连接的本地身份层，但不是阵容或表现数据源。

## Comments

- 2026-10-04：基于新增数据源调查和现有 Agent 代码检查认领。当前全库 `loadPlayers()` 适合本地数据，却会让在线 provider 的 API 使用与 Agent 分页脱节；先加深真实的数据源接口，再接外部评分源。
- 2026-10-04：新增 `PlayerEloClient` 只读底座：支持按姓名/联赛分页、按来源 ID 读取档案与评分历史；请求带超时并区分鉴权、限流、网络和响应错误，不缓存、不落盘，也不暴露 transfer-fit、prospect-score 或 market-value endpoint。模型处理与报告展示权限都未显式确认时构造失败。此 client 尚未接入 Agent；当前 LangGraph 工作流仍通过 `loadPlayers()` 全量加载，因此在线接入前仍须完成本 issue 的按需查询契约。

## Answer

进行中。PlayerElo API 的只读客户端已具备基本请求、分页与失败边界，但没有绑定环境变量或触发线上请求。按需查询接口和本地适配尚未完成；PlayerElo 的公开展示、缓存/保留及本地 Ollama 处理权利也仍待明确，因此不能把它描述成已接入的候选数据源。
