import assert from "node:assert/strict";
import test from "node:test";
import { turnRecruitmentCase } from "../web/src/api.js";

const responseBody = {
  threadId: "case-1",
  status: "needs_input" as const,
  message: "你更看重即战力还是培养空间？",
  question: { reason: "这会改变目标球员的年龄与样本取舍。" },
  report: null,
};

test("conversation API sends a turn to the case endpoint and parses the shared response", async (t) => {
  let requestUrl = "";
  let requestInit: RequestInit | undefined;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    requestUrl = String(input);
    requestInit = init;
    return new Response(JSON.stringify(responseBody), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  assert.deepEqual(await turnRecruitmentCase("case/one", "回复年龄偏好"), responseBody);
  assert.equal(requestUrl, "/api/v1/recruitment/cases/case%2Fone/turns");
  assert.equal(requestInit?.method, "POST");
  assert.deepEqual(JSON.parse(String(requestInit?.body)), { message: "回复年龄偏好", expectsExistingState: false });
});

test("conversation API rejects a response that violates the case contract", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(JSON.stringify({ ...responseBody, status: "done" }), {
    status: 200,
    headers: { "content-type": "application/json" },
  }));

  await assert.rejects(() => turnRecruitmentCase("case-1", "继续"), /服务端返回的数据格式不符合当前招募契约/);
});
