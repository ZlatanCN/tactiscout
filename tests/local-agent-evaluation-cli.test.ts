import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runCli(...args: string[]) {
  return spawnSync(process.execPath, ["--import", "tsx", "src/evals/local-model-agent.ts", ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 15_000,
  });
}

test("the local evaluation CLI documents named and repeated scenarios", () => {
  const result = runCli("--help");

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /--scenario <id\|all>/);
  assert.match(result.stdout, /--runs <1-10>/);
  assert.match(result.stdout, /bayern-kane-replacement/);
});

test("the local evaluation CLI rejects unsupported run counts before contacting the model", () => {
  const result = runCli("--scenario", "all", "--runs", "11");

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--runs 必须是 1 到 10 之间的整数/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|fetch failed/i);
});

test("the local evaluation CLI rejects unknown scenarios before contacting the model", () => {
  const result = runCli("--scenario", "imaginary-scenario");

  assert.equal(result.status, 2);
  assert.match(result.stderr, /未知场景/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|fetch failed/i);
});

test("the local evaluation CLI rejects unsupported player positions before contacting the model", () => {
  const result = runCli("--message", "找一名好球员", "--expected-position", "striker");

  assert.equal(result.status, 2);
  assert.match(result.stderr, /--expected-position 必须是以下值之一/);
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|fetch failed/i);
});
