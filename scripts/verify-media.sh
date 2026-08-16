#!/usr/bin/env bash
# Verifies the media pipeline: uploads, derivatives, and the links from
# articles and authors to their images.
# Requires the Strapi dev server to be running: ./scripts/restart-dev.sh
# Starts its own Next dev server on :3000 to check rendered pages.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BASE="http://localhost:1337"
WEB_PORT=3000
WEB="http://localhost:$WEB_PORT"
WEB_LOG="/tmp/next-media.log"
fail=0
web_pgid=""

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-46s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-46s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" != "000" ]; then
    break
  fi
  sleep 1
done

web_port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":$WEB_PORT[[:space:]]"
  else
    curl -s -o /dev/null --max-time 2 "$WEB/"
  fi
}

stop_web_server() {
  if [ -n "$web_pgid" ]; then
    kill -TERM -"$web_pgid" >/dev/null 2>&1
    web_pgid=""
    sleep 2
  fi
}
trap stop_web_server EXIT

# Refuses to run when something already holds the port, the same guard
# verify-stripe.sh uses: without it this script would silently test whatever
# was already running on :3000 instead of a server built from this checkout.
if web_port_in_use; then
  echo "Port $WEB_PORT is already in use."
  echo "This script starts its own Next dev server there. Stop whatever is"
  echo "running first:"
  echo "  kill \$(ss -ltnp 2>/dev/null | grep ':$WEB_PORT' | grep -oP 'pid=\\K[0-9]+' | head -1)"
  exit 1
fi

# A dev server, not a production build: this script needs to stay fast, and
# next dev is enough to prove next/image accepted the remotePatterns entry.
: > "$WEB_LOG"
(cd "$ROOT/frontend" && exec setsid npm run dev >> "$WEB_LOG" 2>&1) &
web_pgid=$!
web_up=0
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" = "200" ]; then
    web_up=1
    break
  fi
  sleep 1
done
if [ "$web_up" -ne 1 ]; then
  echo "Next dev server did not start within 60s. See $WEB_LOG"
  fail=1
fi

echo "Media verification"

# Deliberately NOT probing /api/upload/files: it is not public, so asserting
# against it would fail for the wrong reason or tempt someone into widening
# public permissions to make a test pass. Populated relations prove the upload.
#
# Each populated cover carries its own url plus four derivative urls
# (thumbnail, small, medium, large), so counting "url" occurrences massively
# over-counts. What actually matters is how many ARTICLES have a non-null
# cover, so this parses the JSON rather than grepping for URL strings.
covers=$(curl -sg "$BASE/api/articles?populate[cover]=true")

check "exactly four articles exist" \
  "$(echo "$covers" | python3 -c 'import json,sys; print(len(json.load(sys.stdin)["data"]))')" "4"
check "exactly three articles carry a cover" \
  "$(echo "$covers" | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(sum(1 for a in d if a.get("cover")))')" "3"
check "build-a-blog-frontend-in-an-afternoon has no cover" \
  "$(echo "$covers" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"]
a=next((x for x in d if x.get("slug")=="build-a-blog-frontend-in-an-afternoon"), None)
print("no-cover" if a and not a.get("cover") else "has-cover-or-missing")
')" "no-cover"
check "a cover exposes the thumbnail and small derivatives" \
  "$(echo "$covers" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"]
covers=[a["cover"] for a in d if a.get("cover")]
ok = any("thumbnail" in c.get("formats",{}) and "small" in c.get("formats",{}) for c in covers)
print("yes" if ok else "no")
')" "yes"
check "covers carry non-empty alternative text" \
  "$(echo "$covers" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"]
covers=[a["cover"] for a in d if a.get("cover")]
ok = all((c.get("alternativeText") or "").strip() for c in covers) and len(covers) > 0
print("yes" if ok else "no")
')" "yes"

authors=$(curl -sg "$BASE/api/authors?populate[avatar]=true")
check "exactly two authors have an avatar" \
  "$(echo "$authors" | python3 -c 'import json,sys; d=json.load(sys.stdin)["data"]; print(sum(1 for a in d if a.get("avatar")))')" "2"

blocks=$(curl -sg "$BASE/api/articles?populate[body][populate]=*")
check "an image block exists in an article body with a populated image" \
  "$(echo "$blocks" | python3 -c '
import json,sys
d=json.load(sys.stdin)["data"]
found = False
for a in d:
    for b in (a.get("body") or []):
        if b.get("__component") == "blocks.image":
            img = b.get("image")
            if img and img.get("url"):
                found = True
print("yes" if found else "no")
')" "yes"

# Checking a RENDERED page rather than trusting next.config.ts: a wrong
# remotePatterns entry fails only at render time (next/image 400s the
# upstream), so the config file alone proves nothing.
if [ "$web_up" -eq 1 ]; then
  check "home page renders a next/image or /uploads/ URL" \
    "$(curl -s "$WEB/" | grep -qE '(/_next/image|/uploads/)' && echo yes || echo no)" "yes"
  check "coverless article page returns 200" \
    "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/articles/build-a-blog-frontend-in-an-afternoon")" "200"
else
  check "home page renders a next/image or /uploads/ URL" "SKIP:no server" "yes"
  check "coverless article page returns 200" "SKIP:no server" "200"
fi

stop_web_server

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
