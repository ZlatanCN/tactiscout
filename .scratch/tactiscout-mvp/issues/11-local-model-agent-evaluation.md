# 验收本地模型驱动的 LangGraph 球探闭环

Type: task
Status: resolved
Labels: ready-for-human

## Goal

让本机 Ollama 上的 Qwen 3.5 9B 稳定完成自然语言招募调查：只采用用户明确提出或数据支持的候选筛选条件，按需追问，并以真实评估证据形成报告。

## Current evidence

- `.env` 已配置 `qwen3.5:9b`、本机 Ollama OpenAI 兼容端点和 `reasoning_effort=none`。
- 结构化需求解析与一次 `needs_input` 对话分支已返回成功。
- 演示数据中有 3 名 23 岁以下中场；本地模型仍曾依据“为巴萨找人”推断 `La Liga 2023-24` 限制，导致候选为空。
- 一次期望得到完整候选报告的真实模型请求超过 150 秒，未能完成。

## Acceptance criteria

- 增加可重复的本地模型评估入口，记录每个模型 action、工具名、实际筛选范围、结果数量和耗时；不得记录密钥或暴露模型隐藏思维过程。
- 对“为巴萨找一名 23 岁以下、能踢中场、推进和前场压迫能力强的球员”完成完整链路：方法资料检索、候选发现、比赛数据评估、球员报告检索和报告生成。
- 目标球队只标记引援语境；未被用户指定时，联赛、赛事、赛季和最低分钟数不得作为筛选条件。
- 空结果必须与工具实际筛选范围一致；Agent 不得把自己推断出的条件说成用户明确要求。
- 对存在关键歧义的需求，Agent 在调查后提出一个有针对性的问题；用户回答后在同一案件继续。
- 报告推荐只包含已评估候选人，并引用服务端已计算的证据；数据不足时明确说明或保留空推荐。
- 文档记录本机完整闭环的端到端耗时，并说明当前上下文与调用预算。

## Reproducible evaluation

Run `pnpm eval:local-agent` with the API-compatible model variables from `.env`. It executes the standard Barcelona under-23 midfielder scenario against the configured player repository and local knowledge index. The added scenario suite can be run with `pnpm eval:local-agent -- --scenario all`; use `--runs 3` to repeat each registered case under fresh thread IDs and report per-case pass rate plus p50/p95 latency. The fixed suite covers the Barcelona midfielder case and Bayern/Kane clarification/resume case. Pass `--message "..."` to use another case; pass one or more `--answer "..."` arguments to require an investigated `needs_input` turn and resume it in the same LangGraph thread. The clarification run checks that a successful data tool call preceded the question, the question includes a reason, and each answer continues the same case; another `needs_input` is valid if the agent needs further clarification. Optional `--expected-position ST` checks that the role was searched and no returned recommendation crosses that position. The command writes a JSON summary and structured action/tool trace to stdout; it never records the API key, raw chat history, query text, player names, or hidden model reasoning. A non-zero exit means one or more acceptance checks failed. The trace records IDs actually evaluated and searched for reports. This harness evaluates behavior invariants only; ranking accuracy and RAG relevance are marked unmeasured until trusted labels and a sufficiently broad approved corpus exist.

The graph makes one model decision call per action, with at most 10 decisions per user turn. Per-turn tool budgets are: `inspect_team` 2, `search_methodology` 2, `search_candidates` 4, `evaluate_candidates` 3, and `search_player_reports` 2. Answering an interruption begins a new user turn and resets those per-turn budgets. There is currently no per-call model timeout; the evaluator records elapsed decision, tool, and end-to-end time.

On 2026-10-03, `ollama show qwen3.5:9b` reported a 9.7B Q4_K_M model with a maximum context length of 262,144 tokens; `ollama ps` during the evaluation reported an active runtime context of 4,096 tokens. TactiScout does not currently set `num_ctx`, so Ollama's runtime setting is the operative context budget and should be checked with `ollama ps` when the model is loaded.

## Comments

- 2026-10-03：第一次本机 Qwen 3.5 9B 运行在虚构演示数据上用时 60.1 秒，完成 5 次模型决策和方法检索、候选搜索、5项评估、报告检索及报告输出；没有推断联赛、赛季或分钟数筛选。但模型把泛称“中场”收窄成 `AM`，只评估 1 人。对抗性检查因此要求泛位置搜索保持宽范围。
- 2026-10-03：加入宽搜索后，第二次运行发现 5 名候选并全部评估，但模型在空的球员报告索引上反复调用报告检索，10 次决策后达到上限（264.1 秒），未保留用户明确说的巴塞罗那目标球队且没有推荐。已增加重复策略拒绝保护、一次检索覆盖所有已评估候选人的提示，以及严格的候选位置、球队语境、终止预算和证据推荐评估条件；最终真实运行待复核。
- 2026-10-03：标准巴塞罗那场景最终通过（180.2 秒，5 次模型决策，5 名候选全部评估，输出 2 个证据支持的推荐）。
- 2026-10-03：第一次拜仁/凯恩追问评估暴露出模型直接结束并跨位置推荐。补强提示词后，模型先查询凯恩本地记录（未命中），检索中锋候选，再于用户明确角色后继续查询 `ST`；演示数据无该位置候选，于是继续追问，没有输出跨位置推荐。真实运行 101.5 秒；首次追问发生在调查后，同案恢复与回答后继续检查通过。评估器支持多条 `--answer` 和可选 `--expected-position` 检查。
- 2026-10-03：加入 `--expected-position ST` 的真实复验通过，用时 110.6 秒。检查确认追问前已有调查、用户回答后恢复同案、模型继续按 `ST` 搜索且没有返回跨位置推荐。由于演示数据不含中锋，案件正确停在 `needs_input` 等待下一步选择；本次只证明工作流行为可运行，不代表重复采样下的统计稳定性。
- 2026-10-03：完整场景集的最新单轮运行与早期隔离运行结果不同。巴萨场景 40.7 秒完成全部 16 项行为检查，但 5 人评估后输出 0 项推荐；凯恩场景 143.5 秒内调查并同案续跑，但追问没有澄清角色，补答后又以 `position: null` 检索全部位置，评估 6 人后输出 0 项推荐。完整结果和评估边界见 [Agent Harness 行为评估套件](14-agent-harness-evaluation-suite.md)；约束丢失已列入 [issue 15](15-preserve-clarified-role-constraints.md)。

## Answer

早期隔离运行曾让 `qwen3.5:9b` 通过标准场景和追问/恢复场景；最新全量行为评估发现这些单次结果不稳定。巴萨场景完成数据检索和评估但输出 0 个推荐；凯恩场景虽能追问并恢复同一案件，却未澄清角色，并在用户回答后丢失中锋位置约束。此前通过只能证明链路在个别运行中可运行，不能证明约束能稳定遵守，也不构成推荐排序准确性评估。

LangGraph 负责有状态调查循环、条件路由、人工追问中断/恢复和调用预算。结论阶段由动态结构化 schema 限定目标球队、每名已评估球员的实际证据指标及已检索报告文档；服务端证据复核保留为第二道校验。

2026-10-03 本机标准场景通过：演示数据，180.2 秒；5 次模型决策、4 次工具调用；宽泛中场搜索命中 5 人并全部评估，检索到 2 个方法资料片段，球员报告 0 个片段；目标球队保留为 FC Barcelona，最终推荐 Ethan Brooks 与 Samir Haddad，均引用服务端计算的指标。所有 12 项标准场景检查通过。最后受限结论生成耗时 123.4 秒；目前运行时上下文为 4,096 tokens，尚无单次模型调用超时。本次完成证明端到端链路可运行，不代表已通过多次统计评估证明可靠性；最终结论的延迟仍需后续优化。
