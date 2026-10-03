import assert from "node:assert/strict";
import test from "node:test";
import { extractExplicitTargetTeam } from "../src/agent/target-team-context.js";

test("target-club extraction reads an explicit club recruitment phrase, not the reference player", () => {
  assert.equal(extractExplicitTargetTeam("为拜仁寻找凯恩的替代者。"), "拜仁");
  assert.equal(extractExplicitTargetTeam("我想为巴萨找一个新的后卫。"), "巴萨");
  assert.equal(extractExplicitTargetTeam("At Bayern Munich, find a replacement for Kane."), "Bayern Munich");
});

test("target-club extraction stays empty when the request does not clearly name one target club", () => {
  assert.equal(extractExplicitTargetTeam("寻找凯恩的替代者，优先未来接班。"), null);
  assert.equal(extractExplicitTargetTeam("为拜仁找凯恩替代者，也为巴萨找一名新后卫。"), null);
});
