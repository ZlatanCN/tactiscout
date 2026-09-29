import assert from "node:assert/strict";
import test from "node:test";
import {
  loadRecruitmentPlans,
  removeRecruitmentPlan,
  saveRecruitmentPlans,
  upsertRecruitmentPlan,
  type SavedRecruitmentPlan,
} from "../web/src/plans.js";
import type { RecruitmentReport, ScoutResponse } from "../src/domain/schemas.js";

const originalReport: RecruitmentReport = {
  targetTeam: "Bayern Munich",
  needSummary: "寻找能承担中锋终结任务的凯恩接班人。",
  capabilityProfile: ["禁区终结", "前场压迫"],
  evidenceCoverage: { evaluatedCandidateCount: 0, availableMetricValues: 0, expectedMetricValues: 0, lowSampleCandidates: 0, limitedPeerGroupCandidates: 0 },
  knowledgeCoverage: { methodologyChunksRetrieved: 0, methodologySearchFailed: false, playerReportSearchPerformed: false, playerReportSearchFailed: false, playerReportChunksRetrieved: 0 },
  searchScopes: [],
  recommendations: [],
  limitations: ["历史数据不能核实当前阵容。"],
  dataSource: "StatsBomb Open Data",
  datasetMode: "statsbomb",
};

const savedPlan: SavedRecruitmentPlan = {
  id: "plan-1",
  name: "Bayern striker",
  threadId: "case-1",
  originalBrief: "为拜仁寻找凯恩的替代者",
  messages: [
    { id: "message-1", role: "user", content: "为拜仁寻找凯恩的替代者", teamContext: "Bayern Munich" },
    { id: "message-2", role: "assistant", content: "你更看重即战力还是培养空间？", questionReason: "会改变年龄与样本取舍。" },
  ],
  lastReport: originalReport,
  lastReportedAt: "2026-09-01T10:00:00.000Z",
  hasConversationState: true,
  createdAt: "2026-09-01T09:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

test("saving a follow-up turn keeps the previous report until the next report is complete", () => {
  const nextMessages = [...savedPlan.messages, { id: "message-3", role: "user" as const, content: "更看重培养空间。" }];
  const result = upsertRecruitmentPlan([savedPlan], {
    id: savedPlan.id,
    name: savedPlan.name,
    threadId: savedPlan.threadId,
    originalBrief: savedPlan.originalBrief,
    messages: nextMessages,
    currentReport: null,
    currentReportedAt: null,
    hasConversationState: true,
    now: "2026-09-02T10:00:00.000Z",
  });

  assert.equal(result.plan.lastReport, originalReport);
  assert.equal(result.plan.lastReportedAt, savedPlan.lastReportedAt);
  assert.equal(result.plan.messages.at(-1)?.content, "更看重培养空间。");
});

test("a completed investigation replaces the saved report snapshot", () => {
  const nextReport = { ...originalReport, needSummary: "寻找能承担串联和终结任务的中锋。" };
  const result = upsertRecruitmentPlan([savedPlan], {
    id: savedPlan.id,
    name: "Bayern striker refresh",
    threadId: savedPlan.threadId,
    originalBrief: savedPlan.originalBrief,
    messages: savedPlan.messages,
    currentReport: nextReport,
    currentReportedAt: "2026-09-03T10:00:00.000Z",
    hasConversationState: true,
    now: "2026-09-03T10:00:00.000Z",
  });

  assert.equal(result.plan.lastReport, nextReport);
  assert.equal(result.plan.lastReportedAt, "2026-09-03T10:00:00.000Z");
  assert.equal(result.plan.name, "Bayern striker refresh");
});

test("local plans can round-trip through a storage adapter", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  saveRecruitmentPlans([savedPlan], storage);

  assert.deepEqual(loadRecruitmentPlans(storage), [savedPlan]);
});

test("version 1 one-shot plans migrate while keeping the prior analysis as a history snapshot", () => {
  const legacyAnalysis: ScoutResponse = {
    targetTeam: "Bayern Munich",
    requirements: {
      targetTeam: "Bayern Munich",
      position: "ST",
      inPossessionRoles: ["creation"],
      outOfPossessionRoles: ["pressing"],
      topK: 3,
      includeUnknownAge: false,
    },
    dataSource: "Demo data",
    datasetMode: "demo",
    candidates: [],
    review: { evidenceCompleteness: 1, evidenceCoverage: 1, findings: [], retryRecommended: false },
    caveats: ["虚构演示数据。"],
  };
  const values = new Map([[
    "tactiscout.recruitment-plans",
    JSON.stringify({ version: 1, plans: [{
      id: "old-plan",
      name: "Bayern striker",
      input: legacyAnalysis.requirements,
      originalBrief: "为拜仁寻找凯恩的替代者",
      lastAnalysis: legacyAnalysis,
      lastAnalyzedAt: "2026-09-01T10:00:00.000Z",
      createdAt: "2026-09-01T09:00:00.000Z",
      updatedAt: "2026-09-01T10:00:00.000Z",
    }] }),
  ]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  const [migrated] = loadRecruitmentPlans(storage);

  assert.equal(migrated.id, "old-plan");
  assert.equal(migrated.lastReport?.needSummary, "为拜仁寻找凯恩的替代者");
  assert.equal(migrated.lastReport?.limitations.some((item) => item.includes("历史快照")), true);
  assert.equal(migrated.hasConversationState, false);
  assert.equal(migrated.messages[0].content, "为拜仁寻找凯恩的替代者");
  assert.equal(JSON.parse(values.get("tactiscout.recruitment-plans") ?? "{}").version, 2);
  assert.deepEqual(JSON.parse(values.get("tactiscout.recruitment-plans") ?? "{}").plans[0], migrated);
});

test("a plan can be removed without affecting other saved plans", () => {
  assert.deepEqual(removeRecruitmentPlan([savedPlan], savedPlan.id), []);
});

test("corrupt local data is rejected without overwriting the original browser value", () => {
  const stored = JSON.stringify({ version: 2, plans: [{ id: "broken" }] });
  const values = new Map([["tactiscout.recruitment-plans", stored]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  assert.throws(() => loadRecruitmentPlans(storage), /本地招募计划无法读取/);
  assert.equal(storage.getItem("tactiscout.recruitment-plans"), stored);
});
