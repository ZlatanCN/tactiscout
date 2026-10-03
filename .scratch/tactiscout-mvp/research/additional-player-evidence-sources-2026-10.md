# TactiScout 球员能力证据数据源扩展调查

研究日期：2026-10-04。范围仅包括数据拥有方或其官方代码仓库、产品文档、定价页和协议。本文讨论技术适配与公开资料所能确认的许可，不构成法律意见；“网页能看见 / 文件能下载”不等于已获得本地存储、产品展示、模型处理或再分发许可。

## 结论与建议

短期最值得做成实验 adapter 的是 **SkillCorner Open Data 的 2024/25 澳大利亚 A-League 赛季汇总 CSV**。它有球员、球队、赛季、位置组和出场分钟等身份/样本字段，以及身体表现、传球、无球跑动三个维度。仓库当前发布的文件规模约为 400 条 physical 记录、407 条 passing 记录和 780 条 off-ball-run 记录（CSV 原始行数含表头）；数据说明说样本来自 2024/25 A-League，统计表现要求至少 60 分钟。它能补上普通事件统计较难直接解释的“无球如何移动、向哪些跑动传球、比赛中有球/无球体能差异”证据。来源对这些 CSV 的汇总范围没有承诺后续更新，所以应视作一个标明赛季的历史样例，而不是现役球员市场或当前阵容 feed。[SkillCorner 数据说明](https://github.com/SkillCorner/opendata/blob/master/README.md) · [physical CSV](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_physicalaggregates_20242025.csv) · [passing CSV](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_passingaggregates_20242025.csv) · [off-ball-run CSV](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_obraggregates_20242025.csv)

**建议落地顺序：**先把 SkillCorner schema 做成本地可选 adapter 的实现规格和脱敏/人工编写的 fixture；原始 CSV 保持用户自行下载、默认不入公开仓库。让用户联系 SkillCorner，确认公开的 season aggregates 是否允许作品集项目本地保存、生成/展示球员级派生指标，以及作为输入提供给本地或第三方 LLM。获得清楚授权后，再接入真实样例数据并在输出中注明来源、赛事、赛季、位置、统计时间与覆盖；如没有明确答复，就只保留不含原始球员数据的 parser/fixture，不公开真实球员报告。SkillCorner 的 README 称这是与 PySport 合作“open sourced”的数据发布，并请求使用者 credit；但它未给数据单独列出许可。仓库 MIT 文件授予的是该文件所称的 “Software and associated documentation files” 权利，没有明确说明是否覆盖体育统计数据，也没有专门说明 LLM 或作品集展示用途，因此不把 README 的开放访问表述扩张成完整授权。[SkillCorner README](https://github.com/SkillCorner/opendata/blob/master/README.md) · [SkillCorner LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE)

这个推荐是针对**最短路径的球探能力原型**，不是对数据许可作无条件背书，也不是让 SkillCorner 单独支撑拜仁/巴萨引援搜索。它只覆盖一个已结束赛季的 A-League；当前要找欧洲俱乐部候选人，仍须另接覆盖目标联赛的 provider（项目已经有 StatsBomb 与可选 Sportmonks adapter）。SkillCorner 公共 API 文档列出了 players、physical、metrics、tracking、match 等资源，但 SkillCorner Open Data 仓库说明真实客户通过 credentials 读取其 `match_ids`，并未公开客户 API 定价或所有联赛权限。[SkillCorner API docs](https://www.skillcorner.com/api/docs) · [SkillCorner data repository](https://github.com/SkillCorner/opendata/blob/master/README.md) · [官方联系页](https://skillcorner.com/us/contact-us)

## 来源比较

| 来源 | 可用球员/样本和更新性 | 能力/战术证据字段 | 访问/费用 | 本地保存、展示、LLM 与作品集边界 |
| --- | --- | --- | --- | --- |
| **SkillCorner Open Data** | 仓库提供 2024/25 澳大利亚 A-League 的 10 场 broadcast tracking 与对应 dynamic events / phases of play；另有覆盖赛季全部比赛的 season aggregate CSV。文件行数约 406 physical 数据行、407 passing 数据行、780 off-ball-run 数据行（来自仓库 CSV 页元数据；OBR 按球员/位置等拆行，因此不能把行数当作唯一球员数）。季节聚合含 player name/id、team、position group、minutes；不是面向当前转会季的更新 feed，仓库未承诺更新频率。 | Physical：距离、每分钟米数、跑动/高速跑/冲刺距离和次数、高强度距离/次数、加减速、爆发加速、PSV99 等；passing：传球尝试、完成率、xPass、距离、向跑动传球、line-break、危险传球等；OBR：身后、回撤、套边、内切/half-space、支援等跑动的数量、距离、是否接球、随后射门/进球等。README 说 season aggregates 只收录单次表现超过 60 分钟者；tracking 为 10fps，带 frame/time/period、球和球员 XY、possession 与 detected/extrapolated 标记。 | Open Data GitHub 仓库可直接浏览/下载，无 API key 要求；未列该样例数据的价格。付费产品/API需联系 SkillCorner；官方 API 文档公开展示 endpoint 清单，仓库说明客户才可以 credentials 连接客户 `match_ids`。公开资料未见统一价格或匿名免费 API 配额。 | 仓库 README 要求使用时 credit SkillCorner，且称此数据是为研究和体育分析社区发布；但 README 没有明确列出数据本身的独立许可。仓库有 MIT LICENSE，但其授予对象文字指向软件和关联文档，未明确把 CSV/比赛数据纳入或排除。基于现有一手资料，**不能确定**是否允许把原始球员级数据存入 TactiScout、对外展示或提交到公开作品集；也没有找到数据授权可用于外部 LLM 或模型训练/推理的明确条款。取得书面许可前，raw CSV 不入仓、不部署，模型处理保持关闭。 |
| **Metrica Sports Sample Data** | 官方仓库说明原有两场标准 CSV，并在 2021-04-15 加入 Sample Game 3 的 FIFA EPTS 格式；样本以比赛为单位，没有稳定更新承诺。标准样本匿名化，README 明确说没有球员、球队或赛事名称，所以不能作为被搜寻转会候选人的跨赛事球员统计画像。 | 同步的事件数据与追踪数据；归一化坐标、105×68 米球场；可练习带球/跑位/空间、队伍形状及事件上下文分析。第三场使用 EPTS tracking metadata 与 JSON events。它更适合战术模型/可视化的可重复样例，不适合作为球员 shortlist 的身份数据源。 | 官方 GitHub 仓库可浏览/下载，无 API key 或付费门槛声明；仓库介绍它是其商业 Elite 数据格式的样例，不提供商业数据包价格。 | README 的 Legal 部分要求“负责使用”，并要求任何公开用途 acknowledgement；仓库文件列表没有清楚的数据 license。该 acknowledgement 不足以确认本地持久化、原始文件再发布、球员层展示（样本匿名）或 LLM 处理权。作品集使用前仍需核实具体数据许可。由于匿名且仅少量比赛，即使取得授权，也不会显著扩充可搜索候选人池。 |
| **Hudl Wyscout Data API** | 商业数据产品而非免费的公开数据仓库。产品页提供球员/球队 DB Pack、150+ match-/season-level Stats Pack、带精确事件位置的 Events Pack，以及从 broadcast tracking 得到的 Physical Data Pack。产品页未公布覆盖联赛/球员数量、更新 SLA 或 API 可用字段清单；需向销售确认具体套餐覆盖和日期范围。 | 最接近专业 recruitment 工作流的一站式产品：标准/赛季统计，事件位置与上下文，physical metrics。能用于传球、对抗、推进、压迫和身体特征等评估；产品介绍没有证明可访问原始 XY tracking 或提供每一种具体高级 metric，需要合同/数据字典核对。 | 官方页面说明可通过 APIs 或 dashboards 使用，并引导联系销售/Request a Demo；页面无公开价格或自助开发者 sandbox 信息。 | Hudl 当前 MSA 将 Wyscout.com 列在适用 Platform 内，定义 Content 包含由 Hudl 提供的 statistics/data。该协议规定订阅服务内部使用，订阅期结束须删除 Content；限制复制、派生、下载、展示/传输或分发 Content 给第三方；并明确限制用 Content 训练/开发 ML 或 AI 模型。即使购入 API，也不应默认它可用于公开作品集网站或本项目 LLM；需要 Hudl 对此项目的书面例外/单独许可。 |
| **StatsBomb Open Data（现有来源，比较基线）** | Hudl 官方仓库提供选定赛事/赛季的 competitions、matches、events、lineups 和部分 StatsBomb 360 JSON；是静态仓库数据，StatsBombR 官方仓库说会定期增加数据。不是当前完整球员市场/现役 squad 服务，360 只覆盖部分比赛。 | 丰富的 event-level 证据：射门、传球、带球、争顶/防守事件；部分 360 比赛提供事件发生时的球员空间快照。适合在覆盖赛事中计算 per-90 事件/比赛表现；没有连续全场追踪或 SkillCorner 那样的全赛季 OBR/体能汇总。 | GitHub 公共 JSON 仓库无需 API key；官方 StatsBombR 要求注册 Resource Centre 并阅读 User Agreement，且指出完整 StatsBomb API 仅付费客户可用。 | StatsBomb README 将开放数据描述为研究项目和足球数据兴趣用途，并要求发表、分享或分发分析时注明 StatsBomb 来源并使用其 logo。数据受专门 User Agreement 约束而非仓库通用 OSS license；针对 raw 数据公开再分发、公开商业使用、把数据送给第三方模型等具体边界，需遵守完整协议，不应从“能下载”推定许可。 |
| **football-data.org（免费 API 反例）** | API 有比赛、球队、球员基础档案、阵容及球员比赛列表/聚合；更新围绕赛事赛程结果。不是大规模球员事件表现数据库。 | 球员比赛聚合可有上场/首发时间、进球、助攻、替换、黄红牌等；可以辅助阵容、出场量和进球表现背景，缺少支撑跑位、压迫、推进和战术适配的事件/空间特征。 | 当前免费计划 €0/月、12 competitions，但仅比分延迟、赛程、积分榜、10 calls/min；含 squads 的 Free + Deep Data 为 €29/月，30 calls/min。要用球队/球员资源需要 token；API 文档还规定未认证请求仅能访问 area 和 competition lists。 | 官网可见免费套餐与 API schema，但本次核对的公开资料没有明确说明球员级原始数据的长期本地保留、外部 LLM 处理及公开作品集派生结果的许可。它能低成本补球队/球员/fixture 元数据，却不值得作为能力评估主来源。 |

## 重点来源的字段与分析增益

SkillCorner 的 season CSV 不是通用的“球员评分”。它给出按 player/position/season 的观测统计，因此应显示原始指标、样本数、位置和来源，TactiScout 再用可说明的公式计算需求匹配；不能把供应方指标名直接翻译成某项能力结论。[physical CSV 字段](https://raw.githubusercontent.com/SkillCorner/opendata/master/data/aggregates/aus1league_physicalaggregates_20242025.csv) · [passing CSV 字段](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_passingaggregates_20242025.csv) · [OBR CSV 字段](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_obraggregates_20242025.csv)

可能形成的、需要带公式和证据的分析方向：

- **边锋/边后卫的纵深和禁区接应：**身后、套边、underlap、cross-receiver runs；区分尝试数、接球数，以及随后射门/进球的跑动结果。
- **中场的前向推进/出球：**line-break pass、dangerous pass、to-run pass 的数量、完成率、样本机会数；为避免把高使用量误判为高质量，保留尝试量和机会量。
- **高位压迫或往返要求：**有球/无球区分的跑动、高速/冲刺距离、加速/减速、重复高强度动作。说明中提到对高速/加速度数据要做平滑与控制，也说明点位会有错误，单个比赛不能当作“体能天赋真值”。
- **新联赛可迁移性：**同一来源能定义指标口径，减少 provider 间字段差异，但唯一公开 season 是 A-League，不能据此宣称欧洲联赛 percentile 或跨联赛排名。

如需使用单场 tracking，README 提示约 97% player identity 准确率且存在错误点、速度/加速度应适当平滑；phase-of-play 仅在比赛进行中定义。这些质量限制应进入 EvidenceCoverage / caveat 字段，不把 tracking 的识别或插值值当成精确真值。[SkillCorner tracking / phases limitations](https://github.com/SkillCorner/opendata/blob/master/README.md)

## 对 TactiScout provider/schema 与 LangGraph harness 的影响

建议把 SkillCorner 作为独立的 season-evidence provider，而不是覆盖现有 `PlayerProfile` 的通用属性：

1. **身份键与来源字段：**保留 `provider = skillcorner-open-data`、`providerPlayerId`、`providerTeamId`、`competitionId`、`seasonId = 2024/2025`、`positionGroup`、`retrievedAt`、`sourceUri` 与数据发布日期/文件 checksum。SkillCorner `player_id` 只在它自己的命名空间有效；不得只凭姓名把其记录与 StatsBomb/Sportmonks 合并。跨源合并要有已校验 mapping 和匹配置信度。
2. **观测而非全局“能力”：**同一球员可能在 CSV 以多个位置组出现；唯一键至少要包括 provider player/team/season/position-group。保留岗位观测，不静默求和或平均。每项派生分数还应保存原指标 ID、公式版本、角色、样本分钟/场次和缺失覆盖。
3. **语义与单位：**保留 `InPossession` / `OutOfPossession` 等游戏状态区分，厘清 `_p30tip`、`_p30otip` 指标口径；把公开 glossary 的指标定义和单位纳入 provider contract。null 必须表示缺失，不转成 0。跨 provider 的同名指标也不应自动视作同一含义。
4. **candidate discovery 边界：**这个样例 provider 只能搜索该赛季/联赛的数据行；对“找巴萨后卫”必须说明没有目标联赛覆盖，不能以样例名单作全球候选池。更合适的演示 prompt 是明确把搜索范围限制为“在样例 A-League 数据中找符合角色证据的球员”。
5. **LangGraph 工具边界：**新增 `search_player_season_evidence` / `get_player_season_evidence` 工具（名称供后续设计采用），输入包括联赛、赛季、位置组、指标主题和所需样本阈值；工具返回结构化 metrics + coverage + provenance，而不是 raw tracking 全量帧喂给模型。Graph 先判断 source scope 能否满足请求，再执行工具，若无覆盖则 ask/说明局限；评估节点必须以可确定性复算的 metric evidence 作为 grounding，LLM 只生成解释。授权确认前该来源工具需保持 opt-in/关闭。
6. **原始数据路径：**来源确权后将下载/缓存到 `.data/` 等忽略目录，仓库只放自编 synthetic fixture 和映射代码；若对外展示 derived player-level rows 或数值图，也先确证许可允许作品集/公开展示并执行 attribution。避免把原 CSV、截屏、球员名字和 metrics 复制到 README、测试 fixtures 或公开截图。

这会让 SkillCorner adapter 与现有 SkillCorner/RAG 许可层有相同的 source-level policy seam，但结构化比赛统计不应因为“已允许做 RAG”而自动允许向模型发送。数据处理许可仍应按 provider、原始数据/派生结果、处理者（本地模型还是第三方）、存储期限、公开输出分别建模。[项目数据来源/provenance issue](../issues/09-data-source-access-and-provenance.md) · [授权感知 RAG issue](../issues/10-permission-aware-rag-design.md) · [provider landscape](football-data-provider-landscape-2026-10.md)

## 需要确认的事项

给 SkillCorner 的许可确认应聚焦四个具体动作：

1. 这批 SkillCorner Open Data CSV 中的球员级赛季聚合能否保存在用户本机 TactiScout 数据目录，供非商业、公开作品集演示调用？
2. 可否把原始数值/球员名字显示在网页或截图中，还是只能公布不识别球员、不可反推原数据的汇总图和指标？要求的 attribution 样式是什么？
3. 可否把输入传给本地 Ollama 模型做解释；如否，是否允许把少量统计字段发给托管式 LLM API？模型处理会有哪些保存/训练/第三方子处理边界？
4. 合理存储/缓存与项目公开仓库有什么边界：能否附 raw CSV、只允许本地下载，还是允许 source link + 派生指标？

对 Wyscout/Hudl 应向销售/法务拿项目用途明确的 Order Form / written exception。现行 Hudl MSA 对 Content 的限制包括 AI/ML、第三方展示和互联网/SaaS 发布，订阅期结束后删除；而标准 Wyscout API 产品页本身只宣传 APIs、dashboard 与商业功能，未承诺授权这些例外。[Hudl Wyscout Data API](https://hudl.hudl.com/products/wyscout/data-api) · [Hudl MSA 当前版](https://static.hudl.com/craft/legal/Hudl-Master-Subscription-Agreeement_2026-02-09.pdf) · [MSA 第 2.3 节限制](https://static.hudl.com/craft/legal/Hudl-Master-Subscription-Agreeement_2026-02-09.pdf)

## 官方一手来源清单

- [SkillCorner Open Data README](https://github.com/SkillCorner/opendata/blob/master/README.md) · [仓库 MIT LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE) · [season physical CSV](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_physicalaggregates_20242025.csv) · [season passing CSV](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_passingaggregates_20242025.csv) · [season OBR CSV](https://github.com/SkillCorner/opendata/blob/master/data/aggregates/aus1league_obraggregates_20242025.csv) · [SkillCorner API docs](https://www.skillcorner.com/api/docs) · [global data coverage](https://www.skillcorner.com/articles/our-global-data-coverage) · [contact](https://skillcorner.com/us/contact-us)
- [Metrica Sports Sample Data README](https://github.com/metrica-sports/sample-data) · [data directory](https://github.com/metrica-sports/sample-data/tree/master/data) · [documentation directory](https://github.com/metrica-sports/sample-data/tree/master/documentation)
- [Hudl Wyscout Data API](https://hudl.hudl.com/products/wyscout/data-api) · [current Hudl Master Subscription Agreement (2026-02-09)](https://static.hudl.com/craft/legal/Hudl-Master-Subscription-Agreeement_2026-02-09.pdf)
- [Hudl StatsBomb Open Data README](https://github.com/hudl/open-data/blob/master/README.md) · [StatsBomb Public Data User Agreement](https://github.com/hudl/open-data/blob/master/LICENSE.pdf) · [official StatsBombR README / registration and API access](https://github.com/hudl/StatsBombR/blob/master/README.md)
- [football-data.org v4 API reference](https://www.football-data.org/documentation/api) · [official v4 Person documentation](https://docs.football-data.org/general/v4/person.html) · [pricing](https://www.football-data.org/pricing) · [coverage](https://www.football-data.org/coverage)
