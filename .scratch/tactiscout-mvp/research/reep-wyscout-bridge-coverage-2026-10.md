# Reep 到 Wyscout 的历史档案桥接范围

核查日期：2026-10-04。使用 Reep、Wyscout 和数据集发布方的一手资料；已导入 Reep 公开身份文件并完成一个真实 provider-ID → Wyscout archive-ID 的本地 smoke。未调用任何在线 provider API；smoke 使用合成候选外壳，不代表真实 Sportmonks API 联调或总体覆盖率。

## 结论

Reep 可以作为当前来源 ID 与 Wyscout archive ID 之间的**跨来源身份映射层**，但 coverage 不是球员或 provider 的完整性承诺。适合把 Wyscout 的 2017/18 记录作为有出处的历史背景并列到候选报告；不能由 mapping 推出候选当前效力、现役能力、市场可行性或 Wyscout 未覆盖联赛中的表现。

Reep 当前离线 release 的 stamp 为 `20261003T052950Z`；部分官方说明页仍显示 `20260926T145536Z`。本机按 stamp 固定下载 `bridges.csv.gz` 与 `redirects.csv.gz`，与官方 checksum 文件逐一核验后导入 SQLite。扩展 importer 支持 API-Football namespace 后，当前项目索引收录 791,122 条 bridge rows，其中 API-Football 为 154,642 条；数据文件位于 Git 忽略的 `.data/`，没有加入仓库。程序和报告应记录实际导入索引中的 `release_stamp`，不能把发布日期写死或从旧教程推断。[latest release metadata](https://data.reep.football/releases/latest.json) · [official checksums](https://data.reep.football/releases/20261003T052950Z/checksums.txt) · [Reep downloads and updates](https://www.reep.football/get-started/)

## 跨来源身份映射能证明什么

- 官方 bridge 以 provider、namespace 和 provider external ID 定位来源记录；redirect release 需要跟随 `merged`，并保留无法规范化的撤销/隐藏状态。Reep ID 与 provider ID 只解决身份关联，不提供球员统计或当前 roster。[Reep data](https://reep.football/data/) · [Getting started](https://reep.football/get-started/) · [release schema](https://data.reep.football/releases/latest/schema.json)
- 官方 coverage 是按 provider 和赛事逐项构建的，没有承诺所有比赛、球员或 source rows 都可互相映射。`sportmonks` 在 coverage 中是 bridge-only：可帮助把 Sportmonks external ID 接到另一个身份锚点，但不能把 bridge 自身当作 Sportmonks 独立表现证据。[Coverage](https://www.reep.football/coverage/)
- 所以报告需要将“查询候选数、Reep 映射到 Wyscout 的人数、命中本地 Wyscout 历史档案的人数”分开显示；无 bridge、模糊/撤销身份和本机档案缺行都保持 missing/partial，绝不按零表现处理。本次 smoke 只验证 1 个明确 bridge：Sportmonks `1002` → Reep `rp606b79a0db2365` → Wyscout `9080` → 本地 2017/18 意甲 Genoa 记录（1,617 分钟，9 项可用指标）；这是实现路径样例，不是对一个真实候选池计算出的覆盖率。
- 身份入口只接受候选 `sourceIdentity.provider` 与原始 `sourceIdentity.playerId`。禁止用姓名、球队名或相似统计兜底；不拼接、更改任何来源的 `PlayerProfile`。

## Wyscout 记录可作为何种背景

Wyscout Open Data 对应明确赛季与比赛的历史事件档案，论文与发布仓库标明数据集来源及 CC BY 4.0 许可。它可给候选报告增加赛事/赛季/球队、样本分钟，以及数据完整时的进球、助攻、传球与有定义的事件派生项；这些都是所记载赛季的观察值，不代表球员当前表现。[Dataset paper](https://doi.org/10.1038/s41597-019-0247-7) · [Figshare collection](https://figshare.com/collections/Soccer_match_event_dataset/4415000)

报告必须保留数据集署名和许可链接，并展示球员 ID、赛事、赛季、分钟、Reep release stamp、source/archive bridge rung 与 upstream status。Wyscout 衍生指标沿用项目现有字段定义与限制，尤其将 progressive pass 标记为项目推算，将旧版 tag 302 关键传球与射门助攻区分；数据不完整时不显示。

## 展示、保留与 Agent 边界

- Reep 的公开 bridge release 是 CC0；Wyscout 数据集为 CC BY 4.0。署名和许可信息必须随报告样本显示。[Reep data](https://reep.football/data/) · [Wyscout dataset paper](https://doi.org/10.1038/s41597-019-0247-7) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- 这些版权许可本身不能回答所有个人数据、肖像、公开作品集演示范围或具体持久化安排。因此实现将报告展示和应用管理的本机保留作为两个默认关闭的配置 gate。此历史 enrichment 不进入 planner/LLM、能力评分、peer percentile 或推荐排序。
- 查询只在主 Agent 的结论已通过证据 review 后运行，作为独立 report-only 节点。LangGraph checkpoint 和浏览器计划快照都会持久化报告，所以“启用展示”不能替代“允许本地保留”。

## 项目落地与未验证项

- 已新增可选 Wyscout archive sidecar：Sportmonks、StatsBomb Open Data、SkillCorner 候选经本地 Reep resolver 精确查到 Wyscout ID 后，再从本机 Wyscout 文件抽取每条球员历史样本。它不做自动下载，不调用 Reep API，也不会把 sidecar 送入模型。
- 本机已导入 Reep `20261003T052950Z` identity index，并通过上述单 ID smoke；源记录 ID 来自该 release，历史档案取自本地 Wyscout Open Data。针对本机 Wyscout 快照的固定样本映射覆盖在 [PlayerElo/Reep 映射研究](playerelo-reep-exact-identity-crosswalk-2026-10.md) 中单独报告；单 ID smoke 仍不验证在线 Sportmonks 查询、真实候选池覆盖率或报告 UI 的人工验收。
- Reep 网站不同页面存在 stamp 滞后；当前数据落在 Git 忽略的 `.data/`。以后换版时需按 pinned release 校验 checksum、导入并对固定来源 ID 重新计算覆盖摘要。

## 一手来源

- [Reep latest release metadata](https://data.reep.football/releases/latest.json) · [2026-10-03 release schema](https://data.reep.football/releases/20261003T052950Z/schema.json) · [2026-10-03 checksums](https://data.reep.football/releases/20261003T052950Z/checksums.txt) · [Provider/competition coverage](https://www.reep.football/coverage/)
- [Reep download and release notes](https://www.reep.football/get-started/) · [Reep data terms and release](https://reep.football/data/)
- [Wyscout Open Data paper](https://doi.org/10.1038/s41597-019-0247-7) · [Figshare collection](https://figshare.com/collections/Soccer_match_event_dataset/4415000) · [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- [Wyscout event guide](https://support.wyscout.com/matches-wyid-events) · [Progressive pass definition](https://dataglossary.wyscout.com/progressive_pass/) · [Key pass definition](https://dataglossary.wyscout.com/key_pass/)
