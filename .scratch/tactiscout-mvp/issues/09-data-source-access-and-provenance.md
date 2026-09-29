# 研究足球数据源与联网访问边界

Type: research
Status: resolved
Labels: wayfinder:research

## Question

当前 Agent 是否在线查询足球信息？能否抓取球探网站、报告或 Football Manager 数据？

## Answer

当前 LangGraph 工具循环只查询本地 StatsBomb 或演示数据；OpenAI-compatible API 只用于模型规划，不自动提供网页搜索或足球数据权限。StatsBomb Open Data 可用于有来源标注的 MVP 研究/分析；需要更多或更新比赛数据时，StatsBomb 与 Hudl Wyscout 有授权 API 产品。Transfermarkt 明确禁止自动抓取及 AI 用途，FBref 条款也限制 AI prompt 等用法；Sports Interactive 的 Football Manager 数据供给许可适用于签约职业俱乐部的限定内部用途。球探报告逐站核验许可，不能把浏览器可读等同于允许批量抓取/RAG。

推荐先做来源登记表与证据 provenance，再分别增加获准的数据 provider 和有来源白名单的报告发现工具。完整调查见[数据源、网页检索与抓取边界](../research/football-data-sources-and-crawling.md)。

## Comments
