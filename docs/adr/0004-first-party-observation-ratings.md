# Store human scouting ratings as sample-bound observations

## Status

Accepted

## Context

TactiScout needs a way to accumulate its own current player evidence when structured event or tracking data is unavailable. Free-form notes preserve context but are difficult to compare consistently. A numeric rating can appear more objective than its evidence supports, especially when observations come from one match, different observers, or different competition levels.

## Decision

First-party observation records may include one human-authored 1–5 rating for each TactiScout-defined ability dimension in a match sample. Each rating stores its observer, player, match context, optional minute, and a concrete evidence note. A record may also keep qualitative strengths and risks.

Ratings remain attributed, subjective observations. TactiScout does not average ratings across matches or observers, normalize them into a player score, or include them in the deterministic tactical-fit formula. If the author separately enables AI/RAG processing, the model may use a rating and its evidence as a qualitative scouting viewpoint, with its provenance intact.

## Consequences

- The collection UI provides a small, phase-aware vocabulary rather than an unstructured scorecard.
- Missing observation stays unknown; observers are not required to rate every dimension.
- Comparisons must show sample, author, match context, and supporting scenes. Cross-match consistency requires a later calibration/evaluation task.
- The data can be accumulated now without implying that one observer's 4/5 is comparable to another's 4/5.

## Alternatives considered

- Free-form notes only: easy to collect, but poorly structured for later review and retrieval.
- Automatically average observer ratings into capability scores: concise, but would conceal sample differences and inter-rater disagreement before a calibration set exists.
- Let an LLM assign ratings from notes: rejected because the model has not observed the match and could make subjective interpretations look like collected facts.
