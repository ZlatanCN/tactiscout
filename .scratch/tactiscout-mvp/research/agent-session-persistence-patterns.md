# Agent 会话状态与追问恢复：框架和开源产品做法

研究日期：2026-10-03。只参考 LangGraph、OpenAI Agents SDK、Dify 与 n8n 的官方文档或官方仓库。本文比较各自公开的能力和 API，不据此推断未披露的内部实现；样本不是市场占有率统计。

## 先把“状态”拆成三类

1. **对话历史**：用户和 Agent 说过什么，后续轮次需要哪些上下文。
2. **业务案件状态**：例如目标球队、候选位置、预算、已确认条件、仍待回答的问题、已有证据和分析结果。
3. **执行检查点**：工作流停在何处、哪些节点已完成、等待什么输入，回答后从哪里继续。

产品通常不会把这三件事都叫成同一个 session。选存储前先确定需要恢复的是“聊天上下文”“球探案件”，还是“暂停中的一次执行”。

## 官方公开的实现模式

| 框架 / 产品 | 跨轮对话 | 追问 / 暂停后的恢复 | 持久化边界 |
| --- | --- | --- | --- |
| **LangGraph（框架）** | Checkpointer 按 `thread_id` 保存图状态快照；同一 thread 可承载连续交互。另有 Store 保存跨 thread 的长期资料。 | 节点调用 `interrupt()` 暂停并向调用方返回问题；得到用户输入后，用同一 `thread_id` 和 `Command({ resume })` 恢复。 | `MemorySaver` 在进程内存中，重启会丢；官方将 SQLite 定位为本地/实验用途，Postgres、Redis 等 checkpointer 面向生产使用。[^1] [^2] |
| **OpenAI Agents SDK（TypeScript）** | `Session` 自动读取、追加每轮对话项；可用内存会话、OpenAI Conversations API，或自行实现后端。 | 暂停的 `RunState` 可序列化，保存后恢复审批/工具调用；HITL 文档建议 Web 客户端把完整快照留在应用服务端存储。 | `Session` 的会话历史和 `RunState` 的待恢复运行是不同对象。内存 session 仅进程内有效；OpenAI 托管 conversation 只适用于 OpenAI Responses API。[^3] [^4] |
| **Dify（开源产品）** | Chatflow API 返回 `conversation_id`；后续请求传回该 ID 以继续既有对话。另提供 conversation variables 的读取和更新 API。 | Human Input 节点通过 `human_input_required` 返回 `form_token` 和 `workflow_run_id`；客户端提交表单，再用同一 run ID 重新连接事件流，继续该次工作流。 | 产品文档将会话历史、会话变量和工作流 run 分别暴露为 API 能力；`user` 标识需在发起、提交、恢复时保持一致。[^5] [^6] [^7] |
| **n8n（开源自动化产品）** | Chat Trigger 每条消息运行一次 workflow；启用 Load Previous Session 后，需要连接 Memory 子节点。官方建议 Chat Trigger 和 Agent 共用同一个 Memory 子节点。 | Wait 节点暂停一次 workflow；等待时间、Webhook 或表单事件满足后，恢复原执行及其数据。 | Simple Memory 用 session key 和上下文窗口保存聊天历史，但官方警告 queue mode 下不能用于生产，因为请求不保证落到同一个 worker。Wait 节点则会把暂停执行数据写入数据库并在恢复时读回（小于 65 秒的等待是例外）。[^8] [^9] [^10] |

### 1. LangGraph：检查点是图执行状态，不只是消息列表

LangGraph 官方将 Checkpointer 描述为按 super-step 保存图状态快照、按 thread 组织；`thread_id` 是读写这些检查点的键。文档明确把对话连续性、人机交互暂停、故障恢复和时间旅行列为它支持的用途，并把跨 thread 的 Store 单独作为长期记忆抽象。[Persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence) · [Checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)

当图真的需要等用户回答时，`interrupt()` 会将 JSON 可序列化的问题交给调用方；同一 `thread_id` 上用 `Command({ resume: answer })` 恢复。中断节点恢复时会从该节点开头重跑，所以节点里放在 `interrupt()` 之前、且有外部副作用的代码需要考虑重复执行。[Interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)

存储选择上，LangGraph JS 文档把 `MemorySaver` 用于实验，把 SQLite checkpointer 定位为本地工作流，把 Postgres / Redis checkpointer 定位为生产使用；生产选择仍需结合部署拓扑、并发和运维条件。[Checkpointer libraries](https://docs.langchain.com/oss/javascript/langgraph/checkpointers#checkpointer-libraries)

### 2. OpenAI Agents SDK：会话记录与可序列化运行状态分开

TypeScript SDK 的 `Session` 负责跨轮取回历史并追加新输入/输出；文档提供进程内 `MemorySession`、OpenAI Conversations 后端和自定义 Session 接口。[Sessions](https://openai.github.io/openai-agents-js/guides/sessions/)；[Running agents](https://openai.github.io/openai-agents-js/guides/running-agents/)

审批中断则通过 `RunState` 表达，可序列化到文件/数据库，之后恢复。SDK 文档对浏览器或移动端特别说明：完整运行快照应保存在应用控制的服务端存储，前端只拿待审批内容与不透明 ID；快照包含运行上下文、待执行工具调用等状态。[Human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)

这提供了一个清晰参照：**普通聊天续轮**重用 Session；**还没跑完、等待用户决定的执行**保存 RunState。不能因为对话历史已保存，就假设任意暂停中的 Agent 执行也能恢复。

### 3. Dify：下一轮对话与同一次流程续跑有各自的标识

Dify Chatflow 文档说明前序轮次会保留为后续上下文；Chat Message API 在首轮返回 `conversation_id`，后续传回该 ID 以接续历史。Chatflow 另有会话变量接口，可读取或修改跨轮业务值。[Chatflow API](https://docs.dify.ai/en/api-reference/guides/chatflow) · [Send Chat Message](https://docs.dify.ai/en/api-reference/chat-messages/send-chat-message) · [Conversation Variables](https://docs.dify.ai/en/api-reference/conversations/list-conversation-variables)

用户需要在流程中补信息时，Dify 的 Human Input 流程返回表单 token 和 `workflow_run_id`；提交后，同一 run 继续，客户端可以按 `workflow_run_id` 重开事件流。也就是说，产品文档把“继续这段会话”和“续跑当前暂停的流程”设计为不同交互。[Human Input API Flow](https://docs.dify.ai/en/api-reference/guides/human-input-flow)

### 4. n8n：聊天记忆节点与等待中的 workflow 是两种能力

n8n Chat Trigger 的每条聊天消息都会启动一次 workflow。恢复之前的聊天内容要显式接上 Memory 子节点；官方推荐 Trigger 与 Agent 指向同一子节点。Simple Memory 适用于可确保 worker 亲和性的部署；文档明确不建议在 queue mode 的活动生产 workflow 中使用它。[Chat Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger) · [Simple Memory](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow)

如果要暂停的是一条长工作流，Wait 节点会把执行数据卸载到数据库，等 Webhook、表单或时间条件满足后再载回继续；Webhook resume URL 在运行时产生且每次执行唯一。小于 65 秒的时间等待不会卸载执行数据。[Wait](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait)

**从两份文档能力可以推断**，n8n 的聊天记忆与 Wait 的执行恢复应分别配置和考虑；不要把“接了 Memory”当成“正在执行的 workflow 已经能跨重启恢复”。

## 对 TactiScout 的启发

1. **给会话、案件和执行分开编号。** 向 UI 返回稳定的 `caseId` / `thread_id`；同一案件可包含多轮消息和多次分析。不要把浏览器 localStorage 里的计划快照当成服务端执行 checkpoint。
2. **一般追问要用真正的暂停点。** 如果 Agent 判断预算/年龄等关键条件缺失，先把已确认条件写入图状态，再通过 `interrupt()` 返回一个明确问题；用户回答后用同一 thread 恢复。这样恢复的是已进行到一半的球探调查，不是重新从头解析聊天记录。
3. **区分补答与改需求。** 对待回答问题的直接答复，应恢复原暂停执行；用户转而要求另一家球队或另一个位置时，应开启新案件，避免把上一调查的候选、约束与报告串进新请求。这是基于上面的 thread/执行边界提出的应用设计建议。
4. **MVP 用文件型 SQLite checkpointer 是合理起点。** LangGraph JS 官方提供它用于本地工作流；本轮已将 TactiScout 默认配置落到 `.data/recruitment-cases.sqlite`，并通过 Fastify 服务重启测试验证同一 thread 的恢复。当前实现面向本地单实例；扩展到多实例/生产时，再按官方生产 checkpointer 选项迁移。[LangGraph Checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)
5. **恢复 API 应校验案件归属。** `thread_id` 或 `workflow_run_id` 是定位状态的句柄，应用仍需在服务端确认当前用户可以读取/恢复对应案件。Dify 文档也要求 `user` 在启动、提交和恢复调用间一致，并明确将它作为数据访问范围。[Dify End User Identity](https://docs.dify.ai/en/api-reference/guides/end-user-identity)

## 结论

这批官方材料支持的共同模式不是“把所有东西塞进一张聊天记录表”，而是：稳定会话/线程标识负责找到上下文；有类型的业务状态保存已经确认的需求；需要跨等待恢复的流程另存执行进度。TactiScout 已用持久 LangGraph checkpointer 与 `interrupt` 实现“追问—用户补答—恢复同一调查”，案件计划和报告快照仍由浏览器 localStorage 独立保存。

[^1]: [LangGraph persistence](https://docs.langchain.com/oss/javascript/langgraph/persistence)；[Checkpointers](https://docs.langchain.com/oss/javascript/langgraph/checkpointers)
[^2]: [LangGraph interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts)
[^3]: [OpenAI Agents SDK TypeScript sessions](https://openai.github.io/openai-agents-js/guides/sessions/)
[^4]: [OpenAI Agents SDK TypeScript human-in-the-loop](https://openai.github.io/openai-agents-js/guides/human-in-the-loop/)
[^5]: [Dify Chatflow API](https://docs.dify.ai/en/api-reference/guides/chatflow)；[Send Chat Message](https://docs.dify.ai/en/api-reference/chat-messages/send-chat-message)
[^6]: [Dify Human Input API Integration Flow](https://docs.dify.ai/en/api-reference/guides/human-input-flow)
[^7]: [Dify List Conversation Variables](https://docs.dify.ai/en/api-reference/conversations/list-conversation-variables)；[End User Identity](https://docs.dify.ai/en/api-reference/guides/end-user-identity)
[^8]: [n8n Chat Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-langchain.chattrigger)
[^9]: [n8n Simple Memory](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorybufferwindow)；[Postgres Chat Memory](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memorypostgreschat)；[Redis Chat Memory](https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.memoryredischat)
[^10]: [n8n Wait](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait)
