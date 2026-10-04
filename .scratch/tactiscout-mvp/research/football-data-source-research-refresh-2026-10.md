# TactiScout 足球数据源扩展调查

**调查日期：** 2026-10-04
**范围：** 当前阵容与球员统计 API、公开比赛事件/追踪数据、可自行形成的观测数据，以及运行时 Web Search / 新闻发现。
**证据原则：** 以服务提供方、数据集作者/托管方、官方文档、API 条款和数据集许可为准。价格、覆盖和接口可能变化；下文记录的是调查时公开页面可见的信息，不构成授权意见。

## 结论摘要

没有找到一个同时满足“免费、公开展示许可清楚、当前完整阵容、广泛球员能力统计、明确允许保存及交给 LLM”的单一权威数据源。应把**数据层**与**发现层**拆开，并给每条数据保留来源、赛季、样本和许可信息。

1. **零成本 MVP：** 用有明确许可的历史事件数据验证事件解析、球员指标计算和证据追溯；另用小规模、经授权的人工作品数据验证“观察—证据—评估”的球探方法。两者不能冒充当前完整球员数据库。
2. **当前阵容及跨联赛统计：** 先对目标联赛实测单一供应商 API。Sportmonks 的统计面较广，但属于付费方案且需逐项确认覆盖与再展示、LLM 处理权；API-Football 免费 key 适合接口原型，但其条款不等于授予应用发布数据的权利；football-data.org 免费层偏赛程/比分，较深的阵容和基本比赛统计需要付费，统计维度也不足以做完整球员能力画像。
3. **公开事件/追踪样本：** Wyscout 开放数据是历史比赛事件集；SkillCorner、Impect、Metrica、IDSSE 各自有样本、许可或身份缺口。不可把代码仓库的代码许可证自动套用到数据或视频。
4. **运行时搜索只负责发现和链接来源：** Tavily 与 Brave Search 能帮助 Agent 找到新近新闻或一手资料，但搜索摘要不等于获得网页全文抓取、缓存、RAG 入库、再发布许可。Brave 限制保存搜索结果；Tavily 对缓存及长久保存的公开边界不够明确。本地 Ollama 只让模型推理留在本机，搜索查询和结果仍经过搜索供应商。
5. **推荐路线：** 先建立可追溯的数据模型和合法的小样本评估流程；动态信息只保留来源引用及必要的短期任务上下文。将来买 API 前，先书面确认应用展示、数据缓存和模型处理许可。

## 需求拆解：来源各自承担不同角色

| 数据角色 | 项目实际需要 | 适合来源 | 不应误认为 |
|---|---|---|---|
| 球员与阵容索引 | 当前球队、球员身份、位置、出场名单 | 有明确覆盖的当前球员 API；手工维护的小型测试集 | 免费赛程 API 就有完整阵容 |
| 表现指标 | 出场时间、传球、射门、对抗等带赛季/样本范围的指标 | 付费统计 API，或有许可的原始事件数据自行计算 | 指标名称相同就有相同定义 |
| 战术/空间能力 | 压迫、推进、无球跑动、空间占位等 | 有事件/追踪数据且允许派生分析的授权数据；授权视频上的人工观察 | 总进球/助攻能证明战术适配 |
| 新闻与动态背景 | 伤停、转会、教练/阵容变动等近期线索 | 搜索 API 找出原始发布方，再核对原文 | 搜索引擎是统计源或全文许可 |
| 样本与研究 | 验证解析器、指标算法、分析流程 | 明确许可的公开历史数据集 | 公开下载就代表可商用、再发布或训练模型 |

## 当前阵容和统计 API

覆盖和字段会因联赛、赛季及比赛而异；接口说明中的功能清单不代表每项数据均已填充。接口返回的阵容或统计也不会自动带来公开展示和 AI 处理许可。

### Sportmonks Football API

- **能力与覆盖：** 官方页面宣称覆盖 2,200 多个联赛、提供 63 类球员统计，并展示球员出场时间、触球、传球及成功率、盘带、对抗、射门、进球、助攻等常规指标；另有付费 xG、Pressure Index 等项目。来源：[Football Stats API](https://www.sportmonks.com/football-api/football-stats-api/)、[文档](https://docs.sportmonks.com/football/)、[覆盖查询](https://www.sportmonks.com/football-api/coverage/)。
- **新鲜度：** 产品页示例称事件平均延迟约 15 秒；这不是每个字段或联赛的服务保证。球员统计何时更新、历史赛季是否齐全，要针对目标联赛和比赛实际请求确认。
- **价格：** 调查日价格页列出 Starter €29/月（5 个联赛）、Growth €99/月（30 个）、Pro €249/月（120 个）；有免费 token/试用入口，付费试用与账单要求须以注册流程为准。历史数据深度另有付费选项。来源：[方案与价格](https://www.sportmonks.com/football-api/plans-pricing/)。
- **权利：** [服务条款](https://www.sportmonks.com/terms-of-service/)允许在条款范围内存储/传输数据并用于应用，但禁止直接转售产品；同时说明数据按现状提供，不能保证无缺漏或完全准确。条款没有清楚解决把数据发给第三方 LLM 或用于模型训练的问题，徽标/图片可能涉及另外的权利。
- **判断：** 是未来付费扩展的优先候选，但需对目标联赛做字段覆盖验证，并书面确认公开作品集展示、持久化、派生指标、本地/云模型处理是否允许。

### API-Football（API-Sports）

- **能力与覆盖：** 官方 v3 文档含联赛、球队、球员、阵容及比赛统计端点；球队阵容/球员资料可按联赛和赛季请求，球员结果分页。完整程度因联赛、赛季和比赛而异；“coverage=true”也不保证该范围内每项统计都有值。来源：[官方文档](https://www.api-football.com/documentation-v3)、[覆盖页](https://www.api-football.com/coverage)、[入门指南](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide)。
- **价格：** 价格页展示免费 key 每日 100 次请求，付费计划从每月约 US$19 起。免费计划对历史赛季和调用量有限制，细节会变化。来源：[价格页](https://www.api-football.com/pricing)。注册后需确认项目所需端点/赛季是否落在免费额度。
- **权利：** [官方条款](https://www.api-football.com/terms)称数据来自合作方、按现状提供，并说明 API 使用本身不授予在应用、网站或其他产品中发布服务数据的许可；赛事/第三方权利仍需用户取得。没有明确给出可将数据送入 LLM 的普遍许可。
- **判断：** 适合本地验证 API 形状、调度和解析，不要因为有免费 key 就把数据放进公开演示、公开 RAG 或训练语料。使用前确认许可。

### football-data.org

- **能力与覆盖：** 主要提供赛事、赛程、比分、积分榜等；免费计划包含 12 个赛事，比分和赛程有延迟。更深计划开放球队阵容、首发/替补等；统计附加项以球队比赛事件统计为主，如角球、定位球、犯规、控球率、扑救、射门和牌，不足以构建丰富的个人推进/压迫画像。来源：[API 文档](https://www.football-data.org/documentation/api)、[覆盖列表](https://www.football-data.org/coverage)、[计划](https://www.football-data.org/pricing)。
- **价格：** 调查日价格页显示免费层 €0；Free + Deep Data 约 €29/月，Standard €49/月、Advanced €99/月、Pro €199/月。赛事数量及字段依套餐变化，注册后应核实。
- **权利：** FAQ 要求显示 “Data provided by football-data.org”。[官方政策页](https://docs.football-data.org/general/v4/policies.html)和 API 文档没有充分明确持久化、公开再发布、RAG 入库及 LLM 使用条件；应向服务方确认。
- **判断：** 可补充赛事/球队身份、赛程或比分，不是首选球员能力源。

### 其他 API

- **Wyscout 商业 API：** [API 文档](https://apidocs.wyscout.com/)可见，但文档入口不代表匿名免费访问、公开价目或数据使用授权。列入未来采购评估。
- 不要将多个供应商的同名指标直接求平均或总分。先对齐比赛范围、指标定义、单位、分钟样本、球员身份映射和许可。

## 可自行计算的公开比赛数据

### Wyscout 历史事件集：推荐用于事件管线原型

- 官方数据集由 [Figshare 集合页](https://figshare.com/collections/Soccer_match_event_dataset/4415000)提供，含比赛、事件、赛事以及 PlayeRank 文件。页面示例：[Events](https://figshare.com/articles/dataset/Events/7770599)、[Matches](https://figshare.com/articles/dataset/Matches/7770422/1)、[Competitions](https://figshare.com/articles/dataset/Competitions/7765316)、[PlayeRanks](https://figshare.com/articles/dataset/PlayeRanks/9361148)。
- 文件页标注 CC BY 4.0。论文介绍 2017/18 五个欧洲联赛、2018 世界杯、2016 欧洲杯等历史范围，包含事件类型、时间、球队/球员 ID、位置和标签；事件涵盖传球、射门、对抗、犯规等。来源：[原始数据论文](https://www.nature.com/articles/s41597-019-0247-7)。
- **用途：** 可计算样本级传球、射门、对抗和推进代理指标，支持重放分析与证据追溯。公开研究需按 CC BY 4.0 署名、链接许可并说明修改；PlayeRank 另需引用论文。
- **边界：** 这是选定赛事的历史快照，不是当前全世界阵容 API；没有完整追踪数据、每次无球跑动或真实压迫强度。不能用 2017/18 数据回答“现在谁适合拜仁”。

### StatsBomb / Hudl Open Data：样本选择性强，需读许可

- 官方仓库：[hudl/open-data](https://github.com/hudl/open-data)，使用协议：[LICENSE.pdf](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)。
- README 说明这是为研究项目及足球分析兴趣提供的选定联赛数据，包括 competitions/seasons、matches、events、lineups，以及部分比赛的 360 数据；发表分析需标注 StatsBomb 并使用媒体包标志。
- 许可是自定义 Public Data User Agreement，不应称作无条件开源许可证。保存、公开展示、衍生分发及向 AI 模型发送数据的范围应先读 PDF 并向 Hudl 确认。
- **判断：** 可作为公开分析案例备选，但不是当前全联赛完整球员统计服务；许可明确前不进入长期 RAG 库。

### SkillCorner Open Data：空间和无球分析样本

- 官方仓库：[SkillCorner/opendata](https://github.com/SkillCorner/opendata)，[README](https://github.com/SkillCorner/opendata#readme)说明有 2024/25 澳大利亚 A-League 的 10 场广播追踪和动态事件样本、赛季级 Physical/Off-Ball Runs/Passing 汇总，以及 2 场 3D body pose 样本；追踪约 10 fps。README 也提示追踪和身份结果存在误差。
- 仓库根目录标注 [MIT License](https://github.com/SkillCorner/opendata/blob/master/LICENSE)，README 要求给 SkillCorner 署名。但需确认该 MIT 文件是否覆盖所有数据文件、派生输出、球员身份/肖像及公开托管/LLM 使用；代码仓库许可证不必然解决数据权利。
- **判断：** 可设计空间、速度和无球跑动特征，但覆盖有限，不能充当广泛当前球员能力库。公开使用前按许可和署名要求核实。

### Impect Open Data：高级事件 KPI 示例，定制许可

- 官方仓库：[ImpectAPI/open-data](https://github.com/ImpectAPI/open-data)提供 Bundesliga 2023/24 固定数据，包括比赛/阵容/换人、球员和球队主数据、事件、事件 KPI、按球员/位置/比赛整理的 KPI 及 KPI 定义。
- README 指向专用[LICENSE.pdf](https://github.com/ImpectAPI/open-data/blob/main/LICENSE.pdf)，并要求遵守条款和署名/品牌要求。这不是默认 CC BY/MIT；确认公开展示、派生评分、存储和 LLM 范围前，不复制到公开项目或持久知识库。
- **判断：** 适合研究高阶 KPI 如何进入球探解释，但不是当前服务；先审许可。

### IDSSE：公开追踪研究样本

- [Springer Nature Figshare 数据集](https://springernature.figshare.com/articles/dataset/An_integrated_dataset_of_spatiotemporal_and_event_data_in_elite_soccer/28196177)于 2025-02-02 发布，记录七场 Bundesliga 一/二级比赛的事件与时空/追踪数据，约 2.45 GB；页面标注 CC BY。
- **判断：** 可验证事件与位置联合处理，但样本只有七场，不提供现役全体球员索引。按数据页要求署名并核对具体许可版本。

### Metrica Sports Sample Data：匿名算法样本

- 官方仓库：[metrica-sports/sample-data](https://github.com/metrica-sports/sample-data)提供两场标准 CSV 示例及一场 EPTS/JSON 示例，含事件和同步追踪；README 说明匿名样本，要求负责任使用和公开引用来源。
- 仓库未发现明确覆盖数据的独立许可证。只建议本地格式解析/算法原型；不能据此推定可再分发、公开展示球员评价或加入 RAG。其产品 API 是付费功能，不是免费公开 API。
- **判断：** 可测试 tracking 解析，不能支持实名候选检索。

### SoccerNet：视觉研究数据，不是球员统计库

- 官方仓库：[SoccerNet](https://github.com/SoccerNet/SoccerNet)是足球视频理解/标注任务集合，README 指向 Hugging Face 数据发布；部分视频需要申请访问，隐藏测试标签不会全部公开。
- 仓库代码许可证不代表转播视频也可自由下载、展示、标注或用于模型训练。
- **判断：** 不是第一版候选球员源；只有在需要特定视频识别研究且取得数据/视频许可时再评估。

## 运行时 Web Search / 新闻发现

搜索可以帮助 Agent 找到近期新闻、俱乐部公告或官方比赛资料，再由用户通过引用查看原文。它不替代球员统计源，也不自动授权抓取整页、复制全文或把结果存入 RAG。

### Tavily Search

- **免费额度与接入：** [官方价格页](https://www.tavily.com/pricing)列出每月 1,000 credits 的 Researcher Free，无需信用卡；超额按量计费，PAYG 起价为每 credit US$0.008。不同 endpoint credit 消耗不同，见[Search API](https://docs.tavily.com/documentation/api-reference/endpoint/search)和[Extract API](https://docs.tavily.com/documentation/api-reference/endpoint/extract)。API key 从控制台创建。
- **AI 集成：** [条款](https://www.tavily.com/terms)允许将 Search API 集成到客户应用（包括 AI 工具）。可使用 Search，必要时对选定 URL 调用 Extract；若希望由本地 Ollama 推理，不使用 Tavily 自己的 AI 答案。
- **发往本机之外的内容：** [隐私政策](https://www.tavily.com/privacy)说明查询和上传文档用于检索，可能向第三方索引提供方路由查询，并可能使用部分查询改善结果。查询不会因最终模型是本地 Ollama 而留在本地。不要发送私密球探笔记、未公开名单或无关个人信息。
- **缓存/引用：** 公开资料没有充分明确搜索片段可长期保存或作为 RAG 索引的权利。API 集成许可不能推导出网页全文存储/再发布许可。默认只在一次研究任务短期状态保留少量片段、标题、URL、日期；不要保存 Extract 全文。长期缓存前向 Tavily 和原始发布方确认。
- **判断：** 免费额度友好，适合来源发现原型；Agent 应核查一手页面并保留引用。

### Brave Search API

- **免费额度与接入：** [官方计划页](https://api-dashboard.search.brave.com/app/plans?tab=normal)显示每个计划有 US$5 月度 credits，Search API 标价 US$5/1,000 次调用，约 1,000 次常规搜索；注册需要付款方式，不能等同于无卡免费。以账户控制台为准。
- **本地模型流程：** 有普通搜索 API 和专为 LLM 整理上下文的 LLM Context endpoint，见[官方文档](https://api-dashboard.search.brave.com/documentation)和[认证指南](https://api-dashboard.search.brave.com/documentation/guides/authentication)。可将有限结果即时传入 Ollama 生成答案；查询仍发给 Brave，key 必须留在服务端。
- **缓存/模型使用限制：** [API 条款](https://api-dashboard.search.brave.com/documentation/resources/terms-of-service)标注 2026-09-01 更新，只允许在客户应用运行期间临时处理 Search Results，并限制存储、缓存、建库、转售或再分发；也禁止用结果创建、评估、训练、微调、基准测试或以其他方式改进 AI 模型/服务。LLM Context endpoint 支持实时上下文检索，不代表可以长期保存结果或训练模型。对由搜索上下文生成且计划持久化/公开的回答，先向 Brave 确认范围。
- **网页权利与隐私：** Search API 不授予第三方网页全文权利。[隐私政策](https://api-dashboard.search.brave.com/app/documentation/privacy-policy)说明普通请求数据用于计费/支持等目的保留（页面说明最长 90 天；Enterprise Zero Data Retention 需合同）。本地推理不等于端到端不出本机。
- **判断：** LLM Context endpoint 适合一次性检索后本地总结，但必须 transient 使用；应用应显示来源链接和日期。

### 搜索供应商选择

| 维度 | Tavily | Brave |
|---|---|---|
| 可见入门额度 | 1,000 credits/月；无需信用卡 | US$5/月 credits，约 1,000 次 Search；需付款方式 |
| 送本地 Ollama | Search/有限 Extract 后传入；查询发给 Tavily | LLM Context endpoint用于实时上下文；查询发给 Brave |
| 持久缓存 | 公开边界不清楚；默认不保存结果/全文 | 条款只允许临时处理；不缓存、不入库 |
| 第一版适用性 | 低门槛原型和来源发现 | 适合严格 transient 的实时上下文 |
| 共同限制 | 搜索结果不是全文许可；检查原始页面权利 | 搜索结果不是全文许可；检查原始页面权利 |

**推荐实现边界：** 做可替换的 Search tool adapter，只返回查询、标题、URL、发布日期（如有）、短摘要和供应商。一次任务结束后清除原始结果上下文；报告只保留必要的来源标题/链接/访问日期和自行撰写的结论。不要用搜索结果自动创建持久 RAG 索引。新闻事实追溯至俱乐部、联赛、球员本人或可靠发布方原文；搜索排名不代表可信度排序。

## 自行收集球探观察的可行路线

可控的“自制数据”不是复制网站报告，而是形成来源透明的小型观察数据集：

1. 使用有授权的比赛视频、现场观察或允许使用的赛事素材；记录比赛/球员标识、来源、时间戳、观察者和结构化观察，不擅自保存或再发布整段转播视频。
2. 把**可复核事实**与**观察者判断**分开。例如“第 35 分钟完成向前传球”与“高压下转身出球稳定”是不同类型证据。判断记录观察量表、样本分钟、置信度和未知项。
3. 用小而明确的职责模板描述可观测能力，如有球推进、传球选择、控球保护、压迫参与、回追与防守位置。缺少观察就标未知，不让 LLM 补出不存在的数据。
4. 记录来源、许可/访问依据、供应商范围内 ID、赛季、统计定义、单位、样本量、采集时间、观察者和规则版本。跨供应商身份匹配需留方法和人工复核状态，不能只凭同名拼接。
5. 对主观观察安排双人标注一个小子集，记录分歧并改进量表。能力排名展示支撑样本和不确定性，不能把低样本分数包装成精确事实。

建议最小证据记录字段：player_ref、team_ref、match_ref、source_provider、source_record_id、source_access_basis、metric_or_observation、value、unit、season_or_date、sample_minutes_or_n、coder_or_method、confidence、observed_at、valid_at、schema_version。每项统计定义关联官方文档或项目自己的方法说明。

## 来源限制与风险边界

- FBref 的[Terms of Use](https://www.sports-reference.com/termsofuse.html)和[Data Use 页面](https://www.sports-reference.com/data_use.html)限制自动访问/抓取，并限制将网站内容用于 AI 提示、训练或改进模型等场景。项目已遇到访问拒绝；不应绕过 403 或挑战继续抓取。
- [英超网站条款](https://www.premierleague.com/en/terms-and-conditions)限制未经许可对内容再利用、再分发或建库；Fantasy Premier League 的[条款](https://fantasy.premierleague.com/help/terms)也限制自动访问/提取。
- [UEFA 条款](https://www.uefa.com/termsconditions/)限制自动工具抓取、系统性采集入库，以及把内容用于训练软件、模型或 AI。官网可作定向事实核验和链接，不应成为无授权自动采集源。
- 收到 403、验证码或 bot 挑战时停止该来源自动请求；改用官方 API、允许下载的数据集、人工核查或联系权利方。非商业作品集不应被假设为豁免。
- 第三方 Search 结果、API 返回和公开数据文件遵循不同许可；某 API 允许存储其返回数据，不代表允许公开原始网页全文、图像、徽标或训练模型。

## 建议落地顺序

### 免费、现在就能推进

- 选 Wyscout CC BY 历史事件数据作为**事件计算和 provenance 管线样本**，标清年份和赛事；演示需标注来源、许可和修改。
- 用 SkillCorner/IDSSE 追踪样本做**空间指标解析实验**，先审阅许可适用范围；注意文件规模和样本有限。Metrica 只做匿名格式实验，直到取得数据许可。
- 自建小型、人工编写并附依据的职责量表和测试 fixture，让 Agent 在数据不足时输出“无法判断”。公开前审阅每个输入源的授权。
- 若需要自然语言找近期公告，可用 Tavily 免费 Search 计划做一次调用链原型。只保留短期上下文和原始来源链接，不灌入向量库。若采用 Brave，则严格限制为请求期间临时使用。

### 付费时再做

- 对目标联赛逐项比较 Sportmonks、API-Football、football-data.org Deep Data 的实际端点返回。先取一支队当前阵容、一名候选人跨场次数据和一项缺失指标做 POC，统计空值、字段定义、更新时间和调用成本。
- 书面确认作品集页面/截图是否允许展示、数据能保存多久、可否存派生指标、可否把字段传给本地 Ollama、是否允许云模型，以及用户请求产生的答案能否长期保留。
- 若战术特征依赖追踪或专有事件 KPI，再申请 SkillCorner/Impect/Wyscout 正式许可及报价；不要把公开小样本冒充为完整 API 替代品。

## 未确认事项

- Sportmonks 等 API 对拜仁/巴萨等目标队当前阵容字段填充率、统计延迟与逐联赛覆盖，需实际账号调用或询问供应商。
- API key 试用资格、可用历史赛季、请求额度会随账号、地区或计划改变；价格是调查日的公开页面快照。
- Sportmonks、football-data.org 对 AI 提示、本地模型、RAG 及长期缓存的具体许可未从公开文档确认；API-Football 的公开发布限制较明确，但 AI 使用范围仍需确认。
- StatsBomb、Impect 的 PDF 使用协议需人工完整阅读；研究、署名要求不明确时取得数据方书面回复。
- SkillCorner 的 MIT 文件与数据文件对应关系，以及对派生数据、公开部署、身份字段和 LLM 使用的适用性需确认。
- Tavily 对 Search/Extract 结果的长期缓存、RAG 入库、引用呈现期限需书面确认；隐私政策意味着不能将它视为本地搜索。
- Brave 公开条款限制缓存/搜索结果库/模型训练。若应用希望持久保存由搜索上下文生成的摘要或公开检索档案，先向 Brave 确认。

## 2026-10-04：用户允许扩展来源后的路线复核

本轮复核重点不是再列更多 provider，而是确认不同数据形态可分别补足什么。优先读取来源方官网、其维护的官方仓库、当前条款和数据许可文本；价格与覆盖按调查当日页面记录，使用前仍须实测具体账户/赛季。

| 数据路径 | 来源一手说明 | 可提供的价值 | 主要边界与决定 |
|---|---|---|---|
| TactiScout 第一方比赛观察 | 本地观察模块记录作者、比赛情境、依据和单独许可；本轮扩展为项目自定义维度和单场 1–5 档主观判断。 | 为看过的当前比赛累积有上下文的角色能力样本，不依赖第三方球探报告全文。 | 观察者必须亲自看过具备使用依据的比赛；不能让 LLM 补写。评分不自动聚合、标准化或进入确定性适配分；需后续双人标注评估一致性。 |
| Sportmonks 当前 API | [免费计划](https://www.sportmonks.com/football-api/free-plan/)目前只含丹麦 Superliga 与苏格兰 Premiership；[Starter 定价页](https://www.sportmonks.com/football-api/plans-pricing/)调查时列 €29/月（年付折算 €24/月）、可选任意 5 个联赛。官网列球队 squad、球员档案、逐场和赛季统计。 | 可经一个 provider 提供当前名单及常规统计。当前实现已有 Sportmonks adapter；如果开发者持有可用账户，可以用一份 token 覆盖例如德甲+西甲，先验证实际字段空值和身份。 | 免费档不覆盖拜仁/巴萨。网页标准条款允许产品内存储/展示数据，但没有明确解释第三方 LLM/embedding 处理；provider 说明自己不是赛事官方权利方，内容也可能有缺口。当前本机没有 token，未做 live 联调；不得把官网示例当成自身账户的覆盖证据。 |
| SkillCorner Open Data | 官方 [Open Data README](https://github.com/SkillCorner/opendata/blob/master/README.md)记录 2024/25 澳超的 10 场追踪、动态事件样本，以及该赛季的体能、无球跑动和传球汇总；[仓库 LICENSE](https://github.com/SkillCorner/opendata/blob/master/LICENSE)为 MIT 文本。README 提醒部分轨迹错误，球员身份识别准确率约 97%。 | 为少量实名赛季样本增加传统事件表较少覆盖的空间、跑动与无球线索，并展示 TactiScout 如何处理追踪派生证据。 | 只有 10 场逐帧追踪，不是广泛当前候选池；现有 adapter 仅读取聚合 CSV。MIT 文件是否覆盖所有球员级数据、模型处理和作品集展示仍应单独确认，当前相关开关维持显式 opt-in。 |
| StatsBomb Open Data | 官方 [`hudl/open-data`](https://github.com/hudl/open-data)将数据描述为研究与足球分析兴趣用途，并公布部分赛事/赛季的比赛、事件、阵容及选定 360 JSON；发布分析须标明 StatsBomb 并使用 Media Pack logo；附有自定义 User Agreement。 | 具名历史赛事和逐事件字段有利于自算多类技术战术事件统计；可与 Wyscout 快照相互对照算法，不自动合并相同字段。 | 赛事选取有限，不保证当前完整阵容或持续赛季覆盖；不是无条件开源数据协议。原协议对模型处理和公开展示边界不清楚时，保持现有明确门控。 |
| OpenFootball World Cup JSON | 官方仓库 [`openfootball/worldcup.json`](https://github.com/openfootball/worldcup.json)表示数据和脚本置于公共领域；包含世界杯年份的赛程、比赛细节和部分名单。 | 可以低成本取得特定国际赛事日程、比分、名单等结构信息，便于做赛事上下文或校验公开赛况数据解析。 | 只覆盖世界杯等国际赛事，不具备俱乐部转会市场或球员能力统计；不纳入俱乐部候选池。 |

### 更新后的数据产品路线

采用三类相互补足、但不混为一档的证据：

1. **第一方观察是 TactiScout 的可持续自有数据资产。** 新录观察保留作者、具体比赛、位置/职责、能力维度与场景依据；人类主观评分只是证据，不等同于模型计算值。
2. **当前候选和常规表现由一条真实当前季 provider 提供。** Sportmonks 已有 adapter 和付费产品内使用条款，但当前免费覆盖不匹配拜仁/巴萨，而且本地没有 token；只有配好账户、确认目标联赛和模型处理权限并完成 live 数据核验后，才可声称实时链路运行。
3. **许可开放的历史事件与追踪数据负责验证 TactiScout 自己的解析、派生指标和质量报告。** Wyscout、StatsBomb 与 SkillCorner 样本保留各自赛季、来源身份、指标定义及许可，不能充当当前阵容或统一能力评分。

数据来源可以增加；是否加入由目标字段、范围和使用依据决定。禁止以同名字段或姓名直接拼接来源，也不以 provider 数量作为数据质量指标。该决定落实于 [issue 39](../issues/39-layered-player-evidence.md)、[issue 40](../issues/40-tactiscout-owned-scouting-dataset.md) 与 [issue 41](../issues/41-structured-first-party-observations.md)。
