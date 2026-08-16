# Media and Uploads Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put real images through Strapi's upload pipeline — acquired reproducibly, uploaded on bootstrap, resized by Strapi, and rendered through `next/image` in the newspaper design.

**Architecture:** Six licensed photographs are fetched once into a committed `assets/media/` directory, then uploaded on bootstrap by an idempotent `seedMedia` and linked to articles and authors only where those fields are null. A new `blocks.image` component gives the article body dynamic zone its first visual block. The frontend resolves Strapi's relative upload URLs against `STRAPI_URL` through one helper and renders covers, avatars, and figures with `next/image`.

**Tech Stack:** Strapi 5.52.0 with sharp 0.35.3 (generates derivatives automatically), Next.js 16 App Router, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-16-media-and-uploads-design.md`

## Global Constraints

- Six files exactly: **three** article covers (1600×900), **one** in-body figure (1600×900), **two** author portraits (600×600).
- Exactly three of the four articles get a cover. The fourth stays coverless deliberately, so the no-cover path is exercised on every machine. An accidental fourth cover is a failure, not an improvement.
- `assets/media/` and its images ARE committed. `public/uploads/` is NOT — it is already gitignored at `.gitignore:83-84` and stays that way.
- Seeding is idempotent: look before writing, never overwrite a non-null field, and a second bootstrap must upload nothing and log nothing new.
- Articles have draft-and-publish on: linking a cover writes the draft, so it must be published — and must skip any article whose draft is newer than its published version, exactly as `enrichExistingArticles` already does.
- Every image is optional. A missing cover, avatar, or figure renders the existing text-only layout, never a broken image or a crash.
- `alternativeText` is set at upload time from the manifest. No image is uploaded without alt text.
- Palette and vocabulary unchanged: paper `#F6F4EF`, ink `#363737`, headline `#161613`, accent `#F2312C`, rule `#DDD9D0`. No shadows, no rounded corners except the avatar circle, no card fills.
- Every route keeps `export const revalidate = 60` as a literal.
- Strapi runs on :1337 and is the user's server — restart only with `./scripts/restart-dev.sh`, and leave it running.
- All five verification scripts must pass at the end: `verify-blog-api.sh`, `verify-content-model.sh`, `verify-stripe.sh`, `verify-isr.sh`, and the new `verify-media.sh`.

### Verified API facts — use these, do not re-derive

Read from the installed source at `node_modules/@strapi/upload/dist/server/services/upload.js`:

- The service is `strapi.plugin('upload').service('upload')`.
- Its entry point is `upload({ data, files })`, where `data` may carry `fileInfo: { name, alternativeText, caption }`.
- A file object must be `{ filepath, originalFilename, mimetype, size }`. The field is `originalFilename` — NOT `originalFileName` or `name`.
- `upload()` creates and cleans up its own temp working directory; callers do not manage one.
- It returns an array of created file records, each with `id`, `url`, and `formats`.

---

### Task 1: Fetch and commit the images

**Files:**
- Create: `scripts/fetch-media.sh`
- Create: `assets/media/MANIFEST.md`
- Create: `assets/media/*.jpg` (six binaries, produced by running the script)

**Interfaces:**
- Consumes: nothing.
- Produces: six files on disk with these exact names, which Task 2 reads by name: `cover-schema.jpg`, `cover-modeling.jpg`, `cover-css.jpg`, `figure-components.jpg`, `avatar-asim.jpg`, `avatar-hassan.jpg`.

- [ ] **Step 1: Write the fetch script**

`scripts/fetch-media.sh`:

```bash
#!/usr/bin/env bash
# Downloads the blog's demo photographs into assets/media/.
#
# A one-time developer tool, NOT part of any runtime path: the images are
# committed, so bootstrap never touches the network. Re-running this should
# produce no git diff — the Picsum IDs are fixed, so every clone and every run
# gets byte-identical photographs.
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/assets/media"
mkdir -p "$DEST"

# name|picsum id|width|height
FILES="
cover-schema.jpg|1015|1600|900
cover-modeling.jpg|180|1600|900
cover-css.jpg|1073|1600|900
figure-components.jpg|1050|1600|900
avatar-asim.jpg|1005|600|600
avatar-hassan.jpg|1012|600|600
"

echo "$FILES" | while IFS='|' read -r name id w h; do
  [ -z "$name" ] && continue
  url="https://picsum.photos/id/$id/$w/$h"
  printf 'fetching %-24s <- %s\n' "$name" "$url"
  curl -sSL --fail -o "$DEST/$name" "$url"
done

echo
ls -l "$DEST"/*.jpg | awk '{print $5, $NF}'
```

- [ ] **Step 2: Run it and confirm six real images**

```bash
chmod +x scripts/fetch-media.sh
./scripts/fetch-media.sh
file assets/media/*.jpg | sed 's/,.*//'
```

Expected: six lines, each reporting `JPEG image data`. If any file reports HTML or is a few hundred bytes, the ID did not resolve — pick a different Picsum ID, update the script, and note the substitution in your report. Do not commit a placeholder or an error page.

- [ ] **Step 3: Write the manifest**

`assets/media/MANIFEST.md`:

```markdown
# Demo media

Photographs from [Lorem Picsum](https://picsum.photos), which serves Unsplash
images under the [Unsplash licence](https://unsplash.com/license) — free to use
for any purpose, no permission or attribution required.

Addressed by fixed ID so every clone gets identical files. Re-run
`./scripts/fetch-media.sh` to reproduce them.

These files are committed deliberately: bootstrap seeds from disk, so it works
offline and a fresh clone produces byte-identical content. Files uploaded by
Strapi land in `public/uploads/`, which is gitignored — those are generated,
these are source.

| File | Source | Used for |
|---|---|---|
| `cover-schema.jpg` | https://picsum.photos/id/1015/1600/900 | Cover: "Why Your Database Schema Is Your Real API" |
| `cover-modeling.jpg` | https://picsum.photos/id/180/1600/900 | Cover: "A Practical Guide to Content Modeling" |
| `cover-css.jpg` | https://picsum.photos/id/1073/1600/900 | Cover: "CSS Has Quietly Become a Good Language" |
| `figure-components.jpg` | https://picsum.photos/id/1050/1600/900 | In-body figure in the content-modeling article |
| `avatar-asim.jpg` | https://picsum.photos/id/1005/600/600 | Avatar: Asim Raza |
| `avatar-hassan.jpg` | https://picsum.photos/id/1012/600/600 | Avatar: Hassan |

"Build a Blog Frontend Against a REST API in an Afternoon" has no cover on
purpose, so the coverless layout path is exercised by the seed.
```

- [ ] **Step 4: Commit**

```bash
cd /home/asim/strapi-cms
git add scripts/fetch-media.sh assets/media
git commit -m "chore: add committed demo photographs and their fetch script"
```

---

### Task 2: Upload on bootstrap

**Files:**
- Modify: `src/seed/data.ts` (add `MEDIA` and `MEDIA_TARGETS`)
- Create: `src/seed/media.ts`
- Modify: `src/seed/index.ts` (re-export)
- Modify: `src/index.ts` (bootstrap wiring)

**Interfaces:**
- Consumes: the six files from Task 1.
- Produces: `seedMedia(strapi: Core.Strapi): Promise<void>`, exported from `./seed`; a database where three articles have covers, both authors have avatars, and six files exist in the Media Library.

Read `src/seed/enrich.ts` first — it already solves the draft-vs-published problem this task also has, and its logging style (`strapi.log.info` with a `[seed]` prefix) is the one to match.

- [ ] **Step 1: Add the manifest data**

Append to `src/seed/data.ts`:

```ts
/** Files in assets/media/, uploaded on bootstrap. Alt text is set at upload. */
export const MEDIA = [
  { file: 'cover-schema.jpg', alt: 'Abstract photograph standing in for a database schema article' },
  { file: 'cover-modeling.jpg', alt: 'Abstract photograph standing in for a content modeling article' },
  { file: 'cover-css.jpg', alt: 'Abstract photograph standing in for an article about CSS' },
  { file: 'figure-components.jpg', alt: 'Photograph illustrating reusable components' },
  { file: 'avatar-asim.jpg', alt: 'Portrait of Asim Raza' },
  { file: 'avatar-hassan.jpg', alt: 'Portrait of Hassan' },
];

/** Which uploaded file becomes which entry's cover. */
export const ARTICLE_COVERS: Record<string, string> = {
  'why-your-database-schema-is-your-real-api': 'cover-schema.jpg',
  'practical-guide-to-content-modeling': 'cover-modeling.jpg',
  'css-has-quietly-become-a-good-language': 'cover-css.jpg',
  // 'build-a-blog-frontend-in-an-afternoon' is deliberately left coverless.
};

/** Which uploaded file becomes which author's avatar, keyed by email. */
export const AUTHOR_AVATARS: Record<string, string> = {
  'ada@example.com': 'avatar-asim.jpg',
  'milo@example.com': 'avatar-hassan.jpg',
};
```

Note the author keys are the seed emails. The live database has renamed authors but their emails are unchanged — Step 5 verifies that assumption against the API rather than trusting it.

- [ ] **Step 2: Write the uploader**

`src/seed/media.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';
import type { Core } from '@strapi/strapi';
import { ARTICLE_COVERS, AUTHOR_AVATARS, MEDIA } from './data';

const MEDIA_DIR = path.resolve(__dirname, '../../assets/media');

interface UploadedFile {
  id: number;
  name: string;
  url: string;
}

/**
 * Uploads a file once and returns its record, reusing an existing upload when
 * one with the same name is already in the Media Library.
 *
 * The upload service expects `originalFilename` (not `originalFileName`), and
 * creates and cleans up its own temp working directory.
 */
async function uploadOnce(strapi: Core.Strapi, file: string, alt: string): Promise<UploadedFile | null> {
  const existing = await strapi.db
    .query('plugin::upload.file')
    .findOne({ where: { name: file } });

  if (existing) {
    return existing as UploadedFile;
  }

  const filepath = path.join(MEDIA_DIR, file);

  if (!fs.existsSync(filepath)) {
    strapi.log.warn(`[seed] media file missing, skipping: ${filepath}`);
    return null;
  }

  const [uploaded] = await strapi.plugin('upload').service('upload').upload({
    data: { fileInfo: { name: file, alternativeText: alt } },
    files: {
      filepath,
      originalFilename: file,
      mimetype: 'image/jpeg',
      size: fs.statSync(filepath).size,
    },
  });

  strapi.log.info(`[seed] uploaded ${file}`);
  return uploaded as UploadedFile;
}

/**
 * Uploads the demo photographs and links them to articles and authors.
 *
 * Idempotent throughout: files are uploaded once by name, and a cover or avatar
 * is only set where the field is currently null, so an editor's chosen image is
 * never replaced. Running bootstrap twice uploads nothing and changes nothing.
 */
export async function seedMedia(strapi: Core.Strapi): Promise<void> {
  const files = new Map<string, UploadedFile>();

  for (const { file, alt } of MEDIA) {
    const uploaded = await uploadOnce(strapi, file, alt);
    if (uploaded) {
      files.set(file, uploaded);
    }
  }

  const articles = await strapi.documents('api::article.article').findMany({
    populate: { cover: true },
    status: 'published',
  });

  for (const article of articles) {
    const wanted = article.slug ? ARTICLE_COVERS[article.slug] : undefined;
    const file = wanted ? files.get(wanted) : undefined;

    if (!file || article.cover) {
      continue;
    }

    // Same hazard as enrichExistingArticles: publish() promotes the whole
    // draft, so an article with unpublished work-in-progress is left alone
    // rather than having that work published on the editor's behalf.
    const draft = await strapi.documents('api::article.article').findOne({
      documentId: article.documentId,
      status: 'draft',
    });

    if (draft && new Date(draft.updatedAt) > new Date(article.updatedAt)) {
      strapi.log.info(`[seed] skipped cover for '${article.slug}': it has unpublished draft changes`);
      continue;
    }

    await strapi.documents('api::article.article').update({
      documentId: article.documentId,
      data: { cover: file.id },
    });
    await strapi.documents('api::article.article').publish({
      documentId: article.documentId,
    });

    strapi.log.info(`[seed] set cover for '${article.slug}'`);
  }

  const authors = await strapi.documents('api::author.author').findMany({
    populate: { avatar: true },
  });

  for (const author of authors) {
    const wanted = author.email ? AUTHOR_AVATARS[author.email] : undefined;
    const file = wanted ? files.get(wanted) : undefined;

    if (!file || author.avatar) {
      continue;
    }

    // Authors have draft-and-publish off, so a plain update is the whole story.
    await strapi.documents('api::author.author').update({
      documentId: author.documentId,
      data: { avatar: file.id },
    });

    strapi.log.info(`[seed] set avatar for '${author.email}'`);
  }
}
```

- [ ] **Step 3: Export and wire into bootstrap**

Add to `src/seed/index.ts`:

```ts
export { seedMedia } from './media';
```

In `src/index.ts`, add `seedMedia` to the import and call it **after `seedBlog` and BEFORE `enrichExistingArticles`**:

```ts
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seedBlog(strapi);
    await seedMedia(strapi);
    await enrichExistingArticles(strapi);
    await seedSiteSettings(strapi);
    await grantPublicReadAccess(strapi);
    await registerIsrWebhook(strapi);
  },
```

The order matters and is not arbitrary. `seedMedia` needs articles to exist, so it must follow `seedBlog`. And Task 3 extends `enrichExistingArticles` to build an image block that references an uploaded file's numeric id — which does not exist until `seedMedia` has run. Putting `seedMedia` after the enrichment would leave a fresh database with no image block, and the failure would be silent.

- [ ] **Step 4: Restart and verify the upload ran**

```bash
./scripts/restart-dev.sh
grep -E "\[seed\]" /tmp/strapi.log
```

Expected: six `uploaded …` lines, three `set cover for …` lines, and two `set avatar for …` lines.

Now the idempotency check that matters — restart again:

```bash
./scripts/restart-dev.sh
grep -E "\[seed\]" /tmp/strapi.log
```

Expected: **no** `uploaded`, `set cover`, or `set avatar` lines at all. If anything uploads twice, a guard is wrong — fix it rather than accepting it, and check `public/uploads/` for duplicate files.

- [ ] **Step 5: Verify against the API, including the author-email assumption**

```bash
curl -sg "http://localhost:1337/api/articles?populate[cover]=true" \
  | grep -o '"url":"/uploads/[^"]*"' | sort -u
curl -sg "http://localhost:1337/api/authors?populate[avatar]=true" \
  | grep -o '"email":"[^"]*"\|"url":"/uploads/[^"]*"'
ls public/uploads | head
```

Expected: three distinct cover URLs; both authors showing an email and an avatar URL; and `public/uploads` containing the originals plus `thumbnail_`, `small_`, `medium_`, `large_` derivatives generated by sharp.

If the authors have different emails than the seed data assumes, the avatars will not link. In that case update `AUTHOR_AVATARS` to the emails the API actually returns, and say so in your report.

- [ ] **Step 6: Confirm the existing suites still pass**

```bash
./scripts/verify-blog-api.sh
./scripts/verify-content-model.sh
```

Expected: both all-pass, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/seed src/index.ts
git commit -m "feat(cms): upload demo media on bootstrap and link covers and avatars"
```

---

### Task 3: The image block component

**Files:**
- Create: `src/components/blocks/image.json`
- Modify: `src/api/article/content-types/article/schema.json` (dynamic zone list only)
- Modify: `src/seed/data.ts` (append the block to `DEMO_BODY`)

**Interfaces:**
- Consumes: `blocks.*` components and the `body` dynamic zone from the content-modelling slice; the uploaded figure file from Task 2.
- Produces: component UID `blocks.image` with fields `image`, `caption`, `credit`; a demo article body that includes one.

- [ ] **Step 1: Create the component**

`src/components/blocks/image.json`:

```json
{
  "collectionName": "components_blocks_images",
  "info": { "displayName": "Image", "icon": "picture" },
  "options": {},
  "attributes": {
    "image": {
      "type": "media",
      "multiple": false,
      "required": true,
      "allowedTypes": ["images"]
    },
    "caption": { "type": "string" },
    "credit": { "type": "string" }
  }
}
```

- [ ] **Step 2: Add it to the dynamic zone**

In `src/api/article/content-types/article/schema.json`, extend the `body.components` array to include `"blocks.image"`. Change nothing else in that file:

```json
      "components": [
        "blocks.rich-text",
        "blocks.pull-quote",
        "blocks.callout",
        "blocks.code",
        "blocks.image"
      ]
```

- [ ] **Step 3: Restart and confirm the component registers**

```bash
./scripts/restart-dev.sh
grep -iE "error" /tmp/strapi.log | head -5
curl -s http://localhost:1337/api/articles > /dev/null && echo "API alive"
```

Expected: no schema errors and `API alive`. A malformed component JSON stops Strapi from booting, so this step catches it immediately.

- [ ] **Step 4: Append the figure to the demo body**

The demo article's `body` was set by `enrichExistingArticles`, which only writes when `body` is empty — so appending to `DEMO_BODY` alone will NOT update the existing article. Add the block to the array in `src/seed/data.ts` so fresh databases get it:

```ts
  {
    __component: 'blocks.image',
    file: 'figure-components.jpg',
    caption: 'A component is defined once and reused across content types.',
    credit: 'Lorem Picsum',
  },
```

This entry carries `file`, not `image`: seed data cannot know the uploaded file's numeric id. Task 3's next step resolves it.

- [ ] **Step 5: Teach the enrichment to resolve and append the image block**

Two problems to solve at once. A fresh database needs `file` turned into a real media id, and the EXISTING demo article already has a body — so the current `if (body is empty)` guard means it would never receive the new block. Both are handled by one addition to `src/seed/enrich.ts`.

Add this helper above `enrichExistingArticles`:

```ts
/**
 * Turns seed blocks carrying `file` into real blocks carrying an uploaded
 * media id. A block whose file is missing from the Media Library is dropped
 * rather than written with no image, since `image` is required.
 */
async function resolveBlockMedia(
  strapi: Core.Strapi,
  blocks: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const resolved: Array<Record<string, unknown>> = [];

  for (const block of blocks) {
    if (typeof block.file !== 'string') {
      resolved.push(block);
      continue;
    }

    const { file, ...rest } = block;
    const uploaded = await strapi.db
      .query('plugin::upload.file')
      .findOne({ where: { name: file } });

    if (!uploaded) {
      strapi.log.warn(`[seed] no uploaded media named '${file}', dropping its block`);
      continue;
    }

    resolved.push({ ...rest, image: uploaded.id });
  }

  return resolved;
}
```

Then, inside the article loop, replace the existing body assignment with this pair of branches:

```ts
    const currentBody = (article.body ?? []) as Array<Record<string, unknown>>;

    if (article.slug === DEMO_BODY_SLUG && currentBody.length === 0) {
      data.body = await resolveBlockMedia(strapi, DEMO_BODY);
    } else if (
      article.slug === DEMO_BODY_SLUG &&
      !currentBody.some((block) => block.__component === 'blocks.image')
    ) {
      // The demo article predates the image block. Append just that block
      // rather than rewriting a body an editor may have changed. Guarded on
      // the block's absence, so a second run appends nothing.
      const figure = await resolveBlockMedia(
        strapi,
        DEMO_BODY.filter((block) => block.__component === 'blocks.image'),
      );

      if (figure.length > 0) {
        data.body = [...currentBody, ...figure];
      }
    }
```

Make sure `body` is populated in the function's `findMany` call so `currentBody` is real rather than always empty — it already is from the previous slice, but confirm it.

- [ ] **Step 6: Restart and verify both paths**

```bash
./scripts/restart-dev.sh
grep -E "\[seed\]" /tmp/strapi.log
curl -sg "http://localhost:1337/api/articles?populate[body][populate]=*" \
  | grep -o '"__component":"blocks.image"' | wc -l
```

Expected: an `Enriched 'practical-guide-to-content-modeling': body` line on this first run, and exactly `1` image block.

Restart once more — the idempotency check:

```bash
./scripts/restart-dev.sh
grep -cE "Enriched" /tmp/strapi.log
curl -sg "http://localhost:1337/api/articles?populate[body][populate]=*" \
  | grep -o '"__component":"blocks.image"' | wc -l
```

Expected: `0` enrichment lines and still exactly `1` image block. Two blocks means the append guard is wrong — fix it rather than accepting it.

- [ ] **Step 7: Commit**

```bash
git add src/components/blocks/image.json src/api/article/content-types/article/schema.json src/seed
git commit -m "feat(cms): add an image block to the article body dynamic zone"
```

---

### Task 4: Frontend media layer

**Files:**
- Create: `frontend/lib/media.ts`
- Modify: `frontend/lib/types.ts`
- Modify: `frontend/lib/strapi.ts` (populate only)
- Modify: `frontend/next.config.ts`
- Test: `frontend/lib/media.test.ts`

**Interfaces:**
- Consumes: the API shape from Tasks 2-3.
- Produces, from `@/lib/media`: `imageUrl(media, format?): string | null` and `imageAlt(media, fallback): string`. From `@/lib/types`: `StrapiImage`, `StrapiImageFormat`, plus `cover` on `Article`, `avatar` on `Author`, and a `blocks.image` member of the `Block` union.

- [ ] **Step 1: Add the types**

Append to `frontend/lib/types.ts`:

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
```

Add `cover?: StrapiImage | null;` to `Article`, `avatar?: StrapiImage | null;` to `Author`, and this member to the `Block` union:

```ts
  | {
      __component: 'blocks.image';
      id: number;
      image: StrapiImage | null;
      caption: string | null;
      credit: string | null;
    }
```

- [ ] **Step 2: Write the failing test**

`frontend/lib/media.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { imageAlt, imageUrl } from '@/lib/media';
import type { StrapiImage } from '@/lib/types';

const image = (overrides: Partial<StrapiImage> = {}): StrapiImage => ({
  id: 1,
  url: '/uploads/cover_abc.jpg',
  alternativeText: 'A cover',
  width: 1600,
  height: 900,
  formats: {
    thumbnail: { url: '/uploads/thumbnail_cover_abc.jpg', width: 245, height: 138 },
    small: { url: '/uploads/small_cover_abc.jpg', width: 500, height: 281 },
  },
  ...overrides,
});

beforeEach(() => {
  process.env.STRAPI_URL = 'http://cms.test';
});

afterEach(() => {
  delete process.env.STRAPI_URL;
});

describe('imageUrl', () => {
  it('resolves a relative upload path against STRAPI_URL', () => {
    // The local provider returns relative paths, which would otherwise resolve
    // against the Next server and 404.
    expect(imageUrl(image())).toBe('http://cms.test/uploads/cover_abc.jpg');
  });

  it('returns the requested derivative when it exists', () => {
    expect(imageUrl(image(), 'small')).toBe('http://cms.test/uploads/small_cover_abc.jpg');
  });

  it('falls back to the original when the derivative is missing', () => {
    expect(imageUrl(image(), 'enormous')).toBe('http://cms.test/uploads/cover_abc.jpg');
  });

  it('falls back to the original when there are no formats at all', () => {
    expect(imageUrl(image({ formats: null }), 'small')).toBe('http://cms.test/uploads/cover_abc.jpg');
  });

  it('passes an already-absolute URL through untouched', () => {
    // A remote provider (S3, Cloudinary) returns absolute URLs; switching to
    // one must need no change here.
    const remote = image({ url: 'https://cdn.example.com/cover.jpg', formats: null });
    expect(imageUrl(remote)).toBe('https://cdn.example.com/cover.jpg');
  });

  it('returns null for absent media', () => {
    expect(imageUrl(null)).toBeNull();
    expect(imageUrl(undefined)).toBeNull();
  });
});

describe('imageAlt', () => {
  it('prefers the media alternativeText', () => {
    expect(imageAlt(image(), 'Fallback')).toBe('A cover');
  });

  it('falls back when alternativeText is null or empty', () => {
    expect(imageAlt(image({ alternativeText: null }), 'Fallback')).toBe('Fallback');
    expect(imageAlt(image({ alternativeText: '' }), 'Fallback')).toBe('Fallback');
  });

  it('falls back for absent media', () => {
    expect(imageAlt(null, 'Fallback')).toBe('Fallback');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test -- media.test.ts`
Expected: FAIL — cannot resolve `@/lib/media`.

- [ ] **Step 4: Write the implementation**

`frontend/lib/media.ts`:

```ts
import type { StrapiImage } from '@/lib/types';

const baseUrl = () => process.env.STRAPI_URL ?? 'http://localhost:1337';

/**
 * Resolves a Strapi media URL, optionally picking a generated derivative.
 *
 * The local upload provider returns RELATIVE paths (`/uploads/…`), which would
 * resolve against the Next server rather than Strapi. Absolute URLs — what a
 * remote provider returns — pass through untouched, so swapping providers needs
 * no change here.
 */
export function imageUrl(
  media: StrapiImage | null | undefined,
  format?: string,
): string | null {
  if (!media) {
    return null;
  }

  const chosen = (format && media.formats?.[format]?.url) || media.url;

  return /^https?:\/\//.test(chosen) ? chosen : `${baseUrl()}${chosen}`;
}

/** An `alt` attribute is never empty: falls back to the caller's text. */
export function imageAlt(media: StrapiImage | null | undefined, fallback: string): string {
  return media?.alternativeText || fallback;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS — the 53 existing tests plus 9 new ones (62).

- [ ] **Step 6: Configure next/image**

Replace `frontend/next.config.ts`:

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    // Strapi's local upload provider serves files from its own origin. Without
    // this, next/image refuses the URL outright rather than rendering it.
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost', port: '1337', pathname: '/uploads/**' },
    ],
  },
};

export default nextConfig;
```

- [ ] **Step 7: Populate the media, verifying each query live**

This is the step most likely to fail quietly: a wrong populate returns 200 with the image silently absent. Check each query against the running API BEFORE editing the code, and report the actual status codes you saw:

```bash
curl -sg -o /dev/null -w 'cover:  %{http_code}\n' "http://localhost:1337/api/articles?populate[cover]=true"
curl -sg -o /dev/null -w 'avatar: %{http_code}\n' "http://localhost:1337/api/articles?populate[author][populate][avatar]=true"
curl -sg "http://localhost:1337/api/articles?populate[author][populate][avatar]=true" | grep -c '"avatar"'
```

The nested author-avatar form is a HYPOTHESIS: the previous slice proved `populate[author]=*` returns 400 because the wildcard deep-populates the author's media. If the nested form also fails, find one that works — try `populate[author][populate]=avatar` — and use whatever the API actually accepts. Report which form you used and why.

Then update `frontend/lib/strapi.ts`, keeping every existing tag and comment exactly as they are and changing only query strings:

- `getArticles`: add `populate[cover]=true` and the author-avatar form you verified.
- `getArticleBySlug`: add the same two. Its `populate[body][populate]=*` already reaches the image block's media.
- `getCategoryBySlug`: add `populate[articles][populate][cover]=true`.

Update the populate assertions in `frontend/lib/strapi.test.ts` to match: `getArticles` must now assert `populate[cover]` is present while still asserting `populate[body]` is absent.

- [ ] **Step 8: Typecheck, test, and commit**

```bash
cd frontend && npx tsc --noEmit && npm test
cd /home/asim/strapi-cms
git add frontend/lib frontend/next.config.ts
git commit -m "feat(frontend): resolve Strapi media URLs and populate covers and avatars"
```

---

### Task 5: Render images

**Files:**
- Create: `frontend/components/CoverImage.tsx`
- Modify: `frontend/components/Blocks.tsx` (add the image case)
- Modify: `frontend/components/HeroArticle.tsx`, `frontend/components/ArticleCard.tsx`, `frontend/components/Byline.tsx`
- Modify: `frontend/app/articles/[slug]/page.tsx`

**Interfaces:**
- Consumes: `imageUrl`, `imageAlt` from `@/lib/media`; `StrapiImage`, `Block` from `@/lib/types`.
- Produces: `<CoverImage media={StrapiImage | null | undefined} alt={string} format={string} priority={boolean} />`, used by the hero, cards, and article page.

- [ ] **Step 1: Write the shared cover component**

`frontend/components/CoverImage.tsx`:

```tsx
import Image from 'next/image';
import { imageAlt, imageUrl } from '@/lib/media';
import type { StrapiImage } from '@/lib/types';

/**
 * Renders a 16:9 cover, or nothing at all when the media is absent — every
 * image on this site is optional, and a missing one falls back to the
 * text-only layout rather than a broken frame.
 */
export function CoverImage({
  media,
  alt,
  format,
  priority = false,
  sizes,
}: {
  media: StrapiImage | null | undefined;
  alt: string;
  format?: string;
  priority?: boolean;
  sizes: string;
}) {
  const src = imageUrl(media, format);

  if (!src) {
    return null;
  }

  return (
    <div className="relative mt-5 aspect-[16/9] w-full overflow-hidden border border-rule">
      <Image
        src={src}
        alt={imageAlt(media, alt)}
        fill
        sizes={sizes}
        priority={priority}
        className="object-cover"
      />
    </div>
  );
}
```

- [ ] **Step 2: Add the image block to the renderer**

In `frontend/components/Blocks.tsx`, add `'blocks.image': 'image'` to the `KNOWN` map, and this case to the switch:

```tsx
          case 'blocks.image': {
            const src = imageUrl(block.image);
            if (!src) {
              console.warn('[blocks] image block has no populated media, skipping');
              return null;
            }
            return (
              <figure key={key} className="mt-10">
                <div className="relative aspect-[16/9] w-full overflow-hidden border border-rule">
                  <Image
                    src={src}
                    alt={imageAlt(block.image, block.caption ?? 'Article image')}
                    fill
                    sizes="(max-width: 680px) 100vw, 68ch"
                    className="object-cover"
                  />
                </div>
                {block.caption && <figcaption className="mt-3 text-base">{block.caption}</figcaption>}
                {block.credit && (
                  <p className="font-display mt-1 text-xs uppercase tracking-widest text-accent">
                    {block.credit}
                  </p>
                )}
              </figure>
            );
          }
```

Import `Image` from `next/image` and `imageAlt`, `imageUrl` from `@/lib/media` at the top of the file.

- [ ] **Step 3: Put covers on the hero, the cards, and the article page**

In `HeroArticle.tsx`, render the cover BELOW the headline and above the excerpt, matching the reference layout:

```tsx
      <CoverImage
        media={article.cover}
        alt={article.title}
        priority
        sizes="(max-width: 1024px) 100vw, 66vw"
      />
```

In `ArticleCard.tsx`, render it ABOVE the headline, using the `small` derivative:

```tsx
      <CoverImage
        media={article.cover}
        alt={article.title}
        format="small"
        sizes="(max-width: 768px) 100vw, 33vw"
      />
```

In `frontend/app/articles/[slug]/page.tsx`, render it after the byline block and before the body:

```tsx
      <CoverImage
        media={article.cover}
        alt={article.title}
        priority
        sizes="(max-width: 680px) 100vw, 68ch"
      />
```

Import `CoverImage` from `@/components/CoverImage` in each.

- [ ] **Step 4: Put avatars on bylines**

In `frontend/components/Byline.tsx`, render a round avatar before the author name when one exists. Replace the returned paragraph with:

```tsx
  const avatar = imageUrl(author?.avatar, 'thumbnail');

  return (
    <p className="font-display flex items-center gap-2 text-sm uppercase tracking-widest">
      {avatar && (
        <Image
          src={avatar}
          alt={imageAlt(author?.avatar, author?.name ?? 'Author')}
          width={28}
          height={28}
          className="rounded-full object-cover"
        />
      )}
      <span className="text-accent">{author?.name ?? 'The Strapi Press'}</span>
      <span className="text-ink"> — {formatStamp(date)}</span>
    </p>
  );
```

Import `Image` from `next/image` and `imageAlt`, `imageUrl` from `@/lib/media`. The avatar circle is the ONLY rounded corner permitted in this design.

- [ ] **Step 5: Verify every path in the browser**

With Strapi running, start the dev server on a free port 3000 and check all four cases:

```bash
curl -s http://localhost:3000/ | grep -c '/_next/image'
curl -s http://localhost:3000/articles/practical-guide-to-content-modeling | grep -c '/_next/image'
curl -s -o /dev/null -w 'coverless article: %{http_code}\n' http://localhost:3000/articles/build-a-blog-frontend-in-an-afternoon
curl -s http://localhost:3000/articles/build-a-blog-frontend-in-an-afternoon | grep -c '/_next/image'
```

Expected: several `/_next/image` occurrences on the home page and the demo article (proving `next/image` accepted the remote pattern), `200` for the coverless article, and — on that coverless article — a count that reflects only its avatar, not a cover. Report the actual numbers.

Then open the home page in a browser and confirm the hero image sits below the headline and cards show images above their headlines. Stop the dev server when done.

- [ ] **Step 6: Typecheck, test, and commit**

```bash
cd frontend && npx tsc --noEmit && npm test
cd /home/asim/strapi-cms
git add frontend/components frontend/app
git commit -m "feat(frontend): render covers, avatars, and figure blocks"
```

---

### Task 6: Verification and documentation

**Files:**
- Create: `scripts/verify-media.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: an executable script matching the existing verification scripts' PASS/FAIL shape.

Read `scripts/verify-content-model.sh` first and reuse its `check` helper, table, and exit convention. Note that bracketed populate queries need `curl -g`.

- [ ] **Step 1: Write the script**

`scripts/verify-media.sh`:

```bash
#!/usr/bin/env bash
# Verifies the media pipeline: uploads, derivatives, and the links from
# articles and authors to their images.
# Requires the dev server to be running: ./scripts/restart-dev.sh
set -u

BASE="http://localhost:1337"
fail=0

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-46s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-46s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/articles")" != "000" ]; then
    break
  fi
  sleep 1
done

echo "Media verification"

# Deliberately NOT probing /api/upload/files: it is not public, so asserting
# against it would fail for the wrong reason or tempt someone into widening
# public permissions to make a test pass. Populated relations prove the upload.
covers=$(curl -sg "$BASE/api/articles?populate[cover]=true")

check "exactly three articles carry a cover" \
  "$(echo "$covers" | grep -o '"url":"/uploads/[^"]*"' | sort -u | wc -l | tr -d ' ')" "3"
check "a cover exposes the thumbnail derivative" \
  "$([ "$(echo "$covers" | grep -c '"thumbnail"')" -ge 1 ] && echo yes || echo no)" "yes"
check "a cover exposes the small derivative" \
  "$([ "$(echo "$covers" | grep -c '"small"')" -ge 1 ] && echo yes || echo no)" "yes"
check "covers carry alternative text" \
  "$([ "$(echo "$covers" | grep -c '"alternativeText":"[^"]')" -ge 1 ] && echo yes || echo no)" "yes"

authors=$(curl -sg "$BASE/api/authors?populate[avatar]=true")
check "both authors have an avatar" \
  "$(echo "$authors" | grep -o '"url":"/uploads/[^"]*"' | sort -u | wc -l | tr -d ' ')" "2"

blocks=$(curl -sg "$BASE/api/articles?populate[body][populate]=*")
check "an image block exists in an article body" \
  "$([ "$(echo "$blocks" | grep -c '"__component":"blocks.image"')" -ge 1 ] && echo yes || echo no)" "yes"

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
chmod +x scripts/verify-media.sh
./scripts/verify-media.sh
```

Expected: every check PASS, exit 0. If the image-block check fails because Task 3 could not add the block to the existing article, say so plainly in your report rather than deleting the check — a check removed to make a suite green is worse than a failing one.

- [ ] **Step 3: Document it**

Add `./scripts/verify-media.sh` to the README's verification list, and add this section after the content-model section:

```markdown
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
```

- [ ] **Step 4: Run the full suite**

Run these ONE AT A TIME, never concurrently: `verify-isr.sh` and `verify-stripe.sh` both need port 3000, and running them together produces a confusing false failure.

```bash
cd /home/asim/strapi-cms/frontend && npm test && npx tsc --noEmit
cd /home/asim/strapi-cms
./scripts/verify-blog-api.sh
./scripts/verify-content-model.sh
./scripts/verify-media.sh
./scripts/verify-stripe.sh
./scripts/verify-isr.sh
```

Expected: all green. `verify-isr.sh` matters most — cards changed shape and the production build now processes images, which is where a bad `next.config.ts` or an unreachable image URL surfaces.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-media.sh README.md
git commit -m "test: verify the media pipeline and document it"
```

---

## Self-Review Notes

Spec coverage checked section by section: acquisition and the manifest (Task 1), upload on bootstrap with its idempotency and draft guard (Task 2), the `blocks.image` component (Task 3), `next/image` configuration, the media helpers, and population (Task 4), layout per the reference (Task 5), error handling (Task 4's null cases, Task 5's early returns, Task 3's warning path), testing and acceptance criteria (Task 6).

Three things the plan makes explicit because they fail silently rather than loudly: the author-avatar populate form is labelled a hypothesis with instructions to find one that works (Task 4, step 7); the existing demo article will NOT pick up the new image block from seed data alone, because the enrichment only writes into an empty body (Task 3, steps 4-5); and the upload service field is `originalFilename`, not `originalFileName`, which is recorded in Global Constraints because the wrong spelling silently uploads a file named "unamed".
