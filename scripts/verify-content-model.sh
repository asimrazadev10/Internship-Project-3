#!/usr/bin/env bash
# Verifies the content-modelling additions against the running Strapi:
# components, the article body dynamic zone, and the site-settings single type.
# Requires the dev server to be running: ./scripts/restart-dev.sh
set -u

BASE="http://localhost:1337"
fail=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-44s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-44s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" != "000" ]; then
    break
  fi
  sleep 1
done

echo "Content model verification"

check "GET /api/site-setting is public" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/site-setting")" "200"
# A single type has no create route, so POST is not the meaningful check here;
# PUT is the one the public role must be forbidden from.
check "PUT /api/site-setting is forbidden" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X PUT "$BASE/api/site-setting" \
     -H 'Content-Type: application/json' -d '{"data":{"tagline":"nope"}}')" "403"

settings=$(curl -s -g "$BASE/api/site-setting?populate[navLinks]=*")
check "site settings have a tagline" \
  "$(echo "$settings" | grep -c '"tagline":"[^"]')" "1"
check "site settings have nav links" \
  "$([ "$(echo "$settings" | grep -o '"label":"[^"]*"' | wc -l)" -ge 1 ] && echo yes || echo no)" "yes"

# populate=* does NOT reach inside dynamic-zone components, so this asserts the
# nested form actually returns block fields rather than empty objects.
blocks=$(curl -s -g "$BASE/api/articles?populate[body][populate]=*")
for component in rich-text pull-quote callout code; do
  check "body contains blocks.$component" \
    "$([ "$(echo "$blocks" | grep -c "\"__component\":\"blocks.$component\"")" -ge 1 ] \
       && echo yes || echo no)" "yes"
done
check "rich-text block has its body field populated" \
  "$([ "$(echo "$blocks" | grep -c '"body":"## Model the page')" -ge 1 ] && echo yes || echo no)" "yes"

articles=$(curl -s -g "$BASE/api/articles?populate[seo]=*")
check "an article carries an seo component" \
  "$([ "$(echo "$articles" | grep -c '"metaTitle":"[^"]')" -ge 1 ] && echo yes || echo no)" "yes"
check "an article is featured" \
  "$([ "$(echo "$articles" | grep -c '"featured":true')" -ge 1 ] && echo yes || echo no)" "yes"
check "an article carries a kicker" \
  "$([ "$(echo "$articles" | grep -c '"kicker":"[^"]')" -ge 1 ] && echo yes || echo no)" "yes"

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
