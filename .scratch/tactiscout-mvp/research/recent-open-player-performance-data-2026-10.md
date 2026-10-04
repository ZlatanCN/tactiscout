# 近期、免费且可复用的成年球员数据源复核

**核验日期：2026-10-04**  
**范围：**提供方/作者官方数据集、API 文档、数据许可及仓库现状。表中“文档覆盖”不等于本机已导入或实时 API 已验证。

## 结论

本次复核没有找到同时满足“2024/25 及以后、覆盖多联赛、成年实名球员、细粒度比赛能力指标、明确允许项目复用”的开放主库。最接近球探需求的是 **SkillCorner Open Data 的 2024/25 A-League 赛季聚合指标**；其 README 称数据已开源并请求署名，仓库也有 MIT 文件，但 MIT 文本写的是 “Software”，没有单独界定数据文件的许可范围。若要将其并入公开产品，先把数据许可边界确认清楚。权利最明确的近期比赛级补充是 **IDSSE / DFL–Sportec**，但只有 2022/23 的 7 场，适合算法验证而非候选池。

如果只需要球员进球事实，OpenLigaDB 提供无 key API 和 ODbL 数据；它没有出场分钟、完整球员名册或非进球能力指标，因此不能支撑球探排名。其接口支持按联赛/赛季查询，但本次未实查 2026/27 射手榜端点。公开网页可读、API 可访问或 GitHub 仓库可下载，都不能单独证明可批量采集和再发布。

## 候选比较

| 来源 | 文档范围、字段与更新 | 权利与主要限制 | TactiScout 用途 |
|---|---|---|---|
| **[SkillCorner Open Data](https://github.com/SkillCorner/opendata)** | 官方 README 标明澳大利亚男子 A-League 2024/25：10 场 10Hz 广播追踪、动态事件和比赛信息；另有该赛季 player-season Physical、Off-Ball Runs、Passing 聚合 CSV，且只纳入出场超过 60 分钟的表现。Physical 含高速跑动/距离指标，OBR 描述无球跑动类型及结果，Passing 含传球量与效率。README 自报球员身份准确率约 97%，并提醒追踪点可能出错。README 没有承诺此足球数据持续更新。[README](https://raw.githubusercontent.com/SkillCorner/opendata/master/README.md) · [样例成人比赛元数据](https://github.com/SkillCorner/opendata/blob/master/data/matches/1886347/1886347_match.json) | 官方仓库根目录有 [MIT 许可证](https://github.com/SkillCorner/opendata/blob/master/LICENSE)，README 称数据为 SkillCorner 与 PySport 联合开源并请注明来源；但 MIT 文本本身描述 “Software”，没有单独说明对数据文件、球员身份字段的适用范围。公开再分发前应先确认许可覆盖数据，而不要只凭仓库标签推定。 | **能力维度最有价值、时效最好。**许可范围确认后，只导入赛季聚合 CSV，保留源 ID、>60 分钟门槛、赛季、联赛和指标定义；作为独立证据层，不与 Wyscout 旧赛季指标直接合并。 |
| **[IDSSE / DFL–Sportec](https://springernature.figshare.com/articles/dataset/An_integrated_dataset_of_spatiotemporal_and_event_data_in_elite_soccer/28196177)** | 论文和数据页面描述 2022/23 德甲、德乙共 7 场职业比赛、207 名球员、11,137 个事件和 1,002,644 帧追踪；包括实名球员/比赛元数据、事件与 25Hz 球员和足球坐标。由 2 场德甲、5 场德乙组成；这是静态样本，没有后续更新承诺。[数据论文](https://www.nature.com/articles/s41597-025-04505-y) · [Figshare 数据项](https://springernature.figshare.com/articles/dataset/An_integrated_dataset_of_spatiotemporal_and_event_data_in_elite_soccer/28196177) | Figshare 标记 CC BY 4.0；论文说明 DFL 授权按 CC BY 4.0 发布，并说明球员注册流程包含发布同意。需保留作者/来源/许可与修改说明。[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/legalcode) | **权利边界最清楚的比赛数据验证集。**样本太小，不能把 7 场扩成广泛候选名单；可验证事件/位置导入、派生指标和来源追溯。 |
| **[StatsBomb Open Data](https://github.com/hudl/open-data)** | 官方目录包含选定赛事，例如 2024 男子欧洲杯、美洲杯、2023/24 德甲及更早赛事；比赛文件提供阵容、事件，部分比赛另有 360 快照。它不是持续更新的完整俱乐部赛季库；当前清单中的 2023/24 德甲样本文件列有 34 场。[README](https://github.com/hudl/open-data/blob/master/README.md) · [官方赛事清单](https://raw.githubusercontent.com/hudl/open-data/master/data/competitions.json) · [2023/24 德甲比赛文件](https://raw.githubusercontent.com/hudl/open-data/master/data/matches/9/281.json) | 附带独立 [Public Data User Agreement](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)；README 要求发布分析时署名 StatsBomb 并使用其 logo。不要把免费 GitHub 下载等同于可公开再分发或任意云端模型处理。 | 可做有限的近期国际赛事事件分析示例；不提供宽覆盖现役俱乐部球员池。 |
| **[Impect Open Data](https://github.com/ImpectAPI/open-data)** | 静态 2023/24 完整 Bundesliga；仓库列出事件、事件 KPI、逐球员/位置/比赛 KPI、阵容、换人、球员和赛事信息及 KPI 定义。未承诺后续赛季更新。[官方 README](https://github.com/ImpectAPI/open-data) | README 规定使用即接受单独的 [LICENSE.pdf](https://github.com/ImpectAPI/open-data/blob/main/LICENSE.pdf)，并要求归因和使用 Impect 标志。该 PDF 不是标准 MIT/CC 数据许可；未完成具体条款核读前，不将其用于公开再分发或模型处理。 | 研究上有吸引力，但当前不列为可安全公开的开放数据输入。 |
| **[OpenLigaDB API](https://api.openligadb.de/index.html)** | 文档提供按赛事/赛季查询比赛、球队、联赛表和 goal getters 的端点，并有 last-change 查询；接口接受联赛和赛季参数，但本次没有实时核验 2026/27 的实际射手榜内容。GoalGetter schema 只有球员 ID、姓名和进球数；不含完整名册、分钟或战术事件。文档建议节制轮询，限制为每 IP 每分钟 60 次。[OpenAPI schema](https://api.openligadb.de/swagger/v1/swagger.json) | 官方 API schema 声明数据采用 ODbL 1.0，并链接 [许可页](https://www.openligadb.de/lizenz)。这是可复用但带数据库署名/相同方式共享义务的来源。服务不承诺完整球员表现统计。 | 可选的进球背景事实源，先核验目标联赛/赛季端点后使用，注明获取时间；**不能计入能力分或替代球探数据**。 |
| **[OpenFootball football.json](https://github.com/openfootball/football.json)** | 仓库含主要欧洲联赛 2026/27 赛程/比分 JSON；最新季文件每日 05:00 UTC 由 GitHub Action 生成，但上游 Football.TXT 并未自动每日更新。数据是比赛级赛程/结果，不含球员级表现。[项目说明](https://github.com/openfootball/football.json) · [2026/27 目录](https://github.com/openfootball/football.json/tree/master/2026-27) | 仓库将数据以 [CC0 1.0](https://github.com/openfootball/football.json/blob/master/LICENSE.md) 发布；CC0 声明同时说明发布者不保证数据准确，也不负责清理他人权利。 | 可当公开比赛索引/结果辅助，不能用于筛选球员能力。 |
| **[SoccerMon](https://datasets.simula.no/soccermon/)** | CC BY 4.0 的精英女子足球训练监测数据，来自挪威 Toppserien 两队的 2020、2021 赛季；含训练/比赛 GPS 与距离、速度等，以及 wellness、伤病等报告。数据较旧，主要是训练负荷而不是完整比赛球探表现；论文称发布前已移除球员身份并用随机 ID 替代。[官方数据页](https://datasets.simula.no/soccermon/) · [数据论文](https://www.nature.com/articles/s41597-024-03386-x) | 明确 CC BY 4.0，但 wellness、疾病、伤病属于敏感个人背景；许可并不意味着适合导入面向公开球探的球员画像或交给 LLM。 | 不建议纳入推荐；若研究训练负荷方法，应隔离数据、字段最小化并审慎处理个人健康信息。 |

## 本地实现与实测边界

- 仓库已有 [SkillCorner 聚合数据读取器](../../../src/data/skillcorner-provider.ts)，预期读取 2024/25 A-League 的 Physical、Passing、OBR CSV；当前 `.data/` 中没有 SkillCorner 原始文件，故本地尚未验证该 provider 的实际球员数、指标缺失率或匹配覆盖。
- 当前可重复数据构建命令仍构建 Wyscout 2017/18 快照；本地没有 IDSSE 原始文件或对应构建器。
- StatsBomb 赛事清单和现有调查已确认选定赛事范围；OpenLigaDB 本次只复核官方 schema/许可，没有实时调用球员射手端点。表中的源端字段属于文档证据，不应表述为本机已经验证的数据覆盖。

## 最小实现切片

1. **先确认 SkillCorner MIT 文件是否明确覆盖仓库中的数据文件。**若确认，复用现有 reader，只导入 2024/25 A-League 三份球员赛季聚合 CSV；生成独立、带 SHA-256、获取日期、来源链接、署名、>60 分钟纳入规则及逐指标缺失率的快照。不要同时抓全量追踪文件，也不要将它与 Wyscout 的旧赛季指标横向混排。
2. **如果数据许可范围仍不清楚，先采用 IDSSE 做有界验证。**只构建一个 `idsse-2022-23` 源快照，归档 CC BY 4.0 来源和修改说明，导入 7 场的球员/比赛/事件/追踪证据，输出覆盖报告并标明“7 场研究样本”；在其样本无法支撑稳定赛季比较前，不进入默认候选排名。
3. OpenLigaDB 可另开极小的 `goal_scorer_evidence` 只读补充；若被采用，固定轮询 last-change、保留 ODbL 署名/共享说明，并保持进球数为上下文事实而非球员能力总分。

**建议优先顺序：**SkillCorner（先澄清数据许可）→ IDSSE（明确许可的战术分析基准）→ OpenLigaDB（可选当前进球背景）。新增数据只解决对应字段缺口，不会由此得到“最新全球球员池”。
