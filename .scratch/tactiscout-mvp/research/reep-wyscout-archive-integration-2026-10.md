# Reep × Wyscout 历史档案补充：一手来源调查

调查日期：2026-10-04
范围：Reep 公共身份桥接、其 release/schema，以及 Wyscout 2017/18 开放事件数据的字段、时间范围、署名与报告留存边界。已导入官方 Reep CSV release 并完成单个来源 ID 的本地映射 smoke；未调用在线 API，smoke 不是 Sportmonks 真实候选请求或总体覆盖率验证。

## 结论

Reep 适合作为**精确身份连接层**：以来源、namespace、外部 ID 找到 Reep ID，再从同一身份上取 Wyscout ID。它不是表现数据库，也不承诺每个 Sportmonks/StatsBomb/SkillCorner 候选都能连到 Wyscout，更不保证连上的 ID 在有限赛季的本地 Wyscout 事件文件里有样本。实现必须逐个状态化报告命中、无桥接、无本地样本、多 ID/歧义及重定向，不能把总体行数包装成候选覆盖率。[Reep 覆盖页](https://www.reep.football/coverage/)；[Reep 映射指南](https://www.reep.football/get-started/)；[Wyscout 数据集论文](https://doi.org/10.1038/s41597-019-0247-7)

建议只把找到的历史表现作为独立的报告背景，标出“历史样本，不参与当前能力评分、排序或 Agent 决策”。展示与本机报告留存都应明确选择；同时保存足以重现映射和归属的数据来源、版本、许可与派生口径。

## 1. Reep 覆盖量代表什么

- Reep 覆盖页在 2026-10-03 的公开快照列出 Wyscout 1,444,534 行、Sportmonks 144,915 行、StatsBomb 26,915 行；页面明确 Wyscout 是独立来源，Sportmonks 和 StatsBomb 是 bridge-only。bridge-only ID 可用于跨系统 join，但不算 Reep 判断身份时的独立佐证来源。[Reep 覆盖页](https://www.reep.football/coverage/)
- 这些是 provider bridge **行数**，不是同一批球员数、来源两两交集、某个用户候选列表的命中率，也不是本地 Wyscout 比赛样本行数。Reep 明确说覆盖按赛事逐步增加，不保证某 provider 的全部数据均覆盖；provider-to-provider coverage 从不保证 100%，某身份在一个 provider 中存在，不代表它存在于另一个 provider 的范围内。[Reep 覆盖页](https://www.reep.football/coverage/)；[Reep 映射指南](https://www.reep.football/get-started/)
- 因而，当前无法从总体行数推算“Sportmonks 候选有多少能拿到 Wyscout 2017/18 表现”。必须对真实 release 和本地数据分别计算：候选输入数 → Reep 精确解析数 → 同 Reep ID 上有 Wyscout bridge 数 → 本地 Wyscout player ID 匹配数 → 实际有比赛事件样本数。每步都报告分母、分子和缺失原因。本次 smoke 只验证一条 ID 路径，不是针对真实候选池计算的覆盖率。
- Reep 的 bridge key 是 `(provider, namespace, external_id)`；Wyscout player 与 Sportmonks player 的 namespace 均为 `player`，external ID 按文本处理。错误 namespace 会静默无匹配。一个 Reep 身份可能带多个同 provider ID，公开指南要求保留多值而不是任意取一个；应用应将多值状态作为歧义呈现并显式处理。[Reep 映射指南](https://www.reep.football/get-started/)
- Reep 自称是身份注册表，不包含事件 feed、球探评分、xG、tracking 或战术指标。即使 Reep 命中，仍需单独查明本地 Wyscout 文件是否有完全相同的 Wyscout player ID、目标赛季/赛事记录和足够事件样本。[Reep 首页](https://www.reep.football/)；[Reep 覆盖页](https://www.reep.football/coverage/)
- 本机已按官方 checksum 导入 `20261003T052950Z` 的 `bridges.csv.gz` 与 `redirects.csv.gz`。扩展 importer 支持 API-Football namespace 后，索引共纳入 791,122 条项目支持的 bridge rows，其中 API-Football 为 154,642 条。实际 smoke 命中 Sportmonks `1002` → Reep `rp606b79a0db2365` → Wyscout `9080`，并在本地 Wyscout 2017/18 意甲 Genoa 记录中取到 1,617 分钟、9 项可用指标。候选外壳为合成数据，桥接 ID 与档案 ID/统计来自真实本地文件。

## 2. Snapshot、重定向和 rung 的产品呈现

### Snapshot 与文档版本

- 官方 `latest.json` 当前指向 release stamp `20261003T052950Z`，`release_schema_version` 为 `bridge-register-v1`；Reep 覆盖页也显示 2026-10-03 快照。[Latest release pointer](https://data.reep.football/releases/latest.json)；[Reep 覆盖页](https://www.reep.football/coverage/)
- 页面并非同时刷新：被打开的 Reep data/get-started 文档快照仍显示 `20260926T145536Z`，而 coverage 与 `latest.json` 指向 10 月 3 日。生产导入和报告应信任**实际导入文件的 manifest、stamp、schema 和校验和**，并保存这些值；不要仅依赖网页上的“current”数字或把固定 stamp 写死。[Reep data page](https://www.reep.football/data/)；[Reep get-started](https://www.reep.football/get-started/)；[Latest release pointer](https://data.reep.football/releases/latest.json)
- 建议报告展示“Reep release：`<stamp>` · schema：`<version>` · 本地导入时间：`<time>`”，必要时附 manifest/checksum 标识。该值用于说明本次映射的可复现快照，不是数据新鲜度或正确率分数。

### 重定向

- Reep ID 合并后，旧 ID 不会直接消失，而会有 redirect 指向 survivor；批量文件消费者应在桥接 join 前跟随当前 release 的 redirects，并在新 release 同步/重查。API 会自动返回 survivor，本地快照消费者需要自行处理。[Reep ID policy](https://www.reep.football/id-policy/)；[Reep 映射指南](https://www.reep.football/get-started/)；[Reep data page](https://www.reep.football/data/)
- 报告建议同时保留输入身份 ID、resolved/survivor ID、redirect reason、所用 release stamp，以及原始 `(provider, namespace, external_id)`。如果旧身份没有 survivor，状态应明确为“无可用 survivor/当前 release 不可映射”，不得继续按旧 ID 假装成功。

### Rung 与 upstream status

- Reep get-started 把 `rung` 解释为 bridge 的佐证类别；不应把它改写成概率、置信度百分比或球员能力等级。[Reep 映射指南](https://www.reep.football/get-started/)
- 可访问的 Reep 2026-09-26 release schema 进一步说明：`rung` 表示哪类一致性/映射依据关联了该 ID；空值表示该行没有记录 rung，不能擅自解释为“弱匹配”。该 schema 列出的类别描述包括姓名/国籍、姓名/出生日期、带日期的足迹、provider 自身 cross-reference、人工核验、第三方 crosswalk 等。[2026-09-26 release schema](https://data.reep.football/releases/20260926T145536Z/schema.json)
- 同一旧版 schema 将 `upstream_status` 解释为 live ID 为空、provider 已明确退役的 ID 为 `retired`；“本地未出现”不能推断成 provider retired。由于这份可读 schema 对应 9 月 26 日快照，而最新 pointer 已是 10 月 3 日，本调查没有直接读取最新 release 的 `schema.json`，所以应保留原始字段值，并在使用当前值前按最新导入包 schema 核对含义。[2026-09-26 release schema](https://data.reep.football/releases/20260926T145536Z/schema.json)；[Latest release pointer](https://data.reep.football/releases/latest.json)
- UI 可以展示 rung 原值和简短解释“Reep 映射佐证类别”，空值显示“未提供”；只有在对应 release schema 有定义时才翻译枚举。使用该值作为是否展示历史样本的过滤策略属于 TactiScout 决策，需明确记录阈值及排除量，不要声称它是 Reep 的概率评分。

## 3. Wyscout 2017/18 能支持什么

- Pappalardo 等人的一手数据论文描述的是 Wyscout 采集的比赛事件日志，而非 tracking：事件包括传球、射门、犯规、抢断等类型，携带时间、球场位置、参与球员和特征；论文把 event log、视频 tracking 和训练 GPS 明确区分。[Pappalardo et al., 2019](https://doi.org/10.1038/s41597-019-0247-7)
- 官方 Figshare collection 声明范围为七项男子赛事：西、意、德、英、法五国顶级联赛，以及 2018 世界杯、2016 欧洲杯；五大联赛数据对应 2017/18 赛季。球员/比赛资料也使用 Wyscout `wyId`，并包含赛事、队伍、阵容/替补/换人等上下文，可用于限定历史样本的球队和赛季。[官方 Figshare collection](https://figshare.com/collections/Soccer_match_event_dataset/4415000/5)；[Figshare Players](https://figshare.com/articles/dataset/Players/7765196)；[Figshare Matches](https://figshare.com/articles/dataset/Matches/7770422)
- 因为数据为事件日志，它可以支持有明确口径的历史事件总结或派生表现维度，例如传球尝试/完成、射门位置和结果、关键传球标签、对抗事件、推进事件；具体指标仍需记录事件类型/标签映射、位置算法、出场分钟估算、赛事和样本数。相关值只能描述对应历史样本，不能当成当前状态、完整角色能力、潜力、身体/追踪指标或转会可行性。论文区分 tracking 与 event logs，故不能从这套事件数据声称观察到了完整的无球跑位、压迫距离或球员物理追踪。[Pappalardo et al., 2019](https://doi.org/10.1038/s41597-019-0247-7)
- 官方球员条目包含 `currentTeamId`、`currentNationalTeamId` 等字段名称；“current”是数据发布时该文件的字段语义，不能解释成 2026 年现况。产品应优先从样本的比赛/阵容信息显示当时的球队、赛事和赛季，并显式称其为历史信息。[Figshare Players](https://figshare.com/articles/dataset/Players/7765196)；[官方 Figshare collection](https://figshare.com/collections/Soccer_match_event_dataset/4415000/5)

## 4. 展示、署名与本机报告留存

- 官方 Figshare Players 与 Matches 条目直接标注 CC BY 4.0；Nature 数据论文将 dataset 指向 Figshare；官方 Figshare Events 条目搜索结果也显示 CC BY 4.0，但本次浏览工具直接打开该 Events 详情页返回 403。因此，Events 文件的 license 字段虽有官方索引记录支持，仍应在导入实际文件时复核对应版本/条目的 metadata，不要仅凭二手处理版 README 做授权判断。[Figshare Players](https://figshare.com/articles/dataset/Players/7765196)；[Figshare Matches](https://figshare.com/articles/dataset/Matches/7770422)；[Figshare Events](https://figshare.com/articles/dataset/Events/7770599)；[Wyscout 数据论文](https://doi.org/10.1038/s41597-019-0247-7)
- CC BY 4.0 允许复制和改编（包括商业用途），但要求适当署名、链接许可、标示修改，且不得暗示许可方背书；也不得用额外法律条款或技术措施限制他人行使许可权。CC 页面还指出，许可不保证覆盖公开权、隐私权、道德权等其他权利。[CC BY 4.0 官方说明](https://creativecommons.org/licenses/by/4.0/)
- 因而报告/UI 的出处至少应保存并展示：作者和数据集标题；Figshare DOI/条目与文件版本；CC BY 4.0 链接；Wyscout 赛事/赛季；采用的源字段/事件标签和派生方法；分钟估算或其他转换说明；所用 Reep release/schema/checksum、输入 ID、resolved Reep ID、Wyscout ID、redirect 和 rung 状态；本地读取日期与样本量。对缺失匹配或无本地样本应记录状态，不用 0 伪装成观察值。
- Reep release 自己的 CC0 只覆盖 Reep 能授予的权利；Reep 官方明确说它不授予第三方源材料权利。故 Reep bridge 的开放许可不能替代 Wyscout 样本自身的署名与权利检查。[Reep data page](https://www.reep.football/data/)
- 对 TactiScout 来说，“允许展示历史样本”和“允许把报告写入 LangGraph checkpoint / 浏览器 localStorage”是不同用途，应各自 opt-in、默认关闭，并把许可状态与数据来源快照一起保存；这属于产品设计建议，不是 CC BY 本身要求的实现方式。即便用户同意，本调查也未核清赛事人物相关的其他权利、Wyscout 源文件条目在后续版本中的条款，以及面向公众分发完整数据/报告的具体边界。

## 尚未验证

1. 目前只有一个 Sportmonks bridge fixture；StatsBomb、SkillCorner 和真实 provider 候选池的命中率未知。
2. 已校验导入的 bridge/redirect 文件 checksum、stamp 与 schema；具体覆盖仍只对一个 ID 验证，且没有自动更新任务。
3. 一条 Wyscout bridge 已匹配到本地 2017/18 事件聚合样本；这不意味着每个 Reep Wyscout ID 都存在于本地赛季/赛事文件。
4. 官方 Figshare Events 详情页在本次浏览中返回 403；实际使用的 Events item/version 的 licence metadata 和本地文件 hash 需在后续数据导入时记录。CC BY 不覆盖的其他相关权利与项目公开分发用途仍需单独评估。
5. 本研究只确认事件日志可支持有球事件的历史总结；不同位置/赛事间的可比性、分钟归一化误差、以及任何具体指标是否足够支撑“球员能力”结论，均未在此建立有效性证据。

## 官方来源

- [Reep Coverage](https://www.reep.football/coverage/)
- [Reep Get Started](https://www.reep.football/get-started/)
- [Reep Data / Releases](https://www.reep.football/data/)
- [Reep `latest.json` release pointer](https://data.reep.football/releases/latest.json)
- [Reep 2026-10-03 release schema](https://data.reep.football/releases/20261003T052950Z/schema.json)
- [Reep 2026-10-03 release checksums](https://data.reep.football/releases/20261003T052950Z/checksums.txt)
- [Reep ID stability policy](https://www.reep.football/id-policy/)
- [Pappalardo et al. (2019), Scientific Data](https://doi.org/10.1038/s41597-019-0247-7)
- [Official Figshare collection](https://figshare.com/collections/Soccer_match_event_dataset/4415000)
- [Official Figshare Players item](https://figshare.com/articles/dataset/Players/7765196)
- [Official Figshare Matches item](https://figshare.com/articles/dataset/Matches/7770422)
- [Official Figshare Events item](https://figshare.com/articles/dataset/Events/7770599)
- [Creative Commons Attribution 4.0 deed](https://creativecommons.org/licenses/by/4.0/)
