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
- 数据产品主线是 TactiScout 自建、版本化的球探证据集：对有出处的数据确定性地计算自有指标，复用第一方观察记录补充比赛情境；报告保留上游来源、样本与限制。数据适配器只是采集入口。首版边界和后续构建以 [issue 40](.scratch/tactiscout-mvp/issues/40-tactiscout-owned-scouting-dataset.md) 为准。
- LanceDB 本地索引、许可登记门控和 Transformers.js multilingual E5 q8 本地 embedding。第一次执行 RAG 检索时会下载量化模型权重并缓存。也可显式切换到兼容 OpenAI 的 embedding 服务；切换前要考虑文档会发送给该服务处理。

招募案件的 LangGraph checkpoint 默认保存在本地 SQLite 文件 `.data/recruitment-cases.sqlite`；可用 `TACTISCOUT_CHECKPOINT_PATH` 改位置。API 进程重启后，已暂停案件可通过原 `caseId` 恢复。浏览器中的对话记录和招募计划/报告快照仍由 `localStorage` 保存；浏览器数据与服务端图执行状态是两类独立数据。同一个案件在单个 API 进程内串行处理，不同案件可以并行。当前 SQLite saver 与进程内互斥适用于本机单进程原型；多进程部署需要共享 checkpoint 后端和跨进程互斥方案。

## 启动

需要 Node.js 22.13 或更高版本和 pnpm。安装依赖后，复制环境变量模板并配置模型服务：

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

网页固定使用 `http://127.0.0.1:5173/`；如果该端口已被占用，启动会明确失败，不会悄悄换到另一个可能陈旧的预览地址。未配置模型时，对话接口会明确返回 `503`，不会回退成机械筛选并伪称 Agent 正常工作。

API 默认只绑定 `127.0.0.1`，并拒绝非本机 `Host`、非本机网页 `Origin` 和浏览器标记的跨站请求。开发网页通过 Vite 同源代理访问 API；API 不启用反射式 CORS。

## 数据来源

数据路线是自建可追溯的数据产品：TactiScout 负责数据导入/采集、规范化、指标计算、版本和质量报告，保留底层来源及许可。第一方观察用于补充战术语境，不要求用户手工录完整球员库；观察档位只表示单场主观判断，不包装成统计能力分。首版固定有限的比赛范围和字段覆盖，不声称完整或实时转会市场。

工作台已有“球探观察”入口，可记录比赛中的球队、位置/职责、能力维度、观察者 1–5 档判断和具体依据。观察数据独立于统计快照保存，只在获得授权后进入 Agent/RAG 检索。

仓库提供 `pnpm dataset:refresh`，从 Figshare API 获取固定版本的 Wyscout 开放数据，核对 CC BY 4.0 元数据、文件大小与 MD5，再对本地原始文件计算 SHA-256 并构建快照。`pnpm dataset:build` 仍可在已有原始文件上离线重建。当前数据覆盖 2017/18 五大联赛 1,826 场比赛、98 支球队、2,561 名球员；它不是现役候选池。原始数据与 TactiScout 快照都留在 Git 忽略的 `.data/`，不随代码提交。

当前本机 `.env` 仍可将 `TACTISCOUT_DATA_MODE` 设为 `curated`，读取历史快照并运行现有链路；处理该来源前需显式确认 `TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED=true`。Agent 和最终报告会说明快照赛季、指标口径与来源，并禁止将历史球队/年龄/表现说成当前事实。要支持当前球员推荐，仍需取得一份更近赛季、覆盖足够且许可允许项目用途的公开数据；在此之前，产品只提供历史表现分析。

不把对球探网站批量抓取当成默认路线；来源必须支持项目所需的获取、保存、计算和模型处理用途。当前没有免费、许可清楚、最新、覆盖主要联赛且含细粒度能力指标的单一来源。StatsBomb 2023/24 德甲开放样本只有 34 场，适合特定案例分析，不足以作为完整联赛候选池。完整路线和候选数据集调查见 [issue 40](.scratch/tactiscout-mvp/issues/40-tactiscout-owned-scouting-dataset.md) 与[自建数据集调查](.scratch/tactiscout-mvp/research/self-built-scouting-dataset-feasibility-2026-10.md)。

第一方观察使用[单场采集规程](docs/scouting/first-party-observation-protocol.md)：建议先用单一赛事/赛季的 6 名中锋做 12 条球员—比赛样本，并对 3 条样本进行独立双人记录。工作台显示记录数、比赛上下文完整度和能力维度覆盖；小样本只用于案例比较，不代表球员市场或评分信度。

<details>
<summary>展开：已有历史与实验数据适配器的配置参考</summary>

接入 StatsBomb Open Data 的历史样本实验时，先准备本地数据集，并在 `.env` 设置：

```env
TACTISCOUT_DATA_MODE=statsbomb
TACTISCOUT_STATSBOMB_DIR=./data/statsbomb-open-data
TACTISCOUT_STATSBOMB_COMPETITION_IDS=11
TACTISCOUT_STATSBOMB_SEASON_IDS=90
TACTISCOUT_STATSBOMB_AI_PROCESSING_ALLOWED=false
```

赛事和赛季 ID 只是格式示例，请根据数据集文件选择。StatsBomb Open Data 覆盖部分赛事/赛季，不是完整职业球员数据库，也不能核实当前完整阵容、合同、预算、潜力或身体属性。使用前先在 StatsBomb Resource Centre 注册并阅读[官方数据使用协议](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)。协议没有明确授权云端 LLM 处理；默认设置会阻止 Agent 使用 StatsBomb。只有在确认协议适用于你的用法、明确开启 `TACTISCOUT_STATSBOMB_AI_PROCESSING_ALLOWED=true`，并把 `OPENAI_BASE_URL` 配置为 `localhost`、`127.0.0.0/8` 或 `::1` 等本机回环地址后，Agent 才会处理这些数据。不得将原始事件数据提供给第三方或随项目分发。公开、分享或分发基于数据的分析时，须标明 StatsBomb 来源并使用[官方 Media Pack logo](https://statsbomb.com/media-pack/)；商业用途不在该原型许可范围内。[官方 Open Data README](https://github.com/hudl/open-data)。

StatsBomb 适配器只在比赛事件和阵容覆盖完整、球员射门能对应到该场阵容、且分钟区间顺序连续时生成非点球 xG 证据：每 90 分钟非点球 xG，以及每次非点球射门的平均 xG。它聚合 `shot.statsbomb_xg`，排除点球和点球大战；缺少射门类型或有效 xG 时不生成该球员的 xG 证据，不把缺失值补成 0。阵容末段标记为 `Final Whistle` 但结束时间为空时，适配器用该场非点球大战时段的最后事件时间补足；缺少、空白或不完整的阵容会使对应赛事/赛季范围的 xG 证据不可用，缺少球员阵容记录或分钟区间逆序、重叠、不连续时则不发布该球员的 xG 证据。报告保留赛事/赛季、来源字段、出场分钟、样本场次和非点球射门数。这些是 StatsBomb 单次射门 xG 的 TactiScout 聚合统计，不等于终结能力评分或未来表现预测；它们不会自动进入职责评分。[StatsBomb xG 定义](https://statsbomb.com/soccer-metrics/expected-goals-xg-explained/) · [官方数据 schema](https://github.com/hudl/open-data/tree/master/doc)。

FBref adapter 是一个本地实验实现，不属于 TactiScout 自建数据集主线。Fastify 服务端会先读取五大联赛标准球员页，再串行读取传球、防守和持球页；每个请求至少间隔 1 秒。完整快照在单个 API 进程内缓存 24 小时，可用 `TACTISCOUT_FBREF_CACHE_TTL_MS` 调整；不会定时抓取。抓取器使用表格 `data-stat` 列名映射字段，保留 FBref 球员/球队/赛事 ID、球员来源链接和抓取时间。它不将球员跨俱乐部记录按姓名合并；页面没提供或抓取不到的指标保持不可用。任一页面遇到 403 或 429 时都会停止剩余读取，并在进程内冷却 24 小时，不重试也不绕过访问检查。

FBref 不是官方 API，也不是完整现役注册名单或完整转会市场；当前列表仅表示页面有表现记录的球员。年龄按出生日期及抓取日计算，位置只有来源提供的宽泛组别；位置未知和没有单一球队归属的记录不会进入候选筛选。FBref 的高级足球数据已在 2026 年缩减，不能假设 xG、推进或压迫指标持续存在。[当前 Big 5 标准统计](https://fbref.com/en/comps/Big5/stats/players/Big-5-European-Leagues-Stats) · [FBref 2026 数据更新公告](https://www.sports-reference.com/blog/2026/01/fbref-stathead-data-update/)。Sports Reference 当前使用条款也明确写有对将其内容用于 AI prompting 的限制；非商业用途并不自动豁免。当前接入是用户选择的本地作品集原型实现，不应被描述为获得了站点授权；在公开部署或扩大自动访问前需取得适用许可或更换数据源。[使用条款](https://www.sports-reference.com/termsofuse.html)。

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

Wyscout 事件指标映射为：射门事件的标签 101 计进球、标签 301 计助攻、标签 302 计关键传球；传球事件计尝试，标签 1801 计成功传球。旧版数据中的关键传球不是射门助攻，因此射门助攻在此来源中保持不可用。项目还会根据传球起终点的进攻方向 x 坐标推算渐进传球：起终点均在本方半场需前进至少 30 米，跨越中线需至少 15 米，均在对方半场需至少 10 米；换算假设 100 个坐标点对应 105 米。次数/90 和成功率是 TactiScout 派生估计，不是 Wyscout 原生字段；只在相关坐标和成功/失败标签完整时显示。防守端增加 Ground defending duel 子事件次数/90 和标签 703 的明确胜出占比；占比以 701/702/703 为分母并保留中性结果 702，所以不是抢断成功率或通常意义的对抗胜率。[Wyscout 防守对抗定义](https://dataglossary.wyscout.com/defensive_duel/)。首发球员按 90 分钟、换人按记录分钟近似计算出场分钟；不含补时，也未校正红牌等特殊情况，所以每 90 分钟指标只是近似值。[Wyscout v2 事件与标签定义](https://support.wyscout.com/matches-wyid-events) · [渐进传球定义](https://dataglossary.wyscout.com/progressive_pass/) · [当前 Wyscout 关键传球定义及旧版兼容说明](https://dataglossary.wyscout.com/key_pass/) · [传球与成功标签定义](https://dataglossary.wyscout.com/pass/)。这些记录只代表 2017/18 历史表现，不是现役球员池、当前俱乐部或转会可行性证据。

Reep 可选本地注册表只用于跨来源身份映射，不提供球员表现、阵容或当前效力证据。需要时，从 [官方数据页](https://reep.football/data/)手动下载同一 release 的 `bridges.csv.gz`、`redirects.csv.gz` 和 release stamp；按页面给出的 `checksums.txt` 核对这两个文件后，再运行：

```bash
pnpm identity:reep import <bridges.csv.gz> <redirects.csv.gz> <release-stamp>
pnpm identity:reep resolve-source statsbomb-open-data <player-id>
pnpm identity:reep resolve-source wyscout-open-data <player-id>
pnpm identity:reep resolve-playerelo wyscout-open-data <player-id>
```

索引默认写入 `.data/reep/identity.sqlite`，可由 `TACTISCOUT_REEP_IDENTITY_DB_PATH` 配置查询时使用的路径。导入会流式读取 gzip 文件，只收录当前 TactiScout provider 与已知球员 namespace 的精确 ID bridge，并原子替换本地索引；它不会自动下载快照、访问 Reep API 或发送 ID 给 LLM。解析结果会保留 release stamp、来源 bridge 的 ID 与 redirect 状态、目标 bridge 的 ID 与 provider upstream status 和 rung；PlayerElo 冲突结果会列出全部 API-Football target owner，便于核查歧义来源。Reep 标记为 `de_corroborated`/`withheld` 的身份不会被当作已解析。映射只关联身份，不合并球员档案、表现指标、能力评分或推荐。Reep 请求在项目中注明来源和 release stamp；CC0 许可不能替代第三方数据权利说明。[Reep 下载与版本说明](https://reep.football/data/) · [namespace 与 redirect 说明](https://reep.football/get-started/)。

完成本地 Reep 索引后，可选择开启报告中的 Wyscout 历史样本：设置 `TACTISCOUT_WYSCOUT_ARCHIVE_DIR` 指向已下载的 Wyscout Open Data 目录，并在确认展示与本机报告保留范围后，将 `TACTISCOUT_WYSCOUT_HISTORICAL_REPORT_DISPLAY_ALLOWED` 和 `TACTISCOUT_WYSCOUT_HISTORICAL_LOCAL_RETENTION_ALLOWED` 都设为 `true`。该 enrichment 只在结论通过审查后运行，通过当前球员来源 ID → Reep ID → Wyscout player ID 精确关联；它不会按姓名匹配、发送给 LLM、进入能力评分或改变推荐顺序。报告逐条显示历史赛季、赛事、球队、分钟、可用统计、CC BY 4.0 署名及 Reep release/rung。未配置许可、索引或 Wyscout 文件时保持关闭或明确报告缺失；部分 bridge 覆盖会显示为部分匹配，不把无命中当成零表现。Reep 的 provider coverage 是按赛事部分覆盖，[官方覆盖表](https://www.reep.football/coverage/)不能据此推断每名候选人都有历史记录。

可选的 PlayerElo report-only 信号也只在证据审查后运行：API-Football 来源按原始 ID 直连，其他来源必须经本地 Reep registry 的唯一跨来源映射取得 API-Football ID，再调用 `getPlayer(id)` 并校验响应 ID；不会按姓名猜测。报告保存 Reep release、canonical ID 和 bridge rung。该信号不进入模型、战术评分或推荐排序。启用前必须配置 `PLAYER_ELO_API_KEY`，并将 `TACTISCOUT_PLAYER_ELO_REPORT_DISPLAY_ALLOWED` 与 `TACTISCOUT_PLAYER_ELO_LOCAL_RETENTION_ALLOWED` 显式设为 `true`；默认关闭。本机目前没有完成真实 PlayerElo API smoke，因此该路径的 live 命中率尚未验证。

</details>

## API

`POST /api/v1/recruitment/cases/:caseId/turns` 接受 `{ "message": "..." }`，返回 `needs_input` 或 `completed`。追问回答使用同一个 `caseId`，以恢复同一 LangGraph 案件。

`GET /api/v1/recruitment/cases/:caseId/progress` 返回该案件本轮最近最多 12 条实际 LangGraph 阶段事件。等待面板按时间顺序展示当前环节、已经过的环节和耗时；轮询不可用时仍显示启动状态和计时。阶段来自服务端受控文案，不暴露 prompt 或模型推理；界面不编造完成百分比或 ETA，阶段数量也不代表推荐质量。

工作台和生成的报告会标出实际数据范围：虚构演示、当前受限赛季记录，或独立历史比赛/聚合样本。报告还会列出本次已加载的球员记录数及实际出现的赛事/赛季；拿不到完整清单时会明确标为未知。历史数据不会被描述成现役阵容。

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

工作台顶部的“球探观察”可创建、查看、编辑和删除第一方观察。记录球员身份、观察日期/者、比赛、球队、位置与职责、优势、待核实风险和具体场景；provider 与球员 ID 可选，但必须一起提供。可展开“结构化能力观察”，选择项目自定义能力维度、1–5 主观档位、分钟和场景依据；这些档位不代表统计值，不会自动跨比赛平均，也不会进入职责适配分。外部 URL 仅作为出处链接，TactiScout 不会访问或抓取正文；不要把第三方报告全文粘贴进自录笔记。

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
