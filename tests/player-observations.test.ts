import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  PlayerObservationNotFoundError,
  createPlayerObservationLibrary,
  type PlayerObservationIndex,
} from "../src/observations/library.js";
import { knowledgeDocumentId } from "../src/knowledge/document-id.js";
import { createLocalKnowledgeBase } from "../src/knowledge/index.js";
import { firstPartyObservationSourceId } from "../src/knowledge/source-ids.js";
import type { KnowledgeDocumentInput } from "../src/knowledge/schemas.js";

const observationInput = {
  playerName: "Theo Example",
  playerAliases: ["Theo E."],
  playerIdentityProvider: "Sportmonks",
  externalPlayerId: "sp-123",
  competition: "Bundesliga",
  season: "2025/26",
  match: "Bayern vs Example FC",
  observedAt: "2026-10-04",
  matchMinute: 63,
  observer: "Alex Scout",
  strengths: ["在边线附近接球后能快速向前带球。"],
  risks: ["被逼向边线时偶尔丢失对球的保护。"],
  evidenceNote: "第 63 分钟，他在右侧肋部接到回传后带球越过第一道压迫，随后将球转移到左路并制造出明确的向前推进空间。",
  sourceReferenceUrl: "https://example.test/match-report",
  allowPersistentStorage: true as const,
  allowAiProcessing: false,
};

test("球探观察默认只保存在本地，未同意模型处理时不进入 RAG 检索", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tactiscout-observations-"));
  const indexed: KnowledgeDocumentInput[] = [];
  const removed: string[] = [];
  const index: PlayerObservationIndex = {
    async ingest(input) {
      indexed.push(input);
      return { documentId: `document-${indexed.length}`, chunkCount: 1 };
    },
    async removeDocument(documentId) {
      removed.push(documentId);
      return 1;
    },
  };

  try {
    const library = createPlayerObservationLibrary({
      index,
      storagePath: path.join(root, "observations.json"),
      idGenerator: () => "11111111-1111-4111-8111-111111111111",
      clock: () => new Date("2026-10-04T10:00:00.000Z"),
    });
    const localOnly = await library.save(null, observationInput);
    assert.equal(localOnly.playerName, "Theo Example");
    assert.equal(localOnly.indexStatus, "local_only");
    assert.deepEqual(await library.list(), [localOnly]);
    assert.equal(indexed.length, 0);

    const indexedObservation = await library.save(localOnly.id, {
      ...observationInput,
      allowAiProcessing: true,
    });
    assert.equal(indexedObservation.indexStatus, "indexed");
    assert.equal(indexed.length, 1);
    assert.equal(indexed[0]?.corpus, "player_report");
    assert.equal(indexed[0]?.acquisition, "authored");
    assert.deepEqual(indexed[0]?.entityNames, ["Theo Example", "Theo E."]);
    assert.equal(indexed[0]?.competition, "Bundesliga");
    assert.match(indexed[0]?.content ?? "", /第 63 分钟/);
    assert.equal(indexed[0]?.author, "Alex Scout");
    assert.equal(indexed[0]?.url, `https://tactiscout.local/player-observations/${localOnly.id}?revision=2026-10-04T10%3A00%3A00.001Z`);
    assert.match(indexed[0]?.attribution ?? "", /参考链接：https:\/\/example\.test\/match-report/);

    const revoked = await library.save(localOnly.id, {
      ...observationInput,
      allowAiProcessing: false,
      evidenceNote: "更新后的观察仍保存在本地，但作者撤回了模型处理授权。",
    });
    assert.equal(revoked.indexStatus, "local_only");
    assert.deepEqual(removed, ["document-1"]);
    assert.equal((await library.list()).length, 1);

    await library.delete(localOnly.id);
    assert.deepEqual(await library.list(), []);
    assert.deepEqual(removed, ["document-1"]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("球探观察要求明确同意本地持久化", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tactiscout-observations-consent-"));
  const index: PlayerObservationIndex = {
    async ingest() { return { documentId: "document", chunkCount: 1 }; },
    async removeDocument() { return 1; },
  };
  try {
    const library = createPlayerObservationLibrary({ index, storagePath: path.join(root, "observations.json") });
    await assert.rejects(
      library.save(null, { ...observationInput, allowPersistentStorage: false }),
      /持久化授权/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("球探观察只允许更新和删除已存在的记录", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tactiscout-observations-missing-"));
  const index: PlayerObservationIndex = {
    async ingest() { return { documentId: "document", chunkCount: 1 }; },
    async removeDocument() { return 1; },
  };
  try {
    const library = createPlayerObservationLibrary({ index, storagePath: path.join(root, "observations.json") });
    await assert.rejects(library.save("missing", observationInput), PlayerObservationNotFoundError);
    await assert.rejects(library.delete("missing"), PlayerObservationNotFoundError);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("index writes can be revoked even if the process loses the ingest result", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tactiscout-observations-index-recovery-"));
  const indexedDocuments: KnowledgeDocumentInput[] = [];
  const indexedIds = new Set<string>();
  const removed: string[] = [];
  const index: PlayerObservationIndex = {
    async ingest(document) {
      indexedDocuments.push(document);
      const documentId = knowledgeDocumentId(document);
      indexedIds.add(documentId);
      throw new Error("Simulated interruption after LanceDB accepted the document");
    },
    async removeDocument(documentId) {
      removed.push(documentId);
      return indexedIds.delete(documentId) ? 1 : 0;
    },
  };

  try {
    const library = createPlayerObservationLibrary({ index, storagePath: path.join(root, "observations.json") });
    const saved = await library.save(null, { ...observationInput, allowAiProcessing: true });
    assert.equal(saved.indexStatus, "index_failed");
    assert.equal(indexedIds.size, 1);

    await library.delete(saved.id);
    const indexedDocument = indexedDocuments[0];
    assert.ok(indexedDocument);
    assert.deepEqual(removed, [knowledgeDocumentId(indexedDocument)]);
    assert.equal(indexedIds.size, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("first-party observation consent controls the real retrieval context", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tactiscout-observations-retrieval-"));
  const registryPath = path.join(root, "sources.json");
  await writeFile(registryPath, JSON.stringify([{
    id: firstPartyObservationSourceId,
    name: "TactiScout 球探自录观察",
    publisher: "TactiScout 与本机用户",
    rightsUrl: "https://tactiscout.local/privacy/player-observations",
    license: "用户自录观察；仅依照记录中的本地保存与模型处理授权使用",
    allowedCorpora: ["player_report"],
    allowedUrlPrefixes: ["https://tactiscout.local/player-observations/"],
    rights: { automatedFetch: false, persistentStorage: true, aiProcessing: true, display: true },
    rightsVerifiedAt: "2026-10-04",
    rightsNote: "Only locally authored and individually consented observations are indexed.",
  }]), "utf8");
  const knowledgeBase = createLocalKnowledgeBase({
    indexPath: path.join(root, "index"),
    registryPath,
    seedDocuments: [],
    embedder: {
      modelId: "observation-retrieval-test",
      async embed(text) { return text.toLocaleLowerCase().includes("pressing") ? [1, 0] : [0, 1]; },
    },
  });

  try {
    const library = createPlayerObservationLibrary({ index: knowledgeBase, storagePath: path.join(root, "observations.json") });
    const localOnly = await library.save(null, observationInput);
    const request = { corpus: "player_report" as const, query: "forward carrying and pressing", playerNames: ["Theo Example"] };
    assert.deepEqual(await knowledgeBase.search(request), []);

    const searchable = await library.save(localOnly.id, { ...observationInput, allowAiProcessing: true });
    const indexedResults = await knowledgeBase.search(request);
    assert.equal(searchable.indexStatus, "indexed");
    assert.equal(indexedResults[0]?.author, "Alex Scout");
    assert.deepEqual(indexedResults[0]?.entityIds, ["sportmonks:sp-123"]);
    assert.match(indexedResults[0]?.attribution ?? "", /未独立核实/);

    const revoked = await library.save(localOnly.id, {
      ...observationInput,
      allowAiProcessing: false,
      evidenceNote: "更新后的观察仍保存在本地，但作者撤回了模型处理授权。",
    });
    assert.equal(revoked.indexStatus, "local_only");
    assert.deepEqual(await knowledgeBase.search(request), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
