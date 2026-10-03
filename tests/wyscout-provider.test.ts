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
import { assessRoles, toPer90 } from "../src/agent/scoring.js";
import { createRepository } from "../src/data/provider.js";
import { RequirementsSchema } from "../src/domain/schemas.js";
import { WyscoutPlayerRepository, WyscoutProviderError } from "../src/data/wyscout-provider.js";

const playerRows = [
  { wyId: 101, firstName: "Ari", lastName: "Sample", shortName2: "A. Sample", role: { name: "Defender" }, birthDate: "1997-07-10", currentTeamId: 10 },
  { wyId: 102, firstName: "Bea", lastName: "Sample", role: { name: "Forward" }, birthDate: "1999-02-01", currentTeamId: 10 },
  { wyId: 201, firstName: "Ari", lastName: "Sample", shortName2: "A. Sample", role: { name: "Midfielder" }, birthDate: "1996-01-01", currentTeamId: 20 },
  { wyId: 202, firstName: "Casey", lastName: "Keeper", role: { name: "Goalkeeper" }, birthDate: "1998-01-01", currentTeamId: 20 },
];

const matchRows = [
  {
    wyId: 1,
    competitionId: 1,
    dateutc: "2017-08-20 15:00:00",
    duration: "Regular",
    teamsData: {
      "10": {
        teamId: 10,
        hasFormation: 1,
        formation: {
          lineup: [{ playerId: 101 }],
          bench: [{ playerId: 102 }],
          substitutions: [{ playerIn: { id: 102 }, playerOut: { id: 101 }, minute: 60 }],
        },
      },
      "20": { teamId: 20, hasFormation: 1, formation: { lineup: [{ playerId: 201 }], bench: [], substitutions: "null" } },
    },
  },
  {
    wyId: 2,
    competitionId: 1,
    dateutc: "2017-08-27 15:00:00",
    duration: "Regular",
    teamsData: {
      "10": { teamId: 10, hasFormation: 1, formation: { lineup: [{ playerId: 101 }], bench: [{ playerId: 102 }], substitutions: [{ playerIn: { id: 102 }, playerOut: { id: 101 }, minute: "90+2" }] } },
      "20": { teamId: 20, hasFormation: 1, formation: { lineup: [{ playerId: 202 }], bench: [], substitutions: [{ playerIn: 0, playerOut: 202, minute: 30 }] } },
    },
  },
  {
    wyId: 3,
    competitionId: 99,
    dateutc: "2018-06-15 15:00:00",
    duration: "Regular",
    teamsData: {
      "10": { teamId: 10, hasFormation: 1, formation: { lineup: [{ playerId: 101 }], bench: [], substitutions: [] } },
      "99": { teamId: 99, hasFormation: 1, formation: { lineup: [], bench: [], substitutions: [] } },
    },
  },
];

const eventRows = [
  { id: 1, matchId: 1, teamId: 10, playerId: 101, eventName: "Pass", subEventName: "Simple pass", matchPeriod: "1H", eventSec: 2, description: "quoted } brace and \\\"text\\\"", tags: [{ id: 1801 }, { id: 302 }] },
  { id: 2, matchId: 1, teamId: 10, playerId: 101, eventName: "Pass", subEventName: "Simple pass", matchPeriod: "1H", eventSec: 5, tags: [{ id: 1802 }] },
  { id: 3, matchId: 1, teamId: 10, playerId: 101, eventName: "Pass", subEventName: "Simple pass", matchPeriod: "2H", eventSec: 3, tags: [{ id: 1801 }, { id: 301 }] },
  { id: 4, matchId: 1, teamId: 10, playerId: 101, eventName: "Shot", subEventName: "Shot", matchPeriod: "2H", eventSec: 9, tags: [{ id: 101 }] },
  { id: 5, matchId: 1, teamId: 10, playerId: 102, eventName: "Pass", subEventName: "Simple pass", matchPeriod: "2H", eventSec: 12, tags: [{ id: 1801 }] },
  { id: 6, matchId: 1, teamId: 20, playerId: 201, eventName: "Pass", subEventName: "Simple pass", matchPeriod: "1H", eventSec: 4, tags: [{ id: 1801 }] },
  { id: 7, matchId: 2, teamId: 10, playerId: 101, eventName: "Pass", subEventName: "Simple pass", matchPeriod: "1H", eventSec: 8, tags: [{ id: 1801 }] },
  { id: 8, matchId: 3, teamId: 10, playerId: 101, eventName: "Shot", subEventName: "Shot", matchPeriod: "1H", eventSec: 8, tags: [{ id: 101 }] },
  { id: 9, matchId: 1, teamId: 10, playerId: 101, eventName: "Free kick", subEventName: "Free kick cross", matchPeriod: "2H", eventSec: 14, tags: [{ id: 302 }] },
  { id: 10, matchId: 1, teamId: 10, playerId: 0, eventName: "Duel", subEventName: "Ground attacking duel", matchPeriod: "2H", eventSec: 15, tags: [] },
];

async function writeFixture(dataDirectory: string, options: { omitEvents?: boolean; malformedEvents?: boolean; mismatchedEventTeam?: boolean; unselectedMalformedEvents?: boolean } = {}): Promise<void> {
  await Promise.all([
    writeFile(path.join(dataDirectory, "competitions.json"), JSON.stringify([
      { wyId: 1, name: "English first division", type: "club", format: "Domestic league" },
      { wyId: 99, name: "World cup 2018", type: "international", format: "International cup" },
    ])),
    writeFile(path.join(dataDirectory, "teams.json"), JSON.stringify([
      { wyId: 10, name: "Synthetic Club" },
      { wyId: 20, name: "Second Synthetic Club" },
      { wyId: 99, name: "Synthetic National Team" },
    ])),
    writeFile(path.join(dataDirectory, "players.json"), JSON.stringify(playerRows)),
    writeFile(path.join(dataDirectory, "matches_England.json"), JSON.stringify(matchRows)),
  ]);
  if (!options.omitEvents) {
    await writeFile(
      path.join(dataDirectory, "events_England.json"),
      options.malformedEvents
        ? "[{\"id\":1,\"matchId\":1,\"teamId\":10,\"playerId\":101,\"eventName\":\"Pass\",\"tags\":[]},]"
        : JSON.stringify(options.mismatchedEventTeam
          ? [...eventRows, { id: 11, matchId: 1, teamId: 99, playerId: 101, eventName: "Pass", tags: [{ id: 1801 }] }]
          : eventRows),
    );
  }
  if (options.unselectedMalformedEvents) {
    await writeFile(path.join(dataDirectory, "events_World_Cup.json"), "this file belongs to an excluded competition");
  }
}

function makeRepository(dataDirectory: string, allowModelProcessing = true, competitionIds?: string[]): WyscoutPlayerRepository {
  return new WyscoutPlayerRepository({ dataDirectory, allowModelProcessing, competitionIds });
}

test("Wyscout repository streams local event JSON and maps only source-supported league evidence", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-"));
  try {
    await writeFixture(dataDirectory, { unselectedMalformedEvents: true });

    const players = await makeRepository(dataDirectory).loadPlayers();
    const ariAtSyntheticClub = players.find(({ externalPlayerId, team }) => externalPlayerId === "101" && team === "Synthetic Club");
    const ariAtOtherClub = players.find(({ externalPlayerId, team }) => externalPlayerId === "201" && team === "Second Synthetic Club");

    assert.equal(players.length, 4);
    assert.ok(ariAtSyntheticClub);
    assert.equal(ariAtSyntheticClub.name, "Ari Sample");
    assert.equal(ariAtSyntheticClub.position, "DEF");
    assert.equal(ariAtSyntheticClub.age, 20);
    assert.equal(ariAtSyntheticClub.ageVerifiedAt, "2018-06-30");
    assert.equal(ariAtSyntheticClub.season, "2017/18");
    assert.equal(ariAtSyntheticClub.minutes, 150);
    assert.equal(ariAtSyntheticClub.stats.goals, 1);
    assert.equal(ariAtSyntheticClub.stats.assists, 1);
    assert.equal(ariAtSyntheticClub.stats.passesAttempted, 4);
    assert.equal(ariAtSyntheticClub.stats.passesCompleted, 3);
    assert.equal(ariAtSyntheticClub.stats.shotAssists, 0);
    assert.equal(ariAtSyntheticClub.stats.keyPasses, 2);
    assert.deepEqual(ariAtSyntheticClub.availableStats, ["goals", "assists", "passesAttempted", "passesCompleted", "keyPasses"]);
    assert.equal(toPer90(ariAtSyntheticClub).shotAssists, null);
    assert.equal(toPer90(ariAtSyntheticClub).keyPasses, 1.2);
    const creationRole = assessRoles(RequirementsSchema.parse({
      targetTeam: "Synthetic Club",
      position: "DEF",
      inPossessionRoles: ["creation"],
      outOfPossessionRoles: [],
    }), ariAtSyntheticClub)[0];
    assert.equal(creationRole?.fit, 16.8, "creation heuristics should use key passes and assists without inventing shot assists");
    assert.equal(ariAtSyntheticClub.sourceIdentity?.provider, "wyscout-open-data");
    assert.equal(ariAtSyntheticClub.sourceIdentity?.playerId, "101");
    assert.equal(ariAtSyntheticClub.sourceIdentity?.isCurrentSeason, false);
    assert.match(ariAtSyntheticClub.source, /CC BY 4\.0/);
    assert.ok(ariAtOtherClub);
    assert.equal(ariAtOtherClub.position, "MID");
    assert.equal(ariAtOtherClub.name, ariAtSyntheticClub.name);
    assert.notEqual(ariAtOtherClub.playerId, ariAtSyntheticClub.playerId);
    const goalkeeper = players.find(({ externalPlayerId }) => externalPlayerId === "202");
    assert.ok(goalkeeper);
    assert.equal(goalkeeper.minutes, 30, "an unassigned incoming ID should still retain the known outgoing player's minutes");
    assert.equal(goalkeeper.eventDataComplete, true, "match event availability should not require the player to have a linked event");
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Wyscout rejects events whose known team did not participate in the referenced match", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-team-match-"));
  try {
    await writeFixture(dataDirectory, { mismatchedEventTeam: true });

    await assert.rejects(
      makeRepository(dataDirectory).loadPlayers(),
      (error: unknown) => error instanceof WyscoutProviderError
        && error.code === "invalid_source_data"
        && /team ID 99, which did not participate in match 1/.test(error.message),
    );
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Wyscout repository is selected by environment and model processing requires explicit opt-in", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-config-"));
  const names = [
    "TACTISCOUT_DATA_MODE",
    "TACTISCOUT_WYSCOUT_DIR",
    "TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED",
    "TACTISCOUT_WYSCOUT_COMPETITION_IDS",
  ] as const;
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    process.env.TACTISCOUT_DATA_MODE = "wyscout";
    process.env.TACTISCOUT_WYSCOUT_DIR = dataDirectory;
    process.env.TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED = "false";
    process.env.TACTISCOUT_WYSCOUT_COMPETITION_IDS = "1,2";
    assert.throws(() => createRepository(), (error: unknown) =>
      error instanceof WyscoutProviderError && error.code === "invalid_configuration",
    );

    process.env.TACTISCOUT_WYSCOUT_AI_PROCESSING_ALLOWED = "true";
    await writeFixture(dataDirectory);
    const repository = createRepository();
    assert.equal(repository.mode, "wyscout");
    assert.equal((await repository.loadPlayers()).length, 4, "the configured local data directory should be used");
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
    for (const name of names) {
      const value = previous[name];
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("Wyscout model processing is disabled until the operator opts in", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-"));
  try {
    await assert.rejects(
      async () => new WyscoutPlayerRepository({ dataDirectory, allowModelProcessing: false }),
      (error: unknown) => error instanceof WyscoutProviderError && error.code === "invalid_configuration",
    );
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("Wyscout repository distinguishes missing and malformed event files from an empty pool", async () => {
  const missingDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-"));
  const malformedDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-"));
  const validEmptyDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-"));
  try {
    await writeFixture(missingDirectory, { omitEvents: true });
    await writeFixture(malformedDirectory, { malformedEvents: true });
    await writeFixture(validEmptyDirectory);

    await assert.rejects(makeRepository(missingDirectory).loadPlayers(), (error: unknown) =>
      error instanceof WyscoutProviderError && error.code === "missing_file",
    );
    await assert.rejects(makeRepository(malformedDirectory).loadPlayers(), (error: unknown) =>
      error instanceof WyscoutProviderError && error.code === "invalid_json",
    );
    assert.deepEqual(await makeRepository(validEmptyDirectory, true, ["unknown-competition"]).loadPlayers(), []);
  } finally {
    await Promise.all([
      rm(missingDirectory, { recursive: true, force: true }),
      rm(malformedDirectory, { recursive: true, force: true }),
      rm(validEmptyDirectory, { recursive: true, force: true }),
    ]);
  }
});

test("Wyscout evidence is available to the LangGraph investigation with historical caveats", async () => {
  const dataDirectory = await mkdtemp(path.join(os.tmpdir(), "tactiscout-wyscout-"));
  try {
    await writeFixture(dataDirectory);
    const repository = makeRepository(dataDirectory);
    const playerId = "wyscout:101:team:10:competition:1:season:2017/18";
    const actions: RecruitmentAction[] = [
      { action: "search_methodology", query: "边后卫传球与进攻表现" },
      { action: "search_candidates", position: "DEF", minimumMinutes: 0, limit: 10 },
      { action: "evaluate_candidates", playerIds: [playerId] },
      { action: "search_player_reports", query: "Ari Sample 球探报告", playerNames: ["Ari Sample"] },
      {
        action: "finish",
        targetTeam: "Current Synthetic Club",
        needSummary: "比较边后卫的历史比赛证据。",
        capabilityProfile: ["传球与进攻参与"],
        recommendations: [{ playerId, evidenceKeys: ["goals"] }],
        limitationKeys: [],
      },
    ];
    const planner: RecruitmentPlanner = {
      async decide() {
        const action = actions.shift();
        assert.ok(action, "the case should finish after the scripted evidence path");
        return action;
      },
    };
    const conversation = createRecruitmentConversation({
      repository,
      planner,
      knowledgeBase: { async search() { return []; } },
    });

    const response = await conversation.turn({ threadId: "wyscout-history", message: "为 Current Synthetic Club 找一个边后卫" });

    assert.equal(response.status, "completed");
    assert.equal(response.report?.recommendations[0]?.player.name, "Ari Sample");
    assert.equal(response.report?.recommendations[0]?.player.age, 20);
    assert.equal(response.report?.recommendations[0]?.player.sourceIdentity?.isCurrentSeason, false);
    assert.ok(response.report?.recommendations[0]?.player.source.includes("2017/18"));
    assert.ok(response.report?.limitations.some((item) => /2017\/18.*历史/.test(item)));
    assert.ok(response.report?.limitations.some((item) => /不是现役球员池/.test(item)));
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
