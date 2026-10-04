# API-Football 免费档：当前赛季本地 smoke 评估

**核验日期：2026-10-04。** 本文是现有足球数据源研究的补充，重点核验 API-Football / API-SPORTS 是否适合用免费 key 做单联赛本地链路验证。只采用服务方官方页面、文档和条款；没有使用 key 调用受限端点，也没有爬取网站。

## 结论

**API-Football 是当前最值得验证的一联赛候选源，但目前只能给“临时本地 smoke：条件性 GO”，不能作为公开作品集的默认数据源。** 它的 `/players` 包含球探 MVP 所需的一些常规统计，免费额度足够验证几页数据；然而服务方公开资料只说免费计划限可用赛季，没有列出免费账户当前究竟能访问哪些赛季。当前 2026/27 是否能用必须由注册后的账号计划和 `/leagues` 响应验证。服务方条款又明确表示 API 不授予在应用/网站中发布数据的许可，权利需用户向相关权利方取得；公开条款也没有说明将数据送入本地 Ollama 或长期保存的权限。

因此，适合做的是：用自己的单个免费 key，先确认一项目标联赛/赛季的 `players` 与 `statistics_players` coverage，再读取一页样本、检查字段和分页。只有在本机观察响应，不把响应提交仓库、不展示球员数据、不写入持久化数据库、不输入模型。若这几项验证通过，API 结构可以帮助打通 adapter 和 LangGraph 工具循环；后续要公开展示或落库前，先取得适用的发布/保留/模型处理许可。

## 官方资料确认了什么

| 项目 | 官方资料 | 对 TactiScout 的实际含义 |
|---|---|---|
| 免费额度与访问 | 免费计划 $0、100 次/日；无需信用卡。API-SPORTS 官方限流说明另列免费档 10 次/分钟。通过 dashboard 注册取得 `x-apisports-key`，所有端点都需认证。 [价格与免费计划](https://www.api-football.com/pricing/) · [限流说明](https://www.api-football.com/news/post/how-ratelimit-works) · [入门与认证](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) | 足够做一次限量单联赛 smoke，不够每次用户提问时扫描整联赛。官方示例说明英超注册球员可能超过 500 人，每页 20 人，即完整同步超过 25 次请求；全量分页会迅速消耗日配额。按需同步、集中缓存是官方建议，但配额之外的缓存权利仍不能据此推定。 |
| 赛事和赛季 | Coverage 页面称覆盖 1,247 项赛事，页面于 2026-10-03 更新，并明确实际覆盖会按赛季/比赛而变。[Coverage](https://www.api-football.com/coverage)。价格页说明免费档限制可用赛季；条款说免费计划的数据范围可变更且不保证完整。[价格](https://www.api-football.com/pricing/) · [条款](https://www.api-football.com/terms) | 覆盖目录列出英超、德甲等赛事，不等于免费账户可访问当季球员数据。公开页面没有逐项列明 2026/27 免费可用性。需要用注册账户查询 `/leagues?id=<league>&season=2026` 的赛季 coverage，并检查 `players`、`statistics_players` 标志；再试取一页球员响应。**当前赛季免费覆盖尚未证实。** |
| 球员资料与赛季统计 | 官方入门文档的 `/players?league&season` / `?team&season` 说明包含姓名、年龄、国籍、身高、体重、照片、伤病布尔值，以及出场、分钟、进球、助攻、射门、传球（关键传球和准确率）、抢断、盘带、犯规、黄红牌和点球数据；结果每页 20 人，统计按球员参加的赛事分别返回。[Players endpoint](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) | 能做身份/位置初筛和基本进攻、防守参与对比。公开字段列表没有 xG、推进传球/带球、压迫等核心高级指标，所以无法单靠它严谨评估复杂战术角色。官方文档未承诺 `/players` 赛季统计的固定更新时间；条款说文档中的更新频率仅供参考、不作保证。 |
| 当前阵容与单场数据 | `/players/squads?team=...` 返回当前球员 ID、姓名、年龄、号码、位置、照片，但不带赛季表现；`/fixtures/players?fixture=...` 则列出分钟、位置、0–10 评分、射门、进球/助攻、传球、抢断、拦截、对抗、盘带、犯规、牌和点球。单场统计直播中约每分钟更新。[当前 squad 与赛季球员端点](https://api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) · [单场球员表现字段](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide) | 适合 smoke 中分开验证“当前阵容身份”和“某赛季表现”。0–10 rating 是服务商给出的评分，不应当成 TactiScout 自己的可解释适配分。coverage 依赛事而异，实际是否有 player statistics 必须先查 coverage。 |
| 展示、保存和模型输入 | 条款称数据来自合作方，禁止转售；虽然可用服务建立应用/网站等项目，但服务方“不提供”在用户应用、网站或其他产品中使用和发布数据的许可，用户须向相关权利方申请必要授权，服务方也不授予赛事商业权利。[Terms: Service & data](https://www.api-football.com/terms) 条款没有明确授予长期本地保存或送入本地/远程 LLM 的权利；没有找到 Ollama/生成式 AI 专项条款。 | **对公开球员名单/统计/推荐依据为 NO-GO，除非取得发布许可。** 本地短时调试不等同于公开展示；但这不是明确的模型输入或长期缓存授权，故本 smoke 不应将原始响应交给模型或持久化。官方教程鼓励全联赛同步任务在后台执行并缓存，属于工程建议，不会消除条款里的权利缺口。 |

## 推荐的最小可验证步骤

1. 在官方 dashboard 以个人账户申请免费 key；不要共享 key，也不要尝试多账户绕配额。先看 `/status` 确认计划和剩余配额。
2. 只选一项联赛和 season `2026`。先查 `/leagues` 返回的当前赛季日期与 coverage：球员名单、赛季球员统计是否开放。官网通用 coverage 列表不能替代账户下的这个结果。
3. 如果 coverage 标志可用，调用一页 `/players?league=<id>&season=2026&page=1`，记录 `paging.total`、球员数、空值比例、实际返回的球队/联赛/stat block 和字段。不要自动拉完所有页；100 次/日的免费额度包含所有端点请求。
4. 只在本机内存查看样本以验证解析/身份映射，不把供应商原始行加进 repo、数据库、前端截图或 Ollama 提示词。保留不含球员数据的 smoke 记录（请求端点、season、响应状态、coverage 标志、时间和配额）。
5. 若免费计划没有 `season=2026`，或 `statistics_players=false`、响应空/字段不足，就停止该数据源的当前季 smoke；不要为了得到数据改抓网页或从其他限制入口绕过。

## 其他近期免费 API 的交叉检查

- **Big Balls Data** 声称提供免费足球端点和当季球员基础统计，但它的官方文档把数据源抽象成来源等级而不暴露具体上游；官方介绍称有多种上游及社区 scraper。其条款虽允许构建产品，公开页面没有清楚说明逐字段来源、缓存和本地模型输入权利。对要求审计证据的 TactiScout，不比 API-Football 更适合作为主源。[API 文档](https://bigballsdata.com/docs/introduction) · [产品说明](https://bigballsdata.com/about) · [条款](https://bigballsdata.com/legal/terms)
- **GOAL API** 提供球员资料和多类统计，但官方条款把数据描述为从第三方授权再分发，同时提醒用户仍需自行取得地区/用途所需的许可；免费档具体额度在公开价格页未能确认，且未找到本地缓存或模型输入授权。因此也不作为当前建议的公开主源。[文档](https://goal-api.com/documentation) · [条款](https://goal-api.com/terms) · [价格](https://goal-api.com/pricing)
- 现有研究已覆盖 PlayerElo、Sportmonks、StatsBomb/Wyscout、SkillCorner、OpenLigaDB 等；结论没有被本次官方资料推翻。它们的覆盖或数据用途边界见[近期数据源复核](recent-open-player-performance-data-2026-10.md)和[当前球员数据源复核](current-player-data-source-options-2026-10.md)。

## 最终判断

| 用途 | 决定 |
|---|---|
| 单个免费 key、本机、短时读取 1 页样本，以验证 API adapter / LangGraph 工具链 | **条件性 GO**：先核对账号中的当前赛季 coverage 和字段；只要其中任一项不通过即停止。 |
| 把 2026/27 当前球员池当成免费档已确认能力 | **NO-GO（尚未证实）**：官方公开资料没有列出免费可用的具体最新赛季。 |
| 将 API 响应写入本地数据库、喂给 Ollama，或把球员统计/证据发布到作品集网站 | **NO-GO，待授权**：公开条款没有给出足够明确的持久化/模型处理权利，并明确未提供公开发布许可。 |
| 作为 TactiScout 的默认且权威能力评估源 | **NO-GO**：仅列常规统计，缺少本项目需要的高级战术指标，且覆盖、时效和发布权均有限制。 |

若要继续技术验证，最小下一步是由用户用自己的免费 key 检查一项联赛的 2026 coverage 和首屏响应；在拿到许可前，代码可验证数据映射但不应把该源球员数据暴露到前端、持久化或输入模型。
