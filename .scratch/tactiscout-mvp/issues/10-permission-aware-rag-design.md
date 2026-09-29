# 许可感知的双语料球探 RAG

Type: research
Status: resolved
Labels: wayfinder:research

## Question

如何在保持球探报告 RAG 价值的同时，让资料来源、检索顺序、候选建议和评测都有明确证据边界？

## Answer

采用两个独立语料：角色/战术方法资料用于把自然语言引援问题转成目标能力画像；球员报告提供候选线索和定性观察。先检索角色知识，再完成结构化候选筛选与比赛表现评估，之后检索球员报告补充解释。报告引出的新球员可回到结构化数据调查；报告观察可影响定性建议和后续考察优先级，但不能直接变成能力分。能由比赛数据核验的关键观察应触发核验；其余观察标注为未证实并保留来源、作者/机构和日期。

来源采用白名单。网页搜索可以发现潜在来源，但来源登记必须明确允许自动访问、正文保存与 AI/RAG 处理，抓取器才可取得正文并持久化。对于不明或不允许的来源，不抓取正文、不传给模型、不纳入索引；是否保留链接也要符合该来源条件。允许的语料和向量索引存放在服务端本地，和浏览器保存的招募计划分开；MVP 使用 LanceDB 本地目录。检索先按许可、语料和实体过滤，再融合向量与 BM25 式关键词排序。

向量默认由服务端本地 Transformers.js 模型生成；远程 embedding provider 只能作为显式配置的替代项。当前技术研究推荐 multilingual E5 ONNX 作为中英文语料的首个模型候选，最终模型需用标注集评测后固定；首次运行下载模型并缓存，改模型时重建向量。检索使用全文命中和向量语义的组合，按语料、来源许可与实体元数据过滤。

用小型标注集分开检查检索命中、答案引用是否受来源支持，以及 Agent 是否选择了正确的数据工具或必要的追问。LLM 评分只作辅助；缺少可靠球探排序标注时，不宣称候选排序准确率。完整数据源和许可调查见[足球数据源、网页检索与抓取边界](../research/football-data-sources-and-crawling.md)。RAG 检索与评测参考 [Microsoft 检索指南](https://learn.microsoft.com/en-us/azure/architecture/ai-ml/guide/rag/rag-information-retrieval)、[RAGAS 指标](https://docs.ragas.io/en/latest/concepts/metrics/available_metrics/) 和 [OWASP RAG 安全指南](https://cheatsheetseries.owasp.org/cheatsheets/RAG_Security_Cheat_Sheet.html)。

**已确认的选择：**双语料分开；来源采用许可门控与搜索发现/批准后入库；按“方法资料画像 → 结构化筛选和表现评估 → 球员报告观察 → 必要时回查结构化数据”编排；报告可影响定性建议但不转成分；LanceDB 服务端本地持久索引；本地 multilingual embedding 为默认并保留显式远程 provider 接口；小型标注集分项评测。

**当前实现范围：**来源登记文件、PLOS 官方 Search API 元数据发现、已登记 DOI 的正文采集与 CC BY 声明核验、许可门控的本地 JSON 入库、LanceDB 混合检索、球员实体硬过滤、LangGraph 双语料动作和来源出处报告。默认语料有一条项目作者方法摘要，尚无可许可的具名球员报告。

**仍需实现：**通用网页搜索 provider、来源专用正文采集器、刷新/删除与许可变更处理、可用的球员报告来源、最终 embedding 模型和基于真实材料的评测集规模/阈值。

## Comments
