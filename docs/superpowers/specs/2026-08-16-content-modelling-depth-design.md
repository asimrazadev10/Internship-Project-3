# Content Modelling Depth — Design

**Date:** 2026-08-16
**Project:** strapi-cms (Strapi 5.52.0) + `frontend/` (Next.js 16 App Router)

## Purpose

The blog exercises a narrow slice of Strapi: three collection types, flat
fields, and two relations. An audit of the running instance found no components,
no dynamic zones, no single types, one locale, zero media assets, and nine
untouched factory controllers.

This project adds the modelling features a real publication uses — components,
a dynamic zone, a single type, and field variety with validation — and renders
all of them on the frontend, so each one is load-bearing rather than decorative.

## Scope

In scope:

- Six components: four article body blocks, one SEO block, one nav link.
- A `body` dynamic zone on Article, added alongside the existing `content`.
- A `site-setting` single type driving the masthead and footer.
- Article-level `seo`, `featured`, and `kicker` fields with validation.
- Frontend rendering for all of the above, including `generateMetadata`.
- Unit tests, a verification script, and public read access for the new type.

Out of scope (each its own project, deferred deliberately):

- Media and uploads. Every block below renders as pure typography, so the media
  work stays independent.
- Internationalisation.
- Custom controllers, services, routes, policies, and lifecycle hooks.
- Authentication, end users, and content gating.
- Paid-tier features. The admin panel marks Content History, Releases, Review
  Workflows, Single Sign-On and Audit Logs as unavailable on this licence, so
  "use more of Strapi" has a ceiling this project cannot cross.

## Components

Strapi components live in `src/components/<category>/<name>.json`. Two
categories: `blocks` (article body) and `shared` (reused across types).

### `blocks.rich-text`

| Field | Type | Constraints |
|---|---|---|
| `body` | richtext | required |

### `blocks.pull-quote`

| Field | Type | Constraints |
|---|---|---|
| `quote` | text | required, maxLength 300 |
| `attribution` | string | — |

### `blocks.callout`

| Field | Type | Constraints |
|---|---|---|
| `text` | text | required |
| `tone` | enumeration `note` / `warning` / `aside` | default `note` |

### `blocks.code`

| Field | Type | Constraints |
|---|---|---|
| `code` | text | required |
| `language` | enumeration `ts` / `js` / `bash` / `json` / `css` | default `ts` |
| `showLineNumbers` | boolean | default `false` |

### `shared.seo`

| Field | Type | Constraints |
|---|---|---|
| `metaTitle` | string | maxLength 60 |
| `metaDescription` | text | maxLength 160 |
| `canonicalUrl` | string | — |

The two length limits are the practical truncation points for search results.
They are real constraints, enforced by Strapi, not documentation.

### `shared.nav-link`

| Field | Type | Constraints |
|---|---|---|
| `label` | string | required |
| `href` | string | required |

## Schema Changes

### Article (`api::article.article`)

Gains four attributes. Everything existing is untouched.

```json
"body": {
  "type": "dynamiczone",
  "components": ["blocks.rich-text", "blocks.pull-quote", "blocks.callout", "blocks.code"]
},
"seo": { "type": "component", "repeatable": false, "component": "shared.seo" },
"featured": { "type": "boolean", "default": false },
"kicker": { "type": "enumeration", "enum": ["analysis", "opinion", "tutorial", "dispatch"] }
```

`content` (richtext) stays exactly as it is. The dynamic zone is additive: the
four existing articles keep their markdown bodies and keep rendering, and no
migration is needed. The article page prefers `body` when it has blocks and
falls back to `content` otherwise, so both paths stay exercised and reviewable.

### Site Settings (`api::site-setting.site-setting`)

New single type, `"kind": "singleType"`, draft-and-publish off.

| Field | Type | Purpose |
|---|---|---|
| `tagline` | string | Sits under the masthead logotype |
| `subscribeLabel` | string | Text of the SUBSCRIBE control, default `Subscribe` |
| `footerText` | string | Replaces the hardcoded footer string |
| `navLinks` | repeatable `shared.nav-link` | The masthead's top-right nav |

All four are currently hardcoded in `components/Masthead.tsx` and
`app/layout.tsx`. Moving them here is what makes the single type load-bearing.

### Public access

`PUBLIC_READ_ACTIONS` in `src/seed/data.ts` gains
`api::site-setting.site-setting.find`. A single type has no `findOne`. The
existing `grantPublicReadAccess` loop needs no change — it already iterates that
array and skips permissions that exist.

## Seeding

`seedBlog` currently returns early when any article exists, which would skip the
new content on this database. Site Settings therefore gets its own idempotent
function, `seedSiteSettings`, following the same pattern: look for the entry,
create it only when absent, called from bootstrap alongside the others.

The seeded article data gains a `body` on exactly one article, so both rendering
paths are exercised by the seed rather than only by hand-testing: that article
demonstrates all four block types in order, and the remaining three keep using
`content`. Two articles gain `seo`, one gains `featured: true`, and three gain a
`kicker`.

That alone would only ever run on an empty database, because `seedBlog` returns
early whenever an article exists — so on the developer's current database none
of the new modelling would appear, and the acceptance criteria below could not
be checked on the machine doing the work. A seed that only works on a database
nobody has is not a seed.

`enrichExistingArticles(strapi)` closes that gap. It is idempotent in the same
style as everything else in `src/seed`: for the article whose slug matches the
demo article, if `body` is empty it sets the four blocks; for the article marked
featured in the seed data, if no article currently has `featured: true` it sets
the flag; it fills `seo` and `kicker` only where those fields are null. It never
overwrites an editor's work, and running it twice changes nothing. Bootstrap
calls it after `seedBlog`.

This makes the same content appear on both a fresh database and an existing one,
which is what lets the verification script assert rather than skip.

## Frontend

### Data layer

`getSiteSettings(): Promise<SiteSettings | null>` joins the existing four
queries, tagged `site-settings`.

Article queries need explicit population. `populate=*` reaches components one
level but does **not** populate fields inside dynamic-zone components, so the
article queries become:

```
?populate[body][populate]=*&populate[seo]=*&populate[author]=*&populate[categories]=*
```

This replaces the current `populate=*`. Getting it wrong fails quietly — a 200
with empty blocks — so the verification script asserts a populated block, not
just a 200.

### Types

`lib/types.ts` gains a discriminated union keyed on Strapi's `__component`:

```ts
export type Block =
  | { __component: 'blocks.rich-text'; id: number; body: string }
  | { __component: 'blocks.pull-quote'; id: number; quote: string; attribution: string | null }
  | { __component: 'blocks.callout'; id: number; text: string; tone: 'note' | 'warning' | 'aside' }
  | { __component: 'blocks.code'; id: number; code: string; language: string; showLineNumbers: boolean };
```

plus `Seo`, `NavLink`, `SiteSettings`, and the four new `Article` fields.

### Rendering

`components/Blocks.tsx` switches on `__component` and renders each block in the
established editorial vocabulary — no new colours, no shadows, no rounded
corners:

- **rich-text** — reuses the existing `Prose` parser.
- **pull-quote** — oversized serif, indented, with a hairline rule and the
  attribution in red uppercase display type.
- **callout** — a left accent border whose weight varies by tone; `warning`
  takes the accent colour, `note` and `aside` take the rule colour.
- **code** — hairline-bordered monospace block with `overflow-x: auto`, so long
  lines scroll inside the block rather than pushing the page sideways.

The article page renders `<Blocks blocks={article.body} />` when `body` has
entries, and `<Prose content={article.content} />` otherwise.

`generateMetadata` reads `seo.metaTitle` falling back to `title`, and
`seo.metaDescription` falling back to `excerpt`, emitting `alternates.canonical`
only when `canonicalUrl` is set.

The masthead and footer read Site Settings. The home hero selects the first
article with `featured: true`, falling back to the most recently published.
`kicker`, when present, renders above the headline as red uppercase display type
on both the hero and the article page.

## ISR Impact

The root layout already fetches categories, which puts the `categories` tag on
every route. Site Settings adds a second tag of that kind, `site-settings`, by
the same mechanism: because the masthead renders inside the layout, that tag
lands on every route, so editing site settings invalidates the entire site.

This is correct — the masthead is on every page — but it is the second such
site-wide tag, and it is worth stating plainly rather than discovering later.
Anything fetched in the layout invalidates everything.

The revalidate route's model map gains `site-setting` → `['site-settings']`.
Component and dynamic-zone edits arrive as `entry.update` on the parent article,
so they need no new mapping.

## Error Handling

- An unrecognised `__component` renders nothing and logs a warning naming the
  component. Someone can add a block type in the admin UI before the renderer
  exists; that should degrade to a gap in the page, never a crash.
- Missing Site Settings — a fresh database before seeding — falls back to
  today's hardcoded strings, so the blog still renders.
- A missing `seo` object falls back to title and excerpt; metadata is never
  empty.
- An empty `body` array is treated as absent, not as an empty article.

## Testing

**Unit (Vitest)**

- `blockKey(block)` mapping, including that an unknown `__component` maps to
  `null` rather than throwing.
- The metadata fallback chain: full `seo`, partial `seo`, and no `seo`.
- Hero selection: a featured article wins; with none featured, the most recent
  wins; with an empty list, nothing is returned.
- `getSiteSettings` tagging and its null-on-empty behaviour.

**Script (`scripts/verify-content-model.sh`)**

Same shape as the existing verification scripts — a `check` helper, a PASS/FAIL
table, exit status from an accumulated flag. Against the running Strapi it
asserts:

- `GET /api/site-setting` returns 200 for the public role.
- `GET /api/articles?populate[body][populate]=*` returns at least one entry
  whose `body` contains a `__component` key, and all four component names appear
  across the response. Because `enrichExistingArticles` runs on every boot, this
  is a hard assertion on any database, not a conditional skip.
- An article response carries `seo`, `featured`, and `kicker` keys.
- `POST /api/site-setting` is still 403 for the public role.

**Regression**

`verify-blog-api.sh`, `verify-isr.sh` and `verify-stripe.sh` must all still
pass. The ISR script matters most: the layout gains a fetch, and that is the
change most likely to disturb static rendering.

## Acceptance Criteria

- The admin panel shows six components, a `body` dynamic zone on Article, and a
  Site Settings single type.
- Both a fresh database and the existing one end up with an article whose body
  demonstrates all four blocks, and the article page renders them.
- Running bootstrap twice changes no content — `enrichExistingArticles` is
  idempotent and never overwrites an editor's edits.
- Articles without `body` still render from `content`, unchanged.
- The masthead's tagline, nav links and subscribe label come from Site Settings,
  with hardcoded fallbacks when it is absent.
- An article with `seo` produces the corresponding `<title>` and meta
  description; one without falls back to title and excerpt.
- The home hero is the `featured` article when one exists.
- All four verification scripts pass.
