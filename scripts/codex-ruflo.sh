#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ruflo_state="${RUFLO_STATE_DIR:-$repo_root/tools/ruflo/state}"
mkdir -p -- "$ruflo_state"
ruflo_command_toml="$(node -p 'JSON.stringify(process.argv[1])' "$repo_root/scripts/ruflo.sh")"
ruflo_state_toml="$(node -p 'JSON.stringify(process.argv[1])' "$ruflo_state")"
# CLI overrides preserve the inherited CODEX_HOME and other MCP registrations.
# This launches a new session; it cannot change an existing chat's tool registry.
exec codex -C "$repo_root" \
  -c "mcp_servers.ruflo.command=$ruflo_command_toml" \
  -c 'mcp_servers.ruflo.args=["mcp","start"]' \
  -c "mcp_servers.ruflo.cwd=$ruflo_state_toml" \
  -c 'mcp_servers.ruflo.startup_timeout_sec=120' \
  -c 'mcp_servers.ruflo.tool_timeout_sec=120' \
  "$@"
