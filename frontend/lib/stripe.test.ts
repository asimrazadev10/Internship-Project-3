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
