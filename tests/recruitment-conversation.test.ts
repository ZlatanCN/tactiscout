import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import {
  createRecruitmentConversation,
  RecruitmentCaseStateExpiredError,
  unavailableRecruitmentConversation,
  type RecruitmentAction,
  type RecruitmentConversation,
  type RecruitmentPlanner,
  type RecruitmentTraceEvent,
} from "../src/agent/conversation.js";
import type { PlayerRepository } from "../src/data/provider.js";
import type { PlayerProfile } from "../src/domain/schemas.js";
import type { KnowledgeSearchResult } from "../src/knowledge/schemas.js";

function roleConstraintPlayer(playerId: string, name: string, position: PlayerProfile["position"]): PlayerProfile {
  return {
    playerId,
    name,
    team: "Harbor City",
    age: 23,
    position,
    competition: "Open League",
    season: "2025/26",
    minutes: 1800,
    stats: { goals: 8, assists: 3, passesAttempted: 300, passesCompleted: 225, longPasses: 10, carries: 35, pressures: 120, tackles: 8, interceptions: 4, shotAssists: 16 },
    source: "StatsBomb Open Data",
  };
}

test("a recruitment case can pause for a user answer through the HTTP turn interface", async () => {
  const calls: Array<{ threadId: string; message: string; expectsExistingState?: boolean }> = [];
  const conversation: RecruitmentConversation = {
    async turn(input) {
      calls.push({ threadId: input.threadId, message: input.message, expectsExistingState: input.expectsExistingState });
      return {
        threadId: input.threadId,
        status: "needs_input",
        message: "优先找即战力，还是培养接班人？",
        question: {
          reason: "这会改变目标球员的年龄和出场样本取舍。",
        },
        report: null,
      };
    },
  };
  const app = createApp({ recruitmentConversation: conversation });
  const threadId = "case-bayern-kane-1";

  try {
    const response = await app.inject({
      method: "POST",
      url: `/api/v1/recruitment/cases/${threadId}/turns`,
      payload: { message: "为拜仁寻找凯恩的替代者" },
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      threadId,
      status: "needs_input",
      message: "优先找即战力，还是培养接班人？",
      question: { reason: "这会改变目标球员的年龄和出场样本取舍。" },
      report: null,
    });
    assert.deepEqual(calls, [{ threadId, message: "为拜仁寻找凯恩的替代者", expectsExistingState: false }]);
  } finally {
    await app.close();
  }
});

test("the HTTP interface explains when a saved case checkpoint expired after a server restart", async () => {
  const conversation: RecruitmentConversation = {
    async turn() { throw new RecruitmentCaseStateExpiredError(); },
  };
  const app = createApp({ recruitmentConversation: conversation });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/recruitment/cases/case-after-restart/turns",
      payload: { message: "继续找人", expectsExistingState: true },
    });

    assert.equal(response.statusCode, 409);
    assert.match(response.json().error, /找不到此案件的内部调查状态/);
    assert.match(response.json().error, /浏览器中已有报告/);
  } finally {
    await app.close();
  }
});

test("the HTTP interface clearly reports when no model service is configured", async () => {
  const app = createApp({ recruitmentConversation: unavailableRecruitmentConversation() });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/recruitment/cases/new-case/turns",
      payload: { message: "为拜仁寻找凯恩的替代者" },
    });

    assert.equal(response.statusCode, 503);
    assert.match(response.json().error, /尚未配置模型服务/);
  } finally {
    await app.close();
  }
});

test("knowledge status uses the knowledge base injected into the application", async () => {
  let statusReads = 0;
  const knowledgeBase = {
    async search() { return []; },
    async status() {
      statusReads += 1;
      return {
        indexedChunks: 42,
        methodologyChunks: 40,
        playerReportChunks: 2,
        registeredSources: 7,
        ingestiblePlayerReportSources: 3,
        embeddingModel: "test-embedding",
        indexPath: "/test/knowledge-index",
      };
    },
  };
  const app = createApp({ knowledgeBase, recruitmentConversation: unavailableRecruitmentConversation() });

  try {
    const response = await app.inject({ method: "GET", url: "/api/v1/knowledge/status" });
    assert.equal(response.statusCode, 200);
    assert.equal(response.json().indexedChunks, 42);
    assert.equal(response.json().indexPath, "/test/knowledge-index");
    assert.equal(statusReads, 1);
  } finally {
    await app.close();
  }
});

test("a recruitment case investigates, pauses for a material choice, resumes, and recommends with evidence", async () => {
  const playerRecords: PlayerProfile[] = [
    {
      playerId: "striker-a", name: "Jonas Vale", team: "Harbor City", age: 23, position: "ST",
      competition: "Open League", season: "2024/25", minutes: 2100,
      stats: { goals: 12, assists: 4, passesAttempted: 420, passesCompleted: 315, longPasses: 8, carries: 33, pressures: 160, tackles: 4, interceptions: 2, shotAssists: 18 },
      source: "StatsBomb Open Data",
    },
    {
      playerId: "striker-b", name: "Marco Silva", team: "Eastvale", age: 25, position: "ST",
      competition: "Open League", season: "2024/25", minutes: 1800,
      stats: { goals: 8, assists: 7, passesAttempted: 510, passesCompleted: 408, longPasses: 14, carries: 48, pressures: 210, tackles: 7, interceptions: 5, shotAssists: 26 },
      source: "StatsBomb Open Data",
    },
  ];
  const repository: PlayerRepository = {
    mode: "statsbomb",
    sourceName: "StatsBomb Open Data",
    async loadPlayers() { return playerRecords; },
  };
  const methodologyResult: KnowledgeSearchResult = {
    id: "method-chunk-1",
    documentId: "method-doc-1",
    corpus: "methodology",
    text: "球探画像应转成可观察比赛行为，并结合情境解释指标。",
    title: "表现分析方法摘要",
    url: "https://example.test/methods",
    sourceId: "methods-source",
    sourceName: "Example methods source",
    publisher: "Example publisher",
    author: "TactiScout",
    publishedAt: null,
    license: "CC0",
    attribution: "TactiScout authored note",
    entityIds: [],
    entityNames: [],
    competition: null,
    season: null,
    displayAllowed: true,
  };
  const knowledgeBase = {
    async search(input: { corpus: "methodology" | "player_report" }) {
      return input.corpus === "methodology" ? [methodologyResult] : [];
    },
    async status() {
      return {
        indexedChunks: 1,
        methodologyChunks: 1,
        playerReportChunks: 0,
        registeredSources: 1,
        ingestiblePlayerReportSources: 0,
        embeddingModel: "test-embedding",
        indexPath: "/test/knowledge-index",
      };
    },
  };
  const observedToolOrders: string[][] = [];
  const actions: RecruitmentAction[] = [
    {
      action: "ask_user",
      question: "你更看重即战力，还是培养空间？",
      reason: "在查看现有比赛样本前，还不能确定这个取舍是否影响候选方向。",
    },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "尚未调查的早期报告不能交付。",
      capabilityProfile: [],
      recommendations: [],
      limitationKeys: [],
    },
    { action: "inspect_team", teamName: "Bayern Munich" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 10 },
    { action: "search_methodology", query: "中锋接替者的可观察能力维度" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 10 },
    { action: "search_methodology", query: "中锋接替者的可观察能力维度" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 10 },
    { action: "evaluate_candidates", playerIds: ["striker-a", "striker-b"] },
    { action: "search_player_reports", query: "中锋终结与做球观察", playerNames: ["Jonas Vale"] },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "寻找能承担中锋终结任务的凯恩接班人。",
      capabilityProfile: ["禁区终结", "前场压迫"],
      recommendations: [{
        playerId: "striker-a",
        evidenceKeys: ["goals", "passCompletionPct"],
      }],
      limitationKeys: [],
    },
  ];
  const planner: RecruitmentPlanner = {
    async decide(input) {
      observedToolOrders.push(input.history.filter((entry) => entry.role === "tool" && entry.toolName).map((entry) => entry.toolName as string));
      const action = actions.shift();
      assert.ok(action, `the conversation should not request more model decisions than its scripted responses; latest context: ${JSON.stringify(input.history.slice(-12))}`);
      return action;
    },
  };
  const app = createApp({ recruitmentConversation: createRecruitmentConversation({ repository, planner, knowledgeBase }) });
  const threadId = "case-bayern-kane-resume";

  try {
    const firstTurn = await app.inject({
      method: "POST",
      url: `/api/v1/recruitment/cases/${threadId}/turns`,
      payload: { message: "为拜仁寻找凯恩的替代者" },
    });

    assert.equal(firstTurn.statusCode, 200);
    assert.equal(firstTurn.json().status, "needs_input");
    assert.equal(firstTurn.json().message, "你希望替代者延续参考球员的场上角色，还是考虑不同的位置或职责？");

    const resumedTurn = await app.inject({
      method: "POST",
      url: `/api/v1/recruitment/cases/${threadId}/turns`,
      payload: { message: "按中锋职责，未来两三年接班，但希望有主力潜质" },
    });

    assert.equal(resumedTurn.statusCode, 200);
    const body = resumedTurn.json();
    assert.equal(body.status, "completed");
    assert.equal(body.report.recommendations[0].player.name, "Jonas Vale");
    assert.deepEqual(body.report.recommendations[0].focusEvidenceKeys, ["goals", "passCompletionPct"]);
    assert.equal(body.report.recommendations[0].evidence.length, 8);
    assert.deepEqual(body.report.evidenceCoverage, {
      evaluatedCandidateCount: 2,
      availableMetricValues: 16,
      expectedMetricValues: 16,
      lowSampleCandidates: 0,
      limitedPeerGroupCandidates: 2,
    });
    assert.deepEqual(body.report.knowledgeCoverage, {
      methodologyChunksRetrieved: 1,
      methodologySearchFailed: false,
      playerReportSearchPerformed: true,
      playerReportSearchFailed: false,
      playerReportChunksRetrieved: 0,
    });
    const lastObservedTools = observedToolOrders.at(-1) ?? [];
    assert.ok(lastObservedTools.indexOf("search_methodology") < lastObservedTools.indexOf("search_candidates"));
    assert.ok(lastObservedTools.indexOf("evaluate_candidates") < lastObservedTools.indexOf("search_player_reports"));
    assert.deepEqual(body.report.searchScopes, [{
      position: null,
      maxAge: null,
      minimumMinutes: 0,
      competition: null,
      season: null,
      source: "agent_interpreted",
    }, {
      position: "ST",
      maxAge: null,
      minimumMinutes: 0,
      competition: null,
      season: null,
      source: "user_confirmed",
    }]);
    assert.match(body.report.recommendations[0].rationale, /进球/);
    assert.match(body.report.recommendations[0].rationale, /不代表已验证适合转会/);
    assert.match(body.message, /不是经过验证的综合能力排名/);
    assert.ok(body.report.recommendations[0].tradeoffs.some((item: string) => /不能替代完整比赛录像/.test(item)));
    assert.ok(body.report.limitations.some((item: string) => /当前完整阵容/.test(item)));
  } finally {
    await app.close();
  }
});

test("the decision limit produces a bounded no-evidence report instead of looping", async () => {
  const repository: PlayerRepository = {
    mode: "demo",
    sourceName: "Demo data",
    async loadPlayers() { return []; },
  };
  const plannedActions: RecruitmentAction[] = [
    { action: "search_methodology", query: "候选人评估" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 5 },
    { action: "search_methodology", query: "球员能力证据" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 5 },
    { action: "evaluate_candidates", playerIds: ["not-in-dataset"] },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 5 },
    { action: "evaluate_candidates", playerIds: ["not-in-dataset"] },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 5 },
    { action: "evaluate_candidates", playerIds: ["not-in-dataset"] },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 5 },
  ];
  let decisionCount = 0;
  const planner: RecruitmentPlanner = {
    async decide() {
      decisionCount += 1;
      const action = plannedActions.shift();
      assert.ok(action);
      return action;
    },
  };
  const app = createApp({ recruitmentConversation: createRecruitmentConversation({ repository, planner }) });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/recruitment/cases/decision-limit/turns",
      payload: { message: "帮我看看适合的候选人" },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(decisionCount, 10);
    assert.deepEqual(response.json().report.recommendations, []);
    assert.ok(response.json().report.limitations.some((item: string) => /安全步数上限/.test(item)));
  } finally {
    await app.close();
  }
});

test("independent tool budgets stop repeated methodology searches while preserving later investigation steps", async () => {
  const player: PlayerProfile = {
    playerId: "budget-player", name: "Budget Player", team: "Harbor City", age: 23, position: "ST",
    competition: "Open League", season: "2025/26", minutes: 1800,
    stats: { goals: 4, assists: 1, passesAttempted: 100, passesCompleted: 70, longPasses: 3, carries: 12, pressures: 30, tackles: 2, interceptions: 1, shotAssists: 5 },
    source: "StatsBomb Open Data",
  };
  const repository: PlayerRepository = {
    mode: "statsbomb",
    sourceName: "StatsBomb Open Data",
    async loadPlayers() { return [player]; },
  };
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "前锋表现方法一" },
    { action: "search_methodology", query: "前锋表现方法二" },
    { action: "search_methodology", query: "超过上限的方法搜索" },
    { action: "search_candidates", position: "ST", minimumMinutes: 0, limit: 10 },
    { action: "evaluate_candidates", playerIds: [player.playerId] },
    { action: "search_player_reports", query: "球员报告", playerNames: [player.name] },
    { action: "finish", targetTeam: null, needSummary: "完成调查。", capabilityProfile: [], recommendations: [], limitationKeys: [] },
  ];
  let methodologyCalls = 0;
  const planner: RecruitmentPlanner = {
    async decide() {
      const action = actions.shift();
      assert.ok(action, "budget feedback should let the agent move on to later tool types");
      return action;
    },
  };
  const conversation = createRecruitmentConversation({
    repository,
    planner,
    knowledgeBase: {
      async search({ corpus }) {
        if (corpus === "methodology") methodologyCalls += 1;
        return [];
      },
    },
  });

  const response = await conversation.turn({ threadId: "independent-tool-budgets", message: "帮我找中锋" });

  assert.equal(response.status, "completed");
  assert.equal(methodologyCalls, 2);
  assert.equal(actions.length, 0);
  assert.equal(response.report?.knowledgeCoverage.playerReportSearchPerformed, true);
});

test("the optional trace records action timing and actual tool scopes without model reasoning", async () => {
  const player: PlayerProfile = {
    playerId: "trace-player", name: "Trace Player", team: "Harbor City", age: 22, position: "CM",
    competition: "Open League", season: "2025/26", minutes: 1200,
    stats: { goals: 2, assists: 1, passesAttempted: 200, passesCompleted: 160, longPasses: 12, carries: 30, pressures: 100, tackles: 8, interceptions: 4, shotAssists: 9 },
    source: "StatsBomb Open Data",
  };
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "推进和压迫表现", limit: 3 },
    { action: "search_candidates", position: "CM", maxAge: 23, minimumMinutes: 0, competition: null, season: null, limit: 5 },
    { action: "evaluate_candidates", playerIds: [player.playerId] },
    { action: "search_player_reports", query: "Trace Player 球员报告", playerNames: [player.name], limit: 2 },
    { action: "finish", targetTeam: "Barcelona", needSummary: "寻找年轻中场。", capabilityProfile: ["推进", "前场压迫"], recommendations: [], limitationKeys: [] },
  ];
  const events: RecruitmentTraceEvent[] = [];
  const conversation = createRecruitmentConversation({
    repository: { mode: "demo", sourceName: "Demo", async loadPlayers() { return [player]; } },
    planner: { async decide() { const action = actions.shift(); assert.ok(action); return action; } },
    knowledgeBase: { async search() { return []; } },
    observer: (event) => { events.push(event); },
  });

  const response = await conversation.turn({ threadId: "trace-public-seam", message: "为巴萨找 23 岁以下中场" });

  assert.equal(response.status, "completed");
  assert.deepEqual(events.filter((event) => event.phase === "decision").map((event) => event.action), [
    "search_methodology", "search_candidates", "evaluate_candidates", "search_player_reports", "finish",
  ]);
  const candidateSearch = events.find((event) => event.phase === "tool" && event.toolName === "search_candidates");
  assert.ok(candidateSearch && candidateSearch.phase === "tool");
  assert.equal(candidateSearch.toolName, "search_candidates");
  assert.equal(candidateSearch.ok, true);
  assert.ok(candidateSearch.elapsedMs >= 0);
  assert.deepEqual(candidateSearch.filters, {
    position: "CM",
    maxAge: 23,
    minimumMinutes: 0,
    competition: null,
    season: null,
    offset: 0,
    limit: 5,
    playerNameFilterUsed: false,
    nextOffset: null,
    candidateIds: [player.playerId],
  });
  assert.equal(candidateSearch.resultCount, 1);
  assert.equal(candidateSearch.matchingRecordCount, 1);
  const candidateEvaluation = events.find((event) => event.phase === "tool" && event.toolName === "evaluate_candidates");
  assert.ok(candidateEvaluation && candidateEvaluation.phase === "tool");
  assert.deepEqual(candidateEvaluation.filters, {
    requestedPlayerCount: 1,
    evaluatedPlayerIds: [player.playerId],
  });
  assert.ok(events.every((event) => !("reasoning" in event) && !("content" in event)));
});

test("candidate search traces indicate name filtering without exposing the searched player's name", async () => {
  const events: RecruitmentTraceEvent[] = [];
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "中锋替代者的能力画像" },
    { action: "search_candidates", playerName: "Harry Kane", limit: 10 },
    { action: "ask_user", question: "你希望找即战力还是长期接班人？", reason: "两种目标会改变候选画像。" },
  ];
  const conversation = createRecruitmentConversation({
    repository: { mode: "demo", sourceName: "Demo", async loadPlayers() { return []; } },
    planner: { async decide() { const action = actions.shift(); assert.ok(action); return action; } },
    knowledgeBase: { async search() { return []; } },
    observer: (event) => { events.push(event); },
  });

  await conversation.turn({ threadId: "private-name-trace", message: "为拜仁寻找凯恩的替代者" });

  const candidateSearch = events.find((event) => event.phase === "tool" && event.toolName === "search_candidates");
  assert.ok(candidateSearch && candidateSearch.phase === "tool");
  assert.equal(candidateSearch.filters.playerNameFilterUsed, true);
  assert.equal(JSON.stringify(events).includes("Harry Kane"), false);
});


test("the case stops a repeated policy-blocked action before spending the remaining model-call budget", async () => {
  const player: PlayerProfile = {
    playerId: "guard-player", name: "Guard Player", team: "Harbor City", age: 22, position: "CM",
    competition: "Open League", season: "2025/26", minutes: 1200,
    stats: { goals: 2, assists: 1, passesAttempted: 200, passesCompleted: 160, longPasses: 12, carries: 30, pressures: 100, tackles: 8, interceptions: 4, shotAssists: 9 },
    source: "StatsBomb Open Data",
  };
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "推进表现" },
    { action: "search_candidates", position: "CM", minimumMinutes: 0, limit: 5 },
    { action: "evaluate_candidates", playerIds: [player.playerId] },
    { action: "finish", targetTeam: "Barcelona", needSummary: "完成。", capabilityProfile: [], recommendations: [], limitationKeys: [] },
    { action: "finish", targetTeam: "Barcelona", needSummary: "再次尝试。", capabilityProfile: [], recommendations: [], limitationKeys: [] },
  ];
  let plannerCalls = 0;
  const conversation = createRecruitmentConversation({
    repository: { mode: "demo", sourceName: "Demo", async loadPlayers() { return [player]; } },
    planner: {
      async decide() {
        plannerCalls += 1;
        const action = actions.shift();
        assert.ok(action);
        return action;
      },
    },
    knowledgeBase: { async search() { return []; } },
  });

  const response = await conversation.turn({ threadId: "repeated-policy-action", message: "为巴萨找一名中场" });

  assert.equal(response.status, "completed");
  assert.equal(plannerCalls, 5);
  assert.equal(actions.length, 0);
  assert.deepEqual(response.report?.recommendations, []);
  assert.ok(response.report?.limitations.some((item) => /连续重复.*动作/.test(item)));
});

test("final report text cannot assert an unverified current club or league from model memory", async () => {
  const player = roleConstraintPlayer("ungrounded-affiliation-player", "Jonas Vale", "ST");
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "中锋比赛表现的可观察评估维度" },
    { action: "search_candidates", position: "ST", minimumMinutes: 0, limit: 10 },
    { action: "evaluate_candidates", playerIds: [player.playerId] },
    { action: "search_player_reports", query: "Jonas Vale 球员报告", playerNames: [player.name] },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "凯恩效力于拜仁慕尼黑，因此需要寻找替代者。",
      capabilityProfile: ["中锋表现"],
      recommendations: [],
      limitationKeys: [],
    },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "为拜仁寻找具备中锋职责、适合在右路踢球的替代人选。",
      capabilityProfile: ["中锋比赛表现"],
      recommendations: [],
      limitationKeys: [],
    },
  ];
  const decisionEvents: RecruitmentTraceEvent[] = [];
  const conversation = createRecruitmentConversation({
    repository: { mode: "statsbomb", sourceName: "StatsBomb Open Data", async loadPlayers() { return [player]; } },
    planner: { async decide() { const action = actions.shift(); assert.ok(action); return action; } },
    knowledgeBase: { async search() { return []; } },
    observer(event) { if (event.phase === "decision") decisionEvents.push(event); },
  });

  const response = await conversation.turn({ threadId: "unverified-final-affiliation", message: "为拜仁寻找凯恩的中锋替代者" });

  assert.equal(response.status, "completed");
  assert.equal(response.report?.needSummary, "为拜仁寻找具备中锋职责、适合在右路踢球的替代人选。");
  assert.ok(decisionEvents.some((event) => event.phase === "decision" && event.action === "finish" && event.policyBlocked));
  assert.equal(actions.length, 0);
});

test("player report search covers every evaluated candidate even when the action names only one", async () => {
  const players: PlayerProfile[] = [
    {
      playerId: "report-player-a", name: "Report Player A", team: "Harbor City", age: 22, position: "CM",
      competition: "Open League", season: "2025/26", minutes: 1200,
      stats: { goals: 2, assists: 1, passesAttempted: 200, passesCompleted: 160, longPasses: 12, carries: 30, pressures: 100, tackles: 8, interceptions: 4, shotAssists: 9 },
      source: "StatsBomb Open Data",
    },
    {
      playerId: "report-player-b", name: "Report Player B", team: "River Town", age: 21, position: "CM",
      competition: "Open League", season: "2025/26", minutes: 1100,
      stats: { goals: 1, assists: 2, passesAttempted: 180, passesCompleted: 144, longPasses: 9, carries: 26, pressures: 110, tackles: 10, interceptions: 6, shotAssists: 7 },
      source: "StatsBomb Open Data",
    },
  ];
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", targetTeam: "Barcelona", query: "中场推进" },
    { action: "search_candidates", position: "CM", minimumMinutes: 0, limit: 5 },
    { action: "evaluate_candidates", playerIds: players.map((player) => player.playerId) },
    { action: "search_player_reports", query: "中场推进报告", playerNames: [players[0]!.name] },
    { action: "finish", targetTeam: "Barcelona", needSummary: "完成。", capabilityProfile: [], recommendations: [], limitationKeys: [] },
  ];
  let actualReportNames: string[] = [];
  const decisionModes: Array<"investigate" | "conclude" | undefined> = [];
  let conclusionConstraints: Parameters<RecruitmentPlanner["decide"]>[0]["constraints"];
  const events: RecruitmentTraceEvent[] = [];
  const conversation = createRecruitmentConversation({
    repository: { mode: "demo", sourceName: "Demo", async loadPlayers() { return players; } },
    planner: {
      async decide(input) {
        decisionModes.push(input.decisionMode);
        if (input.decisionMode === "conclude") conclusionConstraints = input.constraints;
        const action = actions.shift();
        assert.ok(action);
        return action;
      },
    },
    knowledgeBase: {
      async search(input) {
        if (input.corpus === "player_report") actualReportNames = input.playerNames;
        return [];
      },
    },
    observer: (event) => { events.push(event); },
  });

  const response = await conversation.turn({ threadId: "all-candidates-reports", message: "为巴萨找中场" });

  assert.equal(response.status, "completed");
  assert.deepEqual(actualReportNames, players.map((player) => player.name));
  assert.equal(decisionModes.at(-1), "conclude");
  assert.equal(conclusionConstraints?.targetTeam, "巴萨");
  assert.deepEqual(conclusionConstraints?.evaluatedCandidates.map(({ playerId }) => playerId), players.map((player) => player.playerId));
  assert.ok(conclusionConstraints?.evaluatedCandidates.every(({ evidenceKeys }) => evidenceKeys.length === 8));
  assert.deepEqual(conclusionConstraints?.reportObservations, []);
  const reportTrace = events.find((event) => event.phase === "tool" && event.toolName === "search_player_reports");
  assert.ok(reportTrace && reportTrace.phase === "tool");
  assert.equal(reportTrace.filters.searchedPlayerCount, 2);
  assert.deepEqual(reportTrace.filters.searchedPlayerIds, players.map((player) => player.playerId));
});

test("the case preserves the named recruitment club across later actions that omit it", async () => {
  const player: PlayerProfile = {
    playerId: "team-context-player", name: "Team Context Player", team: "Harbor City", age: 22, position: "CM",
    competition: "Open League", season: "2025/26", minutes: 1200,
    stats: { goals: 2, assists: 1, passesAttempted: 200, passesCompleted: 160, longPasses: 12, carries: 30, pressures: 100, tackles: 8, interceptions: 4, shotAssists: 9 },
    source: "StatsBomb Open Data",
  };
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", targetTeam: "FC Barcelona", query: "中场推进" },
    { action: "search_candidates", position: "CM", minimumMinutes: 0, limit: 5 },
    { action: "evaluate_candidates", playerIds: [player.playerId] },
    { action: "search_player_reports", query: "球员报告", playerNames: [player.name] },
    { action: "finish", targetTeam: null, needSummary: "完成。", capabilityProfile: [], recommendations: [], limitationKeys: [] },
  ];
  const events: RecruitmentTraceEvent[] = [];
  const conversation = createRecruitmentConversation({
    repository: { mode: "demo", sourceName: "Demo", async loadPlayers() { return [player]; } },
    planner: { async decide() { const action = actions.shift(); assert.ok(action); return action; } },
    knowledgeBase: { async search() { return []; } },
    observer: (event) => { events.push(event); },
  });

  const response = await conversation.turn({ threadId: "preserved-target-team", message: "为巴萨找一名中场" });

  assert.equal(response.status, "completed");
  assert.equal(response.report?.targetTeam, "巴萨");
  assert.ok(events.filter((event) => event.phase === "decision").every((event) => event.targetTeam === "巴萨"));
});

test("missing event coverage and zero pass attempts are reported as unavailable evidence", async () => {
  async function investigate(player: PlayerProfile, id: string, recommendationKey?: "goals") {
    const actions: RecruitmentAction[] = [
      { action: "search_methodology", query: "中锋表现方法" },
      { action: "search_candidates", position: "ST", minimumMinutes: 0, limit: 10 },
      { action: "evaluate_candidates", playerIds: [player.playerId] },
      { action: "search_player_reports", query: "球员报告观察", playerNames: [player.name] },
      {
        action: "finish",
        targetTeam: null,
        needSummary: "基于当前比赛数据评估。",
        capabilityProfile: [],
        recommendations: recommendationKey ? [{ playerId: player.playerId, evidenceKeys: [recommendationKey] }] : [],
        limitationKeys: [],
      },
    ];
    let evaluations: unknown[] = [];
    const planner: RecruitmentPlanner = {
      async decide({ history }) {
        const evaluation = history.filter((entry) => entry.role === "tool" && entry.toolName === "evaluate_candidates").at(-1);
        if (evaluation) evaluations = (JSON.parse(evaluation.content) as { evaluations: Array<{ metrics: unknown[] }> }).evaluations[0]?.metrics ?? [];
        const action = actions.shift();
        assert.ok(action, "the investigation should finish within the decision budget");
        return action;
      },
    };
    const repository: PlayerRepository = {
      mode: "statsbomb",
      sourceName: "StatsBomb Open Data",
      async loadPlayers() { return [player]; },
    };
    const conversation = createRecruitmentConversation({ repository, planner, knowledgeBase: { async search() { return []; } } });
    const response = await conversation.turn({ threadId: id, message: "比较这个中锋" });
    return { response, evaluations };
  }

  const incomplete: PlayerProfile = {
    playerId: "missing-events", name: "Missing Events", team: "Harbor City", age: 23, position: "ST",
    competition: "Open League", season: "2025/26", minutes: 1800,
    stats: { goals: 0, assists: 0, passesAttempted: 0, passesCompleted: 0, longPasses: 0, carries: 0, pressures: 0, tackles: 0, interceptions: 0, shotAssists: 0 },
    eventDataComplete: false,
    source: "StatsBomb Open Data",
  };
  const noPasses: PlayerProfile = {
    ...incomplete,
    playerId: "no-passes",
    name: "No Pass Attempts",
    eventDataComplete: true,
    stats: { ...incomplete.stats, goals: 3 },
  };

  const incompleteResult = await investigate(incomplete, "incomplete-event-data");
  const noPassesResult = await investigate(noPasses, "no-pass-attempts", "goals");

  assert.deepEqual(incompleteResult.evaluations, []);
  assert.equal(incompleteResult.response.report?.evidenceCoverage.availableMetricValues, 0);
  assert.equal(incompleteResult.response.report?.evidenceCoverage.expectedMetricValues, 8);
  assert.ok(incompleteResult.response.report?.limitations.some((item) => /缺少一场或多场比赛的事件文件/.test(item)));
  assert.equal(noPassesResult.evaluations.length, 7);
  assert.ok(!noPassesResult.evaluations.some((item) => (item as { key?: string }).key === "passCompletionPct"));
  assert.equal(noPassesResult.response.report?.evidenceCoverage.availableMetricValues, 7);
  assert.ok(noPassesResult.response.report?.limitations.some((item) => /没有传球尝试/.test(item)));
});

test("a clarified role survives checkpoint resume and constrains search, evaluation, reports, and later role changes", async () => {
  const striker = roleConstraintPlayer("role-st", "Jonas Vale", "ST");
  const centerBack = roleConstraintPlayer("role-cb", "Mika Stone", "CB");
  const players = [striker, centerBack];
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "凯恩替代者的中锋能力画像" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 10 },
    { action: "search_methodology", query: "中锋能力画像与比赛表现评估" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 10 },
    { action: "evaluate_candidates", playerIds: players.map(({ playerId }) => playerId) },
    { action: "search_player_reports", query: "中锋候选人球探报告", playerNames: players.map(({ name }) => name) },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "寻找凯恩的接班人。",
      capabilityProfile: ["中锋表现"],
      recommendations: [{ playerId: centerBack.playerId, evidenceKeys: ["goals"] }],
      reportObservations: [{ playerId: centerBack.playerId, documentId: "untrusted-cb-report", summary: "中后卫报告观察。", linkedMetricKeys: [] }],
      limitationKeys: [],
    },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "寻找中锋接班人。",
      capabilityProfile: ["中锋表现"],
      recommendations: [{ playerId: striker.playerId, evidenceKeys: ["goals"] }],
      limitationKeys: [],
    },
    { action: "search_methodology", query: "中后卫能力画像和比赛表现评估" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 10 },
    { action: "evaluate_candidates", playerIds: players.map(({ playerId }) => playerId) },
    { action: "search_player_reports", query: "中后卫球探报告", playerNames: players.map(({ name }) => name) },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "改找中后卫。",
      capabilityProfile: ["中后卫表现"],
      recommendations: [{ playerId: centerBack.playerId, evidenceKeys: ["tacklesInterceptions"] }],
      limitationKeys: [],
    },
  ];
  const plannerInputs: Array<{ confirmedPosition: string | null; targetTeam: string | null; history: Array<{ role: string; content: string }> }> = [];
  const candidateSearches: RecruitmentTraceEvent[] = [];
  const candidateEvaluations: RecruitmentTraceEvent[] = [];
  const constrainedCandidateIds: string[][] = [];
  let reportSearchNames: string[] = [];
  const conversation = createRecruitmentConversation({
    repository: { mode: "statsbomb", sourceName: "StatsBomb Open Data", async loadPlayers() { return players; } },
    planner: {
      async decide(input) {
        plannerInputs.push({ confirmedPosition: input.confirmedPosition, targetTeam: input.targetTeam, history: input.history });
        if (input.decisionMode === "conclude") {
          constrainedCandidateIds.push(input.constraints?.evaluatedCandidates.map(({ playerId }) => playerId) ?? []);
        }
        const action = actions.shift();
        assert.ok(action, "the case should continue through its scripted choices without an unbounded loop");
        return action;
      },
    },
    knowledgeBase: {
      async search(input) {
        if (input.corpus === "player_report") reportSearchNames = input.playerNames;
        return [];
      },
    },
    observer(event) {
      if (event.phase === "tool" && event.toolName === "search_candidates") candidateSearches.push(event);
      if (event.phase === "tool" && event.toolName === "evaluate_candidates") candidateEvaluations.push(event);
    },
  });
  const threadId = "clarified-role-checkpoint-resume";

  const firstTurn = await conversation.turn({
    threadId,
    message: "为拜仁找一名前锋，作为凯恩的替代者",
  });
  assert.equal(firstTurn.status, "needs_input");
  assert.equal(plannerInputs[0]?.confirmedPosition, null, "generic 前锋 must not be narrowed to one position");
  assert.equal(plannerInputs[0]?.targetTeam, "拜仁");

  const resumedTurn = await conversation.turn({ threadId, message: "按中锋职责，优先未来接班。" });
  assert.equal(resumedTurn.status, "completed");
  assert.equal(resumedTurn.report?.targetTeam, "拜仁", "case context fills an omitted/null finish targetTeam");
  assert.equal(resumedTurn.report?.recommendations[0]?.player.playerId, striker.playerId);
  assert.equal(resumedTurn.report?.evidenceCoverage.evaluatedCandidateCount, 1);
  assert.deepEqual(reportSearchNames, [striker.name]);
  assert.deepEqual(candidateSearches.slice(0, 2).map((event) => event.phase === "tool" ? event.filters.position : null), [null, "ST"]);
  assert.deepEqual(candidateSearches[1]?.phase === "tool" ? candidateSearches[1].filters.candidateIds : null, [striker.playerId]);
  assert.deepEqual(candidateEvaluations[0]?.phase === "tool" ? candidateEvaluations[0].filters.evaluatedPlayerIds : null, [striker.playerId]);
  assert.ok(constrainedCandidateIds.length > 0 && constrainedCandidateIds.every((ids) => ids.every((playerId) => playerId === striker.playerId)));
  assert.ok(resumedTurn.report?.recommendations.every(({ reportObservations }) => reportObservations.length === 0));
  assert.ok(plannerInputs.some(({ confirmedPosition, history }) => confirmedPosition === "ST"
    && history.some(({ role, content }) => role === "user" && content.includes("按中锋职责"))));
  assert.ok(resumedTurn.report?.recommendations.every(({ player }) => player.position === "ST"));

  const changedRoleTurn = await conversation.turn({ threadId, message: "改成中后卫，改为帮我为巴萨找一名后防接班人。" });
  assert.equal(changedRoleTurn.status, "completed");
  assert.equal(changedRoleTurn.report?.targetTeam, "巴萨", "an explicit new recruitment target updates the case context");
  assert.equal(changedRoleTurn.report?.recommendations[0]?.player.playerId, centerBack.playerId);
  assert.ok(candidateSearches.some((event) => event.phase === "tool" && event.filters.position === "CB"));
  assert.ok(plannerInputs.some(({ confirmedPosition, history }) => confirmedPosition === "CB"
    && history.some(({ role, content }) => role === "user" && content.includes("改成中后卫"))));
  assert.ok(plannerInputs.some(({ targetTeam }) => targetTeam === "巴萨"));
  assert.ok(changedRoleTurn.report?.recommendations.every(({ player }) => player.position === "CB"));
  assert.equal(actions.length, 0);
});

test("replacement searches drop the reference filter and inferred age, then ask once and resume on the confirmed role", async () => {
  const striker = roleConstraintPlayer("replacement-st", "Jonas Vale", "ST");
  const centerBack = roleConstraintPlayer("replacement-cb", "Mika Stone", "CB");
  const overAgeStriker = { ...roleConstraintPlayer("replacement-overage-st", "Older Vale", "ST"), age: 29 };
  const players = [striker, centerBack, overAgeStriker];
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "凯恩替代者的可观察能力维度" },
    { action: "search_candidates", position: null, playerName: "凯恩", maxAge: 35, minimumMinutes: 0, limit: 10 },
    { action: "search_methodology", query: "中锋表现的可观察指标" },
    { action: "search_candidates", position: null, playerName: "凯恩", maxAge: 35, minimumMinutes: 0, limit: 10 },
    { action: "evaluate_candidates", playerIds: [striker.playerId, centerBack.playerId, overAgeStriker.playerId] },
    { action: "search_player_reports", query: "中锋球员报告", playerNames: [striker.name, overAgeStriker.name] },
    {
      action: "finish",
      targetTeam: null,
      needSummary: "按用户确认的中锋角色和年龄范围完成能力比较。",
      capabilityProfile: ["中锋比赛表现"],
      recommendations: [
        { playerId: striker.playerId, evidenceKeys: ["goals"] },
        { playerId: overAgeStriker.playerId, evidenceKeys: ["goals"] },
      ],
      limitationKeys: [],
    },
  ];
  const plannerInputs: Array<{ targetTeam: string | null; confirmedPosition: string | null; userMessages: string[] }> = [];
  const candidateSearches: Extract<RecruitmentTraceEvent, { phase: "tool" }>[] = [];
  const evaluationEvents: Extract<RecruitmentTraceEvent, { phase: "tool" }>[] = [];
  const asks: Extract<RecruitmentTraceEvent, { phase: "decision" }>[] = [];
  const conversation = createRecruitmentConversation({
    repository: { mode: "statsbomb", sourceName: "StatsBomb Open Data", async loadPlayers() { return players; } },
    planner: {
      async decide(input) {
        plannerInputs.push({
          targetTeam: input.targetTeam,
          confirmedPosition: input.confirmedPosition,
          userMessages: input.history.filter((entry) => entry.role === "user").map((entry) => entry.content),
        });
        const action = actions.shift();
        assert.ok(action, "the scripted planner action should be available");
        return action;
      },
    },
    knowledgeBase: { async search() { return []; } },
    observer(event) {
      if (event.phase === "tool" && event.toolName === "search_candidates") candidateSearches.push(event);
      if (event.phase === "tool" && event.toolName === "evaluate_candidates") evaluationEvents.push(event);
      if (event.phase === "decision" && event.action === "ask_user") asks.push(event);
    },
  });
  const threadId = "replacement-role-clarification";

  const firstTurn = await conversation.turn({ threadId, message: "为拜仁寻找凯恩的替代者" });
  assert.equal(firstTurn.status, "needs_input");
  assert.match(firstTurn.message, /替代者.*角色.*还是.*位置|职责/);
  assert.equal(asks.length, 1, "the role question is asked exactly once");
  assert.deepEqual(candidateSearches[0]?.filters.maxAge, null, "model-inferred age is not a user filter");
  assert.equal(candidateSearches[0]?.filters.playerNameFilterUsed, false, "the reference player does not narrow the candidate pool");
  assert.equal(candidateSearches[0]?.matchingRecordCount, 3);

  const firstTurnCandidateSearchCount = candidateSearches.length;
  const resumedTurn = await conversation.turn({ threadId, message: "找 23 岁以下的中锋，重点考虑未来接班。" });
  assert.equal(resumedTurn.status, "completed");
  assert.equal(resumedTurn.report?.targetTeam, "拜仁");
  assert.equal(resumedTurn.report?.recommendations[0]?.player.playerId, striker.playerId);
  const resumedSearches = candidateSearches.slice(firstTurnCandidateSearchCount);
  assert.ok(resumedSearches.length > 0);
  assert.ok(resumedSearches.every(({ filters }) => filters.maxAge === 23));
  assert.ok(resumedSearches.every(({ filters }) => filters.playerNameFilterUsed === false));
  assert.ok(resumedSearches.every(({ filters }) => filters.position === "ST"));
  assert.deepEqual(evaluationEvents.at(-1)?.filters.evaluatedPlayerIds, [striker.playerId]);
  assert.deepEqual(resumedTurn.report?.recommendations.map(({ player: recommended }) => recommended.playerId), [striker.playerId]);
  assert.equal(resumedTurn.report?.evidenceCoverage.evaluatedCandidateCount, 1);
  assert.equal(asks.length, 1, "the clarification is not repeated after the answer");
  assert.ok(plannerInputs.some(({ userMessages }) => userMessages.some((message) => message.includes("23 岁以下"))));
  assert.ok(plannerInputs.some(({ targetTeam, confirmedPosition }) => targetTeam === "拜仁" && confirmedPosition === "ST"));
  assert.equal(actions.length, 0);
});

test("an empty confirmed-role search never falls back to previously discovered players from another position", async () => {
  const centerBack = roleConstraintPlayer("empty-role-cb", "Mika Stone", "CB");
  const actions: RecruitmentAction[] = [
    { action: "search_methodology", query: "前锋位置的表现评估方法" },
    { action: "search_candidates", position: null, minimumMinutes: 0, limit: 10 },
    { action: "evaluate_candidates", playerIds: [centerBack.playerId] },
    {
      action: "ask_user",
      question: "你希望寻找哪种具体位置？",
      reason: "具体位置会改变候选名单。",
    },
    { action: "search_candidates", position: "CB", minimumMinutes: 0, limit: 10 },
    {
      action: "finish",
      targetTeam: null,
      needSummary: "找到中后卫。",
      capabilityProfile: ["后场防守"],
      recommendations: [{ playerId: centerBack.playerId, evidenceKeys: ["tacklesInterceptions"] }],
      limitationKeys: [],
    },
    {
      action: "finish",
      targetTeam: null,
      needSummary: "报告中锋位置的数据覆盖。",
      capabilityProfile: ["中锋表现"],
      recommendations: [],
      limitationKeys: [],
    },
  ];
  const candidateSearches: RecruitmentTraceEvent[] = [];
  const conversation = createRecruitmentConversation({
    repository: { mode: "statsbomb", sourceName: "StatsBomb Open Data", async loadPlayers() { return [centerBack]; } },
    planner: {
      async decide() {
        const action = actions.shift();
        assert.ok(action);
        return action;
      },
    },
    knowledgeBase: { async search() { return []; } },
    observer(event) {
      if (event.phase === "tool" && event.toolName === "search_candidates") candidateSearches.push(event);
    },
  });
  const threadId = "empty-confirmed-role";

  const firstTurn = await conversation.turn({ threadId, message: "帮我找一名前锋" });
  assert.equal(firstTurn.status, "needs_input");
  const resumedTurn = await conversation.turn({ threadId, message: "我明确要找中锋，不考虑其他位置。" });

  assert.equal(resumedTurn.status, "completed");
  assert.deepEqual(resumedTurn.report?.recommendations, []);
  assert.ok(resumedTurn.report?.limitations.some((item) => /用户确认的位置（中锋）完成候选检索后，没有找到/.test(item)));
  assert.deepEqual(candidateSearches.map((event) => event.phase === "tool" ? event.filters.position : null), [null, "ST"]);
  assert.equal(candidateSearches[1]?.phase === "tool" ? candidateSearches[1].matchingRecordCount : null, 0);
  assert.equal(actions.length, 0);
});
