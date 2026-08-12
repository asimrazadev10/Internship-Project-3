#!/usr/bin/env bash
# Verifies the blog content model against the spec's acceptance criteria.
# Requires the dev server to be running: ./scripts/restart-dev.sh
set -u

BASE="http://localhost:1337"
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

# Counts documents in a list response by counting documentId occurrences.
count() { curl -s "$BASE/api/$1" | grep -o '"documentId"' | wc -l | tr -d ' '; }

# Counts non-null slugs in a list response.
slugs() { curl -s "$BASE/api/$1" | grep -o '"slug":"[^"]*"' | wc -l | tr -d ' '; }

# The dev server restarts itself whenever a project file changes. Curling
# during that window returns 000 and every check fails misleadingly, so wait
# for the server to answer before testing anything.
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" != "000" ]; then
    break
  fi
  sleep 1
done

echo "Blog API verification"

check "GET /api/articles status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" "200"
check "article count" "$(count articles)" "4"
check "author count" "$(count authors)" "2"
check "category count" "$(count categories)" "3"

check "article slugs populated" "$(slugs articles)" "4"
check "category slugs populated" "$(slugs categories)" "3"

populated=$(curl -s "$BASE/api/articles?populate=*")

if echo "$populated" | grep -q '"author":{'; then
  check "articles populate author" "yes" "yes"
else
  check "articles populate author" "no" "yes"
fi

if echo "$populated" | grep -q '"categories":\[{'; then
  check "articles populate categories" "yes" "yes"
else
  check "articles populate categories" "no" "yes"
fi

check "POST /api/articles is forbidden" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/articles" \
     -H 'Content-Type: application/json' -d '{"data":{"title":"nope"}}')" "403"
check "PUT /api/articles/1 is forbidden" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/articles/1" \
     -H 'Content-Type: application/json' -d '{"data":{"title":"nope"}}')" "403"
check "DELETE /api/articles/1 is forbidden" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X DELETE "$BASE/api/articles/1")" "403"

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
