# Stripe Subscription Checkout — Design

**Date:** 2026-08-16
**Project:** strapi-cms — `frontend/` (Next.js 16 App Router). The Strapi
application is not modified by this work.

## Purpose

Turn the masthead's inert SUBSCRIBE label into a working payment flow, so the
blog can take a monthly subscription through Stripe Checkout and the whole path
can be exercised with Stripe's test cards.

The immediate goal is a payment flow that is real enough to test honestly:
a genuine Checkout Session, a genuine redirect to Stripe, and a webhook whose
signature is actually verified.

## Scope

In scope:

- A hosted Stripe Checkout redirect, started from the masthead's SUBSCRIBE
  control on every page.
- Success and cancelled return pages.
- A webhook endpoint that verifies Stripe's signature and handles
  `checkout.session.completed`.
- Unit tests, a verification script, and documented test cards.

Out of scope (deferred, not needed to satisfy the goal):

- Gating any article content behind a subscription. Nothing on the site becomes
  paid; the flow ends at a confirmation page. Content gating would break the
  current fully-static ISR model and needs a session/auth story of its own.
- Persisting subscribers. No Strapi content type, no database writes. The
  webhook logs what it received.
- The customer portal, plan changes, cancellation, proration, tax, coupons.
- Any change to the Strapi application, its schema, or its permissions.

## Why hosted Checkout

Stripe's hosted page needs no publishable key and no `stripe.js` in the browser:
the server creates a Session and returns its URL. SUBSCRIBE can therefore be a
plain `<form method="POST" action="/api/checkout">` with a submit button — no
client component, no JavaScript, and no card fields in our DOM.

This matters beyond simplicity. The masthead renders inside the root layout on
every statically generated page, and a form POST works from static HTML. The
existing ISR behavior is untouched: no page becomes dynamic, no route loses its
prerender, and the cache tags are unaffected.

Embedded Checkout and a custom Payment Element were both considered and
rejected: each adds a client component and a browser bundle for a flow that
gains nothing from staying on our domain.

## Architecture

```
frontend/
  lib/stripe.ts                      Stripe client factory + session params builder
  app/api/checkout/route.ts          POST → create Session → 303 to Stripe
  app/api/stripe/webhook/route.ts    POST → verify signature → handle event
  app/subscribe/success/page.tsx     reads ?session_id=, displays outcome
  app/subscribe/cancelled/page.tsx   static
  components/Masthead.tsx            SUBSCRIBE becomes a form + submit button
scripts/verify-stripe.sh             new
```

Dependency: `stripe` (Node SDK, 22.x) in `frontend/package.json`. Nothing is
added to the Strapi application's dependencies.

## Data Flow

1. Reader submits the SUBSCRIBE form on any page.
2. `POST /api/checkout` builds the Session parameters and calls
   `stripe.checkout.sessions.create`.
3. The handler responds `303` with `Location: session.url`.
4. Stripe hosts the payment page and collects the card.
5. Stripe redirects to `${SITE_URL}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`
   on completion, or `${SITE_URL}/subscribe/cancelled` if the reader backs out.
6. Independently, Stripe POSTs `checkout.session.completed` to
   `/api/stripe/webhook`.

Steps 5 and 6 are independent on purpose, and step 6 is the trustworthy one.

## Session Parameters

`lib/stripe.ts` exports a pure builder so the parameters can be unit-tested
without touching the network:

```ts
buildCheckoutSessionParams(opts: {
  siteUrl: string;
  priceCents: number;
  currency: string;
}): Stripe.Checkout.SessionCreateParams
```

It returns `mode: 'subscription'` with an inline price rather than a
pre-created Price ID:

```ts
line_items: [{
  quantity: 1,
  price_data: {
    currency,
    unit_amount: priceCents,
    recurring: { interval: 'month' },
    product_data: { name: 'The Strapi Press — Monthly' },
  },
}]
```

Inline `price_data` with a `recurring` interval is supported in `subscription`
mode (Stripe's API reference for `POST /v1/checkout/sessions`, and its
managed-payments example, both show it). Using it means a fresh Stripe account
needs no Product or Price created in the dashboard first — only API keys. The
tradeoff is that an inline price is single-use and not reusable or reportable as
a catalog item, which is the right tradeoff while nothing is gated.

`success_url` embeds the literal `{CHECKOUT_SESSION_ID}` placeholder, which
Stripe substitutes on redirect.

## The Stripe Client

```ts
getStripe(): Stripe   // throws MissingStripeKeyError when STRIPE_SECRET_KEY is unset
```

The client is constructed lazily, inside the request handlers, and memoized
after first use. It is never constructed at module scope.

This is the single most important structural constraint in this design. The root
layout renders the masthead on every page; if a Stripe client were constructed
during module evaluation of anything the layout imports, an unset key would take
down the entire blog rather than just the checkout route. `components/Masthead.tsx`
therefore imports nothing from `lib/stripe.ts` — the form's `action` is a string.

## Endpoints

### `POST /api/checkout`

1. Build the session parameters from environment configuration.
2. Create the Session.
3. Respond `303` with `Location: session.url`.

Errors:

- `STRIPE_SECRET_KEY` unset → `503` with a plain message naming the missing
  variable. The rest of the site keeps serving normally.
- Stripe API error → `502`, with the error logged server-side. The response body
  never includes Stripe's raw error, which can carry account detail.

`GET` returns `405`.

### `POST /api/stripe/webhook`

1. Read the raw body with `await request.text()`. Parsing the JSON first would
   change the bytes and break verification, so the raw string is read before
   anything else touches the body.
2. `stripe.webhooks.constructEvent(rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)`.
3. Any missing or invalid signature → `400`, and nothing else happens.
4. `checkout.session.completed` → log the session id, `payment_status`, and
   customer email at info level. Every other event type → `200` and no action.
5. Respond `{ received: true }`.

`STRIPE_WEBHOOK_SECRET` unset is treated as a verification failure: `400`, never
a bypass. A webhook endpoint that accepts unverified payloads when
misconfigured is worse than one that rejects everything.

### `GET /subscribe/success`

Reads `session_id` from the query string and retrieves the Session to display
its real `payment_status`. Reading `searchParams` makes the route dynamic
automatically; no other page's rendering changes.

The page grants nothing and unlocks nothing. Anyone can visit it with an
invented `session_id`, and a missing or unknown id renders a neutral "we could
not find that checkout session" message rather than an error. This is stated in
a comment in the file so a later reader does not mistake it for an
entitlement check.

## Configuration

All server-only. No `NEXT_PUBLIC_` prefix anywhere — a publishable key is not
needed for this integration at all.

| Variable | Default | Purpose |
|---|---|---|
| `STRIPE_SECRET_KEY` | none | `sk_test_…`. Absent → checkout returns 503. |
| `STRIPE_WEBHOOK_SECRET` | none | `whsec_…` from `stripe listen`. Absent → webhook 400s. |
| `SITE_URL` | `http://localhost:3000` | Base for the return URLs. |
| `SUBSCRIPTION_PRICE_CENTS` | `800` | Amount in the smallest currency unit. |
| `SUBSCRIPTION_CURRENCY` | `usd` | ISO currency code, lowercase. |

`frontend/.env.example` gains all five with placeholder values and a comment
that real keys belong in the gitignored `.env.local`. No real key is ever
committed, logged, or included in a response body.

## Visual Design

SUBSCRIBE keeps its current appearance — accent `#F2312C`, compressed uppercase,
no border. It becomes a `<button type="submit">` inside a form, styled to match
the surrounding nav links exactly, so the masthead looks unchanged.

The two return pages reuse the established editorial vocabulary: paper
background, hairline rules, serif headline, red uppercase kicker. Success shows
a confirmation headline, the amount, and a link back to the front page.
Cancelled says nothing was charged and offers the same link.

## Error Handling

- A missing key degrades one route, never the site.
- Stripe API failures return `502` and log server-side; the reader sees a plain
  message.
- The webhook fails closed on every signature problem.
- The success page treats an unknown session as a neutral state, not an error.

`/api/checkout` is deliberately unauthenticated and carries no CSRF token: it
takes no user input, charges nobody, and only creates an empty Checkout Session
before redirecting. A cross-origin POST can therefore create unused Sessions,
which is noise in the Stripe dashboard rather than a security problem. This is
worth revisiting only if the endpoint ever accepts a plan, quantity, or customer
identifier from the request — at that point it needs an origin check.

## Testing

**Unit (Vitest, in `frontend/`)**

- `buildCheckoutSessionParams` — mode is `subscription`; the inline price carries
  `recurring.interval: 'month'`; amount and currency come from configuration;
  `success_url` contains the literal `{CHECKOUT_SESSION_ID}`; both return URLs
  are built from `SITE_URL`.
- `getStripe` throws a named error when the key is unset, and does not throw at
  import time.
- Webhook route with a mocked Stripe: a bad signature returns `400`, a valid
  `checkout.session.completed` returns `200`, an unhandled event type returns
  `200` without acting, and a missing `STRIPE_WEBHOOK_SECRET` returns `400`.
- `/api/checkout` with an unset key returns `503`; `GET` returns `405`.

**Script (`scripts/verify-stripe.sh`)**

Follows `verify-blog-api.sh`'s structure: a `check` helper, a PASS/FAIL table,
exit status from an accumulated flag. It runs against a dev server and asserts:

- The site still serves `200` with no Stripe key configured — the blog is
  unaffected by an unconfigured payment integration.
- `POST /api/checkout` with no key returns `503`.
- `POST /api/stripe/webhook` with a bogus signature returns `400`.
- `GET /subscribe/cancelled` returns `200`.
- When `STRIPE_SECRET_KEY` is present in the environment, `POST /api/checkout`
  returns `303` with a `Location` on `checkout.stripe.com`. Skipped, with a
  printed note, when no key is set — a skipped check is announced, never
  silently counted as a pass.

**Manual, requires the reader's own Stripe account**

Documented in the README: set `sk_test_…`, run `stripe listen --forward-to
localhost:3000/api/stripe/webhook`, put its `whsec_…` in `.env.local`, click
SUBSCRIBE, and pay with a test card.

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0025 0000 3155` | requires 3D Secure authentication |
| `4000 0000 0000 9995` | declined, insufficient funds |

Any future expiry date, any three-digit CVC, any postcode.

## Acceptance Criteria

- SUBSCRIBE on any page POSTs to `/api/checkout` and, with a valid test key,
  redirects to a `checkout.stripe.com` URL.
- Paying with `4242 4242 4242 4242` returns to `/subscribe/success`, which
  displays the real `payment_status` retrieved from Stripe.
- The webhook rejects an invalid signature with `400` and logs a verified
  `checkout.session.completed`.
- With no Stripe configuration at all, every existing page still returns `200`
  and `./scripts/verify-isr.sh` still passes — the payment integration cannot
  break the blog.
- `./scripts/verify-blog-api.sh` and `./scripts/verify-isr.sh` both still pass
  unchanged.
