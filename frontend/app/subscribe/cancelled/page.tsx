import Link from 'next/link';

export default function SubscribeCancelled() {
  return (
    <div style={{ maxWidth: '68ch' }}>
      <p className="font-display text-xs uppercase tracking-widest text-accent">Checkout</p>
      <h1 className="mt-4 text-5xl uppercase">No charge made</h1>
      <p className="mt-4">
        You left checkout before completing payment. Nothing was charged, and you can start
        again whenever you like.
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
