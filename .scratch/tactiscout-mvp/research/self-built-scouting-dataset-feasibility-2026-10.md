# TactiScout 自建球探数据集可行性

**核验日期：2026-10-04**
**范围：**官方数据集/作者资料、许可与访问状态；不构成法律意见。

## 结论

**可行，但“自建”应指自建统一数据模型、可复现的特征计算和第一方观察记录，不是把网上现成数据爬下来后就当作自有数据。**上游球员、比赛、事件和转播数据仍然受各自来源的许可与更新条件约束；公开可访问也不等于可以批量复制、再发布或交给 LLM。

截至核验日，在本次核验的来源中没有找到同时满足“当前赛季、跨主要联赛、球员身份完整、细粒度能力数据、许可明确且可自由再发布”的单一公开来源。可行的 MVP 是先固定一个数据来源和一个赛季，把“球员表现证据”做扎实；当前阵容/转会状态另记来源及截至日期，不能把旧赛季表现说成当下状态。

## 可用数据集对照

| 来源 | 可支持什么 | 主要限制 | 建议用途 |
|---|---|---|---|
| [Impect Open Data](https://github.com/ImpectAPI/open-data) | 官方仓库提供完整 2023/24 德甲赛季的事件、事件级 KPI、球员单场 KPI、阵容、球员/球队信息和 KPI 定义；可用于研究细粒度能力画像与战术特征。 | 最新是 2023/24，不能代表 2026 当前表现。仓库明确要求遵守单独的 [LICENSE.pdf](https://github.com/ImpectAPI/open-data/blob/main/LICENSE.pdf) 并署名/展示 Impect 标志；这不是可直接按 MIT/CC 许可处理的数据，原始数据是否可提交到公开仓库、展示或传给 LLM，必须先按该协议确认。 | **可选 benchmark，不是自采主线。**只有在需要高粒度事件数据做方法验证且协议覆盖项目用途时再使用。 |
| [StatsBomb Open Data](https://github.com/hudl/open-data) | 官方 JSON 仓库包含比赛、事件、阵容以及部分比赛的 360 位置快照。现行清单能看到 2024 欧洲杯、2024 美洲杯、2023/24 德甲等资料；数据量和事件语义适合演示传球、推进、压迫/防守参与等评估。见[官方比赛清单](https://raw.githubusercontent.com/hudl/open-data/master/data/competitions.json)及[仓库说明](https://github.com/hudl/open-data#readme)。 | 覆盖按比赛/赛季挑选，并非当前完整球员池：例如官方清单里英超可见赛季为 2015/16，法甲最新可见为 2022/23。StatsBomb 要求接受其 User Agreement；发布分析须标注 StatsBomb 并使用其标志。[StatsBomb 官方 Python 说明](https://github.com/hudl/statsbombpy#open-data)要求先注册并阅读协议。协议允许的具体存储、再发布及 LLM 用途不能从“GitHub 可下载”推定。 | 若协议确认允许项目需要的分析与展示，可作为多项赛事的**单一事件数据层**；固定上游 commit/下载日期，并把历史覆盖显示给用户。不要把它宣传成实时全联赛数据库。 |
| [Wyscout / Pappalardo Figshare 数据集](https://figshare.com/collections/Soccer_match_event_dataset/4415000) | 作者发布的比赛事件数据覆盖 2017/18 五大联赛，以及 2018 世界杯和 2016 欧洲杯；事件含时间、位置、球员和事件属性。Figshare 事件数据项标为 CC BY 4.0，并要求研究/分析时引用论文。见[作者论文](https://www.nature.com/articles/s41597-019-0247-7)和[事件数据项](https://figshare.com/articles/dataset/Events/7770599)。 | 数据虽广但历史过旧；不可用来声称球员现效力球队或当前能力。CC BY 需要署名，并说明是否作过修改；要保留作者/来源/许可记录。[许可全文](https://creativecommons.org/licenses/by/4.0/legalcode)。 | 适合搭建和回归验证事件导入、指标算法、角色内比较；演示必须标“历史回顾”，不可充当当前候选名单。 |
| [IDSSE / DFL 授权数据](https://doi.org/10.6084/m9.figshare.28196177) | 作者论文说明 DFL 授权以 CC BY 4.0 发布：2022/23 德甲和德乙共 7 场，包含球员名、事件及 25Hz 球员/足球位置，适合验证防守站位、空间和跑动相关算法。[论文数据说明](https://www.nature.com/articles/s41597-025-04505-y)。 | 只有 7 场，不足以代表赛季球员水平；没有视频，不能把统计样本扩充成球探报告。 | 作为小规模战术/跟踪特征验证集；不做主要候选池。 |
| [SkillCorner Open Data](https://github.com/SkillCorner/opendata) | 官方仓库可访问，包含 2024/25 澳大利亚 A-League 的 10 场广播跟踪、动态事件、赛季级身体/无球跑动/传球汇总，另有两场 3D 姿态。 | 仓库的 MIT 文本授予的是 “Software” 使用权；README 另称数据为 open sourced 并请求署名，但没有把数据许可范围清楚写成独立许可。README 还指出身份标记准确率约 97%，事件 ID 仅在单场内唯一。故不要把 MIT 自动扩大解释为数据/身份映射许可，也不要跨源按名字合并。 | 可以先做本地解析与身体/无球指标实验；公开再分发、并入主库或对外展示前，先确认数据许可及身份字段含义。 |
| [Metrica Sports Sample Data](https://github.com/metrica-sports/sample-data) | 官方样例有同步事件和球员/足球跟踪数据，适合实现和校验跟踪数据算法。 | 官方说明样例球员、球队、赛事均匿名；页面仅请公开使用时致谢，没有明确数据许可。无实名球员，无法支撑球员引援排序。 | 仅用于技术验证，不进入实名球探候选库。 |
| [OpenFootball football.json](https://github.com/openfootball/football.json) | CC0 的比赛赛程和结果；最新赛季 JSON 每日由 GitHub Action 生成。 | 上游 Football.TXT 暂无每日自动更新；无球员/能力表现资料。见[项目说明](https://github.com/openfootball/football.json#readme)及[CC0 声明](https://github.com/openfootball/football.json/blob/master/LICENSE.md)。 | 可作比赛索引/结果辅助层，不可作球员能力源。 |
| [Afriskaut Dynasty Scouting League 2024](https://github.com/Afriskaut/dynasty-scouting-league-2024-open-data) | 数据作者发布 2024 赛事事件、球员信息、名单、比赛元数据和字段定义；数据集页面声明 Apache 2.0 并要求署名。 | 限定单项 2024 赛事；若目标是欧洲俱乐部引援，球员与竞赛覆盖不匹配。它不会提供其他联赛球员的当前状态。 | 如果项目专门展示非洲赛事球员分析，可另开试验数据集；不混进欧洲候选池。 |

## 不适用项与爬取边界

- **不建议把 FBref 当作可爬的基础库。**Sports Reference 当前条款禁止未经书面许可把站点内容用于 AI 训练、微调、提示或模型评分，也限制自动访问和建立竞争性数据库；其数据使用说明明确表示，不应基于其抓取数据构建工具或用来训练生成式 AI。[官方条款](https://static.fbref.com/termsofuse.html)、[官方数据使用说明](https://fbref.co.uk/data_use.html)。
- **不建议爬 Transfermarkt 做身价/合同数据库。**其使用条款明确禁止 bots、spiders、screen scraping 等自动复制数字内容，也禁止将内容用于 AI 训练或开发。[Transfermarkt 条款](https://www.transfermarkt.us/intern/anb)。
- 抓取器或开源库的代码许可证不会自动授权目标网站的数据。不同数据层要分别核对条款；没有清楚授权时，不下载成长期数据库、不提交原始数据、不喂给云端模型。此处给的是项目风控建议，具体法律适用需专业意见。
- 自己看比赛并记录观察可以形成 TactiScout 的第一方分析层，但**观看到内容不等于获得转播画面再发布权**。首批人工观察宜来自自有/获授权素材，或仅保存有出处的文字观察，不复制视频/图片；每条记录需标注观察者、比赛、日期、分钟、角色、维度及事实依据。

## 建议的数据集结构

```text
dataset/
  sources/                 # 数据源清单、许可、署名、获取时间、commit/版本、hash
  raw/<source>/<version>/  # 仅存许可允许的原始文件；否则只保留下载/校验脚本
  normalized/              # provider + 原生 ID 命名空间下的比赛、球队、球员、出场、事件
  features/                # 可复算的单场/赛季指标；定义、分母、分钟、源版本随值保存
  observations/             # 自录主观观察；观察者、比赛/分钟、角色、维度、证据说明
  identity-crosswalk/       # 仅保存由官方 ID 或人工核验建立的映射，不按姓名自动拼接
```

关键边界：每个事实和指标都保留提供方与赛季；不同供应商同名指标不能默认可比。把原始事件聚合成 TactiScout 的指标是我们自己的算法产物，但底层事件仍继承上游许可。手工观察与供应商统计分开保存、分开呈现；RAG 检索原文/已授权资料和第一方观察记录，不把未经许可的整包上游原始数据直接放入上下文。

## 建议实施路线

1. **选择一个可用的公开事件数据快照和明确范围。**核实原始协议是否覆盖本项目要做的保存、派生指标、模型处理、报告展示与署名；锁定具体赛事、赛季和获取版本，不从网站临时 scrape 全联赛。
2. **用现有 Wyscout 2017/18 快照验证通用构建契约。**它验证了确定性聚合、版本清单、哈希和覆盖报告，但不能作为当前候选池。新输入用独立 source adapter 接入同一 TactiScout 数据模型，避免把两个 provider 的同名字段合并。
3. **聚焦 5–8 个来源实际支持的维度**：例如推进、传球、创造机会、压迫与防守参与。每个派生指标包含字段定义、公式、方向、分母、样本分钟/场次及缺失率；无法计算的字段为空，不以 0 代替。
4. **将快照范围放进候选和报告链路。**候选搜索只能返回这个版本中实际存在且身份明确的记录。报告标出赛事、赛季、数据获取日、样本数和指标覆盖；旧赛季只称历史表现，不推断当前效力。
5. **第一方观察作为独立的增强步骤。**观察者可用已有表单记录少量比赛场景，为已识别球员补充定性战术证据；不要求用户先录入整份名单，也不把主观 1–5 档跨场平均成总分。双人复核可在样本积累后用于检查量表说明。

这条路线让“自建”体现为可解释的评估方法、可审计的数据沿革和版本化的有限统计快照；第一方观察用于持续补充战术语境。不是更换爬虫或继续加 provider 数量。

## 2026-10-04 路线复核：自建管线优先于手工造完整球员库

在进一步核对当前公开来源后，修正上面的实施优先级：**第一方观察应是战术补充层，不应要求用户手工创建完整候选库。**“自建数据”更适合定义为 TactiScout 自己维护来源准入、可复现导入/采集、标准化、身份关联、指标计算、快照版本、质量报告和用户可见边界。底层事实仍属于原始来源；TactiScout 自己拥有的是处理流程、口径、派生结果与产品说明，而非被抹除来源的原始球员数据。

- [Sports Reference / FBref 官方条款](https://static.fbref.com/termsofuse.html)对自动访问、AI 用途和建立有竞争性的数据库设有限制；[官方 bot 说明](https://www.sports-reference.com/bot-traffic.html)也讨论其对爬虫请求频率的限制。其[2026 年 1 月数据更新公告](https://www.sports-reference.com/blog/2026/01/fbref-stathead-data-update/)说明上游数据合作终止后，FBref 移除了高级足球数据。因此 FBref 不适合作为批量爬取、AI 处理并重建产品数据库的底座。
- [StatsBomb 官方 Open Data 仓库](https://github.com/hudl/open-data/blob/master/README.md)提供所选赛事的 JSON 比赛、阵容、事件与部分 360 文件，并要求发布分析时注明 StatsBomb 和使用其标志。直接核对官方[赛事清单](https://raw.githubusercontent.com/hudl/open-data/master/data/competitions.json)与比赛文件后，2023/24 德甲仅列出 34 场样本，不是完整赛季候选池；因此不适合替换现有五大联赛全赛季样本。[官方 User Agreement](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)允许分享基于数据的分析，但限制向第三方提供数据和商业化数据/分析，发布分析须使用 StatsBomb logo。它适合本地研究案例，不作为本项目的默认广域候选库。
- 当前可行的产品路线是：用一个明确授权、字段定义可审计的来源构建第一版统计快照；先聚焦一个可比较的赛事/赛季范围，再将 TactiScout 自己计算的指标、质量检查和数据限制做完整。Wyscout 2017/18 快照保留为已有历史管线示范；若新增 StatsBomb 输入则先验证许可和实际可用的当前数据范围，不能宣传成 live/current 市场。
- 没有证据支持“免费 + 当前 + 主要联赛全覆盖 + 细粒度球员能力数据 + 清楚允许采集/模型处理”的单一来源存在。若用户坚持当前球员池，只能诚实地缩窄范围、在本地定期构建有出处的快照，或承认需要获得数据权利；不应靠绕过访问控制或静默批量抓取填补缺口。

### 本地数据采集管线执行记录

- 已实现 `pnpm dataset:refresh`，固定使用 Figshare API 的 5 个 Wyscout 文章版本；逐篇验证 DOI、标题、CC BY 4.0 和文件名，再按 API 的 MD5/字节数复用或下载文件。`events.zip` / `matches.zip` 的解压条目必须是预期命名的顶层 JSON，拒绝目录穿越、未知后缀和符号链接；归档文件及导入原始文件均不进入 Git。
- 用本地真实原始文件执行后，5 个 Figshare 项均与官方元数据的 MD5/大小一致；没有触发重复下载。构建得到 5 个联赛、2017/18、1,826 场、98 队、2,561 名球员和 2,682 条球员赛季档案。派生渐进传球与地面防守对抗保留 TactiScout 公式、覆盖率和来源限制；这证明了可复现的数据产品链路，不证明它是当前市场数据。

这意味着项目不应等待用户录入 12 场观察之后才拥有候选发现能力。观察试点可以后续增强战术判断；可运行的数据工程主线应先把一份范围有限的原始公开数据转成 TactiScout 版本化快照，并使 Agent 对来源、赛事范围、指标缺失和时间新旧进行工具化调查。
