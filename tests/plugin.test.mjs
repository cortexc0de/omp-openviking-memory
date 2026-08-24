import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");

function read(p) { return readFileSync(join(ROOT, p), "utf-8"); }
function readJson(p) {
  return JSON.parse(readFileSync(join(ROOT, p), "utf-8"));
}

test("plugin.json is valid AGPL", () => {
  const j = readJson("plugin.json");
  assert.equal(j.name, "omp-openviking-memory");
  assert.match(j.version, /^\d+\.\d+\.\d+/);
  assert.equal(j.license, "AGPL-3.0");
});

test("package.json has omp and pi extensions", () => {
  const j = readJson("package.json");
  assert.ok(Array.isArray(j.omp?.extensions), "omp.extensions missing");
  assert.ok(j.omp.extensions.includes("./extensions/openviking.ts"));
  assert.ok(Array.isArray(j.pi?.extensions), "pi.extensions missing for compat");
});

test("config.json takeover disabled by default", () => {
  const j = readJson("config.json");
  assert.equal(j.takeover.enabled, false, "OMP must default takeover off");
  assert.equal(j.recallTokenBudget, 2000);
  assert.equal(j.scoreThreshold, 0.35);
});

test("mcp.json references mcp-proxy.mjs", () => {
  const j = readJson("mcp.json");
  const args = j.mcpServers?.openviking?.args ?? [];
  assert.ok(args.some((a) => a.includes("mcp-proxy.mjs")));
});

test("SKILL.md has frontmatter", () => {
  const s = readFileSync(join(ROOT, "skills/openviking-memory/SKILL.md"), "utf-8");
  assert.match(s, /^---\s*\nname:\s*openviking-memory/m);
});

test("marketplace manifests present and identical", () => {
  assert.ok(existsSync(join(ROOT, ".omp-plugin/marketplace.json")), ".omp-plugin missing");
  assert.ok(existsSync(join(ROOT, ".claude-plugin/marketplace.json")), ".claude-plugin missing");
  const a = readJson(".omp-plugin/marketplace.json");
  const b = readJson(".claude-plugin/marketplace.json");
  assert.deepEqual(a, b, "marketplace manifests must be identical");
});

test("vendored shared files present", () => {
  for (const f of ["credentials.mjs", "recall-core.mjs", "recall-ledger.mjs", "capture-utils.mjs"]) {
    assert.ok(existsSync(join(ROOT, "shared", f)), `shared/${f} missing`);
  }
  for (const f of ["mcp-proxy-core.mjs", "credentials.mjs"]) {
    assert.ok(existsSync(join(ROOT, "servers/shared", f)), `servers/shared/${f} missing`);
  }
  assert.ok(existsSync(join(ROOT, "lib/takeover-core.mjs")));
});

test("extension parses", () => {
  assert.match(read("extensions/openviking.ts"), /export default/);
});
