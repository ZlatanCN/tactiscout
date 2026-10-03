import assert from "node:assert/strict";
import test from "node:test";
import { conclusionInstructions } from "../src/agent/conversation.js";

test("the final decision prompt is short while retaining evidence and historical-data constraints", () => {
  const prompt = conclusionInstructions("wyscout");

  assert.ok(prompt.length < 1_000);
  assert.match(prompt, /evaluate_candidates/);
  assert.match(prompt, /evidence key/);
  assert.match(prompt, /2017\/18 历史样本/);
  assert.match(prompt, /CC BY 4\.0/);
  assert.match(prompt, /现役俱乐部/);
  assert.doesNotMatch(prompt, /search_methodology|最多 10 步/);
});
