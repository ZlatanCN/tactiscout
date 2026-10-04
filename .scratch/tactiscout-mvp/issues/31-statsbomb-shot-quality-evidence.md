# StatsBomb 非点球 xG 历史表现证据

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

将 StatsBomb 每次射门的 xG 汇总为可追溯的球员历史表现证据，并让 Agent 与报告如实说明非点球范围、分母和数据缺口。

## Research basis

参见 [StatsBomb 射门质量证据调查](../research/statsbomb-shot-quality-evidence-2026-10.md)。官方事件 schema 提供逐射门 `shot.statsbomb_xg` 和 `shot.type`，但适配器仍需逐场验证字段覆盖。协议要求发布分析时注明 StatsBomb 来源和使用 logo，不得向第三方提供原始数据，也限制商业用途；云端模型处理并未得到明确授权。

## Acceptance criteria

- [x] 从完整 StatsBomb 出场样本派生非点球 xG/90 与平均非点球 xG/射门。
- [x] 排除 `period=5` 点球大战及 `shot.type.name=Penalty`；缺失期次/射门类型/非点球 xG 时不将不完整聚合展示为零。
- [x] 样本证据保留赛事、赛季、来源字段、场次、分钟和非点球射门数。
- [x] 指标进入 Agent 证据与报告，但不自动进入现有职责评分；文案不把机会质量说成终结能力或未来表现。
- [x] 通过 `TACTISCOUT_STATSBOMB_AI_PROCESSING_ALLOWED` 默认关闭 Agent 模型处理，并要求 OpenAI 兼容模型地址使用回环主机；在文档说明协议审查、署名/logo、非商业与禁止分发原始数据边界。
- [x] 只聚合能对应到该场非空阵容且分钟区间有效的射门；阵容覆盖缺失或不完整、分钟缺字段/逆序/重叠/不连续时抑制受影响范围的 xG 证据。
- [x] 更新领域词汇、数据接入说明和 Wayfinder 决策记录；不下载或提交 StatsBomb 原始球员/比赛数据。
- [x] API 与 Web TypeScript build、diff 检查通过；当前 `.env` 为 demo 模式且无本地 StatsBomb 文件，未声称真实文件联调完成。

## Answer

新增 StatsBomb 非点球 xG/90 与平均非点球 xG/射门；只有该球员所有记录出场比赛的射门类型、非点球 xG、对应阵容和连续分钟区间完整时才公开指标。排除点球与点球大战，报告样本场次、分钟、非点球射门数与 `shot.statsbomb_xg` 来源；Agent 可以解释证据，但它不进入职责评分。StatsBomb 模式默认阻止 Agent 使用数据；要显式开启，还需将模型地址配置为本机回环地址。

`pnpm build`、`pnpm build:web` 和 `git diff --check` 通过；没有运行自动化测试。当前 `.env` 仍是 demo 模式，本机没有 StatsBomb 文件，所以真实数据 smoke test 尚未验证。
