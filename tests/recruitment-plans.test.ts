import assert from "node:assert/strict";
import test from "node:test";
import {
  isAnalysisSnapshotStale,
  recordSuccessfulAnalysis,
  saveRecruitmentPlans,
  loadRecruitmentPlans,
  upsertRecruitmentPlan,
  type SavedRecruitmentPlan,
} from "../web/src/plans.js";
import type { ScoutInput, ScoutResponse } from "../src/domain/schemas.js";

const originalRequest: ScoutInput = {
  targetTeam: "Barcelona",
  position: "CM",
  inPossessionRoles: ["progression"],
  outOfPossessionRoles: ["pressing"],
  topK: 3,
  includeUnknownAge: false,
};

const originalAnalysis: ScoutResponse = {
  targetTeam: "Barcelona",
  requirements: originalRequest,
  dataSource: "Demo data",
  datasetMode: "demo",
  candidates: [],
  review: { evidenceCompleteness: 1, evidenceCoverage: 1, findings: [], retryRecommended: false },
  caveats: [],
};

const savedPlan: SavedRecruitmentPlan = {
  id: "plan-1",
  name: "Barcelona midfield",
  input: originalRequest,
  originalBrief: "Find a progressive midfielder",
  lastAnalysis: originalAnalysis,
  lastAnalyzedAt: "2026-09-01T10:00:00.000Z",
  createdAt: "2026-09-01T09:00:00.000Z",
  updatedAt: "2026-09-01T10:00:00.000Z",
};

test("编辑招募条件时保留旧分析快照并标记为过期", () => {
  const nextInput = { ...originalRequest, position: "CB" as const };
  const result = upsertRecruitmentPlan([savedPlan], {
    id: savedPlan.id,
    name: savedPlan.name,
    input: nextInput,
    originalBrief: "Find a left-sided centre back",
    currentAnalysis: savedPlan.lastAnalysis,
    currentAnalyzedAt: savedPlan.lastAnalyzedAt,
    now: "2026-09-02T10:00:00.000Z",
  });

  assert.equal(result.plan.lastAnalysis, originalAnalysis);
  assert.equal(result.plan.lastAnalyzedAt, savedPlan.lastAnalyzedAt);
  assert.equal(isAnalysisSnapshotStale(result.plan), true);
});

test("保存与当前需求相符的分析时一并保存快照", () => {
  const result = upsertRecruitmentPlan([], {
    id: "new-plan",
    name: "Barcelona midfield",
    input: originalRequest,
    originalBrief: "Find a progressive midfielder",
    currentAnalysis: originalAnalysis,
    currentAnalyzedAt: "2026-09-02T10:00:00.000Z",
    now: "2026-09-02T10:05:00.000Z",
  });

  assert.equal(result.isNew, true);
  assert.equal(result.analysisMatches, true);
  assert.equal(result.plan.lastAnalysis, originalAnalysis);
  assert.equal(result.plan.lastAnalyzedAt, "2026-09-02T10:00:00.000Z");
});

test("重新分析成功后替换计划的分析快照", () => {
  const nextRequest = { ...originalRequest, position: "CB" as const };
  const nextAnalysis: ScoutResponse = {
    ...originalAnalysis,
    requirements: nextRequest,
    dataSource: "Refreshed demo data",
  };
  const analyzedAt = "2026-09-03T10:00:00.000Z";
  const [updated] = recordSuccessfulAnalysis([savedPlan], {
    id: savedPlan.id,
    name: savedPlan.name,
    request: nextRequest,
    originalBrief: "Find a left-sided centre back",
    analysis: nextAnalysis,
    analyzedAt,
  });

  assert.equal(updated.input.position, "CB");
  assert.equal(updated.lastAnalysis, nextAnalysis);
  assert.equal(updated.lastAnalyzedAt, analyzedAt);
  assert.equal(isAnalysisSnapshotStale(updated), false);
});

test("招募计划可以通过替代存储保存并重新加载", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  saveRecruitmentPlans([savedPlan], storage);

  assert.deepEqual(loadRecruitmentPlans(storage), [savedPlan]);
});

test("本地计划记录损坏时拒绝加载且保留浏览器中的原始内容", () => {
  const stored = JSON.stringify({ version: 1, plans: [{ id: "broken" }] });
  const values = new Map([["tactiscout.recruitment-plans", stored]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };

  assert.throws(() => loadRecruitmentPlans(storage), /本地招募计划无法读取/);
  assert.equal(storage.getItem("tactiscout.recruitment-plans"), stored);
});
