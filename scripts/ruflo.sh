#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
ruflo_runtime="${RUFLO_RUNTIME_ROOT:-$repo_root/tools/ruflo}"
ruflo_state="${RUFLO_STATE_DIR:-$repo_root/tools/ruflo/state}"
if [[ ! -x "$ruflo_runtime/node_modules/.bin/ruflo" ]]; then
  echo 'RuFlo is not installed. Run scripts/setup-ruflo.sh first.' >&2
  exit 1
fi
mkdir -p -- "$ruflo_state"
export RUFLO_DAEMON_AUTOSTART=0
export RUFLO_FUNNEL=0
cd -- "$ruflo_state"
exec "$ruflo_runtime/node_modules/.bin/ruflo" "$@"
