# Verify a free API-Football current-season sample

Type: task
Status: claimed
Labels: needs-info
Blocked by: none

## Goal

Determine whether a user-owned API-Football free account can serve one current-season league as a local, transient schema smoke before considering any adapter work.

## Scope

- Use a single API key supplied locally by the user; never put it in chat, logs, repository files, or the smoke record.
- Check account status, current-season league coverage, and player-statistics coverage before requesting player data.
- If coverage is available, request only the first `/players` page for one selected league and season; report counts, pagination, metric field presence, and missing-value coverage without printing player names or raw records.
- Keep the response in memory only. Do not write it to the TactiScout database, browser storage, repository, or Ollama prompt.
- Stop if the account lacks current-season or player-statistics coverage. Do not crawl pages or use another account to extend the quota.
- Do not enable a public UI integration until data display/republication, local retention, and model-processing permissions have been confirmed.

## Acceptance criteria

- [ ] The user's free account confirms an eligible current-season league and `players` / `statistics_players` coverage.
- [ ] One first-page response is parsed in memory and summarized without raw player data or key exposure.
- [ ] The report records league ID, season, time, account plan, quota remaining, pagination totals, available metric fields, and coverage outcome only.
- [ ] No current player data is persisted, sent to an LLM, or displayed in the public portfolio.
- [ ] If the smoke passes, create a separate implementation issue that addresses stable IDs, query budgets, source provenance, and the permission boundary; if it fails, close this route with the provider response reason.

## Research

- [API-Football free current-season smoke review](../research/api-football-free-current-season-smoke-review-2026-10-04.md): conditional go for a one-page local smoke; the specific free-season coverage remains account-dependent, and public data display plus persistence/model-processing permissions are not established.
- [Official pricing](https://www.api-football.com/pricing/): the current free plan lists 100 requests/day, all endpoints, and a season-availability limitation.
- [Official API terms](https://www.api-football.com/terms): the provider states that it does not grant a license to publish the API data in user applications/sites; users must obtain applicable permissions from rights holders.
- [Official players endpoint guide](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide): documents `/players` profiles, season statistics, 20-record pages, and pagination.

## Comments

- 2026-10-04：现有 Reep crosswalk 已包含 API-Football player IDs，但这不证明当前账号覆盖、live 记录命中或 API 数据使用权限。先验证真实 free account 一页，不新增未经 live 验证的 provider adapter。
- 2026-10-04：新增 `pnpm source:smoke:api-football` 本机预检。它最多顺序请求 `/status`、`/leagues` 和 `/players?page=1`，只输出脱敏字段覆盖摘要，不持久化、不交给模型。真实账号/赛季与 schema smoke 仍待用户提供本地 key。

## Answer

脱敏预检命令已实现，等待用户在本机准备单个免费 API key。将 key 放在本地 `.env` 后告知我已准备好即可；无需在聊天中粘贴 key。
