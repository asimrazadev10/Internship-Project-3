#!/usr/bin/env bash
# Verifies the media pipeline: uploads, derivatives, and the links from
# articles and authors to their images.
# Requires the dev server to be running: ./scripts/restart-dev.sh
set -u

BASE="http://localhost:1337"
fail=0

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

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
