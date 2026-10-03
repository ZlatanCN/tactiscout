# TactiScout：结构化足球数据源选型

研究日期：2026-10-04。只核对数据提供方的一手 API 文档、定价页和服务条款；价格和覆盖可能调整。本文不是法律意见，也不把网页可访问性当作数据许可。

## 结论

当前项目有虚构演示数据和本地 StatsBomb Open Data 模式，并已实现可选的 Sportmonks 当前球员 provider；仓库当前有 `data/demo-players.json`，没有 `data/statsbomb-open-data`，也未配置 Sportmonks token。因此，默认运行仍不会读取现役阵容 API、转会 API 或市场估值 API；配置推理模型也不会带来这些数据。Sportmonks mapping 使用 mock fixture 做了验证，尚未用真实账户核对联赛权限与 payload。[`src/data/provider.ts`](../../../src/data/provider.ts) · [`package.json`](../../../package.json)

**Sportmonks Football API 已作为第一个可选线上数据 provider 实现；StatsBomb Open Data 仍提供高细节比赛事件来源。**Sportmonks 文档覆盖球员与球队档案、当前球队阵容、逐赛季球员统计、位置、合同起止日期和转会记录；其条款明确允许将数据存入自有数据库、在自有产品中展示和构建产品，同时禁止未经书面同意转售或再分发原始数据。[球员接口](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/players) · [球员统计说明](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/players-statistics) · [阵容字段](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee) · [转会接口](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/transfers/get-all-transfers) · [服务条款](https://www.sportmonks.com/terms-of-service/)。

2026-10-04 重新核对后，旧文档的 Sportmonks 免费覆盖与限额信息已过时：当前官方套餐页列出 Starter 每月 €29（年付折算 €24/月）、可任选 5 个联赛、每实体每小时 2,000 次调用；xG 与 Pressure Index 另列 €29/月起的附加包。官方页提供付费套餐 14 天试用，服务条款要求有效银行卡，并说明未及时取消会扣费。注册页的免费层实际覆盖仍须在账户内核验，不能沿用旧的丹麦/苏格兰描述。要查拜仁、巴萨等目标球队，需确认账户 entitlement 覆盖对应联赛。官方资料列有历史转会金额，但没有确认市场估值字段；转会费不可当作球员当前身价。[计划价格与覆盖](https://www.sportmonks.com/football-api/plans-pricing/) · [试用与服务条款](https://www.sportmonks.com/terms-of-service/) · [统计附加包](https://www.sportmonks.com/football-api/plans-pricing/) · [转会字段](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/transfers/get-all-transfers)

如果这阶段不申请试用或付费，可用 API-Football 的免费额度做**仅本地的接入原型**：官方列出每月免费、每日 100 次调用及 10 次/分钟，覆盖球员阵容、球员统计和转会接口。但其条款没有授予把 API 数据发布到应用/网站/其他产品的许可，且没有公开说明向第三方 LLM 发送、嵌入、长期保存原始数据的授权。因此不能因为“有免费 key”就把它当成可部署数据授权。[价格](https://www.api-football.com/pricing/) · [限流](https://www.api-football.com/news/post/how-ratelimit-works) · [服务条款](https://www.api-football.com/terms)

## 当前来源与候选 provider

| 来源 | 可支持的球探工作 | 阵容 / 合同 / 转会 / 身价 | 访问、额度和费用（核查日） | 使用边界与判断 |
| --- | --- | --- | --- | --- |
| [StatsBomb Open Data](https://github.com/hudl/open-data) | 选定赛事与赛季的比赛、阵容、事件和部分 360 数据；适合计算有球动作和角色代理指标，能提供较深的比赛证据。 | 有历史比赛阵容和比赛位置，不是完整的现役俱乐部名单；不提供合同、转会或市场估值。 | GitHub JSON 文件，本地载入；没有第三方 API key 或调用限额。 | Hudl 鼓励研究和足球分析，发布分析需注明 StatsBomb 并使用其 logo；仍受其 User Agreement 约束，开放仓库不等于可无限再分发原始文件。[README](https://github.com/hudl/open-data/blob/master/README.md) · [使用协议](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)。保留为比赛表现来源，不要把历史阵容称为当前阵容。 |
| [Sportmonks Football API 3.0](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints) | 球员档案支持详细位置；逐赛季统计覆盖射门、传球、传中、抢断、拦截、解围、对抗、盘带、犯规、出场时间和评分等事件统计。官方说明不提供 GPS/追踪类距离、冲刺和速度数据；xG 与 Pressure Index 另有附加包。 | 队伍有 players/squad 关系；球员档案支持位置、统计、当前/历史球队、转会；squad 记录有 `start`、`end` 合同日期。官方示例中的转会 `amount` 是转会记录金额，不能称为当前市场估值。所核对文档未证实 market-value 字段。[球员统计](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/players-statistics) · [阵容字段](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee) · [转会 schema](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/transfers/get-all-transfers) | API token；官方建议放在服务端中间层。2026-10-04 公开页列 Starter €29/月（年付折算 €24/月），5 个联赛、每实体每小时 2,000 次调用；xG/Pressure Index 另 €29/月起。付费套餐有 14 天试用，但服务条款要求有效银行卡并会在未及时取消时扣费；免费层覆盖需账号内确认。[认证](https://docs.sportmonks.com/v3/welcome/authentication) · [定价和覆盖](https://www.sportmonks.com/football-api/plans-pricing/) · [服务条款](https://www.sportmonks.com/terms-of-service/) | 条款允许将数据存入自有数据库、在自有产品中展示并构建商业应用；禁止未经书面许可转售/再分发 feed。球员照片和俱乐部标志的权利由应用方另行确认，提供方不声称拥有联赛官方数据权。条款没有明确说明原始数据能否送入外部 LLM、embedding 或作为生成式模型长期语料：拿到书面答复前，不把“可在产品中使用”扩大解释为模型处理许可。[条款与产品用途说明](https://www.sportmonks.com/integrity-support/) · [服务条款](https://www.sportmonks.com/terms-of-service/) |
| [API-Football / API-Sports](https://www.api-football.com/) | 官方列出 `/players/squads` 当前阵容、`/players` 球员/赛季统计、`/fixtures/players` 单场表现、`/transfers` 转会履历；性能统计有出场、传球、射门、抢断等。赛事覆盖广，但按赛季和比赛的数据可用性会变化。[官方端点指南](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [覆盖表](https://www.api-football.com/coverage) | 阵容含球员 ID、年龄、位置和球衣号；转会含涉及球队、转会类型和日期。所核对文档没有证实合同到期日或市场估值专用字段。不要用转会费代替市场估值。[阵容端点](https://www.api-football.com/news/post/football-players-squads) | API key；免费层 100 次/日、10 次/分钟；官方页面列 Pro $19/月、7,500 次/日。超额后服务停止当日请求。[定价](https://www.api-football.com/pricing/) · [限流说明](https://www.api-football.com/news/post/how-ratelimit-works) | 服务条款明确说明 API 供应方不授予把其数据发布到应用、网站或其他产品的许可，要求使用方自行取得发布许可，并禁止直接转售数据；未见 AI/LLM、向量索引或原始数据保留期限授权。适合在本机验证字段和请求成本；取得适用的书面许可前，不作为公开简历项目线上数据来源。[服务条款](https://www.api-football.com/terms) |
| [football-data.org v4](https://docs.football-data.org/general/v4/resources.html) | 有球队、球员和比赛资源；球员比赛聚合提供上场分钟、首发、进球、助攻、换人和牌等基础指标，不是战术事件级评估数据。[Person API](https://docs.football-data.org/general/v4/person.html) | 官方 Team schema 样例展示位置、生日、国籍、`marketValue` 及合同 `start/until`；示例的 `lastUpdated` 为 2022 年，不能据此推断当前市场估值准确或新鲜。未见独立球员转会历史资源。[Team API](https://docs.football-data.org/general/v4/team.html) · [资源目录](https://docs.football-data.org/general/v4/resources.html) | `X-Auth-Token`。免费层 12 个赛事，但只列延迟赛果、赛程和积分榜；Squads 在 €29/月的 Free + Deep Data 套餐列出（30 次/分钟），Standard €49/月、30 个赛事、60 次/分钟。统计附加包 €15/月。[价格](https://www.football-data.org/pricing) · [限额](https://docs.football-data.org/general/v4/policies.html) | FAQ 要求在产品可见位置注明 `Data provided by football-data.org`。当前公开注册页条款标注 2018 更新，限定 API key 对应单一应用；取消后不再允许在产品中引用取得的数据；标志和照片需另行授权。鉴于条款年代较早、市场估值样例陈旧，先联系/确认条款和目标联赛字段新鲜度再作为公开来源。[条款/注册](https://www.football-data.org/client/register) · [署名说明](https://www.football-data.org/documentation/faq) |

### 选型重点

- **能力评估：**继续使用 StatsBomb 的事件级比赛证据作为深度分析基线。Sportmonks 或 API-Football 的赛季/比赛汇总能扩展球员范围和近期履历，但应标出指标口径和赛事/赛季；不能将供应方评分或 TactiScout 权重说成客观能力等级。Sportmonks 声明其球员统计不是身体追踪数据。[Sportmonks 球员统计说明](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/players-statistics)
- **球队需求 / 阵容审查：**Sportmonks 能提供球队球员和合同起止字段，契合“先看现有阵容再判断缺口”的流程。合同字段表示提供方记录的合同日期，不等同于球队官方确认。若选择 football-data.org，先检验拜仁和巴萨目标赛季的 Squad entitlement 与 `lastUpdated`。
- **预算：**只有来源明确标记为市场估值且含来源时间的字段，才能用作“估值参考”；历史转会金额是历史交易金额，不是市场估值，更不是买方预算或球员要价。Sportmonks/API-Football 的核查文档没有确认市场估值字段；football-data.org 文档样例虽有 `marketValue`，但很旧，使用前须实测新鲜度并复核条款。
- **抓取与 RAG：**不要抓取 Transfermarkt 或 FBref 来填补字段；既有来源调查记载两站对自动化及 AI 用途有明确限制。[足球数据源与抓取边界](football-data-sources-and-crawling.md)。结构化数据 provider 与报告文章 RAG 分开管理；每个新来源都要登记可访问、保留、展示和模型处理范围。

## 对项目的安全表述与实现边界

1. 报告逐项标出 `provider`、提供方球员 ID、赛事/赛季、原始统计口径、查询/更新时间、数据字段更新时间（如果存在）和派生公式。Provider 之间 ID 不同；未经可靠映射不要因为姓名或数字 ID 相似就合并球员记录。
2. 用“数据源在该赛事/赛季记录了……”和“按这些记录计算……”表述结果；给出样本分钟数、可用指标和覆盖缺口。不要声称覆盖完整当前市场、全量现役阵容、官方身价或客观潜力。
3. 候选球员年龄、俱乐部、合同、转会经历和表现统计分别附来源与时间。未知值保持未知；旧合同日期不得当成仍有效；转会记录金额不可写成当前身价。
4. API token 仅放服务端环境变量，经后端 provider adapter 请求；不放进 React bundle、浏览器 localStorage、公开仓库或日志。Node 22 的内置 `fetch` 可直接请求这些 REST/JSON API，现有 TypeScript 服务可以新增可选 adapter 而不换技术栈；第三方在线数据要在 LangGraph 工具边界内调用，并保留来源和额度 trace。
5. 在提供方未明确允许前，不把 provider 原始响应或由其内容生成的长文本、embedding 直接发送给外部推理 API。Sportmonks 对“在自有产品中存储和展示”有公开说明，但所核条款没有专项回答 LLM/embedding 处理；API-Football 对发布应用数据更明确地未授予许可。先依赖确定性代码计算有限派生指标，并向所选 provider 询问 AI/LLM 输入、派生报告公开展示、缓存期限和退出/删除后的留存规则。

## 推荐落地顺序

1. 已完成：`PlayerProfile` 保存 provider/player/team/competition/season 身份、抓取时间与原始指标覆盖；跨来源 ID 不按姓名合并。
2. Sportmonks adapter 核心实现已完成：使用赛季球队分页接口和按球队/赛季 squad 接口，服务端请求、current squad 与当季统计按 provider player ID 合并、短期内存缓存、权限/限流/网络/响应错误分类。真实账户、目标联赛和条款仍待用户凭据验证。
3. adapter 当前只把一手统计类型文档列明的 ID 映射为受支持字段：52 进球、79 助攻、80 传球尝试、81/116 成功/准确传球、78 抢断、100 拦截、119 分钟、122 长球。部署者必须通过 `TACTISCOUT_SPORTMONKS_COVERED_STATISTIC_TYPE_IDS` 显式确认本账户和联赛可用字段；没有确认覆盖的字段不会影响评估，且 API 没有返回的盘带、施压和射门助攻保持不可用。来源时间会显示在球员卡。
4. 现有 StatsBomb 路径保留；不要把历史阵容称作当前阵容。跨 provider 匹配仍需受控映射，不能按姓名或数字 ID 合并。
5. API-Football 仍限于经许可核验的本地适配器候选。football-data.org 仍需核验目标赛季 entitlement、市场估值更新时间和现行条款。
6. 下一阶段建立数据源级评估集：真实球队现役阵容核对、位置归一、跨赛季统计样本数、失败降级、空值/过时值、跨 provider ID 匹配准确率和证据引用率。没有 ground truth 时不宣称“推荐准确率”。

## 官方一手来源

- [Hudl StatsBomb Open Data README](https://github.com/hudl/open-data/blob/master/README.md) · [使用协议](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)
- [Sportmonks API endpoints](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints) · [Players](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/players) · [Player statistics](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/players-statistics) · [Squad field schema](https://docs.sportmonks.com/v3/endpoints-and-entities/entities/team-player-squad-coach-and-referee) · [Transfers](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/transfers/get-all-transfers) · [Authentication](https://docs.sportmonks.com/v3/welcome/authentication) · [Rate limits](https://docs.sportmonks.com/v3/api/rate-limit) · [Pricing](https://www.sportmonks.com/football-api/plans-pricing/) · [Terms](https://www.sportmonks.com/terms-of-service/) · [Data use FAQ](https://www.sportmonks.com/integrity-support/)
- [Sportmonks teams by season](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/teams/get-teams-by-season-id) · [Team squad by season and team](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/team-squads/get-team-squad-by-team-and-season-id) · [Player statistic type IDs](https://docs.sportmonks.com/v3/definitions/types/statistics/player-statistics)
- [API-Football endpoints guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [Squads endpoint](https://www.api-football.com/news/post/football-players-squads) · [Coverage](https://www.api-football.com/coverage) · [Pricing](https://www.api-football.com/pricing/) · [Rate limits](https://www.api-football.com/news/post/how-ratelimit-works) · [Terms](https://www.api-football.com/terms)
- [football-data.org v4 Team](https://docs.football-data.org/general/v4/team.html) · [Person](https://docs.football-data.org/general/v4/person.html) · [Resources](https://docs.football-data.org/general/v4/resources.html) · [Pricing](https://www.football-data.org/pricing) · [Policies](https://docs.football-data.org/general/v4/policies.html) · [Registration / terms](https://www.football-data.org/client/register) · [Attribution FAQ](https://www.football-data.org/documentation/faq)
