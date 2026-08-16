#!/usr/bin/env bash
# Verifies the Stripe checkout integration against a dev server.
#
# Runs in two phases. Phase A proves the site is unharmed by an unconfigured
# payment integration; it needs no Stripe account. Phase B proves a real
# Checkout Session is created, and runs only when STRIPE_SECRET_KEY is exported
# into this script's environment.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="http://localhost:3000"
LOG="/tmp/next-stripe.log"
fail=0
server_pgid=""

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-42s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-42s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

stop_server() {
  if [ -n "$server_pgid" ]; then
    kill -TERM -"$server_pgid" >/dev/null 2>&1
    server_pgid=""
    sleep 2
  fi
}
trap stop_server EXIT

# Starts the dev server with STRIPE_SECRET_KEY set to whatever is passed in.
# An empty value wins over any .env.local entry, which is how phase A forces
# the unconfigured case.
start_server() {
  : > "$LOG"
  (cd "$ROOT/frontend" && exec setsid env STRIPE_SECRET_KEY="$1" npm run dev >> "$LOG" 2>&1) &
  server_pgid=$!
  for _ in $(seq 1 60); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" = "200" ]; then
      return 0
    fi
    sleep 1
  done
  echo "Next did not start within 60s. See $LOG"
  exit 1
}

if [ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:1337/api/articles)" != "200" ]; then
  echo "Strapi is not answering on :1337. Run ./scripts/restart-dev.sh first."
  exit 1
fi

echo "Stripe verification"
echo "  phase A: unconfigured"

start_server ""

check "GET / with no Stripe key" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" "200"
check "GET /subscribe/cancelled" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/subscribe/cancelled")" "200"
check "GET /subscribe/success with no id" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/subscribe/success")" "200"
check "POST /api/checkout without a key" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/checkout")" "503"
check "GET /api/checkout is refused" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/checkout")" "405"
check "webhook rejects a bogus signature" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/stripe/webhook" \
     -H 'stripe-signature: t=1,v1=bogus' -H 'Content-Type: application/json' \
     -d '{"id":"evt_1","type":"checkout.session.completed"}')" "400"
check "webhook rejects a missing signature" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/stripe/webhook" \
     -H 'Content-Type: application/json' -d '{}')" "400"

if curl -s "$WEB/" | grep -q 'action="/api/checkout"'; then
  check "masthead posts to the checkout route" "yes" "yes"
else
  check "masthead posts to the checkout route" "no" "yes"
fi

stop_server

echo "  phase B: live Stripe test key"

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "  SKIP  no STRIPE_SECRET_KEY in the environment — live session check not run."
  echo "        Run: STRIPE_SECRET_KEY=sk_test_... ./scripts/verify-stripe.sh"
else
  start_server "$STRIPE_SECRET_KEY"

  location=$(curl -s -o /dev/null -w '%{redirect_url}' -X POST "$WEB/api/checkout")
  case "$location" in
    https://checkout.stripe.com/*) check "POST /api/checkout redirects to Stripe" "yes" "yes" ;;
    *) printf '  FAIL  %-42s got %s\n' "POST /api/checkout redirects to Stripe" "${location:-<none>}"; fail=1 ;;
  esac

  stop_server
fi

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
