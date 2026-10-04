# 新增开放足球数据源：追踪样本与当前赛季仓库

**核验日期：2026-10-04**  
**范围：**补充《近期、免费且可复用的成年球员数据源复核》未充分覆盖的开放追踪样本、当前赛季社区数据仓库和 TheSportsDB。本文区分数据集许可、代码许可、上游来源权利与数据用途；GitHub/Hugging Face 上存在文件或许可证标签，不自动代表上游数据权利已获清理。

## 结论

这次补查仍没有找到一个同时满足“当前赛季、多联赛、实名职业球员、足以评估能力、明确授权公开存储/展示”的完整球探数据集。

找到三个狭窄的可用补充：

- **SoccerTrack v2** 明确将数据（视频与标注）按 CC BY 4.0 发布、代码按 MIT 发布，含 10 场大学业余比赛的全场追踪与动作标注。适合验证球员间距、阵型紧凑度、跑动/空间指标等计算；没有球员姓名，不能提供职业候选人名单。
- **The Viking Striker** 明确将其手工核对的哈兰德比赛日志按 CC BY 4.0 发布，含截至 2026/27 的比赛、出场分钟、进球、助攻和逐行来源。它适合演示“数据版本、来源和更正可追溯”的导入流程，但单一球员和有限进攻统计无法支撑球员比较。
- **evmax FPL projections** 明确将其自己计算的每轮 FPL 预测值按 CC BY 4.0 发布；但目前只有 2 轮预测、指标是 FPL 预期分而非足球能力。姓名、球队和 FPL ID 等字段与 PL 游戏数据相连，不能把 CC BY 投影数值自动外推为这些身份/官方字段也已获得同一许可。

体量最大的新增线索 **Global Football Data Lake** 自称 CC BY 4.0，含约 10M 球员出场记录、271 个联赛并引用 API-Football 与 football-data.co.uk；但 API-Football 明确不授予将其数据发布到用户应用/网站/产品的许可，且要求用户自行取得权利方授权。因此，数据仓库作者标注的 CC BY 不能替代对上游数据的授权核实，现阶段不应复制到 TactiScout 的公开数据集或输出中。[数据仓库说明](https://huggingface.co/datasets/eatpizzanot/soccer-dataset) · [API-Football 服务条款](https://www.api-football.com/terms)

**建议：**近期先把 SoccerTrack v2 当作隔离的战术指标验证集（仅评估派生指标，不把业余球员与职业球员同池排名）；哈兰德开放日志可作为溯源导入的微型演示样本。主推荐名单仍需依赖已有历史比赛事件数据，或等到明确许可且覆盖更广的职业球员数据出现后再扩展。

## 新增来源评估

| 来源 | 覆盖和指标 | 数据许可与代码许可 | 对 TactiScout 的判断 |
|---|---|---|---|
| **[SoccerTrack v2](https://atomscott.github.io/SoccerTrack-v2/)** | 2025 项目；10 场大学业余比赛、约 900 分钟，逐帧含全场位置、track/player ID、球衣号、角色、队伍边，以及 12 类动作时间点。[项目数据说明](https://atomscott.github.io/SoccerTrack-v2/) | 项目明确写明：数据（视频与标注）CC BY 4.0，代码 MIT；还说明球员姓名未包含、均为大学级业余比赛且取得知情同意。[许可与限制](https://atomscott.github.io/SoccerTrack-v2/) | **适合指标研发/校验，不是职业球探池。**可在本地为样例比赛计算空间占用、阵型宽度、压迫距离或接应跑动等派生指标；应保留署名与来源，并把适用性标成“业余比赛样本”。 |
| **[SoccerNet SN-GSR-2025](https://huggingface.co/datasets/SoccerNet/SN-GSR-2025)** | SoccerNet 将其列为公开的 2025 Game State Reconstruction 数据集；HF 页面显示约 35.1 GB，任务关注球员跟踪/游戏状态重建。[官方数据索引](https://github.com/SoccerNet/SoccerNet/blob/main/README.md) · [数据集页面](https://huggingface.co/datasets/SoccerNet/SN-GSR-2025) | HF 数据集卡标签为 GPL-3.0；这不是本报告确认过的独立球员表现数据许可，也没有给出可用于职业球员身份匹配的姓名或统计 schema。[HF 文件与许可页](https://huggingface.co/datasets/SoccerNet/SN-GSR-2025/tree/main) | **仅作计算机视觉/追踪评测候选。**公开的挑战样本和 tracking 标签不能直接形成实名球员赛季能力表；在将其纳入公开产品前，还需单独确认数据文件许可和由视频推导数据的权利范围。 |
| **[Metrica Sports sample-data](https://github.com/metrica-sports/sample-data)** | 3 场（README 的早期描述为 2 场、2021 年更新新增第 3 场）同步事件/追踪样例；其 README 明确说比赛和球员均匿名化。[README](https://github.com/metrica-sports/sample-data) | 仓库文件列表只有 `data/`、`documentation/` 和 `README.md`，没有独立 LICENSE 文件；README 只要求公开使用时注明来源，没有列出数据许可证。代码/格式可供学习不等于比赛数据获得 CC/MIT 授权。 | **可作本地格式学习，暂不复制/公开再分发。**匿名身份不能关联现役球员，也不能用于候选排名。 |
| **[The Viking Striker 开放数据](https://thevikingstriker.com/data)** | 单一实名球员 Erling Haaland 的手工核验比赛日志；提供 JSON/CSV、赛季总览、分钟、先发、进球/助攻、来源 URL、核对时间和更正记录。实时 `seasons.json` 显示 2026/27 有 6 场日志；2025/26 日志的分钟字段缺失率很高，页面将其质量评为 C。[数据说明](https://thevikingstriker.com/data) · [实时赛季清单](https://thevikingstriker.com/api/v1/seasons.json) | 发布者明确授予 CC BY 4.0（允许包括商业使用，需署名并链接许可）；数据响应亦给出许可/署名信息。这里的明确授权是该发布者对其整理日志所作的授权，不应推广到其他网站抓取的数据。[许可与字段定义](https://thevikingstriker.com/data) | **可作溯源/更正流程的微型验收样本。**它证明当前赛季实名比赛事实存在可复用的小型样例，但仅有一名球员，指标集中于出场和进攻产出，不足以训练或排名引援候选人。 |
| **[evmax FPL projections](https://evmax.ai/data/)** | 每轮截止前对英超/FPL 全体球员做 50,000 次模拟；2026/27 页面目前发布了 2 个 gameweek。提供实名球员、赛季球队/位置、价格、首发概率、预期 FPL 分数、分位数和分布；这是预测值，不是球员实际比赛表现或战术能力。[数据与字段说明](https://evmax.ai/data/) | 发布者明确将其“these numbers”按 CC BY 4.0 发布，允许复用并需署名；声明这些投影是作者自己的模型估计。数据同时含官方 FPL element ID、姓名、球队和价格字段，发布者许可证并不能代替 PL 对这些上游字段的权利说明。[数据许可和方法](https://evmax.ai/data/) · [PL 网站内容条款](https://www.premierleague.com/en/terms-and-conditions) | **可作为近期预期表现的独立辅助信号，不能当能力评分。**两轮样本太短，方法用市场赔率推导 FPL 分数，不能说明控球、推进、压迫等引援属性。若纳入，须将 CC BY 署名和与 PL 相关的来源/权利范围分开记录。 |
| **[Global Football Data Lake](https://huggingface.co/datasets/eatpizzanot/soccer-dataset)** | 发布页自述 271 个联赛、约 674K 场比赛及约 10M 球员出场记录；包含实名球员、阵容和每场个人统计，数据时间范围标到 2026–27。[数据卡](https://huggingface.co/datasets/eatpizzanot/soccer-dataset) · [数据包清单](https://github.com/v-eatpizzanot/soccer-dataset/blob/main/metadata/datapackage.json) | 数据卡和 datapackage 标记 CC BY 4.0，但同一清单明确上游为 API-Football 与 football-data.co.uk。API-Football 服务条款明确写明不授予将服务数据发布到用户应用、网站或其他产品的许可，且要求用户取得相关赛事权利方许可。故此仓库的许可证声明不足以证明整套上游内容可再许可；football-data.co.uk 的相应许可也未在本次查证中确认为可公开再发布。 | **数据体量和时效诱人，但当前排除。**不要把 CC BY 标签视为上游来源授权，也不要将该仓库导入公开推荐库或送入本地 LLM 生成公开球员画像，除非权利链得到明确许可。 |
| **FPL 2026/27 官方数据/API 与社区快照** | FPL 当前赛季含实名 PL 球员、球队、基本球员属性及游戏统计；社区快照如 [FPLYogi 的仓库](https://github.com/FPLYogi/FPL-Data)自述会刷新官方 FPL 数据并提供 player/match CSV，但仓库文件列表没有独立 LICENSE 文件。 | PL 网站条款明确：未经书面批准，不得再利用或再分发网站/应用材料，包括创建包含其下载或取得材料的数据库；FPL 2026/27 游戏条款另将 FPL 游戏数据的知识产权归 PL，并禁止自动系统访问游戏提取信息。[PL 网站条款](https://www.premierleague.com/en/terms-and-conditions) · [FPL 游戏条款](https://fantasy.premierleague.com/help/terms)。社区仓库作者写“可用于自己的网站”不能替代 PL 的许可。 | **看似最方便的实时实名池，但不纳入。**除了许可问题，FPL 指标是游戏计分/供给的统计维度，不等同于完整的转会球探能力评估。 |
| **[Impect Open Data](https://github.com/ImpectAPI/open-data)** | 2023/24 德甲完整赛季，含事件、逐球员/位置/比赛 KPI、阵容、换人和 KPI 定义；静态赛季，非当前更新源。[官方仓库说明](https://github.com/ImpectAPI/open-data) | 仓库要求使用时接受单独的 [LICENSE.pdf](https://github.com/ImpectAPI/open-data/blob/main/LICENSE.pdf)，不是代码仓库标签可自动推定的 MIT/CC 数据授权；此前许可核验未确认它允许公开再分发/模型处理。 | **职业球员事件证据指标较丰富，但只有一个旧赛季，且公开复用边界未确认。**保留为许可核查线索，不作为本次可用数据源。 |
| **[TheSportsDB API](https://www.thesportsdb.com/documentation)** | 官方称其为众包运动数据库，约 250K 运动员、20K 球队和 1.5M 赛事；接口可查球员/球队/比赛、阵容、比赛事件统计与球员统计，但未承诺覆盖完整或一致的球探指标。[官方介绍](https://www.thesportsdb.com/docs_about) · [API 文档](https://www.thesportsdb.com/documentation) | 文档提供免费测试 key `123`，免费层每分钟 30 次且多种查询返回条数受限。当前条款（2026-09-17 更新）把免费 API 用途描述为开发项目 lookup；发布应用商店 app 需付费订阅，付费档才明确允许开发 app/services。图片 CC 标记不自动许可第三方图片或徽标；第三方内容必须另有权利基础。[API 文档](https://www.thesportsdb.com/documentation) · [官方条款](https://www.thesportsdb.com/docs_terms_of_use.php) | **不是本轮推荐的能力数据源。**它可作身份、赛程、荣誉等背景补充，但免费层对多种端点有单条结果上限，且没有规范化球员能力指标；公开应用/service 的免费使用范围不够明确，不值得现在接入。 |

## 实施含义

1. 若要验证“LLM 之外的战术分析证据”，优先用 SoccerTrack v2 做独立的战术指标计算样本；仅存派生统计与可追溯来源，默认不把业余数据注入职业球员的排名。
2. 用 The Viking Striker 的 CC BY 日志作为小型 provenance 冒烟样本（记录 source URL、checked_at、quality、unknown/missing），但不将哈兰德单例作为评估模型质量的证据。
3. 对 FPL 官方数据、API-Football 汇总仓库以及 TheSportsDB 保持“许可未满足/用途受限”的状态。evmax 发布者另行 CC BY 授权的是其模型投影，但投影里的 PL/FPL 身份字段仍应作为独立权利项评估。若未来要使用这些上游字段，先取得对应服务和赛事权利方对公开存储、展示及衍生指标的书面授权；数据集作者另写的开源许可证不足以消除上游限制。

本次只核验官方项目说明、数据卡、发布者许可声明和服务条款；没有下载这些数据集，也没有验证数据文件中的逐球员行数或指标缺失率。
