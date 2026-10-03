# Prevent false passes in candidate discovery evaluation

Type: task
Status: resolved
Labels: ready-for-human

## Goal

Make the local-agent harness distinguish a genuinely empty candidate result from a non-empty match set hidden by an incorrect page offset or an unrequested player-name filter.

## Evidence

The Barcelona shortlist evaluator currently infers that candidates exist only when the current returned page has `resultCount > 0`. A search with `offset: 999` can therefore return an empty page despite matching players and allow an empty report to pass. The same scenario can be narrowed by `playerName` even though the user did not name a reference player.

## Acceptance criteria

- [x] Candidate search traces record the requested offset, returned-page count, total matching count, and next valid offset.
- [x] The shortlist evaluator requires a search from offset zero and rejects unrequested player-name filters.
- [x] A candidate search with matches but an empty page cannot satisfy candidate discovery or empty-result checks.
- [x] Pagination after the first page follows the preceding result's `nextOffset`.
- [x] Clarification scenarios treat a role as empty only when the total matching count is zero, not when a requested page is empty.
- [x] Deterministic evaluator tests reproduce high-offset, stale-offset, and unrequested-name-filter false passes.

## Comments

- 2026-10-04：审计候选评测器时发现：空页会被误判为无候选，姓名过滤也可能使巴萨标准场景空跑。现根据该反例认领修复。

## Answer

工具轨迹现在记录 offset、页大小、匹配总数、当前页结果数和下一页 offset。Harness 按完整检索范围分组校验每组从 offset 0 开始、后续页使用前页返回的游标；空页但总匹配数大于零会判失败。标准 shortlist 场景禁止未请求的球员姓名过滤，追问续跑只在目标位置的匹配总数确实为零时才允许报告空结果。

补充了高 offset 隐藏候选、未请求姓名过滤和陈旧分页 offset 三种反例。验证：`pnpm build` 通过；定向 evaluator 测试 21/21 通过；`git diff --check` 通过。
