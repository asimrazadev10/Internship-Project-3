# Content Modelling Depth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Strapi components, an article body dynamic zone, a site-settings single type, and article-level SEO/featured/kicker fields, each rendered on the frontend so none of them is decorative.

**Architecture:** Six components under `src/components/{blocks,shared}`; Article gains an additive `body` dynamic zone alongside its existing `content`, so no migration is needed and both render paths stay live. A new `site-setting` single type supplies the masthead and footer copy currently hardcoded in the frontend. The frontend gains a `Blocks` renderer that switches on `__component`, and explicit `populate` because the wildcard does not reach inside dynamic-zone components.

**Tech Stack:** Strapi 5.52.0 (TypeScript, SQLite), Next.js 16 App Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-content-modelling-depth-design.md`

## Global Constraints

- `content` (richtext) on Article is NOT removed, renamed, or migrated. The dynamic zone is additive.
- Every article without `body` must keep rendering through the existing `Prose` component, unchanged.
- Palette is fixed and already defined as Tailwind theme tokens: paper `#F6F4EF`, ink `#363737`, headline `#161613`, accent `#F2312C`, rule `#DDD9D0`. Never re-declare a hex value in a component.
- No shadows, no rounded corners, no card fills, no images. Hairline borders are the only separator.
- Cache tags are only ever constructed in `frontend/lib/tags.ts`.
- Every route keeps `export const revalidate = 60` as a literal.
- Seeding is idempotent everywhere: look before writing, never overwrite an editor's content, and running bootstrap twice must change nothing.
- Enum values exactly: tone `note` / `warning` / `aside`; language `ts` / `js` / `bash` / `json` / `css`; kicker `analysis` / `opinion` / `tutorial` / `dispatch`.
- Field limits exactly: `quote` maxLength 300, `metaTitle` maxLength 60, `metaDescription` maxLength 160.
- Strapi runs on :1337 and is the user's server. Restart it with `./scripts/restart-dev.sh`; never leave it down.
- All four verification scripts must pass at the end: `verify-blog-api.sh`, `verify-isr.sh`, `verify-stripe.sh`, and the new `verify-content-model.sh`.

---

### Task 1: Components, schema changes, and the single type

**Files:**
- Create: `src/components/blocks/rich-text.json`, `pull-quote.json`, `callout.json`, `code.json`
- Create: `src/components/shared/seo.json`, `nav-link.json`
- Create: `src/api/site-setting/content-types/site-setting/schema.json`
- Create: `src/api/site-setting/controllers/site-setting.ts`, `routes/site-setting.ts`, `services/site-setting.ts`
- Modify: `src/api/article/content-types/article/schema.json`
- Modify: `src/seed/data.ts` (the `PUBLIC_READ_ACTIONS` array only)

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: component UIDs `blocks.rich-text`, `blocks.pull-quote`, `blocks.callout`, `blocks.code`, `shared.seo`, `shared.nav-link`; content type `api::site-setting.site-setting` reachable at `GET /api/site-setting`; Article attributes `body`, `seo`, `featured`, `kicker`.

- [ ] **Step 1: Create the four block components**

`src/components/blocks/rich-text.json`:

```json
{
  "collectionName": "components_blocks_rich_texts",
  "info": { "displayName": "Rich text", "icon": "align-left" },
  "options": {},
  "attributes": {
    "body": { "type": "richtext", "required": true }
  }
}
```

`src/components/blocks/pull-quote.json`:

```json
{
  "collectionName": "components_blocks_pull_quotes",
  "info": { "displayName": "Pull quote", "icon": "quote" },
  "options": {},
  "attributes": {
    "quote": { "type": "text", "required": true, "maxLength": 300 },
    "attribution": { "type": "string" }
  }
}
```

`src/components/blocks/callout.json`:

```json
{
  "collectionName": "components_blocks_callouts",
  "info": { "displayName": "Callout", "icon": "information" },
  "options": {},
  "attributes": {
    "text": { "type": "text", "required": true },
    "tone": {
      "type": "enumeration",
      "enum": ["note", "warning", "aside"],
      "default": "note"
    }
  }
}
```

`src/components/blocks/code.json`:

```json
{
  "collectionName": "components_blocks_codes",
  "info": { "displayName": "Code", "icon": "code" },
  "options": {},
  "attributes": {
    "code": { "type": "text", "required": true },
    "language": {
      "type": "enumeration",
      "enum": ["ts", "js", "bash", "json", "css"],
      "default": "ts"
    },
    "showLineNumbers": { "type": "boolean", "default": false }
  }
}
```

- [ ] **Step 2: Create the two shared components**

`src/components/shared/seo.json`:

```json
{
  "collectionName": "components_shared_seos",
  "info": { "displayName": "Seo", "icon": "search" },
  "options": {},
  "attributes": {
    "metaTitle": { "type": "string", "maxLength": 60 },
    "metaDescription": { "type": "text", "maxLength": 160 },
    "canonicalUrl": { "type": "string" }
  }
}
```

`src/components/shared/nav-link.json`:

```json
{
  "collectionName": "components_shared_nav_links",
  "info": { "displayName": "Nav link", "icon": "link" },
  "options": {},
  "attributes": {
    "label": { "type": "string", "required": true },
    "href": { "type": "string", "required": true }
  }
}
```

- [ ] **Step 3: Extend the Article schema**

In `src/api/article/content-types/article/schema.json`, add these four attributes to the `attributes` object. Do NOT touch `title`, `slug`, `excerpt`, `content`, `cover`, `author`, or `categories`:

```json
    "body": {
      "type": "dynamiczone",
      "components": [
        "blocks.rich-text",
        "blocks.pull-quote",
        "blocks.callout",
        "blocks.code"
      ]
    },
    "seo": {
      "type": "component",
      "repeatable": false,
      "component": "shared.seo"
    },
    "featured": {
      "type": "boolean",
      "default": false
    },
    "kicker": {
      "type": "enumeration",
      "enum": ["analysis", "opinion", "tutorial", "dispatch"]
    }
```

- [ ] **Step 4: Create the Site Settings single type**

`src/api/site-setting/content-types/site-setting/schema.json`:

```json
{
  "kind": "singleType",
  "collectionName": "site_settings",
  "info": {
    "singularName": "site-setting",
    "pluralName": "site-settings",
    "displayName": "Site Settings",
    "description": "Masthead and footer copy for the public site"
  },
  "options": {
    "draftAndPublish": false
  },
  "pluginOptions": {},
  "attributes": {
    "tagline": { "type": "string" },
    "subscribeLabel": { "type": "string", "default": "Subscribe" },
    "footerText": { "type": "string" },
    "navLinks": {
      "type": "component",
      "repeatable": true,
      "component": "shared.nav-link"
    }
  }
}
```

The three factory files mirror the existing ones exactly.

`src/api/site-setting/controllers/site-setting.ts`:

```ts
import { factories } from '@strapi/strapi';

export default factories.createCoreController('api::site-setting.site-setting');
```

`src/api/site-setting/routes/site-setting.ts`:

```ts
import { factories } from '@strapi/strapi';

export default factories.createCoreRouter('api::site-setting.site-setting');
```

`src/api/site-setting/services/site-setting.ts`:

```ts
import { factories } from '@strapi/strapi';

export default factories.createCoreService('api::site-setting.site-setting');
```

- [ ] **Step 5: Grant public read on the single type**

In `src/seed/data.ts`, add one entry to `PUBLIC_READ_ACTIONS`. A single type has no `findOne`, so this is the only action:

```ts
  'api::site-setting.site-setting.find',
```

`grantPublicReadAccess` already iterates that array and skips existing permissions, so it needs no change.

- [ ] **Step 6: Restart Strapi and verify the model**

```bash
./scripts/restart-dev.sh
grep -iE "error|warn" /tmp/strapi.log | head
curl -s -o /dev/null -w 'site-setting: %{http_code}\n' http://localhost:1337/api/site-setting
curl -s "http://localhost:1337/api/articles?populate=*" | grep -o '"featured"\|"kicker"\|"seo"' | sort -u
```

Expected: `site-setting: 200` (its `data` is `null` until Task 2 seeds it — that is correct, not a failure), and the three attribute names present in the article response. The `grep` for errors should show no schema errors.

If `site-setting` returns 403, the permission grant did not run — check the log for `[seed] Granted public access: api::site-setting.site-setting.find`.

- [ ] **Step 7: Confirm the existing suite still passes**

Run: `./scripts/verify-blog-api.sh`
Expected: all checks PASS, exit 0.

- [ ] **Step 8: Commit**

```bash
cd /home/asim/strapi-cms
git add src/components src/api/site-setting src/api/article/content-types/article/schema.json src/seed/data.ts
git commit -m "feat(cms): add block components, article body dynamic zone, and site settings"
```

---

### Task 2: Seed data and idempotent enrichment

**Files:**
- Modify: `src/seed/data.ts` (add `DEMO_BODY`, `SITE_SETTINGS`, and article enrichment data)
- Create: `src/seed/site-settings.ts`
- Create: `src/seed/enrich.ts`
- Modify: `src/seed/index.ts` (re-exports)
- Modify: `src/index.ts` (bootstrap wiring)

**Interfaces:**
- Consumes: the component UIDs and `api::site-setting.site-setting` from Task 1.
- Produces: `seedSiteSettings(strapi: Core.Strapi): Promise<void>` and `enrichExistingArticles(strapi: Core.Strapi): Promise<void>`, both exported from `./seed`; a database where at least one article has a four-block `body`, one has `featured: true`, and site settings exist.

Read `src/seed/index.ts` first: it exports `seedBlog` and `grantPublicReadAccess` and re-exports `registerIsrWebhook` from `./webhook`. Match its logging style — `strapi.log.info` with a bracketed prefix.

- [ ] **Step 1: Add the seed data**

Append to `src/seed/data.ts`:

```ts
// The article that demonstrates every block type, keyed by slug so the
// enrichment pass can find it in an existing database.
export const DEMO_BODY_SLUG = 'practical-guide-to-content-modeling';

export const DEMO_BODY = [
  {
    __component: 'blocks.rich-text',
    body: '## Model the page, not the taxonomy\n\nA dynamic zone earns its place when different sections of a page need different shapes. Prose, a pulled quote, an aside, and a code sample are four different shapes.',
  },
  {
    __component: 'blocks.pull-quote',
    quote: 'If every type is an island of flat fields, you have built a spreadsheet with extra steps.',
    attribution: 'The Strapi Press',
  },
  {
    __component: 'blocks.callout',
    text: 'Components are reusable across content types. Dynamic zones are ordered lists of them, chosen per entry by the editor.',
    tone: 'note',
  },
  {
    __component: 'blocks.code',
    code: 'await strapi.documents("api::article.article").findMany({\n  populate: { body: { populate: "*" } },\n});',
    language: 'ts',
    showLineNumbers: true,
  },
];

// Applied only where the field is currently empty.
export const ARTICLE_ENRICHMENT: Record<
  string,
  { kicker?: string; featured?: boolean; seo?: { metaTitle: string; metaDescription: string } }
> = {
  'practical-guide-to-content-modeling': {
    kicker: 'tutorial',
    featured: true,
    seo: {
      metaTitle: 'A Practical Guide to Content Modeling',
      metaDescription:
        'Collection types, components, and dynamic zones: the decisions that make a CMS API pleasant to consume.',
    },
  },
  'why-your-database-schema-is-your-real-api': {
    kicker: 'opinion',
    seo: {
      metaTitle: 'Your Database Schema Is Your Real API',
      metaDescription:
        'Every shortcut in the schema becomes a permanent feature of the interface your clients depend on.',
    },
  },
  'css-has-quietly-become-a-good-language': { kicker: 'analysis' },
};

export const SITE_SETTINGS = {
  tagline: 'Honest. Independent. Statically regenerated.',
  subscribeLabel: 'Subscribe',
  footerText: 'The Strapi Press',
  navLinks: [
    { label: 'Home', href: '/' },
    { label: 'Engineering', href: '/categories/engineering' },
  ],
};
```

- [ ] **Step 2: Write the site settings seeder**

`src/seed/site-settings.ts`:

```ts
import type { Core } from '@strapi/strapi';
import { SITE_SETTINGS } from './data';

/**
 * Creates the Site Settings single type if it has no entry yet.
 *
 * Idempotent: a single type has at most one entry, so an existing one is left
 * alone rather than overwritten — an editor's copy changes must survive a
 * restart.
 */
export async function seedSiteSettings(strapi: Core.Strapi): Promise<void> {
  const existing = await strapi.documents('api::site-setting.site-setting').findFirst({});

  if (existing) {
    strapi.log.info('[seed] Site settings already present, leaving them alone.');
    return;
  }

  await strapi.documents('api::site-setting.site-setting').create({
    data: SITE_SETTINGS,
  });

  strapi.log.info('[seed] Created site settings.');
}
```

- [ ] **Step 3: Write the enrichment pass**

`src/seed/enrich.ts`:

```ts
import type { Core } from '@strapi/strapi';
import { ARTICLE_ENRICHMENT, DEMO_BODY, DEMO_BODY_SLUG } from './data';

/**
 * Fills the fields added by the content-modelling work on articles that predate
 * them.
 *
 * `seedBlog` returns early whenever any article exists, so on a database that
 * already has content none of the new modelling would ever appear — including
 * on the machine doing the development. This pass closes that gap.
 *
 * It only ever writes into a field that is currently empty, so it never
 * overwrites an editor's work and running it twice changes nothing.
 */
export async function enrichExistingArticles(strapi: Core.Strapi): Promise<void> {
  const articles = await strapi.documents('api::article.article').findMany({
    populate: { body: true },
    status: 'published',
  });

  if (articles.length === 0) {
    return;
  }

  const someArticleIsFeatured = articles.some((article) => article.featured === true);

  for (const article of articles) {
    const enrichment = ARTICLE_ENRICHMENT[article.slug];
    const data: Record<string, unknown> = {};

    // The demo article gets the four-block body, but only if an editor has not
    // already written one.
    if (article.slug === DEMO_BODY_SLUG && (article.body ?? []).length === 0) {
      data.body = DEMO_BODY;
    }

    if (enrichment?.kicker && !article.kicker) {
      data.kicker = enrichment.kicker;
    }

    if (enrichment?.seo && !article.seo) {
      data.seo = enrichment.seo;
    }

    // Only promote a featured article when nothing is featured yet, so an
    // editor's choice of hero survives a restart.
    if (enrichment?.featured && !someArticleIsFeatured) {
      data.featured = true;
    }

    if (Object.keys(data).length === 0) {
      continue;
    }

    // Articles have draft-and-publish on, so an update writes the draft. The
    // public API serves published entries, so the change has to be published
    // too or the enrichment is invisible to the frontend and to the
    // verification script.
    await strapi.documents('api::article.article').update({
      documentId: article.documentId,
      data,
    });

    await strapi.documents('api::article.article').publish({
      documentId: article.documentId,
    });

    strapi.log.info(`[seed] Enriched '${article.slug}': ${Object.keys(data).join(', ')}`);
  }
}
```

- [ ] **Step 4: Export and wire into bootstrap**

Add to `src/seed/index.ts`, matching its existing re-export style:

```ts
export { seedSiteSettings } from './site-settings';
export { enrichExistingArticles } from './enrich';
```

In `src/index.ts`, extend the import and the bootstrap body. Order matters: enrichment runs after `seedBlog` so a fresh database is populated before it looks:

```ts
import {
  enrichExistingArticles,
  grantPublicReadAccess,
  registerIsrWebhook,
  seedBlog,
  seedSiteSettings,
} from './seed';
```

```ts
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seedBlog(strapi);
    await enrichExistingArticles(strapi);
    await seedSiteSettings(strapi);
    await grantPublicReadAccess(strapi);
    await registerIsrWebhook(strapi);
  },
```

- [ ] **Step 5: Verify it runs, and that it is idempotent**

```bash
./scripts/restart-dev.sh
grep -E "\[seed\]" /tmp/strapi.log
```

Expected on this database: `Enriched 'practical-guide-to-content-modeling': body, kicker, seo, featured` (field order may vary), enrichment lines for the other two slugs, and `Created site settings.`

Now restart again — this is the idempotency check that matters:

```bash
./scripts/restart-dev.sh
grep -E "\[seed\]" /tmp/strapi.log
```

Expected: **no `Enriched` lines at all**, and `Site settings already present, leaving them alone.` If a second run still enriches, a guard is wrong — fix it rather than accepting it.

- [ ] **Step 6: Verify the API shape**

```bash
curl -s "http://localhost:1337/api/articles?populate[body][populate]=*" \
  | grep -o '"__component":"[^"]*"' | sort -u
curl -s http://localhost:1337/api/site-setting | grep -o '"tagline":"[^"]*"'
```

Expected: all four component names (`blocks.rich-text`, `blocks.pull-quote`, `blocks.callout`, `blocks.code`), and the tagline. If the `__component` grep is empty, the populate syntax is wrong — note that `populate=*` alone does NOT reach inside dynamic-zone components.

- [ ] **Step 7: Commit**

```bash
git add src/seed src/index.ts
git commit -m "feat(cms): seed block content, site settings, and enrich existing articles"
```

---

### Task 3: Frontend types and data layer

**Files:**
- Modify: `frontend/lib/tags.ts`
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/strapi.ts`
- Test: `frontend/lib/strapi.test.ts` (extend), `frontend/lib/tags.test.ts` (extend)

**Interfaces:**
- Consumes: the API shape from Tasks 1-2.
- Produces, from `@/lib/tags`: `SITE_SETTINGS_TAG = 'site-settings'`. From `@/lib/types`: `Block` (discriminated union), `Seo`, `NavLink`, `SiteSettings`, and `Article` gaining `body?: Block[]`, `seo?: Seo | null`, `featured?: boolean`, `kicker?: string | null`. From `@/lib/strapi`: `getSiteSettings(): Promise<SiteSettings | null>`.

- [ ] **Step 1: Add the cache tag and its test**

Append to `frontend/lib/tags.ts`:

```ts
export const SITE_SETTINGS_TAG = 'site-settings';
```

Add to `frontend/lib/tags.test.ts`, inside the existing `describe('cache tags', ...)`:

```ts
  it('names the site settings tag', () => {
    expect(SITE_SETTINGS_TAG).toBe('site-settings');
  });
```

Update that file's import to include `SITE_SETTINGS_TAG`.

- [ ] **Step 2: Add the types**

Append to `frontend/lib/types.ts`:

```ts
/** Strapi tags each dynamic-zone entry with its component UID. */
export type Block =
  | { __component: 'blocks.rich-text'; id: number; body: string }
  | {
      __component: 'blocks.pull-quote';
      id: number;
      quote: string;
      attribution: string | null;
    }
  | {
      __component: 'blocks.callout';
      id: number;
      text: string;
      tone: 'note' | 'warning' | 'aside';
    }
  | {
      __component: 'blocks.code';
      id: number;
      code: string;
      language: string;
      showLineNumbers: boolean;
    };

export interface Seo {
  id: number;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
}

export interface NavLink {
  id: number;
  label: string;
  href: string;
}

export interface SiteSettings {
  id: number;
  documentId: string;
  tagline: string | null;
  subscribeLabel: string | null;
  footerText: string | null;
  navLinks?: NavLink[];
}
```

And add these four optional fields to the existing `Article` interface:

```ts
  body?: Block[];
  seo?: Seo | null;
  featured?: boolean;
  kicker?: string | null;
```

- [ ] **Step 3: Write the failing tests**

Add to `frontend/lib/strapi.test.ts`. Import `getSiteSettings` and `SITE_SETTINGS_TAG` alongside the existing imports:

```ts
describe('populate', () => {
  it('populates dynamic-zone components explicitly, not with a wildcard', async () => {
    const fetchMock = vi.fn(() => json([]));
    vi.stubGlobal('fetch', fetchMock);

    await getArticles();

    const url = fetchMock.mock.calls[0][0] as string;
    // populate=* does not reach fields inside dynamic-zone components, so the
    // nested form is required. A wildcard here returns 200 with empty blocks.
    expect(url).toContain('populate[body][populate]=*');
    expect(url).toContain('populate[seo]=*');
  });
});

describe('getSiteSettings', () => {
  it('returns the single type and tags it', async () => {
    const fetchMock = vi.fn(() => json({ id: 1, tagline: 'Honest.' }));
    vi.stubGlobal('fetch', fetchMock);

    const settings = await getSiteSettings();

    expect(settings?.tagline).toBe('Honest.');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/site-setting');
    expect((init as { next: { tags: string[] } }).next.tags).toEqual([SITE_SETTINGS_TAG]);
  });

  it('returns null when the single type has no entry yet', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(null)));

    expect(await getSiteSettings()).toBeNull();
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd frontend && npm test -- strapi.test.ts`
Expected: FAIL — `getSiteSettings` is not exported, and the populate assertions do not match.

- [ ] **Step 5: Update the data layer**

In `frontend/lib/strapi.ts`, replace the populate string in BOTH article queries. `getArticles`:

```ts
export function getArticles(): Promise<Article[]> {
  return strapiFetch<Article[]>(
    '/api/articles?populate[body][populate]=*&populate[seo]=*' +
      '&populate[author]=*&populate[categories]=*&sort=publishedAt:desc',
    { tags: [ARTICLES_TAG] },
  );
}
```

`getArticleBySlug` — keep its existing comment and tag exactly as they are, changing only the query string:

```ts
  const matches = await strapiFetch<Article[]>(
    `/api/articles?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      '&populate[body][populate]=*&populate[seo]=*' +
      '&populate[author]=*&populate[categories]=*',
    { tags: [articleTag(slug)] },
  );
```

Then append the new query, importing `SITE_SETTINGS_TAG` and `SiteSettings`:

```ts
/**
 * A single type returns one object rather than an array, and returns null
 * before its first entry exists — a fresh database, before seeding.
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  const settings = await strapiFetch<SiteSettings | null>(
    '/api/site-setting?populate[navLinks]=*',
    { tags: [SITE_SETTINGS_TAG] },
  );
  return settings ?? null;
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `cd frontend && npm test`
Expected: PASS — the existing 39 tests plus 4 new ones (43).

- [ ] **Step 7: Typecheck and verify against the live API**

```bash
cd frontend && npx tsc --noEmit
```

Expected: no output. Then confirm the real API agrees with the types — a wrong populate returns 200 with missing data, which no unit test catches:

```bash
curl -s "http://localhost:1337/api/site-setting?populate[navLinks]=*" | grep -o '"label":"[^"]*"'
```

Expected: `"label":"Home"` and `"label":"Engineering"`.

- [ ] **Step 8: Commit**

```bash
cd /home/asim/strapi-cms
git add frontend/lib
git commit -m "feat(frontend): type and fetch blocks, seo, and site settings"
```

---

### Task 4: Block rendering and article metadata

**Files:**
- Create: `frontend/components/Blocks.tsx`
- Modify: `frontend/app/articles/[slug]/page.tsx`
- Test: `frontend/components/blocks.test.ts`

**Interfaces:**
- Consumes: `Block`, `Seo`, `Article` from `@/lib/types`; `Prose` from `@/components/Prose`.
- Produces: `blockKey(block: Block): string | null` and `<Blocks blocks={Block[]} />` from `@/components/Blocks`; `metadataFrom(article)` used by `generateMetadata`.

- [ ] **Step 1: Write the failing test**

`frontend/components/blocks.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { blockKey } from '@/components/Blocks';
import type { Block } from '@/lib/types';

describe('blockKey', () => {
  it('maps each known component to a stable key', () => {
    expect(blockKey({ __component: 'blocks.rich-text', id: 1, body: 'x' })).toBe('rich-text-1');
    expect(
      blockKey({ __component: 'blocks.pull-quote', id: 2, quote: 'q', attribution: null }),
    ).toBe('pull-quote-2');
    expect(blockKey({ __component: 'blocks.callout', id: 3, text: 't', tone: 'note' })).toBe(
      'callout-3',
    );
    expect(
      blockKey({
        __component: 'blocks.code',
        id: 4,
        code: 'c',
        language: 'ts',
        showLineNumbers: false,
      }),
    ).toBe('code-4');
  });

  it('returns null for a component the renderer does not know', () => {
    // An editor can add a block type in the admin UI before the renderer
    // exists. That must degrade to a gap in the page, never a crash.
    const unknown = { __component: 'blocks.embed', id: 9 } as unknown as Block;
    expect(blockKey(unknown)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- blocks.test.ts`
Expected: FAIL — cannot resolve `@/components/Blocks`.

- [ ] **Step 3: Write the renderer**

`frontend/components/Blocks.tsx`:

```tsx
import { Prose } from '@/components/Prose';
import type { Block } from '@/lib/types';

const KNOWN: Record<string, string> = {
  'blocks.rich-text': 'rich-text',
  'blocks.pull-quote': 'pull-quote',
  'blocks.callout': 'callout',
  'blocks.code': 'code',
};

/** Stable React key, and the test for whether this block can be rendered. */
export function blockKey(block: Block): string | null {
  const name = KNOWN[block.__component];
  return name ? `${name}-${block.id}` : null;
}

function CalloutBlock({ text, tone }: { text: string; tone: 'note' | 'warning' | 'aside' }) {
  // Tone changes the rule colour only — the palette stays fixed.
  const border = tone === 'warning' ? 'border-accent' : 'border-rule';
  return (
    <aside className={`mt-8 border-l-2 ${border} pl-5`}>
      <p className="font-display text-xs uppercase tracking-widest text-accent">{tone}</p>
      <p className="mt-2">{text}</p>
    </aside>
  );
}

function CodeBlock({ code, showLineNumbers }: { code: string; showLineNumbers: boolean }) {
  const lines = code.split('\n');
  return (
    <pre className="mt-8 overflow-x-auto border border-rule p-5 font-mono text-sm">
      <code>
        {lines.map((line, index) => (
          <span key={index} className="block">
            {showLineNumbers && (
              <span className="mr-4 inline-block w-6 select-none text-right text-rule">
                {index + 1}
              </span>
            )}
            {line}
          </span>
        ))}
      </code>
    </pre>
  );
}

export function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <div className="mt-8">
      {blocks.map((block) => {
        const key = blockKey(block);
        if (!key) {
          console.warn(`[blocks] no renderer for '${block.__component}', skipping`);
          return null;
        }

        switch (block.__component) {
          case 'blocks.rich-text':
            return <Prose key={key} content={block.body} />;
          case 'blocks.pull-quote':
            return (
              <blockquote key={key} className="mt-10 border-t border-rule pt-6">
                <p className="text-3xl leading-snug text-headline">{block.quote}</p>
                {block.attribution && (
                  <p className="font-display mt-3 text-xs uppercase tracking-widest text-accent">
                    {block.attribution}
                  </p>
                )}
              </blockquote>
            );
          case 'blocks.callout':
            return <CalloutBlock key={key} text={block.text} tone={block.tone} />;
          case 'blocks.code':
            return (
              <CodeBlock key={key} code={block.code} showLineNumbers={block.showLineNumbers} />
            );
        }
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 45 tests.

- [ ] **Step 5: Wire the article page**

In `frontend/app/articles/[slug]/page.tsx`, add the imports (`Blocks` from `@/components/Blocks`, `Metadata` type from `next`), keep `export const revalidate = 60` and `generateStaticParams` exactly as they are, and add metadata plus the body/content switch:

```tsx
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    return { title: 'Not found' };
  }

  // SEO fields are optional, so every one falls back to the article itself.
  return {
    title: article.seo?.metaTitle || article.title,
    description: article.seo?.metaDescription || article.excerpt || undefined,
    alternates: article.seo?.canonicalUrl ? { canonical: article.seo.canonicalUrl } : undefined,
  };
}
```

Inside the component, replace the single `<Prose … />` line with:

```tsx
      {article.body && article.body.length > 0 ? (
        <Blocks blocks={article.body} />
      ) : (
        <Prose content={article.content} />
      )}
```

And render the kicker above the headline, immediately after `<CategoryPills … />`:

```tsx
      {article.kicker && (
        <p className="font-display mt-4 text-xs uppercase tracking-widest text-accent">
          {article.kicker}
        </p>
      )}
```

- [ ] **Step 6: Verify in the browser**

With Strapi running, start the dev server (`cd frontend && npm run dev`) and check both render paths:

```bash
curl -s http://localhost:3000/articles/practical-guide-to-content-modeling \
  | grep -o 'Model the page\|spreadsheet with extra steps\|Components are reusable\|findMany' | sort -u
curl -s http://localhost:3000/articles/css-has-quietly-become-a-good-language \
  | grep -c 'The workarounds are the hard part'
curl -s http://localhost:3000/articles/practical-guide-to-content-modeling \
  | grep -o '<title>[^<]*</title>'
```

Expected: all four block strings on the demo article; at least 1 for the markdown-only article (proving the `content` fallback still works); and a `<title>` reading `A Practical Guide to Content Modeling` from the SEO component. Stop the dev server afterwards.

- [ ] **Step 7: Typecheck and commit**

```bash
cd frontend && npx tsc --noEmit
cd /home/asim/strapi-cms
git add frontend/components/Blocks.tsx frontend/components/blocks.test.ts frontend/app/articles
git commit -m "feat(frontend): render article body blocks and SEO metadata"
```

---

### Task 5: Site settings in the layout, and the featured hero

**Files:**
- Create: `frontend/lib/hero.ts`
- Modify: `frontend/components/Masthead.tsx`
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/page.tsx`
- Modify: `frontend/components/ArticleCard.tsx`, `frontend/components/HeroArticle.tsx`
- Test: `frontend/lib/hero.test.ts`

**Interfaces:**
- Consumes: `getSiteSettings` from `@/lib/strapi`; `SiteSettings`, `Article` from `@/lib/types`.
- Produces: `pickHero(articles: Article[]): { hero: Article | null; rest: Article[] }` from `@/lib/hero`; `<Masthead settings={SiteSettings | null} />`.

- [ ] **Step 1: Write the failing test**

`frontend/lib/hero.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { pickHero } from '@/lib/hero';
import type { Article } from '@/lib/types';

const article = (slug: string, featured = false): Article =>
  ({ slug, featured, title: slug }) as Article;

describe('pickHero', () => {
  it('prefers the featured article over the first', () => {
    const { hero, rest } = pickHero([article('a'), article('b', true), article('c')]);

    expect(hero?.slug).toBe('b');
    expect(rest.map((a) => a.slug)).toEqual(['a', 'c']);
  });

  it('falls back to the first article when none is featured', () => {
    const { hero, rest } = pickHero([article('a'), article('b')]);

    expect(hero?.slug).toBe('a');
    expect(rest.map((a) => a.slug)).toEqual(['b']);
  });

  it('handles an empty list', () => {
    expect(pickHero([])).toEqual({ hero: null, rest: [] });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- hero.test.ts`
Expected: FAIL — cannot resolve `@/lib/hero`.

- [ ] **Step 3: Write the implementation**

`frontend/lib/hero.ts`:

```ts
import type { Article } from '@/lib/types';

/**
 * Chooses the front-page lead.
 *
 * The list arrives sorted newest-first, so the fallback is simply the first
 * entry — `featured` lets an editor override that without changing dates.
 */
export function pickHero(articles: Article[]): { hero: Article | null; rest: Article[] } {
  if (articles.length === 0) {
    return { hero: null, rest: [] };
  }

  const index = Math.max(
    articles.findIndex((article) => article.featured === true),
    0,
  );

  return {
    hero: articles[index],
    rest: articles.filter((_, i) => i !== index),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 48 tests.

- [ ] **Step 5: Make the masthead take settings**

Replace `frontend/components/Masthead.tsx`. Keep the existing form POST to `/api/checkout` exactly as it is — it must stay a plain form, with no `'use client'` and no import from `@/lib/stripe`:

```tsx
import Link from 'next/link';
import type { SiteSettings } from '@/lib/types';

const FALLBACK_NAV = [{ label: 'Home', href: '/' }];

export function Masthead({ settings }: { settings: SiteSettings | null }) {
  // Falls back to the hardcoded copy so a database without site settings —
  // a fresh install before seeding — still renders a complete masthead.
  const navLinks = settings?.navLinks?.length ? settings.navLinks : FALLBACK_NAV;
  const subscribeLabel = settings?.subscribeLabel ?? 'Subscribe';

  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
        <div>
          <Link href="/" className="bg-headline inline-block px-3 py-2">
            <span className="font-display text-2xl font-bold uppercase tracking-tight text-paper">
              The Strapi Press
            </span>
          </Link>
          {settings?.tagline && (
            <p className="font-display mt-2 text-xs uppercase tracking-widest">{settings.tagline}</p>
          )}
        </div>
        <nav className="font-display flex items-center gap-6 text-sm uppercase tracking-widest">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:text-accent">
              {link.label}
            </Link>
          ))}
          <form action="/api/checkout" method="POST">
            <button
              type="submit"
              className="cursor-pointer uppercase tracking-widest text-accent hover:underline"
            >
              {subscribeLabel}
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 6: Fetch settings in the layout**

In `frontend/app/layout.tsx`, import `getSiteSettings`, fetch alongside the categories, pass settings to the masthead, and use the footer text:

```tsx
  // Both fetches run on every route because the masthead and category bar are
  // in the layout. That attaches BOTH the `categories` and `site-settings`
  // tags to every route: editing either invalidates the whole site. Correct —
  // they are on every page — but it is the widest invalidation we have.
  const [categories, settings] = await Promise.all([getCategories(), getSiteSettings()]);
```

```tsx
        <Masthead settings={settings} />
```

```tsx
            <span className="font-display text-xs uppercase tracking-widest">
              {settings?.footerText ?? 'The Strapi Press'}
            </span>
```

- [ ] **Step 7: Use the featured hero and show kickers on cards**

In `frontend/app/page.tsx`, replace the destructuring `const [hero, ...rest] = articles;` with:

```tsx
  const { hero, rest } = pickHero(articles);
```

importing `pickHero` from `@/lib/hero`. The `if (!hero)` guard and the rail/grid slicing below it stay exactly as they are.

In `frontend/components/ArticleCard.tsx` and `frontend/components/HeroArticle.tsx`, render the kicker above the headline in each — add this immediately inside the `<article>` element, before the title link:

```tsx
      {article.kicker && (
        <p className="font-display text-xs uppercase tracking-widest text-accent">
          {article.kicker}
        </p>
      )}
```

- [ ] **Step 8: Verify in the browser**

With Strapi running and `npm run dev` in `frontend/`:

```bash
curl -s http://localhost:3000/ | grep -o 'Honest. Independent. Statically regenerated.'
curl -s http://localhost:3000/ | grep -o 'tutorial\|opinion\|analysis' | sort -u
curl -s http://localhost:3000/ | grep -o 'A Practical Guide to Content Modeling' | head -1
```

Expected: the tagline from Site Settings, at least one kicker, and the featured article's title present. Confirm in a browser that the featured article is the hero (the oversized uppercase headline), not merely present. Stop the dev server afterwards.

- [ ] **Step 9: Typecheck and commit**

```bash
cd frontend && npx tsc --noEmit && npm test
cd /home/asim/strapi-cms
git add frontend/lib/hero.ts frontend/lib/hero.test.ts frontend/components frontend/app
git commit -m "feat(frontend): drive masthead from site settings and honour featured articles"
```

---

### Task 6: Revalidation mapping, verification script, and docs

**Files:**
- Modify: `frontend/app/api/revalidate/route.ts`
- Test: `frontend/app/api/revalidate/route.test.ts` (extend)
- Create: `scripts/verify-content-model.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: `SITE_SETTINGS_TAG` from `@/lib/tags`; every route from Tasks 1-5.
- Produces: an executable script matching the existing verification scripts' PASS/FAIL shape.

- [ ] **Step 1: Write the failing test**

Add to `frontend/app/api/revalidate/route.test.ts`, inside the existing `describe('tagsFor', …)`:

```ts
  it('maps the site-setting single type to its tag', () => {
    expect(tagsFor('site-setting', null)).toEqual(['site-settings']);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- revalidate`
Expected: FAIL — receives `[]` instead of `['site-settings']`.

- [ ] **Step 3: Extend the model map**

In `frontend/app/api/revalidate/route.ts`, import `SITE_SETTINGS_TAG` and add a case to `tagsFor`, above the `default`:

```ts
    // A single type has no slug, and its content is in the layout, so this
    // invalidates every route by design.
    case 'site-setting':
      return [SITE_SETTINGS_TAG];
```

Component and dynamic-zone edits arrive as `entry.update` on the parent article, so they need no new case.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 49 tests.

- [ ] **Step 5: Write the verification script**

Read `scripts/verify-blog-api.sh` first and reuse its `check` helper, PASS/FAIL table, and exit-code convention verbatim.

`scripts/verify-content-model.sh`:

```bash
#!/usr/bin/env bash
# Verifies the content-modelling additions against the running Strapi:
# components, the article body dynamic zone, and the site-settings single type.
# Requires the dev server to be running: ./scripts/restart-dev.sh
set -u

BASE="http://localhost:1337"
fail=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-44s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-44s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" != "000" ]; then
    break
  fi
  sleep 1
done

echo "Content model verification"

check "GET /api/site-setting is public" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/site-setting")" "200"
check "POST /api/site-setting is forbidden" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/api/site-setting" \
     -H 'Content-Type: application/json' -d '{"data":{"tagline":"nope"}}')" "403"

settings=$(curl -s "$BASE/api/site-setting?populate[navLinks]=*")
check "site settings have a tagline" \
  "$(echo "$settings" | grep -c '"tagline":"[^"]')" "1"
check "site settings have nav links" \
  "$([ "$(echo "$settings" | grep -o '"label":"[^"]*"' | wc -l)" -ge 1 ] && echo yes || echo no)" "yes"

# populate=* does NOT reach inside dynamic-zone components, so this asserts the
# nested form actually returns block fields rather than empty objects.
blocks=$(curl -s "$BASE/api/articles?populate[body][populate]=*")
for component in rich-text pull-quote callout code; do
  check "body contains blocks.$component" \
    "$([ "$(echo "$blocks" | grep -c "\"__component\":\"blocks.$component\"")" -ge 1 ] \
       && echo yes || echo no)" "yes"
done
check "rich-text block has its body field populated" \
  "$([ "$(echo "$blocks" | grep -c '"body":"## Model the page')" -ge 1 ] && echo yes || echo no)" "yes"

articles=$(curl -s "$BASE/api/articles?populate[seo]=*")
check "an article carries an seo component" \
  "$([ "$(echo "$articles" | grep -c '"metaTitle":"[^"]')" -ge 1 ] && echo yes || echo no)" "yes"
check "an article is featured" \
  "$([ "$(echo "$articles" | grep -c '"featured":true')" -ge 1 ] && echo yes || echo no)" "yes"
check "an article carries a kicker" \
  "$([ "$(echo "$articles" | grep -c '"kicker":"[^"]')" -ge 1 ] && echo yes || echo no)" "yes"

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
```

- [ ] **Step 6: Make it executable and run it**

```bash
cd /home/asim/strapi-cms
chmod +x scripts/verify-content-model.sh
./scripts/verify-content-model.sh
```

Expected: every check PASS, exit 0. A failure on the `blocks.*` checks means the seed enrichment did not run or the populate syntax is wrong — diagnose which rather than weakening the check.

- [ ] **Step 7: Document it**

Add to `README.md`, in the verification list alongside the existing scripts:

```markdown
./scripts/verify-content-model.sh  # components, dynamic zone, and single type
```

And add a short section after the Frontend section:

```markdown
### Content model

Articles carry an optional `body` dynamic zone built from four components —
rich text, pull quote, callout, and code. Articles without one fall back to the
original `content` markdown field, so both paths stay live. A `site-setting`
single type supplies the masthead tagline, nav links, subscribe label, and
footer text; when it is absent the frontend falls back to hardcoded copy.

Because the masthead and category bar are in the root layout, the
`site-settings` and `categories` cache tags are attached to every route:
editing either revalidates the whole site.
```

- [ ] **Step 8: Run the full suite**

```bash
cd /home/asim/strapi-cms/frontend && npm test && npx tsc --noEmit
cd /home/asim/strapi-cms
./scripts/verify-blog-api.sh
./scripts/verify-content-model.sh
./scripts/verify-stripe.sh
./scripts/verify-isr.sh
```

Expected: all green. `verify-isr.sh` matters most here — the layout gained a second fetch, and that is the change most likely to disturb static rendering. Note it needs port 3000 free, so stop any dev server first.

- [ ] **Step 9: Commit**

```bash
git add frontend/app/api/revalidate scripts/verify-content-model.sh README.md
git commit -m "test: verify the content model and revalidate site settings"
```

---

## Self-Review Notes

Spec coverage checked section by section: components (Task 1), schema changes and public access (Task 1), seeding and `enrichExistingArticles` (Task 2), data layer with explicit populate (Task 3), block rendering and `generateMetadata` (Task 4), site settings in the layout plus featured hero and kickers (Task 5), ISR impact and the revalidate mapping (Task 5 comment + Task 6), error handling (Task 4's unknown-component path, Task 5's fallbacks, Task 3's null single type), testing and acceptance criteria (Task 6).

Two things the plan makes explicit because they fail quietly rather than loudly: `populate=*` does not reach inside dynamic-zone components, so Task 3 asserts on the query string and Task 6 asserts on the returned block fields; and Task 2's second restart is the real test of enrichment idempotency, not the first.
