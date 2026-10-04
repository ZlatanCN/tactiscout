# Wikidata：球队成员关系作为补充上下文

核查日期：2026-10-04。只核对 Wikidata / Wikimedia 官方模型文档、政策和查询服务说明，以及 CC0 原文。此调查评估只读集成，不下载数据或编辑 Wikidata。

## 结论

**GO：可做低频、只读的 LangGraph 查询工具或“Wikidata 列出的球队关联”上下文面板。NO-GO：不可将它称作权威现役 roster、作为球员发现的唯一依据，或用于候选能力评分。** Wikidata 无需用户 key，实体 ID、跨语言名称、引用和 `member of sports team (P54)` 关系有助于构建来源可追溯的补充信息；结构化数据按 CC0 公开。但 P54 明确同时涵盖“现在或曾经代表”的球队关系，记录可能没有时间限定；社区数据没有完整性/准确性保证，公开 SPARQL 服务有严格负载约束。UI 应显示“Wikidata 记录的球队关联”，且附来源/时间；若没有明确近期来源，就不能断言“当前效力”。[数据许可与获取](https://www.wikidata.org/wiki/Help:Data_access) · [P54 定义](https://www.wikidata.org/wiki/Property:P54) · [一般免责声明](https://www.wikidata.org/wiki/Wikidata:General_disclaimer)

## 如何判定“当前”球队

`P54` 的定义是球员“代表或曾代表”的队/俱乐部，因此只用普通三元组 `player wdt:P54 team` 会丢掉 qualifiers 和 references，不能区分历史与当前。完整读取 statement 节点及以下元数据：

- `start time (P580)`：关系开始时间；`end time (P582)`：关系结束时间。Wikidata 的运动项目建模建议 P54 可用这两项表达时间区间。[P54](https://www.wikidata.org/wiki/Property:P54) · [P580](https://www.wikidata.org/wiki/Property:P580) · [P582](https://www.wikidata.org/wiki/Property:P582) · [Wikidata Sports 项目指南](https://www.wikidata.org/wiki/Wikidata:WikiProject_Sports/en)
- statement rank：`deprecated` 必须排除；`preferred` 是社区认为最当前/最符合共识的值；`normal` 是默认值，对准确性和时效没有判断。单独一条 statement 通常仍是 normal，所以“没有 end time”或“查询只返回一条”都不能证明现役。[Rank 说明](https://www.wikidata.org/wiki/Help:Ranking)
- references：尽量读取来源 URL/出版或检索日期，并把 Wikidata item 链接、rank、起止日期、来源和本次查询时间一并返回。Wikidata 说明 statements 与 qualifiers/references/ranks 一起表达数据；存在值不代表所有同类值都已收录。[Statements](https://www.wikidata.org/wiki/Help:Statements) · [数据完整性说明](https://www.wikidata.org/wiki/Wikidata:Glossary/en)

建议的使用规则：只把未被 deprecated、未结束且起始时间不在未来的 statement 当作**可能的当前关联**；若 rank 是 preferred 且 reference 足够新，面板可更醒目地展示，但仍用“Wikidata 记录”表述。若是 normal、没有日期/引用或证据已经过时，降级为历史/未确认关联，不能纳入“当前阵容”筛选。`position played on team / speciality (P413)` 可作为可选位置上下文，同样要按来源和时效呈现。[P54 允许 qualifiers](https://www.wikidata.org/wiki/Property:P54) · [P413](https://www.wikidata.org/wiki/Property:P413)

## 接口、负载与数据新鲜度

- 对已知球队 QID，通过公开 WDQS 的 `https://query.wikidata.org/sparql` 用 SPARQL 反查 statement，例如 `?player p:P54 ?statement . ?statement ps:P54 wd:Q… ; wikibase:rank ?rank .`，再读取 `pq:P580`、`pq:P582` 和 `prov:wasDerivedFrom` 引用节点。小查询可 GET，大查询 POST；以 `Accept: application/sparql-results+json` 取 JSON。无注册/key 要求。先用 Wikidata 搜索确认球队实体；官方明确不应以 WDQS 做文本/模糊搜索（例如大范围 `FILTER(REGEX(...))`）。[WDQS 获取指南](https://www.wikidata.org/wiki/Help:Data_access) · [查询服务手册](https://www.mediawiki.org/wiki/Wikidata_query_service/User_Manual)
- WDQS 当前文档限制：单查询硬超时 60 秒；按 User-Agent + IP 每 60 秒最多 60 秒处理时间；每客户端每分钟 30 个错误查询；目前每 IP 最多 5 个并发查询；过限会 429，须遵守 `Retry-After`。查询服务维护文档明确说流量和性能有波动。[WDQS limits](https://www.mediawiki.org/wiki/Wikidata_query_service/User_Manual) · [WDQS operation notes](https://www.mediawiki.org/wiki/Wikidata_query_service/Implementation)
- WDQS 数据更新异步；官方运维说明最多 6 小时滞后属正常，超过 12 小时才算服务问题。这是索引同步说明，不是球队事实的更新承诺。没有目标球员/联赛 roster 覆盖保证、事实核验 SLA，也不保证条目齐全；Wikidata 的 disclaimer 说明内容未经一致专家审查，可能不准确或不完整。[WDQS lag](https://www.mediawiki.org/wiki/Wikidata_query_service/Implementation) · [Wikidata disclaimer](https://www.wikidata.org/wiki/Wikidata:General_disclaimer)
- WDQS 与 Wikibase API/Linked Data Interface 被列为稳定接口，意味着 API 格式有变更通知政策，不代表数据值稳定、正确或完整。[Stable Interface Policy](https://www.wikidata.org/wiki/Wikidata:Stable_Interface_Policy)

因此，适合“用户点开目标球队后低频查询一次”的小结果集；不适合每轮 agent 推理都重复扫全库、批量抓全部球员、用复杂模糊 SPARQL 搜索，或将服务可用性作为 agent 成功的前提。给客户端设置明确 User-Agent、限制球队/返回人数、使用缓存减少重复查询；缓存策略属于应用架构，不应把 WDQS 更新延迟误报为数据的实际更新时间。

## CC0、隐私与 AI

Wikidata 的结构化数据以 CC0 释放，可免费复制、修改、商用且无署名要求；官方鼓励标出数据来源。CC0 不授予肖像/隐私或商标权。[Wikidata licensing](https://www.wikidata.org/wiki/Wikidata:Licensing) · [Data access / attribution](https://www.wikidata.org/wiki/Help:Data_access) · [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/)

所查 Wikidata 再利用和 WDQS 文档没有 AI/LLM 专属限制；CC0 的广泛数据复用权并不等于对所有个人数据用途的豁免。Wikidata living people 政策要求对在世者保持谨慎：有争议或可能被质疑的信息应有可靠公开来源，尊重隐私、不提供非广泛公开的信息。P54、位置等公开职业关联可用于短小的上下文展示；不应扩展抓取地址、私人联系方式等信息，也不应让模型把未经核实的关系写成事实。[在世人士政策](https://www.wikidata.org/wiki/Wikidata:LP) · [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/)

建议把结构化最小证据对象（球员 QID、队伍 QID、rank、日期、引用 URL、取数时间）交给本地模型做措辞/解释；LangGraph tool 返回数据事实和 provenance，由 reviewer 拦截缺少日期或来源的“现役”断言。没有必要将整个人物条目或图片送进模型。此建议是数据最小化措施，不代表 AI 专属授权已由 Wikidata 提供。

## 与 TheSportsDB 的取舍

| | Wikidata | TheSportsDB |
| --- | --- | --- |
| 更适合 | 多语言实体 ID、可追溯关系、补充背景 | 专门的 team/player 搜索与单队 roster API |
| 许可/访问 | CC0、公开查询无 key；需要遵守 WDQS 限速 | 免费 key `123`；条款允许 API 内容复制/修改，但免费用在 development projects，app-store 发布要付费；公开 hosted demo 边界不清 |
| 主要风险 | P54 可能历史/无日期，数据覆盖/更新无 roster 保证，WDQS 易超限 | 免费球队搜索仅限 Arsenal，roster Free Limit 10，且会员/图片条款边界需分别处理 |
| 项目定位 | **低频辅助证据**；永不单独判定现役 | **可选 roster 查询适配器**；需先验证目标球队与许可 |

TheSportsDB 的端点、限额、条款细节见[前一份官方资料调查](thesportsdb-roster-identity-enrichment-2026-10.md)。两者都不能代替 Sportmonks/Wyscout 等有赛季统计的数据源，也都不应单独决定球探排名。

## 决策

**接受只读面板 / LangGraph enrichment tool 的小范围原型**：以 QID 查询 P54，完整保留 statement qualifiers、rank、references，默认展示“Wikidata 记录的球队关联”，并支持未命中/无来源/旧日期时清楚降级。不把输出映射成强制 roster，也不参加打分。若产品要求无条件输出“当前阵容”，本源对该需求是 **NO-GO**。
