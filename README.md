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
```

### Subscriptions

The masthead's SUBSCRIBE button posts to `/api/checkout`, which creates a Stripe
Checkout Session and redirects to Stripe's hosted page. Hosted Checkout needs no
publishable key and no client-side JavaScript, so the button is a plain form POST
and the blog's static rendering is unaffected.

Set up test mode:

```bash
cd frontend
cp .env.example .env.local          # then paste your sk_test_... key
npx stripe listen --forward-to localhost:3000/api/stripe/webhook
# copy the whsec_... it prints into STRIPE_WEBHOOK_SECRET in .env.local
npm run dev
```

Click SUBSCRIBE and pay with a Stripe test card:

| Card | Result |
|---|---|
| `4242 4242 4242 4242` | succeeds |
| `4000 0025 0000 3155` | requires 3D Secure authentication |
| `4000 0000 0000 9995` | declined, insufficient funds |

Any future expiry date, any three-digit CVC, any postcode.

With no Stripe keys set the site runs normally and `/api/checkout` returns 503.

Verification:

```bash
./scripts/verify-stripe.sh                              # unconfigured-case checks
STRIPE_SECRET_KEY=sk_test_... ./scripts/verify-stripe.sh # also creates a real Session
```
