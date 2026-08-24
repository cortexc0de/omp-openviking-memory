import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

test("vendored files have GENERATED header", () => {
  for (const p of ["shared/credentials.mjs", "shared/recall-core.mjs", "lib/takeover-core.mjs", "servers/shared/mcp-proxy-core.mjs"]) {
    const s = readFileSync(join(ROOT, p), "utf-8");
    assert.match(s, /GENERATED FROM/, `${p} missing GENERATED header`);
  }
});

test("config.json takeover default is false (OMP coexistence)", () => {
  const extCfg = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf-8"));
  assert.equal(extCfg.takeover.enabled, false);
  const src = readFileSync(join(ROOT, "src/config.ts"), "utf-8");
  assert.match(src, /takeoverEnabled:\s*false/);
});
