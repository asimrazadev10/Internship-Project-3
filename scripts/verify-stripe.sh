#!/usr/bin/env bash
# Verifies the Stripe PaymentIntents integration.
#
# Phase A exercises the webhook receiver in Strapi and needs no Next server. It
# posts GENUINELY SIGNED events, so it tests real signature verification rather
# than only proving that bad signatures are rejected.
#
# Phase B exercises the Next.js subscription endpoint and the Payment Element
# page. It needs port 3000 and a live test key.
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT=3000
WEB="http://localhost:$PORT"
CMS="http://localhost:1337"
LOG="/tmp/next-stripe.log"
fail=0
server_pgid=""

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-46s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-46s got %s, want %s\n' "$label" "$actual" "$expected"
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

port_in_use() {
  if command -v ss >/dev/null 2>&1; then
    ss -ltn 2>/dev/null | grep -q ":$PORT[[:space:]]"
  else
    curl -s -o /dev/null --max-time 2 "$WEB/"
  fi
}

# Refuses to run when something already holds the port: otherwise our server
# fails to bind, the readiness loop still sees 200 from the FOREIGN server, and
# every check silently measures a process this script does not control.
require_port_free() {
  if port_in_use; then
    echo "Port $PORT is already in use."
    echo "This script starts its own dev server there and would otherwise test"
    echo "whatever is already running. Stop it first:"
    echo "  kill \$(ss -ltnp 2>/dev/null | grep ':$PORT' | grep -oP 'pid=\\K[0-9]+' | head -1)"
    exit 1
  fi
}

start_server() {
  require_port_free
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

if [ "$(curl -s -o /dev/null -w '%{http_code}' "$CMS/api/articles")" != "200" ]; then
  echo "Strapi is not answering on :1337. Run ./scripts/restart-dev.sh first."
  exit 1
fi

# The webhook secret lives in the repo-root .env, because the receiver is in
# Strapi. Read ONLY the two variables we need.
#
# Do not source that file: it also sets PORT=1337 for Strapi, which would
# overwrite this script's PORT and send every phase B check at the CMS instead
# of the Next server.
env_value() {
  [ -f "$ROOT/.env" ] || return 0
  grep -m1 "^$1=" "$ROOT/.env" | cut -d= -f2-
}

: "${STRIPE_WEBHOOK_SECRET:=$(env_value STRIPE_WEBHOOK_SECRET)}"
: "${STRIPE_SECRET_KEY:=$(env_value STRIPE_SECRET_KEY)}"
export STRIPE_WEBHOOK_SECRET STRIPE_SECRET_KEY

echo "Stripe verification"
echo "  phase A: webhook receiver (Strapi)"

check "bogus signature is rejected" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CMS/api/stripe/webhook" \
     -H 'Content-Type: application/json' -H 'stripe-signature: t=1,v1=bogus' \
     -d '{"id":"evt_bogus","type":"payment_intent.succeeded"}')" "400"
check "missing signature is rejected" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$CMS/api/stripe/webhook" \
     -H 'Content-Type: application/json' -d '{}')" "400"

if [ -z "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  echo "  SKIP  STRIPE_WEBHOOK_SECRET is unset — signed-event checks not run."
  echo "        Set it in the repo-root .env to exercise real verification."
else
  ref="ord_verify_$$_$(date +%s)"
  evt="evt_verify_$$_$(date +%s)"

  first=$(node "$ROOT/scripts/stripe-signed-post.js" payment_intent.succeeded "$ref" "$evt" | tail -1)
  sleep 2
  replay=$(node "$ROOT/scripts/stripe-signed-post.js" payment_intent.succeeded "$ref" "$evt" | tail -1)
  sleep 1

  check "a genuinely signed event is accepted" \
    "$(echo "$first" | cut -d' ' -f1)" "200"
  check "a replayed event is suppressed" \
    "$(echo "$replay" | grep -c '"duplicate":true')" "1"

  # Fulfilment and exactly-once, read straight from the database.
  check "exactly one ledger row for the event" \
    "$(python3 -c "
import sqlite3
db = sqlite3.connect('$ROOT/.tmp/data.db')
print(db.execute('select count(*) from payment_events where event_id=?', ('$evt',)).fetchone()[0])
" 2>/dev/null)" "1"
  check "exactly one subscriber was fulfilled" \
    "$(python3 -c "
import sqlite3
db = sqlite3.connect('$ROOT/.tmp/data.db')
print(db.execute('select count(*) from subscribers where order_ref=?', ('$ref',)).fetchone()[0])
" 2>/dev/null)" "1"
  check "the subscriber is active" \
    "$(python3 -c "
import sqlite3
db = sqlite3.connect('$ROOT/.tmp/data.db')
row = db.execute('select status from subscribers where order_ref=?', ('$ref',)).fetchone()
print(row[0] if row else 'missing')
" 2>/dev/null)" "active"

  # Strapi's unique:true is application-level only; without a real index the
  # de-duplication above is advisory. Assert the index exists.
  check "the event ledger has a real unique index" \
    "$(python3 -c "
import sqlite3
db = sqlite3.connect('$ROOT/.tmp/data.db')
print('yes' if db.execute(\"select 1 from sqlite_master where type='index' and name='payment_events_event_id_unique'\").fetchone() else 'no')
" 2>/dev/null)" "yes"

  failed=$(node "$ROOT/scripts/stripe-signed-post.js" payment_intent.payment_failed "ord_sca_$$" "evt_fail_$$_$(date +%s)" | tail -1)
  check "a failed payment is acknowledged and logged" \
    "$(echo "$failed" | cut -d' ' -f1)" "200"
fi

echo "  phase B: subscription endpoint (Next.js)"

start_server ""

check "POST without a key answers 503" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/payments/subscription" \
     -H 'Content-Type: application/json' -d '{"planId":"monthly"}')" "503"
check "GET is refused" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/api/payments/subscription")" "405"

stop_server

if [ -z "${STRIPE_SECRET_KEY:-}" ]; then
  echo "  SKIP  STRIPE_SECRET_KEY is unset — live intent checks not run."
  echo "        Run: STRIPE_SECRET_KEY=sk_test_... ./scripts/verify-stripe.sh"
else
  start_server "$STRIPE_SECRET_KEY"

  check "an unknown plan is rejected" \
    "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/payments/subscription" \
       -H 'Content-Type: application/json' -d '{"planId":"does-not-exist"}')" "400"

  secret=$(curl -s -X POST "$WEB/api/payments/subscription" \
    -H 'Content-Type: application/json' -d '{"planId":"monthly"}' \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('clientSecret',''))" 2>/dev/null)

  check "a live PaymentIntent secret is returned" \
    "$(case "$secret" in pi_*_secret_*) echo yes ;; *) echo no ;; esac)" "yes"

  page=$(curl -s "$WEB/subscribe")

  check "the subscribe page renders" \
    "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/subscribe")" "200"
  check "the SECRET key never reaches the browser" \
    "$(printf '%s' "$page" | grep -c 'sk_test_')" "0"
  check "the return page renders" \
    "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/subscribe/return")" "200"

  stop_server
fi

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
