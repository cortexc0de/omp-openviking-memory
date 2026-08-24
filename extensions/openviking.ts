/**
 * OMP OpenViking Extension — native port of pi-coding-agent-extension/index.ts
 *
 * Integrates Oh My Pi with an OpenViking context database for persistent
 * cross-session memory. Same sync/recall/takeover semantics as Pi, but:
 *  - wired to OMP ExtensionAPI (@oh-my-pi/pi-coding-agent)
 *  - takeover disabled by default (coexists with OMP memory.backend)
 *  - User-Agent omp/… and ledger dir omp-recall-ledger
 */

import { appendFileSync, mkdirSync, chmodSync } from "node:fs";
import { dirname } from "node:path";
import { loadConfigFromModuleUrl, type OVConfig } from "../src/config.js";
import { OVClient } from "../src/client.js";
import { RecallManager } from "../src/recall.js";
import { RecallLedger } from "../shared/recall-ledger.mjs";
import { SyncManager } from "../src/sync.js";
import { buildProfileBlock } from "../shared/profile-inject.mjs";
import { guardVikingUriToolCall } from "../lib/uri-guard-adapter.mjs";
import { registerTools } from "../src/tools.js";
import { createTakeoverManager } from "../src/takeover.js";

type ExtensionAPI = import("@oh-my-pi/pi-coding-agent").ExtensionAPI; // typed if available, falls back to any via peerDep

export default async function (pi: ExtensionAPI) {
  const config = loadConfigFromModuleUrl(import.meta.url);
  if (!config.enabled) return;

  const client = new OVClient(config);
  const sync = new SyncManager(client, config);
  const recall = new RecallManager(
    client,
    config,
    () => sync.sessionId,
    config.recallLedger ? new RecallLedger() : null,
  );
  const debugLog = (message: string) => {
    const file = process.env.OV_DEBUG_LOG;
    if (!file) return;
    try {
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      try { chmodSync(dirname(file), 0o700); } catch {}

      appendFileSync(file, `${new Date().toISOString()} ${message}\n`, { mode: 0o600 } as any);
    } catch {
      // best effort
    }
  };
  const takeover = createTakeoverManager({ pi, client, sync, config, log: debugLog } as any);

  let connected = false;
  let bypassed = false;
  let profileBlock = "";
  let archiveOverview = "";
  let toolsRegistered = false;
  let compacted = false;
  let started = false;
  let startPromise: Promise<void> | null = null;

  const start = async (ctx: any): Promise<void> => {
    if (started) return;
    if (startPromise) return startPromise;
    startPromise = (async () => {
      const cwd = process.cwd();
      for (const pattern of config.bypassPatterns) {
        if (matchBypass(cwd, pattern)) {
          bypassed = true;
          started = true;
          return;
        }
      }
      connected = await client.health();
      if (!connected) {
        if (config.logLevel === "info") ctx.ui.notify("OpenViking: server not reachable", "warning");
        return;
      }
      const ompSessionId = ctx.sessionManager.getSessionId();
      recall.openLedger(ompSessionId);
      const ok = await sync.ensureSession(ompSessionId);
      if (!ok) {
        if (config.logLevel !== "silent") ctx.ui.notify("OpenViking: failed to create session", "error");
        return;
      }
      await sync.replayPending();
      profileBlock = await buildSessionProfileBlock(client, config);
      const branch =
        typeof ctx.sessionManager.getBranch === "function" ? ctx.sessionManager.getBranch() : [];
      if (config.takeoverEnabled) {
        takeover.restore(branch);
        sync.restoreWatermark((takeover.state as any).syncedEntryCount ?? 0);
      } else if (sync.sessionId) {
        archiveOverview = await fetchArchiveOverview(client, sync.sessionId, config);
      }
      if (!toolsRegistered) {
        registerTools(pi, client, sync as any);
        toolsRegistered = true;
      }
      updateStatus(ctx, connected, 0, sync.sessionId, config, (takeover.state as any));
      started = true;
      if (config.logLevel === "info") ctx.ui.notify(`OpenViking connected (${ompSessionId.slice(0, 8)}...)`, "info");
    })().finally(() => {
      startPromise = null;
    });
    return startPromise;
  };

  pi.on("session_start", async (_event: any, ctx: any) => {
    await start(ctx);
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    await start(ctx);
    if (!connected || bypassed) return;
    recall.queueSearch(event.prompt);
    const parts: string[] = [];
    if (profileBlock) parts.push(profileBlock);
    if (!config.takeoverEnabled && archiveOverview && (compacted || archiveOverview.trim())) parts.push(archiveOverview);
    parts.push(
      "OpenViking tools: viking_search, viking_read, viking_browse, viking_remember, viking_forget, viking_add_resource, viking_archive_expand.",
    );
    const additions = parts.join("\n\n");
    if (!additions) return;
    return { systemPrompt: event.systemPrompt + "\n\n" + additions };
  });

  pi.on("context", async (event: any, ctx: any) => {
    if (!connected || bypassed) return;
    await recall.searchPending();
    const userEntryIds = ctx.sessionManager
      .buildContextEntries()
      .filter((entry: any) => entry?.type === "message" && entry.message?.role === "user")
      .map((entry: any) => entry.id as string);
    const messageIds = new WeakMap<object, string>();
    let userIndex = 0;
    for (const message of event.messages as any[]) {
      if (message?.role !== "user") continue;
      const entryId = userEntryIds[userIndex++];
      if (entryId && typeof message === "object") messageIds.set(message, entryId);
    }
    const afterTakeover = config.takeoverEnabled
      ? (takeover as any).transformContext(event.messages as any)
      : event.messages;
    const messages = recall.injectRecall(afterTakeover, (message: any) => messageIds.get(message) ?? null);
    return { messages };
  });

  pi.on("tool_call", async (event: any, _ctx: any) => {
    const decision = guardVikingUriToolCall(event);
    if (!decision) return;
    return decision;
  });

  pi.on("turn_end", async (_event: any, ctx: any) => {
    if (!connected || bypassed || !config.syncTurns) return;
    const branch = ctx.sessionManager.getBranch();
    const result = await sync.syncBranch(branch);
    debugLog(`turn_end: synced ${result.added} entries, ~${result.tokens} tokens`);
    await (takeover as any).onTurnSynced(result.tokens);
    updateStatus(ctx, connected, result.added, sync.sessionId, config, (takeover.state as any));
  });

  pi.on("session_before_compact", async (event: any, _ctx: any) => {
    if (!connected || bypassed) return;
    if (config.takeoverEnabled) {
      const prep = (event as any)?.preparation ?? {};
      return await (takeover as any).handleBeforeCompact({
        firstKeptEntryId: prep.firstKeptEntryId,
        tokensBefore: prep.tokensBefore ?? 0,
      });
    }
    const archiveId = await sync.commit();
    compacted = true;
    if (archiveId && sync.sessionId) archiveOverview = await fetchArchiveOverview(client, sync.sessionId, config);
  });

  pi.on("session_shutdown", async (_event: any, _ctx: any) => {
    if (!connected || bypassed) return;
    await sync.shutdown();
    if (config.takeoverEnabled) await (takeover as any).shutdown();
    else await sync.commit();
  });

  pi.on("agent_end", async (_event: any, _ctx: any) => {
    recall.invalidate();
  });

  async function handleVikingCommand(args: string | undefined, ctx: any) {
    if (!connected) {
      ctx.ui.notify("OpenViking: not connected — check OPENVIKING_URL / ~/.openviking/ovcli.conf", "warning");
      return;
    }
    const arg = (args ?? "").trim().toLowerCase();
    if (arg === "commit" || arg === "flush") {
      await sync.shutdown();
      const commitResult = config.takeoverEnabled ? null : await sync.commit();
      const ok = config.takeoverEnabled ? await (takeover as any).commitAndAdvance() : commitResult !== null;
      if (ok) {
        const trace = (commitResult as any)?.trace_id ? ` (trace_id=${(commitResult as any).trace_id})` : "";
        ctx.ui.notify("OpenViking: committed successfully" + trace, "info");
      } else ctx.ui.notify("OpenViking: commit failed — see OV_DEBUG_LOG", "error");
      return;
    }
    if (arg === "status" || arg === "health" || arg === "") {
      const sid = sync.sessionId ?? "none";
      const t: any = (takeover as any).state;
      const takeoverInfo = config.takeoverEnabled
        ? ` | takeover: ${t.coveredUserTurns}/${t.lastSeenUserTurns} turns archived, ~${t.pendingTokens} tokens pending`
        : "";
      const sys = await (client as any).systemStatus().catch(() => null);
      const sysInfo = sys ? ` | user=${sys.user ?? "?"} account=${sys.account ?? "?"}` : "";
      ctx.ui.notify(`OpenViking: ${connected ? "connected" : "disconnected"} | session: ${sid.slice(0, 12)}...${takeoverInfo}${sysInfo}`, "info");
      return;
    }
    ctx.ui.notify("Usage: /viking [status|commit]  (aliases: /ov)", "info");
  }

  pi.registerCommand("viking", {
    description: "OpenViking status and manual operations. Use '/viking commit' to force a sync, '/viking status' for health.",
    handler: handleVikingCommand,
  });
  pi.registerCommand("ov", {
    description: "Alias for /viking — OpenViking status/commit",
    handler: handleVikingCommand,
  });
}

function matchBypass(cwd: string, pattern: string): boolean {
  if (pattern.startsWith("*")) return cwd.endsWith(pattern.slice(1));
  if (pattern.endsWith("*")) return cwd.startsWith(pattern.slice(0, -1));
  return cwd === pattern || cwd.startsWith(pattern + "/");
}

async function buildSessionProfileBlock(client: OVClient, config: OVConfig): Promise<string> {
  try {
    const profile = await buildProfileBlock(
      (path: string, init?: any) => (client as any).fetchJSON(path, init, 10000),
      config.profileTokenBudget,
      config.peerId,
    );
    if (!profile?.block) return "";
    return ['<openviking-context source="session-start">', profile.block, "</openviking-context>"].join("\n");
  } catch {
    return "";
  }
}

async function fetchArchiveOverview(client: OVClient, sessionId: string, config: OVConfig): Promise<string> {
  try {
    const ctx = await (client as any).getSessionContext(sessionId, config.resumeContextBudget);
    if (!ctx || !ctx.latest_archive_overview) return "";
    return [
      '<openviking-context source="session-archive">',
      "<session-archive>",
      ctx.latest_archive_overview,
      "</session-archive>",
      "</openviking-context>",
    ].join("\n");
  } catch {
    return "";
  }
}

function updateStatus(
  ctx: any,
  connected: boolean,
  added: number,
  sessionId: string | null,
  config: OVConfig,
  takeoverState?: { pendingTokens?: number; coveredUserTurns?: number },
): void {
  const setter = ctx?.ui?.setStatus;
  if (typeof setter !== "function") return;
  const threshold = config.takeoverEnabled ? config.takeoverTokenThreshold : config.commitTokenThreshold;
  const pending =
    config.takeoverEnabled && takeoverState
      ? ` · ctx ${takeoverState.coveredUserTurns ?? 0} · ~${takeoverState.pendingTokens ?? 0}/${threshold}`
      : ` · ✎ ${threshold}`;
  const status = `${connected ? "OV ✓" : "OV ✗"} · ↩${added}${pending} · ${sessionId ? sessionId.slice(0, 12) : "none"}`;
  try {
    setter("openviking", status);
  } catch {
    // pi API shape may vary across versions
  }
}
