# TactiScout

TactiScout 是一个 TypeScript 足球球探研究原型。用户用一句自然语言描述阵容问题，LangGraph Agent 调查已配置的数据源、逐步建立目标能力画像、比较候选人，并给出可追溯的推荐和风险说明。

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
- LangGraph `StateGraph`：共享案件状态、模型决策与数据工具循环、条件路由、`interrupt` 人机交互、证据审核与 checkpoint。外层案件步骤由图控制，阶段内由模型按工具结果决定继续调查、补查、追问或结束。
- `@langchain/openai`：服务端调用兼容 OpenAI 的模型；密钥不会发送到浏览器。
- StatsBomb Open Data、本地虚构演示数据，以及可选的 Sportmonks、SkillCorner 和 Wyscout 球员数据 adapter。
- LanceDB 本地索引、许可登记门控和 Transformers.js multilingual E5 q8 本地 embedding。第一次执行 RAG 检索时会下载量化模型权重并缓存。也可显式切换到兼容 OpenAI 的 embedding 服务；切换前要考虑文档会发送给该服务处理。

招募案件的 LangGraph checkpoint 默认保存在本地 SQLite 文件 `.data/recruitment-cases.sqlite`；可用 `TACTISCOUT_CHECKPOINT_PATH` 改位置。API 进程重启后，已暂停案件可通过原 `caseId` 恢复。浏览器中的对话记录和招募计划/报告快照仍由 `localStorage` 保存；浏览器数据与服务端图执行状态是两类独立数据。同一个案件在单个 API 进程内串行处理，不同案件可以并行。当前 SQLite saver 与进程内互斥适用于本机单进程原型；多进程部署需要共享 checkpoint 后端和跨进程互斥方案。

## 启动

需要 Node.js 22 或更高版本和 pnpm。安装依赖后，复制环境变量模板并配置模型服务：

```bash
pnpm install
cp .env.example .env
```

在 `.env` 设置 `OPENAI_API_KEY`、`OPENAI_MODEL` 和可选的 `OPENAI_BASE_URL`。模型单次决策默认最多等待 180 秒，可用 `OPENAI_TIMEOUT_MS` 在 1–600 秒内调整；模型请求不会隐式重试。连接 Ollama 等需要指定推理级别的兼容服务时，可设置 `OPENAI_REASONING_EFFORT`；例如 Qwen 可用 `none` 关闭额外思考输出，缩短工具决策等待。随后分别启动 API 和网页：

```bash
pnpm dev
```

```bash
pnpm dev:web
```

打开 Vite 输出的本地地址开始对话。未配置模型时，对话接口会明确返回 `503`，不会回退成机械筛选并伪称 Agent 正常工作。

API 默认只绑定 `127.0.0.1`，并拒绝非本机 `Host`、非本机网页 `Origin` 和浏览器标记的跨站请求。开发网页通过 Vite 同源代理访问 API；API 不启用反射式 CORS。

## 数据来源

默认使用虚构演示数据，界面会显示数据来源。接入 StatsBomb Open Data 时，先准备本地数据集，并在 `.env` 设置：

```env
TACTISCOUT_DATA_MODE=statsbomb
TACTISCOUT_STATSBOMB_DIR=./data/statsbomb-open-data
TACTISCOUT_STATSBOMB_COMPETITION_IDS=11
TACTISCOUT_STATSBOMB_SEASON_IDS=90
```

赛事和赛季 ID 只是格式示例，请根据数据集文件选择。StatsBomb Open Data 覆盖部分赛事/赛季，不是完整职业球员数据库，也不能核实当前完整阵容、合同、预算、潜力或身体属性。公开研究时请遵守 [StatsBomb Open Data 使用条款](https://github.com/hudl/open-data)。

Sportmonks 是另一个可选 provider。其当前赛季模式从配置赛季逐页读取球队，再读取各队当前名单和该赛季表现。配置前须确认账户套餐包含目标联赛。**2026-10-04 核查的公开套餐页**列出 Starter：每月 €29（年付折算 €24/月），可选 5 个联赛，每实体每小时 2,000 次调用；xG 与 Pressure Index 另列为 €29/月起的附加包。页面还提供付费套餐 14 天试用；服务条款说明试用需要有效银行卡，期满前未取消会扣费。较早文档中的免费联赛覆盖信息可能已过时，应以账户当前 entitlement 为准。[套餐与定价](https://www.sportmonks.com/football-api/plans-pricing/) · [服务条款与试用](https://www.sportmonks.com/terms-of-service/)。例如：

```env
TACTISCOUT_DATA_MODE=sportmonks
SPORTMONKS_API_TOKEN=服务端私密 token
TACTISCOUT_SPORTMONKS_SEASON_IDS=当前赛季 ID,另一个已授权联赛的当前赛季 ID
TACTISCOUT_SPORTMONKS_COVERED_STATISTIC_TYPE_IDS=
TACTISCOUT_SPORTMONKS_AI_PROCESSING_ALLOWED=false
```

`TACTISCOUT_SPORTMONKS_COVERED_STATISTIC_TYPE_IDS` 必须按你的 Sportmonks 账户、联赛和订阅确认后填写；空值或未确认的指标不会被当作套餐已覆盖。当前映射支持 52 进球、79 助攻、80 传球尝试、81/116 成功传球、78 抢断、100 拦截、119 出场分钟和 122 长球。缺少某项覆盖配置时，该项不会参与球员评估；分钟字段必须确认可用。API v3 在统计明细中没有返回某个已确认覆盖的计数时按零处理。

`SPORTMONKS_API_TOKEN` 只由 Fastify 服务端读取。启动 Sportmonks 模式前，必须把 `TACTISCOUT_SPORTMONKS_AI_PROCESSING_ALLOWED` 明确设为 `true`；这表示部署者已核实其账户和条款允许将这些数据交给配置的模型处理。公开条款允许在自有产品中存储和展示数据，但本文核对的条款没有专门说明外部 LLM/embedding 处理；权限未确认时不要开启此选项。[Sportmonks 服务条款](https://www.sportmonks.com/terms-of-service/)。

provider 记录保留 Sportmonks 的球员、球队、赛事和赛季 ID，以及取得时间；不同来源 ID 不会按姓名自动合并。单个球员卡会显示数据来源与抓取时间。当前 adapter 只映射进球、助攻、传球、长球、抢断和拦截；不把成功盘带当成带球推进，也不把关键传球当成射门助攻。未覆盖的指标标为暂无数据，不会变成零或参与对应职责的适配计算。[球员统计字段](https://docs.sportmonks.com/v3/definitions/types/statistics/player-statistics)；该 API 不提供 GPS/追踪类距离、冲刺或速度数据。[统计说明](https://docs.sportmonks.com/v3/tutorials-and-guides/tutorials/statistics/players-statistics)。

Sportmonks adapter 的 endpoint 映射和 fixture 测试不依赖在线服务；真实联赛、套餐权限和返回字段仍须使用用户自己的 API token 验证。没有完成该账号联调前，不能把 Sportmonks 模式描述为已验证的真实数据结果。

SkillCorner Open Data 可作为可选的历史指标样例。当前 adapter 只读取本地的 2024/25 澳大利亚 A-League physical、passing 和 off-ball-run aggregate CSV；不会下载数据，也不会把原始球员数据放进仓库。手动取得文件后，放入 `.data/skillcorner-open-data/aggregates/`，文件名须为 `aus1league_physicalaggregates_20242025.csv`、`aus1league_passingaggregates_20242025.csv` 和 `aus1league_obraggregates_20242025.csv`。该目录已由 `.data/` 忽略。

设置 `TACTISCOUT_DATA_MODE=skillcorner` 前，必须分别确认并设置 `TACTISCOUT_SKILLCORNER_LOCAL_STORAGE_ALLOWED=true`、`TACTISCOUT_SKILLCORNER_AI_PROCESSING_ALLOWED=true` 和 `TACTISCOUT_SKILLCORNER_REPORT_DISPLAY_ALLOWED=true`。SkillCorner README 称样例数据由 SkillCorner 与 PySport 开放发布并请求署名，但仓库 MIT 文本没有明确说明这些球员级 CSV、LLM 处理或公开作品集展示的适用范围；相关权限未确认时，三项开关都保持 `false`。当前只读取以下可追溯指标：每 90 分钟高强度跑动/冲刺距离与次数、每 30 分钟持球的身后/套边跑动与穿线传球、向跑动传球成功率。每条报告保留原始字段名、provider ID、位置组、赛事/赛季与样本；缺失数值仍是暂无数据。补充指标只作为原始表现证据，不纳入既有职责评分。SkillCorner CSV 只代表历史 A-League 样例，不是当前完整转会市场或欧洲候选池。[官方数据说明](https://github.com/SkillCorner/opendata/blob/master/README.md) · [仓库许可](https://github.com/SkillCorner/opendata/blob/master/LICENSE) · [官方聚合指标归一化教程](https://github.com/SkillCorner/opendata/blob/master/notebooks/tutorials/01_Getting_Started_with_SkillCorner_Data/DATA_NORMALIZATION_BASICS.md)。

Wyscout Open Data 可作为具名历史事件分析数据源。Pappalardo 与 Massucco 发布的公开样本覆盖 2017/18 五大联赛，以及 2018 世界杯和 2016 欧洲杯；本 adapter 默认只保留 `type=club` 的比赛。数据项在 Figshare 标为 CC BY 4.0。手动从 [Figshare 数据集合集](https://figshare.com/collections/Soccer_match_event_dataset/4415000/5)取得 Players、Events、Teams、Competitions、Matches 项，解压至 `.data/wyscout-open-data/`；目录至少包含 `players.json`、`teams.json`、`competitions.json` 和配对的 `matches_*.json` / `events_*.json`。项目不自动下载原始数据，该目录由 `.data/` 忽略。

配置时使用：

```env
TACTISCOUT_DATA_MODE=wyscout
TACTISCOUT_WYSCOUT_DIR=./.data/wyscout-open-data
TACTISCOUT_WYSCOUT_COMPETITION_IDS=
TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED=false
```

按需设置赛事 ID。只有确认配置的模型服务可以处理这些数据后才把 `TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED` 改为 `true`；本机 Ollama 可让原始数据留在本机。候选来源标明 Pappalardo 等人 2019 年数据集与 CC BY 4.0；公开展示派生数据时应附上[论文 DOI](https://doi.org/10.1038/s41597-019-0247-7)、[许可链接](https://creativecommons.org/licenses/by/4.0/)和修改说明。CC BY 不授予隐私或肖像等其他权利。

Wyscout 事件指标映射为：射门事件的标签 101 计进球、标签 301 计助攻、标签 302 计关键传球；传球事件计尝试，标签 1801 计成功传球。旧版数据中的关键传球不是射门助攻，因此射门助攻在此来源中保持不可用。首发球员按 90 分钟、换人按记录分钟近似计算出场分钟；不含补时，也未校正红牌等特殊情况，所以每 90 分钟指标只是近似值。[Wyscout v2 事件与标签定义](https://support.wyscout.com/matches-wyid-events) · [当前 Wyscout 关键传球定义及旧版兼容说明](https://dataglossary.wyscout.com/key_pass/) · [传球与成功标签定义](https://dataglossary.wyscout.com/pass/)。这些记录只代表 2017/18 历史表现，不是现役球员池、当前俱乐部或转会可行性证据。

## API

`POST /api/v1/recruitment/cases/:caseId/turns` 接受 `{ "message": "..." }`，返回 `needs_input` 或 `completed`。追问回答使用同一个 `caseId`，以恢复同一 LangGraph 案件。

工作台和生成的报告会标出数据范围：虚构演示、历史比赛/聚合样本，或 Sportmonks 账号许可范围内的当前赛季球员池。报告还会列出本次已加载的球员记录数及实际出现的赛事/赛季；拿不到完整清单时会明确标为未知。历史数据不会被描述成现役阵容；Sportmonks 候选范围仅限服务器配置且账户已开通的赛事与赛季，真实账号覆盖尚未验证时仍需人工核对。

`GET /api/v1/dataset` 返回当前数据模式；`GET /api/v1/knowledge/status` 返回本地索引与许可登记的统计；`/api/v1/player-observations` 提供第一方观察记录的本地 CRUD；`GET /health` 返回服务状态。旧版一次性 `/api/v1/scout` 和 `/api/v1/requirements/parse` 暂时保留，以兼容已有调用。

## RAG 来源发现与入库

日常招募对话只搜索服务端本地索引，不会临时抓网页。来源发现和资料入库是单独的维护流程：PLOS 官方 Search API 仅返回文章元数据，不会把发现结果自动加入索引；导入前须在 `data/knowledge/sources.json` 登记来源、许可范围和允许语料。当前登记 1 篇 CC BY 4.0 足球表现分析方法论文，以及仅供用户自录观察使用的第一方来源；没有获准的外部具名球员报告语料。PLOS API 每分钟限 10 次、单次最多 100 条；当前命令把返回上限设为 20 条，适配器进程内请求至少间隔 6 秒，并保留 PLOS 署名要求。

```bash
pnpm knowledge:discover -- "soccer performance analysis"
pnpm knowledge:crawl -- 10.1371/journal.pone.0298346
pnpm knowledge:ingest -- path/to/approved-document.json
```

`knowledge:crawl` 只会抓取 `sources.json` 中明确登记的 PLOS DOI，并要求 API 返回 CC BY 声明；其他 DOI 在发出正文请求前就会被拒绝。入库工具会拒绝未登记来源、URL 超出来源范围、许可不匹配或不允许持久化/AI 处理的材料。发现来源与获准入库分开处理；不要把“公开可读”当作许可。服务端索引默认写入 `.data/knowledge/`，该目录不会提交到 Git。PLOS 的许可与程序化访问依据 [PLOS 使用条款](https://plos.org/terms-of-use/)、[PLOS 文章访问说明](https://journals.plos.org/plosone/s/help-using-this-site) 和 [PLOS API 限额说明](https://api.plos.org/solr/faq/)；搜索结果不会自动触发正文抓取。

每次检索都会重读来源登记。来源被移除或其语料、持久化、AI 处理权限被关闭后，同一运行中的知识库也会在下一次检索前过滤该来源。需要把一个来源从当前索引中移除时，可运行：

```bash
pnpm knowledge:purge-source -- plos-soccer-analysis-2024
```

此命令不要求来源仍登记，并会报告从当前 LanceDB 表版本删除的片段数；重复执行或来源/索引不存在时结果为 0。LanceDB 保留旧数据集版本以支持时间点恢复，因此这会使片段从当前索引和检索中消失，但不等于安全擦除磁盘上的所有历史字节。需要物理清理时，必须先停止所有使用该索引的进程，再按 LanceDB 的版本清理策略处理；`deleteUnverified` 在有其他进程使用数据集时可能导致损坏，不能在在线服务期间盲目启用。

embedding 默认在本机运行，不需要 API 凭据。若明确选择远程兼容服务，在 `.env` 设置 `TACTISCOUT_EMBEDDING_PROVIDER=openai_compatible`，并填写 `TACTISCOUT_EMBEDDING_API_KEY`、可选的 `TACTISCOUT_EMBEDDING_BASE_URL` 和 `TACTISCOUT_REMOTE_EMBEDDING_MODEL`。远程模式会把索引文本和查询文本发送到配置的服务。一个 LanceDB 索引只允许使用同一个 embedding 模型；更换 provider、模型或端点后，先删除 `.data/knowledge/`，再重新导入资料。

## 球探观察记录

工作台顶部的“球探观察”可创建、查看、编辑和删除第一方观察。填写球员姓名、观察日期、观察者、比赛情境、优势、待核实风险和具体场景；provider 与球员 ID 可选，但必须一起提供。外部 URL 仅作为出处链接，TactiScout 不会访问或抓取正文；不要把第三方报告全文粘贴进自录笔记。

保存记录前必须明确同意写入本机 `.data/player-observations.json`；可用 `TACTISCOUT_PLAYER_OBSERVATIONS_PATH` 更改路径。把“允许加入 Agent 检索与模型分析”留空时，记录只保存在本机，不进入 RAG。逐条开启后，观察才会写入既有 LanceDB 球员报告语料。若模型或 embedding 配置为远程服务，观察文本可能发送给该服务。取消模型处理授权会先移除当前索引中的对应文档；取消本地保存授权会删除记录。

这份 JSON 文件库面向单机、单 API 进程；不要让多个服务实例共享同一个观察文件。撤回会让内容从当前 LanceDB 表版本和检索结果中移除，不代表物理擦除 LanceDB 为时间点恢复保留的旧版本字节。确需物理清理时，先停止所有使用索引的进程，再按维护步骤清理历史版本。

球探观察是作者的主观线索，不是比赛统计或已独立核实的事实，也不直接参与能力评分。Agent 报告会保留观察者、日期和参考出处，并标记尚未核实的观点；只有比赛数据证据关联上时才附带相应指标，仍需人工核实语义。

如果观察文档带有数据来源 ID，TactiScout 要求来源与候选 ID 匹配；已记录的 ID 不匹配时不会退回姓名猜测。文档没有来源 ID 时，只有当文档所列姓名只对应本轮一位候选的规范化完整姓名，才按姓名关联；文档姓名与多位候选相符（包括别名撞上另一位候选姓名）时会跳过关联。浏览器端 API 也拒绝非本机网页与跨站请求。

## 验证

```bash
pnpm test
pnpm build
pnpm build:web
```

`pnpm eval:local-agent` 会调用 `.env` 中配置的本地模型，运行一条真实的 LangGraph 招募案件，并输出不含密钥、原始对话和模型隐藏推理的 JSON trace。评估集登记了巴萨 U23 中场招募，以及拜仁寻找凯恩接班人的“先调查—追问—补答—同案续查”场景。运行全量场景一次：

```bash
pnpm eval:local-agent -- --scenario all
```

重复运行以观察本机模型的波动，并汇总每场景的通过率与 p50/p95 耗时：

```bash
pnpm eval:local-agent -- --scenario all --runs 3
```

也可以按场景 ID 单独运行，如 `--scenario bayern-kane-replacement`。自定义需求仍可用 `-- --message "..." --answer "..."`；补答参数可重复，`--expected-position ST` 可检查自定义场景的搜索和推荐位置。每次运行使用新的案件 ID。工具 trace 记录动作、结构化筛选、候选 ID、结果数和耗时；姓名查询只记录是否使用了姓名过滤，不输出姓名、原始查询或历史内容。

评估只对场景契约列出的硬性行为作通过/失败判定；缺少球探排序标签时，不评推荐排序准确率。当前许可语料也不足以给 RAG 相关性打分，输出会明确标记为未评估。单次通过证明该次链路可运行；它不等于可靠性、统计显著性或推荐质量证明。详细范围见[Agent Harness 行为评估套件](.scratch/tactiscout-mvp/issues/14-agent-harness-evaluation-suite.md)。

传入一个或多个 `--answer` 后，评估器会检查 Agent 是否先成功调用数据工具、再追问，以及每次回答后是否在同一案件继续；若 Agent 需要再澄清，未提供下一条答案时以 `needs_input` 结束仍可通过同案续查检查。例如：

```bash
pnpm eval:local-agent -- --message "为拜仁寻找凯恩的替代者" --answer "请按中锋职责，优先未来接班" --expected-position ST
```

该评估会实际调用模型，耗时取决于本机推理速度。

确定性测试通过 Fastify HTTP 边界和前端 API 契约验证追问/恢复、检索顺序、来源许可门控与证据报告，并使用注入的规划器、embedding 和固定球员记录，不依赖模型密钥或在线数据源。计划存储测试覆盖快照更新、版本迁移和损坏数据保护。
