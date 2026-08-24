import { Type } from "typebox";
import { StringEnum } from "@oh-my-pi/pi-ai";
import type { OVClient } from "./client.js";
import type { SyncManager } from "./sync.js";

export function registerTools(pi: any, client: OVClient, sync?: SyncManager): void {

  // --- viking_search ---
  pi.registerTool({
    name: "viking_search",
    label: "Viking Search",
    description: "Semantic search over the OpenViking knowledge base. Returns ranked results with viking:// URIs and abstracts. Use to recall past decisions, user preferences, or project-specific knowledge not in current context.",
    promptSnippet: "Search OpenViking for past decisions, preferences, and project knowledge",
    promptGuidelines: [
      "Use viking_search when you need information from previous sessions not in MEMORY.md.",
      "Use viking_search before making decisions that might conflict with past decisions.",
    ],
    parameters: Type.Object({
      query: Type.String({ description: "Search query" }),
      scope: Type.Optional(Type.String({ description: "Viking URI prefix to scope search (e.g., 'viking://~/memories/')" })),
      limit: Type.Optional(Type.Number({ description: "Max results (default: 10)" })),
    }),
    async execute(
      _id: string, params: any, _signal: AbortSignal,
      _onUpdate: any, _ctx: any,
    ) {
      if (!client.connected) {
        return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      }
      const results = await client.find(params.query, {
        targetUri: params.scope,
        topK: params.limit ?? 10,
      });
      if (results.length === 0) {
        return { content: [{ type: "text", text: "No results found." }] };
      }
      const maxChars = client.cfg.recallMaxContentChars;
      const lines = results.map(r => {
        const abs = r.abstract.length > maxChars
          ? r.abstract.slice(0, maxChars) + "..."
          : r.abstract;
        return `[${r.score.toFixed(2)}] ${r.uri}\n  ${abs}`; }
      );
      return {
        content: [{ type: "text", text: lines.join("\n\n") }],
        details: { results },
      };
    },
  });

  // --- viking_read ---
  pi.registerTool({
    name: "viking_read",
    label: "Viking Read",
    description: "Read content at a viking:// URI. Three detail levels: 'abstract' (~100 tokens), 'overview' (~2k tokens), 'full' (complete). Start with abstract, escalate when needed.",
    promptSnippet: "Read OpenViking content at a viking:// URI with tiered detail levels",
    parameters: Type.Object({
      uri: Type.String({ description: "viking:// URI to read" }),
      level: StringEnum(["abstract", "overview", "full"] as const),
    }),
    async execute(
      _id: string, params: any, _signal: AbortSignal,
      _onUpdate: any, _ctx: any,
    ) {
      if (!client.connected) {
        return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      }
      let content: string | null = null;
      switch (params.level) {
        case "abstract": content = await client.abstract(params.uri); break;
        case "overview": content = await client.overview(params.uri); break;
        case "full":     content = await client.readContent(params.uri); break;
      }
      if (!content) {
        return { content: [{ type: "text", text: `No content at ${params.uri}` }] };
      }
      return { content: [{ type: "text", text: content }] };
    },
  });

  // --- viking_browse ---
  pi.registerTool({
    name: "viking_browse",
    label: "Viking Browse",
    description: "Browse the OpenViking knowledge store like a filesystem. List directory contents or get metadata.",
    promptSnippet: "Browse the viking:// directory tree in OpenViking",
    parameters: Type.Object({
      action: StringEnum(["list", "stat"] as const),
      uri: Type.Optional(Type.String({ description: "viking:// URI (default: 'viking://')" })),
    }),
    async execute(
      _id: string, params: any, _signal: AbortSignal,
      _onUpdate: any, _ctx: any,
    ) {
      if (!client.connected) {
        return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      }
      const uri = params.uri ?? "viking://";
      if (params.action === "stat") {
        const info = await client.stat(uri);
        if (!info) return { content: [{ type: "text", text: `Not found: ${uri}` }] };
        return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }] };
      }
      // list
      const entries = await client.ls(uri);
      if (entries.length === 0) {
        return { content: [{ type: "text", text: `Empty directory: ${uri}` }] };
      }
      const lines = entries.map(e => `${e.isDir ? "📁" : "📄"} ${e.name}`);
      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  });

  // --- viking_remember ---
  pi.registerTool({
    name: "viking_remember",
    label: "Viking Remember",
    description: "Store a fact or memory in OpenViking. Stored as a session message and extracted into long-term memory on commit. Use for important information the agent should remember: preferences, decisions, gotchas, lessons learned.",
    promptSnippet: "Store a fact in OpenViking for cross-session persistence",
    promptGuidelines: [
      "Use viking_remember for facts that should survive across sessions but don't belong in MEMORY.md.",
      "Good for: user preferences, architectural decisions, gotchas, environment details.",
    ],
    parameters: Type.Object({
      content: Type.String({ description: "The fact or observation to store" }),
      category: Type.Optional(Type.String({ description: "Category hint: 'preference', 'entity', 'event', 'case', 'pattern'" })),
    }),
    async execute(
      _id: string, params: any, _signal: AbortSignal,
      _onUpdate: any, _ctx: any,
    ) {
      if (!client.connected) {
        return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      }
      // Store as a tagged message directly in OV — the extractor picks up [Remember — ...] prefix
      const rawCat = String(params.category ?? "general").toLowerCase().trim();
      const category = /^[a-z][a-z_-]{0,31}$/.test(rawCat) ? rawCat : "general";
      const tagged = `[Remember — ${category}] ${params.content}`;

      // Directly add to OV session if available
      let stored = false;
      if (sync?.sessionId) {
        stored = await client.addMessage(sync.sessionId, "user", tagged);
      }

      return {
        content: [{ type: "text", text: stored ? `Remembered in OpenViking: "${params.content}" (${category})` : `Queued for OpenViking: "${params.content}" (${category})` }],
        details: { stored, category, tagged },
      };
    },
  });

  // --- viking_forget ---
  pi.registerTool({
    name: "viking_forget",
    label: "Viking Forget",
    description: "Delete a memory by URI, or search for a specific memory and remove it. Use to correct outdated or wrong information.",
    promptSnippet: "Delete a memory from OpenViking by URI or query",
    parameters: Type.Object({
      uri: Type.Optional(Type.String({ description: "Exact viking:// URI to delete" })),
      query: Type.Optional(Type.String({ description: "Search query — deletes the strongest match if score > 0.8" })),
    }),
    async execute(
      _id: string, params: any, _signal: AbortSignal,
      _onUpdate: any, _ctx: any,
    ) {
      if (!client.connected) {
        return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      }
      if (params.uri) {
        const ok = await client.delete(params.uri);
        return {
          content: [{ type: "text", text: ok ? `Deleted: ${params.uri}` : `Failed to delete: ${params.uri}` }],
        };
      }
      if (params.query) {
        const results = await client.find(params.query, { topK: 1 });
        if (results.length > 0 && results[0].score > 0.8) {
          const ok = await client.delete(results[0].uri);
          return {
            content: [{ type: "text", text: ok ? `Deleted: ${results[0].uri}` : `Failed: ${results[0].uri}` }],
          };
        }
        return { content: [{ type: "text", text: "No strong match found (score > 0.8 required)." }] };
      }
      return { content: [{ type: "text", text: "Provide either 'uri' or 'query'." }] };
    },
  });

  // --- viking_add_resource ---
  pi.registerTool({
    name: "viking_add_resource",
    label: "Viking Add Resource",
    description: "Ingest a URL into OpenViking. The page is auto-processed into L0/L1/L2 tiers and indexed for semantic search. HTTP only — local file paths are not supported by the OV server.",
    promptSnippet: "Ingest a URL into OpenViking for indexed retrieval",
    parameters: Type.Object({
      url: Type.String({ description: "URL to ingest (HTTP/HTTPS only, no file paths)" }),
      reason: Type.Optional(Type.String({ description: "Why this resource is relevant (improves indexing)" })),
    }),
    async execute(
      _id: string, params: any, _signal: AbortSignal,
      _onUpdate: any, _ctx: any,
    ) {
      if (!client.connected) {
        return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      }
      // SSRF guard: only http/https, block private/link-local/loopback targets
      const check = isAllowedHttpUrl(params.url);
      if (!check.ok) {
        return { content: [{ type: "text", text: `Refused: ${check.reason}` }] };
      }
      const result = await client.addResource(params.url);
      if (!result) {
        return { content: [{ type: "text", text: `Failed to ingest: ${params.url}` }] };
      }
      return {
        content: [{ type: "text", text: `Ingested: ${result.root_uri}` }],
        details: result,
      };
    },
  });

  // --- viking_archive_expand ---
  pi.registerTool({
    name: "viking_archive_expand",
    label: "Viking Archive Expand",
    description: "Expand an archived session back into raw messages. Use when the archive summary is too coarse and you need detailed conversation history.",
    promptSnippet: "Expand an archived session to see raw conversation messages",
    parameters: Type.Object({
      archive_id: Type.Optional(Type.String({ description: "Archive ID to expand" })),
      session_id: Type.Optional(Type.String({ description: "OV session ID to expand" })),
    }),
    async execute(
      _id: string, params: any, _signal: AbortSignal,
      _onUpdate: any, _ctx: any,
    ) {
      if (!client.connected) {
        return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      }
      const sid = params.session_id ?? params.archive_id;
      if (!sid) {
        return { content: [{ type: "text", text: "Provide session_id or archive_id." }] };
      }
      // Read the session's overview — sessions are at viking://session/{sid}
      const uri = `viking://session/${sid}`;
      const content = await client.overview(uri);
      if (!content) {
        // Try reading the history subdirectory
        const history = await client.overview(`${uri}/history`);
        if (!history) {
          return { content: [{ type: "text", text: `Archive not found: ${sid}` }] };
        }
        return { content: [{ type: "text", text: history }] };
      }
      return { content: [{ type: "text", text: content }] };
    },
  });
  // --- viking_tree (optional: requires server >=0.4.14) ---
  pi.registerTool({
    name: "viking_tree",
    label: "Viking Tree",
    description: "Recursive directory tree of a viking:// scope (deeper than single ls). Prefer ls for a single known dir; use tree to orient inside an unfamiliar scope before deciding what to read.",
    promptSnippet: "Recursive viking:// directory tree",
    parameters: Type.Object({
      uri: Type.Optional(Type.String({ description: "viking:// URI (default: viking://)" })),
      level_limit: Type.Optional(Type.Number({ description: "Max depth (default server limit)" })),
      node_limit: Type.Optional(Type.Number({ description: "Max nodes returned" })),
    }),
    async execute(_id: string, params: any, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      if (!client.connected) return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      const uri = params.uri ?? "viking://";
      // fast-path: server without tree returns guidance without full round-trip after first probe
      if (_signal.aborted) return { content: [{ type: "text", text: "Aborted." }] };
      const nodes = await (client as any).tree(uri, { levelLimit: params.level_limit, nodeLimit: params.node_limit });
      if (nodes === null) return { content: [{ type: "text", text: "tree not supported on this OpenViking server (requires >=0.4.14). Use viking_browse list instead." }] };
      if (nodes.length === 0) return { content: [{ type: "text", text: `Empty tree: ${uri}` }] };
      const lines = nodes.map((n: any) => `${n.isDir ? "📁" : "📄"} ${n.rel_path ?? n.uri ?? n.name} ${n.isDir ? "" : `(${n.size ?? 0}B)`}`.trim());
      return { content: [{ type: "text", text: lines.join("\n") }], details: { nodes } };
    },
  });

  // --- viking_write (optional) ---
  pi.registerTool({
    name: "viking_write",
    label: "Viking Write",
    description: "Create or replace a file at a viking:// URI with exact content. Use for curated notes under viking://~/ (your user root) and shared reference material. Prefer edit for targeted replacements.",
    promptSnippet: "Write exact content to a viking:// file",
    parameters: Type.Object({
      uri: Type.String({ description: "viking:// URI to write (e.g., viking://~/memories/notes.md)" }),
      content: Type.String({ description: "File content to write" }),
      mode: Type.Optional(Type.String({ description: "Write mode hint (e.g., overwrite, append)" })),
    }),
    async execute(_id: string, params: any, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      if (!client.connected) return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      const ok = await (client as any).writeFile(params.uri, params.content, params.mode);
      return { content: [{ type: "text", text: ok ? `Written: ${params.uri}` : `Failed to write: ${params.uri}` }] };
    },
  });

  // --- viking_edit (optional) ---
  pi.registerTool({
    name: "viking_edit",
    label: "Viking Edit",
    description: "Targeted string replacement inside an existing viking:// file. Prefer over rewriting whole files; re-read the file first if your copy may be stale.",
    promptSnippet: "Targeted edit of a viking:// file",
    parameters: Type.Object({
      uri: Type.String({ description: "viking:// URI to edit" }),
      old_text: Type.String({ description: "Exact text to replace" }),
      new_text: Type.String({ description: "Replacement text" }),
    }),
    async execute(_id: string, params: any, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      if (!client.connected) return { content: [{ type: "text", text: "OpenViking server is not reachable." }] };
      const ok = await (client as any).editFile(params.uri, params.old_text, params.new_text);
      return { content: [{ type: "text", text: ok ? `Edited: ${params.uri}` : `Failed to edit: ${params.uri} (check old_text matches exactly)` }] };
    },
  });

  // --- viking_health (explicit health/status detail) ---
  pi.registerTool({
    name: "viking_health",
    label: "Viking Health",
    description: "OpenViking server health and system status (version, user identity, storage). Useful to diagnose connectivity or identity mismatch.",
    promptSnippet: "OpenViking health and system status",
    parameters: Type.Object({}),
    async execute(_id: string, _params: any, _signal: AbortSignal, _onUpdate: any, _ctx: any) {
      const healthy = await client.health();
      const status = await (client as any).systemStatus();
      const info: any = { connected: healthy, health: healthy ? "ok" : "unreachable" };
      if (status) Object.assign(info, status);
      return { content: [{ type: "text", text: JSON.stringify(info, null, 2) }], details: info };
    },
  });

}
