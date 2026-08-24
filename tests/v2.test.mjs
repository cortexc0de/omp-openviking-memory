import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
function readJson(p) { return JSON.parse(readFileSync(join(ROOT, p), "utf-8")); }
function read(p) { return readFileSync(join(ROOT, p), "utf-8"); }

test("client.ts has optional tree/write/edit/health APIs", () => {
  const s = read("src/client.ts");
  assert.match(s, /async tree\(/);
  assert.match(s, /async writeFile\(/);
  assert.match(s, /async editFile\(/);
  assert.match(s, /async systemStatus\(/);
  assert.match(s, /async hasCapability\(/);
});

test("tools.ts registers 11 tools (7 core + 4 optional/health)", () => {
  const s = read("src/tools.ts");
  for (const name of ["viking_search","viking_read","viking_browse","viking_remember","viking_forget","viking_add_resource","viking_archive_expand","viking_tree","viking_write","viking_edit","viking_health"]) {
    assert.match(s, new RegExp(`name:\\s*"${name}"`), `missing tool ${name}`);
  }
});

test("extension has DRY handleVikingCommand and status/health subcommand", () => {
  const s = read("extensions/openviking.ts");
  assert.match(s, /handleVikingCommand/);
  assert.match(s, /systemStatus/);
  assert.ok(s.includes('registerCommand("viking"') && s.includes('registerCommand("ov"'));
});

test("commands/ov.md exists and references extension", () => {
  assert.ok(existsSync(join(ROOT, "commands/ov.md")));
  const md = read("commands/ov.md");
  assert.match(md, /\/viking/);
  assert.match(md, /skill:\/\/openviking-memory/);
});

test("package and marketplace bumped to 0.2.0", () => {
  assert.match(readJson("package.json").version, /^0\.2\./);
  assert.match(readJson("plugin.json").version, /^0\.2\./);
  assert.match(readJson(".omp-plugin/marketplace.json").plugins[0].version, /^0\.2\./);
});

test("vendored shared/servers still have GENERATED headers", () => {
  for (const p of ["shared/recall-core.mjs", "servers/shared/mcp-proxy-core.mjs", "lib/takeover-core.mjs"]) {
    assert.match(read(p), /GENERATED FROM/);
  }
});
