---
description: OpenViking memory — status, commit and health for the omp-openviking-memory extension.
---

# /ov — OpenViking helper

You have the **omp-openviking-memory** extension installed. This slash command is a convenience wrapper around the same operations the LLM tools expose.

- **Status / health**: run `/viking` or `/viking status` (also `/ov`) to see whether the OpenViking server is reachable, the current `ov-` session id, takeover stats and `systemStatus` user/account.
- **Commit**: run `/viking commit` (or `/ov commit`) to force a sync + commit of the current conversation into the OpenViking memory store.
- **Recall and persist via tools**: the skill `skill://openviking-memory` describes the recommended retrieval flow (`find` → judged `read`) and `remember`/`add_resource`/`write`/`edit` for persisting knowledge. Prefer those tools over manual URI guesses.

If the server is unreachable, check `OPENVIKING_URL`, `OPENVIKING_API_KEY` / `~/.openviking/ovcli.conf`, or `ov status` on the server host.
