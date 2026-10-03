import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateLocalAgentScenario,
  localAgentEvaluationScenarios,
  privacySafeTraceEvent,
  summarizeEvaluationRuns,
} from "../src/evals/harness-evaluation.js";
import type { RecruitmentTraceEvent } from "../src/agent/conversation.js";
import type { ConversationTurnResponse } from "../src/domain/schemas.js";

function decision(action: string, targetTeam?: string): RecruitmentTraceEvent {
  return { phase: "decision", action, elapsedMs: 1, ok: true, ...(targetTeam ? { targetTeam } : {}) };
}

function tool(
  toolName: Extract<RecruitmentTraceEvent, { phase: "tool" }> ["toolName"],
  filters: Record<string, string | number | boolean | null | string[]>,
  options: { ok?: boolean; resultCount?: number; matchingRecordCount?: number } = {},
): RecruitmentTraceEvent {
  const resultCount = options.resultCount ?? 1;
  const isCandidateSearch = toolName === "search_candidates";
  const traceFilters = isCandidateSearch
    ? { offset: 0, limit: 10, nextOffset: null, playerNameFilterUsed: false, candidateIds: [], ...filters }
    : filters;
  return {
    phase: "tool",
    toolName,
    elapsedMs: 1,
    ok: options.ok ?? true,
    filters: traceFilters,
    resultCount,
    ...(isCandidateSearch ? { matchingRecordCount: options.matchingRecordCount ?? resultCount } : {}),
  };
}

function recommendation(position = "CM") {
  return {
    player: {
      playerId: "player-1",
      name: "Demo Player",
      team: "Harbor City",
      age: 22,
      position,
      competition: "Open League",
      season: "2025/26",
      minutes: 1200,
      stats: {
        goals: 2,
        assists: 1,
        passesAttempted: 200,
        passesCompleted: 160,
        longPasses: 12,
        carries: 30,
        pressures: 100,
        tackles: 8,
        interceptions: 4,
        shotAssists: 9,
      },
      source: "Fixture data",
    },
    rationale: "比赛数据支持继续考察。",
    strengths: ["带球"],
    tradeoffs: [],
    focusEvidenceKeys: ["carries"],
    evidence: [{
      key: "carries",
      label: "带球",
      value: 2.2,
      unit: "次/90",
      peerPercentile: null,
      peerGroupSize: 0,
      minutes: 1200,
      competition: "Open League",
      season: "2025/26",
      source: "Fixture data",
    }],
    reportObservations: [],
  };
}

function response(input: {
  threadId: string;
  status?: "needs_input" | "completed";
  targetTeam?: string;
  position?: string;
  recommendations?: ReturnType<typeof recommendation>[];
}): ConversationTurnResponse {
  const status = input.status ?? "completed";
  return {
    threadId: input.threadId,
    status,
    message: status === "needs_input" ? "请明确希望找什么类型的中锋？" : "已完成调查。",
    question: status === "needs_input" ? { reason: "不同职责会改变候选范围。" } : null,
    report: status === "needs_input" ? null : {
      targetTeam: input.targetTeam ?? "Barcelona",
      needSummary: "寻找符合需求的球员。",
      capabilityProfile: ["推进"],
      evidenceCoverage: {
        evaluatedCandidateCount: 1,
        availableMetricValues: 1,
        expectedMetricValues: 1,
        lowSampleCandidates: 0,
        limitedPeerGroupCandidates: 1,
      },
      knowledgeCoverage: {
        methodologyChunksRetrieved: 1,
        methodologySearchFailed: false,
        playerReportSearchPerformed: true,
        playerReportSearchFailed: false,
        playerReportChunksRetrieved: 0,
      },
      searchScopes: [],
      recommendations: (input.recommendations ?? [recommendation(input.position)]),
      limitations: [],
      dataSource: "Fixture data",
      datasetMode: "demo",
    },
  };
}

const shortlistScenario = localAgentEvaluationScenarios.find(({ id }) => id === "barcelona-under-23-midfielder")!;
const clarificationScenario = localAgentEvaluationScenarios.find(({ id }) => id === "bayern-kane-replacement")!;

test("the evaluation dataset fixes known tasks without claiming a correct player ranking", () => {
  assert.deepEqual(localAgentEvaluationScenarios.map(({ id }) => id), [
    "barcelona-under-23-midfielder",
    "bayern-kane-replacement",
  ]);
  assert.equal(shortlistScenario.kind, "shortlist");
  assert.equal(shortlistScenario.expectedMaxAge, 23);
  assert.equal(shortlistScenario.requireBroadPositionSearch, true);
  assert.deepEqual(shortlistScenario.requiredTools, ["search_methodology", "search_candidates"]);
  assert.equal(clarificationScenario.kind, "clarification-resume");
  assert.equal(clarificationScenario.expectedPosition, "ST");
  assert.deepEqual(clarificationScenario.answers, ["按中锋职责，优先未来接班。"]);
});

test("the shortlist scenario passes only with ordered investigation, honest scopes, and evidence-backed recommendations", () => {
  const events: RecruitmentTraceEvent[] = [
    decision("search_methodology"),
    tool("search_methodology", { corpus: "methodology" }),
    decision("search_candidates"),
    tool("search_candidates", { position: null, maxAge: 23, minimumMinutes: 0, competition: null, season: null, candidateIds: ["player-1"] }),
    decision("evaluate_candidates"),
    tool("evaluate_candidates", { evaluatedPlayerIds: ["player-1"] }),
    decision("search_player_reports"),
    tool("search_player_reports", { corpus: "player_report" }),
    decision("finish"),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-1" }),
    response: response({ threadId: "case-1" }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-1",
  });

  assert.equal(result.allPassed, true);
  assert.ok(Object.values(result.checks).every(Boolean));
});

test("the shortlist scenario fails when a club name becomes a league filter or evidence is missing", () => {
  const events: RecruitmentTraceEvent[] = [
    decision("search_methodology"),
    tool("search_methodology", { corpus: "methodology" }),
    decision("search_candidates"),
    tool("search_candidates", { position: null, maxAge: null, minimumMinutes: 0, competition: "La Liga", season: null }),
    decision("evaluate_candidates"),
    tool("evaluate_candidates", { evaluatedPlayerIds: ["player-1"] }),
    decision("search_player_reports"),
    tool("search_player_reports", { corpus: "player_report" }),
    decision("finish"),
  ];
  const unsupported = recommendation();
  unsupported.player.playerId = "unseen-player";
  unsupported.focusEvidenceKeys = ["goals"];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-2", recommendations: [unsupported] }),
    response: response({ threadId: "case-2", recommendations: [unsupported] }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-2",
  });

  assert.equal(result.allPassed, false);
  assert.equal(result.checks.noInferredCompetitionSeasonOrMinutesFilters, false);
  assert.equal(result.checks.appliedUserAgeLimit, false);
  assert.equal(result.checks.recommendationsAreEvidenceBacked, false);
  assert.equal(result.checks.recommendationsWereEvaluated, false);
});

test("the shortlist evaluator rejects an empty page when the requested offset hides matching candidates", () => {
  const events: RecruitmentTraceEvent[] = [
    decision("search_methodology"),
    tool("search_methodology", { corpus: "methodology" }),
    decision("search_candidates"),
    tool("search_candidates", {
      position: null,
      maxAge: 23,
      minimumMinutes: 0,
      competition: null,
      season: null,
      offset: 999,
      limit: 10,
      nextOffset: null,
    }, { resultCount: 0, matchingRecordCount: 5 }),
    decision("finish"),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-hidden-matches", recommendations: [] }),
    response: response({ threadId: "case-hidden-matches", recommendations: [] }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-hidden-matches",
  });

  assert.equal(result.checks.candidatePagesFollowCursors, false);
  assert.equal(result.checks.evaluatedDiscoveredCandidates, false);
  assert.equal(result.allPassed, false);
});

test("the shortlist evaluator rejects an unrequested player-name filter that hides the pool", () => {
  const events: RecruitmentTraceEvent[] = [
    decision("search_methodology"),
    tool("search_methodology", { corpus: "methodology" }),
    decision("search_candidates"),
    tool("search_candidates", {
      position: null,
      maxAge: 23,
      minimumMinutes: 0,
      competition: null,
      season: null,
      playerNameFilterUsed: true,
      offset: 0,
      limit: 10,
      nextOffset: null,
    }, { resultCount: 0, matchingRecordCount: 0 }),
    decision("finish"),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-filtered-pool", recommendations: [] }),
    response: response({ threadId: "case-filtered-pool", recommendations: [] }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-filtered-pool",
  });

  assert.equal(result.checks.candidateSearchDoesNotUseAnUnrequestedName, false);
  assert.equal(result.allPassed, false);
});

test("candidate pagination must use each page's returned next offset", () => {
  const events: RecruitmentTraceEvent[] = [
    decision("search_methodology"),
    tool("search_methodology", { corpus: "methodology" }),
    tool("search_candidates", {
      position: null,
      maxAge: 23,
      minimumMinutes: 0,
      competition: null,
      season: null,
      nextOffset: 10,
      candidateIds: Array.from({ length: 10 }, (_, index) => `player-${index}`),
    }, { resultCount: 10, matchingRecordCount: 25 }),
    tool("search_candidates", {
      position: null,
      maxAge: 23,
      minimumMinutes: 0,
      competition: null,
      season: null,
      offset: 20,
      candidateIds: ["player-20", "player-21", "player-22", "player-23", "player-24"],
    }, { resultCount: 5, matchingRecordCount: 25 }),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-stale-page", recommendations: [] }),
    response: response({ threadId: "case-stale-page", recommendations: [] }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-stale-page",
  });

  assert.equal(result.checks.candidatePagesFollowCursors, false);
  assert.equal(result.allPassed, false);
});

test("an empty-data clarification run passes when it investigates, resumes in the same case, and stays on role", () => {
  const caseId = "case-bayern";
  const events: RecruitmentTraceEvent[] = [
    decision("search_candidates", "Bayern Munich"),
    tool("search_candidates", { position: "ST", playerNameFilterUsed: true }, { resultCount: 0, matchingRecordCount: 0 }),
    decision("ask_user", "Bayern Munich"),
    decision("search_candidates", "Bayern Munich"),
    tool("search_candidates", { position: "ST", playerNameFilterUsed: false }, { resultCount: 0, matchingRecordCount: 0 }),
    decision("ask_user", "Bayern Munich"),
  ];
  const initial = response({ threadId: caseId, status: "needs_input" });
  const resumed = response({ threadId: caseId, status: "needs_input", targetTeam: "Bayern Munich" });
  const result = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events,
    firstTurnResponse: initial,
    response: resumed,
    firstTurnEvents: events.slice(0, 3),
    continuedEvents: events.slice(3),
    answersUsed: 1,
    threadId: caseId,
  });

  assert.equal(result.allPassed, true);
  assert.ok(Object.values(result.checks).every(Boolean));
});

test("a failed tool attempt does not count as investigation before a clarification", () => {
  const failedSearch: RecruitmentTraceEvent = {
    phase: "tool",
    toolName: "search_candidates",
    elapsedMs: 1,
    ok: false,
    filters: { position: "ST" },
    resultCount: 0,
  };
  const result = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events: [failedSearch, decision("ask_user")],
    firstTurnResponse: response({ threadId: "case-bayern", status: "needs_input" }),
    response: response({ threadId: "case-bayern", status: "needs_input" }),
    firstTurnEvents: [failedSearch, decision("ask_user")],
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-bayern",
  });

  assert.equal(result.checks.questionFollowedInvestigation, false);
  assert.equal(result.allPassed, false);
});

test("a failed candidate search still fails if it attempted an inferred filter", () => {
  const events: RecruitmentTraceEvent[] = [
    tool("search_methodology", { corpus: "methodology" }),
    tool("search_candidates", { position: null, maxAge: 23, minimumMinutes: 0, competition: "La Liga", season: null }, { ok: false, resultCount: 0 }),
    tool("search_candidates", { position: null, maxAge: 23, minimumMinutes: 0, competition: null, season: null }),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-bad-failed-filter" }),
    response: response({ threadId: "case-bad-failed-filter" }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-bad-failed-filter",
  });

  assert.equal(result.checks.noInferredCompetitionSeasonOrMinutesFilters, false);
});

test("a clarification run fails if it resumes another case or recommends across positions", () => {
  const caseId = "case-bayern";
  const events: RecruitmentTraceEvent[] = [
    tool("search_candidates", { position: "ST" }),
    decision("ask_user"),
    tool("search_candidates", { position: "ST" }),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events,
    firstTurnResponse: response({ threadId: caseId, status: "needs_input" }),
    response: response({ threadId: "different-case", targetTeam: "Bayern Munich", position: "CM" }),
    firstTurnEvents: events.slice(0, 2),
    continuedEvents: events.slice(2),
    answersUsed: 1,
    threadId: caseId,
  });

  assert.equal(result.allPassed, false);
  assert.equal(result.checks.resumedSameCase, false);
  assert.equal(result.checks.recommendationsMatchExpectedPosition, false);
});

test("a clarification must investigate before asking, not merely have both events", () => {
  const events: RecruitmentTraceEvent[] = [
    decision("ask_user", "Bayern Munich"),
    tool("search_candidates", { position: "ST" }),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events,
    firstTurnResponse: response({ threadId: "case-bayern", status: "needs_input" }),
    response: response({ threadId: "case-bayern", status: "needs_input" }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-bayern",
  });

  assert.equal(result.checks.questionFollowedInvestigation, false);
});

test("a clarification question must address the Kane role ambiguity", () => {
  const unrelated = response({ threadId: "case-unrelated", status: "needs_input", targetTeam: "Bayern Munich" });
  unrelated.message = "你希望候选球员来自哪个联赛？";
  unrelated.question = { reason: "这会影响比赛样本。" };
  const events: RecruitmentTraceEvent[] = [
    tool("search_candidates", { position: null }),
    decision("ask_user", "Bayern Munich"),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events,
    firstTurnResponse: unrelated,
    response: unrelated,
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-unrelated",
  });

  assert.equal(result.checks.questionAddressesRoleAmbiguity, false);
});

test("a role keyword in the rationale cannot make an unrelated clarification pass", () => {
  const unrelated = response({ threadId: "case-unrelated-reason", status: "needs_input", targetTeam: "Bayern Munich" });
  unrelated.message = "你未来希望凯恩的替代者来自哪个联赛？";
  unrelated.question = { reason: "凯恩的中锋职责会影响比赛样本。" };
  const events: RecruitmentTraceEvent[] = [tool("search_candidates", { position: null }), decision("ask_user")];
  const result = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events,
    firstTurnResponse: unrelated,
    response: unrelated,
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-unrelated-reason",
  });

  assert.equal(result.checks.questionAddressesRoleAmbiguity, false);
});

test("an interrupted case must retain its target club in the trace before reporting", () => {
  const events: RecruitmentTraceEvent[] = [
    tool("search_candidates", { position: null }),
    decision("ask_user"),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events,
    firstTurnResponse: response({ threadId: "case-no-team", status: "needs_input" }),
    response: response({ threadId: "case-no-team", status: "needs_input" }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-no-team",
  });

  assert.equal(result.checks.targetTeamContextPreserved, false);
});

test("a failed or empty evaluation does not satisfy the shortlist evidence stage", () => {
  const events: RecruitmentTraceEvent[] = [
    tool("search_methodology", { corpus: "methodology" }),
    tool("search_candidates", { position: null, maxAge: 23, minimumMinutes: 0, competition: null, season: null }),
    tool("evaluate_candidates", { evaluatedPlayerIds: [] }, { ok: false, resultCount: 0 }),
    tool("search_player_reports", { corpus: "player_report" }),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-evidence" }),
    response: response({ threadId: "case-evidence", recommendations: [] }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-evidence",
  });

  assert.equal(result.checks.evaluatedDiscoveredCandidates, false);
});

test("player report retrieval must follow a successful match-data evaluation", () => {
  const events: RecruitmentTraceEvent[] = [
    tool("search_methodology", { corpus: "methodology" }),
    tool("search_candidates", { position: null, maxAge: 23, minimumMinutes: 0, competition: null, season: null, candidateIds: ["player-1"] }),
    tool("search_player_reports", { corpus: "player_report" }),
    tool("evaluate_candidates", { evaluatedPlayerIds: ["player-1"] }),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-order" }),
    response: response({ threadId: "case-order" }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-order",
  });

  assert.equal(result.checks.evaluatedDiscoveredCandidates, true);
  assert.equal(result.checks.searchedReportsAfterEvaluatingEvidence, false);
});

test("evidence evaluation must happen after discovery and only evaluate discovered ids", () => {
  const events: RecruitmentTraceEvent[] = [
    tool("search_methodology", { corpus: "methodology" }),
    tool("evaluate_candidates", { evaluatedPlayerIds: ["player-1"] }),
    tool("search_candidates", { candidateIds: ["player-1"] }),
    tool("search_player_reports", { corpus: "player_report" }),
  ];
  const result = evaluateLocalAgentScenario({
    scenario: shortlistScenario,
    events,
    firstTurnResponse: response({ threadId: "case-evaluation-order" }),
    response: response({ threadId: "case-evaluation-order" }),
    firstTurnEvents: events,
    continuedEvents: [],
    answersUsed: 0,
    threadId: "case-evaluation-order",
  });

  assert.equal(result.checks.evaluatedOnlyAfterCandidateDiscovery, false);
});

test("public tool traces omit raw query and team names but preserve safe data boundaries", () => {
  const decisionEvent = privacySafeTraceEvent(decision("finish", "FC Bayern München"));
  const teamLookup = privacySafeTraceEvent(tool("inspect_team", { teamName: "FC Bayern München" }));
  const methodologySearch = privacySafeTraceEvent(tool("search_methodology", {
    corpus: "methodology",
    query: "natural language scouting brief for Barcelona",
  }));
  const search = privacySafeTraceEvent(tool("search_candidates", {
    position: "ST",
    candidateIds: ["player-1"],
    playerNameFilterUsed: true,
  }));

  const output = JSON.stringify([decisionEvent, teamLookup, methodologySearch, search]);
  assert.doesNotMatch(output, /FC Bayern München|Barcelona/);
  assert.deepEqual(decisionEvent, {
    phase: "decision",
    action: "finish",
    elapsedMs: 1,
    ok: true,
    targetTeamProvided: true,
  });
  assert.deepEqual((teamLookup as { filters: Record<string, unknown> }).filters, { teamNameProvided: true });
  assert.deepEqual((methodologySearch as { filters: Record<string, unknown> }).filters, {
    corpus: "methodology",
    queryProvided: true,
  });
  assert.deepEqual((search as { filters: Record<string, unknown> }).filters, {
    position: "ST",
    candidateIds: ["player-1"],
    playerNameFilterUsed: true,
    offset: 0,
    limit: 10,
    nextOffset: null,
  });
});

test("an empty expected-position result must be honestly explained before completing", () => {
  const events: RecruitmentTraceEvent[] = [
    tool("search_candidates", { position: "ST" }, { resultCount: 0, matchingRecordCount: 0 }),
  ];
  const firstTurnResponse = response({ threadId: "case-empty", status: "needs_input" });
  const completedWithoutExplanation = response({ threadId: "case-empty", targetTeam: "Bayern Munich", recommendations: [] });
  const missingExplanation = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events: [decision("search_candidates", "Bayern Munich"), ...events.slice(1)],
    firstTurnResponse,
    response: completedWithoutExplanation,
    firstTurnEvents: [tool("search_candidates", { position: "ST" }), decision("ask_user", "Bayern Munich")],
    continuedEvents: events,
    answersUsed: 1,
    threadId: "case-empty",
  });
  assert.equal(missingExplanation.checks.emptyExpectedPositionHandledHonestly, false);

  const explainedResponse = response({ threadId: "case-empty", targetTeam: "Bayern Munich", recommendations: [] });
  explainedResponse.report!.limitations.push("当前演示数据没有可用的中锋候选人。");
  const honestStop = evaluateLocalAgentScenario({
    scenario: clarificationScenario,
    events,
    firstTurnResponse,
    response: explainedResponse,
    firstTurnEvents: [tool("search_candidates", { position: "ST" }), decision("ask_user", "Bayern Munich")],
    continuedEvents: events,
    answersUsed: 1,
    threadId: "case-empty",
  });
  assert.equal(honestStop.checks.emptyExpectedPositionHandledHonestly, true);
});

test("repeated-run summaries show critical failures and nearest-rank latency percentiles", () => {
  const summary = summarizeEvaluationRuns([
    { checks: { evidence: true, sameCase: true }, elapsedMs: 100 },
    { checks: { evidence: false, sameCase: true }, elapsedMs: 200 },
    { checks: { evidence: true, sameCase: true }, elapsedMs: 300 },
    { checks: { evidence: true, sameCase: false }, elapsedMs: 400 },
  ]);

  assert.deepEqual(summary, {
    runCount: 4,
    passedRunCount: 2,
    passRate: 0.5,
    failedRunsByCheck: { evidence: 1, sameCase: 1 },
    latencyMs: { p50: 200, p95: 400 },
  });
});

test("repeated-run summaries count missing checks as failures and reject unscored runs", () => {
  const summary = summarizeEvaluationRuns([
    { checks: { evidence: true, sameCase: true }, elapsedMs: 10 },
    { checks: { evidence: true }, elapsedMs: 20 },
  ]);

  assert.equal(summary.passedRunCount, 1);
  assert.deepEqual(summary.failedRunsByCheck, { sameCase: 1 });
  assert.throws(() => summarizeEvaluationRuns([{ checks: {}, elapsedMs: 10 }]), /at least one check/);
});
