# Ollama 本地模型选型：TactiScout

调查日期：2026-10-03
使用场景：Apple M4、24 GB 统一内存；中文自然语言转会需求；需要多轮澄清、工具调用、多步 Agent 编排和结构化输出。

## 结论

**首选 `qwen3.5:9b`，先用 Ollama 默认的非 MLX Q4_K_M 版本。**它在 Ollama 官方仓库中约占 6.6 GB，标注 256K 上下文；Qwen 官方模型卡同时列出较强的中文、多语言和通用 Agent 指标。对 TactiScout 来说，9B 比 4B 更值得作为主力模型，而 4B 是更快、更轻的对照组。M4 的 24 GB 统一内存足以先试 9B，但上下文设得越大，运行时内存越高；模型文件大小不是运行时总内存。

建议的首个下载命令：

```bash
ollama run qwen3.5:9b
```

如果模型回答速度太慢，再拉 `qwen3.5:4b` 对照。若 9B 的 Agent 任务表现仍不够，再试更重的 `gemma4:12b` 或 `gpt-oss:20b`。这是一项有证据支撑的初始选择，不代表已经在这台 M4 上实测完成了模型质量或速度对比。

## 候选对比

| Ollama 标签 | Ollama 仓库文件大小 / 上下文 | 对 TactiScout 的优点 | 主要取舍 |
| --- | --- | --- | --- |
| `qwen3.5:9b` | 6.6 GB / 256K；对应 `qwen3.5:9b-q4_K_M` | 首选。Qwen 官方报出的 BFCL-V4 为 66.1、TAU2-Bench 为 79.1；中文 C-Eval 为 88.2，多语言 MMMLU 为 81.2。 | 模型卡分数来自发布方评测，不等同于 Ollama 量化版在此项目上的实测。实际体验仍取决于提示、工具定义、上下文长度和运行时。 |
| `qwen3.5:4b` | 3.4 GB / 256K；对应 `qwen3.5:4b-q4_K_M` | 适合先体验延迟、低内存，作为本地模型对照。官方 TAU2-Bench 为 79.9，略高于 9B；中文 C-Eval 为 85.1。 | BFCL-V4 为 50.3，低于 9B 的 66.1；多语言 MMMLU 为 76.1。复杂的多轮追问和多工具决策更建议让 9B 先试。 |
| `gemma4:12b` | 约 8.0 GB / 256K | 有原生函数调用；Google 官方模型卡的 Tau2 平均成绩是 69.0%，MMMLU 为 83.4%。支持 35 种以上的开箱语言，并使用 140 多种语言的预训练数据。 | 可作为更大参数量的备选；目前找到的官方卡没有与 Qwen 同表、同口径的中文 C-Eval 和 BFCL-V4 分数，所以不据此断言谁的中文球探体验更好。 |
| `gpt-oss:20b` | 14 GB / 128K | Ollama 明确列出原生函数调用和结构化输出；OpenAI 说明其 20B 版面向本地、低延迟或专用场景。 | 24 GB 是统一内存，除权重外还要给系统、应用和上下文留空间；可尝试，但不作为第一只下载的模型。Qwen 的中文能力有更直接的官方评测数据。 |
| `lfm2.5:8b` | 5.2 GB / 125K | Liquid AI 将其定位为端侧 Agent，支持中文和工具使用；发布方报告 BFCLv4 48.50。 | Liquid AI 明确指出它不适合脱离 RAG 的知识密集型问答。球员解释必须依赖可靠数据和来源引用，因此可以作为轻量备选，但不先于 Qwen 9B。 |

型号文件大小和上下文来自 Ollama 官方模型目录与标签页；Qwen 指标来自 Qwen 官方模型卡；Gemma 指标来自 Google 官方模型卡；LFM 指标来自 Liquid AI 官方模型卡。不同发布方的分数可能采用不同提示、实现或测试设定，不能跨来源直接排名。表中的 Qwen 9B 与 4B 指标来自同一张官方模型卡，比较相对更有参考意义；依然不是应用实测。

## 为什么先用 Qwen 3.5 9B

- **中文与多语言有可见证据。**Qwen 官方卡中，9B 的 C-Eval 为 88.2、MMMLU 为 81.2；4B 分别为 85.1 和 76.1。C-Eval 是中文考试类基准，MMMLU 是多语言基准，不能将它们解读成球探专业知识准确率。
- **Agent 指标比 4B 更有优势。**同一张 Qwen 官方卡里，9B 的 BFCL-V4 是 66.1，4B 是 50.3；TAU2-Bench 分别为 79.1 和 79.9。TAU2 上 4B 略高，说明模型大小不能替代本项目的实际对话和工具调用评测。
- **显存/统一内存成本适中。**官方默认 Q4_K_M 约 6.6 GB，远低于 20B 方案的 14 GB。Ollama 也为 Qwen 9B 提供 8.9 GB 的 MLX 标签，但先选择非 MLX Q4_K_M，可把 MLX 引擎差异从首轮排错中去掉。
- **本项目现有 API 方向兼容，但需要实测。**Ollama 本地服务提供 OpenAI 兼容的 `/v1/chat/completions`；文档将 `tools` 和 `response_format` 列为支持项，但明确标记 `tool_choice` 不支持。当前 TactiScout 使用 `ChatOpenAI.withStructuredOutput` 生成 `RecruitmentAction`，由 LangGraph 根据结构化 action 执行对应工具，所以不依赖 OpenAI 强制选择工具的 `tool_choice`。Ollama 的 JSON Schema 约束支持也只覆盖子集；仍需用当前 Ollama 版本跑一轮项目自己的 Schema/Agent 冒烟验证。客户端的 API key 参数可填 `ollama`，服务端忽略该值。不能把“支持 tool calling”理解为模型一定会正确选择下一步。

Ollama 官方称其支持结构化输出，可将 JSON Schema 传入请求。建议用它生成需求解析草稿，再由应用验证必填字段、缺失项、预算格式和枚举值。澄清问题由图工作流判断“缺少什么信息”并暂停等待用户，而不是期待模型一次猜完整个转会策略。

当前 `@langchain/openai` 的 `withStructuredOutput` 对非 GPT-3/4 模型默认采用 JSON Schema 方法；TactiScout 现在的调用没有显式启用 `functionCalling`。因此本文所说的接入检查重点是当前模型/版本的 `response_format` Schema 约束与 Zod 解析；若以后改成把真实 LangChain tools 直接绑定给模型，还要注意 Ollama 的兼容接口不支持 `tool_choice`。

## Ollama API 与上下文设置

Ollama 当前文档建议 Agent、编码等长上下文任务至少设为 64K，并说明上下文越长，运行所需内存越多。这个通用建议不等于 24 GB Mac 一定适合直接设为 64K；可先用 16K 或 32K 跑 TactiScout 流程，观察是否截断和内存压力，再决定是否提高到 64K。这个起步值是针对本机的实践建议，不是 Ollama 官方保证。Qwen 页面列出 256K 原生上下文，但这不是 M4 上应默认打开的建议。

本地 OpenAI 兼容客户端连接参数：

```text
baseURL: http://localhost:11434/v1
apiKey: ollama
model: qwen3.5:9b
```

如果直接用 Ollama `/api/chat`，结构化输出通过 `format` 传 JSON Schema；通过 `/v1/chat/completions` 则使用其兼容的 `response_format`。两种请求都要在当前安装版本、当前模型标签上用一个小 Schema 验证，再接入真实工作流。

## MLX：值得关注，但不需要单独折腾

截至本次调查，Ollama 官方已发布 Apple Silicon MLX 推理引擎，模型仓库也提供带 `-mlx` 后缀的标签。Ollama 的 MLX 发布说明报告了 Apple Silicon 的速度和内存改进，但所列测试硬件包含 M5 系列，未给出本机 M4 的同模型对照；不能把其性能数字直接套用到这台 Mac。

Qwen 3.5 9B 的标签对比：

- `qwen3.5:9b` / `qwen3.5:9b-q4_K_M`：6.6 GB，非 MLX Q4_K_M。
- `qwen3.5:9b-mlx`：8.9 GB，Ollama MLX 标签。

2026 年 8 月合入的 Ollama PR 为 MLX 引擎补上了 JSON Schema 约束输出；PR 说明缺少 grammar 动态库时结构化请求会明确报错，并注明 JSON Schema 仅覆盖一个子集、约束生成目前不能使用 speculative decoding。旧版 Ollama 曾出现 MLX 接受但未执行 `format` 的问题；因此**装好后先更新到当前版本，并实测结构化输出**。若应用用 schema 可靠性优先，可先用普通 Q4_K_M 标签作为基线，再单独比较 `-mlx`。

## 建议的 MVP 评测方法

在给模型换成默认服务前，用同一组测试分别跑 `qwen3.5:9b` 和 `qwen3.5:4b`，至少包含：

1. 信息齐全的需求：例如“给拜仁找凯恩的替代者”，检查模型是否先把意图转成有依据的需求草稿。
2. 关键信息模糊：例如“给巴萨找个新后卫”，检查它是否提出少量、真正影响筛选的澄清问题，而不是臆造预算或年龄条件。
3. 有条件冲突：年龄、预算、位置或替代对象相互矛盾时，检查是否能停下来确认。
4. 工具调用链：需求解析 → 现有阵容/候选查询 → 对比/补查 → 汇报。记录误调用、重复调用、漏调用和调用次数。
5. 结构化输出：验证 Schema、必填项、缺失字段标记和中文字段值；不能只凭肉眼看 JSON 外形。
6. 证据约束：推荐理由是否引用真实数据，缺数据的适配维度是否明确标成未知。

选型指标应优先看“是否正确追问、工具调用是否恰当、JSON 是否通过校验、是否忠于数据证据”，其次才是首字延迟和 token/s。公开通用基准不能替代这些 TactiScout 场景测试。

## 官方来源

- [Ollama：Qwen 3.5 模型目录](https://ollama.com/library/qwen3.5)
- [Ollama：Qwen 3.5 全部标签与模型文件大小](https://registry.ollama.com/library/qwen3.5/tags)
- [Qwen：Qwen3.5-9B 官方模型卡与基准结果](https://huggingface.co/Qwen/Qwen3.5-9B)
- [Ollama：工具调用文档](https://docs.ollama.com/capabilities/tool-calling)
- [Ollama：结构化输出文档](https://docs.ollama.com/capabilities/structured-outputs)
- [Ollama：OpenAI API 兼容端点](https://docs.ollama.com/api/openai-compatibility)
- [Ollama：上下文长度与内存说明](https://docs.ollama.com/context-length)
- [Ollama：工具调用流式处理与上下文说明](https://ollama.com/blog/streaming-tool)
- [Ollama：Apple Silicon MLX 引擎说明](https://ollama.com/blog/mlx)
- [Ollama：MLX 结构化输出支持合并请求（2026-08-26）](https://github.com/ollama/ollama/pull/17929)
- [Google：Gemma 4 官方模型卡和基准](https://ai.google.dev/gemma/docs/core/model_card_4)
- [Ollama：Gemma 4 模型目录](https://ollama.com/library/gemma4)
- [Liquid AI：LFM2.5-8B-A1B 官方模型卡、工具使用和评测](https://huggingface.co/LiquidAI/LFM2.5-8B-A1B)
- [Ollama：LFM2.5 模型目录](https://ollama.com/library/lfm2.5)
- [Ollama：gpt-oss 模型目录](https://ollama.com/library/gpt-oss)
