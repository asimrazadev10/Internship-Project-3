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
