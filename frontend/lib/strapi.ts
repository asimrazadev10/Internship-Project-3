import { ARTICLES_TAG, CATEGORIES_TAG, SITE_SETTINGS_TAG, articleTag, categoryTag } from '@/lib/tags';
import type { Article, Category, SiteSettings } from '@/lib/types';

const baseUrl = () => process.env.STRAPI_URL ?? 'http://localhost:1337';
const revalidateWindow = () => {
  const parsed = Number(process.env.REVALIDATE_WINDOW ?? 60);
  return Number.isFinite(parsed) ? parsed : 60;
};

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

// `populate[author]=*` and `populate[categories]=*` 400 against the live API
// ("Invalid key avatar at author.avatar") because a bare `*` on a relation
// attempts to deep-populate its own relations/media, which the author and
// category schemas don't support at that depth. `=true` populates the
// relation itself (shallow) without recursing, which is all callers need.
export function getArticles(): Promise<Article[]> {
  return strapiFetch<Article[]>(
    '/api/articles?populate[body][populate]=*&populate[seo]=*' +
      '&populate[author]=true&populate[categories]=true&sort=publishedAt:desc',
    { tags: [ARTICLES_TAG] },
  );
}

export async function getArticleBySlug(slug: string): Promise<Article | null> {
  const matches = await strapiFetch<Article[]>(
    `/api/articles?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      '&populate[body][populate]=*&populate[seo]=*' +
      '&populate[author]=true&populate[categories]=true',
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

/**
 * A single type returns one object rather than an array, and returns null
 * before its first entry exists — a fresh database, before seeding.
 *
 * Unlike a truly empty single type (200, `data: null`), an UNSEEDED single
 * type returns HTTP 404 with `data: null`. strapiFetch throws on any
 * non-2xx status, which would crash every page that depends on this query
 * (the root layout calls it) on a database that hasn't been seeded yet.
 * A missing Site Settings entry must fall back to hardcoded copy instead,
 * so this query alone tolerates a 404 as "not configured" and returns
 * null; every other non-2xx still throws via strapiFetch.
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  const path = '/api/site-setting?populate[navLinks]=*';
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { Accept: 'application/json' },
    next: { tags: [SITE_SETTINGS_TAG], revalidate: revalidateWindow() },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`Strapi responded ${response.status} for ${path}`);
  }

  const body = (await response.json()) as { data: SiteSettings | null };
  return body.data ?? null;
}

export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  const matches = await strapiFetch<Category[]>(
    `/api/categories?filters[slug][$eq]=${encodeURIComponent(slug)}` +
      '&populate[articles][populate][author]=true',
    // Also tagged `articles`: this page renders each article's title, excerpt,
    // and byline via ArticleCard, but an article edit only revalidates
    // `articles` and `article:<slug>` — without this tag the category page
    // would stay stale for up to REVALIDATE_WINDOW seconds after such an edit.
    { tags: [CATEGORIES_TAG, categoryTag(slug), ARTICLES_TAG] },
  );
  return matches[0] ?? null;
}
