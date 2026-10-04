# TactiScout 单一开放足球数据源可行性

核查日期：2026-10-04。范围：只考虑无需付费、无需逐项目另行申请商业授权即可开始验证的数据；免费 API key 作为单独类别标注。只核对数据发布方/网站的一手文档、服务条款和 robots.txt，不尝试绕过访问控制、反爬或登录限制。本轮没有 API 凭据，因此未验证任何账户的真实 payload 或权限。本备忘录用于工程选型，不是法律意见。

## 结论

**目前没有找到同时满足“免费/公开、无需个别授权、广覆盖、最新现役阵容、球员级能力统计、允许 LangGraph 自动抓取并把证据交给模型、可公开作品集展示”的单一数据源。**Opta 的数据接入需要联系销售并按企业级方案；Hudl Wyscout Data API 也采用 demo/销售接洽，公开页面没有列价格或作品集再发布许可，因此不符合本轮筛选条件。[Opta 数据与接入说明](https://www.statsperform.com/faqs/stats-perform-faqs-opta-brand-data-products/) · [Hudl Wyscout Data API](https://www.hudl.com/products/wyscout/data-api)

**最接近可落地单源的是 Sportmonks 免费 API，但其免费范围仅为丹麦 Superliga 和苏格兰 Premiership。**它有当前球队阵容、球员档案、逐场与赛季统计，标准比赛数据延迟由 Sportmonks 自述平均约 15 秒，数据能用于自建 app 并在产品内展示/缓存；但它不是赛事官方权利方，也不承诺数据始终完整准确。这个免费档可做一个受限的“实时、真实数据链路”作品集演示，无法覆盖用户举例的拜仁/巴萨，也不能包装成全球转会球员池。[免费计划与联赛范围](https://www.sportmonks.com/football-api/free-plan/) · [数据使用说明](https://www.sportmonks.com/integrity-support/) · [标准条款](https://www.sportmonks.com/terms-of-service/)

如果“只用公开开放、不要付费/单独授权”是硬约束，建议**只保留一个来源**，然后明确取舍：要当前数据就选 Sportmonks free 并把检索限于两项可用联赛；要覆盖更多历史比赛并展示战术事件派生指标就选 StatsBomb Open Data，但把产品标成历史研究/演示，不声称在做当代引援。不能用公开网站的可见页面等同于允许自动抓取、存档或送入 LLM。

## 候选源核对

| 候选源 | 当前阵容与球员表现 | 覆盖/更新 | 自动化与公开展示 | 单源判断 |
| --- | --- | --- | --- | --- |
| **Sportmonks（免费 API key）** | 官方列出球队 squad、球员 profile 和按比赛/赛季统计；球员级字段包括分钟、触球、传球与准确率、前场三区传球、盘带、对抗、空中球、解围、抢断、射门、进球、助攻和比赛评分。xG、Pressure Index 属额外指标/附加产品，不能假设免费层有。[球员统计 API](https://www.sportmonks.com/football-api/football-stats-api/) | 免费足球计划明确只含 Danish Superliga 与 Scottish Premiership。全站宣称 2,200+ 联赛，但收费套餐才可选择 5/30/120 个联赛或企业全量；不能把总目录误作免费覆盖。联赛间指标深度不同。实时比赛事件平均约 15 秒到 API；`players/latest` 表示过去两小时有更新的球员记录，不是球员全部字段或赛季统计的逐项新鲜度 SLA。其 FAQ 明说不公布赛后数据结算时限；条款不保证完整、准确或随时可用。[免费范围](https://www.sportmonks.com/football-api/free-plan/) · [套餐](https://www.sportmonks.com/football-api/plans-pricing/) · [球员 latest endpoint](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/players) · [时效与质量边界](https://www.sportmonks.com/integrity-support/) | 官方免费计划即时发 key、免信用卡、无到期日；公开条款/合规页允许基于数据构建 app、在自有产品展示和缓存；原始 feed 转售需书面许可。Sportmonks 明说**不代表联赛/赛事持有官方数据权**；球员照片、队标使用者须自行处理权利。无需另买或申请个别合同才能试用，但目标联赛超出 free 档。[服务条款](https://www.sportmonks.com/terms-of-service/) · [权利 FAQ](https://www.sportmonks.com/integrity-support/) | **唯一贴近“现役+表现+公开 app 使用”的免费单源 API，但当前覆盖不满足拜仁/巴萨等目标。**若愿意限定演示联赛，可作为真实在线源；否则不能满足范围。 |
| **StatsBomb Open Data（公开静态数据）** | 有比赛 lineup、球员身份与事件数据，可程序派生传球、推进、射门等历史表现证据；不是现役 roster、合同或转会市场数据库。[官方仓库](https://github.com/hudl/open-data) | 官方仓库只开放“certain leagues”，具体赛事与赛季见 `competitions.json`；event、lineup 数据逐场存放，360 也只有选定比赛。仓库未承诺跟随当前赛季持续更新，因此不应称最新现役数据。 | 发布者为研究与足球分析公开数据，要求发布衍生分析时标明 StatsBomb 并使用其 logo。静态公共仓库易于本地处理，无 API key/付费。具体再分发应按仓库附带许可及其声明执行。 | **最适合合规展示 LangGraph + 可解释战术指标，但只能做有时间边界的历史球探分析。**不能回答“今天谁是拜仁可买的替代者”。 |
| **FBref（公开网页）** | 覆盖比赛与赛季表现统计，公开页面无需购买即可浏览。 | Sports Reference 首页自述超 100 项赛事、10 万名球员并每日更新；但其使用条款声明不承诺内容完整、及时或准确，也保留随时改动/停止内容的权利。[首页说明](https://static.fbref.com/) · [服务条款](https://static.fbref.com/termsofuse.html) | 其条款明确禁止把站内内容（含统计）用于 AI 模型的 prompting/instructing，也限制会影响服务的自动访问以及建立竞争/实质替代数据库。因此，即使页面无需登录或付费，也不适合把抓取结果放进 TactiScout 的 LLM 上下文。 | **表面上最接近“大而全且日更”的网页数据，但不符合 agent 自动取数与模型分析用途；不能推荐爬取集成。** |
| **FotMob（公开网页）** | 提供足球赛况及球员页面；本次不据其网页推断所有比赛均有同等统计。 | 公共 `robots.txt` 对一般爬虫开放普通页面路径，但明确禁止访问 `/api/*`；其 Terms 另写明自动服务（robot/crawler/indexing 等）与系统性/定期使用不允许。[robots.txt](https://www.fotmob.com/robots.txt) · [Terms](https://www.fotmob.com/terms) | 不可将公开页面当成许可自动采集的数据接口；不要改用被 robots 排除的 API 路径。 | **排除自动抓取。** |
| **Transfermarkt（公开网页）** | 有球员、俱乐部效力与估值页面；本轮不把其估值当作球员能力统计，也没有把它当已验证的官方当前阵容。 | 页面可浏览；未找到可供无授权自动化使用、保证及时性的开放数据 feed。 | 官方 Terms 明确禁止用 bots、spiders、screen scraping 或其他自动流程访问/复制数字内容，并禁止相关 AI 系统训练/开发用途。[Terms](https://www.transfermarkt.com/intern/anb) | **排除抓取。** |
| **SofaScore（公开网页）** | 有比赛与球员表现页面，可作人工对照。 | 可见的页面不构成完整或时间保证。 | Terms 禁止未经明确同意抓取、聚合、复制内容；数据库权利条款限制抽取或公开提供数据库内容/其重要部分。[Terms](https://www.sofascore.com/de/terms-and-conditions) | **排除自动抓取。** |
| **API-Football（免费 key）** | 官方 endpoint 有 squads、球员统计、转会等，技术上接近单一通用 provider。 | 官方介绍覆盖 1,200+ competitions；但具体赛季/统计数据可用性按竞赛变化，免费 quota 是 100 次/日，且 free plan 对可用赛季有局限。[端点与覆盖说明](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [价格](https://www.api-football.com/pricing/) | 条款写明 API-Football **不授予**将数据发布到 app、网站或其他产品的许可；用户需自行向有权机关取得发布许可。免费 key 不等于作品集展示授权。[Terms](https://www.api-football.com/terms) | **不符合“无需另行许可 + 可公开作品集”的硬条件，排除。** |

## 对当前项目的单源建议

1. **先决定作品集允许的真实范围，而不是再加来源。** 若免费是真硬约束，Sportmonks free 只能把当前在线目标设为丹麦/苏格兰；新用户请求其他联赛时，Agent 应解释该 provider 覆盖不足并询问是否改目标/转历史分析，不能返回 demo 假装是真实候选。
2. **若必须演示拜仁、巴萨和近期转会候选，公开、免费、无人为授权环节的单一来源目前没有查到可推荐项。** 不能靠高频爬 FBref/FotMob/Transfermarkt/SofaScore 补齐，因为官方访问/AI 条款对这类处理有限制；也不能把 API-Football 免费 token 等同数据发布权。
3. **若选 StatsBomb Open Data，产品定位切成“基于公开比赛事件的历史候选分析研究”。** 在 UI 和报告同时显示赛事/赛季、样本分钟、可用字段、指标派生公式与数据日期；球员历史球队不能冒充现役俱乐部，输出不可宣称当代可签约名单。
4. **“权威”一词须谨慎。** Sportmonks 自称数据服务提供方且明确说不持有赛事官方权利；StatsBomb Open Data 是发布方开放的指定比赛资料；FBref 等网页是第三方统计展示。项目可说“单一数据提供方/单一数据集”，不说“全球官方完整名单”，除非来源对具体赛事明确给出权利、覆盖和质量承诺。

## 参考的一手资料

- Sportmonks：[免费计划](https://www.sportmonks.com/football-api/free-plan/) · [覆盖说明](https://www.sportmonks.com/football-api/coverage/) · [球员统计 API](https://www.sportmonks.com/football-api/football-stats-api/) · [Player latest](https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/players) · [套餐/价格](https://www.sportmonks.com/football-api/plans-pricing/) · [服务条款](https://www.sportmonks.com/terms-of-service/) · [数据来源、权利及用途说明](https://www.sportmonks.com/integrity-support/)
- StatsBomb：[Open Data 官方仓库与发布说明](https://github.com/hudl/open-data)
- Sports Reference/FBref：[首页覆盖声明](https://static.fbref.com/) · [Terms](https://static.fbref.com/termsofuse.html)
- FotMob：[robots.txt](https://www.fotmob.com/robots.txt) · [Terms of use](https://www.fotmob.com/terms)
- Transfermarkt：[Terms of Use](https://www.transfermarkt.com/intern/anb)
- SofaScore：[Terms & Conditions](https://www.sofascore.com/de/terms-and-conditions)
- API-Football：[价格与免费额度](https://www.api-football.com/pricing/) · [服务条款](https://www.api-football.com/terms)
- 商业基准（不纳入推荐）：[Stats Perform Opta 产品/数据接入 FAQ](https://www.statsperform.com/faqs/stats-perform-faqs-opta-brand-data-products/) · [Hudl Wyscout Data API](https://www.hudl.com/products/wyscout/data-api)
