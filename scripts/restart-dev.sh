#!/usr/bin/env bash
# Restarts the Strapi dev server in the background and waits for it to boot.
# Usage: ./scripts/restart-dev.sh [log-path]
set -u

LOG="${1:-/tmp/strapi.log}"
cd "$(dirname "$0")/.." || exit 1

# Kill any running dev server. Running this from a script file (rather than
# an inline shell command) is what keeps the pattern from matching the
# caller's own command line and killing it mid-restart.
pkill -f "strapi develop" >/dev/null 2>&1
sleep 3

: > "$LOG"
nohup npm run develop >> "$LOG" 2>&1 &

for _ in $(seq 1 60); do
  if grep -q "Strapi started successfully" "$LOG" 2>/dev/null; then
    echo "BOOTED"
    exit 0
  fi
  sleep 1
done

echo "DID NOT BOOT within 60s"
exit 1
