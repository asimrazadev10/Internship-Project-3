# Stripe Subscription Checkout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the masthead's inert SUBSCRIBE label into a working Stripe Checkout redirect for a monthly subscription, with a signature-verified webhook, testable end to end with Stripe's test cards.

**Architecture:** All Stripe code lives in `frontend/`; the Strapi app is untouched. Hosted Checkout means no publishable key and no `stripe.js` in the browser, so SUBSCRIBE is a plain form POST from statically generated HTML and the existing ISR behavior is unaffected. The Stripe client is constructed lazily inside route handlers so a missing key degrades one route rather than the whole site.

**Tech Stack:** Next.js 16 App Router, TypeScript, `stripe` Node SDK 22.x, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-stripe-subscription-checkout-design.md`

## Global Constraints

- Nothing under `/home/asim/strapi-cms/src`, `config/`, or the repo-root `package.json` changes. This is a `frontend/`-only feature plus one new script and README text.
- All env vars are server-only. No `NEXT_PUBLIC_` prefix. A publishable key is not used at all.
- `STRIPE_SECRET_KEY` unset → `/api/checkout` returns `503`; every other page keeps serving normally.
- `STRIPE_WEBHOOK_SECRET` unset or signature invalid → webhook returns `400`. Never a bypass.
- The Stripe client is NEVER constructed at module scope. `components/Masthead.tsx` imports nothing from `lib/stripe.ts`.
- No real key is ever committed, logged, or placed in a response body.
- Defaults: `SUBSCRIPTION_PRICE_CENTS=800`, `SUBSCRIPTION_CURRENCY=usd`, `SITE_URL=http://localhost:3000`.
- Product name shown at Stripe: `The Strapi Press — Monthly` (em dash, exactly).
- Visual constraints carried from the blog: paper `#F6F4EF`, ink `#363737`, headline `#161613`, accent `#F2312C`, rule `#DDD9D0`; no shadows, no rounded corners, no card fills; hairline borders only.
- `./scripts/verify-blog-api.sh` and `./scripts/verify-isr.sh` must both still pass unchanged at the end.

---

### Task 1: Stripe client and session parameters

**Files:**
- Modify: `frontend/package.json` (add the `stripe` dependency)
- Create: `frontend/lib/stripe.ts`
- Test: `frontend/lib/stripe.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces, all from `@/lib/stripe`:
  - `class MissingStripeKeyError extends Error` (with `name === 'MissingStripeKeyError'`)
  - `getStripe(): Stripe` — throws `MissingStripeKeyError` when `STRIPE_SECRET_KEY` is unset or empty
  - `subscriptionConfig(): { siteUrl: string; priceCents: number; currency: string }`
  - `buildCheckoutSessionParams(opts: { siteUrl: string; priceCents: number; currency: string }): Stripe.Checkout.SessionCreateParams`

- [ ] **Step 1: Install the SDK**

```bash
cd /home/asim/strapi-cms/frontend && npm install stripe
```

- [ ] **Step 2: Write the failing test**

`frontend/lib/stripe.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MissingStripeKeyError,
  buildCheckoutSessionParams,
  getStripe,
  subscriptionConfig,
} from '@/lib/stripe';

const ENV_KEYS = [
  'STRIPE_SECRET_KEY',
  'SITE_URL',
  'SUBSCRIPTION_PRICE_CENTS',
  'SUBSCRIPTION_CURRENCY',
] as const;

let saved: Record<string, string | undefined> = {};

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe('getStripe', () => {
  it('throws a named error when the secret key is unset', () => {
    expect(() => getStripe()).toThrow(MissingStripeKeyError);
  });

  it('treats an empty key as unset', () => {
    process.env.STRIPE_SECRET_KEY = '';
    expect(() => getStripe()).toThrow(MissingStripeKeyError);
  });

  it('returns the same client for the same key', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_example';
    expect(getStripe()).toBe(getStripe());
  });
});

describe('subscriptionConfig', () => {
  it('falls back to the documented defaults', () => {
    expect(subscriptionConfig()).toEqual({
      siteUrl: 'http://localhost:3000',
      priceCents: 800,
      currency: 'usd',
    });
  });

  it('reads the environment and lowercases the currency', () => {
    process.env.SITE_URL = 'https://press.example';
    process.env.SUBSCRIPTION_PRICE_CENTS = '1200';
    process.env.SUBSCRIPTION_CURRENCY = 'GBP';

    expect(subscriptionConfig()).toEqual({
      siteUrl: 'https://press.example',
      priceCents: 1200,
      currency: 'gbp',
    });
  });

  it('falls back to 800 when the price is not a positive number', () => {
    process.env.SUBSCRIPTION_PRICE_CENTS = 'free';
    expect(subscriptionConfig().priceCents).toBe(800);

    process.env.SUBSCRIPTION_PRICE_CENTS = '-100';
    expect(subscriptionConfig().priceCents).toBe(800);
  });
});

describe('buildCheckoutSessionParams', () => {
  const params = () =>
    buildCheckoutSessionParams({
      siteUrl: 'https://press.example',
      priceCents: 1200,
      currency: 'gbp',
    });

  it('is a monthly subscription priced inline', () => {
    const p = params();
    expect(p.mode).toBe('subscription');

    const item = p.line_items?.[0];
    expect(item?.quantity).toBe(1);
    expect(item?.price_data?.currency).toBe('gbp');
    expect(item?.price_data?.unit_amount).toBe(1200);
    expect(item?.price_data?.recurring?.interval).toBe('month');
    expect(item?.price_data?.product_data?.name).toBe('The Strapi Press — Monthly');
  });

  it('builds both return URLs from the site URL', () => {
    const p = params();
    // {CHECKOUT_SESSION_ID} is a literal Stripe substitutes on redirect —
    // it must survive into the URL verbatim.
    expect(p.success_url).toBe(
      'https://press.example/subscribe/success?session_id={CHECKOUT_SESSION_ID}',
    );
    expect(p.cancel_url).toBe('https://press.example/subscribe/cancelled');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- stripe.test.ts`
Expected: FAIL — cannot resolve `@/lib/stripe`.

- [ ] **Step 4: Write the implementation**

`frontend/lib/stripe.ts`:

```ts
import Stripe from 'stripe';

/** Thrown when STRIPE_SECRET_KEY is missing, so callers can answer 503 rather than 500. */
export class MissingStripeKeyError extends Error {
  constructor() {
    super('STRIPE_SECRET_KEY is not set');
    this.name = 'MissingStripeKeyError';
  }
}

let client: Stripe | null = null;
let clientKey: string | null = null;

/**
 * Builds the Stripe client on first use and memoizes it.
 *
 * Constructed lazily on purpose: the masthead renders on every page, so a
 * client built at module scope would turn a missing key into a site-wide
 * failure instead of a 503 on one route.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new MissingStripeKeyError();
  }
  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }
  return client;
}

export function subscriptionConfig(): {
  siteUrl: string;
  priceCents: number;
  currency: string;
} {
  const parsedPrice = Number(process.env.SUBSCRIPTION_PRICE_CENTS);

  return {
    siteUrl: process.env.SITE_URL ?? 'http://localhost:3000',
    priceCents:
      Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 800,
    currency: (process.env.SUBSCRIPTION_CURRENCY ?? 'usd').toLowerCase(),
  };
}

/**
 * The price is defined inline rather than referencing a dashboard Price ID, so
 * a fresh Stripe account needs only API keys. Inline prices are single-use and
 * do not appear in Stripe's product catalog — the right trade while nothing is
 * gated behind the subscription.
 */
export function buildCheckoutSessionParams({
  siteUrl,
  priceCents,
  currency,
}: {
  siteUrl: string;
  priceCents: number;
  currency: string;
}): Stripe.Checkout.SessionCreateParams {
  return {
    mode: 'subscription',
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency,
          unit_amount: priceCents,
          recurring: { interval: 'month' },
          product_data: { name: 'The Strapi Press — Monthly' },
        },
      },
    ],
    // {CHECKOUT_SESSION_ID} is a string literal, not interpolation: Stripe
    // replaces it with the real id when it redirects.
    success_url: `${siteUrl}/subscribe/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/subscribe/cancelled`,
  };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS — the 18 existing tests plus 8 new ones.

- [ ] **Step 6: Typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no output. If the SDK's types reject `price_data.recurring` inside `line_items`, do NOT cast to `any` — re-read the installed `Stripe.Checkout.SessionCreateParams.LineItem.PriceData` type and match it exactly, and report what differed.

- [ ] **Step 7: Commit**

```bash
cd /home/asim/strapi-cms
git add frontend/package.json frontend/package-lock.json frontend/lib/stripe.ts frontend/lib/stripe.test.ts
git commit -m "feat(frontend): add Stripe client and checkout session parameters"
```

---

### Task 2: Checkout route

**Files:**
- Create: `frontend/app/api/checkout/route.ts`
- Test: `frontend/app/api/checkout/route.test.ts`

**Interfaces:**
- Consumes: `getStripe`, `MissingStripeKeyError`, `subscriptionConfig`, `buildCheckoutSessionParams` from `@/lib/stripe`.
- Produces: `POST(): Promise<Response>` and `GET(): Promise<Response>` at `/api/checkout`. Task 4's masthead form posts to this path.

- [ ] **Step 1: Write the failing test**

`frontend/app/api/checkout/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const create = vi.fn();

// Mock only the client factory; the pure builders stay real so this test also
// covers the parameters actually handed to Stripe.
vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    getStripe: () => {
      if (!process.env.STRIPE_SECRET_KEY) throw new actual.MissingStripeKeyError();
      return { checkout: { sessions: { create } } };
    },
  };
});

import { GET, POST } from '@/app/api/checkout/route';

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_example';
  process.env.SITE_URL = 'https://press.example';
  create.mockReset();
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.SITE_URL;
  vi.restoreAllMocks();
});

describe('POST /api/checkout', () => {
  it('redirects to the Stripe-hosted session URL', async () => {
    create.mockResolvedValue({ id: 'cs_test_1', url: 'https://checkout.stripe.com/c/pay/cs_test_1' });

    const response = await POST();

    expect(response.status).toBe(303);
    expect(response.headers.get('Location')).toBe('https://checkout.stripe.com/c/pay/cs_test_1');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        success_url: 'https://press.example/subscribe/success?session_id={CHECKOUT_SESSION_ID}',
      }),
    );
  });

  it('answers 503 when the secret key is unset, without calling Stripe', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const response = await POST();

    expect(response.status).toBe(503);
    expect(create).not.toHaveBeenCalled();
  });

  it('answers 502 when Stripe rejects the request, without leaking its message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    create.mockRejectedValue(new Error('No such customer: acct_secret_detail'));

    const response = await POST();

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('acct_secret_detail');
  });

  it('answers 502 when the session comes back without a URL', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    create.mockResolvedValue({ id: 'cs_test_2', url: null });

    expect((await POST()).status).toBe(502);
  });

  it('refuses GET', async () => {
    const response = await GET();
    expect(response.status).toBe(405);
    expect(response.headers.get('Allow')).toBe('POST');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- checkout`
Expected: FAIL — cannot resolve `@/app/api/checkout/route`.

- [ ] **Step 3: Write the implementation**

`frontend/app/api/checkout/route.ts`:

```ts
import {
  MissingStripeKeyError,
  buildCheckoutSessionParams,
  getStripe,
  subscriptionConfig,
} from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Started by the masthead's SUBSCRIBE form on every page.
 *
 * Deliberately unauthenticated and free of a CSRF token: it accepts no input
 * and charges nobody, so a cross-origin POST can only create an unused
 * Session. Revisit that if this ever accepts a plan or customer from the
 * request.
 */
export async function POST(): Promise<Response> {
  let url: string | null;

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create(
      buildCheckoutSessionParams(subscriptionConfig()),
    );
    url = session.url;
  } catch (error) {
    if (error instanceof MissingStripeKeyError) {
      return new Response('Checkout is not configured: STRIPE_SECRET_KEY is unset.', {
        status: 503,
      });
    }
    // Stripe's message can name account internals, so it is logged, not returned.
    console.error('[stripe] failed to create a Checkout Session', error);
    return new Response('Could not start checkout.', { status: 502 });
  }

  if (!url) {
    console.error('[stripe] Checkout Session created without a url');
    return new Response('Could not start checkout.', { status: 502 });
  }

  return new Response(null, { status: 303, headers: { Location: url } });
}

export async function GET(): Promise<Response> {
  return new Response('Method not allowed', { status: 405, headers: { Allow: 'POST' } });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 31 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/asim/strapi-cms
git add frontend/app/api/checkout
git commit -m "feat(frontend): create Stripe Checkout Sessions from a form POST"
```

---

### Task 3: Webhook route

**Files:**
- Create: `frontend/app/api/stripe/webhook/route.ts`
- Test: `frontend/app/api/stripe/webhook/route.test.ts`

**Interfaces:**
- Consumes: `getStripe`, `MissingStripeKeyError` from `@/lib/stripe`.
- Produces: `POST(request: Request): Promise<Response>` at `/api/stripe/webhook`. Task 5's script posts a bogus signature to it.

- [ ] **Step 1: Write the failing test**

`frontend/app/api/stripe/webhook/route.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const constructEvent = vi.fn();

vi.mock('@/lib/stripe', async () => {
  const actual = await vi.importActual<typeof import('@/lib/stripe')>('@/lib/stripe');
  return {
    ...actual,
    getStripe: () => {
      if (!process.env.STRIPE_SECRET_KEY) throw new actual.MissingStripeKeyError();
      return { webhooks: { constructEvent } };
    },
  };
});

import { POST } from '@/app/api/stripe/webhook/route';

const post = (body: string, signature?: string) =>
  POST(
    new Request('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      headers: signature ? { 'stripe-signature': signature } : {},
      body,
    }),
  );

beforeEach(() => {
  process.env.STRIPE_SECRET_KEY = 'sk_test_example';
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_example';
  constructEvent.mockReset();
});

afterEach(() => {
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_WEBHOOK_SECRET;
  vi.restoreAllMocks();
});

describe('POST /api/stripe/webhook', () => {
  it('rejects an invalid signature', async () => {
    constructEvent.mockImplementation(() => {
      throw new Error('No signatures found matching the expected signature');
    });

    const response = await post('{}', 'bogus');

    expect(response.status).toBe(400);
  });

  it('rejects a request with no signature header, without verifying', async () => {
    const response = await post('{}');

    expect(response.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('rejects rather than bypasses when the webhook secret is unset', async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;

    const response = await post('{}', 'anything');

    expect(response.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('verifies against the exact raw body it received', async () => {
    const raw = '{"id":"evt_1","type":"payment_intent.created"}';
    constructEvent.mockReturnValue({ type: 'payment_intent.created' });

    await post(raw, 'sig');

    expect(constructEvent).toHaveBeenCalledWith(raw, 'sig', 'whsec_example');
  });

  it('logs a completed checkout session and acknowledges', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    constructEvent.mockReturnValue({
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_test_9',
          payment_status: 'paid',
          customer_details: { email: 'reader@example.com' },
        },
      },
    });

    const response = await post('{}', 'sig');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ received: true });
    expect(info).toHaveBeenCalledWith(expect.stringContaining('cs_test_9'));
  });

  it('acknowledges an unhandled event type without acting on it', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    constructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: {} } });

    const response = await post('{}', 'sig');

    expect(response.status).toBe(200);
    expect(info).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- webhook`
Expected: FAIL — cannot resolve `@/app/api/stripe/webhook/route`.

- [ ] **Step 3: Write the implementation**

`frontend/app/api/stripe/webhook/route.ts`:

```ts
import type Stripe from 'stripe';
import { MissingStripeKeyError, getStripe } from '@/lib/stripe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get('stripe-signature');

  // Read the body as raw text before anything parses it: constructEvent hashes
  // these exact bytes, so a round trip through JSON.parse would break
  // verification.
  const rawBody = await request.text();

  // A missing secret is a misconfiguration, and the safe reading of a
  // misconfigured verifier is "reject", never "accept unverified".
  if (!secret || !signature) {
    return json({ error: 'invalid signature' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    if (error instanceof MissingStripeKeyError) {
      return json({ error: 'not configured' }, 503);
    }
    return json({ error: 'invalid signature' }, 400);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    console.info(
      `[stripe] checkout.session.completed ${session.id} ` +
        `status=${session.payment_status} email=${session.customer_details?.email ?? 'unknown'}`,
    );
  }

  return json({ received: true });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 37 tests.

- [ ] **Step 5: Commit**

```bash
cd /home/asim/strapi-cms
git add frontend/app/api/stripe
git commit -m "feat(frontend): verify and handle Stripe webhook events"
```

---

### Task 4: Subscribe pages and the masthead control

**Files:**
- Create: `frontend/app/subscribe/success/page.tsx`
- Create: `frontend/app/subscribe/cancelled/page.tsx`
- Modify: `frontend/components/Masthead.tsx`

**Interfaces:**
- Consumes: `getStripe` from `@/lib/stripe`; the `/api/checkout` route from Task 2.
- Produces: the routes `/subscribe/success` and `/subscribe/cancelled`. Task 5's script asserts `/subscribe/cancelled` returns 200.

The masthead currently renders `<span className="cursor-default text-accent">Subscribe</span>` inside its `<nav>`. That span is what you are replacing. Do not restyle the surrounding nav.

- [ ] **Step 1: Replace the inert SUBSCRIBE span with a form**

In `frontend/components/Masthead.tsx`, swap the span for:

```tsx
          <form action="/api/checkout" method="POST">
            <button
              type="submit"
              className="cursor-pointer uppercase tracking-widest text-accent hover:underline"
            >
              Subscribe
            </button>
          </form>
```

The button inherits `font-display`, `text-sm`, `uppercase` and `tracking-widest` from the `<nav>`, so the masthead looks unchanged. Do NOT add `'use client'` to this file and do NOT import anything from `@/lib/stripe` — a plain form POST from static HTML is the whole point, and importing the Stripe module here would risk constructing a client during page render.

- [ ] **Step 2: Write the cancelled page**

`frontend/app/subscribe/cancelled/page.tsx`:

```tsx
import Link from 'next/link';

export default function SubscribeCancelled() {
  return (
    <div style={{ maxWidth: '68ch' }}>
      <p className="font-display text-xs uppercase tracking-widest text-accent">Checkout</p>
      <h1 className="mt-4 text-5xl uppercase">No charge made</h1>
      <p className="mt-4">
        You left checkout before completing payment. Nothing was charged, and you can start
        again whenever you like.
      </p>
      <Link
        href="/"
        className="font-display mt-8 inline-block border-b border-rule uppercase tracking-widest hover:text-accent"
      >
        Back to the front page
      </Link>
    </div>
  );
}
```

- [ ] **Step 3: Write the success page**

`frontend/app/subscribe/success/page.tsx`:

```tsx
import Link from 'next/link';
import { getStripe } from '@/lib/stripe';

// Reading searchParams already forces dynamic rendering; stated explicitly so
// nobody later mistakes this page for one of the statically generated blog routes.
export const dynamic = 'force-dynamic';

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

/**
 * Displays the outcome of a Checkout Session. It grants nothing and unlocks
 * nothing: anyone can visit this URL with an invented session_id, so it is
 * display-only. The webhook is the trustworthy confirmation.
 */
export default async function SubscribeSuccess({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  let paymentStatus: string | null = null;
  let amount: string | null = null;

  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      paymentStatus = session.payment_status;
      if (session.amount_total !== null && session.currency) {
        amount = formatAmount(session.amount_total, session.currency);
      }
    } catch {
      // Unknown id, unconfigured key, or a Stripe outage all land here. None of
      // them is an error worth showing a reader — fall through to the neutral state.
      paymentStatus = null;
    }
  }

  if (!paymentStatus) {
    return (
      <div style={{ maxWidth: '68ch' }}>
        <p className="font-display text-xs uppercase tracking-widest text-accent">Checkout</p>
        <h1 className="mt-4 text-5xl uppercase">Session not found</h1>
        <p className="mt-4">
          We could not look up that checkout session. If you were charged, your receipt from
          Stripe is the record of it.
        </p>
        <Link
          href="/"
          className="font-display mt-8 inline-block border-b border-rule uppercase tracking-widest hover:text-accent"
        >
          Back to the front page
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '68ch' }}>
      <p className="font-display text-xs uppercase tracking-widest text-accent">Checkout</p>
      <h1 className="mt-4 text-5xl uppercase">
        {paymentStatus === 'paid' ? 'You are subscribed' : 'Payment pending'}
      </h1>
      <p className="mt-4">
        Stripe reports this session as <strong>{paymentStatus}</strong>
        {amount ? ` for ${amount} per month.` : '.'}
      </p>
      <Link
        href="/"
        className="font-display mt-8 inline-block border-b border-rule uppercase tracking-widest hover:text-accent"
      >
        Back to the front page
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Verify by hand**

Start Strapi if it is not running (`./scripts/restart-dev.sh` from the repo root), then `cd frontend && npm run dev`. With no `STRIPE_SECRET_KEY` set:

```bash
curl -s -o /dev/null -w 'home:%{http_code}\n' http://localhost:3000/
curl -s -o /dev/null -w 'cancelled:%{http_code}\n' http://localhost:3000/subscribe/cancelled
curl -s -o /dev/null -w 'success-no-id:%{http_code}\n' http://localhost:3000/subscribe/success
curl -s -o /dev/null -w 'checkout:%{http_code}\n' -X POST http://localhost:3000/api/checkout
curl -s http://localhost:3000/ | grep -o 'action="/api/checkout"'
```

Expected: `200`, `200`, `200`, `503`, and one match for the form action. The `503` with the rest of the site still at `200` is the constraint that matters most here. Stop the dev server when done.

- [ ] **Step 5: Typecheck and test**

Run: `cd frontend && npx tsc --noEmit && npm test`
Expected: clean, 37 tests pass.

- [ ] **Step 6: Commit**

```bash
cd /home/asim/strapi-cms
git add frontend/app/subscribe frontend/components/Masthead.tsx
git commit -m "feat(frontend): wire SUBSCRIBE to checkout with return pages"
```

---

### Task 5: Verification script and documentation

**Files:**
- Create: `frontend/.env.example` additions (modify)
- Create: `scripts/verify-stripe.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: every route from Tasks 2-4.
- Produces: an executable script with the same PASS/FAIL shape as `scripts/verify-blog-api.sh` and `scripts/verify-isr.sh`.

Read `scripts/verify-isr.sh` first: it already solves starting and cleanly stopping a Next server (`setsid`, a recorded process-group id, and `kill -TERM -"$pgid"`). Reuse that approach exactly. Do NOT use `pkill -f` pattern sweeps — they kill unrelated processes on a developer's machine.

- [ ] **Step 1: Extend the frontend env example**

Append to `frontend/.env.example`:

```
# Stripe. Real keys belong in .env.local, which is gitignored — never here.
# Test keys come from https://dashboard.stripe.com/test/apikeys
STRIPE_SECRET_KEY=sk_test_replace_me
# Printed by `stripe listen --forward-to localhost:3000/api/stripe/webhook`
STRIPE_WEBHOOK_SECRET=whsec_replace_me
# Base for Checkout's return URLs.
SITE_URL=http://localhost:3000
# Subscription amount in the smallest currency unit, and its currency.
SUBSCRIPTION_PRICE_CENTS=800
SUBSCRIPTION_CURRENCY=usd
```

- [ ] **Step 2: Write the script**

`scripts/verify-stripe.sh`:

```bash
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
```

One risk to watch when you run this: phase A relies on an exported empty
`STRIPE_SECRET_KEY` taking precedence over any value in `frontend/.env.local`.
Next skips keys already present in `process.env`, so an empty string should win —
but verify it actually does. If the `503` check fails because a real key from
`.env.local` leaked through, do NOT delete the developer's `.env.local`; instead
have phase A start the server from a temporary directory-local env override, and
report what you changed.

- [ ] **Step 3: Make it executable and run it**

```bash
cd /home/asim/strapi-cms
chmod +x scripts/verify-stripe.sh
./scripts/verify-stripe.sh
```

Expected: every phase A check PASS, phase B printing the SKIP line, exit 0. Confirm afterwards that port 3000 is free and no stray `next dev` survives:

```bash
ss -ltn | grep -c ':3000'
```

Expected: `0`.

- [ ] **Step 4: Document it**

Add to `README.md`, after the existing Frontend section. The block below is
fenced with four backticks because its content contains three-backtick fences —
what you paste into the README is the inner content, starting at `### Subscriptions`:

````markdown
### Subscriptions

The masthead's SUBSCRIBE button posts to `/api/checkout`, which creates a Stripe
Checkout Session and redirects to Stripe's hosted page. Hosted Checkout needs no
publishable key and no client-side JavaScript, so the button is a plain form POST
and the blog's static rendering is unaffected.

Set up test mode:

```bash
cd frontend
cp .env.example .env.local          # then paste your sk_test_... key
npx stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET in .env.local
npm run dev
```

Click SUBSCRIBE and pay with a Stripe test card:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0025 0000 3155` | requires 3D Secure authentication |
| `4000 0000 0000 9995` | declined, insufficient funds |

Any future expiry date, any three-digit CVC, any postcode.

With no Stripe keys set the site runs normally and `/api/checkout` returns 503.

Verification:

```bash
./scripts/verify-stripe.sh                              # unconfigured-case checks
STRIPE_SECRET_KEY=sk_test_... ./scripts/verify-stripe.sh # also creates a real Session
```
````

- [ ] **Step 5: Run the full suite**

```bash
cd /home/asim/strapi-cms/frontend && npm test && npx tsc --noEmit
cd /home/asim/strapi-cms
./scripts/verify-blog-api.sh
./scripts/verify-stripe.sh
./scripts/verify-isr.sh
```

Expected: all four green. `verify-isr.sh` matters here — it proves the masthead change did not break static rendering or the ISR behavior.

- [ ] **Step 6: Commit**

```bash
cd /home/asim/strapi-cms
git add scripts/verify-stripe.sh README.md frontend/.env.example
git commit -m "test: verify Stripe checkout wiring and document test cards"
```

---

## Self-Review Notes

Spec coverage checked section by section: architecture and lazy client (Task 1), session parameters including inline recurring price (Task 1), checkout endpoint with its 503/502/405 behavior (Task 2), webhook with raw-body verification and fail-closed secrets (Task 3), return pages and the form-POST masthead (Task 4), configuration, verification script, test-card documentation and acceptance criteria (Task 5).

Two spec details deliberately made explicit in the plan because they are easy to get wrong: the masthead must not import `@/lib/stripe` (Task 4, step 1), and the webhook must read the raw body before anything parses it (Task 3, step 3).

The verification script reuses `verify-isr.sh`'s `setsid` process-group cleanup rather than `pkill -f` sweeps, which were removed from that script for killing unrelated processes.
