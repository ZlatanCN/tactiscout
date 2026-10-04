# Record structured first-party match observations

Type: task
Status: claimed
Labels: ready-for-agent
Blocked by: none

## Goal

Make TactiScout's own match observations more useful to later scouting work by collecting a small set of repeatable ability dimensions alongside match-specific evidence, while preserving the fact that ratings are subjective human judgments.

## Scope

- Record team, observed position, and role context as explicitly observed facts, separate from verified current affiliation.
- Allow up to one 1–5 human rating per TactiScout-defined ability dimension in a match record; include dimension, phase, optional match minute, and concrete evidence.
- Keep all ratings optional. An unobserved dimension stays unknown and must not be filled by an LLM.
- Preserve observer attribution, match/season context, access and AI/RAG permissions through local persistence and retrieval.
- Do not average ratings across matches or observers, standardize them, create a player-wide capability score, or include them in tactical-fit calculations.
- Keep existing free-form strengths, risks, and evidence notes for backward compatibility.

## Acceptance criteria

- Existing saved observations without structured ratings remain readable and editable.
- The UI can add/remove optional dimension records, choose the ordinal rating, capture a concrete evidence scene, and save/reopen the record.
- Invalid ratings, duplicate dimensions within a single match record, and evidence notes shorter than the minimum are rejected by the shared schema.
- When AI/RAG processing is enabled, retrieval text includes each rating, dimension, sample time, observer, and an explicit subjectivity caveat; without consent, none of the text enters retrieval.
- README, `CONTEXT.md`, MVP spec, and an ADR agree that ratings are human-authored sample evidence, not objective statistics or an automatic score.
- Frontend and backend compile; no claim is made about inter-rater reliability until actual double-coded data is collected and evaluated.

## Research and decision

- [Data source research refresh](../research/football-data-source-research-refresh-2026-10.md): approved evidence types and current-data source limits.
- [ADR-0004](../../../docs/adr/0004-first-party-observation-ratings.md): sample-bound human ratings are kept separate from calculated statistics and deterministic fit scores.
- Dimensions: progression, ball retention, chance creation, off-ball movement, pressing, defensive positioning, duels, transition response. Each has a plain-language definition and possession phase.

## Comments

- 2026-10-04：扩展现有第一方观察功能；不另建平行笔记库。球员、样本、来源与权限继续由 issue 23 的本地观察模块管理。
- 2026-10-04：新增观察时球队/位置/职责与可选的 1–5 能力维度记录。该档位只描述单场主观判断，不聚合、不参与职责适配分；RAG 授权后才随署名上下文进入检索。
- 2026-10-04：服务端 `pnpm build` 与网页 `pnpm build:web` 均通过。工作台已目视核对表单展开、能力条目布局和本机交互；尚未收集真实双人标注样本，不能据此声称评分一致性可靠。
- 2026-10-04：观察库新增覆盖摘要，统计比赛上下文完整记录、结构化维度记录和检索状态，不按球员姓名合并。首批采集方法见 [issue 40 规程](../../../docs/scouting/first-party-observation-protocol.md)。

## Answer

进行中：结构化录入与权限感知检索已实现。下一阶段需要实际记录若干场比赛，再选一部分做双人独立标注，用真实分歧改进量表并验证同维度观察是否可复核。
