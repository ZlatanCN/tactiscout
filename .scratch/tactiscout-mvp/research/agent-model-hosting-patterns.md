# Agent 项目使用托管 API 还是本地模型

研究日期：2026-10-03。抽样查看公开的足球分析/球探项目、一个托管式体育分析 Agent，以及 LangGraph 生产项目文档。样本用于展示做法，不足以推断整个社区的比例。

## 公开项目里的做法

| 项目 | 模型运行方式 | 能说明什么 |
| --- | --- | --- |
| [Sportsbrain-MCP](https://github.com/AryanBhanushali/Sportsbrain-MCP) | 开发时用 Qwen3 8B + Ollama 本地推理；README 记录其笔记本 GPU 上一次响应约 20–40 秒。项目云部署验证的是 API/UI/Redis；CPU 节点不跑在线推理，需要另接 GPU 或云模型服务。 | 足球球探 Agent 可以本地开发，再把推理服务独立换成远程部署。 |
| [Scout-Agent AI](https://github.com/aqdoraisraa-i/scout-agent-ai) | LangChain + Ollama + Llama 3.2 3B，README 明确定位为本地运行、没有外部 LLM API 费用。 | 另一个足球球探项目选择了本地模型。 |
| [Fantasy Football Agent project](https://github.com/TatendaTy/ai-project) | 使用 Microsoft Foundry 上的 GPT-4o，同时保留 FastAPI、数据模型和 LangGraph workflows。 | 体育分析项目也会选择托管模型和云部署。 |
| [LangChain Open SWE](https://github.com/langchain-ai/open-swe/blob/main/docs/INSTALLATION.md) | 可以使用配置好的 Anthropic/OpenAI 等 provider；支持 model fallback，也可通过 LLM Gateway 转发。 | 生产型 Agent 常把 provider 作为部署配置，并给主模型设置备用模型。 |

LangChain 本身同时提供本地 Ollama 的 `ChatOllama` 集成。[Ollama integration docs](https://docs.langchain.com/oss/python/integrations/providers/ollama/) Ollama 官方应用文档也把两种模式并列：本地模型不需要 API key，云模型使用 API key。[Ollama quickstart](https://github.com/ollama/ollama/blob/main/docs/quickstart.mdx)

## 可以归纳出的实际取舍

- **托管 API**：省去模型下载、硬件和推理服务运维，通常更适合快速验证、多用户演示或部署；用量可能按 token/API 调用计费，也可能有免费额度。具体取决于 provider 和账号计划。
- **本地模型**：LLM 推理不产生云 token 账单，输入数据可以留在本机，但需要下载模型、占用内存/磁盘并接受更长延迟或更弱的工具调用表现。
- **混合**：公开样例里可以看到本地开发与远程部署分开；另一类做法是在部署配置中切换 provider 或配置 fallback。
- **数据/API 成本与模型成本是两回事**：本地跑 LLM 并不代表足球数据、搜索、托管数据库或观测服务也免费。

这些仓库是公开案例样本，不是统计抽样，不能据此说社区“多数”选云端或多数选本地。

## 对 TactiScout 的建议

先把模型调用留在 Fastify 服务端，通过统一的 provider 配置选择后端。开发时可用 Ollama 本地模型，避免为每轮实验付 API 费；需要更快、更稳的演示或云部署时，再配置一个允许外部应用调用的托管模型。LangGraph 的节点、状态、路由与工具编排不应依赖某一家模型供应商。

球员数据接口和模型推理应分别盘点预算：切成 Ollama 只解决 LLM 推理费用，不会自动免掉数据 API 或云托管费用。
