# TactiScout 新增球员与表现数据源调查

核查日期：2026-10-04。只使用提供方/发布方官方文档、API 使用条款、公开资料库和其官方页面。没有调用任何需要账户凭据的 API，也没有下载数据集文件。本文是工程选型记录，不构成法律意见。

## 结论

没有找到一个同时覆盖当前全球球员、具备有意义的战术/比赛指标、低价，并明确许可公开应用和 AI 处理的单一开放来源。建议把“当前球员身份/阵容补充”与“深入表现分析”分开推进：

1. **TheSportsDB 是可以实际验证的低成本候选 provider。** 官方 API 包含球队球员名单、球员资料、合同与球员统计查询；官方 Terms 允许复制和修改通过正式 API endpoint 返回的内容，$9/月的 Single Developer 档明确适用于应用和服务，并要求标注来源。免费 API 更适合开发验证。它是众包数据库，球员统计没有完整字段字典、覆盖承诺或更新 SLA；应先作有限 roster/identity enrichment，不作为 TactiScout 能力评分来源。公开模型处理尚未明确，待书面确认。
2. **Afriskaut Dynasty Scouting League 2024 是已明确 Apache-2.0 的表现数据集候选。** 它提供 2024 年尼日利亚青少年赛事的事件、球员/比赛元数据、阵容和球场坐标，适合验证事件解析与可解释指标。它不是欧洲职业转会池；官方发布说明赛事球员年龄为 16–19 岁，公开或模型处理涉及未成年人时还需确认适用的隐私/参与者授权。
3. **Wikidata 适合做免费实体交叉引用，不适合做现役阵容源。** 结构化数据为 CC0，球队关系/位置等字段可以帮忙核对 ID 和基本背景；社区知识库不保证准确性或完整性，不能替代球队名册或能力数据。
4. **不建议抓取 Fantasy Premier League 数据。** 官方 2026/27 条款禁止自动系统访问和提取 Game 信息，并声明相关 Game data 的知识产权归英超联赛所有。尽管其中的球员字段和统计对 MVP 看起来有用，也不应把公开 endpoint 当成开放许可。

因此，最现实的实验组合是：**TheSportsDB 做可追溯的 roster enrichment spike；Afriskaut 做历史事件分析 benchmark；Sportmonks 继续作为当前赛季主要候选池的既有 provider，并先完成账户覆盖及模型处理权验证。** 不应将以上不同时间、联赛和许可来源合并成无来源标签的“全球球员数据库”。

### 明确 go/no-go

- **GO：**TheSportsDB 的本地只读 roster enrichment 小实验（ID、姓名、球队关系、国籍、粗位置，保留 provider 和查询时间）；Afriskaut 的本地事件解析/派生指标 benchmark，并保留 Apache-2.0 与来源署名；Wikidata 作为低置信实体交叉引用。
- **条件 GO：**TheSportsDB 公网上线只在采用 `$9/mo` app/service 计划并加来源署名后继续；缓存字段与保留期按最小化方案实现，并先向提供方确认；不要在浏览器暴露付费 key。
- **NO-GO（当前）：**TheSportsDB 统计值进入角色评分/候选排名，market value/wage 驱动预算判断，或把 TSDb 字段交给 Ollama/远程模型；官方字段口径、覆盖/更新时间和 AI 权限不够明确。Afriskaut 的具名未成年球员输出、对外 LLM 处理或跨职业联赛排名，也须等个人数据授权与代表性问题核清。Fantasy Premier League 自动抽取为明确 NO-GO。

## 候选来源比较

| 来源 | 数据和时效 | 获取与价格 | 再利用/模型边界 | 结论 |
| --- | --- | --- | --- | --- |
| **TheSportsDB** | 官方 API 文档列出球队、球员、球员统计、球员合同、比赛阵容等 endpoint。官方页面显示球员档案可有国籍、位置、球队、当前赛季出场/进球、历史联赛/赛季统计等；这些字段和样本完整度并不稳定。服务自称 crowdsourced；未见覆盖 SLA、球员资料更新时间或统计完整性保证。 | V1 无需私有 key 的开发 key 可调用，但 free API 全局 30 requests/min；球员搜索每次最多 1、球队球员名单最多 10、球员统计最多 10 条（各端点的免费 limit）。Single Developer $9/月：100 requests/min、完整 premium JSON、更高端点限额（球队球员名单 3000、球员统计 10,000）；Business $20/月，120 requests/min，价格页称返回数据无数量上限。文档没有每日总配额，具体端点 limit 的单位未充分解释。 | Terms（2026-09-17）明确允许通过官方 endpoints 返回的内容被 “copy and modify”；付费计划明确可开发 apps/services，须注明 TheSportsDB 为数据来源。没有写明缓存期限、订阅取消后的已有缓存处置或 LLM/AI 处理许可。Terms 另要求使用者确保获得 API 数据的第三方遵守条款，并指出第三方照片、标志不因 TheSportsDB API 订阅而自动获许可。 | **开发验证可用，适合较便宜的阵容补充原型。** 公开托管作品集建议用 $9 档，因为 paid terms 明确覆盖 app/service；AI 处理需另问，先禁用照片与模型输入。统计 endpoint 不够透明，暂不计分。 |
| **Afriskaut Dynasty Scouting League 2024** | 静态样例：JSONL 逐事件数据、`match.json`（球队、比分、阵容、首发方向、换人和时间）、事件类型/标签定义 PDF、自定义 497×328 场地坐标。官方 summary 文件列出 136 场比赛记录，每场事件条数差异明显；原始数据须按赛事规则和事件定义解析。发布方称该青少年赛事球员年龄为 16–19 岁。没有后续更新承诺。 | GitHub 公开 ZIP，无 API/key/价格；不是滚动更新的数据服务。 | 仓库明确称数据集采用 Apache-2.0 并要求公开项目署名 Afriskaut。可以本地下载、缓存、修改并分享派生作品，发布时保留许可和署名。Apache 许可覆盖版权/专利授权，但本身不能代替未成年人个人信息、肖像或参赛者授权判断；仓库没有专门的外部 LLM 条款。 | **推荐作许可清楚的事件分析 benchmark。** 可计算传球网络、事件区域、推进/射门等有定义支持的指标；不要把 16–19 岁青少年样本包装成职业球员市场或与五大联赛混排。先查看真实 JSONL 字段、事件定义和个人信息，再决定是否将含身份字段输入本地模型或公开球员级结果。 |
| **Wikidata** | 人物实体可能含稳定 QID、member of sports team（P54）、position played on team（P413）、生日、国籍等结构化事实。P54 可带起止日期 qualifier，但不是权威 roster feed；众包数据缺漏/陈旧风险较高。官方 WDQS 说明更新滞后通常少于 10 分钟，但只代表服务复制数据的延迟，不代表编辑者及时更新球员事实。 | CC0，免费复用。单实体可用 `Special:EntityData/{QID}.json`；特征查询用 `https://query.wikidata.org/sparql`。官方说明窄 SPARQL 查询适用，模糊搜索应走 search；公开 WDQS 查询超时为 60 秒，公共端点可用性低于通常服务。 | Wikidata 将结构化数据放入公有领域/CC0；无版权署名要求。Wikidata 自身也声明不保证资料有效性，事实来源和参考文献需逐条检查。CC0 只消除版权限制，不等于核验球员属性准确。 | **只做候选 ID/背景交叉引用**，不能据此认定球员当前属于目标队，不能生成比赛表现评分。若保留字段，存 QID、claim qualifier、reference URI、查询时间及其低置信来源标签。 |
| **Impect Open Data** | 官方仓库称包含 2023/24 完整 Bundesliga 306 场事件与球员比赛 KPI，适合专业事件/战术分析。 | 静态 GitHub，需下载并接受官方单独 `LICENSE.pdf`；无公开 API 定价。 | 仓库 LICENSE PDF 的具体许可文本未在本次可读资料中核验；不能据 README 或第三方摘要推断可公开商用、再分发或发给模型。 | **数据内容值得下一轮许可核对**，当前不要接入产品、公开原始文件或送入 LLM。 |
| **Fantasy Premier League** | 当前英超 Fantasy game 数据含当季球员与 fantasy 统计，但不是完整战术事件数据。 | API 本身在网站公开可访问；没有一份官方开发者计划/许可授予公开发布权。 | 2026/27 官方条款禁止自动系统访问和提取 Game 信息；英超声明 Game data 属其知识产权。 | **排除自动采集。** 要使用应先取得书面数据许可。 |

## TheSportsDB：可实施 API 路径

官方 V1 base URL 为 `https://www.thesportsdb.com/api/v1/json/{API_KEY}/`。官方文档公开的开发 key 为 `123`，付费 key 需在账户获取。V2 使用 request header 认证且文档称仅 Premium 可用；优先面向长期实现评估 V2，而不要把 key 放进浏览器请求。V1 key 是 URL path 的一部分，记录日志时必须遮蔽。[官方 API 文档](https://www.thesportsdb.com/documentation)

| 目的 | 官方 endpoint（GET） | 文档限制 / 可用于什么 |
| --- | --- | --- |
| 按联赛发现球队 | `search_all_teams.php?l={league}&s=Soccer`（也可按国家/运动查询） | Free limit 10、Premium 3000。先人工配置 TactiScout → TheSportsDB 的 `idLeague` 对照，不依赖非精确名称匹配。 |
| 取得球队名册 | `lookup_all_players.php?id={teamId}` | “List all the Players who play for a team” endpoint；Free limit 10、Premium 3000。适合被来源标明为当前球队关系的 roster 候选，不保证实时官方名册或可用球员状态。 |
| 按名称查球员 | `searchplayers.php?p={name}` | Free limit 1、Premium 10。只用作检索/人工核对入口；同名者不要按名称自动合并。 |
| 取单人档案 | `lookupplayer.php?id={playerId}` | Free/Premium limit 都列为 1。Profile 页面示例可呈现姓名、国籍、位置、球队、球衣号、生日及其他资料；官方 API 文档没有给出稳定的完整 JSON schema，需在获准 API 实验中记录实际字段。 |
| 取球员统计 | `lookupplayerstats.php?id={playerId}` | Free limit 10、Premium 10,000。官方只描述“lookup statistics”；没有完整字段词典、口径/单位规范、fixture 层级覆盖说明或每赛季完整性承诺。 |
| 取合同 | `lookupcontracts.php?id={playerId}` | Free limit 1、Premium 100。可辅助显示来源记录，不等于权威合同确认；字段定义和更新来源仍需核验。 |

Free 计划适用于开发项目查询，但官方 Terms 说未付费订阅不能将 app 发布到 app store；条款没有明确说明免费 API 能否长期支撑对公众开放的 web SaaS/portfolio 部署。因 TactiScout 是公开应用形态，若要发布应选官方列明 `$9/mo`、明确可开发 apps/services 的 Single Developer 计划，或先向提供方问清 web deployment。Business `$20/mo` 才明确写明返回数据无数量上限。[定价](https://www.thesportsdb.com/docs_pricing) · [Terms](https://www.thesportsdb.com/docs_terms_of_use.php)

### 缓存、署名和模型处理

Terms 中可以直接确认的措辞是：“You can scrape, copy and modify content returned from the API using the official end points.” 这给出了把官方 API 返回内容复制到应用处理链路的明确基础，因此**本地存储/缓存看起来属于允许的复制用途**；但条款未写缓存 TTL、永久保存、账户取消后的缓存处理或供公众批量下载的许可。实现时建议仅缓存 app 所需字段、记录取得时间、先采用短缓存，并向提供方确认持久存储周期。

同一 Terms 对付费 apps/services 规定须把 TheSportsDB 显示为来源；对其原创 artwork 要按相应 Creative Commons 条件署名，对第三方照片/标志则需另行核对每张图片许可。`strCreativeCommons=Yes` 只是提示字段，并非该图片已完整获许可的证明。球员头像、队徽和主观评分图像一律不纳入本次 provider 计划。[官方 Terms: Content use / paid use / images](https://www.thesportsdb.com/docs_terms_of_use.php)

条款未出现人工智能、机器学习、向量化或生成模型条款，也没明文禁止模型处理。因此目前**无法确认**统计或身份字段能否传给外部 Ollama/其他 LLM API；第三方 access 条款要求调用者确保第三方遵守 Terms，但没有解释推理 API 是否在许可内。给 TheSportsDB 的核对问题应包括：

- 付费 Single Developer 是否允许在托管 web portfolio 里展示由 API 取得的姓名、位置、国籍、当前队伍及球员比赛统计？
- 是否允许把所取得的资料存于 TactiScout 自有数据库/短期缓存？缓存最长多久、取消订阅后如何处理？
- 是否允许向本地 Ollama 提交球员的结构化身份和统计，或把统计字段发给外部推理/embedding API？
- `lookupplayerstats` 与 player profiles 的数据维护频率、统计 coverage 和更新时间字段是什么？是否能提供正式 schema/数据字典？
- 球员姓名/履历、market value、wage、contract、文章描述分别来自哪些上游；是否分别适用不同的授权？

## TactiScout 字段分层建议

| 字段 | 可先用于 roster enrichment 的范围 | 进入能力评分的处理 |
| --- | --- | --- |
| TheSportsDB `idPlayer` / `idTeam` 和对应 profile/team 页面 URL | 保留为 provider namespace 下的稳定来源 ID，做来源内关系连接；不要与其他源的数字 ID 直接合并。 | **不评分**。跨源 link 须基于独立确认映射，并保存匹配依据/置信度。 |
| 球员 display name、球队名、队员关系 | 可用于展示“该提供方截至查询时间将此球员列入该队”；记录 retrieval time 与数据源。与 Sportmonks roster 不一致时提示冲突，不自动判定转会。 | **不评分**。名册事实不可转化为球队适配度。 |
| 位置、国籍、球衣号码、生日 | 可作为有来源标签的档案补充；年龄从完整出生日期与报告时点确定性计算。未返回则保持 unknown。 | 位置只可做粗略候选过滤；不作为职责/战术能力评分。生日可做用户要求的年龄 hard constraint，不是潜力指标。 |
| 出场、进球、助攻等 player stats | 在 API schema 和统计口径经验证后，可作为标注了赛事、赛季、来源、样本数的背景统计，并可辅助与其他来源矛盾检查。 | 当前**不得评分或生成排名**：文档缺字段/单位/分母、分钟数/位置样本和更新时间保证；横跨赛季或赛事计算之前须逐项校验定义。 |
| Market value、wage、合同日期、profile prose | 不作为预算/转会要价或能力证据；如确需显示合同，应标为“该数据源提供方记录”，附来源时间并与另一来源核对。简介文字不当作事实引用。 | **不进入评分**。market value 没有充分说明来源、采集方法及 as-of date；wage/合同也无法据现有文档确认完备性。 |
| 图片、队徽、奖项 artwork | 本轮不下载、不缓存、不展示。 | 不评分。具体资产须逐图确认作者、license、版本、署名和第三方权利。 |

对 LangGraph 的最小集成边界可先设计为只读工具 `lookup_roster_enrichment(teamProviderId)`：返回 provider IDs、少量允许展示的 profile fields、retrieval timestamp、未知/冲突 coverage；默认关闭文本解释与统计评分。真实接入前，用少量手工选取球队检查名单字段、翻页/列表截断、历史球员混入、重复球员、空值、更新时间和收费限额。只有统计 schema/权利清楚后，才新增独立的 `get_player_statistics` evidence tool。

## Afriskaut 数据集边界

该数据集提供静态比赛样本而非 roster API：每个比赛目录有 `events.jsonl`（每行一条事件）与 `match.json`；官方 README 说后者包含队名、比分、首发阵容、比赛开局方向、换人和时间。README 将坐标写为 497×328，并给出事件定义图和坐标参考；官方 summary.csv 有 136 个 match ID，其 `events_exported` 从 117 至 1,264 不等。因此，它可以支持解析和一些事件衍生图表，但样本有明显场次数据量差异，不能直接比较球员总次数；先用实际 lineups 计算上场分钟/角色样本，再决定每 90 指标是否有效。[Afriskaut repo README](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data) · [官方 summary.csv](https://raw.githubusercontent.com/Afriskaut/dynasty-scouting-league-2024-open-data/main/summary.csv) · [事件类型定义 PDF](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data/blob/main/Afriskaut%20Event%20Map%20-%202024.pdf)

Apache-2.0 是该 repo 对数据文件声明的许可证，发布作品需标注 Afriskaut 并随适用内容保留许可。它提供真正少见的青年球员比赛事件样例，但官方合作介绍说明数据来自 16–19 岁赛事。[官方发布介绍](https://www.linkedin.com/posts/afriskaut_pre-professional-african-football-open-data-activity-7450108442012323840-BNuP) 在展示具名 profile、向 LLM/第三方服务提交、或把逐事件数据复制到公开截图/仓库之前，先确认数据中个人字段、参与者授权、监护人/赛事许可和期望署名；Apache 数据许可本身不回答个人信息/肖像权问题。适合优先做本机可重复 benchmark，避免将数据送往外部模型。

## 推荐的后续验证顺序

1. 为 TheSportsDB 建立不含真实数据的 adapter contract，确认 endpoint schema、限额和缓存行为；用公开 profile 页面人工对照两支熟悉球队与名单，不据一次 API 响应宣称 coverage 已验证。
2. 决定公开 demo 是否使用 $9/mo 计划；若不愿订阅，把 free key 限在本地 development-only，不在公开应用的服务端依赖它。
3. 给 TheSportsDB 发邮件询问托管 web app、短期/持久缓存、统计展示及本地/外部 LLM 使用权。在答复到手前维持 `AI processing=false`，并排除照片/队徽/原文简介。
4. 以 Afriskaut 的 event map + synthetic/本地样本独立验证进阶指标工具和证据 trace；先处理未成年数据授权边界，不把此源合并成成年职业球员市场。
5. Wikidata 可作为 opt-in 的实体 crosswalk（QID + P54/P413/reference snapshot），只有日期 qualifier 与外部确认都支持时才报告球队关系；缺失即 unknown。

## 官方一手来源

- [TheSportsDB API documentation](https://www.thesportsdb.com/documentation) · [API player data guide](https://www.thesportsdb.com/docs_api_data) · [Pricing](https://www.thesportsdb.com/docs_pricing) · [Terms of use](https://www.thesportsdb.com/docs_terms_of_use.php) · [about / crowd-sourced database statement](https://www.thesportsdb.com/docs_about) · [Harry Kane public profile example](https://www.thesportsdb.com/player/34146220-harry-kane) · [Justin Kluivert public profile example](https://www.thesportsdb.com/player/34163664-Justin-Kluivert)
- [Afriskaut Dataset README](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data) · [Apache-2.0 license file](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data/blob/main/LICENSE) · [summary.csv](https://raw.githubusercontent.com/Afriskaut/dynasty-scouting-league-2024-open-data/main/summary.csv) · [event map PDF](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data/blob/main/Afriskaut%20Event%20Map%20-%202024.pdf) · [Afriskaut release statement about ages](https://www.linkedin.com/posts/afriskaut_pre-professional-african-football-open-data-activity-7450108442012323840-BNuP)
- [Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) · [Wikidata data access](https://www.wikidata.org/wiki/Help:Data_access) · [Property P54: member of sports team](https://www.wikidata.org/wiki/Property:P54) · [Property P413: position played on team/speciality](https://www.wikidata.org/wiki/Property:P413) · [general disclaimer](https://www.wikidata.org/wiki/Wikidata:General_disclaimer) · [WDQS technical interactions and operational limits](https://wikitech.wikimedia.org/wiki/Wikidata_Query_Service/Technical_interactions)
- [2026/27 Fantasy Premier League Terms & Conditions](https://fantasy.premierleague.com/help/terms)
- Existing comparisons: [football data provider landscape](football-data-provider-landscape-2026-10.md) · [additional player performance evidence sources](additional-player-evidence-sources-2026-10.md) · [player performance data licensing](player-performance-data-licensing-2026-10.md)
