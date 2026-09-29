import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { StatsBombRepository } from "../src/data/provider.js";

test("StatsBomb records mark missing or empty event files as incomplete instead of treating their zero stats as measured", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "tactiscout-statsbomb-coverage-"));
  const dataRoot = path.join(tempRoot, "data");
  const previousRoot = process.env.TACTISCOUT_STATSBOMB_DIR;
  try {
    await mkdir(path.join(dataRoot, "matches", "11", "90"), { recursive: true });
    await mkdir(path.join(dataRoot, "lineups"), { recursive: true });
    await mkdir(path.join(dataRoot, "events"), { recursive: true });
    await writeFile(path.join(dataRoot, "competitions.json"), JSON.stringify([
      { competition_id: 11, competition_name: "Open League" },
    ]));
    await writeFile(path.join(dataRoot, "matches", "11", "90", "100.json"), JSON.stringify([
      { match_id: 100, competition: { competition_id: 11 }, season: { season_id: 90, season_name: "2025/26" } },
      { match_id: 101, competition: { competition_id: 11 }, season: { season_id: 90, season_name: "2025/26" } },
      { match_id: 102, competition: { competition_id: 11 }, season: { season_id: 90, season_name: "2025/26" } },
    ]));
    const lineup = (playerId: number, playerName: string) => [{
      team_name: "Harbor City",
      lineup: [{
        player_id: playerId,
        player_name: playerName,
        positions: [{ position: { name: "Centre Forward" }, from: "00:00", to: "90:00" }],
      }],
    }];
    await writeFile(path.join(dataRoot, "lineups", "100.json"), JSON.stringify(lineup(1, "Missing Events Player")));
    await writeFile(path.join(dataRoot, "lineups", "101.json"), JSON.stringify(lineup(2, "Complete Empty Events Player")));
    await writeFile(path.join(dataRoot, "lineups", "102.json"), JSON.stringify(lineup(3, "Available Events Player")));
    await writeFile(path.join(dataRoot, "events", "101.json"), JSON.stringify([]));
    await writeFile(path.join(dataRoot, "events", "102.json"), JSON.stringify([{ type: { name: "Half Start" } }]));
    process.env.TACTISCOUT_STATSBOMB_DIR = tempRoot;

    const players = await new StatsBombRepository().loadPlayers();
    const missingEvents = players.find((player) => player.externalPlayerId === "1");
    const emptyEvents = players.find((player) => player.externalPlayerId === "2");
    const availableEvents = players.find((player) => player.externalPlayerId === "3");

    assert.equal(missingEvents?.eventDataComplete, false);
    assert.equal(missingEvents?.minutes, 90);
    assert.equal(missingEvents?.stats.goals, 0);
    assert.equal(emptyEvents?.eventDataComplete, false);
    assert.equal(availableEvents?.eventDataComplete, true);
  } finally {
    if (previousRoot === undefined) delete process.env.TACTISCOUT_STATSBOMB_DIR;
    else process.env.TACTISCOUT_STATSBOMB_DIR = previousRoot;
    await rm(tempRoot, { recursive: true, force: true });
  }
});
