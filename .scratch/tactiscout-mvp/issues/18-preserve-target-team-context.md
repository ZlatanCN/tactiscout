# Preserve the target club throughout a recruitment case

Type: task
Status: resolved
Labels: ready-for-human

## Goal

Keep the club the user is recruiting for available as explicit case context through tool decisions, clarification turns, and the final report, even when the model omits it from an action.

## Evidence

The latest repeated local-model evaluation fixed the confirmed striker constraint but still failed `targetTeamContextPreserved` for the Bayern/Kane case. The planner receives the conversation history but has no separate `targetTeam` context field, and optional action fields let the model drop the club name.

## Acceptance criteria

- [x] High-confidence target-club phrasing such as “为拜仁寻找凯恩的替代者” seeds the target club without mistaking the reference player for the club.
- [x] The LangGraph case stores the extracted target club and passes it as explicit planner context.
- [x] Actions and final reports inherit the stored target club when the model omits it or returns null.
- [x] A later user turn can change the target club only by explicitly naming a new recruitment target; absent target-club wording does not erase the saved club.
- [x] Target-club context is never used as a candidate current-club or competition filter.
- [x] Deterministic tests cover extraction, persistence across turns, omitted/null planner fields, and explicit target changes.
- [x] The local Bayern/Kane evaluation passes target-club preservation on a fresh case; remaining failures stay visible.

## Comments

- 2026-10-04：Issue 15 的位置约束已通过两次本地模型复验，但同两次运行仍丢失目标球队语境。本轮修复模型动作字段可选导致的上下文丢失。

## Answer

新增高置信度目标球队短语提取：从“为拜仁找……”中读取引援方，而不把“凯恩”当成目标球队。LangGraph 案件状态保存该名称，并在每次 planner 决策时单独传入；即使模型在后续 action 或 finish 中遗漏/返回 null，也会由服务端继承。用户后续以明确引援短语指定新球队时才更新语境；未说明联赛或对手球队仍不会变成候选筛选条件。

确定性验证：目标球队提取、无歧义/多目标输入、同案追问继承、模型 null 字段继承及用户显式更改测试通过；`pnpm build` 和定向 38 项测试通过。2026-10-04 本机 Qwen 3.5 9B 新案件复验 `targetTeamContextPreserved=true`，报告保留“拜仁”。同次全场景运行仍因未请求的凯恩姓名过滤、年龄过滤、被策略拒绝的问题重复及未进入追问而失败；这些行为登记为后续 issue，不能把这次结果记为整场通过。
