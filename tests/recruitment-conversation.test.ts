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
} from "../src/agent/conversation.js";
import type { PlayerRepository } from "../src/data/provider.js";
import type { PlayerProfile } from "../src/domain/schemas.js";
import type { KnowledgeSearchResult } from "../src/knowledge/schemas.js";

test("a recruitment case can pause for a user answer through the HTTP turn interface", async () => {
  const calls: Array<{ threadId: string; message: string; expectsExistingState?: boolean }> = [];
  const conversation: RecruitmentConversation = {
    async turn(input) {
      calls.push(input);
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
    assert.match(response.json().error, /服务端已重启/);
    assert.match(response.json().error, /历史记录不会被覆盖/);
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
    { action: "search_candidates", position: "ST", minimumMinutes: 900, limit: 10 },
    { action: "search_methodology", query: "中锋接替者的可观察能力维度" },
    { action: "search_candidates", position: "ST", minimumMinutes: 900, limit: 10 },
    { action: "evaluate_candidates", playerIds: ["striker-a", "striker-b"] },
    {
      action: "ask_user",
      question: "你更看重近期即战力，还是未来接班潜力？",
      reason: "这会改变年龄与出场样本之间的取舍。",
    },
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
    assert.equal(firstTurn.json().message, "你更看重近期即战力，还是未来接班潜力？");

    const resumedTurn = await app.inject({
      method: "POST",
      url: `/api/v1/recruitment/cases/${threadId}/turns`,
      payload: { message: "未来两三年接班，但希望有主力潜质" },
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
      position: "ST",
      maxAge: null,
      minimumMinutes: 900,
      competition: null,
      season: null,
      source: "agent_interpreted",
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
  const plannedFinish: RecruitmentAction = {
    action: "finish",
    targetTeam: null,
    needSummary: "尚无证据。",
    capabilityProfile: [],
    recommendations: [],
    limitationKeys: [],
  };
  const planner: RecruitmentPlanner = {
    async decide() { return plannedFinish; },
  };
  const app = createApp({ recruitmentConversation: createRecruitmentConversation({ repository, planner }) });

  try {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/recruitment/cases/decision-limit/turns",
      payload: { message: "帮我看看适合的候选人" },
    });

    assert.equal(response.statusCode, 200);
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
