# TactiScout MVP

Labels: wayfinder:map

## Destination

完成一个可演示、能写进简历的 TactiScout MVP：用户用自然语言建立招募计划，确认解析结果后获得有证据的候选名单；可以保存计划、比较球员，并清楚看到数据局限。

## Notes

- 全 TypeScript；当前技术栈是 React、Fastify 和 LangGraph。
- 根目录 `CONTEXT.md` 是唯一领域词汇表；重要术语按其中定义使用。
- [MVP 规格](spec.md) 收录完整用户故事、接口约定和实现决策。
- 相关技能：grilling、domain-modeling、wayfinder、codebase-design、to-spec、implement-spec。
- 用户已授权继续实现；规格确认后继续推进，不把项目留在纯计划阶段。
- 使用 `.scratch/<feature>/` 保存地图、规格和单独的问题文件；本地 triage 标签沿用项目默认值。

## Decisions so far

- [使用全 TypeScript 和 LangGraph 组织球探流程](issues/01-typescript-langgraph.md)：继续现有 React、Fastify、LangGraph 架构。
- [LLM 解析自然语言招募需求后由用户确认](issues/02-llm-brief-confirmation.md)：服务端使用兼容 OpenAI 的结构化输出；球队或位置不清楚时要求补齐。
- [在 localStorage 保存招募计划和最近分析快照](issues/03-local-plan-snapshots.md)：手动重新分析并更新快照，不自动调度。
- [使用有球与无球职责模板表达战术画像](issues/04-phase-role-templates.md)：只给可观测指标评分，缺失数据明确展示。
- [以透明证据支持候选名单和球员比较](issues/05-shortlist-comparison.md)：比较 2–3 名球员，不使用未验证的分数阈值划档。
- [保留开放足球数据的来源和适用边界](issues/06-data-scope.md)：以 StatsBomb Open Data 为主要真实数据源，演示数据和年龄补充来源需标注限制。

## Not yet specified

- 如何用可复现的数据集与指标验证候选排序和职责适配是否有用；在首批职责模板与实际可用数据落定后再把问题细化。

## Out of scope

- 登录、多用户云端同步和服务端数据库。
- 自动定时刷新或无人值守引援流程。
- 预算、合同、伤病与转会可行性分析。
- 逐项复制 Football Manager 的官方职责目录或评分模型。
