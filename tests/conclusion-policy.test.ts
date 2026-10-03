import assert from "node:assert/strict";
import test from "node:test";
import { FinishActionSchema, type ParsedRecruitmentAction } from "../src/agent/recruitment-actions.js";
import {
  buildDecisionConstraints,
  createConstrainedConclusionSchema,
  validateConclusion,
  type EvaluatedCandidate,
} from "../src/agent/conclusion-policy.js";
import type { KnowledgeSearchResult } from "../src/knowledge/schemas.js";

const candidate: EvaluatedCandidate = {
  player: {
    playerId: "candidate-1",
    name: "Jonas Vale",
    team: "Harbor City",
    age: 23,
    position: "ST",
    competition: "Open League",
    season: "2025/26",
    minutes: 1200,
    stats: { goals: 10, assists: 3, passesAttempted: 200, passesCompleted: 150, longPasses: 8, carries: 30, pressures: 90, tackles: 3, interceptions: 2, shotAssists: 11 },
    source: "StatsBomb Open Data",
  },
  evidence: [{
    key: "goals",
    label: "进球",
    value: 0.75,
    unit: "每 90 分钟",
    peerPercentile: null,
    peerGroupSize: 2,
    minutes: 1200,
    competition: "Open League",
    season: "2025/26",
    source: "StatsBomb Open Data",
  }],
};

const playerReport: KnowledgeSearchResult = {
  id: "chunk-1",
  documentId: "report-1",
  corpus: "player_report",
  text: "Qualitative scouting observation.",
  title: "A report",
  url: "https://example.test/report-1",
  sourceId: "source-1",
  sourceName: "Example source",
  publisher: "Example publisher",
  author: "A scout",
  publishedAt: null,
  license: "CC BY 4.0",
  attribution: "A scout, report, CC BY 4.0.",
  entityIds: [],
  entityNames: ["Jonas Vale"],
  competition: null,
  season: null,
  displayAllowed: true,
};

const validFinish = () => FinishActionSchema.parse({
  action: "finish",
  targetTeam: "Barcelona",
  needSummary: "寻找具备终结能力的中锋。",
  capabilityProfile: ["终结"],
  recommendations: [{ playerId: candidate.player.playerId, evidenceKeys: ["goals"] }],
  limitationKeys: [],
  reportObservations: [{
    playerId: candidate.player.playerId,
    documentId: playerReport.documentId,
    summary: "报告提到前插时机",
    linkedMetricKeys: ["goals"],
  }],
});

test("conclusion schema permits only evaluated players, measured metrics, and retrieved report observations", () => {
  const schema = createConstrainedConclusionSchema(buildDecisionConstraints({
    targetTeam: "Barcelona",
    evaluatedPlayers: [candidate],
    retrievedKnowledge: [playerReport],
  }));
  assert.doesNotThrow(() => schema.parse(validFinish()));
  assert.throws(() => schema.parse({ ...validFinish(), targetTeam: "Bayern" }));
  assert.throws(() => schema.parse({
    ...validFinish(),
    recommendations: [{ playerId: "unevaluated-player", evidenceKeys: ["goals"] }],
  }));
  assert.throws(() => schema.parse({
    ...validFinish(),
    recommendations: [{ playerId: candidate.player.playerId, evidenceKeys: ["assists"] }],
  }));
  assert.throws(() => schema.parse({
    ...validFinish(),
    reportObservations: [{ playerId: candidate.player.playerId, documentId: "unretrieved-report", summary: "Unsupported", linkedMetricKeys: [] }],
  }));
});

test("conclusion constraints only expose displayable player reports that match the evaluated player", () => {
  const constraints = buildDecisionConstraints({
    targetTeam: null,
    evaluatedPlayers: [candidate],
    retrievedKnowledge: [
      playerReport,
      { ...playerReport, id: "chunk-2", documentId: "hidden-report", displayAllowed: false },
      { ...playerReport, id: "chunk-3", documentId: "other-player-report", entityNames: ["Different Player"] },
    ],
  });

  assert.deepEqual(constraints.reportObservations.map(({ documentId }) => documentId), ["report-1"]);
});

test("deterministic conclusion review rejects duplicate candidates and mismatched report entities", () => {
  const action = validFinish();
  const duplicateRecommendation: ParsedRecruitmentAction = {
    ...action,
    recommendations: [
      ...action.recommendations,
      { playerId: candidate.player.playerId, evidenceKeys: ["goals"] },
    ],
  };
  const problems = validateConclusion({
    action: duplicateRecommendation,
    evaluatedPlayers: { [candidate.player.playerId]: candidate },
    retrievedKnowledge: { [playerReport.id]: { ...playerReport, entityNames: ["Different Player"] } },
  });

  assert.ok(problems.some((problem) => problem.includes("重复推荐")));
  assert.ok(problems.some((problem) => problem.includes("实体元数据不匹配")));
});
