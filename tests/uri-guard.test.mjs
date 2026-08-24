import test from "node:test";
import assert from "node:assert/strict";
import { guardVikingUriToolCall } from "../lib/uri-guard-adapter.mjs";

test("guard blocks viking:// on read", () => {
  const r = guardVikingUriToolCall({ toolName: "read", input: { path: "viking://user/memories/foo.md" } });
  assert.ok(r && r.block === true);
});

test("guard passes non-viking read", () => {
  const r = guardVikingUriToolCall({ toolName: "read", input: { path: "/tmp/foo.txt" } });
  assert.equal(r, null);
});
