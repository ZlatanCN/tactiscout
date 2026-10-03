# LangGraph Agent 与 Harness 的公开实现模式

研究日期：2026-10-03。抽样查看 LangChain 官方 LangGraph 文档及官方开源仓库的一手实现。样本用于提炼架构模式，不代表市场占有率或整个社区的普遍做法；旧仓库会单独标明维护状态。

## 先区分三个层次

LangGraph 文档将 **workflow** 描述为预先定义步骤和路径的流程，将 **agent** 描述为会动态选择过程和工具的系统；实际应用可以把两者组合在一个图里。[Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)

LangChain 官方 Deep Agents 架构说明则把层次概括为：LangGraph 提供 state、checkpoint、streaming、interrupt 等运行时；LangChain 提供 model/tools/middleware 组成的 agent loop；Deep Agents 是叠加规划、子 Agent、文件系统、上下文管理等预设能力的通用 harness。[Deep Agents architecture](https://github.com/langchain-ai/deepagents/blob/main/libs/ARCHITECTURE.md)

因此，“用了 LangGraph”不代表一定要多 Agent；应用可以直接构建自定义 StateGraph，也可以选通用 harness，再把领域流程接进去。

## 代表性实现

| 项目 / 样例 | 它怎么用 LangGraph | 能借鉴什么 | 边界 |
| --- | --- | --- | --- |
| [SportsBrain MCP](https://github.com/AryanBhanushali/Sportsbrain-MCP) | README 描述一个 ReAct Agent 通过 `MultiServerMCPClient` 调用 3 个独立数据服务器、共 9 个工具；用本地 Qwen/Ollama 规划多来源查询，Redis 缓存，LangSmith trace，并报告 163 个问题的 RAGAS 评估。[项目说明与自报结果](https://github.com/AryanBhanushali/Sportsbrain-MCP) | 这是最接近 TactiScout 的足球样本：数据源按边界封装成工具，Agent 会根据问题跨源调用；值得借鉴多来源工具和可重复行为评估。 | README 自述是 ReAct 工具循环；没有披露“先调查、关键时机追问、回复后续跑案件”的完整机制。所报 RAGAS Faithfulness 0.660 / Answer Relevancy 0.832 不能证明战术推荐质量；README 还说明 EKS 部署当时只验证服务健康/UI，CPU 环境需外接推理服务。视为个人项目样本，不是成熟商业系统或独立验证。 |
| [Football Agent](https://github.com/Joewizy/football-agent) | 小型本地优先 Agent：单个 think/tools 循环将 SportMonks 实时数据工具与 Chroma 足球规则 RAG 工具交给模型选择；用 SQLite `SqliteSaver` 按 `thread_id` 保存会话状态，支持重启恢复；工具负责返回事实，LLM 负责回答。[README 与架构](https://github.com/Joewizy/football-agent) | 可参考简单但完整的边界：数据查询与知识检索是两类工具，同一 Agent 选择；checkpoint 是独立于工具数据的会话持久层。 | 2 commits 的学习型样例，回答比分、射手和规则问题，不是球员能力评估、转会判断或多阶段追问工作流。 |
| [Open Deep Research](https://github.com/langchain-ai/open_deep_research) | 主图先澄清用户需求、生成 research brief，再交给 Supervisor 子图；Supervisor 拆任务并并行派发 Researchers，每个 Researcher 自己跑“选搜索工具 → 执行工具 → 继续或压缩笔记”的循环，最后生成报告。Supervisor 和 Researcher 使用各自的 state schema；配置里设置并行数量与迭代上限。[实现](https://github.com/langchain-ai/open_deep_research/blob/main/src/open_deep_research/deep_researcher.py) · [State](https://github.com/langchain-ai/open_deep_research/blob/main/src/open_deep_research/state.py) | 先把工作流阶段固定下来，只让 LLM 在需要探索的节点决定下一步；把独立研究主题并行化；对迭代数和并发数设上限。 | Python 项目；仓库于 2026-08-21 归档，适合作为设计样本，不应称为仍在维护的方案。[归档记录](https://github.com/langchain-ai/open_deep_research) |
| [People Researcher](https://github.com/langchain-ai/people-researcher) | 按用户给出的 schema 定向搜索，再做结构化字段抽取；反思步骤检查必填字段是否缺失，并针对缺项发起补充搜索，达到反思步数上限后结束。README 还提供了数据集和 LLM judge 评估脚本。 | 把报告要求转成字段与证据缺口；只补查缺失维度；用工具行为和字段覆盖评估整条 Agent，而不是只比较最终文字。 | 这是 LangChain 官方示例仓库，已于 2026-03-11 归档；示范的是通用网页研究，不是球员数据产品。[实现与评估说明](https://github.com/langchain-ai/people-researcher) |
| [Deep Agents JS](https://github.com/langchain-ai/deepagentsjs) | `createDeepAgent()` 返回一个已编译的 LangGraph 图。它在通用 agent loop 上增加规划工具、文件系统工具、子 Agent、上下文管理等默认能力；自定义工具和模型仍可注入。当前 README 还区分 Node.js 与 browser-safe 入口。[README](https://github.com/langchain-ai/deepagentsjs) · [架构拆解](https://github.com/langchain-ai/deepagents/blob/main/libs/ARCHITECTURE.md) | 可把可复用能力做成 middleware / backend / subagent，而不是散落在一个超长 prompt 里；子 Agent 可以隔离上下文并拥有窄工具集。官方 JS 仓库也维护了 Vitest + LangSmith 行为评估 harness，详见下文。 | 它优化的是长时程通用任务，内置文件系统与代码执行对球探核心链路没有直接价值；不能因它“更完整”就把整套通用能力都搬进 TactiScout。 |
| [LangGraph.js Generative UI examples](https://github.com/langchain-ai/langgraphjs-gen-ui-examples) + [Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui) | 示例按 graph ID 暴露不同 agent，包含 supervisor 分发到窄领域演示 agent；邮件示例在字段齐备后触发结构化 HumanInterrupt，UI 显示接受、编辑、补充或忽略操作，然后恢复图。[示例](https://github.com/langchain-ai/langgraphjs-gen-ui-examples) · [UI](https://github.com/langchain-ai/agent-chat-ui) | UI 可将普通对话、结构化补问/确认和报告 artifact 分层呈现；interrupt payload 可以成为前后端约定的交互协议。 | 一些 agent 明确是 dummy/demo；Generative UI examples 仓库已于 2026-02-25 归档，适合作为界面交互样例，不宜视作持续维护的 starter。Agent Chat UI 是独立、可连接兼容 LangGraph Server 的前端，不是球探领域 harness。[归档记录](https://github.com/langchain-ai/langgraphjs-gen-ui-examples) |
| [LangGraph 官方 JS 教程](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph) | 将业务拆为读取、分类、检索、草拟、人工审核等节点，静态流程与 `Command` 路由混用；在 `interrupt()` 暂停后，使用同一个 `thread_id` 与 resume value 恢复。 | 业务流程要先从真实步骤和状态出发；副作用节点和等待用户的节点分开；checkpoint 负责 thread 内执行状态。 | 官方教程示例不是生产产品，但它说明了 JS/TS 可直接构建这种自定义 workflow + agent 混合模式。 |

Open Deep Research README 还记录了 benchmark 评估，但仓库已归档；它的研究流程和配置是可复用的架构参考，不应把当年的榜单成绩等同于当前模型或项目表现。[README](https://github.com/langchain-ai/open_deep_research/blob/main/README.md)

## 从这些样本归纳的常见设计手法

### 1. 外层固定流程，内层允许 Agent 探索

多个实现不是让模型随意规划整个应用，而是把阶段边界交给代码：例如澄清、研究 brief、候选发现、表现评估、审查、交付。某个阶段内，LLM 再决定调用哪个工具、是否追问、是否需要补查。LangGraph 官方把 workflow 与 agent 明确作为不同模式讲解，并示范将 model call、tool node 和 conditional edge 组成可控的工具循环。[Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)

### 2. 子 Agent 只在任务可拆分时加入

Open Deep Research 的多个 Researchers 可以各自完成独立研究主题，因此并行有实际收益。若任务没有可独立执行的分支，把 Requirement、Scout、Tactical Fit、Reviewer 硬拆成四个互相聊天的 LLM，通常只会增加模型调用、状态同步和证据对齐成本。这个建议是基于样例工作结构的工程推论。

### 3. Agent 的权限和预算落在工具 / 路由 / 状态约束上

项目限制了研究迭代和并行 worker 数；Deep Agents 也提醒应在工具和执行环境层落实安全边界，而不是依赖 prompt 让模型自我约束。[Open Deep Research configuration](https://github.com/langchain-ai/open_deep_research/blob/main/src/open_deep_research/configuration.py) · [Deep Agents security notes](https://github.com/langchain-ai/deepagentsjs#security)

对领域 Agent 来说，证据范围、允许引用的候选人和工具预算应由可验证代码约束；模型负责选择和解释，不能决定越过数据边界。

### 4. 把评估做成“轨迹 + 结果”

LangSmith 官方评估指南将离线评估定义为用整理好的代表性数据集比较版本；对 ReAct Agent 的例子是比较预期工具调用，再搭配最终答案评估，而不是只检查文案相似度。[Evaluation types](https://docs.langchain.com/langsmith/evaluation-types)

对球探 Agent，这意味着至少分别检查：工具调用是否遵守业务顺序、用户回答后是否续上原调查、推荐是否来自已评估候选、每条建议是否有有效证据 key、数据缺口是否如实呈现。工具轨迹检查适合确定性断言；开放式解释才适合用 judge 或人工抽查。

LangChain 官方 Deep Agents 仓库也把这套思路用于自己的行为评估：每次用真实模型运行，记录工具调用、文件变更和最终回复；`TrajectoryScorer.success(...)` 放必须满足、失败即阻断的正确性条件，`.expect(...)` 则记录步骤数和工具调用等效率目标而不让波动直接令测试失败。其 JS 仓库的评估 skill 使用 Vitest trajectory matchers，并将结果送入 LangSmith。[Python eval 说明](https://github.com/langchain-ai/deepagents/blob/main/libs/evals/CONTRIBUTING.md) · [JS eval 编写规范](https://github.com/langchain-ai/deepagentsjs/blob/main/.agents/skills/eval-creator/SKILL.md) 这提示 TactiScout 后续把证据正确性/安全边界作为硬门槛，把具体工具次数、耗时与迭代效率单列为诊断指标；多条合法路线不应被单一“精确轨迹”误判。这里是根据其评估设计对 TactiScout 的工程推论，不代表其评估语料可衡量球探推荐质量。

### 5. Checkpoint 与应用数据存储分开

LangGraph checkpointer 按 `thread_id` 保存单个 thread 的图状态快照，支持中断恢复和故障恢复；另一个 Store 才用于跨 thread 的长期共享资料。[Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) · [Checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)

官方 JS 文档说明 `MemorySaver` 是实验用途；`@langchain/langgraph-checkpoint-sqlite` 适合本地 workflow，Postgres/Redis 等有面向生产的实现。使用 Agent Server 时，服务端会自动处理 checkpoint；自己在 Fastify 里 compile/invoke 图，则应用需要向图注入 checkpointer。[Checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)

## 公开披露的生产产品案例

以下是厂商/客户公开的案例材料，不是独立审计，也不足以代表所有 LangGraph 用户；我只把具体披露的架构事实作为样本，不从中推断市场占比或效果可复制性。

| 产品 / 团队 | 公开披露的 harness 形状 | 对 TactiScout 的启发 |
| --- | --- | --- |
| Exa Deep Research | Planner 根据问题动态生成并行研究任务；每个任务有专门指令、JSON 输出 schema 和专用搜索工具；Observer 汇总并持有全局上下文，子任务只接收其他任务清理后的结果；优先用 snippet 推理，只有不足时再取整页内容。团队也用 tracing 观察 token、缓存和成本。[案例](https://www.langchain.com/blog/exa) | 可以按“引援需求缺口”产生有限、窄职责的研究任务；先用轻量统计/摘要判断，只有证据不足时才抓更多内容；子任务交付结构化证据，不互相传整段思维过程。 |
| Lyft AI Assist | 元路由器用 `Command(goto=...)` 选择专业子图；子图遇到跨领域问题可回到父路由器再分派；恶意意图和安全检查在推理前并行运行。复杂、高风险任务手工编排；较简单问题用 JSON 配置生成 Agent。会话状态用实现 `BaseCheckpointSaver` 的 DynamoDB saver；生产轨迹进入多轮 LLM-as-a-judge 评估和监控。[Lyft 一手案例](https://www.langchain.com/blog/lyft-built-a-self-serve-ai-agent-platform-for-customer-support-with-langgraph-and-langsmith) | 路由应看对话当前阶段和缺口，不是一次性意图分类；安全/证据校验等确定性步骤可以先于 LLM 并行；复杂球探任务仍由代码定义骨架，不能只靠一段 prompt 生成整张图。 |
| Kensho Grounding | 中央 Router 接自然语言查询，分派给各数据团队拥有的窄职责 Retrieval Agent；每个代理返回统一协议的数据，Router 聚合多个结果。评估拆为路由正确性、数据质量、答案完整性，并分别检验选对代理与工具调用。[案例](https://www.langchain.com/blog/customers-kensho) | 这与球探的数据问题很接近：把比赛统计、球队样本、战术方法和球探报告封装成责任明确的工具/子图，要求统一返回结构化数据与来源，再由案件图聚合。 |
| AppFolio Realm-X | 从单一工具 Agent 迁移到 LangGraph 后，把不同节点的回答聚合起来；在理解潜在动作时，并行计算 fallback 和帮助中心问答；通过逐节点和端到端的样例评估，并把质量阈值接入 CI。[案例](https://www.langchain.com/blog/customers-appfolio) | 只有互相独立的调查分支才并行；先建立固定评估案例，验证检索、评估、证据审查和最终报告各自是否正确，再谈增加 Agent 数量。 |
| Open SWE（开源产品） | Deep Agents 提供计划、文件、shell、skills 和子 Agent；LangGraph 提供 durable execution/thread state；产品层再管 GitHub/Slack/Linear 接入、身份、安全、sandbox 与 UI。当前 README 列出 Agent、Reviewer、Analyzer、Chat、Scheduler 五个图入口；同一 thread 可有多次 invocation，后续消息接续原 thread 与 sandbox，纯只读 PR Chat 则不需要 sandbox。仓库 README 标记仍在积极开发。[README](https://github.com/langchain-ai/open-swe/blob/main/README.md) | 能看出通用 harness、LangGraph runtime 和具体产品不是一个层次。TactiScout 也应让领域图专注案件逻辑，Fastify/前端/本地存储负责应用接入和界面；thread 表示长期案件，invocation 表示一次运行，这种生命周期区分对追问续跑有参考价值。Open SWE 的代码执行沙箱对球探不适用。 |

这些案例共同支持的不是“多 Agent 越多越好”，而是**明确编排边界、让可独立工作并能结构化汇总的分支并行、让风险控制先于或伴随模型推理、用轨迹和回归评估管住迭代**。具体数字来自案例发布方自述，不能直接作为 TactiScout 的性能目标。

### 通用 harness 与领域 Agent 的边界

Deep Agents 是 LangChain 提供的通用 harness：计划、虚拟文件系统、子 Agent、上下文压缩、长期记忆、工具权限和 HITL 都能配置；其文档也建议较简单的工作流使用 `createAgent` 或自定义 LangGraph 图。[Deep Agents JS 概览](https://docs.langchain.com/oss/javascript/deepagents/overview) 这类能力适合开放式、长时间、需要大量文件/工具操作的任务。TactiScout 有固定领域对象和证据约束，当前适合借用子任务隔离、loop budget、结构化产物等思想，不需要为了“像 harness”而引入 shell、文件系统或通用 todo 工具。

另一个重要区分：LinkedIn 的 LangChain 展示页把 AI Recruiter 标为 LangGraph 案例，但 LinkedIn 的工程文章披露的是更广泛的 LangChain GenAI 应用栈，包括可检索的 skill registry、动态 skill 工具、对话记忆、提示词版本管理和统一推理代理，并没有在该文中明确说该 Recruiter 产品的具体图实现。[LangChain 的案例索引](https://www.langchain.com/built-with-langgraph) · [LinkedIn 工程文章](https://www.linkedin.com/blog/engineering/generative-ai/behind-the-platform-the-journey-to-create-the-linkedin-genai-application-tech-stack) 因此这里只把后者当成工具目录/共享平台的相邻参考，不当作 LangGraph 图架构的直接证据。

## 对照 TactiScout 当前实现

TactiScout 已经组合了上面两种模式：

- [src/agent/graph.ts](../../../src/agent/graph.ts) 是可控的领域 workflow：数据读取后，统计分析与战术评估并行，接着排序、证据审查；若证据覆盖不足则有限次刷新后再出报告。
- [src/agent/conversation.ts](../../../src/agent/conversation.ts) 是有界的 Agent harness：LLM 每轮选择一个结构化 action，图执行对应工具并把结果写回 state，再重新决定；它含工具预算、结论约束、证据审查重试和 `interrupt()` 追问。
- 调研开始时，当前图使用 `MemorySaver`；本轮已通过 issue 13 改为默认本机 SQLite checkpointer（`.data/recruitment-cases.sqlite`，可由 `TACTISCOUT_CHECKPOINT_PATH` 覆盖）。浏览器保存的对话与报告快照仍是 localStorage 应用数据，不等于服务器图 checkpoint。

## 结论与建议

TactiScout 适合采用**自定义领域 harness + LangGraph StateGraph**：明确业务阶段，让 LLM 决定局部行动，并由代码守住证据与执行边界。

1. 保留会解释得清楚的阶段和状态：理解引援问题、查阵容/数据、发现候选、评估、针对证据缺口补查、审查、追问或报告。
2. 将 LLM 的自主性放在会因输入和证据变化的决策上；数据筛选、统计计算、证据 ID 校验和预算限制仍由代码掌握。
3. 当“定性报告调查”与“结构化比赛数据评估”等工作能独立运行并返回可合并证据时，再新增并行 subgraph/subagent；每个 Agent 应对应真实的上下文或工具边界。
4. 本轮已验证“追问后同案恢复”及“Fastify 服务重启后恢复”，并通过应用默认 SQLite 配置覆盖公开 HTTP 路径。当前为单实例本地方案；若部署到多实例，应选择共享的生产 checkpointer，或评估使用 Agent Server 托管持久化。
5. 后续扩大本地行为评估集，固定场景并检查决策轨迹、证据约束和结果；数据源扩展按评估暴露出的覆盖缺口推进。

### 参考来源

- [LangGraph JS: Workflows and agents](https://docs.langchain.com/oss/javascript/langgraph/workflows-agents)
- [LangGraph JS: Thinking in LangGraph](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)
- [LangGraph JS: Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
- [LangGraph JS: Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)
- [LangGraph JS: Checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)
- [LangSmith: Evaluation types](https://docs.langchain.com/langsmith/evaluation-types)
- [Open Deep Research](https://github.com/langchain-ai/open_deep_research)
- [People Researcher](https://github.com/langchain-ai/people-researcher)
- [Deep Agents JS](https://github.com/langchain-ai/deepagentsjs)
- [Deep Agents architecture](https://github.com/langchain-ai/deepagents/blob/main/libs/ARCHITECTURE.md)
- [Deep Agents JS overview](https://docs.langchain.com/oss/javascript/deepagents/overview)
- [Deep Agents Python behavior evaluation design](https://github.com/langchain-ai/deepagents/blob/main/libs/evals/CONTRIBUTING.md)
- [Deep Agents JS evaluation authoring guide](https://github.com/langchain-ai/deepagentsjs/blob/main/.agents/skills/eval-creator/SKILL.md)
- [LangGraph.js Generative UI examples archive status](https://github.com/langchain-ai/langgraphjs-gen-ui-examples)
- [Exa Deep Research customer case](https://www.langchain.com/blog/exa)
- [Lyft AI Assist customer case](https://www.langchain.com/blog/lyft-built-a-self-serve-ai-agent-platform-for-customer-support-with-langgraph-and-langsmith)
- [Kensho Grounding customer case](https://www.langchain.com/blog/customers-kensho)
- [AppFolio Realm-X customer case](https://www.langchain.com/blog/customers-appfolio)
- [Open SWE](https://github.com/langchain-ai/open-swe/blob/main/README.md)
- [LinkedIn GenAI platform engineering article](https://www.linkedin.com/blog/engineering/generative-ai/behind-the-platform-the-journey-to-create-the-linkedin-genai-application-tech-stack)
- [LangGraph.js Generative UI examples](https://github.com/langchain-ai/langgraphjs-gen-ui-examples)
- [Agent Chat UI](https://github.com/langchain-ai/agent-chat-ui)
