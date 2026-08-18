import type Stripe from 'stripe';
import {
  MissingStripeKeyError,
  getStripe,
  newOrderRef,
  planFor,
  subscriptionItemFor,
} from '@/lib/stripe-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

interface SubscriptionRequest {
  planId?: unknown;
  email?: unknown;
}

/**
 * POST /api/payments/subscription
 *
 * Creates an incomplete Subscription and returns the client secret of its first
 * invoice's PaymentIntent, which the browser confirms with the Payment Element.
 *
 * Why a Subscription rather than a bare PaymentIntent: a PaymentIntent charges
 * once. Recurring billing needs the Subscriptions API, and
 * `payment_behavior: 'default_incomplete'` is how you drive it from a
 * PaymentIntent instead of hosted Checkout — Stripe creates the first invoice,
 * leaves it unpaid, and hands back a PaymentIntent for us to confirm client-side.
 *
 * The response deliberately contains NO amount the client could act on for
 * fulfilment purposes, and nothing here fulfils anything: that is the webhook's
 * job alone.
 */
export async function POST(request: Request): Promise<Response> {
  let body: SubscriptionRequest;

  try {
    body = (await request.json()) as SubscriptionRequest;
  } catch {
    return json({ error: 'Malformed request body.' }, 400);
  }

  // The client may name a plan. It may NOT name a price — see planFor().
  const planId = typeof body.planId === 'string' ? body.planId : 'monthly';
  const email = typeof body.email === 'string' && body.email.includes('@') ? body.email : undefined;

  let stripe: Stripe;
  let plan: ReturnType<typeof planFor>;

  try {
    stripe = getStripe();
    plan = planFor(planId);
  } catch (error) {
    if (error instanceof MissingStripeKeyError) {
      return json({ error: 'Payments are not configured.' }, 503);
    }

    // A bad SUBSCRIPTION_PRICE_CENTS lands here. Log it; do not leak it.
    console.error('[stripe] pricing configuration is invalid', error);
    return json({ error: 'Payments are misconfigured.' }, 500);
  }

  if (!plan) {
    return json({ error: 'Unknown plan.' }, 400);
  }

  // Minted before we talk to Stripe so it can serve as BOTH the idempotency key
  // and the fulfilment reference the webhook reads back out of metadata.
  const orderRef = newOrderRef();

  try {
    // A Customer is required for a subscription. Created with its own
    // idempotency key so a retry reuses the same customer rather than
    // accumulating duplicates against one email address.
    const customer = await stripe.customers.create(
      { email, metadata: { orderRef } },
      { idempotencyKey: `${orderRef}:customer` },
    );

    // Resolves to a dashboard-managed Price when STRIPE_PRICE_ID is set, and
    // otherwise to inline price_data against a Product created on demand.
    // subscriptions.create does not accept inline product_data the way Checkout
    // Sessions do — see subscriptionItemFor.
    const item = await subscriptionItemFor(stripe, plan, planId);

    const subscription = await stripe.subscriptions.create(
      {
        customer: customer.id,
        items: [item],
        // Do not attempt payment server-side: leave the first invoice open and
        // give us a PaymentIntent to confirm in the browser.
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        // Our fulfilment key. The webhook reads this back; it never trusts the
        // browser to say which order succeeded.
        metadata: { orderRef, planId },
        // Basil (2025-03-31) and later expose the first invoice's client secret
        // here. The older latest_invoice.payment_intent path is superseded.
        expand: ['latest_invoice.confirmation_secret'],
      },
      // IDEMPOTENCY: a retried or double-submitted request with the same key
      // returns the original subscription instead of creating a second one and
      // charging the customer twice.
      { idempotencyKey: `${orderRef}:subscription` },
    );

    const invoice = subscription.latest_invoice;

    if (!invoice || typeof invoice === 'string') {
      console.error('[stripe] subscription created without an expanded invoice', subscription.id);
      return json({ error: 'Could not start payment.' }, 502);
    }

    const clientSecret = (
      invoice as Stripe.Invoice & {
        confirmation_secret?: { client_secret?: string } | null;
      }
    ).confirmation_secret?.client_secret;

    if (!clientSecret) {
      console.error('[stripe] invoice carried no confirmation secret', invoice.id);
      return json({ error: 'Could not start payment.' }, 502);
    }

    // The client secret is scoped to this one payment and is safe to hand to
    // this customer's browser — but it must never be logged or stored.
    return json({ clientSecret, orderRef });
  } catch (error) {
    // Stripe's messages can name account internals, so they are logged rather
    // than returned. The client gets a generic failure; the specific,
    // customer-safe messages come from Stripe.js during confirmation instead.
    console.error('[stripe] failed to create a subscription', error);
    return json({ error: 'Could not start payment.' }, 502);
  }
}

export async function GET(): Promise<Response> {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', Allow: 'POST' },
  });
}
