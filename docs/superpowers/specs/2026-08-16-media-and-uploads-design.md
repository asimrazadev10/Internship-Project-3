# Media and Uploads — Design

**Date:** 2026-08-16
**Project:** strapi-cms (Strapi 5.52.0) + `frontend/` (Next.js 16 App Router)

## Purpose

The blog has two media fields — `Article.cover` and `Author.avatar` — that have
been null since the day they were created, and a Media Library reporting zero
assets. The upload plugin is carefully configured with MIME allow and deny lists
that nothing has ever exercised.

This project puts real images through that pipeline: acquired reproducibly,
uploaded on bootstrap, resized by Strapi, and rendered through `next/image` in
the newspaper design.

## Scope

In scope:

- A committed set of six licensed photographs, fetched once by a script.
- `seedMedia`, uploading them and linking them to articles and authors.
- A `blocks.image` component, giving the article body dynamic zone its first
  visual block.
- Frontend rendering: covers on the hero, cards, and article pages; avatars on
  bylines; captioned figures in article bodies.
- Unit tests, a verification script, and `next/image` configuration.

Out of scope (deferred, each for a stated reason):

- A remote upload provider (S3, Cloudinary). The local provider exercises the
  same plugin surface; swapping providers is configuration, not design.
- Image cropping, focal points, or art direction per breakpoint.
- A site logo image. The text logotype is load-bearing in the current design and
  replacing it with an upload would make the masthead worse.
- Video, audio, and documents. The upload config permits them; nothing in a blog
  needs them yet.
- Internationalisation, custom controllers, and auth — still their own slices.

## Acquiring the Images

`scripts/fetch-media.sh` downloads a fixed list of Lorem Picsum IDs into
`assets/media/`. Picsum serves Unsplash photographs under a permissive licence,
and addressing them by ID (`https://picsum.photos/id/1015/1600/900`) makes the
result deterministic: the same clone gets the same photographs every time.

Six files: **three** article covers at 1600×900, **one** in-body figure at
1600×900 for the `blocks.image` demonstration, and two author portraits at
600×600.

Three covers for four articles is deliberate. The fourth article stays
coverless, so the no-cover layout path is exercised by the seed on every
machine rather than only in theory — the same reasoning that made the previous
slice keep one article on the markdown `content` path.

`assets/media/` and its images are **committed to the repository**, with a
`MANIFEST.md` recording each file's source URL, dimensions, and licence.

Committing binaries deserves justification. It buys three things: `bootstrap`
never touches the network, so seeding works offline and in CI; a fresh clone
produces byte-identical content, so the verification script can assert instead
of skipping; and the licence provenance travels with the files. The cost is
roughly 2MB in git history, paid once.

The fetch script is therefore a one-time developer tool, not part of any
runtime path. Running it again re-downloads the same IDs and should produce no
git diff.

Note the distinction from `public/uploads/`, which is where Strapi *writes*
uploaded files and their derivatives. That directory is already gitignored
(`.gitignore:83-84`, keeping only `.gitkeep`) and stays that way — generated
derivatives are not source.

## Uploading on Bootstrap

`seedMedia(strapi)` runs from bootstrap after `seedBlog` and the existing
enrichment, following the same idempotency discipline as everything in
`src/seed`:

1. For each manifest entry, query `plugin::upload.file` by `name`. If a file
   with that name exists, reuse it rather than uploading a second copy.
2. Otherwise upload it through the upload plugin's service, which — because
   sharp 0.35.3 is installed — generates `thumbnail`, `small`, `medium`, and
   `large` derivatives automatically. We never resize anything ourselves.
3. Link the file to its target only where the target's field is currently null,
   so an editor's chosen cover is never replaced.
4. Set `alternativeText` on upload, from the manifest. An image uploaded without
   alt text is an accessibility defect created at the source.

Running bootstrap twice must upload nothing and change nothing, and the
verification of that is a second restart showing no upload log lines — the same
test that caught the enrichment bug in the previous slice.

Articles have draft-and-publish enabled, so linking a cover writes the draft and
must be followed by a publish, exactly as `enrichExistingArticles` does. The
same guard applies: skip any article whose draft is newer than its published
version, rather than force-publishing an editor's unpublished work.

## The `blocks.image` Component

`src/components/blocks/image.json`:

| Field | Type | Constraints |
|---|---|---|
| `image` | media | single, `allowedTypes: ["images"]`, required |
| `caption` | string | — |
| `credit` | string | — |

Added to the `body` dynamic zone's component list on Article, alongside the four
existing blocks.

It renders as a `<figure>`: the image, then the caption in serif, then the
credit in small red uppercase display type. Caption and credit are each omitted
when absent rather than rendering an empty line.

## Frontend

### Configuration

`next.config.ts` gains:

```ts
images: {
  remotePatterns: [
    { protocol: 'http', hostname: 'localhost', port: '1337', pathname: '/uploads/**' },
  ],
}
```

Without this `next/image` refuses the URL outright. It is the single most
commonly forgotten step in this integration, so the verification script checks a
rendered page rather than trusting the config file.

### `lib/media.ts`

```ts
export interface StrapiImageFormat {
  url: string;
  width: number;
  height: number;
}

export interface StrapiImage {
  id: number;
  url: string;
  alternativeText: string | null;
  width: number;
  height: number;
  formats?: Record<string, StrapiImageFormat> | null;
}

imageUrl(media: StrapiImage | null | undefined, format?: string): string | null
imageAlt(media: StrapiImage | null | undefined, fallback: string): string
```

`imageUrl` exists because the local provider returns **relative** paths
(`/uploads/cover_abc.jpg`). Those resolve against the Next server, not Strapi,
so they must be joined to `STRAPI_URL`. It returns `null` for absent media,
falls back to the original when a requested format is missing, and passes
through any URL that is already absolute — so switching to a remote provider
later needs no change here.

`imageAlt` returns `alternativeText` when present and the supplied fallback
otherwise, so an `alt` attribute is never empty.

### Population

Covers and avatars must be populated explicitly, and this is the part most
likely to fail quietly.

| Query | Adds |
|---|---|
| `getArticles` | `populate[cover]=true`, `populate[author][populate][avatar]=true` |
| `getArticleBySlug` | the same, plus `populate[body][populate]=*` already covers the image block's media |
| `getCategoryBySlug` | `populate[articles][populate][cover]=true` |

Slice A established that `populate[author]=*` returns **400** — the wildcard
tries to deep-populate the author's own media. The nested form above is
therefore a hypothesis, not a fact, and the implementation must verify each
query against the live API before relying on it. A wrong populate returns 200
with the image silently missing.

### Layout

Following thefp.com, which this design already references:

- **Hero**: oversized uppercase headline, then a wide cover image below it,
  16:9, full column width.
- **Rail and grid cards**: a small cover above the headline, 16:9, using the
  `small` derivative.
- **Article page**: a full-width lead image under the byline, above the body.
- **Bylines**: a round 28px avatar using the `thumbnail` derivative, to the left
  of the author name, on cards and article pages.

Images keep the existing vocabulary: no rounded corners except the avatar
circle, no shadows, hairline rules unchanged.

## Error Handling

Every image is optional, and the absence of one is a normal state rather than an
error:

- An article with no cover renders exactly as it does today. Three of the four
  articles will keep at least one coverless path exercised deliberately, so the
  fallback is tested rather than assumed.
- A byline with no avatar renders the name alone.
- `imageUrl` returns `null` rather than a broken relative path, and callers skip
  the `<Image>` entirely when it does.
- A `blocks.image` whose media failed to populate renders nothing and logs a
  warning, matching how the unknown-component path already behaves.

## Cache and ISR

Cover and avatar changes reach the frontend as `entry.update` on the article or
author, which the existing tag mapping already handles. No new cache tag is
needed.

One gap worth stating: Strapi also emits `media.create`, `media.update`, and
`media.delete` events, and the `nextjs-isr` webhook subscribes only to `entry.*`
events. Replacing an image's *file* without touching the entry that references
it would therefore not invalidate anything until the 60-second window elapses.
That is acceptable — the URL changes on re-upload, which changes the entry — and
recorded here so it is a known limit rather than a surprise.

## Testing

**Unit (Vitest)**

- `imageUrl`: relative path joined to `STRAPI_URL`; absolute URL passed through;
  named format selected; missing format falls back to the original; `null` and
  `undefined` media both return `null`.
- `imageAlt`: uses `alternativeText`; falls back when it is null or empty.

**Script (`scripts/verify-media.sh`)**

Same shape as the existing verification scripts — `check` helper, PASS/FAIL
table, exit status from an accumulated flag. It asserts:

- An article's `cover` carries a `url` and a `formats` object containing
  `thumbnail` and `small`. The script does NOT probe `/api/upload/files`: that
  endpoint is not public by default, so asserting against it would either fail
  for the wrong reason or tempt someone into widening public permissions to
  make a test pass. The populated relations prove the upload worked.
- Exactly three of the four articles carry a cover, and the fourth carries
  none — asserted as an equality, so an accidental fourth upload is a failure
  rather than an improvement.
- An author's `avatar` carries a `url`.
- A `blocks.image` entry in some article body has its `image` populated.
- The rendered home page contains at least one `/uploads/` image URL, proving
  `next/image` accepted the remote pattern rather than throwing.
- An article without a cover still returns 200.

**Regression**

`verify-blog-api.sh`, `verify-content-model.sh`, `verify-stripe.sh`, and
`verify-isr.sh` must all still pass. `verify-isr.sh` matters most: cards change
shape, and the layout is involved.

## Acceptance Criteria

- The Media Library reports six assets, each with generated derivatives.
- Exactly three of the four articles carry a cover; the fourth has none and
  still renders correctly.
- Both authors have avatars, shown beside their bylines.
- An article body containing a `blocks.image` renders a figure with caption and
  credit.
- The home page renders cover images through `next/image` without configuration
  errors.
- Running bootstrap twice uploads nothing the second time and changes no
  content.
- All five verification scripts pass.
