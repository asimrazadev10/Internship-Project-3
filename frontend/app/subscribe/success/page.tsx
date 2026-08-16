import Link from 'next/link';
import { getStripe } from '@/lib/stripe';

// Reading searchParams already forces dynamic rendering; stated explicitly so
// nobody later mistakes this page for one of the statically generated blog routes.
export const dynamic = 'force-dynamic';

function formatAmount(amountCents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amountCents / 100);
}

/**
 * Displays the outcome of a Checkout Session. It grants nothing and unlocks
 * nothing: anyone can visit this URL with an invented session_id, so it is
 * display-only. The webhook is the trustworthy confirmation.
 */
export default async function SubscribeSuccess({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;

  let paymentStatus: string | null = null;
  let amount: string | null = null;

  if (sessionId) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(sessionId);
      paymentStatus = session.payment_status;
      if (session.amount_total !== null && session.currency) {
        amount = formatAmount(session.amount_total, session.currency);
      }
    } catch {
      // Unknown id, unconfigured key, or a Stripe outage all land here. None of
      // them is an error worth showing a reader — fall through to the neutral state.
      paymentStatus = null;
    }
  }

  if (!paymentStatus) {
    return (
      <div style={{ maxWidth: '68ch' }}>
        <p className="font-display text-xs uppercase tracking-widest text-accent">Checkout</p>
        <h1 className="mt-4 text-5xl uppercase">Session not found</h1>
        <p className="mt-4">
          We could not look up that checkout session. If you were charged, your receipt from
          Stripe is the record of it.
        </p>
        <Link
          href="/"
          className="font-display mt-8 inline-block border-b border-rule uppercase tracking-widest hover:text-accent"
        >
          Back to the front page
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: '68ch' }}>
      <p className="font-display text-xs uppercase tracking-widest text-accent">Checkout</p>
      <h1 className="mt-4 text-5xl uppercase">
        {paymentStatus === 'paid' ? 'You are subscribed' : 'Payment pending'}
      </h1>
      <p className="mt-4">
        Stripe reports this session as <strong>{paymentStatus}</strong>
        {amount ? ` for ${amount} per month.` : '.'}
      </p>
      <Link
        href="/"
        className="font-display mt-8 inline-block border-b border-rule uppercase tracking-widest hover:text-accent"
      >
        Back to the front page
      </Link>
    </div>
  );
}
