import Stripe from 'stripe';

/**
 * Server-only Stripe client and pricing.
 *
 * SECRETS: this module reads STRIPE_SECRET_KEY, which must never reach the
 * browser. It has no 'use client' directive and is imported only from route
 * handlers and server components. The only key the browser ever sees is
 * NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY, read in the client component.
 */

export class MissingStripeKeyError extends Error {
  constructor() {
    super('STRIPE_SECRET_KEY is not set');
    this.name = 'MissingStripeKeyError';
  }
}

let client: Stripe | null = null;
let clientKey: string | null = null;

/**
 * Built lazily and memoised.
 *
 * Never constructed at module scope: the layout renders on every page, and a
 * client built at import time would turn a missing key into a site-wide
 * failure instead of a 503 on the one route that needs it.
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

export interface PlanConfig {
  priceCents: number;
  currency: string;
  productName: string;
  interval: 'month' | 'year';
}

/**
 * THE PRICE COMES FROM HERE — never from the request.
 *
 * The browser sends a plan identifier at most; it never sends an amount. A
 * client that posts `{ amount: 1 }` is ignored, because no code path reads an
 * amount from the request body. This is the single most important rule in a
 * payments integration: the server decides what things cost.
 *
 * In a catalogue-driven shop this function would look the plan up in Strapi.
 * Here there is one plan, so it is configuration.
 */
export function planFor(planId: string): PlanConfig | null {
  const plans: Record<string, PlanConfig> = {
    monthly: {
      priceCents: Number(process.env.SUBSCRIPTION_PRICE_CENTS ?? 800),
      currency: (process.env.SUBSCRIPTION_CURRENCY ?? 'usd').toLowerCase(),
      productName: 'The Strapi Press — Monthly',
      interval: 'month',
    },
  };

  const plan = plans[planId];

  if (!plan) {
    return null;
  }

  // Guard the env-sourced amount: a misconfigured value must fail loudly here
  // rather than reaching Stripe as NaN or a negative charge.
  if (!Number.isInteger(plan.priceCents) || plan.priceCents < 50) {
    throw new Error(
      `SUBSCRIPTION_PRICE_CENTS must be an integer of at least 50, got ${process.env.SUBSCRIPTION_PRICE_CENTS}`,
    );
  }

  return plan;
}

/**
 * A stable, unique reference for this attempt.
 *
 * Used two ways: as the Idempotency-Key so a retried request cannot create a
 * second subscription, and as `metadata.orderRef` so the webhook knows what to
 * fulfil without trusting the browser.
 */
export function newOrderRef(): string {
  return `ord_${crypto.randomUUID()}`;
}

/**
 * Builds the line item for the subscription.
 *
 * Note the asymmetry with Checkout Sessions: a Session accepts inline
 * `price_data.product_data`, but `subscriptions.create` does NOT — its
 * `price_data` requires `product` to be an existing Product ID. Verified
 * against the installed types.
 *
 * PRODUCTION: set STRIPE_PRICE_ID to a Price you manage in the dashboard. That
 * is the only arrangement where your catalogue, reporting and tax settings live
 * in one place.
 *
 * DEVELOPMENT: with no STRIPE_PRICE_ID we create a Product on the fly. The
 * idempotency key is derived from the plan's shape rather than the order, so
 * repeated subscribes inside the key's 24-hour window reuse one Product instead
 * of littering the account. After that window a new Product appears — harmless
 * in test mode, which is exactly why production should pin STRIPE_PRICE_ID.
 */
export async function subscriptionItemFor(
  stripe: Stripe,
  plan: PlanConfig,
  planId: string,
): Promise<Stripe.SubscriptionCreateParams.Item> {
  const priceId = process.env.STRIPE_PRICE_ID;

  if (priceId) {
    return { price: priceId };
  }

  const product = await stripe.products.create(
    { name: plan.productName, metadata: { planId } },
    { idempotencyKey: `plan:${planId}:${plan.priceCents}:${plan.currency}:product` },
  );

  return {
    price_data: {
      currency: plan.currency,
      unit_amount: plan.priceCents,
      recurring: { interval: plan.interval },
      product: product.id,
    },
  };
}
