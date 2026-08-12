# Blog Content Model — Design

**Date:** 2026-08-12
**Project:** strapi-cms (Strapi 5.52.0, TypeScript, SQLite)

## Purpose

Give the fresh Strapi install a working relational content model so the REST API
returns real data. The model is a blog: articles written by authors and filed
under categories. It is deliberately minimal — enough to exercise Strapi's
relations, UID slugs, rich text, and media fields, and nothing beyond that.

## Scope

In scope:

- Three collection types: `Author`, `Category`, `Article`.
- Idempotent seed data created on server bootstrap.
- Read-only public REST access to all three types.

Out of scope (deferred, not needed to satisfy the goal):

- SEO components and dynamic zones.
- Seeding binary image uploads; `cover` and `avatar` stay empty.
- Any custom controller, route, or service logic beyond Strapi's factories.
- Public write access of any kind.

## Content Types

All three are collection types living under `src/api/<name>/`.

### Author (`api::author.author`)

| Field | Type | Constraints |
|---|---|---|
| `name` | string | required |
| `email` | email | unique |
| `bio` | text | — |
| `avatar` | media | single image |
| `articles` | relation | one-to-many → Article, `mappedBy: author` |

Draft-and-publish: **off**.

### Category (`api::category.category`)

| Field | Type | Constraints |
|---|---|---|
| `name` | string | required, unique |
| `slug` | uid | `targetField: name` |
| `description` | text | — |
| `articles` | relation | many-to-many → Article, `mappedBy: categories` |

Draft-and-publish: **off**.

### Article (`api::article.article`)

| Field | Type | Constraints |
|---|---|---|
| `title` | string | required |
| `slug` | uid | `targetField: title` |
| `excerpt` | text | `maxLength: 300` |
| `content` | richtext | — |
| `cover` | media | single image |
| `author` | relation | many-to-one → Author, `inversedBy: articles` |
| `categories` | relation | many-to-many → Category, `inversedBy: articles` |

Draft-and-publish: **on**.

### Rationale for the draft-and-publish split

Draft-and-publish is on for `Article` because a publish workflow is the point of
a blog. It is off for `Author` and `Category` because reference data has no
meaningful draft state, and an unpublished reference entry silently disappears
from populated API responses — the most common source of "my relations are
empty" confusion.

## File Structure

Each type follows Strapi's standard generated layout, so everything remains
editable through the admin Content-Type Builder afterwards:

```
src/api/<type>/
  content-types/<type>/schema.json
  controllers/<type>.ts     // factories.createCoreController
  routes/<type>.ts          // factories.createCoreRouter
  services/<type>.ts        // factories.createCoreService
```

No custom logic in any of them.

## Seeding

A `bootstrap` hook in `src/index.ts` runs on every server start.

**Idempotency:** it counts existing `api::article.article` documents first and
returns immediately if the count is non-zero. Restarts therefore never duplicate
data, and a user who deletes everything can re-seed by restarting.

**Order:** authors → categories → articles, because articles reference the
other two by document ID.

**Volume:** 2 authors, 3 categories, 4 articles. Each article is assigned one
author and one or two categories, so both relation kinds have non-trivial data
to populate.

**Publishing:** articles are created with `status: 'published'`. Without this,
`GET /api/articles` returns an empty array despite the rows existing, because
the default create makes drafts only.

## Public Permissions

The same bootstrap grants the Public role the `find` and `findOne` actions on
`api::article.article`, `api::author.author`, and `api::category.category`.

It looks up the Public role via the users-permissions plugin, then creates the
permission rows only where they are absent — so it does not fight manual changes
made later in the admin UI, and does not duplicate rows across restarts.

No `create`, `update`, or `delete` action is granted to Public.

## Verification

The change is done when all of the following hold against a running server:

1. `GET /api/articles` returns HTTP 200 with 4 entries.
2. `GET /api/articles?populate=*` shows each entry with a populated `author`
   object and a `categories` array of at least one entry.
3. `GET /api/authors` and `GET /api/categories` return 200 with 2 and 3 entries.
4. `POST /api/articles` without a token returns 403, confirming public access is
   read-only.
5. Restarting the server leaves the article count at 4, confirming the seed is
   idempotent.
6. The three types appear in the admin Content Manager.
