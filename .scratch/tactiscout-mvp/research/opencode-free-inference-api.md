# OpenCode 免费模型 API 接入调查

研究日期：2026-10-02。核对 OpenCode 官方文档、官方实时模型列表，并复测项目当前配置使用的请求；不记录或展示 API 密钥。

## 结论

**先前“OpenCode 免费 API 接不了”的说法太绝对。**OpenCode 现在公开了 Console Inference API，文档说明应用可以直接调用与 OpenAI、Anthropic、Gemini 兼容的接口；其中免费 chat 模型按文档可以不带 Authorization 调用。`mimo-v2.6-flash-free` 也出现在当前 `/inference/v1/models` 实时列表中。官方文档给出的 OpenAI Chat Completions 路径是 `https://opencode.ai/inference/openai/v1/chat/completions`。[Inference API 文档](https://opencode.ai/v2/docs/console/inference)；[实时 Inference 模型列表](https://opencode.ai/inference/v1/models)

**但当前实际调用仍被 OpenCode 拒绝。**2026-10-02 使用上面的规范路径、模型 `mimo-v2.6-flash-free` 和最小 Chat Completions 请求复测：不带 Authorization 返回 HTTP 403，错误为 `FreeTierError: OpenCode's free tier can only be used from within OpenCode`；带项目本地配置的凭据也返回相同错误。因而“文档上支持”与“当前服务实际放行”存在冲突。不能据文档承诺 TactiScout 目前能成功使用该免费模型。

实践判断：**接口形状和模型存在；当前免费访问不可用/被服务端门控。**请求使用官方列出的接口、模型和 Chat Completions 格式，因此不能简单归因于路径或请求格式。需要 OpenCode 解释/修复服务端策略后再接入验证。不要用伪造 OpenCode 客户端标识来绕过门控。

## 两组路径不是一回事

| 用途 | 路径 | 官方说明与当前观测 |
| --- | --- | --- |
| OpenCode Zen 模型网关 | `https://opencode.ai/zen/v1/chat/completions` | Zen 模型目录把 `mimo-v2.6-flash-free` 列为 Chat Completions 模型。该 Zen 免费通道对本次应用请求返回“只能在 OpenCode 内使用”的 403。 [Zen 模型目录](https://opencode.ai/docs/en/zen/) |
| Console Inference API | `https://opencode.ai/inference/openai/v1/chat/completions` | v2 文档将它列为给应用直接调用的 OpenAI 兼容接口；文档说免费 chat 模型可以不带服务账号 key。模型实时列表也含该模型。但实际 POST 同样返回上述 403。 [Inference API 文档](https://opencode.ai/v2/docs/console/inference)；[实时模型列表](https://opencode.ai/inference/v1/models) |

旧设置若把 `OPENAI_BASE_URL` 指向 `/zen/v1`，就走 Zen 网关；改成 `/inference/openai/v1` 才是 Console Inference API 文档指定的 OpenAI-compatible base URL。两者都基于同一域名，也都可能列出同名模型，但不应混为同一个 API 路由。

## 官方文档核实

- Console Inference API 文档说服务端从 `https://opencode.ai/inference` 提供 OpenAI、Anthropic、Gemini 兼容 API；OpenAI Chat Completions 路径是 `/inference/openai/v1/chat/completions`。免费 chat 模型可以不传 Authorization；付费模型要求 Console 创建的 service account key。 [Inference API 文档](https://opencode.ai/v2/docs/console/inference)
- 文档把 `mimo-v2.6-flash-free` 列在实时 Inference 模型列表中，当前调用形态是 OpenAI Chat Completions。 [实时 Inference 模型列表](https://opencode.ai/inference/v1/models)
- Zen 文档也列出了同一模型名、`/zen/v1/chat/completions` endpoint，并把它标成免费模型。 [Zen 模型目录](https://opencode.ai/docs/en/zen/)
- Console 模型页注明 MiMo-V2.6-Flash Free 仅限一段时间免费，并注明免费期间收集到的内容可能用于改进模型。 [Console 模型目录](https://opencode.ai/v2/docs/console/models/)
- 因此，免费 API 的“官方支持”有明确文档依据；本次 403 是服务端行为与公开文档不一致，公开文档没有说明这条门控如何判定，也没有提供在拒绝时适用的替代免费路由。

## 社区里常见的接入方式

1. **直接作为模型供应商。**这是最贴近 TactiScout 的做法：在服务端用 OpenAI 兼容 SDK，指定 OpenCode 的 base URL、模型 ID 和相应 API key。OpenCode 的模型目录明确列出供应用直接调用的 endpoint 与 AI SDK 包；Zen 文档也有按模型区分的接口路径。之前一些用户分享的 `OPENAI_BASE_URL=https://opencode.ai/zen/v1` 属于这种模式。 [Console 模型目录](https://opencode.ai/v2/docs/console/models/)；[Zen 模型目录](https://opencode.ai/docs/en/zen/)
2. **把 OpenCode 当作本地 Agent 服务。**用官方 `@opencode-ai/sdk` 连到 `opencode serve`，创建 OpenCode session，再发送 prompt、读取 message/part。这调用的是 OpenCode 自己的会话、模型和工具 harness，不是普通的 OpenAI Chat Completions 后端。 [SDK 文档](https://opencode.ai/docs/sdk/)；[Server API 文档](https://opencode.ai/docs/server/)
3. **在第三方客户端前放兼容代理。**GitHub 上已有小型社区 gateway/proxy 把 Zen 的多个模型协议转换成 OpenAI、Anthropic 或 Responses API，面向 Codex、Claude Code、Cursor、LangChain 等客户端。至少一个项目声称会模拟免费层要求的 OpenCode 请求特征。这是非官方方案，随着上游门控变化可能失效；它不等于 OpenCode 对第三方免费调用的稳定支持。 [opencode-gateway 示例](https://github.com/Echoxiawan/opencode-gateway)；[opencode2api 示例](https://github.com/jasonxu114514/opencode2api)

### 对本项目这次 403 的含义

- 你的原始配置采用的 `baseURL + key + model ID` 是标准的直接供应商集成方式；OpenCode 文档本身也明确支持应用直接请求模型 endpoint。因此不应把这次失败简单归结为你不会接 API。
- 最近 OpenCode 仓库的用户报告记录了第三方客户端在免费模型上收到相同 403，包括不同语言/SDK；其中有报告指出官方 OpenCode 客户端与外部客户端结果不同。它们是用户 issue，而非维护方对策略的正式说明，但与本项目复测相互印证。 [issue #49433](https://github.com/anomalyco/opencode/issues/49433)；[issue #49621](https://github.com/anomalyco/opencode/issues/49621)
- 如果要继续用 OpenCode 做真实外部模型后端，按官方路径接入有计费额度的模型更合适；本次没有请求付费模型，也没有验证用户当前 key 是否为 Console service account key。若选择该方向，应该先在服务端做一次小额请求验证并设置账单上限。
- 如果想把 OpenCode 自身的工具循环也交给它，才考虑本地 Server + SDK；对 TactiScout 来说这会把一部分 agent orchestration 交给 OpenCode，因此和“让 LangGraph 成为主 harness”的目标不同。

## 复测记录

请求使用 `POST https://opencode.ai/inference/openai/v1/chat/completions`，模型 `mimo-v2.6-flash-free`，消息为 `Reply with exactly: OK`，`max_tokens` 为 16：

1. 无 Authorization：HTTP 403，返回 `FreeTierError`，提示免费层只能从 OpenCode 中使用。
2. 携带项目本地配置的凭据：HTTP 403，返回相同错误。凭据值未记录；它是否为 Console service account key 未独立核实。即便如此，无 Authorization 的测试已经与官方“免费 chat 模型可不带 key”用法一致。
3. 只请求 `GET https://opencode.ai/inference/v1/models`：HTTP 200，返回列表包含 `mimo-v2.6-flash-free`。列表可见只证明模型被公布，不证明推理请求会获准。

此节记录的是本工作区同日复测结果。若 OpenCode 后续修正文档或服务端门控，应按相同请求重新验证；当前没有必要继续调整 SDK 参数。

## 对 TactiScout 的建议

1. 将 OpenCode Console Inference 作为**文档上兼容、待服务端验证**的 provider 选项，不把它当成已可用的免费依赖。
2. 不要把凭据放到浏览器端。需要凭据的付费模型调用应从 Fastify 服务端发出，使用 Console 创建的 service account key；Free-tier 文档虽允许不带 key，当前却仍返回 403。
3. 在正式接入前先跑一个服务端 health/smoke 请求，要求收到 HTTP 200、解析到正常 assistant 内容后再启用 provider。失败时显示 provider 错误并保留本地/演示流程。
4. 继续使用本地 Ollama 或其他稳定提供者作为可运行开发路径；如果必须零费用，先等 OpenCode 对上述 403 与 v2 Inference 文档矛盾给出说明，或选择服务端明确允许第三方调用的免费 provider。

## 来源

- [OpenCode Console Inference API](https://opencode.ai/v2/docs/console/inference)
- [OpenCode Console Inference 实时模型列表](https://opencode.ai/inference/v1/models)
- [OpenCode Console 模型目录](https://opencode.ai/v2/docs/console/models/)
- [OpenCode Zen 模型目录与端点](https://opencode.ai/docs/en/zen/)
- [OpenCode JS/TS SDK](https://opencode.ai/docs/sdk/)
- [OpenCode Server API](https://opencode.ai/docs/server/)
- [OpenCode 项目 issue #49433](https://github.com/anomalyco/opencode/issues/49433)
- [OpenCode 项目 issue #49621](https://github.com/anomalyco/opencode/issues/49621)
