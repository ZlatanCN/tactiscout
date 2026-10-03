# 实现对话式招募案件 MVP

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

让球探只用自然语言开始一个案件；Agent 通过 LangGraph 动态调查球队和球员数据、在必要时追问、沿同一案件继续，并输出有证据支持的能力评估和推荐。

## Acceptance criteria

- 用 Fastify 公共案件轮次接口覆盖规划器与数据仓库注入，不把测试耦合到 LangGraph 节点实现。
- Agent 能在工具调用后重新决策，遇到重要歧义时用 `interrupt` 等待用户回答，并在同一案件继续。
- 报告只推荐已经评估且引用已计算指标证据的候选人；数据覆盖、样本和阵容限制可见。
- 报告展示实际用于候选发现的条件，并标明是 Agent 根据对话解释的范围还是旧版用户确认字段。
- 前端以自然语言为主入口，追问在同一对话中回答；目标球队搜索选择器为可选上下文。
- 用户能比较候选人，并把对话及最近完整报告保存到 localStorage；旧版计划迁移时不丢失历史快照。
- 自动化链路测试不依赖真实模型密钥或在线数据源。

## Implementation notes

- 公共接口：`POST /api/v1/recruitment/cases/:caseId/turns`。
- 使用 `MemorySaver` 的进程内 checkpoint 仅支持 API 进程存活期间恢复；跨重启持久化属于独立后续决策。
- 真实 OpenAI-compatible 服务调用尚需本地配置凭据验证；注入式确定性规划器验证图的用户可见行为。

## Comments

- 2026-10-03：本机已接入 Ollama `qwen3.5:9b`。结构化解析和追问分支可用；完整真实模型推荐链路尚未通过验收，后续见[本地模型 Agent 验收](11-local-model-agent-evaluation.md)。

## Answer

已实现句子式招募对话、LangGraph 工具决策循环、同案追问与恢复、证据检查、候选并排比较和浏览器计划快照。图会阻止未调查就追问或结束，并在达到决策步数上限时安全返回空推荐报告；推荐只使用已评估球员和计算出的指标，报告中的检索范围、指标、证据覆盖和风险说明由服务端生成。旧版计划读取时迁移并立即写回新格式。浏览器明确说明候选顺序是 Agent 的后续考察优先级，不是校准排名。

验证：后端 TypeScript 检查通过，17 项行为测试通过；前端 TypeScript 检查和 Vite 生产构建通过；`git diff --check` 通过。真实 OpenAI-compatible 服务仍需本机配置密钥进行联调；自动化链路使用注入式规划器验证。
