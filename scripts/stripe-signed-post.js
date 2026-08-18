#!/usr/bin/env node
/**
 * Posts a genuinely-signed Stripe event to the webhook.
 *
 * Uses stripe.webhooks.generateTestHeaderString — the same HMAC construction
 * Stripe uses in production — so this exercises real signature verification
 * rather than mocking it away. Without this, the only thing a script can prove
 * is that bad signatures are rejected, which is the easy half.
 *
 * Usage: node scripts/stripe-signed-post.js <event-type> <order-ref> [event-id]
 * Prints: "<http-status> <response-body>"
 */
const Stripe = require('stripe');

const [, , eventType = 'payment_intent.succeeded', orderRef = 'ord_test', eventId] =
  process.argv;

const secret = process.env.STRIPE_WEBHOOK_SECRET;

if (!secret) {
  console.error('STRIPE_WEBHOOK_SECRET is not set');
  process.exit(2);
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

const id = eventId || `evt_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const event = {
  id,
  object: 'event',
  api_version: '2025-03-31.basil',
  created: Math.floor(Date.now() / 1000),
  type: eventType,
  livemode: false,
  pending_webhooks: 0,
  request: { id: null, idempotency_key: null },
  data: {
    object:
      eventType === 'payment_intent.payment_failed'
        ? {
            id: 'pi_test_failed',
            object: 'payment_intent',
            amount: 800,
            currency: 'usd',
            status: 'requires_payment_method',
            metadata: { orderRef },
            last_payment_error: {
              type: 'card_error',
              code: 'payment_intent_authentication_failure',
              decline_code: null,
              message: 'The customer did not complete authentication.',
            },
          }
        : {
            id: 'pi_test_succeeded',
            object: 'payment_intent',
            amount: 800,
            amount_received: 800,
            currency: 'usd',
            status: 'succeeded',
            customer: 'cus_test_123',
            receipt_email: 'reader@example.com',
            metadata: { orderRef },
          },
  },
};

const payload = JSON.stringify(event);

const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });

async function main() {
  const response = await fetch('http://localhost:1337/api/stripe/webhook', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature,
    },
    body: payload,
  });

  const text = await response.text();
  console.log(`${response.status} ${text}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
