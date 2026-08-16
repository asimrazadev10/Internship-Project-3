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
