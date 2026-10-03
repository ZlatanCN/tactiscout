# Add a licensed player-data provider with field-level provenance

Type: task
Status: claimed
Labels: ready-for-agent

## Goal

Make TactiScout capable of exploring a real, provider-backed current-player pool while preserving the identity, freshness, competition/season and supported-stat coverage of every player record. The first optional provider is Sportmonks Football API; existing demo and StatsBomb modes remain available.

## Research basis

See [provider landscape research](../research/football-data-provider-landscape-2026-10.md). Sportmonks documents season team lists, season squad/player statistics, provider IDs, pagination and server-side token handling. Its free coverage is restricted to the Danish Superliga and Scottish Premiership. Its public terms permit use in a product, but the reviewed material does not specifically resolve external LLM processing, so model use must be disabled unless the operator has confirmed that permission.

## Acceptance criteria

- [x] Player records can retain provider identity, provider player/team/competition/season IDs and retrieval time without merging IDs across sources.
- [x] Player records declare which raw statistics are actually supported; unsupported fields do not become measured zeros or influence tactical assessments.
- [x] Sportmonks is a server-side optional provider configured through environment variables, with selected season IDs and a server-only API token.
- [x] The adapter follows pagination for season team lists and retrieves season squads with player statistics using documented endpoint shapes.
- [x] Provider authentication, unavailable league entitlement, rate limiting, malformed payloads and empty valid results are distinct outcomes; a failed fetch cannot appear as an empty shortlist.
- [x] External model processing of Sportmonks data is disabled unless an explicit operator setting is enabled after permission has been confirmed.
- [x] Mapping, pagination, metric coverage, authentication, error handling and default privacy behavior have deterministic tests using an injected fetch implementation.
- [x] The provider mode and provenance are visible in the application without exposing credentials.
- [x] `.env.example`, README and domain context explain configuration, source limits, unsupported metrics and the distinction between live verification and fixture-based tests.
- [ ] A live account check verifies target-league coverage and real payload compatibility before the provider is described as working against live data.

## Comments

- 2026-10-04：从 issue 09 的来源 provenance 落地顺序开始执行。官方文档表明季赛球队列表需分页；球员赛季 squad/detail 可连同统计取回；API v3 未记录的统计不会返回。此 issue 将先把安全、可验证的 adapter 做完整，真实联赛联调在获得凭据与确认对应模型处理许可后完成。
- 2026-10-04：adapter、fixture 测试和球员卡来源显示已实现；统计覆盖需由部署者按 Sportmonks 账户/联赛显式登记，避免将套餐缺项误当零。官方统计类型以 Sportmonks `player-statistics` 文档为准；真实账户联调仍未完成。

## Answer

核心实现完成；待真实 Sportmonks 账户验证。
