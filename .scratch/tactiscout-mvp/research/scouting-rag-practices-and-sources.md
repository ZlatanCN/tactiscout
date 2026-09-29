# TactiScout 球探 RAG 实践与语料来源

研究日期：2026-09-29。本文把通用 RAG 实践与足球语料可用性分开记录；网页公开可读不能自动推出可以抓取、索引或交给模型处理。

## 对 TactiScout 有用的 RAG 模式

1. **发现与入库是分开的步骤。** 搜索只发现潜在来源；来源登记核实自动访问、正文保存、AI/RAG 处理及展示范围后，获准正文才进入持久索引。RAG 检索本身不等同于网页抓取。[LangChain RAG 指南](https://docs.langchain.com/oss/javascript/deepagents/rag)
2. **按任务分语料并带 metadata 检索。** 方法资料与球员报告用途不同，应使用独立来源和类型元数据。球员、比赛/赛事、赛季、报告日期、来源、许可状态可用于过滤；关键词检索适合专名和俱乐部名，语义检索适合“高位压迫下的边锋职责”等自然语言概念。[Microsoft 检索指南](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-information-retrieval)
3. **输出证据而不隐藏来源。** 每个报告观察带作者/机构、日期和链接；将报告原文观点、结构化比赛证据与 Agent 推断分开。外部文档作为不可信资料处理，不能把其中的指令当作工具或系统指令。[OWASP RAG 安全指南](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)
4. **单独评测检索与生成。** 用小型标注集检查应命中的片段、引用支持度、答案忠实度和 Agent 工具/追问决策；LLM-as-judge 只作补充。[RAGAS 指标](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/)

## 全 TypeScript 的本地实现路线

- **本地索引：**LanceDB JavaScript SDK 接受本地目录 URI，并支持全文搜索、向量查询和 metadata 条件过滤；可将服务端索引放在本地数据目录，通过 `KnowledgeIndex` 接口隔离，以便将来替换实现。[LanceDB 本地连接参数](https://lancedb.com/documentation/javascript/interfaces/ConnectionOptions/) · [LanceDB JavaScript 查询接口](https://lancedb.com/documentation/js/classes/QueryBase/)
- **本地向量：**Transformers.js 支持在 Node 22 服务端执行推理；当前配置使用 multilingual E5 的 q8 ONNX 量化文件，降低初次下载体积，并在首次使用时缓存模型权重。[Transformers.js Node 指南](https://github.com/huggingface/transformers.js/blob/main/packages/transformers/docs/source/tutorials/node.md) · [模型文件](https://huggingface.co/onnx-community/multilingual-e5-base-ONNX/blob/main/onnx/model_quantized.onnx)
- **模型候选：**`onnx-community/multilingual-e5-base-ONNX` 的模型卡标注 MIT、支持 94 种语言并提供 Transformers.js 用法；E5 检索按 `query:` 与 `passage:` 区分输入，输入会截断到 512 tokens。它可作为候选而非未经评测的最终选型；小型语料上测召回、延迟和下载体积后再固定。[模型卡](https://huggingface.co/onnx-community/multilingual-e5-base-ONNX)
- **混合检索：**关键词命中负责球员姓名、球队名和赛事名，语义向量负责概念描述；通过评测集检验组合召回，不按一个未校准的相关度数值推断证据质量。

## 已调查的足球内容来源

- **具名球员球探报告：**未找到现成语料同时明确允许自动抓取、持久文本/向量索引和 AI/RAG 处理。CIES Football Observatory 发布了有价值的具名球员报告，但公开下载不等于授权复用；旧报告示例保留版权，需事先书面许可。[CIES 报告目录](https://football-observatory.com/reports?nb=18) · [CIES 报告示例](https://football-observatory.com/IMG/pdf/ar2014_excerpt.pdf)
- **评估方法研究：**PLOS ONE 的足球表现分析研究声明 CC BY 许可，可在遵守署名要求和排除不在许可范围内的第三方材料后复用；内容讨论评估方法，不是具名球员报告。[PLOS ONE 研究](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0298346) · [CC BY 4.0 许可](https://creativecommons.org/licenses/by/4.0/legalcode)
- **球员身份与履历：**Wikidata/Wikipedia 可补充背景信息，但不构成球探判断；按 Wikimedia API、许可和署名要求使用。[Wikimedia 内容复用说明](https://www.mediawiki.org/wiki/Wikimedia_APIs/Content_reuse) · [API 访问政策](https://www.mediawiki.org/wiki/Wikimedia_APIs/Access_policy)
- **受限制的网站：**Transfermarkt 和 FBref 的条款对自动抓取及 AI 使用有明确限制；在取得相应授权前，不抓取其正文、不把正文送入模型或索引。逐站记录规则，不能把通用 robots 或页面可访问性当作授权。

CC BY 并未专门解释 RAG 或 LLM；将许可用于持久索引和模型处理，是基于其复制、传播和改编授权所作的判断，不是出版方针对 RAG 的专项批准。逐篇核对许可、第三方图片/图表、抓取条款及所用模型服务的数据留存政策。

## 落到项目中的决策

- 方法资料与球员报告分语料检索，当前共享 LanceDB 表并以语料元数据隔离；分别在能力画像阶段与候选初筛和比赛表现评估之后调用。
- 报告观察可以改变定性建议或后续调查顺序，但不转换成数值能力分；能由比赛数据核验的观察触发结构化核验，无法核验的标记为未证实。
- 来源登记通过后才采集正文并持久化；LanceDB 服务端本地索引与浏览器的招募计划存储分离。默认以 Transformers.js 本地 embedding 生成向量；兼容 OpenAI 的远程 provider 只有在显式配置时才启用，并把 endpoint 与模型计入索引兼容检查。
- 当前已实现 PLOS 官方元数据发现、登记 DOI 正文获取、许可门控、本地 LanceDB 混合检索及 LangGraph 双语料动作。尚未接入通用网页搜索、第三方球员 provider 或可用的具名球员报告来源；仍需制定来源刷新/删除策略并建立检索和证据评测集。

## 项目决策记录

- [许可感知的双语料 RAG 设计](../issues/10-permission-aware-rag-design.md)
- [来源访问、抓取边界与 provenance](../issues/09-data-source-access-and-provenance.md)
