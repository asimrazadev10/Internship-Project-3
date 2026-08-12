#!/usr/bin/env bash
# Stops the Strapi dev server.
#
# This lives in a script file on purpose: running `pkill -f "strapi develop"`
# as an inline shell command makes the pattern match the invoking shell's own
# command line, which kills the caller instead of the server.
set -u

pkill -f "strapi develop" >/dev/null 2>&1
sleep 3

if pgrep -f "strapi develop" >/dev/null 2>&1; then
  echo "STILL RUNNING"
  exit 1
fi

echo "STOPPED"
