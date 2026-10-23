#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ruflo_runtime="${RUFLO_RUNTIME_ROOT:-$repo_root/tools/ruflo}"
ruflo_state="${RUFLO_STATE_DIR:-$repo_root/tools/ruflo/state}"
if [[ "${1:-}" != '--skip-install' ]]; then
  if [[ $# -ne 0 ]]; then echo 'Usage: scripts/setup-ruflo.sh [--skip-install]' >&2; exit 2; fi
  npm ci --prefix "$ruflo_runtime" --no-audit --no-fund
elif [[ $# -ne 1 ]]; then
  echo 'Usage: scripts/setup-ruflo.sh [--skip-install]' >&2
  exit 2
fi
mkdir -p -- "$ruflo_state"
if [[ ! -f "$ruflo_state/.claude-flow/config.yaml" ]]; then
  "$repo_root/scripts/ruflo.sh" init --minimal --skip-claude --no-codex-detect --no-global --no-signup --no-skills-sh
fi
# The pinned CLI's config setter treats a false --value as missing. Update only
# the generated runtime configuration through its installed YAML parser instead.
node --input-type=module - "$ruflo_runtime" "$ruflo_state" <<'NODE'
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const [runtime, state] = process.argv.slice(2);
const require = createRequire(join(runtime, 'package.json'));
const YAML = require('yaml');
const settings = {
  hooks: { enabled: false, autoExecute: false }, swarm: { maxAgents: 3, autoScale: false },
  memory: { enableHNSW: false }, neural: { enabled: false }, mcp: { autoStart: false }, daemon: { autostart: false },
};
const yamlPath = join(state, '.claude-flow/config.yaml');
const jsonPath = join(state, 'claude-flow.config.json');
for (const [path, read, write] of [
  [yamlPath, YAML.parse, YAML.stringify], [jsonPath, JSON.parse, value => JSON.stringify(value, null, 2) + '\n'],
]) {
  const config = existsSync(path) ? read(readFileSync(path, 'utf8')) : {};
  for (const [key, values] of Object.entries(settings)) config[key] = { ...config[key], ...values };
  writeFileSync(path, write(config));
}
NODE
if [[ ! -f "$ruflo_state/.swarm/memory.db" ]]; then
  "$repo_root/scripts/ruflo.sh" memory init
fi
echo 'RuFlo setup complete. Run node tools/ruflo/verify.mjs to check stdio and persistence.'
