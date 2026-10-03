# Live investigation progress and grounded clarifications

Type: task
Status: resolved
Labels: ready-for-human

## Goal

Give users clear feedback during long-running local-model turns, and prevent the Agent from turning an unverified reference-player fact or an unrequested league/season preference into a blocking clarification.

## Acceptance criteria

- [x] The conversation shows the real LangGraph stage and elapsed wait time while a turn is running.
- [x] The progress message distinguishes planning, methodology lookup, team sample inspection, candidate search, performance evaluation, report lookup, recommendation review, and completion.
- [x] Progress is scoped to the case and contains no model reasoning, player names, prompts, or credentials.
- [x] A missing reference-player record does not cause the Agent to ask the user to verify the reference player's identity or whether cross-league/season search is allowed when the user supplied a role.
- [x] The Agent does not claim a player's current club or league from model memory in clarification questions or final report text; any current-season information shown must come from an explicitly current provider record and retain its provenance.
- [x] The user interface remains understandable when progress polling is unavailable and makes elapsed wait time visible.

## Answer

Added a case-scoped progress endpoint. LangGraph reports status at decision, tool, and review nodes; the browser polls the endpoint and shows the current stage, completed Agent decision steps, elapsed time, and a longer-wait note. The progress record expires after 30 minutes and the in-memory registry is bounded.

Added prompt and deterministic policy feedback for unrequested league/season questions, reference-player identity confirmation, and current club/league claims from model memory in both clarification and final report text. An ungrounded affiliation claim is withheld and the graph replans; repeated policy-blocked actions stop safely. The rule recognizes unqualified “效力于某队” statements without mistaking tactical descriptions such as “适合在右路踢球” for affiliation claims. Bayern Munich is identified as a Bundesliga club, not a Premier League club.

Validation: 102/102 deterministic tests passed with `node --import tsx --test tests/*.test.ts`; server TypeScript compilation, web TypeScript compilation, Vite production build, and `git diff --check` passed.
