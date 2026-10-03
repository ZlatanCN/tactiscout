import { type RecruitmentAction, type RecruitmentPlanner } from "../../src/agent/conversation.js";
import { createApp } from "../../src/app.js";
import type { PlayerRepository } from "../../src/data/provider.js";
import type { PlayerProfile } from "../../src/domain/schemas.js";

const mode = process.argv[2];
const databasePath = process.argv[3];
const threadId = "restart-recovery-case";

if ((mode !== "pause" && mode !== "resume") || !databasePath) {
  throw new Error("Expected mode (pause|resume) and a checkpoint database path.");
}

const player: PlayerProfile = {
  playerId: "striker-a",
  name: "Jonas Vale",
  team: "Harbor City",
  age: 23,
  position: "ST",
  competition: "Open League",
  season: "2024/25",
  minutes: 2100,
  stats: {
    goals: 12,
    assists: 4,
    passesAttempted: 420,
    passesCompleted: 315,
    longPasses: 8,
    carries: 33,
    pressures: 160,
    tackles: 4,
    interceptions: 2,
    shotAssists: 18,
  },
  source: "Fixture data",
};

const repository: PlayerRepository = {
  mode: "demo",
  sourceName: "Checkpoint recovery fixture",
  async loadPlayers() { return [player]; },
};

const actions: RecruitmentAction[] = mode === "pause"
  ? [
      { action: "inspect_team", teamName: "Bayern Munich" },
      { action: "search_methodology", query: "中锋接班人的能力画像" },
      { action: "search_candidates", position: "ST", minimumMinutes: 0, limit: 10 },
  ]
  : [
      { action: "search_candidates", position: "ST", minimumMinutes: 0, limit: 10 },
      { action: "evaluate_candidates", playerIds: [player.playerId] },
      { action: "search_player_reports", query: "中锋终结观察", playerNames: [player.name] },
      {
        action: "finish",
        targetTeam: "Bayern Munich",
        needSummary: "为拜仁寻找中锋接班人。",
        capabilityProfile: ["禁区终结"],
        recommendations: [{ playerId: player.playerId, evidenceKeys: ["goals"] }],
        limitationKeys: [],
      },
    ];

const planner: RecruitmentPlanner = {
  async decide() {
    const action = actions.shift();
    if (!action) throw new Error(`No scripted action remains in ${mode} process.`);
    return action;
  },
};

const app = createApp({ playerRepository: repository, recruitmentPlanner: planner, checkpointPath: databasePath });

try {
  const response = await app.inject({
    method: "POST",
    url: `/api/v1/recruitment/cases/${threadId}/turns`,
    payload: mode === "pause"
      ? { message: "为拜仁寻找凯恩的替代者" }
      : { message: "按中锋职责，未来两三年接班，希望有主力潜质。", expectsExistingState: true },
  });
  console.log(`RESULT:${JSON.stringify({ statusCode: response.statusCode, body: response.json() })}`);
} finally {
  await app.close();
}
