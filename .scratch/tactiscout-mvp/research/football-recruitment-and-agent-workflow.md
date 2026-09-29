# TactiScout：球员能力评估与多轮招募 Agent 研究

研究日期：2026-09-29。主要依据 Football Manager、Hudl StatsBomb 和 LangChain/LangGraph 官方材料。本文借鉴产品工作方式，不复制游戏规则、专有属性或评分模型。

## 调研结论

TactiScout 的起点应是一句自然语言，而不是一份必填筛选表。用户说“为拜仁找凯恩的替代者”或“给巴萨找个新后卫”时，Agent 先把它当作一个招募任务：识别俱乐部、要解决的阵容问题和可能的目标角色；用可用数据调查现有阵容和能力画像；再按证据决定是继续查、向用户追问一个会改变推荐的问题，还是给出阶段性比较。用户回答后，从原任务状态继续。推荐需要展示证据、差异和未知项，不把单一模型分数伪装成确定答案。

这是从官方产品材料和项目目标推导出来的设计，不是 Football Manager 或 LangGraph 强制规定的流程。

## Football Manager 值得借鉴的部分

- **先看阵容，再决定买谁。** FM23 的 Squad Planner 以阵型和职责审视一线队、青年队及未来两个赛季的深度；看到缺口后再设 Recruitment Focus。改变战术阵型也会改变对阵容缺口的判断。[FM23 Recruitment Revamp](https://www.footballmanager.com/features/recruitment-revamp)
- **目标是角色画像，不只是位置标签。** FM26 的 Recruitment Requirements 可同时表达有球和无球角色、预期上场时间、年龄档及转会/租借方式；招募响应返回后，用户还可继续侦察或等待其他候选。[FM26 Recruitment Revamp](https://www.footballmanager.com/fm26/features/powered-transferroom-fm26s-recruitment-revamp)
- **角色能力要按攻守阶段拆开。** FM26 分别展示持球与无球阵型和角色，官方说明角色适配依赖位置熟悉度和职责相关属性。这支持 TactiScout 的角色画像同时表达进攻和防守贡献，而不是把“后卫”当作完整需求。[FM26 Tactical Evolution](https://www.footballmanager.com/fm26/features/possession-out-possession-fm26s-new-tactical-evolution)
- **寻找替代者是画像相似，不是姓名复制。** Hudl StatsBomb 的 Similar Player Search 将在队球员或目标球员作为统计画像起点，再按位置、年龄、分钟数、联赛和各指标权重找相似输出；官方特别提醒，统计输出相似不代表能力、潜力或身体条件相同。[Finding Similar Players, Hudl StatsBomb](https://blogarchive.statsbomb.com/articles/soccer/finding-similar-players/)
- **评估应从广到深。** Hudl StatsBomb 把招募分析概括为 Identification、Shortlisting、Evaluation：先找人、形成候选池，再深入检查技术与战术证据。其例子包括传球范围、受压传球、防守位置、机会创造、射门质量和不同进攻方式。[Using Hudl StatsBomb for Player Recruitment](https://blogarchive.statsbomb.com/articles/soccer/using-statsbomb-iq-for-player-recruitment/)

## 建议的招募对话流程

1. **理解任务**：从自由文本抽取明确事实和可能意图，例如球队、替代对象、“替代/补深度/升级主力”等；把推断标记为推断，不能当作用户已确认条件。
2. **先做可做的调查**：调用可用的球队阵容、球员档案、比赛表现和角色指标工具，检查阵容深度并生成待补角色及其证据。若当前数据源不能核实阵容，就明确数据边界，继续做有证据的球员表现分析，或在无法定义比较目标时再问用户。不要因为预算或年龄未说，就立即抛出整张问卷。
3. **形成候选画像**：把用户语言、被替代球员的表现特征、球队现有角色缺口转换成一组可观测维度。区分硬要求、偏好和系统推导，保持每项可以追溯。
4. **动态找人并深入分析**：Agent 选择下一种合适的数据查询；先围绕能力画像发现候选，再检查同口径表现、样本量和赛季/赛事背景。用户主动提出的年龄等条件只作为辅助偏好。指标结果由可复现代码计算，LLM 负责调度调查、解释证据和比较取舍。
5. **在决策关口追问**：只有当未知信息会明显改变画像或候选排序，且现有工具无法可靠补齐时才问。先利用已有资料，再一次提出一个优先问题或一组紧密相关的问题，并说明它为什么重要。用户回答后更新画像、继续搜索；用户可随时改方向。
6. **证据审核与阶段性结论**：检查候选是否满足已确认条件、推荐是否覆盖关键角色维度、数据是否过期/样本是否不足。证据不足就定向补查；缺用户决策就暂停询问；证据够了再交付候选比较和风险。对话不必被设计成一次问答后永久结束。

### 两个示例

- **“为拜仁寻找凯恩的替代者”**：先确认 Bayern Munich 与 Harry Kane 的实体，尝试调查可核实的阵容和 Kane 的角色表现；建立候选画像（例如终结、禁区接应、支点/串联等，具体指标取决于数据），再按证据发现和比较候选人。如果可用数据无法回答“立即主力接班，还是未来接班/轮换”会如何改变画像，再在候选调查之后询问。不要开场强制用户填年龄、预算、国籍、位置和十个职责项。
- **“为巴萨找一个新的后卫”**：先看阵容与可得比赛数据，比较中卫和边后卫的深度/能力缺口；如果数据足以显示主要缺口就解释结论并继续找人，如果中卫/边后卫选择会显著改变搜索、现有数据又无法区分，再问用户优先方向。不要机械要求用户先从完整位置下拉框选一个。

## LangGraph 在此产品中的工作

关键理由不是“节点多”，而是一次招募会跨越多种控制流程，并在用户回复之间持续保存状态：

- **共享案件状态**：原始话语、实体解析、任务类型、球队阵容证据、目标角色画像、候选与来源、已确认约束、用户偏好、待回答问题和当前阶段。
- **模型与工具循环**：在调研子图中走 `Research Agent → 工具节点 → Research Agent`，模型根据工具结果决定下一次调查。工具应是窄而可核验的领域操作；它不能编造球员事实，也不能绕过确定性硬条件。
- **并行能力分析**：在候选确定后，可并行整理进攻、无球防守、位置/角色、样本风险等相互独立的评估，再汇总比较。
- **条件路由和审核回路**：根据状态决定继续调查、定向重查、向用户询问，或生成阶段性报告；重查必须有限次，避免无尽循环。
- **跨轮暂停和恢复**：LangGraph 的 `interrupt()` 可暂停图并等待用户输入；使用 checkpointer 和同一个 `thread_id`，下一轮可用 `Command({ resume })` 继续。官方文档也明确指出，何时该问由应用的路由逻辑决定，不是框架自动替 TactiScout 判断。[Thinking in LangGraph (JS)](https://docs.langchain.com/oss/javascript/langgraph/thinking-in-langgraph)；[LangGraph Persistence (JS)](https://docs.langchain.com/oss/javascript/langgraph/persistence)

在这个工作流里，LangChain 的模型和工具封装可以作为图节点/子图内部的构件；LangGraph 负责整个招募案件何时调查、何时并行评估、何时等待用户，以及回答后从哪里继续。这比只用一个简单 `createAgent` 工具循环更贴合多阶段、可暂停、有审核回路的案件流程。

## 数据能力边界与首版范围

当前主要数据集 StatsBomb Open Data 包含公开覆盖范围内的赛事、比赛、事件、阵容和部分比赛的 360 数据。[Hudl Open Data README](https://github.com/hudl/open-data/blob/master/README.md) 这些数据适合做比赛表现和角色线索，但不能据此假设系统已经知道最新的一线阵容、合同、预算或伤病。项目当前 provider 读取比赛事件并汇总统计，也不能直接支撑真实完整的拜仁/巴萨现役阵容审计。

因此第一阶段应聚焦于**能力画像和推荐**：使用当前可核实的球队/球员表现证据，形成角色适配、相似球员线索、样本风险和比较理由；缺数据就明确说出来。预算最多作为用户可选的偏好/后续追问。非欧、工作许可及各联赛注册名额等规则细节先延后，不为它们建立规则库，也不因此影响首版能力评估主线。

要把“为拜仁/巴萨找人”做得像真实球探，需要补齐真实而及时的球队阵容和更广泛的球员表现数据源；否则可用清楚标记的数据子集演示同一流程，但不得把历史 StatsBomb 赛事阵容冒充当前俱乐部阵容。
