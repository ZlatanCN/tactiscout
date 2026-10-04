# TactiScout 足球数据源扩展调查

核查日期：2026-10-04。只引用数据提供方的官方 API 文档、定价与条款页面、官方 GitHub 仓库或其所链接的许可证。覆盖、价格与许可可能变化；“页面能访问”不代表项目获得了展示、缓存或模型处理权。本文件不是法律意见。

## 结论

**如果要让 TactiScout 用真实现役阵容发现球员并做第一轮候选比较，当前最可落地的是继续完善已存在的 Sportmonks provider。** 官方新套餐允许 Starter 每月 €29 任选 5 个联赛；套餐均列有球队、球员、阵容和赛季统计。这样可把德甲、西甲及其他候选来源联赛放进一个有限数据池，足以验证“先看目标队阵容，再在已覆盖联赛的球员里发现和比较候选人”。Sportmonks 当前公开价格页没有清楚列出免费层 entitlement；旧 rate-limit 文档曾列丹麦超级联赛、苏格兰超级联赛及每实体每小时 3,000 次限额，但这些信息可能已过时，必须用账号核验，不能据此断言拜仁或巴萨当前不可用。需在运行前核准费用和 14 天试用的取消时间。[Sportmonks 计划与功能](https://www.sportmonks.com/football-api/plans-pricing/) · [可能过时的免费层/限额说明](https://docs.sportmonks.com/v3/api/rate-limit)

Sportmonks 的线上数据权限不等于 LLM 权限。其公开条款允许存储、传输和分发所提供的数据，也允许用数据构建应用；直接转售 feed 不允许。核查到的公开材料没有明确授权将原始统计、长文本或 embedding 输入外部/本地生成式模型。仓库目前把 `TACTISCOUT_SPORTMONKS_AI_PROCESSING_ALLOWED` 默认设为 `false`；且当前代码把这个模型处理开关同时用作整个 provider 的启动门，因此关闭时连数据读取也会被拒绝。不能为启动 provider 而在未获授权前把它设为 true；代码需拆分“允许获取/本地确定性处理数据”和“允许模型处理”两类开关。[Sportmonks 服务条款](https://www.sportmonks.com/terms-of-service/) · [项目环境变量样例](../../../.env.example) · [provider 权限检查](../../../src/data/sportmonks-provider.ts)

**若零预算是硬约束，目前没有核实到同时满足“顶级联赛现役球员发现、完整阵容、足够的球员表现指标、可公开展示及明确 AI 处理授权”的免费来源。** API-Football 的免费计划确实提供当前阵容、球员统计等端点，但其条款明确说不授予将数据发布在应用、网站或其他产品中的许可。OpenLigaDB 无需 key、采用 ODbL，但数据集中于赛程、比分、球队与进球者；没有完整球员阵容、出场时间或战术统计。football-data.org 免费计划也不含 squad。它们适合不同的本地验证任务，不能互换成可部署的球探数据授权。[API-Football 条款](https://www.api-football.com/terms) · [OpenLigaDB API 说明](https://api.openligadb.de/index.html) · [football-data.org 价格](https://www.football-data.org/pricing)

## 各数据源对 MVP 的实际支撑

| 来源 | 候选发现、阵容和可用字段 | 覆盖、认证和成本（核查日） | AI、缓存及再发布边界 | 判断 |
| --- | --- | --- | --- | --- |
| **[Sportmonks Football API](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints)** | 按订阅赛事/赛季取球队，取逐赛季 squad，再关联球员档案和逐赛季统计。官方字段/指南含球员 ID、姓名、出生日期、位置、阵容、合同日期、比赛分钟、出场、进球、助攻等；统计目录更广。球队/球员接口也有转会数据，但转会金额不是当前市场估值；目前文档未核实球员当前 market value 字段。项目现有 adapter 已实现“列出配置赛季的球队 → 取各队球员/统计 → 按 Sportmonks player ID 合并”，目前字段映射只覆盖进球、助攻、传球尝试/完成、长传、抢断、拦截与分钟等有限项。它能发现已配置联赛内的球员，不是对全世界球员库无条件搜索。 [球队阵容与统计示例](https://docs.sportmonks.com/v3/tutorials-and-guides/guides/how-to-build-a-team-page) · [球员统计](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/players-statistics) · [阵容字段](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee) · [项目 adapter](../../../src/data/sportmonks-provider.ts) | 服务端 API token。Starter：任选 5 联赛，€29/月、2,000 次/实体/小时；旧 rate-limit 文档曾列丹麦与苏格兰免费覆盖、每实体每小时 3,000 次且无到期，但该信息与当前套餐页可能不一致，需用账号核验实际免费 entitlement 和现行限额；Growth：30 联赛 €99/月；Pro：120 联赛 €249/月。付费套餐功能同档；xG/Pressure 等有单独 bundle（起价 €29/月）。官网说付费套餐含 14 天试用；服务条款要求有效银行卡，并说明未及时取消会扣费。 [定价和试用 FAQ](https://www.sportmonks.com/football-api/plans-pricing/) · [旧免费权限/限额说明](https://docs.sportmonks.com/v3/api/rate-limit) | 条款明确允许存储、传输和分发服务提供的数据，并允许构建应用；禁止未经同意直接转售数据。没有查到 AI/LLM/embedding/模型训练的明文授权，也没有专门规定模型输入的数据保留时限。官方提到按域名授权，需让账号计划与实际部署域名匹配。产品展示可继续按服务条款确认，模型处理先关闭。[条款](https://www.sportmonks.com/terms-of-service/) · [产品用途说明](https://www.sportmonks.com/integrity-support/) | **最适合当前线上 MVP**：已有 TS adapter 和权限门；账号是否能查目标联赛/赛季需先核验 entitlement，不从旧免费页推断覆盖。没有实时账号凭据/目标季 payload 的验证记录；尚不能声称实数链路已打通。 |
| **[API-Football / API-Sports](https://www.api-football.com/)** | `/players/squads` 可取现役球队阵容；球员接口支持赛季表现，另外有比赛球员数据和转会记录。当前阵容可用于找目标联赛球员；统计覆盖较深，但具体指标需从对应赛季/赛事实查。[官方入门指南](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) | 需注册取得 API key。免费每月 $0、100 次/日，10 次/分钟；页面称所有计划均有全部端点，但免费计划限制可用赛季。Pro 为 $19/月、7,500 次/日。官方覆盖页截至 2026-10-03 列出 1,247 个联赛/杯赛，并明确覆盖随赛季和比赛变化；名单有德甲、西甲等，但需逐赛季检查所需数据列是否可用。[定价](https://www.api-football.com/pricing) · [覆盖与更新时间](https://www.api-football.com/coverage) · [限流](https://www.api-football.com/news/post/how-ratelimit-works) | 服务条款明确说 API 不提供将数据发布到用户应用、网站或其他产品的许可；用户须向有关权利人取得许可，且比赛数据可能受到联赛/协会/赛事组织者的知识产权或商业限制。所查资料没有明确的缓存、数据留存、LLM 或 embedding 权利说明。 [服务条款](https://www.api-football.com/terms) | **可作低成本的私人本机字段原型**；不要把付费 key 误认为作品集网站发布授权。要公开 demo，需要先补足独立数据许可。 |
| **[football-data.org v4](https://docs.football-data.org/general/v4/resources.html)** | Team 资源有 squad 样例字段：姓名、位置、出生日期、国籍、号码、合同及 `marketValue`；但示例队的 `lastUpdated` 是 2022 年，不能据此确认当下市场估值有效。Person 的比赛聚合包括分钟、首发、进球、助攻、换人、牌等基础指标；对战术适配而言不如事件级数据丰富。[Team schema](https://docs.football-data.org/general/v4/team.html) · [Person schema](https://docs.football-data.org/general/v4/person.html) | 需注册 token。免费 €0、12 个赛事、10 次/分钟，但只包含延迟比分、赛程、积分榜；`Free + Deep Data` €29/月、12 个赛事，增加阵容、首发替补、进球者和牌（30 次/分钟）。统计附加包另 €15/月，列出的主要是比赛/球队层面指标。官网当前价格页面未列球员赛季统计具体计费权限；不能假设 Person 聚合在 €29 内。[定价](https://www.football-data.org/pricing) · [限流](https://docs.football-data.org/general/v4/policies.html) | 注册页条款最后更新于 2018-06-01；要求展示署名、key 仅限单一应用/域名、不得把凭据放入开源仓库；取消订阅后不能再在自己的服务引用所获比赛/球员数据。条款没有说清 AI 处理与缓存期限。该条款年代较早，且公开 Team 样例中的估值/合同数据较旧，应联系提供者核实后再用于公开产品。[注册及条款](https://www.football-data.org/client/register) | 比免费层强，但 €29 也只获得基础阵容/赛果类信息；若要可解释的球员能力评估，数据深度不够。旧条款和取消后的数据引用限制降低其作为持续 demo 来源的适配度。 |
| **[OpenLigaDB](https://api.openligadb.de/index.html)** | 联赛/赛季球队名单、比赛、结果、球队总表、进球人榜；单场 Goal schema 含进球者 ID/姓名、分钟、点球/乌龙标记。没有完整 roster、年龄、合同、位置、出场分钟或个人非进球表现，因此只能生成射手榜/比赛事实，不能支撑候选能力评分。[官方 API schema](https://api.openligadb.de/swagger/v1/swagger.json) · [官方示例与返回类型](https://github.com/OpenLigaDB/OpenLigaDB-Samples) | 无需注册、API key 或额度套餐；请求限制每 IP 60 次/分钟。官方说明服务覆盖德国足球甲级联赛及许多其他联赛，但联赛可由用户创建、同类赛事可能重复、质量不一。可用 `getavailableleagues` 检查实际赛事；官方建议少请求、用 `getlastchangedate` 仅在更新时重新取完整数据，已结束赛季不会再变。[API 主页](https://api.openligadb.de/index.html) · [API 文档](https://api.openligadb.de/swagger/v1/swagger.json) | OpenAPI schema 声明数据库按 ODbL 1.0 提供。ODbL 允许使用、临时或永久复制、改编和商业使用数据库；公开传递衍生数据库时要按 ODbL（或兼容许可）提供，并保留通知；公开展示基于该库产生的作品时须提供来源/许可署名。ODbL 不涵盖数据库内容中可能独立存在的肖像、商标等权利。条款没有专门提 AI/LLM，因此只可按 ODbL 一般许可义务理解，不能声称有专门的模型授权。[OpenLigaDB license 声明](https://api.openligadb.de/swagger/v1/swagger.json) · [ODbL 正文](https://opendatacommons.org/licenses/odbl/1-0/) | **最好的零成本连接/轮询练习来源**，不适合作为球探主数据。可用于联赛、赛程、赛果和进球者辅助工具，不可被误当成球员数据平台。 |

## 开放数据：能力评估可以先做，但不等于现役市场

这些数据集能帮我们先实现“球员指标映射、按位置比较、来源/样本量标注、战术维度评估”等评估链路；它们不能证明现役阵容完整，也不能代替商业实时源。

| 来源 | 可用范围和评估价值 | 权利与实施判断 |
| --- | --- | --- |
| **[Impect Open Data 官方仓库](https://github.com/ImpectAPI/open-data)** | 静态德甲 2023/24 数据，包含比赛事件、事件 KPI、球员每场 KPI 聚合、首发/换人、球员和阵容资料、KPI 定义。其 bypassed opponents、成功传球、对抗、抢断等指标有助于做推进、持球和防守参与的角色评估；没有当前转会市场、合同或实时更新。[README](https://github.com/ImpectAPI/open-data) · [KPI 定义](https://raw.githubusercontent.com/ImpectAPI/open-data/main/data/kpi_definitions.json) | README 规定使用前接受仓库中的 `LICENSE.pdf` 条款，并要求研究/项目署名、使用 Impect 标志；它鼓励公开发布分析成果。**本次没有解析该 PDF 的具体授权条文**，因此 AI 输入、长期持久化、再发布原始数据等都标记为未核实。可把它列为许可证复核后的离线评估集候选，现阶段不要把原始数据打包进公开应用或模型语料。 |
| **[SkillCorner Open Data 官方仓库](https://github.com/SkillCorner/opendata)** | 2024/25 澳大利亚 A-League player-season Physical、Off-Ball Run、Passing 聚合；另有 10 场 tracking、动态事件和 phase-of-play，能验证无球跑动、跑动强度、传球效率等更接近战术适配的证据。聚合仅包含单次出场超过 60 分钟的表现；不是全球/当前候选库。[README 数据说明](https://github.com/SkillCorner/opendata) | 仓库有 MIT license，但 README 仅明确请使用者署名 SkillCorner；没有明文确认 MIT 是否授权 CSV/比赛数据本身，也没找到数据级 LLM 或再发布许可。代码 MIT 与数据许可不可混为一谈；公开发布前需确认数据范围授权。 |
| **[StatsBomb Open Data 官方仓库](https://github.com/hudl/open-data)** | 只覆盖公开选择的赛事/赛季事件、比赛阵容和部分 360；适合高细节动作分析与战术证据，不是现役完整球队/转会数据。与当前 repo 的 StatsBomb 本地数据模式匹配，但需要下载并核对具体数据文件与赛季。[README 和数据结构](https://github.com/hudl/open-data/blob/master/README.md) | README 要求发布基于数据的研究、分析或洞察时注明 StatsBomb 并使用其 logo，另有 User Agreement。AI/模型训练以及完整原始文件再发布权应按协议逐项确认，不从“GitHub 公开”推定。[User Agreement](https://github.com/hudl/open-data/blob/master/LICENSE.pdf) |

## 现有 Sportmonks 集成状态与实际阻碍

仓库已经有 Sportmonks provider，而不是从零开始：[provider 实现](../../../src/data/sportmonks-provider.ts) · [配置入口](../../../src/data/provider.ts) · [环境变量样例](../../../.env.example)。它按配置的 season IDs 列出赛季球队、加载各队 roster 和统计，并以 provider player ID 合并；有 15 分钟进程内缓存。当前环境样例中 token 留空，模型处理的 opt-in 默认 `false`；代码还要求配置经账号核验的 statistic type IDs，并要求分钟字段 ID 119。模型处理 opt-in 关闭时 repository 构造会失败，尚未实现抓取数据与发送模型两类授权的分离。此次未执行 live API 验证，不能确认真实账户、德甲/西甲权限、当前赛季 payload 或响应字段质量。

当前阻碍按顺序是：

1. **覆盖与费用：**公开资料无法确认当前免费层是否覆盖德甲/西甲，须先在账号核对 entitlement；需要订阅时 Starter 可选 5 个 league，按月 €29 起。提交密钥之前先在 provider 账号确认计划和目标赛季实际返回的 league/team IDs。
2. **真实数据验证：**项目应先作一次受控 smoke run：读取可用 leagues/seasons、覆盖球队数、每队 squad 数、每名球员字段覆盖率、统计 type IDs、分页、错误/限流和更新时间；将 payload 摘要而非 key 或全量原始响应留在日志。官方文档承认赛事数据可能有覆盖缺口。[Sportmonks coverage caveat](https://www.sportmonks.com/terms-of-service/)
3. **模型处理授权与当前工作流：**Sportmonks 公开条款能支持把数据用于应用，但未回答把球员资料/统计发给本地 Ollama 或外部模型做叙述、向量检索的权利。当前 LangGraph 调查会把候选与指标证据交给配置模型，因此 `AI_PROCESSING_ALLOWED` 关闭时拒绝整个 provider 是正确的失效关闭行为。不能只拆环境变量并放开抓取；那会形成“模型处理关闭、实际仍把数据送入模型”的权限假象。若之后需要“本地确定性分析 + 模板报告”，先实现与 LLM 调用隔离的工作流，再分别控制数据读取与模型输入。
4. **能力结论的证据范围：**本 provider 目前是赛季累计 stats adapter，不应宣称完成了事件级战术判断。应先按分钟数和位置归一化描述统计，并把缺字段标为 unavailable；之后再接 StatsBomb/通过许可核实的 Impect 或 SkillCorner 证据，支持推进、压迫、无球跑动等维度。估值、要价、可负担性当前仍然是未知，不能用历史转会金额冒充市场价值。

## 推荐的可验证 MVP

**主验证源：Sportmonks，一个有限选定的现役联赛范围。** 这是当前 repo 可最少重复造轮子的方案。用一个已在账号中获授权的赛季配置，对该赛季所有球队批量构建候选池；对自然语言“为拜仁找凯恩替代者”至少完成两次显式工具查询：目标队 roster/context 和指定覆盖联赛的 candidates/stats。排序先由确定性、可解释的按位置/分钟数归一化统计完成；生成报告时展示“数据源、赛季、检索时间、有效分钟、可用指标、缺失项”，再由模型仅处理已获准的精简证据。若许可没有明确允许模型处理，应先用模板报告展示检索与评分链路。

第一版验证清单：

1. provider 能按计划取得 Bundesliga 和/或 La Liga 的当前 season、teams 与 squads；球员以 source + player ID 保持身份，不按同名合并。
2. 对每个字段记录来源、season、retrievedAt、样本分钟和是否缺失；`goals / assists / passes / tackles / interceptions` 按 90 分钟或位置组做可解释的候选比较，低于最低上场时间门槛则标低置信/不评分。
3. `rosterGap` 显示现有阵容与缺口证据；候选人名单标注实际覆盖联赛，明确不是全世界球员池。用户补充年龄或其他条件后，沿同一对话状态继续检索。
4. 对每个查询记 API 请求数和限流响应，验证缓存过期/刷新逻辑；不要超额轮询。Spot-check 球员 squad 与实际赛季统计能否在官网 coverage/response 里对应。
5. 当前维持模型处理许可为 provider 工作流的前置条件，不执行真实账号请求，也不把未验证的免费 entitlement 写成已覆盖。将来若希望在模型处理许可关闭时仍做本地确定性评估，先增加完全不调用 LangGraph 模型的独立路径；确认数据读取/展示许可后，再拆开读取与模型输入许可。

如果本阶段不愿承担 €29/月订阅，改用历史/样例数据做**评估引擎原型**：首选先审核 Impect `LICENSE.pdf` 后建立德甲 2023/24 KPI 离线测试集；SkillCorner 可补一个 A-League 样例以测试 physical/OBR/pass 指标；StatsBomb 继续作为事件级战术分析基线。该原型可证明“推荐解释来自哪些指标”，但不能宣传成现役市场球员发现。

## 核查来源

- [Sportmonks API 文档](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints) · [球队阵容/统计使用指南](https://docs.sportmonks.com/v3/tutorials-and-guides/guides/how-to-build-a-team-page) · [球员统计](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/players-statistics) · [费率和免费覆盖](https://docs.sportmonks.com/v3/api/rate-limit) · [计划定价](https://www.sportmonks.com/football-api/plans-pricing/) · [服务条款](https://www.sportmonks.com/terms-of-service/)
- [API-Football 端点入门](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [价格](https://www.api-football.com/pricing) · [Coverage，last update 2026-10-03](https://www.api-football.com/coverage) · [Terms](https://www.api-football.com/terms)
- [football-data.org 定价](https://www.football-data.org/pricing) · [Team schema](https://docs.football-data.org/general/v4/team.html) · [Person schema](https://docs.football-data.org/general/v4/person.html) · [API policies](https://docs.football-data.org/general/v4/policies.html) · [注册和条款（最后更新 2018-06-01）](https://www.football-data.org/client/register)
- [OpenLigaDB API / 使用说明 / ODbL 声明](https://api.openligadb.de/index.html) · [OpenAPI schema](https://api.openligadb.de/swagger/v1/swagger.json) · [官方示例仓库](https://github.com/OpenLigaDB/OpenLigaDB-Samples) · [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
- [Impect 官方数据仓库](https://github.com/ImpectAPI/open-data) · [Impect KPI 定义](https://raw.githubusercontent.com/ImpectAPI/open-data/main/data/kpi_definitions.json) · [SkillCorner 官方开源数据](https://github.com/SkillCorner/opendata) · [StatsBomb Open Data](https://github.com/hudl/open-data)

## 2026-10-04 补充扫描：新候选与决策

本节补充前文未覆盖或值得重新比较的候选；不重复展开已有的 Sportmonks、API-Football、football-data.org、StatsBomb、Wyscout、SkillCorner、Metrica、Wikidata、TheSportsDB、FPL 等来源。核查限于供应方/数据发布方一手页面、API 文档与许可证。未申请 API key、未调用付费 API、未下载或读取真实球员数据。本节将供应方营销说明视为供应方声明，不视为独立准确性验证。

### 新候选比较

| 候选 | 产品实际能提供的内容 | 认证、成本、更新 | 明确授权 / 明确禁止 / 未说明 | 判断 |
| --- | --- | --- | --- | --- |
| **[PlayerElo Football Data API](https://playerelo.football/api-access)** | 球员搜索/排名、位置、当前球队/联赛、比赛数、累计分钟、Elo、EAR 近期状态和按比赛历史；另有 /style per-90 profile、俱乐部阵容和分位置 squad-gap 等接口。供应方称覆盖 176 项赛事、约 79K 球员并每日更新。其首页说明 Elo 按实际出场阵容、分钟、对手和赛果更新；这属于结果贡献基线，不等同于逐事件的跑位、压迫、推进等战术证据。估值 endpoint 是 computed market value estimate，不是核验过的转会要价/俱乐部报价。 | REST/JSON over HTTPS，所有请求需 Bearer API key；免费层 500 请求/月、10 次/分钟，页面标为 evaluation & hobby；Pro €19/月、10,000 次/月；Ultra €49/月、50,000 次/月；Business €199/月、300,000 次/月并列出 commercial licence + SLA。官网说可从表单免费取 key，但本次未创建账号或确认 API 响应/赛事 payload。API 页面标示最近数据更新 2026-10-03。 [价格与 endpoints](https://playerelo.football/api-access) · [API schema/examples](https://playerelo.football/docs) · [模型说明](https://playerelo.football/) | **明确授权：**官方 API 页面明确将免费级别用于 evaluation/hobby，描述 ratings 为 scouting/model/research 的 inputs；供应方还发布了面向 AI agent 的 MCP client，展示经 MCP 查询实时球员历史、风格、fit 等工具。付费计划用于生产应用/看板；页面称付费计划允许商业使用，Business 另带商业 license。**明确禁止：**本轮查到的官方页面没有列出针对 API 调用或模型输入的明文禁止条款；这不等于不存在其他合同限制。**未说明：**未找到公开完整 API license/terms，不能确认公开作品集逐球员展示、缓存/长期保留、再发布派生字段，或把 API 响应发给本地 Ollama/外部 LLM 的正式边界。MCP 产品说明表明 AI agent 是目标用例，但不能单独当作数据许可合同。官网 API 总览称所有计划含所有 endpoints；其发布的 MCP README 又把 get_transfer_fit 标为 Ultra tier、get_player_opportunities 标为 Business tier，具体免费层对招聘接口的 entitlement 有不一致，须向供应方书面确认。 | **唯一新增的低成本、当前球员评估候选，值得做无付费 smoke evaluation。** 如 key 和条款可用，先把 API 的 Elo/history/style 当作独立比较信号，不将其模型分数直接用作 TactiScout 最终评分；最终排序仍需保留本项目自身、可复算的证据和公式。先向供应方确认作品集展示、缓存及 LLM 输入授权，再进入公开 demo。不要用 model market value 做预算硬筛选。 |
| **[Reep Football Identity Register](https://reep.football/data/)** | 跨供应商身份/ID 对照，不是比赛表现源。2026-10-03 版本公开报告 2,010,106 个实体和 9,033,344 个 provider-ID bridges；可在 (provider, namespace, external_id) 上连接 StatsBomb、Sportmonks、SkillCorner、Wyscout、Transfermarkt、API-Football 等 ID，另有 aliases、redirects、实体状态和数据覆盖摘要。它公开版不提供球员出生日期、赛季出场/阵容归属、比赛表现统计；玩家 relationship 刻意为空，squad/lineup edges 仍在 roadmap。其 provider 角色也区分独立依据、bridge-only 与 Wikidata overlay，不能把“有 ID 映射”误作第二份独立表现证据。 [数据/字段/许可](https://reep.football/data/) · [覆盖与 provider roles](https://reep.football/coverage/) · [namespace 与 join 指南](https://reep.football/get-started/) | 完整 bulk 下载无需 key，免费 CC0；最新 DuckDB 约 769 MB，其中压缩 bridges CSV 站点标注约 144 MB。按周切 release，页面建议批量匹配用下载。API key 手动申请且非自助开通：免费 30 天/20 req/s 评估 access 面向数据伙伴和评估机构；产品/应用运行时的 production API 是收费服务，额度与条款需协商。官方对产品构建者的默认建议是使用 CC0 下载版自行部署内部 API。 | **明确授权：**发布页明确将完整公开 release（含 provider-ID bridges）按 CC0 1.0 释出，可复制、改编、再分发及商业使用，无署名义务；Reep 邀请标注 release stamp。CC0 仅涉及发布者可授予的权利，不包括第三方材料上的权利。**明确禁止/边界：**公开 release 明确排除 DOB 和 provider 统计、评分及其他 provider 内容；Reep 的 data-handling 页面称这些数据留在私有部分，且合作方数据只在匹配用途下处理。**未说明：**许可证未专门规定 LLM prompt 或 embedding；本项目也不需要把 ID 对照表交给模型，建议保持本地确定性 join。数据发布方关于“自己使用 AI 匹配”的说明仅描述 Reep 自身的数据处理，不视为给 TactiScout 的 provider stats 处理许可。 [数据处理说明](https://reep.football/data-handling/) · [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | **很值得纳入多来源身份层，但不增加候选表现证据。** 项目保留 (source, playerId) 和原始 provenance，再以可选 Reep ID 跨源关联；保存 release stamp、provider/namespace、redirect 状态及 bridge rung，未匹配/多 ID 情况不得依姓名静默合并。完整包体偏大，首版只需按项目实际 provider 筛选出小型本地索引；本次未下载数据。 |
| **[OpenFootball Players](https://github.com/openfootball/players)** | 国家分类的基础球员清单：姓名、粗略位置组、身高、出生日期/地点；官方仓库展示静态文本样例，没有稳定球员 ID、当前俱乐部/赛季阵容关系、表现指标或有保证的刷新频率。 | 无 API/key 或套餐，仓库可直接取得。官方 README 未给出更新时间/SLA；没有可核实的实时性承诺。 | **明确授权：**仓库文件按 CC0 1.0 发布。**明确禁止：**许可证未列出额外限制。**未说明：**数据字段的逐人来源、当前有效性、年龄/个人信息处理及实际覆盖质量不充分说明；CC0 不授予其发布者无权授予的第三方隐私/肖像等权利，且 AI 使用没有单独条款。 [仓库 README](https://github.com/openfootball/players) · [仓库许可证](https://github.com/openfootball/players/blob/master/LICENSE.md) · [CC0 说明](https://creativecommons.org/publicdomain/zero/1.0/) | **不建议作 candidate pool 或计分源。** 最多在后续开发中作为低风险别名/粗略位置字段的补充候选；对现役球探推荐的增益低于 Reep 身份关联或一项有样本/分钟的正式表现源。 |
| **[SoccerNet datasets](https://www.soccer-net.org/data)** | 研究 benchmark 含广播视频特征、动作标签、球员 re-identification、tracking、球衣号码等任务数据；不是现役球员目录或可追溯球员赛季能力统计。原始视频需要 Hugging Face 登录并接受 NDA。 | 可直接下载部分公开数据；受保护视频为 gated，须接受并获批 NDA。未发现按产品部署设计的在线球员 API。 | **明确授权：**FAQ 鼓励用其数据训练研究模型，并允许在有署名的研究论文/演讲中使用截图/片段。**明确禁止：**FAQ 明确回答该数据集不面向商业用途；NDA 用来防止版权材料再分发。**未说明：**不应从研究模型训练许可推导出商业 SaaS/作品集产品或任意生成式 AI 产品展示许可。 [数据访问](https://www.soccer-net.org/data) · [官方 FAQ](https://www.soccer-net.org/faq) | **产品数据 no-go，研究基准可保留。** 不把 gated 视频或其再识别/跟踪标注接进面向用户的 TactiScout。 |

### 对现有选择的更新

1. **当前在线球员发现：**本次没有找到同时具备低价、完整顶级联赛现役阵容、可复算个人战术指标、对公开展示与 LLM 处理均有明确授权的免费 feed。已有 Sportmonks adapter 仍是当前 roster/source 实现的直接延伸，但按已核查计划需至少 €29/月任选 5 联赛；其公开条款没有解决将统计交给本地/托管 LLM 的权利。现有结论仍需账号核实联赛/赛季 entitlement，且不应把未授权的模型处理开关开启。
2. **本项目可展示的评估增益：**新增候选中，PlayerElo 的 player Elo/EAR/history/style 是最有希望的轻量线上补充；它通过标准 JSON HTTP 请求接入 Node/LangGraph tool 不依赖 OpenAI API，且供应方提供 MCP agent 客户端。OpenAI-compatible/Ollama 仅是本项目模型运行方式，不会自动授权或禁止数据处理；必须单独核准供应方条款。若确认可用，先通过 TactiScout 自己的 server-side provider adapter 调 1) 按目标岗位/联赛找候选，2) 查球员及 rating history/style，3) 对外部 Elo 与本项目 StatsBomb/Open/Wyscout 可追溯事件指标作并列证据；不要采用 /fit、squad-gaps 作为最终结论捷径，否则候选筛选、适配评估和报告会整体外包，LangGraph 的角色只剩转发。
3. **多源 identity：**Reep 是本次最清楚、零 license fee 且能立刻解决技术痛点的新资源。它能让 provider-specific IDs 稳定关联，是后续合并现役 roster 与历史比赛表现源前的基础设施；但因 public release 缺 DOB 与 squad membership，不能替换当前 roster provider，也不能作年龄筛选/现役确认。Reep CC0 仅覆盖 Reep 可授予的标识/数据，不会使其桥接到的 Sportmonks、StatsBomb、SkillCorner、Wyscout 原始统计自动改为 CC0。
4. **历史开放表现源：**在本次搜索范围内，没有发现比既有 Wyscout 2017/18 CC BY 数据更适合公开复现“具名球员 + 比赛事件 + 许可清楚”的历史性能评估集。它仍然只能验证评估/证据链路，不能充当当代转会市场。高价值下一步不是再加更多无指标名录，而是把一项许可清楚的历史表现源与一项当前阵容/评价 API 通过身份键连起来。

### 建议的下一项真实实施工作

**先建 PlayerElo 的零成本供应方验证 issue/spec；通过授权和字段验证后再实现只读 provider。** 验收需要：用户/项目持有的 API key（不能放进浏览器或仓库）、书面确认 hobby/portfolio 公开展示与本地 Ollama prompt 处理的适用范围、目标联赛及当前赛季球员/阵容覆盖、响应字段与指标定义、限额/更新/lastUpdated 校验；随后才调用免费 key 做低流量 smoke 并保留脱敏摘要。第一版只映射原始 Elo、EAR、历史、位置、当前队/联赛、分钟、样本和 provider 时间戳，不接受供应方最终 fit score 替代自己的 scoring。若对方不给明确许可或字段定义，暂停公开接入，继续基于已许可的历史源和本地数据完成角色指标与评估/回归。

**身份层随后独立实现：**把 Reep 作为可选的本地 IdentityCrosswalk 数据集，记录具体 release/checksums；仅使用 provider ID 精确连接，解决 redirects，并将 bridge rung / provider role 放入匹配元数据；未命中保持 provider-scoped ID，不做姓名自动合并。下载/处理真实 release 应另开实现任务，不属于本轮研究。

### 补充一手来源

- [PlayerElo API access, prices and endpoints](https://playerelo.football/api-access) · [API request/schema examples](https://playerelo.football/docs) · [provider model and update description](https://playerelo.football/) · [PlayerElo MCP tool README](https://github.com/mwolters-cmyk/playerelo-mcp)
- [Reep release files, fields, licensing and access](https://reep.football/data/) · [Reep coverage/provider roles](https://reep.football/coverage/) · [Reep ID bridge tutorial and provider namespaces](https://reep.football/get-started/) · [Reep API contract](https://reep.football/docs/) · [Reep data handling](https://reep.football/data-handling/) · [CC0 1.0 deed](https://creativecommons.org/publicdomain/zero/1.0/)
- [OpenFootball Players official README](https://github.com/openfootball/players) · [OpenFootball Players CC0 license](https://github.com/openfootball/players/blob/master/LICENSE.md)
- [SoccerNet official data access](https://www.soccer-net.org/data) · [SoccerNet official FAQ](https://www.soccer-net.org/faq)
