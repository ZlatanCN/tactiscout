# 限制 LangChain / Ollama 本地模型的等待时间

调查日期：2026-10-04
适用仓库依赖：`@langchain/openai` 1.6.0、`@langchain/core` 1.2.13、`openai` 7.23.0（见 `pnpm-lock.yaml`）。以下 API 行为依据 LangChain、OpenAI、Ollama 官方文档和源码。

## 结论

- `ChatOpenAI` 构造参数 `timeout` 会传给 OpenAI JS 客户端，单位为毫秒。可在模型构造时设 `timeout: 60_000`，将单次结论生成请求限制在约 60 秒内。[LangChain ChatOpenAI 源码](https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-openai/src/chat_models/base.ts#L2696-L2699) [客户端选项构造](https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-openai/src/chat_models/base.ts#L3410-L3456)
- `ChatOpenAI` 把 `maxRetries` 交给 LangChain 的 `AsyncCaller`，其默认值为 6；ChatOpenAI 创建 OpenAI 客户端时则将 SDK 自身的 `maxRetries` 设为 0，以免两层重试叠加。因此可用构造参数 `maxRetries: 0` 禁止 LangChain 层的自动重试。[ChatOpenAI 重试实现](https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-openai/src/chat_models/completions.ts#L2540-L2557) [BaseLanguageModel 将构造参数交给 AsyncCaller](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/src/language_models/base.ts#L2178-L2191) [AsyncCaller 默认值](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/src/utils/async_caller.ts#L1745-L1762)
- OpenAI JS 客户端的默认请求超时是 10 分钟，且超时默认可重试两次；将 `maxRetries` 设为 0，可避免一次慢调用之后又自动重试。[OpenAI JS 超时与重试文档](https://github.com/openai/openai-node/blob/main/docs/configuration.md#retries-and-timeouts)
- 对 `invoke` 传入的 `AbortSignal` 会由 ChatOpenAI 转发给 OpenAI 请求。只依靠 LangChain `AsyncCaller` 的 `Promise.race` 超时并不会终止底层请求，因此取消信号必须能到达底层客户端；ChatOpenAI 当前实现已转发此信号。[ChatOpenAI 请求选项](https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-openai/src/chat_models/completions.ts#L1972-L1993) [AsyncCaller 的取消说明](https://github.com/langchain-ai/langchainjs/blob/main/libs/langchain-core/src/utils/async_caller.ts#L1861-L1885) [OpenAI JS 的 AbortSignal 文档](https://github.com/openai/openai-node#cancellation)
- Ollama 的 `/v1/chat/completions` 路由先经过 OpenAI 兼容中间件，再进入 `ChatHandler`；处理器把基于 HTTP 请求上下文的取消信号传入推理 runner。Go `net/http` 规定客户端断开时会取消服务端请求上下文。因此，SDK 超时导致请求中止时，当前 Ollama 源码路径会将取消传入推理过程。[Ollama 路由](https://github.com/ollama/ollama/blob/main/server/routes.go#L1791-L1799) [Ollama 推理处理器](https://github.com/ollama/ollama/blob/main/server/routes.go#L2593-L2610) [Go `Request.Context` 语义](https://pkg.go.dev/net/http#Request.Context)

## 建议配置

对本地结论调用先设 60 秒单次请求上限、关闭重试：

```ts
const conclusionModel = new ChatOpenAI({
  model: process.env.OLLAMA_MODEL ?? "qwen3.5:9b",
  apiKey: "ollama",
  timeout: 60_000,
  maxRetries: 0,
  configuration: {
    baseURL: "http://127.0.0.1:11434/v1",
  },
});
```

60 秒是适合先改善本地等待体验的起始值，不是 Ollama 的官方推荐或性能保证。超时应作为可识别错误处理，并保留已有的候选数据，让用户能重试结论步骤，而不用从头重跑检索。

## 限制

- 这里的 `timeout` 限制的是一次 OpenAI 兼容模型请求，不是整个 LangGraph 工作流；工具、前置分析和多个模型节点各有各的耗时。若需要“整次分析最多运行多久”，还需要在工作流层定义并传播总截止时间。
- Ollama 源码显示它会把请求取消传给推理 runner，但不同 runner、版本和客户端运行环境的具体停止时机仍应在安装版本上冒烟验证。特别是要区分“前端已经收到超时”与“本地推理确实停止占用资源”。
- 检查依据是仓库锁定版本与当前官方上游文档/源码；如果升级 LangChain 或 Ollama，应重新核对重试和取消路径。
