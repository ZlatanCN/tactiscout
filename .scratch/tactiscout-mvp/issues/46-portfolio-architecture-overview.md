# Make the TactiScout architecture legible to portfolio reviewers

Type: task
Status: resolved
Labels: ready-for-agent
Blocked by: none

## Goal

Show the real runtime flow and module responsibilities in one compact README diagram so reviewers can see why LangGraph is used and where evidence, tools, review, and persistence fit.

## Acceptance criteria

- The diagram distinguishes React/Fastify, the LangGraph case loop, the OpenAI-compatible model, query-scoped player data, permission-gated retrieval, evidence review, checkpoints, and browser plan storage.
- It shows interrupt/resume and reviewer retry as graph control flow.
- Optional PlayerElo and historical archive enrichment are labeled as post-review and report-only.
- Diagram labels agree with the code and `CONTEXT.md`; it does not imply every provider is enabled or current.

## Answer

README now includes a Mermaid architecture view of the implemented recruitment StateGraph. It names the input, planner, tool, interrupt, reviewer, delivery and post-review enrichment stages; shows the PlayerElo configuration gate and the sequential Reep/Wyscout report-only path; and separates SQLite checkpoints from browser plan storage.

## Comments

- 2026-10-04：核对 `src/agent/conversation.ts` graph nodes and `src/data/provider.ts` repository interface before adding diagram; it describes actual control flow and does not present optional sources as universally active. The diagram distinguishes the `PlayerElo` setup gate, archive enrichment and final delivery branches.
