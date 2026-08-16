#!/usr/bin/env bash
# Verifies ISR behavior against a production build of the Next.js frontend.
# ISR does not behave like this in dev mode, so this builds and starts the app.
# Requires Strapi to be running: ./scripts/restart-dev.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMS="http://localhost:1337"
WEB="http://localhost:3000"
LOG="/tmp/next-isr.log"
SECRET="${REVALIDATE_SECRET:-dev-secret-change-me}"
HERO_SLUG="css-has-quietly-become-a-good-language"
OTHER_SLUG="why-your-database-schema-is-your-real-api"
fail=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-42s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-42s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

# Pulls the render stamp out of a page. It changes only when the page is
# regenerated, which is exactly what ISR invalidation should cause.
stamp() {
  curl -s "$WEB$1" | grep -o 'data-render-stamp="[^"]*"' | head -1 | cut -d'"' -f2
}

cleanup() {
  # `npm run start` forks `next start`, which in turn forks the actual
  # next-server listener; killing only the top pid leaves next-server
  # running, so sweep every process in the chain by pattern.
  pkill -f "npm run start" >/dev/null 2>&1
  pkill -f "next start" >/dev/null 2>&1
  pkill -f "next-server" >/dev/null 2>&1
}
trap cleanup EXIT

if [ "$(curl -s -o /dev/null -w '%{http_code}' "$CMS/api/articles")" != "200" ]; then
  echo "Strapi is not answering on $CMS. Run ./scripts/restart-dev.sh first."
  exit 1
fi

echo "Building the frontend (production)"
if ! (cd "$ROOT/frontend" && npm run build > "$LOG" 2>&1); then
  echo "Build FAILED. See $LOG"
  exit 1
fi

(cd "$ROOT/frontend" && nohup npm run start >> "$LOG" 2>&1 &)
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" = "200" ]; then
    break
  fi
  sleep 1
done

echo "ISR verification"

check "GET / status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" "200"
check "GET /articles/<slug> status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/articles/$HERO_SLUG")" "200"
check "GET unknown article is 404" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/articles/does-not-exist")" "404"
check "GET /categories/engineering status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/categories/engineering")" "200"

# A prerendered page serves the same stamp on repeat requests.
first=$(stamp "/articles/$HERO_SLUG")
second=$(stamp "/articles/$HERO_SLUG")
if [ -n "$first" ] && [ "$first" = "$second" ]; then
  check "article page is served from cache" "same" "same"
else
  check "article page is served from cache" "changed" "same"
fi

check "revalidate rejects a wrong secret" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/revalidate" \
     -H 'Content-Type: application/json' -H 'x-revalidate-secret: wrong' \
     -d '{"model":"article","entry":{"slug":"'"$HERO_SLUG"'"}}')" "401"
check "revalidate rejects a missing secret" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/revalidate" \
     -H 'Content-Type: application/json' -d '{"model":"article"}')" "401"

# Record the neighbour before invalidating, to prove tag scoping afterwards.
other_before=$(stamp "/articles/$OTHER_SLUG")

revalidated=$(curl -s -X POST "$WEB/api/revalidate" \
  -H 'Content-Type: application/json' -H "x-revalidate-secret: $SECRET" \
  -d '{"model":"article","entry":{"slug":"'"$HERO_SLUG"'"}}')
echo "  note  revalidate response: $revalidated"

# Next may serve one stale response while regenerating, so poll briefly.
changed="no"
for _ in $(seq 1 10); do
  if [ "$(stamp "/articles/$HERO_SLUG")" != "$first" ]; then
    changed="yes"
    break
  fi
  sleep 1
done
check "webhook regenerates the article page" "$changed" "yes"

other_after=$(stamp "/articles/$OTHER_SLUG")
if [ "$other_before" = "$other_after" ]; then
  check "other articles are left cached" "untouched" "untouched"
else
  check "other articles are left cached" "regenerated" "untouched"
fi

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
