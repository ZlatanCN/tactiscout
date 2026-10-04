# Build a layered, provenance-aware player evidence chain

Type: task
Status: claimed
Labels: ready-for-agent
Blocked by: none

## Goal

让 TactiScout 在一个招募案件中组合互补的足球数据来源，同时保持候选身份、比赛表现、历史样本和第一方球探观察的证据边界。项目不再把单一 provider 当作完整球员数据库，也不把多个半完整 provider 拼成貌似权威的统一档案。

## Why now

用户最新决定允许扩大数据来源。当前代码已有 FBref、Sportmonks、StatsBomb、Wyscout、SkillCorner、Reep、PlayerElo 与第一方观察等不同模块，但 `TACTISCOUT_DATA_MODE` 主要以单一 provider 决定候选池，配套能力和真实验证程度也不一致。此前“FBref 是唯一当前候选池”的产品决策已被用户更新；FBref 实测返回 403，不能继续作为已可用的数据主链路。

## Scope

- 先基于 [数据源扩展复核研究](../research/football-data-source-research-refresh-2026-10.md) 选定可落地来源组合；区分无需凭据的开放历史数据、需免费 key 的来源、付费授权来源、第一方观察和暂不可自动使用的公开网页。
- 分开表达当前候选发现、身份/效力核验、可比比赛表现、历史事件样本、外部整体表现信号和第一方观察。每种来源只能填充自己可证明的事实。
- 在线候选 provider 执行有界的查询；可选证据来源按已确认身份按需查询。来源缺失、访问失败、零结果、字段缺失和身份歧义必须可区分。
- 每项可用于报告的证据保留 provider/文档身份、来源 ID、赛事/赛季或观察日期、取得时间、字段定义、单位、样本与来源限制。
- 只使用精确 provider ID 或已验证 crosswalk 关联不同来源。姓名相同不构成身份匹配；身份映射不代表统计口径可比。
- LangGraph 负责基于当前案件的证据缺口选择下一项工具、追问或结束；它不能让模型改写来源事实、把旧赛季说成现役状态，或将许可未允许的内容送入模型。
- 工作台与报告分来源展示数据范围、更新时间和缺失项。必需候选来源失败时停止并解释；可选补充来源失败时保留已获得的证据并标注不完整。

## Acceptance criteria

- 有一份由一手来源支撑的准入来源矩阵，逐项记录 API/抓取方式、覆盖、更新时间、球员字段、价格/凭据、展示/存储/模型处理条件及未验证项。
- 至少一条当前候选发现路径和一条有实际数据的补充表现或观察路径能在同一案件中端到端运行；两条路径各自显示来源、时间和限制。
- 额外来源不会未经身份解析就重复创建候选人，不会将不兼容的统计定义放入同一个排名维度。
- LangGraph 工具结果能区分候选池来源、补充证据来源以及实际覆盖范围；Reviewer 校验结论引用的是本轮检索到的证据。
- 任一来源的权限或自动访问条件不清楚时，不会被代码默认启用或送入 RAG/LLM。来源暂时不可达时，不伪装成空名单。
- README、`CONTEXT.md`、issue map 和用户界面一致说明“当前候选池”“历史表现样本”“外部信号”“第一方观察”的不同用途。
- 真实 API/key/许可无法验证的部分明确标为未验证，不用 fixture 测试声称 live provider 已可用。

## Research

- [当前球员数据源与自建路径复核](../research/current-player-data-source-options-2026-10.md)：用户允许扩大来源后按官方资料重新比较 PlayerElo、Sportmonks、football-data.org、TheSportsDB、Reep、Wikidata、OpenLigaDB、StatsBomb 与 Wyscout；建议将 PlayerElo 作为需先取得 key、确认权限并做一联赛小样本核验的只读外部信号，不视为当前主候选池。
- [数据源扩展复核研究](../research/football-data-source-research-refresh-2026-10.md)：用户重新开放来源范围后的最新一手来源调查；它会替代“FBref 是唯一主候选池”的旧决策，但不会删除旧调查与实现记录。
- [按需数据源查询契约](32-query-scoped-player-source-contract.md)：保留 LangGraph 查询预算、分页和失败分类。
- [来源特定表现证据 ADR](../../../docs/adr/0003-source-specific-performance-evidence.md)：扩展来源时仍须保留指标所属来源、口径与样本，不根据姓名自动合并或默认跨来源计分。
- [Reep → Wyscout 桥接调查](../research/reep-wyscout-bridge-coverage-2026-10.md)：Reep 是部分覆盖的 ID crosswalk，不是表现来源。

## Comments

- 2026-10-04：用户明确要求持续把项目推进到可交付的简历项目，并允许扩大数据来源。开始重审数据架构和现有第一方观察/RAG 能力；不会把网页可读误当作授权，也不会用多个不完整来源伪装成完整数据库。
- 2026-10-04：一手来源复核后，路线确定为：第一方比赛观察作为自有证据采集；Sportmonks 作为需账户/联赛选择的当前池候选；Wyscout/StatsBomb 与 SkillCorner 用于有边界的历史事件/追踪指标；OpenFootball 只做国际赛事实体/赛程上下文。免费 Sportmonks 覆盖丹麦/苏格兰，官方 Starter 定价页列 €29/月任选 5 个联赛；本机无 token，故实时链路仍未验证。细节与来源链接见关联 research refresh。
- 2026-10-04：首个实现切片是 issue 41：扩展现有自录观察为样本绑定的 1–5 主观能力档和具体比赛证据；不做跨来源拼接、不聚合成能力分、不替代当前候选源。
- 2026-10-04：用户最新方向改为以自采第一方观察为产品数据主线，停止继续扩展多 provider。issue 39 保留来源准入、身份、赛季和口径边界；其“组合多种外部来源以覆盖当前候选池”的目标由 [issue 40](40-tactiscout-owned-scouting-dataset.md) 的新路线取代。详见[自建数据集可行性调查](../research/self-built-scouting-dataset-feasibility-2026-10.md)。
- 2026-10-04：用户随后明确允许扩大数据源，恢复分层组合研究。最新[来源复核](../research/current-player-data-source-options-2026-10.md)没有找到兼具主要联赛当前覆盖、可复算战术指标、低成本和公开/模型使用边界明确的单一来源；Sportmonks 仍是现有适配器中最完整的候选池方案，PlayerElo 可在取得 key 与核实展示/保留/模型处理范围后做一联赛小样本、report-only 对照，Reep 继续作精确 ID bridge。当前环境没有 Sportmonks、PlayerElo 或 API-Football 凭据，未声称 live API 已验证。

## Answer

进行中。
