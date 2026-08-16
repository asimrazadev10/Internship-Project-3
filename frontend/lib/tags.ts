/**
 * The only place cache tag strings are constructed. Pages tag their data with
 * these; the revalidate route invalidates the same strings. Keeping both sides
 * on one module is what stops a typo from silently disabling revalidation.
 */
export const ARTICLES_TAG = 'articles';
export const CATEGORIES_TAG = 'categories';

export const articleTag = (slug: string): string => `article:${slug}`;
export const categoryTag = (slug: string): string => `category:${slug}`;
