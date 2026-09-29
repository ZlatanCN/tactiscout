import assert from "node:assert/strict";
import test from "node:test";
import { scout } from "../web/src/api.js";

const request = {
  targetTeam: "Barcelona",
  position: "CM" as const,
  inPossessionRoles: ["progression" as const],
  outOfPossessionRoles: ["pressing" as const],
  topK: 3,
  includeUnknownAge: false,
};

const validResponse = {
  targetTeam: "Barcelona",
  requirements: request,
  dataSource: "Fictional TactiScout demo data",
  datasetMode: "demo" as const,
  candidates: [],
  review: { evidenceCompleteness: 1, evidenceCoverage: 1, findings: [], retryRecommended: false },
  caveats: [],
};

test("球探入口拒绝缺少契约字段的成功响应", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("{}", {
    status: 200,
    headers: { "content-type": "application/json" },
  }));

  await assert.rejects(() => scout(request), /服务端返回的数据格式不符合当前招募契约/);
});

test("球探入口接受符合共享契约的响应", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify(validResponse), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));

  assert.deepEqual(await scout(request), validResponse);
});
