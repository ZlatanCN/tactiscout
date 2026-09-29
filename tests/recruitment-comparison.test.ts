import assert from "node:assert/strict";
import test from "node:test";
import { buildEvidenceComparison, toggleComparedPlayer } from "../web/src/comparison.js";
import type { CapabilityEvidence, PlayerRecommendation } from "../src/domain/schemas.js";

function evidence(key: CapabilityEvidence["key"], value: number): CapabilityEvidence {
  return {
    key,
    label: key === "goals" ? "进球" : "带球",
    value,
    unit: "次/90",
    peerPercentile: null,
    peerGroupSize: 0,
    minutes: 1800,
    competition: "Open League",
    season: "2024/25",
    source: "StatsBomb Open Data",
  };
}

function recommendation(playerId: string, metrics: CapabilityEvidence[]): PlayerRecommendation {
  return {
    player: {
      playerId,
      name: playerId,
      team: "Harbor City",
      age: 23,
      position: "ST",
      competition: "Open League",
      season: "2024/25",
      minutes: 1800,
      stats: { goals: 0, assists: 0, passesAttempted: 0, passesCompleted: 0, longPasses: 0, carries: 0, pressures: 0, tackles: 0, interceptions: 0, shotAssists: 0 },
      source: "StatsBomb Open Data",
    },
    rationale: "可观察比赛产出支持进一步考察。",
    strengths: [],
    tradeoffs: [],
    evidence: metrics,
  };
}

test("comparison selection toggles candidates and caps the selection at three", () => {
  const selected = ["a", "b", "c"];
  assert.deepEqual(toggleComparedPlayer(selected, "d"), selected);
  assert.deepEqual(toggleComparedPlayer(selected, "b"), ["a", "c"]);
  assert.deepEqual(toggleComparedPlayer(["a", "c"], "b"), ["a", "c", "b"]);
});

test("comparison rows preserve each selected player's evidence and mark missing data", () => {
  const candidates = [
    recommendation("a", [evidence("goals", 0.5), evidence("carries", 1.2)]),
    recommendation("b", [evidence("goals", 0.8)]),
  ];

  const rows = buildEvidenceComparison(candidates);

  assert.deepEqual(rows.map((row) => row.key), ["goals", "carries"]);
  assert.deepEqual(rows[0].values.map((item) => item?.value), [0.5, 0.8]);
  assert.deepEqual(rows[1].values.map((item) => item?.value ?? null), [1.2, null]);
});
