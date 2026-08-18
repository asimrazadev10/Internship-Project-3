import type Stripe from 'stripe';
import type { Core } from '@strapi/strapi';
import {
  MissingStripeKeyError,
  activateSubscriber,
  claimEvent,
  getStripe,
  markProcessed,
} from '../services/stripe-webhook';

/**
 * Where strapi::body parks the original request bytes when configured with
 * `includeUnparsed: true` (see config/middlewares.ts).
 *
 * Obtained from the global symbol registry rather than by importing koa-body's
 * internals, so it keeps working across dependency bumps:
 * koa-body/lib/unparsed.js is literally `Symbol.for('unparsedBody')`.
 */
const UNPARSED = Symbol.for('unparsedBody');

/** The minimal Koa context surface this controller touches. */
interface WebhookContext {
  request: {
    headers: Record<string, string | string[] | undefined>;
    body?: Record<PropertyKey, unknown>;
  };
  status: number;
  body: unknown;
}

/**
 * Reads the exact bytes Stripe signed.
 *
 * Stripe's signature covers the raw payload. Re-serialising the parsed object
 * would not reproduce those bytes — key order, whitespace and number formatting
 * all differ — so verification would fail for every event. This never touches
 * the parsed body.
 */
function rawBodyOf(ctx: WebhookContext): string | null {
  const raw = ctx.request.body?.[UNPARSED];

  return typeof raw === 'string' && raw.length > 0 ? raw : null;
}

/**
 * Our own order reference, minted before we contacted Stripe and attached to
 * the subscription's metadata so it round-trips untouched.
 *
 * Fulfilment keys on this rather than on anything the browser sent.
 */
function orderRefOf(object: { metadata?: Stripe.Metadata | null }): string | null {
  const ref = object.metadata?.orderRef;

  return typeof ref === 'string' && ref.length > 0 ? ref : null;
}

/**
 * Finds the subscription id on an invoice across API shapes.
 *
 * Older versions expose `invoice.subscription`; from the 2025-03-31 (Basil)
 * version it moved under `invoice.parent.subscription_details.subscription`.
 * Reading both means an API version bump does not silently stop fulfilment.
 */
function subscriptionIdOf(invoice: Stripe.Invoice): string | null {
  const candidates: unknown[] = [
    (invoice as unknown as { subscription?: unknown }).subscription,
    (
      invoice as unknown as {
        parent?: { subscription_details?: { subscription?: unknown } };
      }
    ).parent?.subscription_details?.subscription,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.length > 0) {
      return candidate;
    }

    if (candidate && typeof candidate === 'object' && 'id' in candidate) {
      const { id } = candidate as { id?: unknown };

      if (typeof id === 'string') {
        return id;
      }
    }
  }

  return null;
}

/**
 * Fulfilment, executed after the 200 has already gone out.
 *
 * Nothing thrown here can reach Stripe, so every failure is caught and written
 * to the ledger row instead — leaving a queryable trail of events that verified
 * but could not be fulfilled.
 */
async function processEvent(
  strapi: Core.Strapi,
  event: Stripe.Event,
  ledgerId: number | undefined,
): Promise<void> {
  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const intent = event.data.object;
        const orderRef = orderRefOf(intent);

        strapi.log.info(
          `[stripe] payment_intent.succeeded ${intent.id} ` +
            `amount=${intent.amount_received} ${intent.currency} orderRef=${orderRef ?? 'none'}`,
        );

        // A subscription's first charge arrives as an invoice PaymentIntent,
        // which carries none of our metadata — that path fulfils on
        // invoice.paid below. A PaymentIntent we created ourselves does carry
        // orderRef, and fulfils here.
        if (orderRef) {
          await activateSubscriber(strapi, {
            orderRef,
            email: intent.receipt_email,
            stripeCustomerId: typeof intent.customer === 'string' ? intent.customer : null,
            amountTotal: intent.amount_received,
            currency: intent.currency,
          });
        }

        break;
      }

      case 'invoice.paid': {
        // Authoritative for subscriptions: this says the billing period is paid
        // for, and links back to the subscription carrying our orderRef.
        const invoice = event.data.object;
        const subscriptionId = subscriptionIdOf(invoice);

        if (!subscriptionId) {
          strapi.log.info(`[stripe] invoice.paid ${invoice.id} has no subscription, ignoring`);
          break;
        }

        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const orderRef = orderRefOf(subscription);

        if (!orderRef) {
          strapi.log.warn(
            `[stripe] subscription ${subscriptionId} carries no orderRef metadata; cannot fulfil`,
          );
          break;
        }

        await activateSubscriber(strapi, {
          orderRef,
          email: invoice.customer_email,
          stripeCustomerId: typeof invoice.customer === 'string' ? invoice.customer : null,
          stripeSubscriptionId: subscriptionId,
          amountTotal: invoice.amount_paid,
          currency: invoice.currency,
        });

        strapi.log.info(`[stripe] activated subscriber for orderRef=${orderRef}`);
        break;
      }

      case 'payment_intent.payment_failed': {
        const intent = event.data.object;
        const failure = intent.last_payment_error;

        // Logged loudly because this is where SCA drop-off surfaces: a customer
        // who abandons 3D Secure leaves a failed intent with
        // code=payment_intent_authentication_failure and nothing else.
        strapi.log.warn(
          `[stripe] payment_intent.payment_failed ${intent.id} ` +
            `code=${failure?.code ?? 'unknown'} ` +
            `decline_code=${failure?.decline_code ?? 'none'} ` +
            `type=${failure?.type ?? 'unknown'} ` +
            `message=${failure?.message ?? 'none'}`,
        );

        break;
      }

      default: {
        strapi.log.info(`[stripe] ignoring unhandled event type ${event.type}`);
      }
    }

    await markProcessed(strapi, ledgerId);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    strapi.log.error(`[stripe] fulfilment failed for ${event.id}: ${reason}`);
    await markProcessed(strapi, ledgerId, reason);
  }
}

export default {
  /**
   * POST /api/stripe/webhook
   *
   * Order of operations: verify → claim → acknowledge → fulfil. The
   * acknowledgement goes out before fulfilment runs, so a slow database write
   * can never push us past Stripe's delivery timeout and trigger retries.
   */
  async handle(ctx: WebhookContext) {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = ctx.request.headers['stripe-signature'];
    const rawBody = rawBodyOf(ctx);

    // A missing secret is a misconfiguration, and the only safe reading of a
    // misconfigured verifier is "reject" — never "accept unverified".
    if (!secret || typeof signature !== 'string' || !rawBody) {
      ctx.status = 400;
      ctx.body = { error: 'invalid signature' };
      return;
    }

    let event: Stripe.Event;

    try {
      // Mathematical verification: HMAC-SHA256 over `${timestamp}.${rawBody}`,
      // compared in constant time, within a tolerance window that also rejects
      // a replayed capture of a genuine request.
      event = getStripe().webhooks.constructEvent(rawBody, signature, secret);
    } catch (error) {
      if (error instanceof MissingStripeKeyError) {
        ctx.status = 503;
        ctx.body = { error: 'not configured' };
        return;
      }

      strapi.log.warn(
        `[stripe] rejected an unverifiable webhook: ${(error as Error).message}`,
      );
      ctx.status = 400;
      ctx.body = { error: 'invalid signature' };
      return;
    }

    // Exactly-once: the unique eventId insert is the lock.
    const claim = await claimEvent(strapi, event);

    if (!claim.claimed) {
      strapi.log.info(`[stripe] event ${event.id} already processed, skipping`);
      ctx.status = 200;
      ctx.body = { received: true, duplicate: true };
      return;
    }

    // Acknowledge NOW. Everything below happens after Stripe has its 200.
    ctx.status = 200;
    ctx.body = { received: true };

    setImmediate(() => {
      void processEvent(strapi, event, claim.ledgerId);
    });
  },
};
