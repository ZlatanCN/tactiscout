# TactiScout：具名球员表现数据的许可与验证路径

研究日期：2026-10-04。只核对官方数据页面、数据论文、数据发布者的仓库说明及 Creative Commons 原文；未下载或读取任何球员数据行。这是工程选型记录，不是法律意见。

## 结论

目前找到一个比 SkillCorner 更适合做“具名球员表现评估”验证的数据集：Pappalardo 与 Massucco 发布的 Wyscout 公开比赛事件数据。Figshare 上 `Players` 与 `Events` 两个数据项都标明 CC BY 4.0。球员数据项列出姓名、出生日期、角色、惯用脚、身高体重及 Wyscout 球员 ID；事件项包含球员 ID、事件类型与标签、时间、坐标和球队 ID。数据覆盖 2017/18 五大联赛，另有 2018 世界杯和 2016 欧洲杯，共约 1,941 场、325 万条事件和 4,299 名球员。[Figshare Players](https://figshare.com/articles/dataset/Players/7765196) · [Figshare Events](https://figshare.com/articles/dataset/Events/7770599) · [数据论文](https://www.nature.com/articles/s41597-019-0247-7) · [作者的数据记录说明](https://github.com/hyunsungkim-ds/wyscout-eda#data-records)

CC BY 4.0 许可允许为任何目的复制、改编和分享（包括商业用途），条件是按要求署名、链接许可并说明修改。它适用于对应数据项，不代表该数据的示例代码也自动使用同一许可。Creative Commons 说明其许可不授予隐私、肖像/公开权或商标等权利；许可条文没有专门提及 LLM。因此，最稳妥的第一条完整链路是：球员表现数字由程序确定性计算，原始数据留在本机，用本地 Ollama 解释少量已计算指标；暂不把原始行交给第三方模型 API。若未来接外部模型，另核模型服务的数据留存和训练条款。[CC BY 4.0 简明页](https://creativecommons.org/licenses/by/4.0/) · [许可原文第 2、3、4 节](https://creativecommons.org/licenses/by/4.0/legalcode)

Wyscout 数据集有具名球员和足够大的历史事件量，适合验证候选发现、指标计算、来源追溯与 LangGraph 的工具编排；它不是当前阵容、合同或转会预算数据库。2017/18 球员所在球队、年龄等字段只能按该数据集时间解释，不能当作现在的资料。

## 候选来源比较

| 数据源 | 球员/表现范围 | 对本项目的使用许可 | 判断 |
| --- | --- | --- | --- |
| **Wyscout 公开事件数据（Pappalardo/Massucco）** | 具名球员资料 + 逐事件记录，可由 TactiScout 汇总传球、射门、对抗等表现线索；赛事/赛季如上，非当前数据。 | Figshare 的 Players 与 Events 数据项各自标明 CC BY 4.0；允许复制、改编、公开展示/再分发并可商业使用，需提供署名、许可链接和修改说明。许可不覆盖个人隐私/肖像等其他权利；AI/LLM 未被单独点名。 | **首选验证源。** 为简历项目开发数据 adapter 与可解释指标足够；对当前转会建议不够新。写自己的解析逻辑，不从示例代码仓库复制代码，除非另行核对代码许可。 |
| **DFL / IDSSE（Sportec TRACAB）** | 7 场 2022/23 德甲与德乙正式比赛，包含官方赛事、事件与位置追踪数据；论文记录 207 名球员、超过 11,000 条事件和百万级追踪帧。 | 作者仓库明确说数据由 DFL 授权发布，数据集使用 CC BY 4.0，并要求署名 DFL、引用论文。CC BY 的 AI 处理与第三方权利边界同上。仓库的代码是独立作品，不能因数据 CC BY 就推定代码许可相同。 | **战术特征验证的优质补充**，可研究压迫、空间和跑动；只有 7 场比赛，不是球探候选池。原始追踪数据体积大，不适合第一步接入。 |
| **Metrica Sports Sample Data** | 3 场样例事件/追踪数据；官方 README 明确称数据已匿名化，不含球员、球队或赛事名称。 | 官方页面只要求公开使用时致谢来源，未见对数据本身清晰、完整的再利用许可声明。 | 数据格式适合练 tracking 解析，但不满足具名球员检索，许可也不如上述来源清楚。 |
| **OpenFootball / football.db** | 公开比赛日程、比分、球队/阵容和部分进球者；没有广泛的逐球员比赛表现指标。 | 项目将其 schema、数据和脚本声明为 public domain。此声明是项目自身的数据说明，不应误认为联赛官方背书。 | 可作赛程/球队字典的轻量补充，不是能力评估数据源。 |
| **SkillCorner Open Data（当前 adapter）** | A-League 2024/25 球员赛季体能、传球和无球跑动聚合；专业度高但赛事和样例有限。 | README 要求致谢，但 CSV 的存储、AI 处理和公开展示范围仍有待确认；MIT 仓库代码许可不能代替球员数据许可。详见[既有研究](additional-player-evidence-sources-2026-10.md)。 | 暂不作为具名公开 demo 的默认数据源，等权利边界确认。 |

来源：[IDSSE 官方论文](https://www.nature.com/articles/s41597-025-04505-y) · [IDSSE 作者仓库的数据许可说明](https://github.com/spoho-datascience/idsse-data#license) · [Metrica 官方样例仓库 README](https://github.com/metrica-sports/sample-data#about-the-data) · [OpenFootball 官方说明与许可](https://openfootball.github.io/#license)

## 建议的安全验证路径
1. **先做单场确定性导入。** 将未来手动取得的原始文件放在已忽略的 `.data/wyscout-open-data/`，不要提交 CSV/JSON 原始行。最小验证只需 Players、Teams、Matches、Events 数据项；第一轮选一场完整比赛，按事件关联球员 ID，再把事件计数按类型/标签汇总。先显示“单场事件数”，验证球员 ID 连接与来源元数据后，再从阵容、首发及换人记录校验分钟数并尝试 per90。不要把每场事件计数误称为稳定能力。
2. **给数据与代码分开做 provenance。** 在本地数据目录的说明文件记录 Figshare 数据项/DOI、CC BY 4.0、作者论文引用、取得时间与文件 checksum；前端报告注明这是 2017/18 历史数据、哪些字段被派生/归一化及所用公式。CC BY 数据项的许可不会传递到其他人的 parser、notebook 或 GitHub 仓库代码；TactiScout 写自己的解析实现。
3. **将模型留在本机。** 在 LangGraph 工具循环里让代码完成筛选和指标计算，再只向本地 Ollama 传递小型证据对象（可先用 provider ID 而不含生日、照片、坐标轨迹），要求模型解释已提供证据、不得补造属性。保留模型输入使用的字段清单与来源引用。接外部 LLM API 前复核 API 的留存/训练设置和数据处理条款。
4. **作品集展示精简并带署名。** 公开展示派生的单场/角色指标、数据时间范围、提供者/作者、论文和 CC BY 链接、修改说明；不把全量原始事件文件、球员生日或完整 tracking 点序列随仓库发布。Creative Commons 许可允许公开分享和改编，但它不授予肖像/隐私等权利，也不表示 DFL/Wyscout 背书。
5. **明确可验证范围。** 该路径验证“具名历史比赛数据 → 工具筛选/派生统计 → 本地模型解释 → 引用审查”这一端到端链路，不验证当代阵容、市场估值、转会预算或球员真实能力排序。当前候选池需求仍应通过 Sportmonks 等线上数据源另行解决，并单独遵守其服务条款。

## Wyscout 事件定义与 adapter 映射复核（2026-10-04）

Wyscout 官方 v2 `GET /matches/{wyId}/events` 文档列出事件字段 `eventId/eventName/subEventId/subEventName`、球员/球队/比赛 ID，以及附加 `tags`；其标签表明确列出 101 = Goal、301 = Assist、302 = Key pass、1801/1802 = Accurate / Not accurate。因而 adapter 将 302 作为独立关键传球指标，不映射到 `shotAssists`；301 只用于助攻，1801 只用于传球成功数。[Wyscout v2 Matches WyID Events](https://support.wyscout.com/matches-wyid-events)

Wyscout 当前 glossary 对关键传球补充了旧版 API 兼容语义：v2 的 tag 302 可以属于非传球动作，代表制造明显得分机会但队友未能进球的动作；它不会同时算作助攻。当前定义的“射门助攻”是队友射门前的最后动作，语义不同，因此本 adapter 将 `shotAssists` 留为不可用。事件文档也定义 1801/1802 为下一触球是否由队友完成的传球成功标签。[Key pass glossary](https://dataglossary.wyscout.com/key_pass/) · [Shot assist glossary](https://dataglossary.wyscout.com/shot_assist/) · [Pass glossary](https://dataglossary.wyscout.com/pass/)

Figshare 的 Matches 项说明 `teamsData` 含首发阵容、替补与换人分钟；`duration=Regular` 指常规 90 分钟加补时。当前为第一版的分钟近似：首发按 90、换人按记录分钟计算，不计 90 分钟后的补时，也不修正红牌等特殊情况。其每 90 结果须作为估算指标，等待对真实文件布局及换人细节完成本地 smoke test 后才可用于展示。[Figshare Matches](https://figshare.com/articles/dataset/Matches/7770422)

## 官方与数据发布者来源

- Pappalardo, L. & Massucco, E. (2019), [A public data set of spatio-temporal match events in soccer competitions](https://www.nature.com/articles/s41597-019-0247-7), Nature Scientific Data 6, 236.
- [Figshare Players dataset](https://figshare.com/articles/dataset/Players/7765196)（字段、作者、DOI、CC BY 4.0）。
- [Figshare Events dataset](https://figshare.com/articles/dataset/Events/7770599)（字段、作者、DOI、CC BY 4.0）。
- [作者维护的 Wyscout 数据字段与覆盖说明](https://github.com/hyunsungkim-ds/wyscout-eda#data-records)；这里只用作数据结构说明，不据此继承代码许可。
- [CC BY 4.0 简明页](https://creativecommons.org/licenses/by/4.0/) · [许可原文](https://creativecommons.org/licenses/by/4.0/legalcode)。
- [IDSSE 官方数据论文](https://www.nature.com/articles/s41597-025-04505-y) · [作者仓库数据许可](https://github.com/spoho-datascience/idsse-data#license)。
- [Metrica Sports 官方 sample-data README](https://github.com/metrica-sports/sample-data#about-the-data)。
- [OpenFootball 官方项目与许可](https://openfootball.github.io/#license)。
