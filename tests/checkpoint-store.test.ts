import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createApp } from "../src/app.js";
import { createRecruitmentCheckpointStore, resolveRecruitmentCheckpointPath } from "../src/agent/checkpoint-store.js";

test("checkpoint path uses the local default and supports an environment override", () => {
  const previousPath = process.env.TACTISCOUT_CHECKPOINT_PATH;
  try {
    delete process.env.TACTISCOUT_CHECKPOINT_PATH;
    assert.equal(resolveRecruitmentCheckpointPath(), resolve(".data/recruitment-cases.sqlite"));
    process.env.TACTISCOUT_CHECKPOINT_PATH = "./.data/test-cases.sqlite";
    assert.equal(resolveRecruitmentCheckpointPath(), resolve(".data/test-cases.sqlite"));
  } finally {
    if (previousPath === undefined) delete process.env.TACTISCOUT_CHECKPOINT_PATH;
    else process.env.TACTISCOUT_CHECKPOINT_PATH = previousPath;
  }
});

test("SQLite checkpoint store creates its parent directory and can be closed twice", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactiscout-store-"));
  const databasePath = join(directory, "nested", "cases.sqlite");
  const store = createRecruitmentCheckpointStore(databasePath);

  try {
    assert.equal(store.path, databasePath);
    store.close();
    assert.doesNotThrow(() => store.close());
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("the default Fastify app opens its local checkpoint store and closes it on shutdown", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactiscout-app-store-"));
  const databasePath = join(directory, "cases.sqlite");
  const app = createApp({ checkpointPath: databasePath });

  try {
    await app.ready();
    assert.equal(existsSync(databasePath), true);
  } finally {
    await app.close();
    await rm(directory, { recursive: true, force: true });
  }
});
