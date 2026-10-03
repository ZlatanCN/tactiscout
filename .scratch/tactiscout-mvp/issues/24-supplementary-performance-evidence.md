# 来源特定的可追溯表现指标

Type: task
Status: claimed
Labels: ready-for-agent

## Goal

Let the Agent inspect additional, provider-specific player performance indicators without treating them as universal attributes or blending them into current role scores. Prepare a local SkillCorner Open Data aggregate adapter, with source identity, field semantics, units, sample context, and permission gates kept visible.

## Research basis

See [additional player evidence sources](../research/additional-player-evidence-sources-2026-10.md). SkillCorner's 2024/25 A-League aggregates add physical, passing, and off-ball-run observations. The repository describes the data as open-sourced and asks for SkillCorner attribution, while its MIT license does not clearly identify the player-level CSV data, external LLM use, or public portfolio display as licensed material. The adapter must keep the files outside the repository and require explicit local-storage and model-processing settings. The app must describe the data as a historical A-League sample, never as current coverage or a European recruitment pool.

## Acceptance criteria

- [x] Player profiles can carry typed source-specific metrics with provider field ID, readable definition, unit/normalization, nullable value, sample minutes/matches, and source identity.
- [x] SkillCorner aggregate files are read only from a configured local directory; the app does not download, bundle, or commit real player-level source data.
- [x] Parsing joins physical, passing, and off-ball-run rows using provider player/team/season/position identity; duplicate or incompatible rows fail clearly instead of merging by name.
- [x] Unsupported/missing fields remain null and are absent from evidence; they do not become zero or affect a role score.
- [x] The Agent can cite available metrics as evidence and the report/UI preserve units, source, season, and sample; the existing role score uses these metrics only after an explicit documented formula is added.
- [x] Local storage, model processing, and report display are independently disabled by default and must each be explicitly enabled for SkillCorner mode.
- [x] Position groups map only to the broadest justified TactiScout position. Age, current-club, budget, and present-season claims remain governed by available evidence.
- [x] Deterministic tests use synthetic CSV fixtures and cover quoting, provider-identity row matching, missing values, duplicates/conflicts, position mapping, metric normalization, all three independent permission gates, and recommendation evidence references.
- [x] `.env.example`, README, CONTEXT, issue map, and the response report identify the source scope, attribution request, unresolved use terms, and live-data limitations.
- [ ] Before enabling SkillCorner with real player-level files, confirm local storage, model-processing, and report-display rights for those files, then run a local smoke test without committing raw data.

## Answer

本地 SkillCorner aggregate adapter 与 Agent evidence/report 支持已实现：解析只接受配置目录中的三个 CSV；provider 身份包含球员、球队、赛事、赛季和位置组；新指标仅可作为带单位、来源字段和样本范围的证据引用，不进入现有职责评分；旧版单轮启发式端点拒绝 SkillCorner 模式。合成 CSV fixture 已验证 CSV 解析、provider 身份拼接、缺失值、重复与冲突、位置映射、每 90 分钟归一化、三项独立 opt-in，以及推荐证据链。当前没有把真实 CSV 放入仓库或自动下载；真实来源数据读取和数据权利确认仍待完成，因此 issue 保持 claimed。

## Comments

- 2026-10-04：新增数据源调研认为 SkillCorner 是当前最有分析价值的公开样例，但原始球员级数据不进入仓库；先实现本地读取接口，并将本地保存、模型处理和报告展示设为三个独立 opt-in。
- 2026-10-04：新增 `SkillCornerPlayerRepository`、7 个可追溯指标、位置组保守映射、报告样本列和三项默认关闭的使用开关。API / Web TypeScript 编译与 Web 生产构建通过；本轮未运行测试。真实来源文件、确认的保存/LLM/展示权利和确定性 adapter 测试仍未完成。
- 2026-10-04：新增合成 CSV adapter 与完整推荐链路测试；覆盖 BOM、引号、按复合 provider identity 拼接、缺文件、重复/冲突、缺失指标、位置映射、年龄和 per90、三项独立授权，以及来源指标从文件进入最终报告且不虚构缺失事件指标。完整测试套件 111 项通过，API 与测试文件 TypeScript 检查通过，Web TypeScript/Vite 构建通过。没有读取真实 SkillCorner 文件；数据权利仍未确认。
