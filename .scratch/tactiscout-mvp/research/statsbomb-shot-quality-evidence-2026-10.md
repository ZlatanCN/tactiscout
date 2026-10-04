# StatsBomb Open Data 射门质量证据调查

研究日期：2026-10-04。范围：Hudl/StatsBomb 官方 Open Data 仓库、官方 schema/examples 与官方使用协议；未读取任何用户本地原始球员数据，未修改应用代码。本记录用于产品与数据工程决策，不构成法律意见。

## 结论

**技术上适合实现带出处的历史射门质量证据。** StatsBomb 官方数据规范说明，射门事件的 `shot.statsbomb_xg` 是 StatsBomb 自有 xG 模型的结果，并“Recorded for all shots”；`shot.type` 区分 Open Play、Penalty、Free Kick、Corner 等类型。官方 xG 说明把 xG 定义为单次射门进球概率，并介绍每 90 分钟 xG 与平均 xG/射门在球员表现分析中的用途。射门起点坐标放在事件顶层 `location`，不是 `shot.location`。官方 2022 世界杯决赛 JSON 同时展示了普通比赛中的射门和点球大战中的射门，字段层级与类型可直接核对。[官方数据规范](https://raw.githubusercontent.com/hudl/open-data/master/doc/StatsBomb%20Open%20Data%20Specification%20v1.1.pdf) · [官方 xG 说明](https://statsbomb.com/soccer-metrics/expected-goals-xg-explained/) · [官方事件样例](https://github.com/hudl/open-data/blob/master/data/events/3869685.json#L126641-L126696) · [点球样例](https://github.com/hudl/open-data/blob/master/data/events/3869685.json#L187901-L187948)

由逐射门 xG、点球类型和球员上场分钟，可以确定性地派生 xG/90 和非点球 xG/射门。它们是 TactiScout 的派生统计，不是 Open Data 已提供的球员级汇总字段。官方 schema 对 xG 与 shot type 都注明适用于所有射门，但这不等于已验证每个历史 JSON 文件、每个射门实例都完整；接入仍必须检查 `statsbomb_xg` 和 `shot.type` 的覆盖率。缺失 xG 时不能当作 0；缺失类型时不能擅自归为非点球。

**许可建议：适合先做严格本地、非商业研究/作品集原型；公开展示须带 StatsBomb 来源与官方 logo，不应公开原始 JSON。** 官方 README 将数据定位为研究项目和足球分析兴趣用途；发布、分享或分发基于数据的分析/洞察时，要求注明 StatsBomb 并使用其 Media Pack logo。官方仓库同时要求注册并阅读其 Public Data User Agreement。协议明确禁止向外部或第三方提供原始数据，并禁止商业利用数据或其分析结果。[官方 Open Data README](https://github.com/hudl/open-data/blob/master/README.md) · [官方用户协议 PDF](https://github.com/hudl/open-data/blob/master/LICENSE.pdf) · [官方 StatsBombR README（注册与协议说明）](https://github.com/hudl/StatsBombR/blob/master/README.md) · [官方 Media Pack](https://statsbomb.com/media-pack/)

**本地 Ollama 处理是合理的工程推论，但不是协议明文许可。** 协议没有专门提到 LLM、生成式 AI 或本地推理。如果 Ollama 确实运行在同一台机器、请求没有发往云端，且只输入派生后的少量指标摘要而不输入原始事件，数据不会被提供给外部第三方；这与外传原始 JSON 有别。但“本地模型处理已获明确授权”不能作为事实写在产品文案中。求职作品集的公开、宣传或商业属性也没有在公开协议里针对个人项目单独说明；若要公开球员级指标或部署在线 demo，建议先向 Hudl 确认该用途是否符合其协议。

## 字段核验：官方明确写出的事实

| 问题 | 一手来源支持的事实 | 对实现的含义 |
| --- | --- | --- |
| 每次射门是否包含 `shot.statsbomb_xg`？ | 官方 StatsBomb Open Data Specification v1.1 把 `statsbomb_xg` 定义为该射门的 StatsBomb expected goals 值，并标注为所有射门记录。官方 2022 决赛样例中的 `type.name = Shot` 事件含 `shot.statsbomb_xg`。 | 可以读取 provider xG 并聚合；称为“StatsBomb xG”，不可说成 TactiScout 自己训练/预测的 xG。schema 说明字段预期存在，但未证明每个历史文件/记录均无缺失，须运行时校验并展示 coverage。 |
| 是否有 penalty / shot type？ | 官方规范把 `shot.type` 定义为类型对象，示例值包含 `87 / Open Play`、`88 / Penalty`、`62 / Free Kick`、`61 / Corner`、`65 / Kick Off`，并标注该字段记录于所有射门。官方决赛样例的点球大战射门展示 `shot.type.name = Penalty`。 | 非点球 xG 可按 `shot.type.name !== "Penalty"` 过滤，但要校验类型缺失率；未知 `shot.type` 不能默认归入非点球分母。 |
| 射门位置在哪里？ | 官方示例中的射门事件把射手、位置、球队和射门起点放在 event 外层，`location` 是坐标数组；嵌套的 `shot.end_location` 表示射门终点。 | 起点路径是 `event.location`，不是 `event.shot.location`。坐标能支持后续射门地图等分析，但不要把坐标错误归属到 `shot` 对象。 |
| 是否有守门员姓名/位置/坐标？ | 官方规范将 `shot.freeze_frame` 描述为射门瞬间相关球员的快照；条目可带球员姓名、ID、位置和 location，但该属性的约束为“Recorded only when true”。普通射门样例的 freeze frame 含守门员位置及坐标。另有独立的 `Goal Keeper` 事件，包含 `goalkeeper` 子对象，并通过 `related_events` 与射门关联。 | 可以在快照存在时观察守门员位置；不能假设每次射门都带快照或把它当成必填 `shot.goalkeeper`。单独的 `Goal Keeper` 事件是另一个 event 类型，需通过关联 ID 连接。 |
| 每球员上场分钟是否可得？ | 官方 lineups 样例含球员 `positions` 数组及 `from`、`to`、`from_period`、`to_period` 和进/出场/终场等原因；战术换位也会分成多个区间。 | 可由球员比赛阵容/时间区间推导分钟，但要正确处理换人、跨半场时间与战术位置分段，且不能把位置分段重复计入出场分钟。[官方 lineups 样例](https://github.com/hudl/open-data/blob/master/data/lineups/3869685.json) |

schema 链接：[Open Data 文档目录](https://github.com/hudl/open-data/tree/master/doc)，其中包含 `Open Data Events v4.0.0.pdf` 以及 `StatsBomb Open Data Specification v1.1.pdf`。本次可读取的公开 schema 对 `statsbomb_xg`、shot type 和 freeze frame 给出字段定义；实际接入应以每个 JSON 自身的 `data_version` / 运行时结构为准，并为旧赛季或例外事件保留 nullable 处理。

## 推荐的派生定义

以下是 TactiScout 建议采用的计算约定，不是 StatsBomb 官方发布的球员级公式：

- **xG/90：** `所有正式比赛射门 xG 之和 ÷ 实际上场分钟 × 90`。通常保留常规时间/加时赛中的点球 xG；排除点球大战。StatsBomb 示例把点球大战事件标为 `period = 5`，因此按 period 筛选比赛射门，避免把点球大战机会混进每 90 分钟表现。
- **非点球 xG/射门：** `非点球射门的 xG 之和 ÷ 非点球射门数`。仅统计常规时间与加时赛，排除 `shot.type.name = Penalty` 以及点球大战 period。分母为 0 时应返回不可用，而不是 0。
- **分钟口径：** 按 lineups / 换人时间得到的实际分钟计算；处理跨半场、加时和战术换位分段，分段只计时间、不按每段重复计球员分钟。数据不完整时标为估算或不生成 per90。
- **完整度口径：** 分开统计目标球员的射门数、含有效 xG 射门数、含有效 shot type 的射门数和被纳入计算的比赛数。任一计入范围的射门缺少/含无效 xG，xG 聚合应标示覆盖不足或不发布，不得用 0 填补；任一射门缺少/含未知类型，非点球统计应标示覆盖不足或不发布，不得把未知类型算作非点球。对历史文件做版本/文件级 coverage 汇总后再判断能否展示。
- **展示字段：** 赛事/赛季、数据来源、赛季覆盖、分钟、射门数、非点球射门数、派生公式版本、缺失数据说明。把“历史表现证据”与“当前球探建议”分开，StatsBomb Open Data 是所选比赛/赛季的历史样本，并非当前完整球员市场或球队名单 API。[官方 README 的数据目录说明](https://github.com/hudl/open-data/blob/master/README.md)

## 许可与模型处理：事实与推论分开

### 官方明确写出的事实

1. Open Data README 说明 StatsBomb 只把某些联赛数据免费提供给研究项目和足球分析兴趣用途。若发布、分享或分发基于数据的研究、分析或洞察，需写明数据来源为 StatsBomb 并使用官方 logo。
2. 官方 StatsBombR README 提示使用者先在 Resource Centre 注册、阅读 User Agreement，并指出使用仓库即同意协议。
3. 仓库将 `LICENSE.pdf` 作为 Public Data User Agreement，而非 MIT/CC 等常见标准开源许可证。协议 §1.1 将服务用途限定为分析、研究和促进数据的共享认知；§1.2.1 禁止编辑/歪曲、分发、复制、出售或以其他方式把数据提供给任何外部/第三方；§1.2.2 禁止商业利用数据或任何基于服务产生的分析；§1.4 要求公开相关材料时使用 StatsBomb 品牌 logo。应以[协议 PDF 原文](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)为准。

### 工程与产品推论

- 私人机器上做历史比赛研究并派生球员级 xG/90 与非点球 xG/射门，和官方所述分析/研究用途一致；若对外展示分析，必须同时满足 StatsBomb attribution/logo 条件及 User Agreement 的非商业边界。
- 任何将完整 JSON、逐事件列表或可重建原始事件的数据发送给云模型/API、作为可下载公开数据随项目发布、或提供给其他用户下载的实现，都可能与“不得提供给外部/第三方”的限制冲突，不应默认允许。
- 单机 Ollama 不把数据交给外部服务的前提下，只接收派生指标摘要，是当前最保守的 AI 接入方式；这属于对“外部/第三方”条款的朴素解释，不是协议中明确列出的 AI 许可。
- “简历项目/公开作品集”边界未针对个人开发者作明确定义。鉴于协议也禁止商业利用派生分析，公开 GitHub、面向雇主宣传或线上托管是否仍属许可研究用途存在解释空间。若要发布具名球员级结果、截图或可交互在线 demo，先向 Hudl 询问并保存书面答复，是较稳妥的路径；至少不发布原始事件文件。

## 给实现的结论

**可以安全开展本地适配和派生计算，但要把它界定为私有本地分析，完成资源中心登记并接受/遵循官方 User Agreement。** 做输入/输出隔离：确定性代码计算指标，Ollama 仅用本机服务解释来源明确的聚合证据；默认不把原始比赛 JSON、坐标轨迹或逐射门记录发送给模型或网络。上线或公开展示球员级结果前，满足署名/logo，并向 Hudl 确认简历作品集展示及本地 AI 处理的可接受范围。缺失/覆盖问题应通过报告说明，而不是由 LLM 臆测补齐。

## 官方一手来源

- [Hudl StatsBomb Open Data README](https://github.com/hudl/open-data/blob/master/README.md)
- [Open Data schema / event specification 目录](https://github.com/hudl/open-data/tree/master/doc)
- [StatsBomb Open Data Specification v1.1 PDF](https://raw.githubusercontent.com/hudl/open-data/master/doc/StatsBomb%20Open%20Data%20Specification%20v1.1.pdf)
- [StatsBomb xG 说明](https://statsbomb.com/soccer-metrics/expected-goals-xg-explained/)
- [StatsBomb Public Data User Agreement PDF](https://github.com/hudl/open-data/blob/master/LICENSE.pdf)
- [官方 2022 世界杯决赛 events JSON：普通比赛 Open Play 射门、xG、起点和守门员快照](https://github.com/hudl/open-data/blob/master/data/events/3869685.json#L126641-L126706)
- [官方 2022 世界杯决赛 events JSON：period 5 点球、xG 和 Penalty 类型](https://github.com/hudl/open-data/blob/master/data/events/3869685.json#L187901-L187948)
- [官方 lineups JSON：球员位置时间区间](https://github.com/hudl/open-data/blob/master/data/lineups/3869685.json#L74-L110)
- [Hudl StatsBombR README：注册与协议提醒](https://github.com/hudl/StatsBombR/blob/master/README.md)
- [StatsBomb Media Pack / logo](https://statsbomb.com/media-pack/)
