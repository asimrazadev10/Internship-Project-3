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
