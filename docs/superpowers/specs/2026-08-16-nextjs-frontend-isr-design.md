# Next.js Frontend with ISR — Design

**Date:** 2026-08-16
**Project:** strapi-cms (Strapi 5.52.0, TypeScript, SQLite) + new `frontend/` (Next.js App Router)

## Purpose

Put a public reading experience in front of the existing blog content model, and
use it to exercise Incremental Static Regeneration end to end: pages prerendered
at build time, refreshed on a time window, and invalidated precisely and
immediately when an editor changes something in Strapi.

ISR is the point of the project. The design of the site serves that goal by
giving the caching behavior something real to cache.

## Scope

In scope:

- A Next.js App Router application in `frontend/`, with its own `package.json`.
- Three routes: home, article detail, category detail.
- A typed data layer wrapping Strapi's REST API and owning cache tags.
- Time-based ISR plus on-demand revalidation through a secret-protected route
  handler, driven by a Strapi webhook registered on bootstrap.
- An editorial visual design modelled on thefp.com.
- A verification script asserting cache behavior against a production build.

Out of scope (deferred, not needed to satisfy the goal):

- Author pages and an author index.
- Search, pagination, comments, subscriptions, or any authenticated view.
- Images. The seed data has no uploads, so `cover` and `avatar` stay unused and
  the layout carries hierarchy typographically instead.
- Deployment configuration. Both apps run locally.
- Monorepo tooling. The two apps share no build system and are coupled only by
  HTTP.

## Architecture

```
strapi-cms/
  src/, config/, scripts/       existing Strapi app
    src/index.ts                bootstrap — gains idempotent webhook registration
    scripts/verify-isr.sh       new
  frontend/                     new Next.js app, self-contained
    package.json
    .env.local                  STRAPI_URL, REVALIDATE_SECRET, REVALIDATE_WINDOW
    .env.example                committed; .env.local is not
    app/
      layout.tsx                masthead, category bar, footer, fonts
      page.tsx                  /
      articles/[slug]/page.tsx
      categories/[slug]/page.tsx
      api/revalidate/route.ts
      error.tsx, not-found.tsx
    lib/
      strapi.ts                 fetch wrapper + named queries
      types.ts                  Article, Author, Category
      tags.ts                   cache tag constructors
    components/
      Masthead.tsx, CategoryBar.tsx
      HeroArticle.tsx, ArticleCard.tsx, ArticleRow.tsx
      Byline.tsx, CategoryPills.tsx, Prose.tsx
```

Strapi runs on `http://localhost:1337`, Next on `http://localhost:3000`.

## Data Layer

`lib/strapi.ts` is the only module that knows Strapi exists. It owns the base
URL, the `{ data, meta }` envelope, and `populate` parameters. Everything above
it sees plain typed objects.

```ts
strapiFetch<T>(path: string, opts: { tags: string[] }): Promise<T>
```

It calls `fetch` with `next: { tags, revalidate: REVALIDATE_WINDOW }`, throws on
a non-2xx response with the status and path in the message, and unwraps `data`.

Four named queries build on it:

| Function | Strapi request | Tags |
|---|---|---|
| `getArticles()` | `/api/articles?populate=*&sort=publishedAt:desc` | `articles` |
| `getArticleBySlug(slug)` | `/api/articles?filters[slug][$eq]=…&populate=*` | `article:<slug>` only |
| `getCategories()` | `/api/categories` | `categories` |
| `getCategoryBySlug(slug)` | `/api/categories?filters[slug][$eq]=…&populate[articles][populate]=author` | `categories`, `category:<slug>`, `articles` |

Single-entity queries return the first element of the list response, or `null`
when the array is empty. Callers turn `null` into `notFound()`.

`lib/types.ts` holds hand-written interfaces matching the three content types.
Strapi 5 returns flattened attributes (no `attributes` wrapper), so the types
mirror the schema fields directly, plus `documentId`, `publishedAt`, and
relations.

### Cache tag convention

`lib/tags.ts` exports the constructors so no route handler or page ever spells a
tag as a bare string:

- `articles` — anything showing a list of articles
- `article:<slug>` — one article's detail page. A detail page carries *only*
  this tag, never `articles`: tagging it with the list tag as well would make an
  edit to any article invalidate every other article's page, defeating the point
  of per-entity tags. The revalidate route invalidates both tags on an edit, so
  the lists and the edited page refresh while siblings stay cached.
- `categories` — the category bar and any category listing. The root layout
  calls `getCategories()` on every render (the category bar is on every page),
  so this tag is attached to every route: any category create/update/delete
  revalidates the whole site, not just category pages. Defensible since the
  bar is always visible, but worth knowing when reasoning about invalidation
  scope.
- `category:<slug>` — one category's detail page. It also carries `articles`,
  since it renders each member article's title, excerpt, and byline via
  `ArticleCard` and must refresh when any article is edited, not just when the
  category itself changes.

## ISR Behavior

| Route | `generateStaticParams` | `revalidate` | Tags on its data |
|---|---|---|---|
| `/` | — | 60 | `articles` |
| `/articles/[slug]` | every article slug | 60 | `article:<slug>` |
| `/categories/[slug]` | every category slug | 60 | `categories`, `category:<slug>`, `articles` |

`dynamicParams` stays at its default (`true`): a slug created after the build
renders on first request and is cached from then on. The 60-second window is the
safety net for a missed webhook; the webhook is the fast path.

The revalidate window is read from `REVALIDATE_WINDOW` with a default of 60.
Because Next requires a statically analyzable value for the `revalidate` export,
each route declares `export const revalidate = 60` literally, and the env var
feeds only the `fetch`-level revalidate in `strapiFetch`. This is deliberate —
one number in the config, one literal per route, documented in `.env.example`.

## On-Demand Revalidation

### `POST /api/revalidate` (Next)

1. Read the `x-revalidate-secret` header. Compare against `REVALIDATE_SECRET`
   with `crypto.timingSafeEqual` over equal-length buffers. On mismatch or a
   missing header, return `401` and do nothing else.
2. Parse Strapi's webhook body: `{ event, model, entry }`.
3. Map the model to tags:
   - `article` → `articles`, and `article:<entry.slug>` when a slug is present
   - `category` → `categories`, `category:<entry.slug>`
   - `author` → `articles` (refreshes bylines on lists immediately; detail
     pages, tagged `article:<slug>` only, heal within the 60s window instead)
   - anything else → revalidate nothing, return `200` with an empty list
4. Call `revalidateTag` for each, and return `{ revalidated: string[] }` so the
   call is verifiable by hand.

A `GET` on the same path returns `405`.

### Webhook registration (Strapi)

`src/index.ts` bootstrap creates a webhook named `nextjs-isr` pointing at
`${FRONTEND_URL}/api/revalidate` with the `x-revalidate-secret` header,
subscribed to the create, update, delete, publish, and unpublish events for all
three types. Registration is idempotent in the same style as the existing seed:
look up webhooks by name first, create only when absent. This keeps a fresh
database working without a trip through the admin UI.

`FRONTEND_URL` and `REVALIDATE_SECRET` come from the Strapi environment and
default to `http://localhost:3000` and a development placeholder.

## Visual Design

Editorial newspaper, referencing thefp.com. Values below were sampled from the
live site.

**Palette.** Paper `#F6F4EF` under the entire site — no white cards. Ink
`#363737` for body, `#161613` for headlines. Accent vermillion `#F2312C` for
bylines, kickers, section labels, and the single call-to-action. Hairline rules
`#DDD9D0` are the only separation device: no shadows, no rounded corners, no
card fills.

**Type.** Three roles, loaded through `next/font/google`:

- `Archivo Narrow` 700, uppercase, tight tracking — masthead, nav, kickers,
  bylines.
- `Spectral` 700/800, `letter-spacing: -0.02em`, `line-height: 0.95` at hero
  size — article headlines. The hero headline is uppercase and oversized.
- `Spectral` 400 at 19px/1.65 — prose and excerpts.

**Layout.**

- *Masthead*: black logo block, uppercase sans nav, red CTA at the right. Below
  it, a horizontally scrolling category bar rendered from `getCategories()`.
- *Home*: hero article (most recently published) with an oversized uppercase
  headline spanning two columns, and a right rail of secondary articles split by
  hairlines. Below that, a three-column hairline-separated grid of the rest.
- *Article*: single measured column of about 68 characters. Red uppercase byline
  in the form `ADA OKAFOR — 08.16.26` under the headline, categories as small
  red caps, then the prose.
- *Category*: the category name treated as a section masthead with the red
  accent, then a hairline-separated list of its articles.

Article `content` is seeded markdown. `Prose.tsx` renders it with a minimal
converter for the subset actually present — `##` headings and paragraphs — so no
markdown dependency is added. Anything unrecognized renders as a paragraph.

Layout is responsive by collapsing columns: three to two below 1024px, one below
680px, with the hero headline scaling through `clamp()`.

## Error Handling

- `strapiFetch` throws on non-2xx, including the status and path.
- Detail pages call `notFound()` when the query returns `null`, producing a real
  404 through `not-found.tsx`.
- `app/error.tsx` catches a Strapi outage at request time and renders a plain
  message on the paper background rather than a stack trace.
- `generateStaticParams` failures are left to fail the build. A build that
  silently ships an empty site is worse than a build that stops.
- The revalidate route never reveals whether the secret was missing or merely
  wrong; both are a bare `401`.

## Verification

`scripts/verify-isr.sh`, alongside the existing `verify-blog-api.sh` and
following its structure — a `check` helper, a PASS/FAIL table, exit status from
an accumulated `fail` flag.

ISR does not behave like this in dev mode, so the script builds and starts the
production server:

1. Require Strapi to be answering on :1337; wait for it as the existing script
   does.
2. `npm run build && npm run start` in `frontend/`, waiting for :3000.
3. `GET /` returns 200, and a repeat request returns the same render stamp.

   Every page's footer renders a server-side timestamp in a
   `data-render-stamp` attribute, which changes only when the page is actually
   regenerated. Assertions read that attribute rather than the
   `x-nextjs-cache` header, which has moved between Next versions. It also
   removes the need for authenticated writes to Strapi — public writes are
   403 by design — since regeneration itself is what the tests care about.
4. `GET /articles/<known-slug>` returns 200 and contains the article title.
5. `GET /articles/does-not-exist` returns 404.
6. `POST /api/revalidate` with a wrong secret returns 401.
7. `POST` an article webhook payload with the correct secret, then assert that
   article page's render stamp changes (polling briefly, since Next may serve
   one stale response while regenerating).
8. Assert scoping: another article's detail page keeps its original stamp,
   showing `article:<slug>` did not invalidate its neighbours. The home and
   category pages *do* regenerate — they carry the `articles` tag — which is
   the intended behavior.

The script starts and stops its own Next server and leaves the tree unchanged.

## Acceptance Criteria

- All three routes render seeded content from Strapi in a production build.
- `generateStaticParams` prerenders every seeded article and category slug.
- A webhook delivery regenerates the affected page within seconds, without a
  rebuild and without waiting out the 60-second window, and leaves sibling
  article pages cached.
- A revalidate call with a wrong or missing secret returns 401 and revalidates
  nothing.
- `scripts/verify-blog-api.sh` still passes unchanged.
