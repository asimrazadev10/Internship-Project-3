# 🚀 Getting started with Strapi

Strapi comes with a full featured [Command Line Interface](https://docs.strapi.io/dev-docs/cli) (CLI) which lets you scaffold and manage your project in seconds.

### `develop`

Start your Strapi application with autoReload enabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-develop)

```
npm run develop
# or
yarn develop
```

### `start`

Start your Strapi application with autoReload disabled. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-start)

```
npm run start
# or
yarn start
```

### `build`

Build your admin panel. [Learn more](https://docs.strapi.io/dev-docs/cli#strapi-build)

```
npm run build
# or
yarn build
```

## ⚙️ Deployment

Strapi gives you many possible deployment options for your project including [Strapi Cloud](https://cloud.strapi.io). Browse the [deployment section of the documentation](https://docs.strapi.io/dev-docs/deployment) to find the best solution for your use case.

```
yarn strapi deploy
```

## 📚 Learn more

- [Resource center](https://strapi.io/resource-center) - Strapi resource center.
- [Strapi documentation](https://docs.strapi.io) - Official Strapi documentation.
- [Strapi tutorials](https://strapi.io/tutorials) - List of tutorials made by the core team and the community.
- [Strapi blog](https://strapi.io/blog) - Official Strapi blog containing articles made by the Strapi team and the community.
- [Changelog](https://strapi.io/changelog) - Find out about the Strapi product updates, new features and general improvements.

Feel free to check out the [Strapi GitHub repository](https://github.com/strapi/strapi). Your feedback and contributions are welcome!

## ✨ Community

- [Discord](https://discord.strapi.io) - Come chat with the Strapi community including the core team.
- [Forum](https://forum.strapi.io/) - Place to discuss, ask questions and find answers, show your Strapi project and get feedback or just talk with other Community members.
- [Awesome Strapi](https://github.com/strapi/awesome-strapi) - A curated list of awesome things related to Strapi.

---

<sub>🤫 Psst! [Strapi is hiring](https://strapi.io/careers).</sub>

## Frontend

A Next.js App Router frontend lives in `frontend/`. It renders the blog as a
newspaper and demonstrates Incremental Static Regeneration end to end.

```bash
./scripts/restart-dev.sh          # Strapi on :1337
cd frontend && npm install
cp .env.example .env.local        # secret must match the repo-root .env
npm run dev                       # Next on :3000
```

Pages are prerendered and revalidate every 60 seconds. Strapi also registers a
`nextjs-isr` webhook on bootstrap that POSTs to `/api/revalidate`, so editing an
article in the admin UI makes the change live within a second or two. The
footer's "Rendered …" stamp shows when the page was last generated.

Verification:

```bash
./scripts/verify-blog-api.sh      # content model and permissions
./scripts/verify-isr.sh           # builds the frontend and checks ISR behavior
./scripts/verify-content-model.sh  # components, dynamic zone, and single type
./scripts/verify-media.sh         # uploads, derivatives, and image links
```

### Content model

Articles carry an optional `body` dynamic zone built from four components —
rich text, pull quote, callout, and code. Articles without one fall back to the
original `content` markdown field, so both paths stay live. A `site-setting`
single type supplies the masthead tagline, nav links, subscribe label, and
footer text; when it is absent the frontend falls back to hardcoded copy.

Because the masthead and category bar are in the root layout, the
`site-settings` and `categories` cache tags are attached to every route:
editing either revalidates the whole site.

### Media

Six demo photographs live in `assets/media/`, committed so that seeding works
offline and every clone gets identical content. `./scripts/fetch-media.sh`
re-downloads them from Lorem Picsum by fixed ID; `assets/media/MANIFEST.md`
records each file's source and licence.

Bootstrap uploads them through Strapi, which generates thumbnail, small, medium
and large derivatives via sharp. Three of the four articles get a cover — the
fourth is deliberately coverless so the no-image layout stays exercised — and
both authors get an avatar.

Uploaded files land in `public/uploads/`, which is gitignored: those are
generated, `assets/media/` is source.

### Subscriptions (PaymentIntents + Payment Element)

The masthead's SUBSCRIBE control links to `/subscribe`, which mounts Stripe's
Payment Element. There is no hosted Checkout page and no `Charge` object
anywhere; everything runs through the PaymentIntents API.

**How the money flows**

1. `/subscribe` (server component) calls `POST /api/payments/subscription`.
2. That route prices the plan **server-side** — the browser never sends an
   amount — creates a Customer and a Subscription with
   `payment_behavior: 'default_incomplete'`, and returns only the first
   invoice's PaymentIntent client secret. Every mutating call carries an
   `Idempotency-Key` derived from a freshly minted `orderRef`, so a retry or a
   double submit cannot charge twice.
3. The browser confirms that intent with the Payment Element.
   `automatic_payment_methods` is enabled, so Stripe decides which methods to
   render; nothing is hardcoded. 3D Secure is handled by `confirmPayment` with
   `redirect: 'if_required'`.
4. **Fulfilment happens only in the webhook.** `/subscribe/return` reads the
   intent purely to tell the customer what happened and grants nothing.

**The webhook lives in Strapi, not Next** — fulfilment and the idempotency
ledger are database writes, and Strapi owns the database. It verifies the
signature against the raw request bytes (`config/middlewares.ts` sets
`includeUnparsed: true`), claims the event id in a `payment-event` ledger row,
returns 200 immediately, and only then does the fulfilment work.

Exactly-once is enforced by a real database unique index on
`payment_events.event_id`, created at bootstrap. Strapi's `unique: true` is
application-level validation and does **not** create one, and the webhook writes
through `strapi.db.query()`, which bypasses that validation — so without the
index, de-duplication would be a comment rather than a guarantee.

**Keys**

| Variable | Where | Secret? |
|---|---|---|
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | `frontend/.env.local` | No — public by design |
| `STRIPE_SECRET_KEY` | `frontend/.env.local` and root `.env` | Yes |
| `STRIPE_WEBHOOK_SECRET` | root `.env` (Strapi) | Yes |
| `STRIPE_PRICE_ID` | optional, recommended in production | No |

**Testing the webhook locally with the Stripe CLI**

```bash
# 1. Install the CLI — a standalone binary, NOT an npm package.
#    https://docs.stripe.com/stripe-cli
#    (`npx stripe` does not work: the npm "stripe" package is the SDK and
#     ships no executable.)

# 2. Pair it with your account. Opens a browser to confirm.
stripe login

# 3. Forward events to the Strapi receiver — port 1337, not 3000.
#    Leave this running; it prints a whsec_... signing secret.
stripe listen --forward-to localhost:1337/api/stripe/webhook

# 4. Put that secret in the repo-root .env as STRIPE_WEBHOOK_SECRET and
#    restart Strapi. The secret is regenerated every time `stripe listen`
#    starts, so re-paste it after a restart.
./scripts/restart-dev.sh

# 5. Drive a real payment: open http://localhost:3000/subscribe and pay with
#    4242 4242 4242 4242, any future expiry, any CVC.
#    For the 3D Secure path use 4000 0025 0000 3155.
#    For a decline use 4000 0000 0000 9995.

# 6. Or fire events directly, without the UI:
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed

# 7. Watch what the receiver did:
grep '\[stripe\]' /tmp/strapi.log
```

`./scripts/verify-stripe.sh` covers all of this without the CLI: it signs events
with Stripe's own HMAC construction, so it exercises real signature
verification, replay suppression, and fulfilment against the database.

