#!/usr/bin/env bash
# Sync supabase/functions/ to the staging Supabase host, then restart the functions container.
# Usage: scripts/staging/sync-functions.sh [--dry-run]
# Overrides: STAGING_HOST, STAGING_FUNCTIONS_DIR, STAGING_FUNCTIONS_CONTAINER.
set -euo pipefail

HOST="${STAGING_HOST:-root@178.156.223.148}"
REMOTE_DIR="${STAGING_FUNCTIONS_DIR:-/opt/quantic-impact/clients/saythanks-staging/supabase/docker/volumes/functions}"
CONTAINER="${STAGING_FUNCTIONS_CONTAINER:-saythanks-staging-functions-1}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

RSYNC_FLAGS=(-az --checksum)
DRY_RUN=0
if [[ "${1:-}" == "--dry-run" ]]; then
  RSYNC_FLAGS+=(--dry-run --itemize-changes)
  DRY_RUN=1
fi

# No --delete: host-only entries (hello, main) stay until a human removes them.
rsync "${RSYNC_FLAGS[@]}" "$ROOT/supabase/functions/" "$HOST:$REMOTE_DIR/"

if [[ "$DRY_RUN" -eq 1 ]]; then
  echo "dry run: container not restarted"
  exit 0
fi

ssh "$HOST" "docker restart '$CONTAINER' >/dev/null"
echo "synced supabase/functions to $HOST and restarted $CONTAINER"
