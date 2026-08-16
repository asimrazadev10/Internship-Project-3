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
