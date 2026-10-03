import assert from "node:assert/strict";
import test from "node:test";
import { createApp } from "../src/app.js";
import { unavailableRecruitmentConversation } from "../src/agent/conversation.js";
import type { PlayerRepository } from "../src/data/provider.js";

test("app routes share the injected player and knowledge repositories", async () => {
  let playerReads = 0;
  let knowledgeStatusReads = 0;
  const playerRepository: PlayerRepository = {
    mode: "statsbomb",
    sourceName: "Injected StatsBomb fixture",
    async loadPlayers() {
      playerReads += 1;
      return [];
    },
  };
  const knowledgeBase = {
    async search() { return []; },
    async status() {
      knowledgeStatusReads += 1;
      return {
        indexedChunks: 0,
        methodologyChunks: 0,
        playerReportChunks: 0,
        registeredSources: 5,
        ingestiblePlayerReportSources: 2,
        embeddingModel: "injected-embedding",
        indexPath: "/injected/knowledge-index",
      };
    },
  };
  const app = createApp({
    playerRepository,
    knowledgeBase,
    recruitmentConversation: unavailableRecruitmentConversation(),
  });

  try {
    const dataset = await app.inject({ method: "GET", url: "/api/v1/dataset" });
    assert.deepEqual(dataset.json(), { mode: "statsbomb", source: "Injected StatsBomb fixture" });

    const knowledgeStatus = await app.inject({ method: "GET", url: "/api/v1/knowledge/status" });
    assert.equal(knowledgeStatus.json().registeredSources, 5);
    assert.equal(knowledgeStatus.json().indexPath, "/injected/knowledge-index");
    assert.equal(knowledgeStatusReads, 1);

    const scouting = await app.inject({
      method: "POST",
      url: "/api/v1/scout",
      payload: {
        targetTeam: "Barcelona",
        position: "CM",
        inPossessionRoles: ["progression"],
        outOfPossessionRoles: [],
        topK: 3,
        includeUnknownAge: false,
      },
    });
    assert.equal(scouting.statusCode, 200);
    assert.equal(scouting.json().dataSource, "Injected StatsBomb fixture");
    assert.equal(scouting.json().datasetMode, "statsbomb");
    assert.ok(playerReads > 0);
  } finally {
    await app.close();
  }
});
