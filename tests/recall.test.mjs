import test from "node:test";
import assert from "node:assert/strict";
import { buildContextSearchBody, buildRecallEndpointBody, contextRequestTimeoutMs } from "../shared/recall-core.mjs";

test("buildContextSearchBody defaults to coding purpose and no quotas unless configured", () => {
  const b = buildContextSearchBody({}, {});
  assert.equal(b.mode, "context");
  assert.equal(b.purpose, "coding");
  assert.equal(b.quotas, undefined, "quotas only when recallLimitConfigured");
});

test("buildContextSearchBody respects recallPeerScope actor", () => {
  const b = buildContextSearchBody({ recallPeerScope: "actor" }, {});
  assert.equal(b.peer_scope, "actor");
});

test("contextRequestTimeoutMs is undefined for plain retrieval", () => {
  const t = contextRequestTimeoutMs({}, {});
  assert.equal(t, undefined);
});

test("contextRequestTimeoutMs floors to expansion/rewrite budgets", () => {
  assert.equal(contextRequestTimeoutMs({}, { session_id: "s1" }), 15000);
  assert.equal(contextRequestTimeoutMs({}, { rewrite: true }), 45000);
});

test("buildRecallEndpointBody maps token budget to chars", () => {
  const b = buildRecallEndpointBody({ recallLimit: 5, recallMaxContentChars: 500 });
  assert.ok(b.max_chars >= 1000);
});
