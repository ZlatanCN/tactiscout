Type: task
Status: resolved
Labels: ready-for-human

## Goal

Improve architecture at the current LangGraph, knowledge-permission, and Fastify composition seams without replacing LangGraph or adding speculative abstractions.

## Acceptance criteria

- Conclusion action constraints and deterministic evidence review are testable through a focused module interface; recommendations remain limited to evaluated players and observed metrics/reports.
- PLOS discovery and knowledge ingestion share the same HTTPS, URL-scope, and automated-ingestion permission policy.
- `createApp` can use one injected player repository and knowledge base consistently across the dataset, scout, conversation, and knowledge-status routes.
- Tool trace filters are recorded where the underlying tool executes, so trace values reflect the actual action arguments without a duplicate action switch.
- Architecture and existing conversation behaviour remain covered by deterministic tests; backend and web builds pass.

## Implementation notes

- Preserve LangGraph as the owner of investigation state, conditional routing, interrupt/resume, and tool budget progression.
- Preserve ADR-0001 qualitative-report constraints and ADR-0002 permission-gated corpora.
- Keep the architecture report in the OS temp directory, outside the repository.

## Answer

Added `recruitment-actions.ts`, `conclusion-policy.ts`, and shared recruitment text matching. The conclusion schema and deterministic evidence reviewer now share a focused policy module. Added `knowledge/permissions.ts` and routed both LanceDB ingestion and PLOS eligibility checks through it. Added a per-app scout runner and injected repository composition; all routes now use the same player repository and knowledge-base instance. Tool trace filters are created in the execution branch that uses them.

Verification: focused policy/conversation/composition tests pass; backend TypeScript build and web production build pass; full test suite and two-axis review run before commit.
