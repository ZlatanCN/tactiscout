# TactiScout 当前球员数据源与自建路径复核

**核验日期：2026-10-04。** 目的：复核现有来源选型在用户允许扩大数据源后的新价值，重点看当前/近期球员发现、身份与当前球队、球员级表现和球探证据。仅使用来源所有方的官方文档、API、条款、官方仓库或正式发布数据。本文不是法律意见。

## 结论

目前仍没有一个来源同时做到：覆盖主要联赛的现役球员、提供可复算的细粒度战术表现、低成本/免费、持续更新，并明确允许公开作品集展示和送入 LLM。**没有找到比现有候选更好的单一主源；但现在可以把候选拆成三个可验证的数据层，不必继续假设一个“大而全”数据源：**

1. **当前球员发现与近期表现信号：PlayerElo 值得优先做小规模验证。** 提供商称其覆盖 176 项赛事、每天更新、约 7.8–7.9 万球员；有球员名搜索、当前球队/联赛、出场和分钟、球员 Elo/EAR、历史与 style/per-90 档案。免费级别只有每月 500 次请求、10 次/分钟，明确定位为 evaluation/hobby。它提供的是供应商模型派生的综合信号，不是可复算的原始比赛事件；当前没有公开的完整 API 使用许可，不能先假定公开逐人展示、长期缓存或将响应送进 Ollama/远程 LLM 已获授权。[API access 与套餐](https://playerelo.football/api-access) · [字段与请求示例](https://playerelo.football/docs) · [数据 API 页面](https://playerelo.football/football-data-api)
2. **现役阵容和常规统计：仓库已有 Sportmonks adapter 仍是功能最接近主链路的 provider。** 官网现列 €29/月起、可选 5 个联赛；可提供赛季 squad、出场分钟及球员比赛统计。免费档仍只有丹麦 Superliga 和苏格兰 Premiership，不能据“2,200+ 联赛”误以为免费覆盖拜仁/巴萨所在联赛。官网现有 provenance 页面说明数据来源混有自营 scout network 与合作方，并明确不宣称拥有赛事官方数据权；服务条款不保证完整性或准确性。公开条款允许在应用中使用和存储服务数据，但没有明文解决生成式 AI 的模型输入授权。[免费计划](https://www.sportmonks.com/football-api/free-plan/) · [套餐与价格](https://www.sportmonks.com/football-api/plans-pricing/) · [球员统计说明](https://www.sportmonks.com/football-api/football-stats-api/) · [数据来源与权利说明](https://www.sportmonks.com/integrity-support/) · [服务条款](https://www.sportmonks.com/terms-of-service/)
3. **跨来源身份：Reep 是当前最有用的自建身份底座。** 2026-10-03 release 提供 CC0 的 900 多万 provider-ID bridges、别名、redirects 与关系，可用 `(provider, namespace, external_id)` 作确定性映射。它没有球员 DOB；当前公开 release 尚无 squad/lineup 关系，也不含 provider 表现评分，因此不能用它确定“现在在哪队”或给球员打分。[release、字段及许可](https://reep.football/data/) · [coverage 与 provider roles](https://reep.football/coverage/)

**建议把 TactiScout 的“自建”落在采集验证、身份交叉表、指标公式、来源版本、质量/覆盖报告和第一方观察上。** 外部 provider 只作为带出处的原始事实或对照信号。下一实现切片推荐是 **PlayerElo 只读 evidence adapter + 一个目标联赛的脱敏覆盖评估**，而不是立即替换 Sportmonks 或将其总分当成 TactiScout 排名。该切片开始前需拿到用户自己的免费 key，并向提供方确认 hobby/portfolio 展示、缓存和模型输入边界；未拿到 key 前不要声称其 API 数据已经在本机跑通。

## 来源比较

| 来源 | 当前/近期能力及成本 | 用途边界与使用许可 | 实测状态与判断 |
| --- | --- | --- | --- |
| **PlayerElo** | API 的 `/v1/players` 可按名字搜索并分页返回 Elo 排名；球员详情示例含位置、当前球队/联赛、比赛数、总分钟、Elo 与不同时间窗 EAR；另列历史、趋势、style/per-90、联赛球员和俱乐部 squad endpoints。提供方称每日更新、覆盖 176 个赛事；`api-access` 页面写 78K+，单独的 Football Data API 页面写 79K+，故官方页面的覆盖数字本身不一致。Free：500 req/月、10 req/min，evaluation & hobby；Pro：€19/月、10,000 req/月并列为 production apps/dashboards；Business：€199/月且页面称提供 commercial licence + SLA。 | 可作候选发现与独立比较信号；Elo/EAR/style 是供应商自己的综合模型产物，尚未见逐事件原始证据和完整计算方法，不能冒充 TactiScout 自算指标。官方页面称付费计划支持商业使用，但未找到公开完整 API licence/terms，也没有明确给出模型输入、embedding、缓存 TTL、数据再发布的规则。API 页面列有招聘类端点和 AI MCP 内容，但“提供 MCP”不能等同授权把数据交给本项目 LLM。 | **未实测 API 响应**：未申请 key，未验证任一联赛的实际 roster、样本分钟、字段缺失或更新日期。值得以免费层做个人本地评估；若变成公开在线 demo，再据书面条款决定是否上 Pro。最终评分保留 TactiScout 自己的可复算维度。 |
| **Sportmonks** | 有球队与赛季 squad、球员 profile 和比赛/赛季球员统计；产品页列 63 种球员统计类型。免费计划明确是丹麦、苏格兰两联赛；Starter €29/月可选任意 5 联赛，适合覆盖 Bundesliga、La Liga 和其他选定联赛。 | 允许用服务数据构建应用，条款允许对服务数据存储/传输/分发，但禁止未经同意转售 feed；准确/完整不作保证，徽标/球员照片权利由使用方另核。新 provenance 页说明既有自营采集也有合作方数据，提供方不主张代表赛事拥有官方权利。没有明示 LLM 处理权。 | **未实测账户 API**：仓库已有 adapter，但当前环境没有可用 token / 计划 entitlements，本轮只查官方页面。最适合继续作为付费主链路候选；先确认真实账号覆盖、统计 type 和模型处理，不从广告上的总联赛数推断账户权限。 |
| **football-data.org** | 目前 free tier 为 12 项赛事的比分、赛程、表格，10 req/min，不含 squads；€29/月的 “Free + Deep Data” 列出 12 项赛事、阵容、首发/换人、进球者与牌。12 个免费赛事页面含 Bundesliga、La Liga、英超、意甲、法甲等。它能加强当前球队/阵容和基本进球事实，但没有 TactiScout 所需的通用个人能力统计。统计 add-on 另加 €15/月，主要是比赛层面的控球、射门、犯规、扑救等团队/比赛项。 | 要求 app/网站显著署名；API key 限于一个应用和域名；取消订阅后不得继续在自有网站/服务引用从 API 取得的赛程、结果、球员/阵容数据；图片版权需自理。没有准确度或服务可用性保证。 [价格](https://www.football-data.org/pricing) · [coverage](https://www.football-data.org/coverage) · [Team resource](https://docs.football-data.org/general/v4/team.html) · [政策](https://docs.football-data.org/general/v4/policies.html) · [注册条款](https://www.football-data.org/client/register) | **未实测 API**：API key 需要注册，本轮仅检视官网 schema、coverage、pricing、terms。若单纯要 €29 的 12 项大联赛 squad 种子，它是可比较的低成本 roster 源；但同价 Sportmonks 对 TactiScout 的球员统计更有用，且现有项目已有 adapter。因此不建议现在为它另写完整主 provider。 |
| **TheSportsDB** | 官方 V1 API 提供球队球员名单、球员档案、球员统计查询；免费限 30 req/min，多个 list/search endpoint 对结果数作限制；Single Developer $9/月可用完整 premium JSON、100 req/min。球员统计 endpoint 有返回限制，但官方没有稳定的字段字典/指标定义，也未给出覆盖或更新 SLA。 | About 页自述是 crowd-sourced 数据库。Terms 于 2026-09-17 更新：允许复制和修改官方 API endpoint 返回的内容，并明确禁止抓取其网站；免费 key 用于 development projects，付费可开发 apps/services 且需注明来源。图片/第三方 artwork 权利另算。没有明确 AI 输入/缓存条款。 [API 文档](https://www.thesportsdb.com/documentation) · [about](https://www.thesportsdb.com/docs_about) · [pricing](https://www.thesportsdb.com/docs_pricing) · [terms](https://www.thesportsdb.com/docs_terms_of_use.php) | **未实测 API payload**：API endpoint 通过当前研究浏览工具无法读取；核实的是文档和条款。可做低成本名单补充/人工核对，不作权威当前队籍、能力评分或转会预算事实。 |
| **Reep identity register** | 2026-10-03 的 weekly release：2,010,106 entities、9,033,344 bridges、681,540 aliases、2,022,274 relationship edges；全量 DuckDB 约 769 MB、CC0。关系目前包含 season、stage、team-season participation、affiliation、succession；squad/lineup edges 仍在 roadmap。提供方ID中 Sportmonks、StatsBomb、Wyscout、API-Football 等可按 namespace 连接；release 页面同时区分独立证据、bridge-only、Wikidata overlay。 | CC0 允许复制、改编、再发布；建议记录 release stamp 和来源，但署名为礼貌请求。API key 由人工发放；评估 key 有期限，production API 收费。即使 Reep 映射了上游 ID，也不会把被映射源的数据许可转成 CC0。 | **已实查当前官方 release/coverage 页面，未下载全量文件或执行 join。** 最值得加的是稳定 ID、alias、redirect 处理层；不能以其关系边证明当前球员效力。若采用 PlayerElo：供应方说明其球员 ID 与 API-Football 相同；Reep 有 API-Football 与 Wyscout ID bridge，可作为可能的历史/近期身份连接，但仍需实际匹配率 smoke。 |
| **Wikidata** | 主数据 CC0；P54“member of sports team”可有日期 qualifier，P413 可有位置事实。官方支持 entity API、WDQS 与 dump；WDQS 适合窄条件查询，不适合大规模实体导出或模糊搜索。 | 数据是社区编写，CC0 解决版权复用而不保证事实新鲜、完整或准确。使用需遵守 API 礼貌与节流规范。Wikidata MCP/向量功能适合查询探索，不会使球员身份关系变成可靠 roster feed。 [许可](https://www.wikidata.org/wiki/Wikidata:Licensing) · [访问方式与最佳实践](https://www.wikidata.org/wiki/Help:Data_access) · [P54](https://www.wikidata.org/wiki/Property:P54) · [P413](https://www.wikidata.org/wiki/Property:P413) | **未实测球员查询**：没有执行 SPARQL/entity lookup。保留作 QID/别名 crosswalk 候选，球队归属必须看来源、qualifier 日期并与 roster 证据核对；不作为候选池或表现数据。 |
| **OpenLigaDB** | 官方无 key API，可按赛事赛季取比赛、球队、联赛表、goal getters；限额 60 req/min/IP，页面建议以 last-change date 节制轮询。API schema 只支持赛程/赛果、球队基础信息和 goal scorer，不含完整球队球员名册、上场分钟和非进球个人表现。 | 官方 API 页面声明数据为 ODbL 1.0；若公开数据库衍生库需履行 ODbL share-alike 与来源通知，展示派生作品需注明来源。服务器公开说明“无配额”应与 schema 页面当前 60 req/min 限额同时理解，以更具体限额为准。 [API](https://api.openligadb.de/index.html) · [OpenAPI schema](https://api.openligadb.de/swagger/v1/swagger.json) · [ODbL](https://opendatacommons.org/licenses/odbl/1-0/) | **已实查官方 `getavailableleagues` 响应**：确认公开端点能返回赛事/赛季清单，且包含大量不同组织者录入的赛事。未实测球员/球队字段覆盖，也没有调用射手榜端点。可作德国比赛/进球事实辅助，不是球探主数据。 |
| **StatsBomb Open Data** | 官方仓库提供选定赛事/赛季的具名 lineup、比赛和细事件；数据结构足以派生射门质量、传球、推进等历史表现。官方赛事清单现有 2023/24 Bundesliga 与其他历史赛季，但不是 2024/25 或 2025/26 的主要联赛全季现役池。此前工作区核对的 Bundesliga 2023/24 matches 文件只有 34 场样本。 | 仓库定位研究/足球分析用途；发布分析需标 StatsBomb 并使用官方 logo。附带的 Public Data User Agreement 允许在约定范围研究分析，限制向外部/第三方提供数据及商业化数据或分析；不能因 GitHub 可下载就推断可公开部署或送 LLM。 [官方 README](https://github.com/hudl/open-data/blob/master/README.md) · [官方赛事清单](https://raw.githubusercontent.com/hudl/open-data/master/data/competitions.json) · [User Agreement](https://github.com/hudl/open-data/blob/master/LICENSE.pdf) | **已检查官方赛事清单和 2023/24 德甲样本范围；项目已有历史 shot-xG 字段研究。** 适合历史算法/证据 benchmark，不做当前主源。 |
| **Wyscout Pappalardo Figshare** | 作者/发布方发布 2017/18 五大联赛历史事件、比赛、球队、球员资料；事件包含球员 ID、位置、时间和事件 tag。不是当前阵容/合同/预算。 [Events item](https://figshare.com/articles/dataset/Events/7770599) · [Players item](https://figshare.com/articles/dataset/Players/7765196) · [数据论文](https://doi.org/10.1038/s41597-019-0247-7) | Figshare 数据项声明 CC BY 4.0，需署名、附许可链接并说明修改；这不授予肖像或其他独立权利。历史身份只能按当时解释。 | **已有本地真实文件及可运行自建快照**：先前管线核对上游五个压缩/JSON 文件的官方 MD5、体积并成功构建 2017/18 5 联赛快照（1,826 场、2,561 球员）。这是“自建采集与派生流程”实际证据，不是 live/current API 验证。 |

## 对既有候选结论的更新

- **Sportmonks：**免费联赛范围没有变化，仍是丹麦和苏格兰；€29/5 联赛官方定价明确。此前对数据 provenance 的说明现在可被官网专门的 integrity/support 页面补强：它说数据既有自营 scout network，也有合作方；不宣称持有官方赛事权利，且不保证处处完整准确。AI/LLM 权利仍未由公开 terms 解决。
- **TheSportsDB：**条款最近更新日期为 2026-09-17，现可直接确认 API endpoint 返回内容可复制/修改，同时明确禁止 scrape 网站；这使“只打 API、不爬页面”的原型边界更清楚。它仍然是 crowdsourced，而非 roster authoritative source。
- **Wikidata：**没有发现可替换当前阵容 API 的变化。它的 CC0 与可查询接口适合身份对照；community claims 与查询服务新鲜度不能直接等同球员事实新鲜度。
- **PlayerElo：**现在存在独立的 Football Data API 官方页面和更丰富的历史、趋势、style、squad、prospect/fit endpoint 说明；可以作为“近期球员信号”验证对象。产品页 78K/79K 球员数字不一致，且没看到公开 API licence；我们不能把原先“可免费试用”提升成“可免费公开部署/可直接喂模型”。
- **OpenLigaDB：**官方限额、ODbL 和端点边界已由 OpenAPI schema 直接核对；它还是比赛与进球人事实来源，不是球员能力资料库。
- **StatsBomb / Wyscout：**本轮官方资料没有推翻既有结论：StatsBomb 是选定的历史研究赛；Wyscout Figshare 是具名历史事件 benchmark。两者都不能证明当前效力或当前候选池。
- **新增对照 football-data.org：**该服务 Free tier 免费，但数据只有 fixture/results/table；€29 深度计划含 12 个比赛赛事的 squad/lineup/scorer。它是廉价阵容来源，不是球员战术能力源。其注册条款仍写明 2018 更新日期，官方要求署名，并限制取消后在用户网站继续引用数据；应把这个条款年代作为正式公开使用前的待问项。

## 下一实现切片

**推荐：单独给 PlayerElo 做只读、服务端、可关停的 evidence adapter spike。** 仅在拿到 key 后选一个官方文档中存在的当前联赛，先抽取有限球员，检查：

1. `/players` / league players 返回是否能在候选需要的方式内分页，player ID、position、current team/league、minutes、Elo/EAR 是否真实存在且不是 null；保存查询时间和原始 provider URL。
2. 抽几个球员调用 details/history/style，记录覆盖、时间跨度、字段定义以及对位置/出场分钟是否足以解释；不请求 `/fit` 或 `/squad-gaps` 代替 TactiScout 的分析。
3. 把 Elo、EAR、style 作为**供应商外部对照证据**并排展示；先不混进本项目总分。优先用 provider ID，若需要接回 2017/18 Wyscout 历史数据，再另测 Reep 的 `api_football` ↔ Wyscout bridge 命中率和歧义。
4. 现有免费配额是 500 次/月、10 次/分钟，足够小样本但不够随每个 prompt 全量扫 79K 玩家。合理架构是定期/手动同步许可允许的有限快照，Agent 查询本地索引；但先不要永久存 API 全量结果，直至缓存/保留许可明确。
5. 公开 demo 前向 PlayerElo 核实 hobby API 用于非商业作品集页面、个体 Elo/history/style 的展示与缓存、向本地 Ollama 发送字段是否允许；未回复时，将实测限于本地评估并在产品中关闭展示和 LLM 输入。

若用户暂不提供 PlayerElo key 或不想订阅：继续用 Wyscout 完成历史可复现分析和角色评分验证；Sportmonks provider 只保留为需要账号覆盖与许可核实后的上线候选。TheSportsDB、Wikidata 与 OpenLigaDB 不足以作为“第一份真正球员排名”的主数据。本项目第一方观察表可逐场产生 TactiScout 自己的定性战术证据，但不能冒充完整候选池。
