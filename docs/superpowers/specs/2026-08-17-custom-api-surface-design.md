# Custom API Surface — Design

**Date:** 2026-08-17
**Project:** strapi-cms (Strapi 5.52.0) + `frontend/` (Next.js 16 App Router)

## Purpose

All nine of this project's controllers, services, and routes are untouched
factory boilerplate. There are no lifecycle hooks, no policies, and no route
middlewares — Strapi's entire extension surface is unused.

This project exercises that surface, but hangs each extension point on a real
need rather than adding it to be demonstrated:

- **A gap:** `uid` fields are only auto-filled by the admin UI, so anything
  created through the REST API or the Document Service gets `slug: null`. The
  seed works around this by hand-writing every slug, with a comment in
  `src/seed/data.ts` explaining why. That silently breaks the frontend's
  slug-based routing for any entry created another way.
- **A missing feature:** the article page renders category pills and nothing
  else. "More in this section" is the obvious absent piece, and it needs a
  custom route, controller, and service.

## Scope

In scope:

- Auto-slug lifecycle hooks on Article and Category, with de-duplication.
- A shared slug utility.
- `GET /api/articles/:slug/related`, with a custom controller, service method,
  and route.
- A policy validating that route's `limit` parameter.
- A route middleware constraining that route's response fields.
- Frontend rendering of related articles on the article page.
- Unit tests, a verification script, and public read access for the new route.
- Vitest added as a dev dependency of the Strapi app — its first test runner.
  Earlier slices held the Strapi `package.json` immutable; this one changes it
  deliberately, because the alternative is a frontend test importing `src/`.

Out of scope (deferred, each for a stated reason):

- Internationalisation and authentication — still their own slices.
- Overriding the factory `find`/`findOne` controllers. The new endpoint is
  additive; rewriting the existing ones would risk the four verification
  suites that depend on their current behaviour for no gain.
- GraphQL, cron tasks, and the email provider.
- Rate limiting. Meaningful rate limiting needs shared state; an in-memory
  counter resets per process and would be a demonstration, not a control.

## Verified framework behaviour

Read from the installed source, not assumed. This is the crux of the policy
design:

`node_modules/@strapi/core/dist/services/errors.js` maps `ForbiddenError` (and
its subclass `PolicyError`) to **403**, and defaults every other
`ApplicationError` — including `ValidationError` — to **400**.
`node_modules/@strapi/core/dist/services/server/policy.js` throws
`PolicyError` when a policy returns `false`.

Therefore a policy that returns `false` produces **403**, not 400. To answer
**400** for a malformed parameter, the policy must **throw**
`new errors.ValidationError(...)` from `@strapi/utils`. The implementation must
do that, and the verification script asserts 400 — so getting this wrong fails
loudly rather than passing as "some 4xx".

## Auto-slug

### The shared utility — `src/utils/slug.ts`

```ts
slugify(input: string): string
uniqueSlug(strapi, uid: string, base: string, excludeDocumentId?: string): Promise<string>
```

`slugify` lowercases, strips diacritics, replaces any run of non-alphanumerics
with a single hyphen, and trims leading and trailing hyphens. Empty or
punctuation-only input yields an empty string, which the caller treats as "no
slug derivable" rather than writing `""`.

`uniqueSlug` returns `base` when free, otherwise `base-2`, `base-3`, and so on.
It excludes the document being updated from the collision check, so re-saving an
entry does not bump its own slug — without that exclusion, every save would
increment the suffix.

De-duplication is not optional polish. The `uid` field is unique, so two
articles sharing a title would otherwise fail on a database constraint and
surface as a 500 with nothing explaining why.

### The hooks

`src/api/article/content-types/article/lifecycles.ts` and the same for
category. On `beforeCreate` and `beforeUpdate`: if the incoming data has no
`slug` and the source field is present (`title` for articles, `name` for
categories), derive one. If a slug is present, leave it alone — an editor's
chosen slug is never overwritten, consistent with how the rest of this codebase
treats editor content.

`beforeUpdate` passes the document id so `uniqueSlug` can exclude it.

### How the hook is proven to run

Public writes are 403 by design, so a verification script cannot create an entry
to test the hook. Instead, **the explicit slug is removed from exactly one
seeded category** and the hook derives it at bootstrap. The script asserts that
category still resolves at its expected slug.

This is an end-to-end proof that needs no authentication, and it removes the
workaround comment in `src/seed/data.ts` that motivated this work.

The other seven seeded slugs stay as they are: three existing verification
scripts reference them by name, and churning them buys nothing.

## Related articles

### `GET /api/articles/:slug/related?limit=n`

Returns articles sharing at least one category with `:slug`, excluding the
article itself, newest first. Default `limit` 3, maximum 10.

- **Route** — `src/api/article/routes/related.ts`, a separate route file
  alongside the existing factory router, so the factory's routes are untouched.
- **Controller** — `related` added to `src/api/article/controllers/article.ts`,
  which becomes a `createCoreController` with a custom method rather than the
  bare factory call. It resolves the slug, reads the validated `limit`, and
  delegates.
- **Service** — `findRelated(slug: string, limit: number): Promise<Article[]>`
  added to `src/api/article/services/article.ts`. The query lives here, not in
  the controller, so it is testable and reusable.
- **Policy** — `src/policies/valid-limit.ts`, referenced as
  `global::valid-limit`. Throws `ValidationError` (→ 400) when `limit` is
  present but not an integer in 1..10. Absent `limit` is valid and means the
  default.
- **Route middleware** — `src/middlewares/related-fields.ts`, referenced as
  `global::related-fields`. Overrides `ctx.query.fields` and `ctx.query.populate`
  to exactly `title, slug, excerpt` plus `cover` and `author`, discarding
  whatever the caller asked for, so this endpoint cannot be used to pull the
  whole content graph. In particular `content` and `body` never appear in its
  responses, and the script asserts their absence.

A wrong registry name for either the policy or the middleware fails at boot,
which is the loud failure we want.

### Public access

`PUBLIC_READ_ACTIONS` in `src/seed/data.ts` gains the new action so the
endpoint is readable by the public role, alongside the existing grants.

## Frontend

`getRelatedArticles(slug: string): Promise<Article[]>` in `lib/strapi.ts`,
tagged `[ARTICLES_TAG, articleTag(slug)]` — an edit to this article or to any
article changes the list, and both tags are already invalidated by the
revalidate route, so no new tag is needed.

The article page renders a "More in this section" block beneath the body: up to
three related articles reusing the existing `ArticleCard`, under a hairline rule
with the section heading in the established red uppercase display type. When the
list is empty the whole block is omitted, heading included.

## Error handling

- A malformed `limit` is the policy's 400, raised before the controller runs.
- An unknown slug returns **200 with an empty array**, not 404. To a reader,
  "no related articles" and "no such article" look identical, and the page
  already omits the block for an empty list. A 404 here would also make the
  frontend's error path fire for a condition that is not an error.
- `slugify` returning empty means no slug is written; the entry keeps
  `slug: null` rather than gaining `""`, which would collide with any other
  empty slug on a unique field.
- If the related fetch throws, the existing `strapiFetch` error path applies and
  the article page omits the block rather than failing.

## Testing

**Unit tests, Strapi side — a new test runner**

The frontend owns the only test runner in this repo today, and the obvious
shortcut is to import `src/utils/slug.ts` into a frontend test. That is wrong:
every slice so far has kept the Strapi and frontend sources strictly separate,
and a frontend test reaching into `src/` would be the first breach — the kind a
reviewer should reject.

So this slice adds Vitest as a dev dependency of the **Strapi** app, with
`"test": "vitest run"` in the root `package.json`, and a `src/utils/slug.test.ts`
beside the code it tests. This is deliberate scope: it is the first non-trivial
pure logic in `src/`, and it should be testable in its own right.

- `slugify`: spaces, mixed case, punctuation, accented characters, leading and
  trailing separators, empty string, punctuation-only input.
- The policy's validation predicate, extracted into `src/policies/valid-limit.ts`
  as an exported pure function so it can be tested without a Strapi context:
  valid integers in range, `0`, `11`, `-1`, `abc`, `1.5`, and absent.

`uniqueSlug` is not unit-tested — it needs a live database query — and is
covered by the verification script instead.

**Unit tests, frontend (Vitest, existing runner)**

- `getRelatedArticles`: the tags it sets and the query it issues.

**Script (`scripts/verify-custom-api.sh`)** — same shape as the existing
verification scripts: `check` helper, PASS/FAIL table, exit status from an
accumulated flag. It asserts:

- The category whose seeded slug was removed resolves at the expected slug,
  proving the lifecycle hook ran.
- `GET /api/articles/<slug>/related` returns 200 and a non-empty array for an
  article that shares a category.
- Its responses contain no `content` and no `body` key, proving the middleware
  constrained the fields.
- `limit=0`, `limit=11`, and `limit=abc` each return **400** — not 403, which
  would mean the policy returned `false` instead of throwing.
- `limit=2` returns at most two entries.
- An unknown slug returns 200 with an empty array.

**Regression** — `verify-blog-api.sh`, `verify-content-model.sh`,
`verify-media.sh`, `verify-stripe.sh`, and `verify-isr.sh` must all still pass.
The lifecycle hooks are the risk here: they run on every write, including the
seed's and the enrichment's, so a mistake there breaks bootstrap for everything.

## Acceptance Criteria

- One seeded category has no explicit slug and still resolves at the expected
  slug after bootstrap.
- Re-running bootstrap twice does not change any slug.
- `GET /api/articles/:slug/related` returns related articles, never the article
  itself, limited by `limit`, defaulting to 3.
- The endpoint's responses never include `content` or `body`.
- `limit=0`, `limit=11`, `limit=abc` each return 400.
- An unknown slug returns 200 and an empty array.
- The article page shows "More in this section" when related articles exist and
  omits the block entirely when none do.
- All six verification scripts pass.
