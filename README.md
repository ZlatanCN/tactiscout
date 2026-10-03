# TactiScout

TactiScout 是一个 TypeScript 足球球探研究原型。用户用一句自然语言描述阵容问题，LangGraph Agent 调查本地足球数据、逐步建立目标能力画像、比较候选人，并给出可追溯的推荐和风险说明。

## 对话链路

```text
用户描述需求
  → LLM 选择下一步调查动作
  → LangGraph 检索角色/战术方法资料，协助建立能力画像
  → 结构化筛选候选并评估比赛数据
  → 再检索许可登记内的球员报告，补充定性观察
  → 报告发现新名字时，回到结构化检索和数据核验
  → 工具证据回到案件状态，LLM 再决定下一步
  → 需要用户补充时 interrupt 暂停；同一案件收到回答后恢复
  → Reviewer 校验推荐是否引用已计算的证据
  → 返回逐人推荐、可观测指标、样本与数据限制
```

年龄、位置、预算等不是开场必填字段。Agent 只有在答案会明显改变候选评估时才追问。数据覆盖无法回答的问题会作为限制说明；历史比赛阵容不作为当前完整阵容。

若 StatsBomb 有阵容记录但缺少对应比赛事件文件，球员仍可作为调查线索出现，但不生成表现指标或推荐依据；没有传球尝试时，传球成功率会标为不可用而不是 0。

球员报告是带出处的定性线索，不能直接折算成能力分。当前仅预置一条根据 CC BY 方法论文撰写的项目摘要；没有预置具名球员报告语料，所以报告检索为空时会明确显示。

用户可以用可选的可搜索球队选择器补充目标球队。招募计划、对话记录和最近一份完整报告保存在浏览器 `localStorage`，旧版本单次分析计划会迁移成历史报告快照。删除浏览器站点数据会移除本地计划。

## 技术结构

- React + TypeScript：自然语言对话、追问输入、证据报告、候选人比较和本地计划。
- Fastify：对话案件 HTTP 接口与共享 Zod 请求/响应契约。
- LangGraph `StateGraph`：共享案件状态、模型决策与数据工具循环、条件路由、`interrupt` 人机交互、证据审核与 checkpoint。
- `@langchain/openai`：服务端调用兼容 OpenAI 的模型；密钥不会发送到浏览器。
- StatsBomb Open Data 适配器与清楚标注的虚构演示数据。
- LanceDB 本地索引、许可登记门控和 Transformers.js multilingual E5 q8 本地 embedding。第一次执行 RAG 检索时会下载量化模型权重并缓存。也可显式切换到兼容 OpenAI 的 embedding 服务；切换前要考虑文档会发送给该服务处理。

当前图使用 `MemorySaver`。它可在 API 进程存活期间暂停并恢复案件；API 进程重启后，图的内部工具状态会丢失。浏览器仍保存可见对话和最近报告，但这不能恢复内部检查点。若用户尝试继续已失效案件，接口会返回明确提示，保留原有浏览器记录并要求新建案件、重述需求。持久化图状态需要另选 checkpoint 存储；它与用户计划存储是两个独立问题。

## 启动

需要 Node.js 22 或更高版本和 pnpm。安装依赖后，复制环境变量模板并配置模型服务：

```bash
pnpm install
cp .env.example .env
```

在 `.env` 设置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和可选的 `OPENAI_BASE_URL`。连接 Ollama 等需要指定推理级别的兼容服务时，可设置 `OPENAI_REASONING_EFFORT`；例如 Qwen 可用 `none` 关闭额外思考输出，缩短工具决策等待。随后分别启动 API 和网页：

```bash
pnpm dev
```

```bash
pnpm dev:web
```

打开 Vite 输出的本地地址开始对话。未配置模型时，对话接口会明确返回 `503`，不会回退成机械筛选并伪称 Agent 正常工作。

## 数据来源

默认使用虚构演示数据，界面会显示数据来源。接入 StatsBomb Open Data 时，先准备本地数据集，并在 `.env` 设置：

```env
TACTISCOUT_DATA_MODE=statsbomb
TACTISCOUT_STATSBOMB_DIR=./data/statsbomb-open-data
TACTISCOUT_STATSBOMB_COMPETITION_IDS=11
TACTISCOUT_STATSBOMB_SEASON_IDS=90
```

赛事和赛季 ID 只是格式示例，请根据数据集文件选择。StatsBomb Open Data 覆盖部分赛事/赛季，不是完整职业球员数据库，也不能核实当前完整阵容、合同、预算、潜力或身体属性。公开研究时请遵守 [StatsBomb Open Data 使用条款](https://github.com/hudl/open-data)。

## API

`POST /api/v1/recruitment/cases/:caseId/turns` 接受 `{ "message": "..." }`，返回 `needs_input` 或 `completed`。追问回答使用同一个 `caseId`，以恢复同一 LangGraph 案件。

`GET /api/v1/dataset` 返回当前数据模式；`GET /api/v1/knowledge/status` 返回本地索引与许可登记的统计；`GET /health` 返回服务状态。旧版一次性 `/api/v1/scout` 和 `/api/v1/requirements/parse` 暂时保留，以兼容已有调用。

## RAG 来源发现与入库

日常招募对话只搜索服务端本地索引，不会临时抓网页。来源发现和资料入库是单独的维护流程：PLOS 官方 Search API 仅返回文章元数据，不会把发现结果自动加入索引；导入前须在 `data/knowledge/sources.json` 登记来源、许可范围和允许语料。当前登记了 1 篇 CC BY 4.0 足球表现分析方法论文，没有登记可用的具名球员报告来源。PLOS API 每分钟限 10 次、单次最多 100 条；当前命令把返回上限设为 20 条，适配器进程内请求至少间隔 6 秒，并保留 PLOS 署名要求。

```bash
pnpm knowledge:discover -- "soccer performance analysis"
pnpm knowledge:crawl -- 10.1371/journal.pone.0298346
pnpm knowledge:ingest -- path/to/approved-document.json
```

`knowledge:crawl` 只会抓取 `sources.json` 中明确登记的 PLOS DOI，并要求 API 返回 CC BY 声明；其他 DOI 在发出正文请求前就会被拒绝。入库工具会拒绝未登记来源、URL 超出来源范围、许可不匹配或不允许持久化/AI 处理的材料。发现来源与获准入库分开处理；不要把“公开可读”当作许可。服务端索引默认写入 `.data/knowledge/`，该目录不会提交到 Git。PLOS 的许可与程序化访问依据 [PLOS 使用条款](https://plos.org/terms-of-use/)、[PLOS 文章访问说明](https://journals.plos.org/plosone/s/help-using-this-site) 和 [PLOS API 限额说明](https://api.plos.org/solr/faq/)；搜索结果不会自动触发正文抓取。

embedding 默认在本机运行，不需要 API 凭据。若明确选择远程兼容服务，在 `.env` 设置 `TACTISCOUT_EMBEDDING_PROVIDER=openai_compatible`，并填写 `TACTISCOUT_EMBEDDING_API_KEY`、可选的 `TACTISCOUT_EMBEDDING_BASE_URL` 和 `TACTISCOUT_REMOTE_EMBEDDING_MODEL`。远程模式会把索引文本和查询文本发送到配置的服务。一个 LanceDB 索引只允许使用同一个 embedding 模型；更换 provider、模型或端点后，先删除 `.data/knowledge/`，再重新导入资料。

## 验证

```bash
pnpm test
pnpm build
pnpm build:web
```

`pnpm eval:local-agent` 会调用 `.env` 中配置的本地模型，运行一条真实的 LangGraph 招募案件，并输出不含密钥和模型隐藏推理的 JSON trace。可用 `-- --message "..." --answer "..."` 验证追问流程；传入一个或多个 `--answer` 后，评估器会要求 Agent 先调查再追问，并检查每次回答后是否在同一案件继续。若 Agent 需要再澄清，未提供下一条答案时会以 `needs_input` 结束，这仍算已验证同案继续。例如：

```bash
pnpm eval:local-agent -- --message "为拜仁寻找凯恩的替代者" --answer "请按中锋职责，优先未来接班" --expected-position ST
```

该评估会实际调用模型，耗时取决于本机推理速度。

确定性测试通过 Fastify HTTP 边界和前端 API 契约验证追问/恢复、检索顺序、来源许可门控与证据报告，并使用注入的规划器、embedding 和固定球员记录，不依赖模型密钥或在线数据源。计划存储测试覆盖快照更新、版本迁移和损坏数据保护。
