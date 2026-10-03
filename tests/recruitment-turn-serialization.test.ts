import assert from "node:assert/strict";
import test from "node:test";
import { createRecruitmentConversation, type RecruitmentAction, type RecruitmentPlanner } from "../src/agent/conversation.js";
import type { PlayerRepository } from "../src/data/provider.js";

const repository: PlayerRepository = {
  mode: "demo",
  sourceName: "turn serialization test",
  async loadPlayers() { return []; },
};

test("turns for one recruitment case are processed one at a time", async () => {
  let decisionCount = 0;
  let activeDecisions = 0;
  let maximumActiveDecisions = 0;
  let signalFirstDecision!: () => void;
  const firstDecisionStarted = new Promise<void>((resolve) => { signalFirstDecision = resolve; });
  const actions: RecruitmentAction[] = [
    { action: "inspect_team", teamName: "Bayern Munich" },
    { action: "ask_user", question: "想优先即战力还是培养接班人？", reason: "两者会改变候选画像。" },
    {
      action: "finish",
      targetTeam: "Bayern Munich",
      needSummary: "已完成当前调查。",
      capabilityProfile: [],
      recommendations: [],
      limitationKeys: ["other"],
    },
  ];
  const planner: RecruitmentPlanner = {
    async decide() {
      decisionCount += 1;
      activeDecisions += 1;
      maximumActiveDecisions = Math.max(maximumActiveDecisions, activeDecisions);
      if (decisionCount === 1) signalFirstDecision();
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeDecisions -= 1;
      const action = actions.shift();
      assert.ok(action, "scripted planner action should be available");
      return action;
    },
  };

  const conversation = createRecruitmentConversation({ repository, planner });
  const firstTurn = conversation.turn({ threadId: "same-case", message: "为拜仁找凯恩的替代者" });
  await firstDecisionStarted;
  const secondTurn = conversation.turn({ threadId: "same-case", message: "更偏向培养接班人", expectsExistingState: true });
  const responses = await Promise.all([firstTurn, secondTurn]);

  assert.equal(maximumActiveDecisions, 1);
  assert.equal(responses[0]?.status, "needs_input");
  assert.equal(responses[1]?.status, "completed");
});

test("different recruitment cases can progress concurrently", async () => {
  let activeDecisions = 0;
  let maximumActiveDecisions = 0;
  const decisionCounts = new Map<string, number>();
  const planner: RecruitmentPlanner = {
    async decide({ history }) {
      const userMessage = history.find((entry) => entry.role === "user")?.content ?? "";
      const count = (decisionCounts.get(userMessage) ?? 0) + 1;
      decisionCounts.set(userMessage, count);
      activeDecisions += 1;
      maximumActiveDecisions = Math.max(maximumActiveDecisions, activeDecisions);
      await new Promise((resolve) => setTimeout(resolve, 20));
      activeDecisions -= 1;
      return count === 1
        ? { action: "inspect_team", teamName: userMessage }
        : { action: "ask_user", question: "需要进一步确认哪种角色？", reason: "角色差异会改变候选画像。" };
    },
  };
  const conversation = createRecruitmentConversation({ repository, planner });

  await Promise.all([
    conversation.turn({ threadId: "case-a", message: "team-a" }),
    conversation.turn({ threadId: "case-b", message: "team-b" }),
  ]);

  assert.ok(maximumActiveDecisions >= 2, "separate cases should not share one global lock");
});
