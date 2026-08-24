<p align="center">
  <img src="assets/banner.png" alt="OpenViking × OMP — Persistent memory & context for OMP agents — viking:// — Knowledge · Memory · Context · Autonomy" width="100%" />
</p>

<p align="center">
  <a href="https://github.com/cortexc0de/omp-openviking-memory"><img src="https://img.shields.io/badge/plugin-omp--openviking--memory-7c5cff?style=flat-square&labelColor=0f0f1a" alt="plugin" /></a>
  <a href="https://github.com/volcengine/OpenViking"><img src="https://img.shields.io/badge/upstream-OpenViking-2a6bff?style=flat-square&labelColor=0f1420" alt="upstream OpenViking" /></a>
  <a href="https://omp.sh"><img src="https://img.shields.io/badge/harness-Oh%20My%20Pi%20%28OMP%29-ff2e7a?style=flat-square&labelColor=1a0f1a" alt="OMP" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D18-2ecc71?style=flat-square&labelColor=0f1a12" alt="node >=18" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-AGPL--3.0-9a9aaa?style=flat-square&labelColor=0f0f1a" alt="license AGPL-3.0" /></a>
</p>

<p align="center">
  <strong>Top-tier memory plugin for <a href="https://omp.sh">Oh My Pi</a> via <a href="https://github.com/volcengine/OpenViking">OpenViking</a>.</strong><br/>
  Auto-recall before every prompt · capture after every turn · <code>viking://</code> filesystem · 11 tools · slash <code>/ov</code>
</p>

<p align="center">
  <code>omp plugin marketplace add github:cortexc0de/omp-openviking-memory && omp plugin install omp-openviking-memory</code>
</p>

---

## What it is

Native port of [`examples/pi-coding-agent-extension`](https://github.com/volcengine/OpenViking/tree/main/examples/pi-coding-agent-extension) for **OMP** (`can1357/oh-my-pi`, fork of `pi`). Works as an **OMP Extension** and as an **Agent Plugins 1.0** package — `mcp.json` → `servers/mcp-proxy.mjs` (stdio → streamable HTTP) is there as fallback; without the Extension lifecycle there's no auto-recall/capture.

> **Requires an OpenViking server** — local `http://127.0.0.1:1933` or remote. Quick check: `curl http://127.0.0.1:1933/health`.

## Why this one

- **Current-prompt recall, not stale prefetch.** `before_agent_start` queues the prompt, `context` awaits `fetchAssembledContext` with `mode="context"` (15s / 45s fused deadlines).
- **Ledger-stabilized prompt cache.** `~/.openviking/omp-recall-ledger/` re-applies byte-identical recall blocks to historical turns (#4137).
- **Full capture pipeline.** `syncBranch` after each turn → `pending-queue` replay on next session, `takeover` or plain `commit()` + rehydration.
- **`viking://` uri-guard.** `read`/`bash`/`glob`/`grep` on `viking://` are redirected to `viking_read`/`viking_search`.

## Install

### Recommended — marketplace plugin

```bash
# from a clone
omp plugin marketplace add ./ --scope project
omp plugin install omp-openviking-memory@omp-openviking-memory-marketplace --scope project
omp plugin list   # omp-openviking-memory@0.2.0
```

From GitHub:

```bash
omp plugin marketplace add github:cortexc0de/omp-openviking-memory --scope project
omp plugin install omp-openviking-memory --scope project
```

Dev links without publishing: `omp plugin install --force ./ --scope project` — on Windows a `mklink /J` is enough (Developer Mode).

### Credentials

1. `OPENVIKING_*` env — `OPENVIKING_URL`, `OPENVIKING_API_KEY` / `OPENVIKING_BEARER_TOKEN`, `OPENVIKING_ACCOUNT`, `OPENVIKING_USER`, `OPENVIKING_PEER_ID`
2. `~/.openviking/ovcli.conf` (`url`, `api_key`, `account`, `user`)
3. `~/.openviking/ov.conf` (`server.url` / `host`+`port`, `server.root_api_key`)
4. Default `http://127.0.0.1:1933`

Peer: derived from `OPENVIKING_PEER_ID` or `cwd` via `workspace-peer` (per-project isolation). Disable with `OPENVIKING_WORKSPACE_PEER=0`. Recall scope: `OPENVIKING_RECALL_PEER_SCOPE=actor|all`.

```bash
curl http://127.0.0.1:1933/health
node scripts/setup.mjs   # wizard for ovcli.conf
```

### Behavior config

`config.json` / `extensions/config.json`:

```json
{
  "enabled": true,
  "syncTurns": true,
  "recallTokenBudget": 2000,
  "scoreThreshold": 0.35,
  "minQueryLength": 3,
  "profileTokenBudget": 10000,
  "resumeContextBudget": 32000,
  "commitTokenThreshold": 20000,
  "takeover": { "enabled": false, "tokenThreshold": 30000, "keepRecentTurns": 3, "overviewBudget": 3000, "overviewPollMs": 2000, "overviewPollMax": 15 }
}
```

`takeover.enabled: false` by default for coexistence with `memory.backend` (Pi defaults to `true`).

## Lifecycle

| Event | What happens |
|---|---|
| `session_start` | `health()` → `ensureSession(ov-…)` → `replayPending()` → profile + archive overview |
| `before_agent_start` | `queueSearch(prompt)` — no I/O, zero UI latency |
| `context` | `fetchAssembledContext` + ledger injection |
| `turn_end` | `syncBranch` → OV, `takeover.onTurnSynced`, footer `OV ✓/✗ · ↩` |
| `session_before_compact` | takeover **or** `commit()` + rehydration |
| `session_shutdown` | `commit()` (2s budget) |

## Tools (11) · Commands · Skill

**Tools** — `viking_search`, `viking_read`, `viking_browse`, `viking_remember`, `viking_forget`, `viking_add_resource`, `viking_archive_expand`, `viking_tree` (≥0.4.14), `viking_write`, `viking_edit`, `viking_health`. `tree`/`write`/`edit` are optional: on unsupported servers they return guidance instead of failing.

**Guard** — `viking://` on `read`/`bash`/`glob`/`grep` → redirect to `viking_read`/`viking_search`.

**Commands** — `/viking` and `/ov`: `status`/`health` (default, shows `systemStatus`), `commit`/`flush` (forced sync + commit).

**Skill** — `skill://openviking-memory` (`skills/openviking-memory/SKILL.md` + `references/optional-tools.md`) + slash file `commands/ov.md`.

## Coexistence with OMP `memory.backend`

| `memory.backend` | OMP behavior | OV recommendation |
|---|---|---|
| `off` (default) | no built-in memory | `takeover.enabled: true` is fine if you want OV to own compaction |
| `local` | `MEMORY.md` guidance (~5000 tok) | `takeover.enabled: false` (default) — both layers inject, no compaction fight |
| `hindsight` / `mnemopi` | remote backend, owns `session_before_compact` | `takeover.enabled: false` — only `commit()`, no `{compaction}` |

## MCP fallback

`mcp.json` exposes the stdio proxy (`servers/mcp-proxy.mjs`, `MAX_CONCURRENT_REQUESTS=16`, `Mcp-Session-Id`, credential hot-reload). Without Extension lifecycle, auto-memory is off — manual tool calls only.

## Development

```bash
npm test                          # node --test — 23 cases
node --check extensions/openviking.ts
node --check src/tools.ts
omp plugin doctor                 # 6 ok
```

Vendored `shared/` + `lib/` are copied from `examples/memory-plugin-shared/lib` via `GENERATED FROM` headers.

## License

`AGPL-3.0` — same as OpenViking.

---

<p align="center">
  <sub>Built on <a href="https://github.com/volcengine/OpenViking">OpenViking</a> · for <a href="https://omp.sh">Oh My Pi</a></sub>
</p>
