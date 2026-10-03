# Wyscout Open Data: local real-file smoke test (2026-10-04)

## Source and local handling

The validation used the publisher's [Soccer match event dataset](https://figshare.com/collections/Soccer_match_event_dataset/4415000/5), described in [Pappalardo et al. (2019)](https://doi.org/10.1038/s41597-019-0247-7). The five Figshare items used by the adapter identify [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) as their license. Item DOIs, retrieval date, local filenames, and SHA-256 hashes are recorded in the ignored `.data/wyscout-open-data/provenance.json`; raw files stay under ignored `.data/` and are not included in the repository.

The local smoke test enabled the provider's required model-processing opt-in and read the 2017/18 club competitions; the adapter smoke test itself did not invoke a model. It made no network requests during analysis and did not send source files or player-level records to a hosted model.

## Results

The adapter loaded 2,682 player-team-competition-season records across the five sampled club leagues, representing 2,561 distinct source player IDs. Every resulting record was linked to an event file for each match in its lineup-derived appearance sample.

| Competition | Player-season records |
| --- | ---: |
| English first division | 525 |
| French first division | 550 |
| German first division | 484 |
| Italian first division | 551 |
| Spanish first division | 572 |
| **Total** | **2,682** |

Broad-position totals were 601 forwards, 906 defenders, 202 goalkeepers, and 973 midfielders. The adapter exposed goals, assists, pass attempts, pass completions, and key passes for all 2,682 records. It exposed no shot-assist metric: Wyscout key-pass evidence is kept distinct from shot assists. This validates parsing and evidence availability, not the correctness of player ranking or the data as a current transfer-market pool.

## Format findings incorporated into the adapter

- Figshare match rows put lineups, benches, and substitutions under `teamsData[*].formation`, rather than directly under the team row.
- Some empty substitution arrays are encoded as the string `"null"`; the adapter treats only that exact representation as empty.
- Some substitution rows carry incoming player ID `0`. The outgoing player's known minutes are still capped at the recorded substitution minute, but no incoming player profile is invented from the sentinel ID. Other unknown player IDs continue to fail validation.
- Sample minutes remain an estimate from starting lineup and substitutions: a starter is assigned 90 minutes, replaced players stop at the recorded minute, and substitutes receive the remainder up to 90. Stoppage time, extra time, and red-card effects are not modelled.

These cases are covered by deterministic synthetic regression fixtures. Re-running against locally supplied files requires the `wyscout` repository mode, the data directory, and explicit local model-processing opt-in.
