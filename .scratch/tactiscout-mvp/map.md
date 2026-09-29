# TactiScout MVP

Labels: wayfinder:map

## Destination

完成一个可演示、能写进简历的 TactiScout MVP：用户用自然语言描述球队的引援问题，Agent 调查可用数据、建立目标角色能力画像、比较候选球员，并给出能追溯到证据的推荐和风险说明。对话可以在调查过程中追问、接收补充并继续。

## Notes

- 首版重点是球员能力评估与推荐，不是把自然语言转换成大量筛选字段。
- 当前主要真实数据源 StatsBomb Open Data 不足以核验现役完整阵容；产品必须区分已查证事实、推断和数据缺口。
- 全 TypeScript；当前技术栈是 React、Fastify 和 LangGraph。
- 根目录 `CONTEXT.md` 是唯一领域词汇表；重要术语按其中定义使用。
- [MVP 规格](spec.md) 收录用户故事、接口约定和实现决策；[球探与 Agent 流程研究](research/football-recruitment-and-agent-workflow.md)记录来源与产品推导；[数据源与抓取边界研究](research/football-data-sources-and-crawling.md)记录联网能力、授权路线与数据出处设计；[RAG 实践与足球语料调查](research/scouting-rag-practices-and-sources.md)记录检索实践和可用来源；[许可感知的双语料 RAG 设计](issues/10-permission-aware-rag-design.md)确定产品原则。
- 用户已授权继续实现；方向收敛后继续推进，不把项目留在纯计划阶段。
- 已实现对话案件 HTTP seam、LangGraph 工具决策循环与可中断追问；浏览器已改为自由对话入口，并保存对话和最近完整报告。
- 使用 Fastify 注入测试覆盖调查、追问、恢复与证据报告；前后端类型检查、行为测试和网页生产构建均通过。
- 已完成 [对话式招募案件 MVP](issues/08-conversational-case-mvp.md)：覆盖早期追问/结束保护、证据约束、证据覆盖摘要、案件状态失效提示、指标对比和 v1 计划迁移。
- 已接入许可感知的双语料 RAG：PLOS 元数据发现与登记 DOI 正文采集、本地来源许可登记、LanceDB 混合检索、本地 q8 multilingual E5 embedding 和 LangGraph 的“方法画像 → 结构化评估 → 球员报告”顺序保护。已实际完成登记论文的许可核验、113 个片段入库和本地语义检索；尚无可用球员报告来源。
- 生产模型密钥目前未配置，因此真实 OpenAI 兼容服务调用尚未验证；确定性测试不依赖外网或密钥。
- 图 checkpoint 目前用 `MemorySaver`；API 进程重启会丢失内部调查状态。单独评估持久化 checkpoint 后端是后续工作。
- 使用 `.scratch/<feature>/` 保存地图、规格和单独的问题文件；本地 triage 标签沿用项目默认值。

## Decisions so far

- [使用全 TypeScript 和 LangGraph 组织球探流程](issues/01-typescript-langgraph.md)：继续现有 React、Fastify、LangGraph 架构。
- [LLM 解析自然语言招募需求后由用户确认](issues/02-llm-brief-confirmation.md)：这是早期的表单式方案；其“固定字段确认后筛选”流程已被对话式调查和多轮评估方向取代。
- [在 localStorage 保存招募计划和最近分析快照](issues/03-local-plan-snapshots.md)：手动重新分析并更新快照，不自动调度。
- [使用有球与无球职责模板表达战术画像](issues/04-phase-role-templates.md)：职责画像仅引用有证据的可观测指标，不复制 Football Manager 的官方职责目录。
- [以透明证据支持候选名单和球员比较](issues/05-shortlist-comparison.md)：比较 2–3 名球员，不使用未经验证的分数阈值。
- [保留开放足球数据的来源和适用边界](issues/06-data-scope.md)：标注 StatsBomb Open Data 覆盖范围，不能把历史数据冒充当前阵容。
- [以对话式能力评估与推荐为首版主线](issues/07-conversational-ability-evaluation.md)：暂缓非欧、工作许可、注册规则等细则；年龄、预算仅为可选辅助偏好。
- [实现对话式招募案件 MVP](issues/08-conversational-case-mvp.md)：以 LangGraph 调查循环、追问恢复和确定性证据摘要完成自然语言招募链路。
- [研究足球数据源与联网访问边界](issues/09-data-source-access-and-provenance.md)：当前只读本地数据；后续先建来源登记和证据出处，再接授权 API 或许可范围内的报告检索。
- [许可感知的双语料球探 RAG](issues/10-permission-aware-rag-design.md)：报告作为带出处的定性证据参与候选发现与后续考察，不直接成为能力分；通过小型标注集分别评测检索、证据支持和 Agent 决策。

## Not yet specified

- 如何按实际可用语料整理 RAG/Agent 标注样本、阈值和候选排序的可信评估；缺少球探标注时不宣称客观排序准确率。
- 继续寻找允许保存并用于 AI/RAG 的具名球员报告来源；针对每个已准入来源补正文采集 adapter、刷新/删除策略。
- 当前来源发现只覆盖 PLOS 学术文章；通用网页搜索 provider、最终 embedding 模型和 RAG/Agent 评测阈值仍待验证。
- 选择哪家授权数据源、取得哪些赛事覆盖，以及线上缓存/展示/AI 使用的合同范围。
- 如何为 LangGraph 的跨重启暂停恢复选择 checkpoint 存储，同时继续把用户计划保存在 localStorage。

## Out of scope

- 登录、多用户云端同步和服务端保存用户的招募计划。
- 自动定时刷新或无人值守引援流程。
- 非欧身份、工作许可、联赛/欧战注册细则与财务合规推断。
- 首版预测薪资、合同谈判、伤病史、转会可行性、未来表现或转会成功率。
- 复制 Football Manager 的官方职责目录、界面或专有评分权重。
