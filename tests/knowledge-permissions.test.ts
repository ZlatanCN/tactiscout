import assert from "node:assert/strict";
import test from "node:test";
import {
  assertCanIngestDocument,
  canAutomaticallyIngest,
  sourceAllowsUrl,
} from "../src/knowledge/permissions.js";
import type { KnowledgeDocumentInput, KnowledgeSource } from "../src/knowledge/schemas.js";

const source: KnowledgeSource = {
  id: "permitted-source",
  name: "Permitted Source",
  publisher: "Publisher",
  rightsUrl: "https://example.test/terms",
  license: "CC BY 4.0",
  allowedCorpora: ["methodology"],
  allowedUrlPrefixes: ["https://example.test/articles?id=123"],
  rights: { automatedFetch: true, persistentStorage: true, aiProcessing: true, display: true },
  rightsVerifiedAt: "2026-10-03",
  rightsNote: "Test permission record.",
};

const document: KnowledgeDocumentInput = {
  sourceId: source.id,
  corpus: "methodology",
  title: "A methods note",
  url: "https://example.test/articles?id=123",
  author: "A. Author",
  publisher: source.publisher,
  publishedAt: null,
  license: source.license,
  attribution: "A. Author, Publisher, CC BY 4.0.",
  acquisition: "manual_import",
  content: "This methods note has enough text for the minimum document length used by the index.",
};

test("source URL permission requires HTTPS and matches the registered path and query", () => {
  assert.equal(sourceAllowsUrl(source, document.url), true);
  assert.equal(sourceAllowsUrl(source, "http://example.test/articles?id=123"), false);
  assert.equal(sourceAllowsUrl(source, "https://example.test/articles?id=999"), false);
  assert.equal(sourceAllowsUrl(source, "https://example.test/articles-elsewhere?id=123"), false);
});

test("manual import may use a source without automated-fetch permission", () => {
  assert.doesNotThrow(() => assertCanIngestDocument({
    ...source,
    rights: { ...source.rights, automatedFetch: false },
  }, document));
  assert.equal(canAutomaticallyIngest({
    ...source,
    rights: { ...source.rights, automatedFetch: false },
  }, document.url), false);
});

test("automated ingestion requires fetch, storage, AI processing, and an allowed URL", () => {
  assert.equal(canAutomaticallyIngest(source, document.url), true);
  for (const permission of ["automatedFetch", "persistentStorage", "aiProcessing"] as const) {
    assert.equal(canAutomaticallyIngest({
      ...source,
      rights: { ...source.rights, [permission]: false },
    }, document.url), false);
  }
  assert.equal(canAutomaticallyIngest(source, "https://example.test/unregistered"), false);
});

test("ingestion rejects corpus, licence, and retrieval permissions outside the source record", () => {
  assert.throws(() => assertCanIngestDocument({ ...source, allowedCorpora: ["player_report"] }, document), /不允许进入/);
  assert.throws(() => assertCanIngestDocument({ ...source, license: "CC0" }, document), /许可与来源登记不一致/);
  assert.throws(() => assertCanIngestDocument({
    ...source,
    rights: { ...source.rights, persistentStorage: false },
  }, document), /未同时允许/);
  assert.throws(() => assertCanIngestDocument({
    ...source,
    rights: { ...source.rights, automatedFetch: false },
  }, { ...document, acquisition: "authorized_fetch" }), /未获准自动抓取/);
});
