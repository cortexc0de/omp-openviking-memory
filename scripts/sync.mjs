#!/usr/bin/env node
// Re-export upstream sync + add OMP local TARGET. Keeps vendoring drift-free.
// Usage: node scripts/sync.mjs  (run from omp-openviking-memory root)
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";

const THIS = dirname(fileURLToPath(import.meta.url));
const ROOT = join(THIS, "..");
const UPSTREAM = join(ROOT, "..", "_ov");
const SHARED_DIR = join(UPSTREAM, "examples", "memory-plugin-shared", "lib");
const HEADER = "// GENERATED FROM examples/memory-plugin-shared/lib. DO NOT EDIT.\n";
const HARNESS = ["credentials.mjs","capture-utils.mjs","session-model.mjs","pending-queue.mjs","debug-log.mjs","setup-wizard.mjs","plugin-config.mjs","recall-compress-core.mjs","recall-core.mjs","retryable.mjs","workspace-peer.mjs","profile-inject.mjs","uri-guard.mjs"];

async function copyFile(file, targetDir) {
  await mkdir(targetDir, { recursive: true });
  const body = await readFile(join(SHARED_DIR, file), "utf-8");
  await writeFile(join(targetDir, file), HEADER + body, "utf-8");
}

async function main() {
  // Try upstream sync first (covers claude/codex/pi/agent-plugins)
  try {
    const mod = await import(join(UPSTREAM, "examples/memory-plugin-shared/sync.mjs"));
    // upstream main() already synced its TARGETS; we just add OMP extras
  } catch {}
  for (const f of HARNESS) await copyFile(f, join(ROOT, "shared"));
  for (const f of ["credentials.mjs","debug-log.mjs","mcp-proxy-core.mjs","mcp-proxy-config.mjs","workspace-peer.mjs"]) {
    await copyFile(f, join(ROOT, "servers/shared"));
  }
  console.log("omp sync: refreshed shared/ + servers/shared from upstream lib");
}
main().catch(e => { console.error(e); process.exit(1); });
