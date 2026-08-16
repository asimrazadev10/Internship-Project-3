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
export async function strapiFetch<T>(
  path: string,
  { tags, allow404 = false }: { tags: string[]; allow404?: boolean },
): Promise<T> {
  const response = await fetch(`${baseUrl()}${path}`, {
    headers: { Accept: 'application/json' },
    next: { tags, revalidate: revalidateWindow() },
  });

  // A single type with no entry ever created returns 404, not 200 with
  // `data: null` — unlike a collection type, which just returns an empty
  // array. `allow404` is opt-in per caller: Site Settings must survive a
  // fresh, unseeded database (the root layout calls getSiteSettings on
  // every page) and fall back to hardcoded copy, so it treats 404 as "not
  // configured" rather than an error. Every other caller, and every other
  // non-2xx status even with allow404 set, still throws below.
  if (allow404 && response.status === 404) {
    return null as T;
  }

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
 * before its first entry exists — a fresh database, before seeding. See the
 * `allow404` comment in strapiFetch for why this query tolerates a 404.
 */
export async function getSiteSettings(): Promise<SiteSettings | null> {
  const settings = await strapiFetch<SiteSettings | null>(
    '/api/site-setting?populate[navLinks]=*',
    { tags: [SITE_SETTINGS_TAG], allow404: true },
  );
  return settings ?? null;
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
