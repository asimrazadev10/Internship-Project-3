'use client';

import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import { loadStripe, type Stripe, type StripeError } from '@stripe/stripe-js';
import { useCallback, useMemo, useState } from 'react';

/**
 * The ONLY Stripe key that belongs in the browser.
 *
 * Publishable keys are designed to be public — they can create tokens and
 * confirm payments the customer already authorised, and nothing else. The
 * secret key never leaves the server (see lib/stripe-server.ts).
 *
 * loadStripe is called at module scope so the Stripe.js bundle is fetched once
 * per page load rather than on every render.
 */
const stripePromise: Promise<Stripe | null> = loadStripe(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
);

/**
 * Turns a Stripe error into something worth showing a customer.
 *
 * `card_error` and `validation_error` carry messages Stripe writes for end
 * users — "Your card was declined.", "Your card has insufficient funds." —
 * and those should be shown verbatim. Every other type is an integration or
 * API problem whose message is for developers, so it is logged and replaced.
 */
function readableError(error: StripeError): string {
  if (error.type === 'card_error' || error.type === 'validation_error') {
    return error.message ?? 'Your card could not be charged.';
  }

  console.error('[stripe] unexpected error during confirmation', error);
  return 'Something went wrong taking your payment. You have not been charged.';
}

function CheckoutForm({ returnUrl }: { returnUrl: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      // Stripe.js has not finished loading. The button is disabled in this
      // state, so this is belt and braces.
      if (!stripe || !elements) {
        return;
      }

      setSubmitting(true);
      setMessage(null);

      try {
        // Surfaces field-level problems (empty number, bad expiry) inline in
        // the Element before we spend a network round trip on them.
        const { error: submitError } = await elements.submit();

        if (submitError) {
          setMessage(readableError(submitError));
          return;
        }

        /**
         * 3D SECURE: this single call handles it.
         *
         * If the issuer demands authentication, the PaymentIntent moves to
         * requires_action and Stripe.js opens the challenge — a modal, or a
         * full redirect to the bank for methods that need one. We do not
         * branch on requires_action ourselves; handling it manually is where
         * these integrations usually break.
         *
         * `redirect: 'if_required'` keeps the customer here when no redirect is
         * needed, and returns the finished PaymentIntent instead.
         */
        const { error, paymentIntent } = await stripe.confirmPayment({
          elements,
          confirmParams: { return_url: returnUrl },
          redirect: 'if_required',
        });

        if (error) {
          setMessage(readableError(error));
          return;
        }

        // NOTE: reaching here does NOT mean the order is fulfilled. It means
        // the customer's browser saw a success. Fulfilment happens only when
        // the signed webhook arrives at Strapi — a browser can be closed,
        // spoofed, or simply lie.
        if (paymentIntent?.status === 'succeeded') {
          window.location.assign(`${returnUrl}?payment_intent=${paymentIntent.id}`);
          return;
        }

        if (paymentIntent?.status === 'processing') {
          setMessage('Your payment is processing. We will email you when it settles.');
          return;
        }

        setMessage('That payment did not complete. Please try another card.');
      } catch (unexpected) {
        // A thrown error here is a network or programming fault, not a decline.
        console.error('[stripe] confirmPayment threw', unexpected);
        setMessage('We could not reach the payment provider. Please try again.');
      } finally {
        setSubmitting(false);
      }
    },
    [elements, returnUrl, stripe],
  );

  return (
    <form onSubmit={onSubmit} className="mt-8">
      {/*
        One Element renders every method Stripe decides is appropriate for this
        customer — card, Apple Pay, Klarna, iDEAL — because the PaymentIntent
        was created with automatic_payment_methods enabled. Nothing here
        hardcodes a payment method.
      */}
      <PaymentElement options={{ layout: 'tabs' }} />

      {message && (
        <p role="alert" className="mt-5 border-l-2 border-accent pl-4 text-base">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={!stripe || submitting}
        className="font-display mt-8 w-full cursor-pointer bg-accent px-6 py-4 text-sm uppercase tracking-widest text-paper disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? 'Confirming…' : 'Subscribe'}
      </button>
    </form>
  );
}

/**
 * Wraps the form in <Elements>, which needs the client secret fetched from our
 * own server. The secret arrives from POST /api/payments/subscription — the
 * browser never sees the amount used to create it.
 */
export function SubscribeForm({
  clientSecret,
  returnUrl,
}: {
  clientSecret: string;
  returnUrl: string;
}) {
  const options = useMemo(
    () => ({
      clientSecret,
      appearance: {
        theme: 'flat' as const,
        variables: {
          colorPrimary: '#F2312C',
          colorBackground: '#F6F4EF',
          colorText: '#363737',
          borderRadius: '0px',
          fontFamily: 'Spectral, Georgia, serif',
        },
      },
    }),
    [clientSecret],
  );

  return (
    <Elements stripe={stripePromise} options={options}>
      <CheckoutForm returnUrl={returnUrl} />
    </Elements>
  );
}
