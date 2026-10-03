# Add Wyscout historical event-data adapter

Type: task
Status: resolved
Labels: ready-for-agent

## Goal

Add a local Wyscout Open Data provider that turns the named 2017/18 league event sample into traceable player-season performance evidence for a portfolio-ready LangGraph investigation. Keep it separate from current-player sources and from the SkillCorner tracking aggregates.

## Research basis

See [player performance data licensing and validation path](../research/player-performance-data-licensing-2026-10.md). The Pappalardo et al. Wyscout dataset provides player IDs, teams, competitions, matches, lineups/substitutions, and match events, and is described as CC BY 4.0. It covers historic 2017/18 top-five European leagues plus two international tournaments. The first implementation uses club league matches only, retains source attribution, does not fetch files, and does not expose raw birth dates or tracking. CC BY does not grant privacy/publicity rights; the application must keep its historical scope visible and default model processing off.

## Acceptance criteria

- [x] `WyscoutPlayerRepository` implements the existing `PlayerRepository` seam and reads only manually supplied local JSON from `.data/wyscout-open-data/` or an explicit directory.
- [x] It streams competition event arrays one file at a time, validates match/player/team references, and distinguishes missing or malformed source files from a valid empty candidate pool.
- [x] It uses stable Wyscout IDs to join players, teams, competitions, matches, lineups, substitutions, and events; same names with different provider IDs remain separate records.
- [x] Initial scope defaults to the dataset's 2017/18 club leagues and excludes international tournaments; source team and age values are tied to the historical season, never described as current.
- [x] Supported statistics have explicit Wyscout event/tag mappings: goals (Shot + 101), assists (301), key passes (302), and pass attempts/completions (Pass + 1801). Key passes remain distinct from shot assists; unsupported shot assists, pressures, carries, and other unmapped fields remain unavailable instead of zero-valued evidence.
- [x] Sample minutes use an explicit, tested estimation method and the report states its limits, including excluded stoppage time and unhandled red-card cases.
- [x] Player source identity, source attribution, historical-season caveat, sample size, and limitations are present in the report; Wyscout evidence does not silently merge with another provider or SkillCorner metrics.
- [x] `TACTISCOUT_DATA_MODE=wyscout` and `TACTISCOUT_WYSCOUT_DIR` configure the provider; local model processing is opt-in and disabled by default; `.data/` remains ignored.
- [x] Synthetic fixtures cover streaming JSON, substitutions/minutes, metric mapping, missing data, ID joins, broad positions, historical age, source-mode wiring, and end-to-end Agent evidence.
- [x] `.env.example`, README, `CONTEXT.md`, and this map describe Wyscout as historical 2017/18 evidence and cite the data publication/license.
- [x] A local smoke test with official Figshare source files confirms the actual file layout and adapter output without adding raw data to the repository.

## Answer

Implemented and exercised the provider against the official Figshare files in ignored `.data/wyscout-open-data/`. The default 2017/18 club-league load returned 2,682 player-team-competition-season records across five leagues, with 2,561 distinct source player IDs and event coverage for every appearance sample. All records exposed goals, assists, pass attempts/completions, and key passes; shot assists remained unavailable. The real files revealed nested `formation`, string-encoded `"null"` substitution lists, and zero-valued incoming-player sentinels; the adapter now handles these without inventing a player record. Aggregate results, scope, and limitations are recorded in [the real-data smoke-test note](../research/wyscout-real-data-smoke-2026-10.md); local source attribution and file digests are in the ignored `.data/wyscout-open-data/provenance.json`.

## Comments

- 2026-10-04: Wyscout was selected as the local historical event-analysis source because the publisher's data items identify a clear CC BY 4.0 reuse license and have player-linked events. It does not replace an authorized current-season provider.
- 2026-10-04: The official v2 endpoint documentation confirms tag 301 = assist and 302 = key pass. The provider glossary says legacy key pass is not synonymous with shot assist, so TactiScout must not map 302 into `shotAssists`.
- 2026-10-04: Official Figshare files were downloaded only into ignored `.data/`, verified by local SHA-256 digests, and parsed successfully across the default five club leagues. Actual nested formation, `"null"` substitutions, zero incoming IDs, and the resulting historical aggregate counts are documented in the linked smoke-test note. No player-level source data was committed.
- 2026-10-04: Spec review caught a valid-but-unrelated event team ID being accepted for a match. The adapter now verifies the event team against that match's `teamsData`; a synthetic regression case confirms mismatched teams fail as invalid source data.
