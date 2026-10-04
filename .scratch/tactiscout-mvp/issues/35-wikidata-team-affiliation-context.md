# Wikidata 球队关系背景

Type: task
Status: resolved
Labels: wontfix
Blocked by:

## Goal

让对话式招募案件可以按需读取 Wikidata 中目标球队的球员关联记录，为阵容讨论补充一份可追溯、明确标注不完整的背景材料。

## Scope

- 先通过 Wikidata 实体搜索解析用户提到的球队；只有输入与搜索返回的 label/alias 精确匹配时才自动选定实体。未命中或有多个精确匹配时把候选实体交给 LangGraph，由 Agent 向用户澄清，不能自行猜 QID。
- 使用 WDQS 查询该球队的 `member of sports team (P54)` statements；保留球员 QID、statement rank、起止日期、reference URL 与 reference 时间，并排除 deprecated statement。
- 设置明确的请求超时、低频串行请求、有限结果数和短时进程内缓存；429/超时/服务错误应成为可见的 unavailable 状态，不把失败说成没有球员。
- 把结果作为报告中的“Wikidata 记录的球队关联”独立附栏展示；记录查询时间、球队实体和球员实体来源链接、样本截断状态。
- Agent 可以使用这些记录作为待核对的背景线索，但不能据此断言当前阵容/现役效力、筛选候选、评估球员能力或改变推荐顺序。
- 本次不读取图片、地址、联系方式或无关个人资料；不把球员的性别、国籍、年龄等 Wikidata 字段交给模型。

## Acceptance criteria

- [ ] 新的 Wikidata 客户端提供单一的“按球队名称查关系背景”接口；网络、解析、缓存和负载处理隐藏在模块实现中。
- [ ] LangGraph 有独立工具动作及一次调用预算，并在澄清、无匹配和外部服务失败时保持正确流程。
- [ ] 最终报告 schema、浏览器计划快照和 UI 能呈现来源、查询时间、rank、起止日期、引用以及样本截断/未知状态。
- [ ] 与当前球员池、候选检索、能力评分和排序保持隔离；无日期或 normal rank 不被包装为当前关系。
- [ ] 根目录 `CONTEXT.md` 与 Wayfinder map 更新，研究 memo 被 map 引用。
- [ ] `pnpm build`、`pnpm build:web` 与 `git diff --check` 通过；按项目指示不运行测试。

## Research basis

- [Wikidata 球队成员关系上下文调查](../research/wikidata-team-membership-context-2026-10.md)：P54 也包括过去代表的球队，Wikidata 不保证完整或准确；推荐只读辅助上下文，不作当前阵容权威来源。
- [Wikidata 数据获取说明](https://www.wikidata.org/wiki/Help:Data_access)：按任务选择访问方式、限制负载并使用合适 User-Agent；结构化数据为 CC0。
- [P54：member of sports team](https://www.wikidata.org/wiki/Property:P54)：描述“代表或曾代表”的球队关系，并允许 start/end time 等 qualifiers。
- [statement rank 说明](https://www.wikidata.org/wiki/Help:Ranking)：normal 为默认值且不判断准确性或时效；rank 不代替 reference。
- [WDQS 用户手册](https://www.mediawiki.org/wiki/Wikidata_query_service/User_Manual)：公开查询服务有限速、并发和超时限制。

## Answer

本 issue 不实施。用户将数据源收敛为单一来源后，Wikidata 的球队关系只能作为第二来源；而且 `member of sports team` 不足以确认现役阵容。数据源调查见 [单一开放足球数据源可行性](../research/single-source-open-football-data-2026-10.md)。

## Comments
