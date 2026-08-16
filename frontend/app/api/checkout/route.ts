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
