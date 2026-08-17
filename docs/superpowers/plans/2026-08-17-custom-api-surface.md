# Custom API Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Exercise Strapi's extension surface — lifecycle hooks, a custom route with controller and service, a policy, and a route middleware — with each extension point serving a real need rather than existing to be demonstrated.

**Architecture:** A shared slug utility backs auto-slug lifecycle hooks on Article and Category, closing a real gap where anything created outside the admin UI gets `slug: null`. A `GET /api/articles/:slug/related` endpoint adds the article page's missing "more in this section", guarded by a policy that validates `limit` and a route middleware that constrains which fields the endpoint can return.

**Tech Stack:** Strapi 5.52.0, Next.js 16 App Router, Vitest (added to the Strapi app by this plan; already present in `frontend/`).

**Spec:** `docs/superpowers/specs/2026-08-17-custom-api-surface-design.md`

## Global Constraints

- An editor's slug is NEVER overwritten. The hooks fill `slug` only when it is absent.
- `slugify` returning empty means no slug is written. The entry keeps `slug: null` rather than gaining `""`, which would collide with every other empty slug on a unique field.
- A policy that returns `false` produces **403**, not 400 — verified in `node_modules/@strapi/core/dist/services/errors.js`, which maps `ForbiddenError`/`PolicyError` to 403 and defaults every other `ApplicationError` to 400. To answer 400, the policy MUST throw `new errors.ValidationError(...)` from `@strapi/utils`.
- `limit` defaults to 3, maximum 10. Absent `limit` is valid.
- The related endpoint's responses must never contain `content` or `body`.
- An unknown slug returns **200 with an empty array**, never 404.
- Lifecycle event shape, verified from `node_modules/@strapi/database/dist/lifecycles/index.js`: `{ action, model, state, params }` — so `event.params.data` and `event.params.where`.
- Seeding stays idempotent: a second bootstrap changes nothing, and no slug shifts between restarts.
- Strapi runs on :1337 and is the user's server. Restart only with `./scripts/restart-dev.sh`, and leave it running.
- All six verification scripts must pass at the end: `verify-blog-api.sh`, `verify-content-model.sh`, `verify-media.sh`, `verify-stripe.sh`, `verify-isr.sh`, and the new `verify-custom-api.sh`.
- Run the verification scripts ONE AT A TIME. `verify-isr.sh` and `verify-stripe.sh` both need port 3000; running them concurrently produces a confusing false failure.

---

### Task 1: Vitest for the Strapi app, and the slug utility

**Files:**
- Modify: `package.json` (repo root — add the Vitest devDependency and a `test` script)
- Create: `src/utils/slug.ts`
- Test: `src/utils/slug.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces, from `src/utils/slug.ts`:
  - `slugify(input: string): string`
  - `uniqueSlug(strapi, uid: string, base: string, excludeId?: number): Promise<string>`
  - `fillSlug(strapi, event, uid: string, sourceField: 'title' | 'name'): Promise<void>`

This is the first test runner in the Strapi app. Earlier work treated the root `package.json` as immutable; this task changes it deliberately, because the alternative — a `frontend/` test importing `src/` — would breach the Strapi/frontend separation the project has kept throughout.

- [ ] **Step 1: Add Vitest to the Strapi app**

```bash
cd /home/asim/strapi-cms && npm install -D vitest
```

Then add to the root `package.json` `scripts` block, leaving every existing script untouched:

```json
    "test": "vitest run",
```

- [ ] **Step 2: Write the failing test**

`src/utils/slug.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and hyphenates words', () => {
    expect(slugify('Field Notes')).toBe('field-notes');
    expect(slugify('CSS Has Quietly Become A Good Language')).toBe(
      'css-has-quietly-become-a-good-language',
    );
  });

  it('collapses punctuation and runs of separators into one hyphen', () => {
    expect(slugify('Why Your Database Schema Is Your *Real* API')).toBe(
      'why-your-database-schema-is-your-real-api',
    );
    expect(slugify('a  --  b')).toBe('a-b');
  });

  it('strips diacritics rather than dropping the letters', () => {
    // Losing the letter entirely would turn "Café" into "caf", which reads as a typo.
    expect(slugify('Café Culture')).toBe('cafe-culture');
    expect(slugify('Šumava')).toBe('sumava');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  -- Hello --  ')).toBe('hello');
  });

  it('returns an empty string when nothing survives', () => {
    // The caller treats this as "no slug derivable" and writes nothing, rather
    // than writing "" — which would collide on a unique field.
    expect(slugify('')).toBe('');
    expect(slugify('!!! ---')).toBe('');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd /home/asim/strapi-cms && npm test`
Expected: FAIL — cannot resolve `./slug`.

- [ ] **Step 4: Write the implementation**

`src/utils/slug.ts`:

```ts
import type { Core } from '@strapi/strapi';

/** How many suffixed candidates to try before giving up rather than looping. */
const MAX_SLUG_ATTEMPTS = 50;

/**
 * Turns a title into a URL slug.
 *
 * Diacritics are decomposed and stripped rather than removed with their letter,
 * so "Café" becomes "cafe" and not "caf".
 */
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Returns `base` when it is free, otherwise `base-2`, `base-3`, and so on.
 *
 * `slug` is a unique field, so without this two entries sharing a title would
 * fail on a database constraint and surface as a 500 explaining nothing.
 *
 * `excludeId` is the row being updated: without excluding it, re-saving an
 * entry would see its own slug as a collision and bump the suffix every time.
 */
export async function uniqueSlug(
  strapi: Core.Strapi,
  uid: string,
  base: string,
  excludeId?: number,
): Promise<string> {
  if (!base) {
    return '';
  }

  for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = attempt === 1 ? base : `${base}-${attempt}`;
    const where: Record<string, unknown> = { slug: candidate };

    if (excludeId !== undefined) {
      where.id = { $ne: excludeId };
    }

    const clash = await strapi.db.query(uid).findOne({ where, select: ['id'] });

    if (!clash) {
      return candidate;
    }
  }

  throw new Error(`Could not derive a unique slug for '${base}' after ${MAX_SLUG_ATTEMPTS} attempts`);
}

interface SlugEvent {
  params: {
    data?: Record<string, unknown>;
    where?: { id?: number };
  };
}

/**
 * Fills `data.slug` from `data[sourceField]` when the slug is absent.
 *
 * Shared by the Article and Category lifecycles. Leaving a present slug alone
 * is what makes this safe under draft-and-publish: publishing copies the
 * draft's data, slug included, so this returns early on the published write
 * instead of deriving a second, suffixed slug.
 */
export async function fillSlug(
  strapi: Core.Strapi,
  event: SlugEvent,
  uid: string,
  sourceField: 'title' | 'name',
): Promise<void> {
  const data = event.params.data;

  if (!data) {
    return;
  }

  if (typeof data.slug === 'string' && data.slug.length > 0) {
    return;
  }

  const source = data[sourceField];

  if (typeof source !== 'string' || source.length === 0) {
    return;
  }

  const base = slugify(source);

  if (!base) {
    return;
  }

  data.slug = await uniqueSlug(strapi, uid, base, event.params.where?.id);
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd /home/asim/strapi-cms && npm test`
Expected: PASS, 5 tests.

- [ ] **Step 6: Confirm Strapi still builds and boots**

```bash
npx tsc --noEmit
./scripts/restart-dev.sh
curl -s -o /dev/null -w 'strapi: %{http_code}\n' http://localhost:1337/api/articles
```

Expected: no type errors, `BOOTED`, and `200`. The root `tsconfig.json` excludes test files from the server build, so `slug.test.ts` must not appear in any build output — confirm by checking that `npx tsc --noEmit` passes and reporting whether the exclude covers `**/*.test.ts`.

- [ ] **Step 7: Commit**

```bash
cd /home/asim/strapi-cms
git add package.json package-lock.json src/utils
git commit -m "feat(cms): add Vitest and a slug utility with de-duplication"
```

---

### Task 2: Auto-slug lifecycle hooks

**Files:**
- Create: `src/api/article/content-types/article/lifecycles.ts`
- Create: `src/api/category/content-types/category/lifecycles.ts`
- Modify: `src/seed/data.ts` (add one category with no slug; remove the workaround comment)
- Modify: `src/seed/enrich.ts` (create seeded categories that are missing)
- Modify: `scripts/verify-blog-api.sh` (the category count changes from 3 to 4)

**Interfaces:**
- Consumes: `fillSlug` from `src/utils/slug`.
- Produces: a category named `Field Notes` whose slug was derived by the hook, which Task 6's script asserts on.

**Read this first.** The spec proposed removing the slug from an existing seeded category. That cannot be verified on this database: `seedBlog` returns early whenever an article exists, so an existing category is never re-created and the hook never runs on it. Instead this task adds a NEW category with no slug and has the idempotent enrichment create it — which exercises the hook on both a fresh and an existing database. That deviation is deliberate; the reasoning belongs in your report.

- [ ] **Step 1: Write the Article lifecycle**

`src/api/article/content-types/article/lifecycles.ts`:

```ts
import { fillSlug } from '../../../../utils/slug';

/** The subset of the lifecycle event this hook reads. */
interface SlugLifecycleEvent {
  params: {
    data?: Record<string, unknown>;
    where?: { id?: number };
  };
}

// `uid` fields are only auto-filled by the admin UI, so anything created
// through the REST API or the Document Service arrives with slug: null — which
// silently breaks the frontend's slug-based routing. These hooks close that gap
// without ever overwriting a slug an editor chose.
export default {
  async beforeCreate(event: SlugLifecycleEvent) {
    await fillSlug(strapi, event, 'api::article.article', 'title');
  },
  async beforeUpdate(event: SlugLifecycleEvent) {
    await fillSlug(strapi, event, 'api::article.article', 'title');
  },
};
```

A local interface is used rather than a Strapi-exported event type because the
installed types do not export one for db lifecycles; it matches the shape
verified in `node_modules/@strapi/database/dist/lifecycles/index.js`. Do NOT
substitute `any`.

`strapi` is a global inside lifecycle files. If it does not typecheck, add a
`declare global` for it rather than changing the hook signature — Strapi fixes
that signature.

- [ ] **Step 2: Write the Category lifecycle**

`src/api/category/content-types/category/lifecycles.ts`, identical but for the uid and source field:

```ts
import { fillSlug } from '../../../../utils/slug';

/** The subset of the lifecycle event this hook reads. */
interface SlugLifecycleEvent {
  params: {
    data?: Record<string, unknown>;
    where?: { id?: number };
  };
}

// See the Article lifecycle for why this exists.
export default {
  async beforeCreate(event: SlugLifecycleEvent) {
    await fillSlug(strapi, event, 'api::category.category', 'name');
  },
  async beforeUpdate(event: SlugLifecycleEvent) {
    await fillSlug(strapi, event, 'api::category.category', 'name');
  },
};
```

The interface is repeated rather than shared: two four-line type declarations in
sibling lifecycle files read better than an import that couples them, and
`fillSlug` is already the shared part.

- [ ] **Step 3: Add the slugless category to the seed data**

In `src/seed/data.ts`, delete the comment that reads "Slugs are set explicitly: uid fields are auto-filled by the admin UI, not by the Document Service, so a seeded entry would otherwise have slug: null." — the lifecycle hooks make it false.

Then append one entry to `CATEGORIES`, deliberately without a `slug`:

```ts
  // No slug on purpose: the lifecycle hook derives 'field-notes'. This is what
  // proves the hook runs, on a fresh database and an existing one alike.
  { name: 'Field Notes', description: 'Short observations from the workbench.' },
```

Leave the other three categories' explicit slugs alone — three verification scripts reference them by name.

- [ ] **Step 4: Create missing categories from the enrichment**

`seedBlog` returns early when content exists, so the new category needs the idempotent pass. In `src/seed/enrich.ts`, add this exported function and call it from `enrichExistingArticles`'s caller — or from within `enrichExistingArticles` before the article loop, whichever fits the file better; say which you chose and why:

```ts
/**
 * Creates any seeded category that is not in the database yet.
 *
 * `seedBlog` only runs on an empty database, so a category added to the seed
 * later would otherwise never appear. Idempotent: it looks each one up by name
 * first. Categories added here deliberately omit `slug`, letting the lifecycle
 * hook derive it.
 */
export async function createMissingCategories(strapi: Core.Strapi): Promise<void> {
  for (const category of CATEGORIES) {
    const existing = await strapi.db
      .query('api::category.category')
      .findOne({ where: { name: category.name }, select: ['id'] });

    if (existing) {
      continue;
    }

    const created = await strapi.documents('api::category.category').create({
      data: category,
    });

    strapi.log.info(`[seed] created category '${category.name}' with slug '${created.slug}'`);
  }
}
```

Import `CATEGORIES` alongside the existing imports, export the function from `src/seed/index.ts`, and wire it into `src/index.ts`'s bootstrap after `seedBlog` and before `enrichExistingArticles`.

- [ ] **Step 5: Update the category count in the existing script**

`scripts/verify-blog-api.sh` asserts `check "category count" "$(count categories)" "3"`. There are now four. Change the expected value to `4`.

This is a real behaviour change, not a test being bent to fit: the seed genuinely has one more category, and the assertion should say so.

- [ ] **Step 6: Restart and verify the hook derived the slug**

```bash
./scripts/restart-dev.sh
grep -E "\[seed\]" /tmp/strapi.log | grep -i "field notes"
curl -sg "http://localhost:1337/api/categories?filters[slug][\$eq]=field-notes" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('matches:', len(d), d[0]['name'] if d else '')"
```

Expected: a log line reporting the created category with slug `field-notes`, and `matches: 1 Field Notes`. If the slug is null or empty, the hook did not fire — diagnose that rather than setting the slug by hand in the seed.

- [ ] **Step 7: Prove slugs are stable across restarts**

```bash
./scripts/restart-dev.sh
curl -sg "http://localhost:1337/api/categories" \
  | python3 -c "import json,sys; print(sorted(c['slug'] for c in json.load(sys.stdin)['data']))"
```

Expected: exactly `['engineering', 'field-notes', 'opinion', 'tutorials']`. A slug like `field-notes-2` means the exclusion in `uniqueSlug` is wrong, or the hook is re-deriving over an existing slug — fix it rather than accepting it.

- [ ] **Step 8: Confirm the existing suites still pass**

Run these one at a time:

```bash
./scripts/verify-blog-api.sh
./scripts/verify-content-model.sh
./scripts/verify-media.sh
```

Expected: all pass. The lifecycle hooks run on every write including the seed's, so a mistake here breaks bootstrap for everything — these three are the early warning.

- [ ] **Step 9: Commit**

```bash
git add src/api/article/content-types src/api/category/content-types src/seed src/index.ts scripts/verify-blog-api.sh
git commit -m "feat(cms): derive slugs in lifecycle hooks instead of by hand"
```

---

### Task 3: The limit policy

**Files:**
- Create: `src/policies/valid-limit.ts`
- Test: `src/policies/valid-limit.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `parseLimit(raw: unknown): number` (exported pure function, throws `RangeError` on invalid input) and the default-exported Strapi policy, resolvable as `global::valid-limit`. Task 4's route references that name.

- [ ] **Step 1: Write the failing test**

`src/policies/valid-limit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_LIMIT, MAX_LIMIT, parseLimit } from './valid-limit';

describe('parseLimit', () => {
  it('defaults when the parameter is absent', () => {
    expect(parseLimit(undefined)).toBe(DEFAULT_LIMIT);
    expect(parseLimit(null)).toBe(DEFAULT_LIMIT);
  });

  it('accepts integers within range', () => {
    expect(parseLimit('1')).toBe(1);
    expect(parseLimit('3')).toBe(3);
    expect(parseLimit(String(MAX_LIMIT))).toBe(MAX_LIMIT);
  });

  it('rejects values outside the range', () => {
    expect(() => parseLimit('0')).toThrow(RangeError);
    expect(() => parseLimit('-1')).toThrow(RangeError);
    expect(() => parseLimit(String(MAX_LIMIT + 1))).toThrow(RangeError);
  });

  it('rejects anything that is not an integer', () => {
    expect(() => parseLimit('abc')).toThrow(RangeError);
    expect(() => parseLimit('1.5')).toThrow(RangeError);
    expect(() => parseLimit('')).toThrow(RangeError);
    expect(() => parseLimit('3x')).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd /home/asim/strapi-cms && npm test`
Expected: FAIL — cannot resolve `./valid-limit`.

- [ ] **Step 3: Write the implementation**

`src/policies/valid-limit.ts`:

```ts
import { errors } from '@strapi/utils';

export const DEFAULT_LIMIT = 3;
export const MAX_LIMIT = 10;

/**
 * Parses the `limit` query parameter.
 *
 * Pure and exported so it can be unit-tested without a Strapi context. Throws
 * RangeError, which the policy translates into Strapi's ValidationError.
 */
export function parseLimit(raw: unknown): number {
  if (raw === undefined || raw === null) {
    return DEFAULT_LIMIT;
  }

  const text = String(raw);

  // Number('') is 0 and Number(' 3 ') is 3, so test the text rather than the
  // parsed value: only bare digits are acceptable.
  if (!/^\d+$/.test(text)) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  const value = Number(text);

  if (value < 1 || value > MAX_LIMIT) {
    throw new RangeError(`limit must be an integer between 1 and ${MAX_LIMIT}`);
  }

  return value;
}

/**
 * Rejects a malformed `limit` before the controller runs.
 *
 * Throws ValidationError rather than returning false: a policy returning false
 * throws PolicyError, which extends ForbiddenError and answers 403. Only
 * ValidationError (or another non-Forbidden ApplicationError) yields 400, which
 * is the correct status for a malformed parameter.
 */
export default (policyContext: { request: { query: Record<string, unknown> } }) => {
  try {
    parseLimit(policyContext.request.query.limit);
    return true;
  } catch (error) {
    throw new errors.ValidationError(
      error instanceof RangeError ? error.message : 'limit is invalid',
    );
  }
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd /home/asim/strapi-cms && npm test`
Expected: PASS, 9 tests total (5 for slugify plus 4 here).

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/policies
git commit -m "feat(cms): add a limit-validating policy that answers 400"
```

---

### Task 4: The related-articles endpoint

**Files:**
- Modify: `src/api/article/services/article.ts`
- Modify: `src/api/article/controllers/article.ts`
- Create: `src/api/article/routes/related.ts`
- Create: `src/middlewares/related-fields.ts`
- Modify: `src/seed/data.ts` (`PUBLIC_READ_ACTIONS`)

**Interfaces:**
- Consumes: `parseLimit`, `DEFAULT_LIMIT` from `src/policies/valid-limit`; the policy as `global::valid-limit`.
- Produces: `GET /api/articles/:slug/related?limit=n` returning `{ data: Article[] }`; the middleware resolvable as `global::related-fields`.

- [ ] **Step 1: Add the service method**

Replace `src/api/article/services/article.ts` with a factory that carries a custom method, keeping the same default export shape:

```ts
import { factories } from '@strapi/strapi';

const RELATED_FIELDS = ['title', 'slug', 'excerpt', 'publishedAt'] as const;

export default factories.createCoreService('api::article.article', ({ strapi }) => ({
  /**
   * Articles sharing at least one category with `slug`, newest first,
   * excluding the article itself.
   *
   * Returns an empty array for an unknown slug: to a reader, "no related
   * articles" and "no such article" are the same thing, and the page omits the
   * block either way.
   */
  async findRelated(slug: string, limit: number) {
    const article = await strapi.documents('api::article.article').findFirst({
      filters: { slug },
      populate: { categories: true },
      status: 'published',
    });

    const categoryIds = (article?.categories ?? []).map((category) => category.id);

    if (!article || categoryIds.length === 0) {
      return [];
    }

    return strapi.documents('api::article.article').findMany({
      filters: {
        slug: { $ne: slug },
        categories: { id: { $in: categoryIds } },
      },
      fields: [...RELATED_FIELDS],
      populate: { cover: true, author: true },
      sort: 'publishedAt:desc',
      limit,
      status: 'published',
    });
  },
}));
```

- [ ] **Step 2: Add the controller action**

Replace `src/api/article/controllers/article.ts`:

```ts
import { factories } from '@strapi/strapi';
import { parseLimit } from '../../../policies/valid-limit';

export default factories.createCoreController('api::article.article', ({ strapi }) => ({
  async related(ctx) {
    // parseLimit cannot throw here — the global::valid-limit policy already
    // rejected anything invalid with a 400. Calling it again is how the
    // controller gets the default when the parameter is absent.
    const limit = parseLimit(ctx.request.query.limit);
    const data = await strapi
      .service('api::article.article')
      .findRelated(ctx.params.slug, limit);

    return { data };
  },
}));
```

- [ ] **Step 3: Add the route**

`src/api/article/routes/related.ts`:

```ts
export default {
  routes: [
    {
      method: 'GET',
      path: '/articles/:slug/related',
      handler: 'article.related',
      config: {
        // A wrong registry name here fails at boot, which is the loud failure
        // we want rather than a silently unguarded endpoint.
        policies: ['global::valid-limit'],
        middlewares: ['global::related-fields'],
      },
    },
  ],
};
```

- [ ] **Step 4: Add the route middleware**

`src/middlewares/related-fields.ts`:

```ts
import type { Core } from '@strapi/strapi';

/**
 * Pins this endpoint's response shape.
 *
 * Whatever the caller asks for, the related list returns only the fields the
 * article cards render. Without this, `?populate=*` would turn a convenience
 * endpoint into a way to pull the whole content graph — including article
 * bodies — through a route that exists to list three headlines.
 */
const middleware: Core.MiddlewareFactory = () => async (ctx, next) => {
  ctx.query = {
    ...ctx.query,
    fields: ['title', 'slug', 'excerpt', 'publishedAt'],
    populate: { cover: true, author: true },
  };

  await next();
};

export default middleware;
```

If `Core.MiddlewareFactory` is not the correct exported type in this version, use whatever the installed types provide rather than `any`, and report what you used.

- [ ] **Step 5: Grant public access to the new action**

In `src/seed/data.ts`, add to `PUBLIC_READ_ACTIONS`:

```ts
  'api::article.article.related',
```

- [ ] **Step 6: Restart and verify the endpoint**

```bash
./scripts/restart-dev.sh
grep -iE "error|invalid" /tmp/strapi.log | head -5
curl -s -o /dev/null -w 'related:     %{http_code}\n' "http://localhost:1337/api/articles/why-your-database-schema-is-your-real-api/related"
curl -s "http://localhost:1337/api/articles/why-your-database-schema-is-your-real-api/related" \
  | python3 -c "import json,sys; d=json.load(sys.stdin)['data']; print('count:', len(d)); print('keys:', sorted(d[0].keys()) if d else [])"
```

Expected: no boot errors, `related: 200`, at least one entry, and the keys list containing `title`, `slug`, `excerpt` but NEITHER `content` NOR `body`. If the endpoint 404s, the route or the permission did not register; if it 403s, the permission grant did not run.

- [ ] **Step 7: Verify the policy's status code specifically**

```bash
for v in 0 11 abc 1.5; do
  printf 'limit=%-5s %s\n' "$v" "$(curl -s -o /dev/null -w '%{http_code}' \
    "http://localhost:1337/api/articles/why-your-database-schema-is-your-real-api/related?limit=$v")"
done
printf 'limit=2    %s\n' "$(curl -s "http://localhost:1337/api/articles/why-your-database-schema-is-your-real-api/related?limit=2" \
  | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))")"
```

Expected: `400` for all four invalid values — **not 403**. A 403 means the policy returned `false` instead of throwing `ValidationError`; fix the policy. And `limit=2` returns at most 2.

- [ ] **Step 8: Verify the unknown-slug contract**

```bash
curl -s -o /dev/null -w 'unknown slug: %{http_code}\n' "http://localhost:1337/api/articles/no-such-article/related"
curl -s "http://localhost:1337/api/articles/no-such-article/related" | head -c 40; echo
```

Expected: `200` and a body whose `data` is an empty array.

- [ ] **Step 9: Commit**

```bash
git add src/api/article src/middlewares src/seed/data.ts
git commit -m "feat(cms): add a related-articles endpoint with a policy and route middleware"
```

---

### Task 5: Related articles on the article page

**Files:**
- Modify: `frontend/lib/strapi.ts`
- Modify: `frontend/app/articles/[slug]/page.tsx`
- Test: `frontend/lib/strapi.test.ts`

**Interfaces:**
- Consumes: the endpoint from Task 4; `ArticleCard` from `@/components/ArticleCard`.
- Produces: `getRelatedArticles(slug: string): Promise<Article[]>` from `@/lib/strapi`.

- [ ] **Step 1: Write the failing test**

Add to `frontend/lib/strapi.test.ts`, importing `getRelatedArticles` alongside the existing imports:

```ts
describe('getRelatedArticles', () => {
  it('calls the related endpoint and tags it for both invalidation paths', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => json([{ slug: 'other' }]));
    vi.stubGlobal('fetch', fetchMock);

    const related = await getRelatedArticles('a-post');

    expect(related[0]?.slug).toBe('other');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/articles/a-post/related');
    // Tagged with both: editing this article changes the list's context, and
    // editing any article can change its membership.
    expect((init as { next: { tags: string[] } }).next.tags).toEqual([
      'articles',
      'article:a-post',
    ]);
  });

  it('url-encodes the slug', async () => {
    const fetchMock = vi.fn((_url: string, _init: RequestInit) => json([]));
    vi.stubGlobal('fetch', fetchMock);

    await getRelatedArticles('a b');

    expect(fetchMock.mock.calls[0][0]).toContain('/api/articles/a%20b/related');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm test -- strapi.test.ts`
Expected: FAIL — `getRelatedArticles` is not exported.

- [ ] **Step 3: Write the query**

Append to `frontend/lib/strapi.ts`:

```ts
/**
 * Articles sharing a category with this one. The endpoint pins its own field
 * selection, so no populate parameters are needed — or honoured — here.
 */
export function getRelatedArticles(slug: string): Promise<Article[]> {
  return strapiFetch<Article[]>(
    `/api/articles/${encodeURIComponent(slug)}/related`,
    { tags: [ARTICLES_TAG, articleTag(slug)] },
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS — the existing 63 tests plus 2 new ones (65).

- [ ] **Step 5: Render the block**

In `frontend/app/articles/[slug]/page.tsx`, fetch the related list alongside the article. Keep `export const revalidate = 60` and `generateStaticParams` exactly as they are:

```tsx
  const [article, related] = await Promise.all([
    getArticleBySlug(slug),
    getRelatedArticles(slug),
  ]);
```

`getArticleBySlug` is called before `notFound()`, so keep that check immediately after. Then, after the body and before the closing element, add:

```tsx
      {related.length > 0 && (
        <section className="mt-16 border-t border-rule pt-8">
          <h2 className="font-display text-xs uppercase tracking-widest text-accent">
            More in this section
          </h2>
          <div className="mt-6 grid gap-8 md:grid-cols-2">
            {related.slice(0, 3).map((item) => (
              <ArticleCard key={item.slug} article={item} />
            ))}
          </div>
        </section>
      )}
```

Import `ArticleCard` from `@/components/ArticleCard` and `getRelatedArticles` from `@/lib/strapi`. The whole block including the heading is omitted when the list is empty — never a heading over nothing.

- [ ] **Step 6: Verify in the browser**

With Strapi running and port 3000 free, start the dev server and check both an article with related pieces and one without:

```bash
curl -s http://localhost:3000/articles/why-your-database-schema-is-your-real-api | grep -c 'More in this section'
curl -s -o /dev/null -w 'article page: %{http_code}\n' http://localhost:3000/articles/why-your-database-schema-is-your-real-api
```

Expected: `1` and `200`. Also load the page in a browser and confirm the block sits below the body under a hairline rule. Stop the dev server by PID when done.

- [ ] **Step 7: Typecheck, test, and commit**

```bash
cd frontend && npx tsc --noEmit && npm test
cd /home/asim/strapi-cms
git add frontend/lib frontend/app
git commit -m "feat(frontend): show related articles on the article page"
```

---

### Task 6: Verification script and documentation

**Files:**
- Create: `scripts/verify-custom-api.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: an executable script matching the existing verification scripts' PASS/FAIL shape.

Read `scripts/verify-media.sh` first and reuse its `check` helper, table, and exit convention. Bracketed query parameters need `curl -g`.

- [ ] **Step 1: Write the script**

`scripts/verify-custom-api.sh`:

```bash
#!/usr/bin/env bash
# Verifies the custom API surface: the auto-slug lifecycle hooks, the
# related-articles endpoint, its validating policy, and its field-constraining
# route middleware.
# Requires the dev server to be running: ./scripts/restart-dev.sh
set -u

BASE="http://localhost:1337"
SLUG="why-your-database-schema-is-your-real-api"
fail=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-48s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-48s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" != "000" ]; then
    break
  fi
  sleep 1
done

echo "Custom API verification"

# The lifecycle hook: 'Field Notes' is seeded with no slug on purpose.
check "lifecycle hook derived the field-notes slug" \
  "$(curl -sg "$BASE/api/categories?filters[slug][\$eq]=field-notes" \
     | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)" "1"
check "no slug is empty or null" \
  "$(curl -s "$BASE/api/categories" \
     | python3 -c "import json,sys; print(sum(1 for c in json.load(sys.stdin)['data'] if not c.get('slug')))" 2>/dev/null)" "0"

related=$(curl -s "$BASE/api/articles/$SLUG/related")

check "GET related returns 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles/$SLUG/related")" "200"
check "related returns at least one article" \
  "$(echo "$related" | python3 -c "import json,sys; print('yes' if len(json.load(sys.stdin)['data']) >= 1 else 'no')" 2>/dev/null)" "yes"
check "related never includes the article itself" \
  "$(echo "$related" | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
print('yes' if all(a['slug'] != '$SLUG' for a in d) else 'no')" 2>/dev/null)" "yes"

# The route middleware pins the field selection.
check "middleware withholds content and body" \
  "$(echo "$related" | python3 -c "
import json,sys
d = json.load(sys.stdin)['data']
leaked = [k for a in d for k in ('content', 'body') if k in a]
print('clean' if not leaked else ','.join(sorted(set(leaked))))" 2>/dev/null)" "clean"

# The policy answers 400, not 403 — a 403 means it returned false instead of
# throwing ValidationError.
for value in 0 11 abc 1.5; do
  check "limit=$value is rejected with 400" \
    "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles/$SLUG/related?limit=$value")" "400"
done

check "limit=1 returns at most one article" \
  "$(curl -s "$BASE/api/articles/$SLUG/related?limit=1" \
     | python3 -c "import json,sys; print('yes' if len(json.load(sys.stdin)['data']) <= 1 else 'no')" 2>/dev/null)" "yes"

check "an unknown slug returns 200" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles/no-such-article/related")" "200"
check "an unknown slug returns an empty list" \
  "$(curl -s "$BASE/api/articles/no-such-article/related" \
     | python3 -c "import json,sys; print(len(json.load(sys.stdin)['data']))" 2>/dev/null)" "0"

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
```

- [ ] **Step 2: Make it executable and run it**

```bash
cd /home/asim/strapi-cms
chmod +x scripts/verify-custom-api.sh
./scripts/verify-custom-api.sh
```

Expected: every check PASS, exit 0. Note that each `python3` call ends with `2>/dev/null`, so a parser crash yields an empty string rather than a traceback — and an empty string matches no expected value, so it FAILs rather than passing vacuously. Confirm that behaviour rather than assuming it: run one of the checks against a deliberately bad URL and report what it prints.

- [ ] **Step 3: Document it**

Add `./scripts/verify-custom-api.sh` to the README's verification list, and add this section after the Media section:

```markdown
### Custom API surface

Slugs are derived by lifecycle hooks on Article and Category rather than being
written by hand: anything created outside the admin UI — the REST API, the
Document Service, the seed — gets a slug from its title or name, de-duplicated
with a `-2` suffix on collision. An existing slug is never overwritten. The
seeded "Field Notes" category deliberately carries no slug, so every boot proves
the hook still works.

`GET /api/articles/:slug/related?limit=n` lists articles sharing a category,
newest first, excluding the article itself. A `global::valid-limit` policy
rejects a malformed `limit` with 400 before the controller runs, and a
`global::related-fields` route middleware pins the response to the fields the
cards render — so the endpoint cannot be used to pull article bodies. An unknown
slug returns 200 and an empty list.
```

- [ ] **Step 4: Run the full suite**

One at a time — `verify-isr.sh` and `verify-stripe.sh` both need port 3000:

```bash
cd /home/asim/strapi-cms && npm test
cd frontend && npm test && npx tsc --noEmit
cd /home/asim/strapi-cms && npx tsc --noEmit
./scripts/verify-blog-api.sh
./scripts/verify-content-model.sh
./scripts/verify-media.sh
./scripts/verify-custom-api.sh
STRIPE_SECRET_KEY=$(grep -m1 '^STRIPE_SECRET_KEY=' frontend/.env.local | cut -d= -f2-) ./scripts/verify-stripe.sh
./scripts/verify-isr.sh
```

Expected: all green. `verify-isr.sh` matters most — the article page gained a fetch, and that is what could disturb static rendering.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-custom-api.sh README.md
git commit -m "test: verify the custom API surface and document it"
```

---

## Self-Review Notes

Spec coverage checked section by section: the slug utility and its tests (Task 1), lifecycle hooks with de-duplication (Task 2), the policy including its 400-not-403 requirement (Task 3), the endpoint's route, controller, service, middleware and permission (Task 4), frontend rendering (Task 5), the verification script and documentation (Task 6).

**Two deliberate deviations from the spec, both recorded here because they change what gets verified:**

The spec proposed removing the slug from an existing seeded category to prove the hook. That cannot work on this database — `seedBlog` returns early whenever an article exists, so an existing category is never re-created and the hook never runs. Task 2 instead adds a NEW category, `Field Notes`, with no slug, created by an idempotent enrichment pass, which exercises the hook on a fresh and an existing database alike.

That fourth category changes the category count, so Task 2 also updates `verify-blog-api.sh`'s assertion from 3 to 4. That is the seed genuinely having one more category, not a test bent to fit — but it is an existing script changing, which a reviewer should see stated plainly rather than discover.
