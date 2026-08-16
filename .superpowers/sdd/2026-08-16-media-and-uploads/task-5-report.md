# Task 5 report — Render images

Commit: `1a38d21` on branch `feat/media-uploads`.

## Step 1 — CoverImage component

Created `frontend/components/CoverImage.tsx` verbatim from the brief: returns `null` when
`imageUrl(media, format)` is falsy, otherwise a `relative aspect-[16/9] w-full overflow-hidden
border border-rule` wrapper with a `fill` `next/image`.

## Step 2 — blocks.image renderer

`frontend/components/Blocks.tsx`: added `'blocks.image': 'image'` to `KNOWN`, imported `Image`
from `next/image` and `imageAlt`/`imageUrl` from `@/lib/media`, and added the `blocks.image` case
to the switch verbatim from the brief (16:9 frame, caption, credit, `console.warn` + `null` when
unpopulated).

## Step 3 — Covers on hero, cards, article page

- `frontend/components/HeroArticle.tsx`: `<CoverImage>` placed below the `<h1>` link and above the
  excerpt paragraph, `priority`, `sizes="(max-width: 1024px) 100vw, 66vw"`.
- `frontend/components/ArticleCard.tsx`: `<CoverImage>` placed after the kicker and before the
  `<Link><h2>`, `format="small"`, `sizes="(max-width: 768px) 100vw, 33vw"`.
- `frontend/app/articles/[slug]/page.tsx`: `<CoverImage>` placed after the byline `<div>` and
  before the `Blocks`/`Prose` body, `priority`, `sizes="(max-width: 680px) 100vw, 68ch"`.

All three import `CoverImage` from `@/components/CoverImage`.

## Step 4 — Avatars on bylines

`frontend/components/Byline.tsx`: replaced the returned `<p>` with the brief's version — a flex
row with a 28×28 `rounded-full object-cover` `next/image` avatar (via `imageUrl(author?.avatar,
'thumbnail')`) rendered only when present, followed by the name and date spans. This is the only
rounded corner in the design, matching the constraint.

## Step 5 — Verify every path in the browser

**Environment complication (see Deviation below):** a stale `next dev` server was already
occupying port 3000, started at 14:31 — before `next.config.ts`'s `remotePatterns` entry
(committed 15:32) existed for this branch's history in this workspace, and today's build config
lacked `dangerouslyAllowLocalIP`, a knob Next 16 added and *silently* requires in addition to
`remotePatterns` for upstreams that resolve to loopback/private IPs (Strapi at `localhost:1337`
always does in local dev). I killed the stale server by PID (`kill 209900...` for mine later;
`kill 144096 144108 144109` for the stale one — never `pkill -f`), added the config flag, and
started a fresh dev server I owned.

Exact commands from the brief, actual output:

```
$ curl -s http://localhost:3000/ | grep -c '/_next/image'
1
$ curl -s http://localhost:3000/articles/practical-guide-to-content-modeling | grep -c '/_next/image'
1
$ curl -s -o /dev/null -w 'coverless article: %{http_code}\n' http://localhost:3000/articles/build-a-blog-frontend-in-an-afternoon
coverless article: 200
$ curl -s http://localhost:3000/articles/build-a-blog-frontend-in-an-afternoon | grep -c '/_next/image'
1
```

`grep -c` counts matching **lines**, and Next's SSR HTML is emitted as effectively one line, so
these numbers only prove "at least one `/_next/image` occurrence" per page, not real image
counts. I additionally ran `grep -o '/_next/image' | wc -l` for real occurrence counts to satisfy
"report the ACTUAL numbers you observe" and to properly diagnose the coverless case:

```
home:                51 occurrences  (hero cover + N card covers + N byline avatars)
content-modeling:    29 occurrences  (article cover + body figure block + byline avatar)
coverless article:    3 occurrences  (byline avatar only — 1 img src + srcset entries)
```

Diagnosis on the coverless article (`build-a-blog-frontend-in-an-afternoon`):
- `grep -o 'aspect-\[16/9\]' | wc -l` → **0** — no cover frame rendered anywhere on the page.
- `grep -o 'rounded-full' | wc -l` → **2** — the avatar circle (from its `next/image` `className`
  and the CSS module reference), confirming the 3 `/_next/image` hits are the avatar's `src` +
  `srcset` candidates, not a cover.
- HTTP status: `200`, page renders as text-only with headline, byline (with avatar), and body —
  no broken frame.

## Browser check

Used `chrome-devtools` MCP (the `claude-in-chrome` extension wasn't connected) to load
`http://localhost:3000/`, `.../articles/practical-guide-to-content-modeling`, and
`.../articles/build-a-blog-frontend-in-an-afternoon`.

- Home: hero image sits below the headline and above the excerpt; both sidebar cards ("CSS Has
  Quietly Become a Good Language", "Why Your Database Schema Is Your Real API") show their cover
  above the headline; the coverless article's card shows no image, just headline/excerpt/byline.
  Round avatars appear next to every byline. No shadows, no card fills, only the avatar circle is
  rounded.
- `practical-guide-to-content-modeling`: article cover renders after the byline and before the
  body; the trailing `blocks.image` figure renders at the end of the body with its caption
  ("A component is defined once and reused across content types.") and credit ("LOREM PICSUM")
  in the accent color.
- `build-a-blog-frontend-in-an-afternoon` (the deliberately coverless article): renders cleanly
  text-only — headline, byline with avatar, then straight into body content, no gap or broken
  frame where a cover would go.

## Typecheck and tests

```
$ cd frontend && npx tsc --noEmit
(clean, no output)
$ npm test
Test Files  10 passed (10)
     Tests  62 passed (62)
```

Ran both before *and* after the `next.config.ts` change to make sure the config edit didn't
regress anything — same results both times.

## Deviation from the brief

The brief's file list for this task did not include `frontend/next.config.ts`, and the task
context stated it "already allows `localhost:1337/uploads/**`" implying it was already sufficient.
In this environment (Next.js 16.3.1), it was not: Next 16 added a second, independent SSRF guard
(`images.dangerouslyAllowLocalIP`, default `false`) that rejects any upstream image URL whose
hostname resolves to a private/loopback IP, regardless of `remotePatterns`. Since Strapi always
runs on `localhost:1337` in this dev setup, every single image request failed with
`400`/`"url" parameter is not allowed` (via a stale server) and then `500`/`hostname resolved to
private IP` (via a fresh server), for every one of the four render paths in Step 5, until this
was set. I added:

```ts
images: {
  remotePatterns: [...],       // unchanged
  dangerouslyAllowLocalIP: true,
}
```

with a comment explaining why. This is scoped to `frontend/next.config.ts` (not `src/` or
Strapi's `config/`, which were left untouched per the global constraints), is required for any of
the four Step 5 checks to actually pass visually rather than just structurally, and is safe because
`remotePatterns` still restricts the allowed host, port, and path. I committed it alongside the
Files-list changes since without it the feature this task implements cannot be verified as
working in this environment.

Also: the pre-existing dev server occupying port 3000 (started before this task, in fact before
`next.config.ts`'s `remotePatterns` was committed) was stopped by PID before starting my own, per
the instruction to keep port 3000 free and to never use a `pkill -f` pattern. My own server was
likewise stopped by PID (`kill 209900 209964 209965`) at the end; Strapi on :1337 was left running
throughout and was never touched.

## Anything a reviewer should check

- Confirm `dangerouslyAllowLocalIP: true` in `frontend/next.config.ts` is acceptable for this
  repo's environments — it's scoped by the existing `remotePatterns` allowlist
  (`localhost:1337/uploads/**`), so it doesn't open image proxying to arbitrary hosts, but it's a
  deviation from the literal Files list and worth a second look given it touches build config.
  If a future Strapi deployment target is a public host rather than `localhost`, this flag becomes
  a no-op for that origin (the private-IP check simply won't trigger), so no further action would
  be needed there.
- `frontend/components/ArticleCard.tsx`: the cover is placed after the kicker and before the
  `<Link><h2>` — i.e., above the headline but below an optional kicker line. The brief said "ABOVE
  the headline" without specifying kicker ordering; this reads naturally in the screenshot (kicker
  as a small label, then image, then headline) but flag if a different order was intended.
  Same reasoning applies to `HeroArticle.tsx`, where the cover sits below the headline `<Link>`
  and above the excerpt, matching the brief's explicit instruction exactly.
- Coverless article verification: confirmed via HTTP status (200), real occurrence counts
  (3, from the avatar only), zero `aspect-[16/9]` frames, and a full-page screenshot. This is the
  most safety-critical check per the task instructions and it passed cleanly.

## Fix round 1 — scope `dangerouslyAllowLocalIP` to a loopback upstream

**Finding:** `dangerouslyAllowLocalIP: true` was set unconditionally in `frontend/next.config.ts`.
The flag is genuinely required — Next 16's SSRF guard rejects any image upstream that resolves to
a private/loopback IP, and `localhost:1337` always does — but shipping it unconditionally means it
would still be set in production, where Strapi is not on loopback, buying nothing and sitting as a
dangling exception waiting for `remotePatterns` to be loosened later.

**Rejected fix:** gating on `NODE_ENV === 'development'` was explicitly avoided. `scripts/verify-isr.sh`
and `scripts/verify-stripe.sh` both run real production builds (`npm run build && npm run start`)
against Strapi on `localhost:1337`. A `NODE_ENV` gate would turn the flag off exactly when those
scripts run; images would fail to optimize, and because `verify-isr.sh` asserts on render stamps
rather than images, nothing would report the breakage.

**Actual fix:** derive the flag from the configured Strapi upstream instead of the environment:

```ts
const strapiUrl = process.env.STRAPI_URL ?? 'http://localhost:1337';
const strapiIsLoopback = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/.test(strapiUrl);
```

...then `dangerouslyAllowLocalIP: strapiIsLoopback`. The comment above the flag was rewritten to
explain that the loopback exception applies precisely when the configured upstream is itself
loopback, and disappears on its own once Strapi is remote — so it can't be forgotten in a
production config.

`remotePatterns`'s `hostname: 'localhost', port: '1337'` was left hardcoded rather than derived
from `STRAPI_URL` via `new URL()`: that would require handling implicit port defaulting (`http://`
→ 80, `https://` → 443) for a value that isn't part of the SSRF finding — `remotePatterns` is
already a separate, correctly scoped allowlist. Not worth the added indirection for this fix.

### Verification

1. Typecheck — clean:
   ```
   $ cd frontend && npx tsc --noEmit
   (no output, exit 0)
   ```

2. Tests — 62/62 pass:
   ```
   $ cd frontend && npm test
    Test Files  10 passed (10)
         Tests  62 passed (62)
   ```

3. Flag evaluates correctly for both upstream cases:
   ```
   $ node -e "... same regex ..."
   current STRAPI_URL: http://localhost:1337 -> dangerouslyAllowLocalIP = true
   $ STRAPI_URL=https://cms.example.com node -e "..."
   STRAPI_URL=https://cms.example.com -> dangerouslyAllowLocalIP = false
   ```

4. Production build + start, images still render (the case this gate could break):
   ```
   $ npm run build            # succeeded, 12 routes generated
   $ npm run start &          # Ready in 371ms on :3000
   $ curl -s http://localhost:3000/ | grep -o '/_next/image' | wc -l
   51
   $ curl -s -o /dev/null -w '%{http_code}' \
       'http://localhost:3000/_next/image?url=http%3A%2F%2Flocalhost%3A1337%2Fuploads%2Fcover_modeling_67719d28c5.jpg&w=3840&q=75'
   200
   ```
   Server stopped by PID afterward (the `npm run start` PID is a wrapper; the actual
   `next-server` child process required a separate `kill`). Confirmed port 3000 free via
   connection-refused on retry.
