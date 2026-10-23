# RuFlo runtime helpers

The portable runtime pins `ruflo` and `@claude-flow/cli` to **3.38.23**, with its dependency tree in `tools/ruflo/package-lock.json`. Node 20+ and npm are required; the verified workspace uses Node 24. Existing application dependencies, agent hooks, Codex trust settings and credentials are not modified.

```bash
scripts/setup-ruflo.sh
scripts/ruflo.sh --version
node tools/ruflo/verify.mjs
node tools/ruflo/mcp-call.mjs system_health '{}'
node tools/ruflo/mcp-call.mjs --list
scripts/codex-ruflo.sh mcp list --json
```

Run `scripts/codex-ruflo.sh` without extra arguments to start a new Codex CLI session in this checkout. The launcher supplies one MCP registration through CLI overrides and preserves the inherited `CODEX_HOME`. It does not change this chat's live tool registry; native MCP tools require a host-loaded registration or a new session. Terminal SDK calls are available through `mcp-call.mjs` independently.

By default dependencies live in `tools/ruflo/node_modules` and all generated configuration, SQLite databases, logs and receipts live under `tools/ruflo/state`. These directories are ignored. The setup disables daemon autostart, hooks, neural workers, MCP autostart and swarm autoscaling, caps the swarm at three agents, and does not start model workers. Keep database files, credentials and generated state out of commits and source archives.

To reuse a verified installation without reinstalling it:

```bash
export RUFLO_RUNTIME_ROOT=/workspace/tools/ruflo
export RUFLO_STATE_DIR=/tmp/lms-ruflo-check
scripts/setup-ruflo.sh --skip-install
node tools/ruflo/verify.mjs
```

Both paths can be placed elsewhere; repository paths are derived from the scripts' own locations. `--skip-install` requires an existing complete runtime. Setup preserves an existing memory database and never uses `memory init --force`.

Verification connects over real stdio, discovers tools, checks memory/config/MCP health, writes a unique marker, restarts the server, retrieves the marker, and executes a search that returns it. It makes no model calls. Mock embeddings may be active: this proves persistence and query execution, not semantic relevance, HNSW acceleration, model-provider readiness or successful execution of every discovered tool. The receipt is written to `$RUFLO_STATE_DIR/receipts/mcp-verification.json` (or the default state directory).

The current managed workspace blocks Node subprocess stdio in its default sandbox (`EPERM`, surfaced by the SDK as a closed connection). The same verification passed with the approved local subprocess escalation. Codex registration was checked with process-local CLI overrides; global authentication, trust and configuration were preserved.

`production-readonly-catalog.sql` is a separate, read-only Supabase catalog snapshot for an independently verified production target. It does not establish the deployed commit or image identity. Run neither migrations nor local regression fixtures against production.
