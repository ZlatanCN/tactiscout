import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { unavailableRecruitmentConversation } from "../src/agent/conversation.js";
import { createApp } from "../src/app.js";
import type { KnowledgeDocumentInput } from "../src/knowledge/schemas.js";

const input = {
  playerName: "Theo Example",
  playerAliases: [],
  playerIdentityProvider: null,
  externalPlayerId: null,
  competition: "Bundesliga",
  season: "2025/26",
  match: "Bayern vs Example FC",
  observedAt: "2026-10-04",
  matchMinute: 63,
  observer: "Alex Scout",
  strengths: ["接球后能向前推进。"],
  risks: [],
  evidenceNote: "第 63 分钟，他在右侧肋部接球后越过第一道逼抢，并把球安全地转移到弱侧空当。",
  sourceReferenceUrl: "https://example.test/match-report",
  allowPersistentStorage: true,
  allowAiProcessing: false,
};

test("Fastify exposes an authorized local observation lifecycle and indexes only opted-in notes", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tactiscout-observation-api-"));
  const indexed: KnowledgeDocumentInput[] = [];
  const removed: string[] = [];
  const app = createApp({
    playerObservationsPath: path.join(root, "observations.json"),
    knowledgeBase: {
      async search() { return []; },
      async ingest(document) {
        indexed.push(document);
        return { documentId: `doc-${indexed.length}`, chunkCount: 1 };
      },
      async removeDocument(documentId) { removed.push(documentId); return 1; },
      async purgeSourceData() { return 0; },
      async status() {
        return {
          indexedChunks: 0,
          methodologyChunks: 0,
          playerReportChunks: 0,
          registeredSources: 2,
          ingestiblePlayerReportSources: 1,
          embeddingModel: "injected-embedding",
          indexPath: "/injected/knowledge-index",
        };
      },
    },
    recruitmentConversation: unavailableRecruitmentConversation(),
  });

  try {
    const crossSiteRead = await app.inject({
      method: "GET",
      url: "/api/v1/player-observations",
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
      },
    });
    assert.equal(crossSiteRead.statusCode, 403);

    const reboundHost = await app.inject({
      method: "GET",
      url: "/api/v1/player-observations",
      headers: { host: "attacker.example" },
    });
    assert.equal(reboundHost.statusCode, 403);

    const localOrigin = await app.inject({
      method: "GET",
      url: "/api/v1/player-observations",
      headers: {
        host: "localhost:5173",
        origin: "http://localhost:5173",
        "sec-fetch-site": "same-origin",
      },
    });
    assert.equal(localOrigin.statusCode, 200);

    const empty = await app.inject({ method: "GET", url: "/api/v1/player-observations" });
    assert.deepEqual(empty.json(), []);

    const withoutStorageConsent = await app.inject({
      method: "POST",
      url: "/api/v1/player-observations",
      payload: { ...input, allowPersistentStorage: false },
    });
    assert.equal(withoutStorageConsent.statusCode, 400);
    assert.match(withoutStorageConsent.json().error, /本地保存/);

    const localOnly = await app.inject({ method: "POST", url: "/api/v1/player-observations", payload: input });
    assert.equal(localOnly.statusCode, 201);
    const savedLocalOnly = localOnly.json();
    assert.equal(savedLocalOnly.indexStatus, "local_only");
    assert.equal(indexed.length, 0);

    const searchable = await app.inject({
      method: "POST",
      url: "/api/v1/player-observations",
      payload: { ...input, allowAiProcessing: true },
    });
    assert.equal(searchable.statusCode, 201);
    const savedSearchable = searchable.json();
    assert.equal(savedSearchable.indexStatus, "indexed");
    assert.equal(indexed.length, 1);
    assert.equal(indexed[0]?.sourceId, "tactiscout-first-party-observations");
    assert.equal(indexed[0]?.acquisition, "authored");

    const revoked = await app.inject({
      method: "PUT",
      url: `/api/v1/player-observations/${savedSearchable.id}`,
      payload: { ...input, allowAiProcessing: false },
    });
    assert.equal(revoked.statusCode, 200);
    assert.equal(revoked.json().indexStatus, "local_only");
    assert.deepEqual(removed, ["doc-1"]);

    const listed = await app.inject({ method: "GET", url: "/api/v1/player-observations" });
    assert.equal(listed.json().length, 2);

    const deletion = await app.inject({ method: "DELETE", url: `/api/v1/player-observations/${savedLocalOnly.id}` });
    assert.equal(deletion.statusCode, 204);
    const missing = await app.inject({ method: "DELETE", url: `/api/v1/player-observations/${savedLocalOnly.id}` });
    assert.equal(missing.statusCode, 404);
  } finally {
    await app.close();
    await rm(root, { recursive: true, force: true });
  }
});
