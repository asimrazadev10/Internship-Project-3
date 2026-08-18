import Link from 'next/link';
import { MissingStripeKeyError, getStripe } from '@/lib/stripe-server';

export const dynamic = 'force-dynamic';

/**
 * Where Stripe sends the customer after a redirect-based method or a 3D Secure
 * challenge.
 *
 * THIS PAGE FULFILS NOTHING. It reads the PaymentIntent purely to tell the
 * customer what happened. Anyone can open this URL with an invented
 * payment_intent parameter, and a customer whose browser dies mid-redirect
 * never sees it at all — which is exactly why fulfilment lives in the webhook,
 * where the payload is signed and delivery is retried for three days.
 *
 * The status shown here is read live from Stripe, not taken from the query
 * string, so it cannot be faked by editing the URL — but it is still only a
 * message, never an entitlement.
 */
export default async function SubscribeReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ payment_intent?: string; payment_intent_client_secret?: string }>;
}) {
  const params = await searchParams;
  const intentId = params.payment_intent;

  let status: string | null = null;

  if (intentId) {
    try {
      const intent = await getStripe().paymentIntents.retrieve(intentId);
      status = intent.status;
    } catch (error) {
      if (!(error instanceof MissingStripeKeyError)) {
        console.error('[stripe] could not retrieve the payment intent', error);
      }

      status = null;
    }
  }

  const headline =
    status === 'succeeded'
      ? 'Payment received'
      : status === 'processing'
        ? 'Payment processing'
        : status === 'requires_payment_method'
          ? 'Payment not completed'
          : 'Nothing to show';

  const detail =
    status === 'succeeded'
      ? 'Your subscription is being activated. It appears on your account as soon as our systems confirm the payment.'
      : status === 'processing'
        ? 'Your bank is still settling this payment. We will email you when it clears.'
        : status === 'requires_payment_method'
          ? 'That payment did not go through and you have not been charged. You can try again with another card.'
          : 'We could not find that payment. If you were charged, your Stripe receipt is the record of it.';

  return (
    <div style={{ maxWidth: '68ch' }}>
      <p className="font-display text-xs uppercase tracking-widest text-accent">Subscribe</p>
      <h1 className="mt-4 text-5xl uppercase">{headline}</h1>
      <p className="mt-4">{detail}</p>
      <Link
        href="/"
        className="font-display mt-8 inline-block border-b border-rule uppercase tracking-widest hover:text-accent"
      >
        Back to the front page
      </Link>
    </div>
  );
}
