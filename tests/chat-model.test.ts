import assert from "node:assert/strict";
import test from "node:test";
import { createChatModel } from "../src/agent/chat-model.js";

function restoreEnvironment(name: string, previousValue: string | undefined): void {
  if (previousValue === undefined) delete process.env[name];
  else process.env[name] = previousValue;
}

test("the chat model has a bounded default timeout and no hidden retries", () => {
  const previousTimeout = process.env.OPENAI_TIMEOUT_MS;
  delete process.env.OPENAI_TIMEOUT_MS;
  try {
    const model = createChatModel("placeholder", "qwen3.5:9b");
    const caller = Reflect.get(model, "caller") as { maxRetries: number };
    assert.equal(model.timeout, 180_000);
    assert.equal(caller.maxRetries, 0);
  } finally {
    restoreEnvironment("OPENAI_TIMEOUT_MS", previousTimeout);
  }
});

test("the chat model accepts a validated timeout override", () => {
  const previousTimeout = process.env.OPENAI_TIMEOUT_MS;
  process.env.OPENAI_TIMEOUT_MS = "240000";
  try {
    const model = createChatModel("placeholder", "qwen3.5:9b");
    assert.equal(model.timeout, 240_000);
  } finally {
    restoreEnvironment("OPENAI_TIMEOUT_MS", previousTimeout);
  }
});

test("the chat model rejects unsafe timeout configuration", () => {
  const previousTimeout = process.env.OPENAI_TIMEOUT_MS;
  process.env.OPENAI_TIMEOUT_MS = "0";
  try {
    assert.throws(() => createChatModel("placeholder", "qwen3.5:9b"), /OPENAI_TIMEOUT_MS/);
  } finally {
    restoreEnvironment("OPENAI_TIMEOUT_MS", previousTimeout);
  }
});
