# Preserve clarified role constraints after interruption

Type: task
Status: resolved
Labels: ready-for-human

## Goal

When a user answers a LangGraph `interrupt()` clarification with a specific player role, preserve that answer as a case constraint through the resumed investigation. A later model action must not broaden the search or recommend a player outside the confirmed role.

## Evidence

The 2026-10-03 full local Qwen 3.5 9B evaluation for `bayern-kane-replacement` investigated the request, asked a role-related question, and resumed the same thread after the user answered “按中锋职责，优先未来接班。” The resumed investigation then searched with `position: null`, evaluated six players, and completed without recommendations. The behavior suite correctly failed `searchedExpectedPositionAfterAnswer`.

## Acceptance criteria

- [x] A position the user explicitly confirms during a clarification is represented in persisted case state and remains available after the same thread resumes.
- [x] Every candidate search after confirmation uses the confirmed position unless the user explicitly changes it.
- [x] Evaluation, report construction, and recommendation validation cannot include candidates outside the confirmed position, including candidates found before the clarification.
- [x] If no player matches the confirmed position, the Agent waits for a meaningful user choice or finishes with an explicit position-specific data limitation; it never broadens silently.
- [x] Generic terms such as “前锋” or “中场” remain broad unless the user confirms a specific position.
- [x] Deterministic tests cover checkpoint resume, conflicting model actions, previously discovered out-of-position candidates, explicit constraint changes, and empty results.
- [x] The local model scenario passes the role constraint checks on repeated fresh cases; latency and pass rate are recorded separately from scouting quality.

## Answer

用户确认的细分位置现保存在 LangGraph 案件状态。追问恢复后，服务端先完成该位置的候选检索，再允许后续调查；搜索动作、候选评估、报告检索、结论约束和最终交付都会过滤或覆盖不匹配的位置。用户在之后轮次明确更改位置时，新条件生效；“前锋/中场”等泛称不会自动收窄。空结果会保留明确的位置限制，不会用旧的其他位置候选补名单。

确定性对话测试覆盖中断恢复、冲突工具动作、此前发现的异位置候选、显式改换位置、泛称保持宽泛和空结果限制。

2026-10-04，本机 `qwen3.5:9b`、虚构演示数据、两个独立新案件复验：位置行为检查 `searchedExpectedPositionAfterAnswer`、`recommendationsMatchExpectedPosition`、`emptyExpectedPositionHandledHonestly` 均为 2/2 通过；补答后均实际按 `ST` 检索，无候选时均输出中锋位置的数据限制，没有跨位置推荐。端到端耗时分别为 93.963 秒和 92.572 秒，p50 92.572 秒、p95 93.963 秒。完整凯恩场景套件仍为 0/2 全项通过：两次都丢失目标球队语境，首次追问未通过角色歧义检查，空结果后的重复追问触发策略循环保护；这些非位置约束失败保留为后续工作，不能算作球员排名或球探质量评估。
