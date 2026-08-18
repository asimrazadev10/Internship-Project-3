/**
 * The webhook route.
 *
 * `auth: false` because Stripe cannot present a Strapi token — the request is
 * authenticated by its signature instead, which the controller verifies before
 * touching anything. This is the ONLY route in the project that skips Strapi's
 * auth layer, and it is safe precisely because signature verification is
 * stricter: a bearer token proves possession of a secret, whereas the signature
 * proves possession AND that the payload is unmodified AND that it is recent.
 */
export default {
  routes: [
    {
      method: 'POST',
      path: '/stripe/webhook',
      handler: 'stripe-webhook.handle',
      config: {
        auth: false,
        policies: [],
        middlewares: [],
      },
    },
  ],
};
