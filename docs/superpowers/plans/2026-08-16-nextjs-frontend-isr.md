# Next.js Frontend with ISR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js App Router frontend for the existing Strapi blog that prerenders every article and category page, refreshes them on a 60-second window, and invalidates them precisely and immediately when Strapi fires a webhook.

**Architecture:** A self-contained Next app in `frontend/` talks to Strapi's public REST API through one typed fetch wrapper that owns all cache tags. Routes prerender via `generateStaticParams` with `export const revalidate = 60`. A secret-protected route handler maps Strapi webhook payloads to `revalidateTag` calls, and Strapi registers that webhook itself on bootstrap.

**Tech Stack:** Next.js 16 (App Router, React 19), TypeScript, Tailwind CSS v4, Vitest, `next/font/google` (Spectral, Archivo Narrow). Strapi 5.52.0 unchanged except for webhook registration.

**Spec:** `docs/superpowers/specs/2026-08-16-nextjs-frontend-isr-design.md`

## Global Constraints

- Strapi runs at `http://localhost:1337`, Next at `http://localhost:3000`.
- The Strapi app's `package.json` is never modified. `frontend/` has its own.
- No images anywhere — the seed data has no uploads. Hierarchy is typographic.
- Palette, exact values: paper `#F6F4EF`, body ink `#363737`, headline ink `#161613`, accent `#F2312C`, hairline rule `#DDD9D0`.
- No shadows, no rounded corners, no card fills. Hairlines are the only separator.
- Cache tags are only ever produced by `lib/tags.ts`. No bare tag strings anywhere else.
- Every route sets `export const revalidate = 60` as a literal (Next requires a statically analyzable value).
- `.env.local` is gitignored; `.env.example` is committed.
- Server-only env vars (no `NEXT_PUBLIC_` prefix): `STRAPI_URL`, `REVALIDATE_SECRET`, `REVALIDATE_WINDOW`.

### Deviation from the spec, applied throughout

The spec's verification step 7 assumed the script could edit an article through Strapi's REST API. Public writes return 403 by design (that is itself an acceptance criterion of the previous project), so instead **every page renders a server-side render stamp** — the time the page was last generated — in the footer. Regeneration is then observable and testable without authenticated writes, and it doubles as the visible demonstration of ISR. Task 9 tests invalidation by watching that stamp.

---

### Task 1: Scaffold the frontend app and cache tags

**Files:**
- Create: `frontend/` (via `create-next-app`)
- Create: `frontend/lib/tags.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/.env.example`, `frontend/.env.local`
- Test: `frontend/lib/tags.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `ARTICLES_TAG: string`, `CATEGORIES_TAG: string`, `articleTag(slug: string): string`, `categoryTag(slug: string): string`. Import path `@/lib/tags`.

- [ ] **Step 1: Scaffold the app**

Run from the repo root. The flags make it non-interactive:

```bash
npx create-next-app@latest frontend \
  --ts --tailwind --app --eslint --no-src-dir --turbopack \
  --import-alias "@/*" --use-npm --yes
```

- [ ] **Step 2: Add Vitest**

```bash
cd frontend && npm install -D vitest
```

Create `frontend/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  test: { environment: 'node', include: ['**/*.test.ts'] },
  resolve: { alias: { '@': resolve(__dirname, '.') } },
});
```

Add to `frontend/package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 3: Write the env files**

`frontend/.env.example` (committed) and `frontend/.env.local` (gitignored — verify `.env*.local` is already in `frontend/.gitignore`, create-next-app adds it) both get:

```
STRAPI_URL=http://localhost:1337
REVALIDATE_SECRET=dev-secret-change-me
REVALIDATE_WINDOW=60
```

- [ ] **Step 4: Write the failing test**

`frontend/lib/tags.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ARTICLES_TAG, CATEGORIES_TAG, articleTag, categoryTag } from '@/lib/tags';

describe('cache tags', () => {
  it('names the list tags', () => {
    expect(ARTICLES_TAG).toBe('articles');
    expect(CATEGORIES_TAG).toBe('categories');
  });

  it('namespaces per-entity tags by slug', () => {
    expect(articleTag('css-has-quietly-become-a-good-language')).toBe(
      'article:css-has-quietly-become-a-good-language',
    );
    expect(categoryTag('engineering')).toBe('category:engineering');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `@/lib/tags`.

- [ ] **Step 6: Write the implementation**

`frontend/lib/tags.ts`:

```ts
/**
 * The only place cache tag strings are constructed. Pages tag their data with
 * these; the revalidate route invalidates the same strings. Keeping both sides
 * on one module is what stops a typo from silently disabling revalidation.
 */
export const ARTICLES_TAG = 'articles';
export const CATEGORIES_TAG = 'categories';

export const articleTag = (slug: string): string => `article:${slug}`;
export const categoryTag = (slug: string): string => `category:${slug}`;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 2 tests.

- [ ] **Step 8: Commit**

```bash
cd /home/asim/strapi-cms
git add frontend
git commit -m "feat(frontend): scaffold Next.js app with cache tag helpers"
```

---

### Task 2: Typed Strapi data layer

**Files:**
- Create: `frontend/lib/types.ts`
- Create: `frontend/lib/strapi.ts`
- Test: `frontend/lib/strapi.test.ts`

**Interfaces:**
- Consumes: `@/lib/tags` from Task 1.
- Produces, all from `@/lib/strapi`:
  - `strapiFetch<T>(path: string, opts: { tags: string[] }): Promise<T>`
  - `getArticles(): Promise<Article[]>`
  - `getArticleBySlug(slug: string): Promise<Article | null>`
  - `getCategories(): Promise<Category[]>`
  - `getCategoryBySlug(slug: string): Promise<Category | null>`
- Produces, from `@/lib/types`: `Article`, `Author`, `Category`.

Env is read inside the functions, not at module scope, so tests can change it between cases.

- [ ] **Step 1: Write the types**

`frontend/lib/types.ts`:

```ts
/** Strapi 5 returns flattened attributes — no `attributes` wrapper. */
export interface Author {
  id: number;
  documentId: string;
  name: string;
  email: string;
  bio: string | null;
}

export interface Category {
  id: number;
  documentId: string;
  name: string;
  slug: string;
  description: string | null;
  articles?: Article[];
}

export interface Article {
  id: number;
  documentId: string;
  title: string;
  slug: string;
  excerpt: string | null;
  content: string;
  publishedAt: string;
  author?: Author | null;
  categories?: Category[];
}
```

- [ ] **Step 2: Write the failing test**

`frontend/lib/strapi.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getArticleBySlug, getArticles, strapiFetch } from '@/lib/strapi';

const json = (data: unknown, ok = true, status = 200) =>
  Promise.resolve({ ok, status, json: () => Promise.resolve({ data }) } as Response);

beforeEach(() => {
  process.env.STRAPI_URL = 'http://cms.test';
  process.env.REVALIDATE_WINDOW = '60';
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('strapiFetch', () => {
  it('unwraps the data envelope and forwards tags and the revalidate window', async () => {
    const fetchMock = vi.fn(() => json([{ id: 1 }]));
    vi.stubGlobal('fetch', fetchMock);

    const result = await strapiFetch<{ id: number }[]>('/api/things', { tags: ['things'] });

    expect(result).toEqual([{ id: 1 }]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://cms.test/api/things');
    expect((init as { next: unknown }).next).toEqual({ tags: ['things'], revalidate: 60 });
  });

  it('throws with the status and path when Strapi errors', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json(null, false, 500)));

    await expect(strapiFetch('/api/things', { tags: [] })).rejects.toThrow(
      'Strapi responded 500 for /api/things',
    );
  });
});

describe('queries', () => {
  it('tags an article detail query with both the list and the slug tag', async () => {
    const fetchMock = vi.fn(() => json([{ slug: 'a-post', title: 'A Post' }]));
    vi.stubGlobal('fetch', fetchMock);

    const article = await getArticleBySlug('a-post');

    expect(article?.title).toBe('A Post');
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('filters[slug][$eq]=a-post');
    // Only the slug tag. Adding the list tag here would mean an edit to any
    // article invalidates every other article's page.
    expect((init as { next: { tags: string[] } }).next.tags).toEqual(['article:a-post']);
  });

  it('returns null when no article matches the slug', async () => {
    vi.stubGlobal('fetch', vi.fn(() => json([])));

    expect(await getArticleBySlug('missing')).toBeNull();
  });

  it('sorts the article list newest first', async () => {
    const fetchMock = vi.fn(() => json([]));
    vi.stubGlobal('fetch', fetchMock);

    await getArticles();

    expect(fetchMock.mock.calls[0][0]).toContain('sort=publishedAt:desc');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `@/lib/strapi`.

- [ ] **Step 4: Write the implementation**

`frontend/lib/strapi.ts`:

```ts
import { ARTICLES_TAG, CATEGORIES_TAG, articleTag, categoryTag } from '@/lib/tags';
import type { Article, Category } from '@/lib/types';

const baseUrl = () => process.env.STRAPI_URL ?? 'http://localhost:1337';
const revalidateWindow = () => Number(process.env.REVALIDATE_WINDOW ?? 60);

/**
 * The only function that knows Strapi's URL and response envelope. Callers get
 * plain typed objects and never see `{ data, meta }`.
 */
export async function strapiFetch<T>(path: string, { tags }: { tags: string[] }): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { Accept: 'application/json' },
    next: { tags, revalidate: revalidateWindow() },
  });

  if (!response.ok) {
    throw new Error(`Strapi responded ${response.status} for ${path}`);
  }

  const body = (await response.json()) as { data: T };
  return body.data;
}

export function getArticles(): Promise<Article[]> {
  return strapiFetch<Article[]>('/api/articles?populate=*&sort=publishedAt:desc', {
    tags: [ARTICLES_TAG],
  });
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const matches = await strapiFetch<Article[]>(
    `/api/articles?filters[slug][$eq]=${encodeURIComponent(slug)}&populate=*`,
    // Deliberately not tagged `articles`: a detail page must survive an edit to
    // a different article. The revalidate route invalidates both tags on an
    // edit, which reaches the lists and this page but no sibling pages.
    { tags: [articleTag(slug)] },
  );
  return matches[0] ?? null;
}

export function getCategories(): Promise<Category[]> {
  return strapiFetch<Category[]>('/api/categories?sort=name:asc', { tags: [CATEGORIES_TAG] });
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const matches = await strapiFetch<Category[]>(
    `/api/categories?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      '&populate[articles][populate][author]=true',
    { tags: [CATEGORIES_TAG, categoryTag(slug)] },
  );
  return matches[0] ?? null;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 7 tests total.

- [ ] **Step 6: Verify against the real CMS**

Confirm Strapi is up (`./scripts/restart-dev.sh` from the repo root if not), then check the populate syntax actually returns nested authors — a wrong `populate` returns 200 with missing relations, which no unit test would catch:

```bash
curl -s "http://localhost:1337/api/categories?filters[slug][\$eq]=engineering&populate[articles][populate][author]=true" \
  | grep -o '"name":"[^"]*"' | head
```

Expected: at least one author name (`Ada Okafor` or `Milo Hartley`) in the output.

- [ ] **Step 7: Commit**

```bash
git add frontend/lib
git commit -m "feat(frontend): add typed Strapi data layer with cache tags"
```

---

### Task 3: Design system and layout shell

**Files:**
- Modify: `frontend/app/globals.css` (replace contents)
- Modify: `frontend/app/layout.tsx` (replace contents)
- Create: `frontend/components/Masthead.tsx`
- Create: `frontend/components/CategoryBar.tsx`
- Create: `frontend/components/RenderStamp.tsx`
- Modify: `frontend/app/page.tsx` (temporary placeholder, replaced in Task 4)

**Interfaces:**
- Consumes: `getCategories()` from Task 2.
- Produces: `<Masthead />`, `<CategoryBar categories={Category[]} />`, `<RenderStamp />` (renders `<span data-render-stamp="…ISO…">`), and the Tailwind theme tokens `paper`, `ink`, `headline`, `accent`, `rule`, plus fonts `font-display` and `font-serif`.

The render stamp is the ISR probe. Task 9's script reads `data-render-stamp` out of the HTML, so the attribute name is load-bearing — do not rename it.

- [ ] **Step 1: Write the theme**

Replace `frontend/app/globals.css`:

```css
@import "tailwindcss";

@theme {
  --color-paper: #f6f4ef;
  --color-ink: #363737;
  --color-headline: #161613;
  --color-accent: #f2312c;
  --color-rule: #ddd9d0;

  --font-display: var(--font-archivo-narrow), sans-serif;
  --font-serif: var(--font-spectral), Georgia, serif;
}

body {
  background-color: var(--color-paper);
  color: var(--color-ink);
  font-family: var(--font-serif);
  font-size: 19px;
  line-height: 1.65;
}

/* Headlines are set tight and dark; the serif carries the editorial voice. */
h1, h2, h3 {
  color: var(--color-headline);
  font-family: var(--font-serif);
  font-weight: 800;
  letter-spacing: -0.02em;
  line-height: 1.05;
}
```

- [ ] **Step 2: Write the render stamp**

`frontend/components/RenderStamp.tsx`:

```tsx
/**
 * Prints when this page was last generated. Because pages are statically
 * rendered, the stamp only changes when ISR regenerates the page — which makes
 * revalidation visible to a reader and assertable by scripts/verify-isr.sh.
 */
export function RenderStamp() {
  const now = new Date().toISOString();

  return (
    <span data-render-stamp={now} className="font-display text-xs uppercase tracking-widest">
      Rendered {now.replace('T', ' ').slice(0, 19)} UTC
    </span>
  );
}
```

- [ ] **Step 3: Write the masthead and category bar**

`frontend/components/Masthead.tsx`:

```tsx
import Link from 'next/link';

export function Masthead() {
  return (
    <header className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-5 py-3">
        <Link href="/" className="bg-headline px-3 py-2">
          <span className="font-display text-2xl font-bold uppercase tracking-tight text-paper">
            The Strapi Press
          </span>
        </Link>
        <nav className="font-display flex items-center gap-6 text-sm uppercase tracking-widest">
          <Link href="/" className="hover:text-accent">Home</Link>
          <span className="cursor-default text-accent">Subscribe</span>
        </nav>
      </div>
    </header>
  );
}
```

`frontend/components/CategoryBar.tsx`:

```tsx
import Link from 'next/link';
import type { Category } from '@/lib/types';

export function CategoryBar({ categories }: { categories: Category[] }) {
  return (
    <div className="border-b border-rule">
      <div className="mx-auto flex max-w-6xl gap-8 overflow-x-auto px-5 py-3 whitespace-nowrap">
        {categories.map((category) => (
          <Link
            key={category.slug}
            href={`/categories/${category.slug}`}
            className="font-serif text-xl font-bold text-headline hover:text-accent"
          >
            {category.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire the layout**

Replace `frontend/app/layout.tsx`:

```tsx
import type { Metadata } from 'next';
import { Archivo_Narrow, Spectral } from 'next/font/google';
import { CategoryBar } from '@/components/CategoryBar';
import { Masthead } from '@/components/Masthead';
import { RenderStamp } from '@/components/RenderStamp';
import { getCategories } from '@/lib/strapi';
import './globals.css';

const archivo = Archivo_Narrow({
  subsets: ['latin'],
  weight: ['400', '700'],
  variable: '--font-archivo-narrow',
});

const spectral = Spectral({
  subsets: ['latin'],
  weight: ['400', '700', '800'],
  variable: '--font-spectral',
});

export const metadata: Metadata = {
  title: 'The Strapi Press',
  description: 'Honest. Independent. Statically regenerated.',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const categories = await getCategories();

  return (
    <html lang="en" className={`${archivo.variable} ${spectral.variable}`}>
      <body>
        <Masthead />
        <CategoryBar categories={categories} />
        <main className="mx-auto max-w-6xl px-5 py-10">{children}</main>
        <footer className="mt-16 border-t border-rule">
          <div className="mx-auto flex max-w-6xl justify-between px-5 py-6">
            <span className="font-display text-xs uppercase tracking-widest">
              The Strapi Press
            </span>
            <RenderStamp />
          </div>
        </footer>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Add a temporary home page**

Replace `frontend/app/page.tsx`:

```tsx
export const revalidate = 60;

export default function Home() {
  return <h1 className="text-5xl">The Strapi Press</h1>;
}
```

- [ ] **Step 6: Verify it renders**

With Strapi running, run `cd frontend && npm run dev` and check:

```bash
curl -s http://localhost:3000 | grep -o 'Engineering\|Tutorials\|Opinion\|data-render-stamp' | sort -u
```

Expected: all three category names plus `data-render-stamp`. Stop the dev server afterwards.

- [ ] **Step 7: Commit**

```bash
git add frontend/app frontend/components
git commit -m "feat(frontend): editorial layout shell with masthead and render stamp"
```

---

### Task 4: Home page

**Files:**
- Modify: `frontend/app/page.tsx` (replace the placeholder)
- Create: `frontend/components/Byline.tsx`
- Create: `frontend/components/HeroArticle.tsx`
- Create: `frontend/components/ArticleCard.tsx`

**Interfaces:**
- Consumes: `getArticles()`, `Article` type.
- Produces: `<Byline author={Author | null | undefined} date={string} />`, `<HeroArticle article={Article} />`, `<ArticleCard article={Article} />`.

- [ ] **Step 1: Write the byline**

`frontend/components/Byline.tsx`:

```tsx
import type { Author } from '@/lib/types';

/** Formats an ISO date the way the reference masthead does: 08.16.26 */
export function formatStamp(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCMonth() + 1)}.${pad(date.getUTCDate())}.${String(
    date.getUTCFullYear(),
  ).slice(2)}`;
}

export function Byline({ author, date }: { author?: Author | null; date: string }) {
  return (
    <p className="font-display text-sm uppercase tracking-widest">
      <span className="text-accent">{author?.name ?? 'The Strapi Press'}</span>
      <span className="text-ink"> — {formatStamp(date)}</span>
    </p>
  );
}
```

- [ ] **Step 2: Write the article components**

`frontend/components/HeroArticle.tsx`:

```tsx
import Link from 'next/link';
import { Byline } from '@/components/Byline';
import type { Article } from '@/lib/types';

export function HeroArticle({ article }: { article: Article }) {
  return (
    <article className="border-b border-rule pb-10">
      <Link href={`/articles/${article.slug}`}>
        <h1
          className="uppercase"
          style={{ fontSize: 'clamp(2.75rem, 7vw, 5.5rem)', lineHeight: 0.95 }}
        >
          {article.title}
        </h1>
      </Link>
      {article.excerpt && <p className="mt-5 max-w-2xl text-xl">{article.excerpt}</p>}
      <div className="mt-4">
        <Byline author={article.author} date={article.publishedAt} />
      </div>
    </article>
  );
}
```

`frontend/components/ArticleCard.tsx`:

```tsx
import Link from 'next/link';
import { Byline } from '@/components/Byline';
import type { Article } from '@/lib/types';

export function ArticleCard({ article }: { article: Article }) {
  return (
    <article className="border-t border-rule pt-4">
      <Link href={`/articles/${article.slug}`}>
        <h2 className="text-2xl hover:text-accent">{article.title}</h2>
      </Link>
      {article.excerpt && <p className="mt-2 text-base">{article.excerpt}</p>}
      <div className="mt-3">
        <Byline author={article.author} date={article.publishedAt} />
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Write the home page**

Replace `frontend/app/page.tsx`:

```tsx
import { ArticleCard } from '@/components/ArticleCard';
import { HeroArticle } from '@/components/HeroArticle';
import { getArticles } from '@/lib/strapi';

export const revalidate = 60;

export default async function Home() {
  const articles = await getArticles();
  const [hero, ...rest] = articles;

  if (!hero) {
    return <p className="font-display uppercase tracking-widest">No articles published yet.</p>;
  }

  const rail = rest.slice(0, 2);
  const grid = rest.slice(2);

  return (
    <>
      <div className="grid gap-10 lg:grid-cols-[2fr_1fr]">
        <HeroArticle article={hero} />
        <div className="flex flex-col gap-6 lg:border-l lg:border-rule lg:pl-8">
          {rail.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      </div>
      {grid.length > 0 && (
        <div className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {grid.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Verify**

With Strapi up and `npm run dev` running in `frontend/`:

```bash
curl -s http://localhost:3000 | grep -c 'articles/'
```

Expected: at least 4 (one link per seeded article). Also load `http://localhost:3000` in a browser and confirm the hero headline is uppercase and oversized, the page sits on cream, and there are no rounded corners or shadows.

- [ ] **Step 5: Commit**

```bash
git add frontend/app frontend/components
git commit -m "feat(frontend): home page with hero, rail, and grid"
```

---

### Task 5: Article detail page

**Files:**
- Create: `frontend/app/articles/[slug]/page.tsx`
- Create: `frontend/components/Prose.tsx`
- Create: `frontend/components/CategoryPills.tsx`
- Create: `frontend/app/not-found.tsx`
- Create: `frontend/app/error.tsx`
- Test: `frontend/components/prose.test.ts`

**Interfaces:**
- Consumes: `getArticles()`, `getArticleBySlug()`, `<Byline />`.
- Produces: `parseBlocks(markdown: string): Block[]` where `Block = { type: 'heading' | 'paragraph'; text: string }`, exported from `@/components/Prose` alongside `<Prose content={string} />`; `<CategoryPills categories={Category[]} />`.

- [ ] **Step 1: Write the failing test**

`frontend/components/prose.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseBlocks } from '@/components/Prose';

describe('parseBlocks', () => {
  it('splits headings from paragraphs', () => {
    expect(parseBlocks('## The schema outlives the code\n\nApplication code gets rewritten.')).toEqual([
      { type: 'heading', text: 'The schema outlives the code' },
      { type: 'paragraph', text: 'Application code gets rewritten.' },
    ]);
  });

  it('treats anything unrecognised as a paragraph', () => {
    expect(parseBlocks('- a list item')).toEqual([{ type: 'paragraph', text: '- a list item' }]);
  });

  it('drops empty blocks', () => {
    expect(parseBlocks('One.\n\n\n\nTwo.')).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `@/components/Prose`.

- [ ] **Step 3: Write Prose and CategoryPills**

`frontend/components/Prose.tsx`:

```tsx
export type Block = { type: 'heading' | 'paragraph'; text: string };

/**
 * The seeded content is markdown limited to `##` headings and paragraphs, so a
 * ten-line parser covers it. Anything else renders as a paragraph rather than
 * pulling in a markdown dependency the content does not need.
 */
export function parseBlocks(content: string): Block[] {
  return content
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) =>
      block.startsWith('## ')
        ? { type: 'heading' as const, text: block.slice(3).trim() }
        : { type: 'paragraph' as const, text: block },
    );
}

export function Prose({ content }: { content: string }) {
  return (
    <div className="mt-8">
      {parseBlocks(content).map((block, index) =>
        block.type === 'heading' ? (
          <h2 key={index} className="mt-10 text-3xl">
            {block.text}
          </h2>
        ) : (
          <p key={index} className="mt-5">
            {block.text}
          </p>
        ),
      )}
    </div>
  );
}
```

`frontend/components/CategoryPills.tsx`:

```tsx
import Link from 'next/link';
import type { Category } from '@/lib/types';

export function CategoryPills({ categories }: { categories?: Category[] }) {
  if (!categories?.length) return null;

  return (
    <p className="font-display flex gap-4 text-xs uppercase tracking-widest text-accent">
      {categories.map((category) => (
        <Link key={category.slug} href={`/categories/${category.slug}`} className="hover:underline">
          {category.name}
        </Link>
      ))}
    </p>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 10 tests total.

- [ ] **Step 5: Write the page**

`frontend/app/articles/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { Byline } from '@/components/Byline';
import { CategoryPills } from '@/components/CategoryPills';
import { Prose } from '@/components/Prose';
import { getArticleBySlug, getArticles } from '@/lib/strapi';

export const revalidate = 60;

export async function generateStaticParams() {
  const articles = await getArticles();
  return articles.map((article) => ({ slug: article.slug }));
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);

  if (!article) notFound();

  return (
    <article className="mx-auto" style={{ maxWidth: '68ch' }}>
      <CategoryPills categories={article.categories} />
      <h1 className="mt-4" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)' }}>
        {article.title}
      </h1>
      <div className="mt-5 border-b border-rule pb-5">
        <Byline author={article.author} date={article.publishedAt} />
      </div>
      <Prose content={article.content} />
    </article>
  );
}
```

- [ ] **Step 6: Write the error boundaries**

`frontend/app/not-found.tsx`:

```tsx
export default function NotFound() {
  return (
    <div style={{ maxWidth: '68ch' }}>
      <h1 className="text-5xl uppercase">Not found</h1>
      <p className="mt-4">That page is not part of this edition.</p>
    </div>
  );
}
```

`frontend/app/error.tsx`:

```tsx
'use client';

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ maxWidth: '68ch' }}>
      <h1 className="text-5xl uppercase">The presses stopped</h1>
      <p className="mt-4">
        The newsroom could not reach the CMS. Check that Strapi is running on port 1337.
      </p>
      <button
        onClick={reset}
        className="font-display mt-6 bg-accent px-5 py-3 text-sm uppercase tracking-widest text-paper"
      >
        Try again
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

With Strapi up and the dev server running:

```bash
curl -s http://localhost:3000/articles/css-has-quietly-become-a-good-language | grep -o 'Milo Hartley\|The workarounds are the hard part' | sort -u
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/articles/does-not-exist
```

Expected: both strings present, then `404`.

- [ ] **Step 8: Commit**

```bash
git add frontend/app frontend/components
git commit -m "feat(frontend): article detail page with prose rendering and 404s"
```

---

### Task 6: Category page

**Files:**
- Create: `frontend/app/categories/[slug]/page.tsx`

**Interfaces:**
- Consumes: `getCategories()`, `getCategoryBySlug()`, `<ArticleCard />`.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Write the page**

`frontend/app/categories/[slug]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { ArticleCard } from '@/components/ArticleCard';
import { getCategories, getCategoryBySlug } from '@/lib/strapi';

export const revalidate = 60;

export async function generateStaticParams() {
  const categories = await getCategories();
  return categories.map((category) => ({ slug: category.slug }));
}

export default async function CategoryPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  const articles = category.articles ?? [];

  return (
    <>
      <header className="border-b-2 border-headline pb-4">
        <h1 className="text-accent" style={{ fontSize: 'clamp(2.25rem, 5vw, 3.5rem)' }}>
          {category.name}
        </h1>
        {category.description && <p className="mt-3 max-w-2xl text-xl">{category.description}</p>}
      </header>

      {articles.length === 0 ? (
        <p className="font-display mt-8 uppercase tracking-widest">Nothing filed here yet.</p>
      ) : (
        <div className="mt-10 grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Verify**

```bash
curl -s http://localhost:3000/categories/engineering | grep -c 'articles/'
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/categories/nope
```

Expected: at least 1 article link, then `404`.

- [ ] **Step 3: Commit**

```bash
git add frontend/app/categories
git commit -m "feat(frontend): category section pages"
```

---

### Task 7: On-demand revalidation route

**Files:**
- Create: `frontend/app/api/revalidate/route.ts`
- Test: `frontend/app/api/revalidate/route.test.ts`

**Interfaces:**
- Consumes: `@/lib/tags`.
- Produces: `POST(request: Request): Promise<Response>`, `GET(): Promise<Response>`, and the exported pure helper `tagsFor(model: string, slug?: string | null): string[]` used by the tests.

- [ ] **Step 1: Write the failing test**

`frontend/app/api/revalidate/route.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidateTag = vi.fn();
vi.mock('next/cache', () => ({ revalidateTag: (tag: string) => revalidateTag(tag) }));

import { GET, POST, tagsFor } from '@/app/api/revalidate/route';

const post = (body: unknown, secret?: string) =>
  POST(
    new Request('http://localhost:3000/api/revalidate', {
      method: 'POST',
      headers: secret ? { 'x-revalidate-secret': secret } : {},
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  process.env.REVALIDATE_SECRET = 'test-secret';
  revalidateTag.mockClear();
});

describe('tagsFor', () => {
  it('maps each model to its tags', () => {
    expect(tagsFor('article', 'a-post')).toEqual(['articles', 'article:a-post']);
    expect(tagsFor('category', 'engineering')).toEqual(['categories', 'category:engineering']);
    expect(tagsFor('author', null)).toEqual(['articles']);
    expect(tagsFor('unknown-model', 'x')).toEqual([]);
  });

  it('falls back to the list tag when an entry has no slug', () => {
    expect(tagsFor('article', undefined)).toEqual(['articles']);
  });
});

describe('POST /api/revalidate', () => {
  it('rejects a missing secret without revalidating', async () => {
    const response = await post({ model: 'article', entry: { slug: 'a-post' } });

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('rejects a wrong secret of a different length', async () => {
    const response = await post({ model: 'article' }, 'nope');

    expect(response.status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('revalidates the mapped tags for a valid request', async () => {
    const response = await post({ model: 'article', entry: { slug: 'a-post' } }, 'test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: ['articles', 'article:a-post'] });
    expect(revalidateTag).toHaveBeenCalledWith('articles');
    expect(revalidateTag).toHaveBeenCalledWith('article:a-post');
  });

  it('accepts an unknown model and revalidates nothing', async () => {
    const response = await post({ model: 'plugin::upload.file' }, 'test-secret');

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ revalidated: [] });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it('refuses GET', async () => {
    expect((await GET()).status).toBe(405);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test`
Expected: FAIL — cannot resolve `@/app/api/revalidate/route`.

- [ ] **Step 3: Write the implementation**

`frontend/app/api/revalidate/route.ts`:

```ts
import { timingSafeEqual } from 'node:crypto';
import { revalidateTag } from 'next/cache';
import { ARTICLES_TAG, CATEGORIES_TAG, articleTag, categoryTag } from '@/lib/tags';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type WebhookBody = { model?: string; entry?: { slug?: string | null } | null };

/** Maps a Strapi model name to the cache tags an edit to it invalidates. */
export function tagsFor(model: string, slug?: string | null): string[] {
  switch (model) {
    case 'article':
      return slug ? [ARTICLES_TAG, articleTag(slug)] : [ARTICLES_TAG];
    case 'category':
      return slug ? [CATEGORIES_TAG, categoryTag(slug)] : [CATEGORIES_TAG];
    // A renamed author changes the byline on every list and detail page.
    case 'author':
      return [ARTICLES_TAG];
    default:
      return [];
  }
}

function secretMatches(provided: string | null): boolean {
  const expected = process.env.REVALIDATE_SECRET ?? '';
  if (!provided || !expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on length mismatch, so compare lengths first. The
  // length of the secret is not itself sensitive.
  return a.length === b.length && timingSafeEqual(a, b);
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

export async function POST(request: Request): Promise<Response> {
  // A missing secret and a wrong secret are indistinguishable to the caller.
  if (!secretMatches(request.headers.get('x-revalidate-secret'))) {
    return json({ error: 'unauthorized' }, 401);
  }

  const body = (await request.json().catch(() => null)) as WebhookBody | null;
  const tags = body?.model ? tagsFor(body.model, body.entry?.slug) : [];

  for (const tag of tags) {
    revalidateTag(tag);
  }

  return json({ revalidated: tags });
}

export async function GET(): Promise<Response> {
  return json({ error: 'method not allowed' }, 405);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test`
Expected: PASS, 18 tests total.

- [ ] **Step 5: Typecheck for the Next 16 revalidateTag signature**

Next 16 accepts an optional cache-profile argument on `revalidateTag`. Confirm the single-argument call typechecks:

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors. If TypeScript reports that `revalidateTag` expects 2 arguments, change each call to `revalidateTag(tag, 'max')` and update the test's assertions to `toHaveBeenCalledWith('articles', 'max')`, then re-run `npm test`.

- [ ] **Step 6: Commit**

```bash
git add frontend/app/api
git commit -m "feat(frontend): secret-protected on-demand revalidation endpoint"
```

---

### Task 8: Strapi webhook registration

**Files:**
- Create: `src/seed/webhook.ts`
- Modify: `src/seed/index.ts` (add the re-export)
- Modify: `src/index.ts` (call it from bootstrap)

**Interfaces:**
- Consumes: nothing from the frontend at build time; targets `POST ${FRONTEND_URL}/api/revalidate` at runtime.
- Produces: `registerIsrWebhook(strapi: Core.Strapi): Promise<void>`, exported from `./seed`.

Check `src/seed/index.ts` first: it currently exports `seedBlog` and `grantPublicReadAccess`. Follow whatever export style it already uses.

- [ ] **Step 1: Write the registration module**

`src/seed/webhook.ts`:

```ts
import type { Core } from '@strapi/strapi';

const WEBHOOK_NAME = 'nextjs-isr';

// Strapi fires these for every content type; the frontend decides which of
// them matter by looking at the model in the payload.
const EVENTS = [
  'entry.create',
  'entry.update',
  'entry.delete',
  'entry.publish',
  'entry.unpublish',
];

interface StoredWebhook {
  id: string;
  name: string;
  url: string;
  headers: Record<string, string>;
  events: string[];
  isEnabled: boolean;
}

interface WebhookStore {
  findWebhooks(): Promise<StoredWebhook[] | undefined>;
  createWebhook(data: Omit<StoredWebhook, 'id'>): Promise<StoredWebhook>;
}

/**
 * Points Strapi at the Next.js revalidation endpoint.
 *
 * Idempotent: looks the webhook up by name and creates it only when absent, so
 * restarts are harmless and a fresh database needs no trip through the admin UI.
 */
export async function registerIsrWebhook(strapi: Core.Strapi): Promise<void> {
  const store = strapi.get('webhookStore') as WebhookStore;
  const existing = (await store.findWebhooks()) ?? [];

  if (existing.some((webhook) => webhook.name === WEBHOOK_NAME)) {
    strapi.log.info(`[isr] webhook '${WEBHOOK_NAME}' already registered.`);
    return;
  }

  const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:3000';
  const created = await store.createWebhook({
    name: WEBHOOK_NAME,
    url: `${frontendUrl}/api/revalidate`,
    headers: { 'x-revalidate-secret': process.env.REVALIDATE_SECRET ?? 'dev-secret-change-me' },
    events: EVENTS,
    isEnabled: true,
  });

  // The core provider loads webhooks into the runner during its own bootstrap,
  // which has already happened by the time this runs. Registering the new
  // webhook directly makes it live now rather than after the next restart.
  (strapi.get('webhookRunner') as { add(webhook: StoredWebhook): void }).add(created);

  strapi.log.info(`[isr] registered webhook '${WEBHOOK_NAME}' -> ${created.url}`);
}
```

- [ ] **Step 2: Export it**

Add to `src/seed/index.ts`, matching the file's existing export style:

```ts
export { registerIsrWebhook } from './webhook';
```

- [ ] **Step 3: Call it from bootstrap**

In `src/index.ts`, extend the import and the bootstrap body:

```ts
import { grantPublicReadAccess, registerIsrWebhook, seedBlog } from './seed';
```

```ts
  async bootstrap({ strapi }: { strapi: Core.Strapi }) {
    await seedBlog(strapi);
    await grantPublicReadAccess(strapi);
    await registerIsrWebhook(strapi);
  },
```

- [ ] **Step 4: Set the secret for Strapi**

Append to the repo root `.env` (the Strapi app's env file — create it if `config/` expects one and it is absent; it is gitignored):

```
FRONTEND_URL=http://localhost:3000
REVALIDATE_SECRET=dev-secret-change-me
```

This must match `frontend/.env.local` exactly or every webhook delivery returns 401.

- [ ] **Step 5: Verify registration**

```bash
./scripts/restart-dev.sh && grep -i "isr" /tmp/strapi.log
```

Expected: a line reading `[isr] registered webhook 'nextjs-isr' -> http://localhost:3000/api/revalidate`. Run `./scripts/restart-dev.sh` a second time and confirm the log now says `already registered` — that proves idempotency.

- [ ] **Step 6: Confirm the existing suite still passes**

Run: `./scripts/verify-blog-api.sh`
Expected: all checks PASS, exit 0.

- [ ] **Step 7: Commit**

```bash
git add src/seed/webhook.ts src/seed/index.ts src/index.ts
git commit -m "feat: register Next.js ISR revalidation webhook on bootstrap"
```

---

### Task 9: ISR verification script and documentation

**Files:**
- Create: `scripts/verify-isr.sh`
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above, running as a production build.
- Produces: an executable script with the same PASS/FAIL output shape as `scripts/verify-blog-api.sh`.

Read `scripts/verify-blog-api.sh` first and reuse its `check` helper and exit-code convention verbatim so the two scripts read as a pair.

- [ ] **Step 1: Write the script**

`scripts/verify-isr.sh`:

```bash
#!/usr/bin/env bash
# Verifies ISR behavior against a production build of the Next.js frontend.
# ISR does not behave like this in dev mode, so this builds and starts the app.
# Requires Strapi to be running: ./scripts/restart-dev.sh
set -u

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMS="http://localhost:1337"
WEB="http://localhost:3000"
LOG="/tmp/next-isr.log"
SECRET="${REVALIDATE_SECRET:-dev-secret-change-me}"
HERO_SLUG="css-has-quietly-become-a-good-language"
OTHER_SLUG="why-your-database-schema-is-your-real-api"
fail=0
next_pid=""

check() {
  local label="$1" actual="$2" expected="$3"
  if [ "$actual" = "$expected" ]; then
    printf '  PASS  %-42s %s\n' "$label" "$actual"
  else
    printf '  FAIL  %-42s got %s, want %s\n' "$label" "$actual" "$expected"
    fail=1
  fi
}

# Pulls the render stamp out of a page. It changes only when the page is
# regenerated, which is exactly what ISR invalidation should cause.
stamp() {
  curl -s "$WEB$1" | grep -o 'data-render-stamp="[^"]*"' | head -1 | cut -d'"' -f2
}

cleanup() {
  if [ -n "$next_pid" ]; then
    kill "$next_pid" >/dev/null 2>&1
  fi
}
trap cleanup EXIT

if [ "$(curl -s -o /dev/null -w '%{http_code}' "$CMS/api/articles")" != "200" ]; then
  echo "Strapi is not answering on $CMS. Run ./scripts/restart-dev.sh first."
  exit 1
fi

echo "Building the frontend (production)"
if ! (cd "$ROOT/frontend" && npm run build > "$LOG" 2>&1); then
  echo "Build FAILED. See $LOG"
  exit 1
fi

(cd "$ROOT/frontend" && nohup npm run start >> "$LOG" 2>&1 &)
for _ in $(seq 1 60); do
  if [ "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" = "200" ]; then
    break
  fi
  sleep 1
done
next_pid=$(pgrep -f "next start" | head -1)

echo "ISR verification"

check "GET / status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/")" "200"
check "GET /articles/<slug> status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/articles/$HERO_SLUG")" "200"
check "GET unknown article is 404" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/articles/does-not-exist")" "404"
check "GET /categories/engineering status" \
  "$(curl -s -o /dev/null -w '%{http_code}' "$WEB/categories/engineering")" "200"

# A prerendered page serves the same stamp on repeat requests.
first=$(stamp "/articles/$HERO_SLUG")
second=$(stamp "/articles/$HERO_SLUG")
if [ -n "$first" ] && [ "$first" = "$second" ]; then
  check "article page is served from cache" "same" "same"
else
  check "article page is served from cache" "changed" "same"
fi

check "revalidate rejects a wrong secret" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/revalidate" \
     -H 'Content-Type: application/json' -H 'x-revalidate-secret: wrong' \
     -d '{"model":"article","entry":{"slug":"'"$HERO_SLUG"'"}}')" "401"
check "revalidate rejects a missing secret" \
  "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$WEB/api/revalidate" \
     -H 'Content-Type: application/json' -d '{"model":"article"}')" "401"

# Record the neighbour before invalidating, to prove tag scoping afterwards.
other_before=$(stamp "/articles/$OTHER_SLUG")

revalidated=$(curl -s -X POST "$WEB/api/revalidate" \
  -H 'Content-Type: application/json' -H "x-revalidate-secret: $SECRET" \
  -d '{"model":"article","entry":{"slug":"'"$HERO_SLUG"'"}}')
echo "  note  revalidate response: $revalidated"

# Next may serve one stale response while regenerating, so poll briefly.
changed="no"
for _ in $(seq 1 10); do
  if [ "$(stamp "/articles/$HERO_SLUG")" != "$first" ]; then
    changed="yes"
    break
  fi
  sleep 1
done
check "webhook regenerates the article page" "$changed" "yes"

other_after=$(stamp "/articles/$OTHER_SLUG")
if [ "$other_before" = "$other_after" ]; then
  check "other articles are left cached" "untouched" "untouched"
else
  check "other articles are left cached" "regenerated" "untouched"
fi

if [ "$fail" -eq 0 ]; then
  echo "All checks passed."
else
  echo "Some checks FAILED."
fi

exit "$fail"
```

- [ ] **Step 2: Make it executable and run it**

```bash
chmod +x scripts/verify-isr.sh
./scripts/verify-isr.sh
```

Expected: every check PASS, exit 0.

Note on the tag-scoping check: it passes only because `getArticleBySlug` tags its data with `article:<slug>` alone (Task 2). If it fails, that narrow tagging has regressed — check `lib/strapi.ts` before touching the script.

Expect the home and category pages to regenerate here: they carry the `articles` tag, which an article edit does invalidate. That is correct, and is why the neighbour assertion targets another *article detail* page.

- [ ] **Step 3: Document it**

Add to `README.md` a section after the existing content:

```markdown
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
```

- [ ] **Step 4: Run the full suite**

```bash
cd frontend && npm test && npx tsc --noEmit && cd ..
./scripts/verify-blog-api.sh
./scripts/verify-isr.sh
```

Expected: all three green.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-isr.sh README.md
git commit -m "test: verify ISR caching and on-demand revalidation"
```

---

## Self-Review Notes

Spec coverage checked section by section: architecture (Task 1, 3), data layer and tag convention (Tasks 1–2), ISR table (Tasks 4–6), on-demand revalidation and webhook registration (Tasks 7–8), visual design (Tasks 3–6), error handling (Task 5), verification and acceptance criteria (Task 9).

One spec requirement is intentionally implemented differently, described at the top of this plan: the verification script observes regeneration through a render stamp rather than editing content through Strapi's REST API, because public writes are 403 by design.
