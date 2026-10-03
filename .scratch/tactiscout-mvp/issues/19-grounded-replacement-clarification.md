# Ground replacement searches and clarification in user intent

Type: task
Status: resolved
Labels: ready-for-human

## Goal

For a natural-language “find a replacement/successor” brief, keep the reference player out of candidate filters, preserve only user-stated age limits, and ask a focused role question after useful initial investigation when the role remains unresolved.

## Evidence

The fresh Qwen run for `bayern-kane-replacement` now preserved `targetTeamContextPreserved`, but still failed the full scenario. The trace showed `playerNameFilterUsed: true`, `maxAge: 35` despite no stated age limit, and two policy-blocked `ask_user` decisions followed by an empty report; the user never got a question or a chance to resume the case.

## Acceptance criteria

- [x] A reference player mentioned in a replacement/successor request is never used as `search_candidates.playerName`.
- [x] An inferred numeric `maxAge` is removed unless a user turn explicitly supplies an age limit; explicit age limits survive clarification resumes and constrain candidate evaluation and recommendations as well as search.
- [x] After at least one candidate search, an unresolved replacement role produces one focused user question about the role, without asserting current club or league facts.
- [x] The question is asked in the same case and is not repeated after the user answers; a specific role answer remains enforced by issue 15.
- [x] Candidate discovery remains broad when no position or age limit was supplied; target club is not treated as a candidate-team or competition filter.
- [x] Deterministic tests cover name-filter removal, age-filter removal/preservation, fallback question timing, and checkpoint resume.
- [x] A fresh local Qwen scenario passes investigation-before-question, role question, same-case resume, expected-position search and honest empty-position handling; other failures remain separately visible.

## Comments

- 2026-10-04：修复目标球队语境后，Qwen 新跑显示模型将 Kane 姓名与 35 岁上限误作候选过滤，并在策略拒绝后循环。本 issue 只处理过滤范围和追问恢复。

## Answer

替代者调查现在把参考球员当作需求背景，不会传入候选姓名过滤；年龄上限只从用户明确说出的内容提取。首次宽泛检索后若角色仍不清楚，LangGraph 会暂停同一案件并提出一次聚焦位置/职责的问题；恢复后沿用已确认的位置与明确年龄限制。目标球队继续作为案件语境保留，不会变成候选俱乐部或联赛过滤条件。

后续边界回归还覆盖了先宽泛发现、再补充 23 岁上限的情况：已发现的 29 岁中锋不会进入恢复后的评估、球员报告检索或最终推荐。

确定性验证：`pnpm build` 通过；对话、目标球队和本地 Agent 评测定向测试 39/39 通过；`pnpm test` 全套 79/79 通过，包含跨 API 进程重启的暂停案件恢复；`pnpm build:web` 和 `git diff --check` 通过。恢复测试 fixture 同步了新的追问时机和强制的确认位置重查流程。

2026-10-04 本机 Qwen 3.5 9B 的 `bayern-kane-replacement` 新案件评测 1/1 通过所有场景检查：先调查、再问角色、同案恢复、按用户确认的中锋位置检索，并如实处理演示数据中没有匹配中锋的空结果。该次检索先发现 6 名宽泛候选人，再按中锋职责查询得到 0 人；这验证的是 harness 行为与诚实空结果，不代表候选推荐质量或真实联赛覆盖。该次运行约 56 秒。
