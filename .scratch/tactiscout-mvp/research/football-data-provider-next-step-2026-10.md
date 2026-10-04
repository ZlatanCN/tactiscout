# TactiScout 下一项足球数据源集成：官方资料对比

核查日期：2026-10-04。仅使用数据提供方/发布方官方 API 文档、价格页、条款与数据集仓库。未调用数据 API、未消耗配额、未获取或保留球员 payload。结论是工程选型，不构成法律意见。

## 结论

**下一项值得写代码的是 Reep 的本地 ID crosswalk adapter，而不是把 Reep 当球员统计源。** 当前仓库的 [`PlayerRepository`](../../../src/data/provider.ts) 已有 query-scoped 搜索、目标队检查、按 ID 取球员和比较组接口；[`PlayerDataSourceIdentity`](../../../src/domain/schemas.ts) 已保存 provider 与 source player/team/competition/season IDs。Reep 可用每周发布、可本地保留的 CC0 register 将 Sportmonks、StatsBomb 等 provider ID 映射到稳定的跨源 Reep ID，直接解决现有系统「多个来源记录能否确认为同一球员」的基础问题。它没有表现统计，不能单独扩大球员发现或能力评估。[Reep 下载与版本说明](https://reep.football/get-started/) · [Reep 发布字段与隐私说明](https://reep.football/data-handling/) · [Reep 当前覆盖](https://www.reep.football/coverage/)

**若以新增候选球员表现资料为目标，PlayerElo 是最值得继续核实和扩展的现有集成。** 它宣称覆盖 176 个赛事、7.9 万多名球员、每日更新，提供球员 Elo/EAR、历史、style per-90 与俱乐部/联赛名单；当前仓库只在最终报告阶段补充外部 Elo 信号，并未把它作为 query-scoped 候选池。官方说 Pro (€19/月) 面向生产 app/dashboard，付费计划允许商业用途、Business 计划另外含 commercial licence；不过资料没有明确回答原始值长期缓存/本地快照与将值交给 Ollama 或其他模型的权限。因此先完善 ID、schema 和许可记录，保持 Elo 与战术能力证据分开，不用它替代 StatsBomb 的职责指标。[PlayerElo API 与套餐](https://playerelo.football/api-access) · [PlayerElo 模型说明](https://playerelo.football/player-ratings-api)

**API-Football 在技术上最贴近完整候选搜索，但当前公开许可使它不能作为公开作品集的真实数据源。** 它提供明确的当前球队名单、按联赛/赛季分页的球员统计和比赛级表现；其服务条款明确写明没有授予将数据发布在应用、网站或其他产品中的许可，需自行从权利方取得。它只适合作为经许可后再接入的 schema 参考，不能因为免费套餐含这些端点就先公开展示。[球员端点指南](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [条款](https://www.api-football.com/terms)

## 与当前查询接口的匹配

接口要求搜索能诚实报告 `playerName`、`position`、`maxAge`、`minimumMinutes`、`competition`、`season` 过滤是否已应用，并支持目标队名册、ID 查询与同组比较。查询结果中的未知年龄不能伪装成满足年龄上限；来源若缺字段或无法按请求过滤，应报告不支持，不能静默放宽查询。[当前接口](../../../src/data/provider.ts)

| 来源 | 当前球员身份 / 阵容 | 能力评估数据 | 更新与额度 | 展示、保存、模型使用 | 对 query-scoped contract 的适配 |
| --- | --- | --- | --- | --- | --- |
| **TheSportsDB** | 官方 API 有球队球员名单与球员档案/ID；适合补队内身份与基本字段，但 endpoint 仅称列出为该队效力球员，未承诺当前赛季准确度、更新 SLA 或字段完整性。官方自称 crowd-sourced。 | 有球员统计 endpoint 和合同 lookup，但官方未给完整统计字段词典、单位、样本分母或数据新鲜度保证；不适合打战术能力分。 | 免费 30 req/min；付费 Single Developer $9/月、100 req/min。免费/付费名单 endpoint 单次记录上限分别为 10/3000；球员统计为 10/10000。 | 条款允许复制和修改官方 API endpoint 返回内容；免费开发可用，发布 app store app 必须付费；付费应用须署名。公开资料没有明确缓存期限、取消后的留存方式或 AI/LLM 授权；图片/标志需各自核权。 | 适合单独实现 `inspectTeam` / roster identity enrichment；没有明显的跨联赛、多过滤候选检索面，不足以实现 `searchCandidates` 的分钟数、年龄和角色评估。作为**阵容辅助源**。[API 文档](https://www.thesportsdb.com/documentation) · [价格](https://www.thesportsdb.com/docs_pricing) · [条款](https://www.thesportsdb.com/docs_terms_of_use.php) · [crowd-sourced 说明](https://www.thesportsdb.com/docs_about) |
| **API-Football** | `/players/squads` 明确返回球队当前登记名单，另有球员 ID、年龄、位置、号码等档案字段；覆盖需按赛事/赛季查。 | 赛季球员统计与逐场球员统计包括分钟、位置、进球、助攻、传球、抢断、拦截、对抗、盘带等；可支持确定性计算，但统计覆盖和字段新鲜度随赛事而变。 | 免费 100 请求/日及 10 请求/分钟；官方付费计划起 $19/月、7,500 次/日。文档称覆盖 1200+ 赛事，但可用赛季和统计会因赛事有差别。 | 条款明确**没有**授予 app/website/product 发布许可；需另外取得权利方许可。缓存和 AI/LLM 权利未获明确授权。 | 技术上适配度最高：联赛/赛季和球队 roster 端点可支撑 query-native 分页，再在服务端应用 `position`/年龄/minutes 过滤；但除非取得书面发布许可，禁止把此适配作为公开项目在线来源。**许可未解决前不写公开集成。** [端点指南](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [费率](https://www.api-football.com/pricing/) · [限流](https://www.api-football.com/news/post/how-ratelimit-works) · [条款](https://www.api-football.com/terms) |
| **PlayerElo** | API 搜索/球员记录包含 player ID、位置、current team/league；另列俱乐部球员和联赛球员端点。数据页宣称覆盖 176 个赛事、79K+ 球员并每日更新，但它不是有合同状态保证的官方注册名单。 | Elo、EAR、比赛历史与 style per-90；其 Elo 是按官方自述的胜平负 Davidson 三结果模型、对手强度和上场分钟更新的综合模型信号，不是原始战术事件统计。适合作为单独的外部背景指标/比较信号，不能直接当成压迫、推进或传球证据。 | 免费 500 次/月、10 次/分钟；Pro €19/月，10,000 次/月、120 次/分钟；Business €199/月，300,000 次/月、600 次/分钟。列表页最大 100，分页 offset。 | API 页称付费计划可商业使用、Business 包含商业许可；Pro 标注 production apps/dashboards。未见对本地永久留存、browser/localStorage 报告快照、外部/本地 LLM 输入的明确规则；应保持 model-input gate 关闭并向提供方书面确认。 | 可用 league/club page 搭建有限的 query-native 候选来源，但年龄字段未在球员基础 schema 中出现；若用户提出年龄上限，必须返回缺失/无法满足，不能暗中放宽。Elo/style 应另存 `externalSignals`/独立信号字段，不能塞入 `CapabilityEvidence` 或参与现有职责分数。当前代码已有报告 enrichment，**这是较强的候选池扩展路线**，需先补齐字段 schema/权利核验。[API 文档](https://playerelo.football/docs) · [API/价格/商业使用](https://playerelo.football/api-access) · [模型方法](https://playerelo.football/player-ratings-api) |
| **Reep** | 稳定 Reep identity + provider-scoped IDs/aliases；官方覆盖页目前列有 `sportmonks`、`statsbomb`、`api_football` 等 bridge。玩家实体的 public relationship 列表为空；球员队伍履历、名单归属与出场资料留在 private matching evidence，**Reep 不提供当前 roster**。 | 不提供球员统计、评级、xG、追踪或战术指标。 | 下载快照 CC0、无需 key、不计在线请求；官方称每周发布新 snapshot，每个发布带 stamp/changelog。当前下载文件约 769 MB；API 单条查询需手动发放 key。 | Reep-held 的 IDs、provider IDs 与名称别名可 CC0 下载和保留。其数据处理说明表示公开不含 DOB，未成年人和年龄未知者不给出生日期。CC0 不解决个人数据/模型处理的所有非版权问题；ID 映射不必发送给 LLM。 | 和当前 contract 最匹配的是**跨 source identity seam**：基于 `(provider, namespace, external_id)` 连接同一实体、维持源字段、为合并给出明确 evidence，不依据姓名或裸数字 ID 猜测。它不实现 `searchCandidates` 的表现查询，应作为 identity sidecar。 [下载/版本](https://www.reep.football/get-started/) · [schema 与公开关系边界](https://reep.football/docs/) · [数据处理](https://reep.football/data-handling/) · [provider coverage](https://www.reep.football/coverage/) |
| **Afriskaut Dynasty Scouting League 2024（开放数据候选）** | 固定 2024 赛事的 event/lineup/match metadata，具有内部球员 ID，不是现役职业市场名单，也无滚动更新。 | 有 JSONL 事件、标签定义、首发/换人/比赛时间和 497×328 坐标，可探索事件派生指标、传球网络/区域活动并做跨 schema benchmark；必须逐项按 event map 解释，不能把不同事件源字段名直接对齐。 | 公开静态压缩包，无 API key、费率或更新 SLA。 | Repo 声明 Apache-2.0，允许使用/复制/修改/分发并要求公开项目署名 Afriskaut；该许可没有单独规定模型处理。若数据中含可识别球员，个人数据、肖像、参赛授权及公开展示仍需单独核实。 | 适合作为本地**表现数据 benchmark / 事件 adapter**，但不能扩充德国/西班牙转会候选池。只在 scope 中明确写 2024 competition 和样本限制；不将其作为通用当前球员池。 [官方 dataset README 与格式/许可](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data) · [Apache-2.0](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data/blob/main/LICENSE) |

## 推荐编码顺序

1. **先实现 Reep 下载快照的本地身份 resolver（推荐下一项 coding）。** 输入必须是明确 provider slug + namespace + source external ID；输出 Reep ID、其他 provider bridge、release stamp 和 redirect/canonicalization 信息。身份结果应加入来源身份 sidecar，不覆盖 provider 原 ID，不通过姓名自动合并。初始化时只加载本次运行需要的映射或构建本地小型索引；记录 snapshot stamp，提供更新/redirect 流程。
2. **再将已有 PlayerElo client 扩展为可选的 native query provider / 球员信号 adapter。** 不先把年龄筛选说成可用；把独立 Elo、EAR、style 字段与事件表现分开，任何缺失字段为 unknown。等 PlayerElo 确认产品缓存与模型输入范围后，再开放对应开关。技术先做基于 provider ID 的匹配；避免仅凭规范化姓名覆盖异名/同名歧义。
3. **TheSportsDB 可做按球队检查的辅助来源**：只显示带来源名和抓取时间的 identity/position/roster discrepancy，不用于能力评分、身价或模型上下文，除非另行确认这些权利。
4. **Afriskaut 仅做独立 benchmark**：先分析 Apache 数据的事件字典和参与者数据边界，再增加能隔离数据 scope 的离线 loader；不混进默认候选池。
5. **API-Football 暂不作为公开项目 provider**：先取得明确的公开展示/发布许可，之后再做正式 query adapter。低免费 quota 不是主要障碍，许可是。

## 影响范围与剩余核验

- 当前 `PlayerProfile` 使用 source-specific `playerId`、`sourceIdentity`、scope 赛事/赛季与 available stats；跨源 canonical ID 适合独立 identity map，不要把同名记录直接去重。
- query contract 的 `maxAge` 和 `minimumMinutes` 是硬条件。没有 DOB/分钟值的 provider 不能返回已筛选候选并声称通过；要么有对应数据，要么清楚失败/追问。
- PlayerElo 与 TheSportsDB 对长期保存、浏览器分析快照和模型输入的具体条款仍不明确；API-Football 对发布许可有明确否定表述；Reep 与 Afriskaut 的开源许可证不自动替代隐私、肖像或其他上游权利检查。
- 下一次真实 API 冒烟检查须待用户/运营人提供 key 后单独做最小请求；本轮没有做任何 live profile lookup。

## 一手来源索引

- [TheSportsDB API](https://www.thesportsdb.com/documentation) · [Plans](https://www.thesportsdb.com/docs_pricing) · [Terms](https://www.thesportsdb.com/docs_terms_of_use.php) · [About](https://www.thesportsdb.com/docs_about)
- [API-Football endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [Pricing](https://www.api-football.com/pricing/) · [Rate limits](https://www.api-football.com/news/post/how-ratelimit-works) · [Terms](https://www.api-football.com/terms)
- [PlayerElo API docs](https://playerelo.football/docs) · [Access/pricing/commercial terms](https://playerelo.football/api-access) · [Rating methodology](https://playerelo.football/player-ratings-api)
- [Reep downloads and updates](https://www.reep.football/get-started/) · [API contract](https://reep.football/docs/) · [Data handling](https://reep.football/data-handling/) · [Coverage](https://www.reep.football/coverage/)
- [Afriskaut dataset and event format](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data) · [Apache 2.0 licence](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data/blob/main/LICENSE)
- [StatsBomb Open Data README](https://github.com/hudl/open-data/blob/master/README.md) · [Current query-scoped repository contract](../../../src/data/provider.ts) · [Domain source identity](../../../src/domain/schemas.ts)
