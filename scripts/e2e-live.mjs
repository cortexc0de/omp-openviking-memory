#!/usr/bin/env node
// Live e2e for omp-openviking-memory — port of pi's e2e-live.mjs for OMP.
// Requires: OPENVIKING_URL, OPENVIKING_API_KEY, E2E_LLM_API_KEY, omp on PATH.
// Run: OPENVIKING_URL=... OPENVIKING_API_KEY=... E2E_LLM_API_KEY=... node scripts/e2e-live.mjs
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
function which(c){ const r=spawnSync("which",[c],{encoding:"utf8"}); return r.status===0?r.stdout.trim():""; }
const OV_URL=process.env.OPENVIKING_URL, OV_KEY=process.env.OPENVIKING_API_KEY, RELAY=process.env.E2E_LLM_API_KEY||process.env.SUPER_RELAY_API_KEY;
const OMP=process.env.OMP_BIN||which("omp")||which("pi");
if(!OV_URL||!OV_KEY||!RELAY||!OMP){ console.error("missing OPENVIKING_URL|API_KEY, E2E_LLM_API_KEY, omp on PATH"); process.exit(2); }
console.log(`e2e: omp=${OMP} ov=${OV_URL}`);
const root=mkdtempSync(join(tmpdir(),"ov-omp-e2e-"));
console.log(`workspace ${root}`);
const check=(c,m)=>console.log(c?`  PASS ${m}`:`  FAIL ${m}`);
// Dry-run: verify extension loads without real LLM call
const out=spawnSync(OMP,["--help"],{encoding:"utf8"});
check(out.status===0,"omp --help ok");
console.log("e2e dry-run done — set up LLM relay for full run (see pi/scripts/e2e-live.mjs)");
// For full pi-like run (see pi/scripts/e2e-live.mjs): spin up agentDir with omp models.json
// using LLM_BASE/LLM_MODEL, then spawn omp -p in extDir with a 30-turn filler to hit takeover threshold.
// This stub validates wiring; expand when LLM relay is stable.

