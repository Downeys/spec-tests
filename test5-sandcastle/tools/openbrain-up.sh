#!/usr/bin/env bash
# tools/openbrain-up.sh — OpenBrain bring-up (bash parity).
#
# Primary wrapper is tools/openbrain-up.ps1 per user_shell_preference; this is
# the bash equivalent for non-Windows shells.
#
# Usage (from repo root):
#   ./tools/openbrain-up.sh

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

echo 'OpenBrain: starting docker compose service...'
docker compose up -d openbrain

echo 'OpenBrain: waiting for healthcheck...'
TIMEOUT_SECONDS=60
DEADLINE=$(( $(date +%s) + TIMEOUT_SECONDS ))
while :; do
  HEALTH=$(docker inspect --format '{{.State.Health.Status}}' openbrain 2>/dev/null || echo 'missing')
  if [ "$HEALTH" = 'healthy' ]; then
    echo 'OpenBrain: healthy.'
    break
  fi
  if [ "$(date +%s)" -gt "$DEADLINE" ]; then
    echo "OpenBrain did not become healthy within ${TIMEOUT_SECONDS}s. Last status: $HEALTH" >&2
    exit 1
  fi
  sleep 1
done

echo 'OpenBrain: applying migrations...'
pnpm db:migrate

echo 'OpenBrain: ready.'
