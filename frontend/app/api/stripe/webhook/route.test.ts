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

const post = (body: string, signature?: string, extraHeaders?: Record<string, string>) =>
  POST(
    new Request('http://localhost:3000/api/stripe/webhook', {
      method: 'POST',
      headers: {
        ...(signature ? { 'stripe-signature': signature } : {}),
        ...extraHeaders,
      },
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

  it('rejects an over-limit Content-Length before reading or verifying the body', async () => {
    const response = await post('{}', 'sig', { 'content-length': String(1_048_577) });

    expect(response.status).toBe(413);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it('still succeeds for a normal request with Content-Length under the limit', async () => {
    constructEvent.mockReturnValue({ type: 'invoice.paid', data: { object: {} } });

    const response = await post('{}', 'sig', { 'content-length': '2' });

    expect(response.status).toBe(200);
  });
});
