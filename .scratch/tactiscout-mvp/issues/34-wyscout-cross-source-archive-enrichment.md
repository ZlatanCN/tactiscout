# Wyscout 跨来源历史档案补充

Type: task
Status: resolved
Labels: ready-for-agent
Blocked by: 33

## Goal

在已有跨来源身份注册表与 Wyscout 2017/18 数据 adapter 上，给候选报告加入来源分离、时间明确的历史表现背景，让项目能展示多源身份解析与历史数据边界；不得把八年前样本说成当前能力或引援事实。

## Scope

- 仅对证据审查通过后的最终候选，在 LangGraph report-only 节点读取精确 provider ID → Reep ID → Wyscout player ID。
- 支持已登记 provider 身份：Sportmonks、StatsBomb Open Data、SkillCorner Open Data；不对 Wyscout 主数据模式重复附加其自身记录。
- 并列展示 Wyscout 可用总量指标/派生指标、历史赛季、赛事、队伍、分钟、来源归因、Reep release stamp、身份匹配 rung 与 upstream status。
- 不做姓名回退；不合并 `PlayerProfile`；不把历史档案提供给 planner/LLM；不参与能力分、同组比较或推荐顺序。
- 报告展示许可与 LangGraph checkpoint / 浏览器 localStorage 本机保留许可分别 opt-in，默认为关闭。
- 不自动下载 Reep snapshot，不调用 Reep API；缺索引/本地档案时报告原因；部分 coverage 不用零值替代。

## Acceptance criteria

- [x] 建立独立 issue 状态与资料来源记录。
- [x] 已完成代码、文档和双 opt-in；报告节点只在结论 review 通过后运行，数据不送 LLM、不改评分/排序。
- [x] 历史样本包含 season/competition/sample/provenance 与 CC BY 署名，并在 UI 显示为历史背景。
- [x] 默认关闭许可、缺本地依赖与 partial coverage 均有明确报告状态。
- [x] API 和 web TypeScript production build、`git diff --check` 通过；未运行测试。
- [x] 导入官方 Reep release 并完成真实映射 smoke 后更新 release、命中与遗漏摘要；明确这只是单 ID bridge smoke，不代表 live Sportmonks API 或候选池覆盖率。

## Research basis

- [Reep official coverage](https://www.reep.football/coverage/)：Wyscout bridges 约 1.44M rows、Sportmonks bridges 约 145K rows，后者为 bridge-only；覆盖按赛事分布，不意味着每个球员都能精确连接。
- [Reep latest release metadata](https://data.reep.football/releases/latest.json)：核查时实际 stamp 为 `20261003T052950Z`；部分官方引导页仍显示 `20260926T145536Z`。报告记录实际导入 index 的 stamp，不固定页面日期。
- [Reep data release](https://reep.football/data/)：CC0 离线 release 提供 provider-keyed identity bridges 与 redirects；按 release/version 使用，不应将身份记录当作表现字段。
- [Wyscout Open Data paper](https://doi.org/10.1038/s41597-019-0247-7)：本地项目数据是 2017/18 历史比赛数据，采用 CC BY 4.0 署名；旧赛季指标只描述历史样本。
- 项目现有定义见 root `CONTEXT.md` 的“跨来源身份映射”“历史表现样本”与“数据范围说明”。
- 覆盖含义、release 版本漂移和剩余核验见 [Reep → Wyscout 历史档案桥接范围](../research/reep-wyscout-bridge-coverage-2026-10.md)。

## Answer

新增 `src/data/historical-archive-enrichment.ts`，在证据审查通过后按候选来源 ID 精确解析 Reep identity，再用关联到的 Wyscout `player` ID 从本地 2017/18 数据中找历史赛季记录。节点只产出报告 sidecar；它既不把数据加入 conversation history，也不改评估与推荐 action。Wyscout 自身作为主来源时明确跳过重复附加。报告 schema、球员卡和全局覆盖摘要显示赛季/赛事/球队/分钟、可用 stats、CC BY 署名链接、Reep stamp、来源 ID、rung 与 upstream status。浏览器旧计划迁移会填入空 sidecar 和 `not_run` 状态。

添加两个默认关闭的开关 `TACTISCOUT_WYSCOUT_HISTORICAL_REPORT_DISPLAY_ALLOWED` 与 `TACTISCOUT_WYSCOUT_HISTORICAL_LOCAL_RETENTION_ALLOWED`。已导入官方 `20261003T052950Z` release 的 bridges/redirects 文件；校验 checksum 后索引 636,480 条项目支持的 bridges 与 2,007 条 redirects。真实 bridge smoke 命中 Sportmonks `1002` → Reep `rp606b79a0db2365` → Wyscout `9080`，并从本地 Wyscout 2017/18 意甲 Genoa 样本取到 1,617 分钟及 9 项可用指标。候选外壳是合成记录，因此它证明精确映射和 archive 抽取代码路径可工作，不证明真实 Sportmonks API 或候选池的总体 coverage。Reep 和 Wyscout 原始数据都留在 Git 忽略的 `.data/`。

`pnpm build`、`pnpm build:web`、`git diff --check` 通过；按项目指示未运行测试。对应的一手来源记录见 [Reep → Wyscout 历史档案桥接范围](../research/reep-wyscout-bridge-coverage-2026-10.md)。

## Comments
