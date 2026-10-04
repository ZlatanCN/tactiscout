# TheSportsDB：阵容与身份补充源调查

核查日期：2026-10-04。只核对 TheSportsDB 官方 API 文档、官方条款/价格页及官方论坛中维护者答复。条款与覆盖可能变化；本文是工程选型记录，不是法律意见。

## 结论

**适合作为球员/球队名称、TheSportsDB provider ID、基础档案和单队阵容的可选补充源；不适合作为 TactiScout 的主候选池或能力评分数据源。** API 有球队/球员搜索、ID 查询和单队球员列表；但免费计划限制明显，站方没有在所查文档中承诺完整/实时阵容覆盖、球员表现字段定义或 ID 永久稳定。免费 API 条款面向开发项目；发布到 app store 必须是付费订阅者。公开托管的作品集网页是否落在免费“development projects”范围，条款没有说清，发布前应向站方确认。付费条款允许开发应用/服务并要求注明来源，但这并未明确授权将数据发送给外部 LLM；缓存期限与本地长期存储也没有明确规则。

因此建议先把它定位为**可关闭的 roster / identity enrichment adapter**：补充俱乐部、球员显示名、位置/档案字段和源 ID；不为缺失战术统计造值，不参与确定性评分。先以免费 key 做本机端点可达性与目标球队 roster 覆盖验证；若要公开 hosted demo，先确认订阅档位、结构化数据展示和 LLM 处理范围。 [API 文档](https://www.thesportsdb.com/documentation) · [服务条款](https://www.thesportsdb.com/docs_terms_of_use.php) · [价格页](https://www.thesportsdb.com/docs_pricing)

## 端点与认证

| 目的 | v1（免费和付费） | v2（仅付费） |
| --- | --- | --- |
| 按名称搜索球队 | `GET /api/v1/json/{key}/searchteams.php?t={team}` | `GET /api/v2/json/search/team/{team}` |
| 按名称搜索球员 | `GET /api/v1/json/{key}/searchplayers.php?p={player}` | `GET /api/v2/json/search/player/{player}` |
| 单队 roster | `GET /api/v1/json/{key}/lookup_all_players.php?id={idTeam}` | `GET /api/v2/json/list/players/{idTeam}` |
| 按 ID 取球队/球员 | `lookupteam.php?id={idTeam}` / `lookupplayer.php?id={idPlayer}` | `/lookup/team/{idTeam}` / `/lookup/player/{idPlayer}` |

v1 免费 key 是公开的 `123`，放在 URL 路径中；付费 key 也走 v1 URL。v2 要在 `X-API-KEY` header 提供付费 key。官方称 v2 是之后持续开发的版本。价格页当前列 Single Developer $9/月、Small Business $20/月；条款规定发布到 Apple App Store / Google Play 的应用必须订阅付费计划。 [v1/v2 认证与端点](https://www.thesportsdb.com/documentation) · [v2 API 参考](https://thedatadb.readme.io/reference/getteambyname) · [价格页](https://www.thesportsdb.com/docs_pricing) · [服务条款](https://www.thesportsdb.com/docs_terms_of_use.php)

## 免费限制与数据范围

- 总请求速率：Free 30 次/分钟，Premium 100 次/分钟，Business 120 次/分钟；超过后文档称会返回 HTTP 429，并需等一分钟。 [限速说明](https://www.thesportsdb.com/documentation)
- v1 还有逐端点的免费返回量限制：球员搜索 Free Limit 1（Premium 10）；球队搜索免费层明确只支持 `Arsenal`，完整球队搜索需升级；单队 roster Free Limit 10（Premium 3,000）。v2 搜索示例上限为 10，list team players 上限为 100，但 v2 需付费。文档没有在此说明这些额度之外的分页方案。 [v1 search/list](https://www.thesportsdb.com/documentation) · [v2 search/list](https://www.thesportsdb.com/documentation)
- 官方维护者说明 `lookup_all_players` 只列球员的 primary/first team；second/third team 不支持，维护者解释这些队伍信息经常变化且不保证及时。不能据此当作完整国家队/租借关系图。 [官方论坛维护者答复](https://www.thesportsdb.com/forum_topic.php?t=6008)
- 文档有 `lookupplayerstats` / v2 `lookup/player_stats`，但所核页面没有列明足球球员统计的字段定义、赛事/赛季覆盖、更新 SLA 或口径。未验证这些响应前，不应拿它支撑传球推进、压迫、夺回、预期进球等战术评分。项目应在 provider adapter 标明字段缺失，而不是补估。

## 使用权、缓存与模型处理

官方条款允许通过**官方 API endpoint**复制和修改其返回内容；禁止直接抓官网网页、移除版权/商标标记、转售 API，并要求使用者确保其允许访问 API 的第三方遵守条款。付费 API 可用于开发 apps/services，且必须标注 TheSportsDB 为数据来源。免费使用表述为“development projects”，明确禁止非付费用户把应用发布到 app store。条款没有明说公开网页 demo 是否属于免费开发项目，也没有规定 API 数据缓存 TTL、长期本地留存或导出原始响应的期限。保守实现应记录 provider、provider ID、取数时间和必要的非图片字段；公开部署或长期存档前，向官方邮箱确认。 [官方条款](https://www.thesportsdb.com/docs_terms_of_use.php)

所查条款中没有 AI、LLM、模型训练或 embedding 的专门条款；官方文档提供 MCP 规格只说明有 AI 工具接入接口，不等于授权任意数据用途。将数据传给第三方模型可能涉及条款的 third-party access 要求。先仅本地确定性处理；在确认前不把原始响应或图片交给云 LLM，不使用该数据训练/构建 RAG 索引。 [API 文档与 MCP 入口](https://www.thesportsdb.com/documentation) · [third-party access 条款](https://www.thesportsdb.com/docs_terms_of_use.php)

结构化数据与 artwork 要分开审查：条款说其原创 artwork 按具体 Creative Commons 许可，但不会替第三方照片、标志或其他素材授予权利；`strCreativeCommons` 只是状态标记，`No`、`Unknown` 或缺值不代表图片可公开使用。公开 demo 默认不显示 TheSportsDB 图片、俱乐部徽标或球员照片，除非逐图确认作者、来源和许可。 [图片授权条款](https://www.thesportsdb.com/docs_terms_of_use.php)

## ID 与集成建议

官方文档称搜索会返回实体 ID，后续可用唯一 ID 快速查询；没有发现 ID 永久不变、不重用或实体合并/删除策略的保证。将 ID 仅视为 `thesportsdb` namespace 下的 provider ID，不与 Sportmonks/Wyscout ID 直接等同；持久化匹配时保留匹配方式、原始查询名、时间戳与置信状态，姓名只能作为模糊检索线索，不能自动做跨源身份合并。 [官方 ID 说明](https://www.thesportsdb.com/documentation)

**接入顺序：**先做免费层只读 smoke，测 Bayern/Barcelona 等目标队能否搜索或是否已有稳定 ID、roster 返回数量/位置/当前队字段、球员搜索 free limit 实际响应；未通过则停在 team/player lookup 作为 UI/身份补充。若要依赖 roster 自动发现候选人或部署公开 demo，再确认付费档、联赛/赛季覆盖、字段更新频率、缓存/本地保留和 LLM 使用书面边界。该源单独无法完成战术候选排名。
