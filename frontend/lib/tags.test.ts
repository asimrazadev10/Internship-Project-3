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
