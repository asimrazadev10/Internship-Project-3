import { SubscribeForm } from '@/components/SubscribeForm';
import { MissingStripeKeyError, planFor } from '@/lib/stripe-server';

// The client secret is minted per visitor, so this page can never be static.
export const dynamic = 'force-dynamic';

/**
 * Creates the subscription server-side and hands only the client secret to the
 * browser.
 *
 * This runs on the server, so it can call our own route handler's logic through
 * an internal fetch without exposing anything: the browser receives the rendered
 * page plus a client secret scoped to one payment, never the secret key and
 * never the price.
 */
async function startSubscription(): Promise<{ clientSecret: string } | { error: string }> {
  const siteUrl = process.env.SITE_URL ?? 'http://localhost:3000';

  const response = await fetch(`${siteUrl}/api/payments/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planId: 'monthly' }),
    // A payment intent must never be served from a cache.
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    return { error: body.error ?? 'Could not start payment.' };
  }

  return (await response.json()) as { clientSecret: string };
}

export default async function SubscribePage() {
  // Read the plan purely to display it. The amount charged is decided when the
  // subscription is created server-side; this is presentation only.
  let priceLabel = '';

  try {
    const plan = planFor('monthly');

    if (plan) {
      priceLabel = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: plan.currency.toUpperCase(),
      }).format(plan.priceCents / 100);
    }
  } catch {
    priceLabel = '';
  }

  let state: { clientSecret: string } | { error: string };

  try {
    state = await startSubscription();
  } catch (error) {
    if (error instanceof MissingStripeKeyError) {
      state = { error: 'Payments are not configured.' };
    } else {
      console.error('[stripe] could not start the subscription', error);
      state = { error: 'Could not start payment.' };
    }
  }

  return (
    <div style={{ maxWidth: '48ch' }} className="mx-auto">
      <p className="font-display text-xs uppercase tracking-widest text-accent">Subscribe</p>
      <h1 className="mt-4 text-5xl uppercase">Read every edition</h1>
      <p className="mt-4">
        {priceLabel ? `${priceLabel} a month.` : 'Monthly subscription.'} Cancel whenever you
        like.
      </p>

      {'error' in state ? (
        <p role="alert" className="mt-8 border-l-2 border-accent pl-4">
          {state.error} Nothing has been charged.
        </p>
      ) : (
        <SubscribeForm
          clientSecret={state.clientSecret}
          returnUrl={`${process.env.SITE_URL ?? 'http://localhost:3000'}/subscribe/return`}
        />
      )}
    </div>
  );
}
