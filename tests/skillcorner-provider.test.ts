import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  createRecruitmentConversation,
  type RecruitmentAction,
  type RecruitmentPlanner,
} from "../src/agent/conversation.js";
import { CapabilityMetricDefinitions } from "../src/domain/schemas.js";
import { SkillCornerPlayerRepository, SkillCornerProviderError } from "../src/data/skillcorner-provider.js";

function csv(headers: string[], values: Record<string, string>, bom = false): string {
  const encode = (value: string) => /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
  return `${bom ? "\uFEFF" : ""}${headers.map(encode).join(",")}\r\n${headers.map((header) => encode(values[header] ?? "")).join(",")}\r\n`;
}

const identity = {
  player_id: "1001",
  team_id: "2001",
  competition_id: "61",
  season_id: "95",
  player_name: "Mara, Test",
  team_name: "Sample Club",
  competition_name: "AUS - A-League",
  season_name: "2024/2025",
  position_group: "Full Back",
  player_birthdate: "2004-05-06",
};

const physicalHeaders = [...Object.keys(identity), "minutes_full_all", "count_match", "hi_distance_full_all", "sprint_distance_full_all", "hi_count_full_all"];
const physicalValues = { ...identity, minutes_full_all: "45", count_match: "10", hi_distance_full_all: "500", sprint_distance_full_all: "", hi_count_full_all: "10" };
const passingHeaders = [...Object.keys(identity), "minutes", "performance_included_count", "pass_count_linebreak_completed_p30tip", "pass_pct_torun_completed"];
const passingValues = { ...identity, minutes: "60", performance_included_count: "8", pass_count_linebreak_completed_p30tip: "2.5", pass_pct_torun_completed: "75" };
const offBallHeaders = [...Object.keys(identity), "minutes", "performance_included_count", "behindrun_count_p30tip", "overlaprun_count_p30tip"];
const offBallValues = { ...identity, minutes: "75", performance_included_count: "8", behindrun_count_p30tip: "4.5", overlaprun_count_p30tip: "1.25" };

async function writeAggregateFiles(
  aggregatesDirectory: string,
  options: {
    physicalBom?: boolean;
    duplicatePhysical?: boolean;
    mutatePhysical?: (content: string) => string;
    mutatePassing?: (content: string) => string;
  } = {},
): Promise<void> {
  const physicalFile = "aus1league_physicalaggregates_20242025.csv";
  const passingFile = "aus1league_passingaggregates_20242025.csv";
  const offBallFile = "aus1league_obraggregates_20242025.csv";
  let physical = csv(physicalHeaders, physicalValues, options.physicalBom);
  if (options.duplicatePhysical) physical += physical.slice(physical.indexOf("\n") + 1);
  await Promise.all([
    writeFile(path.join(aggregatesDirectory, physicalFile), options.mutatePhysical?.(physical) ?? physical),
    writeFile(path.join(aggregatesDirectory, passingFile), options.mutatePassing?.(csv(passingHeaders, passingValues)) ?? csv(passingHeaders, passingValues)),
    writeFile(path.join(aggregatesDirectory, offBallFile), csv(offBallHeaders, offBallValues)),
  ]);
}

function makeRepository(aggregatesDirectory: string): SkillCornerPlayerRepository {
  return new SkillCornerPlayerRepository({
    aggregatesDirectory,
    allowLocalStorage: true,
    allowModelProcessing: true,
    allowReportDisplay: true,
    now: () => new Date("2026-10-04T00:00:00.000Z"),
  });
}

test("SkillCorner repository reads BOM CSVs, preserves quoted names and normalizes physical metrics", async () => {
  const aggregatesDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-skillcorner-"));
  try {
    await writeAggregateFiles(aggregatesDirectory, { physicalBom: true });
    const repository = makeRepository(aggregatesDirectory);

    const [player] = await repository.loadPlayers();

    assert.ok(player);
    assert.equal(player.name, "Mara, Test");
    assert.equal(player.position, "DEF");
    assert.equal(player.age, 22);
    assert.equal(player.minutes, 450);
    assert.equal(player.sourceIdentity?.positionGroup, "Full Back");
    assert.equal(player.sourceIdentity?.isCurrentSeason, false);
    assert.deepEqual(player.availableStats, []);
    assert.equal(player.supplementaryMetrics?.find(({ key }) => key === "highIntensityDistancePer90")?.value, 1000);
    assert.equal(player.supplementaryMetrics?.find(({ key }) => key === "highIntensityDistancePer90")?.sampleMatches, 10);
    assert.equal(player.supplementaryMetrics?.find(({ key }) => key === "sprintDistancePer90")?.value, null);
    assert.equal(player.supplementaryMetrics?.find(({ key }) => key === "behindRunsPer30Tip")?.value, 4.5);
    assert.equal(player.supplementaryMetrics?.find(({ key }) => key === "lineBreakPassesCompletedPer30Tip")?.value, 2.5);
    assert.equal(player.supplementaryMetrics?.find(({ key }) => key === "passesToRunsCompletionPct")?.value, 75);
  } finally {
    await rm(aggregatesDirectory, { recursive: true, force: true });
  }
});

test("SkillCorner repository rejects malformed quoted cells instead of altering provider IDs", async () => {
  const aggregatesDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-skillcorner-"));
  try {
    await writeAggregateFiles(aggregatesDirectory, {
      mutatePhysical: (content) => content.replace("1001,2001", '"1001"x,2001'),
    });

    await assert.rejects(makeRepository(aggregatesDirectory).loadPlayers(), (error: unknown) =>
      error instanceof SkillCornerProviderError && error.code === "invalid_csv",
    );
  } finally {
    await rm(aggregatesDirectory, { recursive: true, force: true });
  }
});

test("SkillCorner mode requires each data-use permission independently", () => {
  const options = {
    aggregatesDirectory: "/unused",
    allowLocalStorage: true,
    allowModelProcessing: true,
    allowReportDisplay: true,
  };
  for (const permission of ["allowLocalStorage", "allowModelProcessing", "allowReportDisplay"] as const) {
    assert.throws(
      () => new SkillCornerPlayerRepository({ ...options, [permission]: false }),
      (error: unknown) => error instanceof SkillCornerProviderError && error.code === "invalid_configuration",
      `${permission} must be opted into separately`,
    );
  }
});

test("SkillCorner repository reports a missing aggregate file clearly", async () => {
  const aggregatesDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-skillcorner-"));
  try {
    await writeAggregateFiles(aggregatesDirectory);
    await rm(path.join(aggregatesDirectory, "aus1league_physicalaggregates_20242025.csv"));

    await assert.rejects(makeRepository(aggregatesDirectory).loadPlayers(), (error: unknown) =>
      error instanceof SkillCornerProviderError && error.code === "missing_file",
    );
  } finally {
    await rm(aggregatesDirectory, { recursive: true, force: true });
  }
});

test("SkillCorner repository rejects duplicate records and identity conflicts across aggregate files", async () => {
  const duplicateDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-skillcorner-"));
  const conflictDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-skillcorner-"));
  try {
    await writeAggregateFiles(duplicateDirectory, { duplicatePhysical: true });
    await writeAggregateFiles(conflictDirectory, {
      mutatePassing: (content) => content.replace("Mara, Test", "Different Name"),
    });

    await assert.rejects(makeRepository(duplicateDirectory).loadPlayers(), (error: unknown) =>
      error instanceof SkillCornerProviderError && error.code === "incompatible_rows",
    );
    await assert.rejects(makeRepository(conflictDirectory).loadPlayers(), (error: unknown) =>
      error instanceof SkillCornerProviderError && error.code === "incompatible_rows",
    );
  } finally {
    await Promise.all([
      rm(duplicateDirectory, { recursive: true, force: true }),
      rm(conflictDirectory, { recursive: true, force: true }),
    ]);
  }
});

test("SkillCorner aggregate rows join by provider identity instead of player name", async () => {
  const aggregatesDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-skillcorner-"));
  try {
    await writeAggregateFiles(aggregatesDirectory, {
      mutatePassing: (content) => content.replace("1001,2001", "1002,2001"),
    });

    const players = await makeRepository(aggregatesDirectory).loadPlayers();
    const physicalAndOffBallPlayer = players.find(({ externalPlayerId }) => externalPlayerId === "1001");
    const passingOnlyPlayer = players.find(({ externalPlayerId }) => externalPlayerId === "1002");

    assert.equal(players.length, 2);
    assert.equal(physicalAndOffBallPlayer?.name, "Mara, Test");
    assert.equal(physicalAndOffBallPlayer?.supplementaryMetrics?.find(({ key }) => key === "highIntensityDistancePer90")?.value, 1000);
    assert.equal(physicalAndOffBallPlayer?.supplementaryMetrics?.find(({ key }) => key === "lineBreakPassesCompletedPer30Tip")?.value, null);
    assert.equal(passingOnlyPlayer?.name, "Mara, Test");
    assert.equal(passingOnlyPlayer?.supplementaryMetrics?.find(({ key }) => key === "lineBreakPassesCompletedPer30Tip")?.value, 2.5);
    assert.equal(passingOnlyPlayer?.supplementaryMetrics?.find(({ key }) => key === "highIntensityDistancePer90")?.value, null);
  } finally {
    await rm(aggregatesDirectory, { recursive: true, force: true });
  }
});

test("SkillCorner performance evidence reaches the report without inventing unavailable event stats", async () => {
  const aggregatesDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-skillcorner-"));
  try {
    await writeAggregateFiles(aggregatesDirectory);
    const repository = makeRepository(aggregatesDirectory);
    const playerId = "skillcorner:1001:2001:61:95:Full Back";
    const actions: RecruitmentAction[] = [
      { action: "search_methodology", query: "边后卫表现指标" },
      { action: "search_candidates", position: "DEF", minimumMinutes: 0, limit: 10 },
      { action: "evaluate_candidates", playerIds: [playerId] },
      { action: "search_player_reports", query: "边后卫报告", playerNames: ["Mara, Test"] },
      {
        action: "finish",
        targetTeam: "Sample Club",
        needSummary: "评估边后卫的可观察比赛表现。",
        capabilityProfile: ["推进和无球跑动"],
        recommendations: [{ playerId, evidenceKeys: ["highIntensityDistancePer90"] }],
        limitationKeys: [],
      },
    ];
    let evaluationMetrics: Array<Record<string, unknown>> = [];
    const planner: RecruitmentPlanner = {
      async decide({ history }) {
        const evaluation = history.filter((entry) => entry.role === "tool" && entry.toolName === "evaluate_candidates").at(-1);
        if (evaluation) {
          evaluationMetrics = (JSON.parse(evaluation.content) as {
            evaluations: Array<{ metrics: Array<Record<string, unknown>> }>;
          }).evaluations[0]?.metrics ?? [];
        }
        const action = actions.shift();
        assert.ok(action, "the investigation should finish with its scripted evidence path");
        return action;
      },
    };
    const conversation = createRecruitmentConversation({
      repository,
      planner,
      knowledgeBase: { async search() { return []; } },
    });

    const response = await conversation.turn({ threadId: "skillcorner-evidence-path", message: "为 Sample Club 找一名边后卫" });

    assert.equal(response.status, "completed");
    assert.deepEqual(response.report?.recommendations[0]?.focusEvidenceKeys, ["highIntensityDistancePer90"]);
    assert.equal(response.report?.recommendations[0]?.evidence.length, 6);
    assert.equal(response.report?.recommendations[0]?.evidence[0]?.key, "highIntensityDistancePer90");
    assert.equal(response.report?.recommendations[0]?.evidence.some(({ key }) =>
      CapabilityMetricDefinitions.some((definition) => definition.key === key),
    ), false);
    assert.ok(evaluationMetrics.some((metric) => metric.key === "highIntensityDistancePer90"
      && metric.value === 1000
      && metric.sampleMatches === 10
      && metric.sourceField === "hi_distance_full_all"));
    assert.equal(evaluationMetrics.some((metric) => metric.key === "goals"), false);
    assert.equal(evaluationMetrics.some((metric) => metric.key === "sprintDistancePer90"), false);
  } finally {
    await rm(aggregatesDirectory, { recursive: true, force: true });
  }
});
