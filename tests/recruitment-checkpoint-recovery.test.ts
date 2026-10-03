import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const workerPath = fileURLToPath(new URL("./fixtures/recruitment-checkpoint-worker.ts", import.meta.url));

function runWorker(mode: "pause" | "resume", databasePath: string) {
  const stdout = execFileSync(process.execPath, ["--import", "tsx", workerPath, mode, databasePath], {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout: 30_000,
  });
  const resultLine = stdout.split("\n").find((line) => line.startsWith("RESULT:"));
  assert.ok(resultLine, `worker must return a result line; output was:\n${stdout}`);
  return JSON.parse(resultLine.slice("RESULT:".length)) as {
    statusCode: number;
    body: { status: string; report: { recommendations: Array<{ player: { playerId: string }; focusEvidenceKeys: string[] }> } | null };
  };
}

test("a paused recruitment case resumes after the API process exits and starts again", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tactiscout-checkpoint-"));
  const databasePath = join(directory, "cases.sqlite");

  try {
    const firstProcess = runWorker("pause", databasePath);
    assert.equal(firstProcess.statusCode, 200);
    assert.equal(firstProcess.body.status, "needs_input");

    const restartedProcess = runWorker("resume", databasePath);
    assert.equal(restartedProcess.statusCode, 200);
    assert.equal(restartedProcess.body.status, "completed");
    assert.equal(restartedProcess.body.report?.recommendations[0]?.player.playerId, "striker-a");
    assert.deepEqual(restartedProcess.body.report?.recommendations[0]?.focusEvidenceKeys, ["goals"]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
