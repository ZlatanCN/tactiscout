# TactiScout MVP

Labels: wayfinder:map

## Destination

完成一个可演示、能写进简历的 TactiScout MVP：用户用自然语言描述球队的引援问题，Agent 调查可用数据、建立目标角色能力画像、比较候选球员，并给出能追溯到证据的推荐和风险说明。对话可以在调查过程中追问、接收补充并继续。

## Notes

- 首版重点是球员能力评估与推荐，不是把自然语言转换成大量筛选字段。
- 当前唯一现役候选池 provider 是可选 Sportmonks；它只覆盖账号开通并配置的赛事/赛季，真实账户联调仍待完成。StatsBomb、Wyscout 与 SkillCorner 提供有明确时间范围的历史比赛或聚合样本；默认 demo 数据是虚构的。产品必须区分这些来源范围、已查证事实、推断和数据缺口。
- 全 TypeScript；当前技术栈是 React、Fastify 和 LangGraph。
- 根目录 `CONTEXT.md` 是唯一领域词汇表；重要术语按其中定义使用。
- [MVP 规格](spec.md) 收录用户故事、接口约定和实现决策；[球探与 Agent 流程研究](research/football-recruitment-and-agent-workflow.md)记录来源与产品推导；[数据源与抓取边界研究](research/football-data-sources-and-crawling.md)记录联网能力、授权路线与数据出处设计；[RAG 实践与足球语料调查](research/scouting-rag-practices-and-sources.md)记录检索实践和可用来源；[LangGraph Agent 与 Harness 调研](research/langgraph-agent-harness-patterns.md)对比官方开源实现与 TactiScout 架构；[许可感知的双语料 RAG 设计](issues/10-permission-aware-rag-design.md)确定产品原则。
- [补充球员表现数据源调查](research/additional-player-evidence-sources-2026-10.md)比较 SkillCorner、Metrica、Wyscout、StatsBomb 和 football-data.org，记录字段增益、覆盖与数据使用边界。
- [具名球员表现数据许可与验证路径](research/player-performance-data-licensing-2026-10.md)核对 Wyscout、IDSSE、Metrica、OpenFootball 和 SkillCorner 的一手来源；Wyscout 2017/18 Figshare 数据项标明 CC BY 4.0，适合本机历史数据验证，不代表当前转会市场。
- [足球数据源扩展调查](research/football-data-source-expansion-2026-10.md)核对 Sportmonks、API-Football、football-data.org、OpenLigaDB 与开放历史数据；没有找到零预算且同时具备现役阵容、球员表现指标及可公开展示授权的主数据源，Sportmonks 最适合延续现有实时 provider。
- [Wyscout 真实数据 smoke test](research/wyscout-real-data-smoke-2026-10.md)记录对官方 Figshare 文件的本机联调结果：默认五大联赛共 2,682 条历史球员赛季记录，真实文件中的嵌套阵容与哨兵字段已由 adapter 覆盖；源文件哈希和出处保存在 Git 忽略目录。
- [issue 25：Wyscout 历史比赛事件 adapter](issues/25-wyscout-historical-event-adapter.md)代码、来源映射、合成回归夹具及官方 Figshare 五大联赛真实文件 smoke test 均已完成。
- [issue 26：阻止候选分页重复耗尽调查预算](issues/26-wyscout-agent-cursor-regression.md)已完成：按搜索范围维护候选游标、压缩结论上下文、为 Qwen 请求增加时限；本机 Wyscout/Qwen 最终复验 184.3 秒通过全部 18 项行为检查，结论调用 69.7 秒。
- 用户已授权继续实现；方向收敛后继续推进，不把项目留在纯计划阶段。
- 已实现对话案件 HTTP seam、LangGraph 工具决策循环与可中断追问；浏览器已改为自由对话入口，并保存对话和最近完整报告。
- 已加深结论证据策略与来源许可判定 module；Fastify 应用组合统一注入球员仓库和知识库，工具 trace 使用实际执行参数。详见 [Agent 架构加深](issues/12-agent-architecture-deepening.md)。
- 使用 Fastify 注入测试覆盖调查、追问、恢复与证据报告；前后端类型检查、行为测试和网页生产构建均通过。
- 已完成 [对话式招募案件 MVP](issues/08-conversational-case-mvp.md)：覆盖早期追问/结束保护、证据约束、证据覆盖摘要、案件状态失效提示、指标对比和 v1 计划迁移。
- 已接入许可感知的双语料 RAG：PLOS 元数据发现与登记 DOI 正文采集、本地来源许可登记、LanceDB 混合检索、本地 q8 multilingual E5 embedding 和 LangGraph 的“方法画像 → 结构化评估 → 球员报告”顺序保护。已实际完成登记论文的许可核验、113 个片段入库和本地语义检索；尚无可用球员报告来源。
- 本机 `.env` 已接入 Ollama `qwen3.5:9b`；[本地模型 Agent 验收](issues/11-local-model-agent-evaluation.md)保留早期隔离运行记录，后续评测会持续把模型能力与 harness 行为分开验证。已完成 [issue 15](issues/15-preserve-clarified-role-constraints.md)：明确确认的位置会约束同案续跑、候选评估和最终推荐。Harness 记录安全的工具轨迹，不评估无可信标签的球员排名。
- 已修复 [issue 17](issues/17-harness-candidate-page-validation.md)：候选搜索轨迹与评测器现在校验总匹配数、页 offset 和 nextOffset；未请求的姓名过滤、跳过首屏和空页隐藏候选都会使行为验收失败。
- 已完成 [issue 18](issues/18-preserve-target-team-context.md)：目标球队保存在 LangGraph 案件状态并单独传入 planner，不会变成候选俱乐部或联赛过滤条件。
- 已完成 [issue 19](issues/19-grounded-replacement-clarification.md)：替代者请求的参考球员不会被误作候选姓名过滤，年龄限制只采纳用户明确表达的内容；宽泛调查后再围绕未明确的职责提问，并在同一案件恢复。2026-10-04 本机 Qwen 3.5 9B 场景复验 1/1 通过所有 harness 检查，包括确认中锋职责后如实报告演示数据中无匹配球员；这不是推荐准确率或真实联赛覆盖证明。
- [issue 20](issues/20-licensed-player-provider-and-provenance.md) 的核心实现已完成：可选 Sportmonks provider 保留 provider/player/team/competition/season 身份、抓取时间与逐球员统计覆盖；部署者须显式登记账户已覆盖的统计类型，模型处理仍须先确认许可。球员卡显示来源与抓取时间；adapter 用 mock fixture 验证，真实账号与目标联赛联调待用户凭据及许可确认。
- 已完成 [issue 21](issues/21-open-player-report-corpus.md)：没有找到明确允许自动获取、持久化、AI/RAG 处理与用户展示的真实具名球员报告语料；优先发展自有授权观察记录。明确标注虚构的 MIT 数据集只适合作为测试夹具，不冒充真实球员。
- 已完成 [issue 22](issues/22-revoke-and-purge-knowledge-source.md)：每次检索重读许可，来源撤权对同一实例立即生效，并能从当前 LanceDB 表版本删除该来源行。旧历史版本的磁盘字节须另行停机维护清理，CLI 不会在线强制回收。
- 已完成 [issue 23](issues/23-first-party-player-observations.md)：工作台可创建、查看、编辑和删除本机球探观察；逐条控制持久化与 AI/RAG 授权；检索结果保留作者、球员身份、日期和出处。撤权会移除当前 LanceDB 表版本中的文档；历史版本的磁盘字节不保证物理擦除。
- [调查阶段反馈与有依据的追问](issues/16-progress-and-grounded-clarifications.md)已完成：长时间运行时显示 LangGraph 当前阶段、决策步数和耗时；参考球员无本地记录时，不再要求用户确认身份或未提出的联赛/赛季范围，并禁止依据模型记忆断言现役俱乐部/联赛。
- [LangGraph Agent 与 Harness 调研](research/langgraph-agent-harness-patterns.md)现包含 Deep Agents、Open Deep Research、Exa、Lyft、Kensho、AppFolio、Open SWE 及两个足球项目的公开做法；共同模式是外层显式编排、窄职责分支、结构化交接和轨迹评估，不追求 Agent 数量。
- [招募案件 checkpoint 跨重启恢复](issues/13-durable-case-checkpoints.md)完成：LangGraph 内部案件状态默认存本机 `.data/recruitment-cases.sqlite`，可用 `TACTISCOUT_CHECKPOINT_PATH` 改路径；追问暂停后 API 重启可由同一案件编号恢复。计划与可见历史仍在浏览器 `localStorage`。
- [LangGraph harness 行为评估套件](issues/14-agent-harness-evaluation-suite.md)现支持具名场景、重复运行、轨迹隐私净化、候选 ID 顺序校验和 Ollama 全场景检查。2026-10-04 真实 Qwen 回归发现并修复了“确认位置无候选后模型重复翻页/追问”：现在先征求是否放宽，拒绝后如实结束；同次两场景复跑均通过。单次场景通过不是推荐准确率证明。
- 使用 `.scratch/<feature>/` 保存地图、规格和单独的问题文件；本地 triage 标签沿用项目默认值。

## Decisions-so-far

- [防止候选分页耗尽 Agent 调查预算](issues/26-wyscout-agent-cursor-regression.md)：按搜索范围维护候选游标和评估去重；最终结论采用短提示与证据压缩历史，单次模型请求有界。真实 Wyscout/Qwen 单次验证通过，未验证候选排序准确率。

- [具名球员表现数据许可与验证路径](research/player-performance-data-licensing-2026-10.md)：以 Wyscout CC BY 4.0 历史比赛数据作为潜在的具名事件分析验证源；原始数据留在本机、保留署名并使用 Ollama。数据许可不授予隐私/肖像权，旧赛季不得用于当前引援事实。当前球员池仍需另一个经过账户与模型处理许可确认的实时 provider。
- [Wyscout 历史比赛事件 adapter](issues/25-wyscout-historical-event-adapter.md)：把 Wyscout 定为具名历史表现验证源；事件计数由程序确定性聚合，LangGraph 负责调查工具编排与追问，本机模型解释带来源的证据。只有授权当前赛季 provider 能形成当前球员池。
- [具名球员报告语料调查](issues/21-open-player-report-corpus.md)：没有找到明确允许自动获取、持久保存、AI/RAG 处理与面向用户展示的真实球员报告语料；近期优先做 TactiScout 自有授权观察记录，合成数据只作清楚标注的评测夹具。
- [来源撤权和索引清除](issues/22-revoke-and-purge-knowledge-source.md)：检索时重读来源登记、预过滤无权语料，并允许删除当前 LanceDB 表版本中的来源片段。旧数据集版本的物理清理需停止所有访问进程后单独维护。
- [使用全 TypeScript 和 LangGraph 组织球探流程](issues/01-typescript-langgraph.md)：继续现有 React、Fastify、LangGraph 架构。
- [LLM 解析自然语言招募需求后由用户确认](issues/02-llm-brief-confirmation.md)：这是早期的表单式方案；其“固定字段确认后筛选”流程已被对话式调查和多轮评估方向取代。
- [在 localStorage 保存招募计划和最近分析快照](issues/03-local-plan-snapshots.md)：手动重新分析并更新快照，不自动调度。
- [使用有球与无球职责模板表达战术画像](issues/04-phase-role-templates.md)：职责画像仅引用有证据的可观测指标，不复制 Football Manager 的官方职责目录。
- [以透明证据支持候选名单和球员比较](issues/05-shortlist-comparison.md)：比较 2–3 名球员，不使用未经验证的分数阈值。
- [保留开放足球数据的来源和适用边界](issues/06-data-scope.md)：标注 StatsBomb Open Data 覆盖范围，不能把历史数据冒充当前阵容。
- [以对话式能力评估与推荐为首版主线](issues/07-conversational-ability-evaluation.md)：暂缓非欧、工作许可、注册规则等细则；年龄、预算仅为可选辅助偏好。
- [实现对话式招募案件 MVP](issues/08-conversational-case-mvp.md)：以 LangGraph 调查循环、追问恢复和确定性证据摘要完成自然语言招募链路。
- [研究足球数据源与联网访问边界](issues/09-data-source-access-and-provenance.md)：当前只读本地数据；后续先建来源登记和证据出处，再接授权 API 或许可范围内的报告检索。
- [许可感知的双语料球探 RAG](issues/10-permission-aware-rag-design.md)：报告作为带出处的定性证据参与候选发现与后续考察，不直接成为能力分；通过小型标注集分别评测检索、证据支持和 Agent 决策。
- [Agent 架构加深](issues/12-agent-architecture-deepening.md)：集中结论证据和来源许可规则，统一应用运行依赖，去除重复工具 trace 分派。
- [招募案件 checkpoint 跨重启恢复](issues/13-durable-case-checkpoints.md)：以本机 SQLite 持久化 LangGraph 案件状态；同一案件轮次按 thread 串行，不同案件并行。
- [调查阶段反馈与有依据的追问](issues/16-progress-and-grounded-clarifications.md)：以案件级进度轮询呈现真实图阶段；将未请求的联赛/赛季范围追问作为策略违规反馈给 Agent，并继续调查用户已提供的角色。
- [保留追问确认的位置约束](issues/15-preserve-clarified-role-constraints.md)：将用户确认的细分位置放入案件状态，并在检索、评估、报告与最终推荐中执行；泛位置不自动收窄，空结果明确报告。
- [防止候选分页导致评测假通过](issues/17-harness-candidate-page-validation.md)：以匹配总数和返回游标校验候选发现，阻止跳页或未请求姓名过滤制造虚假空结果。
- [保留目标球队上下文](issues/18-preserve-target-team-context.md)：从明确招募短语初始化案件目标球队，将其单独传入 planner，并在后续动作和报告中继承。
- [将替代者调查与用户意图对齐](issues/19-grounded-replacement-clarification.md)：参考球员和推断年龄不作为筛选条件；先宽泛调查，再在同案中确认角色并按答案续跑。
- [接入许可感知的实时球员 provider](issues/20-licensed-player-provider-and-provenance.md)：来源身份、provider 统计覆盖、抓取时间和模型处理许可门槛随候选记录保留；Sportmonks 的真实账号联调仍待完成。
- [在工作台和报告中说明数据范围](issues/27-visible-dataset-scope.md)：让用户区分虚构演示、历史样本与限定范围的当前球员池；报告保存已加载记录数及赛事/赛季清单，取不到时明确标为未知，避免把某个 provider 说成完整市场。
- [寻找可入库的具名球员报告语料](issues/21-open-player-report-corpus.md)：以一手来源验证球探报告的自动访问、持久化、AI/RAG 和展示权，选定可用来源或记录无可验证授权的结论。
- [撤销知识来源并清除索引](issues/22-revoke-and-purge-knowledge-source.md)：运行中读取最新来源许可、检索前过滤失效语料，并显式删除某来源在当前本地索引版本中的片段。
- [第一方球探观察记录](issues/23-first-party-player-observations.md)：在本机维护具名比赛观察，以分开的逐条许可控制保存和 Agent 检索；定性观察保留作者与来源，不能直接变成球员能力分。
- [来源特定的可追溯表现指标](issues/24-supplementary-performance-evidence.md)：研究 SkillCorner 2024/25 A-League 赛季聚合，并准备以来源身份、指标定义、单位和样本覆盖承载额外表现指标；真实球员级数据本地保存与模型处理各自 opt-in，许可未核实前不入仓或公开。
- Wyscout adapter 已按官方 v2 事件文档区分 301 助攻与 302 关键传球；302 不再冒充射门助攻。官方 Figshare 真实数据已本机验证：2,682 条跨五大联赛历史记录均有对应事件文件，关键传球可用、射门助攻不可用。样本分钟由首发/换人记录估算，报告说明不含补时且未校正红牌；原始数据和 SHA-256 provenance 留在 Git 忽略的 `.data/`。
- 首个可选当前球员数据 provider 选择 Sportmonks，但仅在显式配置时启用；保留 StatsBomb 和演示数据作为独立来源，不合并跨 provider 的球员 ID。模型处理许可尚未从 provider 条款中确认，故 Sportmonks 数据经模型处理默认为关闭。
- 用户在调查中会看到实际数据模式和来源范围。当前 LangGraph 会把球员证据送入配置模型，因此 Sportmonks 模型处理许可开关仍保护整个 provider 调查链；未来如需只取数并本地分析，应实现独立的无模型工作流后再分离权限开关。

## Fog

- 如何按实际可用语料整理 RAG/Agent 标注样本、阈值和候选排序的可信评估；缺少球探标注时不宣称客观排序准确率。
- 当前来源发现只覆盖 PLOS 学术文章；通用网页搜索 provider、最终 embedding 模型和 RAG/Agent 评测阈值仍待验证。
- 当前球员池的授权数据源、目标联赛覆盖，以及线上缓存/展示/外部 AI 使用范围。Sportmonks 凭据目前未配置；Wyscout 2017/18 公开数据只能支持历史表现分析验证。

## Out of scope

- 登录、多用户云端同步和服务端保存用户的招募计划。
- 自动定时刷新或无人值守引援流程。
- 非欧身份、工作许可、联赛/欧战注册细则与财务合规推断。
- 首版预测薪资、合同谈判、伤病史、转会可行性、未来表现或转会成功率。
- 复制 Football Manager 的官方职责目录、界面或专有评分权重。
