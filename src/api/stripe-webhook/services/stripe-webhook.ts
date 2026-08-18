import Stripe from 'stripe';
import type { Core } from '@strapi/strapi';

/**
 * Lazily-built Stripe client.
 *
 * Never constructed at module scope: this file is loaded during Strapi's boot,
 * and a missing key at that point would take the whole CMS down rather than
 * failing the one route that needs it.
 */
let client: Stripe | null = null;
let clientKey: string | null = null;

export class MissingStripeKeyError extends Error {
  constructor() {
    super('STRIPE_SECRET_KEY is not set');
    this.name = 'MissingStripeKeyError';
  }
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new MissingStripeKeyError();
  }

  if (!client || clientKey !== key) {
    client = new Stripe(key);
    clientKey = key;
  }

  return client;
}

export interface ClaimResult {
  /** False when this event id has been seen before — the caller must not fulfil. */
  claimed: boolean;
  ledgerId?: number;
}

/**
 * Claims an event id for processing.
 *
 * The unique constraint on `eventId` IS the lock. A read-then-write check would
 * race: two concurrent deliveries of the same event both read "not present",
 * both fulfil, and the customer is charged once but fulfilled twice. Letting the
 * INSERT fail is atomic, so exactly one caller wins.
 *
 * Stripe retries deliveries for up to three days and explicitly does not
 * guarantee at-most-once, so duplicates are expected traffic, not an anomaly.
 */
export async function claimEvent(
  strapi: Core.Strapi,
  event: Stripe.Event,
): Promise<ClaimResult> {
  try {
    const row = await strapi.db.query('api::payment-event.payment-event').create({
      data: {
        eventId: event.id,
        eventType: event.type,
        status: 'processing',
        payloadSummary: `${event.type} @ ${new Date(event.created * 1000).toISOString()}`,
      },
    });

    return { claimed: true, ledgerId: row.id };
  } catch (error) {
    // A duplicate-key violation means another delivery already claimed it.
    // Anything else is a real database problem and must not be swallowed.
    const existing = await strapi.db
      .query('api::payment-event.payment-event')
      .findOne({ where: { eventId: event.id }, select: ['id'] });

    if (existing) {
      return { claimed: false };
    }

    throw error;
  }
}

export async function markProcessed(
  strapi: Core.Strapi,
  ledgerId: number | undefined,
  failureReason?: string,
): Promise<void> {
  if (ledgerId === undefined) {
    return;
  }

  await strapi.db.query('api::payment-event.payment-event').update({
    where: { id: ledgerId },
    data: failureReason
      ? { status: 'failed', failureReason }
      : { status: 'processed' },
  });
}

/**
 * The actual fulfilment: mark the subscriber active.
 *
 * Keyed on our own `orderRef`, which we generated before talking to Stripe and
 * carried through subscription metadata — so fulfilment never depends on
 * anything the browser sent us.
 */
export async function activateSubscriber(
  strapi: Core.Strapi,
  fields: {
    orderRef: string;
    email?: string | null;
    stripeCustomerId?: string | null;
    stripeSubscriptionId?: string | null;
    amountTotal?: number | null;
    currency?: string | null;
  },
): Promise<void> {
  const existing = await strapi.db
    .query('api::subscriber.subscriber')
    .findOne({ where: { orderRef: fields.orderRef }, select: ['id'] });

  const data = {
    orderRef: fields.orderRef,
    email: fields.email ?? undefined,
    stripeCustomerId: fields.stripeCustomerId ?? undefined,
    stripeSubscriptionId: fields.stripeSubscriptionId ?? undefined,
    amountTotal: fields.amountTotal ?? undefined,
    currency: fields.currency ?? undefined,
    status: 'active' as const,
    activatedAt: new Date().toISOString(),
  };

  if (existing) {
    await strapi.db
      .query('api::subscriber.subscriber')
      .update({ where: { id: existing.id }, data });
    return;
  }

  await strapi.db.query('api::subscriber.subscriber').create({ data });
}
