# omp-openviking-memory — топовый плагин памяти для Oh My Pi

Long-term semantic memory для [Oh My Pi](https://omp.sh) через [OpenViking](https://github.com/volcengine/OpenViking) — авто-recall перед каждым промптом, capture после каждого хода, **11** `viking://` инструментов, slash-команды `/ov`/`/viking`, tree/write/edit.

> Native-порт [`examples/pi-coding-agent-extension`](https://github.com/volcengine/OpenViking/tree/main/examples/pi-coding-agent-extension) для OMP (`can1357/oh-my-pi`, fork `pi`). Работает как OMP Extension **и** как Agent Plugins 1.0 package (MCP fallback — `mcp.json` → `servers/mcp-proxy.mjs`).

## Установка

### Рекомендуемый путь — marketplace plugin

```bash
omp plugin marketplace add ./ --scope project   # из корня репо
omp plugin install omp-openviking-memory@omp-openviking-memory-marketplace --scope project
omp plugin list  # omp-openviking-memory@0.2.0
```

После публикации на GitHub:

```bash
omp plugin marketplace add github:YOUR_ORG/omp-openviking-memory --scope project
omp plugin install omp-openviking-memory --scope project
```

Локальная разработка без публикации: `omp plugin install --force ./ --scope project` (требует `mklink /J` на Windows — достаточно Developer Mode).

### Credentials

Приоритет:

1. `OPENVIKING_*` env (`OPENVIKING_URL`, `OPENVIKING_API_KEY` / `OPENVIKING_BEARER_TOKEN`, `OPENVIKING_ACCOUNT`, `OPENVIKING_USER`, `OPENVIKING_PEER_ID`)
2. `~/.openviking/ovcli.conf` (`url`, `api_key`, `account`, `user`)
3. `~/.openviking/ov.conf` (`server.url` / `host`+`port`, `server.root_api_key`)
4. Default `http://127.0.0.1:1933`

Peer: `OPENVIKING_PEER_ID` или `cwd → workspace-peer` (изоляция по проекту), выключается `OPENVIKING_WORKSPACE_PEER=0`. Scope recall: `OPENVIKING_RECALL_PEER_SCOPE=actor|all`.

Быстрая проверка: `curl http://127.0.0.1:1933/health` или `node scripts/setup.mjs` (визард для `ovcli.conf`).

### Конфиг поведения (`config.json` / `extensions/config.json`)

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

`takeover.enabled: false` по умолчанию — coexistence с `memory.backend` OMP (см. ниже); у Pi дефолт `true`.

## Что умеет

| Событие / поверхность | Что делает |
|---|---|
| `session_start` | `health()` → `ensureSession(ov-…)` → `replayPending()` → profile + archive overview |
| `before_agent_start` | `queueSearch(prompt)` — без I/O, 0-задержка UI |
| `context` | `fetchAssembledContext mode="context"` (15s/45s), ledger-стабилизация для prompt-cache |
| `turn_end` | `syncBranch` → OV, `takeover.onTurnSynced`, footer `OV ✓/✗ · ↩` |
| `session_before_compact` | takeover **или** `commit()` + rehydration |
| `session_shutdown` | `commit()` (бюджет 2s) |

Инструменты (11): `viking_search`, `viking_read`, `viking_browse`, `viking_remember`, `viking_forget`, `viking_add_resource`, `viking_archive_expand`, `viking_tree` (≥0.4.14), `viking_write`, `viking_edit`, `viking_health`. `tree`/`write`/`edit` — optional: если сервер их не поддерживает, возвращают подсказку вместо падения.

Дополнительно: `viking://` uri-guard на `read`/`bash`/`glob`/`grep` — редиректит на `viking_read`/`viking_search`; команды `/viking` и `/ov` (`commit`/`status`/`health`).

Skill: `skills/openviking-memory/SKILL.md` (находит OMP skill loader) + `references/optional-tools.md`. Slash: `commands/ov.md`.

## Coexistence с `memory.backend` OMP

| `memory.backend` | OMP | Рекомендация OV |
|---|---|---|
| `off` (default) | нет встроенной памяти | `takeover.enabled: true` допустим, если хотите отдать compaction OV |
| `local` | `MEMORY.md` guidance ~5000tok | `takeover.enabled: false` (default) — оба инжектят, без драки за compaction |
| `hindsight` / `mnemopi` | удалённый backend, владеет `session_before_compact` | `takeover.enabled: false` — только `commit()`, без `{compaction}` |

## Команды

- `/viking`, `/ov` — `status` (дефолт, показывает `systemStatus`), `commit`/`flush` — форсированный sync+commit, `health` — алиас status.
- В TUI `/marketplace install` ставит плагин; `omp plugin list` / `omp plugin doctor` — проверка.

## Optional MCP fallback

`mcp.json` отдаёт stdio→streamable-HTTP прокси (`servers/mcp-proxy.mjs`, `MAX_CONCURRENT_REQUESTS=16`, `Mcp-Session-Id`, hot-reload по `stat`). Без ExtensionAPI автопамять не работает — MCP alone = ручные вызовы.

## Лицензия

`AGPL-3.0` — вендор `shared/`/`lib/` скопированы из `examples/memory-plugin-shared/lib`.

## Разработка

```bash
npm test            # node --test — 20+ кейсов
node --check extensions/openviking.ts
node --check src/tools.ts
```
