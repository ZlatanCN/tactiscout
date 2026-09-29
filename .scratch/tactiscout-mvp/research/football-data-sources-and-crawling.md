# TactiScout：足球数据源、网页检索与抓取边界

研究日期：2026-09-29。本文核对当前仓库实现及数据提供方的一手资料，为后续数据接入和联网检索定范围；不是法律意见。

## 结论

**当前 Agent 没有联网搜索足球内容，也没有从外部服务拉取球员数据。**它有 LangGraph 的多轮工具决策循环，但工具只在当前选定的本地球员仓库里调查、筛选和计算。配置 OpenAI 兼容模型 API 只会让规划器请求模型，不会自动让模型获得网页搜索或 Wyscout、StatsBomb 等数据权限。

球探网站、报告和 Football Manager 的方法值得参考；具体内容不能一概而论地抓取。建议按这个顺序推进：

1. 继续使用有明确使用条件的 StatsBomb Open Data，保留来源与赛事/赛季边界。
2. 如果要更广、更新的专业数据，走 StatsBomb 或 Hudl Wyscout 的授权 API，而非仿浏览器爬取。
3. 对公开球探文章做受限的来源发现与引用，逐站核对条款；未经许可不批量抓全文、建语料库或把受限内容塞进 LLM prompt/RAG。
4. 把 Football Manager 当作角色建模和交互设计参考；不要提取游戏数据库供 TactiScout 使用。SI 确有数据供给许可，但公布的条款把收件方和用途限定在签约的职业俱乐部内部分析。

## 当前仓库做了什么

- `src/agent/conversation.ts` 中的模型规划器向 OpenAI 兼容接口发送对话和工具结果，模型可在 `inspect_team`、`search_candidates`、`evaluate_candidates`、`ask_user`、`finish` 等动作间决策。
- 这些数据动作最终调用 `PlayerRepository.loadPlayers()`；它们是在现有数据上做球队样本检查、候选筛选和指标评估，不会访问互联网。
- `src/data/provider.ts` 的 `StatsBombRepository` 读取本机 `data/statsbomb-open-data` JSON；也可用 `TACTISCOUT_STATSBOMB_DIR` 指向另一份本地目录。未选择 StatsBomb 模式时使用项目里的虚构演示 JSON。
- 本次检查的工作区没有 `data/statsbomb-open-data` 目录，因此目前仓库没有附带 StatsBomb 原始数据；默认仓库仍可使用演示数据。选择 StatsBomb 模式前需先准备相应本地文件。
- `web/src/api.ts` 中的 `fetch()` 是浏览器请求本项目自己的 Fastify API，不是第三方足球站点搜索。

因此，已有的是**Agent 调用本地领域工具的 harness**；尚未接入的是**网页搜索工具、在线足球数据 provider、外部球探报告检索**。

## 数据源调查

| 来源 | 官方材料确认的能力/条件 | 对 TactiScout 的建议 |
| --- | --- | --- |
| StatsBomb Open Data | Hudl 维护的公开仓库提供选定赛事和赛季的 JSON 比赛、阵容、事件及部分 360 数据，定位为公开研究和足球分析用途；发布分析时需注明 StatsBomb 并使用其 logo。[仓库 README](https://github.com/hudl/open-data/blob/master/README.md)；[数据使用协议](https://github.com/hudl/open-data/blob/master/LICENSE.pdf) | 适合 MVP 的可复现比赛表现数据。仓库要求遵守 User Agreement；发布或商业化前核对完整许可，不能把“开放”理解为任意再发布。当前项目 adapter 只读本地文件。 |
| StatsBomb Live/商业 API | 官方开发指南说明可通过 GraphQL 查询当前或客户获准访问的历史比赛、球员/球队统计和事件；访问需要客户凭据，使用范围需与销售或客户成功团队讨论并许可。[官方 API 指南](https://live-data-api-guide.statsbomb.com/) | 如要更广或更新的专业数据，申请许可后新增 provider adapter。它不是 LLM API 的附赠能力。 |
| Hudl Wyscout Data | 官方产品页列出球员/球队基础指标、超过 150 项 Stats Pack 指标、逐事件 Events Pack，并提供 API 集成；有正式 API 文档和认证流程。[官方产品页](https://www.wyscout-apps.hudl.com/products/wyscout/data-api)；[API 文档](https://apidocs.wyscout.com/index.html) | 是与专业招募场景贴合的候选商业来源；先确认价格、联赛覆盖、API、缓存/保留、展示及 AI 使用范围，再决定是否接入。 |
| SkillCorner Open Data | 官方仓库提供少量比赛的 tracking、事件和赛季汇总样本，适合验证数据结构与空间指标处理。[官方仓库](https://github.com/SkillCorner/opendata) | 可作为小型补充原型；样本很有限，仓库许可证不能自动代表数据可商用或再分发，需先核实数据许可。 |
| Transfermarkt | 当前官方条款禁止通过 bots、spiders、screen scraping 或其他自动流程访问/复制数字内容，也禁止使用站点内容训练或开发 AI 系统；条款还注明保留文本与数据挖掘权利。[Transfermarkt Terms of Use](https://www.transfermarkt.com/intern/anb) | 将自动抓取、将其内容塞入 Agent prompt/RAG 的方案列为不可用，除非获得明确书面授权。不要以“只取身价”或“只抓公开页面”为由绕过条款。 |
| FBref / Sports Reference | 官方条款限制在未经书面许可时、会不利影响站点性能/访问的自动化访问；同时禁止建竞争/替代数据服务，也明确禁止将站点统计、数据或文本用于 AI prompt、训练、微调或指令。[官方条款](https://static.fbref.com/termsofuse.html)；[数据使用说明](https://www.sports-reference.com/data_use.html) | 本项目要把数据用于 AI 规划和球员推荐，先按不可接入处理；若考虑使用，先向权利方询问书面许可及允许方式。仅增加来源引用不能覆盖这些用途限制。 |
| Football Manager / Sports Interactive 数据 | SI 隐私说明确认数据库包含真实职业球员的多类资料和主观技术/心理/身体属性评级，但也称不保证评级准确。[SI 专业人士隐私说明](https://www.sports-interactive.com/privacy-policy-professionals)；SI 数据供给条款要求订单/费用，收件方是职业俱乐部，许可用途是俱乐部自身内部的技术分析/球探评估，并限制向第三方披露。[SI 数据供给许可条款](https://cdn.sports-interactive.com/site/2024-11/SI%20-%20FMDB%20Portal%20-%20Data%20Supply%20License%20Terms%20-%2015%20November%202024%20-%20JC%20%28FINAL%29.pdf) | 可以借鉴“按角色、比赛阶段和能力属性组织评估”的产品思路；不要复制官方职责目录/评分权重，也不要提取游戏数据库用于公开作品。供职业俱乐部的许可不等于给个人作品的公开数据授权。 |

### 球探报告与长篇文章

比赛数据表、球员报告和网站文章是不同的数据形态。即使文章可以在浏览器打开，也不表示可以批量抓全文、永久保存、向模型发送或再分发。每个站点应单独核对服务条款、许可和自动访问规则。可行的产品方向是：允许 Agent 在经许可的来源范围里发现相关报告，保存 URL、标题、作者/机构、发布日期/访问日期和许可状态；在报告中提供来源链接，并将观察、原文事实、模型推断分别标记。取得许可之前，不把整个网站当作可供 RAG 的语料库。

## 推荐的接入设计

1. **建立来源登记表**：每个 provider 记录数据类型、覆盖赛事/赛季、更新频率、权利/许可、允许的用途、缓存期限、展示/署名要求和来源 URL。未经核验的来源默认不进入自动工具白名单。
2. **保持结构化数据与报告检索分开**：球员表现数值走窄接口 `PlayerRepository` / provider adapter，由确定性代码归一和计算；联网报告发现另设 search/fetch 工具，只返回获准访问的摘要与出处，不让任意网页结果直接充当事实数据库。
3. **保留证据出处**：每项结果记录来源、球员/球队标识、比赛/赛季或报告日期、查询/获取时间、原始值和派生指标；页面内容与 Agent 推断分开呈现。对来源覆盖不足或实体匹配不确定的情况，Agent 应能继续调查或追问用户。
4. **由 LangGraph 编排**：图可以先检查已有证据，若缺的是表现统计就调对应数据 provider；若缺的是外部背景就调用允许的报告检索；再校验来源和时间、补查或向用户追问，最后生成带引用的报告。LangGraph 负责状态、分支、暂停/恢复和回环；它本身不会创建联网权限，也不替代数据许可。
5. **MVP 的下一步**：先完善数据 provenance/source registry，并把已有 StatsBomb 本地数据同步路径与版本标注做好；随后实现有边界的在线来源发现工具（接合适的搜索 API 或授权 provider）。等确定数据许可之后，再加具体抓取/缓存，不先造通用任意网站爬虫。

## 来源

- [Hudl StatsBomb Open Data README](https://github.com/hudl/open-data/blob/master/README.md)
- [StatsBomb：Copa América 2024 free data release](https://blogarchive.statsbomb.com/news/statsbomb-release-free-copa-america-2024-data/)
- [Hudl StatsBomb Live Analysis Platform Guide](https://live-data-api-guide.statsbomb.com/)
- [Hudl Wyscout Data API](https://www.wyscout-apps.hudl.com/products/wyscout/data-api)
- [Wyscout API documentation](https://apidocs.wyscout.com/index.html)
- [SkillCorner Open Data](https://github.com/SkillCorner/opendata)
- [Transfermarkt Terms of Use](https://www.transfermarkt.com/intern/anb)
- [Sports Reference Terms of Use](https://static.fbref.com/termsofuse.html)
- [Sports Reference data use](https://www.sports-reference.com/data_use.html)
- [Sports Interactive Professional Privacy Policy](https://www.sports-interactive.com/privacy-policy-professionals)
- [Sports Interactive FM Data Supply Terms](https://cdn.sports-interactive.com/site/2024-11/SI%20-%20FMDB%20Portal%20-%20Data%20Supply%20License%20Terms%20-%2015%20November%202024%20-%20JC%20%28FINAL%29.pdf)
